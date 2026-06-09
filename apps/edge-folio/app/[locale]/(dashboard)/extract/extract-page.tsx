'use client';

import { useCallback, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@repo/i18n/navigation';
import { Container } from '@repo/ui/core-elements/container';
import { Box } from '@repo/ui/core-elements/box';
import { Button } from '@repo/ui/core-elements/button';
import { Typography } from '@repo/ui/core-elements/typography';
import { ProgressBar } from '@repo/ui/core-elements/progress-bar';
import { Badge } from '@repo/ui/core-elements/badge';
import { useDirectoryPicker } from '@/lib/use-directory-picker';
import { useAstExtractor } from '@/lib/use-ast-extractor';
import type { SkeletonJson } from '@/lib/skeleton-json';
import {
  synthesizeSkeleton,
  createSkill,
  createBullet,
  getSkills,
  type Category,
  type DraftBullet,
  MatrixError,
} from '@/lib/matrix';
import './extract-page.css';

// ── Types ─────────────────────────────────────────────────────────────────────

interface EditableDraft extends DraftBullet {
  id: string;
  included: boolean;
}

type SynthStatus = 'idle' | 'synthesizing' | 'done' | 'synth-error' | 'saving' | 'saved' | 'save-error';

// ── Phase label ───────────────────────────────────────────────────────────────

function PhaseLabel({ phase, t }: { phase: string; t: ReturnType<typeof useTranslations<'ExtractPage'>> }) {
  const map: Record<string, string> = {
    init: t('phaseInit'),
    scanning: t('phaseScanning'),
    building: t('phaseBuilding'),
  };
  return (
    <Typography variant="body-sm" fontWeight={600}>
      {map[phase] ?? t('phaseScanning')}
    </Typography>
  );
}

// ── Skeleton review panel ─────────────────────────────────────────────────────

function SkeletonReview({
  skeleton,
  t,
}: {
  skeleton: SkeletonJson;
  t: ReturnType<typeof useTranslations<'ExtractPage'>>;
}) {
  const hasInfra =
    skeleton.infra.hasDocker ||
    skeleton.infra.hasKubernetes ||
    skeleton.infra.ciSystems.length > 0 ||
    skeleton.infra.cloudHints.length > 0;

  return (
    <Box display="flex" flexDirection="column" gap={16}>
      <Box>
        <Typography variant="body-sm" fontWeight={600}>
          {t('skeletonTitle')}
        </Typography>
        <Typography variant="body" color="var(--muted-foreground, #6b7280)" styles={{ marginTop: 4 }}>
          {t('skeletonSubtitle')}
        </Typography>
      </Box>

      <Box className="extract__skeleton-card">
        <SkeletonRow label={t('skeletonFiles')}>
          <Typography variant="body">
            {t('skeletonFilesValue', { code: skeleton.fileStats.codeFiles, total: skeleton.fileStats.totalFiles })}
          </Typography>
        </SkeletonRow>

        <SkeletonRow label={t('skeletonLanguages')}>
          {skeleton.languages.length > 0 ? (
            <Box display="flex" flexWrap="wrap" gap={4}>
              {skeleton.languages.map((l) => <Badge key={l} variant="subtle" size="md">{l}</Badge>)}
            </Box>
          ) : (
            <Typography variant="body" color="var(--muted-foreground, #6b7280)">
              {t('skeletonNone')}
            </Typography>
          )}
        </SkeletonRow>

        <SkeletonRow label={t('skeletonFrameworks')}>
          {skeleton.frameworks.length > 0 ? (
            <Box display="flex" flexWrap="wrap" gap={4}>
              {skeleton.frameworks.map((f) => <Badge key={f} variant="outlined" size="md">{f}</Badge>)}
            </Box>
          ) : (
            <Typography variant="body" color="var(--muted-foreground, #6b7280)">
              {t('skeletonNone')}
            </Typography>
          )}
        </SkeletonRow>

        <SkeletonRow label={t('skeletonDeps')}>
          <Typography variant="body">
            {t('skeletonDepsValue', {
              runtime: skeleton.runtimeDeps.length,
              dev: skeleton.devDeps.length,
            })}
          </Typography>
        </SkeletonRow>

        {(skeleton.infra.hasDocker || skeleton.infra.hasKubernetes || skeleton.kicadFiles.length > 0 || hasInfra) && (
          <SkeletonRow label={t('skeletonInfra')}>
            <Box display="flex" flexWrap="wrap" gap={4}>
              {skeleton.infra.hasDocker && <Badge variant="subtle" size="md">Docker</Badge>}
              {skeleton.infra.hasKubernetes && <Badge variant="subtle" size="md">Kubernetes</Badge>}
              {skeleton.infra.ciSystems.map((ci) => <Badge key={ci} variant="subtle" size="md">{ci}</Badge>)}
              {skeleton.infra.cloudHints.map((c) => <Badge key={c} variant="subtle" size="md">{c}</Badge>)}
              {skeleton.kicadFiles.map((f) => <Badge key={f} variant="outlined" size="md">KiCad</Badge>)}
            </Box>
          </SkeletonRow>
        )}

        {skeleton.importedModules.length > 0 && (
          <SkeletonRow label={t('skeletonModules')}>
            <Typography variant="label" color="var(--muted-foreground, #6b7280)" styles={{ lineHeight: '1.6' }}>
              {skeleton.importedModules.slice(0, 30).join(', ')}
              {skeleton.importedModules.length > 30 && ` +${skeleton.importedModules.length - 30} more`}
            </Typography>
          </SkeletonRow>
        )}
      </Box>
    </Box>
  );
}

function SkeletonRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Box className="extract__skeleton-row">
      <Typography
        variant="label"
        color="var(--muted-foreground, #6b7280)"
        styles={{ flexShrink: 0, minWidth: 100 }}
      >
        {label}
      </Typography>
      <Box flex="1">{children}</Box>
    </Box>
  );
}

