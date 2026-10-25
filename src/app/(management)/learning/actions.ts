"use server";

import { z } from "zod";
import { check, defineAction, UserError, zf } from "@/server/action";
import { kickJobs } from "@/server/jobs/kick";

const REVIEW = { permission: ["academy.review" as const, "academy.publish" as const] };
const PUBLISH = { permission: ["academy.publish" as const] };
const ADMIN = { permission: ["academy.admin" as const] };

// --- Approvals ---------------------------------------------------------------

export const decideVersion = defineAction(
  z.object({ version_id: zf.uuid(), to: z.enum(["approved", "draft", "published", "archived"]), note: zf.optionalText(2000) }),
  async (i, { db }) => {
    if (i.to === "draft" && !i.note) throw new UserError("Please add a note so the author knows what to change.");
    check(await db.rpc("academy_transition_version", { p_version: i.version_id, p_to: i.to, p_note: i.note ?? undefined }));
    kickJobs();
    const message = { approved: "Approved. It can now be published.", draft: "Returned to the author with your note.", published: "Published. Learners can now enrol.", archived: "Archived." }[i.to];
    return { message, revalidate: ["/learning/approvals", "/learning", "/academy/courses", "/academy/author"] };
  },
  REVIEW,
);

export const setPlaceholder = defineAction(
  z.object({ course_id: zf.uuid(), placeholder: z.enum(["true", "false"]) }),
  async (i, { db }) => {
    const res = check(await db.from("courses").update({ is_placeholder_content: i.placeholder === "true" }).eq("id", i.course_id).select("id"));
    if (!res.length) throw new UserError("Course not found.");
    return { message: i.placeholder === "true" ? "Marked as sample content." : "Sample content notice removed.", revalidate: ["/learning/approvals"] };
  },
  PUBLISH,
);

// --- Learners ------------------------------------------------------------------

export const adminEnrol = defineAction(
  z.object({ person_id: zf.uuid("Learner"), course_id: zf.uuid("Course"), due_on: zf.optionalDate() }),
  async (i, { db }) => {
    check(await db.rpc("academy_admin_enrol", { p_person: i.person_id, p_course: i.course_id, p_due: i.due_on ?? undefined }));
    kickJobs();
    return { message: "Enrolled. The learner will receive an email with a link to the course.", revalidate: ["/learning/learners", `/learning/learners/${i.person_id}`, "/learning"] };
  },
  ADMIN,
);

export const adminWithdraw = defineAction(
  z.object({ enrolment_id: zf.uuid(), person_id: zf.uuid() }),
  async (i, { db }) => {
    check(await db.rpc("academy_withdraw", { p_enrolment: i.enrolment_id }));
    return { message: "Enrolment withdrawn.", revalidate: [`/learning/learners/${i.person_id}`] };
  },
  ADMIN,
);

export const verifyExternal = defineAction(
  z.object({ id: zf.uuid(), person_id: zf.uuid() }),
  async (i, { db, session }) => {
    const res = check(await db.from("external_learning").update({ verified_by: session.accountId, verified_at: new Date().toISOString() }).eq("id", i.id).is("verified_at", null).select("id"));
    if (!res.length) throw new UserError("This record has already been verified or no longer exists.");
    return { message: "Verified.", revalidate: [`/learning/learners/${i.person_id}`] };
  },
  ADMIN,
);

// --- Certificates ----------------------------------------------------------------

export const issueRecognition = defineAction(
  z.object({ person_id: zf.uuid("Learner"), title: zf.required("Title", 200), completed_on: zf.date("Date"), reason: zf.required("Reason", 2000), course_id: zf.optionalUuid() }),
  async (i, { db }) => {
    if (i.reason.length < 10) throw new UserError("Please describe the reason for recognition in a sentence or two.");
    check(await db.rpc("academy_issue_recognition", { p_person: i.person_id, p_title: i.title, p_completed_on: i.completed_on, p_reason: i.reason, p_course: i.course_id ?? undefined }));
    kickJobs();
    return { message: "Recognition certificate issued. The learner has been notified.", revalidate: ["/learning/certificates", `/learning/learners/${i.person_id}`] };
  },
  ADMIN,
);

