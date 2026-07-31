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
  getSighting,
  getSightingsBySpecies,
  sightingMapPin,
  type Sighting,
} from "@/lib/journal";
import { kindHref } from "@/lib/catalog";
import { localized } from "@/lib/i18n-field";
import {
  DetailHero,
  type DetailHeroChip,
} from "@/components/catalog/detail-hero";
import { FactsCard, type Fact } from "@/components/catalog/facts-card";
import {
  DetailGallery,
  type GalleryImage,
} from "@/components/catalog/detail-gallery";
import { SightingsSection } from "@/components/journal/sightings-section";
import { SightingsMapSection } from "@/components/journal/sightings-map-section";
import { SightingVideos, type SightingVideo } from "./sighting-videos";

/**
 * One journal entry's page: what was seen, the story of the encounter, the
 * photographs and clips taken of it, where it happened, and the other entries
 * recording the same species. The destination of the "See detail" button on
 * every card in a `SightingsSection` slider.
 *
 * The third route composed from `components/catalog/` (`DetailHero`,
 * `FactsCard`, `DetailGallery`), so an entry reads as the same object as the
 * category and species pages it hangs under rather than as a separate design -
 * down to the first row, which is theirs: the story and the field conditions as
 * two stacked cards, the photographs beside them as a slideshow.
 *
 * Three things specific to a sighting:
 *
 * - **Its gallery is stored *and* may hold video.** `SightingMedia` is one table
 *   with a `kind`, so the media list is split here: photos go to `DetailGallery`
 *   in the first row, videos and video links to `SightingVideos` as players
 *   below it.
 * - **The map and the related band stay where they are**, under the row - an
 *   entry is a place and a date before it is a set of pictures.
 * - **That map is the same one the landing and a category draw**
 *   (`SightingsMapSection` → `SightingsMap` → `@repo/ui`'s `OsmMap`), holding
 *   this entry as its only pin. It is not a second, simpler map component: the
 *   marker has to wear the species' icon, and only a map drawn into the page can
 *   put a mark of our own on a pin - which is exactly what the keyless Google
 *   iframe that used to sit here could not do.
 */

type Props = { params: Promise<{ locale: string; slug: string }> };

/** How many other entries for the same species the page's related band carries. */
const RELATED_LIMIT = 6;

/**
 * The map's height, and therefore a lone portrait clip's: the two stand in one
 * row, so the clip is cut to this and takes whatever width its aspect ratio
 * asks for. It is also what such a clip is capped at on an entry with no
 * coordinates, where there is no map to stand beside but the same reason not to
 * let a 9:16 video run a thousand pixels down the page.
 */
const MAP_HEIGHT = 380;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params;
  const sighting = await getSighting(slug);
  if (!sighting) return {};

  const title = sightingTitle(sighting, locale);
  const description = localized(sighting, "short_description", locale);

  return {
    title,
    ...(description ? { description } : {}),
    openGraph: {
      title,
      ...(description ? { description } : {}),
      ...(sighting.image ? { images: [{ url: sighting.image }] } : {}),
    },
  };
}

