import type { Metadata } from "next";
import Link from "next/link";
import { supabaseService } from "@/server/supabase";
import { UnsubscribeForm } from "./unsubscribe-form";

export const metadata: Metadata = { title: "Email preferences" };

/** Public page from the link in every non-essential email. Shows no personal details. */
export default async function UnsubscribePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const valid = /^[0-9a-f]{20,80}$/i.test(token);
  const { data } = valid ? await supabaseService().from("comm_preferences").select("person_id").eq("unsubscribe_token", token).maybeSingle() : { data: null };
  if (!data) {
    return (
      <>
        <h1 className="text-xl font-semibold text-navy-900">This link is not valid</h1>
        <p className="mt-2 text-sm text-muted">It may have been copied incompletely. You can also <Link href="/login?next=/account/notifications" className="underline">sign in</Link> and change your email preferences under My account.</p>
      </>
    );
  }
  return (
    <>
      <h1 className="text-xl font-semibold text-navy-900">Email preferences</h1>
      <p className="mt-1 mb-6 text-sm text-muted">Choose which emails you would like to stop. You do not need to sign in.</p>
      <UnsubscribeForm token={token} />
    </>
  );
}
