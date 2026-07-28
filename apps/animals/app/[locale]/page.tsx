import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Box } from '@repo/ui/core-elements/box';
import { Container } from '@repo/ui/core-elements/container';
import { NavbarSpacer, PageBottomSpacer } from '@repo/ui/core-elements/navbar';
import { getCategories, getFeaturedSpecies } from '@/lib/catalog';
import { getLatestSightings } from '@/lib/journal';
import { localized } from '@/lib/i18n-field';
import { SightingsSection } from '@/components/journal/sightings-section';
import { SpeciesGallery, type SpeciesSlide } from './species-gallery';
import { CategoryNav } from './category-nav';

type Props = { params: Promise<{ locale: string }> };

/** How many entries the journal slider carries. */
const LATEST_SIGHTINGS = 8;

export default async function Home({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations('HomePage');
  const tGallery = await getTranslations('Gallery');

  // Three independent sections, so they are fetched together rather than in
  // series; each fetcher answers an empty list instead of throwing, so a dead
  // backend costs a section, not the page.
  const [species, categories, sightings] = await Promise.all([
    getFeaturedSpecies(),
    getCategories(),
    getLatestSightings(LATEST_SIGHTINGS),
  ]);

  // The gallery is a client component, so every bilingual field pair is resolved
  // here - on the server, where the locale lives - and handed down as plain
  // strings. (`SightingsSection` does the same for the journal band.)
  const speciesSlides: SpeciesSlide[] = species.flatMap((item) => {
    if (!item.image) return [];
    return [
      {
        id: item.id,
        slug: item.slug,
        name: localized(item, 'name', locale) ?? item.slug,
        shortDescription: localized(item, 'short_description', locale),
        scientificName: item.scientific_name,
        categoryName:
          localized(
            { name: item.category_name, en_name: item.category_en_name },
            'name',
            locale,
          ),
        categorySlug: item.category_slug,
        image: item.image,
      },
    ];
  });

  const hasGallery = speciesSlides.length > 0;

  return (
    <Box flexDirection="column" width="100%">
      {/* Full horizontal bleed: the gallery sits outside any Container and
          reaches both edges, in the same band a catalog page's `DetailHero`
          occupies (`lib/hero-height.ts`). */}
      {hasGallery ? (
        <SpeciesGallery
          slides={speciesSlides}
          locale={locale}
          labels={{ previous: tGallery('previous'), next: tGallery('next') }}
        />
      ) : (
        // With no gallery the page would start underneath the fixed navbar.
        <NavbarSpacer />
      )}

      <Container size="lg" paddingX={10} marginTop={48}>
        <CategoryNav categories={categories} locale={locale} />
      </Container>

      {/* `SightingsSection` renders nothing for an empty feed, so the Container
          is guarded too - otherwise its margin would leave a gap around it. */}
      {sightings.length > 0 && (
        <Container size="lg" paddingX={10} marginTop={64}>
          <SightingsSection
            sightings={sightings}
            locale={locale}
            title={t('latestSightingsTitle')}
            subtitle={t('latestSightingsSubtitle')}
          />
        </Container>
      )}

      <PageBottomSpacer />
    </Box>
  );
}
