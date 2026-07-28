'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Box } from '@repo/ui/core-elements/box';
import { Badge } from '@repo/ui/core-elements/badge';
import { Switch } from '@repo/ui/core-elements/switch';
import { Typography } from '@repo/ui/core-elements/typography';
import { Breadcrumbs } from '@repo/ui/core-elements/breadcrumbs';
import { AdminEntityList, CellText, EmptyCell } from '@/components/admin/admin-entity-list';
import { useSession } from '@repo/auth/session-provider';
import { listUsers, updateUser, type AdminUser } from '@/lib/admin-api';

/**
 * `/admin/users` - who has an account, and who may edit the site.
 *
 * Deliberately narrow. An administrator can see the account list and flip two
 * switches; there is no create, no delete and no password field, because:
 *
 * - accounts are self-registered and verified by email, so there is nothing to
 *   create here;
 * - deleting one would cascade, and it is not the CMS's job;
 * - a password is its owner's, and they reset it themselves.
 *
 * `is_staff` is shown but not editable: that flag opens the **Django** admin on
 * the backend, which is an operator's decision made in Django, not something a
 * site administrator hands out. `is_admin` - the CMS flag - is the one this page
 * writes.
 */
export default function AdminUsersPage() {
  const t = useTranslations('Admin');
  const [items, setItems] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const currentUserId = useSession()?.userId ?? null;

  useEffect(() => {
    listUsers()
      .then(setItems)
      .catch(() => setError(t('errorLoad')))
      .finally(() => setLoading(false));
  }, [t]);

  const setFlag = async (id: number, key: 'is_admin' | 'is_active', value: boolean) => {
    // Optimistic, then reconciled with what the API actually returns - it may
    // refuse (an administrator demoting themselves) and it resolves `is_admin`
    // for staff, which this page cannot compute on its own.
    setItems((prev) => prev.map((u) => (u.id === id ? { ...u, [key]: value } : u)));
    try {
      const updated = await updateUser(id, { [key]: value });
      setItems((prev) => prev.map((u) => (u.id === id ? updated : u)));
    } catch {
      setItems((prev) => prev.map((u) => (u.id === id ? { ...u, [key]: !value } : u)));
      setError(t('errorSave'));
    }
  };

  const columns = [
    { key: 'email', label: t('email') },
    {
      key: 'name',
      label: t('name'),
      render: (_v: unknown, row: Record<string, unknown>) => {
        const full = `${String(row.first_name ?? '')} ${String(row.last_name ?? '')}`.trim();
        return full ? <CellText>{full}</CellText> : <EmptyCell />;
      },
    },
    {
      key: 'is_active',
      label: t('active'),
      render: (_v: unknown, row: Record<string, unknown>) => (
        <Switch
          checked={Boolean(row.is_active)}
          onChange={(next) => void setFlag(row.id as number, 'is_active', next)}
          aria-label={t('active')}
        />
      ),
    },
    {
      key: 'is_admin',
      label: t('siteAdmin'),
      render: (_v: unknown, row: Record<string, unknown>) => {
        // Staff are administrators implicitly (core/permissions.py), so their
        // switch would be a control that cannot be turned off - a badge says so
        // instead. Nobody may demote themselves either; there may be no second
        // administrator, and the CMS has no way back in.
        if (row.is_staff)
          return (
            <Badge variant="subtle" color="green">
              {t('djangoStaff')}
            </Badge>
          );
        const isSelf = currentUserId !== null && row.id === currentUserId;
        return (
          <Switch
            checked={Boolean(row.is_admin)}
            disabled={isSelf}
            onChange={(next) => void setFlag(row.id as number, 'is_admin', next)}
            aria-label={t('siteAdmin')}
          />
        );
      },
    },
    {
      key: 'date_joined',
      label: t('joined'),
      render: (value: unknown) =>
        typeof value === 'string' ? (
          <CellText>{new Date(value).toLocaleDateString()}</CellText>
        ) : (
          <EmptyCell />
        ),
    },
  ];

  return (
    <>
      <Breadcrumbs
        items={[
          { label: t('home'), href: '/' },
          { label: t('breadcrumbAdmin'), href: '/admin' },
          { label: t('users') },
        ]}
      />
      <Box flexDirection="column" gap={12}>
        <AdminEntityList
          title={t('users')}
          items={items as unknown as Record<string, unknown>[]}
          columns={columns}
          basePath="/admin/users"
          // Accounts are self-registered; there is nothing for a "+ New" link to
          // create, and no per-row edit form behind an id - every editable field
          // is a switch in the row itself.
          hideCreate
          hideEdit
          loading={loading}
          error={error}
        />
        <Typography variant="caption" color="var(--muted-foreground, #6b7280)">
          {t('usersClaimsNote')}
        </Typography>
      </Box>
    </>
  );
}
