import type { Metadata } from "next";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { MenuListing } from "@/components/menu-listing";

/**
 * Menu items whose `kind` is `side`, across every category. One of the five
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
  return { title: t("side") };
}

export default async function SidesPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  return <MenuListing locale={locale} kind="side" />;
}
