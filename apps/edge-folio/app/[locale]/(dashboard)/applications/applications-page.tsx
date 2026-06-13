'use client';

import { useState, useCallback, useEffect } from 'react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { Container } from '@repo/ui/core-elements/container';
import { Box } from '@repo/ui/core-elements/box';
import { Card } from '@repo/ui/core-elements/card';
import { Button } from '@repo/ui/core-elements/button';
import { Icon } from '@repo/ui/core-elements/icon';
import { Typography } from '@repo/ui/core-elements/typography';
import { ProgressBar } from '@repo/ui/core-elements/progress-bar';
import { ConfirmationModal } from '@repo/ui/core-elements/confirmation-modal';
import { Badge } from '@repo/ui/core-elements/badge';
import { TextInput } from '@repo/ui/core-elements/text-input';
import { Toast } from '@repo/ui/core-elements/toast';
import { Select } from '@repo/ui/core-elements/select';
import { Switch } from '@repo/ui/core-elements/switch';
import {
  getApplications,
  createApplication,
  deleteApplication,
  ApplicationError,
  type JobApplication,
  type ApplicationStatus,
  type WorkType,
  type SalaryCurrency,
  type CreateApplicationPayload,
} from '@/lib/applications';
import { SpeechButton } from '@repo/ui/core-elements/speech-button';
import './applications-page.css';

const STATUSES: ApplicationStatus[] = ['draft', 'applied', 'interview', 'offer', 'rejected'];

const STATUS_COLORS: Record<ApplicationStatus, string> = {
  draft:     '#6b7280',
  applied:   '#06b6d4',
  interview: '#f59e0b',
  offer:     '#22c55e',
  rejected:  '#ef4444',
};

// ── Application form ──────────────────────────────────────────────────────────

interface ApplicationFormProps {
  onSave: (app: JobApplication) => void;
  onCancel: () => void;
}

