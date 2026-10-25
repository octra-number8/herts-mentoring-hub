import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { EmptyState, PageHeader, Panel } from "@/components/ui/layout";
import { AnnouncementControls, AnnouncementForm } from "@/components/team/team-forms";
import { meetingKindLabel } from "@/components/team/kinds";
import { renderMarkdown } from "@/lib/markdown";
import { formatDate, formatDateTime } from "@/lib/utils";
import { can, requirePermission } from "@/server/session";
import { supabaseServer } from "@/server/supabase";
import { OPEN_TASK } from "@/server/tasks/query";

export const metadata: Metadata = { title: "Team" };

type Named = { persons: { display_name: string } | null } | null;
const nm = (a: unknown) => (a as Named)?.persons?.display_name ?? null;

export default async function TeamPage() {
  const session = await requirePermission("team.use");
  const db = await supabaseServer();
  const now = new Date().toISOString();
  const today = now.slice(0, 10);
  const canNotes = can(session, "notes.team") || can(session, "notes.leadership");

  const [{ data: announcements }, { data: meetings }, { data: tasks }, { data: notes }] = await Promise.all([
    db.from("announcements").select("id, title, body, audience, pinned, published_at, author:user_accounts!announcements_created_by_fkey(persons(display_name))")
      .or(`expires_at.is.null,expires_at.gt.${now}`).order("pinned", { ascending: false }).order("published_at", { ascending: false }).limit(12),
    db.from("meetings").select("id, title, kind, starts_at, location, online_url").gte("starts_at", now).neq("status", "cancelled").order("starts_at").limit(5),
    can(session, "tasks.use")
      ? db.from("tasks").select("id, title, due_on, priority").eq("owner_account_id", session.accountId).in("status", OPEN_TASK).order("due_on", { ascending: true, nullsFirst: false }).limit(8)
      : Promise.resolve({ data: [] }),
    canNotes
      ? db.from("notes").select("id, body, visibility, created_at, user_accounts!notes_author_account_id_fkey(persons(display_name))").eq("subject_type", "general").is("archived_at", null).order("created_at", { ascending: false }).limit(5)
      : Promise.resolve({ data: [] }),
  ]);
  const pinned = (announcements ?? []).filter((a) => a.pinned);
  const recent = (announcements ?? []).filter((a) => !a.pinned);
  const canAnnounce = can(session, "team.announce");

  const Announcement = ({ a }: { a: NonNullable<typeof announcements>[number] }) => (
    <li className="py-4 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-semibold text-navy-900">{a.title}</h3>
          <div className="text-[13px] text-muted">
            {nm(a.author) ?? "Provincial team"} · {formatDate(a.published_at)}
            {a.audience === "leadership" && <> · <Badge tone="navy">Leadership only</Badge></>}
          </div>
        </div>
        {canAnnounce && <AnnouncementControls id={a.id} pinned={a.pinned} />}
      </div>
      <div className="prose-hub mt-2 text-sm" dangerouslySetInnerHTML={{ __html: renderMarkdown(a.body) }} />
    </li>
  );

  return (
    <>
      <PageHeader
        title="Team workspace"
        description="News, meetings and shared notes for the Provincial mentoring team."
        actions={
          <>
            <LinkButton href="/team/meetings">Meetings</LinkButton>
            {canNotes && <LinkButton href="/team/notes">Team notes</LinkButton>}
            {canAnnounce && <AnnouncementForm canLeadership={can(session, "notes.leadership")} />}
          </>
        }
      />
      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          {pinned.length > 0 && (
            <Panel title="Pinned">
              <ul className="divide-y divide-line">{pinned.map((a) => <Announcement key={a.id} a={a} />)}</ul>
            </Panel>
          )}
          <Panel title="Announcements">
            {recent.length ? <ul className="divide-y divide-line">{recent.map((a) => <Announcement key={a.id} a={a} />)}</ul>
              : <EmptyState title="No recent announcements">{canAnnounce ? "Post one to share news with the team." : undefined}</EmptyState>}
          </Panel>
          {canNotes && (
            <Panel title="Recent team notes" actions={<Link href="/team/notes" className="text-sm font-medium text-navy-800 underline">All notes</Link>}>
              {notes?.length ? (
                <ul className="divide-y divide-line">
                  {notes.map((n) => (
                    <li key={n.id} className="py-3 first:pt-0 text-sm">
                      <div className="mb-1 text-[13px] text-muted">{nm(n.user_accounts) ?? "Team member"} · {formatDateTime(n.created_at)}{n.visibility === "leadership" && <> · <Badge tone="navy">Leadership only</Badge></>}</div>
                      <p className="line-clamp-3 whitespace-pre-line">{n.body}</p>
                    </li>
                  ))}
                </ul>
              ) : <EmptyState title="No team notes yet" />}
            </Panel>
          )}
        </div>
        <div className="space-y-6">
          <Panel title="Upcoming meetings" actions={<Link href="/team/meetings" className="text-sm font-medium text-navy-800 underline">All meetings</Link>}>
            <ul className="space-y-3 text-sm">
              {(meetings ?? []).map((m) => (
                <li key={m.id}>
                  <Link href={`/team/meetings/${m.id}`} className="font-medium text-navy-800 hover:underline">{m.title}</Link>
                  <div className="text-muted">{formatDateTime(m.starts_at)} · {meetingKindLabel(m.kind)}{m.location ? ` · ${m.location}` : m.online_url ? " · Online" : ""}</div>
                </li>
              ))}
              {!meetings?.length && <li className="text-muted">No meetings scheduled.</li>}
            </ul>
          </Panel>
          {can(session, "tasks.use") && (
            <Panel title="My open tasks" actions={<Link href="/tasks" className="text-sm font-medium text-navy-800 underline">All tasks</Link>}>
              <ul className="space-y-2 text-sm">
                {(tasks ?? []).map((t) => {
                  const overdue = !!t.due_on && t.due_on < today;
                  return (
                    <li key={t.id}>
                      <Link href={`/tasks/${t.id}`} className="font-medium text-navy-800 hover:underline">{t.title}</Link>
                      {t.due_on && <span className={overdue ? "font-medium text-warning-800" : "text-muted"}> · {overdue ? "overdue, " : ""}due {formatDate(t.due_on)}</span>}
                    </li>
                  );
                })}
                {!tasks?.length && <li className="text-muted">No open tasks.</li>}
              </ul>
            </Panel>
          )}
        </div>
      </div>
    </>
  );
}
