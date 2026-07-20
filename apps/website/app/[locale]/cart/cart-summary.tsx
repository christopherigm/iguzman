import type { CartTotal } from "@/lib/cart";
import { getSystem } from "@/lib/system";
import { CartSummaryCard } from "./cart-summary-card";

interface CartSummaryProps {
  totals: CartTotal[];
  /** Total quantity, matching the navbar's count - not the number of lines. */
  count: number;
}

/**
 * The signed-in customer's order summary.
 *
 * Its only job beyond `CartSummaryCard` (which does all the rendering, shared
 * with the guest cart) is deciding **on the server** whether checkout can run:
 * whether this tenant has Stripe connected, and whether the cart is
 * single-currency. Settling it here is what stops the button flickering from
 * enabled to disabled after hydration. Django re-checks both - this only drives
 * what the customer sees.
 */
export async function CartSummary({ totals, count }: CartSummaryProps) {
  const system = await getSystem();

  const blockedReason = !system?.stripe_configured
    ? ("unavailable" as const)
    : totals.length > 1
      ? ("mixedCurrency" as const)
      : null;

  return (
    <CartSummaryCard
      totals={totals}
      count={count}
      blockedReason={blockedReason}
      isGuest={false}
    />
  );
}
