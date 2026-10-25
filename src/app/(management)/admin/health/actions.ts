"use server";

import { z } from "zod";
import { check, defineAction, zf } from "@/server/action";
import { runAllJobs } from "@/server/jobs";
import { supabaseService } from "@/server/supabase";

const R = ["/admin/health"];

export const resolveFailure = defineAction(
  z.object({ id: zf.uuid(), retry: z.enum(["true", "false"]) }),
  async (i, { db }) => {
    const result = check(await db.rpc("integration_failure_resolve", { p_failure: i.id, p_retry: i.retry === "true" })) as string;
    return { message: i.retry === "true" ? `Retry: ${result}. Run background jobs to process it now.` : "Marked as resolved.", revalidate: R };
  },
  { permission: ["system.health"] },
);

export const retryEmail = defineAction(
  z.object({ id: zf.uuid() }),
  async (i, { db }) => {
    check(await db.rpc("outbox_retry", { p_id: i.id }));
    return { message: "Email queued to send again.", revalidate: R };
  },
  { permission: ["system.health"] },
);

export const runJobsNow = defineAction(
  z.object({}),
  async (_i, { session }) => {
    const r = await runAllJobs();
    await supabaseService().rpc("admin_record_audit", { p_org: session.orgId, p_action: "jobs.run_manually", p_entity_type: "system", p_entity_id: "jobs",
      p_details: { by: session.accountId, ms: r.ms } });
    return {
      message: `Done in ${(r.ms / 1000).toFixed(1)}s: ${r.events.processed} events processed (${r.events.failed} failed), ${r.workflows.succeeded} workflow runs succeeded (${r.workflows.failed} failed), ${r.outbox.sent} emails sent (${r.outbox.failed} failed), ${r.reminders.tasks} task reminders.`,
      revalidate: R,
    };
  },
  { permission: ["system.health"] },
);
