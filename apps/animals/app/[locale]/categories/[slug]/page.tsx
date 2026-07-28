import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server';
import { Box } from '@repo/ui/core-elements/box';
import { Grid } from '@repo/ui/core-elements/grid';
import { Container } from '@repo/ui/core-elements/container';
import { Typography } from '@repo/ui/core-elements/typography';
import { Breadcrumbs } from '@repo/ui/core-elements/breadcrumbs';
import { RichText } from '@repo/ui/core-elements/rich-text';
import { PageBottomSpacer } from '@repo/ui/core-elements/navbar';
import { getCategory, getSpeciesByCategory, type Species } from '@/lib/catalog';
import { getSightingsByCategory } from '@/lib/journal';
import { localized } from '@/lib/i18n-field';
import { DetailHero, type DetailHeroChip } from '@/components/catalog/detail-hero';
import { FactsCard } from '@/components/catalog/facts-card';
import { PhotoGallery, type GalleryPhoto } from '@/components/catalog/photo-gallery';
import { SpeciesGrid } from '@/components/catalog/species-grid';
import { SightingsSection } from '@/components/journal/sightings-section';

/**
 * One category's page: what this group of things is, every photograph the site
 * holds of it, the species filed under it, and the journal entries that record
 * them. The destination of every tile in the landing's `CategoryNav`.
 *
 * **The photo gallery is aggregated, not stored.** A `Category` owns exactly one
 * photograph (`image`, which is already the hero) plus its `icon`, so there is
 * no category gallery in the database to render. What a reader wants here is a
 * contact sheet of the *category*, which is precisely the union of its species'
 * photographs - each species' cover shot and its reference photos. That union is
 * built in `toGalleryPhotos` below, from the species list the page already had
 * to fetch, so the gallery costs no extra request.
 */

type Props = { params: Promise<{ locale: string; slug: string }> };

