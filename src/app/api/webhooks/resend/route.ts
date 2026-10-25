import { NextResponse, type NextRequest } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { serverEnv } from "@/lib/env";
import { supabaseService } from "@/server/supabase";

/** Verify a Svix-signed webhook (the scheme Resend uses). */
function verify(payload: string, headers: Headers, secret: string): boolean {
  const id = headers.get("svix-id"), ts = headers.get("svix-timestamp"), sig = headers.get("svix-signature");
  if (!id || !ts || !sig) return false;
  if (Math.abs(Date.now() / 1000 - Number(ts)) > 300) return false;
  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const expected = createHmac("sha256", key).update(`${id}.${ts}.${payload}`).digest();
  return sig.split(" ").some((part) => {
    const [, value] = part.split(",");
    if (!value) return false;
    const given = Buffer.from(value, "base64");
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
}

type ResendEvent = { type: string; created_at: string; data: { email_id: string; to?: string[]; bounce?: { type?: string }; click?: { link?: string } } };

/**
 * Delivery events from Resend. Opens are recorded as "opened where measurable";
 * they are never treated as proof that a message was read.
 */
export async function POST(request: NextRequest) {
  const secret = serverEnv().resendWebhookSecret;
  const payload = await request.text();
  if (!secret || !verify(payload, request.headers, secret)) return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  const ev = JSON.parse(payload) as ResendEvent;
  const db = supabaseService();
  const { error: dup } = await db.from("email_delivery_events").insert({ provider_event_id: request.headers.get("svix-id"), provider_message_id: ev.data.email_id, type: ev.type, payload: ev as never });
  if (dup?.code === "23505") return NextResponse.json({ ok: true, duplicate: true });

  const { data: rec } = await db.from("campaign_recipients").select("id, person_id, open_count, click_count, first_opened_at, first_clicked_at").eq("provider_message_id", ev.data.email_id).maybeSingle();
  const { data: out } = await db.from("email_outbox").select("to_person_id").eq("provider_message_id", ev.data.email_id).maybeSingle();
  const personId = rec?.person_id ?? out?.to_person_id ?? null;
  const at = ev.created_at ?? new Date().toISOString();
  switch (ev.type) {
    case "email.delivered":
      if (rec) await db.from("campaign_recipients").update({ status: "delivered", delivered_at: at }).eq("id", rec.id);
      break;
    case "email.bounced":
      if (rec) await db.from("campaign_recipients").update({ status: "bounced", error: ev.data.bounce?.type ?? "Bounced" }).eq("id", rec.id);
      if (personId && ev.data.bounce?.type !== "Transient") await db.from("comm_preferences").update({ email_status: "bounced", email_status_at: at }).eq("person_id", personId);
      break;
    case "email.complained":
      if (rec) await db.from("campaign_recipients").update({ status: "complained" }).eq("id", rec.id);
      if (personId) await db.from("comm_preferences").update({ email_status: "complained", email_status_at: at, news: false }).eq("person_id", personId);
      break;
    case "email.opened":
      if (rec) await db.from("campaign_recipients").update({ open_count: rec.open_count + 1, first_opened_at: rec.first_opened_at ?? at }).eq("id", rec.id);
      break;
    case "email.clicked":
      if (rec) await db.from("campaign_recipients").update({ click_count: rec.click_count + 1, first_clicked_at: rec.first_clicked_at ?? at }).eq("id", rec.id);
      break;
  }
  await db.from("email_delivery_events").update({ processed_at: new Date().toISOString() }).eq("provider_event_id", request.headers.get("svix-id")!);
  return NextResponse.json({ ok: true });
}
