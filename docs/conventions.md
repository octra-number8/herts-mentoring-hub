# Development conventions

How code is written in the Hertfordshire Mentoring Hub. Read this before adding a module.
The Lodges module (`src/app/(management)/lodges`) is the reference implementation: copy its patterns.

## Canon and language

The Hub follows the Hertfordshire mentoring canon (A1 Principles, A3 Style, Terminology and Data Guide).

- Principles, always in this order: **Prepare · Guide · Support · Enlighten**. They are not sequential stages.
- Titles: Provincial Grand Mentor (ProvGMen), Deputy Provincial Grand Mentor, Assistant Provincial Grand Mentor (APGMen), Lodge Mentor, Personal Mentor. Never "PGM".
- British English. No em-dashes in user-facing text (use a hyphen, comma, colon or full stop). Short, warm, plain sentences.
- No management jargon in member or mentor-facing text: not "onboarding", "KPIs", "stakeholders", "leverage".
- House phrases: "How can we help?", never "Why aren't you attending?"; "There should never be any surprises".
- Never judge a Lodge or Brother. Mentoring statuses describe an operational position. Progression prompts say "a conversation may be welcome", never "disengaged" or "failing". Do not use red for mentoring status.
- Never reproduce ritual or copyrighted UGLE/Solomon content. Link to Solomon; do not copy it.

## Architecture in one page

- Next.js 16 App Router, TypeScript strict, Tailwind v4, Supabase (Postgres, Auth, Storage), Resend.
- Cache Components are **off** (`next.config.ts`): every page renders dynamically per user.
- `src/proxy.ts` refreshes the session and sends signed-out visitors to `/login`.
- Route groups: `(management)` Provincial shell, `(academy)` learner shell (`/academy`, `/account`), `(portal)` Lodge Mentor portal, `(auth)` sign-in pages. Public pages: `/unsubscribe`, `/checkin`, `/whats-on`.
- Shells and navigation: `src/components/shell`. Nav items are already defined for every module in `nav.ts`.

## Security model (the part that matters most)

1. **The database is the enforcement point.** Every table has RLS. Policies call helpers in the `app` schema (`app.has_perm`, `app.can_on_lodge`, `app.can_on_person`, `app.can_read_case`, ...), which read a per-transaction session cache (`app.session_cache()`).
2. **Read and write as the user.** Use `supabaseServer()` (RLS applies) for everything a user does. `supabaseService()` bypasses RLS and is only for system processes (jobs, email outbox, invitation acceptance, webhooks, signed file URLs after an explicit RLS read). Never pass user input to a service-role query without first reading the record through the user client.
3. **Multi-step or privileged state changes are definer functions** (`public.*` in the migrations) with their own `app.require(...)` permission checks: approvals, publication, allocation, registration capacity, assessment scoring, certificates, import commit, campaign approval. Don't reimplement these in TypeScript.
4. **UI permission checks are for navigation only.** `requirePermission(...)` at the top of every page (404 if missing). `can(session, perm)` to show or hide controls. The database refuses anyway.
5. Permission keys are in `src/lib/permissions.ts` (mirrors `public.permissions`). Effective permissions = role or grant, AND MFA satisfied, AND feature enabled, AND (feature generally available OR activated). Feature flags never widen access.
6. Learners (`academy.learn` only) must never see management data. Assume every new table needs a policy that a learner fails.
7. Confidential cases (`kind = 'confidential'`) never appear in Lodge views, reports, search, workflows or notifications with content.
8. Notifications and audit details never contain restricted text. Mentioning someone grants nothing.
9. Exports go through `/api/export/[dataset]` (permission-checked and audited via `log_export`). Register datasets in `src/server/reports/`.

## Server actions

Define actions with `defineAction(schema, handler, opts)` from `src/server/action.ts`:

```ts
export const logContact = defineAction(
  z.object({ lodge_id: zf.uuid(), summary: zf.required("Summary", 2000), follow_up_on: zf.optionalDate(), create_task: zf.checkbox() }),
  async (input, { db, session }) => {
    check(await db.from("contacts").insert({ ...input, org_id: session.orgId }));
    kickJobs();                       // only if you emitted domain events or notifications
    return { message: "Contact recorded.", revalidate: [`/lodges/${input.lodge_id}`] };
  },
);
```

- Use `zf.*` helpers for form fields (they handle empty strings, checkboxes, dates, lists `name[]`).
- `check(res)` throws a friendly error on failure. `throw new UserError("...")` for business messages.
- An update that matches no rows usually means RLS refused it: check `select("id")` length and say so.
- Return `{ redirect }` to navigate after success.
- Call `kickJobs()` after anything that emits domain events (registrations, completions, approvals) so emails and notifications follow promptly.

