import type { Metadata } from "next";
import Link from "next/link";
import { Chart, type ChartSpec } from "@/components/reports/chart";
import { DatasetFilterFields } from "@/components/reports/dataset-filters";
import { ExportMenu, ReportTable } from "@/components/reports/report-table";
import { buttonClass } from "@/components/ui/button";
import { Alert, EmptyState, PageHeader, Panel } from "@/components/ui/layout";
import { label } from "@/lib/utils";
import { aggregate, type Aggregation } from "@/server/reports/analysis";
import { allDatasets, getDataset } from "@/server/reports/datasets";
import "@/server/reports/register";
import "@/server/reports/datasets-reports";
import { filterOptions } from "@/server/reports/options";
import { MEMBERSHIP_LIMITATIONS } from "@/server/reports/standard";
import { canAny, requirePermission } from "@/server/session";
import { supabaseServer } from "@/server/supabase";
import type { ReportConfig } from "../actions";
import { DeleteSavedReport, EditSavedReport, SaveReportForm } from "./builder-forms";

export const metadata: Metadata = { title: "Report builder" };

type SP = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const all = (v: string | string[] | undefined) => (Array.isArray(v) ? v : v ? [v] : []);
const control = "block w-full rounded-md border border-line bg-white px-3 py-2 text-[15px] focus:border-navy-600 focus:outline-none focus:ring-2 focus:ring-navy-100";

