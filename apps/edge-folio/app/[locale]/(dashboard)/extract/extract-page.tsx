'use client';

import { useCallback } from 'react';
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
import './extract-page.css';

// ── Phase label map ───────────────────────────────────────────────────────────

function PhaseLabel({ phase, t }: { phase: string; t: ReturnType<typeof useTranslations<'ExtractPage'>> }) {
  const map: Record<string, string> = {
    init: t('phaseInit'),
    scanning: t('phaseScanning'),
    building: t('phaseBuilding'),
  };
  return (
    <Typography variant="body-sm" fontWeight={600} styles={{ fontSize: 15 }}>
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
        <Typography variant="body-sm" fontWeight={600} styles={{ fontSize: 15 }}>
          {t('skeletonTitle')}
        </Typography>
        <Typography variant="caption" color="var(--muted-foreground, #6b7280)" styles={{ fontSize: 13, marginTop: 4 }}>
          {t('skeletonSubtitle')}
        </Typography>
      </Box>

      <Box className="extract__skeleton-card">
        <SkeletonRow label={t('skeletonFiles')}>
          <Typography variant="caption" styles={{ fontSize: 13 }}>
            {t('skeletonFilesValue', { code: skeleton.fileStats.codeFiles, total: skeleton.fileStats.totalFiles })}
          </Typography>
        </SkeletonRow>

        <SkeletonRow label={t('skeletonLanguages')}>
          {skeleton.languages.length > 0 ? (
            <Box display="flex" flexWrap="wrap" gap={4}>
              {skeleton.languages.map((l) => <Badge key={l} variant="subtle" size="sm">{l}</Badge>)}
            </Box>
          ) : (
            <Typography variant="caption" color="var(--muted-foreground, #6b7280)" styles={{ fontSize: 13 }}>
              {t('skeletonNone')}
            </Typography>
          )}
        </SkeletonRow>

        <SkeletonRow label={t('skeletonFrameworks')}>
          {skeleton.frameworks.length > 0 ? (
            <Box display="flex" flexWrap="wrap" gap={4}>
              {skeleton.frameworks.map((f) => <Badge key={f} variant="outlined" size="sm">{f}</Badge>)}
            </Box>
          ) : (
            <Typography variant="caption" color="var(--muted-foreground, #6b7280)" styles={{ fontSize: 13 }}>
              {t('skeletonNone')}
            </Typography>
          )}
        </SkeletonRow>

        <SkeletonRow label={t('skeletonDeps')}>
          <Typography variant="caption" styles={{ fontSize: 13 }}>
            {t('skeletonDepsValue', {
              runtime: skeleton.runtimeDeps.length,
              dev: skeleton.devDeps.length,
            })}
          </Typography>
        </SkeletonRow>

        {skeleton.infra.hasDocker || skeleton.infra.hasKubernetes || skeleton.kicadFiles.length > 0 ? (
          <SkeletonRow label={t('skeletonInfra')}>
            <Box display="flex" flexWrap="wrap" gap={4}>
              {skeleton.infra.hasDocker && <Badge variant="subtle" size="sm">Docker</Badge>}
              {skeleton.infra.hasKubernetes && <Badge variant="subtle" size="sm">Kubernetes</Badge>}
              {skeleton.infra.ciSystems.map((ci) => <Badge key={ci} variant="subtle" size="sm">{ci}</Badge>)}
              {skeleton.infra.cloudHints.map((c) => <Badge key={c} variant="subtle" size="sm">{c}</Badge>)}
              {skeleton.kicadFiles.map((f) => <Badge key={f} variant="outlined" size="sm">KiCad</Badge>)}
            </Box>
          </SkeletonRow>
        ) : !hasInfra ? null : null}

        {skeleton.importedModules.length > 0 && (
          <SkeletonRow label={t('skeletonModules')}>
            <Typography variant="caption" color="var(--muted-foreground, #6b7280)" styles={{ fontSize: 12, lineHeight: '1.6' }}>
              {skeleton.importedModules.slice(0, 30).join(', ')}
              {skeleton.importedModules.length > 30 && ` +${skeleton.importedModules.length - 30} more`}
            </Typography>
          </SkeletonRow>
        )}
      </Box>

      <Box className="extract__coming-soon">
        <Typography variant="caption" styles={{ fontSize: 13 }}>
          {t('analyzeComingSoon')}
        </Typography>
      </Box>
    </Box>
  );
}

function SkeletonRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Box className="extract__skeleton-row">
      <Typography
        variant="caption"
        color="var(--muted-foreground, #6b7280)"
        styles={{ fontSize: 12, flexShrink: 0, minWidth: 100 }}
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
          <Typography as="span" variant="body-sm" fontWeight={600} styles={{ fontSize: 15, wordBreak: 'break-all' }}>
            {dir.name}
          </Typography>
        </Box>
        <Button
          text={t('pickerChange')}
          type="button"
          size="sm"
          unstyled
          onClick={onClear}
          className="extract__change-btn"
        />
      </Box>

      <Box className="extract__dir-stats">
        <Typography as="span" variant="caption" styles={{ fontSize: 13 }}>
          {t('pickerCodeFiles', { count: dir.codeFileCount })}
        </Typography>
        <Box className="extract__dir-stats-dot" aria-hidden={true} />
        <Typography as="span" variant="caption" styles={{ fontSize: 13 }}>
          {t('pickerTotalFiles', { total: dir.totalFileCount })}
        </Typography>
      </Box>

      {dir.topLevelEntries.length > 0 && (
        <Box display="flex" flexDirection="column" gap={8} marginTop={4}>
          <Typography
            variant="caption"
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
                      <path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" fill="currentColor" />
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
                  variant="caption"
                  styles={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
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

// ── Main page ─────────────────────────────────────────────────────────────────

export function ExtractPage() {
  const t = useTranslations('ExtractPage');
  const router = useRouter();

  const { isSupported, status: pickerStatus, dir, pick, clear } = useDirectoryPicker();
  const { status: extractStatus, phase, skeleton, error, extract, reset } = useAstExtractor();

  const isRunning = extractStatus === 'running';

  const startExtraction = useCallback(() => {
    if (!dir?.handle) return;
    extract(dir.handle);
  }, [dir, extract]);

  const resetAll = useCallback(() => {
    reset();
    clear();
  }, [reset, clear]);

  const resetExtraction = useCallback(() => {
    reset();
  }, [reset]);

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
      <Box width="100%" maxWidth={600} marginTop={24} marginBottom={32}>
        <Typography as="h1" variant="h2" fontWeight={600} marginBottom={4}>
          {t('title')}
        </Typography>
        <Typography variant="body-sm" color="var(--muted-foreground, #6b7280)">
          {t('subtitle')}
        </Typography>
      </Box>

      <Box width="100%" maxWidth={600} marginBottom={40}>

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

            {/* ── Done: show skeleton ── */}
            {extractStatus === 'done' && skeleton && (
              <Box display="flex" flexDirection="column" gap={16}>
                <SkeletonReview skeleton={skeleton} t={t} />
                <Box display="flex" gap={12} flexWrap="wrap">
                  <Button
                    text={t('viewMatrix')}
                    type="button"
                    size="md"
                    kind="success"
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

            {/* ── Error ── */}
            {extractStatus === 'error' && (
              <Box display="flex" flexDirection="column" gap={12}>
                <Box className="extract__error">
                  <Typography variant="body-sm" color="var(--error, #ef4444)" fontWeight={600} styles={{ fontSize: 14 }}>
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
                <Typography variant="caption" color="var(--muted-foreground, #6b7280)" styles={{ fontSize: 13 }}>
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
