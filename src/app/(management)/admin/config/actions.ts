"use server";

import { z } from "zod";
import { check, defineAction, UserError, zf } from "@/server/action";
import type { DB } from "@/server/supabase";

const KEY = z.string().trim().regex(/^[a-z][a-z0-9_]{1,40}$/, "Use lower-case letters, numbers and underscores (e.g. contact_due)");
const P = { permission: ["admin.config" as const] };
const R = ["/admin/config"];

function inUse(e: unknown): never {
  if (e instanceof UserError && e.message.includes("no longer exists")) throw new UserError("This is in use. Mark it inactive instead of deleting it.");
  throw e;
}

// ----- Mentoring statuses -------------------------------------------------------
export const saveStatus = defineAction(
  z.object({ id: zf.optionalUuid(), key: KEY.optional(), label: zf.required("Label", 80), description: zf.text(300), position: zf.int("Order"), is_closed: zf.checkbox(), active: zf.checkbox() }),
  async (i, { db, session }) => {
    const row = { label: i.label, description: i.description, position: i.position, is_closed: i.is_closed, active: i.active };
    if (i.id) {
      if (!check(await db.from("mentoring_statuses").update(row).eq("id", i.id).select("id")).length) throw new UserError("You do not have permission to change configuration.");
    } else {
      if (!i.key) throw new UserError("Enter a key for the new status.");
      check(await db.from("mentoring_statuses").insert({ ...row, key: i.key, org_id: session.orgId }));
    }
    return { message: "Mentoring status saved.", revalidate: R };
  }, P,
);

export const deleteStatus = defineAction(
  z.object({ id: zf.uuid() }),
  async (i, { db }) => {
    try { check(await db.from("mentoring_statuses").delete().eq("id", i.id)); } catch (e) { inUse(e); }
    return { message: "Status deleted.", revalidate: R };
  }, P,
);

// ----- Support categories -------------------------------------------------------
export const saveSupportCategory = defineAction(
  z.object({ id: zf.optionalUuid(), key: KEY.optional(), label: zf.required("Label", 120), description: zf.text(500), default_due_days: zf.int("Days to respond").pipe(z.number().min(1).max(365)), position: zf.int("Order"), active: zf.checkbox() }),
  async (i, { db, session }) => {
    const row = { label: i.label, description: i.description, default_due_days: i.default_due_days, position: i.position, active: i.active };
    if (i.id) {
      const { data: cur } = await db.from("support_categories").select("key").eq("id", i.id).single();
      if (cur?.key === "confidential" && !i.active) throw new UserError("The confidential concern route must stay available.");
      if (!check(await db.from("support_categories").update(row).eq("id", i.id).select("id")).length) throw new UserError("You do not have permission to change configuration.");
    } else {
      if (!i.key) throw new UserError("Enter a key for the new category.");
      check(await db.from("support_categories").insert({ ...row, key: i.key, org_id: session.orgId }));
    }
    return { message: "Support category saved.", revalidate: R };
  }, P,
);

// ----- Document categories ------------------------------------------------------
export const saveDocumentCategory = defineAction(
  z.object({ id: zf.optionalUuid(), key: KEY.optional(), name: zf.required("Name", 120), default_classification: z.enum(["learning", "mentors", "internal", "leadership"]), position: zf.int("Order") }),
  async (i, { db, session }) => {
    const row = { name: i.name, default_classification: i.default_classification, position: i.position };
    if (i.id) {
      if (!check(await db.from("document_categories").update(row).eq("id", i.id).select("id")).length) throw new UserError("You do not have permission to change configuration.");
    } else {
      if (!i.key) throw new UserError("Enter a key for the new category.");
      check(await db.from("document_categories").insert({ ...row, key: i.key, org_id: session.orgId }));
    }
    return { message: "Document category saved.", revalidate: R };
  }, P,
);

