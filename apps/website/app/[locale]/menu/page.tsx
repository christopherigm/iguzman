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
import type { MenuCategory, MenuItemDetail } from "@/lib/catalog";
import { MenuCard } from "@/components/menu-card";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ category?: string }>;
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = (await getTranslations({ locale, namespace: "Menu" })) as (
    key: string,
  ) => string;
  return { title: t("menu") };
}

export default async function MenuPage({ params, searchParams }: Props) {
  const { locale } = await params;
  const { category: categorySlug } = await searchParams;
  setRequestLocale(locale);

  const [categories, items, t] = await Promise.all([
    getMenuCategories(),
    getAllMenuItems(),
    getTranslations("Menu"),
  ]);

  const breadcrumbs: BreadcrumbItem[] = [
    { label: t("home"), href: "/" },
    { label: t("menu") },
  ];

  const categoryName = (cat: MenuCategory) =>
    (locale === "en" ? cat.en_name : cat.name) ?? cat.name ?? cat.en_name ?? "";

  // Group items by category id; a filter narrows to one category. Items without a
  // category collect under a trailing "other" section so nothing is dropped.
  const visibleCategories = categorySlug
    ? categories.filter((c) => c.slug === categorySlug)
    : categories;

  const byCategory = (catId: number) =>
    items.filter((i) => i.category === catId);
  const uncategorized = categorySlug
    ? []
    : items.filter((i) => i.category === null);

  const images = [
    ...categories.map((c) => c.image),
    ...items.map((i) => i.image),
  ].filter(Boolean) as string[];
  // Server component: a fresh random hero per request is intentional and carries
  // no hydration concern (rendered once on the server).
  // eslint-disable-next-line react-hooks/purity
  const randomIndex = Math.floor(Math.random() * images.length);
  const heroImage = images.length > 0 ? images[randomIndex] : null;

  const renderGrid = (list: MenuItemDetail[]) => (
    <Grid container spacing={2}>
      {list.map((item) => (
        <Grid key={item.id} size={{ xs: 6, sm: 3, lg: 2 }}>
          <MenuCard
            item={item}
            locale={locale}
            fromLabel={t("from")}
            unavailableLabel={t("unavailable")}
          />
        </Grid>
      ))}
    </Grid>
  );

  const hasAny = items.length > 0;

  return (
    <>
      {heroImage && (
        <Hero
          backgroundImage={heroImage}
          slogan={t("menu")}
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
            {t("menu")}
          </Typography>
        )}

        {!hasAny && (
          <Typography variant="body" marginTop={16}>
            {t("empty")}
          </Typography>
        )}

        {visibleCategories.map((cat, index) => {
          const catItems = byCategory(cat.id);
          if (catItems.length === 0) return null;
          return (
            <section
              key={cat.id}
              className={`catalog-section${index === 0 ? " catalog-section--flush-top" : ""}`}
            >
              <Box
                marginBottom={24}
                display="flex"
                flexDirection="column"
                gap={8}
              >
                <Typography as="h2" variant="h2" className="section-title">
                  {categoryName(cat)}
                </Typography>
                {(cat.description || cat.en_description) && (
                  <Typography variant="none" className="section-subtitle">
                    {(locale === "en" ? cat.en_description : cat.description) ??
                      cat.description ??
                      cat.en_description}
                  </Typography>
                )}
              </Box>
              {renderGrid(catItems)}
            </section>
          );
        })}

        {uncategorized.length > 0 && (
          <section
            className={`catalog-section${
              visibleCategories.length === 0
                ? " catalog-section--flush-top"
                : ""
            }`}
          >
            {visibleCategories.length > 0 && (
              <Box marginBottom={24}>
                <Typography as="h2" variant="h2" className="section-title">
                  {t("moreDishes")}
                </Typography>
              </Box>
            )}
            {renderGrid(uncategorized)}
          </section>
        )}
      </Container>
    </>
  );
}