export default async function SightingPage({ params }: Props) {
  const { locale, slug } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("SightingPage");
  const tSighting = await getTranslations("Sighting");
  const tCategory = await getTranslations("CategoryPage");
  const tKinds = await getTranslations("Kinds");
  const tContribute = await getTranslations("Contribute");
  const format = await getFormatter({ locale });

  const sighting = await getSighting(slug);

  // Null only on a real 404 - see the note in `lib/journal.ts` → `getSighting`.
  if (!sighting) notFound();

  // Sequential rather than parallel, unlike the catalog pages: the related band
  // keys off the species this entry records, which is only known once the entry
  // itself has answered.
  const related = sighting.species_slug
    ? (
      await getSightingsBySpecies(sighting.species_slug, RELATED_LIMIT + 1)
    ).filter(
      // The entry the reader is already on is not a related one.
      (item) => item.id !== sighting.id,
    )
    : [];

  const title = sightingTitle(sighting, locale);
  const speciesName = localized(
    { name: sighting.species_name, en_name: sighting.species_en_name },
    "name",
    locale,
  );
  const categoryName = localized(
    { name: sighting.category_name, en_name: sighting.category_en_name },
    "name",
    locale,
  );
  const shortDescription = localized(sighting, "short_description", locale);
  const description = localized(sighting, "description", locale);
  const locationName = localized(
    { name: sighting.location_name, en_name: sighting.location_en_name },
    "name",
    locale,
  );

  const dateLabel = formatDay(sighting.date, format);
  const timeLabel = formatTime(sighting.date, sighting.time, format);

  const speciesHref = sighting.species_slug
    ? `/species/${sighting.species_slug}`
    : null;
  const categoryHref = sighting.category_slug
    ? `/categories/${sighting.category_slug}`
    : null;
  // The branch reaches an entry through species → category, so the API spells
  // it `species__category__kind` and publishes it flat as `kind` - null exactly
  // when the entry records no species.
  const branchLabel = sighting.kind ? tKinds(sighting.kind) : null;
  const branchHref = sighting.kind ? kindHref(sighting.kind) : null;

  const photos = toGalleryImages(sighting, locale);
  const videos = toVideos(sighting, locale);

  const chips: DetailHeroChip[] = [{ key: "date", label: dateLabel }];
  if (locationName) chips.push({ key: "location", label: locationName });
  if (sighting.individuals !== null) {
    chips.push({
      key: "individuals",
      label: `${format.number(sighting.individuals)} ${tSighting("individuals")}`,
    });
  }

  // The full path down the tree: home → branch → category → species → this
  // entry, the same chain the category and species pages now carry.
  const breadcrumbs = [
    { label: t("breadcrumbHome"), href: "/" },
    ...(branchLabel && branchHref
      ? [{ label: branchLabel, href: branchHref }]
      : []),
    ...(categoryName && categoryHref
      ? [{ label: categoryName, href: categoryHref }]
      : []),
    ...(speciesName && speciesHref
      ? [{ label: speciesName, href: speciesHref }]
      : []),
    { label: title },
  ];

  const seasonName = localized(
    { name: sighting.season_name, en_name: sighting.season_en_name },
    "name",
    locale,
  );
  const weatherName = localized(
    { name: sighting.weather_name, en_name: sighting.weather_en_name },
    "name",
    locale,
  );
  const temperature = formatTemperature(sighting.temperature_c, format);

  // Only the conditions this entry actually recorded - an outing with no
  // weather noted should show no weather row rather than an empty one.
  const facts: (Fact | null)[] = [
    speciesName
      ? { label: tSighting("species"), value: speciesName, href: speciesHref }
      : null,
    categoryName
      ? {
        label: tSighting("category"),
        value: categoryName,
        href: categoryHref,
      }
      : null,
    { label: tSighting("date"), value: dateLabel },
    timeLabel ? { label: tSighting("time"), value: timeLabel } : null,
    locationName ? { label: tSighting("location"), value: locationName } : null,
    seasonName ? { label: tSighting("season"), value: seasonName } : null,
    weatherName ? { label: tSighting("weather"), value: weatherName } : null,
    temperature
      ? { label: tSighting("temperature"), value: temperature }
      : null,
    sighting.individuals !== null
      ? {
        label: tSighting("individuals"),
        value: format.number(sighting.individuals),
      }
      : null,
    // The credit line, last: it is who filed the entry rather than something the
    // entry records. Empty for a CMS entry (nobody filed it), for a contribution
    // filed anonymously, *and* for an account with no first name - the API
    // publishes nothing in all three cases, so this is the one check, not three
    // (see `Sighting.author_name` in lib/journal.ts).
    sighting.author_name
      ? { label: tSighting("author"), value: sighting.author_name }
      : null,
  ];

  // The entry as its own map pin, or `null` when it has no coordinates - which
  // is what narrows the pair out of `number | null` for the map below. It costs
  // no request: the detail payload carries the glyphs and the branch colour a
  // marker is drawn with, exactly as the map endpoint does.
  const pin = sightingMapPin(sighting);

  // Where a lone portrait clip goes. A phone's vertical video is thin and tall:
  // given the page's full width it runs well past a screen, and given a section
  // of its own it leaves two columns of nothing beside it. So the one case that
  // is a single portrait clip is cut to the map's height and stands *in the
  // map's row*, under one heading - and on an entry with no coordinates it keeps
  // the height and simply stands alone. Anything else - a landscape clip, a clip
  // still encoding (no dimensions yet, so no orientation), or two clips of any
  // shape - goes to the video section, which lays them out as a grid.
  const soloPortrait =
    videos.length === 1 && videos[0] && isPortrait(videos[0]) ? videos[0] : null;
  const videoBesideMap = soloPortrait && pin ? soloPortrait : null;
  const sectionVideos = videoBesideMap ? [] : videos;

  return (
    <Box flexDirection="column" width="100%">
      <DetailHero
        image={sighting.image}
        // A journal entry has no mark of its own - the icon belongs to the
        // category it hangs under, and repeating it here would label the
        // encounter as the branch rather than as itself.
        icon={null}
        fit={sighting.fit ?? "cover"}
        backgroundColor={sighting.background_color}
        eyebrow={categoryName}
        eyebrowHref={categoryHref}
        title={title}
        // Unlike a category or a species, an entry's title is free text an
        // author types - "Pair of mule deer grazing the meadow behind the
        // cabin at dusk" is a normal one - and at the h1's 56 px it would
        // otherwise run down half the photograph. Two lines, then ellipsis;
        // the whole title is still the breadcrumb, the tab title and the OG
        // title, so nothing is lost by cutting it here.
        titleLines={2}
        // The species is the entry's subject rather than its binomial, so it
        // takes the hero's secondary line - and the facts card links it.
        scientificName={speciesName}
        chips={chips}
      />

      <Container size="lg" paddingX={10} marginTop={16}>
        <Breadcrumbs items={breadcrumbs} />

        {/* Media/text split at `sm`, not `md` - see apps/CLAUDE.md. The story
            and the field conditions stack in one column, the photographs sit
            beside them - and lead them once the two stack, which is what
            `reorder` says: below `sm` the text column flows last, so a reader
            meets the encounter before reading it. An entry with no photographs
            gives the text the full width rather than a placeholder square. */}
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
                      {tCategory("noDescription")}
                    </Typography>
                  )
                )}
              </Card>

              <FactsCard
                facts={facts}
                href={sighting.href}
                hrefLabel={tCategory("externalReference")}
              />
            </Box>
          </Grid>

          {photos.length > 0 && (
            <Grid size={{ xs: 12, sm: 6 }}>
              <DetailGallery
                images={photos}
                placeholderColor={sighting.background_color}
              />
            </Grid>
          )}
        </Grid>

        {sectionVideos.length > 0 && (
          <Box flexDirection="column" gap={24} marginTop={56}>
            <Typography as="h2" variant="h2" fontWeight={700}>
              {t("videoTitle")}
            </Typography>
            <SightingVideos
              videos={sectionVideos}
              // Only ever set for the lone portrait clip that had no map to
              // stand beside; every other section lets each clip take the width
              // its column gives it.
              {...(soloPortrait ? { frameHeight: MAP_HEIGHT } : {})}
            />
          </Box>
        )}

        {/* The same map every other page here draws, holding one pin: the
            OpenStreetMap tiles this app paints itself, with the marker wearing
            this entry's species icon (its category's when the species has none).
            It replaced a keyless Google iframe, which could show a pin but never
            *that* pin - nothing on a page can draw inside a cross-origin frame.
            No filters: every dropdown over a single entry is a no-op. */}
        {pin && (
          <Box marginTop={56}>
            <SightingsMapSection
              pins={[pin]}
              locale={locale}
              // One heading over both when the clip is standing in this row -
              // "Video" and "Where it was seen" as two titles over one band
              // would read as two sections that happen to be side by side.
              title={videoBesideMap ? t("mapAndVideoTitle") : t("mapTitle")}
              {...(videoBesideMap
                ? {
                  aside: (
                    <SightingVideos
                      videos={[videoBesideMap]}
                      frameHeight={MAP_HEIGHT}
                    />
                  ),
                }
                : {})}
              // The API blurs the pair to ~1 km for *every* caller when the
              // place is flagged sensitive, so this says so rather than
              // pretending the pin is exact.
              subtitle={
                sighting.coordinates_are_approximate
                  ? t("mapApproximate")
                  : (locationName ?? t("mapSubtitle"))
              }
              filters={[]}
              height={MAP_HEIGHT}
              // A single pin frames at whatever ceiling it is given. Backed off
              // from a building-level zoom: the subject is a place in a
              // landscape, and a sensitive one has been rounded to about this
              // much anyway.
              maxFitZoom={sighting.coordinates_are_approximate ? 12 : 14}
            />
          </Box>
        )}

        {related.length > 0 && speciesName && (
          <Box marginTop={56}>
            <SightingsSection
              sightings={related}
              locale={locale}
              title={t("relatedTitle")}
              subtitle={t("relatedSubtitle", { species: speciesName })}
            />
          </Box>
        )}
      </Container>

      <PageBottomSpacer />

      {/* File another entry for the *same species* - the FAB on a category page
          proposes a species, this one records an encounter, and both prefill from
          the record the reader is standing on. Rendered only when the entry names a
          species: `species_slug` is null exactly when it records none, and the
          contribute route requires one (it 404s without it), so a FAB here would be
          a button that leads to a dead page. */}
      {sighting.species_slug && (
        <FloatingActionButton
          icon="/icons/binoculars.svg"
          aria-label={tContribute("addSighting")}
          label={tContribute("addSighting")}
          position="bottom-right"
          href={`/contribute/sightings?species=${sighting.species_slug}`}
        />
      )}
    </Box>
  );
}

