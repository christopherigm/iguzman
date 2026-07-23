import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { Container } from "@repo/ui/core-elements/container";
import { Grid } from "@repo/ui/core-elements/grid";
import { getService } from "@/lib/catalog";
import { getSystem } from "@/lib/system";
import { getRequestOrigin, toShareDescription } from "@/lib/metadata";
import type { ServiceDetail } from "@/lib/catalog";
import type { GalleryImage } from "@/components/item-gallery-client";
import { ItemGalleryClient } from "@/components/item-gallery-client";
import { ItemHeroVideo } from "@/components/item-hero-video";
import { Breadcrumbs } from "@repo/ui/core-elements/breadcrumbs";
import type { BreadcrumbItem } from "@repo/ui/core-elements/breadcrumbs";
import {
  ServiceDetailHeader,
  ServiceDetailVariantsMobile,
  ServiceDetailPanel,
  ServiceDetailSections,
} from "@/components/service-detail";

type Props = {
  params: Promise<{ locale: string; slug: string }>;
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

function buildGalleryImages(service: ServiceDetail): GalleryImage[] {
  const images: GalleryImage[] = [];
  const name = service.en_name ?? service.name ?? service.slug;
  const seen = new Set<string>();
  const push = (url: string | null, alt: string) => {
    if (url && !seen.has(url)) {
      seen.add(url);
      images.push({ url, alt });
    }
  };

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

export default async function ServicePage({ params }: Props) {
  const { locale, slug } = await params;
  setRequestLocale(locale);

  const [service, system, t, tNav] = await Promise.all([
    getService(slug),
    getSystem(),
    getTranslations("ItemDetail"),
    getTranslations("CategoryDetail"),
  ]);

  if (!service) notFound();

  const galleryImages = buildGalleryImages(service);

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
        <ItemHeroVideo
          url={service.video_link}
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
          service.video_link ? undefined : "var(--ui-navbar-height, 57px)"
        }
        paddingBottom="var(--ui-page-bottom-spacing, 64px)"
      >
        <Breadcrumbs items={breadcrumbs} />
        <ServiceDetailHeader service={service} locale={locale} />
        {/* One grid holds every detail card so they flow together - no
            per-section margin tricks. Each sub-component returns its own grid
            cell (or null), so absent cards leave no gap. */}
        <Grid container spacing={2}>
          {/* xs: variants above the gallery. sm+: variants move into the buy-box
              column, so this cell hides and the gallery leads. */}
          <ServiceDetailVariantsMobile service={service} locale={locale} />
          <Grid size={{ xs: 12, sm: 6 }}>
            <ItemGalleryClient
              images={galleryImages}
              placeholderColor={service.background_color ?? undefined}
            />
          </Grid>
          <ServiceDetailPanel service={service} locale={locale} />
          <ServiceDetailSections service={service} locale={locale} />
        </Grid>
      </Container>
    </>
  );
}
