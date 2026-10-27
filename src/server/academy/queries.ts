import "server-only";
import type { DB } from "../supabase";
import { parseContent, type Block } from "./content";

export type OutlineLesson = {
  id: string; title: string; kind: string; position: number; estimated_minutes: number | null;
  required: boolean; is_assessment: boolean; pass_mark: number | null; max_attempts: number | null;
};
export type OutlineModule = { id: string; title: string; summary: string; position: number; lessons: OutlineLesson[] };

/** Modules and lessons of a version, in order. Runs as the user (RLS applies). */
export async function loadOutline(db: DB, versionId: string): Promise<OutlineModule[]> {
  const { data } = await db.from("course_modules")
    .select("id, title, summary, position, lessons(id, title, kind, position, estimated_minutes, required, is_assessment, pass_mark, max_attempts)")
    .eq("version_id", versionId).order("position");
  return (data ?? []).map((m) => ({
    ...m,
    lessons: ((m.lessons ?? []) as OutlineLesson[]).slice().sort((a, b) => a.position - b.position),
  }));
}

export const flatLessons = (outline: OutlineModule[]) => outline.flatMap((m) => m.lessons);

export const outlineMinutes = (outline: OutlineModule[]) => flatLessons(outline).reduce((n, l) => n + (l.estimated_minutes ?? 0), 0);

/** The first lesson not yet completed, or the first lesson. */
export function resumeLesson(outline: OutlineModule[], completed: Set<string>): OutlineLesson | null {
  const all = flatLessons(outline);
  return all.find((l) => !completed.has(l.id)) ?? all[0] ?? null;
}

/** Short-lived signed URLs for academy-media paths referenced by blocks. */
export async function signMedia(db: DB, blocks: Block[]): Promise<Record<string, string>> {
  const paths = [...new Set(blocks.flatMap((b) => (b.type === "image" ? [b.path] : b.type === "resource" && b.path ? [b.path] : [])))];
  if (!paths.length) return {};
  const { data } = await db.storage.from("academy-media").createSignedUrls(paths, 3600);
  const out: Record<string, string> = {};
  for (const r of data ?? []) if (r.path && r.signedUrl) out[r.path] = r.signedUrl;
  return out;
}

/** A lesson's content and its learner-visible questions. Never touches question_keys. */
export async function loadLessonForLearner(db: DB, lessonId: string) {
  const { data: lesson } = await db.from("lessons")
    .select("id, title, kind, content, estimated_minutes, required, is_assessment, pass_mark, max_attempts, module_id, course_modules(version_id)")
    .eq("id", lessonId).maybeSingle();
  if (!lesson) return null;
  const content = parseContent(lesson.content);
  const { data: questions } = lesson.kind === "quiz" || lesson.is_assessment
    ? await db.from("questions").select("id, position, kind, prompt, options").eq("lesson_id", lessonId).order("position")
    : { data: [] };
  const media = await signMedia(db, content.blocks);
  return {
    lesson: { ...lesson, versionId: (lesson.course_modules as unknown as { version_id: string }).version_id },
    content, media,
    questions: (questions ?? []).map((q) => ({ ...q, options: (q.options ?? []) as { id: string; text: string }[] })),
  };
}

export type LearnerQuestion = NonNullable<Awaited<ReturnType<typeof loadLessonForLearner>>>["questions"][number];

export type MyEnrolment = {
  id: string; status: string; source: string; enrolled_at: string; completed_at: string | null; last_activity_at: string | null; due_on: string | null;
  course_version_id: string; version_no: number;
  course: { id: string; slug: string; title: string; summary: string; level: string; principle: string | null; estimated_minutes: number | null; is_placeholder_content: boolean };
  total: number; done: number; pct: number; next: { id: string; title: string } | null;
};

/** The signed-in learner's enrolments with progress and the next lesson to open. */
export async function loadMyEnrolments(db: DB, personId: string, opts: { includeWithdrawn?: boolean } = {}): Promise<MyEnrolment[]> {
  let q = db.from("enrolments")
    .select("id, status, source, enrolled_at, completed_at, last_activity_at, due_on, course_version_id, course_versions(version_no), courses(id, slug, title, summary, level, principle, estimated_minutes, is_placeholder_content)")
    .eq("person_id", personId).order("enrolled_at", { ascending: false });
  if (!opts.includeWithdrawn) q = q.neq("status", "withdrawn");
  const { data: rows } = await q;
  if (!rows?.length) return [];
  const versionIds = [...new Set(rows.map((r) => r.course_version_id))];
  const [{ data: modules }, { data: progress }] = await Promise.all([
    db.from("course_modules").select("version_id, position, lessons(id, title, position)").in("version_id", versionIds).order("position"),
    db.from("lesson_progress").select("enrolment_id, lesson_id").in("enrolment_id", rows.map((r) => r.id)),
  ]);
  const lessonsByVersion = new Map<string, { id: string; title: string }[]>();
  for (const m of modules ?? []) {
    const list = lessonsByVersion.get(m.version_id) ?? [];
    list.push(...((m.lessons ?? []) as { id: string; title: string; position: number }[]).sort((a, b) => a.position - b.position));
    lessonsByVersion.set(m.version_id, list);
  }
  const doneBy = new Map<string, Set<string>>();
  for (const p of progress ?? []) {
    const s = doneBy.get(p.enrolment_id) ?? new Set();
    s.add(p.lesson_id);
    doneBy.set(p.enrolment_id, s);
  }
  return rows.map((r) => {
    const lessons = lessonsByVersion.get(r.course_version_id) ?? [];
    const done = doneBy.get(r.id) ?? new Set<string>();
    const doneCount = lessons.filter((l) => done.has(l.id)).length;
    return {
      ...r,
      version_no: (r.course_versions as unknown as { version_no: number }).version_no,
      course: r.courses as unknown as MyEnrolment["course"],
      total: lessons.length, done: doneCount,
      pct: r.status === "completed" ? 100 : lessons.length ? (100 * doneCount) / lessons.length : 0,
      next: lessons.find((l) => !done.has(l.id)) ?? null,
    };
  });
}

/** Whether authors may edit published versions in place (organisation setting academy.live_editing). */
export async function liveEditing(db: DB): Promise<boolean> {
  const { data } = await db.from("organisations").select("settings").single();
  return (data?.settings as { academy?: { live_editing?: boolean } } | null)?.academy?.live_editing === true;
}