export const revokeCertificate = defineAction(
  z.object({ certificate_id: zf.uuid(), reason: zf.required("Reason", 1000) }),
  async (i, { db }) => {
    const res = check(await db.from("certificates").update({ revoked_at: new Date().toISOString(), revoked_reason: i.reason }).eq("id", i.certificate_id).is("revoked_at", null).select("id, person_id"));
    if (!res.length) throw new UserError("This certificate has already been revoked or you cannot change it.");
    return { message: "Certificate revoked. It no longer appears for the learner.", revalidate: ["/learning/certificates", `/learning/learners/${res[0]!.person_id}`] };
  },
  ADMIN,
);

// --- Pathways --------------------------------------------------------------------

const AUDIENCES = ["lodge_mentor", "personal_mentor", "newer_brother", "provincial_team", "all"] as const;

export const savePathway = defineAction(
  z.object({
    id: zf.optionalUuid(),
    slug: z.string().trim().toLowerCase().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Use lower-case letters, numbers and hyphens").max(80),
    title: zf.required("Title", 200), summary: zf.text(1000), audience: z.enum(AUDIENCES), position: zf.optionalInt(),
  }),
  async (i, { db, session }) => {
    const values = { slug: i.slug, title: i.title, summary: i.summary, audience: i.audience, position: i.position ?? 0 };
    if (i.id) {
      const res = check(await db.from("pathways").update(values).eq("id", i.id).select("id"));
      if (!res.length) throw new UserError("Pathway not found.");
      return { message: "Pathway saved.", revalidate: ["/learning/pathways", `/learning/pathways/${i.id}`] };
    }
    const created = check(await db.from("pathways").insert({ ...values, org_id: session.orgId, published: false }).select("id").single());
    return { redirect: `/learning/pathways/${created.id}` };
  },
  PUBLISH,
);

export const setPathwayPublished = defineAction(
  z.object({ id: zf.uuid(), published: z.enum(["true", "false"]) }),
  async (i, { db }) => {
    if (i.published === "true") {
      const { count } = await db.from("pathway_courses").select("course_id", { count: "exact", head: true }).eq("pathway_id", i.id);
      if (!count) throw new UserError("Add at least one course before publishing the pathway.");
    }
    check(await db.from("pathways").update({ published: i.published === "true" }).eq("id", i.id));
    return { message: i.published === "true" ? "Pathway published. Learners can now see it." : "Pathway hidden from learners.", revalidate: ["/learning/pathways", `/learning/pathways/${i.id}`] };
  },
  PUBLISH,
);

export const addPathwayCourse = defineAction(
  z.object({ pathway_id: zf.uuid(), course_id: zf.uuid("Course"), requirement: z.enum(["essential", "optional"]) }),
  async (i, { db }) => {
    const { data: last } = await db.from("pathway_courses").select("position").eq("pathway_id", i.pathway_id).order("position", { ascending: false }).limit(1).maybeSingle();
    check(await db.from("pathway_courses").insert({ ...i, position: (last?.position ?? -1) + 1 }));
    return { message: "Course added.", revalidate: [`/learning/pathways/${i.pathway_id}`] };
  },
  PUBLISH,
);

