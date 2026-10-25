import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, statusTone } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { Alert, DescriptionList, EmptyState, PageHeader, Panel, Stat, Tabs } from "@/components/ui/layout";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { CHECKIN_METHOD_LABELS, eventStatusLabel, formatLabel, kindLabel, registrationLabel, trainerRoleLabel, visibilityLabel } from "@/components/events/constants";
import { renderMarkdown } from "@/lib/markdown";
import { formatDateTime, formatTime, plural } from "@/lib/utils";
import { safeBookingUrl } from "@/server/integrations/octra";
import { can, requirePermission } from "@/server/session";
import { supabaseServer } from "@/server/supabase";
import {
  AttendanceForm, CancelEventForm, CancelRegistrationButton, CheckinControls, CompleteButton, InviteForm, PublishButton,
  RegisterPersonForm, RemoveInvite, RemoveResource, RemoveTrainer, ResourceForm, TrainerForm, UnpublishButton, WaitlistMove,
} from "./event-forms";

export const metadata: Metadata = { title: "Event" };

const TABS = ["overview", "registrations", "checkin"] as const;
type Tab = (typeof TABS)[number];

type Reg = {
  id: string; status: string; waitlist_position: number | null; registered_at: string; checked_in_at: string | null; checkin_method: string | null;
  override_reason: string | null; feedback_rating: number | null; feedback_comment: string | null; feedback_at: string | null;
  persons: { display_name: string; email: string | null } | null;
};

