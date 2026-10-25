import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ModuleForm, NewLessonForm, SubmitForReviewForm, VersionSettingsForm } from "@/components/academy/author-forms";
import { Badge, statusTone } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { ActionButton } from "@/components/ui/dialog-form";
import { Alert, DescriptionList, EmptyState, PageHeader, Panel } from "@/components/ui/layout";
import { formatDateTime, label } from "@/lib/utils";
import { lessonKindLabel, minutesLabel } from "@/server/academy/content";
import { flatLessons, loadOutline, outlineMinutes } from "@/server/academy/queries";
import { requirePermission } from "@/server/session";
import { supabaseServer } from "@/server/supabase";
import { addLesson, addModule, deleteLesson, deleteModule, moveLesson, moveModule, submitForReview, updateModule, updateVersionSettings, withdrawFromReview } from "../../actions";

export const metadata: Metadata = { title: "Version editor" };

export default async function VersionEditorPage({ params }: { params: Promise<{ versionId: string }> }) {
  await requirePermission("academy.author");
  const { versionId } = await params;
  const db = await supabaseServer();
  const { data: version } = await db.from("course_versions")
    .select("id, course_id, version_no, status, title, summary, pass_mark, completion_rule, certificate_enabled, change_summary, review_note, submitted_at, courses!course_versions_course_id_fkey(id, title, slug)")
    .eq("id", versionId).maybeSingle();
  if (!version) notFound();
  const course = version.courses as unknown as { id: string; title: string; slug: string };
  const outline = await loadOutline(db, versionId);
  const lessons = flatLessons(outline);
  const quizIds = lessons.filter((l) => l.kind === "quiz").map((l) => l.id);
  const { data: qs } = quizIds.length ? await db.from("questions").select("lesson_id").in("lesson_id", quizIds) : { data: [] as { lesson_id: string }[] };
  const qCount = new Map<string, number>();
  for (const q of qs ?? []) qCount.set(q.lesson_id, (qCount.get(q.lesson_id) ?? 0) + 1);
  const editable = version.status === "draft";
  const warnings = [
    ...(lessons.length === 0 ? ["Add at least one lesson before submitting for review."] : []),
    ...lessons.filter((l) => l.kind === "quiz" && !qCount.get(l.id)).map((l) => `"${l.title}" has no questions yet.`),
  ];

  return (
    <>
      <PageHeader breadcrumbs={[{ href: "/academy/author", label: "Authoring" }, { href: `/academy/author/courses/${course.id}`, label: course.title }]}
        title={`${version.title} · version ${version.version_no}`}
        meta={<><Badge tone={statusTone(version.status)}>{label(version.status)}</Badge><span className="text-sm text-muted">{lessons.length} lessons · {minutesLabel(outlineMinutes(outline)) || "no time estimates"}</span></>}
        actions={<>
          {lessons[0] && <Link href={`/academy/author/preview/${versionId}/${lessons[0].id}`} className={buttonClass("secondary")}>Preview as learner</Link>}
          {editable && <SubmitForReviewForm action={submitForReview} versionId={versionId} changeSummary={version.change_summary} />}
          {version.status === "review" && <ActionButton action={withdrawFromReview} fields={{ version_id: versionId }} size="md" confirm="Withdraw this version from review so you can edit it?">Withdraw from review</ActionButton>}
        </>} />

      <div className="mb-6 space-y-3">
        {editable && version.review_note && <Alert tone="warning" title="Returned by the reviewer">{version.review_note}</Alert>}
        {version.status === "review" && <Alert tone="info" title="In review">Submitted {formatDateTime(version.submitted_at)}. A reviewer other than the author will approve it or return it with a note.</Alert>}
        {!editable && version.status !== "review" && <Alert tone="info">This version is {label(version.status).toLowerCase()} and can no longer be edited. To make changes, start a new version from the course page.</Alert>}
        {editable && warnings.length > 0 && <Alert tone="warning" title="Before submitting"><ul className="list-disc pl-5">{warnings.map((w) => <li key={w}>{w}</li>)}</ul></Alert>}
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-2">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-navy-900">Modules and lessons</h2>
            {editable && <ModuleForm action={addModule} versionId={versionId} />}
          </div>
          {outline.length === 0 && <EmptyState title="No modules yet">{editable ? "Add a module, then add lessons to it." : "This version has no content."}</EmptyState>}
          {outline.map((m, mi) => (
            <Panel key={m.id} title={`${mi + 1}. ${m.title}`} description={m.summary || undefined} padded={false}
              actions={editable ? <>
                <ActionButton action={moveModule} fields={{ module_id: m.id, dir: "up" }} variant="subtle">Up<span className="sr-only"> module {m.title}</span></ActionButton>
                <ActionButton action={moveModule} fields={{ module_id: m.id, dir: "down" }} variant="subtle">Down<span className="sr-only"> module {m.title}</span></ActionButton>
                <ModuleForm action={updateModule} module={m} />
                <ActionButton action={deleteModule} fields={{ module_id: m.id }} variant="subtle" confirm={`Delete the module "${m.title}" and all its lessons?`}>Delete</ActionButton>
              </> : undefined}>
              {m.lessons.length === 0 ? <p className="px-5 py-4 text-sm text-muted">No lessons in this module yet.</p> : (
                <ol className="divide-y divide-line">
                  {m.lessons.map((l, li) => (
                    <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-2.5">
                      <div className="min-w-0">
                        <Link href={`/academy/author/lessons/${l.id}`} className="font-medium text-navy-800 hover:underline">{li + 1}. {l.title}</Link>
                        <div className="text-[13px] text-muted">
                          {lessonKindLabel(l.kind)}{l.estimated_minutes ? ` · ${minutesLabel(l.estimated_minutes)}` : ""}{!l.required ? " · optional" : ""}
                          {l.kind === "quiz" && ` · ${qCount.get(l.id) ?? 0} questions${l.pass_mark !== null ? ` · pass ${l.pass_mark}%` : ""}${l.max_attempts ? ` · ${l.max_attempts} attempts` : ""}`}
                        </div>
                      </div>
                      {editable && (
                        <div className="flex flex-wrap gap-1">
                          <ActionButton action={moveLesson} fields={{ lesson_id: l.id, dir: "up" }} variant="subtle">Up<span className="sr-only"> {l.title}</span></ActionButton>
                          <ActionButton action={moveLesson} fields={{ lesson_id: l.id, dir: "down" }} variant="subtle">Down<span className="sr-only"> {l.title}</span></ActionButton>
                          <ActionButton action={deleteLesson} fields={{ lesson_id: l.id }} variant="subtle" confirm={`Delete the lesson "${l.title}"?`}>Delete<span className="sr-only"> {l.title}</span></ActionButton>
                        </div>
                      )}
                    </li>
                  ))}
                </ol>
              )}
              {editable && <div className="border-t border-line px-5 py-3"><NewLessonForm action={addLesson} moduleId={m.id} /></div>}
            </Panel>
          ))}
        </div>
        <Panel title="Version settings">
          {editable ? <VersionSettingsForm action={updateVersionSettings} version={version} /> : (
            <DescriptionList columns={1} items={[
              { label: "Pass mark", value: `${version.pass_mark}%` },
              { label: "Completion rule", value: version.completion_rule === "all_lessons" ? "All required lessons" : "All required lessons and every knowledge check passed" },
              { label: "Certificate", value: version.certificate_enabled ? "Yes" : "No" },
              { label: "Change summary", value: version.change_summary },
            ]} />
          )}
        </Panel>
      </div>
    </>
  );
}
