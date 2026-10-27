#!/usr/bin/env node
/**
 * Single-command security check (docs/security/self-check.md).
 *
 *   npm run security:check              all checks; database checks if the local stack is running
 *   npm run security:check -- --no-db   skip anything that needs the local database (no reset)
 *   npm run security:check -- --strict  a required check that cannot run counts as a failure (CI)
 *   npm run security:check -- --release also fail while the privacy notice is still a draft
 *
 * Results are PASS, FAIL, WARN (needs a person's attention, does not fail the
 * run), ACCEPTED (a documented, dated exception) or SKIP (could not run; never
 * counted as passed). The exit code is 1 when anything FAILs.
 *
 * Passing these checks does not prove the Hub is secure or lawful. See the
 * manual checks in docs/security/self-check.md.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { secretRulesMatching } from "../security/secret-rules.mjs";

const args = new Set(process.argv.slice(2));
const STRICT = args.has("--strict");
const NO_DB = args.has("--no-db");
const RELEASE = args.has("--release");
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(ROOT);

const results = [];
const record = (name, status, detail = "", required = true) => results.push({ name, status, detail, required });
const run = (cmd, argv, opts = {}) => spawnSync(cmd, argv, { encoding: "utf8", maxBuffer: 256 * 1024 * 1024, ...opts });
const has = (cmd) => run("sh", ["-c", `command -v ${cmd}`]).status === 0;
const today = new Date().toISOString().slice(0, 10);

// ---------------------------------------------------------------------------
// 1. Dependencies (needs the npm registry)
// ---------------------------------------------------------------------------
function dependencyAudit() {
  const res = run("npm", ["audit", "--json"]);
  let report;
  try { report = JSON.parse(res.stdout); } catch { report = null; }
  if (!report || report.error) {
    record("Dependency audit (npm audit)", "SKIP", `npm audit could not run${report?.error?.summary ? `: ${report.error.summary}` : ""} (needs network access to the npm registry)`);
    return;
  }
  const allow = JSON.parse(readFileSync("security/audit-allowlist.json", "utf8")).advisories;
  const accepted = [], failing = [];
  for (const [pkg, v] of Object.entries(report.vulnerabilities ?? {})) {
    const ids = (v.via ?? []).filter((x) => typeof x === "object").map((x) => x.url?.split("/").pop());
    if (!ids.length) continue; // reported only through another package; that package carries the advisory
    for (const id of ids) {
      const ok = allow.find((a) => a.id === id && a.package === pkg);
      if (ok && ok.review_by >= today) accepted.push(`${pkg} ${id} (review by ${ok.review_by})`);
      else failing.push(`${pkg} ${v.severity} ${id}${ok ? ` (acceptance expired ${ok.review_by})` : ""}`);
    }
  }
  if (failing.length) record("Dependency audit (npm audit)", "FAIL", failing.join("; "));
  else if (accepted.length) record("Dependency audit (npm audit)", "ACCEPTED", `no unreviewed advisories; accepted: ${accepted.join("; ")}`);
  else record("Dependency audit (npm audit)", "PASS", "no known advisories");
}

// ---------------------------------------------------------------------------
// 2. Secrets in the working tree and in git history (values are never printed)
// ---------------------------------------------------------------------------
// Generated files, binaries, and the scanner's own test fixtures (fake values only).
const SKIP_FILES = /^tests\/fixtures\/secret-scan\/|(^|\/)(package-lock\.json|src\/types\/database\.ts)$|\.(png|jpe?g|gif|ico|pdf|docx|xlsx|woff2?)$/;

function scanText(label, text, findings) {
  text.split("\n").forEach((line, i) => {
    for (const rule of secretRulesMatching(line)) findings.add(`${label}:${i + 1} (${rule})`);
  });
}

function secretScan() {
  const tracked = run("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"]).stdout.split("\0").filter(Boolean);
  const tree = new Set();
  for (const f of tracked) {
    if (SKIP_FILES.test(f) || !existsSync(f)) continue;
    scanText(f, readFileSync(f, "utf8"), tree);
  }
  record("Secret scan: working tree (tracked and unignored files)", tree.size ? "FAIL" : "PASS",
    tree.size ? `possible secrets at ${[...tree].slice(0, 20).join(", ")}` : `${tracked.length} files scanned`);

  const history = new Set();
  const log = run("git", ["log", "--all", "-p", "--no-color", "--format=commit %H"]).stdout;
  let commit = "", file = "";
  for (const line of log.split("\n")) {
    if (line.startsWith("commit ")) commit = line.slice(7);
    else if (line.startsWith("+++ b/")) file = line.slice(6);
    else if (line.startsWith("+") && !line.startsWith("+++") && !SKIP_FILES.test(file)) {
      for (const rule of secretRulesMatching(line.slice(1))) history.add(`${commit} ${file} (${rule})`);
    }
  }
  const reviewed = JSON.parse(readFileSync("security/secret-allowlist.json", "utf8")).history;
  const accepted = [...history].filter((h) => reviewed.some((r) => h === `${r.commit} ${r.file} (${r.rule})`));
  const open = [...history].filter((h) => !accepted.includes(h));
  record("Secret scan: git history (all branches)", open.length ? "FAIL" : accepted.length ? "ACCEPTED" : "PASS",
    open.length ? `possible secrets in ${open.slice(0, 20).join(", ")}. Rotate the credential; removing it from history alone is not enough`
      : accepted.length ? `only reviewed, non-credential matches: ${accepted.join(", ")} (security/secret-allowlist.json)` : "no matches in added lines");

  const mustIgnore = [".env.local", ".env.production", ".seed-secrets.json", ".staging-secrets.json", "backups/x", ".vercel/x"];
  const notIgnored = mustIgnore.filter((f) => run("git", ["check-ignore", "-q", f]).status !== 0);
  record("Secret files are git-ignored", notIgnored.length ? "FAIL" : "PASS", notIgnored.length ? `not ignored: ${notIgnored.join(", ")}` : mustIgnore.join(", "));

  if (has("gitleaks")) {
    const g = run("gitleaks", ["detect", "--no-banner", "--redact", "--exit-code", "1"]);
    record("Secret scan: gitleaks", g.status === 0 ? "PASS" : "FAIL", g.status === 0 ? "no leaks" : "gitleaks reported findings (run `gitleaks detect --redact` for detail)", false);
  } else {
    record("Secret scan: gitleaks", "SKIP", "gitleaks not installed (optional second scanner)", false);
  }
}

// ---------------------------------------------------------------------------
// 3. Static checks
// ---------------------------------------------------------------------------
function lintAndTypes() {
  const lint = run("npm", ["run", "-s", "lint"]);
  record("Lint (ESLint)", lint.status === 0 ? "PASS" : "FAIL", lint.status === 0 ? "" : (lint.stdout + lint.stderr).trim().split("\n").slice(-5).join(" | "));
  const tsc = run("npm", ["run", "-s", "typecheck"]);
  record("Type check (tsc)", tsc.status === 0 ? "PASS" : "FAIL", tsc.status === 0 ? "" : (tsc.stdout + tsc.stderr).trim().split("\n").slice(0, 5).join(" | "));
}

const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));

// Files reviewed for service-role use (security review, October 2026). A new
// file here needs a review that it checks permission before using the role.
const REVIEWED_SERVICE_ROLE = new Set([
  "src/app/(academy)/academy/actions.ts", "src/app/(auth)/actions.ts", "src/app/(auth)/invite/[token]/page.tsx",
  "src/app/(management)/admin/health/actions.ts", "src/app/(management)/admin/users/[id]/page.tsx", "src/app/(management)/admin/users/actions.ts",
  "src/app/(management)/communications/actions.ts", "src/app/(management)/events/actions.ts", "src/app/api/calendar/[token]/route.ts",
  "src/app/api/certificates/[id]/route.ts", "src/app/api/documents/[versionId]/route.ts", "src/app/api/webhooks/resend/route.ts",
  "src/app/unsubscribe/[token]/actions.ts", "src/app/unsubscribe/[token]/page.tsx", "src/app/whats-on/page.tsx",
  "src/server/jobs/index.ts", "src/server/supabase.ts",
]);

function codeChecks() {
  const files = walk("src").filter((f) => /\.(ts|tsx)$/.test(f));
  const read = (f) => readFileSync(f, "utf8");

  const svc = files.filter((f) => read(f).includes("supabaseService()") && !REVIEWED_SERVICE_ROLE.has(f));
  record("Service-role use limited to reviewed files", svc.length ? "FAIL" : "PASS",
    svc.length ? `unreviewed: ${svc.join(", ")} (review it, then add it to REVIEWED_SERVICE_ROLE)` : `${REVIEWED_SERVICE_ROLE.size} reviewed files`);

  const html = files.flatMap((f) => read(f).split("\n").map((l, i) => [f, i + 1, l]))
    .filter(([, , l]) => l.includes("dangerouslySetInnerHTML") && !/renderMarkdown\(/.test(l));
  record("Raw HTML only through the sanitiser", html.length ? "FAIL" : "PASS", html.map(([f, n]) => `${f}:${n}`).join(", "));

  const redirects = files.flatMap((f) => read(f).split("\n").map((l, i) => [f, i + 1, l]))
    .filter(([f, , l]) => /startsWith\(["']\/\/["']\)/.test(l) && !f.endsWith("safe-redirect.ts"));
  record("Redirect targets use safeInternalPath", redirects.length ? "FAIL" : "PASS", redirects.map(([f, n]) => `${f}:${n}`).join(", "));

  const proxy = read("src/proxy.ts"), conf = read("next.config.ts");
  const missing = [
    [/script-src 'self' 'nonce-/, proxy, "CSP nonce"], [/frame-ancestors 'none'/, proxy, "frame-ancestors"],
    [/Strict-Transport-Security/, conf, "HSTS"], [/X-Content-Type-Options/, conf, "nosniff"], [/Referrer-Policy/, conf, "Referrer-Policy"],
  ].filter(([re, src]) => !re.test(src)).map(([, , n]) => n);
  record("Security headers configured", missing.length ? "FAIL" : "PASS", missing.length ? `missing: ${missing.join(", ")}` : "CSP, HSTS, nosniff, Referrer-Policy, frame protection");

  // SECURITY DEFINER functions must pin search_path (latest definition of each wins).
  const defs = new Map();
  for (const f of readdirSync("supabase/migrations").filter((x) => x.endsWith(".sql")).sort()) {
    const sql = readFileSync(path.join("supabase/migrations", f), "utf8");
    for (const m of sql.matchAll(/create\s+(?:or\s+replace\s+)?function\s+([\w.]+)\s*\(([^)]*)\)([\s\S]*?)as\s+\$\$/gi)) {
      defs.set(`${m[1]}(${m[2].replace(/\s+/g, " ").trim()})`, { file: f, header: m[3] });
    }
  }
  const unpinned = [...defs].filter(([, d]) => /security\s+definer/i.test(d.header) && !/set\s+search_path/i.test(d.header)).map(([k, d]) => `${k} in ${d.file}`);
  record("Definer functions pin search_path", unpinned.length ? "FAIL" : "PASS", unpinned.length ? unpinned.join("; ") : `${[...defs.values()].filter((d) => /security\s+definer/i.test(d.header)).length} definer functions`);

  const auth = readFileSync("supabase/config.toml", "utf8");
  const authIssues = [];
  if (!/^\s*enable_signup\s*=\s*false/m.test(auth)) authIssues.push("sign-ups enabled");
  const minLen = Number(auth.match(/^\s*minimum_password_length\s*=\s*(\d+)/m)?.[1] ?? 0);
  if (minLen < 12) authIssues.push(`minimum password length ${minLen}`);
  if (/additional_redirect_urls\s*=\s*\[[^\]]*https:\/\/\*/.test(auth)) authIssues.push("wildcard host in redirect allow-list");
  if (/^\s*enable_anonymous_sign_ins\s*=\s*true/m.test(auth)) authIssues.push("anonymous sign-ins enabled");
  record("Auth configuration in supabase/config.toml", authIssues.length ? "FAIL" : "PASS", authIssues.length ? authIssues.join("; ") : "sign-ups off, 12+ character passwords, exact redirect hosts");
}

