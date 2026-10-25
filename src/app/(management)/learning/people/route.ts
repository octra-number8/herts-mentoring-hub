import { NextResponse, type NextRequest } from "next/server";
import { can, getSession } from "@/server/session";
import { supabaseServer } from "@/server/supabase";

/**
 * Learner search for Academy administration pickers. Runs as the user: RLS
 * lets learning administrators see people with Hub access or learning records,
 * and nothing more.
 */
export async function GET(request: NextRequest) {
  const s = await getSession();
  if (!s || (s.mfaRequired && s.aal !== "aal2")) return NextResponse.json([], { status: 401 });
  if (!can(s, "academy.admin") && !can(s, "learning.records.read")) return NextResponse.json([], { status: 404 });
  const q = (request.nextUrl.searchParams.get("q") ?? "").trim().replace(/[%,()*]/g, "");
  if (q.length < 2) return NextResponse.json([]);
  const db = await supabaseServer();
  let query = db.from("persons").select("id, display_name, email, status").neq("status", "deceased").order("last_name").limit(20);
  for (const w of q.split(/\s+/).filter(Boolean)) query = query.or(`first_name.ilike.%${w}%,last_name.ilike.%${w}%`);
  const { data } = await query;
  return NextResponse.json((data ?? []).map((p) => ({ id: p.id, label: p.display_name, detail: p.email ?? "" })));
}
