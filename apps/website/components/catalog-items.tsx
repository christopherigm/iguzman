import { getTranslations, getLocale } from 'next-intl/server';
import {
  getFeaturedProducts,
  getFeaturedServices,
  type FeaturedProduct,
  type FeaturedService,
} from '@/lib/catalog';
import { Box } from '@repo/ui/core-elements/box';
import { Typography } from '@repo/ui/core-elements/typography';
import { Grid } from '@repo/ui/core-elements/grid';
import { BuyableCard, type BuyableItem } from './buyable-card';
import './catalog-items.css';

export async function CatalogItems() {
  const [products, services, locale, t] = await Promise.all([
    getFeaturedProducts(),
    getFeaturedServices(),
    getLocale(),
    getTranslations('CatalogItems'),
  ]);

  if (products.length === 0 && services.length === 0) return null;

  // Shuffle products and services together
  const items: BuyableItem[] = [
    ...products.map((data): BuyableItem => ({ kind: 'product', data })),
    ...services.map((data: FeaturedService): BuyableItem => ({ kind: 'service', data })),
  ].sort(() => Math.random() - 0.5);

  return (
    <section className="catalog-items-section">
      <Box className="highlights-header">
        <Typography as="h2" variant="h2" className="section-title">
          {t('heading')}
        </Typography>
      </Box>
      <Grid container spacing={2}>
        {items.map((item) => (
          <Grid
            key={`${item.kind}-${item.data.id}`}
            size={{ xs: 6, sm: 3, lg: 2 }}
          >
            <BuyableCard
              item={item}
              locale={locale}
              productLabel={t('productLabel')}
              serviceLabel={t('serviceLabel')}
            />
          </Grid>
        ))}
      </Grid>
    </section>
  );
}
