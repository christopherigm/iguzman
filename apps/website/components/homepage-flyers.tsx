import Image from "next/image";
import { getTranslations, getLocale } from "next-intl/server";
import { Box } from "@repo/ui/core-elements/box";
import { Container } from "@repo/ui/core-elements/container";
import { Grid } from "@repo/ui/core-elements/grid";
import { Typography } from "@repo/ui/core-elements/typography";
import { getHomepageFlyers, type HomepageFlyer } from "@/lib/homepage-flyers";
import { getAllProducts, getAllServices, getAllMenuItems } from "@/lib/catalog";
import { fitSectionBackground } from "@/lib/section-background";
import { SectionBand } from "./section-band";
import { BuyableCard, type BuyableItem } from "./buyable-card";
import {
  HomepageFlyersSlider,
  type FlyerSlide,
} from "./homepage-flyers-slider";
import "./homepage-flyers.css";

/**
 * Homepage flyers - the promo slides a landing pages through, between the
 * success stories and the company highlights.
 *
 * The multi-record twin of `Spotlight`: copy and a photograph around up to three
 * hand-picked catalog items. What a flyer adds is that a tenant authors
 * **several**, each carrying its own colour band and its own edge shapes - so
 * this section is a stack of bands rather than one band whose contents change,
 * which is why `SectionBand` is rendered per slide here and once per section on
 * every other landing block.
 *
 * **Renders nothing when the tenant has no flyers**, so it is safe to compose
 * into any landing before the content exists - the same contract `Spotlight`,
 * `Events` and `SuccessStories` follow. A site never guards it.
 *
 * With one flyer it is a plain section: `SliderControls` draws nothing for a
 * single slide, so there are no dots and no arrows to press.
 *
 * Everything a slide needs is resolved **here**, on the server - the locale, the
 * catalog behind each `{kind, id}` ref, and the per-viewer state inside a
 * `BuyableCard` (its heart and its cart line) - and the finished slides are
 * handed to the client slider as nodes. That is what lets a card that is an
 * async server component ride inside a Swiper.
 */
function pick(
  locale: string,
  es: string | null | undefined,
  en: string | null | undefined,
): string {
  const primary = locale === "en" ? en : es;
  return (primary || es || en || "").trim();
}

