"use server";

import { z } from "zod";
import { check, defineAction, UserError, zf } from "@/server/action";

const R = ["/admin/retention"];

export const updatePolicy = defineAction(
  z.object({ id: zf.uuid(), retain_months: zf.int("Months").pipe(z.number().min(1).max(600)), enabled: zf.checkbox(), basis: zf.required("Basis", 500) }),
  async (i, { db }) => {
    const res = await db.from("retention_policies").update({ retain_months: i.retain_months, enabled: i.enabled, basis: i.basis }).eq("id", i.id).select("id");
    if (!check(res).length) throw new UserError("You do not have permission to change retention policies.");
    return { message: i.enabled ? "Policy saved and enabled. It only runs when someone runs it." : "Policy saved.", revalidate: R };
  },
  { permission: ["admin.config"] },
);

export const runPolicy = defineAction(
  z.object({ id: zf.uuid(), dry_run: z.enum(["true", "false"]), confirm: zf.checkbox() }),
  async (i, { db }) => {
    const dry = i.dry_run === "true";
    if (!dry && !i.confirm) throw new UserError("Tick the confirmation to run this policy for real.");
    const res = check(await db.rpc("retention_run", { p_policy: i.id, p_dry_run: dry })) as { affected: number; cutoff: string };
    return {
      message: dry ? `Dry run: ${res.affected} records older than ${res.cutoff} would be affected. Nothing changed.` : `Done: ${res.affected} records older than ${res.cutoff} were processed.`,
      revalidate: R,
    };
  },
  { permission: ["admin.config"] },
);
