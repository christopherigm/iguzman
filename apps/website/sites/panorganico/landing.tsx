import { Box } from "@repo/ui/core-elements/box";
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
 * Rhythm comes from calm neutral `--surface-2` bands behind alternate sections,
 * never brand gradients - so the page reads warm and on-brand in both themes.
 * The baker can still override a band via `System.highlights_bg` /
 * `catalog_items_bg` in the CMS.
 */
export async function Landing() {
  const system = await getSystem();

  const itemsBg = system?.catalog_items_bg ?? "var(--surface-2)";
  const highlightsBg = system?.highlights_bg ?? "var(--surface-2)";

  return (
    <>
      <Hero system={system} />

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
