import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { serverEnv } from "@/lib/env";
import { enqueueEmail } from "../email/outbox";
import type { DB } from "../supabase";

/**
 * Invitation-only accounts. The raw token exists only in the email link; the
 * database stores its sha256 hex (see acceptInvitation in src/app/(auth)/actions.ts).
 */
export const newInviteToken = () => {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: createHash("sha256").update(token).digest("hex") };
};

const LEARNER_ROLES = ["learner", "personal_mentor", "lodge_mentor", "ld_contributor"];

async function sendInvitationEmail(svc: DB, opts: { orgId: string; invitationId: string; personId: string; email: string; token: string; roles: string[]; message?: string | null }) {
  const [{ data: person }, { data: org }] = await Promise.all([
    svc.from("persons").select("first_name").eq("id", opts.personId).single(),
    svc.from("organisations").select("name, short_name").eq("id", opts.orgId).single(),
  ]);
  const learnerOnly = opts.roles.every((r) => LEARNER_ROLES.includes(r));
  const place = learnerOnly ? "the Herts Mentoring Academy" : `the ${org?.name ?? "Mentoring"} Hub`;
  const link = `${serverEnv().appUrl}/invite/${opts.token}`;
  await enqueueEmail(svc, {
    orgId: opts.orgId, toEmail: opts.email, toPersonId: opts.personId, category: "security", idempotencyKey: `invitation:${opts.invitationId}`,
    subject: learnerOnly ? "Your invitation to the Herts Mentoring Academy" : "Your invitation to the Hertfordshire Mentoring Hub",
    markdown: [
      `Dear ${person?.first_name ?? "Brother"},`,
      `You have been invited to ${place}.${opts.message ? `\n\n${opts.message}` : ""}`,
      `[Accept your invitation and choose a password](${link})`,
      "The link works once and expires in 7 days. If you were not expecting this, you can ignore this email.",
    ].join("\n\n"),
  });
}

export type InviteInput = { personId?: string | null; title?: string | null; firstName?: string | null; lastName?: string | null; email: string; roles: string[]; message?: string | null };

/**
 * Create the person (if new), an 'invited' account with its roles, and the
 * invitation, as the signed-in administrator (`db`, permission-checked in the
 * database). Then queue the invitation email through the outbox (`svc`).
 */
export async function createInvitation(db: DB, svc: DB, input: InviteInput) {
  const { token, hash } = newInviteToken();
  const { data, error } = await db.rpc("admin_create_invitation", {
    p_person: (input.personId ?? null) as string, p_title: (input.title ?? null) as string, p_first: (input.firstName ?? null) as string, p_last: (input.lastName ?? null) as string,
    p_email: input.email.trim().toLowerCase(), p_roles: input.roles, p_token_hash: hash, p_message: input.message ?? undefined,
  });
  if (error) throw error;
  const res = data as { invitation_id: string; person_id: string; account_id: string };
  const { data: inv } = await db.from("invitations").select("org_id").eq("id", res.invitation_id).single();
  await sendInvitationEmail(svc, { orgId: inv!.org_id, invitationId: res.invitation_id, personId: res.person_id, email: input.email.trim().toLowerCase(), token, roles: input.roles, message: input.message });
  return { ...res, token };
}

export async function resendInvitation(db: DB, svc: DB, invitationId: string) {
  const { token, hash } = newInviteToken();
  const { data, error } = await db.rpc("admin_resend_invitation", { p_invitation: invitationId, p_token_hash: hash });
  if (error) throw error;
  const res = data as { invitation_id: string; person_id: string; email: string };
  const { data: inv } = await db.from("invitations").select("org_id, role_keys, message").eq("id", res.invitation_id).single();
  await sendInvitationEmail(svc, { orgId: inv!.org_id, invitationId: res.invitation_id, personId: res.person_id, email: res.email, token, roles: inv!.role_keys, message: inv!.message });
  return { ...res, token };
}
