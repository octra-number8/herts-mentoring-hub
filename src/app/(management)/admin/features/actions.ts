"use server";

import { z } from "zod";
import { check, defineAction, UserError, zf } from "@/server/action";

const ACTIONS = ["read", "create", "update", "approve", "export"] as const;

export const saveFeatureSetting = defineAction(
  z.object({ feature_key: z.string().min(1), enabled: zf.checkbox(), actions: zf.list() }),
  async (i, { db, session }) => {
    if (i.feature_key === "administration" && (!i.enabled || !i.actions.includes("update") || !i.actions.includes("read"))) {
      throw new UserError("Administration cannot be switched off here: it would remove the ability to switch it back on.");
    }
    const actions = Object.fromEntries(ACTIONS.map((a) => [a, i.actions.includes(a)]));
    const res = await db.from("feature_settings").update({ enabled: i.enabled, actions, updated_by: session.accountId, updated_at: new Date().toISOString() })
      .eq("feature_key", i.feature_key).eq("org_id", session.orgId).select("feature_key");
    if (!check(res).length) throw new UserError("You do not have permission to change features.");
    return { message: "Feature settings saved. Access changes take effect immediately.", revalidate: ["/admin/features"] };
  },
  { permission: ["admin.features"] },
);

export const activatePortal = defineAction(
  z.object({
    scope: z.enum(["account", "lodge", "role"]),
    account_id: zf.optionalUuid(), lodge_id: zf.optionalUuid(), role_id: zf.optionalUuid(),
    actions: zf.list(), reason: z.string().trim().min(5, "Record the reason (at least a few words)").max(500),
  }),
  async (i, { db }) => {
    const target = i.scope === "account" ? i.account_id : i.scope === "lodge" ? i.lodge_id : i.role_id;
    if (!target) throw new UserError(`Choose the ${i.scope === "account" ? "Lodge Mentor" : i.scope === "lodge" ? "Lodge" : "role"} to activate.`);
    const acts = ["read", "create", "update", "export"].filter((a) => i.actions.includes(a));
    if (!acts.includes("read")) throw new UserError("Viewing the portal (read) is needed for any other action.");
    check(await db.rpc("feature_set_activation", { p_feature: "lodge_portal", p_scope: i.scope, p_target: target,
      p_actions: Object.fromEntries(["read", "create", "update", "approve", "export"].map((a) => [a, acts.includes(a)])), p_active: true, p_reason: i.reason }));
    return { message: "Portal activated. It is available the next time they open the Hub.", revalidate: ["/admin/features"] };
  },
  { permission: ["admin.features"] },
);

export const deactivatePortal = defineAction(
  z.object({ scope: z.enum(["account", "lodge", "role"]), target: zf.uuid(), reason: z.string().trim().min(5, "Record the reason (at least a few words)").max(500) }),
  async (i, { db }) => {
    check(await db.rpc("feature_set_activation", { p_feature: "lodge_portal", p_scope: i.scope, p_target: i.target, p_actions: {}, p_active: false, p_reason: i.reason }));
    return { message: "Portal access removed. Learning history is untouched.", revalidate: ["/admin/features"] };
  },
  { permission: ["admin.features"] },
);
