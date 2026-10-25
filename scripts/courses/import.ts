/**
 * Imports Academy courses written in scripts/courses/*.ts as draft Version 1,
 * submitted for review (never published: approval happens in the Hub).
 *
 *   ENV_FILE=<env> AUTHOR_EMAIL=<author account email> npx tsx scripts/courses/import.ts
 *
 * Idempotent: a course whose slug already exists is skipped. Content is validated
 * against the lesson player's own schema first. Remote targets need
 * ALLOW_REMOTE_IMPORT=yes.
 */
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { blockSchema, scenarioProblems } from "../../src/server/academy/content";
import type { CourseDef } from "./types";
import { e1 } from "./e1-lodge-mentor-essentials";
import { e2 } from "./e2-personal-mentor-course";
import { e6 } from "./e6-chair-and-beyond";

config({ path: process.env.ENV_FILE ?? ".env.local", quiet: true });
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
if (!/127\.0\.0\.1|localhost/.test(URL) && process.env.ALLOW_REMOTE_IMPORT !== "yes") throw new Error("Set ALLOW_REMOTE_IMPORT=yes to import into a hosted project");
const db = createClient(URL, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const COURSES: CourseDef[] = [e1, e2, e6];
const ids = "abcdefghij".split("");

function validate(c: CourseDef): string[] {
  const out: string[] = [];
  for (const m of c.modules) for (const l of m.lessons) {
    for (const b of l.blocks) { const r = blockSchema.safeParse(b); if (!r.success) out.push(`${c.slug} / ${l.title}: ${r.error.issues[0]?.message}`); }
    if (l.kind === "scenario") out.push(...scenarioProblems(l.scenario).map((p) => `${c.slug} / ${l.title}: ${p}`));
    if (l.kind === "quiz" && !l.questions?.length) out.push(`${c.slug} / ${l.title}: quiz has no questions`);
    for (const q of l.questions ?? []) if (!q.correct.length || q.correct.some((i) => i >= q.options.length)) out.push(`${c.slug} / ${l.title}: bad answer key for "${q.prompt}"`);
    if (/—/.test(JSON.stringify(l))) out.push(`${c.slug} / ${l.title}: contains an em-dash (A3 style)`);
  }
  return out;
}

async function must<T>(p: PromiseLike<{ data: T; error: unknown }>, what: string): Promise<T> {
  const { data, error } = await p;
  if (error) throw new Error(`${what}: ${JSON.stringify(error)}`);
  return data;
}

async function main() {
  const problems = COURSES.flatMap(validate);
  if (problems.length) { console.error(problems.join("\n")); process.exit(1); }
  const org = await must(db.from("organisations").select("id").eq("slug", "herts").single(), "org") as { id: string };
  let author: string | null = null;
  if (process.env.AUTHOR_EMAIL) {
    const { data } = await db.from("user_accounts").select("id, persons!inner(email)").eq("persons.email", process.env.AUTHOR_EMAIL).maybeSingle();
    author = data?.id ?? null;
    if (!author) throw new Error(`No account for ${process.env.AUTHOR_EMAIL}`);
  }
  for (const c of COURSES) {
    const { data: existing } = await db.from("courses").select("id").eq("org_id", org.id).eq("slug", c.slug).maybeSingle();
    if (existing) { console.log(`skip  ${c.slug} (exists)`); continue; }
    const course = await must(db.from("courses").insert({ org_id: org.id, slug: c.slug, title: c.title, summary: c.summary, audiences: c.audiences,
      masonic_stages: c.stages, topics: c.topics, level: c.level, principle: c.principle, estimated_minutes: c.minutes,
      is_placeholder_content: false, owner_account_id: author }).select("id").single(), "course") as { id: string };
    const version = await must(db.from("course_versions").insert({ org_id: org.id, course_id: course.id, version_no: 1, status: "review",
      title: c.title, summary: c.summary, pass_mark: c.passMark, completion_rule: "all_lessons_and_assessments", certificate_enabled: true,
      change_summary: `First online issue, adapted from ${c.source}.`, created_by: author, submitted_by: author, submitted_at: new Date().toISOString() })
      .select("id").single(), "version") as { id: string };
    let lessons = 0, questions = 0;
    for (const [mi, m] of c.modules.entries()) {
      const mod = await must(db.from("course_modules").insert({ version_id: version.id, position: mi + 1, title: m.title, summary: m.summary }).select("id").single(), "module") as { id: string };
      for (const [li, l] of m.lessons.entries()) {
        const assessment = l.kind === "quiz" && l.isAssessment !== false;
        const lesson = await must(db.from("lessons").insert({ module_id: mod.id, position: li + 1, title: l.title, kind: l.kind,
          content: { blocks: l.blocks, ...(l.scenario ? { scenario: l.scenario } : {}), ...(l.prompt ? { prompt: l.prompt } : {}) },
          estimated_minutes: l.minutes, is_assessment: assessment, pass_mark: l.passMark ?? null,
          max_attempts: assessment ? l.maxAttempts ?? null : null, required: true }).select("id").single(), "lesson") as { id: string };
        lessons++;
        for (const [qi, q] of (l.questions ?? []).entries()) {
          const question = await must(db.from("questions").insert({ lesson_id: lesson.id, position: qi + 1, kind: q.kind, prompt: q.prompt,
            options: q.options.map((text, i) => ({ id: ids[i], text })) }).select("id").single(), "question") as { id: string };
          await must(db.from("question_keys").insert({ question_id: question.id, correct: q.correct.map((i) => ids[i]),
            feedback_correct: q.feedbackCorrect ?? null, feedback_incorrect: q.feedbackIncorrect ?? null, explanation: q.explanation ?? null }), "key");
          questions++;
        }
      }
    }
    if (c.pathway) {
      let { data: pw } = await db.from("pathways").select("id").eq("org_id", org.id).eq("slug", c.pathway).maybeSingle();
      if (!pw && c.pathway === "wardens-and-masters") {
        pw = await must(db.from("pathways").insert({ org_id: org.id, slug: "wardens-and-masters", title: "Wardens and Masters pathway", audience: "all",
          summary: "For Wardens, Masters Elect and Masters in the Chair, and the year after.", position: 4, published: true }).select("id").single(), "pathway") as { id: string };
      }
      if (pw) await must(db.from("pathway_courses").insert({ pathway_id: pw.id, course_id: course.id, position: 0, requirement: c.level === "essential" ? "essential" : "optional" }), "pathway course");
    }
    await db.from("domain_events").insert({ org_id: org.id, type: "approval.required", entity_type: "course_version", entity_id: version.id, payload: { kind: "course", title: c.title } });
    console.log(`added ${c.slug}: ${c.modules.length} modules, ${lessons} lessons, ${questions} questions, in review`);
  }
}

main().catch((e) => { console.error(e.message ?? e); process.exit(1); });
