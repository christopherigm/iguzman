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
 * capability (Highlights on a tinted band), let visitors browse what's on offer
 * (Categories), surface featured work/gear (Items on a tinted band), and close
 * with social proof (Success stories). All section content stays DB-driven via
 * the shared blocks; band colors follow the tenant's brand kit.
 */
export async function Landing() {
  const system = await getSystem();

  const primary = system?.primary_color ?? "#2196f3";
  const secondary = system?.secondary_color ?? "#e040fb";

  const highlightsBg =
    system?.highlights_bg ??
    `linear-gradient(135deg, ${primary}1a 0%, ${secondary}0d 100%)`;

  const itemsBg =
    system?.catalog_items_bg ??
    `linear-gradient(135deg, ${secondary}0d 50%, ${primary}1a 100%)`;

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
