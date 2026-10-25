import type { Metadata } from "next";
import Link from "next/link";
import { LinkButton } from "@/components/ui/button";
import { FilterBar, FilterSelect } from "@/components/ui/filters";
import { EmptyState, PageHeader } from "@/components/ui/layout";
import { EVENT_KINDS, eventStatusLabel, kindLabel } from "@/components/events/constants";
import { monthRange, monthTitle, parseMonth, shiftMonth, ukDate } from "@/components/events/datetime";
import { MonthCalendar, type CalendarItem } from "@/components/events/month-calendar";
import { formatTime, label, todayIso } from "@/lib/utils";
import { can, requirePermission } from "@/server/session";
import { supabaseServer } from "@/server/supabase";

export const metadata: Metadata = { title: "Calendar" };

const SOURCES = [
  { value: "events", label: "Events and training" },
  { value: "visits", label: "Lodge visits" },
  { value: "meetings", label: "Meetings" },
  { value: "tasks", label: "My task due dates" },
];

type Search = { view?: string; month?: string; source?: string; kind?: string };

export default async function CalendarPage({ searchParams }: { searchParams: Promise<Search> }) {
  const session = await requirePermission("events.read.internal", "events.manage", "tasks.use", "team.use");
  const sp = await searchParams;
  const db = await supabaseServer();
  const today = todayIso();
  const month = parseMonth(sp.month, today.slice(0, 7));
  const view = sp.view === "agenda" ? "agenda" : "month";
  const { from, to } = monthRange(month);
  const want = (s: string) => !sp.source || sp.source === s;

  const empty = Promise.resolve({ data: [] as never[] });
  let eq = db.from("events").select("id, title, kind, status, starts_at, visibility").gte("starts_at", from).lt("starts_at", to).order("starts_at");
  if (sp.kind) eq = eq.eq("kind", sp.kind);
  if (!can(session, "events.manage")) eq = eq.neq("status", "draft");
  const [{ data: events }, { data: visits }, { data: meetings }, { data: tasks }] = await Promise.all([
    want("events") ? eq : empty,
    want("visits") && !sp.kind ? db.from("visits").select("id, planned_for, purpose, status, calendar_event_id, lodge_id, lodges(name, number)").gte("planned_for", from).lt("planned_for", to).neq("status", "cancelled") : empty,
    want("meetings") && !sp.kind ? db.from("meetings").select("id, title, starts_at, status, calendar_event_id").gte("starts_at", from).lt("starts_at", to) : empty,
    want("tasks") && !sp.kind && can(session, "tasks.use") ? db.from("tasks").select("id, title, due_on, status").eq("owner_account_id", session.accountId)
      .gte("due_on", from.slice(0, 10)).lt("due_on", to.slice(0, 10)).in("status", ["open", "in_progress", "waiting"]) : empty,
  ]);
  // Visits and meetings that already have a calendar event are shown once, as the event.
  const linked = new Set((events ?? []).map((e) => e.id));
  const items: CalendarItem[] = [
    ...(events ?? []).map((e) => ({
      id: `e${e.id}`, date: ukDate(e.starts_at), time: formatTime(e.starts_at), title: e.title, href: `/events/${e.id}`,
      tag: `${kindLabel(e.kind)}${e.status !== "published" ? ` · ${eventStatusLabel(e.status)}` : ""}`,
      tone: (e.status === "draft" ? "neutral" : EVENT_KINDS.find((k) => k.value === e.kind)?.training ? "teal" : "navy") as CalendarItem["tone"],
      muted: e.status === "cancelled",
    })),
    ...(visits ?? []).filter((v) => !v.calendar_event_id || !linked.has(v.calendar_event_id)).map((v) => {
      const l = v.lodges as unknown as { name: string; number: number } | null;
      return { id: `v${v.id}`, date: ukDate(v.planned_for), time: formatTime(v.planned_for), title: l ? `Visit: ${l.name} No. ${l.number}` : "Lodge visit",
        href: `/lodges/${v.lodge_id}?tab=activity`, tag: `Lodge visit · ${label(v.status)}`, tone: "navy" as const };
    }),
    ...(meetings ?? []).filter((m) => !m.calendar_event_id || !linked.has(m.calendar_event_id)).map((m) => ({
      id: `m${m.id}`, date: ukDate(m.starts_at), time: formatTime(m.starts_at), title: m.title, href: `/team/meetings/${m.id}`,
      tag: `Meeting${m.status === "cancelled" ? " · Cancelled" : ""}`, tone: "navy" as const, muted: m.status === "cancelled",
    })),
    ...(tasks ?? []).map((t) => ({
      id: `t${t.id}`, date: t.due_on!, title: t.title, href: `/tasks/${t.id}`, tag: t.due_on! < today ? "Task overdue" : "Task due", tone: "warning" as const,
    })),
  ];
  items.sort((a, b) => (a.date + (a.time ?? "00:00")).localeCompare(b.date + (b.time ?? "00:00")));

  const href = (extra: Record<string, string>) => `/calendar?${new URLSearchParams(Object.entries({ ...sp, ...extra }).filter(([, v]) => v) as [string, string][])}`;
  const agenda = items.filter((i) => i.date.startsWith(month));

  return (
    <>
      <PageHeader title="Calendar" description="Events you can see, planned Lodge visits, meetings and your task due dates in one place."
        actions={<>
          <LinkButton href="/account#calendar-feeds">Subscribe in your calendar app</LinkButton>
          {can(session, "events.manage") && <LinkButton href="/events/new" variant="primary">New event</LinkButton>}
        </>} />

      <nav aria-label="View" className="mb-4 flex gap-2 text-sm">
        {(["month", "agenda"] as const).map((v) => (
          <Link key={v} href={href({ view: v === "month" ? "" : v })} aria-current={view === v ? "page" : undefined}
            className="rounded-full border border-line bg-white px-3 py-1 aria-[current=page]:border-navy-800 aria-[current=page]:bg-navy-800 aria-[current=page]:text-white">
            {v === "month" ? "Month" : "Agenda"}
          </Link>
        ))}
      </nav>

      <FilterBar resetHref={`/calendar?month=${month}${view === "agenda" ? "&view=agenda" : ""}`}>
        <input type="hidden" name="month" value={month} />
        {view === "agenda" && <input type="hidden" name="view" value="agenda" />}
        <FilterSelect name="source" label="Show" defaultValue={sp.source} placeholder="Everything" options={SOURCES} />
        <FilterSelect name="kind" label="Event type" defaultValue={sp.kind} options={EVENT_KINDS.map((k) => ({ value: k.value, label: k.label }))} />
      </FilterBar>

      {view === "month" ? (
        <MonthCalendar month={month} items={items} today={today} hrefFor={(m) => href({ month: m })} />
      ) : (
        <section aria-label={`Agenda for ${monthTitle(month)}`}>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold text-navy-900">{monthTitle(month)}</h2>
            <nav aria-label="Change month" className="flex gap-2 text-sm">
              <Link href={href({ month: shiftMonth(month, -1) })} className="rounded-md border border-line bg-white px-3 py-1.5 hover:border-navy-600">Previous</Link>
              <Link href={href({ month: today.slice(0, 7) })} className="rounded-md border border-line bg-white px-3 py-1.5 hover:border-navy-600">This month</Link>
              <Link href={href({ month: shiftMonth(month, 1) })} className="rounded-md border border-line bg-white px-3 py-1.5 hover:border-navy-600">Next</Link>
            </nav>
          </div>
          {agenda.length === 0 ? <EmptyState title="Nothing this month">Try another month or clear the filters.</EmptyState> : (
            <ol className="divide-y divide-line rounded-lg border border-line bg-surface">
              {agenda.map((i) => (
                <li key={i.id} className="flex flex-wrap items-start gap-x-4 gap-y-1 px-4 py-3">
                  <span className="w-36 shrink-0 text-sm tabular-nums text-slate-ink">
                    {new Date(`${i.date}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })}{i.time ? ` · ${i.time}` : ""}
                  </span>
                  <span className="min-w-0 flex-1">
                    {i.href ? <Link href={i.href} className={`font-medium text-navy-800 hover:underline ${i.muted ? "line-through" : ""}`}>{i.title}</Link> : <span className="font-medium">{i.title}</span>}
                    <span className="block text-[13px] text-muted">{i.tag}</span>
                  </span>
                  {i.id.startsWith("e") && <a href={`/api/events/${i.id.slice(1)}/ics`} className="text-[13px] text-navy-800 underline">Download .ics</a>}
                </li>
              ))}
            </ol>
          )}
        </section>
      )}
    </>
  );
}
