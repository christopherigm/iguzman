'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { Box } from '@repo/ui/core-elements/box';
import { ProgressBar } from '@repo/ui/core-elements/progress-bar';
import { ConfirmationModal } from '@repo/ui/core-elements/confirmation-modal';
import { Button } from '@repo/ui/core-elements/button';
import { useFFmpeg } from '@repo/ui/use-ffmpeg';
import { useGroq } from '@repo/ui/use-groq';
import type { LlmMessage } from '@repo/ui/use-groq';
import type { VideoStatus } from '@/lib/types';
import { TRANSLATE_LANGUAGES } from './burn-captions-modal';
import type { StoredVideo } from './use-video-store';
import {
  STATUS_COLORS,
  resolveMediaUrl,
  triggerBrowserDownload,
  uploadProcessedVideo,
  VideoCardHeader,
  VideoDetailsPanel,
  VideoMediaPreview,
  VideoStatusHints,
  VideoFooterLink,
  PlatformIconBg,
} from './video-item-shared';
import { useOPFSUrls } from './opfs-url-context';
import { readFromOPFS } from '@/lib/opfs';
import { saveProcessedToOPFS } from '@/lib/opfs-processing';
import './video-item.css';

/* ── Helpers ────────────────────────────────────────── */

const LANG_LABEL: Record<string, string> = Object.fromEntries(
  TRANSLATE_LANGUAGES.map((l) => [l.value, l.label]),
);

function buildTranslationPrompt(targetLangName: string): string {
  return `You are a professional subtitle translator. Translate the SRT subtitle content into ${targetLangName}.

STRICT RULES:
- Preserve the EXACT SRT format: block numbers, timestamp lines (e.g. "00:00:02,041 --> 00:00:03,401"), and text lines must remain in their correct positions
- Do NOT alter, add, or remove any timestamps
- Do NOT reorder, merge, or split subtitle blocks
- Translate ONLY the text lines; leave block numbers and timestamps completely untouched
- Maintain natural speech patterns, tone, and the speaker's intent
- When translating to Spanish, use Mexican Spanish vocabulary and expressions, not Spain Spanish
- Return ONLY the translated SRT content — no explanations, no markdown fences, no extra commentary`;
}

function hexToSSA(hex: string, opacity: number): string {
  const r = hex.slice(1, 3);
  const g = hex.slice(3, 5);
  const b = hex.slice(5, 7);
  const alpha = Math.round((1 - opacity / 100) * 255)
    .toString(16)
    .padStart(2, '0');
  return `&H${alpha}${b}${g}${r}`.toUpperCase();
}

/* ── Props ──────────────────────────────────────────── */

export interface PinnedVideoItemClientProps {
  video: StoredVideo;
  onUpdate: (uuid: string, patch: Partial<StoredVideo>) => void;
  onComplete: (uuid: string) => void;
  onRemove: (uuid: string) => void;
}

/* ── Component ──────────────────────────────────────── */

