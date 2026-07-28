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
import { getSpecies, type Species } from '@/lib/catalog';
import { getSightingsBySpecies } from '@/lib/journal';
import { localized } from '@/lib/i18n-field';
import { DetailHero, type DetailHeroChip } from '@/components/catalog/detail-hero';
import { FactsCard } from '@/components/catalog/facts-card';
import { PhotoGallery, type GalleryPhoto } from '@/components/catalog/photo-gallery';
import { SightingsSection } from '@/components/journal/sightings-section';
import { SpeciesVideo } from './species-video';

/**
 * One species' page: what it is, its taxonomy, its reference photographs, and
 * every journal entry that records it. The destination of every species card in
 * a category's grid and of the landing gallery's captions.
 *
 * Unlike a category, a species owns a real gallery - `SpeciesImage` rows, the
 * identification shots that belong to the species rather than to one encounter -
 * so this page's `PhotoGallery` renders stored photos rather than an aggregate.
 */

type Props = { params: Promise<{ locale: string; slug: string }> };

/** How many journal entries the page's sightings band carries. */
const SIGHTINGS_LIMIT = 8;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params;
  const species = await getSpecies(slug);
  if (!species) return {};

  const name = localized(species, 'name', locale) ?? species.slug;
  const description =
    localized(species, 'short_description', locale) ?? species.scientific_name;

  return {
    title: name,
    ...(description ? { description } : {}),
    openGraph: {
      title: name,
      ...(description ? { description } : {}),
      ...(species.image ? { images: [{ url: species.image }] } : {}),
    },
  };
}

