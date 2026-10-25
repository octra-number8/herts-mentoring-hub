import type { Metadata } from "next";
import { PolicyForm, RunPolicy } from "@/components/admin/retention-forms";
import { Badge } from "@/components/ui/badge";
import { Alert, EmptyState, PageHeader, Panel } from "@/components/ui/layout";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { formatDate, formatDateTime } from "@/lib/utils";
import { can, requirePermission } from "@/server/session";
import { supabaseServer } from "@/server/supabase";
import { runPolicy, updatePolicy } from "./actions";

export const metadata: Metadata = { title: "Retention" };

const TITLES: Record<string, string> = {
  persons_departed: "Departed members", contacts: "Contacts", notes: "Notes", cases_closed: "Closed support requests", import_rows: "Raw import rows",
  email_outbox: "Email delivery history", notifications: "In-app notifications", audit_events: "Audit log",
};
const ACTIONS: Record<string, string> = { anonymise: "Anonymise", delete: "Delete", archive: "Archive" };

export default async function RetentionPage() {
  const session = await requirePermission("admin.config", "system.health");
  const db = await supabaseServer();
  const [{ data: policies }, { data: runs }] = await Promise.all([
    db.from("retention_policies").select("id, entity_type, retain_months, action, basis, enabled").order("entity_type"),
    db.from("retention_runs").select("id, policy_id, dry_run, affected, details, run_at, runner:user_accounts!retention_runs_run_by_fkey(persons(display_name))").order("run_at", { ascending: false }).limit(30),
  ]);
  const manage = can(session, "admin.config");
  const titleOf = (id: string | null) => TITLES[policies?.find((p) => p.id === id)?.entity_type ?? ""] ?? "Policy";

  return (
    <>
      <PageHeader breadcrumbs={[{ href: "/admin", label: "Administration" }]} title="Retention"
        description="How long records are kept. Policies never run on their own: someone runs each one, after a dry run, and every run is recorded." />
      <div className="mb-5"><Alert tone="warning">Periods marked &quot;pending&quot; await the Province&apos;s data protection decision. Leave them disabled until it is made.</Alert></div>
      {policies?.length ? (
        <Table caption="Retention policies">
          <THead><TH>Records</TH><TH>Keep for</TH><TH className="hidden md:table-cell">Then</TH><TH className="hidden lg:table-cell">Basis</TH><TH>State</TH>{manage && <TH><span className="sr-only">Actions</span></TH>}</THead>
          <TBody>
            {policies.map((p) => (
              <TR key={p.id}>
                <TD className="font-medium">{TITLES[p.entity_type] ?? p.entity_type}</TD>
                <TD>{p.retain_months} months</TD>
                <TD className="hidden md:table-cell">{ACTIONS[p.action] ?? p.action}</TD>
                <TD className="hidden max-w-sm text-[13px] lg:table-cell">{p.basis}</TD>
                <TD><Badge tone={p.enabled ? "success" : "neutral"}>{p.enabled ? "Enabled" : "Disabled"}</Badge></TD>
                {manage && <TD><div className="flex flex-wrap justify-end gap-2"><PolicyForm action={updatePolicy} policy={p} title={TITLES[p.entity_type] ?? p.entity_type} /><RunPolicy action={runPolicy} id={p.id} title={TITLES[p.entity_type] ?? p.entity_type} enabled={p.enabled} /></div></TD>}
              </TR>
            ))}
          </TBody>
        </Table>
      ) : <EmptyState title="No retention policies" />}

      <Panel title="Recent runs" className="mt-6" padded={false}>
        {runs?.length ? (
          <Table className="rounded-none border-0" caption="Retention runs">
            <THead><TH>When</TH><TH>Policy</TH><TH>Kind</TH><TH align="right">Records</TH><TH className="hidden md:table-cell">Cut-off</TH></THead>
            <TBody>
              {runs.map((r) => (
                <TR key={r.id}>
                  <TD className="text-[13px]">{formatDateTime(r.run_at)}<div className="text-muted">{(r.runner as unknown as { persons: { display_name: string } } | null)?.persons?.display_name}</div></TD>
                  <TD>{titleOf(r.policy_id)}</TD>
                  <TD>{r.dry_run ? "Dry run" : <Badge tone="warning">Applied</Badge>}</TD>
                  <TD align="right">{r.affected}</TD>
                  <TD className="hidden md:table-cell">{formatDate((r.details as { cutoff?: string })?.cutoff)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        ) : <p className="p-5 text-sm text-muted">No policy has been run yet.</p>}
      </Panel>
    </>
  );
}
