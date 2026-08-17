import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Container } from "@repo/ui/core-elements/container";
import { Grid } from "@repo/ui/core-elements/grid";
import { Breadcrumbs } from "@repo/ui/core-elements/breadcrumbs";
import type { BreadcrumbItem } from "@repo/ui/core-elements/breadcrumbs";
import { getMenuItem } from "@/lib/catalog";
import type { MenuItemDetail } from "@/lib/catalog";
import {
  MENU_ALL_PATH,
  menuCategoryHref,
  menuItemHref,
} from "@/lib/menu-paths";
import { getRequestOrigin, toShareDescription } from "@/lib/metadata";
import type { GalleryImage } from "@/components/item-gallery-client";
import { ItemGalleryClient } from "@/components/item-gallery-client";
import { ItemHeroVideo } from "@/components/item-hero-video";
import { getSystem } from "@/lib/system";
import {
  MenuDetailHeader,
  MenuDetailVariantsMobile,
  MenuDetailPanel,
  MenuDetailSections,
  MenuDetailAllergens,
  MenuDetailNutrition,
} from "@/components/menu-detail";
import { ItemQuestionCard } from "@/components/contact/item-question-card";
import { enabledIngredients } from "@/lib/menu-selection";
import { MenuCustomizationProvider } from "@/components/menu-customization-context";

/**
 * One menu item's detail page, at `/menu/<category>/<slug>`.
 *
 * **The route serves the item only under its own category; anything else is a
 * 404.** A slug is unique across the whole menu, so the lookup does not need
 * the category - which means `routeCategory` is a genuine check rather than
 * part of the query. One item therefore has exactly one URL, and
 * `/menu/bebidas/<a-dish>` is simply not a page.
 *
 * Every link in the app is built from the item's own category
 * (`menuItemHref`), so nothing here should ever produce a mismatch. ⚠ A 404 is
 * also how an item *re-filed* in the CMS surfaces on its old URL - the category
 * segment makes the address mutable, which is the cost of having it there.
 * `next.config.js` redirects the pre-category paths (`/food/<slug>` and its
 * four siblings) here.
 */

export async function generateMenuItemMetadata({
  locale,
  slug,
  routeCategory,
}: {
  locale: string;
  slug: string;
  routeCategory: string;
}): Promise<Metadata> {
  const [item, origin] = await Promise.all([getMenuItem(slug), getRequestOrigin()]);
  if (!item || item.category_slug !== routeCategory) return {};

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

  // Built from the item's own category rather than the route, which is the same
  // thing by the time we get here - the mismatch returned above.
  const url = `${origin}/${locale}${menuItemHref(item.category_slug, slug)}`;
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

export async function MenuItemDetailPage({
  locale,
  slug,
  routeCategory,
}: {
  locale: string;
  slug: string;
  routeCategory: string;
}) {
  const [item, system, t, tMenu] = await Promise.all([
    getMenuItem(slug),
    getSystem(),
    getTranslations("ItemDetail"),
    getTranslations("Menu"),
  ]);

  // An item filed under another category lives at another URL; this is not its
  // page.
  if (!item || item.category_slug !== routeCategory) notFound();

  const galleryImages = buildGalleryImages(item);

  const displayName =
    (locale === "en" ? item.en_name : item.name) ??
    item.name ??
    item.en_name ??
    slug;

  // Menu > <Category> > this item, which is exactly the URL the visitor is on.
  // The category step is always present now that the field is required.
  const breadcrumbs: BreadcrumbItem[] = [
    { label: t("home"), href: "/" },
    { label: tMenu("menu"), href: MENU_ALL_PATH },
    {
      label: item.category_name,
      href: menuCategoryHref(item.category_slug),
    },
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

        {/* Title, badges, category (spans the full grid width). */}
        <MenuDetailHeader item={item} locale={locale} />

        {/* One grid holds every detail card so they flow together - no
            per-section margin tricks. Each sub-component returns its own grid
            cell (or null), so absent cards leave no gap. The customiser and the
            nutrition label both read the shared customization context, so both
            sit inside the provider. */}
        <MenuCustomizationProvider
          ingredients={enabledIngredients(item.ingredients)}
          // Already the effective list (own rows else the category's, empty when
          // the dish is sold in one size) - resolved by the API, never here.
          sizes={item.sizes}
        >
          <Grid container spacing={2}>
            {/* xs: variants above the gallery. sm+: variants move into the
                customize column, so this cell hides and the gallery leads. */}
            <MenuDetailVariantsMobile item={item} locale={locale} />
            <Grid size={{ xs: 12, sm: 6 }}>
              <ItemGalleryClient
                images={galleryImages}
                placeholderColor={item.background_color ?? undefined}
              />
            </Grid>
            <MenuDetailPanel item={item} locale={locale} />
            <MenuDetailSections item={item} locale={locale} />
            <ItemQuestionCard kind="food" id={item.id} name={displayName} />
            <MenuDetailAllergens item={item} locale={locale} />
            <MenuDetailNutrition item={item} locale={locale} />
          </Grid>
        </MenuCustomizationProvider>
      </Container>
    </>
  );
}
