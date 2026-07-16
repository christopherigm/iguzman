"use client";

import { useTranslations } from "next-intl";
import { Box } from "@repo/ui/core-elements/box";
import { IconButton } from "@repo/ui/core-elements/icon-button";
import { ShareButton } from "@repo/ui/core-elements/share-button";
import { FavoriteButton } from "./favorite-button";

interface BuyableCardActionsProps {
  kind: "product" | "service";
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
}: BuyableCardActionsProps) {
  const t = useTranslations("ItemDetail");

  // The cart is not built yet; this button only claims its slot in the card.
  const handleAddToCart = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

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
        kind={kind}
        id={id}
        initialFavorite={initialFavorite}
        isLoggedIn={isLoggedIn}
        size="sm"
        stopPropagation
      />
      <IconButton
        icon="/icons/add-to-cart.svg"
        aria-label={t("addToCart")}
        title={t("addToCart")}
        kind="warning"
        size="sm"
        onClick={handleAddToCart}
      />
    </Box>
  );
}
