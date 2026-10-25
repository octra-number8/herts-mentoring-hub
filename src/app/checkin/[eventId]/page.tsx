import type { Metadata } from "next";
import Link from "next/link";
import { Alert } from "@/components/ui/layout";
import { formatDateTime, formatTime } from "@/lib/utils";
import { requireSession } from "@/server/session";
import { supabaseServer } from "@/server/supabase";
import { CheckinForm } from "./checkin-form";

export const metadata: Metadata = { title: "Check in" };

/** Reached by scanning the presenter's session QR code. Sign-in is required (the proxy sends visitors to log in first). */
export default async function CheckinPage({ params, searchParams }: { params: Promise<{ eventId: string }>; searchParams: Promise<{ s?: string }> }) {
  const session = await requireSession();
  const { eventId } = await params;
  const { s } = await searchParams;
  const db = await supabaseServer();
  const valid = /^[0-9a-f-]{36}$/i.test(eventId);
  const { data: e } = valid ? await db.from("events").select("id, title, starts_at, ends_at, status").eq("id", eventId).maybeSingle() : { data: null };
  const { data: reg } = e ? await db.from("registrations").select("status").eq("event_id", eventId).eq("person_id", session.personId).maybeSingle() : { data: null };

  if (!e || !s) {
    return (
      <>
        <h1 className="text-xl font-semibold text-navy-900">Check-in link not recognised</h1>
        <p className="mt-2 text-sm text-muted">Please scan the code on the presenter&apos;s screen again, or ask an organiser to check you in.</p>
      </>
    );
  }
  return (
    <>
      <h1 className="text-xl font-semibold text-navy-900">{e.title}</h1>
      <p className="mt-1 mb-5 text-sm text-muted">{formatDateTime(e.starts_at)} to {formatTime(e.ends_at)}</p>
      <p className="mb-4 text-sm">Signed in as <strong>{session.displayName}</strong>.</p>
      {reg?.status === "attended" ? (
        <Alert tone="success" title="You're already checked in">Enjoy the session.</Alert>
      ) : !reg || !["confirmed"].includes(reg.status) ? (
        <Alert tone="warning" title="We could not find a confirmed place for you">
          {reg?.status === "waitlisted" ? "You are on the waiting list for this session. " : ""}Please speak to an organiser, who can record your attendance. <Link className="underline" href={`/academy/events/${e.id}`}>View the event</Link>
        </Alert>
      ) : e.status !== "published" ? (
        <Alert tone="warning">Check-in is not available for this event.</Alert>
      ) : (
        <CheckinForm eventId={e.id} secret={s} />
      )}
    </>
  );
}
