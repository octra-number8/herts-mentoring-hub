import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm, SubmitButton, TextField } from "@/components/ui/form";
import { requestJoin } from "../actions";

export const metadata: Metadata = { title: "Set up your account" };

export default function JoinPage() {
  return (
    <>
      <h1 className="text-xl font-semibold text-navy-900">Set up your account</h1>
      <p className="mt-1 text-sm text-muted">Every member of a Hertfordshire Lodge can use the Herts Mentoring Academy.</p>
      <p className="mt-2 mb-6 text-sm text-muted">Enter the email address your Lodge holds for you. We will email you a link to choose your password.</p>
      <ActionForm action={requestJoin}>
        <TextField label="Email address" name="email" type="email" autoComplete="email" required />
        <SubmitButton className="w-full" pendingText="Sending…">Email me a link</SubmitButton>
      </ActionForm>
      <p className="mt-6 text-sm">Already have an account? <Link href="/login" className="text-navy-700 underline underline-offset-2">Sign in</Link></p>
    </>
  );
}