export default async function BuilderPage({ searchParams }: { searchParams: Promise<SP> }) {
  const session = await requirePermission("reports.read");
  const sp = await searchParams;
  const db = await supabaseServer();
  const datasets = allDatasets().filter((d) => canAny(session, d.permission)).sort((a, b) => a.label.localeCompare(b.label));

  // A saved report supplies the settings unless the form has been resubmitted.
  const savedId = first(sp.saved);
  const { data: saved } = savedId ? await db.from("saved_reports").select("*").eq("id", savedId).maybeSingle() : { data: null };
  let cfg: ReportConfig | null = null;
  if (first(sp.dataset)) {
    const filters: Record<string, string> = {};
    for (const [k, v] of Object.entries(sp)) if (k.startsWith("f_") && first(v)) filters[k.slice(2)] = first(v);
    cfg = { dataset: first(sp.dataset), columns: all(sp.col), filters, group: first(sp.group) || undefined, agg: (first(sp.agg) || "count") as Aggregation, measure: first(sp.measure) || undefined, chart: (first(sp.chart) || "bar") as ReportConfig["chart"] };
  } else if (saved) {
    cfg = saved.config as ReportConfig;
  }
  const ds = cfg ? getDataset(cfg.dataset) : undefined;
  const allowed = ds && canAny(session, ds.permission);
  const isOwner = saved?.owner_account_id === session.accountId;

  let content: React.ReactNode = null;
  if (cfg && ds && allowed) {
    const opts = await filterOptions(db);
    const columns = cfg.columns.length ? ds.columns.filter((c) => cfg.columns.includes(c.key)) : ds.columns;
    const rows = await ds.query(db, { ...cfg.filters, person: session.personId });
    const numeric = ds.columns.filter((c) => c.type === "number");
    const groupCol = cfg.group ? ds.columns.find((c) => c.key === cfg.group) : undefined;
    const measureCol = cfg.measure ? numeric.find((c) => c.key === cfg.measure) : undefined;
    const agg = (cfg.agg ?? "count") as Aggregation;
    const grouped = groupCol ? aggregate(rows, groupCol.key, agg, measureCol?.key) : null;
    const valueLabel = agg === "count" || !measureCol ? "Records" : `${agg === "sum" ? "Total" : "Average"} ${measureCol.label.toLowerCase()}`;
    const chart: ChartSpec | null = grouped && cfg.chart !== "none" ? {
      title: `${valueLabel} by ${groupCol!.label.toLowerCase()}`, type: cfg.chart === "hbar" ? "hbar" : cfg.chart === "line" ? "line" : "bar", x: "group",
      summary: `${grouped.length} groups from ${rows.length} records. ` + grouped.slice(0, 6).map((g) => `${g.group}: ${g.value}`).join(", ") + (grouped.length > 6 ? ", and more." : "."),
      data: grouped.map((g) => ({ group: g.group, value: g.value })), series: [{ key: "value", label: valueLabel }],
    } : null;
    const query = new URLSearchParams({ ...cfg.filters, ...(cfg.columns.length ? { columns: cfg.columns.join(",") } : {}) }).toString();
    const configJson = JSON.stringify(cfg);
    const membership = ds.permission.includes("reports.membership");

    content = (
      <>
        <form method="get" className="mb-6 space-y-4 rounded-lg border border-line bg-surface p-5 no-print" aria-label="Report settings">
          <input type="hidden" name="dataset" value={ds.key} />
          {savedId && <input type="hidden" name="saved" value={savedId} />}
          <fieldset>
            <legend className="mb-2 text-sm font-medium">Columns <span className="font-normal text-muted">(none ticked shows all)</span></legend>
            <div className="grid gap-x-4 gap-y-1.5 sm:grid-cols-2 lg:grid-cols-4">
              {ds.columns.map((c) => (
                <label key={c.key} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="col" value={c.key} defaultChecked={cfg.columns.includes(c.key)} className="h-4 w-4 accent-navy-800" /> {c.label}
                </label>
              ))}
            </div>
          </fieldset>
          {ds.filters?.length ? (
            <fieldset>
              <legend className="mb-2 text-sm font-medium">Filters</legend>
              <div className="flex flex-wrap items-end gap-3">
                <DatasetFilterFields dataset={ds} values={Object.fromEntries(Object.entries(cfg.filters).map(([k, v]) => [`f_${k}`, v]))} areas={opts.areas} lodges={opts.lodges} prefix="f_" />
              </div>
            </fieldset>
          ) : null}
          <fieldset>
            <legend className="mb-2 text-sm font-medium">Grouping and chart</legend>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <label className="text-sm font-medium">Group by
                <select name="group" defaultValue={cfg.group ?? ""} className={control}>
                  <option value="">No grouping (list records)</option>
                  {ds.columns.filter((c) => c.type !== "number").map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
                </select>
              </label>
              <label className="text-sm font-medium">Aggregation
                <select name="agg" defaultValue={cfg.agg ?? "count"} className={control}>
                  <option value="count">Count of records</option>
                  <option value="sum">Sum</option>
                  <option value="avg">Average</option>
                </select>
              </label>
              <label className="text-sm font-medium">Of (for sum or average)
                <select name="measure" defaultValue={cfg.measure ?? ""} className={control}>
                  <option value="">Not applicable</option>
                  {numeric.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
                </select>
              </label>
              <label className="text-sm font-medium">Chart
                <select name="chart" defaultValue={cfg.chart ?? "bar"} className={control}>
                  <option value="bar">Column chart</option>
                  <option value="hbar">Bar chart</option>
                  <option value="line">Line chart (for periods)</option>
                  <option value="none">No chart</option>
                </select>
              </label>
            </div>
          </fieldset>
          <div className="flex flex-wrap items-center gap-3">
            <button type="submit" className={buttonClass("primary")}>Run report</button>
            <Link href="/reports/builder" className="text-sm text-muted underline-offset-2 hover:underline">Start again</Link>
          </div>
        </form>

        {membership && <div className="mb-4"><Alert title="Context and data limitations"><ul className="list-disc pl-5">{MEMBERSHIP_LIMITATIONS.map((l) => <li key={l}>{l}</li>)}</ul></Alert></div>}
        {cfg.agg !== "count" && !measureCol && groupCol && <div className="mb-4"><Alert tone="warning">Choose a numeric column for the sum or average. Showing a count of records instead.</Alert></div>}

        <div className="mb-3 flex flex-wrap items-center gap-2">
          {canAny(session, ds.exportPermission) && <ExportMenu dataset={ds.key} query={query} />}
          {!saved || !isOwner ? <SaveReportForm config={configJson} canSchedule={canAny(session, ds.exportPermission)} /> : (
            <>
              <EditSavedReport id={saved.id} name={saved.name} shared={saved.shared} schedule={saved.schedule} config={configJson} canSchedule={canAny(session, ds.exportPermission)} />
              <DeleteSavedReport id={saved.id} name={saved.name} />
            </>
          )}
        </div>
        {chart && <div className="mb-6"><Chart spec={chart} filename={saved?.name ?? `${ds.label} report`} /></div>}
        {grouped ? (
          <ReportTable caption={`${ds.label} grouped`} columns={[{ key: "group", label: groupCol!.label }, { key: "value", label: valueLabel, type: "number" }]} rows={grouped} />
        ) : (
          <ReportTable caption={ds.label} columns={columns} rows={rows} />
        )}
        {grouped && <p className="mt-2 text-sm text-muted">Exports contain the underlying records with the columns you chose.</p>}
      </>
    );
  }

  return (
    <>
      <PageHeader
        breadcrumbs={[{ href: "/reports", label: "Reports" }]}
        title={saved ? saved.name : "Report builder"}
        description={ds ? ds.description : "Choose a dataset, the columns and filters you need, and how to group and chart the results."}
        meta={saved && !isOwner ? <span className="text-sm text-muted">Shared with you. Save a copy to change it.</span> : saved?.schedule && saved.schedule !== "none" ? <span className="text-sm text-muted">Emailed to you {label(saved.schedule).toLowerCase()} as an Excel file.</span> : undefined}
      />
      <Panel title="Dataset" className="mb-6">
        {datasets.length === 0 ? <EmptyState title="No datasets available to your role" /> : (
          <form method="get" className="flex flex-wrap items-end gap-3">
            <label className="min-w-[16rem] flex-1 text-sm font-medium">Dataset
              <select name="dataset" defaultValue={ds?.key ?? ""} className={control} required>
                <option value="" disabled>Choose a dataset</option>
                {datasets.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}
              </select>
            </label>
            <button type="submit" className={buttonClass("secondary")}>{ds ? "Change dataset" : "Continue"}</button>
          </form>
        )}
        {cfg && !allowed && <div className="mt-3"><Alert tone="warning">That dataset is not available to your role.</Alert></div>}
      </Panel>
      {content}
    </>
  );
}
