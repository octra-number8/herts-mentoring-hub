/**
 * Creates the first Provincial Grand Mentor invitation for a new organisation.
 * Everyone else is invited from Administration → Users.
 *
 *   ENV_FILE=.env.production npx tsx scripts/create-first-admin.ts --org herts --first Mark --last Smith --email someone@example.org [--title "W Bro"] [--role deputy_prov_grand_mentor]
 *
 * Prints a one-time invitation link (valid 7 days). Nothing is emailed.
 */
import { createClient } from "@supabase/supabase-js";
import { createHash, randomBytes } from "node:crypto";
import { config } from "dotenv";

config({ path: process.env.ENV_FILE ?? ".env.local", quiet: true });

const arg = (k: string) => {
  const i = process.argv.indexOf(`--${k}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};

async function main() {
  const [slug, first, last, email, title] = [arg("org"), arg("first"), arg("last"), arg("email"), arg("title")];
  const roleKey = arg("role") ?? "prov_grand_mentor";
  if (!slug || !first || !last || !email) throw new Error("Required: --org --first --last --email");
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const { data: org } = await db.from("organisations").select("id").eq("slug", slug).single();
  if (!org) throw new Error(`Organisation "${slug}" not found`);
  const { data: role } = await db.from("roles").select("id").eq("org_id", org.id).eq("key", roleKey).single();
  if (!role) throw new Error(`Role "${roleKey}" not found (or roles not bootstrapped)`);

  const { data: person, error: e1 } = await db.from("persons").insert({ org_id: org.id, title: title ?? null, first_name: first, last_name: last, email, source: "invitation" }).select("id").single();
  if (e1) throw e1;
  await db.from("comm_preferences").insert({ person_id: person.id, org_id: org.id });
  const { data: account, error: e2 } = await db.from("user_accounts").insert({ org_id: org.id, person_id: person.id, status: "invited" }).select("id").single();
  if (e2) throw e2;
  await db.from("role_assignments").insert({ org_id: org.id, account_id: account.id, role_id: role.id, reason: "First administrator (bootstrap)" });
  const token = randomBytes(32).toString("base64url");
  await db.from("invitations").insert({ org_id: org.id, person_id: person.id, email, role_keys: [roleKey],
    token_hash: createHash("sha256").update(token).digest("hex"), expires_at: new Date(Date.now() + 7 * 86400000).toISOString() });
  await db.rpc("admin_record_audit", { p_org: org.id, p_action: "bootstrap.first_admin", p_entity_type: "user_account", p_entity_id: account.id, p_details: {} });
  console.log(`Invitation link (valid 7 days, use once):\n${(process.env.APP_URL ?? "http://localhost:3100").replace(/\/$/, "")}/invite/${token}`);
}

main().catch((e) => { console.error(e.message ?? e); process.exit(1); });
