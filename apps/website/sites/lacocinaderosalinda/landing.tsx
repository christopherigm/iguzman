import { getTranslations } from "next-intl/server";
import { Button } from "@repo/ui/core-elements/button";
import { Container } from "@repo/ui/core-elements/container";
import { getSystem } from "@/lib/system";
import { MENU_ALL_PATH } from "@/lib/menu-paths";
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
import { Firma } from "./sections/firma";

/**
 * Bespoke landing for La Cocina de Rosalinda
 * (lacocinaderosalinda.iguzman.com.mx) - a Mexican breakfast-and-almuerzo house:
 * ten kinds of chilaquiles, molletes, hot cakes and waffles, juices and
 * licuados in the morning, then entradas, especialidades and platillos
 * mexicanos - enchiladas, tetelas, huaraches, machaca - through the day.
 *
 * Restaurant/food archetype, ordered around the two things that make this
 * kitchen itself:
 *
 * **It sells breakfast, which is bought with the eyes and decided in seconds.**
 * So the plates come before any prose - the featured dishes are the first thing
 * under the hero, not the fourth section down.
 *
 * **It is named after a person, and so are its dishes.** The carta puts her
 * name on a dish in four different places (chilaquiles, hot cakes, botanero,
 * sopes), each filed under a different heading, so nobody browsing category by
 * category ever sees the line. `Firma` gathers it - and it lands *after* the
 * Intro, so the visitor has just met Rosalinda when they meet the dishes that
 * carry her name.
 *
 *   Hero            - full-bleed chilaquiles, the name, one line, "ver el menú"
 *   Featured dishes - the plates as cards, on the tenant's band
 *   Intro           - who Rosalinda is, beside a photo (a split)
 *   Firma           - the house-named dishes as a ruled two-column list
 *   Menu sections   - browse the rest: chilaquiles, molletes, postres, jugos…
 *   Spotlight       - a bordered promo panel + a hand-picked trio
 *   Events          - anything the kitchen is putting on
 *   Highlights      - hours, breakfast all day, what is made in-house
 *   Success stories - the regulars' own words
 *   FindUs          - the dining room on its map, through to /contact
 *
 * Adjacent sections never repeat a shape: banded card grid -> split -> ruled
 * list -> tile grid -> bordered panel -> slider -> banded grid -> slider ->
 * location cards. Both `SectionBand`s carry the tenant's own band colours and
 * edge notches, so the seams are a CMS setting rather than site code, and
 * `Firma` deliberately sits on the bare page so the logo watermark shows
 * through between the two banded sections.
 *
 * The dishes are MenuItems (the "food" Buyable family), not products - a plate
 * of chilaquiles is a base price plus priced add-ins (machaca, pechuga,
 * aguacate, huevo - the carta's whole EXTRAS column), which is exactly what
 * `MenuItem` + `MenuItemIngredient` express and what a `Product` cannot. The
 * hero CTA therefore points at `MENU_ALL_PATH` (the whole menu) and is gated on
 * `menu_item_count`, so before the catalog is seeded the button simply isn't
 * there rather than landing on an empty listing.
 *
 * The hero's darkening is the tenant's own `hero_overlay_*`, tuned in the CMS;
 * this site adds no scrim, so the CMS preview and the live hero are the same
 * picture.
 */
export async function Landing() {
  const [system, t] = await Promise.all([
    getSystem(),
    getTranslations("RosalindaSite"),
  ]);

  // A neutral carrying a few percent of the kitchen's brand colour: it resolves
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
              kind="primary"
              size="lg"
            />
          )
        }
      />

      {/* Breakfast is bought with the eyes: the plates lead, before any prose. */}
      <SectionBand
        background={itemsBg}
        topDivider={system?.catalog_top_divider}
        bottomDivider={system?.catalog_bottom_divider}
      >
        <Container paddingX={10}>
          <CatalogItems />
        </Container>
      </SectionBand>

      <Intro />

      {/* The dishes that carry the cook's name, gathered from across the menu.
          Renders nothing until the catalog has one - see the file's docstring
          for why this is a name match and how it fails. */}
      <Firma />

      <Container paddingX={10}>
        <CatalogCategories />
      </Container>

      {/* Shared, DB-driven Spotlight: the kitchen can push whatever it likes
          here - the chilaquiles line, the almuerzo of the week - as a bordered
          panel beside a hand-picked trio. Renders nothing until the copy and
          the three items are set in the CMS. */}
      <Spotlight />

      <Container paddingX={10}>
        <Events />
      </Container>

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

      {/* The dining room on its map, and the way through to /contact - the
          shared block, so these cards are the ones the contact page draws.
          Invisible until a location exists in the CMS. */}
      <FindUs />
    </>
  );
}
