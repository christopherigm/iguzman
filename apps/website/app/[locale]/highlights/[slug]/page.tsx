import { notFound } from 'next/navigation';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { Container } from '@repo/ui/core-elements/container';
import { Typography } from '@repo/ui/core-elements/typography';
import { Box } from '@repo/ui/core-elements/box';
import { Breadcrumbs } from '@repo/ui/core-elements/breadcrumbs';
import type { BreadcrumbItem } from '@repo/ui/core-elements/breadcrumbs';
import { Hero } from '@repo/ui/hero';
import { getHighlight } from '@/lib/highlights';
import { ItemGalleryClient } from '@/components/item-gallery-client';
import type { GalleryImage } from '@/components/item-gallery-client';

type Props = {
  params: Promise<{ locale: string; slug: string }>;
};

export default async function HighlightDetailPage({ params }: Props) {
  const { locale, slug } = await params;
  setRequestLocale(locale);

  const [highlight, t] = await Promise.all([
    getHighlight(slug),
    getTranslations('HighlightDetail'),
  ]);

  if (!highlight) notFound();

  const name =
    (locale === 'en' ? highlight.en_name : highlight.name) ??
    highlight.name ??
    highlight.en_name ??
    slug;

  const shortDescription =
    (locale === 'en' ? highlight.en_short_description : highlight.short_description) ??
    highlight.short_description ??
    highlight.en_short_description ??
    null;

  const description =
    (locale === 'en' ? highlight.en_description : highlight.description) ??
    highlight.description ??
    highlight.en_description ??
    null;

  const formattedDate = new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(new Date(highlight.created));

  const galleryImages: GalleryImage[] = [
    ...(highlight.image ? [{ url: highlight.image, alt: name }] : []),
    ...highlight.items
      .filter((item) => Boolean(item.image))
      .map((item) => ({
        url: item.image!,
        alt:
          (locale === 'en' ? item.en_name : item.name) ??
          item.name ??
          item.en_name ??
          '',
      })),
  ];

  const breadcrumbs: BreadcrumbItem[] = [
    { label: t('home'), href: '/' },
    { label: t('highlights'), href: '/#highlights' },
    { label: name },
  ];

  const hasImage = Boolean(highlight.image);

  return (
    <>
      {hasImage && (
        <Hero
          backgroundImage={highlight.image}
          slogan={name}
          style={{ height: 'clamp(220px, 30vw, 500px)' }}
        />
      )}
      <Container size="md" paddingX={10} marginTop={hasImage ? 32 : 70}>
        <Breadcrumbs items={breadcrumbs} />
        <Typography as="h1" variant="h1" marginTop={24}>
          {name}
        </Typography>
        <Typography variant="body-sm" marginTop={8}>
          {formattedDate}
        </Typography>
        {shortDescription && (
          <Typography variant="body" marginTop={16}>
            {shortDescription}
          </Typography>
        )}
        {galleryImages.length > 0 && (
          <Box marginTop={32}>
            <ItemGalleryClient
              images={galleryImages}
              placeholderColor={highlight.background_color ?? undefined}
            />
          </Box>
        )}
        {description && (
          <Typography variant="body" marginTop={32}>
            {description}
          </Typography>
        )}
      </Container>
    </>
  );
}
