import type { Metadata } from "next";
import Link from "next/link";
import { MonthlyActivityChart, type MonthPoint } from "@/components/academy/admin-charts";
import { AcademyAdminTabs } from "@/components/academy/admin-tabs";
import { EmptyState, PageHeader, Panel, Stat } from "@/components/ui/layout";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { can, requirePermission } from "@/server/session";
import { supabaseServer } from "@/server/supabase";

export const metadata: Metadata = { title: "Academy" };

const MONTH = new Intl.DateTimeFormat("en-GB", { month: "short", timeZone: "Europe/London" });

export default async function AcademyAdminOverview() {
  const session = await requirePermission("academy.admin", "learning.records.read", "academy.review", "academy.publish");
  const db = await supabaseServer();
  const canRecords = can(session, "learning.records.read");
  const now = new Date();
  const quarterStart = new Date(Date.UTC(now.getUTCFullYear(), Math.floor(now.getUTCMonth() / 3) * 3, 1)).toISOString();
  const sixMonths = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 5, 1));
  const ninetyDays = new Date(now.getTime() - 90 * 86400000).toISOString();

  const [{ data: enrolments }, { count: certsQuarter }, { data: pending }, { data: courses }] = await Promise.all([
    canRecords
      ? db.from("enrolments").select("id, person_id, course_id, status, enrolled_at, completed_at, last_activity_at").limit(20000)
      : Promise.resolve({ data: [] as { id: string; person_id: string; course_id: string; status: string; enrolled_at: string; completed_at: string | null; last_activity_at: string | null }[] }),
    canRecords
      ? db.from("certificates").select("id", { count: "exact", head: true }).is("revoked_at", null).gte("issued_at", quarterStart)
      : Promise.resolve({ count: 0 }),
    db.from("course_versions").select("id, status").in("status", ["review", "approved"]),
    db.from("courses").select("id, title"),
  ]);
  const rows = enrolments ?? [];
  const completedQuarter = rows.filter((e) => e.completed_at && e.completed_at >= quarterStart).length;
  const active = new Set(rows.filter((e) => (e.last_activity_at ?? e.enrolled_at) >= ninetyDays && e.status !== "withdrawn").map((e) => e.person_id)).size;
  const inReview = (pending ?? []).filter((v) => v.status === "review").length;
  const toPublish = (pending ?? []).filter((v) => v.status === "approved").length;

  const months: MonthPoint[] = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(Date.UTC(sixMonths.getUTCFullYear(), sixMonths.getUTCMonth() + i, 1));
    const key = d.toISOString().slice(0, 7);
    return {
      month: MONTH.format(d),
      enrolments: rows.filter((e) => e.enrolled_at.slice(0, 7) === key).length,
      completions: rows.filter((e) => e.completed_at?.slice(0, 7) === key).length,
    };
  });
  const titles = new Map((courses ?? []).map((c) => [c.id, c.title]));
  const byCourse = [...rows.reduce((m, e) => {
    const r = m.get(e.course_id) ?? { enrolled: 0, completed: 0, inProgress: 0 };
    if (e.status !== "withdrawn") r.enrolled++;
    if (e.status === "completed") r.completed++;
    if (e.status === "in_progress") r.inProgress++;
    return m.set(e.course_id, r);
  }, new Map<string, { enrolled: number; completed: number; inProgress: number }>())].filter(([, r]) => r.enrolled > 0 || r.completed > 0).sort((a, b) => b[1].enrolled - a[1].enrolled);

  return (
    <>
      <PageHeader title="Academy" description="Learning across the Province: enrolments, completions, approvals and recognition." />
      <AcademyAdminTabs session={session} current="overview" />
      <div className="space-y-6">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {canRecords && <>
            <Stat label="Enrolments" value={rows.filter((e) => e.status !== "withdrawn").length} hint="All time, excluding withdrawn" href="/learning/learners" />
            <Stat label="Completions this quarter" value={completedQuarter} href="/learning/learners?status=completed" />
            <Stat label="Active learners" value={active} hint="Activity in the last 90 days" />
            <Stat label="Certificates this quarter" value={certsQuarter ?? 0} href="/learning/certificates" />
          </>}
          {(can(session, "academy.review") || can(session, "academy.publish")) && <>
            <Stat label="Awaiting review" value={inReview} href="/learning/approvals" tone={inReview ? "attention" : undefined} />
            <Stat label="Approved, ready to publish" value={toPublish} href="/learning/approvals" />
          </>}
        </div>

        {canRecords && (
          <div className="grid gap-6 xl:grid-cols-3">
            <Panel title="Enrolments and completions" description="Last six months" className="xl:col-span-2">
              {rows.length ? <>
                <MonthlyActivityChart data={months} />
                <details className="mt-3 text-sm">
                  <summary className="cursor-pointer font-medium text-navy-800">Show as a table</summary>
                  <Table className="mt-2" caption="Enrolments and completions by month">
                    <THead><TH>Month</TH><TH align="right">Enrolments</TH><TH align="right">Completions</TH></THead>
                    <TBody>{months.map((m) => <TR key={m.month}><TD>{m.month}</TD><TD align="right">{m.enrolments}</TD><TD align="right">{m.completions}</TD></TR>)}</TBody>
                  </Table>
                </details>
              </> : <EmptyState title="No learning activity yet" />}
            </Panel>
            <Panel title="By course" padded={!byCourse.length}>
              {byCourse.length ? (
                <Table className="rounded-none border-0" caption="Enrolments by course">
                  <THead><TH>Course</TH><TH align="right">Enrolled</TH><TH align="right">Done</TH></THead>
                  <TBody>
                    {byCourse.map(([id, r]) => (
                      <TR key={id}>
                        <TD><Link className="font-medium text-navy-800 hover:underline" href={`/learning/learners?course=${id}`}>{titles.get(id) ?? "Course"}</Link></TD>
                        <TD align="right">{r.enrolled}</TD><TD align="right">{r.completed}</TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              ) : <EmptyState title="No enrolments yet" />}
            </Panel>
          </div>
        )}
      </div>
    </>
  );
}