// ---------------------------------------------------------------------------
// 4. Privacy notice
// ---------------------------------------------------------------------------
function privacyNotice() {
  const src = readFileSync("src/content/privacy-notice.ts", "utf8");
  const body = src.slice(src.indexOf("PRIVACY_NOTICE_MARKDOWN"));
  const n = body.split("[OWNER TO CONFIRM").length - 1;
  if (!n) record("Privacy notice complete", "PASS", "no owner placeholders remain");
  else record("Privacy notice complete", RELEASE ? "FAIL" : "WARN", `draft: ${n} [OWNER TO CONFIRM] points (docs/privacy/owner-checklist.md). Not ready for live information`);
}

// ---------------------------------------------------------------------------
// 5. Database catalogue and security tests (local stack only)
// ---------------------------------------------------------------------------
function localDb() {
  if (NO_DB) return null;
  const container = "supabase_db_herts-mentoring-hub";
  if (has("docker") && run("docker", ["inspect", "-f", "{{.State.Running}}", container]).stdout.trim() === "true") {
    return (sql) => run("docker", ["exec", "-i", container, "psql", "-U", "postgres", "-tA", "-v", "ON_ERROR_STOP=1", "-c", sql]);
  }
  const url = process.env.DATABASE_URL;
  if (has("psql") && url && /@(127\.0\.0\.1|localhost):/.test(url)) return (sql) => run("psql", [url, "-tA", "-v", "ON_ERROR_STOP=1", "-c", sql]);
  return null;
}