/**
 * The entry's own title, falling back to the species it records and then to its
 * slug - `name` is optional in the CMS, and an untitled entry is normal.
 */
function sightingTitle(sighting: Sighting, locale: string): string {
  return (
    localized(sighting, "name", locale) ??
    localized(
      { name: sighting.species_name, en_name: sighting.species_en_name },
      "name",
      locale,
    ) ??
    sighting.slug
  );
}

/**
 * The entry's photographs for the slideshow: the cover first, then its `media`
 * rows of kind `image` in their authored order.
 *
 * **The cover is kept**, unlike the contact sheet this replaced - that sat under
 * a hero already showing it, so repeating it read as a duplicate; this is a
 * numbered slideshow with its own thumbnails, where the cover is simply slide 1.
 * With no cover of its own the API publishes the first gallery photo as `image`,
 * so the cover is normally one of the rows below too - hence the `seen` set,
 * which keeps it from appearing twice. A cover the author uploaded separately
 * lives on the `Sighting` rather than in `media`, matches nothing, and leads the
 * strip on its own.
 *
 * Each photo carries its own `fit` and `background_color`: one authored as
 * `contain` must be letterboxed, not cropped.
 */
function toGalleryImages(sighting: Sighting, locale: string): GalleryImage[] {
  const title = sightingTitle(sighting, locale);
  const images: GalleryImage[] = [];
  const seen = new Set<string>();

  const push = (
    url: string | null,
    alt: string,
    fit: Sighting["fit"],
    backgroundColor: string | null,
  ) => {
    if (!url || seen.has(url)) return;
    seen.add(url);
    images.push({ url, alt, fit: fit ?? "cover", backgroundColor });
  };

  push(sighting.image, title, sighting.fit, sighting.background_color);
  for (const item of sighting.media) {
    if (item.kind !== "image") continue;
    push(
      item.image,
      localized(item, "name", locale) ?? title,
      item.fit,
      item.background_color,
    );
  }

  return images;
}