export const deleteDocumentCategory = defineAction(
  z.object({ id: zf.uuid() }),
  async (i, { db }) => {
    const { count } = await db.from("documents").select("id", { count: "exact", head: true }).eq("category_id", i.id);
    if (count) throw new UserError("Documents use this category. Move them first.");
    try { check(await db.from("document_categories").delete().eq("id", i.id)); } catch (e) { inUse(e); }
    return { message: "Category deleted.", revalidate: R };
  }, P,
);

// ----- Organisation settings ----------------------------------------------------
async function updateSettings(db: DB, orgId: string, patch: (s: Record<string, unknown>) => Record<string, unknown>) {
  const org = check(await db.from("organisations").select("settings").eq("id", orgId).single());
  const next = patch({ ...((org.settings ?? {}) as Record<string, unknown>) });
  const res = await db.from("organisations").update({ settings: next as never }).eq("id", orgId).select("id");
  if (!check(res).length) throw new UserError("You do not have permission to change configuration.");
}

export const saveSettings = defineAction(
  z.object({
    ea_to_fc_months: zf.int("Months").pipe(z.number().min(1).max(60)),
    fc_to_mm_months: zf.int("Months").pipe(z.number().min(1).max(60)),
    new_member_review_days: zf.int("Days").pipe(z.number().min(7).max(730)),
    comms_allow_self_approval: zf.checkbox(),
    comms_allocated_requires_approval: zf.checkbox(),
    reply_to: z.string().trim().email("Enter a valid reply-to address").or(z.literal("")),
    academy_allow_self_approval: zf.checkbox(),
    authoritative_fields: zf.list(),
    new_initiate_window_days: zf.int("Days").pipe(z.number().min(30).max(1825)),
  }),
  async (i, { db, session }) => {
    const allowed = ["title", "first_name", "last_name", "email", "phone", "status"];
    const fields = i.authoritative_fields.filter((f) => allowed.includes(f));
    await updateSettings(db, session.orgId, (s) => ({
      ...s,
      progression: { ...(s.progression as object), ea_to_fc_months: i.ea_to_fc_months, fc_to_mm_months: i.fc_to_mm_months, new_member_review_days: i.new_member_review_days },
      comms: { ...(s.comms as object), allow_self_approval: i.comms_allow_self_approval, allocated_requires_approval: i.comms_allocated_requires_approval, reply_to: i.reply_to || undefined },
      academy: { ...(s.academy as object), allow_self_approval: i.academy_allow_self_approval },
      imports: { ...(s.imports as object), authoritative_fields: fields, new_initiate_window_days: i.new_initiate_window_days },
    }));
    return { message: "Settings saved.", revalidate: R };
  }, P,
);

export type CustomField = { key: string; label: string; type: "text" | "number" | "date" | "yes_no" | "choice"; options?: string[]; help?: string };

export const addCustomField = defineAction(
  z.object({ key: KEY, label: zf.required("Label", 80), type: z.enum(["text", "number", "date", "yes_no", "choice"]), options: zf.optionalText(500), help: zf.optionalText(200) }),
  async (i, { db, session }) => {
    const options = i.type === "choice" ? (i.options ?? "").split(",").map((o) => o.trim()).filter(Boolean) : undefined;
    if (i.type === "choice" && !options?.length) throw new UserError("List the choices, separated by commas.");
    await updateSettings(db, session.orgId, (s) => {
      const list = (Array.isArray(s.custom_fields) ? s.custom_fields : []) as CustomField[];
      if (list.some((f) => f.key === i.key)) throw new UserError("A field with that key already exists.");
      return { ...s, custom_fields: [...list, { key: i.key, label: i.label, type: i.type, ...(options ? { options } : {}), ...(i.help ? { help: i.help } : {}) }] };
    });
    return { message: "Lodge field added.", revalidate: R };
  }, P,
);

export const removeCustomField = defineAction(
  z.object({ key: KEY }),
  async (i, { db, session }) => {
    await updateSettings(db, session.orgId, (s) => ({ ...s, custom_fields: ((Array.isArray(s.custom_fields) ? s.custom_fields : []) as CustomField[]).filter((f) => f.key !== i.key) }));
    return { message: "Field removed from forms. Values already recorded on Lodges are kept.", revalidate: R };
  }, P,
);
