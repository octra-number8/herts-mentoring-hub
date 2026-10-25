import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/server/supabase";
import { getSession, homeFor } from "@/server/session";
import { MfaEnrol, MfaVerify } from "./mfa-forms";

export const metadata: Metadata = { title: "Two-step verification" };

export default async function MfaPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const supabase = await supabaseServer();
  const { data: user } = await supabase.auth.getUser();
  if (!user.user) redirect("/login");
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal?.currentLevel === "aal2") {
    const s = await getSession();
    redirect(s ? homeFor(s) : "/");
  }
  const { data: factors } = await supabase.auth.mfa.listFactors();
  const verified = factors?.totp.find((f) => f.status === "verified");
  return (
    <>
      <h1 className="text-xl font-semibold text-navy-900">Two-step verification</h1>
      {verified ? (
        <>
          <p className="mt-1 mb-6 text-sm text-muted">Enter the 6-digit code from your authenticator app.</p>
          <MfaVerify factorId={verified.id} next={next} />
        </>
      ) : (
        <>
          <p className="mt-1 mb-6 text-sm text-muted">Your role gives access to Provincial records, so a second step is required. Set up an authenticator app such as Microsoft Authenticator, Google Authenticator or 1Password.</p>
          <MfaEnrol next={next} />
        </>
      )}
      <form action="/auth/signout" method="post" className="mt-6"><button className="text-sm text-muted underline underline-offset-2">Sign out</button></form>
    </>
  );
}
