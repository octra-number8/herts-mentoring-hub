import type { Metadata } from "next";
import { Badge, statusTone } from "@/components/ui/badge";
import { EmptyState, PageHeader } from "@/components/ui/layout";
import { RowLink, TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { formatDate, label, todayIso } from "@/lib/utils";
import { previousQuarter } from "@/server/reports/analysis";
import { requirePermission } from "@/server/session";
import { supabaseServer } from "@/server/supabase";
import { GenerateQuarterlyForm } from "./quarterly-forms";

export const metadata: Metadata = { title: "Quarterly report" };

export default async function QuarterlyListPage() {
  await requirePermission("reports.quarterly");
  const db = await supabaseServer();
  const { data: reports } = await db.from("quarterly_reports").select("id, year, quarter, status, generated_at, approved_at, published_at").order("year", { ascending: false }).order("quarter", { ascending: false });
  const prev = previousQuarter(todayIso());
  const thisYear = Number(todayIso().slice(0, 4));

  return (
    <>
      <PageHeader
        breadcrumbs={[{ href: "/reports", label: "Reports" }]}
        title="Quarterly report"
        description="Each report is built from a snapshot of the figures taken when it is generated, so a past quarter never changes after later reallocations or imports."
        actions={<GenerateQuarterlyForm defaultYear={prev.year} defaultQuarter={prev.quarter} years={[thisYear, thisYear - 1, thisYear - 2]} />}
      />
      {reports?.length ? (
        <Table caption="Quarterly reports">
          <THead><TH>Quarter</TH><TH>Status</TH><TH className="hidden md:table-cell">Figures taken</TH><TH className="hidden md:table-cell">Approved</TH><TH className="hidden md:table-cell">Published</TH></THead>
          <TBody>
            {reports.map((r) => (
              <TR key={r.id}>
                <TD><RowLink href={`/reports/quarterly/${r.id}`}>{r.year} Quarter {r.quarter}</RowLink></TD>
                <TD><Badge tone={statusTone(r.status)}>{label(r.status)}</Badge></TD>
                <TD className="hidden md:table-cell">{formatDate(r.generated_at)}</TD>
                <TD className="hidden md:table-cell">{formatDate(r.approved_at)}</TD>
                <TD className="hidden md:table-cell">{formatDate(r.published_at)}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      ) : (
        <EmptyState title="No quarterly reports yet">Generate the report for the most recent quarter to begin. You can edit the narrative before submitting it for review.</EmptyState>
      )}
    </>
  );
}