const CATALOGUE = [
  ["Every public table has row-level security", `select string_agg(c.relname, ', ') from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity`],
  ["Anonymous role has no table access", `select string_agg(distinct table_name, ', ') from information_schema.role_table_grants where grantee = 'anon' and table_schema = 'public'`],
  ["No TRUNCATE/TRIGGER/REFERENCES for API roles", `select string_agg(distinct table_name || ':' || privilege_type, ', ') from information_schema.role_table_grants where grantee in ('anon','authenticated') and table_schema = 'public' and privilege_type in ('TRUNCATE','TRIGGER','REFERENCES')`],
  ["Accounts cannot be updated directly", `select string_agg(privilege_type, ', ') from information_schema.role_table_grants where grantee = 'authenticated' and table_schema = 'public' and table_name = 'user_accounts' and privilege_type in ('INSERT','UPDATE','DELETE')`],
  ["Unsubscribe tokens and email bodies are not readable through the API", `select nullif(concat_ws(', ', case when has_column_privilege('authenticated', 'public.comm_preferences', 'unsubscribe_token', 'SELECT') then 'comm_preferences.unsubscribe_token' end, case when has_column_privilege('authenticated', 'public.email_outbox', 'html', 'SELECT') then 'email_outbox.html' end), '')`],
  ["Public definer functions pin search_path", `select string_agg(p.proname, ', ') from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.prosecdef and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')`],
  ["Storage buckets are private", `select string_agg(id, ', ') from storage.buckets where public`],
  ["Anonymous role cannot run public functions", `select string_agg(p.proname, ', ') from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'EXECUTE') and p.prolang <> (select oid from pg_language where lanname = 'c') and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')`],
];

