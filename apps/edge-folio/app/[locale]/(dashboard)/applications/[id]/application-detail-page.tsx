'use client';

import { useState, useRef, useEffect, useId } from 'react';
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
  suggestTnCategory,
  getApplication,
  ApplicationError,
  type JobApplication,
  type ApplicationStatus,
  type TailoredBullet,
  type TailoredSkill,
  type TailoredWorkExperience,
  type TailoredProject,
  type NaftaLetterPayload,
  type TnCategorySuggestion,
  type WorkType,
  type SalaryCurrency,
  type CompanyIntel,
  type CompanyIntelItem,
  type CompanyAnalysis,
  type SignalLevel,
} from '@/lib/applications';
import type { UserProfile } from '@/lib/auth';
import { buildResumeMarkdown, downloadMarkdown } from '@/lib/resume-markdown';
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
import { TN_PROFESSIONS, CITIZENSHIP_OPTIONS } from '@/lib/nafta-constants';
import { Grid } from '@repo/ui/core-elements/grid';
import { Card } from '@repo/ui/core-elements/card';
import { SpeechButton } from '@repo/ui/core-elements/speech-button';
import { Swiper, SwiperSlide } from 'swiper/react';
import { Pagination } from 'swiper/modules';
import type { Swiper as SwiperType } from 'swiper';
import 'swiper/css';
import 'swiper/css/pagination';
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

interface ExportData {
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

function InfoField({ label, value }: { label: string; value: string }) {
  return (
    <Box display="flex" flexDirection="column" gap={4}>
      <Typography variant="caption" color="var(--muted-foreground, #6b7280)">
        {label}
      </Typography>
      <Typography variant="body" fontWeight={600}>
        {value}
      </Typography>
    </Box>
  );
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <Card gap={4}>
      <InfoField label={label} value={value} />
    </Card>
  );
}

function IntelItemCard({ item }: { item: CompanyIntelItem }) {
  return (
    <Box display="flex" flexDirection="column" gap={4}>
      <Typography variant="body" fontWeight={600} styles={{ lineHeight: 1.4 }}>
        {item.title}
      </Typography>
      <Typography as="p" variant="body-sm" styles={{ lineHeight: 1.6, wordBreak: 'break-word' }}>
        {item.summary}
      </Typography>
      <a href={item.url} target="_blank" rel="noopener noreferrer" className="detail__url">
        {item.source} ↗
      </a>
    </Box>
  );
}

function IntelSwiperCard({ title, items, loading }: { title: string; items: CompanyIntelItem[]; loading?: boolean }) {
  const t = useTranslations('ApplicationDetailPage');
  const swiperRef = useRef<SwiperType | null>(null);
  const id = useId();
  const pagClass = `detail__intel-pag-${id.replace(/:/g, '')}`;

  return (
    <Card padding={0} styles={{ overflow: 'hidden' }}>
      <Box paddingX={14} paddingTop={14} paddingBottom={10}>
        <Typography variant="body" fontWeight={600} color="var(--foreground)">
          {title}
        </Typography>
      </Box>
      {loading ? (
        <Box display="flex" alignItems="center" justifyContent="center" padding={24}>
          <Spinner size={16} />
        </Box>
      ) : (
        <>
          <Swiper
            className="detail__intel-swiper"
            modules={[Pagination]}
            slidesPerView={1}
            spaceBetween={0}
            loop={items.length > 1}
            onSwiper={(s) => { swiperRef.current = s; }}
            pagination={items.length > 1 ? { el: `.${pagClass}`, clickable: true } : undefined}
          >
            {items.map((item, i) => (
              <SwiperSlide key={i}>
                <Box paddingX={14} paddingBottom={14} display="flex" flexDirection="column" gap={4}>
                  <IntelItemCard item={item} />
                </Box>
              </SwiperSlide>
            ))}
          </Swiper>
          {items.length > 1 && (
            <div className="detail__intel-controls">
              <button
                type="button"
                className="detail__intel-nav-btn"
                aria-label={t('intelNavPrev')}
                onClick={() => swiperRef.current?.slidePrev()}
              >
                <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
                  <path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z" />
                </svg>
              </button>
              <div className={pagClass} data-intel-pagination />
              <button
                type="button"
                className="detail__intel-nav-btn"
                aria-label={t('intelNavNext')}
                onClick={() => swiperRef.current?.slideNext()}
              >
                <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
                  <path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z" />
                </svg>
              </button>
            </div>
          )}
        </>
      )}
    </Card>
  );
}

const SIGNAL_COLORS: Record<SignalLevel, string> = {
  positive: '#22c55e',
  mixed: '#f59e0b',
  concerning: '#ef4444',
};

const SIGNAL_KEYS: Array<{ key: keyof Omit<CompanyAnalysis, 'summary'>; tKey: string }> = [
  { key: 'job_security', tKey: 'signals.job_security' },
  { key: 'financial_health', tKey: 'signals.financial_health' },
  { key: 'leadership_stability', tKey: 'signals.leadership_stability' },
  { key: 'work_culture', tKey: 'signals.work_culture' },
  { key: 'growth_trajectory', tKey: 'signals.growth_trajectory' },
];

