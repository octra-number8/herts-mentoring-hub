"use server";

import { z } from "zod";
import { check, defineAction, UserError, zf } from "@/server/action";
import { kickJobs } from "@/server/jobs/kick";
import { blockSchema, scenarioSchema } from "@/server/academy/content";
import type { DB } from "@/server/supabase";

const AUTHOR = { permission: ["academy.author" as const] };
const AUDIENCE_KEYS = ["lodge_mentor", "personal_mentor", "newer_brother", "provincial_team", "all"];
const STAGE_KEYS = ["entered_apprentice", "fellow_craft", "master_mason", "established"];

const courseFields = {
  title: zf.required("Title", 200),
  summary: zf.text(1000),
  audiences: zf.list(),
  masonic_stages: zf.list(),
  topics: zf.optionalText(500),
  level: z.enum(["essential", "recommended", "optional"]),
  principle: z.enum(["prepare", "guide", "support", "enlighten", ""]).transform((v) => v || null),
  estimated_minutes: zf.optionalInt(),
};
const courseValues = (i: { audiences: string[]; masonic_stages: string[]; topics: string | null; level: string; principle: string | null; estimated_minutes: number | null; summary: string }) => ({
  audiences: i.audiences.filter((a) => AUDIENCE_KEYS.includes(a)),
  masonic_stages: i.masonic_stages.filter((a) => STAGE_KEYS.includes(a)),
  topics: (i.topics ?? "").split(",").map((t) => t.trim().toLowerCase()).filter(Boolean).slice(0, 20),
  level: i.level, principle: i.principle, estimated_minutes: i.estimated_minutes, summary: i.summary,
});

