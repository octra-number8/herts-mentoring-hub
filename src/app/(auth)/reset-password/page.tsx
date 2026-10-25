import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ActionForm, SubmitButton, TextField } from "@/components/ui/form";
import { supabaseServer } from "@/server/supabase";
import { updatePassword } from "../actions";

export const metadata: Metadata = { title: "Choose a new password" };

export default async function ResetPasswordPage() {
  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login?error=link");
  return (
    <>
      <h1 className="text-xl font-semibold text-navy-900">Choose a new password</h1>
      <p className="mt-1 mb-6 text-sm text-muted">At least 12 characters, with letters and a number or symbol.</p>
      <ActionForm action={updatePassword}>
        <TextField label="New password" name="password" type="password" autoComplete="new-password" required />
        <TextField label="Confirm new password" name="confirm" type="password" autoComplete="new-password" required />
        <SubmitButton className="w-full">Save password</SubmitButton>
      </ActionForm>
    </>
  );
}
