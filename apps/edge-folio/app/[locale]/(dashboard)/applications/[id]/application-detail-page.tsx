'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { Container } from '@repo/ui/core-elements/container';
import { Box } from '@repo/ui/core-elements/box';
import { Button } from '@repo/ui/core-elements/button';
import { Typography } from '@repo/ui/core-elements/typography';
import { ProgressBar } from '@repo/ui/core-elements/progress-bar';
import { Spinner } from '@repo/ui/core-elements/spinner';
import { ConfirmationModal } from '@repo/ui/core-elements/confirmation-modal';
import { Badge } from '@repo/ui/core-elements/badge';
import { TextInput } from '@repo/ui/core-elements/text-input';
import { Select } from '@repo/ui/core-elements/select';
import { Switch } from '@repo/ui/core-elements/switch';
import { Toast } from '@repo/ui/core-elements/toast';
import Image from 'next/image';
import {
  updateApplication,
  deleteApplication,
  tailorApplication,
  generateCoverLetter,
  generateNaftaLetter,
  refreshMetrics,
  searchCompany,
  ApplicationError,
  type JobApplication,
  type ApplicationStatus,
  type TailoredBullet,
  type NaftaLetterPayload,
} from '@/lib/applications';
import type { UserProfile } from '@/lib/auth';
import { buildResumeMarkdown, downloadMarkdown } from '@/lib/resume-markdown';
import { getSkills, type Skill } from '@/lib/matrix';
import {
  getWorkExperiences,
  getEducations,
  getLanguages,
  getProjects,
  type WorkExperience,
  type Education,
  type Language,
  type Project,
} from '@/lib/career';
import './application-detail-page.css';

const STATUSES: ApplicationStatus[] = ['draft', 'applied', 'interview', 'offer', 'rejected'];

const TN_PROFESSIONS = [
  // General Professions
  'Accountant',
  'Architect',
  'Computer Systems Analyst',
  'Disaster Relief Insurance Claims Adjuster',
  'Economist',
  'Engineer — Aerospace',
  'Engineer — Agricultural',
  'Engineer — Biomedical',
  'Engineer — Chemical',
  'Engineer — Civil',
  'Engineer — Computer',
  'Engineer — Electrical',
  'Engineer — Electronic',
  'Engineer — Environmental',
  'Engineer — Industrial',
  'Engineer — Mechanical',
  'Engineer — Nuclear',
  'Engineer — Petroleum',
  'Engineer — Software',
  'Engineer — Structural',
  'Forester / Sylviculturist',
  'Graphic Designer',
  'Hotel Manager',
  'Industrial Designer',
  'Interior Designer',
  'Land Surveyor',
  'Landscape Architect',
  'Lawyer / Attorney',
  'Librarian',
  'Management Consultant',
  'Mathematician',
  'Research Assistant (Post-Secondary)',
  'Scientific Technician / Technologist',
  'Social Worker',
  'Statistician',
  'Technical Publications Writer',
  'Urban Planner / Geographer',
  'Vocational Counselor',
  // Medical / Health Care
  'Dentist',
  'Dietitian',
  'Medical Laboratory Technologist',
  'Nutritionist',
  'Occupational Therapist',
  'Pharmacist',
  'Physical Therapist / Physiotherapist',
  'Physician (Teaching or Research Only)',
  'Psychologist',
  'Recreational Therapist',
  'Registered Nurse',
  'Veterinarian',
  // Scientists
  'Agriculturist / Agronomist',
  'Animal Breeder',
  'Animal Scientist',
  'Apiculturist',
  'Astronomer',
  'Biochemist / Biophysicist',
  'Biologist',
  'Chemist',
  'Dairy Scientist',
  'Entomologist',
  'Epidemiologist',
  'Geneticist',
  'Geochemist',
  'Geologist',
  'Geophysicist',
  'Horticulturist',
  'Meteorologist',
  'Pharmacologist',
  'Physicist',
  'Plant Breeder',
  'Poultry Scientist',
  'Range Manager / Conservationist',
  'Soil Scientist',
  'Zoologist / Wildlife Biologist',
  // Teachers
  'College Teacher',
  'Seminary Teacher',
  'University Teacher',
].map((p) => ({ value: p, label: p }));