export const createCourse = defineAction(
  z.object({ slug: z.string().trim().toLowerCase().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Use lower-case letters, numbers and hyphens, e.g. listening-well").max(80), ...courseFields }),
  async (i, { db, session }) => {
    const { data: exists } = await db.from("courses").select("id").eq("slug", i.slug).maybeSingle();
    if (exists) throw new UserError("A course with that web address already exists. Choose another.");
    const course = check(await db.from("courses").insert({ org_id: session.orgId, slug: i.slug, title: i.title, owner_account_id: session.accountId, ...courseValues(i) }).select("id").single());
    const version = check(await db.from("course_versions").insert({ org_id: session.orgId, course_id: course.id, version_no: 1, title: i.title, summary: i.summary, status: "draft" }).select("id").single());
    return { redirect: `/academy/author/versions/${version.id}` };
  },
  AUTHOR,
);

export const updateCourse = defineAction(
  z.object({ course_id: zf.uuid(), ...courseFields }),
  async (i, { db }) => {
    const res = check(await db.from("courses").update(courseValues(i)).eq("id", i.course_id).select("id"));
    if (!res.length) throw new UserError("Course not found.");
    return { message: "Course details saved. They apply to every version.", revalidate: [`/academy/author/courses/${i.course_id}`, "/academy/author"] };
  },
  AUTHOR,
);

/** Edits refuse unless the version is a draft (RLS enforces the same). */
async function requireDraft(db: DB, versionId: string) {
  const { data } = await db.from("course_versions").select("status").eq("id", versionId).maybeSingle();
  if (!data) throw new UserError("Version not found.");
  if (data.status !== "draft") throw new UserError("Only draft versions can be edited. Start a new version to make changes.");
}
async function versionOfModule(db: DB, moduleId: string) {
  const { data } = await db.from("course_modules").select("version_id").eq("id", moduleId).maybeSingle();
  if (!data) throw new UserError("Module not found.");
  return data.version_id;
}
async function lessonContext(db: DB, lessonId: string) {
  const { data } = await db.from("lessons").select("id, module_id, kind, course_modules(version_id)").eq("id", lessonId).maybeSingle();
  if (!data) throw new UserError("Lesson not found.");
  return { ...data, versionId: (data.course_modules as unknown as { version_id: string }).version_id };
}

export const updateVersionSettings = defineAction(
  z.object({
    version_id: zf.uuid(), title: zf.required("Title", 200), summary: zf.text(1000),
    pass_mark: zf.int("Pass mark").min(0, "Between 0 and 100").max(100, "Between 0 and 100"),
    completion_rule: z.enum(["all_lessons", "all_lessons_and_assessments"]),
    certificate_enabled: zf.checkbox(), change_summary: zf.optionalText(2000),
  }),
  async (i, { db }) => {
    await requireDraft(db, i.version_id);
    const { version_id, ...rest } = i;
    const res = check(await db.from("course_versions").update(rest).eq("id", version_id).select("id"));
    if (!res.length) throw new UserError("Only draft versions can be edited.");
    return { message: "Version settings saved.", revalidate: [`/academy/author/versions/${version_id}`] };
  },
  AUTHOR,
);

// --- Modules ---------------------------------------------------------------

export const addModule = defineAction(
  z.object({ version_id: zf.uuid(), title: zf.required("Module title", 200), summary: zf.text(1000) }),
  async (i, { db }) => {
    await requireDraft(db, i.version_id);
    const { data: last } = await db.from("course_modules").select("position").eq("version_id", i.version_id).order("position", { ascending: false }).limit(1).maybeSingle();
    check(await db.from("course_modules").insert({ version_id: i.version_id, title: i.title, summary: i.summary, position: (last?.position ?? -1) + 1 }));
    return { message: "Module added.", revalidate: [`/academy/author/versions/${i.version_id}`] };
  },
  AUTHOR,
);

export const updateModule = defineAction(
  z.object({ module_id: zf.uuid(), title: zf.required("Module title", 200), summary: zf.text(1000) }),
  async (i, { db }) => {
    const versionId = await versionOfModule(db, i.module_id);
    await requireDraft(db, versionId);
    check(await db.from("course_modules").update({ title: i.title, summary: i.summary }).eq("id", i.module_id));
    return { message: "Module saved.", revalidate: [`/academy/author/versions/${versionId}`] };
  },
  AUTHOR,
);

export const deleteModule = defineAction(
  z.object({ module_id: zf.uuid() }),
  async (i, { db }) => {
    const versionId = await versionOfModule(db, i.module_id);
    await requireDraft(db, versionId);
    check(await db.from("course_modules").delete().eq("id", i.module_id));
    return { message: "Module removed.", revalidate: [`/academy/author/versions/${versionId}`] };
  },
  AUTHOR,
);

/** Move an item up or down among its siblings, renumbering positions 0..n. */
async function reorder(db: DB, table: "course_modules" | "lessons" | "questions", parentCol: "version_id" | "module_id" | "lesson_id", parentId: string, id: string, dir: "up" | "down") {
  // Typed loosely: the three tables share id/position but have different parent columns.
  const loose = db as unknown as { from: (t: string) => { select: (c: string) => { eq: (k: string, v: string) => { order: (c: string) => Promise<{ data: { id: string }[] | null }> } } } };
  const { data } = await loose.from(table).select("id, position").eq(parentCol, parentId).order("position");
  const ids = (data ?? []).map((r) => r.id);
  const at = ids.indexOf(id);
  const to = dir === "up" ? at - 1 : at + 1;
  if (at < 0 || to < 0 || to >= ids.length) return;
  [ids[at], ids[to]] = [ids[to]!, ids[at]!];
  for (const [pos, rid] of ids.entries()) check(await db.from(table).update({ position: pos }).eq("id", rid));
}

export const moveModule = defineAction(
  z.object({ module_id: zf.uuid(), dir: z.enum(["up", "down"]) }),
  async (i, { db }) => {
    const versionId = await versionOfModule(db, i.module_id);
    await requireDraft(db, versionId);
    await reorder(db, "course_modules", "version_id", versionId, i.module_id, i.dir);
    return { revalidate: [`/academy/author/versions/${versionId}`] };
  },
  AUTHOR,
);

// --- Lessons ---------------------------------------------------------------

const KINDS = ["content", "video", "scenario", "reflection", "quiz", "resource"] as const;

export const addLesson = defineAction(
  z.object({ module_id: zf.uuid(), title: zf.required("Lesson title", 200), kind: z.enum(KINDS), estimated_minutes: zf.optionalInt(), required: zf.checkbox() }),
  async (i, { db }) => {
    const versionId = await versionOfModule(db, i.module_id);
    await requireDraft(db, versionId);
    const { data: last } = await db.from("lessons").select("position").eq("module_id", i.module_id).order("position", { ascending: false }).limit(1).maybeSingle();
    const content = i.kind === "scenario"
      ? { blocks: [], scenario: { start: "start", nodes: { start: { text: "", choices: [] } } } }
      : { blocks: [] };
    const lesson = check(await db.from("lessons").insert({ module_id: i.module_id, title: i.title, kind: i.kind, estimated_minutes: i.estimated_minutes, required: i.required,
      is_assessment: i.kind === "quiz", position: (last?.position ?? -1) + 1, content }).select("id").single());
    return { redirect: `/academy/author/lessons/${lesson.id}` };
  },
  AUTHOR,
);

export const updateLesson = defineAction(
  z.object({
    lesson_id: zf.uuid(), title: zf.required("Lesson title", 200), kind: z.enum(KINDS), estimated_minutes: zf.optionalInt(), required: zf.checkbox(),
    pass_mark: zf.optionalInt().refine((v) => v === null || (v >= 0 && v <= 100), "Between 0 and 100"),
    max_attempts: zf.optionalInt().refine((v) => v === null || v > 0, "At least 1, or leave blank for unlimited"),
  }),
  async (i, { db }) => {
    const ctx = await lessonContext(db, i.lesson_id);
    await requireDraft(db, ctx.versionId);
    const isQuiz = i.kind === "quiz";
    check(await db.from("lessons").update({ title: i.title, kind: i.kind, estimated_minutes: i.estimated_minutes, required: i.required, is_assessment: isQuiz,
      pass_mark: isQuiz ? i.pass_mark : null, max_attempts: isQuiz ? i.max_attempts : null }).eq("id", i.lesson_id));
    return { message: "Lesson settings saved.", revalidate: [`/academy/author/lessons/${i.lesson_id}`, `/academy/author/versions/${ctx.versionId}`] };
  },
  AUTHOR,
);

export const deleteLesson = defineAction(
  z.object({ lesson_id: zf.uuid() }),
  async (i, { db }) => {
    const ctx = await lessonContext(db, i.lesson_id);
    await requireDraft(db, ctx.versionId);
    check(await db.from("lessons").delete().eq("id", i.lesson_id));
    return { message: "Lesson removed.", revalidate: [`/academy/author/versions/${ctx.versionId}`] };
  },
  AUTHOR,
);

export const moveLesson = defineAction(
  z.object({ lesson_id: zf.uuid(), dir: z.enum(["up", "down"]) }),
  async (i, { db }) => {
    const ctx = await lessonContext(db, i.lesson_id);
    await requireDraft(db, ctx.versionId);
    await reorder(db, "lessons", "module_id", ctx.module_id, i.lesson_id, i.dir);
    return { revalidate: [`/academy/author/versions/${ctx.versionId}`] };
  },
  AUTHOR,
);

export const saveLessonContent = defineAction(
  z.object({ lesson_id: zf.uuid(), content: z.string().max(500000) }),
  async (i, { db }) => {
    const ctx = await lessonContext(db, i.lesson_id);
    await requireDraft(db, ctx.versionId);
    let raw: unknown;
    try { raw = JSON.parse(i.content); } catch { throw new UserError("The lesson content could not be read. Please try again."); }
    const parsed = z.object({ blocks: z.array(blockSchema).max(100), scenario: scenarioSchema.optional(), prompt: z.string().max(1000).optional() }).safeParse(raw);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const where = issue?.path[0] === "blocks" && typeof issue.path[1] === "number" ? `Block ${issue.path[1] + 1}: ` : "";
      throw new UserError(`${where}${issue?.message ?? "Please check the content."}`);
    }
    const content = { blocks: parsed.data.blocks, ...(ctx.kind === "scenario" && parsed.data.scenario ? { scenario: parsed.data.scenario } : {}), ...(parsed.data.prompt ? { prompt: parsed.data.prompt } : {}) };
    const res = check(await db.from("lessons").update({ content }).eq("id", i.lesson_id).select("id"));
    if (!res.length) throw new UserError("Only draft versions can be edited.");
    return { message: "Lesson content saved.", revalidate: [`/academy/author/lessons/${i.lesson_id}`] };
  },
  AUTHOR,
);

const MEDIA_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif", "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/vnd.openxmlformats-officedocument.presentationml.presentation"];

export const uploadMedia = defineAction(
  z.object({ lesson_id: zf.uuid(), file: z.any() }),
  async (i, { db, session }) => {
    const ctx = await lessonContext(db, i.lesson_id);
    await requireDraft(db, ctx.versionId);
    const file = i.file;
    if (!(file instanceof File) || file.size === 0) throw new UserError("Choose a file to upload.");
    if (file.size > 25 * 1024 * 1024) throw new UserError("Files must be 25 MB or smaller.");
    if (!MEDIA_TYPES.includes(file.type)) throw new UserError("Upload an image (PNG, JPEG, WebP, GIF), a PDF, or a Word or PowerPoint file.");
    const path = `${session.orgId}/lessons/${i.lesson_id}/${crypto.randomUUID()}-${file.name.replace(/[^\w.-]+/g, "_").slice(-80)}`;
    const { error } = await db.storage.from("academy-media").upload(path, file, { contentType: file.type });
    if (error) throw new UserError("The file could not be uploaded. Please try again.");
    const { data: signed } = await db.storage.from("academy-media").createSignedUrl(path, 3600);
    return { message: "Uploaded.", data: { path, url: signed?.signedUrl ?? null, name: file.name } };
  },
  AUTHOR,
);

// --- Questions -------------------------------------------------------------

const questionSchema = z.object({
  kind: z.enum(["single", "multiple", "true_false"]),
  prompt: z.string().trim().min(1, "Write the question").max(1000),
  options: z.array(z.object({ id: z.string().regex(/^[a-z0-9]{1,4}$/), text: z.string().trim().min(1, "Every option needs text").max(500) })).min(2, "Add at least two options").max(8),
  correct: z.array(z.string()).min(1, "Mark the correct answer"),
  feedback_correct: z.string().max(1000).optional(),
  feedback_incorrect: z.string().max(1000).optional(),
  explanation: z.string().max(1000).optional(),
});

function parseQuestion(payload: string) {
  let raw: unknown;
  try { raw = JSON.parse(payload); } catch { throw new UserError("The question could not be read."); }
  const r = questionSchema.safeParse(raw);
  if (!r.success) throw new UserError(r.error.issues[0]?.message ?? "Please check the question.");
  const q = r.data;
  const ids = new Set(q.options.map((o) => o.id));
  if (ids.size !== q.options.length) throw new UserError("Options must be distinct.");
  if (!q.correct.every((c) => ids.has(c))) throw new UserError("The correct answer must be one of the options.");
  if (q.kind !== "multiple" && q.correct.length !== 1) throw new UserError("Choose exactly one correct answer.");
  return q;
}

export const saveQuestion = defineAction(
  z.object({ lesson_id: zf.uuid(), question_id: zf.optionalUuid(), payload: z.string().max(20000) }),
  async (i, { db }) => {
    const ctx = await lessonContext(db, i.lesson_id);
    await requireDraft(db, ctx.versionId);
    const q = parseQuestion(i.payload);
    const key = { correct: q.correct, feedback_correct: q.feedback_correct || null, feedback_incorrect: q.feedback_incorrect || null, explanation: q.explanation || null };
    if (i.question_id) {
      const res = check(await db.from("questions").update({ kind: q.kind, prompt: q.prompt, options: q.options }).eq("id", i.question_id).eq("lesson_id", i.lesson_id).select("id"));
      if (!res.length) throw new UserError("Question not found.");
      check(await db.from("question_keys").upsert({ question_id: i.question_id, ...key }));
    } else {
      const { data: last } = await db.from("questions").select("position").eq("lesson_id", i.lesson_id).order("position", { ascending: false }).limit(1).maybeSingle();
      const created = check(await db.from("questions").insert({ lesson_id: i.lesson_id, kind: q.kind, prompt: q.prompt, options: q.options, position: (last?.position ?? -1) + 1 }).select("id").single());
      check(await db.from("question_keys").insert({ question_id: created.id, ...key }));
    }
    return { message: "Question saved.", revalidate: [`/academy/author/lessons/${i.lesson_id}`] };
  },
  AUTHOR,
);

export const deleteQuestion = defineAction(
  z.object({ lesson_id: zf.uuid(), question_id: zf.uuid() }),
  async (i, { db }) => {
    const ctx = await lessonContext(db, i.lesson_id);
    await requireDraft(db, ctx.versionId);
    check(await db.from("questions").delete().eq("id", i.question_id).eq("lesson_id", i.lesson_id));
    return { message: "Question removed.", revalidate: [`/academy/author/lessons/${i.lesson_id}`] };
  },
  AUTHOR,
);

export const moveQuestion = defineAction(
  z.object({ lesson_id: zf.uuid(), question_id: zf.uuid(), dir: z.enum(["up", "down"]) }),
  async (i, { db }) => {
    const ctx = await lessonContext(db, i.lesson_id);
    await requireDraft(db, ctx.versionId);
    await reorder(db, "questions", "lesson_id", i.lesson_id, i.question_id, i.dir);
    return { revalidate: [`/academy/author/lessons/${i.lesson_id}`] };
  },
  AUTHOR,
);

// --- Workflow ----------------------------------------------------------------

export const submitForReview = defineAction(
  z.object({ version_id: zf.uuid(), change_summary: zf.optionalText(2000) }),
  async (i, { db }) => {
    if (i.change_summary) {
      await requireDraft(db, i.version_id);
      check(await db.from("course_versions").update({ change_summary: i.change_summary }).eq("id", i.version_id));
    }
    check(await db.rpc("academy_transition_version", { p_version: i.version_id, p_to: "review" }));
    kickJobs();
    return { message: "Submitted for review. A reviewer has been notified.", revalidate: [`/academy/author/versions/${i.version_id}`, "/academy/author"] };
  },
  AUTHOR,
);

export const withdrawFromReview = defineAction(
  z.object({ version_id: zf.uuid() }),
  async (i, { db }) => {
    check(await db.rpc("academy_transition_version", { p_version: i.version_id, p_to: "draft", p_note: "Withdrawn by the author for further changes" }));
    return { message: "Back in draft. You can carry on editing.", revalidate: [`/academy/author/versions/${i.version_id}`, "/academy/author"] };
  },
  AUTHOR,
);

export const startNewVersion = defineAction(
  z.object({ course_id: zf.uuid() }),
  async (i, { db }) => {
    const id = check(await db.rpc("academy_new_version", { p_course: i.course_id }));
    return { redirect: `/academy/author/versions/${id}` };
  },
  AUTHOR,
);

// --- Preview scoring (authors only; nothing is stored) ----------------------

export const previewAssessment = defineAction(
  z.looseObject({ lesson_id: zf.uuid() }),
  async (i, { db }) => {
    const { data: lesson } = await db.from("lessons").select("pass_mark, max_attempts, course_modules(course_versions(pass_mark))").eq("id", i.lesson_id).maybeSingle();
    if (!lesson) throw new UserError("Lesson not found.");
    const { data: qs } = await db.from("questions").select("id, question_keys(correct, feedback_correct, feedback_incorrect, explanation)").eq("lesson_id", i.lesson_id).order("position");
    if (!qs?.length) throw new UserError("Add questions before previewing the check.");
    const versionPass = (lesson.course_modules as unknown as { course_versions: { pass_mark: number } }).course_versions.pass_mark;
    let right = 0;
    const results = qs.map((q) => {
      const key = (Array.isArray(q.question_keys) ? q.question_keys[0] : q.question_keys) as { correct: string[]; feedback_correct: string | null; feedback_incorrect: string | null; explanation: string | null } | null;
      const given = ((i[`a_${q.id}`] as string[] | string | undefined) ?? []);
      const g = (Array.isArray(given) ? given : [given]).map(String).sort();
      const ok = !!key && JSON.stringify(g) === JSON.stringify([...key.correct].sort());
      if (ok) right++;
      return { question_id: q.id, correct: ok, feedback: ok ? key?.feedback_correct ?? null : key?.feedback_incorrect ?? null, explanation: key?.explanation ?? null };
    });
    const score = Math.round((100 * right) / qs.length);
    const pass = lesson.pass_mark ?? versionPass;
    return { data: { score, passed: score >= pass, pass_mark: pass, attempt_no: 1, attempts_remaining: null, enrolment_status: "preview", results } };
  },
  AUTHOR,
);
