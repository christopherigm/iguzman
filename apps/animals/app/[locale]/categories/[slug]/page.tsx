import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  getFormatter,
  getTranslations,
  setRequestLocale,
} from "next-intl/server";
import { Box } from "@repo/ui/core-elements/box";
import { Grid } from "@repo/ui/core-elements/grid";
import { Card } from "@repo/ui/core-elements/card";
import { Container } from "@repo/ui/core-elements/container";
import { Typography } from "@repo/ui/core-elements/typography";
import { Breadcrumbs } from "@repo/ui/core-elements/breadcrumbs";
import { RichText } from "@repo/ui/core-elements/rich-text";
import { PageBottomSpacer } from "@repo/ui/core-elements/navbar";
import { FloatingActionButton } from "@repo/ui/core-elements/floating-action-button";
import {
  getCategory,
  getSpeciesByCategory,
  kindHref,
  type Category,
  type Species,
} from "@/lib/catalog";
import { getCategoryMapPins, getSightingsByCategory } from "@/lib/journal";
import { localized } from "@/lib/i18n-field";
import {
  DetailHero,
  type DetailHeroChip,
} from "@/components/catalog/detail-hero";
import { FactsCard } from "@/components/catalog/facts-card";
import {
  DetailGallery,
  type GalleryImage,
} from "@/components/catalog/detail-gallery";
import { SpeciesGrid } from "@/components/catalog/species-grid";
import { SightingsSection } from "@/components/journal/sightings-section";
import { SightingsMapSection } from "@/components/journal/sightings-map-section";

/**
 * One category's page: what this group of things is, every photograph the site
 * holds of it, the journal entries that record them, and the species filed under
 * it. The destination of every tile in the landing's `CategoryNav`.
 *
 * The first row is the species page's row, off the same `DetailGallery`: the
 * description and the facts as two stacked cards, the photographs beside them as
 * a slideshow. Below it the recent sightings lead the species grid - the journal
 * is what changes, the catalog is the reference behind it.
 *
 * **The slideshow is the category's own photographs followed by its species'.**
 * A `Category` owns a real gallery (`catalog.CategoryImage`), and those lead -
 * they are the shots an author chose for the *group*. After them comes the union
 * of its species' photographs, each species' cover then its reference photos,
 * which is what makes the strip a contact sheet of the whole branch. That union
 * costs no extra request: `toGalleryImages` builds it from the species list the
 * page already had to fetch.
 */

type Props = { params: Promise<{ locale: string; slug: string }> };

/** How many journal entries the page's sightings band carries. */
const SIGHTINGS_LIMIT = 6;

/**
 * How far the secondary FAB sits above the primary one: the primary's own 42 px
 * box (`size="lg"`) plus a 12 px gap. Also the extra bottom clearance the page
 * owes the stack on top of `PageBottomSpacer`.
 */
const FAB_STACK_OFFSET = 54;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params;
  const category = await getCategory(slug);
  if (!category) return {};

  const name = localized(category, "name", locale) ?? category.slug;
  const description = localized(category, "short_description", locale);

  return {
    title: name,
    ...(description ? { description } : {}),
    openGraph: {
      title: name,
      ...(description ? { description } : {}),
      ...(category.image ? { images: [{ url: category.image }] } : {}),
    },
  };
}

