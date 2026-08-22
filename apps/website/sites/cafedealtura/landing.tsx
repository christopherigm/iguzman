import { getTranslations } from "next-intl/server";
import { Button } from "@repo/ui/core-elements/button";
import { getSystem } from "@/lib/system";
import { fitSectionBackground } from "@/lib/section-background";
import { Hero } from "@/components/hero";
import { SuccessStories } from "@/components/success-stories";
import { CompanyHighlights } from "@/components/company-highlights";
import { CatalogCategories } from "@/components/catalog-categories";
import { CatalogItems } from "@/components/catalog-items";
import { Events } from "@/components/events";
import { Spotlight } from "@/components/spotlight";
import { HomepageFlyers } from "@/components/homepage-flyers";
import { FindUs } from "@/components/find-us";
import { Origin } from "./sections/origin";

/**
 * Bespoke landing for Café de Altura (cafedealtura.iguzman.com.mx) - a family
 * farm in Cruztitla (Zacatlán, Sierra Norte de Puebla, 1,902 masl) selling the
 * coffee it grows, harvests, roasts and grinds itself, directly and with no
 * middleman. Buyers are cafés/restaurants first, households second.
 *
 * Never call this coffee "organic" - the farm has no certification (it is
 * working toward one with the Cooperativa Directo al Origen). The accurate,
 * equally strong claim is "grown without agrochemicals, in the shade,
 * hand-picked". Same for provenance: this is Puebla, not Veracruz.
 *
 * The narrative is what sets a direct producer apart from a brand that only
 * resells: lead with the farm (Hero), tell whose hands grew it (Origin), then
 * put the beans themselves front and center (featured items) before letting
 * visitors browse by roast/preparation (Categories). Only then come the
 * "altitude / how it's grown and harvested" proof points (Highlights), the
 * wholesale door for the buyers who resell it (Wholesale), and finally the
 * customers' own words (Success stories). Every word and image stays DB-driven
 * through the shared blocks, so the family self-edits all of it in the CMS.
 *
 * The hero is deliberately not the centred, equal-weight composition the shared
 * block defaults to: `splitSlogan` reads the tenant's first slogan line as the
 * headline and the rest as a quieter subline, `align="start"` sets that stack
 * against the left gutter with a capped measure. The darkening that carries that
 * type is the tenant's own hero overlay (`System.hero_overlay_*`, tuned in the
 * CMS) - the site adds none of its own, so the CMS preview matches the live
 * hero exactly.
 *
 * Rhythm comes from calm neutral bands behind alternate sections - never brand
 * gradients. The band is `--surface-2` with a few percent of the farm's green
 * mixed in, so it stays a neutral in both themes (the mix resolves per theme)
 * while reading earthy rather than grey. The family can still override a band
 * via `System.highlights_bg` / `catalog_items_bg` in the CMS.
 */
export async function Landing() {
  const [system, t] = await Promise.all([
    getSystem(),
    getTranslations("CafeAlturaSite"),
  ]);

  const band = "color-mix(in srgb, var(--accent) 6%, var(--surface-2))";
  const itemsBg = fitSectionBackground(system?.catalog_items_bg ?? band);
  const highlightsBg = fitSectionBackground(system?.highlights_bg ?? band);

  const hasProducts = (system?.product_count ?? 0) > 0;

  return (
    <>
      <Hero
        system={system}
        splitSlogan
        align="start"
        actions={
          hasProducts && (
            <Button
              text={t("origin.viewCoffees")}
              href="/products"
              kind="primary"
              size="lg"
            />
          )
        }
      />

      <Origin />

      <CatalogItems
        background={itemsBg}
        topDivider={system?.catalog_top_divider}
        bottomDivider={system?.catalog_bottom_divider}
      />

      <Events />

      <CatalogCategories />

      <CompanyHighlights
        background={highlightsBg}
        topDivider={system?.highlights_top_divider}
        bottomDivider={system?.highlights_bottom_divider}
      />

      {/* The wholesale (mayoreo) invitation - now the shared, DB-driven Spotlight
          block: label → title → text → CTA on the left, the family's three
          featured coffees on the right. The family edits every word and picks
          the trio in the CMS. */}
      <Spotlight />

      {/* Homepage flyers: the tenant's own promo slides, each one a band of its
          own around a couple of hand-picked items. Renders nothing until they
          make one, and reads as a plain section until they make a second. */}
      <HomepageFlyers />

      <SuccessStories />

      {/* The farm itself, on a map, and the way through to /contact - the shared
          block, so these cards are the ones the contact page draws. Invisible
          until the family adds a location in the CMS. */}
      <FindUs />
    </>
  );
}
