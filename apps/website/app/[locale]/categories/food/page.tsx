import type { Metadata } from "next";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { MenuListing } from "@/components/menu-listing";
import { kindLabel } from "@/lib/kind-labels";
import { getKindLabels } from "@/lib/system";

/**
 * The dishes - menu items whose `kind` is `food`. One of the five per-kind
 * listings; `/categories/menu` is the whole menu.
 *
 * This URL used to be the whole menu, which is why links meaning "see our menu"
 * were repointed at `/categories/menu` when the kinds landed.
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
  return { title: kindLabel(labels, "food", t("food")) };
}

export default async function FoodPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  return <MenuListing locale={locale} kind="food" />;
}