function CompanyAnalysisPanel({ analysis }: { analysis: CompanyAnalysis }) {
  const t = useTranslations('ApplicationDetailPage');
  return (
    <Box display="flex" flexDirection="column" gap={16}>
      <Box display="flex" flexDirection="column" gap={6}>
        <Typography variant="body" fontWeight={600} color="var(--foreground)">
          {t('companyAnalysisSummaryTitle')}
        </Typography>
        <Typography as="p" variant="body" styles={{ lineHeight: 1.6, wordBreak: 'break-word' }}>
          {analysis.summary}
        </Typography>
      </Box>
      <Box display="flex" flexDirection="column" gap={10}>
        <Typography variant="body" fontWeight={600} color="var(--foreground)">
          {t('companyAnalysisSignalsTitle')}
        </Typography>
        <Grid container spacing={2}>
          {SIGNAL_KEYS.map(({ key, tKey }) => {
            const signal = analysis[key];
            return (
              <Grid key={key} size={{ xs: 12, sm: 6 }}>
                <Card gap={8} padding={12}>
                  <Box display="flex" alignItems="center" gap={8}>
                    <span className={`detail__signal-dot detail__signal-dot--${signal.level}`} aria-hidden="true" />
                    <Typography variant="body" fontWeight={600} styles={{ flex: 1 }}>
                      {t(tKey)}
                    </Typography>
                    <Typography variant="caption" fontWeight={600} color={SIGNAL_COLORS[signal.level]}>
                      {t(`signalLevels.${signal.level}`)}
                    </Typography>
                  </Box>
                  <Typography variant="body-sm" color="var(--muted-foreground, #6b7280)" styles={{ lineHeight: 1.5 }}>
                    {signal.explanation}
                  </Typography>
                </Card>
              </Grid>
            );
          })}
        </Grid>
      </Box>
    </Box>
  );
}

function formatSalary(
  min: number | string | null | undefined,
  max: number | string | null | undefined,
  currency: string | null | undefined,
  notSpecifiedLabel: string,
): string {
  const hasMin = min != null && min !== '';
  const hasMax = max != null && max !== '';
  if (!hasMin && !hasMax) return notSpecifiedLabel;
  const curr = currency ? ` ${currency}` : '';
  const fmt = (v: number | string) => Number(v).toLocaleString();
  if (hasMin && hasMax) return `${fmt(min!)} – ${fmt(max!)}${curr}`;
  if (hasMin) return `${fmt(min!)}+${curr}`;
  return `≤ ${fmt(max!)}${curr}`;
}

interface Props {
  application: JobApplication;
  profile: UserProfile | null;
  profilePictureBase64?: string;
}

