import { getTranslations } from "next-intl/server";
import { Grid } from "@repo/ui/core-elements/grid";
import { BuyableCard, type BuyableItem } from "@/components/buyable-card";
import type { CartRecommendation } from "@/lib/cart";
import { RecommendationsShell } from "./recommendations-shell";

interface CartRecommendationsProps {
  recommendations: CartRecommendation[];
  locale: string;
}

/**
 * The signed-in customer's "don't forget these" strip, under their cart lines.
 *
 * A server component so each card is the ordinary `BuyableCard`, which resolves
 * the per-viewer state (the heart, the admin shortcut, the request origin) the
 * way it does in every other grid - all `cache()`d per request, so N cards cost
 * one favorites read between them. The guest half is `GuestRecommendations`.
 *
 * ⚠ It renders whatever the API sent and filters nothing. Deduping, dropping
 * what is already in the cart, dropping the unbuyable and dropping a currency
 * this basket cannot pay in all happen server-side, where the whole cart is
 * visible at once - see `lib/cart.ts`'s note on `CartRecommendation`.
 */
export async function CartRecommendations({
  recommendations,
  locale,
}: CartRecommendationsProps) {
  if (recommendations.length === 0) return null;

  // `Menu.from` rather than a key of our own: every other grid in the app labels
  // a food card's "from" price with it, and a second copy could only drift.
  const [t, tMenu] = await Promise.all([
    getTranslations("Cart"),
    getTranslations("Menu"),
  ]);

  return (
    <RecommendationsShell heading={t("recommendationsHeading")}>
      {recommendations.map((recommendation) => (
        <Grid
          key={`${recommendation.kind}-${recommendation.item.id}`}
          // Two-up on a phone, three across the narrow cart column from `sm`:
          // this strip lives inside the cart's 7-of-12 column, so it gets less
          // width than a catalog grid does.
          size={{ xs: 6, sm: 4 }}
        >
          <BuyableCard
            item={
              {
                // The cart (like favorites) keys food as `menu_item`; the card
                // knows it as `food`.
                kind:
                  recommendation.kind === "menu_item"
                    ? "food"
                    : recommendation.kind,
                data: recommendation.item,
              } as BuyableItem
            }
            locale={locale}
            fromLabel={tMenu("from")}
          />
        </Grid>
      ))}
    </RecommendationsShell>
  );
}