function databaseChecks(sql) {
  if (!sql) {
    record("Database catalogue checks", "SKIP", NO_DB ? "--no-db given" : "local Supabase stack not running (npx supabase start)");
    return;
  }
  for (const [name, q] of CATALOGUE) {
    const r = sql(q);
    if (r.status !== 0) { record(name, "FAIL", `query failed: ${r.stderr.trim().split("\n")[0]}`); continue; }
    const out = r.stdout.trim();
    record(name, out ? "FAIL" : "PASS", out ? out.slice(0, 300) : "");
  }
}

function securityTests(sql) {
  const unit = run("npx", ["vitest", "run", "tests/unit/security.test.ts", "tests/unit/privacy-notice.test.ts", "tests/unit/markdown.test.ts"], { env: { ...process.env, SKIP_DB_RESET: "1" } });
  record("Security unit tests", unit.status === 0 ? "PASS" : "FAIL", summary(unit));
  if (!sql) {
    record("Access-control regression tests (database)", "SKIP", NO_DB ? "--no-db given" : "local Supabase stack not running");
    return;
  }
  console.log("  Running access-control tests: this resets the local database to synthetic seed data.");
  const db = run("npx", ["vitest", "run", "tests/db/00-learner-isolation.test.ts", "tests/db/01-permissions.test.ts", "tests/db/security-review.test.ts"]);
  record("Access-control regression tests (database)", db.status === 0 ? "PASS" : "FAIL", summary(db));
}
const summary = (r) => ((r.stdout + r.stderr).match(/Tests\s+[^\n]+/)?.[0] ?? (r.stdout + r.stderr).trim().split("\n").slice(-3).join(" | ")).replace(/\x1b\[[0-9;]*m/g, "").trim();

// ---------------------------------------------------------------------------
// 6. Headers from a running local app (optional)
// ---------------------------------------------------------------------------
async function liveHeaders() {
  const base = (process.env.APP_URL ?? "http://localhost:3100").replace(/\/$/, "");
  if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(base)) {
    record("Response headers from the running app", "SKIP", "only checked against a local app; check hosted environments manually", false);
    return;
  }
  try {
    const res = await fetch(`${base}/login`, { redirect: "manual", signal: AbortSignal.timeout(5000) });
    const h = res.headers;
    const missing = [["content-security-policy", /nonce-/], ["x-frame-options", /DENY/], ["x-content-type-options", /nosniff/], ["strict-transport-security", /max-age=\d{7,}/], ["referrer-policy", /./]]
      .filter(([k, re]) => !re.test(h.get(k) ?? "")).map(([k]) => k);
    if (h.get("x-powered-by")) missing.push("x-powered-by present");
    record("Response headers from the running app", missing.length ? "FAIL" : "PASS", missing.length ? `missing or weak: ${missing.join(", ")}` : base, false);
  } catch {
    record("Response headers from the running app", "SKIP", `no app at ${base} (npm run dev)`, false);
  }
}

