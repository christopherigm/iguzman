'use client';

import { useTranslations } from 'next-intl';
import { EntityListPage } from '@/components/admin/entity-list-page';
import { CellText } from '@/components/admin/admin-entity-list';
import { categories } from '@/lib/admin-api';

export default function AdminCategoriesPage() {
  const t = useTranslations('Admin');
  const tKind = useTranslations('Kinds');

  return (
    <EntityListPage
      titleKey="categories"
      resource={categories}
      basePath="/admin/categories"
      columns={[
        { key: 'image', label: t('image'), compact: true },
        { key: 'name', label: t('name') },
        {
          key: 'kind',
          label: t('kind'),
          // The five branches are a fixed enum the frontend translates itself
          // (the API's `kind_display` is English-only), so this reads the same
          // `Kinds` namespace the public site does.
          render: (value) => <CellText>{tKind(String(value))}</CellText>,
        },
        { key: 'slug', label: t('slug') },
        { key: 'species_count', label: t('species') },
        { key: 'is_featured', label: t('featured') },
        { key: 'enabled', label: t('enabled') },
      ]}
    />
  );
}
