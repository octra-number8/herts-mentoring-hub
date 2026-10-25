"use server";

import { z } from "zod";
import { check, defineAction, UserError, zf } from "@/server/action";
import { portalScope } from "@/server/admin/portal-scope";
import { kickJobs } from "@/server/jobs/kick";

// Portal users hold lodge_portal.* only through activation, which can be per
// Lodge, so these actions check the portal scope rather than a session permission.
// Row-level security enforces the same rules in the database.

export const proposeChange = defineAction(
  z.object({
    lodge_id: zf.uuid(), meeting_pattern: zf.optionalText(200), website: zf.optionalText(300), email: zf.optionalText(200),
    installation_month: zf.optionalInt(), note: zf.optionalText(1000),
  }),
  async (i, { db, session }) => {
    if (!(await portalScope()).update.includes(i.lodge_id)) throw new UserError("Proposing changes is not switched on for you.");
    if (i.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(i.email)) throw new UserError("Enter a valid Lodge email address.");
    if (i.installation_month !== null && (i.installation_month < 1 || i.installation_month > 12)) throw new UserError("Choose a month.");
    const current = check(await db.from("lodges").select("meeting_pattern, website, email, installation_month").eq("id", i.lodge_id).single());
    const changes: Record<string, string | number> = {};
    for (const k of ["meeting_pattern", "website", "email", "installation_month"] as const) {
      const v = i[k];
      if (v !== null && v !== undefined && v !== "" && String(v) !== String(current[k] ?? "")) changes[k] = v;
    }
    if (!Object.keys(changes).length) throw new UserError("Nothing has changed. Edit a field to propose a change.");
    check(await db.from("lodge_change_proposals").insert({ org_id: session.orgId, lodge_id: i.lodge_id, proposed_by: session.accountId, changes, note: i.note }));
    return { message: "Thank you. Your Assistant Provincial Grand Mentor will review the change.", revalidate: [`/portal/${i.lodge_id}`] };
  },
);

export const saveArrangements = defineAction(
  z.object({
    lodge_id: zf.uuid(),
    personal_mentors_for_new_members: z.enum(["yes", "no", "partly", "unknown"]),
    arrangements: zf.optionalText(2000), guidance_used: zf.optionalText(1000), training_requirements: zf.optionalText(1000),
  }),
  async (i, { db, session }) => {
    if (!(await portalScope()).update.includes(i.lodge_id)) throw new UserError("Maintaining arrangements is not switched on for you.");
    check(await db.from("lodge_mentoring_profiles").upsert({ ...i, org_id: session.orgId, updated_by: session.accountId, updated_at: new Date().toISOString() }));
    return { message: "Mentoring arrangements saved.", revalidate: [`/portal/${i.lodge_id}`] };
  },
);

export const submitRequest = defineAction(
  z.object({ lodge_id: zf.uuid(), category_key: z.string().min(1, "Choose what the request is about"), title: zf.required("Summary", 200), description: zf.required("Details", 4000) }),
  async (i, { db, session }) => {
    if (!(await portalScope()).create.includes(i.lodge_id)) throw new UserError("Submitting support requests is not switched on for you.");
    if (i.category_key === "confidential") throw new UserError("Confidential concerns are raised separately. Please speak to your Assistant Provincial Grand Mentor.");
    const c = check(await db.from("cases").insert({ org_id: session.orgId, kind: "request", category_key: i.category_key, title: i.title, description: i.description, lodge_id: i.lodge_id,
      requester_person_id: session.personId, requester_account_id: session.accountId, source: "lodge_portal" }).select("reference").single());
    kickJobs();
    return { message: `Request ${c.reference} sent. The Provincial team will be in touch.`, revalidate: [`/portal/${i.lodge_id}`] };
  },
);
