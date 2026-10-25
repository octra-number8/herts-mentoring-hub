import { NextResponse, type NextRequest } from "next/server";
import { canAny, getSession } from "@/server/session";
import { supabaseServer } from "@/server/supabase";
import { fileResponse, toCsv, toPdfTable, toXlsx } from "@/server/export/format";
import { getDataset } from "@/server/reports/datasets";
import "@/server/reports/register";

/** Permission-checked, audited exports for any registered dataset. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ dataset: string }> }) {
  const { dataset: key } = await params;
  const session = await getSession();
  if (!session || (session.mfaRequired && session.aal !== "aal2")) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const ds = getDataset(key);
  if (!ds || !canAny(session, ds.permission) || !canAny(session, ds.exportPermission)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const filters = Object.fromEntries(request.nextUrl.searchParams.entries());
  filters.person = session.personId;
  const format = (filters.format ?? "csv") as "csv" | "xlsx" | "pdf";
  const db = await supabaseServer();
  const rows = await ds.query(db, filters);
  const cols = filters.columns ? ds.columns.filter((c) => filters.columns.split(",").includes(c.key)) : ds.columns;
  await db.rpc("log_export", { p_dataset: key, p_format: format, p_rows: rows.length, p_filters: filters });
  const stamp = new Date().toISOString().slice(0, 10);
  const meta = `${session.org.name} · ${rows.length} records · exported by ${session.displayName} on ${new Date().toLocaleString("en-GB")}`;
  if (format === "xlsx") return fileResponse(new Uint8Array(await toXlsx(ds.label, cols, rows, meta)), `${ds.label} ${stamp}.xlsx`, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  if (format === "pdf") return fileResponse(new Uint8Array(await toPdfTable(ds.label, cols, rows, meta)), `${ds.label} ${stamp}.pdf`, "application/pdf");
  return fileResponse(toCsv(cols, rows), `${ds.label} ${stamp}.csv`, "text/csv; charset=utf-8");
}
