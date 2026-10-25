"use server";

import { z } from "zod";
import { check, defineAction, UserError, zf } from "@/server/action";
import { kickJobs } from "@/server/jobs/kick";

const caseId = zf.uuid("Request");
const paths = (id: string) => [`/support/${id}`, "/support"];

export const createRequest = defineAction(
  z.object({
    category_key: z.string().regex(/^[a-z_]+$/, "Choose a category"),
    title: zf.required("Summary", 200),
    description: zf.optionalText(5000),
    lodge_id: zf.optionalUuid(),
    member_person_id: zf.optionalUuid(),
    requester_person_id: zf.optionalUuid(),
    owner_account_id: zf.optionalUuid(),
    priority: z.enum(["low", "normal", "high"]),
    due_on: zf.optionalDate(),
    source: z.enum(["hub", "email", "telephone", "meeting"]),
  }),
  async (i, { db, session }) => {
    if (i.category_key === "confidential") throw new UserError("Confidential concerns use the separate confidential route.");
    const created = check(await db.from("cases").insert({
      ...i, org_id: session.orgId, kind: "request", requester_account_id: session.accountId,
      requester_person_id: i.requester_person_id ?? session.personId,
      reference: "pending", // replaced by the database
    }).select("id").single());
    kickJobs();
    return { redirect: `/support/${created.id}?created=1`, revalidate: ["/support"] };
  },
  { permission: ["cases.write.all", "cases.write.allocated"] },
);

export const submitConfidential = defineAction(
  z.object({
    title: zf.required("Summary", 200),
    description: zf.required("Details", 8000),
    lodge_id: zf.optionalUuid(),
    member_person_id: zf.optionalUuid(),
    acknowledge: zf.checkbox(),
  }),
  async (i, { db, session }) => {
    if (!i.acknowledge) throw new UserError("Please confirm you have read the guidance about welfare, safeguarding and disciplinary matters.");
    const { acknowledge: _ack, ...rest } = i;
    void _ack;
    const created = check(await db.from("cases").insert({
      ...rest, org_id: session.orgId, kind: "confidential", category_key: "confidential", priority: "normal",
      requester_account_id: session.accountId, requester_person_id: session.personId, reference: "pending",
    }).select("id").single());
    kickJobs();
    return { redirect: `/support/${created.id}?submitted=1` };
  },
  { permission: ["cases.confidential.submit"] },
);

export const updateCase = defineAction(
  z.object({
    case_id: caseId,
    status: z.enum(["new", "assigned", "in_progress", "awaiting_response"]),
    priority: z.enum(["low", "normal", "high"]),
    due_on: zf.optionalDate(),
    owner_account_id: zf.optionalUuid(),
    member_person_id: zf.optionalUuid(),
    category_key: z.string().regex(/^[a-z_]+$/).optional(),
  }),
  async (i, { db }) => {
    const { case_id, member_person_id, category_key, ...rest } = i;
    const { owner_account_id, ...base } = rest;
    const patch: { status: string; priority: string; due_on: string | null; owner_account_id?: string; member_person_id?: string; category_key?: string } = { ...base };
    // A blank owner keeps the current one: this form reassigns, it never unassigns.
    if (owner_account_id) patch.owner_account_id = owner_account_id;
    if (member_person_id) patch.member_person_id = member_person_id;
    if (category_key && category_key !== "confidential") patch.category_key = category_key;
    const res = await db.from("cases").update(patch).eq("id", case_id).select("id");
    if (!check(res).length) throw new UserError("You can only update requests you are responsible for.");
    kickJobs();
    return { message: "Request updated.", revalidate: paths(case_id) };
  },
);

export const addCaseComment = defineAction(
  z.object({ case_id: caseId, body: zf.required("Update", 5000), visible_to_requester: zf.checkbox() }),
  async (i, { db, session }) => {
    check(await db.from("case_events").insert({ org_id: session.orgId, case_id: i.case_id, kind: "comment", body: i.body,
      visible_to_requester: i.visible_to_requester, created_by: session.accountId }));
    return { message: "Update added.", revalidate: [`/support/${i.case_id}`] };
  },
);

