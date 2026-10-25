"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createHash } from "node:crypto";
import type { ActionState } from "@/lib/action-state";
import { serverEnv } from "@/lib/env";
import { supabaseServer, supabaseService } from "@/server/supabase";
import { getSession, homeFor } from "@/server/session";

const safeNext = (n: unknown) => (typeof n === "string" && n.startsWith("/") && !n.startsWith("//") ? n : null);

export async function signInWithPassword(_: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = z.object({ email: z.string().email("Enter your email address"), password: z.string().min(1, "Enter your password") })
    .safeParse({ email: fd.get("email"), password: fd.get("password") });
  if (!parsed.success) return { error: "Enter your email address and password.", fieldErrors: Object.fromEntries(parsed.error.issues.map((i) => [i.path[0], i.message])) };
  const supabase = await supabaseServer();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return { error: error.status === 429 ? "Too many attempts. Please wait a few minutes and try again." : "That email and password do not match our records." };
  await supabase.rpc("record_sign_in");
  const session = await getSession();
  if (!session) {
    await supabase.auth.signOut({ scope: "local" });
    return { error: "This account is not active. Please contact the Provincial Mentoring Team." };
  }
  const next = safeNext(fd.get("next"));
  if (session.mfaRequired && session.aal !== "aal2") redirect(`/mfa${next ? `?next=${encodeURIComponent(next)}` : ""}`);
  redirect(next ?? homeFor(session));
}

export async function sendMagicLink(_: ActionState, fd: FormData): Promise<ActionState> {
  const email = z.string().email().safeParse(fd.get("email"));
  if (!email.success) return { error: "Enter your email address.", fieldErrors: { email: "Enter your email address" } };
  const supabase = await supabaseServer();
  const next = safeNext(fd.get("next")) ?? "/";
  const { error } = await supabase.auth.signInWithOtp({
    email: email.data,
    options: { shouldCreateUser: false, emailRedirectTo: `${serverEnv().appUrl}/auth/callback?next=${encodeURIComponent(next)}` },
  });
  // Same response whether or not the address exists, to avoid revealing accounts.
  if (error && error.status === 429) return { error: "Too many requests. Please wait a few minutes and try again." };
  return { ok: true, message: "If that address belongs to a Hub account, a sign-in link is on its way. It expires in one hour." };
}

export async function requestPasswordReset(_: ActionState, fd: FormData): Promise<ActionState> {
  const email = z.string().email().safeParse(fd.get("email"));
  if (!email.success) return { error: "Enter your email address.", fieldErrors: { email: "Enter your email address" } };
  const supabase = await supabaseServer();
  await supabase.auth.resetPasswordForEmail(email.data, { redirectTo: `${serverEnv().appUrl}/auth/callback?next=/reset-password` });
  return { ok: true, message: "If that address belongs to a Hub account, we have sent a link to reset the password." };
}

const passwordSchema = z.string().min(12, "Use at least 12 characters").max(128)
  .refine((p) => /[a-zA-Z]/.test(p) && /[0-9\W]/.test(p), "Include letters and at least one number or symbol");

export async function updatePassword(_: ActionState, fd: FormData): Promise<ActionState> {
  const p = passwordSchema.safeParse(fd.get("password"));
  if (!p.success) return { error: p.error.issues[0].message, fieldErrors: { password: p.error.issues[0].message } };
  if (fd.get("password") !== fd.get("confirm")) return { error: "The passwords do not match.", fieldErrors: { confirm: "The passwords do not match" } };
  const supabase = await supabaseServer();
  const { error } = await supabase.auth.updateUser({ password: p.data });
  if (error) return { error: error.message.includes("aal2") ? "Please complete two-step verification first." : "We could not update the password. The link may have expired." };
  const session = await getSession();
  redirect(session ? homeFor(session) : "/login");
}

// ----- MFA -----------------------------------------------------------------------
export async function startMfaEnrolment(): Promise<{ factorId: string; qr: string; secret: string } | { error: string }> {
  const supabase = await supabaseServer();
  const { data: factors } = await supabase.auth.mfa.listFactors();
  for (const f of factors?.all ?? []) if (f.status === "unverified") await supabase.auth.mfa.unenroll({ factorId: f.id });
  const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: `Authenticator ${new Date().toISOString().slice(0, 10)}` });
  if (error || !data) return { error: "We could not start set-up. Please refresh and try again." };
  return { factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret };
}

export async function verifyMfa(_: ActionState, fd: FormData): Promise<ActionState> {
  const code = String(fd.get("code") ?? "").replace(/\s/g, "");
  const factorId = String(fd.get("factorId") ?? "");
  if (!/^\d{6}$/.test(code)) return { error: "Enter the 6-digit code from your authenticator app.", fieldErrors: { code: "Enter the 6-digit code" } };
  const supabase = await supabaseServer();
  const { data: ch, error: e1 } = await supabase.auth.mfa.challenge({ factorId });
  if (e1 || !ch) return { error: "We could not verify the code. Please try again." };
  const { error } = await supabase.auth.mfa.verify({ factorId, challengeId: ch.id, code });
  if (error) return { error: "That code is not correct or has expired. Codes change every 30 seconds." };
  await supabase.rpc("record_sign_in");
  const session = await getSession();
  redirect(safeNext(fd.get("next")) ?? (session ? homeFor(session) : "/"));
}

// ----- Invitations -------------------------------------------------------------------
export const hashToken = async (t: string) => createHash("sha256").update(t).digest("hex");

export async function acceptInvitation(_: ActionState, fd: FormData): Promise<ActionState> {
  const token = String(fd.get("token") ?? "");
  const p = passwordSchema.safeParse(fd.get("password"));
  if (!p.success) return { error: p.error.issues[0].message, fieldErrors: { password: p.error.issues[0].message } };
  if (fd.get("password") !== fd.get("confirm")) return { error: "The passwords do not match.", fieldErrors: { confirm: "The passwords do not match" } };
  if (fd.get("agree") !== "on") return { error: "Please confirm you have read how the Hub uses your information.", fieldErrors: { agree: "Required" } };

  const svc = supabaseService();
  const { data: inv } = await svc.from("invitations").select("*").eq("token_hash", await hashToken(token)).maybeSingle();
  if (!inv || inv.revoked_at || inv.accepted_at || new Date(inv.expires_at) < new Date()) {
    return { error: "This invitation is no longer valid. Please ask the Provincial Mentoring Team for a new one." };
  }
  const { data: account } = await svc.from("user_accounts").select("id, auth_user_id, status").eq("person_id", inv.person_id).maybeSingle();
  if (!account || account.status !== "invited") return { error: "This invitation has already been used." };

  const { data: created, error: createErr } = await svc.auth.admin.createUser({ email: inv.email, password: p.data, email_confirm: true });
  if (createErr || !created.user) {
    return { error: createErr?.message?.includes("already") ? "An account already exists for this email address. Please sign in instead." : "We could not create your account. Please try again." };
  }
  await svc.from("user_accounts").update({ auth_user_id: created.user.id, status: "active" }).eq("id", account.id);
  await svc.from("invitations").update({ accepted_at: new Date().toISOString() }).eq("id", inv.id);
  await svc.rpc("admin_record_audit", { p_org: inv.org_id, p_action: "invitation.accepted", p_entity_type: "invitation", p_entity_id: inv.id, p_details: {} });

  const supabase = await supabaseServer();
  await supabase.auth.signInWithPassword({ email: inv.email, password: p.data });
  const session = await getSession();
  if (session?.mfaRequired) redirect("/mfa");
  redirect(session ? homeFor(session) : "/login");
}
