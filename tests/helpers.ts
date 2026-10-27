import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { generateSync } from "otplib";
import { readFileSync } from "node:fs";

type Secrets = {
  orgId: string;
  lodges: { id: string; number: number; name: string }[];
  users: Record<string, { email: string; password: string; totpSecret?: string; personId: string; accountId: string }>;
};

export const secrets: Secrets = JSON.parse(readFileSync(".seed-secrets.json", "utf8"));
export const lodge = (n: number) => secrets.lodges.find((l) => l.number === n)!;
export const user = (k: string) => secrets.users[k];

const URL = () => process.env.NEXT_PUBLIC_SUPABASE_URL!;

export function service(): SupabaseClient {
  return createClient(URL(), process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
}

/** Sign in as a seeded user. MFA is completed unless `mfa: false`. */
export async function as(key: string, opts: { mfa?: boolean } = {}): Promise<SupabaseClient> {
  const u = user(key);
  const c = createClient(URL(), process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await c.auth.signInWithPassword({ email: u.email, password: u.password });
  if (error) throw error;
  if (u.totpSecret && opts.mfa !== false) {
    const { data } = await c.auth.mfa.listFactors();
    const f = data!.totp[0];
    const { data: ch, error: e1 } = await c.auth.mfa.challenge({ factorId: f.id });
    if (e1) throw e1;
    let { error: e2 } = await c.auth.mfa.verify({ factorId: f.id, challengeId: ch!.id, code: generateSync({ secret: u.totpSecret }) });
    if (e2) {
      // A TOTP code cannot be used twice: wait for the next 30-second window and retry once.
      await new Promise((r) => setTimeout(r, 30_500 - (Date.now() % 30_000)));
      const { data: ch2 } = await c.auth.mfa.challenge({ factorId: f.id });
      ({ error: e2 } = await c.auth.mfa.verify({ factorId: f.id, challengeId: ch2!.id, code: generateSync({ secret: u.totpSecret }) }));
      if (e2) throw e2;
    }
  }
  return c;
}

export function anon(): SupabaseClient {
  return createClient(URL(), process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
}

export async function count(c: SupabaseClient, table: string, filter?: (q: any) => any, columns = "*"): Promise<number> {
  let q = c.from(table).select(columns, { count: "exact", head: true });
  if (filter) q = filter(q);
  const { count: n, error } = await q;
  if (error) throw new Error(`${table}: ${error.message}`);
  return n ?? 0;
}
