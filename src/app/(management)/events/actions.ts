"use server";

import { z } from "zod";
import { EVENT_KINDS } from "@/components/events/constants";
import { check, defineAction, UserError, zf } from "@/server/action";
import { kickJobs } from "@/server/jobs/kick";
import { safeBookingUrl } from "@/server/integrations/octra";
import { supabaseService } from "@/server/supabase";

const KIND_VALUES = EVENT_KINDS.map((k) => k.value) as [string, ...string[]];
const optionalDateTime = () => z.string().optional().transform((v) => (v ? new Date(v).toISOString() : null));
const optionalUrl = () => z.string().trim().max(500).optional().transform((v) => (v ? v : null))
  .refine((v) => !v || /^https:\/\/\S+$/i.test(v), "Use a full https:// link");

const eventSchema = z.object({
  event_id: zf.optionalUuid(),
  title: zf.required("Title", 200),
  description: zf.text(10000).default(""),
  kind: z.enum(KIND_VALUES),
  format: z.enum(["in_person", "online", "hybrid"]),
  visibility: z.enum(["internal", "lodge_mentors", "invited", "learners", "public"]),
  starts_at: zf.datetime("Start"),
  ends_at: zf.datetime("Finish"),
  location: zf.optionalText(300),
  meeting_centre_id: zf.optionalUuid(),
  capacity: zf.optionalInt(),
  waitlist_enabled: zf.checkbox(),
  registration_mode: z.enum(["hub", "external", "none"]),
  registration_opens_at: optionalDateTime(),
  registration_closes_at: optionalDateTime(),
  external_booking_url: optionalUrl(),
  external_ref: zf.optionalText(100),
  course_id: zf.optionalUuid(),
  attendance_completes_course: zf.checkbox(),
  certificate_on_attendance: zf.checkbox(),
  feedback_enabled: zf.checkbox(),
  online_url: optionalUrl(),
  joining_instructions: zf.optionalText(3000),
});

export const saveEvent = defineAction(eventSchema, async (i, { db, session }) => {
  if (i.ends_at < i.starts_at) throw new UserError("The finish must be after the start.");
  if (i.capacity !== null && i.capacity < 1) throw new UserError("Capacity must be at least 1, or leave it blank for no limit.");
  if (i.registration_mode === "external" && !i.external_booking_url) throw new UserError("Add the Octra-Lodge booking link for an externally booked event.");
  if (i.registration_closes_at && i.registration_opens_at && i.registration_closes_at < i.registration_opens_at) throw new UserError("Registration must close after it opens.");
  if ((i.attendance_completes_course || i.certificate_on_attendance) && i.registration_mode !== "hub") throw new UserError("Attendance can only be recorded for events that take registrations in the Hub.");
  if (i.attendance_completes_course && !i.course_id) throw new UserError("Choose the course that attendance completes.");
  const kind = EVENT_KINDS.find((k) => k.value === i.kind)!;
  const row = {
    title: i.title, description: i.description, kind: i.kind, format: i.format, visibility: i.visibility,
    starts_at: i.starts_at, ends_at: i.ends_at, location: i.location, meeting_centre_id: i.meeting_centre_id,
    capacity: i.capacity, waitlist_enabled: i.waitlist_enabled, registration_mode: i.registration_mode,
    registration_opens_at: i.registration_opens_at, registration_closes_at: i.registration_closes_at,
    external_provider: i.registration_mode === "external" ? ("octra_lodge" as const) : null,
    external_booking_url: i.registration_mode === "external" ? i.external_booking_url : null,
    external_ref: i.registration_mode === "external" ? i.external_ref : null,
    course_id: i.course_id, attendance_completes_course: i.attendance_completes_course, certificate_on_attendance: i.certificate_on_attendance,
    feedback_enabled: i.feedback_enabled, is_training: kind.training,
  };
  let id = i.event_id;
  if (id) {
    const res = await db.from("events").update(row).eq("id", id).select("id");
    if (!check(res).length) throw new UserError("You do not have permission to edit this event.");
  } else {
    id = check(await db.from("events").insert({ ...row, org_id: session.orgId, status: "draft" }).select("id").single()).id;
  }
  if (i.online_url || i.joining_instructions) {
    check(await db.from("event_joining_details").upsert({ event_id: id, online_url: i.online_url, instructions: i.joining_instructions }));
  } else {
    check(await db.from("event_joining_details").delete().eq("event_id", id));
  }
  return { message: "Event saved.", redirect: `/events/${id}`, revalidate: ["/events", `/events/${id}`] };
}, { permission: ["events.manage"] });

export const publishEvent = defineAction(z.object({ event_id: zf.uuid() }), async (i, { db }) => {
  const e = check(await db.from("events").select("status, registration_mode, external_booking_url, visibility").eq("id", i.event_id).single());
  if (e.status !== "draft") throw new UserError("Only draft events can be published.");
  if (e.registration_mode === "external" && !safeBookingUrl(e.external_booking_url)) throw new UserError("Add a valid Octra-Lodge booking link before publishing.");
  const res = await db.from("events").update({ status: "published" }).eq("id", i.event_id).eq("status", "draft").select("id");
  if (!check(res).length) throw new UserError("You do not have permission to publish this event.");
  return { revalidate: ["/events", `/events/${i.event_id}`], redirect: `/events/${i.event_id}?done=published` };
}, { permission: ["events.manage"] });

