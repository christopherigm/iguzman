"use client";

import { useTranslations } from "next-intl";
import { Box } from "@repo/ui/core-elements/box";
import { ShareButton } from "@repo/ui/core-elements/share-button";
import { AddToCartButton } from "./add-to-cart-button";
import { FavoriteButton } from "./favorite-button";

interface BuyableCardActionsProps {
  /**
   * A `food` item's card add-to-cart adds the base line - the dish with its
   * default ingredients at the "from" price - so a customer can order the
   * standard version without opening the customiser (the detail page is still
   * where ingredients are added/removed). Its favorite and its cart line are
   * both keyed `menu_item`, the kind those APIs know it by.
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
}

/**
 * The card's action row: share, favorite, add to cart.
 *
 * Every button here sits inside a card that is itself a link, so each one has to
 * swallow its click - otherwise it navigates to the item instead of doing its
 * own job.
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
}: BuyableCardActionsProps) {
  const t = useTranslations("ItemDetail");

  return (
    <Box justifyContent="space-evenly" alignItems="center" gap={6}>
      <ShareButton
        title={name}
        text={shareText}
        label={t("share")}
        copiedLabel={t("linkCopied")}
        url={shareUrl}
        size="sm"
        stopPropagation
      />
      <FavoriteButton
        kind={kind === "food" ? "menu_item" : kind}
        id={id}
        initialFavorite={initialFavorite}
        isLoggedIn={isLoggedIn}
        size="sm"
        stopPropagation
      />
      <AddToCartButton
        kind={kind}
        id={id}
        cartLineId={cartLineId}
        isLoggedIn={isLoggedIn}
        disabled={!inStock}
        size="sm"
        stopPropagation
      />
    </Box>
  );
}
