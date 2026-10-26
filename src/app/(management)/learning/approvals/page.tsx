import type { Metadata } from "next";
import Link from "next/link";
import { DecisionForm } from "@/components/academy/admin-forms";
import { AcademyAdminTabs } from "@/components/academy/admin-tabs";
import { Badge, statusTone } from "@/components/ui/badge";
import { ActionButton } from "@/components/ui/dialog-form";
import { EmptyState, PageHeader, Panel } from "@/components/ui/layout";
import { formatDate, label } from "@/lib/utils";
import { can, requirePermission } from "@/server/session";
import { supabaseServer } from "@/server/supabase";
import { decideVersion, setPlaceholder } from "../actions";

export const metadata: Metadata = { title: "Academy approvals" };

type Row = {
  id: string; version_no: number; status: string; title: string; change_summary: string | null; submitted_at: string | null; approved_at: string | null; published_at: string | null;
  created_by: string | null; course: { id: string; title: string; slug: string; is_placeholder_content: boolean };
  creator: { persons: { display_name: string } } | null; approver: { persons: { display_name: string } } | null;
};

export default async function ApprovalsPage() {
  const session = await requirePermission("academy.review", "academy.publish");
  const db = await supabaseServer();
  const { data } = await db.from("course_versions")
    .select("id, version_no, status, title, change_summary, submitted_at, approved_at, published_at, created_by, course:courses!course_versions_course_id_fkey(id, title, slug, is_placeholder_content), creator:user_accounts!course_versions_created_by_fkey(persons(display_name)), approver:user_accounts!course_versions_approved_by_fkey(persons(display_name))")
    .in("status", ["review", "approved", "published"]).order("submitted_at", { ascending: true });
  const rows = (data ?? []) as unknown as Row[];
  const review = rows.filter((r) => r.status === "review");
  const approved = rows.filter((r) => r.status === "approved");
  const published = rows.filter((r) => r.status === "published").sort((a, b) => a.course.title.localeCompare(b.course.title));
  const canReview = can(session, "academy.review"), canPublish = can(session, "academy.publish");
  const { data: org } = await db.from("organisations").select("settings").single();
  const selfApproval = (org?.settings as { academy?: { allow_self_approval?: boolean } } | null)?.academy?.allow_self_approval === true;
  const canApprove = (r: Row) => canReview && (r.created_by !== session.accountId || selfApproval);
  const firstLesson = new Map<string, string>();
  const { data: lessons } = rows.length ? await db.from("course_modules").select("version_id, position, lessons(id, position)").in("version_id", rows.map((r) => r.id)).order("position") : { data: [] };
  for (const m of lessons ?? []) {
    const l = ((m.lessons ?? []) as { id: string; position: number }[]).sort((a, b) => a.position - b.position)[0];
    if (l && !firstLesson.has(m.version_id)) firstLesson.set(m.version_id, l.id);
  }

  const Item = ({ r, children }: { r: Row; children?: React.ReactNode }) => (
    <li className="flex flex-col gap-3 px-5 py-4 md:flex-row md:items-start md:justify-between">
      <div className="min-w-0">
        <p className="font-medium text-ink">{r.title} <span className="text-muted">· version {r.version_no}</span></p>
        <p className="text-[13px] text-muted">
          By {r.creator?.persons.display_name ?? "unknown"}{r.submitted_at ? ` · submitted ${formatDate(r.submitted_at)}` : ""}
          {r.approver && r.status !== "review" ? ` · approved by ${r.approver.persons.display_name}` : ""}{r.published_at ? ` · published ${formatDate(r.published_at)}` : ""}
        </p>
        {r.change_summary && <p className="mt-1 text-sm text-slate-ink">{r.change_summary}</p>}
        <p className="mt-1 flex flex-wrap gap-3 text-sm">
          {firstLesson.get(r.id) && <Link className="font-medium text-navy-800 underline" href={`/academy/author/preview/${r.id}/${firstLesson.get(r.id)}`}>Preview as learner</Link>}
          {can(session, "academy.author") && <Link className="text-navy-800 underline" href={`/academy/author/versions/${r.id}`}>Open in authoring</Link>}
        </p>
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </li>
  );

  return (
    <>
      <PageHeader title="Academy" description={selfApproval ? "Course versions are approved, then published. Reviewers may approve versions they wrote." : "Course versions are approved by someone other than their author, then published."} />
      <AcademyAdminTabs session={session} current="approvals" counts={{ approvals: review.length + approved.length }} />
      <div className="space-y-6">
        <Panel id="awaiting" title={`Awaiting review (${review.length})`} padded={!review.length}>
          {review.length === 0 ? <EmptyState title="Nothing awaiting review" /> : (
            <ul className="divide-y divide-line">
              {review.map((r) => (
                <Item key={r.id} r={r}>
                  {canReview && !canApprove(r) && <span className="text-[13px] text-muted">You wrote this version, so another reviewer must approve it.</span>}
                  {canApprove(r) && <DecisionForm action={decideVersion} versionId={r.id} to="approved" trigger="Approve" title="Approve this version" variant="teal" />}
                  {canReview && <DecisionForm action={decideVersion} versionId={r.id} to="draft" trigger="Return to author" title="Return to the author" noteRequired description="The version goes back to draft with your note." />}
                </Item>
              ))}
            </ul>
          )}
        </Panel>

        <Panel id="approved" title={`Approved, ready to publish (${approved.length})`} padded={!approved.length}>
          {approved.length === 0 ? <EmptyState title="Nothing waiting to be published" /> : (
            <ul className="divide-y divide-line">
              {approved.map((r) => (
                <Item key={r.id} r={r}>
                  {canPublish && <ActionButton action={decideVersion} fields={{ version_id: r.id, to: "published" }} variant="primary"
                    confirm={`Publish version ${r.version_no} of "${r.course.title}"? Learners already enrolled keep the version they started.`}>Publish</ActionButton>}
                  {canPublish && <DecisionForm action={decideVersion} versionId={r.id} to="archived" trigger="Archive" title="Archive this version" variant="subtle" />}
                </Item>
              ))}
            </ul>
          )}
        </Panel>

        <Panel id="published" title="Published courses" description="Archiving withdraws a course from new enrolments. Existing learners and certificates are unaffected." padded={!published.length}>
          {published.length === 0 ? <EmptyState title="No published courses" /> : (
            <ul className="divide-y divide-line">
              {published.map((r) => (
                <Item key={r.id} r={r}>
                  <Badge tone={statusTone(r.status)}>{label(r.status)}</Badge>
                  {r.course.is_placeholder_content && <Badge>Sample content</Badge>}
                  {canPublish && <ActionButton action={setPlaceholder} fields={{ course_id: r.course.id, placeholder: r.course.is_placeholder_content ? "false" : "true" }} variant="subtle"
                    confirm={r.course.is_placeholder_content ? "Confirm this course now carries approved Hertfordshire content?" : undefined}>
                    {r.course.is_placeholder_content ? "Mark content as approved" : "Mark as sample content"}
                  </ActionButton>}
                  {canPublish && <DecisionForm action={decideVersion} versionId={r.id} to="archived" trigger="Archive" title="Archive this course version" variant="subtle"
                    description="The course is withdrawn from new enrolments. Learners' records and certificates are kept." />}
                </Item>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </>
  );
}
