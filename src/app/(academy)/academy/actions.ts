"use server";

import { z } from "zod";
import { check, defineAction, UserError, zf } from "@/server/action";
import { kickJobs } from "@/server/jobs/kick";
import { supabaseService, type DB } from "@/server/supabase";

const LEARN = { permission: ["academy.learn" as const] };

export const enrol = defineAction(
  z.object({ course_id: zf.uuid("Course") }),
  async (i, { db }) => {
    const id = check(await db.rpc("academy_enrol", { p_course: i.course_id }));
    kickJobs();
    return { redirect: `/academy/learn/${id}` };
  },
  LEARN,
);

export const withdraw = defineAction(
  z.object({ enrolment_id: zf.uuid(), slug: z.string() }),
  async (i, { db }) => {
    check(await db.rpc("academy_withdraw", { p_enrolment: i.enrolment_id }));
    return { message: "You have left this course. You can enrol again at any time.", revalidate: ["/academy", `/academy/courses/${i.slug}`, "/academy/progress"] };
  },
  LEARN,
);

export const completeLesson = defineAction(
  z.object({ enrolment_id: zf.uuid(), lesson_id: zf.uuid(), reflection: zf.optionalText(10000), next: z.string().optional(), slug: z.string() }),
  async (i, { db }) => {
    const status = check(await db.rpc("academy_complete_lesson", { p_enrolment: i.enrolment_id, p_lesson: i.lesson_id, p_reflection: i.reflection ?? undefined }));
    kickJobs();
    const revalidate = ["/academy", "/academy/progress", `/academy/courses/${i.slug}`, `/academy/learn/${i.enrolment_id}/${i.lesson_id}`];
    if (status === "completed") return { redirect: `/academy/courses/${i.slug}?completed=1`, revalidate: [...revalidate, "/academy/certificates"] };
    if (i.next && i.next.startsWith(`/academy/learn/${i.enrolment_id}/`)) return { redirect: i.next, revalidate };
    return { message: i.reflection ? "Your reflection is saved. Only you can see it." : "Lesson complete.", revalidate };
  },
  LEARN,
);

export type AssessmentResult = {
  score: number; passed: boolean; pass_mark: number; attempt_no: number; attempts_remaining: number | null; enrolment_status: string;
  results: { question_id: string; correct: boolean; feedback: string | null; explanation: string | null }[];
};

export const submitAssessment = defineAction(
  z.looseObject({ enrolment_id: zf.uuid(), lesson_id: zf.uuid(), slug: z.string() }),
  async (i, { db }) => {
    const answers: Record<string, string[]> = {};
    for (const [k, v] of Object.entries(i)) {
      if (k.startsWith("a_")) answers[k.slice(2)] = (Array.isArray(v) ? v : [v]).map(String).filter(Boolean);
    }
    if (!Object.values(answers).some((a) => a.length)) throw new UserError("Please answer the questions before submitting.");
    const result = check(await db.rpc("academy_submit_assessment", { p_enrolment: i.enrolment_id, p_lesson: i.lesson_id, p_answers: answers })) as unknown as AssessmentResult;
    kickJobs();
    return {
      data: result,
      revalidate: ["/academy", "/academy/progress", `/academy/courses/${i.slug}`, `/academy/learn/${i.enrolment_id}/${i.lesson_id}`, ...(result.enrolment_status === "completed" ? ["/academy/certificates"] : [])],
    };
  },
  LEARN,
);

export const saveLearnerProfile = defineAction(
  z.object({ audiences: zf.list(), masonic_stage: zf.optionalText(40), interests: zf.optionalText(500) }),
  async (i, { db, session }) => {
    const allowed = ["lodge_mentor", "personal_mentor", "newer_brother", "provincial_team"];
    const stages = ["entered_apprentice", "fellow_craft", "master_mason", "established"];
    if (i.masonic_stage && !stages.includes(i.masonic_stage)) throw new UserError("Please choose a stage from the list.");
    const interests = (i.interests ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean).slice(0, 20);
    check(await db.from("learner_profiles").upsert({
      person_id: session.personId, org_id: session.orgId, audiences: i.audiences.filter((a) => allowed.includes(a)),
      masonic_stage: i.masonic_stage, interests, updated_at: new Date().toISOString(),
    }));
    return { message: "Your preferences are saved. Recommendations now reflect them.", revalidate: ["/academy", "/academy/profile"] };
  },
  LEARN,
);

// ---------------------------------------------------------------------------
// External learning (self-declared)
// ---------------------------------------------------------------------------

const PROVIDERS = ["solomon", "ugle", "other_province", "other"] as const;
const MAX_EVIDENCE = 10 * 1024 * 1024;
const EVIDENCE_TYPES = ["application/pdf", "image/png", "image/jpeg", "image/webp"];

async function uploadEvidence(db: DB, personId: string, file: unknown): Promise<string | null> {
  if (!(file instanceof File) || file.size === 0) return null;
  if (file.size > MAX_EVIDENCE) throw new UserError("Evidence files must be 10 MB or smaller.");
  if (!EVIDENCE_TYPES.includes(file.type)) throw new UserError("Evidence must be a PDF or an image (PNG, JPEG or WebP).");
  const safe = file.name.replace(/[^\w.-]+/g, "_").slice(-80);
  const path = `${personId}/${crypto.randomUUID()}-${safe}`;
  const { error } = await db.storage.from("evidence").upload(path, file, { contentType: file.type });
  if (error) throw new UserError("The evidence could not be uploaded. Please try again.");
  return path;
}

