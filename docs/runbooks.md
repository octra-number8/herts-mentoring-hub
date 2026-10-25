# Operations runbooks and backup and recovery

## Backups

| What | How | Frequency | Retention |
|---|---|---|---|
| Database (all tables, auth users) | Supabase daily backups (Pro) plus point-in-time recovery on production | Continuous / daily | 7 days (PITR), per plan |
| Database (independent copy) | `./scripts/backup.sh --linked` → `schema.sql`, `data.sql`, checksums | Weekly and before every release with a migration | 12 months, encrypted, off-platform |
| Storage files (documents, Academy media, certificates, import files, evidence) | `npx tsx scripts/storage-backup.ts backup <dir>` (part of `backup.sh`) | Weekly | 12 months |
| Configuration | In the database (feature settings, roles, workflows, templates) and in Vercel/Supabase settings (document them in the Province's password manager) | On change | n/a |

**Supabase database backups do not include Storage files.** Always run the storage backup too.

Store independent backups encrypted (for example an encrypted archive in the Province's approved cloud storage). They contain personal data once live data is loaded.

## Restore procedure

1. Decide the scope: whole database (disaster), point in time (bad change), or individual records.
2. **Point in time:** Supabase Dashboard → Database → Backups → restore to a timestamp. This replaces the database; announce downtime first.
3. **From an independent backup:**
   ```
   psql "$DB_URL" -f backups/<stamp>/schema.sql      # empty project only
   psql "$DB_URL" -f backups/<stamp>/data.sql
   ENV_FILE=.env.production npx tsx scripts/storage-backup.ts restore backups/<stamp>/storage
   ```
   The storage restore verifies each file's SHA-256 against the manifest.
4. Verify: sign in as a test account, check the audit log's latest entries, run `select count(*)` on key tables against the backup's counts, open a document and a certificate.
5. Record the incident and restore in the decisions log.

The restore drill (`scripts/restore-drill.sh`) is run before go-live and quarterly; results go in `docs/testing.md`.

## Routine operations

### Email is not arriving
1. Administration → System health: check the email outbox (queued, failed) and integration failures.
2. Failed with a permanent error (e.g. invalid address): fix the address on the person record; retry from the health page.
3. Many failures: check Resend's dashboard and domain verification; check `RESEND_API_KEY`.
4. Bounced or complained addresses are suppressed automatically (`comm_preferences.email_status`). Clear the status only after the member confirms a corrected address.

### Background jobs look stuck
1. System health shows the domain event backlog and workflow failures.
2. Use "Run background jobs now". Check Vercel function logs for `/api/cron/run`.
3. Failed workflow runs can be retried from Administration → Workflows. Disable a misbehaving workflow there; nothing else is affected.

### Someone leaves a Provincial appointment
1. Allocations → the Assistant → End appointment (effective today). This ends their management roles and allocations together, so no stale access remains.
2. Transfer their open tasks and requests to the successor.
3. Their historic contacts, notes and decisions stay attributed to them.

### Suspected compromised account
1. Administration → Users → the account → Suspend (signs them out and blocks sign-in).
2. Review the audit log for the account (sign-ins, exports, sensitive views).
3. Reset their MFA by removing factors in Supabase Auth, then reactivate and re-invite if appropriate.

### Activating the Lodge Mentor portal (future)
1. Only on the Provincial Grand Mentor's authorisation.
2. Administration → Features → Lodge Mentor portal → add activation for the account or Lodge, choose actions (read, create, update, export), record the reason.
3. Verify with the Lodge Mentor that only their Lodge is visible. Deactivate the same way; learning history is unaffected.

### Rotating secrets
- `SUPABASE_SERVICE_ROLE_KEY`: generate new JWT secret/keys in Supabase, update Vercel, redeploy.
- `CRON_SECRET`, `RESEND_WEBHOOK_SECRET`, `RESEND_API_KEY`: update at the source and in Vercel together, redeploy.

### Retention
Administration → Configuration → Retention: each policy can be dry-run to see how many records it would affect. Enable a policy only once the Province has agreed the retention period (A3 section 7 is still a draft).
