import type { Metadata } from "next";
import Link from "next/link";
import { ExternalLearningForm } from "@/components/academy/learner-forms";
import { ProgressBar } from "@/components/academy/ui";
import { Badge, statusTone } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { ActionButton } from "@/components/ui/dialog-form";
import { EmptyState, PageHeader, Panel } from "@/components/ui/layout";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { formatDate, label, todayIso } from "@/lib/utils";
import { PROVIDERS } from "@/server/academy/content";
import { loadMyEnrolments } from "@/server/academy/queries";
import { requirePermission } from "@/server/session";
import { supabaseServer } from "@/server/supabase";
import { addExternalLearning, deleteExternalLearning, updateExternalLearning } from "../actions";

export const metadata: Metadata = { title: "My Progress" };

const STATUS_LABEL: Record<string, string> = { enrolled: "Not started", in_progress: "In progress", completed: "Completed", withdrawn: "Left" };

export default async function ProgressPage() {
  const session = await requirePermission("academy.learn");
  const db = await supabaseServer();
  const enrolments = await loadMyEnrolments(db, session.personId, { includeWithdrawn: true });
  const [{ data: attempts }, { data: registrations }, { data: external }] = await Promise.all([
    // Filter to your own enrolments: administrators can read everyone's attempts.
    db.from("assessment_attempts").select("enrolment_id, lesson_id, attempt_no, score, passed, submitted_at, lessons(title, max_attempts)")
      .in("enrolment_id", enrolments.length ? enrolments.map((e) => e.id) : ["00000000-0000-0000-0000-000000000000"]).order("submitted_at", { ascending: false }),
    db.from("registrations").select("id, status, registered_at, events(id, title, starts_at, is_training)").eq("person_id", session.personId).in("status", ["attended", "confirmed", "no_show"]),
    db.from("external_learning").select("id, provider, title, url, completed_on, evidence_path, verified_at").eq("person_id", session.personId).order("completed_on", { ascending: false }),
  ]);

  const groups = (["in_progress", "enrolled", "completed", "withdrawn"] as const).map((s) => ({ status: s, items: enrolments.filter((e) => e.status === s) }));
  const courseOf = new Map(enrolments.map((e) => [e.id, e.course.title]));
  const lessonHref = (enrolmentId: string, lessonId: string) => `/academy/learn/${enrolmentId}/${lessonId}`;
  type Attempt = NonNullable<typeof attempts>[number];
  const byLesson = new Map<string, Attempt[]>();
  for (const a of attempts ?? []) {
    const k = `${a.enrolment_id}:${a.lesson_id}`;
    byLesson.set(k, [...(byLesson.get(k) ?? []), a]);
  }
  const training = (registrations ?? [])
    .map((r) => ({ ...r, event: r.events as unknown as { id: string; title: string; starts_at: string; is_training: boolean } }))
    .filter((r) => r.event?.is_training)
    .sort((a, b) => b.event.starts_at.localeCompare(a.event.starts_at));
  const providerLabel = (p: string) => PROVIDERS.find((x) => x.value === p)?.label ?? label(p);

  return (
    <>
      <PageHeader title="My Progress" description="Everything you have learned, in one place."
        actions={<><Link href="/academy/plan" className={buttonClass("secondary")}>My development plan</Link><Link href="/academy/profile" className={buttonClass("subtle")}>Learning preferences</Link></>} />
      <div className="space-y-8">
        <Panel title="Courses" padded={enrolments.length === 0}>
          {enrolments.length === 0 ? (
            <EmptyState title="No courses yet" action={<Link className="text-sm font-medium text-navy-800 underline" href="/academy/courses">Browse courses</Link>}>When you start a course, your progress appears here.</EmptyState>
          ) : (
            <div className="divide-y divide-line">
              {groups.filter((g) => g.items.length).map((g) => (
                <section key={g.status} aria-label={STATUS_LABEL[g.status]} className="px-5 py-4">
                  <h3 className="mb-2 text-sm font-semibold text-muted">{STATUS_LABEL[g.status]} ({g.items.length})</h3>
                  <ul className="space-y-3">
                    {g.items.map((e) => (
                      <li key={e.id} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_14rem] sm:items-center">
                        <div className="min-w-0">
                          <Link href={`/academy/courses/${e.course.slug}`} className="font-medium text-navy-800 hover:underline">{e.course.title}</Link>
                          <p className="text-[13px] text-muted">
                            {e.done} of {e.total} lessons · {e.status === "completed" ? `completed ${formatDate(e.completed_at)}` : `enrolled ${formatDate(e.enrolled_at)}`}
                            {e.version_no > 1 ? ` · version ${e.version_no}` : ""}{e.source === "assigned" ? " · assigned" : ""}
                          </p>
                        </div>
                        {e.status === "completed" ? <Badge tone="success" className="justify-self-start sm:justify-self-end">Completed</Badge> : <ProgressBar value={e.pct} size="sm" label={`${e.course.title} progress`} />}
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </Panel>

        <Panel title="Knowledge checks" padded={!byLesson.size}>
          {byLesson.size === 0 ? <EmptyState title="No knowledge checks taken yet">Your scores appear here after each attempt.</EmptyState> : (
            <Table className="rounded-none border-0" caption="Knowledge check results">
              <THead><TH>Check</TH><TH className="hidden md:table-cell">Course</TH><TH align="right">Attempts</TH><TH align="right">Best score</TH><TH>Outcome</TH></THead>
              <TBody>
                {[...byLesson.entries()].map(([k, list]) => {
                  const lesson = list[0]!.lessons as unknown as { title: string; max_attempts: number | null };
                  const best = Math.max(...list.map((a) => a.score));
                  const passed = list.some((a) => a.passed);
                  return (
                    <TR key={k}>
                      <TD><Link className="font-medium text-navy-800 hover:underline" href={lessonHref(list[0]!.enrolment_id, list[0]!.lesson_id)}>{lesson.title}</Link><div className="text-[13px] text-muted md:hidden">{courseOf.get(list[0]!.enrolment_id)}</div></TD>
                      <TD className="hidden md:table-cell">{courseOf.get(list[0]!.enrolment_id)}</TD>
                      <TD align="right">{list.length}{lesson.max_attempts ? ` of ${lesson.max_attempts}` : ""}</TD>
                      <TD align="right">{best}%</TD>
                      <TD>{passed ? <Badge tone="success">Passed</Badge> : <Badge tone="warning">Not yet passed</Badge>}</TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          )}
        </Panel>

        <Panel title="Training attended" description="Training events you registered for. Attendance is recorded by the organisers." padded={!training.length}>
          {training.length === 0 ? <EmptyState title="No training events yet"><Link className="underline" href="/academy/events">See upcoming training</Link></EmptyState> : (
            <Table className="rounded-none border-0" caption="Training attendance">
              <THead><TH>Event</TH><TH>Date</TH><TH>Attendance</TH></THead>
              <TBody>
                {training.map((r) => (
                  <TR key={r.id}>
                    <TD><Link className="font-medium text-navy-800 hover:underline" href={`/academy/events/${r.event.id}`}>{r.event.title}</Link></TD>
                    <TD>{formatDate(r.event.starts_at)}</TD>
                    <TD><Badge tone={statusTone(r.status)}>{r.status === "confirmed" ? (r.event.starts_at.slice(0, 10) >= todayIso() ? "Booked" : "Not yet recorded") : label(r.status)}</Badge></TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </Panel>

        <Panel title="Learning elsewhere" description="Solomon modules and other mentoring learning you have completed. You can change or remove an entry until the Academy team verifies it."
          actions={<ExternalLearningForm action={addExternalLearning} />} padded={!external?.length}>
          {!external?.length ? <EmptyState title="Nothing recorded yet">If you have completed Solomon modules or other mentoring learning, add them here so your record is complete.</EmptyState> : (
            <ul className="divide-y divide-line">
              {external.map((x) => (
                <li key={x.id} className="flex flex-wrap items-start justify-between gap-3 px-5 py-3">
                  <div className="min-w-0">
                    <p className="font-medium text-ink">{x.url ? <a className="text-navy-800 underline" href={x.url} target="_blank" rel="noopener noreferrer">{x.title}</a> : x.title}</p>
                    <p className="text-[13px] text-muted">
                      {providerLabel(x.provider)} · completed {formatDate(x.completed_on)}
                      {x.evidence_path && <> · <a className="underline" href={`/academy/progress/evidence/${x.id}`}>evidence</a></>}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {x.verified_at ? <Badge tone="success">Verified</Badge> : (
                      <>
                        <Badge>Self-declared</Badge>
                        <ExternalLearningForm action={updateExternalLearning} item={x} />
                        <ActionButton action={deleteExternalLearning} fields={{ id: x.id }} variant="subtle" confirm={`Remove "${x.title}" from your record?`}>Remove</ActionButton>
                      </>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </>
  );
}
