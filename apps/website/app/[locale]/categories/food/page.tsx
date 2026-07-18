import type { Metadata } from "next";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { Container } from "@repo/ui/core-elements/container";
import { Box } from "@repo/ui/core-elements/box";
import { Typography } from "@repo/ui/core-elements/typography";
import { Grid } from "@repo/ui/core-elements/grid";
import { Breadcrumbs } from "@repo/ui/core-elements/breadcrumbs";
import type { BreadcrumbItem } from "@repo/ui/core-elements/breadcrumbs";
import { Hero } from "@repo/ui/hero";
import { getMenuCategories, getAllMenuItems } from "@/lib/catalog";
import { CategoryCard } from "@/components/catalog-categories";
import { BuyableCard } from "@/components/buyable-card";

type Props = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = (await getTranslations({ locale, namespace: "FoodPage" })) as (
    key: string,
  ) => string;
  return { title: t("heading") };
}

export default async function FoodPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  const [categories, items, t, detailT, menuT, catalogT] = await Promise.all([
    getMenuCategories(),
    getAllMenuItems(),
    getTranslations("FoodPage"),
    getTranslations("CategoryDetail"),
    getTranslations("Menu"),
    getTranslations("CatalogItems"),
  ]);

  const breadcrumbs: BreadcrumbItem[] = [
    { label: detailT("home"), href: "/" },
    { label: detailT("food") },
  ];

  const images = [
    ...categories.map((c) => c.image),
    ...items.map((i) => i.image),
  ].filter(Boolean) as string[];
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
        paddingX={10}
        marginTop={16}
        paddingTop={!heroImage ? "var(--ui-navbar-height, 57px)" : undefined}
        paddingBottom="var(--ui-page-bottom-spacing, 64px)"
      >
        <Breadcrumbs items={breadcrumbs} />
        {!heroImage && (
          <Typography
            as="h1"
            variant="h1"
            className="section-title"
            marginBottom={24}
          >
            {t("heading")}
          </Typography>
        )}
        {categories.length > 0 && (
          <section className="catalog-section catalog-section--flush-top">
            <Box
              marginBottom={32}
              display="flex"
              flexDirection="column"
              gap={10}
            >
              <Typography as="h2" variant="h2" className="section-title">
                {t("categoriesHeading")}
              </Typography>
            </Box>
            <Grid container spacing={2}>
              {categories.map((cat) => {
                const name =
                  (locale === "en" ? cat.en_name : cat.name) ??
                  cat.name ??
                  cat.en_name ??
                  "";
                const description =
                  (locale === "en" ? cat.en_description : cat.description) ??
                  cat.description ??
                  cat.en_description ??
                  "";
                return (
                  <Grid key={cat.id} size={{ xs: 6, sm: 4, lg: 3 }}>
                    <CategoryCard
                      name={name}
                      description={description}
                      image={cat.image}
                      itemCount={cat.item_count}
                      type="food"
                      href={`/categories/food/${cat.slug}/`}
                    />
                  </Grid>
                );
              })}
            </Grid>
          </section>
        )}
        {items.length > 0 && (
          <section
            className={`catalog-section${
              categories.length === 0 ? " catalog-section--flush-top" : ""
            }`}
          >
            <Box
              marginBottom={32}
              display="flex"
              flexDirection="column"
              gap={10}
            >
              <Typography as="h2" variant="h2" className="section-title">
                {t("itemsHeading")}
              </Typography>
            </Box>
            <Grid container spacing={2}>
              {items.map((item) => (
                <Grid key={item.id} size={{ xs: 6, sm: 3, lg: 2 }}>
                  <BuyableCard
                    item={{ kind: "food", data: item }}
                    locale={locale}
                    productLabel={catalogT("productLabel")}
                    serviceLabel={catalogT("serviceLabel")}
                    menuLabel={catalogT("menuLabel")}
                    fromLabel={menuT("from")}
                  />
                </Grid>
              ))}
            </Grid>
          </section>
        )}
      </Container>
    </>
  );
}
