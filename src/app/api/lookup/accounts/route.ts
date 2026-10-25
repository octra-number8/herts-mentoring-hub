import { NextResponse } from "next/server";
import { getSession } from "@/server/session";
import { supabaseServer } from "@/server/supabase";

/**
 * Active Provincial accounts (for assigning tasks, cases, approvals, mentions).
 * Uses management_accounts(), which checks hub.access_management in the database,
 * because ordinary RLS on role assignments only shows a user their own roles.
 */
export async function GET() {
  const s = await getSession();
  if (!s || !s.permissions.has("hub.access_management")) return NextResponse.json([], { status: 401 });
  const db = await supabaseServer();
  const { data } = await db.rpc("management_accounts");
  return NextResponse.json((data ?? []).map((a: { id: string; display_name: string; roles: string }) => ({ id: a.id, label: a.display_name, detail: a.roles })));
}