export default async function CategoryPage({ params }: Props) {
  const { locale, slug } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("CategoryPage");
  const tKinds = await getTranslations("Kinds");
  const tContribute = await getTranslations("Contribute");
  const format = await getFormatter({ locale });

  // The species, the journal band and the map all key off the slug rather than
  // the category's pk, so all four reads start together instead of waiting on
  // the category to resolve first.
  const [category, species, sightings, mapPins] = await Promise.all([
    getCategory(slug),
    getSpeciesByCategory(slug),
    getSightingsByCategory(slug, SIGHTINGS_LIMIT),
    getCategoryMapPins(slug),
  ]);

  // `getCategory` answers null only on a real 404 - a backend that is down
  // throws instead, so this cannot turn an outage into "no such category".
  if (!category) notFound();

  const name = localized(category, "name", locale) ?? category.slug;
  const shortDescription = localized(category, "short_description", locale);
  const description = localized(category, "description", locale);
  const kindLabel = tKinds(category.kind);
  // The branch has a page of its own now, so its label is a link in both places
  // this page names it - which is also the only way into `/[locale]/[kind]`
  // from the public site.
  const branchHref = kindHref(category.kind);

  const photos = toGalleryImages(category, species, locale);

  // `species_count` counts what is *enabled*, which is what the public list
  // returns - but the list is the thing actually on screen, so it is what the
  // chip counts. They agree except when the API and this page disagree about
  // visibility, and then the honest number is the one the reader can see.
  const chips: DetailHeroChip[] = [
    {
      key: "species",
      label: `${format.number(species.length)} ${t("speciesCount")}`,
    },
  ];
  if (photos.length > 0) {
    chips.push({
      key: "photos",
      label: `${format.number(photos.length)} ${t("photosCount")}`,
    });
  }

  const breadcrumbs = [
    { label: t("breadcrumbHome"), href: "/" },
    { label: kindLabel, href: branchHref },
    { label: name },
  ];

  return (
    <Box flexDirection="column" width="100%">
      <DetailHero
        image={category.image}
        icon={category.icon}
        fit={category.fit ?? "cover"}
        backgroundColor={category.background_color}
        eyebrow={kindLabel}
        eyebrowHref={branchHref}
        title={name}
        scientificName={category.scientific_name}
        chips={chips}
      />

      <Container size="lg" paddingX={10} marginTop={16}>
        <Breadcrumbs items={breadcrumbs} />

        {/* Media/text split at `sm`, not `md` - see apps/CLAUDE.md. The writing
            and the facts stack in one column, the photographs sit beside them -
            and lead them once the two stack, which is what `reorder` says: below
            `sm` the text column flows last. With no photographs at all there is
            no second column, so the text takes the full width rather than
            leaving a placeholder square. */}
        <Grid container spacing={2}>
          <Grid
            size={{ xs: 12, sm: photos.length > 0 ? 6 : 12 }}
            reorder={{ xs: "last" }}
          >
            <Box flexDirection="column" gap={16}>
              <Card gap={12} padding={18}>
                {shortDescription && (
                  <Typography variant="body" fontWeight={600}>
                    {shortDescription}
                  </Typography>
                )}

                {description ? (
                  // Authored in the CMS as free text, which may or may not carry
                  // markdown; `RichText` renders both without the author opting in.
                  <RichText>{description}</RichText>
                ) : (
                  !shortDescription && (
                    <Typography
                      variant="body"
                      color="var(--foreground-muted, #6b7280)"
                    >
                      {t("noDescription")}
                    </Typography>
                  )
                )}
              </Card>

              <FactsCard
                facts={[
                  { label: t("factKind"), value: kindLabel, href: branchHref },
                  category.scientific_name
                    ? {
                      label: t("factScientificName"),
                      value: category.scientific_name,
                    }
                    : null,
                  {
                    label: t("factSpecies"),
                    value: format.number(species.length),
                  },
                  {
                    label: t("factSightings"),
                    value: format.number(totalSightings(species)),
                  },
                ]}
                href={category.href}
                hrefLabel={t("externalReference")}
              />
            </Box>
          </Grid>

          {photos.length > 0 && (
            <Grid size={{ xs: 12, sm: 6 }}>
              <DetailGallery
                images={photos}
                placeholderColor={category.background_color}
              />
            </Grid>
          )}
        </Grid>

        {sightings.length > 0 && (
          <Box marginTop={56}>
            <SightingsSection
              sightings={sightings}
              locale={locale}
              title={t("sightingsTitle")}
              subtitle={t("sightingsSubtitle", { category: name })}
            />
          </Box>
        )}

        {/* Under the recent entries, not beside them: the band above is *what*
            was seen lately, this is *where* the whole category has been - every
            located sighting of it, not only the six the slider carries. The
            category filter is left off deliberately; every pin here is this
            category. */}
        {mapPins.length > 0 && (
          <Box marginTop={56}>
            <SightingsMapSection
              pins={mapPins}
              locale={locale}
              title={t("mapTitle")}
              subtitle={t("mapSubtitle", { category: name })}
              filters={["species", "location", "year"]}
            />
          </Box>
        )}

        <Box flexDirection="column" gap={24} marginTop={56}>
          <Box flexDirection="column" gap={8}>
            <Typography as="h2" variant="h2" fontWeight={700}>
              {t("speciesTitle")}
            </Typography>
            <Typography variant="body" color="var(--foreground-muted, #6b7280)">
              {t("speciesSubtitle", { category: name })}
            </Typography>
          </Box>

          <SpeciesGrid species={species} locale={locale} />
        </Box>
      </Container>

      <PageBottomSpacer />
      {/* A second spacer's worth of clearance, because the corner holds a *stack*
          rather than one button - `PageBottomSpacer` alone leaves the last row of
          the species grid under the upper FAB. */}
      <Box height={FAB_STACK_OFFSET} aria-hidden />

      {/* Two actions, and the order between them is the point. **Filing a
          sighting is the primary one**: a reader who has just scrolled a
          category's photographs and journal entries has almost certainly seen one
          of these things themselves, whereas proposing a species the catalog is
          missing is the rarer, more editorial act. So "Add a sighting" takes the
          accent fill and the corner, and "Add a species" sits above it in the
          neutral kind at the smaller size.

          Both carry `?category=` and mean subtly different things by it. The
          species flow *locks* to the category - a species belongs to exactly one,
          and the page it was pressed on decided which. The sighting flow only
          *opens* on it: the entry records one of the category's species, and
          which one is the first thing its form asks (see the contribute page's
          docstring).

          Shown to every reader, signed in or not: the FABs are how a reader learns
          the site takes contributions at all, and each destination explains itself
          and offers the sign-in. Extended rather than bare circles, because two
          stacked "+" circles say nothing about which is which. Both are `position:
          fixed`, so they sit outside the `Container` and after the spacers that
          keep the last row clear of them. */}
      <FloatingActionButton
        icon="/icons/deer.svg"
        aria-label={tContribute("addSpecies")}
        label={tContribute("addSpecies")}
        href={`/contribute/species?category=${category.slug}`}
        kind="warning"
        size="md"
        // The one thing `offset` cannot express: it sets both edges at once, and
        // this button is the primary's own distance from the corner *plus* the
        // primary. `--ui-fab-offset` is read rather than hard-coded so the pair
        // still tucks in together below `sm`, where `.ui-fab` narrows it to 16px.
        styles={{
          bottom: `calc(var(--ui-fab-offset, 20px) + env(safe-area-inset-bottom, 0px) + ${FAB_STACK_OFFSET}px)`,
        }}
      />
      <FloatingActionButton
        icon="/icons/binoculars.svg"
        aria-label={tContribute("addSighting")}
        label={tContribute("addSighting")}
        href={`/contribute/sightings?category=${category.slug}`}
      />
    </Box>
  );
}

