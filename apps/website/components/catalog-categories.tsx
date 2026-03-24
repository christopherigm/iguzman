import Image from 'next/image';
import Link from 'next/link';
import { getTranslations, getLocale } from 'next-intl/server';
import {
  getProductCategories,
  getServiceCategories,
  type ProductCategory,
  type ServiceCategory,
} from '@/lib/catalog';
import { Box } from '@repo/ui/core-elements/box';
import { Typography } from '@repo/ui/core-elements/typography';
import { Grid } from '@repo/ui/core-elements/grid';
import './catalog-categories.css';

type CategoryType = 'product' | 'service';

interface CategoryCardProps {
  name: string;
  description: string;
  image: string | null;
  itemCount: number;
  type: CategoryType;
  href: string;
}

export function CategoryCard({
  name,
  description,
  image,
  itemCount,
  type,
  href,
}: CategoryCardProps) {
  const label = type === 'product' ? 'Product' : 'Service';
  const countLabel =
    type === 'product'
      ? `${itemCount} product${itemCount !== 1 ? 's' : ''}`
      : `${itemCount} service${itemCount !== 1 ? 's' : ''}`;

  return (
    <Link
      href={href}
      prefetch
      className={`category-card elevation-5 zoom-on-hover${image ? ' category-card--has-image' : ''}`}
    >
      {image && (
        <Image fill className="category-card__image" src={image} alt={name} />
      )}
      {image && <Box className="category-card__overlay" />}

      <Box className="category-card__content card-content">
        <Typography as="span" variant="none" className={`category-card__badge category-card__badge--${type}`}>
          {label}
        </Typography>

        {name && (
          <Typography as="h3" variant="h3" className="category-card__name">
            {name}
          </Typography>
        )}

        {description && (
          <Typography variant="body-sm" className="category-card__description">
            {description}
          </Typography>
        )}

        <Typography as="span" variant="label" className="category-card__count">{countLabel}</Typography>
      </Box>
    </Link>
  );
}

export async function CatalogCategories() {
  const [productCategories, serviceCategories, locale, t] = await Promise.all([
    getProductCategories(),
    getServiceCategories(),
    getLocale(),
    getTranslations('CatalogCategories'),
  ]);

  if (productCategories.length === 0 && serviceCategories.length === 0)
    return null;

  return (
    <section className="catalog-section">
      <Box className="highlights-header">
        <Typography as="h2" variant="h2" className="section-title">
          {t('heading')}
        </Typography>
      </Box>
      <Grid container spacing={2}>
        {productCategories.map((cat: ProductCategory) => {
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
            <Grid key={`product-${cat.id}`} size={{ xs: 6, sm: 4, lg: 3 }}>
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
        {serviceCategories.map((cat: ServiceCategory) => {
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
            <Grid key={`service-${cat.id}`} size={{ xs: 6, sm: 4, lg: 3 }}>
              <CategoryCard
                name={name}
                description={description}
                image={cat.image}
                itemCount={cat.item_count}
                type="service"
                href={`/categories/services/${cat.slug}/`}
              />
            </Grid>
          );
        })}
      </Grid>
    </section>
  );
}