const externalFields = {
  provider: z.enum(PROVIDERS),
  title: zf.required("Title", 300),
  url: zf.optionalText(500).refine((u) => !u || /^https:\/\//.test(u), "Enter a web address starting with https://"),
  completed_on: zf.date("Completion date"),
  evidence: z.any().optional(),
};

export const addExternalLearning = defineAction(
  z.object(externalFields),
  async (i, { db, session }) => {
    if (i.completed_on > new Date().toISOString().slice(0, 10)) throw new UserError("The completion date cannot be in the future.");
    const evidence_path = await uploadEvidence(db, session.personId, i.evidence);
    check(await db.from("external_learning").insert({ org_id: session.orgId, person_id: session.personId, provider: i.provider, title: i.title,
      url: i.url, completed_on: i.completed_on, self_declared: true, evidence_path }));
    return { message: "Added to your learning record.", revalidate: ["/academy/progress"] };
  },
  LEARN,
);

export const updateExternalLearning = defineAction(
  z.object({ id: zf.uuid(), ...externalFields, remove_evidence: zf.checkbox() }),
  async (i, { db, session }) => {
    const current = check(await db.from("external_learning").select("id, evidence_path, verified_at").eq("id", i.id).maybeSingle());
    if (!current) throw new UserError("Record not found.");
    if (current.verified_at) throw new UserError("This has been verified by the Academy team and can no longer be changed.");
    const uploaded = await uploadEvidence(db, session.personId, i.evidence);
    const evidence_path = uploaded ?? (i.remove_evidence ? null : current.evidence_path);
    const res = check(await db.from("external_learning").update({ provider: i.provider, title: i.title, url: i.url, completed_on: i.completed_on, evidence_path })
      .eq("id", i.id).select("id"));
    if (!res.length) throw new UserError("This record can no longer be changed.");
    if (current.evidence_path && current.evidence_path !== evidence_path) await supabaseService().storage.from("evidence").remove([current.evidence_path]);
    return { message: "Saved.", revalidate: ["/academy/progress"] };
  },
  LEARN,
);

export const deleteExternalLearning = defineAction(
  z.object({ id: zf.uuid() }),
  async (i, { db }) => {
    // Read through RLS first; only then tidy the stored file.
    const current = check(await db.from("external_learning").select("id, evidence_path").eq("id", i.id).maybeSingle());
    if (!current) throw new UserError("Record not found.");
    const res = check(await db.from("external_learning").delete().eq("id", i.id).select("id"));
    if (!res.length) throw new UserError("Verified records cannot be removed.");
    if (current.evidence_path) await supabaseService().storage.from("evidence").remove([current.evidence_path]);
    return { message: "Removed.", revalidate: ["/academy/progress"] };
  },
  LEARN,
);

// ---------------------------------------------------------------------------
// Development plan
// ---------------------------------------------------------------------------

async function ensurePlan(db: DB, session: { personId: string; orgId: string }) {
  const { data } = await db.from("development_plans").select("id").eq("person_id", session.personId).maybeSingle();
  if (data) return data.id;
  return check(await db.from("development_plans").insert({ person_id: session.personId, org_id: session.orgId }).select("id").single()).id;
}

export const saveAspirations = defineAction(
  z.object({ aspirations: zf.optionalText(4000) }),
  async (i, { db, session }) => {
    const id = await ensurePlan(db, session);
    check(await db.from("development_plans").update({ aspirations: i.aspirations, updated_at: new Date().toISOString() }).eq("id", id));
    return { message: "Your aspirations are saved.", revalidate: ["/academy/plan", "/academy"] };
  },
  LEARN,
);

const itemFields = {
  title: zf.required("Title", 300),
  kind: z.enum(["course", "event", "external", "reading", "other"]),
  course_id: zf.optionalUuid(),
  target_on: zf.optionalDate(),
  status: z.enum(["planned", "in_progress", "done", "dropped"]).default("planned"),
  notes: zf.optionalText(2000),
};

export const addPlanItem = defineAction(
  z.object(itemFields),
  async (i, { db, session }) => {
    const plan_id = await ensurePlan(db, session);
    check(await db.from("development_plan_items").insert({ ...i, course_id: i.kind === "course" ? i.course_id : null, plan_id }));
    return { message: "Added to your plan.", revalidate: ["/academy/plan", "/academy"] };
  },
  LEARN,
);

export const updatePlanItem = defineAction(
  z.object({ id: zf.uuid(), ...itemFields }),
  async (i, { db }) => {
    const { id, ...rest } = i;
    const res = check(await db.from("development_plan_items").update({ ...rest, course_id: rest.kind === "course" ? rest.course_id : null }).eq("id", id).select("id"));
    if (!res.length) throw new UserError("Plan item not found.");
    return { message: "Saved.", revalidate: ["/academy/plan", "/academy"] };
  },
  LEARN,
);

export const deletePlanItem = defineAction(
  z.object({ id: zf.uuid() }),
  async (i, { db }) => {
    check(await db.from("development_plan_items").delete().eq("id", i.id));
    return { message: "Removed from your plan.", revalidate: ["/academy/plan", "/academy"] };
  },
  LEARN,
);
