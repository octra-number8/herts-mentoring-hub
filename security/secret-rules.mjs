/**
 * Secret-scanning rules used by scripts/security-check.mjs (tested in
 * tests/unit/security.test.ts). They report the rule and location only; the
 * matched value is never printed.
 */
export const SECRET_RULES = [
  ["private key", /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ["JWT", /eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/],
  ["Supabase secret key", /sb_secret_[A-Za-z0-9_-]{16,}/],
  ["Resend API key", /(?:^|[^A-Za-z0-9])re_[A-Za-z0-9]{8,}_[A-Za-z0-9]{8,}/],
  ["webhook signing secret", /whsec_[A-Za-z0-9+/=]{20,}/],
  ["GitHub token", /(?:^|[^A-Za-z0-9])gh[pousr]_[A-Za-z0-9]{30,}/],
  ["AWS access key", /(?:^|[^A-Za-z0-9])AKIA[0-9A-Z]{16}(?![0-9A-Z])/],
  ["Stripe live key", /(?:^|[^A-Za-z0-9])[sr]k_live_[A-Za-z0-9]{16,}/],
  ["database URL with password", /postgres(?:ql)?:\/\/[^:/\s"']+:(?!postgres@)[^@\s"']{6,}@/],
  // A quoted literal assigned to (or defaulting) a secret-looking name, in any case, with any prefix.
  ["secret literal", /[A-Za-z0-9_]*(?:secret|passw(?:or)?d|api[_-]?key|service[_-]?role[_-]?key|auth[_-]?token|access[_-]?token|private[_-]?key)[A-Za-z0-9_]*["']?\s*(?:=|:|\?\?|\|\|)\s*["'`]([^"'`\s$]{12,})["'`]/i],
  // An unquoted .env-style line with a value.
  ["env-file secret", /^\s*(?:export\s+)?([A-Z0-9_]*(?:SECRET|PASSWORD|_KEY|TOKEN)[A-Z0-9_]*)\s*=\s*["']?(?!\$\{|<|["'])([^\s"'#]{12,})/],
];

const JWT = /eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/;

/** Values that look like secrets but are public: Supabase local-stack demo keys and local placeholders. */
export function isKnownPublic(match) {
  const jwt = match.match(JWT)?.[0];
  if (jwt) {
    try { return JSON.parse(Buffer.from(jwt.split(".")[1], "base64url").toString()).iss === "supabase-demo"; } catch { return false; }
  }
  // References and file names rather than values: env(VAR) in config.toml, ".seed-secrets.json".
  if (/["'`=]\s*(?:env\(|\.{0,2}\/|\.[\w-]+\.json)|\.json["'`]?$/.test(match)) return true;
  return /(?:local|test|ci)-cron-secret|example|changeme|placeholder/i.test(match);
}

/** Names of the rules a line matches (empty if none). */
export function secretRulesMatching(line) {
  const hits = [];
  for (const [rule, re] of SECRET_RULES) {
    const m = line.match(re);
    if (m && !isKnownPublic(m[0])) hits.push(rule);
  }
  return hits;
}