export async function HomepageFlyers() {
  const [flyers, locale] = await Promise.all([
    getHomepageFlyers(),
    getLocale(),
  ]);
  if (flyers.length === 0) return null;

  const [products, services, menuItems, tMenu, t] = await Promise.all([
    getAllProducts(),
    getAllServices(),
    getAllMenuItems(),
    getTranslations("Menu"),
    getTranslations("HomepageFlyers"),
  ]);

  const productById = new Map(products.map((p) => [p.id, p]));
  const serviceById = new Map(services.map((s) => [s.id, s]));
  const menuById = new Map(menuItems.map((m) => [m.id, m]));

  /**
   * Resolve one flyer's refs in order, dropping any whose item no longer exists
   * (deleted, or unpublished since it was picked). A slide that loses every one
   * of them still reads as a flyer - it is a photograph and a piece of copy - so
   * it is kept rather than dropped with them.
   */
  const resolveItems = (flyer: HomepageFlyer): BuyableItem[] => {
    const items: BuyableItem[] = [];
    for (const ref of flyer.items ?? []) {
      if (ref.kind === "product") {
        const data = productById.get(ref.id);
        if (data) items.push({ kind: "product", data });
      } else if (ref.kind === "service") {
        const data = serviceById.get(ref.id);
        if (data) items.push({ kind: "service", data });
      } else if (ref.kind === "food") {
        const data = menuById.get(ref.id);
        if (data) items.push({ kind: "food", data });
      }
    }
    return items;
  };

  const slides: FlyerSlide[] = [];

  flyers.forEach((flyer) => {
    const title = pick(locale, flyer.name, flyer.en_name);
    const description = pick(locale, flyer.description, flyer.en_description);
    // A row with neither a title nor a photograph has nothing to show and would
    // render as an empty band the visitor can still swipe to.
    if (!title && !flyer.image) return;

    const items = resolveItems(flyer);
    // The layout classes: which side the photograph sits on, plus the two halves
    // this flyer does not have - an area left in the template with nothing in it
    // is still a row, and would open a hole where the missing piece would be.
    const classes = ["homepage-flyer"];
    if (flyer.image_side === "right") classes.push("homepage-flyer--right");
    if (!flyer.image) classes.push("homepage-flyer--no-media");
    if (!title) classes.push("homepage-flyer--no-header");

    slides.push({
      id: flyer.id,
      title,
      content: (
        <SectionBand
          background={fitSectionBackground(flyer.background || "transparent")}
          topDivider={flyer.top_divider}
          bottomDivider={flyer.bottom_divider}
        >
          <Container paddingX={10}>
            {/* The three grid areas are assigned here; the templates that place
                them - and the gap, since from `sm` up the title and the copy
                below it close into one block - live in `homepage-flyers.css`,
                because they are the one thing that differs between a phone and
                everything above it, and an inline style would beat every media
                query in there. */}
            <Box className={classes.join(" ")} display="grid" paddingY={64}>
              {title && (
                <Typography
                  as="h2"
                  variant="h2"
                  fontWeight={800}
                  margin={0}
                  styles={{ gridArea: "header" }}
                >
                  {title}
                </Typography>
              )}

              {flyer.image && (
                <Box
                  width="100%"
                  alignSelf="flex-start"
                  styles={{ gridArea: "media" }}
                >
                  {/* `width`/`height` are the placeholder ratio that reserves the
                      box while the file loads; `height: auto` hands the frame
                      back to the photograph's own aspect ratio once it has, which
                      is what keeps a flyer's artwork uncropped.

                      No `priority` on any of them, the first slide included: the
                      band sits below the hero, so eager-loading it would only
                      compete with the picture that actually is the LCP. */}
                  <Image
                    src={flyer.image}
                    alt={title || ""}
                    width={1200}
                    height={900}
                    sizes="(min-width: 600px) 50vw, 100vw"
                    style={{
                      width: "100%",
                      height: "auto",
                      borderRadius: 12,
                      objectFit: flyer.fit === "contain" ? "contain" : "cover",
                    }}
                  />
                </Box>
              )}

              <Box
                flexDirection="column"
                gap={16}
                styles={{ gridArea: "body" }}
              >
                {description && (
                  <Typography
                    as="p"
                    variant="body"
                    margin={0}
                    styles={{ lineHeight: 1.7 }}
                  >
                    {description}
                  </Typography>
                )}

                {items.length > 0 && (
                  <Grid container spacing={2}>
                    {items.map((item, index) => (
                      <Grid
                        key={`${item.kind}-${item.data.id}`}
                        // One card size for every flyer, whatever it carries:
                        // two-up while the copy column is narrow, three-across
                        // from `md`, where it is wide enough for a trio. It is
                        // deliberately not derived from `items.length` - a
                        // slider whose cards changed size from slide to slide
                        // read as three different components rather than one
                        // row of the same thing.
                        size={{ xs: 6, md: 4 }}
                        // ...which leaves the third card with nowhere to go
                        // below `md`: it would wrap to a row of its own, under
                        // a half-empty one. Two is the whole row there, so the
                        // third is dropped for the `xs` and `sm` bands and
                        // comes back with the column that can hold it.
                        hidden={index > 1 ? { xs: true, sm: true } : undefined}
                      >
                        <BuyableCard
                          item={item}
                          locale={locale}
                          fromLabel={tMenu("from")}
                          // The card rides in the copy column beside a
                          // photograph, at a third of its width: its blurb and
                          // its share/heart pair have no room to read there,
                          // and the flyer's own copy is already saying what
                          // this is. What is left is the picture, the price and
                          // the one button worth pressing.
                          compact
                        />
                      </Grid>
                    ))}
                  </Grid>
                )}
              </Box>
            </Box>
          </Container>
        </SectionBand>
      ),
    });
  });

  if (slides.length === 0) return null;

  return (
    <HomepageFlyersSlider
      slides={slides}
      labels={{
        previous: t("previous"),
        next: t("next"),
        pagination: t("pagination"),
      }}
    />
  );
}
