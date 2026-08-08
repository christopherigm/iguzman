import { getTranslations } from "next-intl/server";
import { Button } from "@repo/ui/core-elements/button";
import { Container } from "@repo/ui/core-elements/container";
import { getSystem } from "@/lib/system";
import { MENU_ALL_PATH } from "@/lib/menu-kinds";
import { fitSectionBackground } from "@/lib/section-background";
import { SectionBand } from "@/components/section-band";
import { Hero } from "@/components/hero";
import { SuccessStories } from "@/components/success-stories";
import { CompanyHighlights } from "@/components/company-highlights";
import { CatalogCategories } from "@/components/catalog-categories";
import { CatalogItems } from "@/components/catalog-items";
import { Events } from "@/components/events";
import { Spotlight } from "@/components/spotlight";
import { FindUs } from "@/components/find-us";
import { Intro } from "./sections/intro";
import { Bar } from "./sections/bar";

/**
 * Bespoke landing for Santo Fish Restaurant
 * (santofishrestaurant.iguzman.com.mx) - a Mexican seafood grill and bar on
 * Slauson Ave in Pico Rivera, CA: ceviches, aguachiles, oysters, grilled octopus
 * and a mar-y-tierra line, cooked in the Sinaloa/Nayarit coastal style.
 *
 * Restaurant/food archetype, with one thing the archetype doesn't cover. The
 * customer's problem is not that they have no content - their social feed is
 * genuinely good - it is that their current site lists a menu with not a single
 * photograph. So this composition is deliberately **photo-first**: the dishes
 * appear as images before the visitor is asked to read anything, and the only
 * text-list section on the page is the one place a text list is the right form
 * (the bar).
 *
 * Section order tells the restaurant's story:
 *   Hero            - full-bleed dish photo, name, one line, "see the menu"
 *   Intro           - the short coastal-kitchen story beside a photo (a split)
 *   Featured dishes - the signature plates, as cards, on the tenant's band
 *   La Barra        - the "and bar" half, as a dark photographic price list
 *   Menu sections   - browse the whole menu by category (ceviches, tacos...)
 *   Spotlight       - a bordered promo panel + a hand-picked trio (e.g. ceviches)
 *   Highlights      - hours, the Pico Rivera location, what arrives fresh
 *   Success stories - the guests' own words
 *
 * Adjacent sections never repeat a shape: split -> card grid -> dark list panel
 * -> tile grid -> bordered panel -> card grid -> stories. The two `SectionBand`s
 * carry the tenant's own band colours and edge notches, so the seams are a CMS
 * setting rather than site code.
 *
 * The dishes are MenuItems (the "food" Buyable family), not products, so the
 * hero CTA points at `/categories/menu` (the whole menu) and is gated on `menu_item_count` -
 * before the catalog is seeded the button simply isn't there rather than landing
 * on an empty listing. The hero's darkening is the tenant's own `hero_overlay_*`
 * (tuned in the CMS); this site adds no scrim, so the CMS preview and the live
 * hero are the same picture.
 */
export async function Landing() {
  const [system, t] = await Promise.all([
    getSystem(),
    getTranslations("SantoFishSite"),
  ]);

  // A neutral carrying a few percent of the restaurant's brand colour: it
  // resolves per theme (so it stays a surface, never a coloured area) while
  // reading warm rather than grey.
  const band = "color-mix(in srgb, var(--accent) 6%, var(--surface-2))";
  // `||`, not `??`: clearing the field in the CMS stores an empty string, which
  // would otherwise paint the band as `background: ""` (i.e. nothing).
  const itemsBg = fitSectionBackground(system?.catalog_items_bg || band);
  const highlightsBg = fitSectionBackground(system?.highlights_bg || band);

  const hasMenu = (system?.menu_item_count ?? 0) > 0;

  return (
    <>
      <Hero
        system={system}
        splitSlogan
        align="start"
        actions={
          hasMenu && (
            <Button
              text={t("hero.viewMenu")}
              href={MENU_ALL_PATH}
              kind="primary"
              size="lg"
            />
          )
        }
      />

      <Intro />

      <Container paddingX={10}>
        <Events />
      </Container>

      <SectionBand
        background={itemsBg}
        topDivider={system?.catalog_top_divider}
        bottomDivider={system?.catalog_bottom_divider}
      >
        <Container paddingX={10}>
          <CatalogItems />
        </Container>
      </SectionBand>

      {/* The "and bar" half of the grill and bar - a dark photographic price
          list, the one section on this page shaped like a printed menu. Renders
          nothing until the tenant has a bar/drinks menu category with items. */}
      <Bar />

      <Container paddingX={10}>
        <CatalogCategories />
      </Container>

      {/* Shared, DB-driven Spotlight: Santo Fish uses it for the ceviche and
          aguachile line - a bordered panel beside a hand-picked trio. Renders
          nothing until the copy and the three items are set in the CMS. */}
      <Spotlight />

      <SectionBand
        background={highlightsBg}
        topDivider={system?.highlights_top_divider}
        bottomDivider={system?.highlights_bottom_divider}
      >
        <Container paddingX={10}>
          <CompanyHighlights />
        </Container>
      </SectionBand>

      <Container paddingX={10}>
        <SuccessStories />
      </Container>

      {/* The Pico Rivera dining room on a map, and the way through to /contact -
          the shared block, so these cards are the ones the contact page draws.
          Invisible until a location exists in the CMS. */}
      <FindUs />
    </>
  );
}
