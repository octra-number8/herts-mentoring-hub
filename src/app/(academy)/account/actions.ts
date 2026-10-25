"use server";

import { z } from "zod";
import type { ActionState } from "@/lib/action-state";
import { serverEnv } from "@/lib/env";
import { check, defineAction, UserError, zf } from "@/server/action";
import { CHANNELS, NOTIFICATION_TYPES } from "@/server/comms/notification-types";
import { newFeedToken } from "@/server/events/feed-tokens";
import { getSession } from "@/server/session";
import { supabaseServer } from "@/server/supabase";

export const requestContactChange = defineAction(z.object({ details: zf.required("Details", 2000) }), async (i, { db }) => {
  check(await db.rpc("account_request_contact_change", { p_details: i.details }));
  return { message: "Thank you. Your request has gone to the Provincial team, who will update your record.", revalidate: ["/account"] };
});

const password = z.string().min(12, "Use at least 12 characters").max(128)
  .refine((p) => /[a-zA-Z]/.test(p) && /[0-9\W]/.test(p), "Include letters and at least one number or symbol");

export const changePassword = defineAction(z.object({ password, confirm: z.string() }), async (i, { db }) => {
  if (i.password !== i.confirm) throw new UserError("The passwords do not match.");
  const { error } = await db.auth.updateUser({ password: i.password });
  if (error) {
    if (error.message.toLowerCase().includes("aal2")) throw new UserError("Please complete two-step verification first.");
    if (error.message.toLowerCase().includes("different")) throw new UserError("Choose a password you have not used for this account before.");
    if (error.message.toLowerCase().includes("reauthentication")) throw new UserError("For your security, please sign out and use Forgot password to set a new one.");
    throw new UserError("We could not change your password. Please try again.");
  }
  return { message: "Your password has been changed." };
});

export const createFeedToken = defineAction(z.object({ label: zf.required("Name", 60) }), async (i, { db, session }) => {
  const { count } = await db.from("calendar_feed_tokens").select("id", { count: "exact", head: true }).is("revoked_at", null);
  if ((count ?? 0) >= 5) throw new UserError("You can have up to five calendar links. Revoke one you no longer use first.");
  const { token, hash } = newFeedToken();
  check(await db.from("calendar_feed_tokens").insert({ org_id: session.orgId, account_id: session.accountId, token_hash: hash, label: i.label }));
  const url = `${serverEnv().appUrl}/api/calendar/${token}.ics`;
  return { message: "Calendar link created. Copy it now: for your security it will not be shown again.", data: { url }, revalidate: ["/account"] };
});

export const revokeFeedToken = defineAction(z.object({ id: zf.uuid() }), async (i, { db }) => {
  const res = await db.from("calendar_feed_tokens").update({ revoked_at: new Date().toISOString() }).eq("id", i.id).is("revoked_at", null).select("id");
  if (!check(res).length) throw new UserError("That link was not found or is already revoked.");
  return { message: "Link revoked. Calendars using it will stop updating.", revalidate: ["/account"] };
});

// ----- Two-step verification (re-enrol) -----------------------------------------------
export async function beginMfaEnrol(): Promise<{ factorId: string; qr: string; secret: string } | { error: string }> {
  const session = await getSession();
  if (!session) return { error: "Please sign in again." };
  if (session.mfaRequired && session.aal !== "aal2") return { error: "Please complete two-step verification first." };
  const db = await supabaseServer();
  const { data: factors } = await db.auth.mfa.listFactors();
  for (const f of factors?.all ?? []) if (f.status === "unverified") await db.auth.mfa.unenroll({ factorId: f.id });
  const { data, error } = await db.auth.mfa.enroll({ factorType: "totp", friendlyName: `Authenticator ${new Date().toISOString().slice(0, 19)}` });
  if (error || !data) return { error: "We could not start set-up. Please try again." };
  return { factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret };
}

export async function finishMfaEnrol(_: ActionState, fd: FormData): Promise<ActionState> {
  const code = String(fd.get("code") ?? "").replace(/\s/g, "");
  const factorId = String(fd.get("factorId") ?? "");
  if (!/^\d{6}$/.test(code)) return { error: "Enter the 6-digit code from your authenticator app.", fieldErrors: { code: "Enter the 6-digit code" } };
  const db = await supabaseServer();
  const { data: ch, error: e1 } = await db.auth.mfa.challenge({ factorId });
  if (e1 || !ch) return { error: "We could not verify the code. Please start again." };
  const { error } = await db.auth.mfa.verify({ factorId, challengeId: ch.id, code });
  if (error) return { error: "That code is not correct or has expired. Codes change every 30 seconds." };
  // The new authenticator works, so retire the old ones.
  const { data: factors } = await db.auth.mfa.listFactors();
  for (const f of factors?.totp ?? []) if (f.id !== factorId && f.status === "verified") await db.auth.mfa.unenroll({ factorId: f.id });
  return { ok: true, message: "Your new authenticator is set up. Codes from your old one no longer work.", nonce: Date.now() };
}

// ----- Notification and email preferences -----------------------------------------------
const channelValues = CHANNELS.map((c) => c.value) as [string, ...string[]];

export const saveNotificationPreferences = defineAction(z.record(z.string(), z.unknown()), async (input, { db, session }) => {
  const rows: { account_id: string; type: string; channel: string }[] = [];
  for (const t of NOTIFICATION_TYPES) {
    const v = input[`pref_${t.type}`];
    if (typeof v !== "string" || !channelValues.includes(v)) continue;
    rows.push({ account_id: session.accountId, type: t.type, channel: t.essential && v === "off" ? "daily" : v });
  }
  if (rows.length) check(await db.from("notification_preferences").upsert(rows));
  return { message: "Notification settings saved.", revalidate: ["/account/notifications"] };
});

export const saveEmailPreferences = defineAction(z.object({
  learning: zf.checkbox(), events: zf.checkbox(), news: zf.checkbox(), unsubscribe_all: zf.checkbox(),
}), async (i, { db, session }) => {
  const patch = {
    learning: i.learning, events: i.events, news: i.news,
    unsubscribed_all_at: i.unsubscribe_all ? new Date().toISOString() : null, updated_at: new Date().toISOString(),
  };
  const res = await db.from("comm_preferences").update(patch).eq("person_id", session.personId).select("person_id");
  if (!check(res).length) throw new UserError("Your email preferences could not be found. Please contact the Provincial office.");
  return { message: i.unsubscribe_all ? "You will now only receive essential emails about your account and role." : "Email preferences saved.", revalidate: ["/account/notifications"] };
});
