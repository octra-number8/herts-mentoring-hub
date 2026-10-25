import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/layout";
import { LinkButton } from "@/components/ui/button";
import { formatDateTime } from "@/lib/utils";
import { can, requirePermission } from "@/server/session";
import { supabaseServer } from "@/server/supabase";
import { Scanner } from "./scanner";

export const metadata: Metadata = { title: "Scan check-in codes" };

export default async function ScanPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requirePermission("events.manage", "events.checkin");
  const { id } = await params;
  const db = await supabaseServer();
  const [{ data: event }, { data: trainers }] = await Promise.all([
    db.from("events").select("id, title, starts_at, registration_mode").eq("id", id).maybeSingle(),
    db.from("event_trainers").select("person_id").eq("event_id", id),
  ]);
  if (!event) notFound();
  if (!can(session, "events.manage") && !(trainers ?? []).some((t) => t.person_id === session.personId)) notFound();
  return (
    <>
      <PageHeader breadcrumbs={[{ href: "/events", label: "Events" }, { href: `/events/${id}?tab=checkin`, label: event.title }]}
        title="Scan personal codes" description={`${event.title} · ${formatDateTime(event.starts_at)}. Each attendee's code is on their booking page in the Academy.`}
        actions={<LinkButton href={`/events/${id}?tab=registrations`}>Registrations</LinkButton>} />
      {event.registration_mode === "hub" ? <Scanner eventId={id} /> : <p className="text-muted">This event does not take registrations in the Hub.</p>}
    </>
  );
}
