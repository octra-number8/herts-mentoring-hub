/**
 * Generates docs/permissions-matrix.md and docs/feature-activation.md from the
 * live database catalogue, so documentation can never drift from enforcement.
 *   npx tsx scripts/gen-permission-docs.ts
 */
import { createClient } from "@supabase/supabase-js";
import { writeFileSync } from "node:fs";
import { config } from "dotenv";
config({ path: ".env.local", quiet: true });

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

async function main() {
  const [{ data: perms }, { data: roles }, { data: rp }, { data: features }, { data: settings }, { data: activations }] = await Promise.all([
    db.from("permissions").select("key, feature_key, action, description").order("feature_key").order("key"),
    db.from("roles").select("id, key, name, is_management, description").order("is_management", { ascending: false }),
    db.from("role_permissions").select("role_id, permission_key"),
    db.from("features").select("*"),
    db.from("feature_settings").select("feature_key, enabled, actions"),
    db.from("feature_activations").select("feature_key, scope_type, active"),
  ]);
  const order = ["prov_grand_mentor", "deputy_prov_grand_mentor", "apgmen", "prov_team", "learning_lead", "ld_contributor", "tech_admin", "lodge_mentor", "personal_mentor", "learner"];
  const R = order.map((k) => roles!.find((r) => r.key === k)!).filter(Boolean);
  const has = (roleId: string, p: string) => rp!.some((x) => x.role_id === roleId && x.permission_key === p);
  const short: Record<string, string> = { prov_grand_mentor: "ProvGMen", deputy_prov_grand_mentor: "Deputy", apgmen: "APGMen", prov_team: "Team", learning_lead: "L&D lead", ld_contributor: "L&D author", tech_admin: "Tech admin", lodge_mentor: "Lodge Mentor", personal_mentor: "Personal Mentor", learner: "Learner" };

  let md = `# Permissions matrix\n\nGenerated from the database catalogue on ${new Date().toISOString().slice(0, 10)} by \`scripts/gen-permission-docs.ts\`. Do not edit by hand.\n\n`;
  md += "Effective access = role (or individual grant) **and** MFA satisfied (management roles) **and** feature enabled **and** feature available (or activated). RLS applies the same rule to every row.\n\n";
  md += "## Roles\n\n| Role | MFA required | Purpose |\n|---|---|---|\n";
  for (const r of R) md += `| ${r.name} | ${r.is_management ? "Yes" : "No"} | ${r.description} |\n`;
  for (const f of features!) {
    const ps = perms!.filter((p) => p.feature_key === f.key);
    md += `\n## ${f.name} (\`${f.key}\`)\n\n${f.description}${f.activation_mode === "activation_required" ? " **Requires activation per account, Lodge or role.**" : ""}\n\n`;
    md += `| Permission | ${R.map((r) => short[r.key]).join(" | ")} |\n|---|${R.map(() => ":-:").join("|")}|\n`;
    for (const p of ps) md += `| \`${p.key}\`<br><small>${p.description}</small> | ${R.map((r) => (has(r.id, p.key) ? "●" : "")).join(" | ")} |\n`;
  }
  writeFileSync("docs/permissions-matrix.md", md);

  let fa = `# First-release feature activation matrix\n\nGenerated ${new Date().toISOString().slice(0, 10)} from \`feature_settings\` and \`feature_activations\`.\n\n`;
  fa += "| Feature | Enabled | Mode | Actions enabled | Active targeted activations | First-release audience |\n|---|---|---|---|---|---|\n";
  const audience: Record<string, string> = {
    management: "Authorised Provincial users only", academy: "All Learning Users and Provincial users", academy_authoring: "L&D contributors, L&D lead, leadership",
    communications: "Provincial users with comms permissions", imports: "Leadership", workflows: "Leadership", reports: "Provincial users with report permissions",
    administration: "Leadership and technical administrator", lodge_portal: "**Nobody** until leadership activates it for a user, Lodge or role",
  };
  for (const f of features!) {
    const s = settings!.find((x) => x.feature_key === f.key);
    const acts = Object.entries((s?.actions ?? {}) as Record<string, boolean>).filter(([, v]) => v).map(([k]) => k).join(", ");
    const n = activations!.filter((a) => a.feature_key === f.key && a.active).length;
    fa += `| ${f.name} | ${s?.enabled ? "Yes" : "No"} | ${f.activation_mode === "activation_required" ? "Activation required" : "Available to permitted roles"} | ${acts} | ${n} | ${audience[f.key] ?? ""} |\n`;
  }
  fa += "\nLodge Mentor accounts hold the `lodge_portal.*` permissions through their role, but the portal stays closed until an activation exists. Activation is per account, per Lodge or per role, with per-action control (read, create, update, export), a mandatory reason, and an audit entry. Deactivation removes access immediately and leaves learning history untouched (tested in Scenario 14).\n";
  writeFileSync("docs/feature-activation.md", fa);
  console.log("Wrote docs/permissions-matrix.md and docs/feature-activation.md");
}
main();
