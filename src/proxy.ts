import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PREFIXES = ["/login", "/auth", "/invite", "/join", "/forgot-password", "/reset-password", "/unsubscribe", "/api/webhooks", "/api/cron", "/api/calendar", "/whats-on", "/privacy", "/brand", "/icon.png"];

/**
 * Content Security Policy with a fresh nonce per request (Next.js applies it to
 * its own scripts; every page is dynamically rendered, see the root layout).
 * Styles allow inline attributes because charts and some components set them.
 * Frames are limited to the two video hosts lessons may embed; lesson MP4s may
 * come from any https host (as videoEmbed allows).
 */
export function contentSecurityPolicy(nonce: string, dev = process.env.NODE_ENV === "development", https = !dev) {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self'",
    `connect-src 'self'${dev ? " ws:" : ""}`,
    "frame-src https://www.youtube-nocookie.com https://player.vimeo.com",
    "media-src 'self' blob: https:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(https ? ["upgrade-insecure-requests"] : []),
  ].join("; ");
}

/**
 * Refreshes the Supabase session cookie on every request, sends signed-out
 * visitors to sign in and sets the Content Security Policy. The sign-in check
 * is optimistic only: pages and the database enforce access themselves.
 */
export async function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  // Only ask browsers to upgrade requests when the page itself came over https (not a local `next start`).
  const https = (request.headers.get("x-forwarded-proto") ?? request.nextUrl.protocol.replace(":", "")) === "https";
  const csp = contentSecurityPolicy(nonce, undefined, https);
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);
  const next = () => NextResponse.next({ request: { headers: requestHeaders } });

  let response = next();
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        list.forEach(({ name, value }) => request.cookies.set(name, value));
        requestHeaders.set("cookie", request.cookies.toString());
        response = next();
        list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });
  const { data } = await supabase.auth.getUser();
  const path = request.nextUrl.pathname;
  const isPublic = path === "/" ? false : PUBLIC_PREFIXES.some((p) => path === p || path.startsWith(p + "/") || path.startsWith(p + "?"));
  if (!data.user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = path === "/" ? "" : `?next=${encodeURIComponent(path + request.nextUrl.search)}`;
    response = NextResponse.redirect(url);
  }
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|webp|ico|css|js|woff2?)$).*)"],
};
