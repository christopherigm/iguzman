"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Box } from "@repo/ui/core-elements/box";
import { MAX_GUEST_QUANTITY } from "@/lib/guest-cart";
import { AddToCartButton, useInCart } from "./add-to-cart-button";
import { BuyNowButton } from "./buy-now-button";
import { QuantityStepper } from "./quantity-stepper";

interface ItemBuyActionsProps {
  /** Which catalog family the item belongs to. A `food` item is bought through
   *  `MenuItemCustomizer` instead - it has a selection to carry - so only the
   *  two unconfigurable families reach this component. */
  kind: "product" | "service";
  /** The catalog item's id - not the CartItem row's. */
  id: number;
  isLoggedIn: boolean;
  /** The cart line for this item when it is already in the cart; what the
   *  remove state deletes. */
  cartLineId: number | null;
  /** Out of stock - both CTAs are offered disabled. Always true for a service,
   *  which carries no stock. */
  inStock?: boolean;
  /** The localized "Buy now" label - the server passes it, as it always has. */
  buyNowText: string;
}

/**
 * A detail page's buy box actions: how many and "add to cart" on one row, with
 * "buy now" on its own beneath them.
 *
 * The two CTAs used to share a row and the page had no way to say "three of
 * these" at all - the quantity was chosen afterwards, on the cart page, which
 * is a screen away from the one where the customer decided. The stepper is the
 * one control that belongs *beside* the add button, so the express path moves
 * below rather than squeezing three controls onto a line.
 *
 * ⚠ Unlike the catalog card's row (`buyable-card-actions.tsx`), nothing here is
 * measured and nothing gives anything up: a detail page's buy box is one grid
 * cell at 100% width in every breakpoint and every locale, so a full-width row
 * has room for a stepper and a labelled button whatever "Add to cart" is called.
 *
 * The stepper says how many the **next** add will put in the cart, and nothing
 * else - it is not a live handle on a line that already exists. So it goes with
 * the add state: once the item is in the cart the button flips to "remove" and
 * the cart page's own stepper is the only thing that can change that line's
 * quantity. It returns to one after a successful add for the same reason.
 */
export function ItemBuyActions({
  kind,
  id,
  isLoggedIn,
  cartLineId,
  inStock = true,
  buyNowText,
}: ItemBuyActionsProps) {
  const tCart = useTranslations("Cart");
  const [quantity, setQuantity] = useState(1);

  // The same answer the add button reaches on its own - a signed-in customer's
  // is the server's `cartLineId`, a guest's is a lookup in localStorage - shared
  // through one hook so the stepper cannot come to disagree with the button it
  // sits beside about whether this item is already in the cart.
  const inCart = useInCart(kind, id, cartLineId, isLoggedIn);
  const showStepper = !inCart && inStock;

  return (
    <Box flexDirection="column" gap={10} width="100%">
      {/* How many, then the decision it applies to. They wrap on a very narrow
          column so neither control is crushed. */}
      <Box alignItems="center" gap={10} width="100%" flexWrap="wrap">
        {showStepper && (
          <QuantityStepper
            value={quantity}
            onChange={setQuantity}
            max={MAX_GUEST_QUANTITY}
            decreaseLabel={tCart("decrease")}
            increaseLabel={tCart("increase")}
            ariaLabel={tCart("quantity")}
          />
        )}

        <AddToCartButton
          kind={kind}
          id={id}
          cartLineId={cartLineId}
          isLoggedIn={isLoggedIn}
          disabled={!inStock}
          display="button"
          buttonKind="warning"
          size="lg"
          flex="1"
          minWidth={140}
          quantity={quantity}
          onAdded={() => setQuantity(1)}
        />
      </Box>

      {/* The express path, on its own line beneath the pair above - it takes
          the same count with it, so a customer who asked for three and pressed
          "buy now" arrives at checkout with three. */}
      <BuyNowButton
        kind={kind}
        id={id}
        isLoggedIn={isLoggedIn}
        disabled={!inStock}
        text={buyNowText}
        size="lg"
        flex="1"
        quantity={quantity}
      />
    </Box>
  );
}
