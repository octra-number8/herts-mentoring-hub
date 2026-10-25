import type { Metadata } from "next";
import Link from "next/link";
import { WorkflowRuns, type RunRow } from "@/components/admin/workflow-runs";
import { Badge, type Tone } from "@/components/ui/badge";
import { ActionButton } from "@/components/ui/dialog-form";
import { Alert, DescriptionList, EmptyState, PageHeader, Panel, Stat } from "@/components/ui/layout";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { serverEnv } from "@/lib/env";
import { formatDateTime, isoInDays, label } from "@/lib/utils";
import { can, requirePermission } from "@/server/session";
import { supabaseServer } from "@/server/supabase";
import { decideRun, retryRun } from "../workflows/actions";
import { resolveFailure, retryEmail, runJobsNow } from "./actions";

export const metadata: Metadata = { title: "System health" };

const INTEGRATION: Record<string, string> = { resend: "Email (Resend)", octra_lodge: "Octra-Lodge bookings", membership_feed: "Membership feed (Hermes / Adelphi)", calendar: "Calendar feeds" };
const STATUS_TONE: Record<string, Tone> = { active: "success", simulated: "teal", not_configured: "neutral", error: "danger", disabled: "neutral" };
const STATUS_LABEL: Record<string, string> = { active: "Working", simulated: "Simulated", not_configured: "Not configured", error: "Error", disabled: "Disabled" };

