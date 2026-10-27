"use server";

import { randomUUID } from "node:crypto";
import { z } from "zod";
import { check, defineAction, UserError, zf } from "@/server/action";
import { cleanFilters, parseAudience, personalise, withoutPerson, withPerson } from "@/server/comms/audience";
import { attachmentAllowed } from "@/server/email/attachments";
import { enqueueEmail } from "@/server/email/outbox";
import { kickJobs } from "@/server/jobs/kick";
import { can, type SessionContext } from "@/server/session";
import { supabaseService, type DB } from "@/server/supabase";

const BUCKET = "comms-attachments";

function assertScope(session: SessionContext, scope: "province" | "allocated") {
  if (scope === "province" && !can(session, "comms.send.province")) throw new UserError("You cannot send Province-wide communications.");
  if (scope === "allocated" && !can(session, "comms.send.allocated")) throw new UserError("You cannot send to allocated Lodges.");
}

/** Read the campaign as the user; only the creator may edit a draft. */
async function editableDraft(db: DB, session: SessionContext, id: string) {
  const { data: c } = await db.from("campaigns").select("*").eq("id", id).maybeSingle();
  if (!c) throw new UserError("Campaign not found.");
  if (c.created_by !== session.accountId) throw new UserError("Only the person who wrote this campaign can change it.");
  if (c.status !== "draft") throw new UserError("Only drafts can be changed. Ask an approver to return it if changes are needed.");
  return c;
}

async function updateDraft(db: DB, id: string, patch: Record<string, unknown>) {
  const res = await db.from("campaigns").update(patch as never).eq("id", id).eq("status", "draft").select("id");
  if (!check(res).length) throw new UserError("This campaign can no longer be changed.");
}

export const createCampaign = defineAction(z.object({ title: zf.required("Title", 200), scope: z.enum(["province", "allocated"]) }), async (i, { db, session }) => {
  assertScope(session, i.scope);
  const replyTo = (session.org.settings as { comms?: { reply_to?: string } }).comms?.reply_to ?? null;
  const c = check(await db.from("campaigns").insert({ org_id: session.orgId, title: i.title, subject: i.title, scope: i.scope, category: "news", reply_to: replyTo, created_by: session.accountId })
    .select("id").single());
  return { redirect: `/communications/${c.id}` };
}, { permission: ["comms.use"] });

export const saveMessage = defineAction(z.object({
  campaign_id: zf.uuid(),
  title: zf.required("Title", 200),
  subject: zf.required("Subject", 200),
  preheader: zf.optionalText(200),
  body_markdown: zf.text(50000).default(""),
  category: z.enum(["operational", "learning", "events", "news"]),
  scope: z.enum(["province", "allocated"]),
  scheduled_for: z.string().optional().transform((v) => (v ? new Date(v).toISOString() : null)),
}), async (i, { db, session }) => {
  await editableDraft(db, session, i.campaign_id);
  assertScope(session, i.scope);
  if (i.scheduled_for && new Date(i.scheduled_for).getTime() < Date.now() + 5 * 60000) throw new UserError("Choose a send time at least five minutes from now, or leave it blank to send once approved.");
  const { campaign_id, ...rest } = i;
  await updateDraft(db, campaign_id, rest);
  return { message: "Saved.", revalidate: [`/communications/${campaign_id}`, "/communications"] };
}, { permission: ["comms.use"] });

export const applyTemplate = defineAction(z.object({ campaign_id: zf.uuid(), template_id: zf.uuid("Template") }), async (i, { db, session }) => {
  await editableDraft(db, session, i.campaign_id);
  const t = check(await db.from("email_templates").select("subject, body_markdown, kind").eq("id", i.template_id).single());
  const subject = t.subject.includes("{{subject}}") ? undefined : t.subject;
  await updateDraft(db, i.campaign_id, { body_markdown: t.body_markdown, template_id: i.template_id, ...(subject ? { subject } : {}) });
  return { message: "Template applied. Review the subject and message before sending.", revalidate: [`/communications/${i.campaign_id}`] };
}, { permission: ["comms.use"] });

