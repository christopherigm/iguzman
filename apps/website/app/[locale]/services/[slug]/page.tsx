import { notFound } from 'next/navigation';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { Container } from '@repo/ui/core-elements/container';
import { Grid } from '@repo/ui/core-elements/grid';
import { getService } from '@/lib/catalog';
import type { ServiceDetail, ServiceVariantFull } from '@/lib/catalog';
import type { GalleryImage } from '@/components/item-gallery-client';
import { ItemGalleryClient } from '@/components/item-gallery-client';
import { Breadcrumbs } from '@repo/ui/core-elements/breadcrumbs';
import type { BreadcrumbItem } from '@repo/ui/core-elements/breadcrumbs';
import { ServiceDetailPanel } from '@/components/service-detail';

type Props = {
  params: Promise<{ locale: string; slug: string }>;
  searchParams: Promise<{ variant?: string }>;
};

function buildGalleryImages(
  service: ServiceDetail,
  selectedVariant: ServiceVariantFull | null,
): GalleryImage[] {
  const images: GalleryImage[] = [];
  const name = service.en_name ?? service.name ?? service.slug;

  if (selectedVariant?.effective_image) {
    images.push({ url: selectedVariant.effective_image, alt: name });
    if (images.length > 0) return images;
  }

  // Fallback to service-level images
  if (service.image) {
    images.push({ url: service.image, alt: name });
  }
  for (const img of service.images) {
    if (img.image) {
      images.push({ url: img.image, alt: img.name ?? name });
    }
  }

  return images;
}

export default async function ServicePage({ params, searchParams }: Props) {
  const { locale, slug } = await params;
  const { variant: variantIdStr } = await searchParams;
  setRequestLocale(locale);

  const [service, t] = await Promise.all([
    getService(slug),
    getTranslations('ItemDetail'),
  ]);

  if (!service) notFound();

  const variantId = variantIdStr ? parseInt(variantIdStr, 10) : null;
  const selectedVariant =
    service.variants.find((v) => v.id === variantId) ??
    service.variants.find((v) => v.is_default) ??
    service.variants[0] ??
    null;

  const galleryImages = buildGalleryImages(service, selectedVariant);

  const displayName =
    (locale === 'en' ? service.en_name : service.name) ??
    service.name ??
    service.en_name ??
    slug;

  const breadcrumbs: BreadcrumbItem[] = [
    { label: t('home'), href: '/' },
    ...(service.category_name && service.category_slug
      ? [
          {
            label: service.category_name,
            href: `/categories/services/${service.category_slug}`,
          },
        ]
      : []),
    { label: displayName },
  ];

  return (
    <Container paddingX={10} marginTop={70}>
      <Breadcrumbs items={breadcrumbs} />
      <Grid container spacing={4} marginBottom="48px">
        <Grid size={{ xs: 12, sm: 6, lg: 5 }}>
          <ItemGalleryClient
            images={galleryImages}
            placeholderColor={service.background_color ?? undefined}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, lg: 7 }}>
          <ServiceDetailPanel
            service={service}
            selectedVariant={selectedVariant}
            locale={locale}
          />
        </Grid>
      </Grid>
    </Container>
  );
}
