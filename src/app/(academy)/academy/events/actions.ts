"use server";

import { z } from "zod";
import { check, defineAction, zf } from "@/server/action";
import { kickJobs } from "@/server/jobs/kick";

export const registerForEvent = defineAction(z.object({ event_id: zf.uuid() }), async (i, { db }) => {
  const r = check(await db.rpc("event_register", { p_event: i.event_id })) as { status: string; already?: boolean; waitlist_position?: number };
  kickJobs();
  const done = r.already ? "already" : r.status === "waitlisted" ? "waitlisted" : "booked";
  return { revalidate: ["/academy/events", `/academy/events/${i.event_id}`], redirect: `/academy/events/${i.event_id}?done=${done}` };
});

export const cancelMyPlace = defineAction(z.object({ event_id: zf.uuid(), registration_id: zf.uuid() }), async (i, { db }) => {
  check(await db.rpc("event_cancel_registration", { p_registration: i.registration_id }));
  kickJobs();
  return { revalidate: ["/academy/events", `/academy/events/${i.event_id}`], redirect: `/academy/events/${i.event_id}?done=cancelled` };
});

export const giveFeedback = defineAction(z.object({
  event_id: zf.uuid(), registration_id: zf.uuid(),
  rating: z.coerce.number({ message: "Please choose a rating" }).int().min(1, "Please choose a rating").max(5),
  comment: zf.text(2000).default(""),
}), async (i, { db }) => {
  check(await db.rpc("event_feedback", { p_registration: i.registration_id, p_rating: i.rating, p_comment: i.comment }));
  return { message: "Thank you for your feedback.", revalidate: [`/academy/events/${i.event_id}`] };
});
