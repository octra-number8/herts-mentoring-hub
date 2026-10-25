import type { Metadata } from "next";
import { Badge, statusTone } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { ActionButton } from "@/components/ui/dialog-form";
import { Alert, EmptyState, PageHeader, Panel } from "@/components/ui/layout";
import { RowLink, TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { formatDateTime, label } from "@/lib/utils";
import { requirePermission } from "@/server/session";
import { supabaseServer } from "@/server/supabase";
import { deleteTemplate } from "./actions";

export const metadata: Metadata = { title: "Membership imports" };

const SOURCE: Record<string, string> = { hermes: "Hermes", adelphi: "Adelphi", portal: "UGLE Portal", other: "Other" };
type Stats = Partial<Record<"rows" | "new" | "update" | "conflict" | "duplicate" | "invalid" | "possible_removal" | "created" | "updated" | "new_initiates" | "review_tasks", number>>;
const personName = (x: unknown) => (x as { persons: { display_name: string } } | null)?.persons?.display_name ?? "";

export default async function ImportsPage() {
  await requirePermission("imports.run");
  const db = await supabaseServer();
  const [{ data: batches }, { data: templates }] = await Promise.all([
    db.from("import_batches").select("id, file_name, source, status, is_partial, stats, created_at, approved_at, uploader:user_accounts!import_batches_uploaded_by_fkey(persons(display_name)), approver:user_accounts!import_batches_approved_by_fkey(persons(display_name))")
      .order("created_at", { ascending: false }).limit(100),
    db.from("import_templates").select("id, name, source, mapping, created_at").order("name"),
  ]);

  return (
    <>
      <PageHeader title="Membership imports"
        description="Hermes, Adelphi and the UGLE Portal stay authoritative for membership. Reports are checked, reviewed and approved before anything changes in the Hub."
        actions={<LinkButton href="/imports/new" variant="primary">New import</LinkButton>} />

      <div className="mb-6">
        <Alert tone="info">Imports update names, contact details, Lodge links and degree dates only. Mentoring notes, support, tasks, learning and contact history are never touched, and a member missing from a report is never treated as having left.</Alert>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <h2 className="mb-3 text-[15px] font-semibold text-navy-900">Import history</h2>
          {batches?.length ? (
            <Table caption="Import history">
              <THead><TH>File</TH><TH>Status</TH><TH className="hidden md:table-cell">Rows</TH><TH className="hidden lg:table-cell">Uploaded</TH><TH className="hidden lg:table-cell">Approved</TH></THead>
              <TBody>
                {batches.map((b) => {
                  const s = (b.stats ?? {}) as Stats;
                  return (
                    <TR key={b.id}>
                      <TD>
                        <RowLink href={`/imports/${b.id}`}>{b.file_name}</RowLink>
                        <div className="text-[13px] text-muted">{SOURCE[b.source] ?? label(b.source)} · {b.is_partial ? "Partial report" : "Full report"}</div>
                      </TD>
                      <TD><Badge tone={statusTone(b.status)}>{b.status === "uploaded" ? "Needs mapping" : label(b.status)}</Badge></TD>
                      <TD className="hidden text-[13px] md:table-cell">
                        {s.rows !== undefined ? <>{s.rows} rows{b.status === "committed" ? ` · ${s.created ?? 0} new · ${s.updated ?? 0} updated` : ` · ${s.new ?? 0} new · ${s.update ?? 0} updates`}</> : <span className="text-muted">Not checked yet</span>}
                      </TD>
                      <TD className="hidden text-[13px] lg:table-cell">{formatDateTime(b.created_at)}<div className="text-muted">{personName(b.uploader)}</div></TD>
                      <TD className="hidden text-[13px] lg:table-cell">{b.approved_at ? <>{formatDateTime(b.approved_at)}<div className="text-muted">{personName(b.approver)}</div></> : <span className="text-muted">Not yet</span>}</TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          ) : <EmptyState title="No imports yet" action={<LinkButton href="/imports/new" size="sm">Upload a report</LinkButton>}>Upload a Hermes, Adelphi or UGLE Portal report to bring membership up to date.</EmptyState>}
        </div>

        <Panel title="Saved report formats" description="Column mappings reused when a report with the same columns is uploaded.">
          {templates?.length ? (
            <ul className="divide-y divide-line">
              {templates.map((t) => (
                <li key={t.id} className="flex items-start justify-between gap-3 py-2.5 first:pt-0 text-sm">
                  <div>
                    <div className="font-medium">{t.name}</div>
                    <div className="text-[13px] text-muted">{SOURCE[t.source] ?? t.source} · {Object.keys(t.mapping as object).length} columns mapped</div>
                  </div>
                  <ActionButton action={deleteTemplate} fields={{ template_id: t.id }} variant="subtle" confirm={`Remove the template "${t.name}"?`}>Remove</ActionButton>
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-muted">No saved formats yet. You can save one when you map a report&apos;s columns.</p>}
        </Panel>
      </div>
    </>
  );
}
