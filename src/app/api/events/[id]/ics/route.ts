import { NextResponse, type NextRequest } from "next/server";
import { serverEnv } from "@/lib/env";
import { buildIcs, icsFileName } from "@/server/events/ics";
import { getSession, isManagementUser } from "@/server/session";
import { supabaseServer } from "@/server/supabase";

/** Single-event calendar file. Read as the user, so RLS decides whether the event exists for them. */
export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Please sign in" }, { status: 401 });
  if (session.mfaRequired && session.aal !== "aal2") return NextResponse.json({ error: "Two-step verification required" }, { status: 401 });
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const db = await supabaseServer();
  const { data: e } = await db.from("events").select("id, title, description, starts_at, ends_at, location, status, updated_at, meeting_centres(name)").eq("id", id).maybeSingle();
  if (!e || e.status === "draft") return NextResponse.json({ error: "Not found" }, { status: 404 });
  const centre = (e.meeting_centres as unknown as { name: string } | null)?.name;
  const link = `${serverEnv().appUrl}${isManagementUser(session) ? `/events/${e.id}` : `/academy/events/${e.id}`}`;
  const body = buildIcs([{ id: e.id, title: e.title, description: `${e.description ? `${e.description}\n\n` : ""}${link}`, starts_at: e.starts_at, ends_at: e.ends_at,
    location: [e.location, centre].filter(Boolean).join(", ") || null, status: e.status, url: link, updated_at: e.updated_at }]);
  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${icsFileName(e.title)}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
