/**
 * The browser's calls into the booking flow.
 *
 * Both go through this app's own route handlers (`/api/booking/*`), never
 * straight to Django - the same rule every other browser→API call here follows,
 * and what keeps `API_URL` server-only.
 *
 * The types and the pure formatters live in `./booking-shared` so a client
 * component can import them without pulling anything server-only into its
 * bundle; they are re-exported here so callers have one import either way.
 */
import type {
  AvailabilityResponse,
  BookingFulfillment,
  BookingPaymentOption,
} from "./booking-shared";

export * from "./booking-shared";

/** What a failed booking came back with. `code` is the API's own machine
 *  string (`SLOT_UNAVAILABLE`, `PAYMENTS_UNAVAILABLE`, …), which is what the
 *  form branches on - never the human `detail`, which is localised prose. */
export class BookingError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(message: string, code: string, status: number) {
    super(message);
    this.name = "BookingError";
    this.code = code;
    this.status = status;
  }
}

/**
 * The bookable slots for a service, optionally at a given branch.
 *
 * `signal` is not optional in practice: the calendar refetches whenever the
 * branch or the visible month changes, and without it a slow first response can
 * land after a faster second one and repaint the previous branch's times.
 */
export async function fetchAvailability(
  params: {
    service: number;
    branch?: number | null;
    start?: string;
    days?: number;
  },
  signal?: AbortSignal,
): Promise<AvailabilityResponse> {
  const search = new URLSearchParams({ service: String(params.service) });
  if (params.branch != null) search.set("branch", String(params.branch));
  if (params.start) search.set("start", params.start);
  if (params.days) search.set("days", String(params.days));

  const res = await fetch(`/api/booking/availability/?${search.toString()}`, {
    signal,
  });
  const data: unknown = await res.json().catch(() => ({}));
  if (!res.ok) {
    const body = data as { detail?: string; code?: string };
    throw new BookingError(
      body.detail ?? "Could not load available times.",
      body.code ?? "AVAILABILITY_ERROR",
      res.status,
    );
  }
  return data as AvailabilityResponse;
}

export interface BookingRequest {
  service: number;
  branch?: number | null;
  fulfillment: BookingFulfillment;
  /** An absolute instant with an offset, straight from the availability payload.
   *  Never a local "2026-08-12 10:00" - see `lib/booking-shared`. */
  starts_at: string;
  payment_option: BookingPaymentOption;
  address?: string;
  notes?: string;
  locale: string;
  contact: { name: string; email: string; phone: string };
}

/** Where the browser goes next: Stripe's hosted page, or straight to the order. */
export interface BookingResult {
  /** Present when the customer is paying now. */
  url?: string;
  /** Present when they are not - a path on this site. */
  redirect?: string;
  order_id: string;
  booking_id: number;
}

export async function createBooking(
  payload: BookingRequest,
): Promise<BookingResult> {
  const res = await fetch("/api/booking/checkout/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data: unknown = await res.json().catch(() => ({}));
  if (!res.ok) {
    const body = data as { detail?: string; code?: string };
    throw new BookingError(
      body.detail ?? "Could not complete the booking.",
      body.code ?? "BOOKING_ERROR",
      res.status,
    );
  }
  return data as BookingResult;
}