function ApplicationForm({ onSave, onCancel }: ApplicationFormProps) {
  const t = useTranslations('ApplicationsPage');
  const [companyName, setCompanyName] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [jobDescription, setJobDescription] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<ApplicationStatus>('draft');
  const [notes, setNotes] = useState('');
  const [salaryMin, setSalaryMin] = useState('');
  const [salaryMax, setSalaryMax] = useState('');
  const [salaryCurrency, setSalaryCurrency] = useState<SalaryCurrency | ''>('');
  const [workType, setWorkType] = useState<WorkType[]>([]);
  const [location, setLocation] = useState('');
  const [usCitizenOrPr, setUsCitizenOrPr] = useState<'null' | 'true' | 'false'>('null');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [duplicateUrlModal, setDuplicateUrlModal] = useState(false);
  const [urlInput, setUrlInput] = useState('');
  const [fetchingUrl, setFetchingUrl] = useState(false);
  const [fetchUrlError, setFetchUrlError] = useState<string | null>(null);

  const handleFetchUrl = useCallback(async (urlOverride?: string) => {
    const trimmed = (urlOverride ?? urlInput).trim();
    if (!trimmed) return;
    setFetchingUrl(true);
    setFetchUrlError(null);
    try {
      const res = await fetch('/api/scraper/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: trimmed }),
      });
      if (!res.ok) throw new Error('fetch failed');
      const data = (await res.json()) as {
        company_name: string;
        job_title: string;
        job_description: string;
        salary_min?: number | null;
        salary_max?: number | null;
        salary_currency?: string;
        work_type?: string[];
        location?: string;
        us_citizen_or_pr_required?: boolean | null;
      };
      if (data.company_name) setCompanyName(data.company_name);
      if (data.job_title) setJobTitle(data.job_title);
      if (data.job_description) setJobDescription(data.job_description);
      if (data.salary_min != null) setSalaryMin(String(data.salary_min));
      if (data.salary_max != null) setSalaryMax(String(data.salary_max));
      if (data.salary_currency) setSalaryCurrency(data.salary_currency as SalaryCurrency);
      if (data.work_type?.length) setWorkType(data.work_type as WorkType[]);
      if (data.location) setLocation(data.location);
      if (data.us_citizen_or_pr_required != null) {
        setUsCitizenOrPr(data.us_citizen_or_pr_required ? 'true' : 'false');
      }
    } catch {
      setFetchUrlError(t('fetchUrlError'));
    } finally {
      setFetchingUrl(false);
    }
  }, [urlInput, t]);

  const handleUrlFocus = useCallback(async () => {
    if (urlInput) return;
    try {
      const text = (await navigator.clipboard.readText()).trim();
      if (text.startsWith('http://') || text.startsWith('https://')) {
        setUrlInput(text);
        void handleFetchUrl(text);
      }
    } catch {
      // Clipboard permission denied — silently ignore
    }
  }, [urlInput, handleFetchUrl]);

  const handleUrlPaste = useCallback((e: React.ClipboardEvent<HTMLInputElement>) => {
    const pasted = e.clipboardData.getData('text').trim();
    if (pasted.startsWith('http://') || pasted.startsWith('https://')) {
      // Use a microtask so the input value is updated before fetching
      setTimeout(() => void handleFetchUrl(pasted), 0);
    }
  }, [handleFetchUrl]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!companyName.trim() || !jobTitle.trim() || !jobDescription.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const payload: CreateApplicationPayload = {
        company_name: companyName.trim(),
        job_title: jobTitle.trim(),
        job_description: jobDescription.trim(),
        status: selectedStatus,
        notes: notes.trim(),
        job_url: urlInput.trim(),
        salary_min: salaryMin ? parseFloat(salaryMin) : null,
        salary_max: salaryMax ? parseFloat(salaryMax) : null,
        salary_currency: salaryCurrency || '',
        work_type: workType.length ? workType : null,
        location: location.trim(),
        us_citizen_or_pr_required: usCitizenOrPr === 'null' ? null : usCitizenOrPr === 'true',
      };
      const result = await createApplication(payload);
      onSave(result);
    } catch (err) {
      if (err instanceof ApplicationError && err.status === 400) {
        const jobUrlErrors = err.data.job_url;
        if (Array.isArray(jobUrlErrors) && (jobUrlErrors as string[]).includes('duplicate')) {
          setDuplicateUrlModal(true);
          return;
        }
      }
      const isAuth = err instanceof ApplicationError && err.status === 401;
      setError(isAuth ? t('errorUnauthorized') : t('errorSave'));
    } finally {
      setSaving(false);
    }
  }

  const isValid = urlInput.trim() && companyName.trim() && jobTitle.trim() && jobDescription.trim();

  return (
    <form onSubmit={handleSubmit} className="applications__form">
      <Typography as="h2" variant="h3" fontWeight={600}>
        {t('newTitle')}
      </Typography>

      <Box display="flex" gap={8} alignItems="flex-end">
        <Box flex={1}>
          <TextInput
            label={t('jdUrlLabel')}
            value={urlInput}
            onChange={setUrlInput}
            onFocus={handleUrlFocus}
            onPaste={handleUrlPaste}
            type="url"
            required
            width="100%"
            aria-label={t('jdUrlLabel')}
            disabled={fetchingUrl}
          />
        </Box>
        <Box display="flex" marginTop={12} gap={8}>
          {urlInput && (
            <button
              type="button"
              className="applications__icon-btn"
              onClick={() => setUrlInput('')}
              aria-label={t('clearUrl')}
              disabled={fetchingUrl}
            >
              <Icon icon="/icons/delete.svg" size={18} color="var(--foreground, #171717)" />
            </button>
          )}
          <button
            type="button"
            className="applications__icon-btn applications__icon-btn--fetch"
            disabled={fetchingUrl || !urlInput.trim()}
            onClick={() => void handleFetchUrl()}
            aria-label={fetchingUrl ? t('fetchingUrl') : t('fetchFromUrl')}
          >
            <Icon icon="/icons/download.svg" size={18} color="var(--accent-foreground, white)" />
          </button>
        </Box>
      </Box>

      {fetchingUrl && <ProgressBar label={t('fetchingUrl')} />}

      {fetchUrlError && (
        <Typography variant="caption" color="var(--error, #ef4444)">
          {fetchUrlError}
        </Typography>
      )}

      <Box display="flex" gap={12} flexWrap="wrap">
        <Box flex={1} styles={{ minWidth: 200 }}>
          <TextInput
            label={t('companyLabel')}
            value={companyName}
            onChange={setCompanyName}
            required
            maxLength={200}
            width="100%"
            disabled={fetchingUrl}
          />
        </Box>
        <Box flex={1} styles={{ minWidth: 200 }}>
          <TextInput
            label={t('jobTitleLabel')}
            value={jobTitle}
            onChange={setJobTitle}
            required
            maxLength={200}
            width="100%"
            disabled={fetchingUrl}
          />
        </Box>
      </Box>

      <Select
        label={t('statusLabel')}
        value={selectedStatus}
        onChange={(v) => setSelectedStatus(v as ApplicationStatus)}
        options={STATUSES.map((s) => ({ value: s, label: t(`statuses.${s}`) }))}
        width="100%"
        disabled={fetchingUrl}
      />

      <TextInput
        label={t('locationLabel')}
        value={location}
        onChange={setLocation}
        maxLength={200}
        width="100%"
        disabled={fetchingUrl}
      />

      <Box display="flex" gap={8} flexWrap="wrap" alignItems="flex-end">
        <Box flex={1} styles={{ minWidth: 140 }}>
          <TextInput
            label={t('salaryMinLabel')}
            value={salaryMin}
            onChange={setSalaryMin}
            type="number"
            min="0"
            width="100%"
            disabled={fetchingUrl}
          />
        </Box>
        <Box flex={1} styles={{ minWidth: 140 }}>
          <TextInput
            label={t('salaryMaxLabel')}
            value={salaryMax}
            onChange={setSalaryMax}
            type="number"
            min="0"
            width="100%"
            disabled={fetchingUrl}
          />
        </Box>
        <Box flex={1} styles={{ minWidth: 120 }}>
          <Select
            label={t('salaryCurrencyLabel')}
            value={salaryCurrency}
            onChange={(v) => setSalaryCurrency(v as SalaryCurrency | '')}
            options={[
              { value: '', label: t('salaryCurrencyPlaceholder') },
              { value: 'USD', label: 'USD' },
              { value: 'CAD', label: 'CAD' },
              { value: 'EUR', label: 'EUR' },
              { value: 'MXN', label: 'MXN' },
              { value: 'GBP', label: 'GBP' },
            ]}
            width="100%"
            disabled={fetchingUrl}
          />
        </Box>
      </Box>

      <Box display="flex" flexDirection="column" gap={6}>
        <Typography variant="body" color="var(--muted-foreground, #6b7280)">
          {t('workTypeLabel')}
        </Typography>
        <Box display="flex" flexDirection="column" gap={8} role="group" aria-label={t('workTypeLabel')}>
          {(['remote', 'onsite', 'hybrid'] as WorkType[]).map((wt) => (
            <Box key={wt} display="flex" alignItems="center" justifyContent="space-between" gap={12}>
              <Typography variant="body">{t(`workTypes.${wt}`)}</Typography>
              <Switch
                checked={workType.includes(wt)}
                onChange={(checked) =>
                  setWorkType((prev) =>
                    checked ? [...prev, wt] : prev.filter((x) => x !== wt),
                  )
                }
                disabled={fetchingUrl}
                aria-label={t(`workTypes.${wt}`)}
              />
            </Box>
          ))}
        </Box>
      </Box>

      <Select
        label={t('usCitizenOrPrLabel')}
        value={usCitizenOrPr}
        onChange={(v) => setUsCitizenOrPr(v as 'null' | 'true' | 'false')}
        options={[
          { value: 'null', label: t('usCitizenOrPr.null') },
          { value: 'true', label: t('usCitizenOrPr.true') },
          { value: 'false', label: t('usCitizenOrPr.false') },
        ]}
        width="100%"
        disabled={fetchingUrl}
      />

      <Box>
        <Typography variant="body" color="var(--muted-foreground, #6b7280)" marginBottom={6}>
          {t('jdLabel')}
        </Typography>
        <TextInput
          multirow
          rows={10}
          value={jobDescription}
          onChange={setJobDescription}
          required
          width="100%"
          aria-label={t('jdLabel')}
          disabled={fetchingUrl}
        />
      </Box>

      <Box>
        <Box display="flex" alignItems="center" justifyContent="space-between" marginBottom={6}>
          <Typography variant="body" color="var(--muted-foreground, #6b7280)">
            {t('notesLabel')}
          </Typography>
          <SpeechButton
            mode="batch"
            language="en"
            micIcon="/icons/mic.svg"
            onTranscript={(text) => setNotes((prev) => prev ? `${prev} ${text}` : text)}
          />
        </Box>
        <TextInput
          multirow
          rows={3}
          value={notes}
          onChange={setNotes}
          width="100%"
          aria-label={t('notesLabel')}
          disabled={fetchingUrl}
        />
      </Box>

      {duplicateUrlModal && (
        <ConfirmationModal
          title={t('duplicateUrlTitle')}
          text={t('duplicateUrlText')}
          okCallback={() => setDuplicateUrlModal(false)}
        />
      )}

      {error && (
        <Typography variant="caption" color="var(--error, #ef4444)">
          {error}
        </Typography>
      )}

      <Box display="flex" gap={8} justifyContent="flex-end">
        <Button text={t('cancel')} type="button" size="md" onClick={onCancel} />
        <Button
          text={saving ? t('saving') : t('save')}
          type="submit"
          size="md"
          kind="success"
          disabled={saving || !isValid}
        />
      </Box>
    </form>
  );
}

