import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/server/session";
import { supabaseServer } from "@/server/supabase";

/** Active Hub accounts (for assigning tasks, cases, approvals). Management users only. */
export async function GET(request: NextRequest) {
  const s = await getSession();
  if (!s || !s.permissions.has("hub.access_management")) return NextResponse.json([], { status: 401 });
  const role = request.nextUrl.searchParams.get("role");
  const db = await supabaseServer();
  const { data } = await db.from("user_accounts").select("id, person_id, persons(display_name), role_assignments(starts_on, ends_on, roles(key, name, is_management))").eq("status", "active");
  const today = new Date().toISOString().slice(0, 10);
  const rows = (data ?? []).map((a) => {
    const roles = ((a.role_assignments ?? []) as unknown as { starts_on: string; ends_on: string | null; roles: { key: string; name: string; is_management: boolean } }[])
      .filter((r) => r.starts_on <= today && (!r.ends_on || r.ends_on >= today)).map((r) => r.roles);
    return { id: a.id, label: (a.persons as unknown as { display_name: string }).display_name, roles };
  }).filter((a) => a.roles.some((r) => r.is_management) && (!role || a.roles.some((r) => r.key === role)));
  return NextResponse.json(rows.map((r) => ({ id: r.id, label: r.label, detail: r.roles.map((x) => x.name).join(", ") })).sort((a, b) => a.label.localeCompare(b.label)));
}
