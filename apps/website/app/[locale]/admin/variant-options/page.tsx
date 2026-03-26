'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { AdminEntityList } from '@/components/admin/admin-entity-list';
import { Breadcrumbs } from '@repo/ui/core-elements/breadcrumbs';
import { listVariantOptions, deleteVariantOption } from '@/lib/admin-api';
import { getUserFromToken } from '@/lib/auth';

export default function AdminVariantOptionsPage() {
  const t = useTranslations('Admin');
  const [items, setItems] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const systemId = getUserFromToken()?.systemId ?? 0;

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try { setItems(await listVariantOptions(systemId)); }
    catch { setError(t('errorLoad')); }
    finally { setLoading(false); }
  }, [systemId, t]);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async (id: number) => {
    try { await deleteVariantOption(id); setItems(prev => prev.filter(i => i.id !== id)); }
    catch { setError(t('errorDelete')); }
  };

  const columns = [
    { key: 'name', label: t('name') },
    { key: 'en_name', label: 'Name (EN)' },
    { key: 'slug', label: 'Slug' },
    { key: 'enabled', label: t('enabled') },
  ];

  return (
    <>
      <Breadcrumbs items={[{ label: t('home'), href: '/' }, { label: t('breadcrumbAdmin'), href: '/admin' }, { label: t('variantOptions') }]} />
      <AdminEntityList title={t('variantOptions')} items={items} columns={columns} basePath="/admin/variant-options" onDelete={handleDelete} loading={loading} error={error} />
    </>
  );
}
