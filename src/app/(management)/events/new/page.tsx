import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/layout";
import { requirePermission } from "@/server/session";
import { supabaseServer } from "@/server/supabase";
import { EventForm } from "../event-form";

export const metadata: Metadata = { title: "New event" };

export default async function NewEventPage() {
  await requirePermission("events.manage");
  const db = await supabaseServer();
  const [{ data: centres }, { data: courses }] = await Promise.all([
    db.from("meeting_centres").select("id, name").order("name"),
    db.from("courses").select("id, title").is("archived_at", null).order("title"),
  ]);
  return (
    <>
      <PageHeader breadcrumbs={[{ href: "/events", label: "Events" }]} title="New event"
        description="Events are saved as drafts. Nobody else sees them until you publish." />
      <div className="max-w-3xl"><EventForm centres={centres ?? []} courses={courses ?? []} /></div>
    </>
  );
}
