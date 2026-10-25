import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LessonBlocks } from "@/components/academy/lesson-blocks";
import { LessonFrame } from "@/components/academy/lesson-layout";
import { QuizPlayer } from "@/components/academy/quiz-player";
import { ScenarioPlayer } from "@/components/academy/scenario-player";
import { PlaceholderNotice } from "@/components/academy/ui";
import { label } from "@/lib/utils";
import { flatLessons, loadLessonForLearner, loadOutline } from "@/server/academy/queries";
import { requirePermission } from "@/server/session";
import { supabaseServer } from "@/server/supabase";
import { previewAssessment } from "../../../actions";

export const metadata: Metadata = { title: "Preview" };

/** The lesson player as a learner would see it, for any version. Nothing is recorded. */
export default async function PreviewPage({ params }: { params: Promise<{ versionId: string; lessonId: string }> }) {
  await requirePermission("academy.author");
  const { versionId, lessonId } = await params;
  const db = await supabaseServer();
  const { data: version } = await db.from("course_versions").select("id, version_no, status, title, pass_mark, courses!course_versions_course_id_fkey(id, is_placeholder_content)").eq("id", versionId).maybeSingle();
  if (!version) notFound();
  const course = version.courses as unknown as { id: string; is_placeholder_content: boolean };
  const outline = await loadOutline(db, versionId);
  const all = flatLessons(outline);
  const index = all.findIndex((l) => l.id === lessonId);
  if (index < 0) notFound();
  const loaded = await loadLessonForLearner(db, lessonId);
  if (!loaded) notFound();
  const { lesson, content, media, questions } = loaded;
  const href = (id: string) => `/academy/author/preview/${versionId}/${id}`;
  const prev = all[index - 1], next = all[index + 1];
  const backHref = `/academy/author/versions/${versionId}`;

  return (
    <LessonFrame courseTitle={version.title} courseHref={backHref} outline={outline} completed={new Set()} lesson={lesson}
      moduleTitle={outline.find((m) => m.lessons.some((l) => l.id === lessonId))?.title ?? ""} href={href} prevId={prev?.id} nextId={next?.id}
      banner={
        <div role="status" className="mb-5 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-warning-800/20 bg-warning-50 px-4 py-2.5 text-sm text-warning-800">
          <span>Preview of version {version.version_no} ({label(version.status).toLowerCase()}). Nothing you do here is recorded.</span>
          <span className="flex gap-3">
            <Link className="font-medium underline" href={`/academy/author/lessons/${lessonId}`}>Edit this lesson</Link>
            <Link className="font-medium underline" href={backHref}>Back to the version</Link>
          </span>
        </div>
      }
      notice={course.is_placeholder_content ? <div className="mb-6"><PlaceholderNotice /></div> : undefined}>
      <LessonBlocks blocks={content.blocks} media={media} />
      {lesson.kind === "scenario" && content.scenario && (
        <ScenarioPlayer scenario={content.scenario} finished={<p className="text-sm font-medium text-success-700">End of the scenario. Learners now see the button to complete the lesson.</p>} />
      )}
      {lesson.kind === "reflection" && (
        <section className="rounded-xl border border-line bg-white p-5">
          <h2 className="mb-2 text-lg font-semibold text-navy-900">Your reflection</h2>
          <p className="text-sm text-slate-ink">{content.prompt ?? "Your reflection"}</p>
          <p className="mt-2 text-[13px] text-muted">Learners write a private answer here. It is visible only to them.</p>
        </section>
      )}
      {(lesson.kind === "quiz" || lesson.is_assessment) && (
        <section>
          <h2 className="mb-3 text-lg font-semibold text-navy-900">Questions</h2>
          <QuizPlayer action={previewAssessment} hidden={{ lesson_id: lessonId }} questions={questions} passMark={lesson.pass_mark ?? version.pass_mark}
            maxAttempts={lesson.max_attempts} attemptsUsed={0} alreadyPassed={false} nextHref={next ? href(next.id) : undefined} courseHref={backHref} preview />
        </section>
      )}
      {["content", "video", "resource"].includes(lesson.kind) && <p className="text-sm text-muted">Learners see a &quot;Mark complete and continue&quot; button here.</p>}
    </LessonFrame>
  );
}
