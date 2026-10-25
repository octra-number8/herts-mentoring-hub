# ADR 0006: Transactional outbox for all email

Status: accepted, 25 October 2026

## Decision
Nothing sends email directly. Messages are queued in `email_outbox` with an idempotency key and a category (security, operational, learning, events, news). The processor applies preferences and suppression, sends through the configured driver (SMTP capture locally, Resend in production), retries with exponential backoff, and records failures for the health page. Imported members are never emailed automatically.
