# ADR 0003: Per-transaction session permission cache

Status: accepted, 25 October 2026

## Context
Evaluating permissions per row in each policy (several queries per call) made Lodge overview queries take about 8 seconds and hit the statement timeout.

## Decision
`app.session_cache()` computes the caller's account, effective permissions, allocated Lodges and portal Lodges once per transaction and stores them in a transaction-local setting keyed by user id and assurance level. Writes to access-related tables clear it.

## Consequences
Same rules, evaluated once. The cache cannot leak across requests (transaction-local) or survive an identity change (key check).
