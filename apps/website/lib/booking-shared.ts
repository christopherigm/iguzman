/**
 * Client-safe booking types and the pure formatting helpers.
 *
 * Split from `lib/booking.ts` for the same reason `lib/orders-shared.ts` is
 * split from `lib/orders.ts`: the fetchers there import `apiFetch`, which pulls
 * in a server-only chain ending at `next/headers`, and a `"use client"`
 * component importing a *runtime value* from that module drags the whole graph
 * into its bundle and fails the build. Everything here is pure, so a client
 * component may import it freely.
 *
 * ⚠ **Every helper here takes the booking's own `timeZone` and none of them
 * fall back to the browser's.** An appointment happens at the branch's local
 * time; a customer reading their order from another country must be shown the
 * hour they are expected to arrive, not the hour on their own wall. Formatting
 * one of these instants with a bare `toLocaleString()` is the bug this module
 * exists to prevent.
 */

/** Mirrors `Booking.STATUS_CHOICES` in website-api. This is the *appointment*
 *  axis - payment lives on `Order.status`, and the two move independently. */
export type BookingStatus = "pending" | "confirmed" | "completed" | "canceled";

/** Where the work happens. `on_premises` carries the customer's own `address`. */
export type BookingFulfillment = "branch" | "on_premises";

/** What the customer chose to pay when they booked. */
export type BookingPaymentOption = "full" | "deposit" | "in_person";

/** The booking nested on a full order payload (the API's `BookingSerializer`). */
export interface Booking {
  id: number;
  status: BookingStatus;
  fulfillment: BookingFulfillment;
  branch: number | null;
  branch_name: string | null;
  /** UTC instant. Always render through `timezone`. */
  starts_at: string;
  ends_at: string;
  timezone: string;
  duration_minutes: number;
  address: string;
  notes: string;
  payment_option: BookingPaymentOption;
  deposit_percent: number;
  amount_due_now: string;
  amount_due_later: string;
  service_slug: string | null;
  /** How many people this booking covers. `1` on every non-party booking, so a
   *  consumer never has to special-case the feature being off. */
  party_size: number;
  /** The boat/guide/room assigned, live name falling back to the snapshot.
   *  Null whenever the branch defines no resource pools, which is the norm. */
  resource_name: string | null;
  /** The singular noun for that resource ("boat", "guide"). Null once the
   *  resource itself is gone - the label lives on its pool, not on the
   *  booking. */
  resource_unit_label: string | null;
}

/** The compact form on an order-history row (`BookingSummarySerializer`). */
export interface BookingSummary {
  status: BookingStatus;
  fulfillment: BookingFulfillment;
  branch_name: string | null;
  starts_at: string;
  timezone: string;
  party_size: number;
}

/** One offered start time and how big a party could still take it. */
export interface AvailabilitySlot {
  /** UTC instant. Always render through the payload's `timezone`. */
  at: string;
  /** The largest free block on a **single** resource, never the sum across
   *  them: two boats with three free seats each cannot seat a party of six. */
  seats_left: number;
}

/** A resource the customer may pick between, when its pool allows it. */
export interface AvailabilityResource {
  id: number;
  name: string;
  en_name: string;
  capacity: number;
  unit_label: string;
  en_unit_label: string;
}

/** The availability payload the calendar is painted from. */
export interface AvailabilityResponse {
  service: number;
  branch: number | null;
  timezone: string;
  duration_minutes: number;
  start: string;
  days: number;
  last_bookable_date: string;
  /** Local `YYYY-MM-DD` → the day's bookable slots. A date absent from this map
   *  cannot be selected. */
  availability: Record<string, AvailabilitySlot[]>;
  /** The party size this payload was computed for - echoed back because the API
   *  clamps what was asked to what the service accepts. */
  party: number;
  party_min: number;
  party_max: number;
  party_enabled: boolean;
  /** The resource this payload was filtered by, if any. */
  resource: number | null;
  /** Empty unless a `customer_selectable` pool applies - which is the ordinary
   *  case, and means the booking page shows no picker at all. */
  resources: AvailabilityResource[];
}

/**
 * A booking's date and time as one line, in the branch's zone.
 *
 * `timeZoneName: "short"` is included deliberately: the reader is being told
 * when to turn up somewhere, and an hour with no zone beside it is exactly the
 * ambiguity that puts someone in a chair an hour early.
 */
export function formatBookingDateTime(
  startsAt: string,
  timeZone: string,
  locale: string,
): string {
  return new Date(startsAt).toLocaleString(locale, {
    timeZone,
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

/** Just the time-of-day, for a slot button where the date is already on screen. */
export function formatSlotTime(
  isoInstant: string,
  timeZone: string,
  locale: string,
): string {
  return new Date(isoInstant).toLocaleTimeString(locale, {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Just the date, for a day heading. */
export function formatBookingDate(
  isoInstant: string,
  timeZone: string,
  locale: string,
): string {
  return new Date(isoInstant).toLocaleDateString(locale, {
    timeZone,
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

/**
 * `YYYY-MM-DD` for an instant **in a given zone** - the key format the
 * availability map uses.
 *
 * Built from `en-CA` (which formats as ISO) rather than from `toISOString()`,
 * because that would give the UTC date: an 8pm appointment in Mexico City is
 * already the next day in UTC, so the naive version files half the evening
 * slots under tomorrow and the calendar shows them on the wrong square.
 */
export function localDateKey(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/** A `Date` at local midnight of a `YYYY-MM-DD` key, for calendar arithmetic. */
export function dateFromKey(key: string): Date {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year ?? 1970, (month ?? 1) - 1, day ?? 1);
}

/** The `YYYY-MM-DD` key of a plain calendar `Date` (no zone conversion). */
export function keyFromDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}
