import { Badge, statusTone } from "@/components/ui/badge";
import { ActionButton } from "@/components/ui/dialog-form";
import { EmptyState } from "@/components/ui/layout";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import type { ActionState } from "@/lib/action-state";
import { formatDateTime, label } from "@/lib/utils";
import { ACTIONS } from "@/server/workflows/catalogue";

type Action = (p: ActionState, f: FormData) => Promise<ActionState>;
export type RunRow = {
  id: string; workflow_id: string; status: string; attempts: number; created_at: string; finished_at: string | null; error: string | null;
  results: unknown; workflows?: { name: string } | null; domain_events?: { type: string } | null;
};

/** Workflow run history with results, retry for failures and approval for held runs. */
export function WorkflowRuns({ runs, decide, retry, showWorkflow, canManage }: { runs: RunRow[]; decide: Action; retry: Action; showWorkflow?: boolean; canManage: boolean }) {
  if (!runs.length) return <EmptyState title="No runs yet">Runs appear here when a matching event happens.</EmptyState>;
  return (
    <Table caption="Workflow runs">
      <THead>{showWorkflow && <TH>Workflow</TH>}<TH>When</TH><TH>Status</TH><TH className="hidden md:table-cell">Result</TH><TH><span className="sr-only">Actions</span></TH></THead>
      <TBody>
        {runs.map((r) => {
          const steps = (Array.isArray(r.results) ? r.results : []) as { action: string; ok: boolean; detail: string }[];
          return (
            <TR key={r.id}>
              {showWorkflow && <TD className="font-medium">{r.workflows?.name}</TD>}
              <TD className="text-[13px]">{formatDateTime(r.created_at)}<div className="text-muted">{r.attempts} {r.attempts === 1 ? "attempt" : "attempts"}</div></TD>
              <TD><Badge tone={statusTone(r.status)}>{label(r.status)}</Badge></TD>
              <TD className="hidden text-[13px] md:table-cell">
                {r.error && <p className="text-danger-700">{r.error}</p>}
                {steps.map((s, i) => <p key={i} className={s.ok ? "" : "text-warning-800"}>{ACTIONS.find((a) => a.type === s.action)?.label ?? s.action}: {s.detail}</p>)}
                {!r.error && !steps.length && <span className="text-muted">{r.status === "pending_approval" ? "Waiting for approval" : "Nothing recorded"}</span>}
              </TD>
              <TD>
                {canManage && r.status === "pending_approval" && (
                  <div className="flex flex-wrap justify-end gap-1">
                    <ActionButton action={decide} fields={{ run_id: r.id, approve: "true", workflow_id: r.workflow_id }} variant="primary">Approve</ActionButton>
                    <ActionButton action={decide} fields={{ run_id: r.id, approve: "false", workflow_id: r.workflow_id }} variant="subtle" confirm="Cancel this run? Nothing will happen.">Cancel</ActionButton>
                  </div>
                )}
                {r.status === "failed" && <ActionButton action={retry} fields={{ run_id: r.id, workflow_id: r.workflow_id }}>Retry</ActionButton>}
              </TD>
            </TR>
          );
        })}
      </TBody>
    </Table>
  );
}
