'use client';

import { useTranslations } from 'next-intl';
import { EntityListPage } from '@/components/admin/entity-list-page';
import { species } from '@/lib/admin-api';

export default function AdminSpeciesPage() {
  const t = useTranslations('Admin');

  return (
    <EntityListPage
      titleKey="species"
      resource={species}
      basePath="/admin/species"
      columns={[
        { key: 'image', label: t('image'), compact: true },
        { key: 'name', label: t('name') },
        { key: 'scientific_name', label: t('scientificName') },
        { key: 'category_name', label: t('category') },
        { key: 'sighting_count', label: t('sightings') },
        { key: 'is_featured', label: t('featured') },
        { key: 'enabled', label: t('enabled') },
      ]}
    />
  );
}
