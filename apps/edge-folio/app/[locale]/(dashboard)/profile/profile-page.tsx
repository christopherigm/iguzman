'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Container } from '@repo/ui/core-elements/container';
import { Box } from '@repo/ui/core-elements/box';
import { TextInput } from '@repo/ui/core-elements/text-input';
import { Button } from '@repo/ui/core-elements/button';
import { Typography } from '@repo/ui/core-elements/typography';
import { ProgressBar } from '@repo/ui/core-elements/progress-bar';
import { Slider } from '@repo/ui/core-elements/slider';
import type { SliderStep } from '@repo/ui/core-elements/slider';
import { getProfile, saveOnboarding, uploadResume, type ResumeImportResult } from '@/lib/auth';
import './profile-page.css';

const YEARS_STEPS: SliderStep[] = [
  { value: 0, label: '< 1' },
  { value: 1, label: '1–2' },
  { value: 3, label: '3–5' },
  { value: 6, label: '6–9' },
  { value: 10, label: '10–14' },
  { value: 15, label: '15+' },
];

const TECH_SUGGESTIONS = [
  'TypeScript', 'JavaScript', 'Python', 'Go', 'Rust', 'Java', 'C#', 'Ruby', 'PHP',
  'React', 'Next.js', 'Vue', 'Angular', 'Svelte',
  'Node.js', 'Django', 'FastAPI', 'Spring Boot', '.NET',
  'PostgreSQL', 'MySQL', 'MongoDB', 'Redis',
  'Docker', 'Kubernetes', 'AWS', 'GCP', 'Azure',
  'GraphQL', 'REST', 'gRPC', 'Terraform', 'Linux',
];

