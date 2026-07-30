'use client';

import { useTranslations } from 'next-intl';
import { EntityListPage } from '@/components/admin/entity-list-page';
import { countries } from '@/lib/admin-api';

export default function AdminCountriesPage() {
  const t = useTranslations('Admin');

  return (
    <EntityListPage
      titleKey="countries"
      resource={countries}
      basePath="/admin/countries"
      columns={[
        { key: 'name', label: t('name') },
        { key: 'code', label: t('countryCode') },
        { key: 'slug', label: t('slug') },
        { key: 'state_count', label: t('states') },
        // How many places sit in this country, counted three joins away - a place
        // stores its county, not its state and not its country.
        { key: 'location_count', label: t('locations') },
        { key: 'enabled', label: t('enabled') },
      ]}
    />
  );
}
