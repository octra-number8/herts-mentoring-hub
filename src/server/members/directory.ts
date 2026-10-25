import "server-only";
import type { ProgressionSettings } from "@/lib/progression";
import { promptFilter } from "./prompt";

export { progressionSettings } from "./prompt";
import type { DB } from "../supabase";

export type MemberFilters = {
  q?: string; lodge?: string; area?: string; stage?: string; from?: string; to?: string;
  pm?: string; prompt?: string; status?: string;
};

export const STAGES = ["enquirer", "applicant", "candidate", "entered_apprentice", "fellow_craft", "master_mason", "established"] as const;
export const PAGE_SIZE = 50;

const isDate = (v?: string) => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);
const isUuid = (v?: string) => !!v && /^[0-9a-f-]{36}$/i.test(v);

/**
 * Member directory query, run as the signed-in user (RLS hides restricted
 * people and journeys outside the viewer's scope). Lodge filtering uses all
 * current memberships, so a Brother in several Lodges appears under each.
 */
export async function queryMembers(db: DB, f: MemberFilters, opts: { settings?: ProgressionSettings; page?: number; pageSize?: number } = {}) {
  let ids: string[] | null = null;
  if (isUuid(f.lodge)) {
    const { data, error } = await db.from("lodge_memberships").select("person_id").eq("lodge_id", f.lodge!).is("left_on", null);
    if (error) throw error;
    ids = [...new Set((data ?? []).map((m) => m.person_id))];
    if (!ids.length) return { rows: [], total: 0 };
  }
  const paged = opts.page !== undefined;
  const build = (head = false) => applyFilters(db.from("v_member_overview").select("*", paged ? { count: "exact", head } : undefined).order("last_name").order("first_name"), f, ids, opts.settings);
  let q = build();
  if (paged) {
    const size = opts.pageSize ?? PAGE_SIZE;
    const from = (Math.max(1, opts.page!) - 1) * size;
    q = q.range(from, from + size - 1);
  }
  const { data, error, count } = await q;
  if (error?.code === "PGRST103") {
    // Asked for a page beyond the end: report the total with no rows.
    const { count: n } = await build(true);
    return { rows: [], total: n ?? 0 };
  }
  if (error) throw error;
  return { rows: data ?? [], total: count ?? data?.length ?? 0 };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applyFilters<Q extends { in: any; neq: any; eq: any; or: any; gte: any; lte: any; not: any }>(query: Q, f: MemberFilters, ids: string[] | null, settings?: ProgressionSettings): Q {
  let q = query;
  if (ids) q = q.in("id", ids);
  if (f.status === "former") q = q.neq("status", "active");
  else if (f.status !== "all") q = q.eq("status", "active");
  if (f.q) {
    const term = f.q.trim().replace(/[%,()*:"\\]/g, "");
    if (/^\d+$/.test(term)) q = q.eq("membership_number", term);
    else if (term) {
      for (const w of term.split(/\s+/).filter(Boolean)) q = q.or(`first_name.ilike.%${w}%,last_name.ilike.%${w}%,membership_number.eq.${w}`);
    }
  }
  if (isUuid(f.area)) q = q.eq("area_id", f.area!);
  if (f.stage && (STAGES as readonly string[]).includes(f.stage)) q = q.eq("stage", f.stage);
  if (isDate(f.from)) q = q.gte("initiated_on", f.from!);
  if (isDate(f.to)) q = q.lte("initiated_on", f.to!);
  if (f.pm && ["yes", "no", "unknown"].includes(f.pm)) q = q.eq("personal_mentor_allocated", f.pm);
  if (f.prompt === "1") q = q.not("stage", "is", null).or(promptFilter(settings));
  return q;
}
