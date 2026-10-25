import type { Metadata } from "next";
import Link from "next/link";
import { Badge, statusTone } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { FilterBar, FilterSearch, FilterSelect } from "@/components/ui/filters";
import { EmptyState, PageHeader } from "@/components/ui/layout";
import { RowLink, TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { EVENT_KINDS, EVENT_STATUSES, eventStatusLabel, formatLabel, kindLabel, visibilityLabel } from "@/components/events/constants";
import { monthRange, parseMonth, ukDate } from "@/components/events/datetime";
import { MonthCalendar, type CalendarItem } from "@/components/events/month-calendar";
import { formatDateTime, formatTime, todayIso } from "@/lib/utils";
import { can, requirePermission } from "@/server/session";
import { supabaseServer } from "@/server/supabase";

export const metadata: Metadata = { title: "Events" };

type Search = { view?: string; month?: string; q?: string; kind?: string; status?: string; when?: string };

export default async function EventsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const session = await requirePermission("events.read.internal", "events.manage");
  const sp = await searchParams;
  const db = await supabaseServer();
  const view = sp.view === "month" ? "month" : "list";
  const today = todayIso();
  const month = parseMonth(sp.month, today.slice(0, 7));
  const when = sp.when ?? "upcoming";
  const nowIso = new Date().toISOString();

  let q = db.from("events").select("id, title, kind, format, visibility, status, starts_at, ends_at, capacity, registration_mode, location, meeting_centres(name)");
  if (sp.q) q = q.ilike("title", `%${sp.q.replace(/[%_]/g, "")}%`);
  if (sp.kind) q = q.eq("kind", sp.kind);
  if (sp.status) q = q.eq("status", sp.status);
  if (view === "month") {
    const r = monthRange(month);
    q = q.gte("starts_at", r.from).lt("starts_at", r.to).order("starts_at");
  } else if (when === "upcoming") q = q.gte("ends_at", nowIso).order("starts_at");
  else if (when === "past") q = q.lt("ends_at", nowIso).order("starts_at", { ascending: false });
  else q = q.order("starts_at", { ascending: false });
  const [{ data: events }, { data: attendance }] = await Promise.all([
    q.limit(300),
    db.from("v_event_attendance").select("event_id, registered, waitlisted, attended").limit(1000),
  ]);
  const counts = new Map((attendance ?? []).map((a) => [a.event_id, a]));
  const params = (extra: Record<string, string>) => {
    const p = new URLSearchParams(Object.entries({ ...sp, ...extra }).filter(([, v]) => v) as [string, string][]);
    return `/events?${p}`;
  };

  const items: CalendarItem[] = (events ?? []).map((e) => ({
    id: e.id, date: ukDate(e.starts_at), time: formatTime(e.starts_at), title: e.title, href: `/events/${e.id}`,
    tag: `${kindLabel(e.kind)}${e.status !== "published" ? ` · ${eventStatusLabel(e.status)}` : ""}`,
    tone: e.status === "draft" ? "neutral" : e.status === "cancelled" ? "warning" : EVENT_KINDS.find((k) => k.value === e.kind)?.training ? "teal" : "navy",
    muted: e.status === "cancelled",
  }));

  return (
    <>
      <PageHeader
        title="Events and training"
        description="Workshops, training, meetings and Provincial activities. Drafts are visible only to organisers."
        actions={
          <>
            <LinkButton href="/calendar">My calendar</LinkButton>
            {can(session, "events.manage") && <LinkButton href="/events/new" variant="primary">New event</LinkButton>}
          </>
        }
      />

      <nav aria-label="View" className="mb-4 flex gap-2 text-sm">
        <Link href={params({ view: "" })} aria-current={view === "list" ? "page" : undefined}
          className="rounded-full border border-line bg-white px-3 py-1 aria-[current=page]:border-navy-800 aria-[current=page]:bg-navy-800 aria-[current=page]:text-white">List</Link>
        <Link href={params({ view: "month" })} aria-current={view === "month" ? "page" : undefined}
          className="rounded-full border border-line bg-white px-3 py-1 aria-[current=page]:border-navy-800 aria-[current=page]:bg-navy-800 aria-[current=page]:text-white">Month</Link>
      </nav>

      <FilterBar resetHref={view === "month" ? "/events?view=month" : "/events"}>
        <input type="hidden" name="view" value={view === "month" ? "month" : ""} />
        {view === "month" && <input type="hidden" name="month" value={month} />}
        <FilterSearch defaultValue={sp.q} placeholder="Event title" />
        <FilterSelect name="kind" label="Type" defaultValue={sp.kind} options={EVENT_KINDS.map((k) => ({ value: k.value, label: k.label }))} />
        <FilterSelect name="status" label="Status" defaultValue={sp.status} options={EVENT_STATUSES.map((s) => ({ value: s.value, label: s.label }))} />
        {view === "list" && (
          <FilterSelect name="when" label="When" defaultValue={when === "upcoming" ? "" : when} placeholder="Upcoming"
            options={[{ value: "past", label: "Past" }, { value: "all", label: "All dates" }]} />
        )}
      </FilterBar>

      {view === "month" ? (
        <MonthCalendar month={month} items={items} today={today} hrefFor={(m) => params({ view: "month", month: m })} />
      ) : !events?.length ? (
        <EmptyState title={when === "upcoming" ? "No upcoming events match" : "No events match these filters"}
          action={can(session, "events.manage") ? <LinkButton href="/events/new" size="sm">Create an event</LinkButton> : undefined}>
          {sp.q || sp.kind || sp.status ? <Link href="/events" className="underline">Clear the filters</Link> : "Published events you can see will appear here."}
        </EmptyState>
      ) : (
        <Table caption="Events">
          <THead>
            <TH>When</TH><TH>Event</TH><TH className="hidden md:table-cell">Audience</TH><TH>Status</TH><TH className="hidden sm:table-cell" align="right">Booked</TH>
          </THead>
          <TBody>
            {events.map((e) => {
              const c = counts.get(e.id);
              const centre = (e.meeting_centres as unknown as { name: string } | null)?.name;
              return (
                <TR key={e.id}>
                  <TD className="whitespace-nowrap tabular-nums">{formatDateTime(e.starts_at)}</TD>
                  <TD>
                    <RowLink href={`/events/${e.id}`}>{e.title}</RowLink>
                    <div className="text-[13px] text-muted">{kindLabel(e.kind)} · {formatLabel(e.format)}{centre ? ` · ${centre}` : e.location ? ` · ${e.location}` : ""}</div>
                  </TD>
                  <TD className="hidden md:table-cell">{visibilityLabel(e.visibility)}</TD>
                  <TD><Badge tone={statusTone(e.status)}>{eventStatusLabel(e.status)}</Badge></TD>
                  <TD className="hidden sm:table-cell" align="right">
                    {e.registration_mode === "hub" ? (
                      c ? <>{c.registered}{e.capacity ? ` / ${e.capacity}` : ""}{Number(c.waitlisted) > 0 && <div className="text-[13px] text-muted">{c.waitlisted} waiting</div>}</> : <span className="text-muted">-</span>
                    ) : <span className="text-[13px] text-muted">{e.registration_mode === "external" ? "Octra-Lodge" : "No booking"}</span>}
                  </TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
      )}
    </>
  );
}