// ── Application card ──────────────────────────────────────────────────────────

function CardMetricBar({ label, value }: { label: string; value: number }) {
  const color = value >= 70 ? '#22c55e' : value >= 45 ? '#f59e0b' : '#ef4444';
  return (
    <Box display="flex" flexDirection="column" gap={2}>
      <Box display="flex" justifyContent="space-between" alignItems="center">
        <Typography variant="label" color="var(--muted-foreground, #6b7280)">
          {label}
        </Typography>
        <Typography variant="label" fontWeight={600} color={color}>
          {value}%
        </Typography>
      </Box>
      <ProgressBar value={value} size={4} label={label} />
    </Box>
  );
}

interface ApplicationCardProps {
  app: JobApplication;
  onDelete: (id: number) => void;
}

function ApplicationCard({ app, onDelete }: ApplicationCardProps) {
  const t = useTranslations('ApplicationsPage');
  const locale = useLocale();
  const date = new Date(app.created).toLocaleDateString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
  });

  const hasMetrics = app.overall_match != null || app.technical_match != null || app.nafta_tn_likelihood != null;

  return (
    <Link href={`/${locale}/applications/${app.id}`} prefetch className="applications__card-link">
      <Card gap={8}>
        <Box display="flex" alignItems="flex-start" justifyContent="space-between" gap={8}>
          <Box display="flex" flexDirection="column" gap={2}>
            <Typography as="p" variant="body-sm" fontWeight={600} color="var(--foreground)">
              {app.job_title}
            </Typography>
            <Typography variant="body" color="var(--muted-foreground, #6b7280)">
              {app.company_name}
            </Typography>
          </Box>
          <Badge
            variant="subtle"
            color={STATUS_COLORS[app.status]}
            style={{ textTransform: 'uppercase', letterSpacing: '0.04em', flexShrink: 0 }}
          >
            {t(`statuses.${app.status}`)}
          </Badge>
        </Box>

        {hasMetrics && (
          <Box display="flex" flexDirection="column" gap={6}>
            {app.overall_match != null && (
              <CardMetricBar label={t('overallMatch')} value={app.overall_match} />
            )}
            {app.technical_match != null && (
              <CardMetricBar label={t('technicalMatch')} value={app.technical_match} />
            )}
            {app.nafta_tn_likelihood != null && (
              <CardMetricBar label={t('naftaLikelihood')} value={app.nafta_tn_likelihood} />
            )}
          </Box>
        )}

        <Typography variant="caption" color="var(--muted-foreground, #6b7280)">
          {date}
        </Typography>

        <Box display="flex" gap={6} justifyContent="flex-end" marginTop={4}>
          <Button
            text={t('delete')}
            type="button"
            size="md"
            kind="error"
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDelete(app.id); }}
          />
        </Box>
      </Card>
    </Link>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

