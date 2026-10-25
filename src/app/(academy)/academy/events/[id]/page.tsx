import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { Badge, statusTone } from "@/components/ui/badge";
import { buttonClass, LinkButton } from "@/components/ui/button";
import { Alert, DescriptionList, PageHeader, Panel } from "@/components/ui/layout";
import { formatLabel, kindLabel, registrationLabel, trainerRoleLabel } from "@/components/events/constants";
import { renderMarkdown } from "@/lib/markdown";
import { formatDateTime, formatTime } from "@/lib/utils";
import { safeBookingUrl } from "@/server/integrations/octra";
import { requireSession } from "@/server/session";
import { supabaseServer } from "@/server/supabase";
import { CancelPlaceButton, FeedbackForm, RegisterButton } from "../event-forms";

export const metadata: Metadata = { title: "Event" };

export default async function AcademyEventPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  const { id } = await params;
  const db = await supabaseServer();
  const { data: e } = await db.from("events")
    .select("id, title, description, kind, format, starts_at, ends_at, status, location, registration_mode, registration_opens_at, registration_closes_at, external_booking_url, feedback_enabled, cancelled_reason, certificate_on_attendance, attendance_completes_course, meeting_centres(name)")
    .eq("id", id).neq("status", "draft").maybeSingle();
  if (!e) notFound();

  const [{ data: reg }, { data: trainers }] = await Promise.all([
    db.from("registrations").select("id, status, waitlist_position, checkin_code, checked_in_at, feedback_rating, feedback_at").eq("event_id", id).eq("person_id", session.personId).maybeSingle(),
    db.from("event_trainers").select("person_id, display_name, role").eq("event_id", id).order("display_name"),
  ]);
  const placed = reg && ["confirmed", "attended"].includes(reg.status);
  const [{ data: joining }, { data: resources }] = placed
    ? await Promise.all([
      db.from("event_joining_details").select("online_url, instructions").eq("event_id", id).maybeSingle(),
      db.from("event_resources").select("id, title, url, document_id").eq("event_id", id).eq("audience", "attendees").order("position"),
    ])
    : [{ data: null }, { data: [] as { id: string; title: string; url: string | null; document_id: string | null }[] }];

  const now = new Date().getTime();
  const ended = new Date(e.ends_at).getTime() < now;
  const opensLater = e.registration_opens_at && new Date(e.registration_opens_at).getTime() > now;
  const closed = new Date(e.registration_closes_at ?? e.starts_at).getTime() <= now;
  const active = reg && ["confirmed", "waitlisted", "attended"].includes(reg.status);
  const canBook = e.status === "published" && e.registration_mode === "hub" && !opensLater && !closed && !active;
  const showQr = reg?.status === "confirmed" && !ended;
  const qr = showQr ? await QRCode.toDataURL(reg.checkin_code, { width: 320, margin: 1, color: { dark: "#03294f", light: "#ffffff" } }) : null;
  const booking = safeBookingUrl(e.external_booking_url);
  const centre = (e.meeting_centres as unknown as { name: string } | null)?.name;

  return (
    <>
      <PageHeader
        breadcrumbs={[{ href: "/academy/events", label: "Training and events" }]}
        title={e.title}
        description={`${formatDateTime(e.starts_at)} to ${formatTime(e.ends_at)}`}
        meta={
          <>
            <Badge tone="teal">{kindLabel(e.kind)}</Badge>
            <span className="text-sm text-muted">{formatLabel(e.format)}{centre ? ` · ${centre}` : e.location ? ` · ${e.location}` : ""}</span>
            {reg && reg.status !== "cancelled" && <Badge tone={statusTone(reg.status)}>{registrationLabel(reg.status)}{reg.status === "waitlisted" && reg.waitlist_position ? ` (position ${reg.waitlist_position})` : ""}</Badge>}
          </>
        }
        actions={e.status !== "cancelled" ? <LinkButton href={`/api/events/${id}/ics`} prefetch={false}>Add to my calendar</LinkButton> : undefined}
      />

      {e.status === "cancelled" && <div className="mb-6"><Alert tone="warning" title="This event has been cancelled">{e.cancelled_reason ?? "We are sorry for any inconvenience."}</Alert></div>}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Panel title="About">
            {e.description ? <div className="prose-hub" dangerouslySetInnerHTML={{ __html: renderMarkdown(e.description) }} /> : <p className="text-sm text-muted">More details will follow.</p>}
            {(e.certificate_on_attendance || e.attendance_completes_course) && (
              <p className="mt-4 text-sm text-slate-ink">
                {e.attendance_completes_course ? "Attending completes the linked Academy course. " : ""}
                {e.certificate_on_attendance ? "You will receive a certificate once your attendance is recorded." : ""}
              </p>
            )}
          </Panel>

          {placed && e.format !== "in_person" && (
            <Panel title="How to join">
              {joining?.online_url || joining?.instructions ? (
                <DescriptionList columns={1} items={[
                  { label: "Online link", value: joining.online_url ? <a href={joining.online_url} className="break-all text-navy-800 underline" target="_blank" rel="noopener noreferrer">{joining.online_url}</a> : null },
                  { label: "Instructions", value: joining.instructions ? <span className="whitespace-pre-line">{joining.instructions}</span> : null },
                ]} />
              ) : <p className="text-sm text-muted">Joining details will be added before the session.</p>}
            </Panel>
          )}

          {placed && (resources?.length ?? 0) > 0 && (
            <Panel title="Resources">
              <ul className="space-y-2 text-sm">
                {resources!.map((r) => (
                  <li key={r.id}>
                    {r.url ? <a href={r.url} target="_blank" rel="noopener noreferrer" className="font-medium text-navy-800 underline">{r.title}</a>
                      : <Link href="/academy/resources" className="font-medium text-navy-800 underline">{r.title}</Link>}
                  </li>
                ))}
              </ul>
            </Panel>
          )}

          {reg?.status === "attended" && e.feedback_enabled && (
            <Panel id="feedback" title="Your feedback" description="It helps us improve future sessions. Only the organisers see it.">
              {reg.feedback_at ? <p className="text-sm">Thank you. You rated this session {reg.feedback_rating} out of 5 on {formatDateTime(reg.feedback_at)}.</p>
                : <FeedbackForm eventId={id} registrationId={reg.id} />}
            </Panel>
          )}
        </div>

        <div className="space-y-6">
          <Panel title="Your place">
            <div className="space-y-3 text-sm">
              {e.registration_mode === "none" && <p>No booking is needed. Just come along.</p>}
              {e.registration_mode === "external" && (
                <>
                  <p>This event is booked through Octra-Lodge, which manages the booking and any payment.</p>
                  {booking && e.status === "published" && !ended ? (
                    <a href={booking} target="_blank" rel="noopener noreferrer" className={buttonClass("primary")}>Book through Octra-Lodge</a>
                  ) : <p className="text-muted">Booking is not available at the moment.</p>}
                </>
              )}
              {e.registration_mode === "hub" && (
                <>
                  {reg?.status === "confirmed" && <p>You have a place. We will send a reminder the day before.</p>}
                  {reg?.status === "waitlisted" && <p>You are on the waiting list. If a place becomes free it is offered to you automatically and we will email you.</p>}
                  {reg?.status === "attended" && <p>Your attendance is recorded{reg.checked_in_at ? ` (${formatDateTime(reg.checked_in_at)})` : ""}. Thank you for coming.</p>}
                  {reg?.status === "no_show" && <p>Our records show you were not able to attend. If that is wrong, please let the organisers know.</p>}
                  {canBook && <RegisterButton eventId={id} full={false} />}
                  {!active && e.status === "published" && opensLater && <p className="text-muted">Booking opens {formatDateTime(e.registration_opens_at)}.</p>}
                  {!active && e.status === "published" && !opensLater && closed && !ended && <p className="text-muted">Booking has closed.</p>}
                  {reg && ["confirmed", "waitlisted"].includes(reg.status) && !ended && e.status === "published" && (
                    <CancelPlaceButton eventId={id} registrationId={reg.id} waitlisted={reg.status === "waitlisted"} />
                  )}
                </>
              )}
            </div>
          </Panel>

          {qr && (
            <Panel title="Your check-in code" description="Show this at the door, or scan the code the presenter shows on screen.">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qr} alt="Your personal check-in QR code" width={240} height={240} className="mx-auto" />
              <p className="mt-2 text-center font-mono text-[13px] text-muted break-all">{reg!.checkin_code}</p>
            </Panel>
          )}

          {(trainers?.length ?? 0) > 0 && (
            <Panel title="Led by">
              <ul className="space-y-1.5 text-sm">
                {trainers!.map((t) => <li key={t.person_id}><span className="font-medium">{t.display_name}</span> <span className="text-muted">· {trainerRoleLabel(t.role)}</span></li>)}
              </ul>
            </Panel>
          )}
        </div>
      </div>
    </>
  );
}
