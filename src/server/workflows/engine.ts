import "server-only";
import type { DB } from "../supabase";
import { enqueueTemplate } from "../email/outbox";
import { ACTIONS, matchesConditions, type conditionSchema } from "./catalogue";
import type { z } from "zod";

type DomainEvent = { id: string; org_id: string; type: string; entity_type: string | null; entity_id: string | null; payload: Record<string, unknown> };
type Workflow = { id: string; org_id: string; name: string; trigger_key: string; conditions: z.infer<typeof conditionSchema>[]; actions: { type: string; params: Record<string, unknown> }[]; requires_approval: boolean; created_by: string | null; is_system: boolean };

const MAX_ATTEMPTS = 3;

/** Payload values available to conditions and actions, enriched with Lodge context. */
async function context(db: DB, ev: DomainEvent) {
  const p = { ...ev.payload } as Record<string, unknown>;
  const lodgeId = (p.lodge_id as string) ?? (ev.entity_type === "lodge" ? ev.entity_id : null);
  if (lodgeId) {
    p.lodge_id = lodgeId;
    const { data } = await db.from("v_lodge_overview").select("name, number, area_id, apgmen_person_id").eq("id", lodgeId).maybeSingle();
    if (data) Object.assign(p, { lodge_name: `${data.name} No. ${data.number}`, area_id: data.area_id, apgmen_person_id: data.apgmen_person_id });
  }
  if (!p.person_id && ev.entity_type === "person") p.person_id = ev.entity_id;
  return p;
}

async function accountForPerson(db: DB, personId?: unknown): Promise<string | null> {
  if (!personId) return null;
  const { data } = await db.from("user_accounts").select("id").eq("person_id", String(personId)).eq("status", "active").maybeSingle();
  return data?.id ?? null;
}

async function accountsWithRole(db: DB, orgId: string, roleKey: string): Promise<string[]> {
  const today = new Date().toISOString().slice(0, 10);
  const { data } = await db.from("role_assignments").select("account_id, starts_on, ends_on, roles!inner(key, org_id)").eq("roles.key", roleKey).eq("roles.org_id", orgId);
  return (data ?? []).filter((r) => r.starts_on <= today && (!r.ends_on || r.ends_on >= today)).map((r) => r.account_id);
}

/** The workflow's author must still hold the permissions its actions need. */
async function authorHolds(db: DB, wf: Workflow, perms: string[]): Promise<boolean> {
  if (wf.is_system || perms.length === 0) return true;
  if (!wf.created_by) return false;
  const today = new Date().toISOString().slice(0, 10);
  const { data } = await db.from("role_assignments").select("starts_on, ends_on, role_permissions:roles!inner(role_permissions(permission_key))").eq("account_id", wf.created_by);
  const held = new Set<string>();
  for (const r of data ?? []) {
    if (r.starts_on > today || (r.ends_on && r.ends_on < today)) continue;
    for (const rp of ((r as unknown as { role_permissions: { role_permissions: { permission_key: string }[] } }).role_permissions.role_permissions)) held.add(rp.permission_key);
  }
  return perms.every((p) => held.has(p));
}

async function resolveOwner(db: DB, orgId: string, target: string, ctx: Record<string, unknown>): Promise<string | null> {
  switch (target) {
    case "allocated_apgmen": return accountForPerson(db, ctx.apgmen_person_id);
    case "event_person": return accountForPerson(db, ctx.person_id);
    case "prov_grand_mentor": return (await accountsWithRole(db, orgId, "prov_grand_mentor"))[0] ?? null;
    case "learning_lead": return (await accountsWithRole(db, orgId, "learning_lead"))[0] ?? null;
  }
  return null;
}

type Step = { action: string; ok: boolean; detail: string };

