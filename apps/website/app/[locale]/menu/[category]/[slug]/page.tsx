import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import {
  MenuItemDetailPage,
  generateMenuItemMetadata,
} from "@/components/menu-item-detail-page";

/**
 * One menu item, at `/menu/<category>/<slug>`.
 *
 * The single detail route for the whole menu - it replaced five per-kind ones
 * (`/food/<slug>`, `/drink/<slug>`, …) when `MenuItem.kind` was removed and the
 * tenant's own category became the only sectioning a menu has. The category
 * segment is checked against the item's own, so an item is reachable at exactly
 * one URL; see `components/menu-item-detail-page.tsx`.
 */

type Props = {
  params: Promise<{ locale: string; category: string; slug: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, category, slug } = await params;
  return generateMenuItemMetadata({ locale, slug, routeCategory: category });
}

export default async function MenuItemPage({ params }: Props) {
  const { locale, category, slug } = await params;
  setRequestLocale(locale);

  return (
    <MenuItemDetailPage locale={locale} slug={slug} routeCategory={category} />
  );
}
