import type { Metadata } from "next";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { Container } from "@repo/ui/core-elements/container";
import { Box } from "@repo/ui/core-elements/box";
import { Typography } from "@repo/ui/core-elements/typography";
import { Grid } from "@repo/ui/core-elements/grid";
import { Breadcrumbs } from "@repo/ui/core-elements/breadcrumbs";
import type { BreadcrumbItem } from "@repo/ui/core-elements/breadcrumbs";
import { SectionHero } from "@/components/section-hero";
import { getProductCategories, getAllProducts } from "@/lib/catalog";
import { CategoryCard } from "@/components/catalog-categories";
import { BuyableCard } from "@/components/buyable-card";
import type { BuyableItem } from "@/components/buyable-card";
import { kindLabel } from "@/lib/kind-labels";
import { getKindLabels } from "@/lib/system";

type Props = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = (await getTranslations({ locale, namespace: "ProductsPage" })) as (
    key: string,
  ) => string;
  // Titled by whatever the tenant calls this family, so the tab matches
  // the heading on the page.
  const labels = await getKindLabels(locale);
  return { title: kindLabel(labels, "product", t("heading")) };
}

export default async function ProductsPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  const [categories, products, t, detailT, labels] = await Promise.all([
    getProductCategories(),
    getAllProducts(),
    getTranslations("ProductsPage"),
    getTranslations("CategoryDetail"),
    getKindLabels(locale),
  ]);

  const heading = kindLabel(labels, "product", t("heading"));

  const breadcrumbs: BreadcrumbItem[] = [
    { label: detailT("home"), href: "/" },
    // What this tenant calls the family, on the trail and in the title
    // below - the page is theirs to name, the URL is not.
    { label: heading },
  ];

  const images = [
    ...categories.map((c) => c.image),
    ...products.map((p) => p.image),
  ].filter(Boolean) as string[];
  // Server component: a fresh random hero per request is intentional and carries
  // no hydration concern (rendered once on the server).
  // eslint-disable-next-line react-hooks/purity
  const randomIndex = Math.floor(Math.random() * images.length);
  const heroImage = images.length > 0 ? images[randomIndex] : null;

  return (
    <>
      {heroImage && (
        <SectionHero
          backgroundImage={heroImage}
          slogan={heading}
          style={{ height: "clamp(220px, 30vw, 400px)" }}
        />
      )}
      <Container
        paddingX={10}
        marginTop={16}
        paddingTop={!heroImage ? "var(--ui-navbar-height, 57px)" : undefined}
      >
        <Breadcrumbs items={breadcrumbs} />
        {!heroImage && (
          <Typography
            as="h1"
            variant="h1"
            className="section-title"
            marginBottom={24}
          >
            {heading}
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
                      id={cat.id}
                      name={name}
                      description={description}
                      image={cat.image}
                      itemCount={cat.item_count}
                      type="product"
                      href={`/categories/products/${cat.slug}/`}
                    />
                  </Grid>
                );
              })}
            </Grid>
          </section>
        )}
        {products.length > 0 && (
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
              {products.map((product) => {
                const item: BuyableItem = { kind: "product", data: product };
                return (
                  <Grid key={product.id} size={{ xs: 6, sm: 3}}>
                    <BuyableCard
                      item={item}
                      locale={locale}
                    />
                  </Grid>
                );
              })}
            </Grid>
          </section>
        )}
      </Container>
    </>
  );
}
