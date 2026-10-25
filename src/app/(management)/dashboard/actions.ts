"use server";

import { z } from "zod";
import { check, defineAction, zf } from "@/server/action";

/** Saves the caller's own dashboard layout (panel order and hidden panels) in saved_views. */
export const saveDashboardLayout = defineAction(
  z.object({ order: zf.list(), shown: zf.list() }),
  async (i, { db, session }) => {
    const order = i.order.filter((k) => /^[a-z_]{2,30}$/.test(k)).slice(0, 40);
    const hidden = order.filter((k) => !i.shown.includes(k));
    check(await db.from("saved_views").delete().eq("page", "dashboard").eq("account_id", session.accountId));
    check(await db.from("saved_views").insert({ org_id: session.orgId, account_id: session.accountId, page: "dashboard", name: "Dashboard layout", filters: { order, hidden }, is_default: true }));
    return { message: "Dashboard layout saved.", revalidate: ["/dashboard"] };
  },
);

export const resetDashboardLayout = defineAction(
  z.object({}),
  async (_i, { db, session }) => {
    check(await db.from("saved_views").delete().eq("page", "dashboard").eq("account_id", session.accountId));
    return { message: "Dashboard reset to the standard layout.", revalidate: ["/dashboard"] };
  },
);
