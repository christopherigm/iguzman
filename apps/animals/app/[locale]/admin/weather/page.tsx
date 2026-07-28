'use client';

import { useTranslations } from 'next-intl';
import { EntityListPage } from '@/components/admin/entity-list-page';
import { weatherConditions } from '@/lib/admin-api';

export default function AdminWeatherPage() {
  const t = useTranslations('Admin');

  return (
    <EntityListPage
      titleKey="weather"
      resource={weatherConditions}
      basePath="/admin/weather"
      columns={[
        { key: 'icon', label: t('icon'), compact: true },
        { key: 'name', label: t('name') },
        { key: 'slug', label: t('slug') },
        { key: 'sighting_count', label: t('sightings') },
        { key: 'enabled', label: t('enabled') },
      ]}
    />
  );
}
