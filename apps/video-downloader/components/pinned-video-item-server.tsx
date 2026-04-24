'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { Box } from '@repo/ui/core-elements/box';
import { ProgressBar } from '@repo/ui/core-elements/progress-bar';
import { ConfirmationModal } from '@repo/ui/core-elements/confirmation-modal';
import { Typography } from '@repo/ui/core-elements/typography';
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
  VideoDetailsPanel,
  VideoMediaPreview,
  VideoActions,
  VideoCardHeader,
  VideoFooterLink,
  isIOS,
} from './video-item-shared';
import './video-item.css';

/* ── Constants ──────────────────────────────────────── */

const THIS_DEVICE_UUID = '__local__';

const LANG_LABEL: Record<string, string> = Object.fromEntries(
  TRANSLATE_LANGUAGES.map((l) => [l.value, l.label]),
);

/* ── Helpers ────────────────────────────────────────── */

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

/** Retry fetch on network errors (not on 4xx/5xx). */
async function fetchWithRetry(
  url: string,
  options: RequestInit,
  maxRetries = 3,
): Promise<Response> {
  let lastErr: Error = new Error('Unknown error');
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fetch(url, options);
    } catch (err) {
      lastErr = err instanceof Error ? err : new Error(String(err));
      if (attempt < maxRetries - 1) {
        await new Promise((r) => setTimeout(r, 800 * Math.pow(2, attempt)));
      }
    }
  }
  throw lastErr;
}

/* ── API types ──────────────────────────────────────── */

interface TaskCreateResponse {
  task: { _id: string; status: string };
  error?: DownloadVideoError;
}

/* ── Props ──────────────────────────────────────────── */

export interface PinnedVideoItemServerProps {
  video: StoredVideo;
  onUpdate: (uuid: string, patch: Partial<StoredVideo>) => void;
  onComplete: (uuid: string) => void;
  onRemove: (uuid: string) => void;
}

/* ── Component ──────────────────────────────────────── */

