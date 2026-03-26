'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { AdminEntityList } from '@/components/admin/admin-entity-list';
import { Breadcrumbs } from '@repo/ui/core-elements/breadcrumbs';
import { listHighlights, deleteHighlight } from '@/lib/admin-api';
import { getUserFromToken } from '@/lib/auth';

export default function AdminHighlightsPage() {
  const t = useTranslations('Admin');
  const [items, setItems] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const systemId = getUserFromToken()?.systemId ?? 0;

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try { setItems(await listHighlights(systemId)); }
    catch { setError(t('errorLoad')); }
    finally { setLoading(false); }
  }, [systemId, t]);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async (id: number) => {
    try { await deleteHighlight(id); setItems(prev => prev.filter(i => i.id !== id)); }
    catch { setError(t('errorDelete')); }
  };

  const columns = [
    { key: 'image', label: 'Image' },
    { key: 'name', label: t('name') },
    { key: 'category', label: t('category') ?? 'Category' },
    { key: 'size', label: t('size') ?? 'Size' },
    { key: 'sort_order', label: t('order') ?? 'Order' },
    { key: 'enabled', label: t('enabled') },
  ];

  return (
    <>
      <Breadcrumbs items={[{ label: t('home'), href: '/' }, { label: t('breadcrumbAdmin'), href: '/admin' }, { label: t('highlights') }]} />
      <AdminEntityList title={t('highlights')} items={items} columns={columns} basePath="/admin/highlights" onDelete={handleDelete} loading={loading} error={error} />
    </>
  );
}
