'use client';

import { useTranslations } from 'next-intl';
import { EntityListPage } from '@/components/admin/entity-list-page';
import { CellText, EmptyCell } from '@/components/admin/admin-entity-list';
import { sightings } from '@/lib/admin-api';

export default function AdminSightingsPage() {
  const t = useTranslations('Admin');

  return (
    <EntityListPage
      titleKey="sightings"
      resource={sightings}
      basePath="/admin/sightings"
      // A journal feed is ordered by the day the encounter happened, not by a
      // number an author drags - `Sighting` has no `sort_order` column, so the
      // sort switch would offer a rearrangement with nowhere to store it.
      sortable={false}
      columns={[
        { key: 'image', label: t('image'), compact: true },
        {
          key: 'date',
          label: t('date'),
          // Rendered from the `YYYY-MM-DD` string in the viewer's locale, which
          // is how the rest of the CMS shows a date.
          render: (value) => {
            if (typeof value !== 'string') return <EmptyCell />;
            return <CellText>{new Date(`${value}T00:00:00`).toLocaleDateString()}</CellText>;
          },
        },
        // The entry's own title is optional (the site falls back to the species
        // name), so the species column is what makes a row identifiable.
        { key: 'species_name', label: t('species') },
        { key: 'name', label: t('title') },
        { key: 'location_name', label: t('location') },
        { key: 'media_count', label: t('media') },
        { key: 'is_featured', label: t('featured') },
        { key: 'enabled', label: t('enabled') },
      ]}
    />
  );
}
