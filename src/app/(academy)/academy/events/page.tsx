import type { Metadata } from "next";
import Link from "next/link";
import { Badge, statusTone } from "@/components/ui/badge";
import { EmptyState, PageHeader, Tabs } from "@/components/ui/layout";
import { formatLabel, kindLabel, registrationLabel } from "@/components/events/constants";
import { formatDay, formatTime } from "@/lib/utils";
import { requireSession } from "@/server/session";
import { supabaseServer } from "@/server/supabase";

export const metadata: Metadata = { title: "Training and events" };

type Ev = { id: string; title: string; kind: string; format: string; starts_at: string; ends_at: string; status: string; registration_mode: string; location: string | null; meeting_centres: { name: string } | null };

export default async function AcademyEventsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const session = await requireSession();
  const tab = (await searchParams).tab === "mine" ? "mine" : "upcoming";
  const db = await supabaseServer();
  const nowIso = new Date().toISOString();
  const [{ data: upcoming }, { data: mine }] = await Promise.all([
    db.from("events").select("id, title, kind, format, starts_at, ends_at, status, registration_mode, location, meeting_centres(name)")
      .eq("status", "published").gte("ends_at", nowIso).order("starts_at").limit(100),
    db.from("registrations").select("id, status, event_id, events(id, title, kind, format, starts_at, ends_at, status, registration_mode, location, meeting_centres(name))")
      .eq("person_id", session.personId).neq("status", "cancelled").order("registered_at", { ascending: false }).limit(100),
  ]);
  const myStatus = new Map((mine ?? []).map((r) => [r.event_id, r.status]));
  const bookings = (mine ?? []).map((r) => ({ status: r.status, event: r.events as unknown as Ev })).filter((b) => b.event)
    .sort((a, b) => b.event.starts_at.localeCompare(a.event.starts_at));
  const list = tab === "mine" ? bookings.map((b) => b.event) : ((upcoming ?? []) as unknown as Ev[]);

  return (
    <>
      <PageHeader title="Training and events" description="Workshops, training sessions and evenings you can join. Book here, and add them to your own calendar." />
      <Tabs current={tab} tabs={[
        { key: "upcoming", label: "Upcoming", href: "/academy/events" },
        { key: "mine", label: "My bookings", href: "/academy/events?tab=mine", count: bookings.filter((b) => b.event.ends_at >= nowIso).length },
      ]} />
      {list.length === 0 ? (
        <EmptyState title={tab === "mine" ? "You have no bookings yet" : "Nothing is planned just now"}>
          {tab === "mine" ? <Link href="/academy/events" className="underline">See what is coming up</Link> : "New training and events will appear here when they are published."}
        </EmptyState>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {list.map((e) => {
            const status = myStatus.get(e.id);
            const past = e.ends_at < nowIso;
            return (
              <li key={e.id} className="flex flex-col rounded-lg border border-line bg-surface p-5">
                <div className="flex flex-wrap items-center gap-2 text-[13px] text-muted">
                  <span className="font-medium text-teal-800">{kindLabel(e.kind)}</span><span aria-hidden>·</span><span>{formatLabel(e.format)}</span>
                </div>
                <h2 className="mt-1 text-lg font-semibold text-navy-900"><Link href={`/academy/events/${e.id}`} className="hover:underline">{e.title}</Link></h2>
                <p className="text-sm text-slate-ink">{formatDay(e.starts_at)}, {formatTime(e.starts_at)} to {formatTime(e.ends_at)}{e.meeting_centres?.name ? ` · ${e.meeting_centres.name}` : e.location ? ` · ${e.location}` : ""}</p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {e.status === "cancelled" && <Badge tone="warning">Cancelled</Badge>}
                  {status && <Badge tone={statusTone(status)}>{registrationLabel(status)}</Badge>}
                  {!status && e.registration_mode === "external" && <Badge tone="neutral">Book through Octra-Lodge</Badge>}
                  {past && e.status !== "cancelled" && <Badge tone="neutral">Finished</Badge>}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
