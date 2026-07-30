'use client';

import { useTranslations } from 'next-intl';
import { EntityListPage } from '@/components/admin/entity-list-page';
import { states } from '@/lib/admin-api';

export default function AdminStatesPage() {
  const t = useTranslations('Admin');

  return (
    <EntityListPage
      titleKey="states"
      resource={states}
      basePath="/admin/states"
      columns={[
        { key: 'name', label: t('name') },
        // Flattened by the API, so the list reads "Colorado / Estados Unidos"
        // without a second request - and tells a Durango in Mexico apart from a
        // Durango in Colorado.
        { key: 'country_name', label: t('country') },
        { key: 'slug', label: t('slug') },
        { key: 'county_count', label: t('counties') },
        // How many places sit in this state, counted two joins away - a place
        // stores its county, not its state.
        { key: 'location_count', label: t('locations') },
        { key: 'enabled', label: t('enabled') },
      ]}
    />
  );
}
