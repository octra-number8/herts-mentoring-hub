import "server-only";
import { interpolate } from "@/lib/markdown";
import { serverEnv } from "@/lib/env";
import type { DB } from "../supabase";
import { EmailSendError, sendEmail } from "./driver";
import { renderEmail } from "./layout";

export type EmailCategory = "security" | "operational" | "learning" | "events" | "news";

const MAX_ATTEMPTS = 5;

/** Categories the recipient may switch off. Security and operational email always send. */
const OPTIONAL: EmailCategory[] = ["learning", "events", "news"];

type Enqueue = {
  orgId: string;
  toEmail: string;
  toPersonId?: string | null;
  subject: string;
  markdown: string;
  category: EmailCategory;
  idempotencyKey: string;
  preheader?: string;
  campaignRecipientId?: string | null;
  replyTo?: string | null;
  attachments?: { path: string; bucket: string; filename: string }[];
};

/** Queue an email. Idempotent: the same key is never queued twice. */
export async function enqueueEmail(db: DB, e: Enqueue): Promise<boolean> {
  const { data: org } = await db.from("organisations").select("name, settings").eq("id", e.orgId).single();
  let unsubscribeUrl: string | null = null;
  if (OPTIONAL.includes(e.category) && e.toPersonId) {
    const { data: pref } = await db.from("comm_preferences").select("unsubscribe_token").eq("person_id", e.toPersonId).maybeSingle();
    if (pref) unsubscribeUrl = `${serverEnv().appUrl}/unsubscribe/${pref.unsubscribe_token}`;
  }
  const replyTo = e.replyTo ?? ((org?.settings as { comms?: { reply_to?: string } })?.comms?.reply_to ?? null);
  const { html, text } = renderEmail({ orgName: org?.name ?? "Mentoring Hub", subject: e.subject, markdown: e.markdown, preheader: e.preheader, unsubscribeUrl });
  const { error, data } = await db.from("email_outbox").upsert({
    org_id: e.orgId, to_email: e.toEmail, to_person_id: e.toPersonId ?? null, subject: e.subject, html, text_body: text,
    category: e.category, idempotency_key: e.idempotencyKey, campaign_recipient_id: e.campaignRecipientId ?? null,
    reply_to: replyTo, attachments: e.attachments ?? [],
  }, { onConflict: "idempotency_key", ignoreDuplicates: true }).select("id");
  if (error) throw error;
  return (data?.length ?? 0) > 0;
}

/** Render a stored template for a person and queue it. */
export async function enqueueTemplate(db: DB, opts: {
  orgId: string; templateKey: string; personId: string; category: EmailCategory; idempotencyKey: string; vars: Record<string, string | number | null | undefined>;
}): Promise<boolean> {
  const [{ data: tpl }, { data: person }, { data: org }, { data: pref }] = await Promise.all([
    db.from("email_templates").select("subject, body_markdown").eq("org_id", opts.orgId).eq("key", opts.templateKey).single(),
    db.from("persons").select("email, first_name, display_name, status, anonymised_at").eq("id", opts.personId).single(),
    db.from("organisations").select("short_name").eq("id", opts.orgId).single(),
    db.from("comm_preferences").select("learning, events, news, unsubscribed_all_at, email_status").eq("person_id", opts.personId).maybeSingle(),
  ]);
  if (!tpl || !person?.email || person.anonymised_at) return false;
  if (!mayEmail(opts.category, pref)) return false;
  const vars = { first_name: person.first_name, name: person.display_name, org_short: org?.short_name, ...opts.vars };
  return enqueueEmail(db, {
    orgId: opts.orgId, toEmail: person.email, toPersonId: opts.personId,
    subject: interpolate(tpl.subject, vars, { escape: false }), markdown: interpolate(tpl.body_markdown, vars),
    category: opts.category, idempotencyKey: opts.idempotencyKey,
  });
}

export function mayEmail(category: EmailCategory, pref: { learning: boolean; events: boolean; news: boolean; unsubscribed_all_at: string | null; email_status: string } | null): boolean {
  if (category === "security") return true;
  if (pref && ["bounced", "complained", "invalid"].includes(pref.email_status)) return false;
  if (category === "operational") return true;
  if (!pref) return category !== "news";
  if (pref.unsubscribed_all_at) return false;
  if (category === "learning") return pref.learning;
  if (category === "events") return pref.events;
  return pref.news;
}