export default async function EventPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const session = await requirePermission("events.read.internal", "events.manage");
  const { id } = await params;
  const sp = await searchParams;
  const db = await supabaseServer();

  const { data: event } = await db.from("events").select("*, meeting_centres(name), courses(title)").eq("id", id).maybeSingle();
  if (!event) notFound();

  const [{ data: trainers }, { data: regsRaw }] = await Promise.all([
    db.from("event_trainers").select("person_id, display_name, role").eq("event_id", id).order("display_name"),
    db.from("registrations").select("id, status, waitlist_position, registered_at, checked_in_at, checkin_method, override_reason, feedback_rating, feedback_comment, feedback_at, persons(display_name, email)")
      .eq("event_id", id).order("registered_at"),
  ]);
  const manage = can(session, "events.manage");
  const isTrainer = (trainers ?? []).some((t) => t.person_id === session.personId);
  const canRun = manage || (can(session, "events.checkin") && isTrainer);
  const regs = (regsRaw ?? []) as unknown as Reg[];
  const tabs = canRun ? TABS : (["overview"] as const);
  const tab: Tab = (tabs as readonly string[]).includes(sp.tab ?? "") ? (sp.tab as Tab) : "overview";

  const active = regs.filter((r) => ["confirmed", "attended", "no_show"].includes(r.status));
  const waiting = regs.filter((r) => r.status === "waitlisted").sort((a, b) => (a.waitlist_position ?? 0) - (b.waitlist_position ?? 0));
  const attended = regs.filter((r) => r.status === "attended");
  const booked = regs.filter((r) => ["confirmed", "waitlisted"].includes(r.status)).length;
  const centre = (event.meeting_centres as unknown as { name: string } | null)?.name;
  const course = (event.courses as unknown as { title: string } | null)?.title;
  const ended = new Date(event.ends_at).getTime() < new Date().getTime();

  return (
    <>
      <PageHeader
        breadcrumbs={[{ href: "/events", label: "Events" }]}
        title={event.title}
        description={`${formatDateTime(event.starts_at)} to ${formatTime(event.ends_at)}${centre ? ` · ${centre}` : event.location ? ` · ${event.location}` : ""}`}
        meta={
          <>
            <Badge tone={statusTone(event.status)}>{eventStatusLabel(event.status)}</Badge>
            <Badge tone="navy">{kindLabel(event.kind)}</Badge>
            <span className="text-sm text-muted">{formatLabel(event.format)} · {visibilityLabel(event.visibility)}</span>
            {event.checkin_open && <Badge tone="teal">Check-in open</Badge>}
          </>
        }
        actions={
          <>
            {canRun && event.status === "published" && <LinkButton href={`/events/${id}/present`}>Presenter view</LinkButton>}
            <LinkButton href={`/api/events/${id}/ics`} prefetch={false}>Add to calendar</LinkButton>
            {manage && ["draft", "published"].includes(event.status) && <LinkButton href={`/events/${id}/edit`}>Edit</LinkButton>}
            {manage && event.status === "draft" && <PublishButton eventId={id} />}
            {manage && event.status === "published" && booked === 0 && !ended && <UnpublishButton eventId={id} />}
            {manage && event.status === "published" && <CompleteButton eventId={id} />}
            {manage && ["draft", "published"].includes(event.status) && <CancelEventForm eventId={id} booked={booked} />}
          </>
        }
      />
      {event.status === "cancelled" && <div className="mb-4"><Alert tone="warning" title="This event was cancelled">{event.cancelled_reason}</Alert></div>}
      {event.status === "draft" && <div className="mb-4"><Alert tone="info">Draft: only organisers can see this event. Publish it when it is ready.</Alert></div>}
      <Tabs current={tab} tabs={tabs.map((t) => ({
        key: t, href: `/events/${id}?tab=${t}`,
        label: { overview: "Overview", registrations: "Registrations", checkin: "Check-in and feedback" }[t],
        count: t === "registrations" ? active.length + waiting.length : undefined,
      }))} />
      {tab === "overview" && <Overview />}
      {tab === "registrations" && <Registrations />}
      {tab === "checkin" && <Checkin />}
    </>
  );

  async function Overview() {
    const [{ data: joining }, { data: resources }, { data: invites }, { data: docs }] = await Promise.all([
      db.from("event_joining_details").select("online_url, instructions").eq("event_id", id).maybeSingle(),
      db.from("event_resources").select("id, title, url, document_id, audience").eq("event_id", id).order("position"),
      manage ? db.from("event_invites").select("person_id, invited_at, persons(display_name)").eq("event_id", id).order("invited_at") : Promise.resolve({ data: [] as never[] }),
      manage ? db.from("documents").select("id, title").is("archived_at", null).order("title").limit(200) : Promise.resolve({ data: [] as { id: string; title: string }[] }),
    ]);
    const booking = safeBookingUrl(event!.external_booking_url);
    return (
      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <Panel title="About this event">
            {event!.description ? <div className="prose-hub" dangerouslySetInnerHTML={{ __html: renderMarkdown(event!.description) }} /> : <p className="text-sm text-muted">No description yet.</p>}
          </Panel>
          <Panel title="Registration">
            <DescriptionList items={[
              { label: "How people book", value: event!.registration_mode === "hub" ? "In the Hub" : event!.registration_mode === "external" ? "Through Octra-Lodge" : "No registration needed" },
              ...(event!.registration_mode === "hub" ? [
                { label: "Capacity", value: event!.capacity ? `${active.length} of ${event!.capacity} places taken` : `${active.length} registered, no limit` },
                { label: "Waiting list", value: event!.waitlist_enabled ? `${waiting.length} waiting` : "Not used" },
                { label: "Registration opens", value: event!.registration_opens_at ? formatDateTime(event!.registration_opens_at) : "When published" },
                { label: "Registration closes", value: event!.registration_closes_at ? formatDateTime(event!.registration_closes_at) : "When the event starts" },
              ] : []),
              ...(event!.registration_mode === "external" ? [
                { label: "Octra-Lodge booking page", value: booking ? <a href={booking} className="text-navy-800 underline" target="_blank" rel="noopener noreferrer">Open booking page</a> : "Not set" },
                { label: "Bookings", value: "Held in Octra-Lodge, which remains the authoritative record. The Hub does not import them." },
              ] : []),
              { label: "Linked course", value: course ? <>{course}{event!.attendance_completes_course && <div className="text-[13px] text-muted">Attendance completes the course</div>}</> : null },
              { label: "Certificate", value: event!.certificate_on_attendance ? "Issued on verified attendance" : "None" },
              { label: "Feedback", value: event!.feedback_enabled ? "Requested after attendance" : "Off" },
            ]} />
          </Panel>
          {event!.format !== "in_person" && (
            <Panel title="Joining details" description="Visible only to organisers and people with a confirmed place.">
              {joining ? (
                <DescriptionList columns={1} items={[
                  { label: "Online link", value: joining.online_url ? <a className="break-all text-navy-800 underline" href={joining.online_url} target="_blank" rel="noopener noreferrer">{joining.online_url}</a> : null },
                  { label: "Instructions", value: joining.instructions ? <span className="whitespace-pre-line">{joining.instructions}</span> : null },
                ]} />
              ) : <p className="text-sm text-muted">No joining details yet.{manage && <> <Link className="underline" href={`/events/${id}/edit`}>Add them</Link>.</>}</p>}
            </Panel>
          )}
        </div>
        <div className="space-y-6">
          <Panel title="Trainers and presenters" actions={manage ? <TrainerForm eventId={id} /> : undefined}>
            {trainers?.length ? (
              <ul className="space-y-2 text-sm">
                {trainers.map((t) => (
                  <li key={t.person_id} className="flex items-start justify-between gap-2">
                    <span><span className="font-medium">{t.display_name}</span><span className="block text-muted">{trainerRoleLabel(t.role)}</span></span>
                    {manage && <RemoveTrainer eventId={id} personId={t.person_id} name={t.display_name} />}
                  </li>
                ))}
              </ul>
            ) : <p className="text-sm text-muted">Nobody allocated yet.</p>}
          </Panel>
          <Panel title="Resources" description="Documents and links for presenters or attendees." actions={manage ? <ResourceForm eventId={id} documents={docs ?? []} /> : undefined}>
            {resources?.length ? (
              <ul className="space-y-2 text-sm">
                {resources.map((r) => (
                  <li key={r.id} className="flex items-start justify-between gap-2">
                    <span>
                      {r.url ? <a href={r.url} className="font-medium text-navy-800 underline" target="_blank" rel="noopener noreferrer">{r.title}</a>
                        : <Link href={`/library/${r.document_id}`} className="font-medium text-navy-800 underline">{r.title}</Link>}
                      <span className="block text-muted">{r.audience === "attendees" ? "For attendees" : "For presenters"}{r.document_id ? " · Library document" : ""}</span>
                    </span>
                    {manage && <RemoveResource eventId={id} resourceId={r.id} />}
                  </li>
                ))}
              </ul>
            ) : <p className="text-sm text-muted">No resources yet.</p>}
          </Panel>
          {manage && (
            <Panel title="Invitations" description={event!.visibility === "invited" ? "Only invited members (and the Provincial team) can see this event." : "Invitations matter most for invite-only events."}
              actions={<InviteForm eventId={id} published={event!.status === "published"} />}>
              {invites?.length ? (
                <ul className="space-y-2 text-sm">
                  {invites.map((i) => (
                    <li key={i.person_id} className="flex items-center justify-between gap-2">
                      <span>{(i.persons as unknown as { display_name: string } | null)?.display_name ?? "Member"}</span>
                      <RemoveInvite eventId={id} personId={i.person_id} />
                    </li>
                  ))}
                </ul>
              ) : <p className="text-sm text-muted">Nobody invited.</p>}
            </Panel>
          )}
        </div>
      </div>
    );
  }

  async function Registrations() {
    if (event!.registration_mode !== "hub") {
      return <EmptyState title={event!.registration_mode === "external" ? "Bookings are made through Octra-Lodge" : "This event does not take registrations"}>
        {event!.registration_mode === "external" ? "Octra-Lodge holds the booking list. The Octra-Lodge connection is not configured, so bookings are not shown here." : "Change how people book from Edit if you need a list."}
      </EmptyState>;
    }
    const canAdd = manage && event!.status === "published";
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Places taken" value={event!.capacity ? `${active.length} / ${event!.capacity}` : active.length} />
          <Stat label="Waiting list" value={waiting.length} />
          <Stat label="Attended" value={attended.length} />
          <Stat label="Cancelled" value={regs.filter((r) => r.status === "cancelled").length} />
        </div>
        <Panel title="Registered" padded={false} actions={canAdd ? <RegisterPersonForm eventId={id} /> : undefined}>
          {active.length ? (
            <Table className="rounded-none border-0" caption="Registered">
              <THead><TH>Name</TH><TH>Status</TH><TH className="hidden md:table-cell">Registered</TH><TH className="hidden lg:table-cell">Check-in</TH><TH><span className="sr-only">Actions</span></TH></THead>
              <TBody>
                {active.map((r) => (
                  <TR key={r.id}>
                    <TD><span className="font-medium">{r.persons?.display_name ?? "Member"}</span><div className="text-[13px] text-muted">{r.persons?.email}</div></TD>
                    <TD><Badge tone={statusTone(r.status)}>{registrationLabel(r.status)}</Badge>{r.override_reason && <div className="mt-1 text-[13px] text-muted">Note: {r.override_reason}</div>}</TD>
                    <TD className="hidden md:table-cell">{formatDateTime(r.registered_at)}</TD>
                    <TD className="hidden lg:table-cell">{r.checked_in_at ? <>{formatDateTime(r.checked_in_at)}<div className="text-[13px] text-muted">{CHECKIN_METHOD_LABELS[r.checkin_method ?? ""] ?? ""}</div></> : <span className="text-muted">Not yet</span>}</TD>
                    <TD className="whitespace-nowrap">
                      <span className="flex flex-wrap gap-1">
                        <AttendanceForm eventId={id} registrationId={r.id} name={r.persons?.display_name ?? "Member"} current={r.status} />
                        {r.status === "confirmed" && <CancelRegistrationButton eventId={id} registrationId={r.id} name={r.persons?.display_name ?? "this member"} />}
                      </span>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          ) : <div className="p-5"><EmptyState title="Nobody registered yet">{event!.status === "draft" ? "Publish the event so people can register." : "Registrations will appear here."}</EmptyState></div>}
        </Panel>
        <Panel title="Waiting list" description="When a place becomes free the person at the top is offered it automatically and told by email." padded={false}>
          {waiting.length ? (
            <Table className="rounded-none border-0" caption="Waiting list">
              <THead><TH>Position</TH><TH>Name</TH><TH className="hidden md:table-cell">Joined</TH><TH><span className="sr-only">Actions</span></TH></THead>
              <TBody>
                {waiting.map((r, n) => (
                  <TR key={r.id}>
                    <TD className="tabular-nums">{n + 1}</TD>
                    <TD className="font-medium">{r.persons?.display_name ?? "Member"}</TD>
                    <TD className="hidden md:table-cell">{formatDateTime(r.registered_at)}</TD>
                    <TD className="whitespace-nowrap">
                      <span className="flex flex-wrap gap-1">
                        <WaitlistMove eventId={id} registrationId={r.id} first={n === 0} last={n === waiting.length - 1} />
                        <CancelRegistrationButton eventId={id} registrationId={r.id} name={r.persons?.display_name ?? "this member"} />
                      </span>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          ) : <p className="p-5 text-sm text-muted">Nobody is waiting.</p>}
        </Panel>
        {regs.some((r) => r.status === "cancelled") && (
          <details className="rounded-lg border border-line bg-surface px-5 py-3 text-sm">
            <summary className="cursor-pointer font-medium text-navy-800">Cancelled registrations ({regs.filter((r) => r.status === "cancelled").length})</summary>
            <ul className="mt-2 space-y-1">{regs.filter((r) => r.status === "cancelled").map((r) => <li key={r.id}>{r.persons?.display_name ?? "Member"}</li>)}</ul>
          </details>
        )}
      </div>
    );
  }

  async function Checkin() {
    const withFeedback = regs.filter((r) => r.feedback_rating !== null);
    const avg = withFeedback.length ? (withFeedback.reduce((s, r) => s + (r.feedback_rating ?? 0), 0) / withFeedback.length).toFixed(1) : null;
    const dist = [5, 4, 3, 2, 1].map((n) => ({ n, count: withFeedback.filter((r) => r.feedback_rating === n).length }));
    return (
      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <Panel title="Check-in" description="Attendees can scan the session code on the presenter screen, or you can scan their personal codes.">
            {event!.registration_mode !== "hub" ? <p className="text-sm text-muted">Check-in is only available for events that take registrations in the Hub.</p>
              : event!.status !== "published" ? <p className="text-sm text-muted">Check-in is available while the event is published.</p> : (
                <div className="space-y-4">
                  <p className="text-sm">Check-in is <strong>{event!.checkin_open ? "open" : "closed"}</strong>. It works from two hours before the start until two hours after the finish.</p>
                  <CheckinControls eventId={id} open={event!.checkin_open} />
                  <div className="flex flex-wrap gap-2">
                    <LinkButton href={`/events/${id}/present`}>Presenter view with session QR code</LinkButton>
                    <LinkButton href={`/events/${id}/scan`}>Scan personal codes</LinkButton>
                  </div>
                  <p className="text-[13px] text-muted">Use New session code if the code has been shared beyond the room.</p>
                </div>
              )}
          </Panel>
          <Panel title="Feedback" description={event!.feedback_enabled ? "Attendees are invited to give feedback once their attendance is recorded." : "Feedback is turned off for this event."}>
            {withFeedback.length ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  <Stat label="Average rating" value={`${avg} / 5`} />
                  <Stat label="Responses" value={withFeedback.length} hint={`from ${plural(attended.length, "attendee")}`} />
                </div>
                <ul className="space-y-1 text-sm" aria-label="Ratings">
                  {dist.map((d) => (
                    <li key={d.n} className="flex items-center gap-3">
                      <span className="w-16 text-muted">{d.n} {d.n === 1 ? "star" : "stars"}</span>
                      <span className="h-2 flex-1 rounded bg-canvas" aria-hidden><span className="block h-2 rounded bg-teal-700" style={{ width: `${(d.count / withFeedback.length) * 100}%` }} /></span>
                      <span className="w-8 text-right tabular-nums">{d.count}</span>
                    </li>
                  ))}
                </ul>
                <ul className="divide-y divide-line text-sm">
                  {withFeedback.filter((r) => r.feedback_comment).map((r) => (
                    <li key={r.id} className="py-2"><p className="whitespace-pre-line">{r.feedback_comment}</p><p className="text-[13px] text-muted">{r.feedback_rating} / 5 · {formatDateTime(r.feedback_at)}</p></li>
                  ))}
                </ul>
              </div>
            ) : <EmptyState title="No feedback yet" />}
          </Panel>
        </div>
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3">
            <Stat label="Checked in" value={attended.length} />
            <Stat label="Expected" value={regs.filter((r) => ["confirmed", "attended"].includes(r.status)).length} />
          </div>
        </div>
      </div>
    );
  }
}
