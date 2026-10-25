import type { Metadata } from "next";
import Link from "next/link";
import { CustomiseDashboard } from "@/components/dashboard/customise";
import { Chart } from "@/components/reports/chart";
import { Badge, mentoringStatusTone, statusTone } from "@/components/ui/badge";
import { EmptyState, PageHeader, Panel, Stat } from "@/components/ui/layout";
import { progressionPrompt, type ProgressionSettings } from "@/lib/progression";
import { formatDate, formatDateTime, isoInDays, label, relativeDays, todayIso } from "@/lib/utils";
import { pendingAcknowledgements } from "@/server/library/documents";
import { quarterLabel } from "@/server/reports/analysis";
import { fetchAll } from "@/server/reports/fetch";
import { can, requirePermission, type SessionContext } from "@/server/session";
import { supabaseServer, type DB } from "@/server/supabase";

export const metadata: Metadata = { title: "Dashboard" };

type View = "leadership" | "assistant" | "general";
type Ctx = { db: DB; session: SessionContext; today: string };
type PanelDef = { key: string; title: string; wide?: boolean; views: View[]; when?: (s: SessionContext) => boolean; render: (ctx: Ctx) => Promise<React.ReactNode> };

const L = ({ href, children }: { href: string; children: React.ReactNode }) => <Link href={href} className="font-medium text-navy-800 hover:underline">{children}</Link>;
const Empty = ({ children }: { children: React.ReactNode }) => <p className="text-sm text-muted">{children}</p>;
const CLOSED = "(closed,resolved,referred)";
const OPEN_TASK = ["open", "in_progress", "waiting"];

