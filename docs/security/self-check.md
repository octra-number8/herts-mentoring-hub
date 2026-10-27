# Security self-check

One command runs the automated security checks:

```bash
npm run security:check
```

| Option | Effect |
|---|---|
| (none) | Every check. The database checks and access-control tests run if the local Supabase stack is up. **The access-control tests reset the local database to synthetic seed data.** |
| `-- --no-db` | Skips everything that needs the local database. Nothing is reset. |
| `-- --strict` | A required check that cannot run counts as a failure. CI uses this. |
| `-- --release` | Also fails while the Privacy Notice is still a draft. Use it before go-live. |

## Reading the results

| Result | Meaning | Fails the run? |
|---|---|---|
| PASS | The check ran and found nothing | No |
| FAIL | Something needs fixing (details are printed under the line) | **Yes** (exit code 1) |
| WARN | Needs a person's decision, for example the draft Privacy Notice | No (`--release` makes the notice a failure) |
| ACCEPTED | A known, reviewed exception recorded with a reason and a review date. It fails again after that date | No |
| SKIP | Could not run, with the reason. **Never counted as passed** | Only with `--strict`, for required checks |

## What it checks

| Area | Check | Needs |
|---|---|---|
| Dependencies | `npm audit` against `security/audit-allowlist.json` | Network access to the npm registry (SKIP without it) |
| Secrets | Tracked and unignored files, and every added line in git history, for keys, tokens, private keys, passwords and database URLs. Values are never printed. Reviewed non-credential matches are listed in `security/secret-allowlist.json`. Secret files must be git-ignored | Git |
| Secrets (second opinion) | `gitleaks detect --redact`, if installed. Optional | gitleaks |
| Static | ESLint; TypeScript; service-role use only in reviewed files; raw HTML only through the sanitiser; redirects through `safeInternalPath`; security headers configured; every `SECURITY DEFINER` function pins `search_path`; auth settings in `supabase/config.toml` | Nothing |
| Privacy | Counts `[OWNER TO CONFIRM]` points left in the Privacy Notice | Nothing |
| Database | RLS on every public table; no anonymous table access; no TRUNCATE for API roles; accounts not directly writable; unsubscribe tokens unreadable; definer functions pinned; storage buckets private; anonymous role cannot run functions | Local stack (`npx supabase start`) |
| Regression tests | Security unit tests (redirects, email escaping, attachments, notice). Access-control tests: learner isolation, role permissions and this review's fixes, run as several synthetic users | Unit: nothing. Access control: local stack |
| Live headers | CSP with nonce, HSTS, frame, nosniff and referrer headers on a running local app. Optional | `npm run dev` |

The check never contacts the live site or any third-party service, except the npm registry for the audit.

## Adding an exception

- **Dependency advisory:** add it to `security/audit-allowlist.json`. Give the advisory id, the package, *why it is not exploitable here*, and a `review_by` date no more than three months ahead.
- **Secret-scan match in history** that is not a credential (for example a synthetic test value): add the commit, file and rule to `security/secret-allowlist.json` with the reason. **A real credential is never allow-listed: rotate it.** Deleting it from history alone is not enough.
- **New service-role use:** review that the code checks permission (or reads through RLS) before using the service role, then add the file to `REVIEWED_SERVICE_ROLE` in `scripts/security-check.mjs`.

## Manual checks (cannot reasonably be automated)

Do these before real personal data is loaded, and after significant changes:

1. **Hosted settings.** Confirm these match the repository:
   - Supabase Auth: sign-ups off, minimum password length 12, secure password change on, redirect URLs exact (no wildcard), TOTP on.
   - Vercel: function region London, environment variables set, preview deployments not pointing at production data.
   - Resend: open and click tracking off, SPF/DKIM/DMARC set.

   `supabase config push` applies `supabase/config.toml` to a project, after approval.
2. **Headers on the hosted site.** Run `curl -sI https://<host>/login` and check CSP, HSTS and frame protection. Then open the key pages in a browser and check the console shows no CSP violations.
3. **Access walk-through locally** (`npm run dev` with the synthetic seed), with accounts for each role: learner, Lodge Mentor (portal off and on), Assistant, technical administrator and leadership. Try another learner's certificate, evidence and lesson URLs, and the management URLs.
4. **Backups:** run the restore drill (`docs/runbooks.md`). Confirm independent backups are encrypted and stored off this laptop.
5. **Rate limiting:** confirm Vercel WAF or firewall rules on `/join`, `/forgot-password`, `/login`, `/api/calendar/*` and `/unsubscribe/*`. Supabase Auth limits only its own endpoints.
6. **Accounts:** review who holds leadership and technical administrator roles. Remove leavers, and confirm MFA for everyone with management access.
7. **Privacy:** settle `docs/privacy/owner-checklist.md` and remove the draft marker. Confirm processor agreements and the complaints and subject-access process.
8. **Dependencies:** review `security/audit-allowlist.json` entries before their review dates.

Passing the automated checks does not show that the Hub is secure or that its use of personal data is lawful.
