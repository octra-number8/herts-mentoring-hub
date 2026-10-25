import { NextResponse, type NextRequest } from "next/server";
import { fileResponse } from "@/server/export/format";
import { suggestNarrative, type PeriodData } from "@/server/reports/analysis";
import { quarterlyPdf } from "@/server/reports/quarterly-pdf";
import { can, getSession } from "@/server/session";
import { supabaseServer } from "@/server/supabase";

/** Branded PDF of a quarterly report. Read through the user's client: RLS requires reports.quarterly. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  if (!session || (session.mfaRequired && session.aal !== "aal2")) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  if (!can(session, "reports.quarterly")) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const db = await supabaseServer();
  const { data: report } = await db.from("quarterly_reports").select("*").eq("id", id).maybeSingle();
  if (!report) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { data: snap } = report.snapshot_id ? await db.from("report_snapshots").select("data").eq("id", report.snapshot_id).maybeSingle() : { data: null };
  const data = (snap?.data ?? {}) as PeriodData;
  const saved: Record<string, string> = { ...((report.narrative ?? {}) as Record<string, string>), observations: report.observations ?? "" };
  // A draft with no narrative yet prints the suggested sentences; approved reports print exactly what was approved.
  const suggested = ["draft", "review"].includes(report.status) ? suggestNarrative(data, `Quarter ${report.quarter} ${report.year}`) : {};
  const narrative = Object.fromEntries([...new Set([...Object.keys(saved), ...Object.keys(suggested)])].map((k) => [k, saved[k] || (suggested as Record<string, string>)[k] || ""]));
  const bytes = await quarterlyPdf({
    orgName: session.org.name, year: report.year, quarter: report.quarter, status: report.status,
    data, narrative, generatedAt: report.generated_at, approvedAt: report.approved_at,
  });
  await db.rpc("log_export", { p_dataset: "quarterly_report", p_format: "pdf", p_rows: 1, p_filters: { id } });
  return fileResponse(new Uint8Array(bytes), `Quarterly report Q${report.quarter} ${report.year}.pdf`, "application/pdf");
}
