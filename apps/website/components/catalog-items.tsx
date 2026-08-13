import { getTranslations, getLocale } from "next-intl/server";
import {
  getFeaturedProducts,
  getFeaturedServices,
  getFeaturedMenuItems,
  type FeaturedService,
  type MenuItemDetail,
} from "@/lib/catalog";
import { Box } from "@repo/ui/core-elements/box";
import { Button } from "@repo/ui/core-elements/button";
import { Typography } from "@repo/ui/core-elements/typography";
import { Grid } from "@repo/ui/core-elements/grid";
import { MENU_ALL_PATH } from "@/lib/menu-kinds";
import { BuyableCard, type BuyableItem } from "./buyable-card";
import "./catalog-items.css";

/**
 * A stable pseudo-random ordering key for one item on a given day. An FNV-1a
 * hash over the item's kind, id and the day seed: deterministic per day, but
 * spread out enough that the grid reads as shuffled rather than "products then
 * services".
 */
function shuffleKey(item: BuyableItem, daySeed: number): number {
  const input = `${item.kind}-${item.data.id}-${daySeed}`;
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export async function CatalogItems() {
  const [products, services, menuItems, locale, t, tMenu] = await Promise.all([
    getFeaturedProducts(),
    getFeaturedServices(),
    getFeaturedMenuItems(),
    getLocale(),
    getTranslations("CatalogItems"),
    getTranslations("Menu"),
  ]);

  if (products.length === 0 && services.length === 0 && menuItems.length === 0)
    return null;

  // Interleave products and services in a stable, per-day order. Keying the sort
  // on a hash of each item's identity plus the calendar day keeps the order
  // identical across re-renders within a day, so a `router.refresh()` triggered
  // by liking or adding to cart never reshuffles the grid - while still rotating
  // the mix to something fresh each day.
  // eslint-disable-next-line react-hooks/purity
  const daySeed = Math.floor(Date.now() / 86_400_000);
  const items: BuyableItem[] = [
    ...products.map((data): BuyableItem => ({ kind: "product", data })),
    ...services.map(
      (data: FeaturedService): BuyableItem => ({ kind: "service", data }),
    ),
    ...menuItems.map(
      (data: MenuItemDetail): BuyableItem => ({ kind: "food", data }),
    ),
  ].sort((a, b) => shuffleKey(a, daySeed) - shuffleKey(b, daySeed));

  // One "see more" per family that actually has a card in the grid above -
  // keyed on what was rendered, not on the tenant's counts, so the row never
  // offers a listing the visitor has just been shown nothing from. A food CTA
  // goes to the whole menu (`MENU_ALL_PATH`), since the featured dishes can be
  // any mix of the five kinds.
  const seeMore = [
    ...(services.length > 0
      ? [{ label: t("seeMoreServices"), href: "/categories/services" }]
      : []),
    ...(products.length > 0
      ? [{ label: t("seeMoreProducts"), href: "/categories/products" }]
      : []),
    ...(menuItems.length > 0
      ? [{ label: t("seeMoreMenuItems"), href: MENU_ALL_PATH }]
      : []),
  ];

  return (
    <section className="catalog-items-section">
      <Box className="highlights-header">
        <Typography as="h2" variant="h2" className="section-title">
          {t("heading")}
        </Typography>
      </Box>
      <Grid container spacing={2}>
        {items.map((item) => (
          <Grid
            key={`${item.kind}-${item.data.id}`}
            size={{ xs: 6, sm: 3 }}
          >
            <BuyableCard
              item={item}
              locale={locale}
              productLabel={t("productLabel")}
              serviceLabel={t("serviceLabel")}
              menuLabel={t("menuLabel")}
              fromLabel={tMenu("from")}
            />
          </Grid>
        ))}
      </Grid>
      <Box justifyContent="center" flexWrap="wrap" gap={12} marginTop={32}>
        {seeMore.map((link) => (
          <Button
            key={link.href}
            text={link.label}
            href={link.href}
            kind="primary"
            size="lg"
          />
        ))}
      </Box>
    </section>
  );
}
