/**
 * Imports Academy courses into the Hub for review (never published: approval happens in the Hub).
 *
 *   ENV_FILE=<env> AUTHOR_EMAIL=<author account email> npx tsx scripts/courses/import.ts
 *   ENV_FILE=<env> AUTHOR_EMAIL=<email> COURSE_DIR=<folder of course data .json> npx tsx scripts/courses/import.ts
 *
 * Without COURSE_DIR the courses written in scripts/courses/*.ts are imported. With it, every .json
 * file in the folder is read instead (the library's "Course data" folder, one CourseDef per file).
 *
 * A new course is added as Version 1. A course whose slug already exists gets a new version
 * (latest + 1), unless a version is already being prepared (draft, review or approved), or a
 * version for the same issue label has already been imported. Either way it is submitted for
 * review. The course record itself is not changed: title and summary follow the version when it
 * is published, and differences in the other course details are listed for the reviewer.
 *
 * Content is validated against the lesson player's own schema first. Remote targets need
 * ALLOW_REMOTE_IMPORT=yes. DRY_RUN=yes validates and reports what would happen without writing.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
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
const DRY = process.env.DRY_RUN === "yes";
const ids = "abcdefghij".split("");

function loadCourses(): CourseDef[] {
  const dir = process.env.COURSE_DIR;
  if (!dir) return [e1, e2, e6];
  const files = readdirSync(dir).filter((f) => f.endsWith(".json")).sort();
  if (!files.length) throw new Error(`No .json course files in ${dir}`);
  return files.map((f) => JSON.parse(readFileSync(join(dir, f), "utf8")) as CourseDef);
}

const LEVELS = ["essential", "recommended", "optional"], PRINCIPLES = ["prepare", "guide", "support", "enlighten"];

function validate(c: CourseDef): string[] {
  const out: string[] = [];
  if (!c.slug || !c.title) out.push(`${c.slug ?? "?"}: missing slug or title`);
  if (!LEVELS.includes(c.level)) out.push(`${c.slug}: level "${c.level}" is not one of ${LEVELS.join(", ")}`);
  if (!PRINCIPLES.includes(c.principle)) out.push(`${c.slug}: unknown principle "${c.principle}"`);
  for (const m of c.modules) for (const l of m.lessons) {
    for (const b of l.blocks) { const r = blockSchema.safeParse(b); if (!r.success) out.push(`${c.slug} / ${l.title}: ${r.error.issues[0]?.message}`); }
    if (l.kind === "scenario") out.push(...scenarioProblems(l.scenario).map((p) => `${c.slug} / ${l.title}: ${p}`));
    if (l.kind === "quiz" && !l.questions?.length) out.push(`${c.slug} / ${l.title}: quiz has no questions`);
    if (l.kind === "quiz" && l.isAssessment !== false && l.required === false) out.push(`${c.slug} / ${l.title}: an assessment cannot be optional`);
    for (const q of l.questions ?? []) if (!q.correct.length || q.correct.some((i) => i >= q.options.length)) out.push(`${c.slug} / ${l.title}: bad answer key for "${q.prompt}"`);
    if (/—/.test(JSON.stringify(l))) out.push(`${c.slug} / ${l.title}: contains an em-dash (A3 style)`);
  }
  if (!c.modules.some((m) => m.lessons.some((l) => l.required !== false))) out.push(`${c.slug}: every lesson is optional`);
  return out;
}

async function must<T>(p: PromiseLike<{ data: T; error: unknown }>, what: string): Promise<T> {
  const { data, error } = await p;
  if (error) throw new Error(`${what}: ${JSON.stringify(error)}`);
  return data;
}

const issueMark = (c: CourseDef) => (c.issue ? `[${c.issue}]` : null);

function changeSummary(c: CourseDef, first: boolean): string {
  const head = first ? `First online issue, adapted from ${c.source}.` : `Adapted from ${c.source}.`;
  const lines = [issueMark(c) ? `${issueMark(c)} ${head}` : head, ...(c.changeSummary ?? []).map((s) => `- ${s}`)];
  return lines.join("\n");
}

/** Course details that live on the course record and only change by hand. */
function detailDifferences(c: CourseDef, row: Record<string, unknown>): string[] {
  const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
  const checks: [string, unknown, unknown][] = [
    ["estimated minutes", row.estimated_minutes, c.minutes], ["level", row.level, c.level], ["principle", row.principle, c.principle],
    ["audiences", row.audiences, c.audiences], ["stages", row.masonic_stages, c.stages], ["topics", row.topics, c.topics],
  ];
  return checks.filter(([, a, b]) => !same(a, b)).map(([k, a, b]) => `${k}: ${JSON.stringify(a)} -> ${JSON.stringify(b)}`);
}