export default async function SpeciesPage({ params }: Props) {
  const { locale, slug } = await params;
  setRequestLocale(locale);

  const t = await getTranslations('SpeciesPage');
  const tCategory = await getTranslations('CategoryPage');
  const tGallery = await getTranslations('Gallery');
  const format = await getFormatter({ locale });

  const [species, sightings] = await Promise.all([
    getSpecies(slug),
    getSightingsBySpecies(slug, SIGHTINGS_LIMIT),
  ]);

  // Null only on a real 404 - see the note in `lib/catalog.ts` → `fetchOne`.
  if (!species) notFound();

  const name = localized(species, 'name', locale) ?? species.slug;
  const shortDescription = localized(species, 'short_description', locale);
  const description = localized(species, 'description', locale);
  const categoryName = localized(
    { name: species.category_name, en_name: species.category_en_name },
    'name',
    locale,
  );

  const photos = toGalleryPhotos(species, locale);
  const lastSeen = species.last_seen ? formatDay(species.last_seen, format) : null;

  const chips: DetailHeroChip[] = [];
  if (species.sighting_count > 0) {
    chips.push({
      key: 'sightings',
      label: `${format.number(species.sighting_count)} ${tCategory('sightingsCount')}`,
    });
  }
  if (lastSeen) {
    chips.push({ key: 'last-seen', label: `${tCategory('lastSeen')}: ${lastSeen}` });
  }

  const breadcrumbs = [
    { label: tCategory('breadcrumbHome'), href: `/${locale}` },
    ...(categoryName && species.category_slug
      ? [{ label: categoryName, href: `/${locale}/categories/${species.category_slug}` }]
      : []),
    { label: name },
  ];

  return (
    <Box flexDirection="column" width="100%">
      <DetailHero
        image={species.image}
        icon={species.icon}
        fit={species.fit ?? 'cover'}
        backgroundColor={species.background_color}
        eyebrow={categoryName}
        eyebrowHref={
          species.category_slug ? `/${locale}/categories/${species.category_slug}` : null
        }
        title={name}
        scientificName={species.scientific_name}
        chips={chips}
      />

      <Container size="lg" paddingX={10} marginTop={16}>
        <Breadcrumbs items={breadcrumbs} />

        {/* Asymmetric split at `sm`, not `md` - see apps/CLAUDE.md. */}
        <Grid container spacing={4}>
          <Grid size={{ xs: 12, sm: 7 }}>
            <Box flexDirection="column" gap={16}>
              {shortDescription && (
                <Typography variant="body" fontWeight={600}>
                  {shortDescription}
                </Typography>
              )}

              {description ? (
                <RichText>{description}</RichText>
              ) : (
                !shortDescription && (
                  <Typography variant="body" color="var(--foreground-muted, #6b7280)">
                    {tCategory('noDescription')}
                  </Typography>
                )
              )}
            </Box>
          </Grid>

          <Grid size={{ xs: 12, sm: 5 }}>
            <FactsCard
              facts={[
                species.scientific_name
                  ? { label: tCategory('factScientificName'), value: species.scientific_name }
                  : null,
                species.family ? { label: t('factFamily'), value: species.family } : null,
                categoryName
                  ? {
                      label: tCategory('factCategory'),
                      value: categoryName,
                      href: species.category_slug
                        ? `/${locale}/categories/${species.category_slug}`
                        : null,
                    }
                  : null,
                {
                  label: tCategory('factSightings'),
                  value: format.number(species.sighting_count),
                },
                lastSeen ? { label: tCategory('lastSeen'), value: lastSeen } : null,
              ]}
              href={species.href}
              hrefLabel={tCategory('externalReference')}
            />
          </Grid>
        </Grid>

        {species.video_link && (
          <Box flexDirection="column" gap={16} marginTop={56}>
            <Typography as="h2" variant="h2" fontWeight={700}>
              {t('videoTitle')}
            </Typography>
            <SpeciesVideo url={species.video_link} title={name} />
          </Box>
        )}

        {photos.length > 0 && (
          <Box flexDirection="column" gap={24} marginTop={56}>
            <Box flexDirection="column" gap={8}>
              <Typography as="h2" variant="h2" fontWeight={700}>
                {t('galleryTitle')}
              </Typography>
              <Typography variant="body" color="var(--foreground-muted, #6b7280)">
                {t('gallerySubtitle', { species: name })}
              </Typography>
            </Box>

            <PhotoGallery
              photos={photos}
              labels={{ previous: tGallery('previous'), next: tGallery('next') }}
            />
          </Box>
        )}

        {sightings.length > 0 && (
          <Box marginTop={56}>
            <SightingsSection
              sightings={sightings}
              locale={locale}
              title={t('sightingsTitle')}
              subtitle={t('sightingsSubtitle', { species: name })}
            />
          </Box>
        )}
      </Container>

      <PageBottomSpacer />
    </Box>
  );
}

/**
 * The species' reference photos, in their authored order.
 *
 * The cover shot is deliberately **not** included: it is already the page's hero
 * directly above, and repeating it as the strip's first tile reads as a
 * duplicate rather than as an extra view. Since the CMS uploads every photo into
 * this gallery and the API publishes the first of them as `image`, the cover is
 * normally one of these rows - so it is matched by URL and dropped, exactly as
 * the sighting page drops its own cover. A cover set separately (in the Django
 * admin) matches nothing here and the whole strip is kept.
 *
 * No `href` either - every tile here belongs to the page the reader is already on.
 */
function toGalleryPhotos(species: Species, locale: string): GalleryPhoto[] {
  return species.images.flatMap((photo) => {
    if (!photo.image) return [];
    if (photo.image === species.image) return [];
    return [
      {
        key: `image-${photo.id}`,
        image: photo.image,
        title: localized(photo, 'name', locale),
        caption: localized(photo, 'description', locale),
        fit: photo.fit ?? 'cover',
        backgroundColor: photo.background_color,
        href: null,
      },
    ];
  });
}

type Formatter = Awaited<ReturnType<typeof getFormatter>>;

/** Anchored at local noon - see the matching note in `components/catalog/species-grid.tsx`. */
function formatDay(day: string, format: Formatter): string {
  const parsed = new Date(`${day}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return day;
  return format.dateTime(parsed, { year: 'numeric', month: 'long', day: 'numeric' });
}
