import { Box } from "@repo/ui/core-elements/box";
import { Container } from "@repo/ui/core-elements/container";
import { getSystem } from "@/lib/system";
import { Hero } from "@/components/hero";
import { SuccessStories } from "@/components/success-stories";
import { CompanyHighlights } from "@/components/company-highlights";
import { CatalogCategories } from "@/components/catalog-categories";
import { CatalogItems } from "@/components/catalog-items";
import { Origin } from "./sections/origin";
import { Wholesale } from "./sections/wholesale";

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
 * Rhythm comes from calm neutral `--surface-2` bands behind alternate sections
 * - never brand gradients - so the page reads earthy and on-brand in both light
 * and dark. The family can still override a band via `System.highlights_bg` /
 * `catalog_items_bg` in the CMS.
 */
export async function Landing() {
  const system = await getSystem();

  const itemsBg = system?.catalog_items_bg ?? "var(--surface-2)";
  const highlightsBg = system?.highlights_bg ?? "var(--surface-2)";

  return (
    <>
      <Hero system={system} />

      <Origin />

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

      <Wholesale />

      <Container paddingX={10}>
        <SuccessStories />
      </Container>
    </>
  );
}