export const unpublishEvent = defineAction(z.object({ event_id: zf.uuid() }), async (i, { db }) => {
  const { count } = await db.from("registrations").select("id", { count: "exact", head: true }).eq("event_id", i.event_id).in("status", ["confirmed", "waitlisted", "attended"]);
  if (count) throw new UserError("People have registered, so this event cannot return to draft. Cancel it instead if it is not going ahead.");
  const res = await db.from("events").update({ status: "draft" }).eq("id", i.event_id).eq("status", "published").select("id");
  if (!check(res).length) throw new UserError("Only published events can return to draft.");
  return { revalidate: ["/events", `/events/${i.event_id}`], redirect: `/events/${i.event_id}?done=draft` };
}, { permission: ["events.manage"] });

export const cancelEvent = defineAction(z.object({ event_id: zf.uuid(), reason: zf.required("Reason", 1000) }), async (i, { db }) => {
  check(await db.rpc("event_cancel", { p_event: i.event_id, p_reason: i.reason }));
  kickJobs();
  return { revalidate: ["/events", `/events/${i.event_id}`], redirect: `/events/${i.event_id}?done=cancelled` };
}, { permission: ["events.manage"] });

export const completeEvent = defineAction(z.object({ event_id: zf.uuid() }), async (i, { db }) => {
  check(await db.rpc("event_complete", { p_event: i.event_id }));
  kickJobs();
  return { revalidate: ["/events", `/events/${i.event_id}`], redirect: `/events/${i.event_id}?tab=registrations&done=completed` };
}, { permission: ["events.manage"] });

// ----- Trainers, invitations, resources ------------------------------------------

export const addTrainer = defineAction(z.object({ event_id: zf.uuid(), person_id: zf.uuid("Person"), role: z.enum(["trainer", "presenter", "host", "support"]) }), async (i, { db }) => {
  const p = (await db.from("persons").select("display_name").eq("id", i.person_id).maybeSingle()).data;
  if (!p) throw new UserError("That person could not be found.");
  check(await db.from("event_trainers").upsert({ event_id: i.event_id, person_id: i.person_id, display_name: p.display_name ?? "", role: i.role }));
  return { message: "Added.", revalidate: [`/events/${i.event_id}`] };
}, { permission: ["events.manage"] });

export const removeTrainer = defineAction(z.object({ event_id: zf.uuid(), person_id: zf.uuid() }), async (i, { db }) => {
  check(await db.from("event_trainers").delete().eq("event_id", i.event_id).eq("person_id", i.person_id));
  return { message: "Removed.", revalidate: [`/events/${i.event_id}`] };
}, { permission: ["events.manage"] });

export const inviteMember = defineAction(z.object({ event_id: zf.uuid(), person_id: zf.uuid("Person"), notify: zf.checkbox() }), async (i, { db, session }) => {
  const e = check(await db.from("events").select("title, status").eq("id", i.event_id).single());
  check(await db.from("event_invites").upsert({ event_id: i.event_id, person_id: i.person_id }, { onConflict: "event_id,person_id", ignoreDuplicates: true }));
  let notified = false;
  if (i.notify && e.status === "published") {
    // The invitation was written as the user (RLS-checked) before any system notice is sent.
    const svc = supabaseService();
    const { data: acc } = await svc.from("user_accounts").select("id").eq("person_id", i.person_id).eq("org_id", session.orgId).eq("status", "active").maybeSingle();
    if (acc) {
      await svc.rpc("admin_notify", { p_account: acc.id, p_type: "event", p_title: "You are invited to an event", p_body: e.title, p_link: `/academy/events/${i.event_id}`, p_dedupe: `invite:${i.event_id}:${i.person_id}` });
      notified = true;
    }
  }
  return { message: notified ? "Invited and notified in the Hub." : "Invited.", revalidate: [`/events/${i.event_id}`] };
}, { permission: ["events.manage"] });

export const removeInvite = defineAction(z.object({ event_id: zf.uuid(), person_id: zf.uuid() }), async (i, { db }) => {
  check(await db.from("event_invites").delete().eq("event_id", i.event_id).eq("person_id", i.person_id));
  return { message: "Invitation removed.", revalidate: [`/events/${i.event_id}`] };
}, { permission: ["events.manage"] });

export const addResource = defineAction(z.object({
  event_id: zf.uuid(), title: zf.required("Title", 200), url: optionalUrl(), document_id: zf.optionalUuid(), audience: z.enum(["presenter", "attendees"]),
}), async (i, { db }) => {
  if (!i.url && !i.document_id) throw new UserError("Add a link or choose a Library document.");
  const { count } = await db.from("event_resources").select("id", { count: "exact", head: true }).eq("event_id", i.event_id);
  check(await db.from("event_resources").insert({ event_id: i.event_id, title: i.title, url: i.url, document_id: i.document_id, audience: i.audience, position: count ?? 0 }));
  return { message: "Resource added.", revalidate: [`/events/${i.event_id}`] };
}, { permission: ["events.manage"] });

