import type { Metadata } from "next";
import Link from "next/link";
import { LoginForms } from "./login-forms";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next, error } = await searchParams;
  return (
    <>
      <h1 className="text-xl font-semibold text-navy-900">Sign in to the Mentoring Hub</h1>
      <p className="mt-1 text-sm text-muted">First time here? <Link href="/join" className="text-navy-700 underline underline-offset-2">Set up your account</Link> with the email address your Lodge holds for you.</p>
      {error && <p role="alert" className="mt-4 rounded-md bg-danger-50 px-3 py-2 text-sm text-danger-700">{error === "link" ? "That sign-in link has expired or was already used. Please request a new one." : "We could not sign you in. Please try again."}</p>}
      <LoginForms next={next} />
      <p className="mt-6 text-sm"><Link href="/forgot-password" className="text-navy-700 underline underline-offset-2">Forgotten your password?</Link></p>
    </>
  );
}
