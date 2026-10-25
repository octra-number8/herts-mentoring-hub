import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LessonBlocks } from "@/components/academy/lesson-blocks";
import { CompleteLessonForm, ReflectionForm } from "@/components/academy/lesson-forms";
import { LessonFrame } from "@/components/academy/lesson-layout";
import { QuizPlayer } from "@/components/academy/quiz-player";
import { ScenarioPlayer } from "@/components/academy/scenario-player";
import { PlaceholderNotice } from "@/components/academy/ui";
import { Alert } from "@/components/ui/layout";
import { flatLessons, loadLessonForLearner, loadOutline } from "@/server/academy/queries";
import { requirePermission } from "@/server/session";
import { supabaseServer } from "@/server/supabase";
import { completeLesson, submitAssessment } from "../../../actions";

export const metadata: Metadata = { title: "Lesson" };

export default async function LessonPage({ params }: { params: Promise<{ enrolmentId: string; lessonId: string }> }) {
  const session = await requirePermission("academy.learn");
  const { enrolmentId, lessonId } = await params;
  const db = await supabaseServer();

  const { data: enrolment } = await db.from("enrolments")
    .select("id, person_id, status, course_version_id, courses(title, slug, is_placeholder_content), course_versions(pass_mark)")
    .eq("id", enrolmentId).maybeSingle();
  // Administrators can read other learners' enrolments; the player is only for your own.
  if (!enrolment || enrolment.person_id !== session.personId) notFound();
  const course = enrolment.courses as unknown as { title: string; slug: string; is_placeholder_content: boolean };
  const version = enrolment.course_versions as unknown as { pass_mark: number };

  const outline = await loadOutline(db, enrolment.course_version_id);
  const all = flatLessons(outline);
  const index = all.findIndex((l) => l.id === lessonId);
  if (index < 0) notFound();
  const loaded = await loadLessonForLearner(db, lessonId);
  if (!loaded) notFound();
  const { lesson, content, media, questions } = loaded;

  const [{ data: progress }, { data: attempts }, { data: reflection }] = await Promise.all([
    db.from("lesson_progress").select("lesson_id").eq("enrolment_id", enrolmentId),
    lesson.kind === "quiz" || lesson.is_assessment
      ? db.from("assessment_attempts").select("attempt_no, score, passed, submitted_at").eq("enrolment_id", enrolmentId).eq("lesson_id", lessonId).order("attempt_no")
      : Promise.resolve({ data: [] as { attempt_no: number; score: number; passed: boolean; submitted_at: string }[] }),
    lesson.kind === "reflection"
      ? db.from("reflections").select("response").eq("lesson_id", lessonId).eq("person_id", session.personId).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const completed = new Set((progress ?? []).map((p) => p.lesson_id));
  const prev = all[index - 1], next = all[index + 1];
  const href = (id: string) => `/academy/learn/${enrolmentId}/${id}`;
  const courseHref = `/academy/courses/${course.slug}`;
  const moduleTitle = outline.find((m) => m.lessons.some((l) => l.id === lessonId))?.title ?? "";
  const isDone = completed.has(lessonId);
  const withdrawn = enrolment.status === "withdrawn";
  const fields = { enrolment_id: enrolmentId, lesson_id: lessonId, slug: course.slug, next: next ? href(next.id) : undefined };

  const finish = withdrawn ? null : isDone ? (
    next ? <Link href={href(next.id)} className="inline-flex h-10 items-center rounded-md bg-teal-700 px-4 font-medium text-white hover:bg-teal-800">Continue to the next lesson</Link> : null
  ) : <CompleteLessonForm action={completeLesson} fields={fields} hasNext={!!next} />;

  return (
    <LessonFrame courseTitle={course.title} courseHref={courseHref} outline={outline} completed={completed} lesson={lesson}
      moduleTitle={moduleTitle} href={href} prevId={prev?.id} nextId={next?.id}
      notice={<div className="mb-6 space-y-3">
        {course.is_placeholder_content && <PlaceholderNotice />}
        {withdrawn && <Alert tone="info" title="You have left this course">You can still look back through it. <Link className="underline" href={courseHref}>Enrol again</Link> to continue.</Alert>}
      </div>}>
      <LessonBlocks blocks={content.blocks} media={media} />

      {lesson.kind === "scenario" && content.scenario && <ScenarioPlayer scenario={content.scenario} finished={finish} />}

      {lesson.kind === "reflection" && !withdrawn && (
        <section aria-labelledby="reflect" className="rounded-xl border border-line bg-white p-5">
          <h2 id="reflect" className="mb-3 text-lg font-semibold text-navy-900">Your reflection</h2>
          <ReflectionForm action={completeLesson} fields={fields} existing={reflection?.response ?? null} prompt={content.prompt} hasNext={!!next} />
        </section>
      )}

      {(lesson.kind === "quiz" || lesson.is_assessment) && (
        <section aria-labelledby="check">
          <h2 id="check" className="mb-3 text-lg font-semibold text-navy-900">Knowledge check</h2>
          {withdrawn ? <p className="text-sm text-muted">Enrol again to take this knowledge check.</p> : (
            <QuizPlayer action={submitAssessment} hidden={{ enrolment_id: enrolmentId, lesson_id: lessonId, slug: course.slug }}
              questions={questions} passMark={lesson.pass_mark ?? version.pass_mark} maxAttempts={lesson.max_attempts}
              attemptsUsed={attempts?.length ?? 0} alreadyPassed={(attempts ?? []).some((a) => a.passed)}
              nextHref={next ? href(next.id) : undefined} courseHref={courseHref} />
          )}
          {attempts && attempts.length > 0 && (
            <details className="mt-4 text-sm">
              <summary className="cursor-pointer font-medium text-navy-800">Previous attempts ({attempts.length})</summary>
              <ul className="mt-2 space-y-1 text-slate-ink">
                {attempts.map((a) => <li key={a.attempt_no}>Attempt {a.attempt_no}: {a.score}% · {a.passed ? "Passed" : "Not yet passed"}</li>)}
              </ul>
            </details>
          )}
        </section>
      )}

      {["content", "video", "resource"].includes(lesson.kind) && !lesson.is_assessment && finish && <div>{finish}</div>}
      {lesson.kind === "scenario" && !content.scenario && finish && <div>{finish}</div>}
    </LessonFrame>
  );
}
