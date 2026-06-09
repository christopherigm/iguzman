'use client';

import { useState, useCallback, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Container } from '@repo/ui/core-elements/container';
import { Box } from '@repo/ui/core-elements/box';
import { Button } from '@repo/ui/core-elements/button';
import { Typography } from '@repo/ui/core-elements/typography';
import { ProgressBar } from '@repo/ui/core-elements/progress-bar';
import { ConfirmationModal } from '@repo/ui/core-elements/confirmation-modal';
import { Badge } from '@repo/ui/core-elements/badge';
import { TextInput } from '@repo/ui/core-elements/text-input';
import { Toast } from '@repo/ui/core-elements/toast';
import {
  getApplications,
  createApplication,
  updateApplication,
  deleteApplication,
  tailorApplication,
  generateCoverLetter,
  ApplicationError,
  type JobApplication,
  type ApplicationStatus,
  type CreateApplicationPayload,
  type TailoredBullet,
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
  initial?: JobApplication;
  onSave: (app: JobApplication) => void;
  onCancel: () => void;
}

function ApplicationForm({ initial, onSave, onCancel }: ApplicationFormProps) {
  const t = useTranslations('ApplicationsPage');
  const [companyName, setCompanyName] = useState(initial?.company_name ?? '');
  const [jobTitle, setJobTitle] = useState(initial?.job_title ?? '');
  const [jobDescription, setJobDescription] = useState(initial?.job_description ?? '');
  const [selectedStatus, setSelectedStatus] = useState<ApplicationStatus>(initial?.status ?? 'draft');
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      };
      const result = initial
        ? await updateApplication(initial.id, payload)
        : await createApplication(payload);
      onSave(result);
    } catch (err) {
      const isAuth = err instanceof ApplicationError && err.status === 401;
      setError(isAuth ? t('errorUnauthorized') : t('errorSave'));
    } finally {
      setSaving(false);
    }
  }

  const isValid = companyName.trim() && jobTitle.trim() && jobDescription.trim();

  return (
    <form onSubmit={handleSubmit} className="applications__form">
      <Typography as="h2" variant="h3" fontWeight={600}>
        {initial ? t('editTitle') : t('newTitle')}
      </Typography>

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

      <Box>
        <Typography variant="caption" color="var(--muted-foreground, #6b7280)" marginBottom={6}>
          {t('statusLabel')}
        </Typography>
        <select
          className="applications__select"
          value={selectedStatus}
          onChange={(e) => setSelectedStatus(e.target.value as ApplicationStatus)}
          aria-label={t('statusLabel')}
        >
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {t(`statuses.${s}`)}
            </option>
          ))}
        </select>
      </Box>

      <Box>
        <Typography variant="caption" color="var(--muted-foreground, #6b7280)" marginBottom={6}>
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
        <Typography variant="caption" color="var(--muted-foreground, #6b7280)" marginBottom={6}>
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
        <Button text={t('cancel')} type="button" size="sm" onClick={onCancel} />
        <Button
          text={saving ? t('saving') : t('save')}
          type="submit"
          size="sm"
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
  selected: boolean;
  onSelect: (app: JobApplication) => void;
  onEdit: (app: JobApplication) => void;
  onDelete: (id: number) => void;
}

function ApplicationCard({ app, selected, onSelect, onEdit, onDelete }: ApplicationCardProps) {
  const t = useTranslations('ApplicationsPage');
  const date = new Date(app.created).toLocaleDateString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
  });

  return (
    <Box
      className={`applications__card${selected ? ' applications__card--selected' : ''}`}
      display="flex"
      flexDirection="column"
      gap={8}
      padding={14}
      borderRadius={10}
      border="1px solid var(--border, #e5e7eb)"
      backgroundColor="var(--surface-1)"
      onClick={() => onSelect(app)}
    >
      <Box display="flex" alignItems="flex-start" justifyContent="space-between" gap={8}>
        <Box display="flex" flexDirection="column" gap={2}>
          <Typography as="p" variant="body-sm" fontWeight={600} color="var(--foreground)">
            {app.job_title}
          </Typography>
          <Typography variant="caption" color="var(--muted-foreground, #6b7280)">
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
          text={t('edit')}
          type="button"
          size="sm"
          onClick={(e) => { e.stopPropagation(); onEdit(app); }}
        />
        <Button
          text={t('delete')}
          type="button"
          size="sm"
          kind="error"
          onClick={(e) => { e.stopPropagation(); onDelete(app.id); }}
        />
      </Box>
    </Box>
  );
}

