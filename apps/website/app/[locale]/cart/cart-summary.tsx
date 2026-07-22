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
 * with the guest cart) is deciding **on the server** which payment methods this
 * tenant offers - Stripe, pay-in-store, pay-on-delivery, each on its own switch -
 * and whether the cart is single-currency. Settling it here is what stops the
 * options flickering after hydration. Django re-checks every one - this only
 * drives what the customer sees.
 */
export async function CartSummary({ totals, count }: CartSummaryProps) {
  const system = await getSystem();

  return (
    <CartSummaryCard
      totals={totals}
      count={count}
      methods={{
        online: system?.stripe_configured ?? false,
        inStore: system?.pay_in_store_enabled ?? false,
        onDelivery: system?.pay_on_delivery_enabled ?? false,
      }}
      mixedCurrency={totals.length > 1}
      isGuest={false}
    />
  );
}
