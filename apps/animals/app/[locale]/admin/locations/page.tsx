'use client';

import { useTranslations } from 'next-intl';
import { EntityListPage } from '@/components/admin/entity-list-page';
import { locations } from '@/lib/admin-api';

export default function AdminLocationsPage() {
  const t = useTranslations('Admin');

  return (
    <EntityListPage
      titleKey="locations"
      resource={locations}
      basePath="/admin/locations"
      columns={[
        { key: 'name', label: t('name') },
        { key: 'place_type', label: t('placeType') },
        { key: 'region', label: t('region') },
        { key: 'country', label: t('country') },
        { key: 'sighting_count', label: t('sightings') },
        // Worth a column of its own: it is the setting that decides whether a
        // nesting site's exact coordinates are published.
        { key: 'hide_precise_location', label: t('hidePreciseLocation') },
        { key: 'enabled', label: t('enabled') },
      ]}
    />
  );
}
