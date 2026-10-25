# ADR 0005: Catalogue-based workflow automation

Status: accepted, 25 October 2026

## Decision
Workflows combine a fixed catalogue of triggers, conditions and actions (`src/server/workflows/catalogue.ts`). No user-supplied code. Runs are idempotent per workflow and event, retried with backoff, can require approval, can be dry-run, and check at run time that the workflow's author still holds the permissions each action needs. Confidential concerns never enter automation.
