import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LessonSettingsForm } from "@/components/academy/author-forms";
import { ContentEditor } from "@/components/academy/content-editor";
import { LessonBlocks } from "@/components/academy/lesson-blocks";
import { QuestionEditor, type EditableQuestion } from "@/components/academy/question-editor";
import { Badge } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { ActionButton } from "@/components/ui/dialog-form";
import { Alert, EmptyState, PageHeader, Panel } from "@/components/ui/layout";
import { label } from "@/lib/utils";
import { lessonKindLabel, parseContent } from "@/server/academy/content";
import { signMedia } from "@/server/academy/queries";
import { requirePermission } from "@/server/session";
import { supabaseServer } from "@/server/supabase";
import { deleteQuestion, moveQuestion, saveLessonContent, saveQuestion, updateLesson, uploadMedia } from "../../actions";

export const metadata: Metadata = { title: "Lesson editor" };

type Key = { correct: string[]; feedback_correct: string | null; feedback_incorrect: string | null; explanation: string | null };

export default async function LessonEditorPage({ params }: { params: Promise<{ lessonId: string }> }) {
  await requirePermission("academy.author");
  const { lessonId } = await params;
  const db = await supabaseServer();
  const { data: lesson } = await db.from("lessons")
    .select("id, title, kind, content, estimated_minutes, required, is_assessment, pass_mark, max_attempts, course_modules(title, version_id, course_versions(id, version_no, status, pass_mark, courses!course_versions_course_id_fkey(id, title)))")
    .eq("id", lessonId).maybeSingle();
  if (!lesson) notFound();
  const mod = lesson.course_modules as unknown as { title: string; version_id: string; course_versions: { id: string; version_no: number; status: string; pass_mark: number; courses: { id: string; title: string } } };
  const version = mod.course_versions;
  const editable = version.status === "draft";
  const content = parseContent(lesson.content);
  const media = await signMedia(db, content.blocks);
  const isQuiz = lesson.kind === "quiz";
  const { data: questions } = isQuiz
    ? await db.from("questions").select("id, position, kind, prompt, options, question_keys(correct, feedback_correct, feedback_incorrect, explanation)").eq("lesson_id", lessonId).order("position")
    : { data: [] };
  const editableQuestions: EditableQuestion[] = (questions ?? []).map((q) => {
    const k = (Array.isArray(q.question_keys) ? q.question_keys[0] : q.question_keys) as Key | null;
    return { id: q.id, kind: q.kind as EditableQuestion["kind"], prompt: q.prompt, options: q.options as { id: string; text: string }[],
      correct: k?.correct ?? [], feedback_correct: k?.feedback_correct ?? "", feedback_incorrect: k?.feedback_incorrect ?? "", explanation: k?.explanation ?? "" };
  });

  return (
    <>
      <PageHeader breadcrumbs={[{ href: "/academy/author", label: "Authoring" }, { href: `/academy/author/courses/${version.courses.id}`, label: version.courses.title },
        { href: `/academy/author/versions/${version.id}`, label: `Version ${version.version_no}` }]}
        title={lesson.title} meta={<><Badge tone="teal">{lessonKindLabel(lesson.kind)}</Badge><span className="text-sm text-muted">{mod.title}</span>{!editable && <Badge>{label(version.status)}: read only</Badge>}</>}
        actions={<Link href={`/academy/author/preview/${version.id}/${lessonId}`} className={buttonClass("secondary")}>Preview as learner</Link>} />

      {!editable && <div className="mb-6"><Alert tone="info">This version is {label(version.status).toLowerCase()}, so its lessons cannot be edited.</Alert></div>}

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          {editable ? (
            <ContentEditor lessonId={lessonId} kind={lesson.kind} initial={content} media={media} save={saveLessonContent} upload={uploadMedia} />
          ) : (
            <Panel title="Content">{content.blocks.length ? <LessonBlocks blocks={content.blocks} media={media} /> : <p className="text-sm text-muted">No content blocks.</p>}</Panel>
          )}

          {isQuiz && (
            <Panel title="Questions" description="Answer keys and feedback are stored separately and are never sent to learners. Scoring happens on the server."
              actions={editable ? <QuestionEditor action={saveQuestion} lessonId={lessonId} trigger="Add question" /> : undefined} padded={!editableQuestions.length}>
              {editableQuestions.length === 0 ? <EmptyState title="No questions yet">Add two or three short questions with kind, helpful feedback.</EmptyState> : (
                <ol className="divide-y divide-line">
                  {editableQuestions.map((q, i) => (
                    <li key={q.id} className="px-5 py-3">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <p className="font-medium text-ink">{i + 1}. {q.prompt}</p>
                        {editable && (
                          <div className="flex flex-wrap gap-1">
                            <ActionButton action={moveQuestion} fields={{ lesson_id: lessonId, question_id: q.id!, dir: "up" }} variant="subtle">Up<span className="sr-only"> question {i + 1}</span></ActionButton>
                            <ActionButton action={moveQuestion} fields={{ lesson_id: lessonId, question_id: q.id!, dir: "down" }} variant="subtle">Down<span className="sr-only"> question {i + 1}</span></ActionButton>
                            <QuestionEditor action={saveQuestion} lessonId={lessonId} question={q} trigger="Edit" />
                            <ActionButton action={deleteQuestion} fields={{ lesson_id: lessonId, question_id: q.id! }} variant="subtle" confirm="Delete this question?">Delete<span className="sr-only"> question {i + 1}</span></ActionButton>
                          </div>
                        )}
                      </div>
                      <ul className="mt-1 space-y-0.5 text-sm">
                        {q.options.map((o) => <li key={o.id} className={q.correct.includes(o.id) ? "font-medium text-success-700" : "text-slate-ink"}>{q.correct.includes(o.id) ? "Correct: " : ""}{o.text}</li>)}
                      </ul>
                      {!q.correct.length && <p className="text-[13px] text-warning-800">No answer key yet.</p>}
                    </li>
                  ))}
                </ol>
              )}
            </Panel>
          )}
        </div>
        <Panel title="Lesson settings">
          {editable ? <LessonSettingsForm action={updateLesson} lesson={lesson} /> : (
            <p className="text-sm text-slate-ink">{lessonKindLabel(lesson.kind)} · {lesson.required ? "required" : "optional"}{isQuiz ? ` · pass mark ${lesson.pass_mark ?? version.pass_mark}%` : ""}</p>
          )}
          {isQuiz && <p className="mt-3 text-[13px] text-muted">Course pass mark: {version.pass_mark}%.</p>}
        </Panel>
      </div>
    </>
  );
}