export function ApplicationDetailPage({ application: initialApp, profile, profilePictureBase64 }: Props) {
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
  const [location, setLocation] = useState(app.location);
  const [salaryMin, setSalaryMin] = useState(app.salary_min ?? '');
  const [salaryMax, setSalaryMax] = useState(app.salary_max ?? '');
  const [salaryCurrency, setSalaryCurrency] = useState<SalaryCurrency | ''>(app.salary_currency ?? '');
  const [workType, setWorkType] = useState<WorkType[]>(app.work_type ?? []);
  const [usCitizenOrPr, setUsCitizenOrPr] = useState<'null' | 'true' | 'false'>(
    app.us_citizen_or_pr_required == null ? 'null' : app.us_citizen_or_pr_required ? 'true' : 'false',
  );
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Tailor
  const [tailoring, setTailoring] = useState(false);
  const [tailoredBullets, setTailoredBullets] = useState<TailoredBullet[] | null>(initialApp.tailored_bullets ?? null);
  const [tailoredWorkExperiences, setTailoredWorkExperiences] = useState<TailoredWorkExperience[] | null>(initialApp.tailored_work_experiences ?? null);
  const [tailoredProjects, setTailoredProjects] = useState<TailoredProject[] | null>(initialApp.tailored_projects ?? null);
  const [professionalSummary, setProfessionalSummary] = useState(initialApp.professional_summary || '');
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

  // Company info (populated by async pipeline, polled until complete)
  const [companyDescription, setCompanyDescription] = useState(initialApp.company?.description ?? '');
  const [companyIntel, setCompanyIntel] = useState<CompanyIntel | null>(initialApp.company?.intel ?? null);
  const [companyAnalysis, setCompanyAnalysis] = useState<CompanyAnalysis | null>(initialApp.company?.analysis ?? null);
  const companyPollingRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // NAFTA letter parameters
  const [naftaTnProfession, setNaftaTnProfession] = useState(profile?.tn_profession ?? '');
  const [naftaIsContinuation, setNaftaIsContinuation] = useState(false);
  const [naftaCitizenship, setNaftaCitizenship] = useState(profile?.citizenship ?? '');
  const [naftaDob, setNaftaDob] = useState('');
  const [naftaPassport, setNaftaPassport] = useState('');
  const [naftaHoursPerWeek, setNaftaHoursPerWeek] = useState('40');
  const [naftaDuration, setNaftaDuration] = useState('3 years');
  const [naftaCompanyDescription, setNaftaCompanyDescription] = useState('');

  // Export section data (lazily loaded when section first appears)
  const exportDataFetchRef = useRef(false);
  const [exportData, setExportData] = useState<ExportData | null>(null);
  const [exportDataLoading, setExportDataLoading] = useState(false);

  // Export customization switches
  const [includeContact, setIncludeContact] = useState(true);
  const [includeLinks, setIncludeLinks] = useState(true);
  const [includeSkills, setIncludeSkills] = useState(true);
  const [includePhoto, setIncludePhoto] = useState(false);
  const [includedWorkExpIds, setIncludedWorkExpIds] = useState<Set<number>>(new Set());
  const [includedEducationIds, setIncludedEducationIds] = useState<Set<number>>(new Set());
  const [includedLanguageIds, setIncludedLanguageIds] = useState<Set<number>>(new Set());
  const [includedProjectIds, setIncludedProjectIds] = useState<Set<number>>(new Set());
  const [useTailoredWeIds, setUseTailoredWeIds] = useState<Set<number>>(
    new Set((initialApp.tailored_work_experiences ?? []).map((e) => e.id)),
  );
  const [useTailoredProjectIds, setUseTailoredProjectIds] = useState<Set<number>>(
    new Set((initialApp.tailored_projects ?? []).map((p) => p.id)),
  );

  // Export
  const [exportingPDF, setExportingPDF] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  // Refresh metrics
  const [refreshingMetrics, setRefreshingMetrics] = useState(false);

  // Delete
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [toast, setToast] = useState<{ text: string; kind: 'success' | 'error' } | null>(null);
  const [toastKey, setToastKey] = useState(0);

  // Metric explanation modal
  const [explainModal, setExplainModal] = useState<{ title: string; text: string } | null>(null);

  // TN suggest
  const [tnSuggestModal, setTnSuggestModal] = useState(false);
  const [tnSuggestResults, setTnSuggestResults] = useState<TnCategorySuggestion[]>([]);
  const [tnSuggestLoading, setTnSuggestLoading] = useState(false);
  const [tnSuggestError, setTnSuggestError] = useState<string | null>(null);

  function stopCompanyPolling() {
    if (companyPollingRef.current) {
      clearTimeout(companyPollingRef.current);
      companyPollingRef.current = null;
    }
  }

  function startCompanyPolling(appId: number) {
    if (companyPollingRef.current) return;
    let errorCount = 0;

    const schedule = () => {
      companyPollingRef.current = setTimeout(async () => {
        try {
          const data = await getApplication(appId);
          const company = data.company;
          if (company?.description) setCompanyDescription(company.description);
          if (company?.intel) setCompanyIntel(company.intel);
          if (company?.analysis) setCompanyAnalysis(company.analysis);
          setApp(data);
          if (!company || company.status === 'complete' || company.status === 'failed') {
            companyPollingRef.current = null;
            return;
          }
          errorCount = 0;
        } catch {
          errorCount++;
          if (errorCount >= 3) {
            stopCompanyPolling();
            return;
          }
        }
        if (companyPollingRef.current !== null) schedule();
      }, 5000);
    };

    schedule();
  }

  // Start polling when company pipeline is in progress
  useEffect(() => {
    const status = initialApp.company?.status;
    if (status === 'pending' || status === 'processing') {
      startCompanyPolling(initialApp.id);
    }
    return () => stopCompanyPolling();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Load export section data lazily when tailored bullets are first available
  useEffect(() => {
    if (!tailoredBullets || tailoredBullets.length === 0 || exportDataFetchRef.current) return;
    exportDataFetchRef.current = true;
    setExportDataLoading(true);
    Promise.allSettled([
      getWorkExperiences(),
      getEducations(),
      getLanguages(),
      getProjects(),
    ]).then(([workExpsRes, educationsRes, languagesRes, projectsRes]) => {
      const workExps = workExpsRes.status === 'fulfilled' ? workExpsRes.value.results : [];
      const educations = educationsRes.status === 'fulfilled' ? educationsRes.value.results : [];
      const languages = languagesRes.status === 'fulfilled' ? languagesRes.value.results : [];
      const projects = projectsRes.status === 'fulfilled' ? projectsRes.value.results : [];
      setExportData({ workExps, educations, languages, projects });
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
    setLocation(app.location);
    setSalaryMin(app.salary_min ?? '');
    setSalaryMax(app.salary_max ?? '');
    setSalaryCurrency(app.salary_currency ?? '');
    setWorkType(app.work_type ?? []);
    setUsCitizenOrPr(app.us_citizen_or_pr_required == null ? 'null' : app.us_citizen_or_pr_required ? 'true' : 'false');
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
        location: location.trim(),
        salary_min: salaryMin ? parseFloat(salaryMin) : null,
        salary_max: salaryMax ? parseFloat(salaryMax) : null,
        salary_currency: salaryCurrency || '',
        work_type: workType.length ? workType : null,
        us_citizen_or_pr_required: usCitizenOrPr === 'null' ? null : usCitizenOrPr === 'true',
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

  async function handleTailor() {
    setTailoring(true);
    setTailorError(null);
    setCoverLetter(null);
    try {
      const result = await tailorApplication(app.id);
      setTailoredBullets(result.bullets);
      setTailoredWorkExperiences(result.tailored_work_experiences);
      setTailoredProjects(result.tailored_projects);
      setProfessionalSummary(result.professional_summary || '');
      setApp((prev) => ({ ...prev, tailored_skills: result.tailored_skills }));
      setUseTailoredWeIds(new Set((result.tailored_work_experiences ?? []).map((e) => e.id)));
      setUseTailoredProjectIds(new Set((result.tailored_projects ?? []).map((p) => p.id)));
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
    const combinedCompanyDesc = [app.company?.description ?? companyDescription, naftaCompanyDescription].filter(Boolean).join('\n\n');
    const payload: NaftaLetterPayload = {
      tn_profession: naftaTnProfession || undefined,
      is_continuation: naftaIsContinuation,
      citizenship: naftaCitizenship || undefined,
      date_of_birth: naftaDob || undefined,
      passport_number: naftaPassport || undefined,
      hours_per_week: naftaHoursPerWeek ? Number(naftaHoursPerWeek) : 40,
      duration: naftaDuration || '3 years',
      company_description: combinedCompanyDesc || undefined,
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

  async function handleSuggestTnCategory() {
    setTnSuggestError(null);
    setTnSuggestLoading(true);
    try {
      const result = await suggestTnCategory();
      setTnSuggestResults(result.suggestions);
      setTnSuggestModal(true);
    } catch (err) {
      const is400 = err instanceof ApplicationError && err.status === 400;
      setTnSuggestError(t(is400 ? 'tnSuggestNoData' : 'tnSuggestError'));
    } finally {
      setTnSuggestLoading(false);
    }
  }

  function getFilteredExportData() {
    if (!exportData) return null;
    const tailoredWeMap = new Map((tailoredWorkExperiences ?? []).map((t) => [t.id, t.tailored_description]));
    const tailoredProjectMap = new Map((tailoredProjects ?? []).map((t) => [t.id, t.tailored_description]));
    return {
      skills: includeSkills ? (app.tailored_skills ?? []) : [],
      workExps: exportData.workExps
        .filter((e) => includedWorkExpIds.has(e.id))
        .map((e) => ({
          ...e,
          description: useTailoredWeIds.has(e.id) ? (tailoredWeMap.get(e.id) ?? e.description) : e.description,
        })),
      educations: exportData.educations.filter((e) => includedEducationIds.has(e.id)),
      languages: exportData.languages.filter((l) => includedLanguageIds.has(l.id)),
      projects: exportData.projects
        .filter((p) => includedProjectIds.has(p.id))
        .map((p) => ({
          ...p,
          description: useTailoredProjectIds.has(p.id) ? (tailoredProjectMap.get(p.id) ?? p.description) : p.description,
        })),
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

      const photoUrl = includePhoto ? profilePictureBase64 : undefined;

      const blob = await pdf(
        <ResumeDocument
          fullName={fullName}
          email={includeContact ? (profile?.email ?? '') : ''}
          jobTitle={profile?.job_title ?? ''}
          phone={includeContact ? (profile?.phone ?? '') : ''}
          location={includeContact ? (profile?.location ?? '') : ''}
          githubUrl={includeLinks ? (profile?.github_url ?? '') : ''}
          linkedinUrl={includeLinks ? (profile?.linkedin_url ?? '') : ''}
          photoUrl={photoUrl}
          summary={professionalSummary || (profile?.summary ?? '') || undefined}
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
      summary: professionalSummary || undefined,
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
          <Box styles={{ position: 'relative', width: 96, height: 96, flexShrink: 0 }}>
            {app.company?.image_url ? (
              <Box styles={{ position: 'relative', width: '100%', height: '100%', borderRadius: 8, overflow: 'hidden' }}>
                <Image
                  src={app.company.image_url}
                  alt={app.company_name}
                  fill
                  sizes="96px"
                  style={{ objectFit: 'cover' }}
                />
              </Box>
            ) : (
              <Box
                display="flex"
                alignItems="center"
                justifyContent="center"
                styles={{ width: '100%', height: '100%', borderRadius: 8, background: 'var(--surface-2)' }}
              >
                <Typography as="span" variant="h2" fontWeight={700} color="var(--muted-foreground, #6b7280)">
                  {app.company_name.charAt(0).toUpperCase()}
                </Typography>
              </Box>
            )}
            {app.company?.intel_score && (
              <Box
                styles={{
                  position: 'absolute',
                  top: -4,
                  right: -4,
                  width: 14,
                  height: 14,
                  borderRadius: '50%',
                  background: SIGNAL_COLORS[app.company.intel_score as SignalLevel],
                  border: '2px solid var(--background)',
                }}
              />
            )}
          </Box>
          <Box>
            <Badge
              variant="subtle"
              color={STATUS_COLORS[app.status]}
              style={{ textTransform: 'uppercase', letterSpacing: '0.04em' }}
              size='lg'
            >
              {t(`statuses.${app.status}`)}
            </Badge>
            <Typography as="h1" variant="h2" fontWeight={600} marginBottom={4} marginTop={6}>
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
        <Box display="flex" alignItems="center" gap={10} flexWrap="wrap" className="detail__header-actions">
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
              <TextInput
                label={t('locationLabel')}
                value={location}
                onChange={setLocation}
                maxLength={200}
                width="100%"
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

      {/* ── Info & Match metrics ─────────────────────────────────────── */}
      {!editing && (
        <Box marginBottom={24}>
          <Grid container spacing={2}>
            {(app.overall_match != null || app.technical_match != null || app.nafta_tn_likelihood != null) && (
              <Grid size={{ xs: 12, sm: 6, lg: 4 }}>
                <Card gap={10}>
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
                </Card>
              </Grid>
            )}
            <Grid size={{ xs: 12, sm: 6, lg: 4 }}>
              <Card gap={10}>
                <InfoField
                  label={t('locationLabel')}
                  value={app.location || t('notSpecified')}
                />
                <InfoField
                  label={t('workTypeLabel')}
                  value={
                    app.work_type && app.work_type.length > 0
                      ? app.work_type.map((wt) => t(`workTypes.${wt}`)).join(', ')
                      : t('notSpecified')
                  }
                />
              </Card>
            </Grid>
            <Grid size={{ xs: 12, sm: 6, lg: 4 }}>
              <InfoCard
                label={t('salaryLabel')}
                value={formatSalary(app.salary_min, app.salary_max, app.salary_currency, t('notSpecified'))}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6, lg: 4 }}>
              <InfoCard
                label={t('usCitizenOrPrLabel')}
                value={t(
                  app.us_citizen_or_pr_required == null
                    ? 'usCitizenOrPr.null'
                    : app.us_citizen_or_pr_required
                      ? 'usCitizenOrPr.true'
                      : 'usCitizenOrPr.false',
                )}
              />
            </Grid>
          </Grid>
        </Box>
      )}

      {explainModal && (
        <ConfirmationModal
          title={explainModal.title}
          text={explainModal.text}
          okCallback={() => setExplainModal(null)}
        />
      )}

      {tnSuggestModal && (
        <ConfirmationModal
          title={t('tnSuggestModalTitle')}
          text={t('tnSuggestModalSubtitle')}
          okCallback={() => setTnSuggestModal(false)}
          panelMaxWidth="540px"
        >
          <Box display="flex" flexDirection="column" gap={16} marginTop={4}>
            {tnSuggestResults.length === 0 ? (
              <Typography variant="body-sm" color="var(--muted-foreground, #6b7280)">
                {t('tnSuggestNoMatches')}
              </Typography>
            ) : (
              tnSuggestResults.map((r) => {
                const color = r.likelihood >= 70 ? 'var(--success, #22c55e)' : r.likelihood >= 45 ? '#f59e0b' : 'var(--error, #ef4444)';
                return (
                  <Box key={r.category} display="flex" flexDirection="column" gap={6}>
                    <Box display="flex" justifyContent="space-between" alignItems="center">
                      <Typography variant="body" fontWeight={600}>{r.category}</Typography>
                      <Typography variant="caption" fontWeight={600} color={color}>
                        {r.likelihood}%
                      </Typography>
                    </Box>
                    <ProgressBar value={r.likelihood} size={6} label={r.category} />
                    <Typography variant="body-sm" color="var(--muted-foreground, #6b7280)" styles={{ lineHeight: 1.5 }}>
                      {r.explanation}
                    </Typography>
                  </Box>
                );
              })
            )}
          </Box>
        </ConfirmationModal>
      )}

      {/* ── Job description (read-only) ───────────────────────────────── */}
      {!editing && (
        <Box marginBottom={28} marginTop={40}>
          <Typography as="h2" variant="h3" fontWeight={600} marginBottom={8}>
            {t('jdLabel')}
          </Typography>
          <Box styles={{ borderBottom: '1px solid var(--border, #e5e7eb)' }} marginBottom={16} />
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

      {/* ── Company Information ──────────────────────────────────────── */}
      {!editing && (
        <Box marginBottom={28} marginTop={40}>
          <Typography as="h2" variant="h3" fontWeight={600} marginBottom={8}>
            {t('companyInfoTitle')}
          </Typography>
          <Box styles={{ borderBottom: '1px solid var(--border, #e5e7eb)' }} marginBottom={16} />

          {/* Gathering / failed states */}
          {(app.company?.status === 'pending' || app.company?.status === 'processing') && (
            <Box display="flex" alignItems="center" gap={8} marginBottom={14}>
              <Spinner size={16} label={t('gatheringCompanyData')} />
              <Typography variant="body-sm" color="var(--muted-foreground, #6b7280)">
                {t('gatheringCompanyData')}
              </Typography>
            </Box>
          )}
          {app.company?.status === 'failed' && !companyDescription && !companyIntel && (
            <Typography variant="body" color="var(--muted-foreground, #6b7280)">
              {t('companyDataUnavailable')}
            </Typography>
          )}
          {!app.company && (
            <Typography variant="body" color="var(--muted-foreground, #6b7280)">
              {t('companyInfoEmpty')}
            </Typography>
          )}

          {/* Progressive data rendering */}
          {(companyDescription || companyIntel || companyAnalysis) && (
            <Box display="flex" flexDirection="column" gap={24}>
              {companyDescription && (
                <Box display="flex" flexDirection="column" gap={8}>
                  <Typography variant="body" fontWeight={600} color="var(--foreground)">
                    {t('companyAboutTitle')}
                  </Typography>
                  <Typography as="p" variant="body" styles={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: 1.6 }}>
                    {companyDescription}
                  </Typography>
                </Box>
              )}
              {companyAnalysis && (
                <Box display="flex" flexDirection="column" gap={8}>
                  <Typography variant="body" fontWeight={600} color="var(--foreground)">
                    {t('companyAnalysisTitle')}
                  </Typography>
                  <CompanyAnalysisPanel analysis={companyAnalysis} />
                </Box>
              )}
              {companyIntel && (
                <Grid container spacing={2}>
                  {(companyIntel.company_news?.length ?? 0) > 0 && (
                    <Grid size={{ xs: 12, sm: 6 }}>
                      <IntelSwiperCard title={t('companyNewsTitle')} items={companyIntel.company_news} />
                    </Grid>
                  )}
                  {(companyIntel.hiring_news?.length ?? 0) > 0 && (
                    <Grid size={{ xs: 12, sm: 6 }}>
                      <IntelSwiperCard title={t('companyHiringTitle')} items={companyIntel.hiring_news} />
                    </Grid>
                  )}
                  {(companyIntel.layoff_news?.length ?? 0) > 0 && (
                    <Grid size={{ xs: 12, sm: 6 }}>
                      <IntelSwiperCard title={t('companyLayoffsTitle')} items={companyIntel.layoff_news} />
                    </Grid>
                  )}
                  {(companyIntel.reputation?.length ?? 0) > 0 && (
                    <Grid size={{ xs: 12, sm: 6 }}>
                      <IntelSwiperCard title={t('companyReputationTitle')} items={companyIntel.reputation} />
                    </Grid>
                  )}
                  {(companyIntel.funding_news?.length ?? 0) > 0 && (
                    <Grid size={{ xs: 12, sm: 6 }}>
                      <IntelSwiperCard title={t('companyFundingTitle')} items={companyIntel.funding_news} />
                    </Grid>
                  )}
                  {(companyIntel.leadership_news?.length ?? 0) > 0 && (
                    <Grid size={{ xs: 12, sm: 6 }}>
                      <IntelSwiperCard title={t('companyLeadershipTitle')} items={companyIntel.leadership_news} />
                    </Grid>
                  )}
                  {(companyIntel.acquisition_news?.length ?? 0) > 0 && (
                    <Grid size={{ xs: 12, sm: 6 }}>
                      <IntelSwiperCard title={t('companyAcquisitionsTitle')} items={companyIntel.acquisition_news} />
                    </Grid>
                  )}
                  {(companyIntel.engineering_culture?.length ?? 0) > 0 && (
                    <Grid size={{ xs: 12, sm: 6 }}>
                      <IntelSwiperCard title={t('companyEngineeringCultureTitle')} items={companyIntel.engineering_culture} />
                    </Grid>
                  )}
                </Grid>
              )}
            </Box>
          )}
        </Box>
      )}

      {/* ── Tailor resume ─────────────────────────────────────────────── */}
      <Box marginBottom={28} marginTop={48}>
        <Typography as="h2" variant="h3" fontWeight={600} marginBottom={8}>
          {t('tailorTitle')}
        </Typography>
        <Box styles={{ borderBottom: '1px solid var(--border, #e5e7eb)' }} marginBottom={16} />
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
          <Box display="flex" flexDirection="column" gap={16}>
            <Typography variant="body" color="var(--muted-foreground, #6b7280)">
              {t('tailoredSubtitle')}
            </Typography>
            {professionalSummary && (
              <Box display="flex" flexDirection="column" gap={6}>
                <Typography variant="body" fontWeight={600} color="var(--foreground)">
                  {t('professionalSummaryLabel')}
                </Typography>
                <Typography as="p" variant="body" styles={{ lineHeight: 1.7, wordBreak: 'break-word', fontStyle: 'italic' }}>
                  {professionalSummary}
                </Typography>
              </Box>
            )}
            {app.tailored_skills && app.tailored_skills.length > 0 && (
              <Box display="flex" flexDirection="column" gap={6}>
                <Typography variant="body" fontWeight={600} color="var(--foreground)">
                  {t('tailoredSkillsTitle')}
                </Typography>
                <Box display="flex" flexWrap="wrap" gap={8}>
                  {app.tailored_skills.map((skill) => (
                    <Typography
                      key={skill.id}
                      variant="body-sm"
                      styles={{ padding: '2px 10px', borderRadius: 999, border: '1px solid var(--border, #e5e7eb)' }}
                    >
                      {skill.name}
                    </Typography>
                  ))}
                </Box>
              </Box>
            )}

            {grouped.map(({ cat, bullets }) => (
              <Box key={cat} display="flex" flexDirection="column" gap={6}>
                <Typography variant="body" fontWeight={600} color="var(--foreground)" styles={{ textTransform: 'capitalize' }}>
                  {t(`categories.${cat}`)}
                </Typography>
                {bullets.map((b) => (
                  <Typography key={b.id} as="p" variant="body" styles={{ lineHeight: 1.6, wordBreak: 'break-word' }}>
                    - {b.tailored_text}
                  </Typography>
                ))}
              </Box>
            ))}

            {/* Tailored work experiences */}
            {tailoredWorkExperiences && tailoredWorkExperiences.length > 0 && (
              <Box display="flex" flexDirection="column" gap={6}>
                <Typography variant="body" fontWeight={600} color="var(--foreground)">
                  {t('tailoredWorkExpTitle')}
                </Typography>
                {tailoredWorkExperiences.map((twe) => {
                  const we = exportData?.workExps.find((e) => e.id === twe.id);
                  return (
                    <Box key={twe.id} display="flex" flexDirection="column" gap={4}>
                      {we && (
                        <Typography variant="body-sm" fontWeight={600} color="var(--muted-foreground, #6b7280)">
                          {we.title} — {we.company}
                        </Typography>
                      )}
                      <Typography as="p" variant="body" styles={{ lineHeight: 1.6, wordBreak: 'break-word' }}>
                        {twe.tailored_description}
                      </Typography>
                    </Box>
                  );
                })}
              </Box>
            )}

            {/* Tailored projects */}
            {tailoredProjects && tailoredProjects.length > 0 && (
              <Box display="flex" flexDirection="column" gap={6}>
                <Typography variant="body" fontWeight={600} color="var(--foreground)">
                  {t('tailoredProjectsTitle')}
                </Typography>
                {tailoredProjects.map((tp) => {
                  const proj = exportData?.projects.find((p) => p.id === tp.id);
                  return (
                    <Box key={tp.id} display="flex" flexDirection="column" gap={4}>
                      {proj && (
                        <Typography variant="body-sm" fontWeight={600} color="var(--muted-foreground, #6b7280)">
                          {proj.name}
                        </Typography>
                      )}
                      <Typography as="p" variant="body" styles={{ lineHeight: 1.6, wordBreak: 'break-word' }}>
                        {tp.tailored_description}
                      </Typography>
                    </Box>
                  );
                })}
              </Box>
            )}
          </Box>
        )}
      </Box>

      {/* ── Export ────────────────────────────────────────────────────── */}
      {tailoredBullets && tailoredBullets.length > 0 && (
        <Box marginBottom={28} marginTop={48}>
          <Typography as="h2" variant="h3" fontWeight={600} marginBottom={8}>
            {t('exportTitle')}
          </Typography>
          <Box styles={{ borderBottom: '1px solid var(--border, #e5e7eb)' }} marginBottom={12} />
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
                {profile?.profile_picture && (
                  <Box display="flex" flexDirection="column" gap={4}>
                    <SwitchRow label={t('exportIncludePhoto')} checked={includePhoto} onChange={setIncludePhoto} />
                    <Typography variant="caption" color="var(--muted-foreground, #6b7280)">
                      {t('exportIncludePhotoHint')}
                    </Typography>
                  </Box>
                )}
              </Box>

              {/* Work experience */}
              {exportData.workExps.length > 0 && (
                <Box display="flex" flexDirection="column" gap={8}>
                  <Typography variant="body" fontWeight={600}>
                    {t('exportJobsTitle')}
                  </Typography>
                  <Grid container spacing={2}>
                    {exportData.workExps.map((exp) => {
                      const isTailored = (tailoredWorkExperiences ?? []).some((tw) => tw.id === exp.id);
                      const isIncluded = includedWorkExpIds.has(exp.id);
                      return (
                        <Grid key={exp.id} size={{ xs: 12, sm: 6, lg: 4 }}>
                          <Card
                            gap={12}
                            styles={{ opacity: isIncluded ? 1 : 0.5, transition: 'opacity 0.2s ease', height: '100%' }}
                          >
                            <Box display="flex" flexDirection="column" gap={4}>
                              <Box display="flex" alignItems="flex-start" justifyContent="space-between" gap={8}>
                                <Typography variant="body" fontWeight={600} styles={{ lineHeight: 1.3 }}>
                                  {exp.title}
                                </Typography>
                                {isTailored && (
                                  <Badge variant="subtle" size="sm" color="var(--primary, #06b6d4)">
                                    {t('aiTailored')}
                                  </Badge>
                                )}
                              </Box>
                              <Typography variant="caption" color="var(--muted-foreground, #6b7280)">
                                {exp.company}
                              </Typography>
                            </Box>
                            <Box display="flex" flexDirection="column" gap={8}>
                              <SwitchRow
                                label={t('exportIncludeItem')}
                                checked={isIncluded}
                                onChange={(checked) =>
                                  setIncludedWorkExpIds((prev) => {
                                    const next = new Set(prev);
                                    if (checked) next.add(exp.id); else next.delete(exp.id);
                                    return next;
                                  })
                                }
                              />
                              {isTailored && isIncluded && (
                                <SwitchRow
                                  label={t('useTailoredVersion')}
                                  checked={useTailoredWeIds.has(exp.id)}
                                  onChange={(checked) =>
                                    setUseTailoredWeIds((prev) => {
                                      const next = new Set(prev);
                                      if (checked) next.add(exp.id); else next.delete(exp.id);
                                      return next;
                                    })
                                  }
                                />
                              )}
                            </Box>
                          </Card>
                        </Grid>
                      );
                    })}
                  </Grid>
                </Box>
              )}

              {/* Projects */}
              {exportData.projects.length > 0 && (
                <Box display="flex" flexDirection="column" gap={8}>
                  <Typography variant="body" fontWeight={600}>
                    {t('exportProjectsTitle')}
                  </Typography>
                  <Grid container spacing={2}>
                    {exportData.projects.map((proj) => {
                      const isTailored = (tailoredProjects ?? []).some((tp) => tp.id === proj.id);
                      const isIncluded = includedProjectIds.has(proj.id);
                      return (
                        <Grid key={proj.id} size={{ xs: 12, sm: 6, lg: 4 }}>
                          <Card
                            gap={12}
                            styles={{ opacity: isIncluded ? 1 : 0.5, transition: 'opacity 0.2s ease', height: '100%' }}
                          >
                            <Box display="flex" alignItems="flex-start" justifyContent="space-between" gap={8}>
                              <Typography variant="body" fontWeight={600} styles={{ lineHeight: 1.3 }}>
                                {proj.name}
                              </Typography>
                              {isTailored && (
                                <Badge variant="subtle" size="sm" color="var(--primary, #06b6d4)">
                                  {t('aiTailored')}
                                </Badge>
                              )}
                            </Box>
                            <Box display="flex" flexDirection="column" gap={8}>
                              <SwitchRow
                                label={t('exportIncludeItem')}
                                checked={isIncluded}
                                onChange={(checked) =>
                                  setIncludedProjectIds((prev) => {
                                    const next = new Set(prev);
                                    if (checked) next.add(proj.id); else next.delete(proj.id);
                                    return next;
                                  })
                                }
                              />
                              {isTailored && isIncluded && (
                                <SwitchRow
                                  label={t('useTailoredVersion')}
                                  checked={useTailoredProjectIds.has(proj.id)}
                                  onChange={(checked) =>
                                    setUseTailoredProjectIds((prev) => {
                                      const next = new Set(prev);
                                      if (checked) next.add(proj.id); else next.delete(proj.id);
                                      return next;
                                    })
                                  }
                                />
                              )}
                            </Box>
                          </Card>
                        </Grid>
                      );
                    })}
                  </Grid>
                </Box>
              )}

              {/* Education */}
              {exportData.educations.length > 0 && (
                <Box display="flex" flexDirection="column" gap={8}>
                  <Typography variant="body" fontWeight={600}>
                    {t('exportEducationTitle')}
                  </Typography>
                  <Grid container spacing={2}>
                    {exportData.educations.map((edu) => {
                      const isIncluded = includedEducationIds.has(edu.id);
                      return (
                        <Grid key={edu.id} size={{ xs: 12, sm: 6, lg: 4 }}>
                          <Card gap={12}>
                            <Box display="flex" flexDirection="column" gap={4}>
                              <Typography variant="body" fontWeight={600} styles={{ lineHeight: 1.3 }}>
                                {edu.institution}
                              </Typography>
                              {edu.field_of_study && (
                                <Typography variant="caption" color="var(--muted-foreground, #6b7280)">
                                  {edu.field_of_study}
                                </Typography>
                              )}
                            </Box>
                            <SwitchRow
                              label={t('exportIncludeItem')}
                              checked={isIncluded}
                              onChange={(checked) =>
                                setIncludedEducationIds((prev) => {
                                  const next = new Set(prev);
                                  if (checked) next.add(edu.id); else next.delete(edu.id);
                                  return next;
                                })
                              }
                            />
                          </Card>
                        </Grid>
                      );
                    })}
                  </Grid>
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

      {/* ── Cover letter ──────────────────────────────────────────────── */}
      {tailoredBullets && tailoredBullets.length > 0 && (
        <Box marginBottom={28} marginTop={48}>
          <Typography as="h2" variant="h3" fontWeight={600} marginBottom={8}>
            {t('coverLetterTitle')}
          </Typography>
          <Box styles={{ borderBottom: '1px solid var(--border, #e5e7eb)' }} marginBottom={16} />
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

      {/* ── NAFTA TN Visa Letter ──────────────────────────────────────── */}
      <Box marginBottom={28} marginTop={48}>
        <Typography as="h2" variant="h3" fontWeight={600} marginBottom={8}>
          {t('naftaLetterTitle')}
        </Typography>
        <Box styles={{ borderBottom: '1px solid var(--border, #e5e7eb)' }} marginBottom={12} />
        <Typography variant="body" color="var(--muted-foreground, #6b7280)" marginBottom={16} as="p">
          {t('naftaLetterSubtitle')}
        </Typography>

        {/* ── NAFTA parameters ── */}
        <Box display="flex" flexDirection="column" gap={14} marginBottom={20}>
          <Box display="flex" gap={12} flexWrap="wrap">
            <Box flex={2} styles={{ minWidth: 220 }}>
              <Box display="flex" alignItems="center" gap={8}>
                <Box styles={{ flex: 1 }}>
                  <Select
                    label={t('naftaProfessionLabel')}
                    value={naftaTnProfession}
                    onChange={setNaftaTnProfession}
                    options={[{ value: '', label: t('naftaProfessionPlaceholder') }, ...TN_PROFESSIONS]}
                    disabled={tnSuggestLoading}
                    width="100%"
                  />
                </Box>
                <Button
                  unstyled
                  type="button"
                  icon="/icons/enhance.svg"
                  iconSize="16px"
                  iconColor={tnSuggestLoading ? 'var(--primary, #06b6d4)' : 'var(--foreground, #171717)'}
                  disabled={tnSuggestLoading}
                  onClick={() => void handleSuggestTnCategory()}
                  aria-label={t('tnSuggestLabel')}
                  title={t('tnSuggestLabel')}
                  className={[
                    'ai-enhance-btn',
                    tnSuggestLoading ? 'ai-enhance-btn--busy' : '',
                  ].filter(Boolean).join(' ')}
                />
              </Box>
              {tnSuggestLoading && <ProgressBar label={t('tnSuggestGenerating')} marginTop={8} />}
              {tnSuggestError && (
                <Typography variant="caption" role="alert" color="var(--error, #ef4444)">
                  {tnSuggestError}
                </Typography>
              )}
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
            <Typography variant="body" color="var(--muted-foreground, #6b7280)" as="p" marginBottom={6} marginTop={8}>
              {t('naftaCompanyDescLabel')}
            </Typography>
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
