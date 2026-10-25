import "server-only";
import { serverEnv } from "@/lib/env";
import { formatDateTime } from "@/lib/utils";
import { enqueueEmail, enqueueTemplate, processOutbox } from "../email/outbox";
import { ensureCertificateFile } from "../pdf/certificate";
import { supabaseService, type DB } from "../supabase";
import { dispatchToWorkflows, processWorkflowRuns } from "../workflows/engine";
import { processScheduledReports } from "./scheduled-reports";

type DomainEvent = { id: string; org_id: string; type: string; entity_type: string | null; entity_id: string | null; payload: Record<string, unknown>; attempts: number };

const app = () => serverEnv().appUrl;

/**
 * Built-in reactions to domain events (transactional email, certificate files,
 * approval notices). Configurable automation runs through workflows afterwards.
 */
async function handleBuiltIn(db: DB, ev: DomainEvent) {
  const p = ev.payload as Record<string, string>;
  switch (ev.type) {
    case "event.registered":
    case "event.waitlist_promoted": {
      const { data: e } = await db.from("events").select("title, starts_at").eq("id", p.event_id).single();
      if (!e) return;
      const status = ev.type === "event.waitlist_promoted" ? "confirmed" : p.status;
      await enqueueTemplate(db, { orgId: ev.org_id, personId: p.person_id, category: "operational",
        templateKey: status === "waitlisted" ? "event_waitlist" : "event_confirmation", idempotencyKey: `${ev.type}:${ev.entity_id}:${status}`,
        vars: { event_title: e.title, event_date: formatDateTime(e.starts_at), link: `${app()}/academy/events/${p.event_id}` } });
      return;
    }
    case "event.cancelled": {
      const { data: e } = await db.from("events").select("title, starts_at").eq("id", ev.entity_id!).single();
      const { data: regs } = await db.from("registrations").select("person_id, persons(email, first_name)").eq("event_id", ev.entity_id!).in("status", ["confirmed", "waitlisted"]);
      for (const r of regs ?? []) {
        const person = r.persons as unknown as { email: string | null; first_name: string };
        if (!person?.email) continue;
        await enqueueEmail(db, { orgId: ev.org_id, toEmail: person.email, toPersonId: r.person_id, category: "operational", idempotencyKey: `event.cancelled:${ev.entity_id}:${r.person_id}`,
          subject: `Cancelled: ${e?.title}`, markdown: `Dear ${person.first_name},\n\nWe are sorry: **${e?.title}** on ${formatDateTime(e?.starts_at)} has been cancelled.${p.reason ? `\n\n${p.reason}` : ""}` });
        await db.rpc("admin_notify", { p_account: (await accountOf(db, r.person_id))!, p_type: "event", p_title: "Event cancelled", p_body: e?.title ?? "", p_link: `/academy/events/${ev.entity_id}`, p_dedupe: `event.cancelled:${ev.entity_id}` });
      }
      return;
    }
    case "event.completed": {
      const { data: e } = await db.from("events").select("title, feedback_enabled").eq("id", ev.entity_id!).single();
      if (!e?.feedback_enabled) return;
      const { data: regs } = await db.from("registrations").select("id, person_id").eq("event_id", ev.entity_id!).eq("status", "attended").is("follow_up_sent_at", null);
      for (const r of regs ?? []) {
        await enqueueTemplate(db, { orgId: ev.org_id, personId: r.person_id, category: "events", templateKey: "event_follow_up",
          idempotencyKey: `event.follow_up:${r.id}`, vars: { event_title: e.title, link: `${app()}/academy/events/${ev.entity_id}#feedback` } });
        await db.from("registrations").update({ follow_up_sent_at: new Date().toISOString() }).eq("id", r.id);
      }
      return;
    }
    case "course.assigned": {
      const { data: c } = await db.from("courses").select("title, slug").eq("id", p.course_id).single();
      if (!c) return;
      await enqueueTemplate(db, { orgId: ev.org_id, personId: p.person_id, category: "learning", templateKey: "course_assigned",
        idempotencyKey: `course.assigned:${ev.entity_id}`, vars: { course_title: c.title, link: `${app()}/academy/courses/${c.slug}` } });
      const acc = await accountOf(db, p.person_id);
      if (acc) await db.rpc("admin_notify", { p_account: acc, p_type: "learning", p_title: "New course for you", p_body: c.title, p_link: `/academy/courses/${c.slug}`, p_dedupe: `course.assigned:${ev.entity_id}` });
      return;
    }
    case "certificate.issued": {
      await ensureCertificateFile(db, ev.entity_id!);
      const acc = await accountOf(db, p.person_id);
      if (acc) await db.rpc("admin_notify", { p_account: acc, p_type: "certificate", p_title: "Your certificate is ready", p_body: undefined, p_link: "/academy/certificates", p_dedupe: `cert:${ev.entity_id}` });
      return;
    }
    case "approval.required": {
      const permission = { course_version: "academy.review", document_version: "docs.approve", quarterly_report: "reports.quarterly.approve", campaign: "comms.approve" }[ev.entity_type ?? ""];
      if (!permission) return;
      const link = { course_version: "/learning/approvals", document_version: "/library/approvals", quarterly_report: "/reports/quarterly", campaign: `/communications/${ev.entity_id}` }[ev.entity_type!];
      for (const acc of await accountsHolding(db, ev.org_id, permission)) {
        await db.rpc("admin_notify", { p_account: acc, p_type: "approval", p_title: "Awaiting your approval", p_body: (p.title as string) ?? p.kind ?? undefined, p_link: link, p_dedupe: `approval:${ev.entity_id}:${acc}` });
      }
      return;
    }
    case "document.published": {
      if (!p.requires_ack) return;
      const { data: d } = await db.from("documents").select("title, classification").eq("id", ev.entity_id!).single();
      const perm = d?.classification === "learning" ? "academy.learn" : d?.classification === "mentors" ? "docs.read.mentors" : "docs.read.internal";
      for (const acc of await accountsHolding(db, ev.org_id, perm)) {
        await db.rpc("admin_notify", { p_account: acc, p_type: "document_ack", p_title: "Please read and acknowledge", p_body: d?.title ?? "", p_link: d?.classification === "learning" || d?.classification === "mentors" ? `/academy/resources#doc-${ev.entity_id}` : `/library/${ev.entity_id}`, p_dedupe: `ack:${p.version_id}:${acc}` });
      }
      return;
    }
    case "import.committed": {
      for (const acc of await accountsHolding(db, ev.org_id, "imports.approve")) {
        await db.rpc("admin_notify", { p_account: acc, p_type: "import", p_title: "Membership import committed", p_body: `${p.new_initiates ?? 0} new Initiates identified`, p_link: `/imports/${ev.entity_id}`, p_dedupe: `import:${ev.entity_id}:${acc}` });
      }
      return;
    }
  }
}