export const updatePathwayCourse = defineAction(
  z.object({ pathway_id: zf.uuid(), course_id: zf.uuid(), requirement: z.enum(["essential", "optional"]).optional(), dir: z.enum(["up", "down"]).optional(), remove: z.string().optional() }),
  async (i, { db }) => {
    if (i.remove) {
      check(await db.from("pathway_courses").delete().eq("pathway_id", i.pathway_id).eq("course_id", i.course_id));
    } else if (i.requirement) {
      check(await db.from("pathway_courses").update({ requirement: i.requirement }).eq("pathway_id", i.pathway_id).eq("course_id", i.course_id));
    } else if (i.dir) {
      const { data } = await db.from("pathway_courses").select("course_id, position").eq("pathway_id", i.pathway_id).order("position");
      const ids = (data ?? []).map((r) => r.course_id);
      const at = ids.indexOf(i.course_id), to = i.dir === "up" ? at - 1 : at + 1;
      if (at >= 0 && to >= 0 && to < ids.length) {
        [ids[at], ids[to]] = [ids[to]!, ids[at]!];
        for (const [pos, cid] of ids.entries()) check(await db.from("pathway_courses").update({ position: pos }).eq("pathway_id", i.pathway_id).eq("course_id", cid));
      }
    }
    return { revalidate: [`/learning/pathways/${i.pathway_id}`] };
  },
  PUBLISH,
);

// --- Badges ----------------------------------------------------------------------

export const saveBadge = defineAction(
  z.object({
    id: zf.optionalUuid(),
    key: z.string().trim().toLowerCase().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Use lower-case letters, numbers and hyphens").max(60),
    name: zf.required("Name", 120), description: zf.required("Description", 500),
    criteria: z.enum(["course", "pathway", "count"]),
    course_id: zf.optionalUuid(), pathway_id: zf.optionalUuid(), courses_completed: zf.optionalInt(),
    active: zf.checkbox(),
  }),
  async (i, { db, session }) => {
    let criteria: Record<string, unknown>;
    if (i.criteria === "course") { if (!i.course_id) throw new UserError("Choose the course."); criteria = { course_id: i.course_id }; }
    else if (i.criteria === "pathway") { if (!i.pathway_id) throw new UserError("Choose the pathway."); criteria = { pathway_id: i.pathway_id }; }
    else { if (!i.courses_completed || i.courses_completed < 1) throw new UserError("Enter how many courses must be completed."); criteria = { courses_completed: i.courses_completed }; }
    const values = { key: i.key, name: i.name, description: i.description, criteria: criteria as never, active: i.active };
    if (i.id) {
      const res = check(await db.from("badges").update(values).eq("id", i.id).select("id"));
      if (!res.length) throw new UserError("Badge not found.");
    } else {
      check(await db.from("badges").insert({ ...values, org_id: session.orgId }));
    }
    return { message: "Badge saved. It is awarded automatically the next time a learner completes a course and meets the criteria.", revalidate: ["/learning/badges"] };
  },
  PUBLISH,
);

// --- Solomon links ---------------------------------------------------------------

export const saveSolomonLink = defineAction(
  z.object({
    id: zf.optionalUuid(), title: zf.required("Title", 200),
    url: z.string().trim().url("Enter the full Solomon address").refine((u) => u.startsWith("https://"), "The address must start with https://"),
    description: zf.text(500), pathway_id: zf.optionalUuid(), course_id: zf.optionalUuid(), topics: zf.optionalText(300), position: zf.optionalInt(),
  }),
  async (i, { db, session }) => {
    const values = { title: i.title, url: i.url, description: i.description, pathway_id: i.pathway_id, course_id: i.course_id, position: i.position ?? 0,
      topics: (i.topics ?? "").split(",").map((t) => t.trim().toLowerCase()).filter(Boolean) };
    if (i.id) {
      const res = check(await db.from("solomon_resources").update(values).eq("id", i.id).select("id"));
      if (!res.length) throw new UserError("Link not found.");
    } else {
      check(await db.from("solomon_resources").insert({ ...values, org_id: session.orgId }));
    }
    return { message: "Link saved.", revalidate: ["/learning/resources"] };
  },
  PUBLISH,
);

export const deleteSolomonLink = defineAction(
  z.object({ id: zf.uuid() }),
  async (i, { db }) => {
    check(await db.from("solomon_resources").delete().eq("id", i.id));
    return { message: "Link removed.", revalidate: ["/learning/resources"] };
  },
  PUBLISH,
);
