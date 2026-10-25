import "server-only";
import type { DB } from "../supabase";

export type SupportView = "assigned" | "all" | "raised" | "triage";
export type SupportFilters = { view?: string; status?: string; category?: string; lodge?: string; overdue?: string; q?: string };

export const CASE_STATUSES = ["new", "triage", "assigned", "in_progress", "awaiting_response", "escalated", "resolved", "closed", "referred"] as const;
export const OPEN_EXCLUDES = ["resolved", "closed", "referred"];
const isUuid = (v?: string) => !!v && /^[0-9a-f-]{36}$/i.test(v);

type Embedded = { display_name: string } | null;
const nameOf = (a: unknown) => ((a as { persons: Embedded } | null)?.persons?.display_name ?? null);

export type SupportRow = {
  id: string; reference: string; kind: string; title: string; category_key: string; category_label: string;
  status: string; priority: string; due_on: string | null; created_at: string; closed_at: string | null;
  lodge_id: string | null; lodge_label: string | null; owner_account_id: string | null; owner_name: string | null;
  requester_name: string | null; overdue: boolean;
};

/**
 * Support request list. Runs as the user: RLS decides which cases exist for them.
 * Ordinary list views ("all") only ever include kind = 'request'; confidential
 * concerns appear only in the triage view, to their owner, or to the person who raised them.
 */
export async function querySupport(db: DB, f: SupportFilters, me: { accountId: string }): Promise<SupportRow[]> {
  const view = (["assigned", "all", "raised", "triage"].includes(f.view ?? "") ? f.view : "assigned") as SupportView;
  const today = new Date().toISOString().slice(0, 10);
  let q = db.from("cases").select(`id, reference, kind, title, category_key, status, priority, due_on, created_at, closed_at, lodge_id, owner_account_id,
    lodges(name, number), owner:user_accounts!cases_owner_account_id_fkey(persons(display_name)),
    requester:persons!cases_requester_person_id_fkey(display_name)`).order("created_at", { ascending: false }).limit(500);

  if (view === "assigned") q = q.or(`owner_account_id.eq.${me.accountId},escalated_to_account_id.eq.${me.accountId}`);
  if (view === "all") q = q.eq("kind", "request");
  if (view === "raised") q = q.eq("requester_account_id", me.accountId);
  if (view === "triage") q = q.eq("kind", "confidential");

  if (!f.status) q = q.not("status", "in", `(${OPEN_EXCLUDES.join(",")})`);
  else if ((CASE_STATUSES as readonly string[]).includes(f.status)) q = q.eq("status", f.status);
  if (f.category && /^[a-z_]+$/.test(f.category)) q = q.eq("category_key", f.category);
  if (isUuid(f.lodge)) q = q.eq("lodge_id", f.lodge!);
  if (f.overdue === "1") q = q.lt("due_on", today).not("status", "in", `(${OPEN_EXCLUDES.join(",")})`);
  if (f.q) {
    const term = f.q.trim().replace(/[%,()*:"\\]/g, "");
    if (term) q = q.or(`reference.ilike.%${term}%,title.ilike.%${term}%`);
  }

  const [{ data, error }, { data: cats }] = await Promise.all([q, db.from("support_categories").select("key, label")]);
  if (error) throw error;
  const catLabel = new Map((cats ?? []).map((c) => [c.key, c.label]));
  return (data ?? []).map((c) => {
    const lodge = c.lodges as unknown as { name: string; number: number } | null;
    return {
      id: c.id, reference: c.reference, kind: c.kind, title: c.title, category_key: c.category_key,
      category_label: catLabel.get(c.category_key) ?? c.category_key, status: c.status, priority: c.priority,
      due_on: c.due_on, created_at: c.created_at, closed_at: c.closed_at, lodge_id: c.lodge_id,
      // A confidential concern's Lodge is never shown in lists.
      lodge_label: lodge && c.kind === "request" ? `${lodge.name} No. ${lodge.number}` : null,
      owner_account_id: c.owner_account_id, owner_name: nameOf(c.owner),
      requester_name: (c.requester as unknown as Embedded)?.display_name ?? null,
      overdue: !!c.due_on && c.due_on < today && !OPEN_EXCLUDES.includes(c.status),
    };
  });
}