const listField = () => z.array(z.string()).optional().default([]);

export const saveAudience = defineAction(z.object({
  campaign_id: zf.uuid(),
  lodge_ids: listField(), area_ids: listField(), offices: listField(), roles: listField(), stages: listField(), event_statuses: listField(),
  initiated_from: zf.text(10).default(""), initiated_to: zf.text(10).default(""),
  enrolled_course_id: zf.text(40).default(""), completed_course_id: zf.text(40).default(""), not_completed_course_id: zf.text(40).default(""),
  event_id: zf.text(40).default(""),
}), async (i, { db, session }) => {
  const c = await editableDraft(db, session, i.campaign_id);
  const { campaign_id, ...raw } = i;
  const current = parseAudience(c.audience);
  await updateDraft(db, campaign_id, { audience: { ...current, filters: cleanFilters(raw) } });
  return { message: "Audience updated. Check the recipient list below.", revalidate: [`/communications/${campaign_id}`] };
}, { permission: ["comms.use"] });

export const adjustAudiencePerson = defineAction(z.object({ campaign_id: zf.uuid(), person_id: zf.uuid("Person"), list: z.enum(["include", "exclude", "reset"]) }), async (i, { db, session }) => {
  const c = await editableDraft(db, session, i.campaign_id);
  const current = parseAudience(c.audience);
  const next = i.list === "reset" ? withoutPerson(current, i.person_id) : withPerson(current, i.person_id, i.list);
  await updateDraft(db, i.campaign_id, { audience: next });
  const msg = i.list === "include" ? "Added to the audience." : i.list === "exclude" ? "Excluded from this campaign." : "Change undone.";
  return { message: msg, revalidate: [`/communications/${i.campaign_id}`] };
}, { permission: ["comms.use"] });

export const saveSegment = defineAction(z.object({ campaign_id: zf.uuid(), name: zf.required("Name", 100), shared: zf.checkbox() }), async (i, { db, session }) => {
  const { data: c } = await db.from("campaigns").select("audience").eq("id", i.campaign_id).maybeSingle();
  if (!c) throw new UserError("Campaign not found.");
  const filters = parseAudience(c.audience).filters;
  if (!Object.keys(filters).length) throw new UserError("Add at least one filter before saving a segment.");
  check(await db.from("segments").insert({ org_id: session.orgId, name: i.name, definition: { filters }, shared: i.shared, created_by: session.accountId }));
  return { message: "Segment saved. You can reuse it for future campaigns.", revalidate: [`/communications/${i.campaign_id}`] };
}, { permission: ["comms.use"] });

export const applySegment = defineAction(z.object({ campaign_id: zf.uuid(), segment_id: zf.uuid("Segment") }), async (i, { db, session }) => {
  const c = await editableDraft(db, session, i.campaign_id);
  const s = check(await db.from("segments").select("definition").eq("id", i.segment_id).single());
  const current = parseAudience(c.audience);
  await updateDraft(db, i.campaign_id, { audience: { ...current, filters: parseAudience(s.definition).filters } });
  return { message: "Segment applied.", revalidate: [`/communications/${i.campaign_id}`] };
}, { permission: ["comms.use"] });

export const deleteSegment = defineAction(z.object({ campaign_id: zf.uuid(), segment_id: zf.uuid() }), async (i, { db }) => {
  const res = await db.from("segments").delete().eq("id", i.segment_id).select("id");
  if (!check(res).length) throw new UserError("Only the person who saved a segment can delete it.");
  return { message: "Segment deleted.", revalidate: [`/communications/${i.campaign_id}`] };
}, { permission: ["comms.use"] });

