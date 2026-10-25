import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm, SubmitButton, TextField } from "@/components/ui/form";
import { requestPasswordReset } from "../actions";

export const metadata: Metadata = { title: "Reset password" };

export default function ForgotPasswordPage() {
  return (
    <>
      <h1 className="text-xl font-semibold text-navy-900">Reset your password</h1>
      <p className="mt-1 mb-6 text-sm text-muted">We will email you a link to choose a new password.</p>
      <ActionForm action={requestPasswordReset}>
        <TextField label="Email address" name="email" type="email" autoComplete="email" required />
        <SubmitButton className="w-full" pendingText="Sending…">Send reset link</SubmitButton>
      </ActionForm>
      <p className="mt-6 text-sm"><Link href="/login" className="text-navy-700 underline underline-offset-2">Back to sign in</Link></p>
    </>
  );
}