// ── Application detail panel ──────────────────────────────────────────────────

interface ApplicationDetailProps {
  app: JobApplication;
  onClose: () => void;
}

function ApplicationDetail({ app, onClose }: ApplicationDetailProps) {
  const t = useTranslations('ApplicationsPage');
  const [tailoring, setTailoring] = useState(false);
  const [tailoredBullets, setTailoredBullets] = useState<TailoredBullet[] | null>(null);
  const [tailorError, setTailorError] = useState<string | null>(null);
  const [generatingCoverLetter, setGeneratingCoverLetter] = useState(false);
  const [coverLetter, setCoverLetter] = useState<string | null>(null);
  const [coverLetterError, setCoverLetterError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setTailoredBullets(null);
    setTailorError(null);
    setCoverLetter(null);
    setCoverLetterError(null);
    setCopied(false);
  }, [app.id]);

  async function handleTailor() {
    setTailoring(true);
    setTailorError(null);
    setCoverLetter(null);
    setCoverLetterError(null);
    try {
      const result = await tailorApplication(app.id);
      setTailoredBullets(result.bullets);
    } catch {
      setTailorError(t('errorTailor'));
    } finally {
      setTailoring(false);
    }
  }

  async function handleGenerateCoverLetter() {
    if (!tailoredBullets) return;
    setGeneratingCoverLetter(true);
    setCoverLetterError(null);
    try {
      const result = await generateCoverLetter(app.id, tailoredBullets);
      setCoverLetter(result.cover_letter);
      setCopied(false);
    } catch {
      setCoverLetterError(t('errorCoverLetter'));
    } finally {
      setGeneratingCoverLetter(false);
    }
  }

  async function handleCopy() {
    if (!coverLetter) return;
    await navigator.clipboard.writeText(coverLetter);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Box
      display="flex"
      flexDirection="column"
      gap={14}
      padding={16}
      borderRadius={12}
      border="1px solid var(--primary, #06b6d4)"
      backgroundColor="var(--surface-1)"
      marginBottom={28}
    >
      <Box display="flex" alignItems="flex-start" justifyContent="space-between" gap={8} flexWrap="wrap">
        <Box display="flex" flexDirection="column" gap={4}>
          <Typography as="h2" variant="h3" fontWeight={600}>
            {app.job_title}
          </Typography>
          <Typography variant="body-sm" color="var(--muted-foreground, #6b7280)">
            {app.company_name}
          </Typography>
        </Box>
        <Box display="flex" alignItems="center" gap={8}>
          <Badge
            variant="subtle"
            color={STATUS_COLORS[app.status]}
            style={{ textTransform: 'uppercase', letterSpacing: '0.04em' }}
          >
            {t(`statuses.${app.status}`)}
          </Badge>
          <Button text={t('close')} type="button" size="sm" onClick={onClose} />
        </Box>
      </Box>

      <Box>
        <Typography variant="caption" color="var(--muted-foreground, #6b7280)" marginBottom={6}>
          {t('jdLabel')}
        </Typography>
        <div className="applications__jd">{app.job_description}</div>
      </Box>

      {app.notes && (
        <Box>
          <Typography variant="caption" color="var(--muted-foreground, #6b7280)" marginBottom={6}>
            {t('notesLabel')}
          </Typography>
          <Typography as="p" variant="body-sm" className="applications__notes">
            {app.notes}
          </Typography>
        </Box>
      )}

      {/* ── Tailoring section ─────────────────────────────────────────────────── */}
      <Box display="flex" flexDirection="column" gap={10}>
        <Box display="flex" alignItems="center" gap={10} flexWrap="wrap">
          <Button
            text={tailoring ? t('tailoring') : tailoredBullets ? t('tailorAgain') : t('tailor')}
            type="button"
            size="sm"
            kind="success"
            disabled={tailoring}
            onClick={handleTailor}
          />
          {tailoring && <ProgressBar label={t('tailoring')} />}
        </Box>

        {tailorError && (
          <Typography variant="caption" color="var(--error, #ef4444)">
            {tailorError}
          </Typography>
        )}

        {tailoredBullets && tailoredBullets.length > 0 && (
          <Box display="flex" flexDirection="column" gap={8}>
            <Box display="flex" flexDirection="column" gap={2}>
              <Typography variant="caption" fontWeight={600} color="var(--foreground)">
                {t('tailoredTitle')}
              </Typography>
              <Typography variant="caption" color="var(--muted-foreground, #6b7280)">
                {t('tailoredSubtitle')}
              </Typography>
            </Box>
            {tailoredBullets.map((b) => (
              <div key={b.id} className="applications__bullet">
                {b.tailored_text}
              </div>
            ))}
          </Box>
        )}
      </Box>

      {/* ── Cover letter section ──────────────────────────────────────────────── */}
      {tailoredBullets && tailoredBullets.length > 0 && (
        <Box display="flex" flexDirection="column" gap={10} paddingTop={6} styles={{ borderTop: '1px solid var(--border, #e5e7eb)' }}>
          <Box display="flex" alignItems="center" gap={10} flexWrap="wrap">
            <Button
              text={
                generatingCoverLetter
                  ? t('generatingCoverLetter')
                  : coverLetter
                  ? t('regenerateCoverLetter')
                  : t('generateCoverLetter')
              }
              type="button"
              size="sm"
              disabled={generatingCoverLetter}
              onClick={handleGenerateCoverLetter}
            />
            {generatingCoverLetter && <ProgressBar label={t('generatingCoverLetter')} />}
          </Box>

          {coverLetterError && (
            <Typography variant="caption" color="var(--error, #ef4444)">
              {coverLetterError}
            </Typography>
          )}

          {coverLetter && (
            <Box display="flex" flexDirection="column" gap={8}>
              <Box display="flex" alignItems="center" justifyContent="space-between" gap={8} flexWrap="wrap">
                <Box display="flex" flexDirection="column" gap={2}>
                  <Typography variant="caption" fontWeight={600} color="var(--foreground)">
                    {t('coverLetterTitle')}
                  </Typography>
                  <Typography variant="caption" color="var(--muted-foreground, #6b7280)">
                    {t('coverLetterSubtitle')}
                  </Typography>
                </Box>
                <Button
                  text={copied ? t('copied') : t('copyToClipboard')}
                  type="button"
                  size="sm"
                  kind={copied ? 'success' : undefined}
                  onClick={handleCopy}
                />
              </Box>
              <textarea
                className="applications__cover-letter"
                value={coverLetter}
                onChange={(e) => setCoverLetter(e.target.value)}
                rows={16}
                aria-label={t('coverLetterTitle')}
              />
            </Box>
          )}
        </Box>
      )}
    </Box>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

export function ApplicationsPage() {
  const t = useTranslations('ApplicationsPage');
  const [applications, setApplications] = useState<JobApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editingApp, setEditingApp] = useState<JobApplication | null>(null);
  const [selectedApp, setSelectedApp] = useState<JobApplication | null>(null);
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

  function openNew() {
    setEditingApp(null);
    setSelectedApp(null);
    setFormOpen(true);
  }

  function openEdit(app: JobApplication) {
    setEditingApp(app);
    setSelectedApp(null);
    setFormOpen(true);
  }

  function closeForm() {
    setFormOpen(false);
    setEditingApp(null);
  }

  function handleSelect(app: JobApplication) {
    if (formOpen) return;
    setSelectedApp((prev) => (prev?.id === app.id ? null : app));
  }

  function handleSaved(app: JobApplication) {
    setApplications((prev) =>
      editingApp === null
        ? [app, ...prev]
        : prev.map((a) => (a.id === app.id ? app : a)),
    );
    if (editingApp === null) {
      showToast(t('savedNew'), 'success');
    }
    closeForm();
  }

  async function handleDelete(id: number) {
    try {
      await deleteApplication(id);
      setApplications((prev) => prev.filter((a) => a.id !== id));
      if (selectedApp?.id === id) setSelectedApp(null);
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
        <Button text={t('retry')} type="button" size="sm" onClick={load} />
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
          <Button text={t('newApplication')} type="button" size="sm" onClick={openNew} />
        )}
      </Box>

      {formOpen && (
        <ApplicationForm
          initial={editingApp ?? undefined}
          onSave={handleSaved}
          onCancel={closeForm}
        />
      )}

      {selectedApp && !formOpen && (
        <ApplicationDetail
          app={selectedApp}
          onClose={() => setSelectedApp(null)}
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
          <Button text={t('newApplication')} type="button" size="sm" onClick={openNew} />
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
              selected={selectedApp?.id === app.id}
              onSelect={handleSelect}
              onEdit={openEdit}
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
