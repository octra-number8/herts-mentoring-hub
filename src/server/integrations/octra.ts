import "server-only";
import { serverEnv } from "@/lib/env";

/**
 * Octra-Lodge adapter.
 *
 * Paid and externally managed events are booked in Octra-Lodge, which stays the
 * authoritative record of bookings and of all money. The Hub links out ("Book
 * through Octra-Lodge") using `events.external_booking_url`, a link the organiser
 * pastes explicitly: we never guess Octra-Lodge URL patterns.
 *
 * What Octra-Lodge is today (inspected read-only): a multi-tenant Supabase
 * Postgres project, one tenant per Lodge, with no HTTP API and no edge functions.
 * Relevant tables:
 *   lodge(id, name, number text, display_name, public_slug, status)
 *   event(id, lodge_id, name, description, status, starts_at, ends_at, timezone, venue_name,
 *         venue_address, capacity, currency, is_public, public_booking)
 *   event_ticket_type(event_id, name, unit_price_minor, quantity, seats_consumed)
 *   event_booking(id, event_id, reference, status, purchaser_member_id, purchaser_name,
 *                 purchaser_email, confirmed_at, pending_expires_at)
 *   event_guest(id, booking_id, event_id, full_name, email, status, qr_token, checked_in_at,
 *               lodge_name, lodge_number)
 *   event_check_in(guest_id, method, result, occurred_at)
 *   event_payment / event_refund: never copied. Money stays in Octra-Lodge.
 *
 * A future connection needs a read-only, Province-scoped view or API agreed with
 * Octra-Lodge. Cross-tenant read access to Octra-Lodge's database must not be
 * granted to the Hub. Until that exists this adapter reports "not configured"
 * and never invents data.
 *
 * Mapping, once connected:
 *   - Octra event id            -> events.external_ref (provider 'octra_lodge')
 *   - event_booking.reference   -> external_booking_refs.external_booking_id
 *   - event_booking.status      -> external_booking_refs.external_status
 *   - purchaser / guest email   -> external_booking_refs.person_id, only when it matches
 *                                  exactly one existing person. People are never created.
 *   - event_guest.checked_in_at -> optional attendance evidence, matched by email in the
 *                                  same way; confirmed by an organiser, never automatic.
 */

export type OctraLodge = { id: string; name: string; number: string; displayName: string | null; publicSlug: string | null; status: string };

export type OctraEvent = {
  id: string;
  lodgeId: string;
  name: string;
  description: string | null;
  status: string;
  startsAt: string;
  endsAt: string | null;
  timezone: string | null;
  venueName: string | null;
  venueAddress: string | null;
  capacity: number | null;
  currency: string | null;
  isPublic: boolean;
  publicBooking: boolean;
  /** Seats taken across ticket types (sum of event_ticket_type.seats_consumed). Prices are not mirrored. */
  seatsConsumed: number | null;
};

export type OctraBooking = {
  id: string;
  eventId: string;
  reference: string;
  status: string;
  purchaserMemberId: string | null;
  purchaserName: string | null;
  purchaserEmail: string | null;
  confirmedAt: string | null;
  pendingExpiresAt: string | null;
};

export type OctraGuest = {
  id: string;
  bookingId: string;
  eventId: string;
  fullName: string;
  email: string | null;
  status: string;
  checkedInAt: string | null;
  lodgeName: string | null;
  lodgeNumber: string | null;
};

export type OctraResult<T> = { ok: true; data: T } | { ok: false; reason: "not_configured" | "not_implemented" | "error"; message: string };

export interface OctraAdapter {
  /** Whether an agreed connection has been configured. */
  configured(): boolean;
  /** Events Octra-Lodge publishes for this Province. */
  fetchEvents(opts?: { from?: string; to?: string }): Promise<OctraResult<OctraEvent[]>>;
  /** Bookings (and their guests) for one Octra-Lodge event. */
  fetchBookings(eventId: string): Promise<OctraResult<{ bookings: OctraBooking[]; guests: OctraGuest[] }>>;
}

const NOT_CONFIGURED = "Octra-Lodge is not connected. Bookings are managed in Octra-Lodge directly.";
const NOT_IMPLEMENTED = "Octra-Lodge settings are present, but no read-only, Province-scoped view or API has been agreed with Octra-Lodge yet.";

class UnconfiguredOctraAdapter implements OctraAdapter {
  configured() {
    const env = serverEnv();
    return Boolean(env.octraApiBase && env.octraApiKey);
  }
  async fetchEvents(): Promise<OctraResult<OctraEvent[]>> {
    return this.configured() ? { ok: false, reason: "not_implemented", message: NOT_IMPLEMENTED } : { ok: false, reason: "not_configured", message: NOT_CONFIGURED };
  }
  async fetchBookings(): Promise<OctraResult<{ bookings: OctraBooking[]; guests: OctraGuest[] }>> {
    return this.configured() ? { ok: false, reason: "not_implemented", message: NOT_IMPLEMENTED } : { ok: false, reason: "not_configured", message: NOT_CONFIGURED };
  }
}

export const octra: OctraAdapter = new UnconfiguredOctraAdapter();

/** Shape of an external_booking_refs row for a booking (used once a connection exists). */
export function toExternalRef(orgId: string, hubEventId: string, b: OctraBooking, personId: string | null) {
  return { org_id: orgId, event_id: hubEventId, provider: "octra_lodge", external_booking_id: b.reference, external_status: b.status, person_id: personId };
}

/** Only https links to an external booking page are shown to members. */
export function safeBookingUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.protocol === "https:" ? u.toString() : null;
  } catch {
    return null;
  }
}