export const addCaseAction = defineAction(
  z.object({ case_id: caseId, title: zf.required("Action", 200), owner_account_id: zf.optionalUuid(), due_on: zf.optionalDate(), priority: z.enum(["low", "normal", "high"]) }),
  async (i, { db, session }) => {
    const c = check(await db.from("cases").select("kind, lodge_id").eq("id", i.case_id).single());
    // The id is generated here: tasks' read policy cannot see a row inside its own INSERT ... RETURNING.
    const task = { id: crypto.randomUUID() };
    check(await db.from("tasks").insert({
      id: task.id, org_id: session.orgId, title: i.title, owner_account_id: i.owner_account_id ?? session.accountId, due_on: i.due_on, priority: i.priority,
      linked_type: "case", linked_id: i.case_id, created_by: session.accountId,
      // A confidential concern never surfaces on a Lodge, so its tasks carry no Lodge.
      lodge_id: c.kind === "request" ? c.lodge_id : null,
    }));
    check(await db.from("case_events").insert({ org_id: session.orgId, case_id: i.case_id, kind: "action", body: i.title,
      data: { task_id: task.id }, created_by: session.accountId }));
    kickJobs();
    return { message: "Action added to the task list.", revalidate: [`/support/${i.case_id}`, "/tasks"] };
  },
);

export const escalateCase = defineAction(
  z.object({ case_id: caseId, to_account_id: zf.uuid("Who to escalate to"), note: zf.required("Reason", 2000) }),
  async (i, { db }) => {
    check(await db.rpc("case_escalate", { p_case: i.case_id, p_to_account: i.to_account_id, p_note: i.note }));
    kickJobs();
    return { message: "Escalated. They have been notified.", revalidate: paths(i.case_id) };
  },
);

export const closeCase = defineAction(
  z.object({ case_id: caseId, status: z.enum(["resolved", "closed"]), outcome: zf.required("Outcome", 5000), visible_to_requester: zf.checkbox() }),
  async (i, { db, session }) => {
    const res = await db.from("cases").update({ status: i.status, outcome: i.outcome }).eq("id", i.case_id).select("id");
    if (!check(res).length) throw new UserError("You can only close requests you are responsible for.");
    check(await db.from("case_events").insert({ org_id: session.orgId, case_id: i.case_id, kind: "outcome", body: i.outcome,
      visible_to_requester: i.visible_to_requester, created_by: session.accountId }));
    kickJobs();
    return { message: i.status === "resolved" ? "Request resolved." : "Request closed.", revalidate: paths(i.case_id) };
  },
);

export const reopenCase = defineAction(
  z.object({ case_id: caseId, reason: zf.required("Reason", 2000) }),
  async (i, { db, session }) => {
    const res = await db.from("cases").update({ status: "in_progress" }).eq("id", i.case_id).select("id");
    if (!check(res).length) throw new UserError("You can only reopen requests you are responsible for.");
    check(await db.from("case_events").insert({ org_id: session.orgId, case_id: i.case_id, kind: "comment", body: `Reopened: ${i.reason}`, created_by: session.accountId }));
    return { message: "Request reopened.", revalidate: paths(i.case_id) };
  },
);

export const triageCase = defineAction(
  z.object({
    case_id: caseId,
    action: z.enum(["assign", "refer", "close"]),
    owner_account_id: zf.optionalUuid(),
    referred_to: zf.optionalText(300),
    note: zf.optionalText(2000),
  }),
  async (i, { db }) => {
    check(await db.rpc("case_triage", { p_case: i.case_id, p_action: i.action, p_owner: i.owner_account_id as string, p_referred_to: i.referred_to as string, p_note: i.note as string }));
    kickJobs();
    // The triage panel disappears once decided, so confirm on the page itself.
    return { redirect: `/support/${i.case_id}?triaged=${i.action}`, revalidate: paths(i.case_id) };
  },
  { permission: ["cases.confidential.triage"] },
);

export const grantCaseAccess = defineAction(
  z.object({ case_id: caseId, account_id: zf.uuid("Person"), reason: zf.required("Reason", 1000) }),
  async (i, { db }) => {
    check(await db.rpc("case_grant_access", { p_case: i.case_id, p_account: i.account_id, p_reason: i.reason }));
    return { message: "Access granted and recorded.", revalidate: [`/support/${i.case_id}`] };
  },
);

export const addRestrictedNote = defineAction(
  z.object({ case_id: caseId, body: zf.required("Note", 5000) }),
  async (i, { db, session }) => {
    check(await db.from("notes").insert({ org_id: session.orgId, subject_type: "case", subject_id: i.case_id, visibility: "restricted",
      body: i.body, author_account_id: session.accountId }));
    return { message: "Restricted note added.", revalidate: [`/support/${i.case_id}`] };
  },
  { permission: ["notes.restricted"] },
);