// ---------------------------------------------------------------------------
console.log("Herts Mentoring Hub security check\n");
dependencyAudit();
secretScan();
lintAndTypes();
codeChecks();
privacyNotice();
const sql = localDb();
databaseChecks(sql);
securityTests(sql);
await liveHeaders();

const ICON = { PASS: "PASS    ", FAIL: "FAIL    ", WARN: "WARN    ", SKIP: "SKIP    ", ACCEPTED: "ACCEPTED" };
for (const r of results) console.log(`${ICON[r.status]}  ${r.name}${r.detail ? `\n          ${r.detail}` : ""}`);
const failed = results.filter((r) => r.status === "FAIL" || (STRICT && r.required && r.status === "SKIP"));
const counts = Object.fromEntries(["PASS", "FAIL", "WARN", "ACCEPTED", "SKIP"].map((s) => [s, results.filter((r) => r.status === s).length]));
console.log(`\n${counts.PASS} passed, ${counts.FAIL} failed, ${counts.WARN} warnings, ${counts.ACCEPTED} accepted, ${counts.SKIP} skipped${STRICT ? " (strict: required skips fail)" : ""}`);
console.log("Automated checks cannot show the Hub is secure or compliant. Complete the manual checks in docs/security/self-check.md.");
process.exit(failed.length ? 1 : 0);
