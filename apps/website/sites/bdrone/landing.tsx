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
 * Bespoke landing for Bdrone.
 *
 * Deliberate narrative for a drone-services company, distinct from the default
 * stack: lead with the brand (Hero), establish identity + CTAs (Intro), prove
 * capability (Highlights), let visitors browse what's on offer (Categories),
 * surface featured work/gear (Items), and close with social proof (Success
 * stories). All section content stays DB-driven via the shared blocks.
 *
 * Rhythm comes from a neutral `--surface-2` band behind alternate sections -
 * not brand gradients - so the page reads calm and on-brand in both themes. The
 * customer can still override a band via `System.highlights_bg` /
 * `catalog_items_bg` in the CMS.
 */
export async function Landing() {
  const system = await getSystem();

  const highlightsBg = system?.highlights_bg ?? "var(--surface-2)";
  const itemsBg = system?.catalog_items_bg ?? "var(--surface-2)";

  return (
    <>
      <Hero system={system} />

      <Intro />

      <Box styles={{ width: "100%", background: highlightsBg }}>
        <Container paddingX={10}>
          <CompanyHighlights />
        </Container>
      </Box>

      <Container paddingX={10}>
        <CatalogCategories />
      </Container>

      <Box styles={{ width: "100%", background: itemsBg }}>
        <Container paddingX={10}>
          <CatalogItems />
        </Container>
      </Box>

      <Container paddingX={10}>
        <SuccessStories />
      </Container>
    </>
  );
}
