'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { use } from 'react';
import { updateAdminUser, listAdminUsers } from '@/lib/admin-api';
import { Box } from '@repo/ui/core-elements/box';
import { Typography } from '@repo/ui/core-elements/typography';
import { Button } from '@repo/ui/core-elements/button';
import { Switch } from '@repo/ui/core-elements/switch';
import { Badge } from '@repo/ui/core-elements/badge';
import { useRouter } from '@repo/i18n/navigation';
import { Breadcrumbs } from '@repo/ui/core-elements/breadcrumbs';
import './user-form.css';

type Props = { params: Promise<{ locale: string; id: string }> };

export default function AdminUserFormPage({ params }: Props) {
  const { id } = use(params);
  const t = useTranslations('Admin');
  const router = useRouter();

  const [user, setUser] = useState<Record<string, unknown> | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isActive, setIsActive] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    listAdminUsers()
      .then((users) => {
        const found = users.find((u) => String(u.id) === id);
        if (found) {
          setUser(found);
          setIsAdmin(Boolean(found.is_admin));
          setIsActive(Boolean(found.is_active));
        } else {
          setError(t('errorLoad'));
        }
      })
      .catch(() => setError(t('errorLoad')))
      .finally(() => setLoading(false));
  }, [id, t]);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const updated = await updateAdminUser(Number(id), {
        is_admin: isAdmin,
        is_active: isActive,
      });
      setUser(updated);
      setSuccess(t('saved'));
    } catch {
      setError(t('errorSave'));
    } finally {
      setSaving(false);
    }
  };

  if (loading)
    return (
      <Box padding="24px">
        <Typography variant="body">{t('loading')}</Typography>
      </Box>
    );
  if (!user)
    return (
      <Box padding="24px">
        <Typography variant="body">{t('errorLoad')}</Typography>
      </Box>
    );

  return (
    <>
      <Breadcrumbs items={[{ label: t('home'), href: '/' }, { label: t('breadcrumbAdmin'), href: '/admin' }, { label: t('users'), href: '/admin/users' }, { label: t('edit') }]} />
      <Box className="uf">
      <Box className="uf__header">
        <Typography as="h1" variant="h3">
          {t('edit')} — {t('users')}
        </Typography>
        <Button
          text={t('cancel')}
          unstyled
          className="uf__btn-cancel"
          onClick={() => router.back()}
        />
      </Box>

      {error && (
        <Box className="uf__banner uf__banner--error">
          <Typography variant="body-sm">{error}</Typography>
        </Box>
      )}
      {success && (
        <Box className="uf__banner uf__banner--success">
          <Typography variant="body-sm">{success}</Typography>
        </Box>
      )}

      <Box className="uf__card">
        <Box className="uf__meta">
          <Typography as="p" variant="body">
            <strong>Email:</strong> {String(user.email ?? '')}
          </Typography>
          <Typography as="p" variant="body">
            <strong>{t('firstName') ?? 'First Name'}:</strong>{' '}
            {String(user.first_name ?? '')}
          </Typography>
          <Typography as="p" variant="body">
            <strong>{t('lastName') ?? 'Last Name'}:</strong>{' '}
            {String(user.last_name ?? '')}
          </Typography>
          <Typography as="p" variant="body">
            <strong>{t('role') ?? 'Role'}:</strong>{' '}
            <Badge variant="subtle" color={user.is_admin ? 'blue' : 'gray'}>
              {user.is_admin ? t('isAdmin') : t('notAdmin')}
            </Badge>
          </Typography>
        </Box>

        <Box className="uf__toggles">
          <Box className="uf__toggle-row">
            <Switch checked={isAdmin} onChange={setIsAdmin} />
            <span className="uf__toggle-label">{t('isAdmin')}</span>
          </Box>
          <Box className="uf__toggle-row">
            <Switch checked={isActive} onChange={setIsActive} />
            <span className="uf__toggle-label">{t('active')}</span>
          </Box>
        </Box>

        <Box className="uf__actions">
          <Button
            text={saving ? t('saving') : t('save')}
            onClick={handleSave}
            disabled={saving}
          />
        </Box>
      </Box>
    </Box>
    </>
  );
}