// Every query runs as the signed-in user; a panel only appears for roles that can use it.
const PANELS: PanelDef[] = [
  {
    key: "summary", title: "At a glance", wide: true, views: ["leadership"],
    render: async ({ db, today }) => {
      const [{ data: lodges }, { count: openCases }, { count: openTasks }, { count: overdue }, { count: visits }] = await Promise.all([
        db.from("v_lodge_overview").select("id, apgmen, lodge_mentor, lodge_mentor_confirmed").eq("status", "active"),
        db.from("cases").select("id", { count: "exact", head: true }).eq("kind", "request").not("status", "in", CLOSED),
        db.from("tasks").select("id", { count: "exact", head: true }).in("status", OPEN_TASK),
        db.from("tasks").select("id", { count: "exact", head: true }).in("status", OPEN_TASK).lt("due_on", today),
        db.from("visits").select("id", { count: "exact", head: true }).eq("status", "planned").gte("planned_for", today),
      ]);
      const l = lodges ?? [];
      const inPlace = l.filter((x) => x.lodge_mentor && x.lodge_mentor_confirmed !== false).length;
      const unconfirmed = l.filter((x) => x.lodge_mentor && x.lodge_mentor_confirmed === false).length;
      const vacant = l.filter((x) => !x.lodge_mentor).length;
      return (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Active Lodges" value={l.length} href="/lodges" />
          <Stat label="Allocated to an Assistant" value={l.filter((x) => x.apgmen).length} hint={`of ${l.length}`} href="/lodges" />
          <Stat label="Lodge Mentor in place" value={inPlace} hint={`${unconfirmed} unconfirmed`} href="/lodges?lm=unconfirmed" />
          <Stat label="No Lodge Mentor recorded" value={vacant} href="/lodges?lm=vacant" tone={vacant ? "attention" : undefined} />
          <Stat label="Open support requests" value={openCases ?? 0} href="/support" />
          <Stat label="Open actions" value={openTasks ?? 0} href="/tasks" />
          <Stat label="Overdue follow-ups" value={overdue ?? 0} href="/tasks" tone={overdue ? "attention" : undefined} />
          <Stat label="Planned visits" value={visits ?? 0} />
        </div>
      );
    },
  },
  {
    key: "alerts", title: "Needs attention", views: ["leadership"],
    render: async ({ db, session, today }) => {
      const [{ data: lodges }, { count: overdueTasks }, { data: docs }] = await Promise.all([
        db.from("v_lodge_overview").select("id, apgmen, lodge_mentor, next_review_on").eq("status", "active"),
        db.from("tasks").select("id", { count: "exact", head: true }).in("status", OPEN_TASK).lt("due_on", today),
        can(session, "docs.manage") ? db.from("documents").select("id").is("archived_at", null).lt("review_on", today) : Promise.resolve({ data: [] }),
      ]);
      const l = lodges ?? [];
      const items = [
        { n: l.filter((x) => !x.apgmen).length, text: "Lodges not allocated to an Assistant", href: "/lodges?allocation=unallocated" },
        { n: l.filter((x) => !x.lodge_mentor).length, text: "Lodges without a Lodge Mentor recorded", href: "/lodges?lm=vacant" },
        { n: l.filter((x) => x.next_review_on && x.next_review_on < today).length, text: "Lodge mentoring reviews past their date", href: "/reports/lodge_coverage" },
        { n: overdueTasks ?? 0, text: "Actions past their due date", href: "/tasks" },
        { n: docs?.length ?? 0, text: "Library documents past their review date", href: "/library?review=due" },
      ].filter((i) => i.n > 0);
      return items.length ? (
        <ul className="space-y-2 text-sm">
          {items.map((i) => (
            <li key={i.text} className="flex items-baseline gap-3 rounded-md bg-warning-50 px-3 py-2">
              <span className="min-w-6 font-semibold tabular-nums text-warning-800">{i.n}</span>
              <Link href={i.href} className="text-ink hover:underline">{i.text}</Link>
            </li>
          ))}
        </ul>
      ) : <Empty>Nothing needs attention just now.</Empty>;
    },
  },
  {
    key: "approvals", title: "Awaiting approval", views: ["leadership", "general"],
    when: (s) => can(s, "comms.approve") || can(s, "docs.approve") || can(s, "reports.quarterly.approve"),
    render: async ({ db, session }) => {
      const [{ data: comms }, { data: docs }, { data: qr }] = await Promise.all([
        can(session, "comms.approve") ? db.from("campaigns").select("id, title").eq("status", "pending_approval").order("submitted_at") : Promise.resolve({ data: [] }),
        can(session, "docs.approve") ? db.from("document_versions").select("id, version_label, documents!document_versions_document_id_fkey(id, reference, title)").eq("status", "review").order("submitted_at") : Promise.resolve({ data: [] }),
        can(session, "reports.quarterly.approve") ? db.from("quarterly_reports").select("id, year, quarter").eq("status", "review") : Promise.resolve({ data: [] }),
      ]);
      const total = (comms?.length ?? 0) + (docs?.length ?? 0) + (qr?.length ?? 0);
      if (!total) return <Empty>Nothing is waiting for your approval.</Empty>;
      return (
        <ul className="space-y-2 text-sm">
          {(comms ?? []).map((c) => <li key={c.id}><Badge tone="warning">Communication</Badge> <L href={`/communications/${c.id}`}>{c.title}</L></li>)}
          {(docs ?? []).map((v) => {
            const d = v.documents as unknown as { id: string; reference: string; title: string };
            return <li key={v.id}><Badge tone="warning">Document</Badge> <L href={`/library/${d.id}`}>{d.reference} {d.title}</L> <span className="text-muted">{v.version_label}</span></li>;
          })}
          {(qr ?? []).map((q) => <li key={q.id}><Badge tone="warning">Quarterly report</Badge> <L href={`/reports/quarterly/${q.id}`}>{q.year} Quarter {q.quarter}</L></li>)}
        </ul>
      );
    },
  },
  {
    key: "my_lodges", title: "My Lodges", wide: true, views: ["assistant"],
    render: async ({ db, session, today }) => {
      const ids = session.allocatedLodgeIds;
      const [{ data: lodges }, { data: lms }] = await Promise.all([
        db.from("v_lodge_overview").select("id, name, number, mentoring_status, mentoring_status_key, last_contact_on, next_review_on, open_requests").in("id", ids).order("number"),
        db.from("lodge_appointments").select("lodge_id, starts_on, ends_on, confirmed, persons(display_name, email, phone)").in("lodge_id", ids).eq("office", "lodge_mentor"),
      ]);
      const lmOf = (id: string) => (lms ?? []).find((a) => a.lodge_id === id && a.starts_on <= today && (!a.ends_on || a.ends_on >= today));
      if (!lodges?.length) return <Empty>No Lodges are currently allocated to you.</Empty>;
      return (
        <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {lodges.map((l) => {
            const lm = lmOf(l.id!);
            const p = lm?.persons as unknown as { display_name: string; email: string | null; phone: string | null } | null;
            const open = Number(l.open_requests ?? 0);
            return (
              <li key={l.id} className="rounded-md border border-line p-3 text-sm">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <L href={`/lodges/${l.id}`}>{l.name} No. {l.number}</L>
                  {l.mentoring_status && <Badge tone={mentoringStatusTone(l.mentoring_status_key)}>{l.mentoring_status}</Badge>}
                </div>
                <div className="mt-1.5 text-slate-ink">
                  {p ? <>Lodge Mentor: {p.display_name}{lm && !lm.confirmed && <> <Badge tone="warning">Unconfirmed</Badge></>}</> : <Badge tone="warning">No Lodge Mentor recorded</Badge>}
                </div>
                {p && (p.email || p.phone) && (
                  <div className="mt-0.5 flex flex-wrap gap-x-3 text-[13px]">
                    {p.email && <a href={`mailto:${p.email}`} className="break-all text-navy-800 underline">{p.email}</a>}
                    {p.phone && <a href={`tel:${p.phone.replace(/\s/g, "")}`} className="text-navy-800 underline">{p.phone}</a>}
                  </div>
                )}
                <div className="mt-1.5 text-[13px] text-muted">
                  Last contact {l.last_contact_on ? relativeDays(l.last_contact_on) : "not recorded"}
                  {l.next_review_on ? ` · review ${formatDate(l.next_review_on)}` : ""}{open ? ` · ${open} open request${open === 1 ? "" : "s"}` : ""}
                </div>
              </li>
            );
          })}
        </ul>
      );
    },
  },
  {
    key: "support", title: "Support requests", views: ["assistant"],
    render: async ({ db, session }) => {
      const { data } = await db.from("cases").select("id, reference, title, status, due_on, lodge_id").eq("kind", "request").in("lodge_id", session.allocatedLodgeIds)
        .not("status", "in", CLOSED).order("created_at", { ascending: false }).limit(8);
      return data?.length ? (
        <ul className="space-y-2 text-sm">
          {data.map((c) => <li key={c.id}><L href={`/support/${c.id}`}>{c.title}</L> <Badge tone={statusTone(c.status)}>{label(c.status)}</Badge><div className="text-[13px] text-muted">{c.reference}{c.due_on ? ` · due ${formatDate(c.due_on)}` : ""}</div></li>)}
        </ul>
      ) : <Empty>No open support requests for your Lodges.</Empty>;
    },
  },
  {
    key: "tasks", title: "My tasks", views: ["assistant", "general"], when: (s) => can(s, "tasks.use"),
    render: async ({ db, session, today }) => {
      const { data } = await db.from("tasks").select("id, title, due_on").eq("owner_account_id", session.accountId).in("status", OPEN_TASK).order("due_on", { ascending: true, nullsFirst: false }).limit(8);
      return data?.length ? (
        <ul className="space-y-1.5 text-sm">
          {data.map((t) => <li key={t.id}><L href={`/tasks/${t.id}`}>{t.title}</L>{t.due_on && <span className={t.due_on < today ? "font-medium text-warning-800" : "text-muted"}> · {t.due_on < today ? "overdue since" : "due"} {formatDate(t.due_on)}</span>}</li>)}
        </ul>
      ) : <Empty>No open tasks.</Empty>;
    },
  },
  {
    key: "visits", title: "Planned visits", views: ["leadership", "assistant"],
    render: async ({ db, session, today }) => {
      let q = db.from("visits").select("id, planned_for, purpose, lodge_id, lodges(name, number)").eq("status", "planned").gte("planned_for", today).order("planned_for").limit(8);
      if (!can(session, "activity.read.all")) q = q.in("lodge_id", session.allocatedLodgeIds);
      const { data } = await q;
      return data?.length ? (
        <ul className="space-y-2 text-sm">
          {data.map((v) => {
            const l = v.lodges as unknown as { name: string; number: number } | null;
            return <li key={v.id}><span className="font-medium">{formatDateTime(v.planned_for)}</span>: <L href={`/lodges/${v.lodge_id}?tab=activity`}>{l?.name} No. {l?.number}</L><div className="text-[13px] text-muted">{v.purpose}</div></li>;
          })}
        </ul>
      ) : <Empty>No visits planned.</Empty>;
    },
  },
  {
    key: "contacts", title: "Recent contacts", views: ["leadership", "assistant"],
    render: async ({ db, session }) => {
      let q = db.from("contacts").select("id, occurred_on, method, summary, lodge_id, lodges(name, number)").not("lodge_id", "is", null).order("occurred_on", { ascending: false }).limit(8);
      if (!can(session, "activity.read.all")) q = q.in("lodge_id", session.allocatedLodgeIds);
      const { data } = await q;
      return data?.length ? (
        <ul className="space-y-2 text-sm">
          {data.map((c) => {
            const l = c.lodges as unknown as { name: string; number: number } | null;
            return <li key={c.id}><L href={`/lodges/${c.lodge_id}?tab=activity`}>{l?.name} No. {l?.number}</L> <span className="text-muted">· {label(c.method)} · {formatDate(c.occurred_on)}</span><div className="line-clamp-1 text-[13px] text-slate-ink">{c.summary}</div></li>;
          })}
        </ul>
      ) : <Empty>No contacts recorded yet.</Empty>;
    },
  },
  {
    key: "initiates", title: "New Initiates (last 90 days)", views: ["leadership"], when: (s) => can(s, "members.read.basic"),
    render: async ({ db }) => {
      const { data } = await db.from("degree_events").select("id, event_date, person_id, persons(display_name), lodges(name, number)").eq("kind", "initiation").gte("event_date", isoInDays(-90)).order("event_date", { ascending: false }).limit(300);
      if (!data?.length) return <Empty>No Initiations recorded in the last 90 days.</Empty>;
      return (
        <>
          <p className="mb-2 text-sm text-slate-ink">{data.length} Brethren initiated in the last 90 days. A Personal Mentor and a welcome conversation make a good start.</p>
          <ul className="space-y-1.5 text-sm">
            {data.slice(0, 8).map((d) => {
              const l = d.lodges as unknown as { name: string; number: number } | null;
              return <li key={d.id}><L href={`/members/${d.person_id}`}>{(d.persons as unknown as { display_name: string } | null)?.display_name ?? "Member"}</L> <span className="text-muted">· {l ? `${l.name} No. ${l.number} · ` : ""}{formatDate(d.event_date)}</span></li>;
            })}
          </ul>
          {data.length > 8 && <p className="mt-2 text-sm"><Link href="/reports/membership_changes?change=initiation" className="underline">See all {data.length}</Link></p>}
        </>
      );
    },
  },
  {
    key: "progression", title: "Degree progression", wide: true, views: ["leadership"], when: (s) => can(s, "members.read.basic"),
    render: async ({ db, today }) => {
      const from = `${Number(today.slice(0, 4)) - 2}-01-01`;
      const rows = await fetchAll<{ kind: string; event_date: string }>((a, b) => db.from("degree_events").select("kind, event_date").in("kind", ["initiation", "passing", "raising"]).gte("event_date", from).order("id").range(a, b));
      const m = new Map<string, { quarter: string; initiation: number; passing: number; raising: number }>();
      for (const r of rows) {
        const q = quarterLabel(r.event_date);
        const cur = m.get(q) ?? { quarter: q, initiation: 0, passing: 0, raising: 0 };
        cur[r.kind as "initiation" | "passing" | "raising"]++;
        m.set(q, cur);
      }
      const data = [...m.values()].sort((a, b) => a.quarter.localeCompare(b.quarter));
      const last = data.length > 1 ? data.at(-2) : data.at(-1);
      return (
        <>
          <Chart spec={{
            title: "Initiations, Passings and Raisings by quarter", type: "bar", x: "quarter",
            summary: last ? `In ${last.quarter}: ${last.initiation} Initiations, ${last.passing} Passings and ${last.raising} Raisings. The current quarter is still in progress, and figures depend on the imports received.` : "No degree ceremonies recorded in this period.",
            data, series: [{ key: "initiation", label: "Initiations" }, { key: "passing", label: "Passings" }, { key: "raising", label: "Raisings" }],
          }} />
          <p className="mt-2 text-sm"><Link href="/reports/progression_periods" className="underline">Progression periods report</Link></p>
        </>
      );
    },
  },
  {
    key: "prompts", title: "Progression prompts", views: ["assistant"],
    render: async ({ db, session }) => {
      const [{ data: org }, { data: members }] = await Promise.all([
        db.from("organisations").select("settings").single(),
        db.from("v_member_overview").select("id, display_name, lodge_name, initiated_on, passed_on, raised_on, status, stage").in("lodge_id", session.allocatedLodgeIds).eq("status", "active"),
      ]);
      const settings = (org?.settings as { progression?: ProgressionSettings } | null)?.progression;
      // Prompts use mentoring detail, so only where the journey is visible to this user.
      const prompts = (members ?? []).filter((m) => m.stage).map((m) => ({ m, p: progressionPrompt(m, settings) })).filter((x) => x.p).slice(0, 8);
      return prompts.length ? (
        <>
          <p className="mb-2 text-[13px] text-muted">Suggestions for a conversation, never judgements.</p>
          <ul className="space-y-2 text-sm">
            {prompts.map(({ m, p }) => <li key={m.id}><L href={`/members/${m.id}`}>{m.display_name}</L> <span className="text-muted">· {m.lodge_name}</span><div className="text-[13px] text-slate-ink">{p}</div></li>)}
          </ul>
        </>
      ) : <Empty>No prompts at the moment.</Empty>;
    },
  },
  {
    key: "learning", title: "Learning activity (last 90 days)", views: ["leadership", "general"], when: (s) => can(s, "learning.records.read"),
    render: async ({ db }) => {
      const since = isoInDays(-90);
      const [{ count: enrolled }, { count: completed }, { count: certs }] = await Promise.all([
        db.from("enrolments").select("id", { count: "exact", head: true }).gte("enrolled_at", since),
        db.from("enrolments").select("id", { count: "exact", head: true }).gte("completed_at", since),
        db.from("certificates").select("id", { count: "exact", head: true }).gte("issued_at", since).is("revoked_at", null),
      ]);
      return (
        <>
          <div className="grid grid-cols-3 gap-3">
            <Stat label="Enrolments" value={enrolled ?? 0} />
            <Stat label="Completions" value={completed ?? 0} />
            <Stat label="Certificates" value={certs ?? 0} />
          </div>
          <p className="mt-2 text-sm"><Link href="/reports/learning_summary" className="underline">Learning summary</Link></p>
        </>
      );
    },
  },
  {
    key: "events", title: "Upcoming events", views: ["leadership", "general"],
    render: async ({ db }) => {
      const { data } = await db.from("events").select("id, title, starts_at, is_training").eq("status", "published").gte("starts_at", new Date().toISOString()).order("starts_at").limit(6);
      return data?.length ? (
        <ul className="space-y-1.5 text-sm">
          {data.map((e) => <li key={e.id}><L href={`/events/${e.id}`}>{e.title}</L> <span className="text-muted">· {formatDateTime(e.starts_at)}</span>{e.is_training && <> <Badge tone="teal">Training</Badge></>}</li>)}
        </ul>
      ) : <Empty>No upcoming events.</Empty>;
    },
  },
  {
    key: "training", title: "Training opportunities", views: ["assistant"],
    render: async ({ db }) => {
      const { data } = await db.from("events").select("id, title, starts_at, format").eq("status", "published").eq("is_training", true).gte("starts_at", new Date().toISOString()).order("starts_at").limit(5);
      return data?.length ? (
        <ul className="space-y-1.5 text-sm">
          {data.map((e) => <li key={e.id}><L href={`/events/${e.id}`}>{e.title}</L> <span className="text-muted">· {formatDateTime(e.starts_at)} · {label(e.format)}</span></li>)}
        </ul>
      ) : <Empty>No training sessions are scheduled.</Empty>;
    },
  },
  {
    key: "imports", title: "Recent membership imports", views: ["leadership"], when: (s) => can(s, "imports.run"),
    render: async ({ db }) => {
      const { data } = await db.from("import_batches").select("id, file_name, status, is_partial, committed_at, created_at, stats").order("created_at", { ascending: false }).limit(5);
      return data?.length ? (
        <ul className="space-y-2 text-sm">
          {data.map((b) => {
            const st = (b.stats ?? {}) as Record<string, number>;
            return (
              <li key={b.id}><L href={`/imports/${b.id}`}>{b.file_name}</L> <Badge tone={statusTone(b.status)}>{label(b.status)}</Badge>
                <div className="text-[13px] text-muted">{formatDate(b.committed_at ?? b.created_at)}{b.is_partial ? " · partial report" : ""}{st.new_initiates ? ` · ${st.new_initiates} new Initiates` : ""}</div>
              </li>
            );
          })}
        </ul>
      ) : <Empty>No imports yet.</Empty>;
    },
  },
  {
    key: "acknowledge", title: "Documents to read and acknowledge", views: ["leadership", "assistant", "general"], when: (s) => can(s, "docs.read.internal") || can(s, "docs.read.mentors"),
    render: async ({ db, session }) => {
      const { data: docs } = await db.from("documents").select("id, reference, title, requires_ack, renew_ack_on_revision, current_version_id").eq("requires_ack", true).not("current_version_id", "is", null).is("archived_at", null);
      const pending = await pendingAcknowledgements(db, session.personId, docs ?? []);
      const list = (docs ?? []).filter((d) => pending.has(d.id));
      return list.length ? (
        <ul className="space-y-1.5 text-sm">{list.map((d) => <li key={d.id}><L href={`/library/${d.id}`}>{d.reference} {d.title}</L></li>)}</ul>
      ) : <Empty>You are up to date.</Empty>;
    },
  },
];

