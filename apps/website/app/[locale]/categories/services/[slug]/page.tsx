import { notFound } from 'next/navigation';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { Container } from '@repo/ui/core-elements/container';
import { Typography } from '@repo/ui/core-elements/typography';
import { Breadcrumbs } from '@repo/ui/core-elements/breadcrumbs';
import type { BreadcrumbItem } from '@repo/ui/core-elements/breadcrumbs';
import { Hero } from '@repo/ui/hero';
import { getServiceCategory, getServicesByCategory } from '@/lib/catalog';
import { CategoryDetail } from '@/components/category-detail';

type Props = {
  params: Promise<{ locale: string; slug: string }>;
};

export default async function ServiceCategoryPage({ params }: Props) {
  const { locale, slug } = await params;
  setRequestLocale(locale);

  const [category, t] = await Promise.all([
    getServiceCategory(slug),
    getTranslations('CategoryDetail'),
  ]);

  if (!category) notFound();

  const items = await getServicesByCategory(category.id);

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
    { label: t('services'), href: '/categories/services' },
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
      <Container paddingX={10} marginTop={hasImage ? 32 : 70}>
        <Breadcrumbs items={breadcrumbs} />
        {description && (
          <Typography variant="none" className="section-subtitle" marginTop={16}>
            {description}
          </Typography>
        )}
        <CategoryDetail
          category={category}
          kind="service"
          items={items}
          locale={locale}
          showTitle={!hasImage}
        />
      </Container>
    </>
  );
}