/**
 * Every photograph the strip carries: the category's own first - the shots an
 * author chose for the *group* - then its species', each cover followed by that
 * species' reference photos, so it reads species by species rather than
 * interleaving them.
 *
 * **The cover is kept, unlike the strips this replaced.** Those were contact
 * sheets under a hero already showing it, so repeating it read as a duplicate;
 * this is a numbered slideshow with its own thumbnails, where the cover is simply
 * slide 1 - the same call the species page makes. The CMS uploads every photo
 * into a record's gallery and the API publishes the first row as its `image`, so
 * a cover is normally one of the rows iterated below; the `seen` set is what
 * keeps it from appearing twice.
 *
 * Each photo carries its own `fit` and `background_color`: a plate authored as
 * `contain` (an illustration, a range map) must be letterboxed, not cropped.
 */
function toGalleryImages(
  category: Category,
  species: Species[],
  locale: string,
): GalleryImage[] {
  const images: GalleryImage[] = [];
  const seen = new Set<string>();

  const push = (
    url: string | null,
    alt: string,
    fit: Category["fit"],
    backgroundColor: string | null,
  ) => {
    if (!url || seen.has(url)) return;
    seen.add(url);
    images.push({ url, alt, fit: fit ?? "cover", backgroundColor });
  };

  const categoryName = localized(category, "name", locale) ?? category.slug;
  push(category.image, categoryName, category.fit, category.background_color);
  for (const photo of category.images) {
    push(
      photo.image,
      localized(photo, "name", locale) ?? categoryName,
      photo.fit,
      photo.background_color,
    );
  }

  for (const item of species) {
    const name = localized(item, "name", locale) ?? item.slug;
    push(item.image, name, item.fit, item.background_color);
    for (const photo of item.images) {
      // The photo's own caption when it has one - that is what distinguishes a
      // reference shot ("winter plumage") from the cover it sits beside.
      push(
        photo.image,
        localized(photo, "name", locale) ?? name,
        photo.fit,
        photo.background_color,
      );
    }
  }

  return images;
}

/** How many journal entries the whole category accounts for. */
function totalSightings(species: Species[]): number {
  return species.reduce((total, item) => total + item.sighting_count, 0);
}
