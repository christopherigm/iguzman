import { getTranslations } from "next-intl/server";
import { Button } from "@repo/ui/core-elements/button";
import { Container } from "@repo/ui/core-elements/container";
import { getSystem } from "@/lib/system";
import { MENU_ALL_PATH, MENU_ICON } from "@/lib/menu-paths";
import { fitSectionBackground } from "@/lib/section-background";
import { SectionBand } from "@/components/section-band";
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
 * Bespoke landing for JavaStop Cafe (javastop.iguzman.com.mx) - a family-owned
 * coffee shop that has held the same corner of Main Street in Longmont,
 * Colorado since 1992: espresso and a large loose-leaf tea selection, smoothies,
 * breakfast sandwiches and paninis, fresh baked goods, indoor and outdoor
 * seating, and a wall given to a different local artist every month.
 *
 * Restaurant/food archetype, with the emphasis this particular café earns. A
 * thirty-year-old neighbourhood shop does not compete on novelty, so the order
 * leads with the drink and then with the room: the brand over a full-bleed
 * photograph (Hero + "See the menu"), the short story of the place (Intro), the
 * cups and plates themselves (featured menu items), what is on the walls this
 * month (Events), the menu's own sections (Categories), a single non-grid beat
 * (Spotlight), then the practical proof points - hours, refills, the patio
 * (Highlights) - the regulars' own words (Success stories), and finally the
 * address with its map (FindUs). Every word and image stays DB-driven through
 * the shared blocks, so the family self-edits all of it in the CMS.
 *
 * The drinks and the kitchen are MenuItems (the "food" Buyable family), not
 * products - a latte is a base price plus priced choices (size, syrup, oat
 * milk, bacon on the breakfast sandwich), which is exactly what a `Product`
 * cannot express. So the CTAs point at `/categories/menu` through
 * `MENU_ALL_PATH`, never a path literal, and are gated on `menu_item_count` so
 * they never land on an empty listing before the catalog is seeded.
 *
 * `<Events />` is doing real work here rather than being composed blind: the
 * monthly artist show *is* a dated happening with a place and a picture, so the
 * art wall's live content is authored in `/admin/events` and appears here and on
 * `/artists` at once. The band renders nothing until there is a show to name,
 * which is the right answer for a month between hangings.
 *
 * The hero is not the centred, equal-weight composition the shared block
 * defaults to: `splitSlogan` reads the tenant's first slogan line as the
 * headline and the rest as a quieter subline, `align="start"` sets that stack
 * against the left gutter with a capped measure. The darkening that carries the
 * type over a photograph is the tenant's own hero overlay
 * (`System.hero_overlay_*`, tuned in the CMS) - the site adds none of its own,
 * so the CMS preview matches the live hero exactly.
 *
 * Rhythm comes from calm neutral bands behind alternate sections, never brand
 * gradients. The band is `--surface-2` with a few percent of the café's own
 * colour mixed in, so it stays a neutral in both themes (the mix resolves per
 * theme) while reading warm rather than grey. The family can still override a
 * band via `System.catalog_items_bg` / `highlights_bg` in the CMS.
 */
export async function Landing() {
  const [system, t] = await Promise.all([
    getSystem(),
    getTranslations("JavaStopSite"),
  ]);

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

      <Intro />

      <SectionBand
        background={itemsBg}
        topDivider={system?.catalog_top_divider}
        bottomDivider={system?.catalog_bottom_divider}
      >
        <Container paddingX={10}>
          <CatalogItems />
        </Container>
      </SectionBand>

      {/* What is on the walls this month, and anything else the café is
          putting on. After the catalog and before the highlights band, the slot
          every site here uses: a visitor meets what the shop sells before what
          it is hosting. Renders nothing until there is an event in the CMS. */}
      <Container paddingX={10}>
        <Events />
      </Container>

      <Container paddingX={10}>
        <CatalogCategories />
      </Container>

      {/* The one non-grid beat between the two catalog blocks and the
          highlights: a bordered panel beside three hand-picked items - the
          seasonal drink, say, or the breakfast the kitchen is known for. Entirely
          DB-driven, and invisible until the family writes the copy and picks the
          trio in /admin/featured-spotlight. */}
      <Spotlight />

      {/* Homepage flyers: the café's own promo slides, each one a band of its
          own around a couple of hand-picked items. Renders nothing until they
          make one, and reads as a plain section until they make a second. */}
      <HomepageFlyers />

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

      {/* Which end of Main Street the café is on, with its map, and the way
          through to /contact - the shared block, so these cards are the ones the
          contact page draws. Invisible until a location exists in the CMS. */}
      <FindUs />
    </>
  );
}
