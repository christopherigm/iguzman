import { notFound } from 'next/navigation';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { Container } from '@repo/ui/core-elements/container';
import { Typography } from '@repo/ui/core-elements/typography';
import { Breadcrumbs } from '@repo/ui/core-elements/breadcrumbs';
import type { BreadcrumbItem } from '@repo/ui/core-elements/breadcrumbs';
import { Hero } from '@repo/ui/hero';
import { NavbarSpacer } from '@repo/ui/core-elements/navbar';
import { getProductCategory, getProductsByCategory } from '@/lib/catalog';
import { CategoryDetail } from '@/components/category-detail';

type Props = {
  params: Promise<{ locale: string; slug: string }>;
};

export default async function ProductCategoryPage({ params }: Props) {
  const { locale, slug } = await params;
  setRequestLocale(locale);

  const [category, t] = await Promise.all([
    getProductCategory(slug),
    getTranslations('CategoryDetail'),
  ]);

  if (!category) notFound();

  const items = await getProductsByCategory(category.id);

  const name =
    (locale === 'en' ? category.en_name : category.name) ??
    category.name ??
    category.en_name ??
    slug;

  const description =
    (locale === 'en' ? category.en_description : category.description) ??
    category.description ??
    category.en_description ??
    '';

  const breadcrumbs: BreadcrumbItem[] = [
    { label: t('home'), href: '/' },
    { label: t('products'), href: '/categories/products' },
    { label: name },
  ];

  const hasImage = Boolean(category.image);

  return (
    <>
      {hasImage && (
        <Hero
          backgroundImage={category.image}
          slogan={name}
          style={{ height: 'clamp(220px, 30vw, 400px)' }}
        />
      )}
      {!hasImage && <NavbarSpacer />}
      <Container paddingX={10} marginTop={32}>
        <Breadcrumbs items={breadcrumbs} />
        {description && (
          <Typography variant="none" className="section-subtitle" marginTop={16}>
            {description}
          </Typography>
        )}
        <CategoryDetail
          category={category}
          kind="product"
          items={items}
          locale={locale}
          showTitle={!hasImage}
        />
      </Container>
    </>
  );
}