const ALLOWED_TYPES = ["application/pdf", "image/png", "image/jpeg", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/msword", "text/calendar"];

export const uploadAttachment = defineAction(z.object({ campaign_id: zf.uuid(), file: z.instanceof(File, { message: "Choose a file" }) }), async (i, { db, session }) => {
  const c = await editableDraft(db, session, i.campaign_id);
  if (!i.file.size) throw new UserError("Choose a file.");
  if (i.file.size > 10 * 1024 * 1024) throw new UserError("Attachments must be 10 MB or smaller.");
  if (!ALLOWED_TYPES.includes(i.file.type)) throw new UserError("Attach a PDF, Word document, image or calendar file.");
  const existing = (c.attachments as { bucket: string; path: string; filename: string }[]) ?? [];
  if (existing.length >= 5) throw new UserError("A campaign can have up to five attachments.");
  const filename = i.file.name.replace(/[^\w.\- ]+/g, "_").slice(-120) || "attachment";
  const path = `${session.orgId}/comms/${c.id}/${randomUUID().slice(0, 8)}-${filename}`;
  const up = await db.storage.from(BUCKET).upload(path, i.file, { contentType: i.file.type, upsert: false });
  if (up.error) throw new UserError("The file could not be uploaded. Please try again.");
  await updateDraft(db, c.id, { attachments: [...existing, { bucket: BUCKET, path, filename }] });
  return { message: "Attachment added.", revalidate: [`/communications/${c.id}`] };
}, { permission: ["comms.use"] });

export const removeAttachment = defineAction(z.object({ campaign_id: zf.uuid(), path: z.string().min(1).max(400) }), async (i, { db, session }) => {
  const c = await editableDraft(db, session, i.campaign_id);
  const existing = (c.attachments as { bucket: string; path: string; filename: string }[]) ?? [];
  if (!existing.some((a) => a.path === i.path)) throw new UserError("Attachment not found.");
  await db.storage.from(BUCKET).remove([i.path]);
  await updateDraft(db, c.id, { attachments: existing.filter((a) => a.path !== i.path) });
  return { message: "Attachment removed.", revalidate: [`/communications/${c.id}`] };
}, { permission: ["comms.use"] });

/** Sends the campaign as it stands to the signed-in user only. */
export const sendTestEmail = defineAction(z.object({ campaign_id: zf.uuid() }), async (i, { db, session }) => {
  const { data: c } = await db.from("campaigns").select("id, subject, preheader, body_markdown, reply_to, attachments").eq("id", i.campaign_id).maybeSingle();
  if (!c) throw new UserError("Campaign not found.");
  if (!session.email) throw new UserError("Your account has no email address.");
  if (!c.body_markdown.trim()) throw new UserError("Write the message first.");
  if (!((c.attachments as { bucket: string; path: string; filename: string }[]) ?? []).every((a) => attachmentAllowed(session.orgId, a, c.id))) throw new UserError("Remove the attachment and upload it again.");
  // The campaign was read through RLS above; the outbox is written by the system.
  await enqueueEmail(supabaseService(), {
    orgId: session.orgId, toEmail: session.email, toPersonId: session.personId, subject: `[Test] ${c.subject}`, preheader: c.preheader ?? undefined,
    markdown: personalise(c.body_markdown, session.displayName), category: "operational", idempotencyKey: `campaign-test:${c.id}:${randomUUID()}`,
    replyTo: c.reply_to, attachments: (c.attachments as { bucket: string; path: string; filename: string }[]) ?? [], campaignId: c.id,
  });
  kickJobs();
  return { message: `Test email sent to ${session.email}. It can take a minute to arrive.` };
}, { permission: ["comms.use"] });

export const submitCampaign = defineAction(z.object({ campaign_id: zf.uuid() }), async (i, { db }) => {
  const status = check(await db.rpc("campaign_submit", { p_campaign: i.campaign_id })) as string;
  kickJobs();
  return { revalidate: [`/communications/${i.campaign_id}`, "/communications"], redirect: `/communications/${i.campaign_id}?tab=review&done=${status === "pending_approval" ? "submitted" : "queued"}` };
}, { permission: ["comms.use"] });

export const decideCampaign = defineAction(z.object({ campaign_id: zf.uuid(), decision: z.enum(["approve", "return"]), note: zf.optionalText(1000) }), async (i, { db }) => {
  if (i.decision === "return" && !i.note) throw new UserError("Add a note explaining what needs to change.");
  const status = check(await db.rpc("campaign_decide", { p_campaign: i.campaign_id, p_approve: i.decision === "approve", p_note: i.note ?? undefined })) as string;
  kickJobs();
  return { revalidate: [`/communications/${i.campaign_id}`, "/communications"], redirect: `/communications/${i.campaign_id}?tab=review&done=${status === "draft" ? "returned" : "approved"}` };
}, { permission: ["comms.approve"] });

export const cancelCampaign = defineAction(z.object({ campaign_id: zf.uuid() }), async (i, { db }) => {
  check(await db.rpc("campaign_cancel", { p_campaign: i.campaign_id }));
  return { revalidate: [`/communications/${i.campaign_id}`, "/communications"], redirect: `/communications/${i.campaign_id}?tab=review&done=cancelled` };
}, { permission: ["comms.use"] });

export const duplicateCampaign = defineAction(z.object({ campaign_id: zf.uuid() }), async (i, { db, session }) => {
  const { data: c } = await db.from("campaigns").select("title, subject, preheader, body_markdown, category, scope, audience, template_id, reply_to").eq("id", i.campaign_id).maybeSingle();
  if (!c) throw new UserError("Campaign not found.");
  const scope = c.scope === "province" && !can(session, "comms.send.province") ? "allocated" : c.scope;
  assertScope(session, scope as "province" | "allocated");
  const copy = check(await db.from("campaigns").insert({ ...c, scope, title: `Copy of ${c.title}`.slice(0, 200), org_id: session.orgId, created_by: session.accountId, status: "draft" }).select("id").single());
  return { redirect: `/communications/${copy.id}` };
}, { permission: ["comms.use"] });

// ----- Templates ------------------------------------------------------------------

export const saveTemplate = defineAction(z.object({
  template_id: zf.optionalUuid(),
  key: z.string().trim().regex(/^[a-z0-9_]{2,60}$/, "Use lower-case letters, numbers and underscores").optional(),
  name: zf.required("Name", 120),
  subject: zf.required("Subject", 200),
  body_markdown: zf.required("Message", 50000),
}), async (i, { db, session }) => {
  if (i.template_id) {
    const res = await db.from("email_templates").update({ name: i.name, subject: i.subject, body_markdown: i.body_markdown, updated_by: session.accountId, updated_at: new Date().toISOString() })
      .eq("id", i.template_id).select("id");
    if (!check(res).length) throw new UserError("You do not have permission to edit templates.");
    return { message: "Template saved.", revalidate: ["/communications/templates", `/communications/templates/${i.template_id}`] };
  }
  if (!i.key) throw new UserError("Add a key for the new template.");
  const t = check(await db.from("email_templates").insert({ org_id: session.orgId, key: i.key, name: i.name, kind: "campaign", subject: i.subject, body_markdown: i.body_markdown, is_system: false, updated_by: session.accountId })
    .select("id").single());
  return { redirect: `/communications/templates/${t.id}` };
}, { permission: ["comms.templates"] });

export const deleteTemplate = defineAction(z.object({ template_id: zf.uuid() }), async (i, { db }) => {
  const t = check(await db.from("email_templates").select("is_system").eq("id", i.template_id).single());
  if (t.is_system) throw new UserError("System templates are used by the Hub and cannot be deleted. You can edit their wording.");
  const { count } = await db.from("campaigns").select("id", { count: "exact", head: true }).eq("template_id", i.template_id);
  if (count) throw new UserError("Campaigns refer to this template, so it cannot be deleted.");
  check(await db.from("email_templates").delete().eq("id", i.template_id));
  return { redirect: "/communications/templates" };
}, { permission: ["comms.templates"] });
