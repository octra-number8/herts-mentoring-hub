"use server";

import { z } from "zod";
import { check, defineAction, UserError, zf } from "@/server/action";
import { kickJobs } from "@/server/jobs/kick";
import { QUARTERLY_SECTIONS } from "@/server/reports/analysis";
import { getDataset } from "@/server/reports/datasets";
import "@/server/reports/register";
import { canAny } from "@/server/session";

const configSchema = z.object({
  dataset: z.string().min(1),
  columns: z.array(z.string()).default([]),
  filters: z.record(z.string(), z.string()).default({}),
  group: z.string().optional(),
  agg: z.enum(["count", "sum", "avg"]).optional(),
  measure: z.string().optional(),
  chart: z.enum(["none", "bar", "hbar", "line"]).optional(),
});
export type ReportConfig = z.infer<typeof configSchema>;

export const saveReport = defineAction(
  z.object({ name: zf.required("Name", 120), config: z.string(), shared: zf.checkbox(), schedule: z.enum(["none", "weekly", "monthly", "quarterly"]).default("none") }),
  async (i, { db, session }) => {
    const parsed = configSchema.safeParse(JSON.parse(i.config));
    if (!parsed.success) throw new UserError("This report could not be saved. Please choose a dataset first.");
    const ds = getDataset(parsed.data.dataset);
    if (!ds || !canAny(session, ds.permission)) throw new UserError("You do not have access to that dataset.");
    if (i.schedule !== "none" && !canAny(session, ds.exportPermission)) throw new UserError("Scheduling sends the report as a file, which needs export permission for this dataset.");
    const row = check(await db.from("saved_reports").insert({ org_id: session.orgId, name: i.name, dataset: ds.key, config: parsed.data, shared: i.shared, schedule: i.schedule }).select("id").single());
    return { message: "Report saved.", redirect: `/reports/builder?saved=${row.id}`, revalidate: ["/reports"] };
  },
);

export const updateSavedReport = defineAction(
  z.object({ id: zf.uuid(), name: zf.required("Name", 120), shared: zf.checkbox(), schedule: z.enum(["none", "weekly", "monthly", "quarterly"]), config: z.string().optional() }),
  async (i, { db, session }) => {
    const patch: { name: string; shared: boolean; schedule: string; config?: ReportConfig } = { name: i.name, shared: i.shared, schedule: i.schedule };
    if (i.config) {
      const parsed = configSchema.safeParse(JSON.parse(i.config));
      if (!parsed.success) throw new UserError("The report settings are not valid.");
      patch.config = parsed.data;
    }
    const { data: existing } = await db.from("saved_reports").select("dataset").eq("id", i.id).maybeSingle();
    const ds = existing ? getDataset(patch.config?.dataset ?? existing.dataset) : undefined;
    if (i.schedule !== "none" && (!ds || !canAny(session, ds.exportPermission))) throw new UserError("Scheduling sends the report as a file, which needs export permission for this dataset.");
    const res = await db.from("saved_reports").update(patch).eq("id", i.id).eq("owner_account_id", session.accountId).select("id");
    if (!check(res).length) throw new UserError("Only the owner can change a saved report.");
    return { message: i.schedule === "none" ? "Report updated." : `Report updated. It will be emailed to you ${i.schedule === "weekly" ? "each week" : i.schedule === "monthly" ? "each month" : "each quarter"} as an Excel file.`, revalidate: ["/reports", "/reports/builder"] };
  },
);

export const deleteSavedReport = defineAction(
  z.object({ id: zf.uuid() }),
  async (i, { db, session }) => {
    const res = await db.from("saved_reports").delete().eq("id", i.id).eq("owner_account_id", session.accountId).select("id");
    if (!check(res).length) throw new UserError("Only the owner can delete a saved report.");
    return { redirect: "/reports", revalidate: ["/reports"] };
  },
);

// ---------------------------------------------------------------------------
// Quarterly report
// ---------------------------------------------------------------------------

export const generateQuarterly = defineAction(
  z.object({ year: zf.int("Year").pipe(z.number().min(2000).max(2100)), quarter: zf.int("Quarter").pipe(z.number().min(1).max(4)) }),
  async (i, { db }) => {
    const id = check(await db.rpc("report_generate_quarterly", { p_year: i.year, p_quarter: i.quarter }));
    return { message: "Report generated from a frozen snapshot of the figures.", redirect: `/reports/quarterly/${id}`, revalidate: ["/reports/quarterly"] };
  },
  { permission: ["reports.quarterly"] },
);

export const regenerateQuarterly = defineAction(
  z.object({ id: zf.uuid(), year: zf.int(), quarter: zf.int() }),
  async (i, { db }) => {
    check(await db.rpc("report_generate_quarterly", { p_year: i.year, p_quarter: i.quarter }));
    return { message: "Figures refreshed. Your narrative has been kept.", redirect: `/reports/quarterly/${i.id}?done=refreshed`, revalidate: [`/reports/quarterly/${i.id}`] };
  },
  { permission: ["reports.quarterly"] },
);

export const transitionQuarterly = defineAction(
  z.object({ id: zf.uuid(), to: z.enum(["draft", "review", "approved", "published"]) }),
  async (i, { db }) => {
    check(await db.rpc("report_quarterly_transition", { p_report: i.id, p_to: i.to }));
    kickJobs();
    const msg = { draft: "Returned to draft.", review: "Submitted for review by Provincial leadership.", approved: "Report approved. It can no longer be edited.", published: "Report published." }[i.to];
    // The button that was pressed disappears with the old status, so the page shows the outcome.
    return { message: msg, redirect: `/reports/quarterly/${i.id}?done=${i.to}`, revalidate: [`/reports/quarterly/${i.id}`, "/reports/quarterly"] };
  },
  { permission: ["reports.quarterly"] },
);

export const saveNarrative = defineAction(
  z.object(Object.fromEntries([["id", zf.uuid()], ...QUARTERLY_SECTIONS.map((s) => [s.key, zf.optionalText(8000)])])) as z.ZodObject<Record<string, z.ZodType<string | null>>>,
  async (i, { db }) => {
    const id = i.id as string;
    const narrative = Object.fromEntries(QUARTERLY_SECTIONS.filter((s) => s.key !== "observations").map((s) => [s.key, i[s.key] ?? ""]));
    const res = await db.from("quarterly_reports").update({ narrative, observations: (i.observations as string | null) ?? null }).eq("id", id).select("id");
    if (!check(res).length) throw new UserError("The narrative can only be edited while the report is in draft or review.");
    return { message: "Narrative saved.", revalidate: [`/reports/quarterly/${id}`] };
  },
  { permission: ["reports.quarterly"] },
);