export function PinnedVideoItemClient({
  video,
  onUpdate,
  onComplete,
  onRemove,
}: PinnedVideoItemClientProps) {
  const t = useTranslations('VideoGrid');
  const { getUrls, registerUrls } = useOPFSUrls();
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [copying, setCopying] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [localProgress, setLocalProgress] = useState<{
    status: 'loading' | 'processing';
    progress: number;
  } | null>(null);

  const fpsResumeChecked = useRef(false);
  const convertResumeChecked = useRef(false);
  const convertH265ResumeChecked = useRef(false);
  const blackBarsResumeChecked = useRef(false);
  const burnResumeChecked = useRef(false);
  const scaleDownResumeChecked = useRef(false);

  const { generate } = useGroq({
    proxyBase: '/api/groq',
    model: 'llama-3.3-70b-versatile',
  });

  const {
    status: ffmpegStatus,
    progress: ffmpegProgress,
    lastError: ffmpegLastError,
    lastWarning: ffmpegLastWarning,
    lastProcessingTime: ffmpegProcessingTime,
    cores: ffmpegCores,
    interpolateFps,
    convertToH264,
    convertToH265,
    removeBlackBars,
    burnSubtitles,
    scaleDown,
  } = useFFmpeg();

  const displayFFmpegStatus = localProgress?.status ?? ffmpegStatus;
  const displayFFmpegProgress = localProgress?.progress ?? ffmpegProgress;

  const isProcessing =
    video.status === 'processing' ||
    video.status === 'converting' ||
    video.status === 'burning' ||
    video.status === 'translating';

  const displayName =
    video.name ??
    video.uploader ??
    (video.justAudio ? t('untitledAudio') : t('untitledVideo'));

  /* ── Copy link ──────────────────────────────────────── */
  const handleCopy = useCallback(async () => {
    try {
      setCopying(true);
      await navigator.clipboard.writeText(video.originalURL);
      setTimeout(() => setCopying(false), 1200);
    } catch {
      setCopying(false);
    }
  }, [video.originalURL]);

  /* ── Run FFmpeg locally (WASM) ──────────────────────── */
  const runProcessing = useCallback(
    async (opts: {
      activeStatus: VideoStatus;
      process: (
        sourceUrl: string,
        onProgress?: (p: number) => void,
      ) => Promise<{ objectUrl: string; blob: Blob }>;
      donePatch: Partial<StoredVideo>;
      taskUpdate: Record<string, unknown>;
      errorKey: string;
      downloadPrefix?: string;
      completeAfter?: boolean;
    }) => {
      const file = video.file;
      if (!file || video.justAudio) return;

      let tempBlobUrl: string | null = null;

      try {
        onUpdate(video.uuid, { status: opts.activeStatus, error: null });

        // Resolve source: read from OPFS if device-stored, else use server URL
        let sourceUrl: string;
        if (video.opfsEnabled && video.opfsStored && video.opfsKey) {
          const cached = getUrls(video.uuid);
          if (cached.videoUrl) {
            sourceUrl = cached.videoUrl;
          } else {
            const opfsFile = await readFromOPFS(video.opfsKey);
            tempBlobUrl = URL.createObjectURL(opfsFile);
            sourceUrl = tempBlobUrl;
          }
        } else {
          sourceUrl = `${window.location.origin}${resolveMediaUrl(`/api/media/${file}`)}`;
        }

        setLocalProgress({ status: 'loading', progress: 0 });
        const { objectUrl, blob } = await opts.process(sourceUrl, (p) => {
          setLocalProgress({ status: 'processing', progress: p });
        });

        if (tempBlobUrl) {
          URL.revokeObjectURL(tempBlobUrl);
          tempBlobUrl = null;
        }
        setLocalProgress(null);

        onUpdate(video.uuid, {
          status: 'done',
          fileSize: blob.size,
          ...opts.donePatch,
        });

        if (video.opfsEnabled) {
          // Save result directly to OPFS — skip server upload
          const ext = file.split('.').pop() ?? 'mp4';
          const newKey = await saveProcessedToOPFS({
            blob,
            fileExt: ext,
            oldOpfsKey: video.opfsKey,
            uuid: video.uuid,
            getUrls,
            registerUrls,
          });

          onUpdate(video.uuid, {
            opfsKey: newKey,
            file: newKey,
            downloadURL: `opfs://${newKey}`,
            opfsStored: true,
            serverFileDeleted: true,
          });

          if (video.autoDownload) {
            const prefix = opts.downloadPrefix ?? 'video';
            triggerBrowserDownload(
              objectUrl,
              `${video.name ?? prefix}-${Date.now()}-${newKey}`,
            );
          }
        } else {
          // Upload result back to server
          const uploadPromise = uploadProcessedVideo(
            file,
            blob,
            opts.taskUpdate,
            setUploading,
          );

          if (video.autoDownload) {
            const prefix = opts.downloadPrefix ?? 'video';
            triggerBrowserDownload(
              objectUrl,
              `${video.name ?? prefix}-${Date.now()}-${file}`,
            );
          }

          const newFile = await uploadPromise;
          if (newFile) {
            onUpdate(video.uuid, {
              file: newFile,
              downloadURL: `/api/media/${newFile}`,
            });
          }
        }

        if (opts.completeAfter) onComplete(video.uuid);
      } catch (err) {
        if (tempBlobUrl) URL.revokeObjectURL(tempBlobUrl);
        console.error(`${opts.errorKey} failed:`, err);
        setLocalProgress(null);
        onUpdate(video.uuid, { status: 'error', error: t(opts.errorKey) });
      }
    },
    [
      video.uuid,
      video.file,
      video.justAudio,
      video.autoDownload,
      video.name,
      video.opfsEnabled,
      video.opfsStored,
      video.opfsKey,
      onUpdate,
      onComplete,
      t,
      getUrls,
      registerUrls,
    ],
  );

  /* ── FPS interpolation ──────────────────────────────── */
  const handleInterpolateFps = useCallback(
    (completeAfter = true) =>
      runProcessing({
        activeStatus: 'processing',
        process: (url, onProgress) =>
          interpolateFps(url, Number(video.fps), onProgress),
        donePatch: { fpsApplied: true },
        taskUpdate: { fpsApplied: true },
        errorKey: 'errorFfmpegFailed',
        completeAfter,
      }),
    [runProcessing, interpolateFps, video.fps],
  );

  /* ── H.265 → H.264 conversion ───────────────────────── */
  const handleConvertH264 = useCallback(
    () =>
      runProcessing({
        activeStatus: 'converting',
        process: (url, onProgress) => convertToH264(url, onProgress),
        donePatch: { h264Converted: true, isH265: false },
        taskUpdate: { isH265: false },
        errorKey: 'errorConvertFailed',
        downloadPrefix: 'video',
        completeAfter: true,
      }),
    [runProcessing, convertToH264],
  );
  /* ── H.264 → H.265 conversion ──────────────────────── */
  const handleConvertH265 = useCallback(
    () =>
      runProcessing({
        activeStatus: 'converting',
        process: (url, onProgress) => convertToH265(url, onProgress),
        donePatch: { h265Converted: true, isH265: true },
        taskUpdate: { isH265: true },
        errorKey: 'errorConvertH265Failed',
        downloadPrefix: 'video',
        completeAfter: true,
      }),
    [runProcessing, convertToH265],
  );
  /* ── Remove black bars ──────────────────────────────── */
  const handleRemoveBlackBars = useCallback(
    () =>
      runProcessing({
        activeStatus: 'processing',
        process: (url, onProgress) =>
          removeBlackBars(url, undefined, undefined, undefined, onProgress),
        donePatch: { blackBarsRemoved: true },
        taskUpdate: { blackBarsRemoved: true },
        errorKey: 'errorRemoveBlackBarsFailed',
        completeAfter: true,
      }),
    [runProcessing, removeBlackBars],
  );

  /* ── Scale down ─────────────────────────────────────── */
  const handleScaleDown = useCallback(
    (targetHeight: number) => {
      const origH = video.height ?? 0;
      const origW = video.width ?? 0;
      let donePatch: Partial<typeof video> = { scaleDownTargetHeight: null };
      if (origH > 0 && origW > 0) {
        const isPortrait = origH > origW;
        if (isPortrait) {
          const newW = targetHeight;
          const newH = Math.round((origH * targetHeight) / origW / 2) * 2;
          donePatch = { ...donePatch, height: newH, width: newW };
        } else {
          const newH = targetHeight;
          const newW = Math.round((origW * targetHeight) / origH / 2) * 2;
          donePatch = { ...donePatch, height: newH, width: newW };
        }
      }
      return runProcessing({
        activeStatus: 'processing',
        process: (url, onProgress) => scaleDown(url, targetHeight, onProgress),
        donePatch,
        taskUpdate: donePatch as Record<string, unknown>,
        errorKey: 'errorScaleDownFailed',
        completeAfter: true,
      });
    },
    [runProcessing, scaleDown, video.height, video.width],
  );

  /* ── Burn captions ──────────────────────────────────── */
  const handleBurnCaptions = useCallback(async () => {
    const config = video.burnCaptionsConfig;
    if (!config || !video.captionsFile || video.justAudio) return;

    let srtContent: string;
    try {
      const srtRes = await fetch(resolveMediaUrl(video.captionsFile));
      if (!srtRes.ok) throw new Error('Failed to fetch captions file');
      const originalSrt = await srtRes.text();

      if (config.translate && config.translateTo) {
        onUpdate(video.uuid, {
          status: 'translating' as VideoStatus,
          error: null,
        });
        const langName = LANG_LABEL[config.translateTo] ?? config.translateTo;
        const messages: LlmMessage[] = [
          { role: 'system', content: buildTranslationPrompt(langName) },
          { role: 'user', content: originalSrt },
        ];
        const translated = await generate(messages);
        if (!translated) throw new Error('Translation returned empty result');
        srtContent = translated;
      } else {
        srtContent = originalSrt;
      }
    } catch (err) {
      console.error('Caption translation failed:', err);
      onUpdate(video.uuid, {
        status: 'error',
        error: t('errorTranslateFailed'),
      });
      return;
    }

    srtContent = srtContent.toUpperCase();

    runProcessing({
      activeStatus: 'burning' as VideoStatus,
      process: async (sourceUrl, onProgress) => {
        const primaryColour = hexToSSA(config.primaryColor, 100);
        const borderStyle = config.borderStyle ?? 3;
        const backColour =
          borderStyle === 3
            ? hexToSSA(config.bgColor, config.bgOpacity)
            : '&HFF000000';
        const outline = borderStyle === 3 ? 8 : (config.outlineThickness ?? 2);

        const animCfg = config.animation;
        const animation =
          animCfg && animCfg.type !== 'none'
            ? {
                types: [animCfg.type] as string[],
                fadeInMs: animCfg.fadeInMs,
                fadeOutMs: animCfg.fadeOutMs,
                slideOffset: animCfg.slideOffset,
                slideDurationMs: animCfg.slideDurationMs,
                blurStrength: animCfg.blurStrength,
                blurDurationMs: animCfg.blurDurationMs,
                zoomDurationMs: animCfg.zoomDurationMs,
                karaokeMode: animCfg.karaokeMode,
                karaokeHighlightColour: animCfg.karaokeHighlightColour
                  ? hexToSSA(animCfg.karaokeHighlightColour, 100)
                  : undefined,
              }
            : {};

        const fontStyle = config.fontStyle ?? 'normal';
        return burnSubtitles(
          sourceUrl,
          {
            srtContent,
            alignment: config.alignment,
            marginV: config.marginV,
            fontSize: config.fontSize,
            bold: fontStyle === 'bold' || fontStyle === 'bold-italic',
            italic: fontStyle === 'italic' || fontStyle === 'bold-italic',
            primaryColour,
            backColour,
            borderStyle,
            outline,
            animation,
          },
          onProgress,
        );
      },
      donePatch: { captionsBurned: true, burnCaptionsConfig: null },
      taskUpdate: { captionsBurned: true },
      errorKey: 'errorBurnCaptionsFailed',
      completeAfter: true,
    });
  }, [
    video.burnCaptionsConfig,
    video.captionsFile,
    video.justAudio,
    video.uuid,
    onUpdate,
    generate,
    runProcessing,
    burnSubtitles,
    t,
  ]);

  /* ── Resume interrupted FPS interpolation ───────────── */
  useEffect(() => {
    if (fpsResumeChecked.current) return;
    fpsResumeChecked.current = true;

    const needsResume =
      video.file &&
      video.fps !== 'original' &&
      !video.justAudio &&
      !video.fpsApplied &&
      (video.status === 'done' || video.status === 'processing');

    if (needsResume) queueMicrotask(() => handleInterpolateFps(true));
  }, [
    video.file,
    video.fps,
    video.justAudio,
    video.fpsApplied,
    video.status,
    handleInterpolateFps,
  ]);

  /* ── Resume interrupted H.264 conversion ─────────────── */
  useEffect(() => {
    if (convertResumeChecked.current) return;
    convertResumeChecked.current = true;

    const needsResume =
      video.file &&
      video.isH265 &&
      !video.justAudio &&
      !video.h264Converted &&
      video.status === 'converting';

    if (needsResume) queueMicrotask(() => handleConvertH264());
  }, [
    video.file,
    video.isH265,
    video.justAudio,
    video.h264Converted,
    video.status,
    handleConvertH264,
  ]);

  /* ── Resume interrupted H.265 conversion ──────────────────── */
  useEffect(() => {
    if (convertH265ResumeChecked.current) return;
    convertH265ResumeChecked.current = true;

    const needsResume =
      video.file &&
      !video.isH265 &&
      !video.justAudio &&
      !video.h265Converted &&
      video.status === 'converting';

    if (needsResume) queueMicrotask(() => handleConvertH265());
  }, [
    video.file,
    video.isH265,
    video.justAudio,
    video.h265Converted,
    video.status,
    handleConvertH265,
  ]);

  /* ── Resume interrupted black-bar removal ─────────────── */
  useEffect(() => {
    if (blackBarsResumeChecked.current) return;
    blackBarsResumeChecked.current = true;

    const needsResume =
      video.file &&
      !video.justAudio &&
      !video.blackBarsRemoved &&
      video.status === 'processing' &&
      (video.fps === 'original' || !!video.fpsApplied);

    if (needsResume) queueMicrotask(() => handleRemoveBlackBars());
  }, [
    video.file,
    video.justAudio,
    video.blackBarsRemoved,
    video.status,
    video.fps,
    video.fpsApplied,
    handleRemoveBlackBars,
  ]);

  /* ── Resume interrupted burn-captions ────────────────── */
  useEffect(() => {
    if (burnResumeChecked.current) return;
    burnResumeChecked.current = true;

    const needsResume =
      video.file &&
      !video.justAudio &&
      !video.captionsBurned &&
      video.burnCaptionsConfig !== null &&
      video.status === 'burning';

    if (needsResume) queueMicrotask(() => handleBurnCaptions());
  }, [
    video.file,
    video.justAudio,
    video.captionsBurned,
    video.burnCaptionsConfig,
    video.status,
    handleBurnCaptions,
  ]);

  /* ── Resume interrupted scale-down ───────────────────── */
  useEffect(() => {
    if (scaleDownResumeChecked.current) return;
    scaleDownResumeChecked.current = true;

    const needsResume =
      video.file &&
      !video.justAudio &&
      video.scaleDownTargetHeight != null &&
      video.status === 'processing';

    if (needsResume)
      queueMicrotask(() => handleScaleDown(video.scaleDownTargetHeight!));
  }, [
    video.file,
    video.justAudio,
    video.scaleDownTargetHeight,
    video.status,
    handleScaleDown,
  ]);

  /* ── Warn before closing during active processing ────── */
  useEffect(() => {
    if (!isProcessing) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isProcessing]);

  /* ── Auto-move errored items to completed ─────────────── */
  useEffect(() => {
    if (video.status === 'error') onComplete(video.uuid);
  }, [video.status, video.uuid, onComplete]);

  return (
    <Box
      elevation={2}
      borderRadius={14}
      className="vi-card"
      flexDirection="column"
      styles={{ overflow: 'hidden' }}
    >
      <PlatformIconBg
        platform={video.platform}
        position="bottom-left"
        widthPct={50}
        iconMarginLeft={20}
      />
      {/* ── Status bar ──────────────────────────────── */}
      <Box
        className="vi-status-bar"
        backgroundColor={STATUS_COLORS[video.status]}
      />
      {/* ── Header row ──────────────────────────────── */}
      <VideoCardHeader
        video={video}
        displayName={displayName}
        detailsOpen={detailsOpen}
        onToggleDetails={() => setDetailsOpen((p) => !p)}
        t={t}
      />
      {/* ── Details panel (collapsible) ───────────────── */}
      {detailsOpen ? (
        <VideoDetailsPanel
          video={video}
          ffmpegStatus={displayFFmpegStatus}
          ffmpegProgress={displayFFmpegProgress}
          ffmpegLastError={ffmpegLastError}
          ffmpegLastWarning={ffmpegLastWarning}
          ffmpegProcessingTime={ffmpegProcessingTime}
          ffmpegCores={ffmpegCores}
          uploading={uploading}
          t={t}
        />
      ) : null}
      {/* ── Media preview ───────────────────────────── */}
      <VideoMediaPreview
        downloadURL={video.downloadURL}
        justAudio={video.justAudio}
        thumbnail={video.thumbnail}
        compact
        opfsVideoUrl={video.opfsEnabled ? getUrls(video.uuid).videoUrl : null}
        opfsThumbnailUrl={
          video.opfsEnabled ? getUrls(video.uuid).thumbnailUrl : null
        }
      />
      {/* ── Progress bar ────────────────────────────── */}
      {isProcessing || displayFFmpegStatus !== 'idle' ? (
        <ProgressBar
          value={displayFFmpegProgress ? displayFFmpegProgress : undefined}
          margin="0"
        />
      ) : null}
      {/* ── Status hints ────────────────────────────── */}
      <VideoStatusHints
        ffmpegStatus={displayFFmpegStatus}
        ffmpegProgress={displayFFmpegProgress}
        videoStatus={video.status}
        uploading={uploading}
        conversionTarget={
          video.status === 'converting' && !video.isH265 ? 'h265' : 'h264'
        }
        t={t}
      />
      {/* ── Footer ──────────────────────────────────── */}
      <Box className="vi-footer">
        <VideoFooterLink video={video} />
        <Box
          className="vi-actions"
          display="flex"
          justifyContent="space-evenly"
        >
          <Button
            unstyled
            className="vi-icon-btn"
            onClick={() => setConfirmRemove(true)}
            aria-label={t('delete')}
            title={t('delete')}
            icon="/icons/delete-video.svg"
            iconSize="15px"
            iconColor="var(--foreground, #171717)"
          />
          <Button
            unstyled
            className="vi-icon-btn"
            onClick={handleCopy}
            aria-label={t('copyLink')}
            title={copying ? t('copied') : t('copyLink')}
            icon="/icons/copy.svg"
            iconSize="15px"
            iconColor={
              copying ? 'var(--accent, #06b6d4)' : 'var(--foreground, #171717)'
            }
          />
        </Box>
      </Box>
      {/* ── Delete confirmation ──────────────────────── */}
      {confirmRemove ? (
        <ConfirmationModal
          title={t('confirmDeleteTitle')}
          text={t('confirmDeleteText')}
          okCallback={() => {
            setConfirmRemove(false);
            onRemove(video.uuid);
          }}
          cancelCallback={() => setConfirmRemove(false)}
        />
      ) : null}
    </Box>
  );
}

export default PinnedVideoItemClient;
