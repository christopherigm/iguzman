'use client';

import { useTranslations } from 'next-intl';
import { EntityListPage } from '@/components/admin/entity-list-page';
import { locations } from '@/lib/admin-api';
import { GeographyPanel } from './geography-panel';

export default function AdminLocationsPage() {
  const t = useTranslations('Admin');

  return (
    <>
      <EntityListPage
        titleKey="locations"
        resource={locations}
        basePath="/admin/locations"
        columns={[
          { key: 'name', label: t('name') },
          { key: 'place_type', label: t('placeType') },
          // Both are flattened by the API. `state_name` is read *through* the
          // county rather than stored, so a place with no county shows neither.
          { key: 'county_name', label: t('county') },
          { key: 'state_name', label: t('state') },
          { key: 'sighting_count', label: t('sightings') },
          // Worth a column of its own: it is the setting that decides whether a
          // nesting site's exact coordinates are published.
          { key: 'hide_precise_location', label: t('hidePreciseLocation') },
          { key: 'enabled', label: t('enabled') },
        ]}
      />
      {/* The two lookups the column above draws from, managed in place: a county
          is almost always needed mid-way through filing a location, which is a
          bad moment to be sent to another section. */}
      <GeographyPanel />
    </>
  );
}
