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
import { Events } from "@/components/events";
import { Spotlight } from "@/components/spotlight";
import { HomepageFlyers } from "@/components/homepage-flyers";
import { Intro } from "./sections/intro";
import { Departure } from "./sections/departure";

/**
 * Bespoke landing for Tamara Tours Los Cabos (tamaratours.iguzman.com.mx) - a
 * small, owner-run tour operator in Los Cabos, Baja California Sur, running boat
 * trips to El Arco de Cabo San Lucas.
 *
 * The narrative is the one a traveller actually follows when they are choosing
 * who to go out with, which is not the default block order: show the water
 * (Hero), say who is taking you out (Intro), then put the **trips themselves**
 * up front - a tourist wants the departure, the duration and the price long
 * before they want a company's values, so featured tours come third, before the
 * ways to browse them. Only then the reasons to pick this operator over the
 * dozen on the marina (Highlights), the invitation for a private charter
 * (Spotlight), the travellers' own words (Success stories - the single strongest
 * signal in this business, so it closes the argument), and finally the practical
 * answer that turns a reader into a passenger: which dock, and how to reach us
 * (Departure).
 *
 * Tours are the **service** family, not products: each trip is booked, has a
 * duration and a modality, and its variants are session lengths / private vs.
 * shared. So every catalog CTA points at `/services` and is gated on
 * `system.service_count`, so it never lands on an empty listing before the
 * catalog is seeded.
 *
 * The hero is deliberately not the centred, equal-weight composition the shared
 * block defaults to: `splitSlogan` reads the tenant's first slogan line as the
 * headline and the rest as a quieter subline, `align="start"` sets that stack
 * against the left gutter with a capped measure - which is what keeps type
 * legible over a wide seascape whose interest sits in the middle of the frame.
 * The darkening that carries it is the tenant's own hero overlay
 * (`System.hero_overlay_*`, tuned in the CMS); the site adds none of its own, so
 * the CMS preview matches the live hero exactly.
 *
 * Rhythm comes from two calm neutral bands, never brand gradients: `--surface-2`
 * with a few percent of the brand mixed in, so the band resolves per theme and
 * reads maritime rather than grey. The owner can still override either band via
 * `System.catalog_items_bg` / `highlights_bg` in the CMS, and both bands' edge
 * notches come straight from the tenant's divider fields.
 */
export async function Landing() {
  const [system, t] = await Promise.all([
    getSystem(),
    getTranslations("TamaraToursSite"),
  ]);

  const band = "color-mix(in srgb, var(--accent) 6%, var(--surface-2))";
  // `||`, not `??`: clearing the field in the CMS stores an empty string, which
  // would otherwise paint the band as `background: ""` (i.e. nothing).
  const itemsBg = fitSectionBackground(system?.catalog_items_bg || band);
  const highlightsBg = fitSectionBackground(system?.highlights_bg || band);

  const hasTours = (system?.service_count ?? 0) > 0;

  return (
    <>
      <Hero
        system={system}
        splitSlogan
        align="start"
        actions={
          hasTours && (
            <Button
              text={t("hero.viewTours")}
              href="/services"
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

      <Container paddingX={10}>
        <CatalogCategories />
      </Container>

      {/* Whale season, full-moon sailings, a holiday departure - renders nothing
          until the owner adds one in /admin/events. */}
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

      {/* The private-charter invitation, as the shared DB-driven Spotlight: a
          bordered panel beside three hand-picked tours, so the page does not
          read as a run of card grids. Invisible until the owner fills the copy
          and picks the trio in /admin/featured-spotlight. */}
      <Spotlight />

      {/* Homepage flyers: the tenant's own promo slides, each one a band of its
          own around a couple of hand-picked items. Renders nothing until they
          make one, and reads as a plain section until they make a second. */}
      <HomepageFlyers />

      <Container paddingX={10}>
        <SuccessStories />
      </Container>

      <Departure />
    </>
  );
}
