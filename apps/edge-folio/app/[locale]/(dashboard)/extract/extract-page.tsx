'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@repo/i18n/navigation';
import { Container } from '@repo/ui/core-elements/container';
import { Box } from '@repo/ui/core-elements/box';
import { Button } from '@repo/ui/core-elements/button';
import { Typography } from '@repo/ui/core-elements/typography';
import { ProgressBar } from '@repo/ui/core-elements/progress-bar';
import { Badge } from '@repo/ui/core-elements/badge';
import { Switch } from '@repo/ui/core-elements/switch';
import { useModelStatus } from '@/lib/use-model-status';
import { useDirectoryPicker } from '@/lib/use-directory-picker';
import { useEdgeEngine } from '@/lib/use-edge-engine';
import { readCodebase } from '@/lib/read-codebase';
import { buildExtractionMessages, parseExtractionOutput } from '@/lib/extract-prompt';
import type { ExtractedBullet } from '@/lib/extract-prompt';
import { createBullet } from '@/lib/matrix';
import './extract-page.css';

function formatBytes(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(0)} MB`;
  return `${(bytes / 1024).toFixed(0)} KB`;
}

type ExtractionPhase =
  | 'idle'
  | 'loading-engine'
  | 'reading'
  | 'running'
  | 'review'
  | 'saving'
  | 'done'
  | 'error';

export function ExtractPage() {
  const t = useTranslations('ExtractPage');
  const router = useRouter();

  const { status, progress, bytesLoaded } = useModelStatus();
  const { isSupported, status: pickerStatus, dir, pick, clear } = useDirectoryPicker();
  const {
    webgpuSupported,
    webgpuChecked,
    status: engineStatus,
    loadProgress: engineLoadProgress,
    load: engineLoad,
    generate: engineGenerate,
  } = useEdgeEngine();

  const [extractionPhase, setExtractionPhase] = useState<ExtractionPhase>('idle');
  const [extractedBullets, setExtractedBullets] = useState<ExtractedBullet[]>([]);
  const [approvedSet, setApprovedSet] = useState<Set<number>>(new Set());
  const [extractionError, setExtractionError] = useState<string | null>(null);
  const [savedCount, setSavedCount] = useState(0);
  const [opfsFiles, setOpfsFiles] = useState<string[]>([]);

  // Guard against Strict Mode double-invocation
  const runningRef = useRef(false);

  useEffect(() => {
    // if (extractionPhase !== 'loading-engine') return;
    void (async () => {
      try {
        const root = await navigator.storage.getDirectory();
        const entries: string[] = [];
        for await (const [name, handle] of root.entries()) {
          if (handle.kind === 'file') {
            entries.push(name);
          } else {
            entries.push(`${name}/`);
            try {
              for await (const [child] of (handle as FileSystemDirectoryHandle).entries()) {
                entries.push(`  ${name}/${child}`);
              }
            } catch { /* ignore unreadable subdirs */ }
          }
        }
        setOpfsFiles(entries.length > 0 ? entries : ['(empty)']);
      } catch {
        setOpfsFiles(['(error reading OPFS)']);
      }
    })();
  }, [extractionPhase]);

  const startExtraction = useCallback(() => {
    const modelId = process.env.NEXT_PUBLIC_EDGE_MODEL_ID;
    if (!modelId || !dir?.handle) return;

    runningRef.current = false;
    setExtractionPhase('loading-engine');
    setExtractedBullets([]);
    setApprovedSet(new Set());
    setExtractionError(null);
    setSavedCount(0);

    engineLoad(modelId);
  }, [dir, engineLoad]);

  // Drive the extraction pipeline once the engine is ready
  useEffect(() => {
    if (extractionPhase !== 'loading-engine') return;

    if (engineStatus === 'error') {
      setExtractionError(t('engineError'));
      setExtractionPhase('error');
      return;
    }

    if (engineStatus !== 'ready') return;
    if (runningRef.current) return;
    runningRef.current = true;

    const handle = dir?.handle;
    if (!handle) return;

    setExtractionPhase('reading');

    void (async () => {
      let codeText: string;
      try {
        codeText = await readCodebase(handle);
      } catch {
        setExtractionError(t('extractError'));
        setExtractionPhase('error');
        return;
      }

      setExtractionPhase('running');
      const genId = `extract-${Date.now()}`;

      engineGenerate(genId, buildExtractionMessages(codeText), 1024, {
        onDone: (text) => {
          const bullets = parseExtractionOutput(text);
          setExtractedBullets(bullets);
          setApprovedSet(new Set(bullets.map((_, i) => i)));
          setExtractionPhase('review');
        },
        onError: () => {
          setExtractionError(t('extractError'));
          setExtractionPhase('error');
        },
      });
    })();

    return () => {
      runningRef.current = false;
    };
  }, [extractionPhase, engineStatus, dir, engineGenerate, t]);

  const toggleApproval = useCallback((i: number, checked: boolean) => {
    setApprovedSet((prev) => {
      const next = new Set(prev);
      if (checked) next.add(i); else next.delete(i);
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    setApprovedSet((prev) =>
      prev.size === extractedBullets.length
        ? new Set()
        : new Set(extractedBullets.map((_, i) => i)),
    );
  }, [extractedBullets]);

  const handleSave = useCallback(async () => {
    const toSave = extractedBullets.filter((_, i) => approvedSet.has(i));
    if (toSave.length === 0) return;

    setExtractionPhase('saving');
    let count = 0;
    let hasError = false;

    for (const bullet of toSave) {
      try {
        await createBullet({
          text: bullet.text,
          category: bullet.category,
          source: 'extracted',
          is_approved: true,
        });
        count++;
      } catch {
        hasError = true;
      }
    }

    setSavedCount(count);
    if (hasError) setExtractionError(t('saveError'));
    setExtractionPhase('done');
  }, [extractedBullets, approvedSet, t]);

  const resetExtraction = useCallback(() => {
    runningRef.current = false;
    setExtractionPhase('idle');
    setExtractedBullets([]);
    setApprovedSet(new Set());
    setExtractionError(null);
  }, []);

  const resetAndChangDir = useCallback(() => {
    resetExtraction();
    clear();
  }, [resetExtraction, clear]);

  const clearModels = useCallback(async () => {
    try {
      const root = await navigator.storage.getDirectory();
      await root.removeEntry('models', { recursive: true });
    } catch {
      // directory may not exist yet
    }
  }, []);

  const inProgress =
    extractionPhase === 'loading-engine' ||
    extractionPhase === 'reading' ||
    extractionPhase === 'running' ||
    extractionPhase === 'saving';

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
                  <Button
                    text={t('clearModels')}
                    type="button"
                    size="md"
                    onClick={() => void clearModels()}
                  />

      <Box width="100%" maxWidth={600} marginBottom={40}>

        {/* ── Model not configured or error ── */}
        {(status === 'unconfigured' || status === 'error') && (
          <Box className="extract__gate extract__gate--locked">
            <Box className="extract__gate-icon" aria-hidden={true}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                <rect x="3" y="11" width="18" height="11" rx="2" stroke="currentColor" strokeWidth="2" />
                <path d="M7 11V7a5 5 0 0110 0v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </Box>
            <Box display="flex" flexDirection="column" gap={8}>
              <Typography variant="body-sm" fontWeight={600} styles={{ fontSize: 15 }}>
                {t('modelLockedTitle')}
              </Typography>
              <Typography variant="body-sm" color="var(--muted-foreground, #6b7280)">
                {t('modelLockedBody')}
              </Typography>
              <Box marginTop={4}>
                <Button
                  text={t('modelLockedCta')}
                  type="button"
                  size="md"
                  kind="success"
                  onClick={() => router.push('/onboarding')}
                />
              </Box>
            </Box>
          </Box>
        )}

        {/* ── Model downloading ── */}
        {(status === 'checking' || status === 'idle' || status === 'downloading') && (
          <Box className="extract__gate extract__gate--downloading">
            <Box className="extract__gate-icon" aria-hidden={true}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                <path d="M12 3v13M7 12l5 5 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M5 20h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </Box>
            <Box display="flex" flexDirection="column" gap={8} width="100%">
              <Typography variant="body-sm" fontWeight={600} styles={{ fontSize: 15 }}>
                {t('modelDownloadingTitle')}
              </Typography>
              <Typography variant="body-sm" color="var(--muted-foreground, #6b7280)">
                {t('modelDownloadingBody')}
              </Typography>
              <ProgressBar value={progress > 0 ? progress : undefined} />
              {bytesLoaded > 0 && (
                <Typography
                  variant="caption"
                  color="var(--muted-foreground, #6b7280)"
                  styles={{ fontSize: 12 }}
                >
                  {t('modelDownloadedBytes', { size: formatBytes(bytesLoaded) })}
                </Typography>
              )}
            </Box>
          </Box>
        )}

        {/* ── Model ready ── */}
        {status === 'ready' && (
          <Box display="flex" flexDirection="column" gap={20}>

            {/* Ready banner */}
            <Box className="extract__gate extract__gate--ready">
              <Box className="extract__gate-icon" aria-hidden={true}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
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
              <Box display="flex" flexDirection="column" gap={6}>
                <Typography variant="body-sm" fontWeight={600} styles={{ fontSize: 15 }}>
                  {t('modelReadyTitle')}
                </Typography>
                <Typography variant="body-sm" color="var(--muted-foreground, #6b7280)">
                  {t('modelReadyBody')}
                </Typography>
              </Box>
            </Box>

            {/* ── Unsupported browser ── */}
            {!isSupported && (
              <Box className="extract__unsupported">
                <Typography variant="body-sm" color="var(--muted-foreground, #6b7280)">
                  {t('pickerUnsupported')}
                </Typography>
              </Box>
            )}

            {/* ── WebGPU checking / unsupported ── */}
            {isSupported && !webgpuChecked && (
              <Box className="extract__unsupported">
                <Typography variant="body-sm" color="var(--muted-foreground, #6b7280)">
                  {t('gpuChecking')}
                </Typography>
              </Box>
            )}
            {isSupported && webgpuChecked && !webgpuSupported && (
              <Box className="extract__unsupported">
                <Typography variant="body-sm" color="var(--muted-foreground, #6b7280)">
                  {t('gpuUnsupported')}
                </Typography>
              </Box>
            )}

            {/* ── Directory picker (idle, before dir is selected) ── */}
            {isSupported && webgpuChecked && webgpuSupported && pickerStatus !== 'ready' && extractionPhase === 'idle' && (
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
            {isSupported && webgpuChecked && webgpuSupported && pickerStatus === 'ready' && dir && extractionPhase === 'idle' && (
              <Box display="flex" flexDirection="column" gap={16}>
                <DirCard dir={dir} onClear={resetAndChangDir} t={t} />
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

            {/* ── Loading engine ── */}
            {extractionPhase === 'loading-engine' && (
              <Box className="extract__phase">
                <Typography variant="body-sm" fontWeight={600} styles={{ fontSize: 15 }}>
                  {t('engineLoading')}
                </Typography>
                <ProgressBar value={engineLoadProgress > 0 ? engineLoadProgress : undefined} />
              </Box>
            )}

            {opfsFiles.length > 0 && (
                  <Box display="flex" flexDirection="column" gap={4} marginTop={8}>
                    <Typography
                      variant="caption"
                      color="var(--muted-foreground, #6b7280)"
                      styles={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em' }}
                    >
                      OPFS
                    </Typography>
                    {opfsFiles.map((f, i) => (
                      <Typography
                        key={i}
                        variant="caption"
                        styles={{ fontSize: 11, fontFamily: 'monospace', whiteSpace: 'pre' }}
                      >
                        {f}
                      </Typography>
                    ))}
                  </Box>
                )}

            {/* ── Reading files ── */}
            {extractionPhase === 'reading' && (
              <Box className="extract__phase">
                <Typography variant="body-sm" fontWeight={600} styles={{ fontSize: 15 }}>
                  {t('readingFiles')}
                </Typography>
                <ProgressBar />
              </Box>
            )}

            {/* ── Running inference ── */}
            {extractionPhase === 'running' && (
              <Box className="extract__phase">
                <Typography variant="body-sm" fontWeight={600} styles={{ fontSize: 15 }}>
                  {t('running')}
                </Typography>
                <ProgressBar />
              </Box>
            )}

            {/* ── Saving ── */}
            {extractionPhase === 'saving' && (
              <Box className="extract__phase">
                <Typography variant="body-sm" fontWeight={600} styles={{ fontSize: 15 }}>
                  {t('savingBullets')}
                </Typography>
                <ProgressBar />
              </Box>
            )}

            {/* ── Review ── */}
            {extractionPhase === 'review' && (
              <Box display="flex" flexDirection="column" gap={16}>
                <Box display="flex" alignItems="center" justifyContent="space-between" gap={12}>
                  <Box display="flex" flexDirection="column" gap={2}>
                    <Typography variant="body-sm" fontWeight={600} styles={{ fontSize: 15 }}>
                      {t('reviewTitle')}
                    </Typography>
                    <Typography
                      variant="caption"
                      color="var(--muted-foreground, #6b7280)"
                      styles={{ fontSize: 13 }}
                    >
                      {t('reviewSubtitle')}
                    </Typography>
                  </Box>
                  <Button
                    unstyled
                    type="button"
                    className="extract__select-all-btn"
                    onClick={toggleAll}
                  >
                    {approvedSet.size === extractedBullets.length ? t('deselectAll') : t('selectAll')}
                  </Button>
                </Box>

                {extractedBullets.length === 0 ? (
                  <Box className="extract__phase">
                    <Typography variant="body-sm" fontWeight={600} styles={{ fontSize: 15 }}>
                      {t('noResultsTitle')}
                    </Typography>
                    <Typography variant="body-sm" color="var(--muted-foreground, #6b7280)">
                      {t('noResultsBody')}
                    </Typography>
                  </Box>
                ) : (
                  <Box display="flex" flexDirection="column" gap={10}>
                    {extractedBullets.map((bullet, i) => (
                      <Box
                        key={i}
                        className={[
                          'extract__review-bullet',
                          !approvedSet.has(i) ? 'extract__review-bullet--deselected' : '',
                        ].filter(Boolean).join(' ')}
                      >
                        <Box display="flex" alignItems="flex-start" gap={12}>
                          <Box marginTop={2}>
                            <Switch
                              checked={approvedSet.has(i)}
                              onChange={(checked) => toggleApproval(i, checked)}
                            />
                          </Box>
                          <Box display="flex" flexDirection="column" gap={8} flex="1">
                            <Typography variant="body-sm" styles={{ lineHeight: '1.5' }}>
                              {bullet.text}
                            </Typography>
                            <Box display="flex" flexWrap="wrap" gap={6} alignItems="center">
                              <Badge variant="subtle" size="sm">
                                {bullet.category.charAt(0).toUpperCase() + bullet.category.slice(1)}
                              </Badge>
                              {bullet.skills.map((skill) => (
                                <Badge key={skill} variant="outlined" size="sm">
                                  {skill}
                                </Badge>
                              ))}
                            </Box>
                          </Box>
                        </Box>
                      </Box>
                    ))}
                  </Box>
                )}

                <Box display="flex" gap={12} marginTop={4}>
                  <Button
                    text={t('saveSelected')}
                    type="button"
                    size="md"
                    kind="success"
                    disabled={approvedSet.size === 0}
                    onClick={() => void handleSave()}
                  />
                  <Button
                    text={t('tryAgain')}
                    type="button"
                    size="md"
                    onClick={resetExtraction}
                  />
                  <Button
                    text={t('clearModels')}
                    type="button"
                    size="md"
                    onClick={() => void clearModels()}
                  />
                </Box>
              </Box>
            )}

            {/* ── Done ── */}
            {extractionPhase === 'done' && (
              <Box display="flex" flexDirection="column" gap={12}>
                <Box className="extract__done">
                  <Typography variant="body-sm" fontWeight={600} styles={{ fontSize: 15 }}>
                    {t('savedTitle')}
                  </Typography>
                  <Typography variant="body-sm" color="var(--muted-foreground, #6b7280)">
                    {t('savedBody', { count: savedCount })}
                  </Typography>
                  {extractionError && (
                    <Typography
                      variant="caption"
                      color="var(--error, #ef4444)"
                      styles={{ fontSize: 13 }}
                    >
                      {extractionError}
                    </Typography>
                  )}
                </Box>
                <Box display="flex" gap={12}>
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
                    onClick={resetAndChangDir}
                  />
                  <Button
                    text={t('clearModels')}
                    type="button"
                    size="md"
                    onClick={() => void clearModels()}
                  />
                </Box>
              </Box>
            )}

            {/* ── Error ── */}
            {extractionPhase === 'error' && (
              <Box display="flex" flexDirection="column" gap={12}>
                <Box className="extract__error">
                  <Typography
                    variant="body-sm"
                    color="var(--error, #ef4444)"
                    fontWeight={600}
                    styles={{ fontSize: 14 }}
                  >
                    {extractionError}
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
                    text={t('clearModels')}
                    type="button"
                    size="md"
                    onClick={() => void clearModels()}
                  />
                  <Button
                    text={t('changeDirCta')}
                    type="button"
                    size="md"
                    onClick={resetAndChangDir}
                  />
                </Box>
              </Box>
            )}

            {/* Loading blocker on dir card during extraction */}
            {isSupported &&
              pickerStatus === 'ready' &&
              dir &&
              inProgress && (
                <Box className="extract__dir-card extract__dir-card--loading">
                  <Typography
                    variant="caption"
                    color="var(--muted-foreground, #6b7280)"
                    styles={{ fontSize: 13 }}
                  >
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
          <Typography
            as="span"
            variant="body-sm"
            fontWeight={600}
            styles={{ fontSize: 15, wordBreak: 'break-all' }}
          >
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
                      <path
                        d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z"
                        fill="currentColor"
                      />
                    </svg>
                  ) : (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                      <path
                        d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinejoin="round"
                      />
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