/** How many journal entries the page's sightings band carries. */
const SIGHTINGS_LIMIT = 6;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params;
  const category = await getCategory(slug);
  if (!category) return {};

  const name = localized(category, 'name', locale) ?? category.slug;
  const description = localized(category, 'short_description', locale);

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

  const t = await getTranslations('CategoryPage');
  const tKinds = await getTranslations('Kinds');
  const tGallery = await getTranslations('Gallery');
  const format = await getFormatter({ locale });

  // The species and the journal band both key off the slug rather than the
  // category's pk, so all three reads start together instead of waiting on the
  // category to resolve first.
  const [category, species, sightings] = await Promise.all([
    getCategory(slug),
    getSpeciesByCategory(slug),
    getSightingsByCategory(slug, SIGHTINGS_LIMIT),
  ]);

  // `getCategory` answers null only on a real 404 - a backend that is down
  // throws instead, so this cannot turn an outage into "no such category".
  if (!category) notFound();

  const name = localized(category, 'name', locale) ?? category.slug;
  const shortDescription = localized(category, 'short_description', locale);
  const description = localized(category, 'description', locale);
  const kindLabel = tKinds(category.kind);

  const photos = toGalleryPhotos(species, locale);

  // `species_count` counts what is *enabled*, which is what the public list
  // returns - but the list is the thing actually on screen, so it is what the
  // chip counts. They agree except when the API and this page disagree about
  // visibility, and then the honest number is the one the reader can see.
  const chips: DetailHeroChip[] = [
    { key: 'species', label: `${format.number(species.length)} ${t('speciesCount')}` },
  ];
  if (photos.length > 0) {
    chips.push({
      key: 'photos',
      label: `${format.number(photos.length)} ${t('photosCount')}`,
    });
  }

  const breadcrumbs = [
    { label: t('breadcrumbHome'), href: `/${locale}` },
    { label: kindLabel },
    { label: name },
  ];

  return (
    <Box flexDirection="column" width="100%">
      <DetailHero
        image={category.image}
        icon={category.icon}
        fit={category.fit ?? 'cover'}
        backgroundColor={category.background_color}
        eyebrow={kindLabel}
        title={name}
        scientificName={category.scientific_name}
        chips={chips}
      />

      <Container size="lg" paddingX={10} marginTop={16}>
        <Breadcrumbs items={breadcrumbs} />

        {/* Asymmetric split at `sm`, not `md` - see apps/CLAUDE.md. The prose is
            the page's substance and the facts card is its aside. */}
        <Grid container spacing={4}>
          <Grid size={{ xs: 12, sm: 7 }}>
            <Box flexDirection="column" gap={16}>
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
                  <Typography variant="body" color="var(--foreground-muted, #6b7280)">
                    {t('noDescription')}
                  </Typography>
                )
              )}
            </Box>
          </Grid>

          <Grid size={{ xs: 12, sm: 5 }}>
            <FactsCard
              facts={[
                { label: t('factKind'), value: kindLabel },
                category.scientific_name
                  ? { label: t('factScientificName'), value: category.scientific_name }
                  : null,
                { label: t('factSpecies'), value: format.number(species.length) },
                {
                  label: t('factSightings'),
                  value: format.number(totalSightings(species)),
                },
              ]}
              href={category.href}
              hrefLabel={t('externalReference')}
            />
          </Grid>
        </Grid>

        {photos.length > 0 && (
          <Box flexDirection="column" gap={24} marginTop={56}>
            <Box flexDirection="column" gap={8}>
              <Typography as="h2" variant="h2" fontWeight={700}>
                {t('galleryTitle')}
              </Typography>
              <Typography variant="body" color="var(--foreground-muted, #6b7280)">
                {t('gallerySubtitle', { category: name })}
              </Typography>
            </Box>

            <PhotoGallery
              photos={photos}
              labels={{ previous: tGallery('previous'), next: tGallery('next') }}
            />
          </Box>
        )}

        <Box flexDirection="column" gap={24} marginTop={56}>
          <Box flexDirection="column" gap={8}>
            <Typography as="h2" variant="h2" fontWeight={700}>
              {t('speciesTitle')}
            </Typography>
            <Typography variant="body" color="var(--foreground-muted, #6b7280)">
              {t('speciesSubtitle', { category: name })}
            </Typography>
          </Box>

          <SpeciesGrid species={species} locale={locale} />
        </Box>

        {sightings.length > 0 && (
          <Box marginTop={56}>
            <SightingsSection
              sightings={sightings}
              locale={locale}
              title={t('sightingsTitle')}
              subtitle={t('sightingsSubtitle', { category: name })}
            />
          </Box>
        )}
      </Container>

      <PageBottomSpacer />
    </Box>
  );
}

/**
 * Every photograph the category can show, gathered from its species.
 *
 * A species' own cover shot comes first, then its reference photos in their
 * authored order, so the strip reads species by species rather than interleaving
 * them. Each tile links to the species it belongs to - the gallery doubles as a
 * second, denser route into the same records the grid below lists.
 */
function toGalleryPhotos(species: Species[], locale: string): GalleryPhoto[] {
  return species.flatMap((item) => {
    const name = localized(item, 'name', locale) ?? item.slug;
    const href = `/${locale}/species/${item.slug}`;
    const photos: GalleryPhoto[] = [];

    if (item.image) {
      photos.push({
        key: `species-${item.id}`,
        image: item.image,
        title: name,
        caption: localized(item, 'short_description', locale),
        fit: item.fit ?? 'cover',
        backgroundColor: item.background_color,
        href,
      });
    }

    for (const photo of item.images) {
      if (!photo.image) continue;
      photos.push({
        // Prefixed by source: a species' id and one of its photos' ids are
        // independent sequences and would otherwise collide on the same key.
        key: `image-${photo.id}`,
        image: photo.image,
        title: name,
        // The photo's own caption when it has one - that is what distinguishes
        // a reference shot ("winter plumage") from the cover it sits beside.
        caption: localized(photo, 'name', locale) ?? localized(photo, 'description', locale),
        fit: photo.fit ?? 'cover',
        backgroundColor: photo.background_color,
        href,
      });
    }

    return photos;
  });
}

/** How many journal entries the whole category accounts for. */
function totalSightings(species: Species[]): number {
  return species.reduce((total, item) => total + item.sighting_count, 0);
}
