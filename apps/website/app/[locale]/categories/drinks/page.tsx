import type { Metadata } from "next";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { MenuListing } from "@/components/menu-listing";
import { kindLabel } from "@/lib/kind-labels";
import { getKindLabels } from "@/lib/system";

/**
 * Menu items whose `kind` is `drink`, across every category. One of the five
 * per-kind listings; `/categories/menu` is the whole menu.
 */

type Props = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = (await getTranslations({ locale, namespace: "MenuKinds" })) as (
    key: string,
  ) => string;
  // The tenant's own name for this kind titles the tab too - a page
  // headed "Pizzas" that a bookmark calls "Food" reads as two pages.
  const labels = await getKindLabels(locale);
  return { title: kindLabel(labels, "drink", t("drink")) };
}

export default async function DrinksPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  return <MenuListing locale={locale} kind="drink" />;
}
