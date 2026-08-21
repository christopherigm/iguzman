"use client";

import type { CartRewards, CartTotal } from "@/lib/cart";
import { CartSummaryCard } from "./cart-summary-card";

interface GuestCartSummaryProps {
  totals: CartTotal[];
  count: number;
  /** `stripe_configured` for this tenant, read on the server and passed down. */
  stripeConfigured: boolean;
  /** `pay_in_store_enabled` / `pay_on_delivery_enabled`, likewise server-read. */
  payInStoreEnabled: boolean;
  payOnDeliveryEnabled: boolean;
  /** Always the "off" shape for a guest - there is no account to hold a balance -
   *  but passed through so `CartSummaryCard` reads one prop set for both carts. */
  rewards: CartRewards;
}

/**
 * The guest's order summary - `CartSummary`'s client twin.
 *
 * The available payment methods still come from the server (the page reads
 * `getSystem()` and passes the three flags in); only the currency check has to
 * be computed here, because a guest's totals do not exist until the browser's
 * references have been resolved.
 */
export function GuestCartSummary({
  totals,
  count,
  stripeConfigured,
  payInStoreEnabled,
  payOnDeliveryEnabled,
  rewards,
}: GuestCartSummaryProps) {
  return (
    <CartSummaryCard
      totals={totals}
      count={count}
      methods={{
        online: stripeConfigured,
        inStore: payInStoreEnabled,
        onDelivery: payOnDeliveryEnabled,
      }}
      mixedCurrency={totals.length > 1}
      rewards={rewards}
      isGuest
    />
  );
}
