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
import { getSystem } from "@/lib/system";
import { Breadcrumbs } from "@repo/ui/core-elements/breadcrumbs";
import type { BreadcrumbItem } from "@repo/ui/core-elements/breadcrumbs";
import {
  MenuDetailHeader,
  MenuDetailPanel,
  MenuDetailSections,
  MenuDetailAllergens,
  MenuDetailNutrition,
  MenuDetailQuestion,
  menuItemShowsNutrition,
  enabledIngredients,
} from "@/components/menu-detail";
import { MenuCustomizationProvider } from "@/components/menu-customization-context";
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

  const url = `${origin}/${locale}/food/${slug}`;
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

  const [item, system, t, tMenu] = await Promise.all([
    getMenuItem(slug),
    getSystem(),
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
    { label: tMenu("menu"), href: "/categories/food" },
    ...(item.category_name && item.category_slug
      ? [
          {
            label: item.category_name,
            href: `/categories/food/${item.category_slug}`,
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
          item.video_link ? undefined : "var(--ui-navbar-height, 57px)"
        }
        paddingBottom="var(--ui-page-bottom-spacing, 64px)"
      >
        <Breadcrumbs items={breadcrumbs} />

        {/* Row 1: title, badges, category (spans both columns). */}
        <MenuDetailHeader item={item} locale={locale} />

        {/* The customiser (row 2) and the nutrition label (row 4) share the
            selected-quantity state so the label mirrors the customiser live. */}
        <MenuCustomizationProvider ingredients={enabledIngredients(item)}>
          {/* Row 2: gallery + customize/buy/allergens, side by side on desktop. */}
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

          {/* Row 3: "About this item" long-form description. */}
          <MenuDetailSections item={item} locale={locale} />

          {/* Row 4: allergens - full width below the description. */}
          {item.allergens && (
            <Grid container spacing={2} marginTop={18}>
              <Grid size={{ xs: 12 }}>
                <MenuDetailAllergens item={item} locale={locale} />
              </Grid>
            </Grid>
          )}

          {/* Row 5: nutrition label - a narrow column on desktop, full-width on
              mobile. Only rendered when the item opts in and has chartable data. */}
          {menuItemShowsNutrition(item) && (
            <Grid container spacing={2} marginTop={18}>
              <Grid size={{ xs: 12, md: 4, lg: 3 }}>
                <MenuDetailNutrition item={item} locale={locale} />
              </Grid>
            </Grid>
          )}

          {/* Row 6: "ask a question about this item" contact form. */}
          <Grid container spacing={2} marginTop={18}>
            <Grid size={{ xs: 12 }}>
              <MenuDetailQuestion item={item} locale={locale} />
            </Grid>
          </Grid>
        </MenuCustomizationProvider>
      </Container>
    </>
  );
}
