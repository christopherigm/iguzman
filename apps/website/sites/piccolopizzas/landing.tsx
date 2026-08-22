import { getTranslations } from "next-intl/server";
import { Button } from "@repo/ui/core-elements/button";
import { getSystem } from "@/lib/system";
import { MENU_ALL_PATH, MENU_ICON } from "@/lib/catalog-paths";
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
import { Intro } from "./sections/intro";

/**
 * Bespoke landing for Piccolo Pizzas (piccolopizzas.iguzman.com.mx) - a
 * wood-fired pizzeria in Mexico City, open since 1985, with branches in Narvarte
 * Oriente (Diagonal San Antonio #1676) and Moctezuma. Pizzas in five sizes,
 * plus spaghetti, quesos fundidos, ensaladas, bebidas and postres, with home
 * delivery ordered by phone and WhatsApp.
 *
 * Restaurant/food archetype, ordered around the customer's actual complaint.
 * Their current site is a three-page Weebly template with no menu on it at all -
 * a visitor who wants to know what a Hawaiana costs has to phone and ask. So
 * this landing puts **the food first and the story second**, which is the one
 * place it departs from the other food sites in this repo (both of which open
 * with an intro split):
 *
 *   Hero              - full-bleed pizza, the name, one line, "Ver el menú"
 *   Featured pizzas   - the signature pies as cards, on the tenant's band
 *   Intro             - "desde 1985" beside a photo (a split, not a grid)
 *   Menu sections     - browse the rest: spaghetti, fundidos, ensaladas, bebidas
 *   Spotlight         - a bordered promo panel + a hand-picked trio
 *   Events            - anything the pizzeria is putting on
 *   Highlights        - hours, delivery, why an artisanal pizza takes 50 minutes
 *   Success stories   - the regulars' own words
 *   FindUs            - both branches, each with its map, through to /contact
 *
 * Adjacent sections never repeat a shape: banded card grid -> split -> tile grid
 * -> bordered panel -> slider -> banded grid -> slider -> location cards. Both
 * banded blocks carry the tenant's own band colours and edge notches, so the
 * seams are a CMS setting rather than site code.
 *
 * `FindUs` earns its place at the close more here than on a single-location
 * site: Piccolo has two branches on opposite sides of the city, and "which one
 * is near me" is a real question. It renders the contact page's own location
 * cards, so a branch that gains coordinates gains its map on both surfaces.
 *
 * The pizzas are MenuItems (the "food" Buyable family), not products - a pizza
 * is priced from a base plus ingredient add-ons, which is exactly what
 * `MenuItem` + `MenuItemIngredient` express and what a `Product` cannot. The
 * hero CTA therefore points at `MENU_ALL_PATH` (the whole menu, not just the
 * dishes) and is gated on `menu_item_count`, so before the catalog is seeded the
 * button simply isn't there rather than landing on an empty listing.
 *
 * The hero's darkening is the tenant's own `hero_overlay_*`, tuned in the CMS;
 * this site adds no scrim, so the CMS preview and the live hero are the same
 * picture.
 */
export async function Landing() {
  const [system, t] = await Promise.all([
    getSystem(),
    getTranslations("PiccoloSite"),
  ]);

  // A neutral carrying a few percent of the pizzeria's brand colour: it resolves
  // per theme (so it stays a surface, never a coloured area) while reading warm
  // rather than grey.
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
              icon={MENU_ICON}
              kind="primary"
              size="lg"
            />
          )
        }
      />

      {/* The pizzas themselves, before any prose - the whole reason this site
          exists is that the old one never showed them. */}
      <CatalogItems
        background={itemsBg}
        topDivider={system?.catalog_top_divider}
        bottomDivider={system?.catalog_bottom_divider}
      />

      <Intro />

      <CatalogCategories />

      {/* Shared, DB-driven Spotlight: the pizzeria can use it for whatever it
          wants to push - the family-size pies, the mar-y-tierra spaghetti - as a
          bordered panel beside a hand-picked trio. Renders nothing until the
          copy and the three items are set in the CMS. */}
      <Spotlight />

      {/* Homepage flyers: the tenant's own promo slides, each one a band of its
          own around a couple of hand-picked items. Renders nothing until they
          make one, and reads as a plain section until they make a second. */}
      <HomepageFlyers />

      <Events />

      <CompanyHighlights
        background={highlightsBg}
        topDivider={system?.highlights_top_divider}
        bottomDivider={system?.highlights_bottom_divider}
      />

      <SuccessStories />

      {/* Both branches on their maps, and the way through to /contact - the
          shared block, so these cards are the ones the contact page draws.
          Invisible until a location exists in the CMS. */}
      <FindUs />
    </>
  );
}
