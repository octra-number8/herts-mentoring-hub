import type { Metadata } from "next";
import { WorkflowRuns, type RunRow } from "@/components/admin/workflow-runs";
import { Badge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { ActionButton } from "@/components/ui/dialog-form";
import { Alert, EmptyState, PageHeader, Panel } from "@/components/ui/layout";
import { RowLink, TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { can, requirePermission } from "@/server/session";
import { supabaseServer } from "@/server/supabase";
import { TRIGGERS } from "@/server/workflows/catalogue";
import { decideRun, retryRun, setWorkflowEnabled } from "./actions";

export const metadata: Metadata = { title: "Workflows" };

export default async function WorkflowsPage() {
  const session = await requirePermission("workflows.manage");
  const db = await supabaseServer();
  const [{ data: workflows }, { data: held }, { data: recent }] = await Promise.all([
    db.from("workflows").select("id, name, description, trigger_key, enabled, requires_approval, is_system").order("name"),
    db.from("workflow_runs").select("id, workflow_id, status, attempts, created_at, finished_at, error, results, workflows(name), domain_events(type)").eq("status", "pending_approval").order("created_at"),
    db.from("workflow_runs").select("id, workflow_id, status, attempts, created_at, finished_at, error, results, workflows(name), domain_events(type)").neq("status", "pending_approval").order("created_at", { ascending: false }).limit(25),
  ]);
  const triggerLabel = (k: string) => TRIGGERS.find((t) => t.key === k)?.label ?? k;
  const manage = can(session, "workflows.manage");

  return (
    <>
      <PageHeader breadcrumbs={[{ href: "/admin", label: "Administration" }]} title="Workflows"
        description="Controlled automation: choose a trigger, optional conditions and actions from an approved catalogue. Confidential concerns never enter workflows."
        actions={<LinkButton href="/admin/workflows/new" variant="primary">New workflow</LinkButton>} />

      {held && held.length > 0 && (
        <Panel title={`Waiting for approval (${held.length})`} className="mb-6" padded={false}>
          <WorkflowRuns runs={held as unknown as RunRow[]} decide={decideRun} retry={retryRun} showWorkflow canManage={manage} />
        </Panel>
      )}

      {workflows?.length ? (
        <Table caption="Workflows">
          <THead><TH>Workflow</TH><TH className="hidden md:table-cell">Trigger</TH><TH>State</TH><TH><span className="sr-only">Actions</span></TH></THead>
          <TBody>
            {workflows.map((w) => (
              <TR key={w.id}>
                <TD><RowLink href={`/admin/workflows/${w.id}`}>{w.name}</RowLink>{w.description && <div className="text-[13px] text-muted">{w.description}</div>}</TD>
                <TD className="hidden md:table-cell">{triggerLabel(w.trigger_key)}</TD>
                <TD><div className="flex flex-wrap gap-1"><Badge tone={w.enabled ? "success" : "neutral"}>{w.enabled ? "Enabled" : "Disabled"}</Badge>{w.requires_approval && <Badge tone="warning">Needs approval</Badge>}{w.is_system && <Badge tone="navy">System</Badge>}</div></TD>
                <TD><ActionButton action={setWorkflowEnabled} fields={{ id: w.id, enabled: w.enabled ? "false" : "true" }} variant="subtle">{w.enabled ? "Disable" : "Enable"}</ActionButton></TD>
              </TR>
            ))}
          </TBody>
        </Table>
      ) : <EmptyState title="No workflows yet" action={<LinkButton href="/admin/workflows/new" size="sm">Create a workflow</LinkButton>} />}

      <h2 className="mb-3 mt-8 text-[15px] font-semibold text-navy-900">Recent runs</h2>
      <div className="mb-3"><Alert tone="info">Failed runs are retried automatically up to three times, then listed here and on the system health page.</Alert></div>
      <WorkflowRuns runs={(recent ?? []) as unknown as RunRow[]} decide={decideRun} retry={retryRun} showWorkflow canManage={manage} />
    </>
  );
}
