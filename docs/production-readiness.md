# Production readiness checklist

What remains before the Hub can hold live information and go live. Items are grouped by who must act. Nothing here is a coding task unless marked **(build)**.

## Authorisations and decisions for the Province

| # | Item | Why it matters | Status |
|---|---|---|---|
| 1 | Confirm authority to extract, transfer and process membership data from Hermes/Adelphi/UGLE Portal | Brief 20.5: no live personal data is imported until confirmed | Open |
| 2 | Identify the data controller, lawful bases, privacy notice wording and processor agreements (Supabase, Vercel, Resend) | UK GDPR | **Draft notice at `/privacy`**; facts to confirm in `docs/privacy/owner-checklist.md` |
| 3 | Agree retention periods (A3 section 7 is still a draft; recommended baseline 12 months after departure) | Retention policies are built but disabled | Open |
| 4 | Decide whether Provincial-level mentoring records are acceptable given A3 section 7 says the Personal Mentoring Plan is held by the Lodge Mentor and "not circulated" | The Hub centralises journey information | Open |
| 5 | Confirm the provisional design assumptions in brief section 32 (listed below) | They are implemented as configurable defaults | Open |
| 6 | Approve real Academy course content and publication rights for Provincial material; confirm Solomon mapping is links-only | Seeded courses are placeholders marked as such | Open |
| 7 | Confirm the principle order and titles (the Hub follows A1/A3 canon: Prepare · Guide · Support · Enlighten; Provincial Grand Mentor) | The brief differs from the canon | Open |
| 8 | Approve use of the PGLH shield and wordmark (taken from the library's Artwork folder) in the application and emails | Brand use | Open |
| 9 | Nominate designated triage for confidential concerns (default: Provincial Grand Mentor and Deputy) | Routing | Default in place |

## External services and credentials

| # | Item | Owner | Status |
|---|---|---|---|
| 10 | Vercel team/project (Pro plan if 10-minute cron is wanted; otherwise Supabase pg_cron) | Province | Open: needs an account owned by the Province |
| 11 | Supabase project for the live site (London region; Pro plan for daily backups) | Province | One project only, no staging (owner decision, 27 Oct 2026). Approved budget: $10/month; check whether daily backups are included, see note |
| 12 | Resend account, verified sending domain (SPF/DKIM/DMARC), API key, webhook secret | Province DNS admin | Open |
| 13 | Production domain `app.hertsmentors.com` (hertsmentors.com is on Vercel DNS); Resend DNS records added in Vercel | Domain owner | Decided; add domain to the Vercel project and Resend records at go-live |
| 14 | Octra-Lodge: inspect the real API and agree integration permissions | Octra-Lodge | Open: adapter defined, not connected |
| 15 | Any automated Hermes/Adelphi feed | UGLE | Not available; manual import works fully |

Note on cost: a Supabase project on a paid organisation is billed per project (compute) on top of the plan. The approved $10/month covers a single Micro compute project, which is now the live site. Production with daily backups needs the Pro plan; point-in-time recovery is an add-on. Confirm the production budget before go-live.

## Provisional design assumptions (brief section 32), as implemented

1. Assistants see basic membership outside their Lodges; detailed mentoring and support records are restricted. **Implemented in RLS.**
2. Lodge Mentor access can be activated user by user or Lodge by Lodge (also by role). **Implemented; tested in Scenario 14.**
3. Personal Mentor allocation is Yes/No/Unknown with confirmation date and optional review. **Implemented; mentor identity optional.**
4. The Hub keeps only the membership data mentoring needs. **Import authoritative fields configurable; no extra fields imported.**
5. Confidential concerns are triaged by designated leadership. **Implemented.**
6. Mentoring statuses are centrally controlled but configurable. **Administration → Configuration.**
7. Either Provincial Grand Mentor or Deputy may approve Province-wide email. **Implemented; self-approval configurable.**
8. Octra-Lodge owns paid bookings. **Implemented as link-out plus adapter.**
9. Academy engine complete; published material requires approval. **Draft → Review → Approved → Published, approver must differ from author by default.**
10. Automation uses controlled triggers and actions. **Implemented; no executable code.**

## Go-live tasks (once the above are settled)

- [x] Supabase project for the live site created (`pgthnipdqbuoqptxkovs`, London); migrations applied. Still to do: push the Auth settings in `[remotes.live]` and set up SMTP.
- [ ] Bootstrap the organisation and the first Provincial Grand Mentor (`scripts/create-first-admin.ts`).
- [ ] Configure Vercel environment variables and domain; deploy from `main` after CI passes.
- [ ] Verify Resend domain; send a test from Administration → System health; confirm webhooks arrive.
- [ ] Run the restore drill into a local database from a live backup, and record the result.
- [ ] Review mentoring statuses, support categories, document categories and progression thresholds with the team.
- [ ] Load approved documents into the Library; author and approve first Academy courses.
- [ ] First live import: start with one Lodge, check reconciliation, then the Province.
- [ ] Invite the Provincial team (MFA set-up at first sign-in), then learners.
- [ ] Remove the "Synthetic test data" environment label (`organisations.settings.environment_label`).

## Remaining build-side items (honest list)

- **Security review, October 2026**: fixes and outstanding risks in `docs/security/security-review-2026-10.md`. Run `npm run security:check -- --release` before go-live, and complete its manual checks.

- **(build) Application-level rate limiting.** Sign-in, email links and password reset are rate-limited by Supabase Auth. Public endpoints (`/whats-on`, `/unsubscribe`, `/api/calendar`, `/api/webhooks/resend`) rely on token secrecy and Vercel's platform protection; add Vercel WAF rate-limit rules or an app-level limiter before go-live.
- **(build) Load check locally** with realistic volumes (Hertfordshire's full Lodge and membership numbers). Local testing used 40 Lodges and about 800 synthetic members.
- **(build) Cross-browser checks.** Automated tests run in Chromium; check Safari (iPhone) and Firefox manually or add Playwright projects.
- **Manual screen-reader review** of the main journeys (automated axe checks pass).
- **The live site** is https://app.hertsmentors.com (see `docs/deployment.md`). There is no staging site. Before real data: daily backups on the Supabase plan, a Resend domain, and removing the test Lodge and test learner.