// ── Dir card ──────────────────────────────────────────────────────────────────

function DirCard({
  dir,
  onClear,
  t,
}: {
  dir: { name: string; codeFileCount: number; totalFileCount: number; topLevelEntries: { name: string; kind: 'file' | 'directory' }[] };
  onClear: () => void;
  t: ReturnType<typeof useTranslations<'ExtractPage'>>;
}) {
  return (
    <Box className="extract__dir-card">
      <Box display="flex" alignItems="flex-start" justifyContent="space-between" gap={12}>
        <Box display="flex" alignItems="center" gap={10}>
          <Box className="extract__dir-icon" aria-hidden={true}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path
                d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinejoin="round"
              />
            </svg>
          </Box>
          <Typography as="span" variant="body-sm" fontWeight={600} styles={{ wordBreak: 'break-all' }}>
            {dir.name}
          </Typography>
        </Box>
        <Button
          text={t('pickerChange')}
          type="button"
          size="md"
          unstyled
          onClick={onClear}
          className="extract__change-btn"
        />
      </Box>

      <Box className="extract__dir-stats">
        <Typography as="span" variant="body">
          {t('pickerCodeFiles', { count: dir.codeFileCount })}
        </Typography>
        <Box className="extract__dir-stats-dot" aria-hidden={true} />
        <Typography as="span" variant="body">
          {t('pickerTotalFiles', { total: dir.totalFileCount })}
        </Typography>
      </Box>

      {dir.topLevelEntries.length > 0 && (
        <Box display="flex" flexDirection="column" gap={8} marginTop={4}>
          <Typography
            variant="label"
            color="var(--muted-foreground, #6b7280)"
            styles={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em' }}
          >
            {t('pickerContents')}
          </Typography>
          <Box className="extract__dir-entries" role="list" aria-label={t('pickerContentsAriaLabel')}>
            {dir.topLevelEntries.map((entry) => (
              <Box key={entry.name} className="extract__dir-entry" role="listitem">
                <Box aria-hidden={true} className="extract__dir-entry-icon">
                  {entry.kind === 'directory' ? (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                      <path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2V17a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" fill="currentColor" />
                    </svg>
                  ) : (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
                      <path d="M14 2v6h6" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
                    </svg>
                  )}
                </Box>
                <Typography
                  as="span"
                  variant="label"
                  styles={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                >
                  {entry.name}
                </Typography>
              </Box>
            ))}
          </Box>
        </Box>
      )}
    </Box>
  );
}

// ── Draft bullet card ─────────────────────────────────────────────────────────

const CATEGORY_CHOICES: Category[] = ['impact', 'technical', 'leadership', 'collaboration', 'other'];

function DraftBulletCard({
  draft,
  index,
  onChange,
  t,
}: {
  draft: EditableDraft;
  index: number;
  onChange: (id: string, patch: Partial<EditableDraft>) => void;
  t: ReturnType<typeof useTranslations<'ExtractPage'>>;
}) {
  const textId = `draft-text-${draft.id}`;
  const catId = `draft-cat-${draft.id}`;

  const categoryLabels: Record<Category, string> = {
    impact: t('synthCategoryImpact'),
    technical: t('synthCategoryTechnical'),
    leadership: t('synthCategoryLeadership'),
    collaboration: t('synthCategoryCollaboration'),
    other: t('synthCategoryOther'),
  };

  return (
    <Box
      className={[
        'extract__review-bullet',
        !draft.included ? 'extract__review-bullet--deselected' : '',
      ].filter(Boolean).join(' ')}
    >
      <Box display="flex" alignItems="flex-start" gap={12}>
        <button
          type="button"
          className={['extract__check-btn', draft.included ? 'extract__check-btn--checked' : ''].filter(Boolean).join(' ')}
          onClick={() => onChange(draft.id, { included: !draft.included })}
          aria-label={draft.included ? t('synthExclude', { n: index + 1 }) : t('synthInclude', { n: index + 1 })}
        >
          {draft.included && (
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden={true}>
              <path d="M5 12l5 5L20 7" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </button>

        <Box display="flex" flexDirection="column" gap={10} flex="1" minWidth={0}>
          <Box display="flex" flexDirection="column" gap={4}>
            <label htmlFor={textId}>
              <Typography variant="label" color="var(--muted-foreground, #6b7280)" styles={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                {t('synthBulletTextLabel')}
              </Typography>
            </label>
            <textarea
              id={textId}
              className="extract__draft-textarea"
              value={draft.text}
              onChange={(e) => onChange(draft.id, { text: e.target.value })}
              rows={3}
              maxLength={500}
              disabled={!draft.included}
              aria-label={t('synthBulletTextLabel')}
            />
          </Box>

          <Box display="flex" alignItems="center" gap={8} flexWrap="wrap">
            <label htmlFor={catId} style={{ display: 'flex', alignItems: 'center' }}>
              <Typography variant="label" color="var(--muted-foreground, #6b7280)" styles={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                {t('synthCategoryLabel')}
              </Typography>
            </label>
            <select
              id={catId}
              className="extract__draft-select"
              value={draft.category}
              onChange={(e) => onChange(draft.id, { category: e.target.value as Category })}
              aria-label={t('synthCategoryLabel')}
              disabled={!draft.included}
            >
              {CATEGORY_CHOICES.map((cat) => (
                <option key={cat} value={cat}>{categoryLabels[cat]}</option>
              ))}
            </select>
          </Box>

          {draft.skills.length > 0 && (
            <Box display="flex" flexDirection="column" gap={6}>
              <Typography variant="label" color="var(--muted-foreground, #6b7280)" styles={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                {t('synthSkillsLabel')}
              </Typography>
              <Box display="flex" flexWrap="wrap" gap={4}>
                {draft.skills.map((skill) => (
                  <Box key={skill} className="extract__draft-skill-tag">
                    <Typography as="span" variant="label">{skill}</Typography>
                    {draft.included && (
                      <button
                        type="button"
                        className="extract__draft-skill-remove"
                        onClick={() => onChange(draft.id, { skills: draft.skills.filter((s) => s !== skill) })}
                        aria-label={t('synthRemoveSkill', { skill })}
                      >
                        ×
                      </button>
                    )}
                  </Box>
                ))}
              </Box>
            </Box>
          )}
        </Box>
      </Box>
    </Box>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function ExtractPage() {
  const t = useTranslations('ExtractPage');
  const router = useRouter();

  const { isSupported, status: pickerStatus, dir, pick, clear } = useDirectoryPicker();
  const { status: extractStatus, phase, skeleton, error, extract, reset } = useAstExtractor();

  const [synthStatus, setSynthStatus] = useState<SynthStatus>('idle');
  const [drafts, setDrafts] = useState<EditableDraft[]>([]);
  const [synthError, setSynthError] = useState<string | null>(null);
  const [savedCount, setSavedCount] = useState(0);

  const isRunning = extractStatus === 'running';

  const startExtraction = useCallback(() => {
    if (!dir?.handle) return;
    extract(dir.handle);
  }, [dir, extract]);

  const resetAll = useCallback(() => {
    reset();
    clear();
    setSynthStatus('idle');
    setDrafts([]);
    setSynthError(null);
  }, [reset, clear]);

  const resetExtraction = useCallback(() => {
    reset();
    setSynthStatus('idle');
    setDrafts([]);
    setSynthError(null);
  }, [reset]);

  const handleSynthesize = useCallback(async () => {
    if (!skeleton) return;
    setSynthStatus('synthesizing');
    setSynthError(null);
    try {
      const result = await synthesizeSkeleton(skeleton);
      const editable: EditableDraft[] = result.drafts.map((d, i) => ({
        ...d,
        id: `draft-${i}-${Math.random().toString(36).slice(2, 7)}`,
        included: true,
      }));
      setDrafts(editable);
      setSynthStatus('done');
    } catch {
      setSynthError(t('synthesizeError'));
      setSynthStatus('synth-error');
    }
  }, [skeleton, t]);

  const handleDraftChange = useCallback((id: string, patch: Partial<EditableDraft>) => {
    setDrafts((prev) => prev.map((d) => d.id === id ? { ...d, ...patch } : d));
  }, []);

  const handleSelectAll = useCallback((included: boolean) => {
    setDrafts((prev) => prev.map((d) => ({ ...d, included })));
  }, []);

  const handleSave = useCallback(async () => {
    const included = drafts.filter((d) => d.included && d.text.trim());
    if (!included.length) return;
    setSynthStatus('saving');
    setSynthError(null);

    try {
      const skillsData = await getSkills();
      const nameMap: Record<string, number> = {};
      for (const s of skillsData.results) {
        nameMap[s.name.toLowerCase()] = s.id;
      }

      const allSkillNames = new Set(
        included.flatMap((d) => d.skills.map((s) => s.trim())).filter(Boolean),
      );

      for (const name of allSkillNames) {
        if (!nameMap[name.toLowerCase()]) {
          try {
            const skill = await createSkill({ name, proficiency: 3 });
            nameMap[name.toLowerCase()] = skill.id;
          } catch (err) {
            if (err instanceof MatrixError && err.status === 400) {
              // duplicate — skill exists, will be linked if it shows up in future getSkills
            }
          }
        }
      }

      const results = await Promise.allSettled(
        included.map((d, i) => {
          const skillIds = d.skills
            .map((s) => nameMap[s.trim().toLowerCase()])
            .filter((id): id is number => id !== undefined);
          return createBullet({
            text: d.text.trim(),
            category: d.category,
            source: 'extracted',
            is_approved: false,
            order: i,
            skill_ids: skillIds,
          });
        }),
      );

      const saved = results.filter((r) => r.status === 'fulfilled').length;
      setSavedCount(saved);
      setSynthStatus('saved');
    } catch {
      setSynthError(t('synthSaveError'));
      setSynthStatus('save-error');
    }
  }, [drafts, t]);

  const includedCount = drafts.filter((d) => d.included).length;

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
      <Box width="100%" marginTop={24} marginBottom={32}>
        <Typography as="h1" variant="h2" fontWeight={600} marginBottom={4}>
          {t('title')}
        </Typography>
        <Typography variant="body-sm" color="var(--muted-foreground, #6b7280)">
          {t('subtitle')}
        </Typography>
      </Box>

      <Box width="100%" marginBottom={40}>

        {/* ── Unsupported browser ── */}
        {!isSupported && (
          <Box className="extract__unsupported">
            <Typography variant="body-sm" color="var(--muted-foreground, #6b7280)">
              {t('pickerUnsupported')}
            </Typography>
          </Box>
        )}

        {isSupported && (
          <Box display="flex" flexDirection="column" gap={20}>

            {/* ── Directory picker — idle ── */}
            {pickerStatus !== 'ready' && extractStatus === 'idle' && (
              <Box display="flex" flexDirection="column" alignItems="flex-start" gap={12}>
                {pickerStatus === 'error' && (
                  <Typography variant="body-sm" color="var(--error, #ef4444)">
                    {t('pickerError')}
                  </Typography>
                )}
                {pickerStatus === 'scanning' ? (
                  <Box width="100%" display="flex" flexDirection="column" gap={10}>
                    <Typography variant="body-sm" color="var(--muted-foreground, #6b7280)">
                      {t('pickerScanning')}
                    </Typography>
                    <ProgressBar />
                  </Box>
                ) : (
                  <Button
                    text={pickerStatus === 'picking' ? t('pickerOpening') : t('extractCta')}
                    type="button"
                    size="md"
                    kind="success"
                    disabled={pickerStatus === 'picking'}
                    onClick={pick}
                    icon="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z"
                  />
                )}
              </Box>
            )}

            {/* ── Dir selected + idle: show card + begin button ── */}
            {pickerStatus === 'ready' && dir && extractStatus === 'idle' && (
              <Box display="flex" flexDirection="column" gap={16}>
                <DirCard dir={dir} onClear={resetAll} t={t} />
                <Button
                  text={t('pickerBeginCta')}
                  type="button"
                  size="md"
                  kind="success"
                  onClick={startExtraction}
                  icon="M5 3l14 9-14 9V3z"
                />
              </Box>
            )}

            {/* ── Running ── */}
            {isRunning && (
              <Box className="extract__phase">
                <PhaseLabel phase={phase} t={t} />
                <ProgressBar />
              </Box>
            )}

            {/* ── Done: show skeleton + synthesis flow ── */}
            {extractStatus === 'done' && skeleton && (
              <Box display="flex" flexDirection="column" gap={20}>
                <SkeletonReview skeleton={skeleton} t={t} />

                {/* Synthesis: idle — show Synthesize button */}
                {synthStatus === 'idle' && (
                  <Box display="flex" flexDirection="column" gap={12}>
                    <Button
                      text={t('synthesizeCta')}
                      type="button"
                      size="md"
                      kind="success"
                      onClick={handleSynthesize}
                      icon="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
                    />
                    <Box display="flex" gap={12} flexWrap="wrap">
                      <Button
                        text={t('viewMatrix')}
                        type="button"
                        size="md"
                        onClick={() => router.push('/matrix')}
                      />
                      <Button
                        text={t('tryAgain')}
                        type="button"
                        size="md"
                        onClick={resetExtraction}
                      />
                      <Button
                        text={t('changeDirCta')}
                        type="button"
                        size="md"
                        onClick={resetAll}
                      />
                    </Box>
                  </Box>
                )}

                {/* Synthesis: loading */}
                {synthStatus === 'synthesizing' && (
                  <Box className="extract__phase">
                    <Typography variant="body-sm" fontWeight={600}>
                      {t('synthesizing')}
                    </Typography>
                    <ProgressBar />
                  </Box>
                )}

                {/* Synthesis: error */}
                {synthStatus === 'synth-error' && (
                  <Box display="flex" flexDirection="column" gap={12}>
                    <Box className="extract__error">
                      <Typography variant="body-sm" color="var(--error, #ef4444)" fontWeight={600}>
                        {synthError ?? t('synthesizeError')}
                      </Typography>
                    </Box>
                    <Box display="flex" gap={12} flexWrap="wrap">
                      <Button text={t('synthesizeCta')} type="button" size="md" kind="success" onClick={handleSynthesize} />
                      <Button text={t('viewMatrix')} type="button" size="md" onClick={() => router.push('/matrix')} />
                    </Box>
                  </Box>
                )}

                {/* Synthesis: done — draft review */}
                {(synthStatus === 'done' || synthStatus === 'saving' || synthStatus === 'save-error') && (
                  <Box display="flex" flexDirection="column" gap={16}>
                    <Box display="flex" alignItems="center" justifyContent="space-between" flexWrap="wrap" gap={8}>
                      <Box display="flex" flexDirection="column" gap={2}>
                        <Typography variant="body-sm" fontWeight={600}>
                          {t('synthTitle')}
                        </Typography>
                        <Typography variant="body" color="var(--muted-foreground, #6b7280)">
                          {t('synthSubtitle')}
                        </Typography>
                      </Box>
                      <Box display="flex" gap={12}>
                        <Button
                          text={t('synthSelectAll')}
                          type="button"
                          size="md"
                          unstyled
                          onClick={() => handleSelectAll(true)}
                          className="extract__select-all-btn"
                        />
                        <Button
                          text={t('synthDeselectAll')}
                          type="button"
                          size="md"
                          unstyled
                          onClick={() => handleSelectAll(false)}
                          className="extract__select-all-btn"
                        />
                      </Box>
                    </Box>

                    {drafts.length === 0 ? (
                      <Typography variant="body-sm" color="var(--muted-foreground, #6b7280)">
                        {t('synthNoDrafts')}
                      </Typography>
                    ) : (
                      <Box display="flex" flexDirection="column" gap={10}>
                        {drafts.map((draft, i) => (
                          <DraftBulletCard
                            key={draft.id}
                            draft={draft}
                            index={i}
                            onChange={handleDraftChange}
                            t={t}
                          />
                        ))}
                      </Box>
                    )}

                    {synthStatus === 'save-error' && (
                      <Box className="extract__error">
                        <Typography variant="body-sm" color="var(--error, #ef4444)" fontWeight={600}>
                          {synthError ?? t('synthSaveError')}
                        </Typography>
                      </Box>
                    )}

                    <Box display="flex" gap={12} flexWrap="wrap" alignItems="center">
                      <Button
                        text={synthStatus === 'saving' ? t('synthSaving') : t('synthSave', { count: includedCount })}
                        type="button"
                        size="md"
                        kind="success"
                        disabled={synthStatus === 'saving' || includedCount === 0}
                        onClick={handleSave}
                      />
                      <Button
                        text={t('viewMatrix')}
                        type="button"
                        size="md"
                        onClick={() => router.push('/matrix')}
                        disabled={synthStatus === 'saving'}
                      />
                    </Box>
                  </Box>
                )}

                {/* Synthesis: saved */}
                {synthStatus === 'saved' && (
                  <Box display="flex" flexDirection="column" gap={12}>
                    <Box className="extract__done">
                      <Typography variant="body-sm" fontWeight={600}>
                        {t('synthSaved', { count: savedCount })}
                      </Typography>
                      <Typography variant="body" color="var(--muted-foreground, #6b7280)" styles={{ marginTop: 4 }}>
                        {t('synthSavedHint')}
                      </Typography>
                    </Box>
                    <Box display="flex" gap={12} flexWrap="wrap">
                      <Button text={t('viewMatrix')} type="button" size="md" kind="success" onClick={() => router.push('/matrix')} />
                      <Button text={t('changeDirCta')} type="button" size="md" onClick={resetAll} />
                    </Box>
                  </Box>
                )}
              </Box>
            )}

            {/* ── Extraction error ── */}
            {extractStatus === 'error' && (
              <Box display="flex" flexDirection="column" gap={12}>
                <Box className="extract__error">
                  <Typography variant="body-sm" color="var(--error, #ef4444)" fontWeight={600}>
                    {error ?? t('extractError')}
                  </Typography>
                </Box>
                <Box display="flex" gap={12} flexWrap="wrap">
                  <Button
                    text={t('tryAgain')}
                    type="button"
                    size="md"
                    kind="success"
                    onClick={startExtraction}
                    disabled={!dir?.handle}
                  />
                  <Button
                    text={t('changeDirCta')}
                    type="button"
                    size="md"
                    onClick={resetAll}
                  />
                </Box>
              </Box>
            )}

            {/* Dir card shown during extraction */}
            {pickerStatus === 'ready' && dir && isRunning && (
              <Box className="extract__dir-card extract__dir-card--loading">
                <Typography variant="body" color="var(--muted-foreground, #6b7280)">
                  {dir.name}
                </Typography>
              </Box>
            )}
          </Box>
        )}
      </Box>
    </Container>
  );
}