async function accountOf(db: DB, personId?: string): Promise<string | null> {
  if (!personId) return null;
  const { data } = await db.from("user_accounts").select("id").eq("person_id", personId).eq("status", "active").maybeSingle();
  return data?.id ?? null;
}

async function accountsHolding(db: DB, orgId: string, permission: string): Promise<string[]> {
  const today = new Date().toISOString().slice(0, 10);
  const { data } = await db.from("role_assignments").select("account_id, starts_on, ends_on, roles!inner(org_id, role_permissions!inner(permission_key)), user_accounts!inner(status)")
    .eq("roles.org_id", orgId).eq("roles.role_permissions.permission_key", permission).eq("user_accounts.status", "active");
  return [...new Set((data ?? []).filter((r) => r.starts_on <= today && (!r.ends_on || r.ends_on >= today)).map((r) => r.account_id))];
}

export async function processDomainEvents(db: DB, limit = 100) {
  const stats = { processed: 0, failed: 0, workflowRuns: 0 };
  const { data: events } = await db.from("domain_events").select("*").is("processed_at", null).lt("attempts", 5).order("occurred_at").limit(limit);
  for (const ev of (events ?? []) as unknown as DomainEvent[]) {
    try {
      await handleBuiltIn(db, ev);
      stats.workflowRuns += await dispatchToWorkflows(db, ev);
      await db.from("domain_events").update({ processed_at: new Date().toISOString(), attempts: ev.attempts + 1, last_error: null }).eq("id", ev.id);
      stats.processed++;
    } catch (e) {
      await db.from("domain_events").update({ attempts: ev.attempts + 1, last_error: (e as Error).message.slice(0, 500) }).eq("id", ev.id);
      if (ev.attempts + 1 >= 5) await db.from("integration_failures").insert({ org_id: ev.org_id, integration_key: "events", operation: ev.type, message: (e as Error).message.slice(0, 500), context: { event_id: ev.id } });
      stats.failed++;
    }
  }
  return stats;
}