export function PinnedVideoItemServer({
  video,
  onUpdate,
  onComplete,
  onRemove,
}: PinnedVideoItemServerProps) {
  const t = useTranslations('VideoGrid');
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [copying, setCopying] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [jobProgress, setJobProgress] = useState(0);
  const [jobPhase, setJobPhase] = useState<'idle' | 'dispatching' | 'polling'>(
    'idle',
  );

  const downloadTriggered = useRef(false);
  const pollResumeChecked = useRef(false);
  const fpsResumeChecked = useRef(false);
  const convertResumeChecked = useRef(false);
  const blackBarsResumeChecked = useRef(false);
  const burnResumeChecked = useRef(false);
  const pollForTaskRef = useRef<
    (
      taskId: string,
      opts?: {
        donePatch?: Partial<StoredVideo>;
        completeAfter?: boolean;
        activeStatus?: VideoStatus;
      },
    ) => void
  >(() => {});

  const { generate } = useGroq({
    proxyBase: '/api/groq',
    model: 'llama-3.3-70b-versatile',
  });
  const { startPolling, stopPolling } = usePollTask();

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

  /* ── Dispatch FFmpeg job to server (with fallback) ─── */
  const runServerProcessing = useCallback(
    async (opts: {
      sourceFile?: string;
      activeStatus: VideoStatus;
      op:
        | 'interpolateFps'
        | 'removeBlackBars'
        | 'convertToH264'
        | 'burnSubtitles';
      extraParams?: Record<string, unknown>;
      donePatch: Partial<StoredVideo>;
      errorKey: string;
      completeAfter?: boolean;
    }) => {
      const file = opts.sourceFile ?? video.file;
      if (!file || video.justAudio) return;

      // If a server task was previously dispatched for this job, check whether it
      // is still running before creating a duplicate. This handles the case where
      // the browser was closed mid-job and has just reopened.
      if (video.serverTaskId) {
        try {
          const checkRes = await fetch(
            `/api/download-video/${video.serverTaskId}`,
          );
          if (checkRes.ok) {
            const checkData = (await checkRes.json()) as { task: TaskData };
            const existing = checkData.task;
            if (
              existing.status === 'processing' ||
              existing.status === 'converting' ||
              existing.status === 'burning' ||
              existing.status === 'translating' ||
              existing.status === 'done'
            ) {
              onUpdate(video.uuid, { status: opts.activeStatus, error: null });
              setJobPhase('polling');
              setJobProgress(existing.progress ?? 0);
              pollForTaskRef.current(video.serverTaskId, {
                donePatch: opts.donePatch,
                completeAfter: opts.completeAfter,
                activeStatus: opts.activeStatus,
              });
              return;
            }
          }
        } catch {
          // Preflight fetch failed — fall through to re-dispatch
        }
      }

      onUpdate(video.uuid, { status: opts.activeStatus, error: null });
      setJobPhase('dispatching');
      setJobProgress(0);

      const params: Record<string, unknown> = {
        inputFile: file,
        ...opts.extraParams,
      };

      const tryDispatch = async (
        clientUuid: string,
      ): Promise<string | null> => {
        try {
          const res = await fetchWithRetry('/api/server-processing', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              clientUuid,
              op: opts.op,
              taskId: video.taskId ?? '',
              params,
            }),
          });

          // Server unavailable or client not connected
          if (res.status === 409 || res.status === 503 || res.status === 404) {
            return null;
          }

          if (!res.ok) {
            const data = (await res.json().catch(() => ({}))) as {
              error?: string;
            };
            throw new Error(data.error ?? `Server error ${res.status}`);
          }

          const data = (await res.json()) as { taskId: string };
          return data.taskId;
        } catch (err) {
          // Re-throw non-availability errors so the caller shows them
          if (err instanceof Error && !err.message.startsWith('Server error')) {
            throw err;
          }
          return null;
        }
      };

      try {
        let dispatchedTaskId: string | null = await tryDispatch(
          video.wsClientUuid!,
        );

        // Preferred server unavailable — try any other connected server
        if (!dispatchedTaskId) {
          const clientsRes = await fetch('/api/ws-clients').catch(() => null);
          const clients = clientsRes?.ok
            ? ((await clientsRes.json()) as Array<{
                uuid: string;
                connected: boolean;
              }>)
            : [];
          const alternative = clients.find(
            (c) => c.connected && c.uuid !== video.wsClientUuid,
          );
          if (alternative) {
            dispatchedTaskId = await tryDispatch(alternative.uuid);
            if (dispatchedTaskId) {
              onUpdate(video.uuid, { wsClientUuid: alternative.uuid });
            }
          }
        }

        // No servers available — fall back to PinnedVideoItem (local WASM)
        if (!dispatchedTaskId) {
          setJobPhase('idle');
          onUpdate(video.uuid, {
            wsClientUuid: THIS_DEVICE_UUID,
            serverTaskId: null,
          });
          return;
        }

        // Task dispatched — persist the task ID then start polling.
        onUpdate(video.uuid, { serverTaskId: dispatchedTaskId });
        pollForTaskRef.current(dispatchedTaskId, {
          donePatch: opts.donePatch,
          completeAfter: opts.completeAfter,
          activeStatus: opts.activeStatus,
        });
      } catch (err) {
        console.error(`${opts.errorKey} failed:`, err);
        setJobPhase('idle');
        onUpdate(video.uuid, {
          status: 'error',
          error: t(opts.errorKey),
          serverTaskId: null,
        });
      }
    },
    [
      video.uuid,
      video.file,
      video.justAudio,
      video.taskId,
      video.wsClientUuid,
      video.serverTaskId,
      onUpdate,
      t,
    ],
  );

  /* ── FPS interpolation ──────────────────────────────── */
  const handleInterpolateFps = useCallback(
    (completeAfter = true) =>
      runServerProcessing({
        activeStatus: 'processing',
        op: 'interpolateFps',
        extraParams: { fps: Number(video.fps) },
        donePatch: { fpsApplied: true },
        errorKey: 'errorFfmpegFailed',
        completeAfter,
      }),
    [runServerProcessing, video.fps],
  );

  /* ── H.265 → H.264 conversion ───────────────────────── */
  const handleConvertH264 = useCallback(
    () =>
      runServerProcessing({
        activeStatus: 'converting',
        op: 'convertToH264',
        donePatch: { h264Converted: true, isH265: false },
        errorKey: 'errorConvertFailed',
        completeAfter: true,
      }),
    [runServerProcessing],
  );

  /* ── Remove black bars ──────────────────────────────── */
  const handleRemoveBlackBars = useCallback(
    () =>
      runServerProcessing({
        activeStatus: 'processing',
        op: 'removeBlackBars',
        donePatch: { blackBarsRemoved: true },
        errorKey: 'errorRemoveBlackBarsFailed',
        completeAfter: true,
      }),
    [runServerProcessing],
  );

  /* ── Burn captions ──────────────────────────────────── */
  const handleBurnCaptions = useCallback(async () => {
    const config = video.burnCaptionsConfig;
    if (!config || !video.captionsFile || video.justAudio) return;

    // 1. Fetch + optionally translate SRT
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
      console.error('Caption preparation failed:', err);
      onUpdate(video.uuid, {
        status: 'error',
        error: t('errorTranslateFailed'),
      });
      return;
    }

    srtContent = srtContent.toUpperCase();

    // 2. Build style params
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
        : ({} as Record<string, unknown>);

    const fontStyle = config.fontStyle ?? 'normal';

    void runServerProcessing({
      activeStatus: 'burning' as VideoStatus,
      op: 'burnSubtitles',
      extraParams: {
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
      donePatch: { captionsBurned: true, burnCaptionsConfig: null },
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
    runServerProcessing,
    t,
  ]);

  /* ── Handle completed download task ──────────────────── */
  const tryComplete = useCallback(
    (uuid: string) => onComplete(uuid),
    [onComplete],
  );

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

      // Chain FPS interpolation if requested
      const willInterpolateFps =
        video.fps !== 'original' && !video.justAudio && file;
      if (willInterpolateFps) {
        void runServerProcessing({
          sourceFile: file!,
          activeStatus: 'processing',
          op: 'interpolateFps',
          extraParams: { fps: Number(video.fps) },
          donePatch: { fpsApplied: true },
          errorKey: 'errorFfmpegFailed',
          completeAfter: true,
        });
        return;
      }

      if (video.autoDownload && downloadURL && file) {
        triggerBrowserDownload(
          downloadURL,
          `${name ?? (video.justAudio ? 'audio' : 'video')}-${Date.now()}-${file}`,
        );
        if (video.justAudio) {
          const thumbSrc = task.thumbnail
            ? resolveMediaUrl(`/api/media/${task.thumbnail}`)
            : null;
          if (thumbSrc) downloadThumbnail(thumbSrc, name);
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
      runServerProcessing,
      tryComplete,
    ],
  );

  const handleServerTaskDone = useCallback(
    (
      task: TaskData,
      donePatch: Partial<StoredVideo>,
      completeAfter?: boolean,
    ) => {
      const file = task.file;
      const name = task.name;
      const downloadURL = file ? `/api/media/${file}` : null;

      setJobPhase('idle');
      setJobProgress(task.progress ?? 100);

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
        serverTaskId: null,
        ...donePatch,
      });

      if (video.autoDownload && downloadURL && file) {
        triggerBrowserDownload(
          downloadURL,
          `${name ?? (video.justAudio ? 'audio' : 'video')}-${Date.now()}-${file}`,
        );
      }

      if (completeAfter) onComplete(video.uuid);
    },
    [video.uuid, video.autoDownload, video.justAudio, onUpdate, onComplete],
  );

  /* ── Poll download task ─────────────────────────────── */
  const pollForTask = useCallback(
    (
      taskId: string,
      opts?: {
        donePatch?: Partial<StoredVideo>;
        completeAfter?: boolean;
        activeStatus?: VideoStatus;
      },
    ) => {
      startPolling({
        taskId,
        onUpdate: (task) => {
          if (
            task.status === 'processing' ||
            task.status === 'converting' ||
            task.status === 'burning' ||
            task.status === 'translating'
          ) {
            setJobPhase('polling');
            setJobProgress(task.progress ?? 0);
            onUpdate(video.uuid, {
              // Use the caller-supplied activeStatus when the server reports the
              // generic 'processing' state so that e.g. 'burning' / 'converting'
              // are not overwritten by the server's generic running status.
              status:
                task.status === 'processing' && opts?.activeStatus
                  ? opts.activeStatus
                  : task.status,
              error: null,
              file: task.file ?? video.file,
            });
            return;
          }

          if (task.status === 'done' && opts?.donePatch) {
            handleServerTaskDone(task, opts.donePatch, opts.completeAfter);
          } else if (task.status === 'done') {
            handleTaskDone(task);
          } else if (task.status === 'error') {
            setJobPhase('idle');
            onUpdate(video.uuid, {
              status: 'error',
              error: task.error?.message ?? 'Download failed',
              serverTaskId: null,
            });
          }
        },
      });
    },
    [
      startPolling,
      handleTaskDone,
      handleServerTaskDone,
      onUpdate,
      video.uuid,
      video.file,
    ],
  );

  pollForTaskRef.current = pollForTask;

  /* ── Start download ─────────────────────────────────── */
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
      onUpdate(video.uuid, { status: 'error', error: t('errorGeneric') });
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

  /* ── Re-download ────────────────────────────────────── */
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
      if (thumbSrc) downloadThumbnail(thumbSrc, video.name);
    }
  }, [video.downloadURL, video.name, video.justAudio, video.thumbnail]);

  /* ── Auto-trigger for newly added items ─────────────── */
  useEffect(() => {
    if (video.status === 'pending' && !downloadTriggered.current) {
      downloadTriggered.current = true;
      queueMicrotask(() => handleDownload());
    }
  }, [video.status, handleDownload]);

  /* ── Resume download polling after refresh ───────────── */
  useEffect(() => {
    if (pollResumeChecked.current) return;
    pollResumeChecked.current = true;
    if (!video.taskId) return;

    // Only resume polling here for active downloads. For processing/converting/burning/translating
    // states, the action-specific resume effects (fpsResumeChecked, convertResumeChecked, etc.)
    // re-dispatch to the server and set up their own polling via runServerProcessing. Starting a
    // poll here races with that dispatch: the DB task is still 'done' from the previous step, so
    // the first poll would incorrectly trigger handleServerTaskDone and complete the video early.
    if (video.status === 'downloading') {
      pollForTask(video.taskId);
    }
  }, [video.taskId, video.status, pollForTask]);

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

  /* ── Stop download poll on unmount ───────────────────── */
  useEffect(() => {
    const taskId = video.taskId;
    return () => {
      if (taskId) stopPolling(taskId);
    };
  }, [video.taskId, stopPolling]);

  /* ── Warn before closing during processing ────────────── */
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

  /* ── Status hint text ────────────────────────────────── */
  const statusHint = (() => {
    if (jobPhase === 'dispatching') return t('serverDispatching');
    if (jobPhase === 'polling' && jobProgress > 0)
      return t('serverProcessing', { progress: jobProgress });
    if (video.status === 'translating') return t('translatingCaptions');
    if (video.status === 'queued') return t('queueWaiting');
    return null;
  })();

  const showProgressBar =
    isProcessing || jobPhase === 'dispatching' || jobPhase === 'polling';
  const progressValue =
    jobPhase === 'polling' && jobProgress > 0 ? jobProgress : undefined;

  return (
    <Box
      elevation={2}
      borderRadius={14}
      className="vi-card"
      flexDirection="column"
      styles={{ overflow: 'hidden' }}
    >
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
          ffmpegStatus={
            jobPhase === 'polling'
              ? 'processing'
              : jobPhase === 'dispatching'
                ? 'loading'
                : 'idle'
          }
          ffmpegProgress={jobProgress}
          ffmpegLastError={null}
          ffmpegLastWarning={null}
          ffmpegProcessingTime={null}
          ffmpegCores={null}
          uploading={false}
          t={t}
        />
      ) : null}

      {/* ── Media preview ───────────────────────────── */}
      <VideoMediaPreview
        downloadURL={video.downloadURL}
        justAudio={video.justAudio}
        thumbnail={video.thumbnail}
        compact={isBusy}
      />

      {/* ── Progress bar ────────────────────────────── */}
      {showProgressBar ? (
        <ProgressBar value={progressValue} margin="0" />
      ) : null}

      {/* ── Status hint ─────────────────────────────── */}
      {statusHint ? (
        <Typography variant="caption" className="vi-ffmpeg-hint">
          {statusHint}
        </Typography>
      ) : null}

      {/* ── Footer actions ──────────────────────────── */}
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

      {/* ── Delete confirmation ──────────────────────── */}
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

export default PinnedVideoItemServer;
