import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server';
import { Box } from '@repo/ui/core-elements/box';
import { Container } from '@repo/ui/core-elements/container';
import { Typography } from '@repo/ui/core-elements/typography';
import { NavbarSpacer, PageBottomSpacer } from '@repo/ui/core-elements/navbar';
import { getCategories, getFeaturedSpecies } from '@/lib/catalog';
import { getLatestSightings, type Sighting } from '@/lib/journal';
import { localized } from '@/lib/i18n-field';
import { SpeciesGallery, type SpeciesSlide } from './species-gallery';
import { CategoryNav } from './category-nav';
import { LatestSightings, type SightingSlide } from './latest-sightings';

type Props = { params: Promise<{ locale: string }> };

/** How many entries the journal slider carries. */
const LATEST_SIGHTINGS = 8;

export default async function Home({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations('HomePage');
  const tGallery = await getTranslations('Gallery');
  const tSighting = await getTranslations('Sighting');
  const format = await getFormatter({ locale });

  // Three independent sections, so they are fetched together rather than in
  // series; each fetcher answers an empty list instead of throwing, so a dead
  // backend costs a section, not the page.
  const [species, categories, sightings] = await Promise.all([
    getFeaturedSpecies(),
    getCategories(),
    getLatestSightings(LATEST_SIGHTINGS),
  ]);

  // Both sliders are client components, so every bilingual field pair is
  // resolved here - on the server, where the locale lives - and handed down as
  // plain strings.
  const speciesSlides: SpeciesSlide[] = species.flatMap((item) => {
    if (!item.image) return [];
    return [
      {
        id: item.id,
        name: localized(item, 'name', locale) ?? item.slug,
        shortDescription: localized(item, 'short_description', locale),
        scientificName: item.scientific_name,
        categoryName:
          localized(
            { name: item.category_name, en_name: item.category_en_name },
            'name',
            locale,
          ),
        image: item.image,
      },
    ];
  });

  const sightingSlides: SightingSlide[] = sightings.map((sighting) =>
    toSightingSlide(sighting, locale, format),
  );

  const hasGallery = speciesSlides.length > 0;

  return (
    <Box flexDirection="column" width="100%">
      {/* Full horizontal bleed: the gallery sits outside any Container and
          reaches both edges, at the same height a `@repo/ui` Hero occupies. */}
      {hasGallery ? (
        <SpeciesGallery
          slides={speciesSlides}
          labels={{ previous: tGallery('previous'), next: tGallery('next') }}
        />
      ) : (
        // With no gallery the page would start underneath the fixed navbar.
        <NavbarSpacer />
      )}

      <Container size="lg" paddingX={10} marginTop={48}>
        <CategoryNav categories={categories} locale={locale} />
      </Container>

      {sightingSlides.length > 0 && (
        <Container size="lg" paddingX={10} marginTop={64}>
          <Box flexDirection="column" gap={24}>
            <Box flexDirection="column" gap={8}>
              <Typography as="h2" variant="h2" fontWeight={700}>
                {t('latestSightingsTitle')}
              </Typography>
              <Typography variant="body" color="var(--foreground-muted, #6b7280)">
                {t('latestSightingsSubtitle')}
              </Typography>
            </Box>

            <LatestSightings
              slides={sightingSlides}
              labels={{
                previous: tGallery('previous'),
                next: tGallery('next'),
                species: tSighting('species'),
                date: tSighting('date'),
                location: tSighting('location'),
                season: tSighting('season'),
                weather: tSighting('weather'),
                temperature: tSighting('temperature'),
                individuals: tSighting('individuals'),
              }}
            />
          </Box>
        </Container>
      )}

      <PageBottomSpacer />
    </Box>
  );
}

type Formatter = Awaited<ReturnType<typeof getFormatter>>;

function toSightingSlide(
  sighting: Sighting,
  locale: string,
  format: Formatter,
): SightingSlide {
  const speciesName = localized(
    { name: sighting.species_name, en_name: sighting.species_en_name },
    'name',
    locale,
  );

  return {
    id: sighting.id,
    // `name` is the entry's optional title ("First fawn of the spring"); the
    // species name is the documented fallback when the author left it blank.
    title: localized(sighting, 'name', locale) ?? speciesName ?? sighting.slug,
    speciesName,
    categoryName: localized(
      { name: sighting.category_name, en_name: sighting.category_en_name },
      'name',
      locale,
    ),
    shortDescription: localized(sighting, 'short_description', locale),
    dateLabel: formatSightingDate(sighting.date, format),
    locationName: localized(
      { name: sighting.location_name, en_name: sighting.location_en_name },
      'name',
      locale,
    ),
    seasonName: localized(
      { name: sighting.season_name, en_name: sighting.season_en_name },
      'name',
      locale,
    ),
    weatherName: localized(
      { name: sighting.weather_name, en_name: sighting.weather_en_name },
      'name',
      locale,
    ),
    temperature: formatTemperature(sighting.temperature_c, format),
    individuals: sighting.individuals,
    image: sighting.image ?? sighting.species_image,
  };
}

/**
 * The API publishes a bare calendar day (`YYYY-MM-DD`). Parsed as-is that is UTC
 * midnight, which renders as the *previous* day for any visitor west of
 * Greenwich - so it is anchored at local noon, which no timezone can push across
 * a date boundary.
 */
function formatSightingDate(date: string, format: Formatter): string {
  const parsed = new Date(`${date}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return date;
  return format.dateTime(parsed, { year: 'numeric', month: 'long', day: 'numeric' });
}

function formatTemperature(value: string | null, format: Formatter): string | null {
  if (value === null) return null;
  const parsed = Number(value);
  if (Number.isNaN(parsed)) return null;
  return `${format.number(parsed, { maximumFractionDigits: 1 })} °C`;
}