/** Turn approved campaigns into personalised outbox messages. */
export async function processCampaigns(db: DB) {
  let queued = 0;
  const now = new Date().toISOString();
  const { data: due } = await db.from("campaigns").select("*").or(`status.eq.approved,and(status.eq.scheduled,scheduled_for.lte.${now})`).limit(5);
  for (const c of due ?? []) {
    const { data: claimed } = await db.from("campaigns").update({ status: "sending" }).eq("id", c.id).in("status", ["approved", "scheduled"]).select("id").maybeSingle();
    if (!claimed) continue;
    const { data: recipients } = await db.from("campaign_recipients").select("id, person_id, email, name").eq("campaign_id", c.id).eq("status", "queued");
    for (const r of recipients ?? []) {
      const first = r.name.replace(/^(W Bro|VW Bro|RW Bro|Bro)\s+/i, "").split(" ")[0];
      const body = c.body_markdown.replace(/\{\{\s*first_name\s*\}\}/g, first).replace(/\{\{\s*name\s*\}\}/g, r.name);
      const ok = await enqueueEmail(db, { orgId: c.org_id, toEmail: r.email, toPersonId: r.person_id, subject: c.subject, preheader: c.preheader ?? undefined,
        markdown: body, category: c.category as "news", idempotencyKey: `campaign:${c.id}:${r.id}`, campaignRecipientId: r.id, replyTo: c.reply_to,
        attachments: (c.attachments as { path: string; bucket: string; filename: string }[]) ?? [] });
      if (ok) queued++;
    }
    await db.from("campaigns").update({ status: "sent", sent_at: new Date().toISOString() }).eq("id", c.id);
    await db.rpc("admin_record_audit", { p_org: c.org_id, p_action: "campaign.sent", p_entity_type: "campaign", p_entity_id: c.id, p_details: { recipients: recipients?.length ?? 0 } });
  }
  return { queued };
}

/** Reminders: events (24h), tasks (due/overdue once), courses (idle 14 days), reviews. */
export async function processReminders(db: DB) {
  const stats = { events: 0, tasks: 0, courses: 0, documents: 0 };
  const in48 = new Date(Date.now() + 48 * 3600000).toISOString();
  const { data: regs } = await db.from("registrations").select("id, org_id, person_id, events!inner(id, title, starts_at, status)")
    .eq("status", "confirmed").is("reminder_sent_at", null).gt("events.starts_at", new Date().toISOString()).lt("events.starts_at", in48).eq("events.status", "published").limit(200);
  for (const r of regs ?? []) {
    const e = r.events as unknown as { id: string; title: string; starts_at: string };
    await enqueueTemplate(db, { orgId: r.org_id, personId: r.person_id, category: "events", templateKey: "event_reminder", idempotencyKey: `event.reminder:${r.id}`,
      vars: { event_title: e.title, event_date: formatDateTime(e.starts_at), link: `${app()}/academy/events/${e.id}` } });
    await db.from("registrations").update({ reminder_sent_at: new Date().toISOString() }).eq("id", r.id);
    stats.events++;
  }
  const today = new Date().toISOString().slice(0, 10);
  const { data: tasks } = await db.from("tasks").select("id, org_id, title, owner_account_id, due_on, priority, lodge_id").in("status", ["open", "in_progress", "waiting"]).lte("due_on", today).is("reminder_sent_at", null).not("owner_account_id", "is", null).limit(200);
  for (const t of tasks ?? []) {
    await db.rpc("admin_notify", { p_account: t.owner_account_id!, p_type: "task_due", p_title: (t.due_on ?? today) < today ? "Task overdue" : "Task due today", p_body: t.title, p_link: `/tasks/${t.id}`, p_dedupe: `task-due:${t.id}` });
    await db.from("tasks").update({ reminder_sent_at: new Date().toISOString() }).eq("id", t.id);
    await db.from("domain_events").insert({ org_id: t.org_id, type: "task.due", entity_type: "task", entity_id: t.id, payload: { priority: t.priority, lodge_id: t.lodge_id } });
    stats.tasks++;
  }
  const idle = new Date(Date.now() - 14 * 86400000).toISOString();
  const { data: enrols } = await db.from("enrolments").select("id, org_id, person_id, last_activity_at, enrolled_at, courses(title, slug)").in("status", ["enrolled", "in_progress"]).lt("enrolled_at", idle).limit(200);
  for (const e of enrols ?? []) {
    if ((e.last_activity_at ?? e.enrolled_at) > idle) continue;
    const c = e.courses as unknown as { title: string; slug: string };
    const fortnight = Math.floor(Date.now() / (14 * 86400000));
    const sent = await enqueueTemplate(db, { orgId: e.org_id, personId: e.person_id, category: "learning", templateKey: "course_reminder", idempotencyKey: `course.reminder:${e.id}:${fortnight}`,
      vars: { course_title: c.title, link: `${app()}/academy/courses/${c.slug}` } });
    if (sent) stats.courses++;
  }
  const { data: docs } = await db.from("documents").select("id, org_id, title, review_on, owner_person_id").lte("review_on", today).is("archived_at", null).limit(100);
  for (const d of docs ?? []) {
    const acc = await accountOf(db, d.owner_person_id ?? undefined);
    if (acc) await db.rpc("admin_notify", { p_account: acc, p_type: "document_review", p_title: "Document review due", p_body: d.title, p_link: `/library/${d.id}`, p_dedupe: `doc-review:${d.id}:${d.review_on}` });
    const { count } = await db.from("domain_events").select("id", { count: "exact", head: true }).eq("type", "document.review_due").eq("entity_id", d.id).gte("occurred_at", `${d.review_on}T00:00:00Z`);
    if (!count) await db.from("domain_events").insert({ org_id: d.org_id, type: "document.review_due", entity_type: "document", entity_id: d.id, payload: { review_on: d.review_on } });
    stats.documents++;
  }
  return stats;
}

