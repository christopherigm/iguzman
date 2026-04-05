import type { Metadata } from 'next';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { getLocale } from 'next-intl/server';
import { Container } from '@repo/ui/core-elements/container';
import { Box } from '@repo/ui/core-elements/box';
import { Typography } from '@repo/ui/core-elements/typography';
import { Grid } from '@repo/ui/core-elements/grid';
import { Hero } from '@repo/ui/hero';
import { NavbarSpacer } from '@repo/ui/core-elements/navbar';
import { getProductCategories, getAllProducts } from '@/lib/catalog';
import { CategoryCard } from '@/components/catalog-categories';
import { BuyableCard } from '@/components/buyable-card';
import type { BuyableItem } from '@/components/buyable-card';

type Props = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = (await getTranslations({ locale, namespace: 'ProductsPage' })) as (key: string) => string;
  return { title: t('heading') };
}

export default async function ProductsPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  const [categories, products, t] = await Promise.all([
    getProductCategories(),
    getAllProducts(),
    getTranslations('ProductsPage'),
  ]);

  const images = [
    ...categories.map((c) => c.image),
    ...products.map((p) => p.image),
  ].filter(Boolean) as string[];
  const heroImage =
    images.length > 0 ? images[Math.floor(Math.random() * images.length)] : null;

  return (
    <>
      {heroImage && (
        <Hero
          backgroundImage={heroImage}
          slogan={t('heading')}
          style={{ height: 'clamp(220px, 30vw, 400px)' }}
        />
      )}
      {!heroImage && <NavbarSpacer />}
      <Container paddingX={10} marginTop={32}>
        {!heroImage && (
          <Typography as="h1" variant="h1" className="section-title" marginBottom={24}>
            {t('heading')}
          </Typography>
        )}
        {categories.length > 0 && (
          <section className="catalog-section">
            <Box marginBottom={32} display="flex" flexDirection="column" gap={10}>
              <Typography as="h2" variant="h2" className="section-title">
                {t('categoriesHeading')}
              </Typography>
            </Box>
            <Grid container spacing={2}>
              {categories.map((cat) => {
                const name =
                  (locale === 'en' ? cat.en_name : cat.name) ??
                  cat.name ??
                  cat.en_name ??
                  '';
                const description =
                  (locale === 'en' ? cat.en_description : cat.description) ??
                  cat.description ??
                  cat.en_description ??
                  '';
                return (
                  <Grid key={cat.id} size={{ xs: 6, sm: 4, lg: 3 }}>
                    <CategoryCard
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
          <section className="catalog-section">
            <Box marginBottom={32} display="flex" flexDirection="column" gap={10}>
              <Typography as="h2" variant="h2" className="section-title">
                {t('itemsHeading')}
              </Typography>
            </Box>
            <Grid container spacing={2}>
              {products.map((product) => {
                const item: BuyableItem = { kind: 'product', data: product };
                return (
                  <Grid key={product.id} size={{ xs: 6, sm: 3, lg: 2 }}>
                    <BuyableCard
                      item={item}
                      locale={locale}
                      productLabel={t('productLabel')}
                      serviceLabel={t('serviceLabel')}
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
