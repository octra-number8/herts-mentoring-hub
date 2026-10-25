# Octra-Lodge integration

Status: **adapter defined, not connected.** Octra-Lodge stays the authoritative system for paid and externally managed event bookings and for all payment records. The Hub never stores competing copies of payments.

## What was inspected (25 October 2026, read-only)

The Octra-Lodge Supabase project (`octra-lodge`) was inspected with the owner's permission. Nothing was changed. Findings:

- There is **no HTTP API and no edge functions**. Data lives in Octra-Lodge's own Postgres with row-level security, and the database is multi-tenant **per Lodge** (`lodge`, with a `public_slug`).
- Events: `event` (lodge_id, name, description, status, starts_at, ends_at, timezone, venue_name, venue_address, capacity, currency, is_public, public_booking) and `event_ticket_type` (price in minor units, quantity, seats consumed).
- Bookings: `event_booking` (reference, status, purchaser name and email, confirmed_at, pending expiry), `event_guest` (full name, email, status, QR token, checked_in_at, guest Lodge name and number), `event_check_in` (method, result, time).
- Payments: `event_payment`, `event_refund`, `event_booking_financial`. **Not to be copied into the Hub.**

## How the Hub handles external bookings today

- An event with `registration_mode = 'external'` and `external_provider = 'octra_lodge'` shows a "Book through Octra-Lodge" link to the organiser-supplied `external_booking_url`. The Hub refuses Hub registration for such events (tested).
- `events.external_ref` can hold the Octra-Lodge event id.
- `external_booking_refs` can hold booking references (provider, `event_booking.reference`, status) without any financial data.

## What a live connection needs (not built until agreed)

1. Octra-Lodge to expose a **read-only, Province-scoped** feed: either a database view or function granted to a dedicated role, or an HTTP endpoint, covering events the Province runs and their bookings and attendance. The Hub must **not** receive cross-tenant access to other Lodges' data in Octra-Lodge.
2. A Province (or Provincial events) tenant in Octra-Lodge, so Provincial events are not owned by an individual Lodge.
3. Agreement on matching attendees to Hub people (by email, with manual review; the Hub never creates people from booking data automatically).
4. Credentials stored as `OCTRA_API_BASE` and `OCTRA_API_KEY` in Vercel. The adapter (`src/server/integrations/octra.ts`) then maps bookings into `external_booking_refs` and verified attendance (`event_guest.checked_in_at`) into Hub attendance, which updates learning records.
