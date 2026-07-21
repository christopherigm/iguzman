import { getTranslations } from "next-intl/server";
import { Box } from "@repo/ui/core-elements/box";
import { Button } from "@repo/ui/core-elements/button";
import { Container } from "@repo/ui/core-elements/container";
import { getSystem } from "@/lib/system";
import { Hero } from "@/components/hero";
import { SuccessStories } from "@/components/success-stories";
import { CompanyHighlights } from "@/components/company-highlights";
import { CatalogCategories } from "@/components/catalog-categories";
import { CatalogItems } from "@/components/catalog-items";
import { Intro } from "./sections/intro";

/**
 * Bespoke landing for "Pan que hace bien" (panorganico.mx) - a home-baker of
 * organic breads (banana, orange, pumpkin...).
 *
 * Warm, artisanal, product-forward narrative: lead with the brand (Hero), tell
 * the short home-made story (Intro), then let the loaves be the star (featured
 * products), let visitors shop by bread type (Categories), explain why organic
 * (Highlights), and close with real customer voices (Success stories). Every
 * bit of copy/imagery stays DB-driven via the shared blocks, so the baker
 * self-edits it all in the CMS.
 *
 * The hero is not the centred, equal-weight composition the shared block
 * defaults to: `splitSlogan` reads the baker's first slogan line as the headline
 * and the rest as a quieter subline, `align="start"` sets that stack against the
 * left gutter with a capped measure, and `scrim` darkens the whole frame so the
 * type carries itself over a warm, busy photo of bread instead of leaning on a
 * text-shadow.
 *
 * Rhythm comes from calm neutral bands behind alternate sections, never brand
 * gradients. The band is `--surface-2` with a few percent of the terracotta
 * mixed in, so it stays a neutral in both themes (the mix resolves per theme)
 * while reading warm rather than grey. The baker can still override a band via
 * `System.highlights_bg` / `catalog_items_bg` in the CMS.
 */
export async function Landing() {
  const [system, t] = await Promise.all([
    getSystem(),
    getTranslations("PanOrganicoSite"),
  ]);

  const band = "color-mix(in srgb, var(--accent) 6%, var(--surface-2))";
  // `||`, not `??`: clearing the field in the CMS stores an empty string, which
  // would otherwise paint the band as `background: ""` (i.e. nothing).
  const itemsBg = system?.catalog_items_bg || band;
  const highlightsBg = system?.highlights_bg || band;

  // The breads are MenuItems (food), not products - the CTA has to point at the
  // menu category route, or it lands on an empty product listing.
  const hasBreads = (system?.menu_item_count ?? 0) > 0;

  return (
    <>
      <Hero
        system={system}
        splitSlogan
        align="start"
        scrim={0.4}
        actions={
          hasBreads && (
            <Button
              text={t("intro.viewBreads")}
              href="/categories/food"
              kind="primary"
              size="lg"
            />
          )
        }
      />

      <Intro />

      <Box styles={{ width: "100%", background: itemsBg }}>
        <Container paddingX={10}>
          <CatalogItems />
        </Container>
      </Box>

      <Container paddingX={10}>
        <CatalogCategories />
      </Container>

      <Box styles={{ width: "100%", background: highlightsBg }}>
        <Container paddingX={10}>
          <CompanyHighlights />
        </Container>
      </Box>

      <Container paddingX={10}>
        <SuccessStories />
      </Container>
    </>
  );
}
