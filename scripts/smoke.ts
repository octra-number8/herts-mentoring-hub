/**
 * Smoke-test pages over HTTP as a seeded test user (MFA completed).
 *
 *   npx tsx scripts/smoke.ts <userKey> <path> [path...]
 *   npx tsx scripts/smoke.ts learner1 /academy /dashboard=404
 *
 * Append =<status> to expect a status other than 200. Reports the status, the
 * page <title> and any server error text. Exits 1 if an expectation fails.
 * Needs the dev server on APP_URL (default http://localhost:3100).
 */
import { createServerClient } from "@supabase/ssr";
import { generateSync } from "otplib";
import { readFileSync } from "node:fs";
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });

const secrets = JSON.parse(readFileSync(".seed-secrets.json", "utf8"));
const APP = (process.env.APP_URL ?? "http://localhost:3100").replace(/\/$/, "");

export async function cookieFor(key: string): Promise<string> {
  const user = secrets.users[key];
  if (!user) throw new Error(`Unknown test user "${key}"`);
  const jar = new Map<string, string>();
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => [...jar].map(([name, value]) => ({ name, value })),
      setAll: (list) => list.forEach(({ name, value }) => (value ? jar.set(name, value) : jar.delete(name))),
    },
  });
  const { error } = await supabase.auth.signInWithPassword({ email: user.email, password: user.password });
  if (error) throw error;
  if (user.totpSecret) {
    const { data } = await supabase.auth.mfa.listFactors();
    const f = data!.totp[0];
    const { data: ch } = await supabase.auth.mfa.challenge({ factorId: f.id });
    let { error: e } = await supabase.auth.mfa.verify({ factorId: f.id, challengeId: ch!.id, code: generateSync({ secret: user.totpSecret }) });
    if (e) {
      // Codes are single-use: wait for the next window and retry once.
      await new Promise((r) => setTimeout(r, 30_500 - (Date.now() % 30_000)));
      const { data: ch2 } = await supabase.auth.mfa.challenge({ factorId: f.id });
      ({ error: e } = await supabase.auth.mfa.verify({ factorId: f.id, challengeId: ch2!.id, code: generateSync({ secret: user.totpSecret }) }));
      if (e) throw e;
    }
  }
  return [...jar].map(([n, v]) => `${n}=${v}`).join("; ");
}

async function main() {
  const [key, ...paths] = process.argv.slice(2);
  if (!key || !paths.length) {
    console.error("Usage: npx tsx scripts/smoke.ts <userKey> <path[=status]> ...");
    process.exit(2);
  }
  const cookie = await cookieFor(key);
  let failed = 0;
  for (const spec of paths) {
    const m = spec.match(/^(.*?)(?:=(\d{3}))?$/)!;
    const path = m[1], want = m[2] ?? "200";
    const res = await fetch(APP + path, { headers: { cookie }, redirect: "manual" });
    const body = res.status < 300 ? await res.text() : "";
    const title = body.match(/<title>([^<]*)<\/title>/)?.[1] ?? "";
    const err = body.match(/(Application error[^<]*|Unhandled Runtime Error[^<]*|digest&quot;:&quot;[^&]*|Error: [^<]{0,160})/)?.[1];
    const location = res.headers.get("location");
    const ok = String(res.status) === want && !err;
    if (!ok) failed++;
    console.log(`${ok ? "ok  " : "FAIL"} ${res.status} ${path}${location ? ` -> ${location}` : ""} ${title ? `"${title}"` : ""}${err ? `  ERROR: ${err}` : ""}`);
  }
  process.exit(failed ? 1 : 0);
}

if (process.argv[1]?.endsWith("smoke.ts")) main().catch((e) => { console.error(e); process.exit(1); });
