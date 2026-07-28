'use client';

import { useTranslations } from 'next-intl';
import { EntityListPage } from '@/components/admin/entity-list-page';
import { CellText, EmptyCell } from '@/components/admin/admin-entity-list';
import { seasons } from '@/lib/admin-api';

export default function AdminSeasonsPage() {
  const t = useTranslations('Admin');
  const tMonth = useTranslations('Months');

  return (
    <EntityListPage
      titleKey="seasons"
      resource={seasons}
      basePath="/admin/seasons"
      columns={[
        { key: 'icon', label: t('icon'), compact: true },
        { key: 'name', label: t('name') },
        {
          key: 'months',
          label: t('months'),
          // The months are what fill a sighting's season from its date, so they
          // belong in the list rather than one click down - a season with an
          // empty set silently matches nothing.
          render: (value) => {
            const months = Array.isArray(value) ? (value as number[]) : [];
            if (months.length === 0) return <EmptyCell />;
            return <CellText>{months.map((m) => tMonth(String(m))).join(', ')}</CellText>;
          },
        },
        { key: 'sighting_count', label: t('sightings') },
        { key: 'enabled', label: t('enabled') },
      ]}
    />
  );
}
