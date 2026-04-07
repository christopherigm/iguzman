'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { AdminEntityList, type Column } from '@/components/admin/admin-entity-list';
import { listAdminUsers } from '@/lib/admin-api';
import { Badge } from '@repo/ui/core-elements/badge';
import { Breadcrumbs } from '@repo/ui/core-elements/breadcrumbs';

export default function AdminUsersPage() {
  const t = useTranslations('Admin');
  const [items, setItems] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try { setItems(await listAdminUsers()); }
    catch { setError(t('errorLoad')); }
    finally { setLoading(false); }
  }, [t]);

  useEffect(() => { load(); }, [load]);

  const columns: Column[] = [
    { key: 'profile_picture', label: 'Avatar' },
    {
      key: 'email',
      label: 'Email',
      render: (v) => {
        if (!v) return '—';
        const str = String(v);
        const [local, domain] = str.split('@');
        const short = local.length > 10 ? `${local.slice(0, 10)}…` : local;
        return <span title={str}>{short}@{domain}</span>;
      },
    },
    { key: 'first_name', label: t('firstName') ?? 'First Name' },
    {
      key: 'last_name',
      label: t('lastName') ?? 'Last Name',
      render: (v) => v ? `${String(v).charAt(0).toUpperCase()}.` : '—',
    },
    {
      key: 'is_active',
      label: t('status') ?? 'Status',
      render: (v) => (
        <Badge variant="subtle" color={v ? 'green' : 'gray'}>
          {v ? t('active') : t('inactive')}
        </Badge>
      ),
    },
    {
      key: 'is_admin',
      label: t('role') ?? 'Role',
      render: (v) => (
        <Badge variant="subtle" color={v ? 'blue' : 'gray'}>
          {v ? t('isAdmin') : t('notAdmin')}
        </Badge>
      ),
    },
    { key: 'date_joined', label: t('createdAt'), render: (v) => v ? new Date(String(v)).toLocaleDateString() : '—' },
  ];

  return (
    <>
      <Breadcrumbs items={[{ label: t('home'), href: '/' }, { label: t('breadcrumbAdmin'), href: '/admin' }, { label: t('users') }]} />
      <AdminEntityList
        title={t('users')}
        items={items}
        columns={columns}
        basePath="/admin/users"
        loading={loading}
        error={error}
      />
    </>
  );
}