const CITIZENSHIP_OPTIONS = [
  { value: 'Canadian', label: 'Canadian' },
  { value: 'Mexican', label: 'Mexican' },
];

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

interface ExportData {
  skills: Pick<Skill, 'name' | 'proficiency'>[];
  workExps: WorkExperience[];
  educations: Education[];
  languages: Language[];
  projects: Project[];
}

function MetricBar({
  label,
  value,
  explainAriaLabel,
  onExplain,
}: {
  label: string;
  value: number;
  explainAriaLabel: string;
  onExplain?: () => void;
}) {
  const color = value >= 70 ? '#22c55e' : value >= 45 ? '#f59e0b' : '#ef4444';
  return (
    <Box display="flex" flexDirection="column" gap={4}>
      <Box display="flex" justifyContent="space-between" alignItems="center">
        <Box display="flex" alignItems="center" gap={6}>
          <Typography variant="caption" color="var(--muted-foreground, #6b7280)">
            {label}
          </Typography>
          {onExplain && (
            <Button
              unstyled
              type="button"
              onClick={onExplain}
              aria-label={explainAriaLabel}
              className="detail__metric-explain-btn"
            >
              ?
            </Button>
          )}
        </Box>
        <Typography variant="caption" fontWeight={600} color={color}>
          {value}%
        </Typography>
      </Box>
      <ProgressBar value={value} size={6} label={label} />
    </Box>
  );
}

function SwitchRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <Box display="flex" alignItems="center" justifyContent="space-between" gap={12}>
      <Typography variant="body">{label}</Typography>
      <Switch checked={checked} onChange={onChange} aria-label={label} />
    </Box>
  );
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

  // NAFTA letter
  const [generatingNafta, setGeneratingNafta] = useState(false);
  const [naftaLetter, setNaftaLetter] = useState<string | null>(initialApp.nafta_letter || null);
  const [naftaError, setNaftaError] = useState<string | null>(null);
  const [exportingNaftaPDF, setExportingNaftaPDF] = useState(false);
  const [naftaPDFError, setNaftaPDFError] = useState<string | null>(null);

  // NAFTA letter parameters
  const [naftaTnProfession, setNaftaTnProfession] = useState('');
  const [naftaIsContinuation, setNaftaIsContinuation] = useState(false);
  const [naftaCitizenship, setNaftaCitizenship] = useState('');
  const [naftaDob, setNaftaDob] = useState('');
  const [naftaPassport, setNaftaPassport] = useState('');
  const [naftaHoursPerWeek, setNaftaHoursPerWeek] = useState('40');
  const [naftaDuration, setNaftaDuration] = useState('3 years');
  const [naftaCompanyDescription, setNaftaCompanyDescription] = useState(initialApp.company_description ?? '');

  // Export section data (lazily loaded when section first appears)
  const exportDataFetchRef = useRef(false);
  const [exportData, setExportData] = useState<ExportData | null>(null);
  const [exportDataLoading, setExportDataLoading] = useState(false);

  // Export customization switches
  const [includeContact, setIncludeContact] = useState(true);
  const [includeLinks, setIncludeLinks] = useState(true);
  const [includeSkills, setIncludeSkills] = useState(true);
  const [includedWorkExpIds, setIncludedWorkExpIds] = useState<Set<number>>(new Set());
  const [includedEducationIds, setIncludedEducationIds] = useState<Set<number>>(new Set());
  const [includedLanguageIds, setIncludedLanguageIds] = useState<Set<number>>(new Set());
  const [includedProjectIds, setIncludedProjectIds] = useState<Set<number>>(new Set());

  // Export
  const [exportingPDF, setExportingPDF] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  // Refresh metrics
  const [refreshingMetrics, setRefreshingMetrics] = useState(false);

  // Search company
  const [searchingCompany, setSearchingCompany] = useState(false);

  // Delete
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [toast, setToast] = useState<{ text: string; kind: 'success' | 'error' } | null>(null);
  const [toastKey, setToastKey] = useState(0);

  // Metric explanation modal
  const [explainModal, setExplainModal] = useState<{ title: string; text: string } | null>(null);

  // Load export section data lazily when tailored bullets are first available
  useEffect(() => {
    if (!tailoredBullets || tailoredBullets.length === 0 || exportDataFetchRef.current) return;
    exportDataFetchRef.current = true;
    setExportDataLoading(true);
    Promise.allSettled([
      getSkills(),
      getWorkExperiences(),
      getEducations(),
      getLanguages(),
      getProjects(),
    ]).then(([skillsRes, workExpsRes, educationsRes, languagesRes, projectsRes]) => {
      const skills = skillsRes.status === 'fulfilled' ? skillsRes.value.results : [];
      const workExps = workExpsRes.status === 'fulfilled' ? workExpsRes.value.results : [];
      const educations = educationsRes.status === 'fulfilled' ? educationsRes.value.results : [];
      const languages = languagesRes.status === 'fulfilled' ? languagesRes.value.results : [];
      const projects = projectsRes.status === 'fulfilled' ? projectsRes.value.results : [];
      setExportData({ skills, workExps, educations, languages, projects });
      setIncludedWorkExpIds(new Set(workExps.map((e) => e.id)));
      setIncludedEducationIds(new Set(educations.map((e) => e.id)));
      setIncludedLanguageIds(new Set(languages.map((l) => l.id)));
      setIncludedProjectIds(new Set(projects.map((p) => p.id)));
      setExportDataLoading(false);
    });
  }, [tailoredBullets]);

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

  async function handleRefreshMetrics() {
    setRefreshingMetrics(true);
    try {
      const result = await refreshMetrics(app.id);
      setApp((prev) => ({
        ...prev,
        overall_match: result.overall_match,
        overall_match_explanation: result.overall_match_explanation,
        technical_match: result.technical_match,
        technical_match_explanation: result.technical_match_explanation,
        nafta_tn_likelihood: result.nafta_tn_likelihood,
        nafta_tn_likelihood_explanation: result.nafta_tn_likelihood_explanation,
      }));
      showToast(t('refreshMetrics'), 'success');
    } catch {
      showToast(t('errorRefreshMetrics'), 'error');
    } finally {
      setRefreshingMetrics(false);
    }
  }

  async function handleSearchCompany() {
    setSearchingCompany(true);
    try {
      const result = await searchCompany(app.id);
      if (result.company_description) {
        setNaftaCompanyDescription(result.company_description);
      }
      if (result.company_image_url) {
        setApp((prev) => ({ ...prev, company_image_url: result.company_image_url }));
      }
      showToast(t('companyInfoFound'), 'success');
    } catch {
      showToast(t('errorSearchCompany'), 'error');
    } finally {
      setSearchingCompany(false);
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

  async function handleGenerateNafta() {
    setGeneratingNafta(true);
    setNaftaError(null);
    const payload: NaftaLetterPayload = {
      tn_profession: naftaTnProfession || undefined,
      is_continuation: naftaIsContinuation,
      citizenship: naftaCitizenship || undefined,
      date_of_birth: naftaDob || undefined,
      passport_number: naftaPassport || undefined,
      hours_per_week: naftaHoursPerWeek ? Number(naftaHoursPerWeek) : 40,
      duration: naftaDuration || '3 years',
      company_description: naftaCompanyDescription || undefined,
    };
    try {
      const result = await generateNaftaLetter(app.id, payload);
      setNaftaLetter(result.nafta_letter);
    } catch {
      setNaftaError(t('errorNaftaLetter'));
    } finally {
      setGeneratingNafta(false);
    }
  }

  async function handleDownloadNaftaPDF() {
    if (!naftaLetter) return;
    setExportingNaftaPDF(true);
    setNaftaPDFError(null);
    try {
      const { pdf } = await import('@react-pdf/renderer');
      const { NaftaLetterDocument } = await import('@/lib/resume-pdf');
      const blob = await pdf(
        <NaftaLetterDocument
          companyName={app.company_name}
          letterText={naftaLetter}
        />,
      ).toBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${app.company_name}-${app.job_title}-tn-nafta-letter.pdf`
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '-')
        .replace(/-+/g, '-');
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setNaftaPDFError(t('errorNaftaPDF'));
    } finally {
      setExportingNaftaPDF(false);
    }
  }

  function getFilteredExportData() {
    if (!exportData) return null;
    return {
      skills: includeSkills ? exportData.skills : [],
      workExps: exportData.workExps.filter((e) => includedWorkExpIds.has(e.id)),
      educations: exportData.educations.filter((e) => includedEducationIds.has(e.id)),
      languages: exportData.languages.filter((l) => includedLanguageIds.has(l.id)),
      projects: exportData.projects.filter((p) => includedProjectIds.has(p.id)),
    };
  }

  async function handleExportPDF() {
    if (!tailoredBullets || !exportData) return;
    setExportingPDF(true);
    setExportError(null);
    try {
      const { pdf } = await import('@react-pdf/renderer');
      const { ResumeDocument } = await import('@/lib/resume-pdf');
      const fullName = profile
        ? [profile.first_name, profile.last_name].filter(Boolean).join(' ') || profile.email
        : 'Candidate';

      const filtered = getFilteredExportData()!;

      const blob = await pdf(
        <ResumeDocument
          fullName={fullName}
          email={includeContact ? (profile?.email ?? '') : ''}
          jobTitle={profile?.job_title ?? ''}
          phone={includeContact ? (profile?.phone ?? '') : ''}
          location={includeContact ? (profile?.location ?? '') : ''}
          githubUrl={includeLinks ? (profile?.github_url ?? '') : ''}
          linkedinUrl={includeLinks ? (profile?.linkedin_url ?? '') : ''}
          summary={profile?.summary ?? ''}
          skills={filtered.skills}
          workExperiences={filtered.workExps}
          targetRole={app.job_title}
          targetCompany={app.company_name}
          tailoredBullets={tailoredBullets}
          projects={filtered.projects}
          educations={filtered.educations}
          languages={filtered.languages}
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
    if (!tailoredBullets || !exportData) return;
    const fullName = profile
      ? [profile.first_name, profile.last_name].filter(Boolean).join(' ') || profile.email
      : 'Candidate';

    const filtered = getFilteredExportData()!;

    const md = buildResumeMarkdown({
      fullName,
      email: includeContact ? (profile?.email ?? '') : '',
      jobTitle: profile?.job_title ?? '',
      phone: includeContact ? profile?.phone : undefined,
      location: includeContact ? profile?.location : undefined,
      githubUrl: includeLinks ? profile?.github_url : undefined,
      linkedinUrl: includeLinks ? profile?.linkedin_url : undefined,
      targetRole: app.job_title,
      targetCompany: app.company_name,
      tailoredBullets,
      coverLetter: coverLetter ?? undefined,
      skills: filtered.skills.length > 0 ? filtered.skills : undefined,
      workExperiences: filtered.workExps,
      educations: filtered.educations,
      languages: filtered.languages,
      projects: filtered.projects,
    });
    const filename = `${app.company_name}-${app.job_title}`
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-') + '.md';
    downloadMarkdown(md, filename);
  }

  const grouped = tailoredBullets ? groupByCategory(tailoredBullets) : [];
  const statusOptions = STATUSES.map((s) => ({ value: s, label: t(`statuses.${s}`) }));

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
        <Box display="flex" alignItems="flex-start" gap={14}>
          {app.company_image_url && (
            <Box styles={{ position: 'relative', width: 48, height: 48, flexShrink: 0, borderRadius: 8, overflow: 'hidden' }}>
              <Image
                src={app.company_image_url}
                alt={app.company_name}
                fill
                sizes="48px"
                style={{ objectFit: 'cover' }}
              />
            </Box>
          )}
          <Box>
            <Typography as="h1" variant="h2" fontWeight={600} marginBottom={4}>
              {app.job_title}
            </Typography>
            <Typography variant="body" color="var(--muted-foreground, #6b7280)" marginBottom={4}>
              {app.company_name}
            </Typography>
            {app.job_url && (
              <a href={app.job_url} target="_blank" rel="noopener noreferrer" className="detail__url">
                {t('jobUrlLink')} ↗
              </a>
            )}
          </Box>
        </Box>
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
              <Button
                text={refreshingMetrics ? t('refreshingMetrics') : t('refreshMetrics')}
                type="button"
                size="md"
                disabled={refreshingMetrics}
                onClick={handleRefreshMetrics}
              />
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
        <Box marginBottom={28}>
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
              <Select
                label={t('statusLabel')}
                value={selectedStatus}
                onChange={(v) => setSelectedStatus(v as ApplicationStatus)}
                options={statusOptions}
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
        </Box>
      )}

      {/* ── Match metrics ────────────────────────────────────────────── */}
      {!editing && (app.overall_match != null || app.technical_match != null || app.nafta_tn_likelihood != null) && (
        <Box display="flex" flexDirection="column" gap={10} marginBottom={24}>
          {app.overall_match != null && (
            <MetricBar
              label={t('overallMatch')}
              value={app.overall_match}
              explainAriaLabel={t('metricExplain')}
              onExplain={app.overall_match_explanation ? () => setExplainModal({ title: t('overallMatch'), text: app.overall_match_explanation }) : undefined}
            />
          )}
          {app.technical_match != null && (
            <MetricBar
              label={t('technicalMatch')}
              value={app.technical_match}
              explainAriaLabel={t('metricExplain')}
              onExplain={app.technical_match_explanation ? () => setExplainModal({ title: t('technicalMatch'), text: app.technical_match_explanation }) : undefined}
            />
          )}
          {app.nafta_tn_likelihood != null && (
            <MetricBar
              label={t('naftaLikelihood')}
              value={app.nafta_tn_likelihood}
              explainAriaLabel={t('metricExplain')}
              onExplain={app.nafta_tn_likelihood_explanation ? () => setExplainModal({ title: t('naftaLikelihood'), text: app.nafta_tn_likelihood_explanation }) : undefined}
            />
          )}
        </Box>
      )}

      {explainModal && (
        <ConfirmationModal
          title={explainModal.title}
          text={explainModal.text}
          okCallback={() => setExplainModal(null)}
        />
      )}

      {/* ── Job description (read-only) ───────────────────────────────── */}
      {!editing && (
        <Box marginBottom={28}>
          <Typography variant="body" color="var(--muted-foreground, #6b7280)" marginBottom={6} as="p">
            {t('jdLabel')}
          </Typography>
          <Typography as="p" variant="body" styles={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: 1.6 }}>{app.job_description}</Typography>
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
            <Typography as="p" variant="body" styles={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
              {app.notes}
            </Typography>
          )}
        </Box>
      )}

      {/* ── Tailor resume ─────────────────────────────────────────────── */}
      <Box marginBottom={28}>
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
      </Box>

      {/* ── Cover letter ──────────────────────────────────────────────── */}
      {tailoredBullets && tailoredBullets.length > 0 && (
        <Box marginBottom={28}>
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
        </Box>
      )}

      {/* ── Export ────────────────────────────────────────────────────── */}
      {tailoredBullets && tailoredBullets.length > 0 && (
        <Box marginBottom={28}>
          <Typography as="h2" variant="h3" fontWeight={600} marginBottom={4}>
            {t('exportTitle')}
          </Typography>
          <Typography variant="body" color="var(--muted-foreground, #6b7280)" marginBottom={14} as="p">
            {t('exportSubtitle')}
          </Typography>

          {/* ── Customization ── */}
          <Typography as="h3" variant="body" fontWeight={600} marginBottom={10}>
            {t('exportCustomizeTitle')}
          </Typography>

          {exportDataLoading && (
            <Box display="flex" alignItems="center" gap={8} marginBottom={14}>
              <Spinner size={16} />
              <Typography variant="body" color="var(--muted-foreground, #6b7280)">
                {t('exportLoadingData')}
              </Typography>
            </Box>
          )}

          {exportData && (
            <Box display="flex" flexDirection="column" gap={16} marginBottom={20}>
              {/* Global toggles */}
              <Box display="flex" flexDirection="column" gap={10}>
                <SwitchRow label={t('exportIncludeContact')} checked={includeContact} onChange={setIncludeContact} />
                <SwitchRow label={t('exportIncludeLinks')} checked={includeLinks} onChange={setIncludeLinks} />
                <SwitchRow label={t('exportIncludeSkills')} checked={includeSkills} onChange={setIncludeSkills} />
              </Box>

              {/* Work experience */}
              {exportData.workExps.length > 0 && (
                <Box display="flex" flexDirection="column" gap={8}>
                  <Typography variant="body" fontWeight={600}>
                    {t('exportJobsTitle')}
                  </Typography>
                  {exportData.workExps.map((exp) => (
                    <SwitchRow
                      key={exp.id}
                      label={`${exp.title} — ${exp.company}`}
                      checked={includedWorkExpIds.has(exp.id)}
                      onChange={(checked) =>
                        setIncludedWorkExpIds((prev) => {
                          const next = new Set(prev);
                          if (checked) next.add(exp.id); else next.delete(exp.id);
                          return next;
                        })
                      }
                    />
                  ))}
                </Box>
              )}

              {/* Education */}
              {exportData.educations.length > 0 && (
                <Box display="flex" flexDirection="column" gap={8}>
                  <Typography variant="body" fontWeight={600}>
                    {t('exportEducationTitle')}
                  </Typography>
                  {exportData.educations.map((edu) => (
                    <SwitchRow
                      key={edu.id}
                      label={`${edu.institution}${edu.field_of_study ? ` · ${edu.field_of_study}` : ''}`}
                      checked={includedEducationIds.has(edu.id)}
                      onChange={(checked) =>
                        setIncludedEducationIds((prev) => {
                          const next = new Set(prev);
                          if (checked) next.add(edu.id); else next.delete(edu.id);
                          return next;
                        })
                      }
                    />
                  ))}
                </Box>
              )}

              {/* Languages */}
              {exportData.languages.length > 0 && (
                <Box display="flex" flexDirection="column" gap={8}>
                  <Typography variant="body" fontWeight={600}>
                    {t('exportLanguagesTitle')}
                  </Typography>
                  {exportData.languages.map((lang) => (
                    <SwitchRow
                      key={lang.id}
                      label={lang.name}
                      checked={includedLanguageIds.has(lang.id)}
                      onChange={(checked) =>
                        setIncludedLanguageIds((prev) => {
                          const next = new Set(prev);
                          if (checked) next.add(lang.id); else next.delete(lang.id);
                          return next;
                        })
                      }
                    />
                  ))}
                </Box>
              )}

              {/* Projects */}
              {exportData.projects.length > 0 && (
                <Box display="flex" flexDirection="column" gap={8}>
                  <Typography variant="body" fontWeight={600}>
                    {t('exportProjectsTitle')}
                  </Typography>
                  {exportData.projects.map((proj) => (
                    <SwitchRow
                      key={proj.id}
                      label={proj.name}
                      checked={includedProjectIds.has(proj.id)}
                      onChange={(checked) =>
                        setIncludedProjectIds((prev) => {
                          const next = new Set(prev);
                          if (checked) next.add(proj.id); else next.delete(proj.id);
                          return next;
                        })
                      }
                    />
                  ))}
                </Box>
              )}
            </Box>
          )}

          {/* ── Export buttons ── */}
          <Box display="flex" gap={10} flexWrap="wrap">
            <Button
              text={exportingPDF ? t('exportingPDF') : t('exportPDF')}
              type="button"
              size="md"
              kind="success"
              disabled={exportingPDF || exportDataLoading || !exportData}
              onClick={handleExportPDF}
            />
            <Button
              text={t('exportMarkdown')}
              type="button"
              size="md"
              disabled={exportDataLoading || !exportData}
              onClick={handleExportMarkdown}
            />
          </Box>
          {exportError && (
            <Typography variant="caption" color="var(--error, #ef4444)" marginTop={8} as="p">
              {exportError}
            </Typography>
          )}
        </Box>
      )}

      {/* ── NAFTA TN Visa Letter ──────────────────────────────────────── */}
      <Box marginBottom={28}>
        <Typography as="h2" variant="h3" fontWeight={600} marginBottom={4}>
          {t('naftaLetterTitle')}
        </Typography>
        <Typography variant="body" color="var(--muted-foreground, #6b7280)" marginBottom={16} as="p">
          {t('naftaLetterSubtitle')}
        </Typography>

        {/* ── NAFTA parameters ── */}
        <Box display="flex" flexDirection="column" gap={14} marginBottom={20}>
          <Box display="flex" gap={12} flexWrap="wrap">
            <Box flex={2} styles={{ minWidth: 220 }}>
              <Select
                label={t('naftaProfessionLabel')}
                value={naftaTnProfession}
                onChange={setNaftaTnProfession}
                options={[{ value: '', label: t('naftaProfessionPlaceholder') }, ...TN_PROFESSIONS]}
                width="100%"
              />
            </Box>
            <Box flex={1} styles={{ minWidth: 140 }}>
              <Select
                label={t('naftaCitizenshipLabel')}
                value={naftaCitizenship}
                onChange={setNaftaCitizenship}
                options={[{ value: '', label: t('naftaCitizenshipPlaceholder') }, ...CITIZENSHIP_OPTIONS]}
                width="100%"
              />
            </Box>
          </Box>

          <Box display="flex" gap={12} flexWrap="wrap">
            <Box flex={1} styles={{ minWidth: 160 }}>
              <TextInput
                label={t('naftaDobLabel')}
                value={naftaDob}
                onChange={setNaftaDob}
                placeholder="e.g. January 1, 1990"
                width="100%"
              />
            </Box>
            <Box flex={1} styles={{ minWidth: 160 }}>
              <TextInput
                label={t('naftaPassportLabel')}
                value={naftaPassport}
                onChange={setNaftaPassport}
                width="100%"
              />
            </Box>
          </Box>

          <Box display="flex" gap={12} flexWrap="wrap">
            <Box flex={1} styles={{ minWidth: 120 }}>
              <TextInput
                label={t('naftaHoursLabel')}
                value={naftaHoursPerWeek}
                onChange={setNaftaHoursPerWeek}
                type="number"
                width="100%"
              />
            </Box>
            <Box flex={1} styles={{ minWidth: 160 }}>
              <TextInput
                label={t('naftaDurationLabel')}
                value={naftaDuration}
                onChange={setNaftaDuration}
                placeholder="e.g. 3 years"
                width="100%"
              />
            </Box>
          </Box>

          <SwitchRow
            label={t('naftaContinuationLabel')}
            checked={naftaIsContinuation}
            onChange={setNaftaIsContinuation}
          />

          <Box>
            <Box display="flex" alignItems="center" justifyContent="space-between" gap={10} marginBottom={6} marginTop={8}>
              <Typography variant="body" color="var(--muted-foreground, #6b7280)" as="p">
                {t('naftaCompanyDescLabel')}
              </Typography>
              <Button
                text={searchingCompany ? t('searchingCompany') : t('searchCompany')}
                type="button"
                size="md"
                disabled={searchingCompany}
                onClick={handleSearchCompany}
                kind='success'
              />
            </Box>
            <TextInput
              multirow
              rows={10}
              value={naftaCompanyDescription}
              onChange={setNaftaCompanyDescription}
              placeholder={t('naftaCompanyDescPlaceholder')}
              width="100%"
              aria-label={t('naftaCompanyDescLabel')}
            />
          </Box>
        </Box>

        <Box display="flex" alignItems="center" gap={10} flexWrap="wrap" marginBottom={10}>
          <Button
            text={generatingNafta ? t('generatingNafta') : naftaLetter ? t('regenerateNafta') : t('generateNafta')}
            type="button"
            size="md"
            kind="success"
            disabled={generatingNafta}
            onClick={handleGenerateNafta}
          />
          {generatingNafta && <ProgressBar label={t('generatingNafta')} />}
        </Box>
        {naftaError && (
          <Typography variant="caption" color="var(--error, #ef4444)">
            {naftaError}
          </Typography>
        )}
        {naftaLetter && (
          <Box display="flex" flexDirection="column" gap={8}>
            <Typography variant="body" color="var(--muted-foreground, #6b7280)" as="p">
              {t('naftaEditHint')}
            </Typography>
            <TextInput
              multirow
              className="detail__cover-letter"
              value={naftaLetter}
              onChange={setNaftaLetter}
              rows={24}
              width="100%"
              aria-label={t('naftaLetterTitle')}
            />
            <Box display="flex" gap={8} alignItems="center" flexWrap="wrap">
              <Button
                text={exportingNaftaPDF ? t('downloadingNaftaPDF') : t('downloadNaftaPDF')}
                type="button"
                size="md"
                kind="success"
                disabled={exportingNaftaPDF}
                onClick={handleDownloadNaftaPDF}
              />
            </Box>
            {naftaPDFError && (
              <Typography variant="caption" color="var(--error, #ef4444)" as="p">
                {naftaPDFError}
              </Typography>
            )}
          </Box>
        )}
      </Box>

      {toast && (
        <Toast key={toastKey} message={toast.text} variant={toast.kind} position="top-center" />
      )}
    </Container>
  );
}
