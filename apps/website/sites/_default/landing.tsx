import { getSystem } from "@/lib/system";
import { fitSectionBackground } from "@/lib/section-background";
import { Hero } from "@/components/hero";
import { SuccessStories } from "@/components/success-stories";
import { CompanyHighlights } from "@/components/company-highlights";
import { HomepageFlyers } from "@/components/homepage-flyers";
import { CatalogCategories } from "@/components/catalog-categories";
import { CatalogItems } from "@/components/catalog-items";
import { Events } from "@/components/events";
import { FindUs } from "@/components/find-us";

/**
 * The generic, fully DB-driven landing page - the original shared template.
 * Every tenant without a bespoke site folder renders this, themed entirely by
 * its System record (colors, logo, slogan, hero, section backgrounds).
 *
 * A bespoke customer site keeps the same building blocks (Hero, SuccessStories,
 * CompanyHighlights, Catalog*) but composes and styles them freely - see
 * sites/CLAUDE.md.
 */
export async function DefaultLanding() {
  const system = await getSystem();

  const highlightsBg = fitSectionBackground(
    system?.highlights_bg ??
      `linear-gradient(135deg, ${system?.primary_color ?? "#2196f3"}1a 0%, ${system?.secondary_color ?? "#e040fb"}0d 100%)`,
  );

  const catalogItemsBg = fitSectionBackground(
    system?.catalog_items_bg ??
      `linear-gradient(135deg, ${system?.secondary_color ?? "#e040fb"}0d 50%, ${system?.primary_color ?? "#177ed2"}1a 100%)`,
  );

  return (
    <>
      <Hero system={system} />
      <SuccessStories />
      {/* Homepage flyers: the tenant's own promo slides, each one a band of its
          own around a couple of hand-picked items. Renders nothing until they
          make one, and reads as a plain section until they make a second. */}
      <HomepageFlyers />

      <CompanyHighlights
        background={highlightsBg}
        topDivider={system?.highlights_top_divider}
        bottomDivider={system?.highlights_bottom_divider}
      />
      <CatalogCategories />
      <CatalogItems
        background={catalogItemsBg}
        topDivider={system?.catalog_top_divider}
        bottomDivider={system?.catalog_bottom_divider}
      />

      {/* After the catalog: a visitor meets what the business sells before what
          it is putting on. Renders nothing until the tenant has an event, so
          every existing site is unchanged until they add one. */}
      <Events />

      {/* Closes the page with the tenant's locations and their maps, then hands
          the visitor to /contact. Renders nothing until they add a branch. */}
      <FindUs />
    </>
  );
}
