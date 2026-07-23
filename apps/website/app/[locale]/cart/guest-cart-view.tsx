"use client";

import { useEffect, useState } from "react";
import { Box } from "@repo/ui/core-elements/box";
import { Grid } from "@repo/ui/core-elements/grid";
import { useGuestState } from "@/hooks/use-guest-cart";
import { removeGuestCartLine, setGuestCartQuantity } from "@/lib/guest-cart";
import type { Cart } from "@/lib/cart";
import { CartLine } from "./cart-line";
import { GuestCartSummary } from "./guest-cart-summary";

interface GuestCartViewProps {
  locale: string;
  productLabel: string;
  serviceLabel: string;
  menuLabel: string;
  /** Whether this tenant can take payments at all - `stripe_configured`, read
   *  on the server so the checkout button never flickers from enabled to
   *  disabled after hydration. */
  stripeConfigured: boolean;
  /** The two offline payment switches, read on the server alongside Stripe. */
  payInStoreEnabled: boolean;
  payOnDeliveryEnabled: boolean;
  /** The empty-cart call to action plus the Categories grid, rendered on the
   *  server (it is async and reads the catalog) and handed down as an element
   *  because this component cannot render a server component itself. */
  emptyState: React.ReactNode;
}

/**
 * The cart page for a visitor with no account.
 *
 * localStorage holds only references, so this posts them to
 * `/api/guest/resolve` and renders whatever comes back - the same `Cart` payload
 * a signed-in cart is rendered from, through the same `CartLine`. Prices are
 * therefore always the catalog's, never the browser's, and a line whose item has
 * since been deleted simply does not come back.
 *
 * It re-resolves on every change to the local cart, because a quantity change
 * moves a line total *and* the summary, and only the server can price the new
 * quantity. Between the click and the response, `CartLine`'s own optimistic
 * quantity is what the customer sees, so the round-trip is invisible.
 */
export function GuestCartView({
  locale,
  productLabel,
  serviceLabel,
  menuLabel,
  stripeConfigured,
  payInStoreEnabled,
  payOnDeliveryEnabled,
  emptyState,
}: GuestCartViewProps) {
  const guest = useGuestState();
  // `null` means "not resolved yet", which is what tells a first load apart from
  // a cart whose references all turned out to be dead. Nothing is ever set
  // synchronously in the effect below - an empty local cart is decided during
  // render instead, since the browser already knows that without asking.
  const [cart, setCart] = useState<Cart | null>(null);

  const lines = guest.cart;
  const isEmpty = lines.length === 0;

  useEffect(() => {
    if (isEmpty) return;

    // Guards against an out-of-order response overwriting a newer one: two quick
    // quantity clicks fire two resolves, and the first may land last.
    let current = true;

    const run = async () => {
      try {
        const res = await fetch("/api/guest/resolve", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cart: lines, favorites: [] }),
        });
        if (!res.ok) return;

        const data = (await res.json()) as { cart: Cart };
        if (current) setCart(data.cart);
      } catch {
        // Leave the last good cart on screen rather than blanking it; the next
        // change re-resolves.
      }
    };

    void run();

    return () => {
      current = false;
    };
  }, [lines, isEmpty]);

  // Not resolved yet - render nothing rather than flashing "your cart is empty"
  // at someone who has items.
  if (!isEmpty && cart === null) return null;

  if (isEmpty || cart === null || cart.items.length === 0) {
    return <>{emptyState}</>;
  }

  return (
    <Grid container spacing={3}>
      <Grid size={{ xs: 12, sm: 7 }}>
        <Box flexDirection="column" gap={12}>
          {cart.items.map((line) => (
            <CartLine
              key={line.id}
              line={line}
              locale={locale}
              productLabel={productLabel}
              serviceLabel={serviceLabel}
              menuLabel={menuLabel}
              // `line.id` is the reference's index in localStorage - the guest
              // equivalent of a row id. Both writes are synchronous, so they
              // always "stick": the re-resolve above is what repaints.
              onQuantityChange={(quantity) => {
                setGuestCartQuantity(line.id, quantity);
                return Promise.resolve(true);
              }}
              onRemove={() => {
                removeGuestCartLine(line.id);
                return Promise.resolve(true);
              }}
            />
          ))}
        </Box>
      </Grid>
      <Grid size={{ xs: 12, sm: 5 }}>
        <GuestCartSummary
          totals={cart.totals}
          count={cart.count}
          stripeConfigured={stripeConfigured}
          payInStoreEnabled={payInStoreEnabled}
          payOnDeliveryEnabled={payOnDeliveryEnabled}
        />
      </Grid>
    </Grid>
  );
}
