import { notFound } from 'next/navigation';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { Container } from '@repo/ui/core-elements/container';
import { Typography } from '@repo/ui/core-elements/typography';
import { Box } from '@repo/ui/core-elements/box';
import { Breadcrumbs } from '@repo/ui/core-elements/breadcrumbs';
import type { BreadcrumbItem } from '@repo/ui/core-elements/breadcrumbs';
import { Hero } from '@repo/ui/hero';
import { getSuccessStory } from '@/lib/success-stories';
import { ItemGalleryClient } from '@/components/item-gallery-client';
import type { GalleryImage } from '@/components/item-gallery-client';

type Props = {
  params: Promise<{ locale: string; slug: string }>;
};

export default async function SuccessStoryDetailPage({ params }: Props) {
  const { locale, slug } = await params;
  setRequestLocale(locale);

  const [story, t] = await Promise.all([
    getSuccessStory(slug),
    getTranslations('SuccessStoryDetail'),
  ]);

  if (!story) notFound();

  const name =
    (locale === 'en' ? story.en_name : story.name) ??
    story.name ??
    story.en_name ??
    slug;

  const shortDescription =
    (locale === 'en' ? story.en_short_description : story.short_description) ??
    story.short_description ??
    story.en_short_description ??
    null;

  const description =
    (locale === 'en' ? story.en_description : story.description) ??
    story.description ??
    story.en_description ??
    null;

  const formattedDate = new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(new Date(story.created));

  const galleryImages: GalleryImage[] = [
    ...(story.image ? [{ url: story.image, alt: name }] : []),
    ...story.gallery
      .filter((img) => Boolean(img.image))
      .map((img) => ({
        url: img.image!,
        alt:
          (locale === 'en' ? img.en_name : img.name) ??
          img.name ??
          img.en_name ??
          '',
      })),
  ];

  const breadcrumbs: BreadcrumbItem[] = [
    { label: t('home'), href: '/' },
    { label: t('successStories'), href: '/#stories' },
    { label: name },
  ];

  const hasImage = Boolean(story.image);

  return (
    <>
      {hasImage && (
        <Hero
          backgroundImage={story.image}
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
              placeholderColor={story.background_color ?? undefined}
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
