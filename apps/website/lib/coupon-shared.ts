/**
 * Coupon display helpers and the public coupon payload.
 *
 * The **client-safe half** of the coupon surface, split from anything that
 * fetches, exactly as `orders-shared.ts` is split from `orders.ts` and
 * `booking-shared.ts` from `booking.ts` - a `"use client"` component importing a
 * runtime value from a fetcher module drags `next/headers` into its bundle and
 * fails the build. Every consumer here is a client component: the cart's coupon
 * box, the POS till, the CMS list and form, and the four flyer templates.
 *
 * ⚠ **Nothing here decides whether a coupon may be used.** These format what the
 * API already said. The verdict comes from `POST /api/coupons/validate/` and is
 * re-derived again inside checkout - a discount computed in the browser is a
 * price the browser chose.
 */

import { formatPrice } from "./price";

/** How a coupon's `value` is read: a percentage, or an amount in `currency`. */
export type CouponKind = "percent" | "fixed";

/**
 * What a visitor may see about a coupon, from `GET /api/coupons/<code>/`.
 *
 * Deliberately far narrower than the CMS payload: the landing page is reachable
 * by anyone holding the code, so it carries what the offer *is* and nothing
 * about how the campaign is performing.
 */
export interface PublicCoupon {
  code: string;
  description: string;
  kind: CouponKind;
  value: string;
  currency: string;
  min_order_amount: string;
  expires_at: string | null;
  /**
   * The API's verdict, minus the basket-shaped checks it cannot make without a
   * cart. False for an expired, disabled or fully-redeemed coupon - which still
   * answers 200, so the page can say "this offer has ended" rather than showing
   * a not-found for a code the tenant really did print.
   */
  valid: boolean;
}

/** What `POST /api/coupons/validate/` answers for a code against a live cart. */
export interface CouponQuote {
  code: string;
  kind: CouponKind;
  value: string;
  currency: string;
  subtotal: string;
  discount: string;
  total: string;
}

/**
 * The stable refusal codes the API returns, mapped to `Cart` message keys.
 *
 * The API sends a code and an English `detail`; the wording in five languages
 * belongs here, so `detail` is only ever a fallback for a code this map has not
 * caught up with yet.
 */
export const COUPON_ERROR_MESSAGES: Record<string, string> = {
  COUPON_NOT_FOUND: "couponNotFound",
  COUPON_INACTIVE: "couponInactive",
  COUPON_NOT_STARTED: "couponNotStarted",
  COUPON_EXPIRED: "couponExpired",
  COUPON_EXHAUSTED: "couponExhausted",
  COUPON_WRONG_CURRENCY: "couponWrongCurrency",
  COUPON_MIN_ORDER: "couponMinOrder",
  COUPON_ERROR: "couponError",
  CART_EMPTY: "empty",
};

/**
 * The offer as one short string: "20%" or "$150".
 *
 * Deliberately without the word "off" - that word is a translation, and this
 * module is imported by the flyer templates, the cart and the CMS list, which
 * each need it in a different grammatical position. They append their own.
 *
 * A percentage prints as a whole number when it is one ("20%", never "20.00%"),
 * because that is how a discount is written on every poster anyone has read.
 */
export function couponValueLabel(
  kind: string,
  value: string,
  currency: string,
): string {
  if (kind === "fixed") return formatPrice(value, currency);
  const num = Number(value);
  if (!Number.isFinite(num)) return `${value}%`;
  return `${Number.isInteger(num) ? num : num.toFixed(2)}%`;
}

/**
 * Whether a coupon's `min_order_amount` is a real condition.
 *
 * The column defaults to "0.00" and is stored as a decimal string, so a plain
 * truthiness check on it is `true` for every coupon that has no minimum at all.
 */
export function hasMinOrder(minOrderAmount: string | null | undefined): boolean {
  return Number(minOrderAmount ?? 0) > 0;
}