/** Email notifications per each person's preference: immediately, daily or weekly. */
export async function processNotificationEmails(db: DB) {
  const stats = { immediate: 0, digests: 0 };
  const { data: pending } = await db.from("notifications").select("id, org_id, account_id, type, title, body, link, essential, created_at, user_accounts!inner(person_id, status)")
    .is("emailed_at", null).is("digested_at", null).is("read_at", null).eq("user_accounts.status", "active").order("created_at").limit(500);
  if (!pending?.length) return stats;
  const accounts = [...new Set(pending.map((n) => n.account_id))];
  const { data: prefs } = await db.from("notification_preferences").select("account_id, type, channel").in("account_id", accounts);
  const channel = (acc: string, type: string, essential: boolean) => {
    const c = prefs?.find((p) => p.account_id === acc && p.type === type)?.channel ?? prefs?.find((p) => p.account_id === acc && p.type === "*")?.channel;
    if (essential) return c === "daily" || c === "weekly" ? c : "email";
    return c ?? "daily";
  };
  const now = new Date();
  const isDigestHour = now.getUTCHours() >= 6;
  const byAccount = new Map<string, typeof pending>();
  for (const n of pending) {
    const ch = channel(n.account_id, n.type, n.essential);
    const person = (n.user_accounts as unknown as { person_id: string }).person_id;
    if (ch === "email") {
      await enqueueTemplateNotification(db, n.org_id, person, `${n.title}${n.body ? `\n\n${n.body}` : ""}`, n.title, n.link, `notif:${n.id}`, n.essential);
      await db.from("notifications").update({ emailed_at: now.toISOString() }).eq("id", n.id);
      stats.immediate++;
    } else if (ch === "daily" || (ch === "weekly" && now.getUTCDay() === 1)) {
      const age = now.getTime() - new Date(n.created_at).getTime();
      if (isDigestHour && age > 3600000) byAccount.set(n.account_id, [...(byAccount.get(n.account_id) ?? []), n]);
    }
  }
  for (const [acc, items] of byAccount) {
    const person = (items[0].user_accounts as unknown as { person_id: string }).person_id;
    const period = now.toISOString().slice(0, 10);
    const list = items.map((i) => `- **${i.title}**${i.body ? `: ${i.body}` : ""}`).join("\n");
    const queued = await enqueueTemplate(db, { orgId: items[0].org_id, personId: person, category: "operational", templateKey: "digest", idempotencyKey: `digest:${acc}:${period}`,
      vars: { period: "daily", items: list, link: `${app()}/notifications` } });
    if (queued) {
      await db.from("notifications").update({ digested_at: now.toISOString() }).in("id", items.map((i) => i.id));
      stats.digests++;
    }
  }
  return stats;
}

async function enqueueTemplateNotification(db: DB, orgId: string, personId: string, body: string, title: string, link: string | null, key: string, essential: boolean) {
  const { data: person } = await db.from("persons").select("email, first_name").eq("id", personId).single();
  if (!person?.email) return;
  await enqueueEmail(db, { orgId, toEmail: person.email, toPersonId: personId, subject: title, category: essential ? "security" : "operational", idempotencyKey: key,
    markdown: `Dear ${person.first_name},\n\n${body}${link ? `\n\n[Open in the Hub](${app()}${link})` : ""}` });
}

/** Run every background processor once. Safe to call concurrently: rows are claimed atomically. */
export async function runAllJobs() {
  const db = supabaseService();
  const started = Date.now();
  const events = await processDomainEvents(db);
  const workflows = await processWorkflowRuns(db);
  const campaigns = await processCampaigns(db);
  const reminders = await processReminders(db);
  const notifications = await processNotificationEmails(db);
  const scheduledReports = await processScheduledReports(db);
  const outbox = await processOutbox(db, 100);
  return { events, workflows, campaigns, reminders, notifications, scheduledReports, outbox, ms: Date.now() - started };
}
