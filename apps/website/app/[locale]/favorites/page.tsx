import type { Metadata } from "next";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { Container } from "@repo/ui/core-elements/container";
import { Typography } from "@repo/ui/core-elements/typography";
import { Breadcrumbs } from "@repo/ui/core-elements/breadcrumbs";
import type { BreadcrumbItem } from "@repo/ui/core-elements/breadcrumbs";
import { Grid } from "@repo/ui/core-elements/grid";
import { Hero } from "@repo/ui/hero";
import { getSession } from "@repo/auth/session";
import { getFavorites } from "@/lib/favorites";
import { getRequestOrigin } from "@/lib/metadata";
import { BuyableCard, type BuyableItem } from "@/components/buyable-card";
import { EmptyCatalogState } from "@/components/empty-catalog-state";
import { GuestFavorites } from "./guest-favorites";

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

  // A guest's saved items live in their browser, so the server has none to
  // render: `getFavorites()` comes back empty and `GuestFavorites` resolves
  // localStorage after hydration.
  const [session, favorites, origin, t, itemT, menuT] = await Promise.all([
    getSession(),
    getFavorites(),
    getRequestOrigin(),
    getTranslations("Favorites"),
    getTranslations("CatalogItems"),
    getTranslations("Menu"),
  ]);

  const isGuest = session === null;

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
        marginTop={16}
        paddingTop={!heroImage ? "var(--ui-navbar-height, 57px)" : undefined}
        paddingBottom="var(--ui-page-bottom-spacing, 64px)"
      >
        <Breadcrumbs items={breadcrumbs} />
        <Typography as="h1" variant="h1" marginBottom={32}>
          {t("heading")}
        </Typography>

        {isGuest ? (
          <GuestFavorites
            locale={locale}
            productLabel={itemT("productLabel")}
            serviceLabel={itemT("serviceLabel")}
            menuLabel={itemT("menuLabel")}
            fromLabel={menuT("from")}
            origin={origin}
            // Built here because it is a server component (it renders the async
            // Categories grid) and `GuestFavorites` is a client component - it
            // can hold the element and decide when to show it, but not render it.
            emptyState={<EmptyCatalogState message={t("empty")} />}
          />
        ) : favorites.length > 0 ? (
          <Grid container spacing={2}>
            {favorites.map((favorite) => (
              <Grid
                key={`${favorite.kind}-${favorite.item.id}`}
                size={{ xs: 6, sm: 3, lg: 2 }}
              >
                <BuyableCard
                  item={
                    {
                      // The favorites API keys food as `menu_item`; the card
                      // knows it as `food`.
                      kind:
                        favorite.kind === "menu_item" ? "food" : favorite.kind,
                      data: favorite.item,
                    } as BuyableItem
                  }
                  locale={locale}
                  productLabel={itemT("productLabel")}
                  serviceLabel={itemT("serviceLabel")}
                  menuLabel={itemT("menuLabel")}
                  fromLabel={menuT("from")}
                />
              </Grid>
            ))}
          </Grid>
        ) : (
          <EmptyCatalogState message={t("empty")} />
        )}
      </Container>
    </>
  );
}
