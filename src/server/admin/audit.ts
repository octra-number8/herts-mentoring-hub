import "server-only";
import type { DB } from "../supabase";

export type AuditFilters = { action?: string; entity?: string; id?: string; actor?: string; from?: string; to?: string };

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Audit log query shared by the page and the CSV export. RLS limits it to admin.audit holders. */
export function auditQuery(db: DB, f: AuditFilters, opts: { count?: boolean } = {}) {
  let q = db.from("audit_events").select("id, occurred_at, action, entity_type, entity_id, actor_account_id, details", opts.count ? { count: "exact" } : undefined)
    .order("occurred_at", { ascending: false });
  if (f.action) q = q.ilike("action", `%${f.action.replace(/[%_]/g, "")}%`);
  if (f.entity) q = q.eq("entity_type", f.entity);
  if (f.id) q = q.eq("entity_id", f.id);
  if (f.actor) q = q.eq("actor_account_id", f.actor);
  if (f.from && DATE.test(f.from)) q = q.gte("occurred_at", `${f.from}T00:00:00Z`);
  if (f.to && DATE.test(f.to)) q = q.lte("occurred_at", `${f.to}T23:59:59.999Z`);
  return q;
}

export async function accountNames(db: DB): Promise<Map<string, string>> {
  const { data } = await db.from("user_accounts").select("id, persons(display_name)");
  return new Map((data ?? []).map((a) => [a.id, (a.persons as unknown as { display_name: string } | null)?.display_name ?? "Restricted record"]));
}

/** Human summary of an audit entry's details (details never hold restricted text). */
export function describeDetails(details: unknown): string {
  if (!details || typeof details !== "object") return "";
  const d = details as Record<string, unknown>;
  if (d.changes && typeof d.changes === "object") {
    return Object.entries(d.changes as Record<string, unknown>).map(([k, v]) => {
      if (v === "changed") return `${k} changed`;
      const c = v as { from?: unknown; to?: unknown };
      return `${k}: ${JSON.stringify(c.from ?? null)} → ${JSON.stringify(c.to ?? null)}`;
    }).join("; ");
  }
  return Object.entries(d).map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`).join("; ");
}