export function ApplicationsPage() {
  const t = useTranslations('ApplicationsPage');
  const [applications, setApplications] = useState<JobApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null);
  const [toast, setToast] = useState<{ text: string; kind: 'success' | 'error' } | null>(null);
  const [toastKey, setToastKey] = useState(0);

  function showToast(text: string, kind: 'success' | 'error') {
    setToast({ text, kind });
    setToastKey((k) => k + 1);
  }

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getApplications();
      setApplications(res.results);
    } catch {
      setError(t('errorLoad'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  function handleSaved(app: JobApplication) {
    setApplications((prev) => [app, ...prev]);
    showToast(t('savedNew'), 'success');
    setFormOpen(false);
  }

  async function handleDelete(id: number) {
    try {
      await deleteApplication(id);
      setApplications((prev) => prev.filter((a) => a.id !== id));
      showToast(t('deleted'), 'success');
    } catch {
      showToast(t('errorDelete'), 'error');
    }
  }

  if (loading) {
    return (
      <Container
        display="flex"
        alignItems="center"
        styles={{ minHeight: '100vh', flexDirection: 'column', justifyContent: 'center' }}
      >
        <ProgressBar label={t('loading')} />
      </Container>
    );
  }

  if (error) {
    return (
      <Container
        display="flex"
        alignItems="center"
        styles={{ minHeight: '100vh', flexDirection: 'column', justifyContent: 'center', gap: '16px' }}
      >
        <Typography variant="body-sm" color="var(--error, #ef4444)">
          {error}
        </Typography>
        <Button text={t('retry')} type="button" size="md" onClick={load} 
          kind='success'/>
      </Container>
    );
  }

  return (
    <Container
      paddingX={10}
      styles={{ paddingTop: 'var(--ui-navbar-height)', paddingBottom: '60px' }}
    >
      {pendingDeleteId !== null && (
        <ConfirmationModal
          title={t('confirmDeleteTitle')}
          text={t('confirmDeleteText')}
          okCallback={() => {
            const id = pendingDeleteId;
            setPendingDeleteId(null);
            handleDelete(id);
          }}
          cancelCallback={() => setPendingDeleteId(null)}
        />
      )}

      <Box
        width="100%"
        marginTop={24}
        marginBottom={24}
        display="flex"
        alignItems="flex-start"
        justifyContent="space-between"
        gap={16}
        flexWrap="wrap"
      >
        <Box display="flex" flexDirection="column" gap={4}>
          <Typography as="h1" variant="h2" fontWeight={600} marginBottom={4}>
            {t('title')}
          </Typography>
          <Typography variant="body-sm" color="var(--muted-foreground, #6b7280)">
            {t('subtitle')}
          </Typography>
        </Box>
        {!formOpen && (
          <Button
          kind='success' 
          text={t('newApplication')} type="button" size="md" onClick={() => setFormOpen(true)} />
        )}
      </Box>

      {formOpen && (
        <ApplicationForm
          onSave={handleSaved}
          onCancel={() => setFormOpen(false)}
        />
      )}

      {applications.length === 0 && !formOpen ? (
        <Box
          display="flex"
          flexDirection="column"
          alignItems="center"
          justifyContent="center"
          gap={12}
          paddingY={60}
          paddingX={24}
          border="2px dashed var(--border, #e5e7eb)"
          borderRadius={16}
          styles={{ textAlign: 'center' }}
        >
          <Typography variant="h3" fontWeight={600} color="var(--muted-foreground, #6b7280)">
            {t('emptyTitle')}
          </Typography>
          <Typography variant="body-sm" color="var(--muted-foreground, #6b7280)">
            {t('emptyBody')}
          </Typography>
          <Button text={t('newApplication')} type="button" size="md" onClick={() => setFormOpen(true)} />
        </Box>
      ) : (
        <Box
          display="grid"
          gap={16}
          styles={{ gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}
        >
          {applications.map((app) => (
            <ApplicationCard
              key={app.id}
              app={app}
              onDelete={setPendingDeleteId}
            />
          ))}
        </Box>
      )}

      {toast && (
        <Toast key={toastKey} message={toast.text} variant={toast.kind} position="top-center" />
      )}
    </Container>
  );
}
