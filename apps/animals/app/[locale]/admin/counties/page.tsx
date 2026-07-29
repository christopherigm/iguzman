'use client';

import { useTranslations } from 'next-intl';
import { EntityListPage } from '@/components/admin/entity-list-page';
import { counties } from '@/lib/admin-api';

export default function AdminCountiesPage() {
  const t = useTranslations('Admin');

  return (
    <EntityListPage
      titleKey="counties"
      resource={counties}
      basePath="/admin/counties"
      columns={[
        { key: 'name', label: t('name') },
        // Flattened by the API, so the list reads "Zapopan / Jalisco" without a
        // second request - and tells two counties of the same name apart.
        { key: 'state_name', label: t('state') },
        { key: 'slug', label: t('slug') },
        { key: 'location_count', label: t('locations') },
        { key: 'enabled', label: t('enabled') },
      ]}
    />
  );
}
