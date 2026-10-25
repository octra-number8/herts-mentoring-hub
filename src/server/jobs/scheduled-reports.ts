import "server-only";
import { createHmac } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { publicEnv } from "@/lib/env";
import type { Database } from "@/types/database";
import { enqueueEmail } from "../email/outbox";
import { toXlsx, type Column, type Row } from "../export/format";
import { aggregate, type Aggregation } from "../reports/analysis";
import { getDataset } from "../reports/datasets";
import "../reports/register";
import "../reports/datasets-reports";
import type { DB } from "../supabase";

type Config = { dataset: string; columns?: string[]; filters?: Record<string, string>; group?: string; agg?: Aggregation; measure?: string };
type Ctx = { permissions?: string[]; person_id?: string };

const PERIOD_DAYS: Record<string, number> = { weekly: 7, monthly: 28, quarterly: 84 };

function jwtSecret() {
  return process.env.SUPABASE_JWT_SECRET ?? process.env.JWT_SECRET;
}

/**
 * A short-lived token for the report's owner, so the dataset query runs with
 * exactly their RLS and effective permissions (never the service role). The
 * owner chose to schedule the report; their standing access applies at send time.
 */
function ownerClient(authUserId: string, secret: string): DB {
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const body = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: authUserId, role: "authenticated", aud: "authenticated", aal: "aal2", iat: now, exp: now + 300 })}`;
  const token = `${body}.${createHmac("sha256", secret).update(body).digest("base64url")}`;
  return createClient<Database>(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Email due scheduled reports to their owners as an Excel attachment.
 * `db` is the service client (to find due reports, store the file, queue the
 * email); the data itself is always read as the owner.
 */
export async function processScheduledReports(db: DB, now = new Date()) {
  const stats = { sent: 0, skipped: 0, failed: 0 };
  const secret = jwtSecret();
  const { data: due } = await db.from("saved_reports").select("id, org_id, name, dataset, config, schedule, last_run_at, owner_account_id").neq("schedule", "none").limit(50);
  for (const r of due ?? []) {
    const days = PERIOD_DAYS[r.schedule] ?? 7;
    if (r.last_run_at && now.getTime() - new Date(r.last_run_at).getTime() < days * 86400000 - 3600000) continue;
    const period = `${r.schedule}:${now.toISOString().slice(0, 10)}`;
    // Claim the run first so concurrent workers do not both send it.
    const { data: claimed } = await db.from("saved_reports").update({ last_run_at: now.toISOString() }).eq("id", r.id)
      .filter("last_run_at", r.last_run_at ? "eq" : "is", r.last_run_at ?? null).select("id").maybeSingle();
    if (!claimed) continue;
    try {
      const { data: owner } = await db.from("user_accounts").select("auth_user_id, status, person_id, persons(email, first_name)").eq("id", r.owner_account_id).maybeSingle();
      const person = owner?.persons as unknown as { email: string | null; first_name: string } | null;
      const ds = getDataset(r.dataset);
      if (!secret || !owner?.auth_user_id || owner.status !== "active" || !person?.email || !ds) { stats.skipped++; continue; }
      const userDb = ownerClient(owner.auth_user_id, secret);
      const { data: ctxRaw } = await userDb.rpc("my_context");
      const perms = new Set((ctxRaw as unknown as Ctx | null)?.permissions ?? []);
      if (!ds.permission.some((p) => perms.has(p)) || !ds.exportPermission.some((p) => perms.has(p))) { stats.skipped++; continue; }

      const cfg = r.config as unknown as Config;
      const filters = { ...(cfg.filters ?? {}), person: owner.person_id };
      const rows = await ds.query(userDb, filters);
      let columns: Column[] = cfg.columns?.length ? ds.columns.filter((c) => cfg.columns!.includes(c.key)) : ds.columns;
      let out: Row[] = rows;
      const groupCol = cfg.group ? ds.columns.find((c) => c.key === cfg.group) : undefined;
      if (groupCol) {
        const measure = cfg.measure ? ds.columns.find((c) => c.key === cfg.measure && c.type === "number") : undefined;
        const agg = cfg.agg ?? "count";
        out = aggregate(rows, groupCol.key, agg, measure?.key);
        columns = [{ key: "group", label: groupCol.label }, { key: "value", label: agg === "count" || !measure ? "Records" : `${agg === "sum" ? "Total" : "Average"} ${measure.label.toLowerCase()}`, type: "number" }];
      }
      const meta = `${rows.length} records · scheduled ${r.schedule} report · generated ${now.toLocaleString("en-GB", { timeZone: "Europe/London" })}`;
      const file = await toXlsx(r.name, columns, out, meta);
      const path = `${r.org_id}/reports/${r.id}/${now.toISOString().slice(0, 10)}.xlsx`;
      const up = await db.storage.from("documents").upload(path, new Uint8Array(file), { upsert: true, contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      if (up.error) throw up.error;
      await userDb.rpc("log_export", { p_dataset: ds.key, p_format: "xlsx", p_rows: rows.length, p_filters: { ...filters, scheduled_report: r.id } });
      await enqueueEmail(db, {
        orgId: r.org_id, toEmail: person.email, toPersonId: owner.person_id, category: "operational", idempotencyKey: `scheduled-report:${r.id}:${period}`,
        subject: `Your ${r.schedule} report: ${r.name}`,
        markdown: `Dear ${person.first_name},\n\nYour scheduled report **${r.name}** is attached as an Excel file (${rows.length} records). It contains only what your role allows you to see.\n\nYou can change or stop the schedule from the report in the Hub.`,
        attachments: [{ bucket: "documents", path, filename: `${r.name.replace(/[^\w\- ]+/g, "").trim() || "Report"} ${now.toISOString().slice(0, 10)}.xlsx` }],
      });
      stats.sent++;
    } catch (e) {
      stats.failed++;
      await db.from("integration_failures").insert({ org_id: r.org_id, integration_key: "reports", operation: "scheduled_report", message: (e as Error).message?.slice(0, 500) ?? "Failed", context: { saved_report_id: r.id } });
    }
  }
  return stats;
}
