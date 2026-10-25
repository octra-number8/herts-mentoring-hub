import "server-only";
import type { DB } from "../supabase";

export type TaskView = "mine" | "overdue" | "created" | "all";
export type TaskFilters = { view?: string; status?: string; priority?: string; from?: string; to?: string; lodge?: string; q?: string };

export const TASK_STATUSES = ["open", "in_progress", "waiting", "done", "cancelled"] as const;
export const OPEN_TASK = ["open", "in_progress", "waiting"];
const isUuid = (v?: string) => !!v && /^[0-9a-f-]{36}$/i.test(v);
const isDate = (v?: string) => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);

export type TaskRow = {
  id: string; title: string; status: string; priority: string; due_on: string | null; created_at: string; completed_at: string | null;
  owner_account_id: string | null; owner_name: string | null; lodge_id: string | null; lodge_label: string | null;
  linked_type: string | null; linked_id: string | null; overdue: boolean;
};

/** Where a linked record lives in the Hub. */
export function linkedHref(type?: string | null, id?: string | null): string | null {
  if (!type || !id) return null;
  return ({ lodge: `/lodges/${id}`, person: `/members/${id}`, case: `/support/${id}`, meeting: `/team/meetings/${id}`, event: `/events/${id}` } as Record<string, string>)[type] ?? null;
}

/** Task list, run as the user (RLS limits rows to tasks they may see). */
export async function queryTasks(db: DB, f: TaskFilters, me: { accountId: string; manageAll?: boolean }): Promise<TaskRow[]> {
  const view = (["mine", "overdue", "created", "all"].includes(f.view ?? "") ? f.view : "mine") as TaskView;
  const today = new Date().toISOString().slice(0, 10);
  let q = db.from("tasks").select(`id, title, status, priority, due_on, created_at, completed_at, owner_account_id, lodge_id, linked_type, linked_id,
    lodges(name, number), owner:user_accounts!tasks_owner_account_id_fkey(persons(display_name))`)
    .order("due_on", { ascending: true, nullsFirst: false }).order("created_at", { ascending: false }).limit(500);

  if (view === "mine") q = q.eq("owner_account_id", me.accountId);
  if (view === "created") q = q.eq("created_by", me.accountId);
  if (view === "overdue") q = q.lt("due_on", today).in("status", OPEN_TASK);

  if (!f.status) { if (view !== "overdue") q = q.in("status", OPEN_TASK); }
  else if (f.status !== "any" && (TASK_STATUSES as readonly string[]).includes(f.status)) q = q.eq("status", f.status);
  if (f.priority && ["low", "normal", "high"].includes(f.priority)) q = q.eq("priority", f.priority);
  if (isDate(f.from)) q = q.gte("due_on", f.from!);
  if (isDate(f.to)) q = q.lte("due_on", f.to!);
  if (isUuid(f.lodge)) q = q.eq("lodge_id", f.lodge!);
  if (f.q) {
    const term = f.q.trim().replace(/[%,()*:"\\]/g, "");
    if (term) q = q.ilike("title", `%${term}%`);
  }

  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map((t) => {
    const lodge = t.lodges as unknown as { name: string; number: number } | null;
    return {
      id: t.id, title: t.title, status: t.status, priority: t.priority, due_on: t.due_on, created_at: t.created_at, completed_at: t.completed_at,
      owner_account_id: t.owner_account_id, owner_name: (t.owner as unknown as { persons: { display_name: string } | null } | null)?.persons?.display_name ?? null,
      lodge_id: t.lodge_id, lodge_label: lodge ? `${lodge.name} No. ${lodge.number}` : null,
      linked_type: t.linked_type, linked_id: t.linked_id,
      overdue: !!t.due_on && t.due_on < today && OPEN_TASK.includes(t.status),
    };
  });
}
