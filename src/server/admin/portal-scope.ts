import "server-only";
import { cache } from "react";
import { notFound } from "next/navigation";
import { requireSession } from "../session";
import { supabaseServer } from "../supabase";

export type PortalScope = { read: string[]; create: string[]; update: string[]; export: string[] };

/** The signed-in user's Lodge Mentor portal Lodges per action (navigation only; RLS enforces). */
export const portalScope = cache(async (): Promise<PortalScope> => {
  const db = await supabaseServer();
  const { data } = await db.rpc("my_portal_scope");
  const s = (data ?? {}) as Partial<PortalScope>;
  return { read: s.read ?? [], create: s.create ?? [], update: s.update ?? [], export: s.export ?? [] };
});

/** A portal Lodge the user may view, or 404. */
export async function requirePortalLodge(lodgeId: string) {
  const session = await requireSession();
  const scope = await portalScope();
  if (!/^[0-9a-f-]{36}$/i.test(lodgeId) || !scope.read.includes(lodgeId)) notFound();
  return { session, scope, can: { create: scope.create.includes(lodgeId), update: scope.update.includes(lodgeId), export: scope.export.includes(lodgeId) } };
}
