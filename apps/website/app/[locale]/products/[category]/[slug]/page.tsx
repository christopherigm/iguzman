import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { Container } from "@repo/ui/core-elements/container";
import { Grid } from "@repo/ui/core-elements/grid";
import { getProduct } from "@/lib/catalog";
import { getSystem } from "@/lib/system";
import { kindLabel, kindLabels } from "@/lib/kind-labels";
import { getRequestOrigin, toShareDescription } from "@/lib/metadata";
import {
  CATALOG_ROOT,
  categoryHref,
  itemHref,
} from "@/lib/catalog-paths";
import type { ProductDetail } from "@/lib/catalog";
import type { GalleryImage } from "@/components/item-gallery-client";
import { ItemGalleryClient } from "@/components/item-gallery-client";
import { aspectRatioValue } from "@/lib/aspect-ratio";
import { ItemHeroVideo } from "@/components/item-hero-video";
import { Breadcrumbs } from "@repo/ui/core-elements/breadcrumbs";
import type { BreadcrumbItem } from "@repo/ui/core-elements/breadcrumbs";
import {
  ProductDetailHeader,
  ProductDetailVariantsMobile,
  ProductDetailPanel,
  ProductDetailSections,
} from "@/components/product-detail";
import { ItemQuestionCard } from "@/components/contact/item-question-card";

/**
 * One product, at `/products/<category>/<slug>`.
 *
 * **The route serves the item only under its own category; anything else is a
 * 404.** A slug is unique across the family, so the lookup does not need the
 * category - which means `category` is a genuine check rather than part of the
 * query. One item therefore has exactly one URL.
 *
 * Every link in the app is built from the item's own category (`itemHref`), so
 * nothing here should ever produce a mismatch. ⚠ A 404 is also how an item
 * *re-filed* in the CMS surfaces on its old URL - the category segment makes
 * the address mutable, which is the cost of having it there. The one-segment
 * permalink beside this route (`/products/<slug>`) is the stable address that
 * survives a re-filing.
 */

type Props = {
  params: Promise<{ locale: string; category: string; slug: string }>;
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; category: string; slug: string }>;
}): Promise<Metadata> {
  const { locale, category, slug } = await params;
  const [product, system, origin] = await Promise.all([
    getProduct(slug),
    getSystem(),
    getRequestOrigin(),
  ]);
  // Not this item's URL - the page 404s, so it advertises no metadata.
  if (!product || product.category_slug !== category) return {};

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

  // Built from the item's own category rather than the route, which is the
  // same thing by the time we get here - the mismatch returned above.
  const url = `${origin}/${locale}${itemHref("product", product.category_slug, slug)}`;
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

function buildGalleryImages(product: ProductDetail): GalleryImage[] {
  const images: GalleryImage[] = [];
  const name = product.en_name ?? product.name ?? product.slug;
  const seen = new Set<string>();
  const push = (url: string | null, alt: string) => {
    if (url && !seen.has(url)) {
      seen.add(url);
      images.push({ url, alt });
    }
  };

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

export default async function ProductPage({ params }: Props) {
  const { locale, category, slug } = await params;
  setRequestLocale(locale);

  const [product, system, t, tNav] = await Promise.all([
    getProduct(slug),
    getSystem(),
    getTranslations("ItemDetail"),
    getTranslations("CategoryDetail"),
  ]);

  // An item filed under another category lives at another URL; this is not
  // its page.
  if (!product || product.category_slug !== category) notFound();

  const galleryImages = buildGalleryImages(product);

  const displayName =
    (locale === "en" ? product.en_name : product.name) ??
    product.name ??
    product.en_name ??
    slug;

  const breadcrumbs: BreadcrumbItem[] = [
    { label: t("home"), href: "/" },
    // The tenant's own name for the family; the href never moves.
    {
      label: kindLabel(kindLabels(system, locale), "product", tNav("products")),
      href: CATALOG_ROOT.product,
    },
    // Always present: the category is required on every buyable now, and it
    // is the segment the visitor arrived through.
    {
      label: product.category_name,
      href: categoryHref("product", product.category_slug),
    },
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
        <ItemHeroVideo
          url={product.video_link}
          title={displayName}
          parallax={false}
          layout={system?.hero_video_layout ?? "default"}
          logo={system?.img_logo_hero}
          logoAlt={system?.site_name ?? ""}
          logoScale={(system?.hero_logo_scale ?? 100) / 100}
          backgroundScale={(system?.hero_logo_background_scale ?? 100) / 100}
          overlayStyle={system?.hero_overlay_style ?? "bottom"}
          overlayOpacity={(system?.hero_overlay_opacity ?? 75) / 100}
          overlayExtent={system?.hero_overlay_extent ?? 50}
          shape={system?.hero_logo_background ?? "none"}
          frame={system?.hero_text_frame ?? false}
          brandmark={system?.img_brandmark}
          brandmarkAlt={system?.site_name ?? ""}
        />
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
        <ProductDetailHeader product={product} locale={locale} />
        {/* One grid holds every detail card so they flow together - no
            per-section margin tricks. Each sub-component returns its own grid
            cell (or null), so absent cards leave no gap. */}
        <Grid container spacing={2}>
          {/* xs: variants above the gallery. sm+: variants move into the buy-box
              column, so this cell hides and the gallery leads. */}
          <ProductDetailVariantsMobile product={product} locale={locale} />
          <Grid size={{ xs: 12, sm: 6 }}>
            <ItemGalleryClient
              images={galleryImages}
              placeholderColor={product.background_color ?? undefined}
              aspectRatio={aspectRatioValue(product.aspect_ratio)}
            />
          </Grid>
          <ProductDetailPanel product={product} locale={locale} />
          <ProductDetailSections product={product} locale={locale} />
          <ItemQuestionCard
            kind="product"
            id={product.id}
            name={displayName}
          />
        </Grid>
      </Container>
    </>
  );
}