/** Execute (or describe, when dryRun) one workflow's actions for an event. */
export async function executeActions(db: DB, wf: Workflow, ev: DomainEvent, dryRun: boolean): Promise<Step[]> {
  const ctx = await context(db, ev);
  const steps: Step[] = [];
  for (const a of wf.actions) {
    const def = ACTIONS.find((d) => d.type === a.type);
    if (!def) { steps.push({ action: a.type, ok: false, detail: "Unknown action" }); continue; }
    const params = def.params.parse(a.params) as Record<string, unknown>;
    if (!(await authorHolds(db, wf, def.requires))) {
      steps.push({ action: a.type, ok: false, detail: "Skipped: the workflow's author no longer holds the permission this action needs" });
      continue;
    }
    const today = new Date();
    switch (a.type) {
      case "create_task": {
        const owner = await resolveOwner(db, wf.org_id, String(params.owner), ctx);
        const title = `${params.title}${ctx.lodge_name ? ` (${ctx.lodge_name})` : ""}`;
        if (dryRun) { steps.push({ action: a.type, ok: true, detail: `Would create task "${title}" for ${owner ? "the resolved owner" : "no owner (unassigned)"}` }); break; }
        const due = new Date(today.getTime() + Number(params.due_in_days) * 86400000).toISOString().slice(0, 10);
        const { error } = await db.from("tasks").insert({
          org_id: wf.org_id, title, owner_account_id: owner, due_on: due, priority: String(params.priority),
          lodge_id: (ctx.lodge_id as string) ?? null,
          linked_type: ev.entity_type === "person" ? "person" : ev.entity_type === "lodge" ? "lodge" : ev.entity_type === "case" ? "case" : null,
          linked_id: ["person", "lodge", "case"].includes(ev.entity_type ?? "") ? ev.entity_id : null,
          description: `Created by workflow "${wf.name}".`,
        });
        if (error) throw new Error(error.message);
        steps.push({ action: a.type, ok: true, detail: `Created task "${title}"` });
        break;
      }
      case "notify_allocated_apgmen": case "notify_person": {
        const account = a.type === "notify_person" ? await accountForPerson(db, ctx.person_id) : await accountForPerson(db, ctx.apgmen_person_id);
        if (!account) { steps.push({ action: a.type, ok: true, detail: "No one to notify" }); break; }
        if (dryRun) { steps.push({ action: a.type, ok: true, detail: `Would notify: ${params.title}` }); break; }
        await db.rpc("admin_notify", { p_account: account, p_type: `workflow:${wf.trigger_key}`, p_title: String(params.title),
          p_body: (params.body as string) ?? (ctx.lodge_name as string) ?? undefined, p_link: ctx.lodge_id ? `/lodges/${ctx.lodge_id}` : undefined, p_dedupe: `wf:${wf.id}:${ev.id}:${account}` });
        steps.push({ action: a.type, ok: true, detail: "Notified" });
        break;
      }
      case "notify_role": {
        const accounts = await accountsWithRole(db, wf.org_id, String(params.role));
        if (dryRun) { steps.push({ action: a.type, ok: true, detail: `Would notify ${accounts.length} people` }); break; }
        for (const acc of accounts) await db.rpc("admin_notify", { p_account: acc, p_type: `workflow:${wf.trigger_key}`, p_title: String(params.title), p_body: (params.body as string) ?? null, p_link: undefined, p_dedupe: `wf:${wf.id}:${ev.id}:${acc}` });
        steps.push({ action: a.type, ok: true, detail: `Notified ${accounts.length}` });
        break;
      }
      case "send_template_email": {
        if (!ctx.person_id) { steps.push({ action: a.type, ok: true, detail: "No person to email" }); break; }
        if (dryRun) { steps.push({ action: a.type, ok: true, detail: `Would email template "${params.template}" (subject to preferences)` }); break; }
        const queued = await enqueueTemplate(db, { orgId: wf.org_id, templateKey: String(params.template), personId: String(ctx.person_id),
          category: params.category as "operational", idempotencyKey: `wf:${wf.id}:${ev.id}`, vars: { lodge: ctx.lodge_name as string } });
        steps.push({ action: a.type, ok: true, detail: queued ? "Email queued" : "Not sent (no address, preference, or already sent)" });
        break;
      }
      case "suggest_course": {
        const account = await accountForPerson(db, ctx.person_id);
        const { data: course } = await db.from("courses").select("title, slug, published_version_id").eq("id", String(params.course_id)).maybeSingle();
        if (!account || !course?.published_version_id) { steps.push({ action: a.type, ok: true, detail: "No learner account or course not published" }); break; }
        if (dryRun) { steps.push({ action: a.type, ok: true, detail: `Would suggest "${course.title}"` }); break; }
        await db.rpc("admin_notify", { p_account: account, p_type: "learning_suggestion", p_title: "A course you might find useful", p_body: course.title, p_link: `/academy/courses/${course.slug}`, p_dedupe: `wf:${wf.id}:${ev.id}` });
        steps.push({ action: a.type, ok: true, detail: `Suggested "${course.title}"` });
        break;
      }
      case "create_calendar_item": {
        const starts = new Date(today.getTime() + Number(params.in_days) * 86400000); starts.setHours(19, 0, 0, 0);
        if (dryRun) { steps.push({ action: a.type, ok: true, detail: `Would add "${params.title}" on ${starts.toDateString()}` }); break; }
        const { error } = await db.from("events").insert({ org_id: wf.org_id, title: String(params.title), kind: "other", visibility: "internal", registration_mode: "none",
          starts_at: starts.toISOString(), ends_at: new Date(starts.getTime() + 3600000).toISOString(), status: "draft", description: `Created by workflow "${wf.name}". Review and publish.` });
        if (error) throw new Error(error.message);
        steps.push({ action: a.type, ok: true, detail: "Draft calendar item created" });
        break;
      }
      case "set_lodge_status": {
        if (!ctx.lodge_id) { steps.push({ action: a.type, ok: true, detail: "No Lodge" }); break; }
        const { data: st } = await db.from("mentoring_statuses").select("id, label").eq("org_id", wf.org_id).eq("key", String(params.status_key)).eq("active", true).maybeSingle();
        if (!st) throw new Error(`Status "${params.status_key}" is not configured`);
        if (dryRun) { steps.push({ action: a.type, ok: true, detail: `Would set status to ${st.label}` }); break; }
        await db.from("lodges").update({ mentoring_status_id: st.id }).eq("id", String(ctx.lodge_id));
        steps.push({ action: a.type, ok: true, detail: `Status set to ${st.label}` });
        break;
      }
      case "generate_quarterly_draft": {
        if (dryRun) { steps.push({ action: a.type, ok: true, detail: "Would refresh this quarter's draft report" }); break; }
        const q = Math.floor(today.getMonth() / 3) + 1;
        const { error } = await db.rpc("admin_generate_quarterly", { p_org: wf.org_id, p_year: today.getFullYear(), p_quarter: q });
        if (error) throw new Error(error.message);
        steps.push({ action: a.type, ok: true, detail: `Draft for Q${q} refreshed` });
        break;
      }
    }
  }
  return steps;
}

