'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { Box } from '@repo/ui/core-elements/box';
import { ProgressBar } from '@repo/ui/core-elements/progress-bar';
import { ConfirmationModal } from '@repo/ui/core-elements/confirmation-modal';
import { useFFmpeg } from '@repo/ui/use-ffmpeg';
import { useGroq } from '@repo/ui/use-groq';
import type { LlmMessage } from '@repo/ui/use-groq';
import type { DownloadVideoError } from '@repo/helpers/download-video';
import type { VideoStatus } from '@/lib/types';
import { TRANSLATE_LANGUAGES } from './burn-captions-modal';
import { usePollTask, type TaskData } from './use-poll-task';
import type { StoredVideo } from './use-video-store';
import {
  STATUS_COLORS,
  resolveMediaUrl,
  triggerBrowserDownload,
  downloadThumbnail,
  uploadProcessedVideo,
  VideoDetailsPanel,
  VideoMediaPreview,
  VideoStatusHints,
  VideoActions,
  VideoCardHeader,
  VideoFooterLink,
  isIOS,
} from './video-item-shared';
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

/* ── API types ──────────────────────────────────────── */

interface TaskCreateResponse {
  task: { _id: string; status: string };
  error?: DownloadVideoError;
}

/* ── Props ──────────────────────────────────────────── */

export interface PinnedVideoItemProps {
  video: StoredVideo;
  onUpdate: (uuid: string, patch: Partial<StoredVideo>) => void;
  onComplete: (uuid: string) => void;
  onRemove: (uuid: string) => void;
}

/* ── Component ──────────────────────────────────────── */