function TechTagInput({
  tags,
  onChange,
}: {
  tags: string[];
  onChange: (tags: string[]) => void;
}) {
  const t = useTranslations('ProfilePage');
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
    if (tags.includes(tech)) removeTag(tech);
    else addTag(tech);
  }

  return (
    <Box display="flex" flexDirection="column" gap={12}>
      <Typography as="label" variant="body" fontWeight={600} color="var(--foreground, #1a1a1a)">
        {t('techStackLabel')}
      </Typography>

      <Box display="flex" flexDirection="column" gap={6} >
        <Typography variant="label" color="var(--muted-foreground, #6b7280)">
          {t('techStackHint')}
        </Typography>
        <Box display="flex" flexWrap="wrap" gap={6}>
          {TECH_SUGGESTIONS.map((tech) => (
            <Button
              key={tech}
              unstyled
              type="button"
              className={[
                'profile__suggestion',
                tags.includes(tech) ? 'profile__suggestion--selected' : '',
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

      <input
        ref={inputRef}
        type="text"
        className="profile__tech-input"
        placeholder={t('techStackPlaceholder')}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={() => { if (input.trim()) addTag(input); }}
        aria-label={t('techStackLabel')}
      />

      {tags.length > 0 && (
        <Box display="flex" flexWrap="wrap" gap={8} className="profile__tags" marginTop={10}>
          {tags.map((tag) => (
            <Box key={tag} className="profile__tag">
              <Typography variant="body">{tag}</Typography>
              <Button
                unstyled
                type="button"
                className="profile__tag-remove"
                onClick={() => removeTag(tag)}
                aria-label={`Remove ${tag}`}
              >
                ×
              </Button>
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
}

// ── Section wrapper ────────────────────────────────────────────────────────────

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
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
          {title}
        </Typography>
        {subtitle && (
          <Typography variant="body-sm" color="var(--muted-foreground, #6b7280)">
            {subtitle}
          </Typography>
        )}
      </Box>
      {children}
    </Box>
  );
}

// ── Skills diff panel ──────────────────────────────────────────────────────────

function SkillsDiffPanel({
  newSkills,
  selected,
  onToggle,
  onAdd,
  saving,
}: {
  newSkills: string[];
  selected: Set<string>;
  onToggle: (skill: string) => void;
  onAdd: () => void;
  saving: boolean;
}) {
  const t = useTranslations('ProfilePage');

  if (newSkills.length === 0) {
    return (
      <Typography variant="body-sm" color="var(--muted-foreground, #6b7280)">
        {t('skillsDiffNone')}
      </Typography>
    );
  }

  return (
    <Box className="profile__diff-panel" display="flex" flexDirection="column" gap={12}>
      <Box display="flex" flexDirection="column" gap={4}>
        <Typography variant="body-sm" fontWeight={700}>
          {t('skillsDiffTitle', { count: newSkills.length })}
        </Typography>
        <Typography variant="label" color="var(--muted-foreground, #6b7280)">
          {t('skillsDiffSubtitle')}
        </Typography>
      </Box>
      <Box display="flex" flexWrap="wrap" gap={6}>
        {newSkills.map((skill) => (
          <Button
            key={skill}
            unstyled
            type="button"
            className={[
              'profile__suggestion',
              selected.has(skill) ? 'profile__suggestion--selected' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            onClick={() => onToggle(skill)}
          >
            {skill}
          </Button>
        ))}
      </Box>
      <Button
        text={saving ? t('skillsDiffAdding') : t('skillsDiffAdd', { count: selected.size })}
        type="button"
        size="md"
        kind="success"
        disabled={saving || selected.size === 0}
        onClick={onAdd}
      />
    </Box>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

export function ProfilePage() {
  const t = useTranslations('ProfilePage');

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [jobTitle, setJobTitle] = useState('');
  const [yearsValue, setYearsValue] = useState<string | number>(0);
  const [savingInfo, setSavingInfo] = useState(false);
  const [infoSuccess, setInfoSuccess] = useState(false);
  const [infoError, setInfoError] = useState<string | null>(null);

  const [techStack, setTechStack] = useState<string[]>([]);
  const [savingStack, setSavingStack] = useState(false);
  const [stackSuccess, setStackSuccess] = useState(false);
  const [stackError, setStackError] = useState<string | null>(null);

  type UploadState = 'idle' | 'uploading' | 'done' | 'error';
  const [uploadState, setUploadState] = useState<UploadState>('idle');
  const [resumeResult, setResumeResult] = useState<ResumeImportResult | null>(null);
  const [resumeError, setResumeError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [newSkills, setNewSkills] = useState<string[]>([]);
  const [selectedNewSkills, setSelectedNewSkills] = useState<Set<string>>(new Set());
  const [savingDiff, setSavingDiff] = useState(false);

  useEffect(() => {
    getProfile()
      .then((p) => {
        setJobTitle(p.job_title ?? '');
        setYearsValue(p.years_of_experience ?? 0);
        setTechStack(p.preferred_stack ?? []);
        setLoading(false);
      })
      .catch(() => {
        setLoadError(t('errorLoad'));
        setLoading(false);
      });
  }, [t]);

  const handleSaveInfo = useCallback(async () => {
    setInfoError(null);
    setInfoSuccess(false);
    setSavingInfo(true);
    try {
      await saveOnboarding({
        job_title: jobTitle.trim(),
        years_of_experience: typeof yearsValue === 'number' ? yearsValue : null,
        preferred_stack: techStack,
      });
      setInfoSuccess(true);
    } catch {
      setInfoError(t('infoError'));
    } finally {
      setSavingInfo(false);
    }
  }, [jobTitle, yearsValue, techStack, t]);

  const handleSaveStack = useCallback(async () => {
    setStackError(null);
    setStackSuccess(false);
    setSavingStack(true);
    try {
      await saveOnboarding({
        job_title: jobTitle.trim(),
        years_of_experience: typeof yearsValue === 'number' ? yearsValue : null,
        preferred_stack: techStack,
      });
      setStackSuccess(true);
    } catch {
      setStackError(t('techError'));
    } finally {
      setSavingStack(false);
    }
  }, [jobTitle, yearsValue, techStack, t]);

  const handleResumeFile = useCallback(
    async (file: File) => {
      setResumeError(null);
      setUploadState('uploading');
      setResumeResult(null);
      setNewSkills([]);
      setSelectedNewSkills(new Set());
      try {
        const result = await uploadResume(file);
        setResumeResult(result);
        setUploadState('done');
        const currentLower = techStack.map((s) => s.toLowerCase());
        const fresh = result.extracted_skills.filter(
          (s) => !currentLower.includes(s.toLowerCase()),
        );
        setNewSkills(fresh);
        setSelectedNewSkills(new Set(fresh));
      } catch {
        setUploadState('error');
        setResumeError(t('resumeError'));
      }
    },
    [techStack, t],
  );

  const handleAddDiffSkills = useCallback(async () => {
    setSavingDiff(true);
    setStackError(null);
    const updatedStack = [...techStack, ...Array.from(selectedNewSkills)];
    try {
      await saveOnboarding({
        job_title: jobTitle.trim(),
        years_of_experience: typeof yearsValue === 'number' ? yearsValue : null,
        preferred_stack: updatedStack,
      });
      setTechStack(updatedStack);
      setNewSkills([]);
      setSelectedNewSkills(new Set());
      setStackSuccess(true);
    } catch {
      setStackError(t('techError'));
    } finally {
      setSavingDiff(false);
    }
  }, [selectedNewSkills, techStack, jobTitle, yearsValue, t]);

  function toggleDiffSkill(skill: string) {
    setSelectedNewSkills((prev) => {
      const next = new Set(prev);
      if (next.has(skill)) next.delete(skill);
      else next.add(skill);
      return next;
    });
  }

  if (loading) {
    return (
      <Container
        display="flex"
        alignItems="center"
        styles={{ minHeight: '100vh', flexDirection: 'column', justifyContent: 'flex-start', paddingTop: 'var(--ui-navbar-height)' }}
        paddingX={10}
      >
        <Box width="100%" maxWidth={640} marginTop={24}>
          <Typography variant="body" color="var(--muted-foreground, #6b7280)">
            {t('loading')}
          </Typography>
        </Box>
      </Container>
    );
  }

  if (loadError) {
    return (
      <Container
        display="flex"
        alignItems="center"
        styles={{ minHeight: '100vh', flexDirection: 'column', justifyContent: 'flex-start', paddingTop: 'var(--ui-navbar-height)' }}
        paddingX={10}
      >
        <Box width="100%" maxWidth={640} marginTop={24}>
          <Typography variant="body" role="alert" color="var(--error, #ef4444)">
            {loadError}
          </Typography>
        </Box>
      </Container>
    );
  }

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
      <Box width="100%" maxWidth={640} marginTop={24} marginBottom={16}>
        <Typography as="h1" variant="h2" fontWeight={600} marginBottom={4}>
          {t('title')}
        </Typography>
        <Typography variant="body-sm" color="var(--muted-foreground, #6b7280)">
          {t('subtitle')}
        </Typography>
      </Box>

      <Box
        width="100%"
        maxWidth={640}
        display="flex"
        flexDirection="column"
        gap={24}
        marginBottom={40}
      >
        {/* ── Professional Info ── */}
        <Section title={t('professionalSection')} subtitle={t('professionalSubtitle')}>
          <TextInput
            label={t('jobTitleLabel')}
            type="text"
            value={jobTitle}
            onChange={(v) => { setJobTitle(v); setInfoSuccess(false); }}
            placeholder={t('jobTitlePlaceholder')}
            autoComplete="organization-title"
          />
          <Slider
            label={t('yearsLabel')}
            steps={YEARS_STEPS}
            value={yearsValue}
            onChange={(v) => { setYearsValue(v); setInfoSuccess(false); }}
          />
          {infoSuccess && (
            <Typography variant="caption" className="profile__success">
              {t('infoSaved')}
            </Typography>
          )}
          {infoError && (
            <Typography variant="caption" role="alert" className="profile__error">
              {infoError}
            </Typography>
          )}
          {savingInfo && <ProgressBar label={t('savingInfo')} />}
          <Box display="flex" justifyContent="flex-end">
            <Button
              text={savingInfo ? t('savingInfo') : t('saveInfo')}
              type="button"
              size="md"
              kind="success"
              disabled={savingInfo || !jobTitle.trim()}
              onClick={() => void handleSaveInfo()}
            />
          </Box>
        </Section>

        {/* ── Tech Stack ── */}
        <Section title={t('techSection')} subtitle={t('techSubtitle')}>
          <TechTagInput
            tags={techStack}
            onChange={(tags) => { setTechStack(tags); setStackSuccess(false); }}
          />
          {stackSuccess && (
            <Typography variant="caption" className="profile__success">
              {t('stackSaved')}
            </Typography>
          )}
          {stackError && (
            <Typography variant="caption" role="alert" className="profile__error">
              {stackError}
            </Typography>
          )}
          {savingStack && <ProgressBar label={t('savingStack')} />}
          <Box display="flex" justifyContent="flex-end" marginTop={20}>
            <Button
              text={savingStack ? t('savingStack') : t('saveStack')}
              type="button"
              size="md"
              kind="success"
              disabled={savingStack}
              onClick={() => void handleSaveStack()}
            />
          </Box>
        </Section>

        {/* ── Resume ── */}
        <Section title={t('resumeSection')} subtitle={t('resumeSubtitle')}>
          {(uploadState === 'idle' || uploadState === 'error') && (
            <>
              <Box
                className={[
                  'profile__upload-zone',
                  isDragging ? 'profile__upload-zone--dragging' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                role="button"
                tabIndex={0}
                aria-label={t('resumeDropZone')}
                onClick={() => fileInputRef.current?.click()}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click();
                }}
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
                className="profile__file-input"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void handleResumeFile(file);
                }}
              />
            </>
          )}

          {uploadState === 'uploading' && (
            <Box className="profile__upload-zone profile__upload-zone--loading">
              <ProgressBar label={t('resumeAnalyzing')} />
            </Box>
          )}

          {uploadState === 'done' && resumeResult && (
            <Box display="flex" flexDirection="column" gap={16}>
              {(resumeResult.work_experience_imported > 0 ||
                resumeResult.education_imported > 0) && (
                <Box className="profile__import-banner">
                  <Typography variant="body-sm" fontWeight={600} color="var(--success, #22c55e)">
                    ✓{' '}
                    {t('careerImported', {
                      jobs: resumeResult.work_experience_imported,
                      degrees: resumeResult.education_imported,
                    })}
                  </Typography>
                  <Typography variant="label" color="var(--foreground)">
                    {t('careerReviewHint')}{' '}
                    <Link href="/work-experience" prefetch className="profile__review-link">
                      {t('careerReviewWork')}
                    </Link>{' '}
                    {t('careerReviewAnd')}{' '}
                    <Link href="/education" prefetch className="profile__review-link">
                      {t('careerReviewEducation')}
                    </Link>
                    .
                  </Typography>
                </Box>
              )}

              <SkillsDiffPanel
                newSkills={newSkills}
                selected={selectedNewSkills}
                onToggle={toggleDiffSkill}
                onAdd={() => void handleAddDiffSkills()}
                saving={savingDiff}
              />

              <Button
                unstyled
                type="button"
                className="profile__upload-another"
                onClick={() => {
                  setUploadState('idle');
                  setResumeResult(null);
                  setNewSkills([]);
                  setSelectedNewSkills(new Set());
                  if (fileInputRef.current) fileInputRef.current.value = '';
                }}
              >
                {t('resumeUploadAnother')}
              </Button>
            </Box>
          )}

          {uploadState === 'error' && resumeError && (
            <Typography variant="caption" role="alert" className="profile__error">
              {resumeError}
            </Typography>
          )}
        </Section>
      </Box>
    </Container>
  );
}
