import type { Metadata } from "next";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { MenuListing } from "@/components/menu-listing";

/**
 * The whole menu: the tenant's categories plus every item, grouped into a
 * section per kind. The per-kind pages beside it (`/categories/food`,
 * `/categories/drinks`, …) each show one kind; this is the one page that shows
 * them all, and the "Full menu" entry of the navbar's Menu dropdown.
 */

type Props = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = (await getTranslations({ locale, namespace: "FoodPage" })) as (
    key: string,
  ) => string;
  return { title: t("heading") };
}

export default async function MenuPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  return <MenuListing locale={locale} kind={null} />;
}
