import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { Container } from "@repo/ui/core-elements/container";
import { Grid } from "@repo/ui/core-elements/grid";
import { getProduct } from "@/lib/catalog";
import { getSystem } from "@/lib/system";
import { getRequestOrigin, toShareDescription } from "@/lib/metadata";
import type { ProductDetail, ProductVariantFull } from "@/lib/catalog";
import type { GalleryImage } from "@/components/item-gallery-client";
import { ItemGalleryClient } from "@/components/item-gallery-client";
import { ItemHeroVideo } from "@/components/item-hero-video";
import { Breadcrumbs } from "@repo/ui/core-elements/breadcrumbs";
import type { BreadcrumbItem } from "@repo/ui/core-elements/breadcrumbs";
import {
  ProductDetailPanel,
  ProductDetailSections,
} from "@/components/product-detail";

type Props = {
  params: Promise<{ locale: string; slug: string }>;
  searchParams: Promise<{ variant?: string }>;
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const { locale, slug } = await params;
  const [product, system, origin] = await Promise.all([
    getProduct(slug),
    getSystem(),
    getRequestOrigin(),
  ]);
  if (!product) return {};

  const name =
    (locale === "en" ? product.en_name : product.name) ??
    product.name ??
    product.en_name ??
    slug;

  // Share cards get the trimmed blurb; the <meta name="description"> keeps the
  // full body for search engines.
  const description =
    (locale === "en" ? product.en_description : product.description) ??
    product.description ??
    product.en_description ??
    undefined;
  const shareDescription = toShareDescription(description);

  const url = `${origin}/${locale}/products/${slug}`;
  const image = product.image ?? product.images.find((img) => img.image)?.image;

  return {
    metadataBase: new URL(origin),
    title: name,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: "website",
      url,
      siteName: system?.site_name ?? undefined,
      title: name,
      description: shareDescription,
      images: image ? [{ url: image, alt: name }] : undefined,
    },
    twitter: {
      card: image ? "summary_large_image" : "summary",
      title: name,
      description: shareDescription,
      images: image ? [image] : undefined,
    },
  };
}

function buildGalleryImages(
  product: ProductDetail,
  selectedVariant: ProductVariantFull | null,
): GalleryImage[] {
  const images: GalleryImage[] = [];
  const name = product.en_name ?? product.name ?? product.slug;
  const seen = new Set<string>();
  const push = (url: string | null, alt: string) => {
    if (url && !seen.has(url)) {
      seen.add(url);
      images.push({ url, alt });
    }
  };

  // If a variant is selected and has its own images, use those
  if (selectedVariant) {
    push(selectedVariant.effective_image, name);
    for (const img of selectedVariant.images) {
      push(img.image, img.name ?? name);
    }
    if (images.length > 0) return images;
  }

  // Prefer the product's gallery images.
  for (const img of product.images) {
    push(img.image, img.name ?? name);
  }
  // Only fall back to the main image when the gallery has none of its own -
  // otherwise the main image (usually also the first gallery image) shows twice.
  if (images.length === 0) {
    push(product.image, name);
  }

  return images;
}

export default async function ProductPage({ params, searchParams }: Props) {
  const { locale, slug } = await params;
  const { variant: variantIdStr } = await searchParams;
  setRequestLocale(locale);

  const [product, t, tNav] = await Promise.all([
    getProduct(slug),
    getTranslations("ItemDetail"),
    getTranslations("CategoryDetail"),
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
    (locale === "en" ? product.en_name : product.name) ??
    product.name ??
    product.en_name ??
    slug;

  const breadcrumbs: BreadcrumbItem[] = [
    { label: t("home"), href: "/" },
    { label: tNav("products"), href: "/categories/products" },
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

  // Clear the fixed navbar (top) and add page-bottom breathing room via the
  // shared @repo/ui CSS vars, instead of importing the heavy "use client"
  // navbar module (NavbarSpacer/PageBottomSpacer) into this server component.
  // With a hero video the navbar instead overlays it, exactly as it overlays
  // the landing page's Hero - so the spacing is dropped.
  return (
    <>
      {product.video_link && (
        <ItemHeroVideo url={product.video_link} title={displayName} />
      )}
      <Container
        paddingX={10}
        marginTop={16}
        paddingTop={
          product.video_link ? undefined : "var(--ui-navbar-height, 57px)"
        }
        paddingBottom="var(--ui-page-bottom-spacing, 64px)"
      >
        <Breadcrumbs items={breadcrumbs} />
        <Grid container spacing={2} marginBottom={18}>
          <Grid size={{ xs: 12, sm: 6, lg: 6 }}>
            <ItemGalleryClient
              images={galleryImages}
              placeholderColor={product.background_color ?? undefined}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6, lg: 6 }}>
            <ProductDetailPanel
              product={product}
              selectedVariant={selectedVariant}
              locale={locale}
            />
          </Grid>
        </Grid>
        <ProductDetailSections
          product={product}
          selectedVariant={selectedVariant}
          locale={locale}
        />
      </Container>
    </>
  );
}
