'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@repo/i18n/navigation';
import { Container } from '@repo/ui/core-elements/container';
import { Box } from '@repo/ui/core-elements/box';
import { TextInput } from '@repo/ui/core-elements/text-input';
import { Button } from '@repo/ui/core-elements/button';
import { Typography } from '@repo/ui/core-elements/typography';
import { ProgressBar } from '@repo/ui/core-elements/progress-bar';
import { Badge } from '@repo/ui/core-elements/badge';
import { Slider } from '@repo/ui/core-elements/slider';
import type { SliderStep } from '@repo/ui/core-elements/slider';
import { saveOnboarding, getProfile, uploadResume } from '@/lib/auth';
import type { ResumeImportResult } from '@/lib/auth';
import { getPopularTechStacks } from '@/lib/career';
import './onboarding-form.css';

// ── Readiness handshake ──────────────────────────────────────────────────────

function ReadinessHandshake() {
  const t = useTranslations('OnboardingPage');
  return (
    <Box className="onboarding__handshake">
      <Box className="onboarding__handshake-icon" aria-hidden={true}>
        <svg width="30" height="30" viewBox="0 0 24 24" fill="none">
          <path
            d="M12 2L4 6v6c0 5.5 3.5 10.3 8 11.6C16.5 22.3 20 17.5 20 12V6l-8-4z"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinejoin="round"
          />
          <path
            d="M9 12l2 2 4-4"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </Box>
      <Box display="flex" flexDirection="column" gap={4}>
        <Typography variant="body-sm" fontWeight={700}>
          {t('handshakeTitle')}
        </Typography>
        <Typography variant="body" color="var(--foreground)">
          {t('handshakeBody')}
        </Typography>
        <Typography variant="label" color="var(--success, #22c55e)">
          {t('handshakeDetail')}
        </Typography>
      </Box>
    </Box>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

const YEARS_STEPS: SliderStep[] = [
  { value: 0, label: '< 1' },
  { value: 1, label: '1–2' },
  { value: 3, label: '3–5' },
  { value: 6, label: '6–9' },
  { value: 10, label: '10–14' },
  { value: 15, label: '15+' },
];

const FALLBACK_TECH_SUGGESTIONS = [
  'TypeScript', 'JavaScript', 'Python', 'Go', 'Rust', 'Java', 'C#', 'Ruby', 'PHP',
  'React', 'Next.js', 'Vue', 'Angular', 'Svelte',
  'Node.js', 'Django', 'FastAPI', 'Spring Boot', '.NET',
  'PostgreSQL', 'MySQL', 'MongoDB', 'Redis',
  'Docker', 'Kubernetes', 'AWS', 'GCP', 'Azure',
  'GraphQL', 'REST', 'gRPC', 'Terraform', 'Linux',
];

// ── Step indicator ────────────────────────────────────────────────────────────

function StepIndicator({ current, total }: { current: number; total: number }) {
  const t = useTranslations('OnboardingPage');
  return (
    <Box display="flex" flexDirection="column" gap={8} alignItems="center" width="100%">
      <Typography variant="body" color="var(--muted-foreground, #6b7280)">
        {t('stepOf', { current, total })}
      </Typography>
      <Box display="flex" alignItems="center" gap={0} className="onboarding__steps">
        {Array.from({ length: total }, (_, i) => {
          const num = i + 1;
          const done = num < current;
          const active = num === current;
          return (
            <Box key={num} display="flex" alignItems="center" gap={0}>
              <Box
                className={[
                  'onboarding__step-dot',
                  done ? 'onboarding__step-dot--done' : '',
                  active ? 'onboarding__step-dot--active' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                <Typography
                  variant="label"
                  fontWeight={600}
                  styles={{ lineHeight: '1' }}
                >
                  {done ? '✓' : String(num)}
                </Typography>
              </Box>
              {num < total && (
                <Box
                  className={[
                    'onboarding__step-line',
                    done ? 'onboarding__step-line--done' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                />
              )}
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}

// ── Tech tag input ────────────────────────────────────────────────────────────

function TechTagInput({
  tags,
  onChange,
  suggestions,
}: {
  tags: string[];
  onChange: (tags: string[]) => void;
  suggestions?: string[];
}) {
  const t = useTranslations('OnboardingPage');
  const [input, setInput] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  function addTag(raw: string) {
    const tag = raw.trim().replace(/,$/, '');
    if (!tag || tags.includes(tag)) return;
    onChange([...tags, tag]);
    setInput('');
  }

  function removeTag(tag: string) {
    onChange(tags.filter((t) => t !== tag));
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addTag(input);
    } else if (e.key === 'Backspace' && !input && tags.length > 0) {
      onChange(tags.slice(0, -1));
    }
  }

  function toggleSuggestion(tech: string) {
    if (tags.includes(tech)) {
      removeTag(tech);
    } else {
      addTag(tech);
    }
  }

  return (
    <Box display="flex" flexDirection="column" gap={12}>
      <Typography
        as="label"
        variant="body"
        fontWeight={600}
        color="var(--foreground, #1a1a1a)"
      >
        {t('techStackLabel')}
      </Typography>

      {tags.length > 0 && (
        <Box display="flex" flexWrap="wrap" gap={8} className="onboarding__tags">
          {tags.map((tag) => (
            <Box key={tag} className="onboarding__tag">
              <Typography variant="body">
                {tag}
              </Typography>
              <Button
                unstyled
                type="button"
                className="onboarding__tag-remove"
                onClick={() => removeTag(tag)}
                aria-label={`Remove ${tag}`}
              >
                ×
              </Button>
            </Box>
          ))}
        </Box>
      )}

      <input
        ref={inputRef}
        type="text"
        className="onboarding__tech-input"
        placeholder={t('techStackPlaceholder')}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={() => { if (input.trim()) addTag(input); }}
        aria-label={t('techStackLabel')}
      />

      <Box display="flex" flexDirection="column" gap={6}>
        <Typography
          variant="label"
          color="var(--muted-foreground, #6b7280)"
        >
          {t('techStackHint')}
        </Typography>
        <Box display="flex" flexWrap="wrap" gap={6}>
          {(suggestions ?? FALLBACK_TECH_SUGGESTIONS).map((tech) => (
            <Button
              key={tech}
              unstyled
              type="button"
              className={[
                'onboarding__suggestion',
                tags.includes(tech) ? 'onboarding__suggestion--selected' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              onClick={() => toggleSuggestion(tech)}
            >
              {tech}
            </Button>
          ))}
        </Box>
      </Box>
    </Box>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

export function OnboardingForm() {
  const t = useTranslations('OnboardingPage');
  const router = useRouter();

  const [step, setStep] = useState(1);
  const [jobTitle, setJobTitle] = useState('');
  const [yearsValue, setYearsValue] = useState<string | number>(YEARS_STEPS[0]!.value);
  const [techStack, setTechStack] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [popularTechSuggestions, setPopularTechSuggestions] = useState<string[]>(FALLBACK_TECH_SUGGESTIONS);

  type ResumeState = 'idle' | 'uploading' | 'done' | 'error' | 'skipped';
  const [resumeState, setResumeState] = useState<ResumeState>('idle');
  const [resumeResult, setResumeResult] = useState<ResumeImportResult | null>(null);
  const [resumeError, setResumeError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Redirect if onboarding already complete; load popular tech suggestions
  useEffect(() => {
    getProfile()
      .then((profile) => {
        if (profile.job_title) {
          router.replace('/matrix');
        }
      })
      .catch(() => {
        // not logged in — proxy will redirect to /auth
      });
    getPopularTechStacks()
      .then((res) => {
        const lower = new Set(FALLBACK_TECH_SUGGESTIONS.map((s) => s.toLowerCase()));
        const apiOnly = res.results
          .map((ts) => ts.name)
          .filter((n) => !lower.has(n.toLowerCase()));
        setPopularTechSuggestions([...FALLBACK_TECH_SUGGESTIONS, ...apiOnly]);
      })
      .catch(() => {});
  }, [router]);

  const handleFinish = useCallback(async () => {
    setError(null);
    setSaving(true);
    try {
      await saveOnboarding({
        job_title: jobTitle.trim(),
        years_of_experience: typeof yearsValue === 'number' ? yearsValue : null,
        preferred_stack: techStack,
      });
      router.push('/matrix');
    } catch {
      setError(t('errorSave'));
    } finally {
      setSaving(false);
    }
  }, [jobTitle, yearsValue, techStack, router, t]);

  const handleResumeFile = useCallback(async (file: File) => {
    setResumeError(null);
    setResumeState('uploading');
    try {
      const result = await uploadResume(file);
      setResumeResult(result);
      setResumeState('done');
    } catch {
      setResumeState('error');
      setResumeError(t('resumeError'));
    }
  }, [t]);

  const stepTitles = [t('step1Title'), t('step2Title'), t('step3Title'), t('step4Title')];
  const stepSubtitles = [t('step1Subtitle'), t('step2Subtitle'), t('step3Subtitle'), t('step4Subtitle')];

  const yearsLabel = (() => {
    const step = YEARS_STEPS.find((s) => s.value === yearsValue);
    return step ? step.label : String(yearsValue);
  })();

  return (
    <Container
      display="flex"
      alignItems="center"
      styles={{
        minHeight: '100vh',
        flexDirection: 'column',
        justifyContent: 'flex-start',
        paddingTop: 'var(--ui-navbar-height)',
      }}
      paddingX={10}
    >
      <Box width="100%" maxWidth={520} marginTop={24} marginBottom={16}>
        <Typography as="h1" variant="h2" fontWeight={600} marginBottom={4}>
          {t('title')}
        </Typography>
        <Typography variant="body-sm" color="var(--muted-foreground, #6b7280)">
          {t('subtitle')}
        </Typography>
      </Box>

      <Box width="100%" maxWidth={520} marginBottom={24}>
        <StepIndicator current={step} total={4} />
      </Box>

      <Box
        width="100%"
        maxWidth={520}
        padding={10}
        borderRadius={12}
        flexDirection="column"
        gap={24}
        elevation={5}
        backgroundColor="var(--surface-1)"
        marginBottom={40}
      >
        <Box display="flex" flexDirection="column" gap={4}>
          <Typography as="h2" variant="h3" fontWeight={600}>
            {stepTitles[step - 1]}
          </Typography>
          <Typography variant="body-sm" color="var(--muted-foreground, #6b7280)">
            {stepSubtitles[step - 1]}
          </Typography>
        </Box>

        {/* ── Step 1: Role ── */}
        {step === 1 && (
          <Box display="flex" flexDirection="column" gap={20}>
            <TextInput
              label={t('jobTitleLabel')}
              type="text"
              value={jobTitle}
              onChange={setJobTitle}
              placeholder={t('jobTitlePlaceholder')}
              autoComplete="organization-title"
            />
            <Slider
              label={t('yearsLabel')}
              steps={YEARS_STEPS}
              value={yearsValue}
              onChange={setYearsValue}
            />
          </Box>
        )}

        {/* ── Step 2: Tech stack ── */}
        {step === 2 && (
          <TechTagInput
            tags={techStack}
            onChange={setTechStack}
            suggestions={popularTechSuggestions}
          />
        )}

        {/* ── Step 3: Resume upload ── */}
        {step === 3 && (
          <Box display="flex" flexDirection="column" gap={16}>
            {(resumeState === 'idle' || resumeState === 'error') && (
              <>
                <Box
                  className={[
                    'onboarding__upload-zone',
                    isDragging ? 'onboarding__upload-zone--dragging' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  role="button"
                  tabIndex={0}
                  aria-label={t('resumeDropZone')}
                  onClick={() => fileInputRef.current?.click()}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click(); }}
                  onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setIsDragging(false);
                    const file = e.dataTransfer.files?.[0];
                    if (file) void handleResumeFile(file);
                  }}
                >
                  <Typography variant="body-sm" styles={{ pointerEvents: 'none' }}>
                    {t('resumeDropZone')}
                  </Typography>
                  <Typography
                    variant="label"
                    color="var(--muted-foreground, #6b7280)"
                    styles={{ pointerEvents: 'none' }}
                  >
                    {t('resumeDropHint')}
                  </Typography>
                </Box>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,application/pdf"
                  aria-hidden="true"
                  className="onboarding__file-input"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void handleResumeFile(file);
                  }}
                />
              </>
            )}

            {resumeState === 'uploading' && (
              <Box className="onboarding__upload-zone onboarding__upload-zone--loading">
                <ProgressBar label={t('resumeAnalyzing')} />
              </Box>
            )}

            {resumeState === 'done' && resumeResult && (
              <Box className="onboarding__upload-zone onboarding__upload-zone--done">
                <Typography variant="body-sm" fontWeight={600}>
                  ✓ {t('resumeSuccess', {
                    bullets: resumeResult.bullets_imported,
                    skills: resumeResult.skills_imported,
                  })}
                </Typography>
                {(resumeResult.work_experience_imported > 0 || resumeResult.education_imported > 0 || resumeResult.projects_imported > 0) && (
                  <Typography variant="label" color="var(--foreground)">
                    {t('resumeCareerSuccess', {
                      jobs: resumeResult.work_experience_imported,
                      degrees: resumeResult.education_imported,
                      projects: resumeResult.projects_imported,
                    })}
                  </Typography>
                )}
                <Typography
                  variant="label"
                  color="var(--muted-foreground, #6b7280)"
                >
                  {t('resumeSuccessHint')}
                </Typography>
              </Box>
            )}

            {resumeState === 'skipped' && (
              <Box className="onboarding__upload-zone onboarding__upload-zone--skipped">
                <Typography variant="body" color="var(--muted-foreground, #6b7280)">
                  {t('resumeSkipped')}
                </Typography>
              </Box>
            )}

            {resumeState === 'error' && resumeError && (
              <Typography variant="caption" role="alert" className="onboarding__error">
                {resumeError}
              </Typography>
            )}

            {(resumeState === 'idle' || resumeState === 'error') && (
              <Button
                unstyled
                type="button"
                className="onboarding__skip-btn"
                onClick={() => {
                  setResumeState('skipped');
                  setResumeError(null);
                }}
              >
                {t('resumeSkip')}
              </Button>
            )}
          </Box>
        )}

        {/* ── Step 4: Review + model status ── */}
        {step === 4 && (
          <Box display="flex" flexDirection="column" gap={16}>
            <Box className="onboarding__review-card">
              <Box className="onboarding__review-row">
                <Typography
                  variant="label"
                  color="var(--muted-foreground, #6b7280)"
                >
                  {t('reviewJobTitle')}
                </Typography>
                <Typography variant="body-sm" fontWeight={600}>
                  {jobTitle || '—'}
                </Typography>
              </Box>
              <Box className="onboarding__review-row">
                <Typography
                  variant="label"
                  color="var(--muted-foreground, #6b7280)"
                >
                  {t('reviewYears')}
                </Typography>
                <Typography variant="body-sm" fontWeight={600}>
                  {yearsValue === 0
                    ? t('reviewYearsLess')
                    : t('reviewYearsValue', { years: yearsLabel })}
                </Typography>
              </Box>
              <Box className="onboarding__review-row" alignItems="flex-start">
                <Typography
                  variant="label"
                  color="var(--muted-foreground, #6b7280)"
                  styles={{ flexShrink: 0 }}
                >
                  {t('reviewStack')}
                </Typography>
                {techStack.length > 0 ? (
                  <Box display="flex" flexWrap="wrap" gap={4} justifyContent="flex-end">
                    {techStack.map((tech) => (
                      <Badge key={tech} variant="subtle" size="lg">
                        {tech}
                      </Badge>
                    ))}
                  </Box>
                ) : (
                  <Typography
                    variant="body-sm"
                    color="var(--muted-foreground, #6b7280)"
                  >
                    {t('reviewStackEmpty')}
                  </Typography>
                )}
              </Box>
              <Box className="onboarding__review-row">
                <Typography
                  variant="label"
                  color="var(--muted-foreground, #6b7280)"
                >
                  {t('reviewResume')}
                </Typography>
                <Typography variant="body-sm" fontWeight={600}>
                  {resumeResult
                    ? t('reviewResumeImported', {
                        bullets: resumeResult.bullets_imported,
                        jobs: resumeResult.work_experience_imported,
                        degrees: resumeResult.education_imported,
                        projects: resumeResult.projects_imported,
                      })
                    : t('reviewResumeSkipped')}
                </Typography>
              </Box>
            </Box>

            <ReadinessHandshake />

            {error && (
              <Typography
                variant="caption"
                role="alert"
                className="onboarding__error"
              >
                {error}
              </Typography>
            )}
            {saving && <ProgressBar label={t('finishing')} />}
          </Box>
        )}

        {/* ── Navigation ── */}
        <Box display="flex" justifyContent="space-between" gap={12} marginTop={4}>
          {step > 1 ? (
            <Button
              text={t('back')}
              type="button"
              size="md"
              onClick={() => setStep((s) => s - 1)}
              disabled={saving}
            />
          ) : (
            <Box />
          )}

          {step < 4 ? (
            <Button
              text={t('next')}
              type="button"
              size="md"
              kind={step === 1 && jobTitle.trim() ? 'success' : undefined}
              disabled={
                (step === 1 && !jobTitle.trim()) ||
                (step === 3 && resumeState === 'uploading')
              }
              onClick={() => setStep((s) => s + 1)}
            />
          ) : (
            <Button
              text={saving ? t('finishing') : t('finish')}
              type="button"
              size="md"
              kind="success"
              disabled={saving}
              onClick={() => void handleFinish()}
            />
          )}
        </Box>
      </Box>
    </Container>
  );
}
