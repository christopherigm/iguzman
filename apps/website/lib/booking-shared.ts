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
}

/** The compact form on an order-history row (`BookingSummarySerializer`). */
export interface BookingSummary {
  status: BookingStatus;
  fulfillment: BookingFulfillment;
  branch_name: string | null;
  starts_at: string;
  timezone: string;
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
  /** Local `YYYY-MM-DD` → the day's bookable start instants, as UTC ISO strings.
   *  A date absent from this map cannot be selected. */
  availability: Record<string, string[]>;
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
