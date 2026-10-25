"use server";

import { z } from "zod";
import { check, defineAction, zf } from "@/server/action";

export const markRead = defineAction(z.object({ id: zf.uuid() }), async (i, { db }) => {
  check(await db.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", i.id).is("read_at", null));
  return { revalidate: ["/notifications"] };
});

export const markUnread = defineAction(z.object({ id: zf.uuid() }), async (i, { db }) => {
  check(await db.from("notifications").update({ read_at: null }).eq("id", i.id));
  return { revalidate: ["/notifications"] };
});

export const markAllRead = defineAction(z.object({}), async (_, { db, session }) => {
  check(await db.from("notifications").update({ read_at: new Date().toISOString() }).eq("account_id", session.accountId).is("read_at", null));
  return { message: "All notifications marked as read.", revalidate: ["/notifications"] };
});

/** Mark as read, then follow the link (internal paths only). */
export const openNotification = defineAction(z.object({ id: zf.uuid() }), async (i, { db }) => {
  const n = check(await db.from("notifications").select("link").eq("id", i.id).single());
  await db.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", i.id).is("read_at", null);
  const link = n.link && n.link.startsWith("/") && !n.link.startsWith("//") ? n.link : "/notifications";
  return { redirect: link };
});
