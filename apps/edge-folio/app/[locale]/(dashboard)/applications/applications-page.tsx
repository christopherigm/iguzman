'use client';

import { useState, useCallback, useEffect } from 'react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { Container } from '@repo/ui/core-elements/container';
import { Box } from '@repo/ui/core-elements/box';
import { Button } from '@repo/ui/core-elements/button';
import { Typography } from '@repo/ui/core-elements/typography';
import { ProgressBar } from '@repo/ui/core-elements/progress-bar';
import { ConfirmationModal } from '@repo/ui/core-elements/confirmation-modal';
import { Badge } from '@repo/ui/core-elements/badge';
import { TextInput } from '@repo/ui/core-elements/text-input';
import { Toast } from '@repo/ui/core-elements/toast';
import { Select } from '@repo/ui/core-elements/select';
import {
  getApplications,
  createApplication,
  deleteApplication,
  ApplicationError,
  type JobApplication,
  type ApplicationStatus,
  type CreateApplicationPayload,
} from '@/lib/applications';
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
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [urlInput, setUrlInput] = useState('');
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [fetchingUrl, setFetchingUrl] = useState(false);
  const [fetchUrlError, setFetchUrlError] = useState<string | null>(null);

  async function handleFetchUrl() {
    const trimmed = urlInput.trim();
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
        image_url?: string | null;
      };
      if (data.company_name) setCompanyName(data.company_name);
      if (data.job_title) setJobTitle(data.job_title);
      if (data.job_description) setJobDescription(data.job_description);
      setImageUrl(data.image_url ?? null);
    } catch {
      setFetchUrlError(t('fetchUrlError'));
    } finally {
      setFetchingUrl(false);
    }
  }

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
        company_image_url: imageUrl,
      };
      const result = await createApplication(payload);
      onSave(result);
    } catch (err) {
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
            type="url"
            required
            width="100%"
            aria-label={t('jdUrlLabel')}
          />
        </Box>
        <Button
          text={fetchingUrl ? t('fetchingUrl') : t('fetchFromUrl')}
          type="button"
          size="md"
          disabled={fetchingUrl || !urlInput.trim()}
          onClick={handleFetchUrl}
          kind='success'
        />
      </Box>

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
          />
        </Box>
      </Box>

      <Select
        label={t('statusLabel')}
        value={selectedStatus}
        onChange={(v) => setSelectedStatus(v as ApplicationStatus)}
        options={STATUSES.map((s) => ({ value: s, label: t(`statuses.${s}`) }))}
        width="100%"
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
        />
      </Box>

      <Box>
        <Typography variant="body" color="var(--muted-foreground, #6b7280)" marginBottom={6}>
          {t('notesLabel')}
        </Typography>
        <TextInput
          multirow
          rows={3}
          value={notes}
          onChange={setNotes}
          width="100%"
          aria-label={t('notesLabel')}
        />
      </Box>

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

  return (
    <Link href={`/${locale}/applications/${app.id}`} prefetch className="applications__card-link">
      <Box
        className="applications__card"
        display="flex"
        flexDirection="column"
        gap={8}
        padding={14}
        borderRadius={10}
        border="1px solid var(--border, #e5e7eb)"
        backgroundColor="var(--surface-1)"
      >
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
      </Box>
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
        <div className="applications__empty">
          <Typography variant="h3" fontWeight={600} color="var(--muted-foreground, #6b7280)">
            {t('emptyTitle')}
          </Typography>
          <Typography variant="body-sm" color="var(--muted-foreground, #6b7280)">
            {t('emptyBody')}
          </Typography>
          <Button text={t('newApplication')} type="button" size="md" onClick={() => setFormOpen(true)} />
        </div>
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
