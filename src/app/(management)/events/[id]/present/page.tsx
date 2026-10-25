import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { Alert, EmptyState, Panel, Stat } from "@/components/ui/layout";
import { AutoRefresh } from "@/components/events/auto-refresh";
import { formatDateTime, formatTime } from "@/lib/utils";
import { serverEnv } from "@/lib/env";
import { can, requirePermission } from "@/server/session";
import { supabaseServer } from "@/server/supabase";
import { CheckinControls } from "../event-forms";

export const metadata: Metadata = { title: "Presenter view" };

export default async function PresentPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requirePermission("events.manage", "events.checkin");
  const { id } = await params;
  const db = await supabaseServer();
  const [{ data: event }, { data: trainers }] = await Promise.all([
    db.from("events").select("id, title, starts_at, ends_at, status, checkin_open, registration_mode").eq("id", id).maybeSingle(),
    db.from("event_trainers").select("person_id").eq("event_id", id),
  ]);
  if (!event) notFound();
  const canRun = can(session, "events.manage") || (trainers ?? []).some((t) => t.person_id === session.personId);
  if (!canRun) notFound();

  const [{ data: regs }, { data: resources }, { data: secret }] = await Promise.all([
    db.from("registrations").select("status").eq("event_id", id),
    db.from("event_resources").select("id, title, url, document_id, audience").eq("event_id", id).order("position"),
    // Organiser-only table: registrants cannot read the session code.
    db.from("event_checkin_secrets").select("secret").eq("event_id", id).maybeSingle(),
  ]);
  const expected = (regs ?? []).filter((r) => ["confirmed", "attended"].includes(r.status)).length;
  const attended = (regs ?? []).filter((r) => r.status === "attended").length;
  const link = `${serverEnv().appUrl}/checkin/${id}?s=${secret?.secret ?? ""}`;
  const qr = event.checkin_open ? await QRCode.toDataURL(link, { width: 720, margin: 1, errorCorrectionLevel: "M", color: { dark: "#03294f", light: "#ffffff" } }) : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm text-muted"><Link href={`/events/${id}?tab=checkin`} className="hover:underline">Back to event</Link></p>
          <h1 className="text-2xl font-semibold text-navy-900 sm:text-3xl">{event.title}</h1>
          <p className="text-muted">{formatDateTime(event.starts_at)} to {formatTime(event.ends_at)}</p>
        </div>
        {event.status === "published" && event.registration_mode === "hub" && <CheckinControls eventId={id} open={event.checkin_open} />}
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section aria-labelledby="qr-title" className="rounded-lg border border-line bg-white p-6 text-center">
          <h2 id="qr-title" className="text-xl font-semibold text-navy-900">Scan to check in</h2>
          {event.registration_mode !== "hub" ? (
            <p className="mt-4 text-muted">This event does not take registrations in the Hub, so there is no check-in.</p>
          ) : qr ? (
            <>
              <p className="mt-1 text-muted">Open your phone camera and point it at the code. You will be asked to sign in if you have not already.</p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qr} alt="Session check-in QR code" className="mx-auto mt-4 aspect-square w-full max-w-[560px]" />
              <p className="mt-3 break-all text-[13px] text-muted">{link}</p>
            </>
          ) : (
            <div className="mx-auto mt-4 max-w-md"><Alert tone="info" title="Check-in is closed">Open check-in to show the session code. It works from two hours before the start until two hours after the finish.</Alert></div>
          )}
        </section>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Stat label="Checked in" value={attended} />
            <Stat label="Expected" value={expected} />
          </div>
          <AutoRefresh seconds={10} />
          <Link href={`/events/${id}/scan`} className="block text-sm font-medium text-navy-800 underline">Scan personal codes instead</Link>
          <Panel title="Resources">
            {resources?.length ? (
              <ul className="space-y-2 text-sm">
                {resources.map((r) => (
                  <li key={r.id}>
                    {r.url ? <a href={r.url} target="_blank" rel="noopener noreferrer" className="font-medium text-navy-800 underline">{r.title}</a>
                      : <Link href={`/library/${r.document_id}`} className="font-medium text-navy-800 underline">{r.title}</Link>}
                    <span className="block text-muted">{r.audience === "attendees" ? "For attendees" : "For presenters"}</span>
                  </li>
                ))}
              </ul>
            ) : <EmptyState title="No resources added" />}
          </Panel>
        </div>
      </div>
    </div>
  );
}
