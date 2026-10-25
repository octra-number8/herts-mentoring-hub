import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Chart } from "@/components/reports/chart";
import { DatasetFilterFields } from "@/components/reports/dataset-filters";
import { ExportMenu, ReportTable } from "@/components/reports/report-table";
import { FilterBar } from "@/components/ui/filters";
import { Alert, PageHeader } from "@/components/ui/layout";
import { getDataset } from "@/server/reports/datasets";
import "@/server/reports/register";
import "@/server/reports/datasets-reports";
import { filterOptions, plainParams } from "@/server/reports/options";
import { standardReport } from "@/server/reports/standard";
import { canAny, requirePermission } from "@/server/session";
import { supabaseServer } from "@/server/supabase";

export const metadata: Metadata = { title: "Report" };

export default async function StandardReportPage({ params, searchParams }: { params: Promise<{ key: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await requirePermission("reports.read");
  const { key } = await params;
  const report = standardReport(key);
  const ds = getDataset(key);
  if (!report || !ds || !canAny(session, report.permission) || !canAny(session, ds.permission)) notFound();
  const sp = plainParams(await searchParams);
  const db = await supabaseServer();
  const [rows, opts] = await Promise.all([ds.query(db, { ...sp, person: session.personId }), filterOptions(db)]);
  const charts = report.charts(rows, sp);
  const query = new URLSearchParams(sp).toString();

  return (
    <>
      <PageHeader
        breadcrumbs={[{ href: "/reports", label: "Reports" }]}
        title={report.title}
        description={ds.description}
        actions={canAny(session, ds.exportPermission) ? <ExportMenu dataset={ds.key} query={query} /> : undefined}
      />
      {report.limitations && (
        <div className="mb-4">
          <Alert title="Context and data limitations">
            <ul className="list-disc space-y-0.5 pl-5">{report.limitations.map((l) => <li key={l}>{l}</li>)}</ul>
          </Alert>
        </div>
      )}
      <FilterBar resetHref={`/reports/${key}`}>
        <DatasetFilterFields dataset={ds} values={sp} areas={opts.areas} lodges={opts.lodges} />
      </FilterBar>
      {!sp.from && ds.filters?.some((f) => f.key === "from") && <p className="mb-3 text-sm text-muted">Showing the default period. Choose dates above to change it.</p>}
      <div className="mb-6 grid gap-4 xl:grid-cols-2">
        {charts.map((c) => <Chart key={c.title} spec={c} filename={`${report.title} - ${c.title}`} />)}
      </div>
      <ReportTable columns={ds.columns} rows={rows} caption={report.title} />
    </>
  );
}
