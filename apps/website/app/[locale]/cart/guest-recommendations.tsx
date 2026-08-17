"use client";

import { useTranslations } from "next-intl";
import { Grid } from "@repo/ui/core-elements/grid";
import { BuyableCardView } from "@/components/buyable-card-view";
import type { BuyableItem } from "@/components/buyable-card";
import type { CartRecommendation } from "@/lib/cart";
import { RecommendationsShell } from "./recommendations-shell";

interface GuestRecommendationsProps {
  recommendations: CartRecommendation[];
  locale: string;
  /** The request origin, for each card's share link - only the server knows it. */
  origin: string;
}

/**
 * A logged-out visitor's "don't forget these" strip.
 *
 * The same strip `CartRecommendations` draws, through `BuyableCardView` - the
 * client half of the same card - because a guest's cart is only resolved after
 * hydration and an async server component cannot be called from there. Exactly
 * the split (and the same logged-out constants) that `guest-favorites.tsx`
 * carries: no admin shortcut, no server-known heart or cart line. Each card's own
 * buttons read the real guest state from `localStorage` themselves.
 *
 * There is no fetch here: `GuestCartView` already resolved the cart, and the
 * strip arrived on that same payload - so it re-renders (and loses an item the
 * customer just added) for free on the next resolve.
 */
export function GuestRecommendations({
  recommendations,
  locale,
  origin,
}: GuestRecommendationsProps) {
  const t = useTranslations("Cart");
  const tMenu = useTranslations("Menu");

  if (recommendations.length === 0) return null;

  return (
    <RecommendationsShell heading={t("recommendationsHeading")}>
      {recommendations.map((recommendation) => (
        <Grid
          key={`${recommendation.kind}-${recommendation.item.id}`}
          size={{ xs: 6, sm: 4 }}
        >
          <BuyableCardView
            item={
              {
                kind:
                  recommendation.kind === "menu_item"
                    ? "food"
                    : recommendation.kind,
                data: recommendation.item,
              } as BuyableItem
            }
            locale={locale}
            fromLabel={tMenu("from")}
            origin={origin}
            isAdmin={false}
            editLabel=""
            isLoggedIn={false}
            initialFavorite={false}
            cartLineId={null}
          />
        </Grid>
      ))}
    </RecommendationsShell>
  );
}
