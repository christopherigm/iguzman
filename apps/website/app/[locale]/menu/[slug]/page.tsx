import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { Container } from "@repo/ui/core-elements/container";
import { Grid } from "@repo/ui/core-elements/grid";
import { getMenuItem } from "@/lib/catalog";
import { getRequestOrigin, toShareDescription } from "@/lib/metadata";
import type { GalleryImage } from "@/components/item-gallery-client";
import { ItemGalleryClient } from "@/components/item-gallery-client";
import { ItemHeroVideo } from "@/components/item-hero-video";
import { Breadcrumbs } from "@repo/ui/core-elements/breadcrumbs";
import type { BreadcrumbItem } from "@repo/ui/core-elements/breadcrumbs";
import { MenuDetailPanel, MenuDetailSections } from "@/components/menu-detail";
import type { MenuItemDetail } from "@/lib/catalog";

type Props = {
  params: Promise<{ locale: string; slug: string }>;
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const { locale, slug } = await params;
  const [item, origin] = await Promise.all([
    getMenuItem(slug),
    getRequestOrigin(),
  ]);
  if (!item) return {};

  const name =
    (locale === "en" ? item.en_name : item.name) ??
    item.name ??
    item.en_name ??
    slug;

  const description =
    (locale === "en" ? item.en_description : item.description) ??
    item.description ??
    item.en_description ??
    undefined;

  const url = `${origin}/${locale}/menu/${slug}`;
  const image = item.image ?? item.images.find((img) => img.image)?.image;

  return {
    metadataBase: new URL(origin),
    title: name,
    description,
    alternates: { canonical: url },
    openGraph: {
      title: name ?? undefined,
      description: toShareDescription(description),
      url,
      images: image ? [image] : undefined,
    },
  };
}

function buildGalleryImages(item: MenuItemDetail): GalleryImage[] {
  const images: GalleryImage[] = [];
  const name = item.en_name ?? item.name ?? item.slug;
  const seen = new Set<string>();
  const push = (url: string | null, alt: string) => {
    if (url && !seen.has(url)) {
      seen.add(url);
      images.push({ url, alt });
    }
  };
  for (const img of item.images) push(img.image, img.name ?? name);
  if (images.length === 0) push(item.image, name);
  return images;
}

export default async function MenuItemPage({ params }: Props) {
  const { locale, slug } = await params;
  setRequestLocale(locale);

  const [item, t, tMenu] = await Promise.all([
    getMenuItem(slug),
    getTranslations("ItemDetail"),
    getTranslations("Menu"),
  ]);

  if (!item) notFound();

  const galleryImages = buildGalleryImages(item);

  const displayName =
    (locale === "en" ? item.en_name : item.name) ??
    item.name ??
    item.en_name ??
    slug;

  const breadcrumbs: BreadcrumbItem[] = [
    { label: t("home"), href: "/" },
    { label: tMenu("menu"), href: "/menu" },
    ...(item.category_name && item.category_slug
      ? [
          {
            label: item.category_name,
            href: `/menu?category=${item.category_slug}`,
          },
        ]
      : []),
    { label: displayName },
  ];

  return (
    <>
      {item.video_link && (
        <ItemHeroVideo
          url={item.video_link}
          title={displayName}
          parallax={false}
        />
      )}
      <Container
        paddingX={10}
        marginTop={16}
        paddingTop={
          item.video_link ? undefined : "var(--ui-navbar-height, 57px)"
        }
        paddingBottom="var(--ui-page-bottom-spacing, 64px)"
      >
        <Breadcrumbs items={breadcrumbs} />
        <Grid container spacing={2} marginBottom={18}>
          <Grid size={{ xs: 12, sm: 6, lg: 6 }}>
            <ItemGalleryClient
              images={galleryImages}
              placeholderColor={item.background_color ?? undefined}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6, lg: 6 }}>
            <MenuDetailPanel item={item} locale={locale} />
          </Grid>
        </Grid>
        <MenuDetailSections item={item} locale={locale} />
      </Container>
    </>
  );
}
