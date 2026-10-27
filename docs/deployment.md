# Deployment guide

The live site runs on **Vercel** (Next.js) and **Supabase** (Postgres, Auth, Storage), with **Resend** for email. Nothing reaches the live site without passing CI on GitHub.

## Environments

| Environment | App | Database | Data | Email |
|---|---|---|---|---|
| Local development | `npm run dev` on http://localhost:3100 | Local Supabase in Docker (ports 554xx) | Synthetic seed | Captured by Mailpit (http://127.0.0.1:55424) |
| CI | GitHub Actions | Local Supabase in the runner | Synthetic seed | Captured |
| Live (https://app.hertsmentors.com) | Vercel production | Supabase project `pgthnipdqbuoqptxkovs` | Live only after data authorisation | Resend, verified domain (not yet set up) |

There is one hosted site, and no staging or preview environment (owner decision, 27 October 2026). Changes are tested locally and in CI before they reach it. Do not point a Vercel preview deployment at the live database.

## Live site

| Item | Value |
|---|---|
| URL | https://app.hertsmentors.com (Vercel project `herts-mentoring-hub`, team FIRE) |
| Database | Supabase project `pgthnipdqbuoqptxkovs`, London. It was created as `herts-mentoring-hub-staging`; the name in the Supabase dashboard can be changed there. |
| Data | Published Academy courses and the administrator account, plus one test Lodge and test learner to remove before members join. The site has had no synthetic people since this clean-up: All synthetic people, lodges, Areas, meeting centres, documents, knowledge articles and placeholder courses were removed on 25 Oct 2026. Configuration (roles, permissions, categories, templates, workflows) is kept |
| Email | `EMAIL_DRIVER=memory`: nothing is sent until a Resend domain is verified |
| Background jobs | Vercel Cron, every 10 minutes |
| Test accounts | Never seed this database (`scripts/seed.ts` refuses a hosted database). Test locally or in CI instead |
| Backups | Supabase daily backups need the Pro plan; check the plan before real data. Independent backups: weekly (owner decision), encrypted |

Deploy a new version: `npx vercel deploy --prod` after CI passes. Apply new migrations first: `npx supabase db push --linked`. Auth settings for the live site are in `supabase/config.toml` under `[remotes.live]` and are applied with `npx supabase config push --project-ref pgthnipdqbuoqptxkovs`.

Note: linking the CLI to the hosted project records its service versions locally (`supabase/.temp`); restart the local stack (`npx supabase stop && npx supabase start`) afterwards so local Storage matches.

## Release flow

1. Work on a branch; open a pull request.
2. CI runs lint, type check, database/RLS/workflow tests, build, end-to-end and accessibility tests.
3. Merge to `main` after review.
4. Apply migrations to the live database **before** deploying the new code (they are additive by convention).
5. Deploy with `npx vercel deploy --prod`. Roll back by promoting the previous deployment; roll back data only through the recovery procedure.

Do not publish untested changes to the live site. Do not run `supabase db reset` against any hosted project.

## First-time setup

### Supabase (one project, London `eu-west-2`)
1. Create the project. Enable daily backups (Pro plan), and point-in-time recovery if the budget allows.
2. Link and apply migrations:
   ```
   npx supabase link --project-ref <ref>
   npx supabase db push
   ```
3. Auth settings (Dashboard → Authentication):
   - Disable public sign-ups (accounts are by invitation only).
   - Enable TOTP MFA.
   - Site URL: `https://app.hertsmentors.com`. Redirect URLs: `https://app.hertsmentors.com/auth/callback`, `https://app.hertsmentors.com/auth/confirm`.
   - SMTP: Resend SMTP credentials so Supabase Auth emails (email links, password reset) come from the Province's domain.
   - Email templates: link to `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=<type>`.
4. Create the organisation (once), as the service role:
   ```sql
   insert into organisations(slug, name, short_name) values ('herts', 'Provincial Grand Lodge of Hertfordshire', 'Hertfordshire') returning id;
   select admin_bootstrap_org('<id>');
   ```
   Then create the first Provincial Grand Mentor account with `scripts/create-first-admin.ts` (see below). Everyone else is invited from **Administration → Users**.
5. Scheduled jobs: Vercel Cron runs `/api/cron/run` every 10 minutes (`vercel.json`; requires a Vercel Pro plan for sub-daily schedules). On the Hobby plan, use Supabase `pg_cron` + `pg_net` instead:
   ```sql
   select cron.schedule('hub-jobs', '*/10 * * * *', $$
     select net.http_get('https://app.hertsmentors.com/api/cron/run', headers := jsonb_build_object('Authorization', 'Bearer <CRON_SECRET>'))
   $$);
   ```

### Vercel
1. Import the GitHub repository. Framework: Next.js. Node 24.
2. Set environment variables (below) for Production and Preview separately.
3. Add the custom domain `app.hertsmentors.com` to the project. `hertsmentors.com` already uses Vercel DNS (ns1/ns2.vercel-dns.com), so if the domain sits in the same Vercel account no DNS record is needed; HTTPS is automatic.

### Resend
1. Add and verify `hertsmentors.com` (or a subdomain such as `mail.hertsmentors.com`) as the sending domain: add the SPF, DKIM and DMARC records Resend provides in Vercel → Domains → hertsmentors.com → DNS records.
2. Create an API key (sending access only) → `RESEND_API_KEY`.
3. Add a webhook to `https://app.hertsmentors.com/api/webhooks/resend` for sent, delivered, bounced, complained, opened, clicked → signing secret into `RESEND_WEBHOOK_SECRET`.

## Environment variables

| Variable | Where | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | All | Supabase API URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | All | Public anon key (safe in the browser; RLS protects data) |
| `SUPABASE_SERVICE_ROLE_KEY` | Server only | System processes. Never expose. Rotate if leaked |
| `SUPABASE_JWT_SECRET` | Server only | Signs short-lived tokens so scheduled reports run under their owner's own permissions (never the service role). Supabase → Settings → API → JWT secret (legacy HS256). If the project uses asymmetric signing keys only, scheduled reports are skipped until this is set |
| `APP_URL` | All | Public base URL used in emails and links. Production: `https://app.hertsmentors.com` |
| `EMAIL_DRIVER` | All | `resend` (production), `smtp` (local capture), `memory` (tests) |
| `EMAIL_FROM` | All | e.g. `Hertfordshire Mentoring <mentoring@<verified-domain>>` |
| `RESEND_API_KEY` | Production, preview | Resend sending key |
| `RESEND_WEBHOOK_SECRET` | Production | Verifies delivery webhooks |
| `SMTP_HOST`, `SMTP_PORT` | Local | Mailpit capture |
| `CRON_SECRET` | All | Bearer token for `/api/cron/run` (long random string) |
| `EMAIL_SIMULATE_FAILURES` | Tests only | `1` makes `@fail.test` addresses fail, to test recovery |
| `OCTRA_API_BASE`, `OCTRA_API_KEY` | Future | Octra-Lodge adapter once its API is confirmed |

Secrets live only in Vercel and Supabase settings, never in the repository. `.env.example` lists the names.

## Database migrations

- Migrations are in `supabase/migrations/`, applied in order. Write new files; never edit an applied one.
- Prefer additive changes (new columns nullable or defaulted). For destructive changes, release in two steps (stop using, then remove).
- After applying, regenerate types: `npm run db:types`, and regenerate docs: `./scripts/gen-schema-docs.sh` and `npx tsx scripts/gen-permission-docs.ts`.