async function insertContent(c: CourseDef, versionId: string) {
  let lessons = 0, questions = 0;
  for (const [mi, m] of c.modules.entries()) {
    const mod = await must(db.from("course_modules").insert({ version_id: versionId, position: mi + 1, title: m.title, summary: m.summary }).select("id").single(), "module") as { id: string };
    for (const [li, l] of m.lessons.entries()) {
      const assessment = l.kind === "quiz" && l.isAssessment !== false;
      const lesson = await must(db.from("lessons").insert({ module_id: mod.id, position: li + 1, title: l.title, kind: l.kind,
        content: { blocks: l.blocks, ...(l.scenario ? { scenario: l.scenario } : {}), ...(l.prompt ? { prompt: l.prompt } : {}) },
        estimated_minutes: l.minutes, is_assessment: assessment, pass_mark: l.passMark ?? null,
        max_attempts: assessment ? l.maxAttempts ?? null : null, required: l.required !== false }).select("id").single(), "lesson") as { id: string };
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
  return { lessons, questions };
}

async function main() {
  const COURSES = loadCourses();
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
    const { data: existing } = await db.from("courses").select("id, estimated_minutes, level, principle, audiences, masonic_stages, topics")
      .eq("org_id", org.id).eq("slug", c.slug).maybeSingle();
    let courseId: string, versionNo: number;
    if (existing) {
      const versions = await must(db.from("course_versions").select("version_no, status, change_summary").eq("course_id", existing.id).order("version_no", { ascending: false }), "versions") as
        { version_no: number; status: string; change_summary: string | null }[];
      const mark = issueMark(c);
      if (mark && versions.some((v) => v.change_summary?.startsWith(mark))) { console.log(`skip  ${c.slug} (${c.issue} already imported)`); continue; }
      const open = versions.find((v) => ["draft", "review", "approved"].includes(v.status));
      if (open) { console.log(`skip  ${c.slug} (Version ${open.version_no} is already ${open.status}; finish or return it first)`); continue; }
      courseId = existing.id; versionNo = (versions[0]?.version_no ?? 0) + 1;
    } else {
      courseId = ""; versionNo = 1;
    }
    if (DRY) { console.log(`would ${existing ? `add Version ${versionNo} to` : "add"} ${c.slug}`); }
    else {
      if (!existing) {
        const course = await must(db.from("courses").insert({ org_id: org.id, slug: c.slug, title: c.title, summary: c.summary, audiences: c.audiences,
          masonic_stages: c.stages, topics: c.topics, level: c.level, principle: c.principle, estimated_minutes: c.minutes,
          is_placeholder_content: false, owner_account_id: author }).select("id").single(), "course") as { id: string };
        courseId = course.id;
      }
      const version = await must(db.from("course_versions").insert({ org_id: org.id, course_id: courseId, version_no: versionNo, status: "review",
        title: c.title, summary: c.summary, pass_mark: c.passMark, completion_rule: "all_lessons_and_assessments", certificate_enabled: true,
        change_summary: changeSummary(c, !existing), created_by: author, submitted_by: author, submitted_at: new Date().toISOString() })
        .select("id").single(), "version") as { id: string };
      const { lessons, questions } = await insertContent(c, version.id);
      if (!existing && c.pathway) {
        let { data: pw } = await db.from("pathways").select("id").eq("org_id", org.id).eq("slug", c.pathway).maybeSingle();
        if (!pw && c.pathway === "wardens-and-masters") {
          pw = await must(db.from("pathways").insert({ org_id: org.id, slug: "wardens-and-masters", title: "Wardens and Masters pathway", audience: "all",
            summary: "For Wardens, Masters Elect and Masters in the Chair, and the year after.", position: 4, published: true }).select("id").single(), "pathway") as { id: string };
        }
        if (pw) await must(db.from("pathway_courses").insert({ pathway_id: pw.id, course_id: courseId, position: 0, requirement: c.level === "essential" ? "essential" : "optional" }), "pathway course");
      }
      await db.from("domain_events").insert({ org_id: org.id, type: "approval.required", entity_type: "course_version", entity_id: version.id, payload: { kind: "course", title: c.title } });
      const optional = c.modules.flatMap((m) => m.lessons).filter((l) => l.required === false).length;
      console.log(`added ${c.slug} Version ${versionNo}: ${c.modules.length} modules, ${lessons} lessons (${optional} optional), ${questions} questions, in review`);
    }
    if (existing) {
      const diffs = detailDifferences(c, existing);
      if (diffs.length) console.log(`      course details to update by hand when publishing: ${diffs.join("; ")}`);
    }
  }
}

main().catch((e) => { console.error(e.message ?? e); process.exit(1); });
