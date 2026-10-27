# Security and privacy review: October 2026

Reviewed on 27 October 2026, on branch `security-privacy-review`, with synthetic data only. The review covered the code, migrations, configuration, dependencies and git history, and checked against the local stack. Staging, production and third-party services were not scanned or changed.

The method followed OWASP Top 10 (2021) and ASVS 4 areas: access control, authentication and session, injection and XSS, SSRF and file handling, security configuration, cryptographic secrets, logging, and dependencies. Each finding was checked against the exact code path, and database findings against the live local catalogue.

- **VERIFIED**: confirmed in code, the catalogue or a test that fails before the fix.
- **POSSIBLE**: plausible, but blocked or unconfirmed elsewhere.

## Architecture in brief

- **Application:** Next.js 16 on Vercel. Server Components, server actions and route handlers.
- **Data:** Supabase (Postgres with RLS on all 101 public tables, Auth with TOTP MFA, private Storage). Resend sends email.
- **Access model:** the database enforces access. The user's own JWT is used by default; the service role is used only by system code.
- **Public entry points:** `/login`, `/join`, `/invite/[token]`, `/forgot-password`, `/auth/*`, `/unsubscribe/[token]`, `/whats-on`, `/privacy`, `/api/calendar/[token]`, `/api/webhooks/resend` (Svix signature) and `/api/cron/run` (bearer secret).
- **Roles:**
  - learner;
  - Personal Mentor and Lodge Mentor (the portal is closed unless activated);
  - Assistant Provincial Grand Mentor (scoped by allocation);
  - team;
  - learning lead and author;
  - technical administrator (no access to cases or notes);
  - Provincial Grand Mentor and Deputy (leadership; triage confidential concerns).
- **Personal data:**
  - names, contact details and membership numbers;
  - Lodge memberships and degree dates;
  - mentoring journeys, contacts, visits and notes;
  - support requests and confidential concerns (may involve welfare or health);
  - learning records and uploaded evidence;
  - event attendance;
  - email delivery events;
  - audit logs.
- **Who it serves:** users are adult Freemasons. No children's data was found. Confidential concerns may relate to vulnerable adults, which is a safeguarding consideration.

## Fixed

