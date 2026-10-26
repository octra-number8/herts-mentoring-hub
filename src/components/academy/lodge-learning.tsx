import { Badge } from "@/components/ui/badge";
import { EmptyState, Panel, Stat } from "@/components/ui/layout";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import type { DB } from "@/server/supabase";

type Course = { course_id: string; title: string; status: string; completed_at: string | null; lessons_completed: number; lessons_required: number };
type Member = { person_id: string; display_name: string; account_status: string | null; last_sign_in_at: string | null; courses: Course[] };

const ACCOUNT: Record<string, { text: string; tone: "success" | "navy" | "warning" | "neutral" }> = {
  active: { text: "Signed up", tone: "success" }, invited: { text: "Link sent", tone: "navy" },
  suspended: { text: "Suspended", tone: "warning" }, deactivated: { text: "Closed", tone: "neutral" },
};

/**
 * Academy progress for a Lodge's current members: who has set up an account and
 * which courses each has started and completed. Never answers or reflections.
 */
export async function LodgeLearning({ db, lodgeId, joinUrl }: { db: DB; lodgeId: string; joinUrl: string }) {
  const { data, error } = await db.rpc("lodge_learning", { p_lodge: lodgeId });
  if (error) return <EmptyState title="Learning progress is not available for this Lodge" />;
  const members = (data ?? []) as Member[];
  const signedUp = members.filter((m) => m.account_status === "active").length;
  const byCourse = new Map<string, { title: string; completed: number; inProgress: number }>();
  for (const m of members) for (const c of m.courses) {
    const row = byCourse.get(c.course_id) ?? { title: c.title, completed: 0, inProgress: 0 };
    if (c.status === "completed") row.completed++; else row.inProgress++;
    byCourse.set(c.course_id, row);
  }
  const courses = [...byCourse.values()].sort((a, b) => b.completed - a.completed || a.title.localeCompare(b.title));

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Members" value={members.length} />
        <Stat label="Signed up to the Academy" value={signedUp} hint={members.length ? `${Math.round((signedUp / members.length) * 100)}% of members` : undefined} />
        <Stat label="Courses completed" value={courses.reduce((n, c) => n + c.completed, 0)} />
      </div>

      <Panel title="Courses" description="How many members have completed, or are part way through, each course." padded={!courses.length}>
        {courses.length ? (
          <Table className="rounded-none border-0" caption="Courses taken by members of this Lodge">
            <THead><TH>Course</TH><TH align="right">Completed</TH><TH align="right">In progress</TH></THead>
            <TBody>
              {courses.map((c) => <TR key={c.title}><TD className="font-medium">{c.title}</TD><TD align="right" className="tabular-nums">{c.completed}</TD><TD align="right" className="tabular-nums">{c.inProgress}</TD></TR>)}
            </TBody>
          </Table>
        ) : <EmptyState title="No courses started yet" />}
      </Panel>

      <Panel title="Members" padded={!members.length}
        description={`Members who have not signed up can set up an account at ${joinUrl} with the email address the Lodge holds for them. Answers and reflections are private and never shown here.`}>
        {members.length ? (
          <Table className="rounded-none border-0" caption="Members' Academy progress">
            <THead><TH>Name</TH><TH>Academy</TH><TH>Completed</TH><TH className="hidden md:table-cell">In progress</TH></THead>
            <TBody>
              {members.map((m) => {
                const done = m.courses.filter((c) => c.status === "completed"), started = m.courses.filter((c) => c.status !== "completed");
                const acct = m.account_status ? ACCOUNT[m.account_status] : null;
                return (
                  <TR key={m.person_id}>
                    <TD className="font-medium">{m.display_name}</TD>
                    <TD>{acct ? <Badge tone={acct.tone}>{acct.text}</Badge> : <span className="text-[13px] text-muted">Not signed up</span>}</TD>
                    <TD className="text-[13px]">{done.length ? done.map((c) => c.title).join(", ") : <span className="text-muted">None yet</span>}</TD>
                    <TD className="hidden text-[13px] md:table-cell">
                      {started.length ? started.map((c) => `${c.title} (${Math.min(c.lessons_completed, c.lessons_required)} of ${c.lessons_required} lessons)`).join(", ") : <span className="text-muted">None</span>}
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        ) : <EmptyState title="No current members recorded">Members appear here after an approved membership import.</EmptyState>}
      </Panel>
    </div>
  );
}
