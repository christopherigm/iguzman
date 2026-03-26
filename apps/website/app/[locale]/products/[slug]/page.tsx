import { notFound } from 'next/navigation';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { Container } from '@repo/ui/core-elements/container';
import { Grid } from '@repo/ui/core-elements/grid';
import { getProduct } from '@/lib/catalog';
import type { ProductDetail, ProductVariantFull } from '@/lib/catalog';
import type { GalleryImage } from '@/components/item-gallery-client';
import { ItemGalleryClient } from '@/components/item-gallery-client';
import { Breadcrumbs } from '@repo/ui/core-elements/breadcrumbs';
import type { BreadcrumbItem } from '@repo/ui/core-elements/breadcrumbs';
import { NavbarSpacer } from '@repo/ui/core-elements/navbar';
import { ProductDetailPanel } from '@/components/product-detail';

type Props = {
  params: Promise<{ locale: string; slug: string }>;
  searchParams: Promise<{ variant?: string }>;
};

function buildGalleryImages(
  product: ProductDetail,
  selectedVariant: ProductVariantFull | null,
): GalleryImage[] {
  const images: GalleryImage[] = [];
  const name = product.en_name ?? product.name ?? product.slug;

  // If a variant is selected and has its own images, use those
  if (selectedVariant) {
    if (selectedVariant.effective_image) {
      images.push({ url: selectedVariant.effective_image, alt: name });
    }
    for (const img of selectedVariant.images) {
      if (img.image) {
        images.push({ url: img.image, alt: img.name ?? name });
      }
    }
    if (images.length > 0) return images;
  }

  // Fallback to product-level images
  if (product.image) {
    images.push({ url: product.image, alt: name });
  }
  for (const img of product.images) {
    if (img.image) {
      images.push({ url: img.image, alt: img.name ?? name });
    }
  }

  return images;
}

export default async function ProductPage({ params, searchParams }: Props) {
  const { locale, slug } = await params;
  const { variant: variantIdStr } = await searchParams;
  setRequestLocale(locale);

  const [product, t, tNav] = await Promise.all([
    getProduct(slug),
    getTranslations('ItemDetail'),
    getTranslations('CategoryDetail'),
  ]);

  if (!product) notFound();

  const variantId = variantIdStr ? parseInt(variantIdStr, 10) : null;
  const selectedVariant =
    product.variants.find((v) => v.id === variantId) ??
    product.variants.find((v) => v.is_default) ??
    product.variants[0] ??
    null;

  const galleryImages = buildGalleryImages(product, selectedVariant);

  const displayName =
    (locale === 'en' ? product.en_name : product.name) ??
    product.name ??
    product.en_name ??
    slug;

  const breadcrumbs: BreadcrumbItem[] = [
    { label: t('home'), href: '/' },
    { label: tNav('products'), href: '/categories/products' },
    ...(product.category_name && product.category_slug
      ? [
          {
            label: product.category_name,
            href: `/categories/products/${product.category_slug}`,
          },
        ]
      : []),
    { label: displayName },
  ];

  return (
    <>
      <NavbarSpacer />
      <Container paddingX={10}>
      <Breadcrumbs items={breadcrumbs} />
      <Grid container spacing={4} marginBottom="48px">
        <Grid size={{ xs: 12, sm: 6, lg: 5 }}>
          <ItemGalleryClient
            images={galleryImages}
            placeholderColor={product.background_color ?? undefined}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, lg: 7 }}>
          <ProductDetailPanel
            product={product}
            selectedVariant={selectedVariant}
            locale={locale}
          />
        </Grid>
      </Grid>
    </Container>
    </>
  );
}
