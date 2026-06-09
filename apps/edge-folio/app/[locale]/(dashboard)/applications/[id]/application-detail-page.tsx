'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
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
import {
  updateApplication,
  deleteApplication,
  tailorApplication,
  generateCoverLetter,
  ApplicationError,
  type JobApplication,
  type ApplicationStatus,
  type TailoredBullet,
} from '@/lib/applications';
import type { UserProfile } from '@/lib/auth';
import { buildResumeMarkdown, downloadMarkdown } from '@/lib/resume-markdown';
import './application-detail-page.css';

const STATUSES: ApplicationStatus[] = ['draft', 'applied', 'interview', 'offer', 'rejected'];

const STATUS_COLORS: Record<ApplicationStatus, string> = {
  draft:     '#6b7280',
  applied:   '#06b6d4',
  interview: '#f59e0b',
  offer:     '#22c55e',
  rejected:  '#ef4444',
};

const CATEGORY_ORDER = ['impact', 'technical', 'leadership', 'collaboration', 'other'];

function groupByCategory(bullets: TailoredBullet[]): Array<{ cat: string; bullets: TailoredBullet[] }> {
  const map = new Map<string, TailoredBullet[]>();
  for (const b of bullets) {
    const cat = b.category || 'other';
    if (!map.has(cat)) map.set(cat, []);
    map.get(cat)!.push(b);
  }
  return CATEGORY_ORDER
    .filter((c) => map.has(c))
    .map((c) => ({ cat: c, bullets: map.get(c)! }));
}

interface Props {
  application: JobApplication;
  profile: UserProfile | null;
}

