import { getTranslations } from 'next-intl/server';
import { Box } from '@repo/ui/core-elements/box';
import { Typography } from '@repo/ui/core-elements/typography';
import { Grid } from '@repo/ui/core-elements/grid';
import type {
  ProductCategory,
  ServiceCategory,
  FeaturedProduct,
  FeaturedService,
} from '@/lib/catalog';
import { BuyableCard, type BuyableItem } from './buyable-card';
import './category-detail.css';

type CategoryDetailProps =
  | {
      category: ProductCategory;
      kind: 'product';
      items: FeaturedProduct[];
      locale: string;
      /** Pass true when there is no hero image so the title is shown inline. */
      showTitle?: boolean;
    }
  | {
      category: ServiceCategory;
      kind: 'service';
      items: FeaturedService[];
      locale: string;
      showTitle?: boolean;
    };

export async function CategoryDetail({
  category,
  kind,
  items,
  locale,
  showTitle = false,
}: CategoryDetailProps) {
  const [t, tCatalog] = await Promise.all([
    getTranslations('CategoryDetail'),
    getTranslations('CatalogItems'),
  ]);

  const name =
    (locale === 'en' ? category.en_name : category.name) ??
    category.name ??
    category.en_name ??
    '';

  const buyableItems: BuyableItem[] =
    kind === 'product'
      ? (items as FeaturedProduct[]).map((data) => ({
          kind: 'product' as const,
          data,
        }))
      : (items as FeaturedService[]).map((data) => ({
          kind: 'service' as const,
          data,
        }));

  return (
    <Box className="category-detail">
      {/* Title — only shown when there is no hero image */}
      {showTitle && name && (
        <Typography as="h1" variant="h2" className="category-detail__title">
          {name}
        </Typography>
      )}

      {/* Items section */}
      <Box className="category-detail__items-header">
        <Typography as="h2" variant="h3" className="section-title">
          {kind === 'product' ? t('products') : t('services')}
        </Typography>
        {buyableItems.length > 0 && (
          <Typography as="span" variant="none" className="category-detail__count">
            {buyableItems.length}
          </Typography>
        )}
      </Box>

      {buyableItems.length === 0 ? (
        <Box className="category-detail__empty">
          <Typography variant="none" className="section-subtitle">
            {t('noItems')}
          </Typography>
        </Box>
      ) : (
        <Grid container spacing={2}>
          {buyableItems.map((item) => (
            <Grid
              key={`${item.kind}-${item.data.id}`}
              size={{ xs: 6, sm: 3, lg: 2 }}
            >
              <BuyableCard
                item={item}
                locale={locale}
                productLabel={tCatalog('productLabel')}
                serviceLabel={tCatalog('serviceLabel')}
              />
            </Grid>
          ))}
        </Grid>
      )}
    </Box>
  );
}
