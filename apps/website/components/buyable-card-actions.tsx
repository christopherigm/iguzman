"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Box } from "@repo/ui/core-elements/box";
import { Button } from "@repo/ui/core-elements/button";
import { MAX_GUEST_QUANTITY } from "@/lib/guest-cart";
import { AddToCartButton, useInCart } from "./add-to-cart-button";
import type { AddToCartCustomization } from "./add-to-cart-button";
import { QuantityStepper } from "./quantity-stepper";

/**
 * Pre-paint on the client, plain effect on the server render pass - the
 * measurement below has to land before the browser paints (a row that wraps for
 * one frame is the very thing this fixes), and `useLayoutEffect` warns during
 * SSR. Same shape as `@repo/ui`'s `HeroReveal`.
 */
const useIsomorphicLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;

/**
 * How much of the row's full form the card it is on can hold. Every step comes
 * out of the CTA, never out of the stepper - "how many" is a whole control and
 * a shrunken one is a worse target on the phone where the space ran out in the
 * first place - and the row settles on the first step that fits:
 *
 * | 0 | the stepper, and the CTA with its cart glyph and its verb |
 * | 1 | the glyph goes - the verb is what tells add from remove   |
 * | 2 | the verb goes too: the CTA is the glyph alone, at `sm`    |
 *
 * The last step drops the button to `sm` as well as to the glyph because at
 * `md` it still does not fit the narrowest card this app draws - half of a
 * 360px phone, where the row is 142px and the stepper is 102 of them. It is
 * the size the share and heart buttons on the same card already wear.
 *
 * That last step is what makes this safe in every locale: "Add" is
 * "Hinzufügen" in German and "Adicionar" in Portuguese, half again as wide, so
 * there is no width at which a labelled button is guaranteed to fit. A glyph is
 * the same size in all five, and the verb it drops is still the button's
 * `title` and its accessible name.
 */
const MAX_DENSITY = 2;

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
 *
 * **The row is measured, and gives things up until it fits.** A card is as wide
 * as whatever grid it landed in - half a phone on the landing, a quarter of a
 * tablet on a category page, a third of a flyer's copy column - and none of
 * that is a breakpoint this component could read: two cards at the same
 * breakpoint are different widths, and the same card is a different width in
 * each of five locales. So the row asks the card itself - "did what I am
 * holding land on one line?" - and `density` is the answer, re-asked from the
 * top whenever the card's width or its set of controls changes. Nothing here is
 * a magic number; `MAX_DENSITY` says what each step gives up.
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
  const rowRef = useRef<HTMLDivElement | null>(null);
  const [density, setDensity] = useState(0);
  // What the last walk was an answer *to*. When it changes the answer is stale,
  // whatever it was, and the row goes back to its full form to be re-measured.
  const measuredRef = useRef("");
  // Held only to re-render on a resize, so the walk below runs again: the row's
  // width is read from the DOM, not from here, or the first pass would have to
  // wait for this state to catch up and would land after the first paint.
  const [, setWidth] = useState(0);

  // The same answer the add button reaches on its own - a signed-in customer's
  // is the server's `cartLineId`, a guest's is a lookup in localStorage - shared
  // through one hook so the stepper cannot come to disagree with the button it
  // sits beside about whether this item is already in the cart.
  const inCart = useInCart(kind, id, cartLineId, isLoggedIn);

  // No stepper against a booking CTA either: a `/booking/<slug>` link adds
  // nothing to a cart, so a number beside it would count nothing.
  const showStepper = !compact && !bookingSlug && !inCart && inStock;

  // Tighten one step per pass until what the row is holding fits on one line.
  // No dependency list: every render is a new arrangement to measure, and the
  // walk costs nothing once it stops, because it stops at the first fit. It
  // sets state straight out of the layout effect on purpose - React re-renders
  // that synchronously, before the browser paints, which is what keeps the
  // walk's intermediate steps off the screen. Deferring it (a microtask, an
  // animation frame) hands the update to the scheduler instead, and the reader
  // watches the row tighten itself one step at a time.
  useIsomorphicLayoutEffect(() => {
    const row = rowRef.current;
    if (!row) return;

    // A different card width or a different set of controls (the stepper goes
    // once the item is in the cart) is a different question - so the row starts
    // over at its full form rather than keeping what the last arrangement was
    // forced down to.
    const question = `${Math.round(row.clientWidth)}|${showStepper}`;
    if (measuredRef.current !== question) {
      measuredRef.current = question;
      if (density !== 0) {
        setDensity(0);
        return;
      }
    }

    if (density >= MAX_DENSITY) return;
    const [first, second] = row.children;
    // Two controls: the CTA having been pushed onto a second line *is* the
    // question, so it is read off the two boxes rather than from the row's
    // overflow - a wrapped row reports no overflow at all, which is exactly how
    // the button came to sit under the stepper unnoticed.
    //
    // ⚠ Two boxes sharing a line *always* overlap vertically, which is the only
    // reliable test here: the row centres its controls, so the shorter of the
    // two sits a few pixels lower than the taller one and a plain "is its top
    // below the other's top?" reads every fitting row as a wrapped one - and
    // walks every card straight down to the glyph.
    const wrapped =
      first instanceof HTMLElement &&
      second instanceof HTMLElement &&
      second.getBoundingClientRect().top >=
        first.getBoundingClientRect().bottom;
    // One control (in the cart, a booking, a compact card): nothing to wrap
    // under, so a CTA too wide for its card runs past the edge instead. A
    // sub-pixel difference is not an overflow - both figures are rounded, and a
    // fractional layout would otherwise tighten a row that already fits.
    const overflows = row.scrollWidth > row.clientWidth + 1;
    if (!wrapped && !overflows) return;
    setDensity((d) => Math.min(d + 1, MAX_DENSITY));
  });

  // A card that changes width - a rotated phone, a dragged window, a grid that
  // re-columns at a breakpoint - has to re-ask the question above, and only a
  // render runs it. That is all this does; the reset itself belongs with the
  // walk, which is also where a change of *controls* is noticed. Only the row's
  // own width can trigger it: giving something up changes what is inside the
  // row, never the row itself, so the walk cannot feed this observer.
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      const width = Math.round(entry.contentRect.width);
      setWidth((previous) => (previous === width ? previous : width));
    });
    if (rowRef.current) observer.observe(rowRef.current);
    return () => observer.disconnect();
  }, []);

  return (
    <Box
      ref={rowRef}
      justifyContent={showStepper ? "space-between" : "center"}
      alignItems="center"
      // Left wrapping, deliberately, even though a wrapped row is the thing
      // being fixed: the walk above only runs once the card has hydrated, and
      // until then a CTA on its own second line is a card that still works,
      // where a clipped one would be a card with no way to buy from it.
      flexWrap="wrap"
      // The last step buys its remaining pixels here too - the gap is the only
      // width on the row that belongs to neither control.
      gap={density >= MAX_DENSITY ? 6 : 8}
      minWidth={0}
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
          // The booking CTA drops its glyph on the same first step, for the
          // same reason - but never its label: it leads somewhere, and a bare
          // calendar circle on a card would not say where.
          icon={density === 0 ? "/icons/calendar.svg" : undefined}
          title={tBooking("bookNow")}
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
          display={density >= MAX_DENSITY ? "icon" : "button"}
          buttonKind="warning"
          short
          showIcon={density === 0}
          size={density >= MAX_DENSITY ? "sm" : "md"}
          quantity={quantity}
          onAdded={() => setQuantity(1)}
          customize={customize}
        />
      )}
    </Box>
  );
}
