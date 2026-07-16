import type { Metadata } from "next";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { Container } from "@repo/ui/core-elements/container";
import { Typography } from "@repo/ui/core-elements/typography";
import { Breadcrumbs } from "@repo/ui/core-elements/breadcrumbs";
import type { BreadcrumbItem } from "@repo/ui/core-elements/breadcrumbs";
import { Grid } from "@repo/ui/core-elements/grid";
import { Hero } from "@repo/ui/hero";
import { getFavorites } from "@/lib/favorites";
import { BuyableCard, type BuyableItem } from "@/components/buyable-card";

type Props = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = (await getTranslations({
    locale,
    namespace: "Favorites",
  })) as (key: string) => string;

  return { title: t("heading") };
}

export default async function FavoritesPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  const [favorites, t, itemT] = await Promise.all([
    getFavorites(),
    getTranslations("Favorites"),
    getTranslations("CatalogItems"),
  ]);

  const breadcrumbs: BreadcrumbItem[] = [
    { label: t("home"), href: "/" },
    { label: t("heading") },
  ];

  const images = favorites
    .map((favorite) => favorite.item.image)
    .filter(Boolean) as string[];
  // Server component: a fresh random hero per request is intentional and carries
  // no hydration concern (rendered once on the server).
  // eslint-disable-next-line react-hooks/purity
  const randomIndex = Math.floor(Math.random() * images.length);
  const heroImage = images.length > 0 ? images[randomIndex] : null;

  return (
    <>
      {heroImage && (
        <Hero
          backgroundImage={heroImage}
          slogan={t("heading")}
          style={{ height: "clamp(220px, 30vw, 400px)" }}
        />
      )}
      <Container
        size="lg"
        paddingX={10}
        marginTop={32}
        paddingTop={!heroImage ? "var(--ui-navbar-height, 57px)" : undefined}
        paddingBottom="var(--ui-page-bottom-spacing, 64px)"
      >
        <Breadcrumbs items={breadcrumbs} />
        <Typography as="h1" variant="h1" marginTop={24} marginBottom={32}>
          {t("heading")}
        </Typography>

        {favorites.length > 0 ? (
          <Grid container spacing={2}>
            {favorites.map((favorite) => (
              <Grid
                key={`${favorite.kind}-${favorite.item.id}`}
                size={{ xs: 6, sm: 3, lg: 2 }}
              >
                <BuyableCard
                  item={
                    { kind: favorite.kind, data: favorite.item } as BuyableItem
                  }
                  locale={locale}
                  productLabel={itemT("productLabel")}
                  serviceLabel={itemT("serviceLabel")}
                />
              </Grid>
            ))}
          </Grid>
        ) : (
          <Typography variant="body">{t("empty")}</Typography>
        )}
      </Container>
    </>
  );
}
