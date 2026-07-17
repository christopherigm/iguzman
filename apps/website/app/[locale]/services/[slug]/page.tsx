import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { Container } from "@repo/ui/core-elements/container";
import { Grid } from "@repo/ui/core-elements/grid";
import { getService } from "@/lib/catalog";
import { getSystem } from "@/lib/system";
import { getRequestOrigin, toShareDescription } from "@/lib/metadata";
import type { ServiceDetail, ServiceVariantFull } from "@/lib/catalog";
import type { GalleryImage } from "@/components/item-gallery-client";
import { ItemGalleryClient } from "@/components/item-gallery-client";
import { ItemHeroVideo } from "@/components/item-hero-video";
import { Breadcrumbs } from "@repo/ui/core-elements/breadcrumbs";
import type { BreadcrumbItem } from "@repo/ui/core-elements/breadcrumbs";
import {
  ServiceDetailPanel,
  ServiceDetailSections,
} from "@/components/service-detail";

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
  const [service, system, origin] = await Promise.all([
    getService(slug),
    getSystem(),
    getRequestOrigin(),
  ]);
  if (!service) return {};

  const name =
    (locale === "en" ? service.en_name : service.name) ??
    service.name ??
    service.en_name ??
    slug;

  // Share cards get the trimmed blurb; the <meta name="description"> keeps the
  // full body for search engines.
  const description =
    (locale === "en" ? service.en_description : service.description) ??
    service.description ??
    service.en_description ??
    undefined;
  const shareDescription = toShareDescription(description);

  const url = `${origin}/${locale}/services/${slug}`;
  const image = service.image ?? service.images.find((img) => img.image)?.image;

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
  service: ServiceDetail,
  selectedVariant: ServiceVariantFull | null,
): GalleryImage[] {
  const images: GalleryImage[] = [];
  const name = service.en_name ?? service.name ?? service.slug;
  const seen = new Set<string>();
  const push = (url: string | null, alt: string) => {
    if (url && !seen.has(url)) {
      seen.add(url);
      images.push({ url, alt });
    }
  };

  if (selectedVariant?.effective_image) {
    push(selectedVariant.effective_image, name);
    if (images.length > 0) return images;
  }

  // Prefer the service's gallery images.
  for (const img of service.images) {
    push(img.image, img.name ?? name);
  }
  // Only fall back to the main image when the gallery has none of its own -
  // otherwise the main image (usually also the first gallery image) shows twice.
  if (images.length === 0) {
    push(service.image, name);
  }

  return images;
}

export default async function ServicePage({ params, searchParams }: Props) {
  const { locale, slug } = await params;
  const { variant: variantIdStr } = await searchParams;
  setRequestLocale(locale);

  const [service, t, tNav] = await Promise.all([
    getService(slug),
    getTranslations("ItemDetail"),
    getTranslations("CategoryDetail"),
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
    (locale === "en" ? service.en_name : service.name) ??
    service.name ??
    service.en_name ??
    slug;

  const breadcrumbs: BreadcrumbItem[] = [
    { label: t("home"), href: "/" },
    { label: tNav("services"), href: "/categories/services" },
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

  // Clear the fixed navbar (top) and add page-bottom breathing room via the
  // shared @repo/ui CSS vars, instead of importing the heavy "use client"
  // navbar module (NavbarSpacer/PageBottomSpacer) into this server component.
  // With a hero video the navbar instead overlays it, exactly as it overlays
  // the landing page's Hero - so the spacing is dropped.
  return (
    <>
      {service.video_link && (
        <ItemHeroVideo url={service.video_link} title={displayName} />
      )}
      <Container
        paddingX={10}
        marginTop={16}
        paddingTop={
          service.video_link ? undefined : "var(--ui-navbar-height, 57px)"
        }
        paddingBottom="var(--ui-page-bottom-spacing, 64px)"
      >
        <Breadcrumbs items={breadcrumbs} />
        <Grid container spacing={2} marginBottom={18}>
          <Grid size={{ xs: 12, sm: 6, lg: 6 }}>
            <ItemGalleryClient
              images={galleryImages}
              placeholderColor={service.background_color ?? undefined}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6, lg: 6 }}>
            <ServiceDetailPanel
              service={service}
              selectedVariant={selectedVariant}
              locale={locale}
            />
          </Grid>
        </Grid>
        <ServiceDetailSections
          service={service}
          selectedVariant={selectedVariant}
          locale={locale}
        />
      </Container>
    </>
  );
}