## Forms and UI

- Client forms: `ActionForm`, `TextField`, `TextAreaField`, `SelectField`, `CheckboxField`, `RadioGroup`, `SubmitButton`, `FormActions` from `@/components/ui/form`.
- Dialogs: `DialogForm` (button opens a modal form, closes on success) and `ActionButton` (single-button form, optional confirm) from `@/components/ui/dialog-form`.
- Pickers: `PersonPicker` (search people, RLS-aware) and `AccountSelect` (active Provincial accounts) from `@/components/ui/pickers`.
- Layout: `PageHeader`, `Panel`, `Tabs`, `EmptyState`, `DescriptionList`, `Stat`, `Timeline`, `Alert`, `Avatar` from `@/components/ui/layout`. Tables: `Table`, `THead`, `TH`, `TBody`, `TR`, `TD`, `RowLink`, `Pagination`. Badges: `Badge`, `statusTone`, `mentoringStatusTone`. Filters (GET forms, filters live in the URL): `FilterBar`, `FilterSearch`, `FilterSelect`, `FilterDate`.
- Format with `formatDate`, `formatDateTime`, `relativeDays`, `label()` from `@/lib/utils`. Never render raw enum keys.
- Markdown: `renderMarkdown()` from `@/lib/markdown` (sanitised) into a `prose-hub` container.
- Design: understated and professional. Navy `navy-800` primary, teal accent, white panels on a light canvas. No gradients, sparkles, decorative icons or emoji. Don't wrap everything in a card. Every list needs an empty state; every form shows errors and success.
- Accessibility (WCAG 2.2 AA): labels on every control, keyboard operable, visible focus, `aria-current` for active nav, text alternatives for images, no colour-only meaning.
- Responsive: test at 375px. Tables scroll horizontally; hide secondary columns with `hidden md:table-cell`.
- Server Components by default. Mark client components `"use client"`; don't call `Date.now()` or `Math.random()` during render (lint will refuse); use `todayIso()` / `isoInDays()` helpers.
- Pages that take `params` / `searchParams` must `await` them (Next 16).

## Data access

- Generated types: `src/types/database.ts` (`npm run db:types`). Use typed queries; cast embedded relations with `as unknown as {...}` where the generator cannot infer them.
- Reporting views (`security_invoker`): `v_lodge_overview`, `v_member_overview`, `v_learning_records`, `v_event_attendance`.
- Domain events: definer functions call `app.emit(...)`; `src/server/jobs/index.ts` handles built-in reactions; workflows run after.
- Email: never send directly. `enqueueEmail` / `enqueueTemplate` (`src/server/email/outbox.ts`) with an idempotency key and a category (`security`, `operational`, `learning`, `events`, `news`). Preferences and suppression are applied for you.
- Storage buckets (private): `documents`, `academy-media`, `certificates`, `imports`, `evidence`. Paths start with the org id (evidence: person id). Serve files with short-lived signed URLs after reading the owning record through the user client.

## Migrations

- New migration files only; never edit an existing migration once others depend on it. Name them with your assigned timestamp range.
- Enable RLS and write policies in the same migration as the table. Add audit triggers (`app.audit_row`) on records people will want history for.
- Apply with `npx supabase migration up` (non-destructive), then `npm run db:types`. Do not run `supabase db reset` while other work is in progress: it wipes data and signs everyone out. `npm test` resets the database (global setup) so only run the full suite when nothing else is running.
- Public functions: `security definer set search_path = public, pg_temp`, explicit `app.require` checks, then `revoke ... from anon, public; grant ... to authenticated`.

## Testing

- `npm run typecheck`, `npm run lint` must be clean.
- Database and RLS tests: `tests/db/*.test.ts` using helpers in `tests/helpers.ts` (`as("pgm")`, `count(...)`, `service()`). Test what a role **cannot** do as well as what it can.
- Unit tests (no database): `tests/unit/*.test.ts`.
- Page smoke tests over HTTP as a seeded user: `npx tsx scripts/smoke.ts <user> /path /other=404`.
- End-to-end (browser): `e2e/*.spec.ts` with Playwright.
- Seeded users (password in `.seed-secrets.json`): `pgm`, `deputy`, `apgmen1`-`apgmen5` (apgmen1: Lodges 9001-9008, also Lodge Mentor of 9003), `team`, `learninglead`, `author`, `techadmin`, `lm1` (LM of 9001), `lm2` (LM of 9002), `pm1`, `learner1`, `learner2`. Lodges 9039 and 9040 are unallocated.
