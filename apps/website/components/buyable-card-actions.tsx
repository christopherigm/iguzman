"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Box } from "@repo/ui/core-elements/box";
import { Button } from "@repo/ui/core-elements/button";
import { MAX_GUEST_QUANTITY } from "@/lib/guest-cart";
import { AddToCartButton, useInCart } from "./add-to-cart-button";
import type { AddToCartCustomization } from "./add-to-cart-button";
import { QuantityStepper } from "./quantity-stepper";

interface BuyableCardActionsProps {
  /**
   * A `food` item's card add-to-cart opens the customiser modal when the dish
   * has something to ask about - add-ons or a choice of size (see `customize`) -
   * and posts the base line when it has neither.
   * Its favorite and its cart line are both keyed `menu_item`, the kind those
   * APIs know it by.
   */
  kind: "product" | "service" | "food";
  /** The catalog item's id. */
  id: number;
  isLoggedIn: boolean;
  /**
   * The cart line for this card's item, when it is already in the cart.
   * Turns the add button into a remove one, which deletes that line.
   */
  cartLineId: number | null;
  /** The card's item is out of stock - the add button is offered disabled. */
  inStock: boolean;
  /**
   * A `food` card's add-ons, so adding from the grid asks how the customer wants
   * the dish instead of quietly choosing the defaults for them. Absent on
   * products and services, which have nothing to configure.
   */
  customize?: AddToCartCustomization;
  /**
   * The service's slug when it is sold as an appointment. Its presence
   * **replaces** the cart button with a calendar one leading to
   * `/booking/<slug>` - a specific hour at a specific place is not something a
   * cart line can hold, so offering to add it would be a lie. Null on
   * everything else, which keeps the cart button.
   */
  bookingSlug?: string | null;
  /**
   * The row as it renders on a compact card: the stepper is dropped and the
   * cart CTA is centred on its own. How many of something to buy is a decision
   * a flyer's copy column has no width to hold, and with the control gone from
   * one end "space-between" would strand the button against the right edge - so
   * the justification has to move with it.
   */
  compact?: boolean;
}

/**
 * The card's action row: how many, at one end, and the cart CTA at the other.
 *
 * The two ends are deliberately far apart: the cart button is the row's only
 * *decision*, and reading as one of several equal controls is what made a
 * card's primary action invisible when share and favorite shared this row (they
 * are on the photograph's own tab now). Nothing here has to swallow its click -
 * only the card's photo and its name are links, so these buttons sit outside
 * every anchor.
 *
 * The stepper says how many the next add will put in the cart, and nothing
 * else: it is **not** a live handle on a line that already exists. Once the item
 * is in the cart the button flips to "remove" and the stepper goes with it,
 * because the cart page's own stepper is the one thing that can change a line's
 * quantity, and a second one on a grid card could only disagree with it. The
 * count returns to one after a successful add for the same reason - what it
 * counts is the *next* add, not the last one.
 */
export function BuyableCardActions({
  kind,
  id,
  isLoggedIn,
  cartLineId,
  inStock,
  customize,
  bookingSlug = null,
  compact = false,
}: BuyableCardActionsProps) {
  const tBooking = useTranslations("Booking");
  const tCart = useTranslations("Cart");
  const [quantity, setQuantity] = useState(1);

  // The same answer the add button reaches on its own - a signed-in customer's
  // is the server's `cartLineId`, a guest's is a lookup in localStorage - shared
  // through one hook so the stepper cannot come to disagree with the button it
  // sits beside about whether this item is already in the cart.
  const inCart = useInCart(kind, id, cartLineId, isLoggedIn);

  // No stepper against a booking CTA either: a `/booking/<slug>` link adds
  // nothing to a cart, so a number beside it would count nothing.
  const showStepper = !compact && !bookingSlug && !inCart && inStock;

  return (
    <Box
      justifyContent={showStepper ? "space-between" : "center"}
      alignItems="center"
      flexWrap="wrap"
      gap={8}
    >
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

      {bookingSlug ? (
        <Button
          text={tBooking("bookNow")}
          icon="/icons/calendar.svg"
          kind="primary"
          size="md"
          href={`/booking/${bookingSlug}`}
        />
      ) : (
        <AddToCartButton
          kind={kind}
          id={id}
          cartLineId={cartLineId}
          isLoggedIn={isLoggedIn}
          disabled={!inStock}
          display="button"
          buttonKind="warning"
          short
          size="md"
          quantity={quantity}
          onAdded={() => setQuantity(1)}
          customize={customize}
        />
      )}
    </Box>
  );
}
