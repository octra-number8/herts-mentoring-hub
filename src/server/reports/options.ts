import "server-only";
import type { DB } from "../supabase";

/** Area and Lodge choices for report filters, as the caller may see them. */
export async function filterOptions(db: DB) {
  const [{ data: areas }, { data: lodges }] = await Promise.all([
    db.from("areas").select("id, name").eq("active", true).order("code"),
    db.from("lodges").select("id, name, number").order("number"),
  ]);
  return {
    areas: (areas ?? []).map((a) => ({ value: a.id, label: a.name })),
    lodges: (lodges ?? []).map((l) => ({ value: l.id, label: `${l.number} ${l.name}` })),
  };
}

/** Plain string filters from Next search params (first value of any array). */
export function plainParams(sp: Record<string, string | string[] | undefined>): Record<string, string> {
  return Object.fromEntries(Object.entries(sp).map(([k, v]) => [k, Array.isArray(v) ? v[0] ?? "" : v ?? ""]).filter(([, v]) => v)) as Record<string, string>;
}
