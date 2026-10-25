import { NextResponse, type NextRequest } from "next/server";
import { serverEnv } from "@/lib/env";
import { hashFeedToken, tokenFromPath } from "@/server/events/feed-tokens";
import { buildIcs } from "@/server/events/ics";
import { supabaseService } from "@/server/supabase";

/**
 * Private calendar subscription feed. The token in the URL is hashed and looked up;
 * calendar_feed_events (service role only) evaluates visibility as the token's owner.
 * Joining details are never included.
 */
export async function GET(_: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token: raw } = await params;
  const token = tokenFromPath(raw);
  const notFound = () => new NextResponse("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
  if (!token) return notFound();
  const hash = hashFeedToken(token);
  const db = supabaseService();
  const { data: t } = await db.from("calendar_feed_tokens").select("id, label").eq("token_hash", hash).is("revoked_at", null).maybeSingle();
  if (!t) return notFound();
  const { data: events, error } = await db.rpc("calendar_feed_events", { p_token_hash: hash });
  if (error) return new NextResponse("Calendar unavailable", { status: 503 });
  const app = serverEnv().appUrl;
  const body = buildIcs((events ?? []).map((e) => ({ ...e, url: `${app}/academy/events/${e.id}` })), { calendarName: `Mentoring Hub: ${t.label}` });
  return new NextResponse(body, {
    headers: { "Content-Type": "text/calendar; charset=utf-8", "Cache-Control": "private, max-age=300", "X-Robots-Tag": "noindex" },
  });
}