/** Send due emails with exponential backoff; failures are recorded for the health page. */
export async function processOutbox(db: DB, limit = 50): Promise<{ sent: number; failed: number; retried: number; suppressed: number }> {
  const stats = { sent: 0, failed: 0, retried: 0, suppressed: 0 };
  const { data: due } = await db.from("email_outbox").select("id").eq("status", "queued").lte("next_attempt_at", new Date().toISOString()).order("created_at").limit(limit);
  for (const { id } of due ?? []) {
    const { data: claimed } = await db.from("email_outbox").update({ status: "sending" }).eq("id", id).eq("status", "queued").select("*").maybeSingle();
    if (!claimed) continue;
    if (claimed.to_person_id && claimed.category !== "security") {
      const { data: pref } = await db.from("comm_preferences").select("email_status").eq("person_id", claimed.to_person_id).maybeSingle();
      if (pref && ["bounced", "complained", "invalid"].includes(pref.email_status)) {
        await db.from("email_outbox").update({ status: "suppressed", last_error: `Address ${pref.email_status}` }).eq("id", id);
        if (claimed.campaign_recipient_id) await db.from("campaign_recipients").update({ status: "failed", error: `Address ${pref.email_status}` }).eq("id", claimed.campaign_recipient_id);
        stats.suppressed++;
        continue;
      }
    }
    try {
      const attachments = [];
      for (const a of (claimed.attachments as { path: string; bucket: string; filename: string }[]) ?? []) {
        const { data: file } = await db.storage.from(a.bucket).download(a.path);
        if (file) attachments.push({ filename: a.filename, content: Buffer.from(await file.arrayBuffer()) });
      }
      const res = await sendEmail({
        to: claimed.to_email, subject: claimed.subject, html: claimed.html, text: claimed.text_body, replyTo: claimed.reply_to,
        attachments, idempotencyKey: claimed.idempotency_key,
        headers: claimed.category === "news" ? { "List-Unsubscribe": `<${serverEnv().appUrl}/account/notifications>` } : undefined,
      });
      const now = new Date().toISOString();
      await db.from("email_outbox").update({ status: "sent", sent_at: now, provider_message_id: res.id, attempts: claimed.attempts + 1, last_error: null }).eq("id", id);
      if (claimed.campaign_recipient_id) await db.from("campaign_recipients").update({ status: "sent", sent_at: now, provider_message_id: res.id, error: null }).eq("id", claimed.campaign_recipient_id);
      await db.from("integrations").update({ last_success_at: now }).eq("org_id", claimed.org_id).eq("key", "resend");
      stats.sent++;
    } catch (e) {
      const err = e as Error;
      const retryable = !(e instanceof EmailSendError) || e.retryable;
      const attempts = claimed.attempts + 1;
      const giveUp = !retryable || attempts >= MAX_ATTEMPTS;
      const backoffMinutes = Math.min(2 ** attempts, 120);
      await db.from("email_outbox").update({
        status: giveUp ? "failed" : "queued", attempts, last_error: err.message.slice(0, 500),
        next_attempt_at: new Date(Date.now() + backoffMinutes * 60000).toISOString(),
      }).eq("id", id);
      if (claimed.campaign_recipient_id && giveUp) await db.from("campaign_recipients").update({ status: "failed", error: err.message.slice(0, 500) }).eq("id", claimed.campaign_recipient_id);
      await db.from("integration_failures").insert({
        org_id: claimed.org_id, integration_key: "resend", operation: "send_email", message: err.message.slice(0, 500),
        context: { outbox_id: id, attempts, final: giveUp }, retryable: !giveUp,
      });
      await db.from("integrations").update({ last_error_at: new Date().toISOString(), last_error: err.message.slice(0, 300) }).eq("org_id", claimed.org_id).eq("key", "resend");
      if (giveUp) stats.failed++; else stats.retried++;
    }
  }
  return stats;
}

/** Put a failed email back in the queue (manual recovery from the health page). */
export async function retryOutboxItem(db: DB, id: string) {
  await db.from("email_outbox").update({ status: "queued", next_attempt_at: new Date().toISOString(), attempts: 0 }).eq("id", id).in("status", ["failed"]);
}
