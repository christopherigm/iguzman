'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { Box } from '@repo/ui/core-elements/box';
import { TextInput } from '@repo/ui/core-elements/text-input';
import { Button } from '@repo/ui/core-elements/button';
import { Typography } from '@repo/ui/core-elements/typography';
import { ProgressBar } from '@repo/ui/core-elements/progress-bar';
import { Select } from '@repo/ui/core-elements/select';
import { Badge } from '@repo/ui/core-elements/badge';
import {
  getJobCredentials,
  createJobCredential,
  deleteJobCredential,
  type JobApiCredential,
  type JobProvider,
} from '@/lib/jobs';

const PROVIDERS: JobProvider[] = ['adzuna', 'jsearch'];

export function JobApiKeysSection() {
  const t = useTranslations('ProfilePage');

  const [loading, setLoading] = useState(true);
  const [credentials, setCredentials] = useState<JobApiCredential[]>([]);
  const [provider, setProvider] = useState<JobProvider>('adzuna');
  const [keyValue, setKeyValue] = useState('');
  const [label, setLabel] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  useEffect(() => {
    getJobCredentials()
      .then((res) => setCredentials(res))
      .catch(() => setError(t('jobKeysLoadError')))
      .finally(() => setLoading(false));
  }, [t]);

  const handleAdd = useCallback(async () => {
    const key = keyValue.trim();
    if (!key) return;
    setSaving(true);
    setError(null);
    try {
      const created = await createJobCredential({ provider, key, label: label.trim() });
      setCredentials((prev) => [...prev.filter((c) => c.provider !== provider), created]);
      setKeyValue('');
      setLabel('');
    } catch {
      setError(t('jobKeysSaveError'));
    } finally {
      setSaving(false);
    }
  }, [keyValue, provider, label, t]);

  const handleDelete = useCallback(async (id: number) => {
    setDeletingId(id);
    setError(null);
    try {
      await deleteJobCredential(id);
      setCredentials((prev) => prev.filter((c) => c.id !== id));
    } catch {
      setError(t('jobKeysDeleteError'));
    } finally {
      setDeletingId(null);
    }
  }, [t]);

  return (
    <Box
      width="100%"
      padding={10}
      borderRadius={12}
      flexDirection="column"
      gap={20}
      elevation={5}
      backgroundColor="var(--surface-1)"
    >
      <Box display="flex" flexDirection="column" gap={4}>
        <Typography as="h2" variant="h3" fontWeight={600}>
          {t('jobKeysSection')}
        </Typography>
        <Typography variant="body-sm" color="var(--muted-foreground, #6b7280)">
          {t('jobKeysSubtitle')}
        </Typography>
      </Box>

      {loading ? (
        <ProgressBar label={t('loading')} />
      ) : (
        <>
          {credentials.length > 0 && (
            <Box display="flex" flexDirection="column" gap={8}>
              {credentials.map((cred) => (
                <Box
                  key={cred.id}
                  display="flex"
                  alignItems="center"
                  gap={8}
                  padding={10}
                  borderRadius={8}
                  styles={{ border: '1px solid var(--border, #e5e7eb)', background: 'var(--surface-2)' }}
                >
                  <Badge variant="subtle" color="#06b6d4" style={{ textTransform: 'uppercase' }}>
                    {t(`jobKeysProviders.${cred.provider}`)}
                  </Badge>
                  <Typography variant="body-sm" styles={{ flex: 1 }}>
                    {cred.label || t('jobKeysNoLabel')}
                  </Typography>
                  <Typography variant="caption" color="var(--muted-foreground, #6b7280)">
                    {t('jobKeysStored')}
                  </Typography>
                  <Button
                    unstyled
                    type="button"
                    className="profile__upload-another"
                    disabled={deletingId === cred.id}
                    aria-label={`${t('jobKeysDelete')} ${cred.provider}`}
                    onClick={() => void handleDelete(cred.id)}
                  >
                    {deletingId === cred.id ? '…' : t('jobKeysDelete')}
                  </Button>
                </Box>
              ))}
            </Box>
          )}

          <Box display="flex" flexDirection="column" gap={12}>
            <Select
              label={t('jobKeysProviderLabel')}
              value={provider}
              onChange={(v) => setProvider(v as JobProvider)}
              options={PROVIDERS.map((p) => ({ value: p, label: t(`jobKeysProviders.${p}`) }))}
            />
            <TextInput
              label={t('jobKeysKeyLabel')}
              type="password"
              value={keyValue}
              onChange={(v) => { setKeyValue(v); setError(null); }}
              placeholder={t(`jobKeysKeyPlaceholder.${provider}`)}
              aria-label={t('jobKeysKeyLabel')}
              autoComplete="off"
            />
            <TextInput
              label={t('jobKeysLabelLabel')}
              type="text"
              value={label}
              onChange={setLabel}
              placeholder={t('jobKeysLabelPlaceholder')}
              aria-label={t('jobKeysLabelLabel')}
            />
          </Box>

          {error && (
            <Typography variant="caption" role="alert" color="var(--error, #ef4444)">
              {error}
            </Typography>
          )}

          <Box display="flex" justifyContent="flex-end">
            <Button
              text={saving ? t('jobKeysSaving') : t('jobKeysSave')}
              type="button"
              size="lg"
              kind="success"
              disabled={saving || !keyValue.trim()}
              onClick={() => void handleAdd()}
            />
          </Box>
        </>
      )}
    </Box>
  );
}