| # | Severity | Finding | Fix | Evidence |
|---|---|---|---|---|
| 1 | **High**, VERIFIED | **Account takeover by a technical administrator.** The `accounts_write` policy let anyone with `admin.users` update any column of `user_accounts`, including `auth_user_id` and `mfa_required`. A technical administrator could relink the Provincial Grand Mentor's account to a login they control, with MFA off. That gives leadership access, including confidential concerns. | Direct writes removed. All legitimate writes already use the service role or definer functions. | `tests/db/security-review.test.ts` ("relinked"). It fails with the old policy restored, which was checked during the review. |
| 2 | **High**, VERIFIED (code path) | **Arbitrary storage read via campaign attachments.** A draft's creator could set `attachments` to any `{bucket, path}`, for example a learner's certificate or a scheduled report. "Send test" made the service-role job email the file to them. | A DB trigger allows only the campaign's own folder. `enqueueEmail` refuses attachments outside allowed locations before the service role downloads them. | DB and unit tests ("Campaign attachments", `attachmentAllowed`) |
| 3 | Medium, VERIFIED | **Open redirect after sign-in.** The `next` check allowed `/\evil.example` and `/<tab>/evil.example`. Browsers treat these as `//evil.example`. An attacker could request a genuine magic link for a member, and the member would land on a phishing site after signing in. | `safeInternalPath` resolves the URL and requires the same origin, and rejects paths that normalise to `//`. It is used in the callback, confirm and sign-in actions and in notification links. | `tests/unit/security.test.ts`. The test itself found a further bypass (`/..//evil`), which is now fixed. |
| 4 | Medium, VERIFIED | **Audit log disclosed confidential-concern metadata to technical administrators**: who a case is about, its title and where it was referred. | Audit entries for cases, notes, contacts, journeys, visits, tasks and access grants are readable only with `cases.confidential.triage`. | DB test ("Audit log") |
| 5 | Medium, VERIFIED | **A technical administrator could set retention to destroy case or member records** (`admin.config` only). | Retention policies for people, cases, notes and contacts can be changed only by leadership. | DB test ("Retention") |
| 6 | Medium, VERIFIED | **A learner could make the service role delete another learner's evidence file**, by editing `evidence_path` on their own row. | The app removes files only from the learner's own folder, and a DB constraint enforces that folder. | DB test ("evidence") |
| 7 | Medium, VERIFIED (repo) | **Wildcard redirect host in the staging Auth allow-list** (`https://*-octra-number8s-projects.vercel.app/**`). Anyone can create a Vercel project whose name matches it, and would then receive sign-in tokens. | Removed from `supabase/config.toml`. **Not yet applied to hosted staging** (owner decision B1). | Security check "Auth configuration" |
| 8 | Medium | **No Content Security Policy.** HTML is rendered from Markdown in several places. | A nonce-based CSP in `src/proxy.ts`: `strict-dynamic`, `frame-ancestors 'none'`, `object-src 'none'`, `form-action 'self'`, and frames only from YouTube (no-cookie) and Vimeo. Every page renders per request so the nonce applies. | e2e `security-privacy.spec.ts`; security check "headers" |
| 9 | Low, VERIFIED | **Updates escaped creation rules.** A note author could raise visibility or move the note's subject; a contact could be moved to any Lodge and shared to that Lodge's portal; a draft campaign update did not re-check its owner. | The update policies now repeat the creation rules. | DB tests ("notes and contacts") |
| 10 | Low, VERIFIED | **Unsubscribe tokens were readable by every communications user**, so anyone holding them could unsubscribe any member. | Column privileges hide the token column. Only the system reads it. | DB test ("Unsubscribe tokens") |
| 11 | Low, VERIFIED | **Text from records (names, titles, invitation messages) could add working links to genuine Hub emails.** | `escapeMarkdown` is applied wherever record text is put into system emails. | Unit test |
| 12 | Low, VERIFIED | **Any signed-in user could start the full job runner repeatedly** (amplification). | Kicks are coalesced to one run per instance at a time. | Code review; e2e email scenarios |
| 13 | Low, POSSIBLE | **Finishing re-enrolment of an authenticator had no session or MFA guard.** Supabase Auth probably blocks this already. | Same guard as starting enrolment. | Code |
| 14 | Low | **Weak Auth settings in `config.toml`**: minimum password length 6, and recent sign-in not required to change a password. | Raised to 12, and `secure_password_change` is on. The hosted projects are **not verified** (owner decision B1). | Security check |
| 15 | Low | **Defence in depth.** API roles held TRUNCATE, TRIGGER and REFERENCES, and `app.*` helpers were executable by PUBLIC. | Revoked. | Security check (database) |
| 16 | Low | **A fixed default password for seed accounts was committed.** It is synthetic and local-only. | A random password is generated per seed. The history entry is recorded as reviewed in `security/secret-allowlist.json`. | Security check |
| 17 | Privacy | **The invitation required ticking "I understand how the Hub uses my information"**, a consent-style tick-box with no notice behind it. | Replaced with a link to the Privacy Notice. Reading a notice is information, not consent. | e2e |
| 18 | Privacy | **Vercel functions default to the US (`iad1`)** unless a region is set. | `vercel.json` pins `lhr1` (London). This takes effect at the next deploy; the project setting is unverified. | Config |
| 19 | Low, VERIFIED | **Stored email bodies were readable by System health users (technical administrators)**, and notification emails carry support-request and task titles. | Column privileges hide `html`, `text_body` and `attachments`; System health only uses metadata. | DB test ("email bodies") |
| 20 | Low | **Gaps found by the independent review of these fixes.** MP4 lesson video blocked by the new CSP; `upgrade-insecure-requests` on plain-http `next start`; a campaign with a bad attachment would stick in "sending" and abort the job run; names not escaped in campaign, cancellation, scheduled-report and template emails; job coalescing lost a pending kick on error; future `app` functions would default to PUBLIC; and the secret scanner missed prefixed names such as `SUPABASE_SERVICE_ROLE_KEY`. | All fixed. The scanner rules are now unit-tested against fixtures, including the historic seed password, which the earlier rule had stopped seeing. | Unit tests; production-build CSP sweep |

