import "server-only";
import type { DB } from "../supabase";

type Page = PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>;

/**
 * Read every row of a query in pages (PostgREST caps responses at 1000 rows).
 * `make(from, to)` must return a fresh, ordered query with `.range(from, to)`.
 */
export async function fetchAll<T>(make: (from: number, to: number) => Page, max = 50000): Promise<T[]> {
  const out: T[] = [];
  const size = 1000;
  for (let from = 0; from < max; from += size) {
    const { data, error } = await make(from, from + size - 1);
    if (error) throw error;
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < size) break;
  }
  return out;
}

export type LodgeInfo = { id: string; number: number; name: string; area: string | null; area_id: string | null; apgmen: string | null };

/** Lodges the caller may see, keyed by id, with their current area and Assistant. */
export async function lodgeIndex(db: DB): Promise<Map<string, LodgeInfo>> {
  const { data, error } = await db.from("v_lodge_overview").select("id, number, name, area, area_id, apgmen").order("number");
  if (error) throw error;
  return new Map((data ?? []).map((l) => [l.id!, { id: l.id!, number: l.number!, name: l.name!, area: l.area, area_id: l.area_id, apgmen: l.apgmen }]));
}

/** Validated ISO date filter, or a fallback. */
export const isoOr = (v: string | undefined, fallback: string) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : fallback);
