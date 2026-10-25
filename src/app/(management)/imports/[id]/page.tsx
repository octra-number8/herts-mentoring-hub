import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BulkDecision, MappingForm, RowDecision } from "@/components/imports/import-forms";
import { Badge, statusTone } from "@/components/ui/badge";
import { ActionButton } from "@/components/ui/dialog-form";
import { Alert, DescriptionList, EmptyState, PageHeader, Panel, Stat, Tabs } from "@/components/ui/layout";
import { Pagination, TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { formatDateTime, label } from "@/lib/utils";
import { TARGET_FIELDS, suggestMapping } from "@/server/imports/mapping";
import { parseFile } from "@/server/imports/parse";
import { can, requirePermission } from "@/server/session";
import { supabaseServer } from "@/server/supabase";
import { cancelImport, commitImport, decideAllPending, decideRow, mapAndStage, restage } from "../actions";

export const metadata: Metadata = { title: "Import" };

const OUTCOMES = [
  { key: "new", label: "New" }, { key: "update", label: "Updated" }, { key: "unchanged", label: "Unchanged" },
  { key: "duplicate", label: "Potential duplicates" }, { key: "conflict", label: "Conflicts" }, { key: "invalid", label: "Invalid" },
  { key: "possible_removal", label: "Possible removals" },
] as const;
type OutcomeKey = (typeof OUTCOMES)[number]["key"];
const ALLOWED: Record<OutcomeKey, string[]> = {
  new: ["accept", "skip", "merge"], update: ["accept", "skip"], unchanged: ["skip", "accept"], duplicate: ["merge", "create_new", "skip"],
  conflict: ["skip", "accept", "merge"], invalid: ["skip"], possible_removal: ["skip", "accept"],
};
const DECISION: Record<string, string> = { pending: "Waiting for a decision", accept: "Accept", skip: "Skip", merge: "Merge", create_new: "Create new" };
const FIELD_LABEL: Record<string, string> = { ...Object.fromEntries(TARGET_FIELDS.map((f) => [f.key, f.label])), lodge: "Lodge membership" };
const SOURCE: Record<string, string> = { hermes: "Hermes", adelphi: "Adelphi", portal: "UGLE Portal", other: "Other report" };
const PAGE = 100;

type RowData = { title?: string | null; first_name?: string; last_name?: string; membership_number?: string | null; lodge_number?: number | null; notes?: string[] };
const personName = (x: unknown) => (x as { persons: { display_name: string } } | null)?.persons?.display_name ?? "";

export default async function ImportPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string; page?: string }> }) {
  const session = await requirePermission("imports.run");
  const { id } = await params;
  const sp = await searchParams;
  const db = await supabaseServer();
  const { data: batch } = await db.from("import_batches")
    .select("*, uploader:user_accounts!import_batches_uploaded_by_fkey(persons(display_name)), approver:user_accounts!import_batches_approved_by_fkey(persons(display_name)), import_templates(name)")
    .eq("id", id).maybeSingle();
  if (!batch) notFound();

  const stats = (batch.stats ?? {}) as Record<string, number>;
  const editable = batch.status === "validated";
  const header = (
    <PageHeader breadcrumbs={[{ href: "/imports", label: "Imports" }]} title={batch.file_name}
      description={`${SOURCE[batch.source] ?? batch.source} · ${batch.is_partial ? "Partial report" : "Full report"}${batch.import_templates ? ` · format: ${(batch.import_templates as unknown as { name: string }).name}` : ""}`}
      meta={<Badge tone={statusTone(batch.status)}>{batch.status === "uploaded" ? "Needs mapping" : label(batch.status)}</Badge>}
      actions={["uploaded", "validated"].includes(batch.status) ? (
        <>
          {batch.status === "validated" && <ActionButton action={restage} fields={{ batch_id: id }} variant="secondary" size="md" confirm="Check every row again? Decisions you have made will be reset.">Check again</ActionButton>}
          <ActionButton action={cancelImport} fields={{ batch_id: id }} variant="danger" size="md" confirm="Cancel this import? Nothing in the Hub will change.">Cancel import</ActionButton>
        </>
      ) : undefined} />
  );

  if (batch.status === "uploaded") {
    let table: Awaited<ReturnType<typeof parseFile>> | null = null;
    try {
      const file = batch.storage_path ? await db.storage.from("imports").download(batch.storage_path) : null;
      if (file?.data) table = await parseFile(batch.file_name, new Uint8Array(await file.data.arrayBuffer()));
    } catch {
      table = null;
    }
    const content = table ? (
      <Panel title="Match the columns" description="This report's columns did not match a saved format. Tell the Hub which column holds each field. Columns left as 'Do not import' are ignored.">
        <MappingForm action={mapAndStage} batchId={id} headers={table.headers} samples={table.rows.slice(0, 3)} suggested={suggestMapping(table.headers)}
          fields={TARGET_FIELDS.map((f) => ({ key: f.key, label: f.label, required: "required" in f ? f.required : false }))} source={batch.source} />
      </Panel>
    ) : <Alert tone="danger" title="The uploaded file could not be read">Cancel this import and upload the report again.</Alert>;
    return <>{header}{content}</>;
  }

  const tab = (OUTCOMES.some((o) => o.key === sp.tab) ? sp.tab : OUTCOMES.find((o) => (stats[o.key] ?? 0) > 0)?.key ?? "new") as OutcomeKey;
  const page = Math.max(1, Number(sp.page) || 1);
  const [{ data: rows, count }, { count: pending }] = await Promise.all([
    db.from("import_rows").select("id, row_no, data, errors, outcome, matched_person_id, candidate_person_ids, diff, decision, decision_person_id, applied_at", { count: "exact" })
      .eq("batch_id", id).eq("outcome", tab).order("row_no").range((page - 1) * PAGE, page * PAGE - 1),
    db.from("import_rows").select("id", { count: "exact", head: true }).eq("batch_id", id).eq("decision", "pending"),
  ]);
  const personIds = [...new Set((rows ?? []).flatMap((r) => [...r.candidate_person_ids, r.matched_person_id, r.decision_person_id].filter(Boolean) as string[]))];
  const { data: people } = personIds.length
    ? await db.from("v_member_overview").select("id, display_name, membership_number, lodge_number").in("id", personIds)
    : { data: [] };
  const who = new Map((people ?? []).map((p) => [p.id, `${p.display_name}${p.membership_number ? ` (${p.membership_number})` : ""}${p.lodge_number ? ` · No. ${p.lodge_number}` : ""}`]));

  const tabs = OUTCOMES.map((o) => ({ key: o.key, label: o.label, count: stats[o.key] ?? 0, href: `/imports/${id}?tab=${o.key}` }));
  const canApprove = can(session, "imports.approve");

  return (
    <>
      {header}

      <div className="mb-6 grid gap-6 xl:grid-cols-3">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:col-span-2">
          <Stat label="Rows in file" value={stats.rows ?? 0} />
          <Stat label="New members" value={stats.new ?? 0} />
          <Stat label="Updates" value={stats.update ?? 0} />
          <Stat label="Waiting for a decision" value={pending ?? 0} tone={pending ? "attention" : undefined} />
        </div>
        <Panel title={batch.status === "committed" ? "Committed" : "Approve and commit"}>
          {batch.status === "committed" ? (
            <DescriptionList columns={1} items={[
              { label: "Result", value: `${stats.created ?? 0} new · ${stats.updated ?? 0} updated · ${stats.degree_events ?? 0} degree dates · ${stats.new_initiates ?? 0} new Initiates · ${stats.review_tasks ?? 0} review tasks · ${stats.skipped ?? 0} skipped` },
              { label: "Approved", value: batch.approved_at ? `${formatDateTime(batch.approved_at)} by ${personName(batch.approver)}` : null },
            ]} />
          ) : batch.status !== "validated" ? (
            <p className="text-sm text-muted">This import is {label(batch.status).toLowerCase()}. Nothing further can be done with it.</p>
          ) : pending ? (
            <p className="text-sm text-slate-ink">{pending} {pending === 1 ? "row needs" : "rows need"} a decision before this import can be committed. Look for tabs with rows waiting.</p>
          ) : canApprove ? (
            <div className="space-y-3 text-sm">
              <p>Every row has a decision. Committing applies accepted rows: authoritative fields only, respecting local corrections.</p>
              <ActionButton action={commitImport} fields={{ batch_id: id }} variant="primary" size="md" confirm="Commit this import now? Accepted rows will update the Hub.">Approve and commit</ActionButton>
            </div>
          ) : <p className="text-sm text-slate-ink">Ready. Someone who can approve imports needs to commit it.</p>}
          <p className="mt-3 border-t border-line pt-3 text-[13px] text-muted">
            Uploaded {formatDateTime(batch.created_at)} by {personName(batch.uploader) || "unknown"}. <Link className="underline" href={`/admin/audit?entity=import_batch&id=${id}`}>Audit trail</Link>
          </p>
        </Panel>
      </div>

      <Tabs tabs={tabs} current={tab} />

      {tab === "possible_removal" && (
        <div className="mb-4">
          <Alert tone="info" title={batch.is_partial ? "This is a partial report" : "This is a full report"}>
            {batch.is_partial
              ? "Members of these Lodges who are not in a partial report are listed for information only. A missing member never means they have left, and nothing changes."
              : "Members of these Lodges who are not in the report may need checking. Accepting creates a task for the allocated Assistant to check with the Lodge. Membership status never changes automatically."}
          </Alert>
        </div>
      )}

      {editable && (rows ?? []).some((r) => r.decision === "pending") && tab !== "invalid" && (
        <div className="mb-3 flex flex-wrap items-center gap-3 text-sm">
          <span className="text-muted">All rows waiting in this tab:</span>
          <BulkDecision action={decideAllPending} batchId={id} outcome={tab}
            options={ALLOWED[tab].filter((d) => d !== "merge").map((d) => ({ decision: d, label: `${DECISION[d]} all waiting` }))} />
        </div>
      )}

      {!rows?.length ? (
        <EmptyState title={`No ${OUTCOMES.find((o) => o.key === tab)!.label.toLowerCase()} rows`}>Choose another tab to review the rest of the import.</EmptyState>
      ) : (
        <>
          <Table caption={`${OUTCOMES.find((o) => o.key === tab)!.label} rows`}>
            <THead><TH>Row</TH><TH>Member</TH><TH className="hidden md:table-cell">Details</TH><TH>Decision</TH></THead>
            <TBody>
              {rows.map((r) => {
                const d = r.data as RowData;
                const diff = r.diff as Record<string, { from: string | null; to: string | null }>;
                const errors = r.errors as string[];
                const candidates = r.candidate_person_ids.map((c) => ({ id: c, label: who.get(c) ?? "A record you cannot see" }));
                const details = (
                  <div className="space-y-1 text-[13px]">
                    {errors.map((e) => <p key={e} className="text-danger-700">{e}</p>)}
                    {d.notes?.map((n) => <p key={n} className="text-slate-ink">{n}</p>)}
                    {Object.entries(diff).map(([f, v]) => (
                      <p key={f}><span className="text-muted">{FIELD_LABEL[f] ?? label(f)}:</span> {v.from ?? <em className="text-muted">none</em>} <span aria-hidden>→</span><span className="sr-only">changes to</span> <strong>{v.to}</strong></p>
                    ))}
                    {r.matched_person_id && r.outcome !== "possible_removal" && <p className="text-muted">Matched: {who.get(r.matched_person_id) ?? "existing record"}</p>}
                    {candidates.length > 0 && <p className="text-muted">Possible matches: {candidates.map((c) => c.label).join("; ")}</p>}
                    {r.decision_person_id && <p className="text-muted">Merge into: {who.get(r.decision_person_id) ?? "chosen record"}</p>}
                  </div>
                );
                return (
                  <TR key={r.id}>
                    <TD className="tabular-nums text-muted">{r.outcome === "possible_removal" ? "–" : r.row_no}</TD>
                    <TD>
                      <div className="font-medium">{[d.title, d.first_name, d.last_name].filter(Boolean).join(" ") || <span className="text-muted">No name</span>}</div>
                      <div className="text-[13px] text-muted">{[d.membership_number, d.lodge_number ? `No. ${d.lodge_number}` : null].filter(Boolean).join(" · ")}</div>
                      <div className="mt-1 md:hidden">{details}</div>
                    </TD>
                    <TD className="hidden md:table-cell">{details}</TD>
                    <TD>
                      {r.decision === "pending" && <div className="mb-1"><Badge tone="warning">Waiting</Badge></div>}
                      {r.applied_at && <div className="mb-1"><Badge tone="success">Applied</Badge></div>}
                      <RowDecision action={decideRow} batchId={id} rowId={r.id} allowed={ALLOWED[r.outcome as OutcomeKey]} current={r.decision} candidates={candidates} editable={editable} />
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
          <Pagination page={page} pageSize={PAGE} total={count ?? 0} href={(p) => `/imports/${id}?tab=${tab}&page=${p}`} />
        </>
      )}
    </>
  );
}
