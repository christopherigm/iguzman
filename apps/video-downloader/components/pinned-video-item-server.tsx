'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { Box } from '@repo/ui/core-elements/box';
import { ProgressBar } from '@repo/ui/core-elements/progress-bar';
import { ConfirmationModal } from '@repo/ui/core-elements/confirmation-modal';
import { Typography } from '@repo/ui/core-elements/typography';
import { Button } from '@repo/ui/core-elements/button';
import { useGroq } from '@repo/ui/use-groq';
import type { LlmMessage } from '@repo/ui/use-groq';
import type { VideoStatus } from '@/lib/types';
import { TRANSLATE_LANGUAGES } from './burn-captions-modal';
import { usePollTask, type TaskData } from './use-poll-task';
import type { StoredVideo } from './use-video-store';
import {
  STATUS_COLORS,
  resolveMediaUrl,
  VideoCardHeader,
  VideoDetailsPanel,
  VideoMediaPreview,
  VideoFooterLink,
  PlatformIconBg,
} from './video-item-shared';
import { useOPFSUrls } from './opfs-url-context';
import { readFromOPFS } from '@/lib/opfs';
import { saveProcessedToOPFS } from '@/lib/opfs-processing';
import './video-item.css';

/* ── Constants ──────────────────────────────────────── */

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
  const { getUrls, registerUrls } = useOPFSUrls();
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [copying, setCopying] = useState(false);
  const [jobProgress, setJobProgress] = useState(0);
  const [jobPhase, setJobPhase] = useState<'idle' | 'dispatching' | 'polling'>(
    'idle',
  );
  const [conversionTarget, setConversionTarget] = useState<'h264' | 'h265'>('h264');
  const [opfsUploading, setOpfsUploading] = useState(false);
  const [opfsMigrating, setOpfsMigrating] = useState(false);

  const fpsResumeChecked = useRef(false);
  const convertResumeChecked = useRef(false);
  const convertH265ResumeChecked = useRef(false);
  const blackBarsResumeChecked = useRef(false);
  const burnResumeChecked = useRef(false);
  const scaleDownResumeChecked = useRef(false);
  // Tracks the server input file so handleServerTaskDone can delete it after
  // the result is saved to OPFS (both the uploaded-from-OPFS case and the
  // still-on-server case use the same cleanup path).
  const opfsInputFileRef = useRef<string | null>(null);
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
  const { startPolling } = usePollTask();

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

  /* ── Dispatch FFmpeg job to server ──────────────────── */
  const runServerProcessing = useCallback(
    async (opts: {
      sourceFile?: string;
      activeStatus: VideoStatus;
      op:
        | 'interpolateFps'
        | 'removeBlackBars'
        | 'convertToH264'
        | 'convertToH265'
        | 'burnSubtitles'
        | 'scaleDown';
      extraParams?: Record<string, unknown>;
      donePatch: Partial<StoredVideo>;
      errorKey: string;
      completeAfter?: boolean;
    }) => {
      if (video.justAudio) return;

      // If a server task was previously dispatched, check whether it is still
      // running before creating a duplicate (handles browser-closed-mid-job).
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
          // Preflight failed — fall through to re-dispatch
        }
      }

      // For OPFS videos whose server copy was deleted, upload the local blob
      // to the server so the server FFmpeg agent has a file to work with.
      let file = opts.sourceFile ?? video.file;
      if (
        video.opfsEnabled &&
        video.opfsStored &&
        video.opfsKey &&
        video.serverFileDeleted
      ) {
        setOpfsUploading(true);
        try {
          const opfsFile = await readFromOPFS(video.opfsKey);
          const ext = video.opfsKey.split('.').pop() ?? 'mp4';
          const uploadRes = await fetch(
            `/api/media?ext=${encodeURIComponent(ext)}`,
            { method: 'POST', body: opfsFile },
          );
          if (!uploadRes.ok) throw new Error('Upload failed');
          const { file: uploadedFile } = (await uploadRes.json()) as {
            file: string;
          };
          file = uploadedFile;
          opfsInputFileRef.current = uploadedFile;
          onUpdate(video.uuid, {
            file: uploadedFile,
            serverFileDeleted: false,
          });
        } catch {
          setOpfsUploading(false);
          onUpdate(video.uuid, {
            status: 'error',
            error: t('errorOpfsUploadFailed'),
          });
          return;
        }
        setOpfsUploading(false);
      }

      if (!file) return;

      // For OPFS videos whose server copy is still present, track the input
      // file so handleServerTaskDone can clean it up after OPFS save-back.
      if (video.opfsEnabled && video.opfsStored && !video.serverFileDeleted) {
        opfsInputFileRef.current = file;
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

        if (!dispatchedTaskId) {
          setJobPhase('idle');
          onUpdate(video.uuid, {
            status: 'error',
            error: t('errorNoServerAvailable'),
            serverTaskId: null,
          });
          return;
        }

        onUpdate(video.uuid, { serverTaskId: dispatchedTaskId });
        pollForTaskRef.current(dispatchedTaskId, {
          donePatch: opts.donePatch,
          completeAfter: opts.completeAfter,
          activeStatus: opts.activeStatus,
        });
      } catch (err) {
        console.error(`${opts.errorKey} failed:`, err);
        setJobPhase('idle');
        const detail = err instanceof Error ? err.message : String(err);
        onUpdate(video.uuid, {
          status: 'error',
          error: `${t(opts.errorKey)}: ${detail}`,
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
      video.opfsEnabled,
      video.opfsStored,
      video.opfsKey,
      video.serverFileDeleted,
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
    () => {
      setConversionTarget('h264');
      return runServerProcessing({
        activeStatus: 'converting',
        op: 'convertToH264',
        donePatch: { h264Converted: true, isH265: false },
        errorKey: 'errorConvertFailed',
        completeAfter: true,
      });
    },
    [runServerProcessing],
  );

  /* ── H.264 → H.265 conversion ───────────────────────── */
  const handleConvertH265 = useCallback(
    () => {
      setConversionTarget('h265');
      return runServerProcessing({
        activeStatus: 'converting',
        op: 'convertToH265',
        donePatch: { h265Converted: true, isH265: true },
        errorKey: 'errorConvertH265Failed',
        completeAfter: true,
      });
    },
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
      return runServerProcessing({
        activeStatus: 'processing',
        op: 'scaleDown',
        extraParams: { targetHeight },
        donePatch,
        errorKey: 'errorScaleDownFailed',
        completeAfter: true,
      });
    },
    [runServerProcessing, video.height, video.width],
  );

  /* ── Burn captions ──────────────────────────────────── */
  const handleBurnCaptions = useCallback(async () => {
    const config = video.burnCaptionsConfig;
    if (!config || !video.captionsFile || video.justAudio) return;

    let srtContent: string;
    try {
      let originalSrt: string;
      if (video.opfsEnabled && video.opfsCaptionsKey) {
        const captionsFile = await readFromOPFS(video.opfsCaptionsKey);
        originalSrt = await captionsFile.text();
      } else {
        const srtRes = await fetch(resolveMediaUrl(video.captionsFile));
        if (!srtRes.ok) throw new Error('Failed to fetch captions file');
        originalSrt = await srtRes.text();
      }

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
    video.opfsEnabled,
    video.opfsCaptionsKey,
    onUpdate,
    generate,
    runServerProcessing,
    t,
  ]);

  /* ── Handle completed server task ────────────────────── */
  const handleServerTaskDone = useCallback(
    async (
      task: TaskData,
      donePatch: Partial<StoredVideo>,
      completeAfter?: boolean,
    ) => {
      const file = task.file;
      const downloadURL = file ? `/api/media/${file}` : null;

      setJobPhase('idle');
      setJobProgress(task.progress ?? 100);

      onUpdate(video.uuid, {
        status: 'done',
        file: file ?? null,
        name: task.name ?? video.name,
        downloadURL,
        thumbnail: task.thumbnail ?? video.thumbnail,
        duration: task.duration ?? video.duration,
        uploader: task.uploader ?? video.uploader,
        isH265: task.isH265 ?? false,
        sourceFps: task.sourceFps ?? video.sourceFps,
        width: task.width ?? video.width,
        height: task.height ?? video.height,
        captionsFile: task.captionsFile
          ? `/api/media/${task.captionsFile}`
          : video.captionsFile,
        captionUrl: null,
        serverTaskId: null,
        ...donePatch,
      });

      // For OPFS-stored videos: fetch result, save to OPFS, delete server files
      if (video.opfsEnabled && file) {
        setOpfsMigrating(true);
        try {
          const blob = await fetch(resolveMediaUrl(downloadURL!)).then((r) =>
            r.blob(),
          );
          const ext = file.split('.').pop() ?? 'mp4';

          const newKey = await saveProcessedToOPFS({
            blob,
            fileExt: ext,
            oldOpfsKey: video.opfsKey,
            uuid: video.uuid,
            getUrls,
            registerUrls,
          });

          // Delete the server output file
          fetch(`/api/media/${file}`, { method: 'DELETE' }).catch(() => {});

          // Delete the server input file (uploaded from OPFS or still present)
          const inputFile = opfsInputFileRef.current;
          if (inputFile && inputFile !== file) {
            fetch(`/api/media/${inputFile}`, { method: 'DELETE' }).catch(
              () => {},
            );
            opfsInputFileRef.current = null;
          }

          onUpdate(video.uuid, {
            opfsKey: newKey,
            file: newKey,
            downloadURL: `opfs://${newKey}`,
            opfsStored: true,
            serverFileDeleted: true,
            fileSize: blob.size,
          });
        } catch (err) {
          console.error('OPFS save-back failed:', err);
        } finally {
          setOpfsMigrating(false);
        }
      } else if (file) {
        try {
          const headRes = await fetch(resolveMediaUrl(`/api/media/${file}`), {
            method: 'HEAD',
          });
          const cl = headRes.headers.get('content-length');
          if (cl) onUpdate(video.uuid, { fileSize: parseInt(cl, 10) });
        } catch {}
      }

      if (completeAfter) onComplete(video.uuid);
    },
    [
      video.uuid,
      video.name,
      video.thumbnail,
      video.duration,
      video.uploader,
      video.sourceFps,
      video.width,
      video.height,
      video.captionsFile,
      video.opfsEnabled,
      video.opfsKey,
      onUpdate,
      onComplete,
      getUrls,
      registerUrls,
    ],
  );

  /* ── Poll server task ───────────────────────────────── */
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
            void handleServerTaskDone(task, opts.donePatch, opts.completeAfter);
          } else if (task.status === 'error') {
            setJobPhase('idle');
            onUpdate(video.uuid, {
              status: 'error',
              error: task.error?.message ?? 'Processing failed',
              serverTaskId: null,
            });
          }
        },
      });
    },
    [startPolling, handleServerTaskDone, onUpdate, video.uuid, video.file],
  );

  pollForTaskRef.current = pollForTask;

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
      video.scaleDownTargetHeight == null &&
      video.status === 'processing' &&
      (video.fps === 'original' || !!video.fpsApplied);

    if (needsResume) queueMicrotask(() => handleRemoveBlackBars());
  }, [
    video.file,
    video.justAudio,
    video.blackBarsRemoved,
    video.scaleDownTargetHeight,
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

  /* ── Status hint text ────────────────────────────────── */
  const statusHint = (() => {
    if (opfsUploading) return t('uploadingFromDevice');
    if (opfsMigrating) return t('savingToDevice');
    if (jobPhase === 'dispatching') return t('serverDispatching');
    if (jobPhase === 'polling' && jobProgress > 0)
      return t('serverProcessing', { progress: jobProgress });
    if (video.status === 'translating') return t('translatingCaptions');
    return null;
  })();

  const showProgressBar =
    isProcessing ||
    jobPhase === 'dispatching' ||
    jobPhase === 'polling' ||
    opfsUploading ||
    opfsMigrating;
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
          conversionTarget={conversionTarget}
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
      {showProgressBar ? (
        <ProgressBar value={progressValue} margin="0" />
      ) : null}
      {/* ── Status hint ─────────────────────────────── */}
      {statusHint ? (
        <Typography variant="caption" className="vi-ffmpeg-hint">
          {statusHint}
        </Typography>
      ) : null}
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

export default PinnedVideoItemServer;
