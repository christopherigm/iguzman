import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server';
import { Box } from '@repo/ui/core-elements/box';
import { Grid } from '@repo/ui/core-elements/grid';
import { Card } from '@repo/ui/core-elements/card';
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
import { DetailGallery, type GalleryImage } from '@/components/catalog/detail-gallery';
import { SightingsSection } from '@/components/journal/sightings-section';
import { SpeciesVideo } from './species-video';

/**
 * One species' page: what it is, its taxonomy, its reference photographs, and
 * every journal entry that records it. The destination of every species card in
 * a category's grid and of the landing gallery's captions.
 *
 * The first row is the page proper: the description and the taxonomy as two
 * stacked cards, with the photographs beside them as a slideshow. That is the
 * shape `apps/website`'s menu-item detail page uses, and `DetailGallery` is a
 * port of its gallery - down to the frame sizing, which reads the most-portrait
 * photo in the set to pick one 4:5 or 5:4 box for every slide. The category and
 * sighting pages open with the same row, off the same component.
 *
 * Unlike a category, a species owns a real gallery (`SpeciesImage` rows - the
 * identification shots that belong to the species rather than to one encounter),
 * so that slideshow shows stored photos rather than an aggregate of its
 * children's. It leads with the cover: the slideshow is a numbered strip with its
 * own thumbnails, so the hero's photo reads as slide 1 rather than as a
 * duplicate - which is why this page no longer drops it the way the category and
 * sighting strips do.
 */

type Props = { params: Promise<{ locale: string; slug: string }> };

/** How many journal entries the page's sightings band carries. */
const SIGHTINGS_LIMIT = 8;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params;
  const species = await getSpecies(slug);
  if (!species) return {};

  const name = localized(species, 'name', locale) ?? species.slug;
  const description = localized(species, 'short_description', locale) ?? species.scientific_name;

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

  const photos = toGalleryImages(species, locale);
  const lastSeen = species.last_seen ? formatDay(species.last_seen, format) : null;

  const chips: DetailHeroChip[] = [];
  if (species.sighting_count > 0) {
    chips.push({
      key: 'sightings',
      label: `${format.number(species.sighting_count)} ${tCategory('sightingsCount')}`,
    });
  }
  if (lastSeen) {
    chips.push({
      key: 'last-seen',
      label: `${tCategory('lastSeen')}: ${lastSeen}`,
    });
  }

  const breadcrumbs = [
    { label: tCategory('breadcrumbHome'), href: `/${locale}` },
    ...(categoryName && species.category_slug
      ? [
          {
            label: categoryName,
            href: `/${locale}/categories/${species.category_slug}`,
          },
        ]
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

        {/* Media/text split at `sm`, not `md` - see apps/CLAUDE.md. The writing
            and the taxonomy stack in one column, the photographs sit beside
            them - and lead them once the two stack, which is what `reorder`
            says: below `sm` the text column flows last, so a reader meets the
            animal before its description. */}
        <Grid container spacing={2}>
          <Grid size={{ xs: 12, sm: 6 }} reorder={{ xs: 'last' }}>
            <Box flexDirection="column" gap={16}>
              <Card gap={12} padding={18}>
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
              </Card>

              <FactsCard
                facts={[
                  species.scientific_name
                    ? {
                        label: tCategory('factScientificName'),
                        value: species.scientific_name,
                      }
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
            </Box>
          </Grid>

          <Grid size={{ xs: 12, sm: 6 }}>
            <DetailGallery images={photos} placeholderColor={species.background_color} />
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
 * The species' photographs for the slideshow: the cover first, then its
 * reference photos in their authored order.
 *
 * The cover **is** included here, unlike the category and sighting strips. Those
 * are contact sheets under a hero that already shows the cover, so repeating it
 * as the first tile reads as a duplicate; this is a numbered slideshow with its
 * own thumbnails, where the cover is simply slide 1. The CMS uploads every photo
 * into the gallery and the API publishes the first row as `image`, so the cover
 * is normally one of those rows too - hence the URL set, which keeps it from
 * appearing twice. A cover set separately (in the Django admin) matches nothing
 * and leads the strip on its own.
 *
 * Each photo carries its own `fit` and `background_color`: a plate authored as
 * `contain` (an illustration, a range map) must be letterboxed, not cropped.
 */
function toGalleryImages(species: Species, locale: string): GalleryImage[] {
  const name = localized(species, 'name', locale) ?? species.slug;
  const images: GalleryImage[] = [];
  const seen = new Set<string>();

  const push = (
    url: string | null,
    alt: string,
    fit: Species['fit'],
    backgroundColor: string | null,
  ) => {
    if (!url || seen.has(url)) return;
    seen.add(url);
    images.push({ url, alt, fit: fit ?? 'cover', backgroundColor });
  };

  push(species.image, name, species.fit, species.background_color);
  for (const photo of species.images) {
    push(photo.image, localized(photo, 'name', locale) ?? name, photo.fit, photo.background_color);
  }

  return images;
}

type Formatter = Awaited<ReturnType<typeof getFormatter>>;

/** Anchored at local noon - see the matching note in `components/catalog/species-grid.tsx`. */
function formatDay(day: string, format: Formatter): string {
  const parsed = new Date(`${day}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return day;
  return format.dateTime(parsed, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}