export function PinnedVideoItem({
  video,
  onUpdate,
  onComplete,
  onRemove,
}: PinnedVideoItemProps) {
  const t = useTranslations('VideoGrid');
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [copying, setCopying] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [localProgress, setLocalProgress] = useState<{
    status: 'loading' | 'processing';
    progress: number;
  } | null>(null);
  const downloadTriggered = useRef(false);
  const resumeChecked = useRef(false);
  const convertResumeChecked = useRef(false);
  const blackBarsResumeChecked = useRef(false);
  const burnResumeChecked = useRef(false);
  const pollResumeChecked = useRef(false);

  /* Groq client for subtitle translation */
  const { generate } = useGroq({
    proxyBase: '/api/groq',
    model: 'llama-3.3-70b-versatile',
  });

  /* Own FFmpeg WASM instance (dedicated Web Worker for this item) */
  const {
    status: ffmpegStatus,
    progress: ffmpegProgress,
    lastError: ffmpegLastError,
    lastWarning: ffmpegLastWarning,
    lastProcessingTime: ffmpegProcessingTime,
    cores: ffmpegCores,
    interpolateFps,
    convertToH264,
    removeBlackBars,
    burnSubtitles,
  } = useFFmpeg();

  const { startPolling, stopPolling } = usePollTask();

  /* Use local progress when actively processing, otherwise use hook status */
  const displayFFmpegStatus = localProgress?.status ?? ffmpegStatus;
  const displayFFmpegProgress = localProgress?.progress ?? ffmpegProgress;

  const isProcessing =
    video.status === 'downloading' ||
    video.status === 'processing' ||
    video.status === 'converting' ||
    video.status === 'burning' ||
    video.status === 'translating';
  const isBusy = isProcessing || video.status === 'queued';
  const displayName =
    video.name ??
    video.uploader ??
    (video.justAudio ? t('untitledAudio') : t('untitledVideo'));

  /* ── Try to complete: move to completed array if all processing is done ── */
  const tryComplete = useCallback(
    (uuid: string) => {
      /* Read the latest pinned state to decide if we can complete.
         We check the flags that matter — if any post-processing is pending,
         don't complete yet, the resume effects will handle it. */
      onComplete(uuid);
    },
    [onComplete],
  );

  /* ── Run FFmpeg processing (own instance, no shared queue) ── */
  const runProcessing = useCallback(
    async (opts: {
      sourceFile?: string;
      activeStatus: VideoStatus;
      process: (
        sourceUrl: string,
        onProgress?: (p: number) => void,
      ) => Promise<{ objectUrl: string; blob: Blob }>;
      donePatch: Partial<StoredVideo>;
      taskUpdate: Record<string, unknown>;
      errorKey: string;
      downloadPrefix?: string;
      onError?: () => void;
      /** If true, call tryComplete after finishing. */
      completeAfter?: boolean;
    }) => {
      const file = opts.sourceFile ?? video.file;
      if (!file || video.justAudio) return;

      try {
        onUpdate(video.uuid, { status: opts.activeStatus, error: null });
        const sourceUrl = `${window.location.origin}${resolveMediaUrl(`/api/media/${file}`)}`;
        setLocalProgress({ status: 'loading', progress: 0 });
        const { objectUrl, blob } = await opts.process(sourceUrl, (p) => {
          setLocalProgress({ status: 'processing', progress: p });
        });
        setLocalProgress(null);

        onUpdate(video.uuid, { status: 'done', ...opts.donePatch });

        const uploadPromise = uploadProcessedVideo(
          file,
          blob,
          opts.taskUpdate,
          setUploading,
        );

        if (video.autoDownload) {
          const prefix = opts.downloadPrefix ?? 'video';
          const downloadName = `${video.name ?? prefix}-${Date.now()}-${file}`;
          triggerBrowserDownload(objectUrl, downloadName);
        }

        const newFile = await uploadPromise;
        if (newFile) {
          onUpdate(video.uuid, {
            file: newFile,
            downloadURL: `/api/media/${newFile}`,
          });
        }

        if (opts.completeAfter) {
          tryComplete(video.uuid);
        }
      } catch (err) {
        console.error(`${opts.errorKey} failed:`, err);
        setLocalProgress(null);
        onUpdate(video.uuid, {
          status: 'error',
          error: t(opts.errorKey),
        });
        opts.onError?.();
      }
    },
    [
      video.uuid,
      video.file,
      video.justAudio,
      video.autoDownload,
      video.name,
      onUpdate,
      t,
      tryComplete,
    ],
  );

  /* ── FPS interpolation handler ──────────────────────── */
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

  /* ── H.265 → H.264 conversion handler ──────────────── */
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

  /* ── Remove black bars handler ───────────────────── */
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

  /* ── Burn captions handler ──────────────────────────── */
  const handleBurnCaptions = useCallback(async () => {
    const config = video.burnCaptionsConfig;
    if (!config || !video.captionsFile || video.justAudio) return;

    /* 1. Fetch the SRT and optionally translate it via Groq */
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

    /* 2. Burn the (possibly translated) SRT into the video */
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

  /* ── Handle completed task from polling ────────────── */
  const handleTaskDone = useCallback(
    (task: TaskData) => {
      const file = task.file;
      const name = task.name;
      const downloadURL = file ? `/api/media/${file}` : null;

      onUpdate(video.uuid, {
        status: 'done',
        file: file ?? null,
        name: name ?? null,
        downloadURL,
        thumbnail: task.thumbnail ?? null,
        duration: task.duration ?? null,
        uploader: task.uploader ?? null,
        isH265: task.isH265 ?? false,
        sourceFps: task.sourceFps ?? null,
        width: task.width ?? null,
        height: task.height ?? null,
        captionsFile: task.captionsFile
          ? `/api/media/${task.captionsFile}`
          : null,
        captionUrl: null,
      });

      /* FPS interpolation requested — chain into processing before completing. */
      const willInterpolateFps =
        video.fps !== 'original' && !video.justAudio && file;
      if (willInterpolateFps) {
        /* Chain FPS interpolation before completing. */
        void runProcessing({
          sourceFile: file,
          activeStatus: 'processing',
          process: (url, onProgress) =>
            interpolateFps(url, Number(video.fps), onProgress),
          donePatch: { fpsApplied: true },
          taskUpdate: { fpsApplied: true },
          errorKey: 'errorFfmpegFailed',
          downloadPrefix: 'video',
          completeAfter: true,
        });
        return;
      }

      /* Complete — auto-download if configured. */
      if (video.autoDownload && downloadURL && file) {
        triggerBrowserDownload(
          downloadURL,
          `${name ?? 'audio'}-${Date.now()}-${file}`,
        );
        if (video.justAudio) {
          const thumbSrc = task.thumbnail
            ? resolveMediaUrl(`/api/media/${task.thumbnail}`)
            : null;
          if (thumbSrc) {
            downloadThumbnail(thumbSrc, name);
          }
        }
      }
      tryComplete(video.uuid);
    },
    [
      onUpdate,
      video.uuid,
      video.autoDownload,
      video.fps,
      video.justAudio,
      runProcessing,
      interpolateFps,
      tryComplete,
    ],
  );

  /* ── Start polling for a given task ID ───────────── */
  const pollForTask = useCallback(
    (taskId: string) => {
      startPolling({
        taskId,
        onUpdate: (task) => {
          if (task.status === 'done') {
            handleTaskDone(task);
          } else if (task.status === 'error') {
            onUpdate(video.uuid, {
              status: 'error',
              error: task.error?.message ?? 'Download failed',
            });
          }
        },
      });
    },
    [startPolling, handleTaskDone, onUpdate, video.uuid],
  );

  /* ── Download handler ───────────────────────────── */
  const handleDownload = useCallback(async () => {
    onUpdate(video.uuid, { error: null });

    try {
      const res = await fetch('/api/download-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: video.originalURL,
          justAudio: video.justAudio,
          checkCodec: video.platform === 'tiktok',
          iosDevice: isIOS(),
          ...(video.maxHeight != null && { maxHeight: video.maxHeight }),
          ...(video.captionsEnabled && { captionsEnabled: true }),
          ...(video.captionUrl && { captionUrl: video.captionUrl }),
        }),
      });

      const data: TaskCreateResponse = await res.json();

      if (!res.ok || data.error) {
        onUpdate(video.uuid, {
          status: 'error',
          error: data.error?.message ?? 'Failed to start download',
        });
        return;
      }

      const taskId = data.task._id;
      onUpdate(video.uuid, { status: 'downloading', taskId, error: null });
      pollForTask(taskId);
    } catch {
      onUpdate(video.uuid, {
        status: 'error',
        error: t('errorGeneric'),
      });
    }
  }, [
    onUpdate,
    video.uuid,
    video.originalURL,
    video.justAudio,
    video.platform,
    video.maxHeight,
    video.captionsEnabled,
    video.captionUrl,
    pollForTask,
    t,
  ]);

  /* ── Copy link ──────────────────────────────────── */
  const handleCopy = useCallback(async () => {
    try {
      setCopying(true);
      await navigator.clipboard.writeText(video.originalURL);
      setTimeout(() => setCopying(false), 1200);
    } catch {
      setCopying(false);
    }
  }, [video.originalURL]);

  /* ── Re-download (trigger browser save) ─────────── */
  const handleRedownload = useCallback(() => {
    if (!video.downloadURL) return;
    triggerBrowserDownload(
      video.downloadURL,
      `${video.name ?? (video.justAudio ? 'audio' : 'video')}-${Date.now()}`,
    );
    if (video.justAudio) {
      const thumbSrc = video.thumbnail
        ? resolveMediaUrl(`/api/media/${video.thumbnail}`)
        : null;
      if (thumbSrc) {
        downloadThumbnail(thumbSrc, video.name);
      }
    }
  }, [video.downloadURL, video.name, video.justAudio, video.thumbnail]);

  /* ── Auto-trigger download for newly added (pending) items ── */
  useEffect(() => {
    if (video.status === 'pending' && !downloadTriggered.current) {
      downloadTriggered.current = true;
      queueMicrotask(() => handleDownload());
    }
  }, [video.status, handleDownload]);

  /* ── Resume polling after page refresh ─────────────── */
  useEffect(() => {
    if (pollResumeChecked.current) return;
    pollResumeChecked.current = true;

    if (video.status === 'downloading' && video.taskId) {
      pollForTask(video.taskId);
    }
  }, [video.status, video.taskId, pollForTask]);

  /* ── Resume interrupted FPS interpolation on mount ── */
  useEffect(() => {
    if (resumeChecked.current) return;
    resumeChecked.current = true;

    const needsResume =
      video.file &&
      video.fps !== 'original' &&
      !video.justAudio &&
      !video.fpsApplied &&
      (video.status === 'done' || video.status === 'processing');

    if (needsResume) {
      queueMicrotask(() => handleInterpolateFps(true));
    }
  }, [
    video.file,
    video.fps,
    video.justAudio,
    video.fpsApplied,
    video.status,
    handleInterpolateFps,
  ]);

  /* ── Resume interrupted H.264 conversion on mount ── */
  useEffect(() => {
    if (convertResumeChecked.current) return;
    convertResumeChecked.current = true;

    const needsResume =
      video.file &&
      video.isH265 &&
      !video.justAudio &&
      !video.h264Converted &&
      video.status === 'converting';

    if (needsResume) {
      queueMicrotask(() => handleConvertH264());
    }
  }, [
    video.file,
    video.isH265,
    video.justAudio,
    video.h264Converted,
    video.status,
    handleConvertH264,
  ]);

  /* ── Resume interrupted black-bar removal on mount ── */
  useEffect(() => {
    if (blackBarsResumeChecked.current) return;
    blackBarsResumeChecked.current = true;

    const needsResume =
      video.file &&
      !video.justAudio &&
      !video.blackBarsRemoved &&
      video.status === 'processing' &&
      // Not waiting for FPS interpolation, which also uses 'processing'
      (video.fps === 'original' || !!video.fpsApplied);

    if (needsResume) {
      queueMicrotask(() => handleRemoveBlackBars());
    }
  }, [
    video.file,
    video.justAudio,
    video.blackBarsRemoved,
    video.status,
    video.fps,
    video.fpsApplied,
    handleRemoveBlackBars,
  ]);

  /* ── Resume interrupted burn-captions on mount ── */
  useEffect(() => {
    if (burnResumeChecked.current) return;
    burnResumeChecked.current = true;

    const needsResume =
      video.file &&
      !video.justAudio &&
      !video.captionsBurned &&
      video.burnCaptionsConfig !== null &&
      video.status === 'burning';

    if (needsResume) {
      queueMicrotask(() => handleBurnCaptions());
    }
  }, [
    video.file,
    video.justAudio,
    video.captionsBurned,
    video.burnCaptionsConfig,
    video.status,
    handleBurnCaptions,
  ]);

  /* ── Stop polling when this card unmounts ── */
  useEffect(() => {
    const taskId = video.taskId;
    return () => {
      if (taskId) stopPolling(taskId);
    };
  }, [video.taskId, stopPolling]);

  /* ── Warn before closing during active processing ── */
  useEffect(() => {
    if (!isProcessing) return;

    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };

    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isProcessing]);

  /* ── Auto-move errored items to completed array ──── */
  useEffect(() => {
    if (video.status === 'error') {
      onComplete(video.uuid);
    }
  }, [video.status, video.uuid, onComplete]);

  return (
    <Box
      elevation={2}
      borderRadius={14}
      className="vi-card"
      flexDirection="column"
      styles={{ overflow: 'hidden' }}
    >
      {/* ── Status bar ────────────────────────────── */}
      <Box
        className="vi-status-bar"
        backgroundColor={STATUS_COLORS[video.status]}
      />

      {/* ── Header row ────────────────────────────── */}
      <VideoCardHeader
        video={video}
        displayName={displayName}
        detailsOpen={detailsOpen}
        onToggleDetails={() => setDetailsOpen((p) => !p)}
        t={t}
      />

      {/* ── Details panel (collapsible) ───────────── */}
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

      {/* ── Media preview ─────────────────────────── */}
      <VideoMediaPreview
        downloadURL={video.downloadURL}
        justAudio={video.justAudio}
        thumbnail={video.thumbnail}
        compact={isBusy}
      />

      {/* ── Loading indicator ─────────────────────── */}
      {isProcessing || displayFFmpegStatus !== 'idle' ? (
        <ProgressBar
          value={displayFFmpegProgress ? displayFFmpegProgress : undefined}
          margin="0"
        />
      ) : null}

      {/* ── Status hints ──────────────────────────── */}
      <VideoStatusHints
        ffmpegStatus={displayFFmpegStatus}
        ffmpegProgress={displayFFmpegProgress}
        videoStatus={video.status}
        uploading={uploading}
        t={t}
      />
      {/* ── Footer actions ────────────────────────── */}
      <Box className="vi-footer">
        <VideoFooterLink video={video} />

        <VideoActions
          video={video}
          isBusy={isBusy}
          copying={copying}
          onCopy={handleCopy}
          onRetry={handleDownload}
          onRedownload={handleRedownload}
          onDelete={() => setConfirmRemove(true)}
          t={t}
          extraActionsOpen={false}
          onToggleExtra={() => null}
        />
      </Box>

      {/* ── Confirmation modals ───────────────────── */}
      {confirmRemove ? (
        <ConfirmationModal
          title={t('confirmDeleteTitle')}
          text={t('confirmDeleteText')}
          okCallback={() => {
            setConfirmRemove(false);
            if (video.taskId) {
              stopPolling(video.taskId);
              fetch(`/api/download-video/${video.taskId}`, {
                method: 'DELETE',
              }).catch(console.error);
            }
            onRemove(video.uuid);
          }}
          cancelCallback={() => setConfirmRemove(false)}
        />
      ) : null}
    </Box>
  );
}

export default PinnedVideoItem;
