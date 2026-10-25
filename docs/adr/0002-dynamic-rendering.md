# ADR 0002: Dynamic rendering, Cache Components off

Status: accepted, 25 October 2026

## Context
Next.js 16 enables Cache Components by default. Every Hub page depends on the signed-in user's permissions and RLS-filtered data.

## Decision
Set `cacheComponents: false`. Pages render dynamically per request; React `cache()` deduplicates the session lookup within a request.

## Consequences
No risk of one user's data being cached for another. Slightly more server work per request, which is acceptable for a Province-sized user base.
