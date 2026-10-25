import type { Metadata } from "next";
import { FilterBar, FilterDate, FilterSearch, FilterSelect } from "@/components/ui/filters";
import { EmptyState, PageHeader } from "@/components/ui/layout";
import { Pagination, TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { formatDateTime, label } from "@/lib/utils";
import { accountNames, auditQuery, describeDetails, type AuditFilters } from "@/server/admin/audit";
import { requirePermission } from "@/server/session";
import { supabaseServer } from "@/server/supabase";

export const metadata: Metadata = { title: "Audit log" };

const PAGE = 50;
const ENTITIES = ["user_account", "invitation", "role_assignments", "permission_grants", "feature", "feature_activations", "feature_settings", "role", "persons", "lodges", "lodge_allocations",
  "lodge_appointments", "import_batch", "import_batches", "workflows", "workflow_run", "retention_policies", "integration_failure", "dataset", "person", "case", "email_outbox"];

export default async function AuditPage({ searchParams }: { searchParams: Promise<AuditFilters & { page?: string }> }) {
  await requirePermission("admin.audit");
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const db = await supabaseServer();
  const filters: AuditFilters = { action: sp.action, entity: sp.entity, id: sp.id, actor: sp.actor, from: sp.from, to: sp.to };
  const [{ data: rows, count }, names] = await Promise.all([
    auditQuery(db, filters, { count: true }).range((page - 1) * PAGE, page * PAGE - 1),
    accountNames(db),
  ]);
  const qs = new URLSearchParams(Object.entries(filters).filter(([, v]) => v) as [string, string][]);
  const href = (p: number) => `/admin/audit?${new URLSearchParams([...qs, ["page", String(p)]])}`;

  return (
    <>
      <PageHeader breadcrumbs={[{ href: "/admin", label: "Administration" }]} title="Audit log"
        description="An append-only record of significant actions. Entries record what changed, never the content of restricted notes or concerns."
        actions={<a href={`/admin/audit/export?${qs}`} className="inline-flex h-10 items-center rounded-md border border-line bg-white px-4 font-medium text-navy-800 hover:border-navy-600">Export CSV</a>} />
      <FilterBar resetHref="/admin/audit">
        <FilterSearch name="action" label="Action" defaultValue={sp.action} placeholder="e.g. account, import, export" />
        <FilterSelect name="entity" label="Record type" defaultValue={sp.entity} options={[...new Set([...(sp.entity ? [sp.entity] : []), ...ENTITIES])].map((e) => ({ value: e, label: label(e) }))} />
        <FilterSelect name="actor" label="Who" defaultValue={sp.actor} options={[...names].sort((a, b) => a[1].localeCompare(b[1])).map(([v, l]) => ({ value: v, label: l }))} />
        <FilterDate name="from" label="From" defaultValue={sp.from} />
        <FilterDate name="to" label="To" defaultValue={sp.to} />
        {sp.id && <input type="hidden" name="id" value={sp.id} />}
      </FilterBar>
      {sp.id && <p className="mb-3 text-sm text-muted">Showing one record: {sp.id}</p>}
      {rows?.length ? (
        <>
          <Table caption="Audit entries">
            <THead><TH>When</TH><TH>Who</TH><TH>Action</TH><TH className="hidden md:table-cell">Record</TH><TH className="hidden lg:table-cell">Details</TH></THead>
            <TBody>
              {rows.map((r) => (
                <TR key={r.id}>
                  <TD className="whitespace-nowrap text-[13px]">{formatDateTime(r.occurred_at)}</TD>
                  <TD className="text-[13px]">{r.actor_account_id ? names.get(r.actor_account_id) ?? "Unknown account" : "System"}</TD>
                  <TD className="text-[13px] font-medium">{r.action}<div className="font-normal text-muted md:hidden">{label(r.entity_type)}</div></TD>
                  <TD className="hidden text-[13px] md:table-cell">{label(r.entity_type)}<div className="max-w-[12rem] truncate text-muted" title={r.entity_id ?? ""}>{r.entity_id}</div></TD>
                  <TD className="hidden max-w-md text-[13px] text-slate-ink lg:table-cell"><span className="line-clamp-3 break-words">{describeDetails(r.details)}</span></TD>
                </TR>
              ))}
            </TBody>
          </Table>
          <Pagination page={page} pageSize={PAGE} total={count ?? 0} href={href} />
        </>
      ) : <EmptyState title="No audit entries match these filters" />}
    </>
  );
}
