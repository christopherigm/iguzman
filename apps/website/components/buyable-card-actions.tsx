"use client";

import { useTranslations } from "next-intl";
import { Box } from "@repo/ui/core-elements/box";
import { Button } from "@repo/ui/core-elements/button";
import { ShareButton } from "@repo/ui/core-elements/share-button";
import { AddToCartButton } from "./add-to-cart-button";
import type { AddToCartCustomization } from "./add-to-cart-button";
import { FavoriteButton } from "./favorite-button";

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
  /** Item name - the share sheet's title. */
  name: string;
  /**
   * Share-sheet blurb, already collapsed by `toShareDescription`. The card calls
   * that helper - it lives in `lib/metadata`, which imports `next/headers` and
   * so cannot be imported from here.
   */
  shareText?: string;
  /**
   * Absolute URL of the item. Built on the server: the origin comes from the
   * request (this app is multi-tenant by host), and ShareButton's default - the
   * current page - would be the grid rather than the item.
   */
  shareUrl: string;
  initialFavorite: boolean;
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
}

/**
 * The card's action row: share and favorite grouped at one end, the cart CTA at
 * the other.
 *
 * The two ends are deliberately far apart: the cart button is the row's only
 * decision, and reading as one of three equal circles is what made a card's
 * primary action invisible. Nothing here has to swallow its click any more -
 * only the card's photo and its name are links, so these buttons sit outside
 * every anchor.
 */
export function BuyableCardActions({
  kind,
  id,
  name,
  shareText,
  shareUrl,
  initialFavorite,
  isLoggedIn,
  cartLineId,
  inStock,
  customize,
  bookingSlug = null,
}: BuyableCardActionsProps) {
  const t = useTranslations("ItemDetail");
  const tBooking = useTranslations("Booking");

  return (
    <Box justifyContent="space-between" alignItems="center" gap={6}>
      <Box alignItems="center" gap={6}>
        <ShareButton
          title={name}
          text={shareText}
          label={t("share")}
          copiedLabel={t("linkCopied")}
          url={shareUrl}
          size="sm"
        />
        <FavoriteButton
          kind={kind === "food" ? "menu_item" : kind}
          id={id}
          initialFavorite={initialFavorite}
          isLoggedIn={isLoggedIn}
          size="sm"
        />
      </Box>

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
          customize={customize}
        />
      )}
    </Box>
  );
}
