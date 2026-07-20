"use client";

import type { CartTotal } from "@/lib/cart";
import { CartSummaryCard } from "./cart-summary-card";

interface GuestCartSummaryProps {
  totals: CartTotal[];
  count: number;
  /** `stripe_configured` for this tenant, read on the server and passed down. */
  stripeConfigured: boolean;
}

/**
 * The guest's order summary - `CartSummary`'s client twin.
 *
 * Same two blocking rules, decided from the same two facts. The Stripe half
 * still comes from the server (the page reads `getSystem()` and passes it in);
 * only the currency half has to be computed here, because a guest's totals do
 * not exist until the browser's references have been resolved.
 */
export function GuestCartSummary({
  totals,
  count,
  stripeConfigured,
}: GuestCartSummaryProps) {
  const blockedReason = !stripeConfigured
    ? ("unavailable" as const)
    : totals.length > 1
      ? ("mixedCurrency" as const)
      : null;

  return (
    <CartSummaryCard
      totals={totals}
      count={count}
      blockedReason={blockedReason}
      isGuest
    />
  );
}
