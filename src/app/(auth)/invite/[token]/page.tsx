import type { Metadata } from "next";
import { ActionForm, CheckboxField, SubmitButton, TextField } from "@/components/ui/form";
import { supabaseService } from "@/server/supabase";
import { acceptInvitation, hashToken } from "../../actions";

export const metadata: Metadata = { title: "Accept invitation" };

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const svc = supabaseService();
  const { data: inv } = await svc.from("invitations").select("email, expires_at, accepted_at, revoked_at, role_keys, persons(first_name), organisations(short_name)").eq("token_hash", await hashToken(token)).maybeSingle();
  const valid = inv && !inv.accepted_at && !inv.revoked_at && new Date(inv.expires_at) > new Date();
  if (!valid) {
    return (
      <>
        <h1 className="text-xl font-semibold text-navy-900">This invitation cannot be used</h1>
        <p className="mt-2 text-sm text-slate-ink">It may have expired, been used already or been withdrawn. Please ask the Provincial Mentoring Team to send a new one.</p>
      </>
    );
  }
  const learnerOnly = inv.role_keys.every((r: string) => ["learner", "personal_mentor", "lodge_mentor", "ld_contributor"].includes(r));
  const person = inv.persons as unknown as { first_name: string } | null;
  return (
    <>
      <h1 className="text-xl font-semibold text-navy-900">Welcome, {person?.first_name}</h1>
      <p className="mt-1 mb-6 text-sm text-muted">
        {learnerOnly ? "You have been invited to the Herts Mentoring Academy." : "You have been invited to the Hertfordshire Mentoring Hub."} Choose a password to activate your account for <strong className="text-ink">{inv.email}</strong>.
      </p>
      <ActionForm action={acceptInvitation}>
        <input type="hidden" name="token" value={token} />
        <TextField label="Password" name="password" type="password" autoComplete="new-password" required hint="At least 12 characters, with letters and a number or symbol." />
        <TextField label="Confirm password" name="confirm" type="password" autoComplete="new-password" required />
        <CheckboxField name="agree" label="I understand how the Hub uses my information"
          hint="The Hub keeps only what mentoring and learning need: your name, contact details, Lodge and learning record. Your learning record is visible to you and to authorised Provincial administrators." />
        <SubmitButton className="w-full" pendingText="Activating…">Activate my account</SubmitButton>
      </ActionForm>
    </>
  );
}
