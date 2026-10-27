import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { supabaseServer } from "@/server/supabase";
import { safeInternalPath } from "@/lib/safe-redirect";

/** Verifies token-hash links (used when email templates link directly to the app). */
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;
  const next = url.searchParams.get("next");
  const safe = safeInternalPath(next) ?? "/";
  if (tokenHash && type) {
    const supabase = await supabaseServer();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) return NextResponse.redirect(new URL(type === "recovery" ? "/reset-password" : safe, url.origin));
  }
  return NextResponse.redirect(new URL("/login?error=link", url.origin));
}
