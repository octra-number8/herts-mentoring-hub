"use server";

import { z } from "zod";
import { check, defineAction, UserError, zf } from "@/server/action";
import { kickJobs } from "@/server/jobs/kick";

const OFFICES = ["worshipful_master", "secretary", "lodge_mentor", "assistant_lodge_mentor", "membership_officer", "almoner", "director_of_ceremonies", "royal_arch_representative", "charity_steward"] as const;

export const updateLodgeDetails = defineAction(
  z.object({
    lodge_id: zf.uuid(),
    name: zf.required("Lodge name", 200),
    meeting_centre_id: zf.optionalUuid(),
    meeting_pattern: zf.optionalText(200),
    installation_month: zf.optionalInt(),
    status: z.enum(["active", "in_abeyance", "amalgamated", "erased", "consecrating"]),
    website: zf.optionalText(300),
    email: zf.optionalText(200),
  }),
  async (i, { db }) => {
    const { lodge_id, ...rest } = i;
    const res = await db.from("lodges").update(rest).eq("id", lodge_id).select("id");
    if (!check(res).length) throw new UserError("You can only edit Lodges allocated to you.");
    return { message: "Lodge details saved.", revalidate: [`/lodges/${lodge_id}`, "/lodges"] };
  },
);

export const changeMentoringStatus = defineAction(
  z.object({ lodge_id: zf.uuid(), status_id: zf.uuid("Status"), note: zf.optionalText(1000) }),
  async (i, { db, session }) => {
    const res = await db.from("lodges").update({ mentoring_status_id: i.status_id }).eq("id", i.lodge_id).select("id");
    if (!check(res).length) throw new UserError("You can only update Lodges allocated to you.");
    if (i.note) {
      await db.from("notes").insert({ org_id: session.orgId, subject_type: "lodge", subject_id: i.lodge_id, lodge_id: i.lodge_id, visibility: "ordinary", body: `Status changed: ${i.note}`, author_account_id: session.accountId });
    }
    return { message: "Mentoring status updated.", revalidate: [`/lodges/${i.lodge_id}`, "/lodges"] };
  },
);

export const updateMentoringArrangements = defineAction(
  z.object({
    lodge_id: zf.uuid(),
    personal_mentors_for_new_members: z.enum(["yes", "no", "partly", "unknown"]),
    arrangements: zf.optionalText(2000),
    guidance_used: zf.optionalText(1000),
    training_requirements: zf.optionalText(1000),
    improvement_opportunities: zf.optionalText(1000),
    good_practice: zf.optionalText(1000),
    next_review_on: zf.optionalDate(),
  }),
  async (i, { db, session }) => {
    check(await db.from("lodge_mentoring_profiles").upsert({ ...i, org_id: session.orgId, updated_by: session.accountId, updated_at: new Date().toISOString() }));
    return { message: "Mentoring arrangements saved.", revalidate: [`/lodges/${i.lodge_id}`] };
  },
);

export const recordAppointment = defineAction(
  z.object({
    lodge_id: zf.uuid(),
    office: z.enum(OFFICES),
    person_id: zf.optionalUuid(),
    starts_on: zf.date("Start date"),
    confirmed: zf.checkbox(),
    vacant: zf.checkbox(),
  }),
  async (i, { db }) => {
    if (!i.vacant && !i.person_id) throw new UserError("Choose the Brother appointed, or record the office as vacant.");
    check(await db.rpc("record_lodge_appointment", { p_lodge: i.lodge_id, p_office: i.office, p_person: (i.vacant ? null : i.person_id) as string, p_starts: i.starts_on, p_confirmed: i.confirmed }));
    kickJobs();
    return { message: "Appointment recorded. The previous holder's dates are kept in the history.", revalidate: [`/lodges/${i.lodge_id}`, "/lodges"] };
  },
);

export const logContact = defineAction(
  z.object({
    lodge_id: zf.uuid(),
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
        due_on: i.follow_up_on, lodge_id: i.lodge_id, linked_type: "lodge", linked_id: i.lodge_id, created_by: session.accountId }));
    }
    return { message: "Contact recorded.", revalidate: [`/lodges/${i.lodge_id}`] };
  },
);

export const planVisit = defineAction(
  z.object({
    lodge_id: zf.uuid(),
    planned_for: zf.datetime("Date and time"),
    purpose: zf.required("Purpose", 500),
    add_to_calendar: zf.checkbox(),
  }),
  async (i, { db, session }) => {
    const visit = check(await db.from("visits").insert({ org_id: session.orgId, lodge_id: i.lodge_id, planned_for: i.planned_for, purpose: i.purpose, created_by: session.accountId }).select("id").single());
    await db.from("visit_participants").insert({ visit_id: visit.id, person_id: session.personId, role: "lead" });
    if (i.add_to_calendar && session.permissions.has("events.manage")) {
      const { data: lodge } = await db.from("lodges").select("name, number").eq("id", i.lodge_id).single();
      const end = new Date(new Date(i.planned_for).getTime() + 2 * 3600000).toISOString();
      const ev = await db.from("events").insert({ org_id: session.orgId, title: `Visit: ${lodge?.name} No. ${lodge?.number}`, kind: "lodge_visit", visibility: "internal",
        registration_mode: "none", status: "published", starts_at: i.planned_for, ends_at: end, lodge_id: i.lodge_id, description: i.purpose }).select("id").single();
      if (ev.data) await db.from("visits").update({ calendar_event_id: ev.data.id }).eq("id", visit.id);
    }
    return { message: "Visit planned.", revalidate: [`/lodges/${i.lodge_id}`] };
  },
);

