/**
 * Herts Mentoring Academy: authoring and approval, the learner journey
 * (Scenario 7: enrol, complete, fail then pass a quiz, certificate), answer-key
 * and reflection privacy, learning-record access and certificate downloads.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { as, count, secrets, service, user } from "../helpers";
import { cookieFor } from "../../scripts/smoke";

const APP = (process.env.APP_URL ?? "http://localhost:3100").replace(/\/$/, "");
const stamp = Date.now().toString(36);
const slug = `test-course-${stamp}`;

let author: SupabaseClient, lead: SupabaseClient, learner: SupabaseClient, learner2: SupabaseClient;
let courseId: string, versionId: string, moduleId: string, contentLessonId: string, reflectionLessonId: string, quizLessonId: string;
let q1: string, q2: string;
let enrolmentId: string, certificateId: string;

beforeAll(async () => {
  author = await as("author");
  lead = await as("learninglead");
  learner = await as("learner1");
  learner2 = await as("learner2");
});

// Keep the shared catalogue tidy: test courses are withdrawn from learners afterwards.
afterAll(async () => {
  const svc = service();
  const { data } = await svc.from("courses").select("id").like("slug", `${slug}%`);
  for (const c of data ?? []) {
    await svc.from("course_versions").update({ status: "archived" }).eq("course_id", c.id).eq("status", "published");
    await svc.from("courses").update({ published_version_id: null, archived_at: new Date().toISOString() }).eq("id", c.id);
  }
});

describe("Authoring and approval", () => {
  it("lets an L&D contributor create a course, version, module and lessons", async () => {
    const c = await author.from("courses").insert({ org_id: secrets.orgId, slug, title: `Test course ${stamp}`, summary: "Synthetic test course", audiences: ["lodge_mentor"], level: "essential", principle: "guide", estimated_minutes: 20 }).select("id").single();
    expect(c.error).toBeNull();
    courseId = c.data!.id;
    const v = await author.from("course_versions").insert({ org_id: secrets.orgId, course_id: courseId, version_no: 1, title: `Test course ${stamp}`, pass_mark: 80, completion_rule: "all_lessons_and_assessments" }).select("id").single();
    expect(v.error).toBeNull();
    versionId = v.data!.id;
    const m = await author.from("course_modules").insert({ version_id: versionId, position: 0, title: "Getting started" }).select("id").single();
    expect(m.error).toBeNull();
    moduleId = m.data!.id;
    const lessons = await author.from("lessons").insert([
      { module_id: moduleId, position: 0, title: "Welcome", kind: "content", is_assessment: false, max_attempts: null, content: { blocks: [{ type: "text", markdown: "Hello" }, { type: "principles" }] } },
      { module_id: moduleId, position: 1, title: "Reflect", kind: "reflection", is_assessment: false, max_attempts: null, content: { blocks: [], prompt: "What helped you?" } },
      { module_id: moduleId, position: 2, title: "Check", kind: "quiz", is_assessment: true, max_attempts: 3, content: { blocks: [] } },
    ]).select("id, kind");
    expect(lessons.error).toBeNull();
    contentLessonId = lessons.data!.find((l) => l.kind === "content")!.id;
    reflectionLessonId = lessons.data!.find((l) => l.kind === "reflection")!.id;
    quizLessonId = lessons.data!.find((l) => l.kind === "quiz")!.id;
  });

  it("adds quiz questions with answer keys", async () => {
    const qs = await author.from("questions").insert([
      { lesson_id: quizLessonId, position: 0, kind: "single", prompt: "Which question fits?", options: [{ id: "a", text: "How can we help?" }, { id: "b", text: "Why aren't you attending?" }] },
      { lesson_id: quizLessonId, position: 1, kind: "true_false", prompt: "The principles are stages.", options: [{ id: "t", text: "True" }, { id: "f", text: "False" }] },
    ]).select("id, position");
    expect(qs.error).toBeNull();
    q1 = qs.data!.find((q) => q.position === 0)!.id;
    q2 = qs.data!.find((q) => q.position === 1)!.id;
    const keys = await author.from("question_keys").insert([
      { question_id: q1, correct: ["a"], feedback_correct: "Yes.", feedback_incorrect: "Try the house phrase." },
      { question_id: q2, correct: ["f"], feedback_correct: "Right.", feedback_incorrect: "They apply continuously." },
    ]);
    expect(keys.error).toBeNull();
  });

  it("refuses learners writing course content", async () => {
    const { error } = await learner.from("course_modules").insert({ version_id: versionId, position: 9, title: "Sneaky" });
    expect(error).not.toBeNull();
    expect(await count(learner, "course_versions", (q) => q.eq("id", versionId))).toBe(0);
  });

  it("submits for review, after which the draft can no longer be edited", async () => {
    const { error } = await author.rpc("academy_transition_version", { p_version: versionId, p_to: "review" });
    expect(error).toBeNull();
    const upd = await author.from("lessons").update({ title: "Changed" }).eq("id", contentLessonId).select("id");
    expect(upd.data ?? []).toHaveLength(0);
  });

  it("refuses approval by the author", async () => {
    const { error } = await author.rpc("academy_transition_version", { p_version: versionId, p_to: "approved" });
    expect(error?.message).toMatch(/reviewer|approved by someone other/i);
  });

  it("refuses self-approval even for a reviewer who wrote the version", async () => {
    const c = await lead.from("courses").insert({ org_id: secrets.orgId, slug: `${slug}-self`, title: "Self approval test" }).select("id").single();
    const v = await lead.from("course_versions").insert({ org_id: secrets.orgId, course_id: c.data!.id, version_no: 1, title: "Self approval test" }).select("id").single();
    const m = await lead.from("course_modules").insert({ version_id: v.data!.id, position: 0, title: "M" }).select("id").single();
    await lead.from("lessons").insert({ module_id: m.data!.id, position: 0, title: "L", kind: "content" });
    expect((await lead.rpc("academy_transition_version", { p_version: v.data!.id, p_to: "review" })).error).toBeNull();
    const { error } = await lead.rpc("academy_transition_version", { p_version: v.data!.id, p_to: "approved" });
    expect(error?.message).toMatch(/someone other than its author/);
  });

  it("is approved by the learning lead, then published", async () => {
    expect((await learner.rpc("academy_transition_version", { p_version: versionId, p_to: "approved" })).error).not.toBeNull();
    expect((await lead.rpc("academy_transition_version", { p_version: versionId, p_to: "approved", p_note: "Looks good" })).error).toBeNull();
    expect((await author.rpc("academy_transition_version", { p_version: versionId, p_to: "published" })).error).not.toBeNull();
    expect((await lead.rpc("academy_transition_version", { p_version: versionId, p_to: "published" })).error).toBeNull();
    const { data } = await learner.from("courses").select("published_version_id").eq("id", courseId).single();
    expect(data!.published_version_id).toBe(versionId);
  });
});

describe("Learner journey (Scenario 7)", () => {
  it("enrols", async () => {
    const { data, error } = await learner.rpc("academy_enrol", { p_course: courseId });
    expect(error).toBeNull();
    enrolmentId = data as string;
  });

  it("can read questions but never answer keys", async () => {
    expect(await count(learner, "questions", (q) => q.eq("lesson_id", quizLessonId))).toBe(2);
    expect(await count(learner, "question_keys", (q) => q.in("question_id", [q1, q2]))).toBe(0);
    expect(await count(learner, "question_keys")).toBe(0);
  });

  it("refuses completing an assessment without answering it", async () => {
    const { error } = await learner.rpc("academy_complete_lesson", { p_enrolment: enrolmentId, p_lesson: quizLessonId });
    expect(error).not.toBeNull();
  });

  it("refuses another learner acting on the enrolment", async () => {
    const { error } = await learner2.rpc("academy_complete_lesson", { p_enrolment: enrolmentId, p_lesson: contentLessonId });
    expect(error?.message).toMatch(/not your enrolment/);
  });

  it("completes lessons and saves a private reflection", async () => {
    expect((await learner.rpc("academy_complete_lesson", { p_enrolment: enrolmentId, p_lesson: contentLessonId })).data).toBe("in_progress");
    expect((await learner.rpc("academy_complete_lesson", { p_enrolment: enrolmentId, p_lesson: reflectionLessonId })).error).not.toBeNull();
    const r = await learner.rpc("academy_complete_lesson", { p_enrolment: enrolmentId, p_lesson: reflectionLessonId, p_reflection: "Private thoughts for test" });
    expect(r.error).toBeNull();
    expect(await count(learner, "reflections", (q) => q.eq("lesson_id", reflectionLessonId))).toBe(1);
  });

  it("fails the quiz with per-question feedback, then passes and gets a certificate", async () => {
    const fail = await learner.rpc("academy_submit_assessment", { p_enrolment: enrolmentId, p_lesson: quizLessonId, p_answers: { [q1]: ["b"], [q2]: ["f"] } });
    expect(fail.error).toBeNull();
    expect(fail.data.passed).toBe(false);
    expect(fail.data.score).toBe(50);
    expect(fail.data.attempts_remaining).toBe(2);
    const fb = (fail.data.results as { question_id: string; correct: boolean; feedback: string }[]).find((r) => r.question_id === q1)!;
    expect(fb.correct).toBe(false);
    expect(fb.feedback).toBe("Try the house phrase.");
    expect(fail.data.enrolment_status).toBe("in_progress");
    expect(await count(learner, "certificates", (q) => q.eq("enrolment_id", enrolmentId))).toBe(0);

    const pass = await learner.rpc("academy_submit_assessment", { p_enrolment: enrolmentId, p_lesson: quizLessonId, p_answers: { [q1]: ["a"], [q2]: ["f"] } });
    expect(pass.error).toBeNull();
    expect(pass.data.passed).toBe(true);
    expect(pass.data.enrolment_status).toBe("completed");

    const again = await learner.rpc("academy_submit_assessment", { p_enrolment: enrolmentId, p_lesson: quizLessonId, p_answers: { [q1]: ["a"], [q2]: ["f"] } });
    expect(again.error?.message).toMatch(/already passed/);

    const { data: cert } = await learner.from("certificates").select("id, reference, kind").eq("enrolment_id", enrolmentId).single();
    expect(cert!.kind).toBe("course");
    expect(cert!.reference).toMatch(/^HMA-\d{4}-\d{5}$/);
    certificateId = cert!.id;
    const { data: e } = await learner.from("enrolments").select("status, completed_at").eq("id", enrolmentId).single();
    expect(e!.status).toBe("completed");
  });

  it("keeps the completion valid when the course is revised", async () => {
    const { data: newVersion, error } = await author.rpc("academy_new_version", { p_course: courseId });
    expect(error).toBeNull();
    const { data: mods } = await author.from("course_modules").select("id").eq("version_id", newVersion);
    expect(await count(author, "lessons", (q) => q.in("module_id", (mods ?? []).map((m: { id: string }) => m.id)))).toBe(3);
    const { data: e } = await learner.from("enrolments").select("status, course_version_id").eq("id", enrolmentId).single();
    expect(e!.course_version_id).toBe(versionId);
    expect(e!.status).toBe("completed");
  });
});

describe("Privacy and access", () => {
  it("never shows another learner's reflections, even to the learning lead", async () => {
    await learner2.from("reflections").upsert({ person_id: user("learner2").personId, lesson_id: reflectionLessonId, response: "learner2 private" }, { onConflict: "person_id,lesson_id" });
    expect(await count(learner, "reflections", (q) => q.eq("person_id", user("learner2").personId))).toBe(0);
    expect(await count(lead, "reflections", (q) => q.eq("lesson_id", reflectionLessonId))).toBe(0);
    expect(await count(learner2, "reflections", (q) => q.eq("person_id", user("learner1").personId))).toBe(0);
  });

  it("refuses a learner inserting reflections for someone else", async () => {
    const { error } = await learner.from("reflections").insert({ person_id: user("learner2").personId, lesson_id: contentLessonId, response: "x" });
    expect(error).not.toBeNull();
  });

  it("gives learning records to the learning lead but not to learners", async () => {
    const { data, error } = await lead.rpc("academy_learning_records", { p_course: courseId });
    expect(error).toBeNull();
    const row = (data as { person_id: string; status: string; roles: string[]; lodge_name: string | null }[]).find((r) => r.person_id === user("learner1").personId)!;
    expect(row.status).toBe("completed");
    expect(row.roles).toContain("learner");
    expect(row.lodge_name).toBeTruthy();
    expect((await learner.rpc("academy_learning_records", {})).error).not.toBeNull();
    expect((await learner.rpc("academy_learning_filters")).error).not.toBeNull();
    expect((await learner.rpc("academy_learner_context", { p_person: user("learner2").personId })).error).not.toBeNull();
    const ctx = await lead.rpc("academy_learner_context", { p_person: user("learner1").personId });
    expect(ctx.error).toBeNull();
    expect(JSON.stringify(ctx.data)).not.toContain("Private thoughts");
  });

  it("lets the learning lead read but not change a learner's development plan", async () => {
    const svc = service();
    await svc.from("development_plans").upsert({ org_id: secrets.orgId, person_id: user("learner1").personId, aspirations: "Original" }, { onConflict: "person_id" });
    expect(await count(lead, "development_plans", (q) => q.eq("person_id", user("learner1").personId))).toBe(1);
    const upd = await lead.from("development_plans").update({ aspirations: "Changed by admin" }).eq("person_id", user("learner1").personId).select("id");
    expect(upd.data ?? []).toHaveLength(0);
    const own = await learner.from("development_plans").update({ aspirations: "Mine" }).eq("person_id", user("learner1").personId).select("id");
    expect(own.data).toHaveLength(1);
    expect(await count(learner2, "development_plans", (q) => q.eq("person_id", user("learner1").personId))).toBe(0);
  });

  it("refuses learners enrolling others, issuing recognition or revoking certificates", async () => {
    expect((await learner.rpc("academy_admin_enrol", { p_person: user("learner2").personId, p_course: courseId })).error).not.toBeNull();
    expect((await learner.rpc("academy_issue_recognition", { p_person: user("learner1").personId, p_title: "Self award", p_completed_on: "2026-01-01", p_reason: "I deserve it, honestly" })).error).not.toBeNull();
    const rev = await learner.from("certificates").update({ revoked_at: new Date().toISOString() }).eq("id", certificateId).select("id");
    expect(rev.data ?? []).toHaveLength(0);
  });

  it("serves the certificate download to its owner only", async () => {
    const own = await fetch(`${APP}/api/certificates/${certificateId}`, { headers: { cookie: await cookieFor("learner1") } });
    expect(own.status).toBe(200);
    expect(own.headers.get("content-type")).toBe("application/pdf");
    expect(Buffer.from(await own.arrayBuffer()).subarray(0, 4).toString()).toBe("%PDF");
    const other = await fetch(`${APP}/api/certificates/${certificateId}`, { headers: { cookie: await cookieFor("learner2") } });
    expect(other.status).toBe(404);
    const admin = await fetch(`${APP}/api/certificates/${certificateId}`, { headers: { cookie: await cookieFor("learninglead") } });
    expect(admin.status).toBe(200);
    const anon = await fetch(`${APP}/api/certificates/${certificateId}`, { redirect: "manual" });
    expect(anon.headers.get("content-type")).not.toBe("application/pdf");
    expect([401, 302, 303, 307, 404]).toContain(anon.status);
  });

  it("stops a revoked certificate from downloading", async () => {
    const { data: rec } = await lead.rpc("academy_issue_recognition", { p_person: user("learner1").personId, p_title: `Recognition ${stamp}`, p_completed_on: "2026-10-01", p_reason: "Synthetic recognition for tests" });
    const upd = await lead.from("certificates").update({ revoked_at: new Date().toISOString(), revoked_reason: "Test" }).eq("id", rec).select("id");
    expect(upd.data).toHaveLength(1);
    const res = await fetch(`${APP}/api/certificates/${rec}`, { headers: { cookie: await cookieFor("learner1") } });
    expect(res.status).toBe(404);
  });

  it("lets authors upload lesson media that learners can view but not upload", async () => {
    const path = `${secrets.orgId}/lessons/${contentLessonId}/${stamp}.png`;
    const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
    expect((await author.storage.from("academy-media").upload(path, png, { contentType: "image/png" })).error).toBeNull();
    const signed = await learner.storage.from("academy-media").createSignedUrl(path, 60);
    expect(signed.error).toBeNull();
    const bad = await learner.storage.from("academy-media").upload(`${secrets.orgId}/lessons/x/${stamp}.png`, png, { contentType: "image/png" });
    expect(bad.error).not.toBeNull();
  });

  it("keeps evidence in the learner's own folder and lets them edit only while unverified", async () => {
    const pdf = new TextEncoder().encode("%PDF-1.4 test");
    const own = `${user("learner1").personId}/${stamp}.pdf`;
    expect((await learner.storage.from("evidence").upload(own, pdf, { contentType: "application/pdf" })).error).toBeNull();
    expect((await learner.storage.from("evidence").upload(`${user("learner2").personId}/${stamp}.pdf`, pdf, { contentType: "application/pdf" })).error).not.toBeNull();
    const ins = await learner.from("external_learning").insert({ org_id: secrets.orgId, person_id: user("learner1").personId, provider: "solomon", title: `Solomon module ${stamp}`, completed_on: "2026-09-01", evidence_path: own }).select("id").single();
    expect(ins.error).toBeNull();
    expect((await learner2.storage.from("evidence").createSignedUrl(own, 60)).error).not.toBeNull();
    expect((await lead.storage.from("evidence").createSignedUrl(own, 60)).error).toBeNull();
    const verified = await lead.from("external_learning").update({ verified_by: user("learninglead").accountId, verified_at: new Date().toISOString() }).eq("id", ins.data!.id).select("id");
    expect(verified.data).toHaveLength(1);
    const edit = await learner.from("external_learning").update({ title: "Changed" }).eq("id", ins.data!.id).select("id");
    expect(edit.data ?? []).toHaveLength(0);
    const del = await learner.from("external_learning").delete().eq("id", ins.data!.id).select("id");
    expect(del.data ?? []).toHaveLength(0);
  });
});
