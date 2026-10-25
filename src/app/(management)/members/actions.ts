"use server";

import { z } from "zod";
import { check, defineAction, UserError, zf } from "@/server/action";
import { kickJobs } from "@/server/jobs/kick";

const STAGES = ["enquirer", "applicant", "candidate", "entered_apprentice", "fellow_craft", "master_mason", "established"] as const;
const ROYAL_ARCH = ["not_discussed", "informed", "interested", "proposed", "exalted", "not_now"] as const;
const paths = (id: string) => [`/members/${id}`, "/members"];

export const updateJourney = defineAction(
  z.object({
    person_id: zf.uuid(),
    stage: z.enum(STAGES),
    royal_arch: z.enum(ROYAL_ARCH),
    journey_status: z.enum(["active", "paused", "closed"]),
    next_review_on: zf.optionalDate(),
    learning_opt_in: zf.checkbox(),
  }),
  async (i, { db, session }) => {
    const res = await db.from("member_journeys").upsert({ ...i, org_id: session.orgId }, { onConflict: "person_id" }).select("id");
    if (!check(res).length) throw new UserError("You can only update mentoring journeys for members of Lodges allocated to you.");
    return { message: "Mentoring journey saved.", revalidate: paths(i.person_id) };
  },
);

export const updatePersonalMentor = defineAction(
  z.object({
    person_id: zf.uuid(),
    personal_mentor_allocated: z.enum(["yes", "no", "unknown"]),
    personal_mentor_confirmed_on: zf.optionalDate(),
    personal_mentor_confirmed_by: zf.optionalUuid(),
    personal_mentor_person_id: zf.optionalUuid(),
    personal_mentor_review_on: zf.optionalDate(),
  }),
  async (i, { db, session }) => {
    if (i.personal_mentor_allocated !== "unknown" && !i.personal_mentor_confirmed_on) {
      throw new UserError("Record the date this was confirmed.");
    }
    const row = {
      ...i,
      org_id: session.orgId,
      // Who confirmed it: defaults to the person recording it.
      personal_mentor_confirmed_by: i.personal_mentor_confirmed_by ?? (i.personal_mentor_confirmed_on ? session.personId : null),
      // Recording the mentor's identity is optional, and only meaningful when one is allocated.
      personal_mentor_person_id: i.personal_mentor_allocated === "yes" ? i.personal_mentor_person_id : null,
    };
    const res = await db.from("member_journeys").upsert(row, { onConflict: "person_id" }).select("id");
    if (!check(res).length) throw new UserError("You can only update members of Lodges allocated to you.");
    return { message: "Personal Mentor allocation saved.", revalidate: paths(i.person_id) };
  },
);

export const logPersonContact = defineAction(
  z.object({
    person_id: zf.uuid(),
    method: z.enum(["telephone", "email", "online_meeting", "face_to_face", "lodge_visit", "other"]),
    occurred_on: zf.date(),
    summary: zf.required("Summary", 2000),
    outcome: zf.optionalText(1000),
    follow_up_on: zf.optionalDate(),
    visibility: z.enum(["ordinary", "team", "leadership"]).default("ordinary"),
    create_task: zf.checkbox(),
  }),
  async (i, { db, session }) => {
    const { create_task, ...contact } = i;
    check(await db.from("contacts").insert({ ...contact, org_id: session.orgId, owner_account_id: session.accountId, created_by: session.accountId }));
    if (create_task && i.follow_up_on) {
      check(await db.from("tasks").insert({ org_id: session.orgId, title: `Follow up: ${i.summary.slice(0, 80)}`, owner_account_id: session.accountId,
        due_on: i.follow_up_on, linked_type: "person", linked_id: i.person_id, created_by: session.accountId }));
    }
    return { message: "Contact recorded.", revalidate: [`/members/${i.person_id}`] };
  },
);

export const addPersonNote = defineAction(
  z.object({ person_id: zf.uuid(), body: zf.required("Note", 5000), visibility: z.enum(["ordinary", "team", "leadership"]), mentions: zf.list() }),
  async (i, { db, session }) => {
    // The id is generated here: notes' read policy cannot see a row inside its own INSERT ... RETURNING.
    const note = { id: crypto.randomUUID() };
    check(await db.from("notes").insert({ id: note.id, org_id: session.orgId, subject_type: "person", subject_id: i.person_id,
      visibility: i.visibility, body: i.body, author_account_id: session.accountId }));
    if (i.mentions.length) check(await db.from("note_mentions").insert(i.mentions.map((a) => ({ note_id: note.id, account_id: a }))));
    kickJobs();
    return { message: "Note added.", revalidate: [`/members/${i.person_id}`] };
  },
);

export const recordCorrection = defineAction(
  z.object({
    person_id: zf.uuid(),
    field: z.enum(["title", "first_name", "last_name", "email", "phone"]),
    value: zf.optionalText(200),
    reason: zf.required("Reason", 500),
  }),
  async (i, { db }) => {
    check(await db.rpc("person_record_correction", { p_person: i.person_id, p_field: i.field, p_value: i.value ?? "", p_reason: i.reason }));
    return { message: "Correction recorded. Membership imports will not overwrite it.", revalidate: paths(i.person_id) };
  },
);

export const clearCorrection = defineAction(
  z.object({ person_id: zf.uuid(), field: z.enum(["title", "first_name", "last_name", "email", "phone"]) }),
  async (i, { db }) => {
    check(await db.rpc("person_clear_correction", { p_person: i.person_id, p_field: i.field }));
    return { message: "The next membership import may update this detail again.", revalidate: paths(i.person_id) };
  },
);

export const recordDegree = defineAction(
  z.object({
    person_id: zf.uuid(),
    kind: z.enum(["initiation", "passing", "raising", "joining", "exaltation"]),
    event_date: zf.date(),
    lodge_id: zf.optionalUuid(),
  }),
  async (i, { db, session }) => {
    if (i.event_date > new Date().toISOString().slice(0, 10)) throw new UserError("The date cannot be in the future.");
    const res = await db.from("degree_events").insert({ ...i, org_id: session.orgId, source: "local" }).select("id");
    if (!check(res).length) throw new UserError("You can only record degrees for members of Lodges allocated to you.");
    return { message: "Degree recorded.", revalidate: paths(i.person_id) };
  },
);

export const handleContactChangeRequest = defineAction(
  z.object({ person_id: zf.uuid(), request_id: zf.uuid(), status: z.enum(["done", "declined"]), handled_note: zf.optionalText(1000) }),
  async (i, { db, session }) => {
    const res = await db.from("contact_change_requests").update({ status: i.status, handled_note: i.handled_note, handled_by: session.accountId, handled_at: new Date().toISOString() })
      .eq("id", i.request_id).eq("status", "open").select("id");
    if (!check(res).length) throw new UserError("This request has already been handled, or you cannot handle it.");
    return { message: i.status === "done" ? "Marked as done." : "Request declined.", revalidate: paths(i.person_id) };
  },
);
