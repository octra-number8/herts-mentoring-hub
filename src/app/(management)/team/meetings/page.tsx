import type { Metadata } from "next";
import Link from "next/link";
import { Badge, statusTone } from "@/components/ui/badge";
import { FilterBar, FilterSearch, FilterSelect } from "@/components/ui/filters";
import { EmptyState, PageHeader } from "@/components/ui/layout";
import { RowLink, TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { MEETING_KIND_LABELS, meetingKindLabel } from "@/components/team/kinds";
import { NewMeetingForm } from "@/components/team/team-forms";
import { formatDateTime, label } from "@/lib/utils";
import { can, requirePermission } from "@/server/session";
import { supabaseServer } from "@/server/supabase";

export const metadata: Metadata = { title: "Meetings" };

type Search = { q?: string; kind?: string; when?: string };

export default async function MeetingsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const session = await requirePermission("team.use");
  const sp = await searchParams;
  const db = await supabaseServer();
  const now = new Date().toISOString();
  const when = sp.when === "past" || sp.when === "all" ? sp.when : sp.q ? "all" : "upcoming";

  let q = db.from("meetings").select("id, title, kind, starts_at, location, online_url, status, minutes_status").limit(200);
  if (when === "upcoming") q = q.gte("starts_at", now).order("starts_at");
  else q = q.order("starts_at", { ascending: false });
  if (when === "past") q = q.lt("starts_at", now);
  if (sp.kind && sp.kind in MEETING_KIND_LABELS) q = q.eq("kind", sp.kind);
  // Searches titles and minutes (the generated `search` tsvector).
  if (sp.q?.trim()) q = q.textSearch("search", sp.q.trim().slice(0, 200), { type: "websearch", config: "english" });
  const { data: meetings, error } = await q;
  if (error) throw error;
  const filtered = !!(sp.q || sp.kind || sp.when);

  return (
    <>
      <PageHeader
        breadcrumbs={[{ href: "/team", label: "Team" }]}
        title="Meetings"
        description="Agendas, minutes, decisions and actions. Search covers titles and minutes."
        actions={can(session, "meetings.manage") ? <NewMeetingForm /> : undefined}
      />
      <FilterBar resetHref="/team/meetings">
        <FilterSearch defaultValue={sp.q} placeholder="Words in the title or minutes" label="Search meeting history" />
        <FilterSelect name="kind" label="Kind" defaultValue={sp.kind} options={Object.entries(MEETING_KIND_LABELS).map(([value, l]) => ({ value, label: l }))} />
        <FilterSelect name="when" label="When" defaultValue={sp.when} placeholder={sp.q ? "Any time" : "Upcoming"} options={[{ value: "past", label: "Past" }, { value: "all", label: "Any time" }]} />
      </FilterBar>

      {!meetings?.length ? (
        <EmptyState title={filtered ? "No meetings match" : "No upcoming meetings"}>
          {filtered ? <Link href="/team/meetings" className="underline">Clear the search</Link> : <Link href="/team/meetings?when=past" className="underline">See past meetings</Link>}
        </EmptyState>
      ) : (
        <Table caption="Meetings">
          <THead><TH>Meeting</TH><TH>When</TH><TH className="hidden md:table-cell">Where</TH><TH className="hidden sm:table-cell">Minutes</TH></THead>
          <TBody>
            {meetings.map((m) => (
              <TR key={m.id}>
                <TD>
                  <RowLink href={`/team/meetings/${m.id}`}>{m.title}</RowLink>
                  <div className="text-[13px] text-muted">{meetingKindLabel(m.kind)}{m.status !== "scheduled" && ` · ${label(m.status)}`}</div>
                </TD>
                <TD className="whitespace-nowrap">{formatDateTime(m.starts_at)}</TD>
                <TD className="hidden md:table-cell">{m.location ?? (m.online_url ? "Online" : <span className="text-muted">Not set</span>)}</TD>
                <TD className="hidden sm:table-cell">{m.minutes_status === "none" ? <span className="text-muted">None</span> : <Badge tone={statusTone(m.minutes_status)}>{label(m.minutes_status)}</Badge>}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </>
  );
}