/** Create runs for every enabled workflow matching the event (idempotent per workflow+event). */
export async function dispatchToWorkflows(db: DB, ev: DomainEvent): Promise<number> {
  if (ev.payload?.kind === "confidential") return 0; // Confidential concerns never enter automation.
  const { data: wfs } = await db.from("workflows").select("*").eq("org_id", ev.org_id).eq("trigger_key", ev.type).eq("enabled", true);
  let created = 0;
  for (const wf of (wfs ?? []) as unknown as Workflow[]) {
    const ctx = await context(db, ev);
    if (!matchesConditions(wf.conditions ?? [], ctx)) continue;
    const { data } = await db.from("workflow_runs").upsert({
      org_id: wf.org_id, workflow_id: wf.id, domain_event_id: ev.id, idempotency_key: `${wf.id}:${ev.id}`,
      status: wf.requires_approval ? "pending_approval" : "pending",
    }, { onConflict: "idempotency_key", ignoreDuplicates: true }).select("id");
    created += data?.length ?? 0;
  }
  return created;
}

/** Run pending workflow runs with retry and backoff. */
export async function processWorkflowRuns(db: DB, limit = 25) {
  const stats = { succeeded: 0, failed: 0, retried: 0 };
  const { data: runs } = await db.from("workflow_runs").select("id").eq("status", "pending").lte("next_attempt_at", new Date().toISOString()).limit(limit);
  for (const { id } of runs ?? []) {
    const { data: run } = await db.from("workflow_runs").update({ status: "running" }).eq("id", id).eq("status", "pending").select("*, workflows(*), domain_events(*)").maybeSingle();
    if (!run) continue;
    const wf = run.workflows as unknown as Workflow;
    const ev = run.domain_events as unknown as DomainEvent;
    try {
      const steps = await executeActions(db, wf, ev, false);
      const skipped = steps.filter((s) => !s.ok);
      if (skipped.length) {
        // A skipped action (e.g. its author no longer holds the permission) needs attention:
        // record the run as failed rather than hiding it behind "succeeded".
        await db.from("workflow_runs").update({ status: "failed", results: steps, attempts: run.attempts + 1, finished_at: new Date().toISOString(),
          error: skipped.map((s) => `${s.action}: ${s.detail}`).join("; ").slice(0, 500) }).eq("id", id);
        await db.from("integration_failures").insert({ org_id: wf.org_id, integration_key: "workflow", operation: wf.name, message: `Actions skipped: ${skipped.map((s) => s.action).join(", ")}`, context: { run_id: id }, retryable: false });
        stats.failed++;
        continue;
      }
      await db.from("workflow_runs").update({ status: "succeeded", results: steps, attempts: run.attempts + 1, finished_at: new Date().toISOString(), error: null }).eq("id", id);
      stats.succeeded++;
    } catch (e) {
      const attempts = run.attempts + 1;
      const final = attempts >= MAX_ATTEMPTS;
      await db.from("workflow_runs").update({ status: final ? "failed" : "pending", attempts, error: (e as Error).message.slice(0, 500),
        next_attempt_at: new Date(Date.now() + 5 * 2 ** attempts * 60000).toISOString(), finished_at: final ? new Date().toISOString() : null }).eq("id", id);
      if (final) {
        await db.from("integration_failures").insert({ org_id: wf.org_id, integration_key: "workflow", operation: wf.name, message: (e as Error).message.slice(0, 500), context: { run_id: id }, retryable: true });
        stats.failed++;
      } else stats.retried++;
    }
  }
  return stats;
}

/** Preview a workflow against a recent matching event without changing anything. */
export async function dryRunWorkflow(db: DB, workflowId: string) {
  const { data: wf } = await db.from("workflows").select("*").eq("id", workflowId).single();
  if (!wf) throw new Error("Workflow not found");
  const { data: ev } = await db.from("domain_events").select("*").eq("org_id", wf.org_id).eq("type", wf.trigger_key).order("occurred_at", { ascending: false }).limit(1).maybeSingle();
  if (!ev) return { event: null, steps: [] as Step[], matched: false };
  const ctx = await context(db, ev as unknown as DomainEvent);
  const matched = matchesConditions((wf.conditions as never) ?? [], ctx);
  const steps = matched ? await executeActions(db, wf as unknown as Workflow, ev as unknown as DomainEvent, true) : [];
  return { event: ev, steps, matched };
}