## Outstanding risks (not fixed here)

| Priority | Risk | Why not fixed / what is needed |
|---|---|---|
| High (before live data) | **Hosted settings unverified.** Supabase Auth on the live site (password policy, redirect list, MFA), the Vercel region and environment variables, headers on the live domain, and Resend tracking. | Changing live infrastructure needs approval. See `docs/security/self-check.md`, manual checks. |
| Medium | **No application-level rate limiting** on `/join`, `/forgot-password`, `/unsubscribe/*` or `/api/calendar/*`. Self-registration is throttled per member (one link per 5 minutes), but not per IP. | Vercel WAF or firewall rules are an infrastructure and cost decision (owner decision B3). |
| Medium | **Changing a member's email address redirects their unclaimed account.** A member-writer (for example an Assistant) can change the email of a member who has no account; the set-up link then goes to the new address. The gain is learner-level access to that member's own records. | Product decision: require leadership approval, or notify the old address, on email changes. |
| Medium | **Technical administrators can create accounts with non-leadership mentoring roles** (for example Assistant or team) at an address they control, so their "cannot read" boundary relies on audit rather than prevention. | Separation-of-duties decision: require leadership approval for granting mentoring roles (owner decision B4). |
| Medium | **`SUPABASE_JWT_SECRET` is held by the app** to mint tokens for scheduled reports, so a leak would allow impersonating any user. Scheduled report files (with personal data) are kept indefinitely in storage. | Keep the secret server-only, and add report files to retention. |
| Low | **Import staging** trusts the client-supplied match and decision (a separation-of-duties gap; commit still needs `imports.approve`). | Recompute matches on the server. |
| Low | **Audit noise.** `log_export` and `log_sensitive_access('person')` let any user write audit entries. | Restrict to real exports. |
| Low | **Storage buckets have no MIME allow-list.** The app checks types, but direct API uploads do not. Draft course media is readable by learners. | Bucket `allowed_mime_types`; tie media reads to publication. |
| Low | **XLSX import** loads whole workbooks, so a crafted file could exhaust memory. Server actions accept 25 MB bodies, including unauthenticated ones. | Check the size before loading; use signed upload URLs. |
| Low | **Markdown allows images from any https host** (tracking pixels by authors) and any `span` class. | Restrict to own storage; allow-list classes. |
| Low | **No RFC 8058 one-click unsubscribe** (`List-Unsubscribe` points to a signed-in page). | Needed for bulk-sender rules and good practice under PECR. |
| Info | **Leadership (`admin.roles`) can grant themselves any permission.** Assistants hold `events.manage` across the Province. | By design; confirm it is intended. |
| Info | **Dependency advisory** `uuid` via `exceljs` (moderate). It is not reachable: exceljs never passes a buffer. | Accepted until 31 January 2027 (`security/audit-allowlist.json`). |
| Operational | **The Academy live-editing setting is on on the live site.** | Switch it off before members have access. |
| Operational | **Local backups** in `backups/` are unencrypted on the laptop. | Encrypt or delete (owner checklist). |
| Safeguarding | **The E7f safeguarding contact is still open**, and confidential concerns rely on designated triage. | Confirm triage holders and the safeguarding contact before live use. |

## What was checked and found sound

- RLS on every public table.
- Anonymous key: no table access, no function access, no public buckets.
- Views use `security_invoker`.
- All definer functions pin `search_path`; no dynamic SQL.
- Learner isolation (56 existing checks).
- Answer keys protected.
- Tokens (invitation, calendar) stored as SHA-256.
- Cron secret compared in constant time.
- Resend webhook verified with a Svix signature and timestamp window.
- CSV formula neutralisation; XLSX written as values only.
- Download filenames sanitised, with `no-store`.
- Sanitiser blocks `javascript:` and `data:`.
- Sign-up and anonymous sign-in disabled.
- Generic responses on `/join`, `/forgot-password` and the magic link (no account enumeration in content).
- No analytics or tracking scripts.
- No secrets in tracked files or history beyond public local-stack defaults and the synthetic seed default.
- Only `NEXT_PUBLIC_SUPABASE_URL` and the anon key reach the browser.

## Re-running

`npm run security:check`: see `docs/security/self-check.md`.
