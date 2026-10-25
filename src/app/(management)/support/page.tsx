import type { Metadata } from "next";
import Link from "next/link";
import { Badge, statusTone } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { FilterBar, FilterSearch, FilterSelect } from "@/components/ui/filters";
import { EmptyState, PageHeader, Tabs } from "@/components/ui/layout";
import { RowLink, TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { ExportMenu } from "@/components/members/export-menu";
import { formatDate, label } from "@/lib/utils";
import { can, canAny, requirePermission } from "@/server/session";
import { CASE_STATUSES, querySupport, type SupportFilters } from "@/server/support/query";
import { supabaseServer } from "@/server/supabase";

export const metadata: Metadata = { title: "Support" };

export default async function SupportPage({ searchParams }: { searchParams: Promise<SupportFilters> }) {
  const session = await requirePermission("cases.read.all", "cases.read.allocated", "cases.confidential.triage", "cases.confidential.submit");
  const sp = await searchParams;
  const db = await supabaseServer();
  const canRead = canAny(session, ["cases.read.all", "cases.read.allocated"]);
  const canCreate = canAny(session, ["cases.write.all", "cases.write.allocated"]);
  const canTriage = can(session, "cases.confidential.triage");

  const views = [
    ...(canRead || canTriage ? [{ key: "assigned", label: "Assigned to me" }] : []),
    ...(canRead ? [{ key: "all", label: "All I can see" }] : []),
    { key: "raised", label: "Raised by me" },
    ...(canTriage ? [{ key: "triage", label: "Confidential triage" }] : []),
  ];
  const view = views.some((v) => v.key === sp.view) ? sp.view! : views[0].key;
  const filters = { ...sp, view };

  const [rows, { data: cats }, { data: lodges }] = await Promise.all([
    querySupport(db, filters, { accountId: session.accountId }),
    db.from("support_categories").select("key, label").eq("active", true).order("position"),
    db.from("lodges").select("id, name, number").order("number"),
  ]);
  const keep = (extra: Record<string, string>) => new URLSearchParams(Object.fromEntries(Object.entries({ ...sp, ...extra }).filter(([, v]) => v)) as Record<string, string>).toString();
  const exportQuery = new URLSearchParams(Object.fromEntries(Object.entries(sp).filter(([k, v]) => v && k !== "view")) as Record<string, string>).toString();
  const showConfidentialNote = view === "triage";

  return (
    <>
      <PageHeader
        title="Support"
        description="How can we help? Requests from Lodges and Brethren, routed to the allocated Assistant."
        actions={
          <>
            {can(session, "cases.confidential.submit") && <LinkButton href="/support/confidential/new">Raise a confidential concern</LinkButton>}
            {canCreate && <LinkButton href="/support/new" variant="primary">New request</LinkButton>}
            {canRead && can(session, "reports.export") && <ExportMenu dataset="support" query={exportQuery} />}
          </>
        }
      />
      <Tabs tabs={views.map((v) => ({ ...v, href: `/support?view=${v.key}` }))} current={view} />

      <FilterBar resetHref={`/support?view=${view}`}>
        <input type="hidden" name="view" value={view} />
        <FilterSearch defaultValue={sp.q} placeholder="Reference or summary" />
        <FilterSelect name="status" label="Status" defaultValue={sp.status} placeholder="Open" options={[...CASE_STATUSES.map((s) => ({ value: s, label: label(s) })), { value: "any", label: "Any status" }]} />
        {view !== "triage" && <FilterSelect name="category" label="Category" defaultValue={sp.category} options={(cats ?? []).filter((c) => c.key !== "confidential").map((c) => ({ value: c.key, label: c.label }))} />}
        {view !== "triage" && <FilterSelect name="lodge" label="Lodge" defaultValue={sp.lodge} options={(lodges ?? []).map((l) => ({ value: l.id, label: `${l.number} ${l.name}` }))} />}
        <FilterSelect name="overdue" label="Due" defaultValue={sp.overdue} placeholder="Any" options={[{ value: "1", label: "Overdue only" }]} />
      </FilterBar>

      {showConfidentialNote && (
        <p className="mb-3 text-sm text-muted">Confidential concerns are visible only to designated leadership and to anyone they assign. Opening one is recorded.</p>
      )}

      {rows.length === 0 ? (
        <EmptyState title={view === "assigned" ? "Nothing assigned to you" : view === "raised" ? "You have not raised anything that is still open" : "No requests match these filters"}>
          {sp.status || sp.category || sp.lodge || sp.overdue || sp.q ? <Link href={`/support?view=${view}`} className="underline">Clear the filters</Link> : "Closed requests are hidden unless you choose a status."}
        </EmptyState>
      ) : (
        <Table caption="Support requests">
          <THead>
            <TH>Reference</TH><TH>Request</TH><TH className="hidden md:table-cell">Lodge</TH><TH className="hidden lg:table-cell">Owner</TH>
            <TH>Status</TH><TH className="hidden sm:table-cell">Due</TH>
          </THead>
          <TBody>
            {rows.map((c) => (
              <TR key={c.id}>
                <TD className="whitespace-nowrap tabular-nums">{c.reference}</TD>
                <TD>
                  <RowLink href={`/support/${c.id}`}>{c.title}</RowLink>
                  <div className="text-[13px] text-muted">
                    {c.kind === "confidential" ? "Confidential concern" : c.category_label}
                    {c.priority === "high" && " · High priority"}
                  </div>
                </TD>
                <TD className="hidden md:table-cell">{c.lodge_label ?? <span className="text-muted">{c.kind === "confidential" ? "Not shown" : "None"}</span>}</TD>
                <TD className="hidden lg:table-cell">{c.owner_name ?? <span className="text-muted">{c.kind === "confidential" && c.status === "triage" ? "Awaiting triage" : "Unassigned"}</span>}</TD>
                <TD><Badge tone={statusTone(c.status)}>{label(c.status)}</Badge></TD>
                <TD className="hidden whitespace-nowrap sm:table-cell">
                  {c.overdue ? <span className="font-medium text-warning-800">Overdue · {formatDate(c.due_on)}</span> : formatDate(c.due_on)}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
      {rows.length > 0 && <p className="mt-3 text-sm text-muted">{rows.length} {rows.length === 1 ? "request" : "requests"}{!sp.status && <> still open. <Link className="underline" href={`/support?${keep({ status: "any" })}`}>Include closed</Link></>}</p>}
    </>
  );
}
