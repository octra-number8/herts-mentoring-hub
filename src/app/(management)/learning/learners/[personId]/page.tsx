import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { EnrolForm, RecognitionForm, RevokeForm } from "@/components/academy/admin-forms";
import { ProgressBar } from "@/components/academy/ui";
import { Badge, statusTone } from "@/components/ui/badge";
import { ActionButton } from "@/components/ui/dialog-form";
import { EmptyState, PageHeader, Panel } from "@/components/ui/layout";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { formatDate, label } from "@/lib/utils";
import { PROVIDERS } from "@/server/academy/content";
import { LEARNING_STATUS, queryLearningRecords } from "@/server/reports/datasets-learning";
import { can, requirePermission } from "@/server/session";
import { supabaseServer } from "@/server/supabase";
import { adminEnrol, adminWithdraw, issueRecognition, revokeCertificate, verifyExternal } from "../../actions";

export const metadata: Metadata = { title: "Learning record" };

type Context = { display_name: string; lodge: { name: string; number: number } | null; roles: string[]; attendance: { event_id: string; title: string; starts_at: string; status: string }[] };
const PLAN_STATUS: Record<string, string> = { planned: "Planned", in_progress: "In progress", done: "Done", dropped: "No longer planned" };

/** One learner's record. Private reflections are deliberately never queried. */
export default async function LearnerRecordPage({ params }: { params: Promise<{ personId: string }> }) {
  const session = await requirePermission("learning.records.read");
  const { personId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(personId)) notFound();
  const db = await supabaseServer();
  const { data: ctxData, error } = await db.rpc("academy_learner_context", { p_person: personId });
  if (error || !ctxData) notFound();
  const ctx = ctxData as unknown as Context;

  const records = await queryLearningRecords(db, { learner: personId });
  const enrolmentIds = records.map((r) => r.enrolment_id);
  const none = ["00000000-0000-0000-0000-000000000000"];
  const [{ data: attempts }, { data: certs }, { data: external }, { data: plan }, { data: badges }, { data: courses }] = await Promise.all([
    db.from("assessment_attempts").select("enrolment_id, lesson_id, attempt_no, score, passed, submitted_at, lessons(title)").in("enrolment_id", enrolmentIds.length ? enrolmentIds : none).order("submitted_at"),
    db.from("certificates").select("id, kind, title, reference, completed_on, revoked_at, revoked_reason, recognition_reason").eq("person_id", personId).order("issued_at", { ascending: false }),
    db.from("external_learning").select("id, provider, title, url, completed_on, evidence_path, verified_at").eq("person_id", personId).order("completed_on", { ascending: false }),
    db.from("development_plans").select("aspirations, updated_at, development_plan_items(id, title, kind, target_on, status)").eq("person_id", personId).maybeSingle(),
    db.from("badge_awards").select("id, awarded_at, badges(name)").eq("person_id", personId),
    db.from("courses").select("id, title, published_version_id").order("title"),
  ]);
  const isAdmin = can(session, "academy.admin");
  const courseOpts = (courses ?? []).filter((c) => c.published_version_id).map((c) => ({ value: c.id, label: c.title }));
  const courseOfEnrolment = new Map(records.map((r) => [r.enrolment_id, r.course_title]));
  const person = { id: personId, label: ctx.display_name };

  return (
    <>
      <PageHeader breadcrumbs={[{ href: "/learning/learners", label: "Learning records" }]} title={ctx.display_name}
        description={[ctx.lodge ? `${ctx.lodge.name} No. ${ctx.lodge.number}` : null, ctx.roles.join(", ")].filter(Boolean).join(" · ")}
        meta={<>{(badges ?? []).map((b) => <Badge key={b.id} tone="teal">{(b.badges as unknown as { name: string }).name}</Badge>)}</>}
        actions={isAdmin ? <><EnrolForm action={adminEnrol} courses={courseOpts} person={person} /><RecognitionForm action={issueRecognition} courses={courseOpts} person={person} /></> : undefined} />

      <div className="space-y-6">
        <Panel title="Courses" padded={!records.length}>
          {records.length === 0 ? <EmptyState title="No enrolments" /> : (
            <Table className="rounded-none border-0" caption="Enrolments">
              <THead><TH>Course</TH><TH>Status</TH><TH className="hidden md:table-cell">Progress</TH><TH className="hidden md:table-cell">Dates</TH>{isAdmin && <TH />}</THead>
              <TBody>
                {records.map((r) => (
                  <TR key={r.enrolment_id}>
                    <TD className="font-medium">{r.course_title}<span className="text-[13px] font-normal text-muted"> · v{r.version_no}</span></TD>
                    <TD><Badge tone={r.status === "enrolled" ? "navy" : statusTone(r.status)}>{LEARNING_STATUS[r.status] ?? r.status}</Badge></TD>
                    <TD className="hidden w-48 md:table-cell"><ProgressBar size="sm" value={r.status === "completed" ? 100 : r.lessons_required ? (100 * r.lessons_completed) / r.lessons_required : 0} label="Progress" /><span className="text-[13px] text-muted">{r.lessons_completed} of {r.lessons_required} required lessons</span></TD>
                    <TD className="hidden text-[13px] md:table-cell">Enrolled {formatDate(r.enrolled_at)} ({label(r.source)}){r.completed_at && <div>Completed {formatDate(r.completed_at)}</div>}</TD>
                    {isAdmin && <TD>{["enrolled", "in_progress"].includes(r.status) && <ActionButton action={adminWithdraw} fields={{ enrolment_id: r.enrolment_id, person_id: personId }} variant="subtle" confirm="Withdraw this enrolment? Progress is kept if they enrol again.">Withdraw</ActionButton>}</TD>}
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </Panel>

        <div className="grid gap-6 xl:grid-cols-2">
          <Panel title="Knowledge check attempts" padded={!attempts?.length}>
            {!attempts?.length ? <EmptyState title="No attempts" /> : (
              <Table className="rounded-none border-0" caption="Attempts">
                <THead><TH>Check</TH><TH align="right">Attempt</TH><TH align="right">Score</TH><TH>Result</TH></THead>
                <TBody>
                  {attempts.map((a) => (
                    <TR key={`${a.enrolment_id}${a.lesson_id}${a.attempt_no}`}>
                      <TD>{(a.lessons as unknown as { title: string }).title}<div className="text-[13px] text-muted">{courseOfEnrolment.get(a.enrolment_id)} · {formatDate(a.submitted_at)}</div></TD>
                      <TD align="right">{a.attempt_no}</TD><TD align="right">{a.score}%</TD>
                      <TD>{a.passed ? <Badge tone="success">Passed</Badge> : <Badge tone="warning">Not passed</Badge>}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
          </Panel>

          <Panel title="Certificates" padded={!certs?.length}>
            {!certs?.length ? <EmptyState title="No certificates" /> : (
              <ul className="divide-y divide-line">
                {certs.map((c) => (
                  <li key={c.id} className="flex flex-wrap items-start justify-between gap-2 px-5 py-3">
                    <div>
                      <p className={c.revoked_at ? "font-medium text-muted line-through" : "font-medium"}>{c.title}</p>
                      <p className="text-[13px] text-muted">{label(c.kind)} · {formatDate(c.completed_on)} · {c.reference}</p>
                      {c.recognition_reason && <p className="text-[13px] text-slate-ink">{c.recognition_reason}</p>}
                      {c.revoked_at && <p className="text-[13px] text-warning-800">Revoked {formatDate(c.revoked_at)}: {c.revoked_reason}</p>}
                    </div>
                    {!c.revoked_at && (
                      <div className="flex items-center gap-2">
                        <a href={`/api/certificates/${c.id}`} className="text-sm font-medium text-navy-800 underline">Download</a>
                        {isAdmin && <RevokeForm action={revokeCertificate} certificateId={c.id} title={c.title} />}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Training attendance" padded={!ctx.attendance.length}>
            {!ctx.attendance.length ? <EmptyState title="No training registrations" /> : (
              <ul className="divide-y divide-line">
                {ctx.attendance.map((a) => (
                  <li key={a.event_id} className="flex items-center justify-between gap-2 px-5 py-2.5 text-sm">
                    <span>{a.title}<span className="block text-[13px] text-muted">{formatDate(a.starts_at)}</span></span>
                    <Badge tone={statusTone(a.status)}>{label(a.status)}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Learning elsewhere" description="Self-declared by the learner." padded={!external?.length}>
            {!external?.length ? <EmptyState title="Nothing declared" /> : (
              <ul className="divide-y divide-line">
                {external.map((x) => (
                  <li key={x.id} className="flex flex-wrap items-start justify-between gap-2 px-5 py-3">
                    <div>
                      <p className="font-medium">{x.url ? <a className="text-navy-800 underline" href={x.url} target="_blank" rel="noopener noreferrer">{x.title}</a> : x.title}</p>
                      <p className="text-[13px] text-muted">{PROVIDERS.find((p) => p.value === x.provider)?.label} · {formatDate(x.completed_on)}
                        {x.evidence_path && <> · <a className="underline" href={`/academy/progress/evidence/${x.id}`}>evidence</a></>}</p>
                    </div>
                    {x.verified_at ? <Badge tone="success">Verified {formatDate(x.verified_at)}</Badge>
                      : isAdmin ? <ActionButton action={verifyExternal} fields={{ id: x.id, person_id: personId }} variant="secondary">Verify</ActionButton>
                      : <Badge>Self-declared</Badge>}
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>

        <Panel title="Development plan" description="Read only. The plan belongs to the learner." padded>
          {!plan ? <p className="text-sm text-muted">No development plan yet.</p> : (
            <>
              {plan.aspirations ? <p className="whitespace-pre-line text-sm">{plan.aspirations}</p> : <p className="text-sm text-muted">No aspirations recorded.</p>}
              <ul className="mt-3 space-y-1 text-sm">
                {(plan.development_plan_items ?? []).map((i) => (
                  <li key={i.id} className="flex flex-wrap justify-between gap-2"><span>{i.title} <span className="text-muted">({label(i.kind)})</span></span><span className="text-muted">{PLAN_STATUS[i.status]}{i.target_on ? ` · ${formatDate(i.target_on)}` : ""}</span></li>
                ))}
              </ul>
              <p className="mt-3 text-[13px] text-muted">Updated {formatDate(plan.updated_at)}</p>
            </>
          )}
        </Panel>
      </div>
    </>
  );
}