const ORDER: Record<View, string[]> = {
  leadership: ["summary", "alerts", "approvals", "progression", "initiates", "visits", "contacts", "learning", "events", "imports", "acknowledge"],
  assistant: ["my_lodges", "tasks", "support", "visits", "contacts", "prompts", "training", "acknowledge"],
  general: ["approvals", "tasks", "events", "learning", "acknowledge"],
};

export default async function DashboardPage() {
  const session = await requirePermission("dashboard.view");
  const db = await supabaseServer();
  const view: View = can(session, "lodges.write.all") || can(session, "activity.read.all") ? "leadership"
    : session.allocatedLodgeIds.length > 0 ? "assistant" : "general";
  const available = PANELS.filter((p) => p.views.includes(view) && (!p.when || p.when(session)));
  const { data: layoutRow } = await db.from("saved_views").select("filters").eq("page", "dashboard").eq("account_id", session.accountId).limit(1).maybeSingle();
  const layout = (layoutRow?.filters ?? null) as { order?: string[]; hidden?: string[] } | null;
  const rank = (k: string) => {
    const i = layout?.order?.indexOf(k) ?? -1;
    return i >= 0 ? i : 100 + ORDER[view].indexOf(k);
  };
  const ordered = [...available].sort((a, b) => rank(a.key) - rank(b.key));
  const hidden = new Set(layout?.hidden ?? []);
  const shown = ordered.filter((p) => !hidden.has(p.key));
  const ctx: Ctx = { db, session, today: todayIso() };
  const rendered = await Promise.all(shown.map(async (p) => ({ p, node: await p.render(ctx) })));

  return (
    <>
      <PageHeader
        title={`Good day, ${session.firstName}`}
        description={view === "leadership" ? "Provincial overview. Figures follow what your role allows you to see." : view === "assistant" ? "Your Lodges, tasks and what is coming up." : "What is coming up and what needs your attention."}
        actions={<CustomiseDashboard customised={!!layout} panels={ordered.map((p) => ({ key: p.key, title: p.title, shown: !hidden.has(p.key) }))} />}
      />
      {rendered.length === 0 ? (
        <EmptyState title="All panels are hidden">Use Customise to choose what to show.</EmptyState>
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          {rendered.map(({ p, node }) => (
            <Panel key={p.key} id={`panel-${p.key}`} title={p.title} className={p.wide ? "lg:col-span-2" : undefined}>{node}</Panel>
          ))}
        </div>
      )}
    </>
  );
}
