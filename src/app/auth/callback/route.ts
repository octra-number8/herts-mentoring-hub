import { NextResponse, type NextRequest } from "next/server";
import { supabaseServer } from "@/server/supabase";
import { safeInternalPath } from "@/lib/safe-redirect";

/** Completes email-link sign-in and password recovery (PKCE code exchange). */
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next");
  const safe = safeInternalPath(next) ?? "/";
  if (code) {
    const supabase = await supabaseServer();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      await supabase.rpc("record_sign_in");
      return NextResponse.redirect(new URL(safe, url.origin));
    }
  }
  return NextResponse.redirect(new URL("/login?error=link", url.origin));
}
