"use server";

import { z } from "zod";
import { check, defineAction, UserError, zf } from "@/server/action";
import { kickJobs } from "@/server/jobs/kick";
import { validateWorkflowDefinition } from "@/server/workflows/catalogue";
import { dryRunWorkflow } from "@/server/workflows/engine";

const json = (label: string) => z.string().transform((s, ctx) => {
  try { return JSON.parse(s) as unknown; } catch { ctx.addIssue({ code: "custom", message: `${label} could not be read` }); return z.NEVER; }
});

export const saveWorkflow = defineAction(
  z.object({
    id: zf.optionalUuid(), name: zf.required("Name", 120), description: zf.text(500), trigger_key: z.string().min(1, "Choose a trigger"),
    conditions: json("Conditions"), actions: json("Actions"), requires_approval: zf.checkbox(),
  }),
  async (i, { db, session }) => {
    const v = validateWorkflowDefinition({ trigger_key: i.trigger_key, conditions: i.conditions, actions: i.actions });
    if (!v.ok) throw new UserError(v.error);
    const row = { name: i.name, description: i.description, trigger_key: i.trigger_key, conditions: i.conditions as never, actions: i.actions as never, requires_approval: i.requires_approval };
    if (i.id) {
      if (!check(await db.from("workflows").update(row).eq("id", i.id).select("id")).length) throw new UserError("You do not have permission to change workflows.");
      return { message: "Workflow saved.", revalidate: [`/admin/workflows/${i.id}`, "/admin/workflows"] };
    }
    const wf = check(await db.from("workflows").insert({ ...row, org_id: session.orgId, enabled: false, created_by: session.accountId }).select("id").single());
    return { redirect: `/admin/workflows/${wf.id}` };
  },
  { permission: ["workflows.manage"] },
);

export const setWorkflowEnabled = defineAction(
  z.object({ id: zf.uuid(), enabled: z.enum(["true", "false"]) }),
  async (i, { db }) => {
    if (i.enabled === "true") {
      const wf = check(await db.from("workflows").select("trigger_key, conditions, actions").eq("id", i.id).single());
      const v = validateWorkflowDefinition(wf);
      if (!v.ok) throw new UserError(`Fix this before enabling: ${v.error}`);
    }
    if (!check(await db.from("workflows").update({ enabled: i.enabled === "true" }).eq("id", i.id).select("id")).length) throw new UserError("You do not have permission to change workflows.");
    return { message: i.enabled === "true" ? "Workflow enabled. It runs for new events from now on." : "Workflow disabled.", revalidate: [`/admin/workflows/${i.id}`, "/admin/workflows"] };
  },
  { permission: ["workflows.manage"] },
);

export const deleteWorkflow = defineAction(
  z.object({ id: zf.uuid() }),
  async (i, { db }) => {
    const wf = check(await db.from("workflows").select("is_system").eq("id", i.id).single());
    if (wf.is_system) throw new UserError("System workflows can be disabled but not deleted.");
    const { count } = await db.from("workflow_runs").select("id", { count: "exact", head: true }).eq("workflow_id", i.id);
    if (count) throw new UserError("This workflow has run before, so it is kept for the record. Disable it instead.");
    check(await db.from("workflows").delete().eq("id", i.id));
    return { redirect: "/admin/workflows" };
  },
  { permission: ["workflows.manage"] },
);

/** Preview against the most recent matching event. Nothing is created, sent or changed. */
export const dryRun = defineAction(
  z.object({ id: zf.uuid() }),
  async (i, { db }) => {
    const res = await dryRunWorkflow(db, i.id);
    if (!res.event) return { message: "No recent event of this kind to preview against.", data: { steps: [], matched: false, event: null } };
    return {
      message: res.matched ? "Dry run complete. Nothing was created or sent." : "The most recent event did not meet the conditions, so nothing would run.",
      data: { steps: res.steps, matched: res.matched, event: { type: res.event.type, occurred_at: res.event.occurred_at } },
    };
  },
  { permission: ["workflows.manage"] },
);

export const decideRun = defineAction(
  z.object({ run_id: zf.uuid(), approve: z.enum(["true", "false"]), workflow_id: zf.optionalUuid() }),
  async (i, { db }) => {
    check(await db.rpc("workflow_run_decide", { p_run: i.run_id, p_approve: i.approve === "true" }));
    if (i.approve === "true") kickJobs();
    return { message: i.approve === "true" ? "Approved. It will run shortly." : "Run cancelled.", revalidate: ["/admin/workflows", ...(i.workflow_id ? [`/admin/workflows/${i.workflow_id}`] : [])] };
  },
  { permission: ["workflows.manage"] },
);

export const retryRun = defineAction(
  z.object({ run_id: zf.uuid(), workflow_id: zf.optionalUuid() }),
  async (i, { db }) => {
    check(await db.rpc("workflow_run_retry", { p_run: i.run_id }));
    kickJobs();
    return { message: "Queued to run again.", revalidate: ["/admin/workflows", "/admin/health", ...(i.workflow_id ? [`/admin/workflows/${i.workflow_id}`] : [])] };
  },
  { permission: ["workflows.manage", "system.health"] },
);
