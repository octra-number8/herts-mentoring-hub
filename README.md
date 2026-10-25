# Hertfordshire Provincial Mentoring Hub

The operating system for Provincial mentoring in Hertfordshire, with the Herts Mentoring Academy for Lodge Mentors, Personal Mentors and newer Brethren.

*Prepare · Guide · Support · Enlighten*

> This repository contains **synthetic test data only**. No live membership information is held until the Province confirms data authority (see `docs/production-readiness.md`).

## First release

- **Provincial management** for the Provincial Grand Mentor, Deputy, Assistant Provincial Grand Mentors and authorised team members, with MFA.
- **Herts Mentoring Academy** for invited learners, who see only their own learning.
- **Lodge Mentor portal**: built, secured and tested, but closed until leadership activates it for a user, Lodge or role.

## Quick start (local)

Requirements: Node 24, Docker.

```bash
npm ci
npx supabase start          # local Postgres, Auth, Storage, Mailpit on ports 554xx
./scripts/ci-env.sh         # writes .env.local from the running stack
npm run db:reset            # apply migrations and load synthetic data
npm run dev                 # http://localhost:3100
```

Test accounts are written to `.seed-secrets.json` (all share one password). Management accounts need a TOTP code: `node scripts/totp.mjs pgm`. Captured email: http://127.0.0.1:55424.

## Checks

```bash
npm run lint && npm run typecheck
npm test                    # database, RLS, permission and workflow tests (resets the local DB)
npm run test:e2e            # Playwright end-to-end and accessibility tests
npx tsx scripts/smoke.ts pgm /dashboard /lodges     # quick page checks as a user
```

## Documentation

| Topic | File |
|---|---|
| Architecture and domains | `docs/architecture.md` |
| Decisions | `docs/adr/` |
| Database schema and ERD (generated) | `docs/database-schema.md` |
| Permissions matrix (generated) | `docs/permissions-matrix.md` |
| Feature activation matrix (generated) | `docs/feature-activation.md` |
| Development conventions | `docs/conventions.md` |
| Deployment and environment settings | `docs/deployment.md` |
| Backup, recovery and runbooks | `docs/runbooks.md` |
| Testing and acceptance results | `docs/testing.md` |
| Administrator guide | `docs/guides/administrator.md` |
| User guides | `docs/guides/` |
| Production readiness | `docs/production-readiness.md` |
