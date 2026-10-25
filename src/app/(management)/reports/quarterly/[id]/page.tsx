import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Chart } from "@/components/reports/chart";
import { Badge, statusTone } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { Alert, PageHeader, Panel } from "@/components/ui/layout";
import { formatDate, formatDateTime, label } from "@/lib/utils";
import { QUARTERLY_SECTIONS, suggestNarrative, type PeriodData } from "@/server/reports/analysis";
import { keyFigures, quarterlyCharts } from "@/server/reports/quarterly";
import { can, requirePermission } from "@/server/session";
import { supabaseServer } from "@/server/supabase";
import { NarrativeForm, RegenerateButton, TransitionButton } from "../quarterly-forms";

export const metadata: Metadata = { title: "Quarterly report" };

export default async function QuarterlyReportPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requirePermission("reports.quarterly");
  const { id } = await params;
  const db = await supabaseServer();
  const { data: report } = await db.from("quarterly_reports").select("*").eq("id", id).maybeSingle();
  if (!report) notFound();
  const { data: snap } = report.snapshot_id ? await db.from("report_snapshots").select("data, created_at, period_start, period_end").eq("id", report.snapshot_id).maybeSingle() : { data: null };
  const data = (snap?.data ?? {}) as PeriodData;
  const periodLabel = `Quarter ${report.quarter} ${report.year}`;
  const suggestions = suggestNarrative(data, periodLabel);
  const narrative = (report.narrative ?? {}) as Record<string, string>;
  const values: Record<string, string> = { ...narrative, observations: report.observations ?? "" };
  const editable = ["draft", "review"].includes(report.status);
  const canApprove = can(session, "reports.quarterly.approve");
  const figures = keyFigures(data);
  const sections = [...new Set(figures.map((f) => f.section))];

  return (
    <>
      <PageHeader
        breadcrumbs={[{ href: "/reports", label: "Reports" }, { href: "/reports/quarterly", label: "Quarterly report" }]}
        title={`Quarterly report: ${periodLabel}`}
        description={snap ? `${formatDate(snap.period_start)} to ${formatDate(snap.period_end)}. Figures taken ${formatDateTime(snap.created_at)}.` : undefined}
        meta={<Badge tone={statusTone(report.status)}>{label(report.status)}</Badge>}
        actions={
          <>
            <a href={`/api/reports/quarterly/${id}/pdf`} className={buttonClass("secondary")}>Download PDF</a>
            {editable && <RegenerateButton id={id} year={report.year} quarter={report.quarter} />}
            {report.status === "draft" && <TransitionButton id={id} to="review" variant="primary">Submit for review</TransitionButton>}
            {report.status === "review" && <TransitionButton id={id} to="draft">Return to draft</TransitionButton>}
            {report.status === "review" && canApprove && <TransitionButton id={id} to="approved" variant="primary" confirm="Approve this report? The figures and narrative will then be fixed.">Approve</TransitionButton>}
            {report.status === "approved" && canApprove && <TransitionButton id={id} to="published" variant="teal">Publish</TransitionButton>}
          </>
        }
      />
      {report.status === "review" && !canApprove && <div className="mb-4"><Alert>This report is awaiting approval by Provincial leadership. You can still refine the narrative.</Alert></div>}
      {!editable && <div className="mb-4"><Alert tone="success">This report was approved{report.approved_at ? ` on ${formatDate(report.approved_at)}` : ""} and is fixed. It will not change after later reallocations or imports.</Alert></div>}
      <div className="mb-4"><Alert title="About these figures">Figures are a snapshot of the records when the report was generated. Membership figures depend on the imports received and may be partial. This environment holds synthetic data.</Alert></div>

      <div className="grid gap-6 xl:grid-cols-5">
        <div className="space-y-6 xl:col-span-3">
          <Panel title="Narrative" description={editable ? "Edit each section. Approval fixes the text." : undefined}>
            {editable ? (
              <NarrativeForm id={id} sections={[...QUARTERLY_SECTIONS]} values={values} suggestions={suggestions} />
            ) : (
              <div className="space-y-5">
                {QUARTERLY_SECTIONS.map((s) => (
                  <section key={s.key}>
                    <h3 className="text-[15px] font-semibold text-navy-900">{s.label}</h3>
                    <p className="mt-1 whitespace-pre-line text-sm text-slate-ink">{values[s.key] || <span className="text-muted">Nothing recorded.</span>}</p>
                  </section>
                ))}
              </div>
            )}
          </Panel>
          <div className="grid gap-4 lg:grid-cols-2">
            {quarterlyCharts(data).map((c) => <Chart key={c.title} spec={c} filename={`${periodLabel} - ${c.title}`} />)}
          </div>
        </div>
        <div className="space-y-6 xl:col-span-2">
          {sections.map((s) => (
            <Panel key={s} title={s} padded={false}>
              <table className="w-full text-sm">
                <caption className="sr-only">{s}: this quarter and previous quarter</caption>
                <thead className="border-b border-line text-[13px] text-muted"><tr><th scope="col" className="px-5 py-2 text-left font-medium">Measure</th><th scope="col" className="px-3 py-2 text-right font-medium">This quarter</th><th scope="col" className="px-5 py-2 text-right font-medium">Previous</th></tr></thead>
                <tbody className="divide-y divide-line">
                  {figures.filter((f) => f.section === s).map((f) => (
                    <tr key={f.label}><td className="px-5 py-2">{f.label}</td><td className="px-3 py-2 text-right font-semibold tabular-nums">{f.value}</td><td className="px-5 py-2 text-right tabular-nums text-muted">{f.previous ?? "-"}</td></tr>
                  ))}
                </tbody>
              </table>
            </Panel>
          ))}
        </div>
      </div>
    </>
  );
}
