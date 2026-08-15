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

/**
 * Bespoke landing for "Super Tortas El Chino"
 * (supertortaselchino.iguzman.com.mx) - a torta shop in Papalotla, Estado de
 * México, that makes big, made-to-order tortas (the $200 "Cubana" is its
 * signature) with free local delivery and WhatsApp ordering.
 *
 * Restaurant/food archetype: the food is the star, imagery-led, minimal text.
 * Lead with the brand over a full-bleed torta photo (Hero + "Ver el menú"),
 * tell the short street-food story (Intro), then put the tortas themselves
 * front and center (featured menu items) before letting visitors browse by
 * menu section - Tradicionales, Únicas, Especiales… (Categories). Only then
 * come the practical proof points - hours, free delivery, made-to-order
 * (Highlights) - and finally the customers' own words (Success stories). Every
 * word and image stays DB-driven through the shared blocks, so the owner
 * self-edits all of it in the CMS.
 *
 * The tortas are MenuItems (the "food" Buyable family), not products - the CTAs
 * point at `/categories/menu` (the whole menu), and we gate them on `menu_item_count` so they
 * never land on an empty listing before the catalog is seeded.
 *
 * The hero is not the centred, equal-weight composition the shared block
 * defaults to: `splitSlogan` reads the tenant's first slogan line as the
 * headline and the rest as a quieter subline, `align="start"` sets that stack
 * against the left gutter with a capped measure. The darkening that carries
 * that type over a busy food photo is the tenant's own hero overlay
 * (`System.hero_overlay_*`, tuned in the CMS) - the site adds none of its own,
 * so the CMS preview matches the live hero exactly.
 *
 * Rhythm comes from calm neutral bands behind alternate sections, never brand
 * gradients. The band is `--surface-2` with a few percent of the shop's orange
 * mixed in, so it stays a neutral in both themes (the mix resolves per theme)
 * while reading warm rather than grey. The owner can still override a band via
 * `System.highlights_bg` / `catalog_items_bg` in the CMS.
 */
export async function Landing() {
  const [system, t] = await Promise.all([
    getSystem(),
    getTranslations("SuperTortasSite"),
  ]);

  const band = "color-mix(in srgb, var(--accent) 6%, var(--surface-2))";
  // `||`, not `??`: clearing the field in the CMS stores an empty string, which
  // would otherwise paint the band as `background: ""` (i.e. nothing).
  const itemsBg = fitSectionBackground(system?.catalog_items_bg || band);
  const highlightsBg = fitSectionBackground(system?.highlights_bg || band);

  const hasTortas = (system?.menu_item_count ?? 0) > 0;

  return (
    <>
      <Hero
        system={system}
        splitSlogan
        align="start"
        actions={
          hasTortas && (
            <Button
              text={t("intro.viewMenu")}
              href={MENU_ALL_PATH}
              kind="primary"
              size="lg"
            />
          )
        }
      />

      <Intro />

      <Container paddingX={10}>
        <Events />
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

      {/* Shared, DB-driven Spotlight: the baker uses it to showcase a trio of
          featured breads (e.g. the vegan loaves) beside a short pitch + CTA.
          Renders nothing until she fills the copy and picks three items in the
          CMS, so it stays out of the way until configured. */}
      <Spotlight />

      <Container paddingX={10}>
        <CatalogCategories />
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

      {/* Which corner of Papalotla the shop is on, with its map, and the way
          through to /contact - the shared block, so these cards are the ones the
          contact page draws. Invisible until a location exists in the CMS. */}
      <FindUs />
    </>
  );
}
