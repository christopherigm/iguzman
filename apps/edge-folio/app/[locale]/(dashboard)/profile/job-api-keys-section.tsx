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
import { Switch } from '@repo/ui/core-elements/switch';
import {
  getJobCredentials,
  createJobCredential,
  deleteJobCredential,
  type JobApiCredential,
  type JobProvider,
} from '@/lib/jobs';
import { getJobSearchPrefs, saveJobSearchPrefs } from '@/lib/auth';
import { getLanguages } from '@/lib/career';

const PROVIDERS: JobProvider[] = ['adzuna', 'jsearch'];

function SwitchRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <Box display="flex" alignItems="center" justifyContent="space-between" gap={12}>
      <Typography variant="body">{label}</Typography>
      <Switch checked={checked} onChange={onChange} aria-label={label} />
    </Box>
  );
}

export function JobSearchSection() {
  const t = useTranslations('ProfilePage');

  // Job search prefs state
  const [prefsLoading, setPrefsLoading] = useState(true);
  const [includeTitle, setIncludeTitle] = useState(true);
  const [extraText, setExtraText] = useState('');
  const [bilingual, setBilingual] = useState(false);
  const [includeTnProfession, setIncludeTnProfession] = useState(false);
  const [includeEducation, setIncludeEducation] = useState(false);
  const [includeYears, setIncludeYears] = useState(false);
  const [includeStack, setIncludeStack] = useState(false);
  const [includeLocation, setIncludeLocation] = useState(false);
  const [languageCount, setLanguageCount] = useState(0);
  const [savingPrefs, setSavingPrefs] = useState(false);
  const [prefsError, setPrefsError] = useState<string | null>(null);
  const [prefsSaved, setPrefsSaved] = useState(false);

  // API keys state
  const [keysLoading, setKeysLoading] = useState(true);
  const [credentials, setCredentials] = useState<JobApiCredential[]>([]);
  const [provider, setProvider] = useState<JobProvider>('adzuna');
  const [keyValue, setKeyValue] = useState('');
  const [keyLabel, setKeyLabel] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  useEffect(() => {
    Promise.all([getJobSearchPrefs(), getLanguages(), getJobCredentials()])
      .then(([prefs, langs, creds]) => {
        setIncludeTitle(prefs.job_search_include_title);
        setExtraText(prefs.job_search_extra_text);
        setBilingual(prefs.job_search_bilingual);
        setIncludeTnProfession(prefs.job_search_include_tn_profession);
        setIncludeEducation(prefs.job_search_include_education);
        setIncludeYears(prefs.job_search_include_years);
        setIncludeStack(prefs.job_search_include_stack);
        setIncludeLocation(prefs.job_search_include_location);
        setLanguageCount(langs.results.length);
        setCredentials(creds);
      })
      .catch(() => setPrefsError(t('jobSearchPrefsLoadError')))
      .finally(() => {
        setPrefsLoading(false);
        setKeysLoading(false);
      });
  }, [t]);

  const handleSavePrefs = useCallback(async () => {
    setSavingPrefs(true);
    setPrefsError(null);
    setPrefsSaved(false);
    try {
      await saveJobSearchPrefs({
        job_search_include_title: includeTitle,
        job_search_extra_text: extraText,
        job_search_bilingual: bilingual,
        job_search_include_tn_profession: includeTnProfession,
        job_search_include_education: includeEducation,
        job_search_include_years: includeYears,
        job_search_include_stack: includeStack,
        job_search_include_location: includeLocation,
      });
      setPrefsSaved(true);
    } catch {
      setPrefsError(t('jobSearchPrefsError'));
    } finally {
      setSavingPrefs(false);
    }
  }, [
    includeTitle, extraText, bilingual, includeTnProfession,
    includeEducation, includeYears, includeStack, includeLocation, t,
  ]);

  const handleAdd = useCallback(async () => {
    const key = keyValue.trim();
    if (!key) return;
    setSaving(true);
    setError(null);
    try {
      const created = await createJobCredential({ provider, key, label: keyLabel.trim() });
      setCredentials((prev) => [...prev.filter((c) => c.provider !== provider), created]);
      setKeyValue('');
      setKeyLabel('');
    } catch {
      setError(t('jobKeysSaveError'));
    } finally {
      setSaving(false);
    }
  }, [keyValue, provider, keyLabel, t]);

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
          {t('jobSearchSection')}
        </Typography>
        <Typography variant="body-sm" color="var(--muted-foreground, #6b7280)">
          {t('jobSearchSubtitle')}
        </Typography>
      </Box>

      {/* ── Search Query Preferences ── */}
      <Box display="flex" flexDirection="column" gap={4}>
        <Typography variant="body" fontWeight={600}>
          {t('jobSearchPrefsTitle')}
        </Typography>
        <Typography variant="caption" color="var(--muted-foreground, #6b7280)">
          {t('jobSearchPrefsSubtitle')}
        </Typography>
      </Box>

      {prefsLoading ? (
        <ProgressBar label={t('loading')} />
      ) : (
        <>
          <Box display="flex" flexDirection="column" gap={12}>
            <SwitchRow
              label={t('jobSearchIncludeTitle')}
              checked={includeTitle}
              onChange={(v) => { setIncludeTitle(v); setPrefsSaved(false); }}
            />
            <TextInput
              label={t('jobSearchExtraTextLabel')}
              type="text"
              value={extraText}
              onChange={(v) => { setExtraText(v); setPrefsSaved(false); }}
              placeholder={t('jobSearchExtraTextPlaceholder')}
              aria-label={t('jobSearchExtraTextLabel')}
              width="100%"
            />
            {languageCount >= 2 && (
              <SwitchRow
                label={t('jobSearchBilingual')}
                checked={bilingual}
                onChange={(v) => { setBilingual(v); setPrefsSaved(false); }}
              />
            )}
            <SwitchRow
              label={t('jobSearchIncludeTnProfession')}
              checked={includeTnProfession}
              onChange={(v) => { setIncludeTnProfession(v); setPrefsSaved(false); }}
            />
            <SwitchRow
              label={t('jobSearchIncludeEducation')}
              checked={includeEducation}
              onChange={(v) => { setIncludeEducation(v); setPrefsSaved(false); }}
            />
            <SwitchRow
              label={t('jobSearchIncludeYears')}
              checked={includeYears}
              onChange={(v) => { setIncludeYears(v); setPrefsSaved(false); }}
            />
            <SwitchRow
              label={t('jobSearchIncludeStack')}
              checked={includeStack}
              onChange={(v) => { setIncludeStack(v); setPrefsSaved(false); }}
            />
            <SwitchRow
              label={t('jobSearchIncludeLocation')}
              checked={includeLocation}
              onChange={(v) => { setIncludeLocation(v); setPrefsSaved(false); }}
            />
          </Box>

          {prefsError && (
            <Typography variant="caption" role="alert" color="var(--error, #ef4444)">
              {prefsError}
            </Typography>
          )}

          <Box display="flex" justifyContent="flex-end" alignItems="center" gap={12}>
            {prefsSaved && (
              <Typography variant="caption" color="var(--success, #22c55e)">
                {t('jobSearchPrefsSaved')}
              </Typography>
            )}
            <Button
              text={savingPrefs ? t('jobSearchPrefsSaving') : t('jobSearchPrefsSave')}
              type="button"
              size="lg"
              kind="success"
              disabled={savingPrefs}
              onClick={() => void handleSavePrefs()}
            />
          </Box>

          {/* ── Divider ── */}
          <Box styles={{ borderTop: '1px solid var(--border, #e5e7eb)' }} />

          {/* ── BYOK API Keys ── */}
          <Box display="flex" flexDirection="column" gap={4}>
            <Typography variant="body" fontWeight={600}>
              {t('jobSearchApiTitle')}
            </Typography>
            <Typography variant="caption" color="var(--muted-foreground, #6b7280)">
              {t('jobKeysSubtitle')}
            </Typography>
          </Box>

          {keysLoading ? (
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
                  value={keyLabel}
                  onChange={setKeyLabel}
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
        </>
      )}
    </Box>
  );
}
