import type { Metadata } from "next";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { MenuListing } from "@/components/menu-listing";

/**
 * The whole menu at `/menu`: the tenant's category cards plus every item,
 * grouped into a section per category. The only menu listing there is - the
 * five per-kind pages that used to sit beside it went with `MenuItem.kind`, and
 * this page itself moved up out of `/categories/menu` when the three catalog
 * families were unified on `/<family>/<category>/<item>`.
 *
 * One category on its own is `/menu/<category>`; one dish is
 * `/menu/<category>/<slug>`.
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

  return <MenuListing locale={locale} />;
}
