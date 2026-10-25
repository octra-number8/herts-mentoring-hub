import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/server/session";
import { supabaseServer } from "@/server/supabase";

/** Person search for pickers. Runs as the user, so results respect RLS. */
export async function GET(request: NextRequest) {
  const s = await getSession();
  if (!s) return NextResponse.json([], { status: 401 });
  const q = (request.nextUrl.searchParams.get("q") ?? "").trim();
  const lodge = request.nextUrl.searchParams.get("lodge");
  if (q.length < 2 && !lodge) return NextResponse.json([]);
  const db = await supabaseServer();
  let query = db.from("v_member_overview").select("id, display_name, lodge_name, lodge_number, membership_number, status").eq("status", "active").order("last_name").limit(20);
  if (q.length >= 2) {
    const words = q.split(/\s+/).filter(Boolean);
    for (const w of words) query = query.or(`first_name.ilike.%${w.replace(/[%,()]/g, "")}%,last_name.ilike.%${w.replace(/[%,()]/g, "")}%,membership_number.eq.${w.replace(/[%,()]/g, "")}`);
  }
  if (lodge) query = query.eq("lodge_id", lodge);
  const { data } = await query;
  return NextResponse.json((data ?? []).map((p) => ({ id: p.id, label: p.display_name, detail: p.lodge_name ? `${p.lodge_name} No. ${p.lodge_number}` : p.membership_number ?? "" })));
}
