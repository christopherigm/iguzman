import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Container } from "@repo/ui/core-elements/container";
import { Grid } from "@repo/ui/core-elements/grid";
import { Breadcrumbs } from "@repo/ui/core-elements/breadcrumbs";
import type { BreadcrumbItem } from "@repo/ui/core-elements/breadcrumbs";
import { getMenuItem } from "@/lib/catalog";
import type { MenuItemDetail, MenuItemKind } from "@/lib/catalog";
import {
  MENU_ALL_PATH,
  MENU_KIND_PATHS,
  menuItemHref,
} from "@/lib/menu-kinds";
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
  MenuDetailQuestion,
} from "@/components/menu-detail";
import { enabledIngredients } from "@/lib/menu-selection";
import { MenuCustomizationProvider } from "@/components/menu-customization-context";

/**
 * One menu item's detail page - shared by all five kind routes (`/food/<slug>`,
 * `/drink/<slug>`, `/dessert/<slug>`, `/side/<slug>`, `/appetizer/<slug>`) so
 * they cannot drift apart. Each route is a thin wrapper that names its own kind.
 *
 * **Each route serves only its own kind; anything else is a 404.** A slug is
 * unique across the whole menu, so the lookup does not need the kind - which
 * means `routeKind` is a genuine check rather than part of the query. One item
 * therefore has exactly one URL, and `/drink/<a-dish>` is simply not a page.
 *
 * Every link in the app is built from the item's own kind (`menuItemHref`), so
 * nothing here should ever produce a mismatch; a 404 is how a stale hand-written
 * or bookmarked URL surfaces instead of quietly rendering the item under a URL
 * that misdescribes it.
 */

export async function generateMenuItemMetadata({
  locale,
  slug,
  routeKind,
}: {
  locale: string;
  slug: string;
  routeKind: MenuItemKind;
}): Promise<Metadata> {
  const [item, origin] = await Promise.all([getMenuItem(slug), getRequestOrigin()]);
  if (!item || item.kind !== routeKind) return {};

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

  // Built from the item's own kind rather than the route, which is the same
  // thing by the time we get here - the mismatch returned above.
  const url = `${origin}/${locale}${menuItemHref(item.kind, slug)}`;
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
  routeKind,
}: {
  locale: string;
  slug: string;
  routeKind: MenuItemKind;
}) {
  const [item, system, t, tMenu, tKind] = await Promise.all([
    getMenuItem(slug),
    getSystem(),
    getTranslations("ItemDetail"),
    getTranslations("Menu"),
    getTranslations("MenuKinds"),
  ]);

  // An item of another kind has its own route; this one is not its page.
  if (!item || item.kind !== routeKind) notFound();

  const galleryImages = buildGalleryImages(item);

  const displayName =
    (locale === "en" ? item.en_name : item.name) ??
    item.name ??
    item.en_name ??
    slug;

  // Menu > <Kind> > <Category> > this item. The kind step is what makes the
  // trail match the URL the visitor is on, and it is always present because
  // every item has a kind; the category step still is not, since an item may be
  // filed under none.
  const breadcrumbs: BreadcrumbItem[] = [
    { label: t("home"), href: "/" },
    { label: tMenu("menu"), href: MENU_ALL_PATH },
    { label: tKind(item.kind), href: MENU_KIND_PATHS[item.kind] },
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

        {/* Title, badges, category (spans the full grid width). */}
        <MenuDetailHeader item={item} locale={locale} />

        {/* One grid holds every detail card so they flow together - no
            per-section margin tricks. Each sub-component returns its own grid
            cell (or null), so absent cards leave no gap. The customiser and the
            nutrition label both read the shared customization context, so both
            sit inside the provider. */}
        <MenuCustomizationProvider ingredients={enabledIngredients(item.ingredients)}>
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
            <MenuDetailQuestion item={item} locale={locale} />
            <MenuDetailAllergens item={item} locale={locale} />
            <MenuDetailNutrition item={item} locale={locale} />
          </Grid>
        </MenuCustomizationProvider>
      </Container>
    </>
  );
}