/**
 * The entry's clips - uploaded files and video links alike, via `source_url`.
 *
 * ⚠ **A row with no `source_url` is not skipped.** An uploaded clip exists as a
 * row from the moment it is reserved, and its file only appears when the
 * transcode finishes minutes later - so dropping the URL-less rows (which is
 * what this used to do) made a contributor's clip vanish from the page entirely
 * until it was ready, with nothing to say it was coming. They are emitted with a
 * `status` instead, and `SightingVideos` counts them into one line under the
 * heading - not a frame each, which would be a black box the shape of a guess.
 *
 * A **link** is still dropped when it has no URL: there is nothing in flight
 * there, just an empty row.
 *
 * ⚠ **A `failed` clip is dropped outright**, which is why nothing downstream
 * renders that state. There is no file and there never will be one - the row is
 * a note to the author (who sees it in `/admin/sightings`, with the reason), not
 * something a reader of the journal can act on, and a black frame apologising
 * for a video they never knew existed is worse than the entry simply not having
 * one. It also takes the media dimensions along: the frames are cut to the
 * clip's real shape now, not to a fixed 16:9.
 */
function toVideos(sighting: Sighting, locale: string): SightingVideo[] {
  return sighting.media.flatMap((item) => {
    if (item.kind === "image") return [];

    // Read out before the guard so the narrowed union - the three states that
    // can still reach a reader - is what `SightingVideo` carries.
    const status = item.processing_status;
    if (status === "failed") return [];

    const pending = item.kind === "video" && status !== "ready";
    if (!pending && !item.source_url) return [];

    return [
      {
        key: `media-${item.id}`,
        url: item.source_url,
        status,
        title: localized(item, "name", locale),
        caption: localized(item, "description", locale),
        width: item.width,
        height: item.height,
      },
    ];
  });
}

