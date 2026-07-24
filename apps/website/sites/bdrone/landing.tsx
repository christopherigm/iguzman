import { getTranslations } from "next-intl/server";
import { Button } from "@repo/ui/core-elements/button";
import { Container } from "@repo/ui/core-elements/container";
import { getSystem } from "@/lib/system";
import { fitSectionBackground } from "@/lib/section-background";
import { SectionBand } from "@/components/section-band";
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
 * The hero is not the centred, equal-weight composition the shared block
 * defaults to: `splitSlogan` reads the tenant's first slogan line as the
 * headline and the rest as a quieter subline, `align="start"` sets that stack
 * against the left gutter with a capped measure. The darkening that keeps that
 * type legible over bright, moving aerial footage is the tenant's own hero
 * overlay (`System.hero_overlay_*`, tuned in the CMS) - the site adds none of
 * its own, so the CMS preview matches the live hero exactly.
 *
 * Rhythm comes from a neutral band behind alternate sections - not brand
 * gradients. The band is `--surface-2` with a few percent of the brand navy
 * mixed in, so it stays a neutral in both themes (the mix resolves per theme)
 * while reading cooler than plain grey. The customer can still override a band
 * via `System.highlights_bg` / `catalog_items_bg` in the CMS.
 */
export async function Landing() {
  const [system, t] = await Promise.all([
    getSystem(),
    getTranslations("BdroneSite"),
  ]);

  const band = "color-mix(in srgb, var(--accent) 6%, var(--surface-2))";
  // `||`, not `??`: clearing the field in the CMS stores an empty string, which
  // would otherwise paint the band as `background: ""` (i.e. nothing).
  const highlightsBg = fitSectionBackground(system?.highlights_bg || band);
  const itemsBg = fitSectionBackground(system?.catalog_items_bg || band);

  const hasServices = (system?.service_count ?? 0) > 0;

  return (
    <>
      <Hero
        system={system}
        splitSlogan
        align="start"
        actions={
          hasServices && (
            <Button
              text={t("intro.exploreServices")}
              href="/categories/services"
              kind="primary"
              size="lg"
            />
          )
        }
      />

      <Intro />

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
        <CatalogCategories />
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

      <Container paddingX={10}>
        <SuccessStories />
      </Container>
    </>
  );
}