export default async function HealthPage() {
  const session = await requirePermission("system.health");
  const db = await supabaseServer();
  const env = serverEnv();
  const weekAgo = `${isoInDays(-7)}T00:00:00Z`;
  const head = { count: "exact" as const, head: true };
  const [{ data: integrations }, { data: failures }, { count: queued }, { count: failedEmails }, { count: sent7 }, { data: failedList }, { count: backlog }, { data: oldest }, { count: erroring }, { data: wfFailed }] = await Promise.all([
    db.from("integrations").select("key, status, notes, last_success_at, last_error_at, last_error").order("key"),
    db.from("integration_failures").select("id, integration_key, operation, message, retryable, occurred_at, context").is("resolved_at", null).order("occurred_at", { ascending: false }).limit(50),
    db.from("email_outbox").select("id", head).eq("status", "queued"),
    db.from("email_outbox").select("id", head).eq("status", "failed"),
    db.from("email_outbox").select("id", head).eq("status", "sent").gte("sent_at", weekAgo),
    db.from("email_outbox").select("id, to_email, subject, category, attempts, last_error, created_at").eq("status", "failed").order("created_at", { ascending: false }).limit(20),
    db.from("domain_events").select("id", head).is("processed_at", null),
    db.from("domain_events").select("occurred_at").is("processed_at", null).order("occurred_at").limit(1).maybeSingle().then((r) => ({ data: r.data })),
    db.from("domain_events").select("id", head).is("processed_at", null).gt("attempts", 0),
    db.from("workflow_runs").select("id, workflow_id, status, attempts, created_at, finished_at, error, results, workflows(name)").eq("status", "failed").order("created_at", { ascending: false }).limit(20),
  ]);

  const driverNote = env.emailDriver === "resend"
    ? (env.resendApiKey ? "Sending through Resend." : "Resend is selected but no API key is set, so emails will fail.")
    : env.emailDriver === "smtp" ? `Simulated: emails are captured by the local SMTP server (${env.smtpHost}:${env.smtpPort}) and not delivered.` : "Simulated: emails are kept in memory and not delivered.";
  const liveNote: Record<string, string> = {
    resend: driverNote,
    octra_lodge: env.octraApiBase && env.octraApiKey ? "An API address and key are set. The real API has not been verified." : "Not configured. Bookings link out to Octra-Lodge.",
    membership_feed: "Not configured. Membership arrives through manual imports, which work fully.",
    calendar: "Served by the Hub: ICS downloads and private subscription links.",
  };

  return (
    <>
      <PageHeader breadcrumbs={[{ href: "/admin", label: "Administration" }]} title="System health"
        description="Integrations, background processing and anything waiting for attention." />

      <Panel title="Background jobs" className="mb-6" description="Normally run every few minutes by the scheduler and shortly after user actions.">
        <ActionButton action={runJobsNow} variant="primary" size="md">Run background jobs now</ActionButton>
      </Panel>

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Emails queued" value={queued ?? 0} />
        <Stat label="Emails failed" value={failedEmails ?? 0} tone={failedEmails ? "attention" : undefined} />
        <Stat label="Emails sent (7 days)" value={sent7 ?? 0} />
        <Stat label="Events waiting" value={backlog ?? 0} hint={oldest?.occurred_at ? `Oldest ${formatDateTime(oldest.occurred_at)}` : "Nothing waiting"} tone={erroring ? "attention" : undefined} />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Panel title="Integrations" padded={false}>
          <ul className="divide-y divide-line">
            {(integrations ?? []).map((i) => (
              <li key={i.key} className="space-y-1 px-5 py-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">{INTEGRATION[i.key] ?? label(i.key)}</span>
                  <Badge tone={STATUS_TONE[i.status] ?? "neutral"}>{STATUS_LABEL[i.status] ?? label(i.status)}</Badge>
                </div>
                <p className="text-slate-ink">{liveNote[i.key] ?? i.notes}</p>
                {i.notes && liveNote[i.key] && <p className="text-[13px] text-muted">{i.notes}</p>}
                {(i.last_success_at || i.last_error_at) && (
                  <p className="text-[13px] text-muted">{i.last_success_at && `Last success ${formatDateTime(i.last_success_at)}`}{i.last_error_at && ` · Last error ${formatDateTime(i.last_error_at)}: ${i.last_error}`}</p>
                )}
              </li>
            ))}
            {!integrations?.length && <li className="p-5 text-sm text-muted">No integrations are recorded.</li>}
          </ul>
        </Panel>

        <Panel title="Failures needing attention" padded={false}>
          {failures?.length ? (
            <ul className="divide-y divide-line">
              {failures.map((f) => (
                <li key={f.id} className="space-y-1.5 px-5 py-3 text-sm">
                  <div className="flex flex-wrap justify-between gap-2"><span className="font-medium">{label(f.integration_key)}: {f.operation}</span><span className="text-[13px] text-muted">{formatDateTime(f.occurred_at)}</span></div>
                  <p className="break-words text-slate-ink">{f.message}</p>
                  <div className="flex flex-wrap gap-2">
                    {f.retryable && <ActionButton action={resolveFailure} fields={{ id: f.id, retry: "true" }}>Retry</ActionButton>}
                    <ActionButton action={resolveFailure} fields={{ id: f.id, retry: "false" }} variant="subtle" confirm="Mark this failure as resolved without retrying?">Mark resolved</ActionButton>
                  </div>
                </li>
              ))}
            </ul>
          ) : <div className="p-5"><EmptyState title="No unresolved failures" /></div>}
        </Panel>

        <Panel title="Failed emails" padded={false}>
          {failedList?.length ? (
            <Table className="rounded-none border-0" caption="Failed emails">
              <THead><TH>Email</TH><TH className="hidden md:table-cell">Error</TH><TH><span className="sr-only">Actions</span></TH></THead>
              <TBody>
                {failedList.map((e) => (
                  <TR key={e.id}>
                    <TD className="text-[13px]"><div className="font-medium">{e.subject}</div><div className="text-muted">{e.to_email} · {label(e.category)} · {formatDateTime(e.created_at)}</div></TD>
                    <TD className="hidden max-w-xs break-words text-[13px] md:table-cell">{e.last_error}</TD>
                    <TD><ActionButton action={retryEmail} fields={{ id: e.id }}>Retry</ActionButton></TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          ) : <div className="p-5"><EmptyState title="No failed emails" /></div>}
        </Panel>

        <Panel title="Domain events" description="Changes waiting for notifications, emails and workflows to follow.">
          <DescriptionList columns={1} items={[
            { label: "Waiting to be processed", value: String(backlog ?? 0) },
            { label: "Retrying after an error", value: String(erroring ?? 0) },
            { label: "Oldest waiting", value: oldest?.occurred_at ? formatDateTime(oldest.occurred_at) : "None" },
          ]} />
          {(erroring ?? 0) > 0 && <div className="mt-3"><Alert tone="warning">Some events have failed at least once. They are retried automatically; after five attempts they appear under failures.</Alert></div>}
        </Panel>
      </div>

      <h2 className="mb-3 mt-8 text-[15px] font-semibold text-navy-900">Workflow failures</h2>
      {wfFailed?.length ? <WorkflowRuns runs={wfFailed as unknown as RunRow[]} decide={decideRun} retry={retryRun} showWorkflow canManage={can(session, "workflows.manage")} />
        : <EmptyState title="No failed workflow runs">{can(session, "workflows.manage") && <Link href="/admin/workflows" className="underline">View workflows</Link>}</EmptyState>}
    </>
  );
}
