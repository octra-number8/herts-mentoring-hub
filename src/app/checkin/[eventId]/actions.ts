"use server";

import { z } from "zod";
import { check, defineAction, zf } from "@/server/action";
import { kickJobs } from "@/server/jobs/kick";

/** Self check-in with the session code shown by the presenter. */
export const checkInToSession = defineAction(z.object({ event_id: zf.uuid(), secret: z.string().regex(/^[0-9a-f]{16,64}$/i, "This check-in link is not valid") }), async (i, { db }) => {
  const r = check(await db.rpc("event_check_in_session", { p_event: i.event_id, p_secret: i.secret })) as { already?: boolean };
  kickJobs();
  return { message: r.already ? "You were already checked in. Enjoy the session." : "You're checked in. Enjoy the session.", revalidate: [`/academy/events/${i.event_id}`] };
});
