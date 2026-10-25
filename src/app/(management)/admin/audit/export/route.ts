import { NextResponse, type NextRequest } from "next/server";
import { accountNames, auditQuery, describeDetails } from "@/server/admin/audit";
import { fileResponse, toCsv } from "@/server/export/format";
import { can, getSession } from "@/server/session";
import { supabaseServer } from "@/server/supabase";

const MAX = 20000;

/** Audit log CSV export (admin.audit). The export itself is audited. */
export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session || (session.mfaRequired && session.aal !== "aal2")) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  if (!can(session, "admin.audit")) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const p = request.nextUrl.searchParams;
  const filters = { action: p.get("action") ?? undefined, entity: p.get("entity") ?? undefined, id: p.get("id") ?? undefined, actor: p.get("actor") ?? undefined, from: p.get("from") ?? undefined, to: p.get("to") ?? undefined };
  const db = await supabaseServer();
  const names = await accountNames(db);
  const rows: Record<string, unknown>[] = [];
  for (let from = 0; from < MAX; from += 1000) {
    const { data, error } = await auditQuery(db, filters).range(from, from + 999);
    if (error) return NextResponse.json({ error: "The audit log could not be read" }, { status: 500 });
    rows.push(...(data ?? []).map((r) => ({ ...r, actor: r.actor_account_id ? names.get(r.actor_account_id) ?? r.actor_account_id : "System", details: describeDetails(r.details) })));
    if (!data || data.length < 1000) break;
  }
  await db.rpc("log_export", { p_dataset: "audit_log", p_format: "csv", p_rows: rows.length, p_filters: filters });
  const csv = toCsv([
    { key: "occurred_at", label: "When" }, { key: "actor", label: "Who" }, { key: "action", label: "Action" },
    { key: "entity_type", label: "Record type" }, { key: "entity_id", label: "Record" }, { key: "details", label: "Details" },
  ], rows);
  return fileResponse(csv, `Audit log ${new Date().toISOString().slice(0, 10)}.csv`, "text/csv; charset=utf-8");
}