export const completeVisit = defineAction(
  z.object({
    lodge_id: zf.uuid(), visit_id: zf.uuid(),
    status: z.enum(["completed", "postponed", "cancelled"]),
    outcome: zf.optionalText(2000), follow_up: zf.optionalText(1000), follow_up_on: zf.optionalDate(),
  }),
  async (i, { db, session }) => {
    const res = await db.from("visits").update({ status: i.status, outcome: i.outcome, follow_up: i.follow_up, completed_at: i.status === "completed" ? new Date().toISOString() : null }).eq("id", i.visit_id).select("id");
    if (!check(res).length) throw new UserError("You can only update visits for Lodges allocated to you.");
    if (i.follow_up && i.follow_up_on) {
      check(await db.from("tasks").insert({ org_id: session.orgId, title: `Visit follow-up: ${i.follow_up.slice(0, 80)}`, owner_account_id: session.accountId, due_on: i.follow_up_on,
        lodge_id: i.lodge_id, linked_type: "visit", linked_id: i.visit_id, created_by: session.accountId }));
    }
    return { message: "Visit updated.", revalidate: [`/lodges/${i.lodge_id}`] };
  },
);

export const recordReview = defineAction(
  z.object({
    lodge_id: zf.uuid(),
    review_date: zf.date(),
    lodge_mentor_in_place: z.enum(["yes", "no", "unknown"]),
    personal_mentors_in_place: z.enum(["yes", "no", "partly", "unknown"]),
    what_is_working: zf.optionalText(2000),
    support_wanted: zf.optionalText(2000),
    training_needs: zf.optionalText(1000),
    next_review_on: zf.optionalDate(),
  }),
  async (i, { db, session }) => {
    check(await db.from("lodge_reviews").insert({ ...i, org_id: session.orgId, reviewed_by: session.personId }));
    check(await db.from("lodge_mentoring_profiles").upsert({ lodge_id: i.lodge_id, org_id: session.orgId, last_review_on: i.review_date, next_review_on: i.next_review_on,
      personal_mentors_for_new_members: i.personal_mentors_in_place, updated_by: session.accountId, updated_at: new Date().toISOString() }));
    return { message: "Review recorded. Thank you.", revalidate: [`/lodges/${i.lodge_id}`] };
  },
);

export const addLodgeNote = defineAction(
  z.object({ lodge_id: zf.uuid(), body: zf.required("Note", 5000), visibility: z.enum(["ordinary", "team", "leadership"]), mentions: zf.list() }),
  async (i, { db, session }) => {
    const note = check(await db.from("notes").insert({ org_id: session.orgId, subject_type: "lodge", subject_id: i.lodge_id, lodge_id: i.lodge_id,
      visibility: i.visibility, body: i.body, author_account_id: session.accountId }).select("id").single());
    if (i.mentions.length) check(await db.from("note_mentions").insert(i.mentions.map((a) => ({ note_id: note.id, account_id: a }))));
    kickJobs();
    return { message: "Note added.", revalidate: [`/lodges/${i.lodge_id}`] };
  },
);

export const addLodgeTask = defineAction(
  z.object({ lodge_id: zf.uuid(), title: zf.required("Title", 200), owner_account_id: zf.optionalUuid(), due_on: zf.optionalDate(), priority: z.enum(["low", "normal", "high"]) }),
  async (i, { db, session }) => {
    check(await db.from("tasks").insert({ org_id: session.orgId, title: i.title, owner_account_id: i.owner_account_id ?? session.accountId, due_on: i.due_on, priority: i.priority,
      lodge_id: i.lodge_id, linked_type: "lodge", linked_id: i.lodge_id, created_by: session.accountId }));
    kickJobs();
    return { message: "Task created.", revalidate: [`/lodges/${i.lodge_id}`] };
  },
);

export const decideProposal = defineAction(
  z.object({ lodge_id: zf.uuid(), proposal_id: zf.uuid(), decision: z.enum(["accepted", "rejected"]), decision_note: zf.optionalText(1000) }),
  async (i, { db, session }) => {
    const p = check(await db.from("lodge_change_proposals").select("changes, status").eq("id", i.proposal_id).single());
    if (p.status !== "pending") throw new UserError("This proposal has already been decided.");
    if (i.decision === "accepted") {
      const allowed = ["meeting_pattern", "website", "email", "installation_month"];
      const changes = Object.fromEntries(Object.entries(p.changes as Record<string, unknown>).filter(([k]) => allowed.includes(k)));
      if (Object.keys(changes).length) check(await db.from("lodges").update(changes as never).eq("id", i.lodge_id).select("id"));
    }
    check(await db.from("lodge_change_proposals").update({ status: i.decision, decided_by: session.accountId, decided_at: new Date().toISOString(), decision_note: i.decision_note }).eq("id", i.proposal_id));
    return { message: i.decision === "accepted" ? "Change applied." : "Proposal declined.", revalidate: [`/lodges/${i.lodge_id}`] };
  },
);

export const saveLodgeView = defineAction(
  z.object({ name: zf.required("Name", 80), filters: z.string() }),
  async (i, { db, session }) => {
    check(await db.from("saved_views").insert({ org_id: session.orgId, account_id: session.accountId, page: "lodges", name: i.name, filters: JSON.parse(i.filters) }));
    return { message: "View saved.", revalidate: ["/lodges"] };
  },
);

export const deleteSavedView = defineAction(
  z.object({ view_id: zf.uuid() }),
  async (i, { db }) => {
    check(await db.from("saved_views").delete().eq("id", i.view_id));
    return { revalidate: ["/lodges"] };
  },
);
