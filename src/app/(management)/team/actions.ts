"use server";

import { z } from "zod";
import { check, defineAction, UserError, zf } from "@/server/action";
import { kickJobs } from "@/server/jobs/kick";

const meetingId = zf.uuid("Meeting");
const mpaths = (id: string) => [`/team/meetings/${id}`, "/team/meetings", "/team"];
const refused = "You do not have permission to change this meeting.";
const optionalDateTime = () => z.string().optional().transform((v) => (v ? new Date(v).toISOString() : null));
const optionalUrl = () => z.string().trim().max(500).optional().transform((v) => (v ? v : null))
  .pipe(z.string().regex(/^https?:\/\//i, "Enter a full web address starting with https://").nullable());

// ---------------------------------------------------------------------------
// Announcements
// ---------------------------------------------------------------------------
export const postAnnouncement = defineAction(
  z.object({
    title: zf.required("Title", 200),
    body: zf.required("Message", 5000),
    audience: z.enum(["team", "leadership"]),
    pinned: zf.checkbox(),
    expires_on: zf.optionalDate(),
  }),
  async (i, { db, session }) => {
    if (i.audience === "leadership" && !session.permissions.has("notes.leadership")) throw new UserError("Only leadership can post to the leadership audience.");
    check(await db.from("announcements").insert({
      org_id: session.orgId, title: i.title, body: i.body, audience: i.audience, pinned: i.pinned,
      expires_at: i.expires_on ? new Date(`${i.expires_on}T23:59:59Z`).toISOString() : null, created_by: session.accountId,
    }));
    return { message: "Announcement posted.", revalidate: ["/team"] };
  },
  { permission: ["team.announce"] },
);

export const setAnnouncementPinned = defineAction(
  z.object({ announcement_id: zf.uuid(), pinned: z.enum(["true", "false"]) }),
  async (i, { db }) => {
    const res = await db.from("announcements").update({ pinned: i.pinned === "true" }).eq("id", i.announcement_id).select("id");
    if (!check(res).length) throw new UserError("You do not have permission to change announcements.");
    return { revalidate: ["/team"] };
  },
  { permission: ["team.announce"] },
);

export const withdrawAnnouncement = defineAction(
  z.object({ announcement_id: zf.uuid() }),
  async (i, { db }) => {
    const res = await db.from("announcements").update({ expires_at: new Date().toISOString(), pinned: false }).eq("id", i.announcement_id).select("id");
    if (!check(res).length) throw new UserError("You do not have permission to change announcements.");
    return { message: "Announcement withdrawn.", revalidate: ["/team"] };
  },
  { permission: ["team.announce"] },
);

// ---------------------------------------------------------------------------
// Meetings
// ---------------------------------------------------------------------------
const meetingFields = {
  title: zf.required("Title", 200),
  kind: z.enum(["team", "apgmen", "leadership", "working_group", "other"]),
  starts_at: zf.datetime("Start"),
  ends_at: optionalDateTime(),
  location: zf.optionalText(300),
  online_url: optionalUrl(),
};

export const createMeeting = defineAction(
  z.object({ ...meetingFields, invite_me: zf.checkbox() }),
  async (i, { db, session }) => {
    if (i.ends_at && i.ends_at <= i.starts_at) throw new UserError("The end must be after the start.");
    const { invite_me, ...m } = i;
    // The id is generated here: the meetings read policy cannot see a row inside its own INSERT ... RETURNING.
    const created = { id: crypto.randomUUID() };
    check(await db.from("meetings").insert({ ...m, id: created.id, org_id: session.orgId, created_by: session.accountId }));
    if (invite_me) check(await db.from("meeting_attendees").insert({ meeting_id: created.id, person_id: session.personId }));
    return { redirect: `/team/meetings/${created.id}`, revalidate: ["/team/meetings", "/team"] };
  },
  { permission: ["meetings.manage"] },
);

export const updateMeeting = defineAction(
  z.object({ meeting_id: meetingId, ...meetingFields, status: z.enum(["scheduled", "held", "cancelled"]) }),
  async (i, { db }) => {
    if (i.ends_at && i.ends_at <= i.starts_at) throw new UserError("The end must be after the start.");
    const { meeting_id, ...rest } = i;
    const res = await db.from("meetings").update(rest).eq("id", meeting_id).select("id");
    if (!check(res).length) throw new UserError(refused);
    return { message: "Meeting saved.", revalidate: mpaths(meeting_id) };
  },
  { permission: ["meetings.manage"] },
);

export const addAgendaItem = defineAction(
  z.object({
    meeting_id: meetingId, title: zf.required("Item", 300), presenter_person_id: zf.optionalUuid(), notes: zf.optionalText(3000),
    document_id: zf.optionalUuid(), document_url: optionalUrl(),
  }),
  async (i, { db }) => {
    const { data: last } = await db.from("meeting_agenda_items").select("position").eq("meeting_id", i.meeting_id).order("position", { ascending: false }).limit(1);
    check(await db.from("meeting_agenda_items").insert({ ...i, position: (last?.[0]?.position ?? 0) + 1 }));
    return { message: "Agenda item added.", revalidate: [`/team/meetings/${i.meeting_id}`] };
  },
  { permission: ["meetings.manage"] },
);

export const updateAgendaItem = defineAction(
  z.object({
    meeting_id: meetingId, item_id: zf.uuid(), title: zf.required("Item", 300), presenter_person_id: zf.optionalUuid(), notes: zf.optionalText(3000),
    document_id: zf.optionalUuid(), document_url: optionalUrl(),
  }),
  async (i, { db }) => {
    const { meeting_id, item_id, presenter_person_id, ...rest } = i;
    const patch = presenter_person_id ? { ...rest, presenter_person_id } : rest;
    const res = await db.from("meeting_agenda_items").update(patch).eq("id", item_id).eq("meeting_id", meeting_id).select("id");
    if (!check(res).length) throw new UserError(refused);
    return { message: "Agenda item saved.", revalidate: [`/team/meetings/${meeting_id}`] };
  },
  { permission: ["meetings.manage"] },
);

export const moveAgendaItem = defineAction(
  z.object({ meeting_id: meetingId, item_id: zf.uuid(), direction: z.enum(["up", "down"]) }),
  async (i, { db }) => {
    const items = check(await db.from("meeting_agenda_items").select("id, position").eq("meeting_id", i.meeting_id).order("position").order("id"));
    const idx = items.findIndex((x) => x.id === i.item_id);
    const swap = i.direction === "up" ? idx - 1 : idx + 1;
    if (idx < 0 || swap < 0 || swap >= items.length) return { revalidate: [] };
    const order = items.map((x) => x.id);
    [order[idx], order[swap]] = [order[swap], order[idx]];
    for (const [n, id] of order.entries()) {
      check(await db.from("meeting_agenda_items").update({ position: n + 1 }).eq("id", id));
    }
    return { revalidate: [`/team/meetings/${i.meeting_id}`] };
  },
  { permission: ["meetings.manage"] },
);

export const removeAgendaItem = defineAction(
  z.object({ meeting_id: meetingId, item_id: zf.uuid() }),
  async (i, { db }) => {
    const res = await db.from("meeting_agenda_items").delete().eq("id", i.item_id).eq("meeting_id", i.meeting_id).select("id");
    if (!check(res).length) throw new UserError(refused);
    return { message: "Agenda item removed.", revalidate: [`/team/meetings/${i.meeting_id}`] };
  },
  { permission: ["meetings.manage"] },
);

export const addAttendee = defineAction(
  z.object({ meeting_id: meetingId, person_id: zf.uuid("Person") }),
  async (i, { db }) => {
    const res = await db.from("meeting_attendees").upsert({ meeting_id: i.meeting_id, person_id: i.person_id }, { onConflict: "meeting_id,person_id", ignoreDuplicates: true });
    check(res);
    return { message: "Added to the meeting.", revalidate: [`/team/meetings/${i.meeting_id}`] };
  },
  { permission: ["meetings.manage"] },
);

export const setAttendance = defineAction(
  z.object({ meeting_id: meetingId, person_id: zf.uuid(), attendance: z.enum(["invited", "attended", "apologies", "absent"]) }),
  async (i, { db }) => {
    const res = await db.from("meeting_attendees").update({ attendance: i.attendance }).eq("meeting_id", i.meeting_id).eq("person_id", i.person_id).select("person_id");
    if (!check(res).length) throw new UserError(refused);
    return { revalidate: [`/team/meetings/${i.meeting_id}`] };
  },
  { permission: ["meetings.manage"] },
);

export const removeAttendee = defineAction(
  z.object({ meeting_id: meetingId, person_id: zf.uuid() }),
  async (i, { db }) => {
    check(await db.from("meeting_attendees").delete().eq("meeting_id", i.meeting_id).eq("person_id", i.person_id));
    return { revalidate: [`/team/meetings/${i.meeting_id}`] };
  },
  { permission: ["meetings.manage"] },
);

export const saveMinutes = defineAction(
  z.object({ meeting_id: meetingId, minutes: zf.required("Minutes", 50000) }),
  async (i, { db }) => {
    // Editing approved minutes returns them to draft for re-approval.
    const res = await db.from("meetings").update({ minutes: i.minutes, minutes_status: "draft", minutes_approved_by: null }).eq("id", i.meeting_id).select("id");
    if (!check(res).length) throw new UserError(refused);
    return { message: "Draft minutes saved.", revalidate: mpaths(i.meeting_id) };
  },
  { permission: ["meetings.manage"] },
);

export const approveMinutes = defineAction(
  z.object({ meeting_id: meetingId }),
  async (i, { db, session }) => {
    const m = check(await db.from("meetings").select("minutes, minutes_status").eq("id", i.meeting_id).single());
    if (!m.minutes) throw new UserError("There are no minutes to approve.");
    if (m.minutes_status === "approved") throw new UserError("These minutes are already approved.");
    const res = await db.from("meetings").update({ minutes_status: "approved", minutes_approved_by: session.accountId }).eq("id", i.meeting_id).select("id");
    if (!check(res).length) throw new UserError(refused);
    return { message: "Minutes approved.", revalidate: mpaths(i.meeting_id) };
  },
  { permission: ["meetings.manage"] },
);

export const addDecision = defineAction(
  z.object({ meeting_id: meetingId, decision: zf.required("Decision", 3000), agenda_item_id: zf.optionalUuid() }),
  async (i, { db, session }) => {
    check(await db.from("meeting_decisions").insert({ ...i, recorded_by: session.accountId }));
    return { message: "Decision recorded.", revalidate: [`/team/meetings/${i.meeting_id}`] };
  },
  { permission: ["meetings.manage"] },
);

export const addMeetingAction = defineAction(
  z.object({ meeting_id: meetingId, title: zf.required("Action", 200), owner_account_id: zf.optionalUuid(), due_on: zf.optionalDate(), priority: z.enum(["low", "normal", "high"]) }),
  async (i, { db, session }) => {
    // Reading the meeting as the user confirms they can see it before linking work to it.
    const m = await db.from("meetings").select("id").eq("id", i.meeting_id).maybeSingle();
    if (!m.data) throw new UserError("Meeting not found.");
    check(await db.from("tasks").insert({ org_id: session.orgId, title: i.title, owner_account_id: i.owner_account_id ?? session.accountId, due_on: i.due_on,
      priority: i.priority, linked_type: "meeting", linked_id: i.meeting_id, created_by: session.accountId }));
    kickJobs();
    return { message: "Action added to the task list.", revalidate: [`/team/meetings/${i.meeting_id}`, "/tasks"] };
  },
  { permission: ["meetings.manage"] },
);

// ---------------------------------------------------------------------------
// Team notes
// ---------------------------------------------------------------------------
export const addTeamNote = defineAction(
  z.object({ body: zf.required("Note", 5000), visibility: z.enum(["team", "leadership"]), mentions: zf.list() }),
  async (i, { db, session }) => {
    const note = { id: crypto.randomUUID() };
    check(await db.from("notes").insert({ id: note.id, org_id: session.orgId, subject_type: "general", visibility: i.visibility, body: i.body, author_account_id: session.accountId }));
    if (i.mentions.length) check(await db.from("note_mentions").insert(i.mentions.map((a) => ({ note_id: note.id, account_id: a }))));
    kickJobs();
    return { message: "Note added.", revalidate: ["/team/notes", "/team"] };
  },
  { permission: ["notes.team", "notes.leadership"] },
);

export const archiveTeamNote = defineAction(
  z.object({ note_id: zf.uuid() }),
  async (i, { db }) => {
    const res = await db.from("notes").update({ archived_at: new Date().toISOString() }).eq("id", i.note_id).select("id");
    if (!check(res).length) throw new UserError("You can only archive notes you wrote.");
    return { message: "Note archived.", revalidate: ["/team/notes", "/team"] };
  },
);