export const removeResource = defineAction(z.object({ event_id: zf.uuid(), resource_id: zf.uuid() }), async (i, { db }) => {
  check(await db.from("event_resources").delete().eq("id", i.resource_id).eq("event_id", i.event_id));
  return { message: "Removed.", revalidate: [`/events/${i.event_id}`] };
}, { permission: ["events.manage"] });

// ----- Registrations and attendance ---------------------------------------------

export const registerPerson = defineAction(z.object({ event_id: zf.uuid(), person_id: zf.uuid("Person") }), async (i, { db }) => {
  const r = check(await db.rpc("event_register_person", { p_event: i.event_id, p_person: i.person_id })) as { status: string; already?: boolean; waitlist_position?: number };
  kickJobs();
  const done = r.already ? "already" : r.status === "waitlisted" ? "waitlisted" : "registered";
  return { revalidate: [`/events/${i.event_id}`], redirect: `/events/${i.event_id}?tab=registrations&done=${done}` };
}, { permission: ["events.manage"] });

export const cancelRegistration = defineAction(z.object({ event_id: zf.uuid(), registration_id: zf.uuid() }), async (i, { db }) => {
  check(await db.rpc("event_cancel_registration", { p_registration: i.registration_id }));
  kickJobs();
  return { revalidate: [`/events/${i.event_id}`], redirect: `/events/${i.event_id}?tab=registrations&done=reg_cancelled` };
}, { permission: ["events.manage", "events.checkin"] });

export const setAttendance = defineAction(z.object({
  event_id: zf.uuid(), registration_id: zf.uuid(), status: z.enum(["attended", "no_show", "confirmed"]), reason: zf.required("Reason", 500),
}), async (i, { db }) => {
  check(await db.rpc("event_set_attendance", { p_registration: i.registration_id, p_status: i.status, p_reason: i.reason }));
  kickJobs();
  return { revalidate: [`/events/${i.event_id}`], redirect: `/events/${i.event_id}?tab=registrations&done=attendance` };
}, { permission: ["events.manage", "events.checkin"] });

export const moveWaitlist = defineAction(z.object({ event_id: zf.uuid(), registration_id: zf.uuid(), direction: z.enum(["up", "down"]) }), async (i, { db }) => {
  const list = check(await db.from("registrations").select("id, waitlist_position, registered_at").eq("event_id", i.event_id).eq("status", "waitlisted")
    .order("waitlist_position").order("registered_at"));
  const idx = list.findIndex((r) => r.id === i.registration_id);
  const swap = i.direction === "up" ? idx - 1 : idx + 1;
  if (idx < 0 || swap < 0 || swap >= list.length) return { revalidate: [`/events/${i.event_id}`] };
  const order = list.map((r) => r.id);
  [order[idx], order[swap]] = [order[swap], order[idx]];
  for (const [n, id] of order.entries()) {
    const res = await db.from("registrations").update({ waitlist_position: n + 1 }).eq("id", id).eq("status", "waitlisted").select("id");
    if (!check(res).length) throw new UserError("You do not have permission to reorder this waiting list.");
  }
  return { message: "Waiting list reordered.", revalidate: [`/events/${i.event_id}`] };
}, { permission: ["events.manage", "events.checkin"] });

export const setCheckin = defineAction(z.object({ event_id: zf.uuid(), open: z.enum(["true", "false"]), rotate: zf.checkbox(), from: z.enum(["event", "present"]).default("event") }), async (i, { db }) => {
  check(await db.rpc("event_set_checkin", { p_event: i.event_id, p_open: i.open === "true", p_rotate: i.rotate }));
  const done = i.open === "true" ? (i.rotate ? "checkin_rotated" : "checkin_open") : "checkin_closed";
  return {
    revalidate: [`/events/${i.event_id}`, `/events/${i.event_id}/present`],
    redirect: i.from === "present" ? `/events/${i.event_id}/present?done=${done}` : `/events/${i.event_id}?tab=checkin&done=${done}`,
  };
}, { permission: ["events.manage", "events.checkin"] });

/** Personal QR code scanned (or typed) by an organiser. */
export const checkInByCode = defineAction(z.object({ event_id: zf.uuid(), code: z.string().trim().min(6, "Enter the code").max(200) }), async (i, { db }) => {
  const raw = i.code.includes("code=") ? new URL(i.code, "https://x").searchParams.get("code") ?? "" : i.code;
  const code = raw.replace(/[^0-9a-f]/gi, "").toLowerCase();
  if (code.length < 12) throw new UserError("That code is not recognised.");
  const { data: reg } = await db.from("registrations").select("event_id").eq("checkin_code", code).maybeSingle();
  if (reg && reg.event_id !== i.event_id) throw new UserError("That code belongs to a different event.");
  const r = check(await db.rpc("event_check_in_code", { p_code: code })) as { name: string };
  kickJobs();
  return { message: `${r.name} is checked in.`, data: { name: r.name }, revalidate: [`/events/${i.event_id}`] };
}, { permission: ["events.manage", "events.checkin"] });