/**
 * Whether a clip is taller than it is wide - the shape that gets the map's row.
 *
 * Only ever true for a clip that is **ready**: the pipeline writes the output's
 * dimensions when it finishes, so one still encoding has none and is treated as
 * landscape until it does. That is the honest answer rather than a gap - the
 * page cannot know a shape ffmpeg has not reported - and the poll that swaps the
 * "being converted" line for the player re-renders this with the real numbers.
 */
function isPortrait(video: SightingVideo): boolean {
  return Boolean(video.width && video.height && video.height > video.width);
}

type Formatter = Awaited<ReturnType<typeof getFormatter>>;

/**
 * The API publishes a bare calendar day (`YYYY-MM-DD`). Parsed as-is that is UTC
 * midnight, which renders as the *previous* day for any visitor west of
 * Greenwich - so it is anchored at local noon, which no timezone can push across
 * a date boundary.
 */
function formatDay(day: string, format: Formatter): string {
  const parsed = new Date(`${day}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return day;
  return format.dateTime(parsed, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/**
 * The time of day, when it was noted. Built on the entry's own date so the
 * formatter gets a real instant, and rendered without a timezone conversion
 * because the API stores a wall-clock time, not a UTC one.
 */
function formatTime(
  day: string,
  time: string | null,
  format: Formatter,
): string | null {
  if (!time) return null;
  const parsed = new Date(`${day}T${time}`);
  if (Number.isNaN(parsed.getTime())) return time;
  return format.dateTime(parsed, { hour: "numeric", minute: "2-digit" });
}

function formatTemperature(
  value: string | null,
  format: Formatter,
): string | null {
  if (value === null) return null;
  const parsed = Number(value);
  if (Number.isNaN(parsed)) return null;
  return `${format.number(parsed, { maximumFractionDigits: 1 })} °C`;
}
