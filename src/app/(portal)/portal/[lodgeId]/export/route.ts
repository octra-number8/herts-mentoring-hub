import { NextResponse, type NextRequest } from "next/server";
import { fileResponse, toCsv } from "@/server/export/format";
import { getSession } from "@/server/session";
import { supabaseServer } from "@/server/supabase";

/** Lodge-level report for the Lodge Mentor portal, only where the 'export' action is activated. Audited. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ lodgeId: string }> }) {
  const { lodgeId } = await params;
  const session = await getSession();
  if (!session || (session.mfaRequired && session.aal !== "aal2")) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const db = await supabaseServer();
  const { data: scope } = await db.rpc("my_portal_scope");
  if (!((scope as { export?: string[] } | null)?.export ?? []).includes(lodgeId)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const [{ data: lodge }, { data: members }] = await Promise.all([
    db.from("lodges").select("name, number").eq("id", lodgeId).single(),
    db.from("v_member_overview").select("display_name, membership_number, initiated_on, passed_on, raised_on, stage, personal_mentor_allocated, next_review_on")
      .eq("lodge_id", lodgeId).eq("status", "active").order("last_name"),
  ]);
  const rows = (members ?? []).map((m) => ({ ...m, stage: m.stage?.replace(/_/g, " ") ?? "", personal_mentor_allocated: m.personal_mentor_allocated ?? "" }));
  await db.rpc("log_export", { p_dataset: "portal_lodge_members", p_format: "csv", p_rows: rows.length, p_filters: { lodge_id: lodgeId } });
  const csv = toCsv([
    { key: "display_name", label: "Name" }, { key: "membership_number", label: "Membership number" },
    { key: "initiated_on", label: "Initiated", type: "date" }, { key: "passed_on", label: "Passed", type: "date" }, { key: "raised_on", label: "Raised", type: "date" },
    { key: "stage", label: "Mentoring stage" }, { key: "personal_mentor_allocated", label: "Personal Mentor" }, { key: "next_review_on", label: "Next review", type: "date" },
  ], rows);
  return fileResponse(csv, `${lodge?.name ?? "Lodge"} No ${lodge?.number ?? ""} members ${new Date().toISOString().slice(0, 10)}.csv`, "text/csv; charset=utf-8");
}
