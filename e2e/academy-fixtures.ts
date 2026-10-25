import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { secrets } from "./helpers";

config({ path: ".env.local", quiet: true });

export function serviceClient(): SupabaseClient {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
}

/**
 * A uniquely named, published course with one lesson of each interactive kind,
 * created with the service role so each test run has a course nobody has taken.
 */
export async function createPublishedCourse(stamp: string) {
  const db = serviceClient();
  const title = `E2E course ${stamp}`;
  const slug = `e2e-course-${stamp}`;
  const must = <T,>(r: { data: T; error: unknown }) => { if (r.error) throw r.error; return r.data as NonNullable<T>; };
  const course = must(await db.from("courses").insert({ org_id: secrets.orgId, slug, title, summary: "A short synthetic course used by end-to-end tests.", audiences: ["newer_brother"], level: "optional", principle: "support", estimated_minutes: 10 }).select("id").single()) as { id: string };
  const version = must(await db.from("course_versions").insert({ org_id: secrets.orgId, course_id: course.id, version_no: 1, title, summary: "A short synthetic course used by end-to-end tests.", status: "draft", pass_mark: 100, completion_rule: "all_lessons_and_assessments", certificate_enabled: true }).select("id").single()) as { id: string };
  const mod = must(await db.from("course_modules").insert({ version_id: version.id, position: 0, title: "The essentials" }).select("id").single()) as { id: string };
  const base = { module_id: mod.id, is_assessment: false, max_attempts: null, estimated_minutes: 2, required: true };
  const lessons = must(await db.from("lessons").insert([
    { ...base, position: 0, title: "Welcome", kind: "content", content: { blocks: [{ type: "text", markdown: "## Welcome\n\nThis is a **synthetic** lesson." }, { type: "principles" }] } },
    { ...base, position: 1, title: "A first conversation", kind: "scenario", content: { blocks: [], scenario: { start: "a", nodes: {
      a: { text: "A newer Brother says he feels lost.", choices: [{ label: "Ask how he is finding things", next: "end", feedback: "A good start: How can we help?" }, { label: "Tell him to read more", next: "a", feedback: "Reassurance first." }] },
      end: { text: "You have reached the end of the scenario.", choices: [] } } } } },
    { ...base, position: 2, title: "Reflection", kind: "reflection", content: { blocks: [], prompt: "What helped you settle in?" } },
    { ...base, position: 3, title: "Knowledge check", kind: "quiz", is_assessment: true, max_attempts: 3, content: { blocks: [] } },
  ]).select("id, kind")) as { id: string; kind: string }[];
  const quiz = lessons.find((l) => l.kind === "quiz")!;
  const q = must(await db.from("questions").insert({ lesson_id: quiz.id, position: 0, kind: "single", prompt: "Which question fits the Hertfordshire approach?",
    options: [{ id: "a", text: "How can we help?" }, { id: "b", text: "Why aren't you attending?" }] }).select("id").single()) as { id: string };
  must(await db.from("question_keys").insert({ question_id: q.id, correct: ["a"], feedback_correct: "Yes, that is the house phrase.", feedback_incorrect: "The house phrase is How can we help?" }));
  must(await db.from("course_versions").update({ status: "published", published_at: new Date().toISOString() }).eq("id", version.id));
  must(await db.from("courses").update({ published_version_id: version.id }).eq("id", course.id));
  return { courseId: course.id, versionId: version.id, slug, title, lessons };
}

/** Withdraw test courses from the shared catalogue after a run. */
export async function archiveCourses(slugPrefix: string) {
  const db = serviceClient();
  const { data } = await db.from("courses").select("id").like("slug", `${slugPrefix}%`);
  for (const c of data ?? []) {
    await db.from("enrolments").update({ status: "withdrawn" }).eq("course_id", c.id).in("status", ["enrolled", "in_progress"]);
    await db.from("course_versions").update({ status: "archived" }).eq("course_id", c.id).in("status", ["published", "approved", "review", "draft"]);
    await db.from("courses").update({ published_version_id: null, archived_at: new Date().toISOString() }).eq("id", c.id);
  }
}
