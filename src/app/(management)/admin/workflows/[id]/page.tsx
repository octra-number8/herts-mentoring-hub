import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DryRunPanel, WorkflowBuilder } from "@/components/admin/workflow-builder";
import { WorkflowRuns, type RunRow } from "@/components/admin/workflow-runs";
import { Badge } from "@/components/ui/badge";
import { ActionButton } from "@/components/ui/dialog-form";
import { Alert, PageHeader, Panel } from "@/components/ui/layout";
import { builderLists } from "@/server/admin/workflows";
import { can, requirePermission } from "@/server/session";
import { supabaseServer } from "@/server/supabase";
import { validateWorkflowDefinition } from "@/server/workflows/catalogue";
import { decideRun, deleteWorkflow, dryRun, retryRun, saveWorkflow, setWorkflowEnabled } from "../actions";

export const metadata: Metadata = { title: "Workflow" };

export default async function WorkflowPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requirePermission("workflows.manage");
  const { id } = await params;
  const db = await supabaseServer();
  const { data: wf } = await db.from("workflows").select("*").eq("id", id).maybeSingle();
  if (!wf) notFound();
  const [lists, { data: runs }] = await Promise.all([
    builderLists(db),
    db.from("workflow_runs").select("id, workflow_id, status, attempts, created_at, finished_at, error, results").eq("workflow_id", id).order("created_at", { ascending: false }).limit(50),
  ]);
  const valid = validateWorkflowDefinition(wf);

  return (
    <>
      <PageHeader breadcrumbs={[{ href: "/admin", label: "Administration" }, { href: "/admin/workflows", label: "Workflows" }]} title={wf.name}
        meta={<><Badge tone={wf.enabled ? "success" : "neutral"}>{wf.enabled ? "Enabled" : "Disabled"}</Badge>{wf.requires_approval && <Badge tone="warning">Needs approval</Badge>}{wf.is_system && <Badge tone="navy">System</Badge>}</>}
        actions={
          <>
            <ActionButton action={setWorkflowEnabled} fields={{ id, enabled: wf.enabled ? "false" : "true" }} variant={wf.enabled ? "secondary" : "primary"} size="md">{wf.enabled ? "Disable" : "Enable"}</ActionButton>
            {!wf.is_system && <ActionButton action={deleteWorkflow} fields={{ id }} variant="danger" size="md" confirm="Delete this workflow?">Delete</ActionButton>}
          </>
        } />
      {!valid.ok && <div className="mb-5"><Alert tone="warning" title="This workflow needs attention">{valid.error}</Alert></div>}
      {wf.is_system && <div className="mb-5"><Alert tone="info">A system workflow supplied with the Hub. You can change or disable it, but not delete it.</Alert></div>}
      <div className="grid gap-6 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <Panel title="Definition">
            <WorkflowBuilder action={saveWorkflow} lists={lists}
              initial={{ id, name: wf.name, description: wf.description, trigger_key: wf.trigger_key, conditions: (wf.conditions ?? []) as never, actions: (wf.actions ?? []) as never, requires_approval: wf.requires_approval }} />
          </Panel>
        </div>
        <Panel title="Dry run"><DryRunPanel action={dryRun} workflowId={id} /></Panel>
      </div>
      <h2 className="mb-3 mt-8 text-[15px] font-semibold text-navy-900">Run history</h2>
      <WorkflowRuns runs={(runs ?? []) as unknown as RunRow[]} decide={decideRun} retry={retryRun} canManage={can(session, "workflows.manage")} />
    </>
  );
}
