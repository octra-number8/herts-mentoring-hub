import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Alert, PageHeader } from "@/components/ui/layout";
import { requirePermission } from "@/server/session";
import { supabaseServer } from "@/server/supabase";
import { EventForm } from "../../event-form";

export const metadata: Metadata = { title: "Edit event" };

export default async function EditEventPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission("events.manage");
  const { id } = await params;
  const db = await supabaseServer();
  const [{ data: event }, { data: joining }, { data: centres }, { data: courses }] = await Promise.all([
    db.from("events").select("*").eq("id", id).maybeSingle(),
    db.from("event_joining_details").select("online_url, instructions").eq("event_id", id).maybeSingle(),
    db.from("meeting_centres").select("id, name").order("name"),
    db.from("courses").select("id, title").is("archived_at", null).order("title"),
  ]);
  if (!event) notFound();
  return (
    <>
      <PageHeader breadcrumbs={[{ href: "/events", label: "Events" }, { href: `/events/${id}`, label: event.title }]} title="Edit event" />
      <div className="max-w-3xl space-y-4">
        {event.status !== "draft" && (
          <Alert tone="info">This event is {event.status === "published" ? "published" : event.status}. Changes are visible straight away. People already booked are not emailed about edits, so tell them directly about anything important.</Alert>
        )}
        <EventForm event={event} joining={joining} centres={centres ?? []} courses={courses ?? []} />
      </div>
    </>
  );
}
