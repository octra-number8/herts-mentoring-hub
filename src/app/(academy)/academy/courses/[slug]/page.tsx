import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LevelBadge, PlaceholderNotice, PrincipleTag, ProgressBar } from "@/components/academy/ui";
import { Badge } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { ActionButton } from "@/components/ui/dialog-form";
import { Alert, Panel } from "@/components/ui/layout";
import { formatDate, label } from "@/lib/utils";
import { audienceLabel, lessonKindLabel, minutesLabel } from "@/server/academy/content";
import { flatLessons, loadOutline, outlineMinutes, resumeLesson } from "@/server/academy/queries";
import { requirePermission } from "@/server/session";
import { supabaseServer } from "@/server/supabase";
import { enrol, withdraw } from "../../actions";

export const metadata: Metadata = { title: "Course" };

export default async function CoursePage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ completed?: string }> }) {
  const session = await requirePermission("academy.learn");
  const { slug } = await params;
  const { completed: justCompleted } = await searchParams;
  const db = await supabaseServer();

  const { data: course } = await db.from("courses")
    .select("id, slug, title, summary, level, principle, audiences, estimated_minutes, is_placeholder_content, published_version_id, archived_at")
    .eq("slug", slug).maybeSingle();
  if (!course) notFound();

  const { data: enrolments } = await db.from("enrolments").select("id, status, course_version_id, enrolled_at, completed_at, due_on, source")
    .eq("course_id", course.id).eq("person_id", session.personId).order("enrolled_at", { ascending: false });
  const active = (enrolments ?? []).find((e) => e.status !== "withdrawn");
  const latest = active ?? enrolments?.[0];
  const versionId = active?.course_version_id ?? course.published_version_id ?? latest?.course_version_id;
  if (!versionId) notFound();

  const [{ data: version }, outline, { data: progress }, { data: certificate }, { data: pathways }, { data: resources }] = await Promise.all([
    db.from("course_versions").select("id, version_no, title, summary, pass_mark, completion_rule, certificate_enabled, status").eq("id", versionId).maybeSingle(),
    loadOutline(db, versionId),
    active ? db.from("lesson_progress").select("lesson_id").eq("enrolment_id", active.id) : Promise.resolve({ data: [] as { lesson_id: string }[] }),
    active ? db.from("certificates").select("id, reference, issued_at").eq("enrolment_id", active.id).is("revoked_at", null).maybeSingle() : Promise.resolve({ data: null }),
    db.from("pathway_courses").select("requirement, pathways(slug, title, published)").eq("course_id", course.id),
    db.from("solomon_resources").select("id, title, url, description").eq("course_id", course.id).order("position"),
  ]);
  if (!version) notFound();

  const completedSet = new Set((progress ?? []).map((p) => p.lesson_id));
  const lessons = flatLessons(outline);
  const done = lessons.filter((l) => completedSet.has(l.id)).length;
  const pct = lessons.length ? (100 * done) / lessons.length : 0;
  const minutes = outlineMinutes(outline) || course.estimated_minutes;
  const resume = active ? resumeLesson(outline, completedSet) : null;
  const isCompleted = active?.status === "completed";
  const newerAvailable = active && course.published_version_id && active.course_version_id !== course.published_version_id;
  const canEnrol = !active && !!course.published_version_id && !course.archived_at;
  const inPathways = (pathways ?? []).map((p) => ({ ...(p.pathways as unknown as { slug: string; title: string; published: boolean }), requirement: p.requirement })).filter((p) => p.published);

  return (
    <div className="space-y-8">
      <nav aria-label="Breadcrumb" className="text-sm text-muted"><Link href="/academy/courses" className="hover:text-navy-800 hover:underline">Courses</Link></nav>

      {justCompleted && isCompleted && (
        <Alert tone="success" title="Course complete. Well done.">
          {certificate ? <>Your certificate is ready. <a className="font-medium underline" href={`/api/certificates/${certificate.id}`}>Download it</a> or find it in <Link className="underline" href="/academy/certificates">My Certificates</Link>.</> : "Thank you for completing this course."}
        </Alert>
      )}

      <section className="rounded-2xl bg-navy-800 px-5 py-7 text-white sm:px-8">
        <div className="flex flex-wrap items-center gap-2">
          {course.principle && <span className="text-[13px] font-semibold uppercase tracking-wide text-teal-100">{label(course.principle)}</span>}
          <LevelBadge level={course.level} />
          {isCompleted && <Badge tone="success">Completed</Badge>}
        </div>
        <h1 className="mt-2 max-w-3xl text-2xl font-semibold tracking-tight text-balance sm:text-3xl">{version.title}</h1>
        {version.summary && <p className="mt-2 max-w-2xl text-navy-100">{version.summary}</p>}
        <p className="mt-3 text-sm text-navy-100">
          {[minutesLabel(minutes), `${lessons.length} ${lessons.length === 1 ? "lesson" : "lessons"}`, course.audiences.length ? `For ${course.audiences.map(audienceLabel).join(", ")}` : null].filter(Boolean).join(" · ")}
        </p>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          {canEnrol && (
            <ActionButton action={enrol} fields={{ course_id: course.id }} variant="teal" size="md">Start this course</ActionButton>
          )}
          {active && !isCompleted && resume && (
            <Link href={`/academy/learn/${active.id}/${resume.id}`} className={buttonClass("teal")}>{done ? "Continue learning" : "Start the first lesson"}</Link>
          )}
          {isCompleted && resume && <Link href={`/academy/learn/${active!.id}/${lessons[0]!.id}`} className={buttonClass("secondary")}>Look back through the course</Link>}
          {certificate && <a href={`/api/certificates/${certificate.id}`} className={buttonClass("secondary")}>Download certificate</a>}
          {!course.published_version_id && !active && <p className="text-sm text-navy-100">This course is not open for new enrolments.</p>}
        </div>
        {active && !isCompleted && <ProgressBar value={pct} label="Your progress" className="mt-5 max-w-md [&_span]:text-navy-100" />}
      </section>

      {course.is_placeholder_content && <PlaceholderNotice />}
      {newerAvailable && (
        <Alert tone="info">You are working through version {version.version_no} of this course. A newer version has since been published; your progress{isCompleted ? " and completion remain" : " remains"} valid.</Alert>
      )}

      <div className="grid gap-8 lg:grid-cols-3">
        <section aria-labelledby="outline" className="lg:col-span-2">
          <h2 id="outline" className="mb-3 text-lg font-semibold text-navy-900">What you will cover</h2>
          {outline.length === 0 ? <p className="text-sm text-muted">The lessons for this course are being prepared.</p> : (
            <ol className="space-y-4">
              {outline.map((m, mi) => (
                <li key={m.id} className="rounded-xl border border-line bg-white">
                  <div className="border-b border-line px-5 py-3">
                    <p className="text-[13px] font-semibold uppercase tracking-wide text-muted">Module {mi + 1}</p>
                    <h3 className="font-semibold text-navy-900">{m.title}</h3>
                    {m.summary && <p className="text-sm text-muted">{m.summary}</p>}
                  </div>
                  <ol className="divide-y divide-line">
                    {m.lessons.map((l) => {
                      const isDone = completedSet.has(l.id);
                      const body = (
                        <>
                          <span aria-hidden className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[11px] ${isDone ? "border-teal-700 bg-teal-700 text-white" : "border-line"}`}>{isDone ? "✓" : ""}</span>
                          <span className="min-w-0 flex-1">
                            <span className="font-medium text-ink">{l.title}</span>
                            <span className="block text-[13px] text-muted">{lessonKindLabel(l.kind)}{l.estimated_minutes ? ` · ${minutesLabel(l.estimated_minutes)}` : ""}{!l.required ? " · Optional" : ""}</span>
                          </span>
                          <span className="sr-only">{isDone ? "Completed" : "Not yet completed"}</span>
                        </>
                      );
                      return (
                        <li key={l.id}>
                          {active ? (
                            <Link href={`/academy/learn/${active.id}/${l.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-navy-50">{body}</Link>
                          ) : <div className="flex items-center gap-3 px-5 py-3">{body}</div>}
                        </li>
                      );
                    })}
                  </ol>
                </li>
              ))}
            </ol>
          )}
        </section>

        <div className="space-y-6">
          <Panel title="About this course">
            <dl className="space-y-3 text-sm">
              {course.principle && <div><dt className="text-muted">Principle</dt><dd><PrincipleTag principle={course.principle} /></dd></div>}
              <div><dt className="text-muted">To complete</dt><dd>{version.completion_rule === "all_lessons_and_assessments" ? `Finish every required lesson and pass each knowledge check (pass mark ${version.pass_mark}%)` : "Finish every required lesson"}</dd></div>
              <div><dt className="text-muted">Certificate</dt><dd>{version.certificate_enabled ? "Yes, on completion" : "No certificate for this course"}</dd></div>
              {active && <div><dt className="text-muted">Your status</dt><dd>{isCompleted ? `Completed ${formatDate(active.completed_at)}` : done ? `In progress: ${done} of ${lessons.length} lessons` : "Enrolled"}{active.due_on && !isCompleted ? ` · suggested by ${formatDate(active.due_on)}` : ""}</dd></div>}
            </dl>
            {active && !isCompleted && (
              <div className="mt-4 border-t border-line pt-3">
                <ActionButton action={withdraw} fields={{ enrolment_id: active.id, slug: course.slug }} variant="subtle" confirm="Leave this course? Your progress so far is kept if you enrol again on the same version.">Leave this course</ActionButton>
              </div>
            )}
          </Panel>
          {inPathways.length > 0 && (
            <Panel title="Part of">
              <ul className="space-y-1.5 text-sm">
                {inPathways.map((p) => <li key={p.slug}><Link className="font-medium text-navy-800 hover:underline" href={`/academy/courses?pathway=${p.slug}`}>{p.title}</Link> <span className="text-muted">({p.requirement === "essential" ? "essential" : "optional"})</span></li>)}
              </ul>
            </Panel>
          )}
          {resources && resources.length > 0 && (
            <Panel title="Further reading on Solomon">
              <ul className="space-y-2 text-sm">
                {resources.map((r) => <li key={r.id}><a href={r.url} target="_blank" rel="noopener noreferrer" className="font-medium text-navy-800 underline">{r.title}<span className="sr-only"> (opens Solomon in a new tab)</span></a>{r.description && <span className="block text-muted">{r.description}</span>}</li>)}
              </ul>
            </Panel>
          )}
        </div>
      </div>
    </div>
  );
}
