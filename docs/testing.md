# Testing and acceptance results

## How the Hub is tested

| Layer | Tool | What it proves | Command |
|---|---|---|---|
| Static checks | ESLint, TypeScript strict | Code quality, type safety | `npm run lint && npm run typecheck` |
| Database, RLS and workflows | Vitest against a real local Supabase (Postgres, Auth, Storage) | Every access rule, as each role, including refusals; business functions; scenario logic | `npm test` (resets and reseeds first) |
| Unit | Vitest | Import parsing, mapping, matching; content model; analysis; email text; ICS | part of `npm test` |
| End-to-end | Playwright (Chromium) against the running app | Real pages, real forms and real downloads, signed in through password and TOTP | `npm run test:e2e` |
| Accessibility | axe-core in Playwright (WCAG 2.0/2.1/2.2 A and AA) | No violations on key pages, desktop and 375px | part of `npm run test:e2e` |
| Phone layout | Playwright at 375×812 | No horizontal page scroll; screenshots reviewed by eye | part of `npm run test:e2e` |
| Recovery | `scripts/backup.sh`, `scripts/restore-drill.sh` | Database and files can be restored and used | manual drill |

CI (`.github/workflows/ci.yml`) runs lint, type check, build, the database suite and the browser suite on every push.

## Results: 25 October 2026

Run on a production build (`next build` + `next start`) against a freshly reset, synthetic-only database.

| Suite | Result |
|---|---|
| Lint, type check, production build | Clean |
| Database, RLS, permission, workflow and unit tests | **233 / 233 passed** (16 files) |
| Browser end-to-end, accessibility and phone-width tests | **51 / 51 passed on two consecutive runs** (25 files) |
| Restore drill | **Passed**: row counts identical, files restored with matching SHA-256, sign-in with MFA and certificate download work after restore |

## Acceptance scenarios (brief section 28)

| # | Scenario | Database / RLS tests | Browser tests |
|---|---|---|---|
| 1 | New Initiate import | `imports-admin.test.ts` | `scenario-01-new-initiate.spec.ts`: upload, map, commit; member, Lodge link and journey created; Assistant notified; no email to the member |
| 2 | Lodge Mentor changes | `02-workflows.test.ts` | `scenario-02-lodge-mentor-change.spec.ts`: history kept with end date; Assistant task; portal stays closed |
| 3 | Support request | `members-support.test.ts` | `scenario-03-support-request.spec.ts`: routed, updated, comment, action task, escalated, resolved, reopened, closed |
| 4 | Confidential concern | `01-permissions.test.ts`, `members-support.test.ts` | `scenario-04-confidential-concern.spec.ts`: invisible to Assistants on every route; triage assigns; access audited |
| 5 | Learner invitation | `imports-admin.test.ts` | `scenario-05-learner-invitation.spec.ts`: invited, emailed link, password set, Academy only; Lodge Mentor role does not open the portal |
| 6 | Learner security | `00-learner-isolation.test.ts` (56 checks: tables, views, RPCs, search, storage paths, exports) | `scenario-06-learner-security.spec.ts`, `auth.spec.ts`: management URLs, exports, other learners' lessons and certificates refused |
| 7 | Course completion | `academy.test.ts`, `02-workflows.test.ts` | `scenario-07-course-completion.spec.ts`: enrol, every lesson type, fail then pass, certificate PDF, progress |
| 8 | Training event | `events-comms.test.ts`, `02-workflows.test.ts` | `scenario-08-training-event.spec.ts`: capacity, waiting list promotion and email, session QR and code check-in, override, completion, certificate, feedback |
| 9 | Bulk email | `events-comms.test.ts`, `02-workflows.test.ts` | `scenario-09-bulk-email.spec.ts`: audience filter, exclusions with reasons, test email, approval by Deputy, delivery history |
| 10 | Quarterly report | `library-reports.test.ts`, `02-workflows.test.ts` (snapshot unchanged after reassignment) | `scenario-10-quarterly-report.spec.ts`: generate, narrative, review, approve, publish, PDF; refused for Assistants |
| 11 | Import conflict | `imports-admin.test.ts`, `tests/unit/imports.test.ts` | `scenario-11-import-conflict.spec.ts`: new, updated, unchanged, duplicate, conflict, invalid, possible removal; safe commit |
| 12 | Assistant reassignment | `02-workflows.test.ts` | `scenario-12-reassignment.spec.ts`: reallocation with work transfer, temporary cover, "as at" history |
| 13 | Service failure | `events-comms.test.ts` | `scenario-13-service-failure.spec.ts`: email retries with backoff then fails, shown on System health, retried after correction; failed workflow recorded and retried |
| 14 | Future Lodge Mentor activation | `01-permissions.test.ts` (all six steps, by user and by Lodge) | `scenario-14-portal-activation.spec.ts`: activate on screen, own Lodge only, propose and request, deactivate, Academy unaffected |

## Defects found by testing and fixed

Testing found real defects, all fixed and covered by tests:
- **Access rules**:
  - A policy recursion on visits.
  - Two policies comparing the wrong `id`.
  - Portal people not visible.
  - Insert-and-return refused on seven tables.
  - Check-in codes readable by registrants.
  - Learners' plans editable by the learning lead.
  - Leadership role permissions editable directly.
  - Ex-Assistants retaining authored records.
- **Business logic**:
  - Temporary cover always failed.
  - Ending an appointment "today" kept access until midnight.
  - A case update cleared its owner.
  - Retrying a failed email went to the old address.
  - Skipped workflow actions showed as success.
- **Interface**:
  - Every unticked checkbox failed validation.
  - Forms cleared input after errors.
  - Sign-out ended every session for that user.
  - The account picker was empty.
  - Confirmations disappeared after status changes.
  - Member page crash.
  - Several phone layouts.
  - Accessibility violations: unnamed menu, unfocusable scroll areas, chart focus.
- **Performance**: permissions evaluated per row (8-second queries). Fixed with a per-transaction session cache (ADR 0003).
- **Test infrastructure**:
  - The local Supabase Realtime and Analytics services triggered API schema reloads mid-run (now disabled; the Hub uses neither).
  - The CLI reset gave up while Storage was starting.
  - The seed raced the API's schema cache.

## Known limitations of the test evidence

- All data is synthetic. Performance has been exercised with 40 Lodges and about 800 members; Hertfordshire's real numbers are larger and should be load-checked on staging before go-live.
- Email delivery is tested through local capture. Resend's real delivery, bounce and webhook behaviour is verified only with signed test payloads until a production domain exists.
- Browser tests run in Chromium. Safari and Firefox have not been tested automatically.
- Accessibility is automated (axe) plus visual review of screenshots; a manual screen-reader review is still recommended before go-live.
