# ADR 0001: Enforce access in the database

Status: accepted, 25 October 2026

## Context
The brief requires that a Learning User cannot reach Provincial information "even when attempting direct API requests, manipulated URLs, storage paths or database queries", and that feature flags never override permissions.

## Decision
Row-level security on every table; all user reads and writes use the user's Supabase session. Permission logic lives in `app.*` SQL helpers used by every policy. Multi-step changes are `security definer` functions with explicit checks. The service-role key is used only by system processes.

## Consequences
The UI cannot leak data it is not given. Tests exercise the real database as each role. Policies must be written carefully and performance managed (ADR 0003).
