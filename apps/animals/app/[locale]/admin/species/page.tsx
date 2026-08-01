'use client';

import { useTranslations } from 'next-intl';
import { EntityListPage } from '@/components/admin/entity-list-page';
import { species } from '@/lib/admin-api';

/**
 * The species list - **the one CMS table read a page at a time**.
 *
 * The catalog grew past what one request should carry (a species row costs the
 * API two queries of its own plus its gallery, and this page asks for the
 * unpublished drafts as well), so it loads 50 rows and reaches the rest through
 * the search box, which the API matches against `name`, `en_name`,
 * `scientific_name` and `family`.
 *
 * The columns are the ones an author scans by: **both halves of the name pair**,
 * since this is the surface that edits them and a Spanish-only row is exactly
 * what the list should make visible. The scientific name stays on the form - it
 * is not what you look for a species by. `is_featured` and `enabled` are here as
 * **switches**: both are decisions about a whole shelf of records rather than
 * about one, so making either take a form round-trip per species is what the
 * inline toggle exists to avoid.
 */
export default function AdminSpeciesPage() {
  const t = useTranslations('Admin');

  return (
    <EntityListPage
      titleKey="species"
      resource={species}
      basePath="/admin/species"
      searchable
      columns={[
        { key: 'image', label: t('image'), compact: true },
        { key: 'name', label: t('name') },
        { key: 'en_name', label: t('enName') },
        { key: 'category_name', label: t('category') },
        { key: 'sighting_count', label: t('sightings') },
        {
          key: 'is_featured',
          label: t('featured'),
          toggle: true,
          toggleLabel: t('toggleFeatured'),
        },
        { key: 'enabled', label: t('enabled') },
      ]}
    />
  );
}