export function ApplicationDetailPage({ application: initialApp, profile }: Props) {
  const t = useTranslations('ApplicationDetailPage');
  const locale = useLocale();
  const router = useRouter();

  const [app, setApp] = useState(initialApp);
  const [editing, setEditing] = useState(false);

  // Edit form state
  const [companyName, setCompanyName] = useState(app.company_name);
  const [jobTitle, setJobTitle] = useState(app.job_title);
  const [jobDescription, setJobDescription] = useState(app.job_description);
  const [selectedStatus, setSelectedStatus] = useState<ApplicationStatus>(app.status);
  const [notes, setNotes] = useState(app.notes);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Tailor
  const [tailoring, setTailoring] = useState(false);
  const [tailoredBullets, setTailoredBullets] = useState<TailoredBullet[] | null>(initialApp.tailored_bullets ?? null);
  const [tailorError, setTailorError] = useState<string | null>(null);

  // Cover letter
  const [generatingCL, setGeneratingCL] = useState(false);
  const [coverLetter, setCoverLetter] = useState<string | null>(initialApp.cover_letter || null);
  const [clError, setClError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Export
  const [exportingPDF, setExportingPDF] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  // Delete
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [toast, setToast] = useState<{ text: string; kind: 'success' | 'error' } | null>(null);
  const [toastKey, setToastKey] = useState(0);

  function showToast(text: string, kind: 'success' | 'error') {
    setToast({ text, kind });
    setToastKey((k) => k + 1);
  }

  function openEdit() {
    setCompanyName(app.company_name);
    setJobTitle(app.job_title);
    setJobDescription(app.job_description);
    setSelectedStatus(app.status);
    setNotes(app.notes);
    setSaveError(null);
    setEditing(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!companyName.trim() || !jobTitle.trim() || !jobDescription.trim()) return;
    setSaving(true);
    setSaveError(null);
    try {
      const updated = await updateApplication(app.id, {
        company_name: companyName.trim(),
        job_title: jobTitle.trim(),
        job_description: jobDescription.trim(),
        status: selectedStatus,
        notes: notes.trim(),
      });
      setApp(updated);
      setEditing(false);
      showToast(t('savedToast'), 'success');
    } catch (err) {
      const isAuth = err instanceof ApplicationError && err.status === 401;
      setSaveError(isAuth ? t('errorUnauthorized') : t('errorSave'));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      await deleteApplication(app.id);
      router.push(`/${locale}/applications`);
    } catch {
      showToast(t('errorDelete'), 'error');
      setDeleting(false);
    }
  }

  async function handleTailor() {
    setTailoring(true);
    setTailorError(null);
    setCoverLetter(null);
    try {
      const result = await tailorApplication(app.id);
      setTailoredBullets(result.bullets);
    } catch {
      setTailorError(t('errorTailor'));
    } finally {
      setTailoring(false);
    }
  }

  async function handleGenerateCL() {
    if (!tailoredBullets) return;
    setGeneratingCL(true);
    setClError(null);
    try {
      const result = await generateCoverLetter(app.id, tailoredBullets);
      setCoverLetter(result.cover_letter);
      setCopied(false);
    } catch {
      setClError(t('errorCoverLetter'));
    } finally {
      setGeneratingCL(false);
    }
  }

  async function handleCopy() {
    if (!coverLetter) return;
    await navigator.clipboard.writeText(coverLetter);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleExportPDF() {
    if (!tailoredBullets) return;
    setExportingPDF(true);
    setExportError(null);
    try {
      const { pdf } = await import('@react-pdf/renderer');
      const { ResumeDocument } = await import('@/lib/resume-pdf');
      const fullName = profile
        ? [profile.first_name, profile.last_name].filter(Boolean).join(' ') || profile.email
        : 'Candidate';
      const blob = await pdf(
        <ResumeDocument
          fullName={fullName}
          email={profile?.email ?? ''}
          jobTitle={profile?.job_title ?? ''}
          targetRole={app.job_title}
          targetCompany={app.company_name}
          tailoredBullets={tailoredBullets}
        />,
      ).toBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${app.company_name}-${app.job_title}-resume.pdf`
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '-')
        .replace(/-+/g, '-');
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setExportError(t('errorExport'));
    } finally {
      setExportingPDF(false);
    }
  }

  function handleExportMarkdown() {
    if (!tailoredBullets) return;
    const fullName = profile
      ? [profile.first_name, profile.last_name].filter(Boolean).join(' ') || profile.email
      : 'Candidate';
    const md = buildResumeMarkdown({
      fullName,
      email: profile?.email ?? '',
      jobTitle: profile?.job_title ?? '',
      targetRole: app.job_title,
      targetCompany: app.company_name,
      tailoredBullets,
      coverLetter: coverLetter ?? undefined,
    });
    const filename = `${app.company_name}-${app.job_title}`
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-') + '.md';
    downloadMarkdown(md, filename);
  }

  const grouped = tailoredBullets ? groupByCategory(tailoredBullets) : [];

  return (
    <Container
      paddingX={10}
      styles={{ paddingTop: 'var(--ui-navbar-height)', paddingBottom: '60px' }}
    >
      {confirmDelete && (
        <ConfirmationModal
          title={t('confirmDeleteTitle')}
          text={t('confirmDeleteText')}
          okCallback={() => {
            setConfirmDelete(false);
            handleDelete();
          }}
          cancelCallback={() => setConfirmDelete(false)}
        />
      )}

      <Box marginTop={20} />

      <Link href={`/${locale}/applications`} prefetch className="detail__back">
        ← {t('backToList')}
      </Link>

      {/* ── Header ────────────────────────────────────────────────────── */}
      <Box
        display="flex"
        alignItems="flex-start"
        justifyContent="space-between"
        gap={12}
        flexWrap="wrap"
        marginBottom={20}
      >
        <div>
          <Typography as="h1" variant="h2" fontWeight={600} marginBottom={4}>
            {app.job_title}
          </Typography>
          <Typography variant="body-sm" color="var(--muted-foreground, #6b7280)" marginBottom={4}>
            {app.company_name}
          </Typography>
          {app.job_url && (
            <a href={app.job_url} target="_blank" rel="noopener noreferrer" className="detail__url">
              {t('jobUrlLink')} ↗
            </a>
          )}
        </div>
        <Box display="flex" alignItems="center" gap={10} flexWrap="wrap">
          <Badge
            variant="subtle"
            color={STATUS_COLORS[app.status]}
            style={{ textTransform: 'uppercase', letterSpacing: '0.04em' }}
            size='lg'
          >
            {t(`statuses.${app.status}`)}
          </Badge>
          {!editing && (
            <>
              <Button text={t('edit')} type="button" size="md" onClick={openEdit} />
              <Button
                text={deleting ? t('deleting') : t('delete')}
                type="button"
                size="md"
                kind="error"
                disabled={deleting}
                onClick={() => setConfirmDelete(true)}
              />
            </>
          )}
        </Box>
      </Box>

      {/* ── Edit form ─────────────────────────────────────────────────── */}
      {editing && (
        <div className="detail__section">
          <form onSubmit={handleSave}>
            <Box display="flex" flexDirection="column" gap={14}>
              <Typography as="h2" variant="h3" fontWeight={600}>
                {t('editTitle')}
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
                <Typography variant="body" color="var(--muted-foreground, #6b7280)" marginBottom={6}>
                  {t('statusLabel')}
                </Typography>
                <select
                  className="detail__select"
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
              {saveError && (
                <Typography variant="caption" color="var(--error, #ef4444)">
                  {saveError}
                </Typography>
              )}
              <Box display="flex" gap={8} justifyContent="flex-end">
                <Button
                  text={t('cancel')}
                  type="button"
                  size="md"
                  onClick={() => setEditing(false)}
                />
                <Button
                  text={saving ? t('saving') : t('save')}
                  type="submit"
                  size="md"
                  kind="success"
                  disabled={saving || !companyName.trim() || !jobTitle.trim() || !jobDescription.trim()}
                />
              </Box>
            </Box>
          </form>
        </div>
      )}

      {/* ── Job description (read-only) ───────────────────────────────── */}
      {!editing && (
        <div className="detail__section">
          <Typography variant="body" color="var(--muted-foreground, #6b7280)" marginBottom={6} as="p">
            {t('jdLabel')}
          </Typography>
          <div className="detail__jd">{app.job_description}</div>
          {app.job_url && (
            <Typography variant="body" color="var(--muted-foreground, #6b7280)" as="p" styles={{ marginTop: '12px', marginBottom: '4px' }}>
              {t('jobUrlLabel')}
            </Typography>
          )}
          {app.job_url && (
            <a href={app.job_url} target="_blank" rel="noopener noreferrer" className="detail__url">
              {app.job_url} ↗
            </a>
          )}
          {app.notes && (
            <Typography variant="body" color="var(--muted-foreground, #6b7280)" as="p" styles={{ marginTop: '12px', marginBottom: '6px' }}>
              {t('notesLabel')}
            </Typography>
          )}
          {app.notes && (
            <Typography as="p" variant="body-sm" styles={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
              {app.notes}
            </Typography>
          )}
        </div>
      )}

      {/* ── Tailor resume ─────────────────────────────────────────────── */}
      <div className="detail__section">
        <Typography as="h2" variant="h3" fontWeight={600} marginBottom={12}>
          {t('tailorTitle')}
        </Typography>
        <Box display="flex" alignItems="center" gap={10} flexWrap="wrap" marginBottom={10}>
          <Button
            text={tailoring ? t('tailoring') : tailoredBullets ? t('tailorAgain') : t('tailor')}
            type="button"
            size="md"
            kind="success"
            disabled={tailoring}
            onClick={handleTailor}
          />
          {tailoring && <ProgressBar label={t('tailoring')} />}
        </Box>
        {tailorError && (
          <Typography variant="body" color="var(--error, #ef4444)">
            {tailorError}
          </Typography>
        )}
        {tailoredBullets && tailoredBullets.length > 0 && (
          <Box display="flex" flexDirection="column" gap={8}>
            <Typography variant="body" color="var(--muted-foreground, #6b7280)">
              {t('tailoredSubtitle')}
            </Typography>
            {grouped.map(({ cat, bullets }) => (
              <Box key={cat} display="flex" flexDirection="column" gap={6}>
                <Typography variant="body" fontWeight={600} color="var(--foreground)" styles={{ textTransform: 'capitalize' }}>
                  {t(`categories.${cat}`)}
                </Typography>
                {bullets.map((b) => (
                  <Typography key={b.id} as="p" variant="body" styles={{ lineHeight: 1.6, wordBreak: 'break-word' }}>
                    – {b.tailored_text}
                  </Typography>
                ))}
              </Box>
            ))}
          </Box>
        )}
      </div>

      {/* ── Cover letter ──────────────────────────────────────────────── */}
      {tailoredBullets && tailoredBullets.length > 0 && (
        <div className="detail__section">
          <Typography as="h2" variant="h3" fontWeight={600} marginBottom={12}>
            {t('coverLetterTitle')}
          </Typography>
          <Box display="flex" alignItems="center" gap={10} flexWrap="wrap" marginBottom={10}>
            <Button
              text={generatingCL ? t('generatingCL') : coverLetter ? t('regenerateCL') : t('generateCL')}
              type="button"
              size="md"
              disabled={generatingCL}
              onClick={handleGenerateCL}
              kind='success'
            />
            {generatingCL && <ProgressBar label={t('generatingCL')} />}
          </Box>
          {clError && (
            <Typography variant="caption" color="var(--error, #ef4444)">
              {clError}
            </Typography>
          )}
          {coverLetter && (
            <Box display="flex" flexDirection="column" gap={8}>
              <Box display="flex" justifyContent="flex-end">
                <Button
                  text={copied ? t('copied') : t('copy')}
                  type="button"
                  size="md"
                  kind={copied ? 'success' : undefined}
                  onClick={handleCopy}
                />
              </Box>
              <TextInput
                multirow
                className="detail__cover-letter"
                value={coverLetter}
                onChange={setCoverLetter}
                rows={16}
                width="100%"
                aria-label={t('coverLetterTitle')}
              />
            </Box>
          )}
        </div>
      )}

      {/* ── Export ────────────────────────────────────────────────────── */}
      {tailoredBullets && tailoredBullets.length > 0 && (
        <div className="detail__section">
          <Typography as="h2" variant="h3" fontWeight={600} marginBottom={4}>
            {t('exportTitle')}
          </Typography>
          <Typography variant="body" color="var(--muted-foreground, #6b7280)" marginBottom={14} as="p">
            {t('exportSubtitle')}
          </Typography>
          <Box display="flex" gap={10} flexWrap="wrap">
            <Button
              text={exportingPDF ? t('exportingPDF') : t('exportPDF')}
              type="button"
              size="md"
              kind="success"
              disabled={exportingPDF}
              onClick={handleExportPDF}
            />
            <Button
              text={t('exportMarkdown')}
              type="button"
              size="md"
              onClick={handleExportMarkdown}
            />
          </Box>
          {exportError && (
            <Typography variant="caption" color="var(--error, #ef4444)" marginTop={8} as="p">
              {exportError}
            </Typography>
          )}
        </div>
      )}

      {toast && (
        <Toast key={toastKey} message={toast.text} variant={toast.kind} position="top-center" />
      )}
    </Container>
  );
}
