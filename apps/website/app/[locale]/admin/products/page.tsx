'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { AdminEntityList } from '@/components/admin/admin-entity-list';
import { Breadcrumbs } from '@repo/ui/core-elements/breadcrumbs';
import { listProducts, deleteProduct } from '@/lib/admin-api';
import { getUserFromToken } from '@/lib/auth';

export default function AdminProductsPage() {
  const t = useTranslations('Admin');
  const [items, setItems] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const systemId = getUserFromToken()?.systemId ?? 0;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listProducts(systemId);
      setItems(data);
    } catch {
      setError(t('errorLoad'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  const handleDelete = async (id: number) => {
    try {
      await deleteProduct(id);
      setItems((prev) => prev.filter((i) => i.id !== id));
    } catch {
      setError(t('errorDelete'));
    }
  };

  const columns = [
    { key: 'image', label: t('image') ?? 'Image' },
    { key: 'name', label: t('name') },
    { key: 'sku', label: 'SKU' },
    {
      key: 'price',
      label: t('price') ?? 'Price',
      render: (v: unknown, row: Record<string, unknown>) =>
        v != null ? `${v} ${row.currency ?? ''}` : '—',
    },
    { key: 'in_stock', label: t('inStock') ?? 'In Stock' },
    { key: 'enabled', label: t('enabled') },
  ];

  return (
    <>
      <Breadcrumbs
        items={[
          { label: t('home'), href: '/' },
          { label: t('breadcrumbAdmin'), href: '/admin' },
          { label: t('products') },
        ]}
      />
      <AdminEntityList
        title={t('products')}
        items={items}
        columns={columns}
        basePath="/admin/products"
        onDelete={handleDelete}
        loading={loading}
        error={error}
      />
    </>
  );
}
