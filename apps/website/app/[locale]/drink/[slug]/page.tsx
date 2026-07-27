import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import {
  MenuItemDetailPage,
  generateMenuItemMetadata,
} from "@/components/menu-item-detail-page";

/**
 * One drink item. Like every kind route it serves only its own kind - an item of
 * another kind has its own path and 404s here. See
 * `components/menu-item-detail-page.tsx`.
 */

type Props = {
  params: Promise<{ locale: string; slug: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params;
  return generateMenuItemMetadata({ locale, slug, routeKind: "drink" });
}

export default async function DrinkItemPage({ params }: Props) {
  const { locale, slug } = await params;
  setRequestLocale(locale);

  return <MenuItemDetailPage locale={locale} slug={slug} routeKind="drink" />;
}
