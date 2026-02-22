'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { Box } from '@repo/ui/core-elements/box';
import { Icon } from '@repo/ui/core-elements/icon';
import { ProgressBar } from '@repo/ui/core-elements/progress-bar';
import type { DownloadVideoError } from '@repo/helpers/download-video';
import { ConfirmationModal } from '@repo/ui/core-elements/confirmation-modal';
import { Badge } from '@repo/ui/core-elements/badge';
import { useFFmpeg } from '@repo/ui/use-ffmpeg';
import { useProcessingQueue } from './use-processing-queue';
import { usePollTask, type TaskData } from './use-poll-task';
import type { StoredVideo, VideoStatus } from './use-video-store';
import './video-item.css';
import Image from 'next/image';

/* ── Constants ──────────────────────────────────────── */

const PLATFORM_ICONS: Record<string, string> = {
  facebook: '/icons/facebook.svg',
  instagram: '/icons/instagram.svg',
  pinterest: '/icons/pinterest.svg',
  rednote: '/icons/url.svg',
  tidal: '/icons/url.svg',
  tiktok: '/icons/tiktok.svg',
  x: '/icons/x.svg',
  youtube: '/icons/youtube.svg',
  unknown: '/icons/url.svg',
};

const STATUS_COLORS: Record<VideoStatus, string> = {
  pending: 'var(--foreground-muted, #999)',
  downloading: 'var(--accent, #06b6d4)',
  queued: '#6366f1',
  processing: '#f59e0b',
  converting: '#8b5cf6',
  done: '#22c55e',
  error: '#ef4444',
};

/* ── API types ──────────────────────────────────────── */

interface TaskCreateResponse {
  task: { _id: string; status: string };
  error?: DownloadVideoError;
}

/* ── Helpers ────────────────────────────────────────── */

function triggerBrowserDownload(url: string, filename: string) {
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
}

function downloadThumbnail(url: string, name: string | null) {
  fetch(url)
    .then((res) => res.blob())
    .then((blob) => {
      const ext = url.match(/\.(jpe?g|png|webp)/i)?.[1] ?? 'jpg';
      const objectUrl = URL.createObjectURL(blob);
      triggerBrowserDownload(
        objectUrl,
        `${name ?? 'thumbnail'}-${Date.now()}.${ext}`,
      );
      URL.revokeObjectURL(objectUrl);
    })
    .catch((err) => console.error('Thumbnail download failed:', err));
}

async function uploadProcessedVideo(
  file: string,
  blob: Blob,
  taskUpdate: Record<string, unknown>,
  setUploading: (v: boolean) => void,
): Promise<void> {
  setUploading(true);
  try {
    const res = await fetch(`${window.location.origin}/api/media/${file}`, {
      method: 'PUT',
      body: blob,
      headers: { 'X-Task-Update': JSON.stringify(taskUpdate) },
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.error(`Failed to upload processed video (${res.status}):`, text);
    }
  } catch (err) {
    console.error('Failed to upload processed video to server:', err);
  } finally {
    setUploading(false);
  }
}

/* ── Props ──────────────────────────────────────────── */

export interface VideoItemProps {
  video: StoredVideo;
  onUpdate: (uuid: string, patch: Partial<StoredVideo>) => void;
  onRemove: (uuid: string) => void;
}

/* ── Component ──────────────────────────────────────── */

export function VideoItem({ video, onUpdate, onRemove }: VideoItemProps) {
  const t = useTranslations('VideoGrid');
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [extraActionsOpen, setExtraActionsOpen] = useState(false);
  const [copying, setCopying] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [confirmConvert, setConfirmConvert] = useState(false);
  const [hasBars, setHasBars] = useState<boolean | null>(video.hasBars);
  const downloadTriggered = useRef(false);
  const resumeChecked = useRef(false);
  const convertResumeChecked = useRef(false);
  const pollResumeChecked = useRef(false);

  /* FFmpeg WASM (lazy-loaded for client-side FPS interpolation) */
  const {
    status: ffmpegStatus,
    progress: ffmpegProgress,
    interpolateFps,
    convertToH264,
    removeBlackBars,
    detectBars,
  } = useFFmpeg();

  const { enqueue, cancel } = useProcessingQueue();
  const { startPolling, stopPolling } = usePollTask();

  const platformIcon =
    PLATFORM_ICONS[video.platform] ?? PLATFORM_ICONS.unknown!;
  const isProcessing =
    video.status === 'downloading' ||
    video.status === 'processing' ||
    video.status === 'converting';
  const isBusy = isProcessing || video.status === 'queued';
  const displayName =
    video.name ??
    video.uploader ??
    (video.justAudio ? t('untitledAudio') : t('untitledVideo'));

  /* ── Enqueue FFmpeg processing (shared by FPS & H.264) ── */
  const enqueueProcessing = useCallback(
    async (opts: {
      activeStatus: VideoStatus;
      process: (
        sourceUrl: string,
      ) => Promise<{ objectUrl: string; blob: Blob }>;
      donePatch: Partial<StoredVideo>;
      taskUpdate: Record<string, unknown>;
      errorKey: string;
      downloadPrefix?: string;
    }) => {
      if (!video.file || video.justAudio) return;

      try {
        onUpdate(video.uuid, { status: 'queued', error: null });
        await enqueue(video.uuid, async () => {
          onUpdate(video.uuid, { status: opts.activeStatus, error: null });
          const sourceUrl = `${window.location.origin}/api/media/${video.file}`;
          const { objectUrl, blob } = await opts.process(sourceUrl);

          onUpdate(video.uuid, { status: 'done', ...opts.donePatch });

          const uploadPromise = uploadProcessedVideo(
            video.file!,
            blob,
            opts.taskUpdate,
            setUploading,
          );

          if (video.autoDownload) {
            const prefix = opts.downloadPrefix ?? 'video';
            const downloadName = `${video.name ?? prefix}-${Date.now()}-${video.file}`;
            triggerBrowserDownload(objectUrl, downloadName);
          }

          await uploadPromise;
          onUpdate(video.uuid, {
            downloadURL: `/api/media/${video.file}?v=${Date.now()}`,
          });
        });
      } catch (err) {
        console.error(`${opts.errorKey} failed:`, err);
        onUpdate(video.uuid, {
          status: 'error',
          error: t(opts.errorKey),
        });
      }
    },
    [
      video.uuid,
      video.file,
      video.justAudio,
      video.autoDownload,
      video.name,
      onUpdate,
      enqueue,
      t,
    ],
  );

  /* ── FPS interpolation handler ──────────────────────── */
  const handleInterpolateFps = useCallback(
    () =>
      enqueueProcessing({
        activeStatus: 'processing',
        process: (url) => interpolateFps(url, Number(video.fps)),
        donePatch: { fpsApplied: true },
        taskUpdate: { fpsApplied: true },
        errorKey: 'errorFfmpegFailed',
      }),
    [enqueueProcessing, interpolateFps, video.fps],
  );

  /* ── H.265 → H.264 conversion handler ──────────────── */
  const handleConvertH264 = useCallback(
    () =>
      enqueueProcessing({
        activeStatus: 'converting',
        process: (url) => convertToH264(url),
        donePatch: { h264Converted: true, isH265: false },
        taskUpdate: { isH265: false },
        errorKey: 'errorConvertFailed',
        downloadPrefix: 'video',
      }),
    [enqueueProcessing, convertToH264],
  );

  /* ── Remove black bars handler ──────────────────────── */
  const handleRemoveBlackBars = useCallback(
    () =>
      enqueueProcessing({
        activeStatus: 'processing',
        process: (url) => removeBlackBars(url),
        donePatch: { blackBarsRemoved: true },
        taskUpdate: { blackBarsRemoved: true },
        errorKey: 'errorRemoveBlackBarsFailed',
      }),
    [enqueueProcessing, removeBlackBars],
  );

  /* ── Manual FPS interpolation handler ───────────────── */
  const handleInterpolateFpsManual = useCallback(
    (targetFps: number) =>
      enqueueProcessing({
        activeStatus: 'processing',
        process: (url) => interpolateFps(url, targetFps),
        donePatch: { fpsApplied: true, fps: String(targetFps) },
        taskUpdate: { fpsApplied: true },
        errorKey: 'errorFfmpegFailed',
      }),
    [enqueueProcessing, interpolateFps],
  );

  /* ── Check for black/white bars and persist result ── */
  const checkBars = useCallback(
    async (file: string, taskId: string | null) => {
      const sourceUrl = `${window.location.origin}/api/media/${file}`;
      try {
        const black = await detectBars(sourceUrl, { limit: 24 });
        if (black.hasBars) {
          setHasBars(true);
          onUpdate(video.uuid, { hasBars: true });
          if (taskId) {
            fetch(`/api/download-video/${taskId}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ hasBars: true }),
            }).catch(() => {});
          }
          return;
        }
        const white = await detectBars(sourceUrl, { limit: 230 });
        const result = white.hasBars;
        setHasBars(result);
        onUpdate(video.uuid, { hasBars: result });
        if (taskId) {
          fetch(`/api/download-video/${taskId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ hasBars: result }),
          }).catch(() => {});
        }
      } catch (err) {
        console.error('Bar detection failed:', err);
        setHasBars(false);
        onUpdate(video.uuid, { hasBars: false });
      }
    },
    [detectBars, onUpdate, video.uuid],
  );

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
      });

      /* Run bar detection in the background for non-audio videos,
         but skip when FPS interpolation will run — both use the same
         FFmpeg WASM instance and cannot execute concurrently. */
      const willInterpolateFps =
        video.fps !== 'original' && !video.justAudio && file;
      if (file && !video.justAudio && !willInterpolateFps) {
        checkBars(file, video.taskId);
      }

      if (!file || !video.autoDownload) return;

      /* FPS interpolation via FFmpeg WASM (queued) */
      if (willInterpolateFps) {
        onUpdate(video.uuid, { status: 'queued' });
        enqueue(video.uuid, async () => {
          onUpdate(video.uuid, { status: 'processing' });
          const sourceUrl = `${window.location.origin}/api/media/${file}`;
          const { objectUrl, blob } = await interpolateFps(
            sourceUrl,
            Number(video.fps),
          );
          onUpdate(video.uuid, { status: 'done', fpsApplied: true });

          const uploadPromise = uploadProcessedVideo(
            file,
            blob,
            { fpsApplied: true },
            setUploading,
          );

          triggerBrowserDownload(
            objectUrl,
            `${name ?? 'video'}-${Date.now()}-${file}`,
          );

          await uploadPromise;
          onUpdate(video.uuid, {
            downloadURL: `/api/media/${file}?v=${Date.now()}`,
          });
        }).catch((ffErr) => {
          console.error('FFmpeg interpolation failed:', ffErr);
          onUpdate(video.uuid, {
            status: 'error',
            error: t('errorFfmpegFailed'),
          });
        });
        return;
      }

      /* Direct browser download */
      triggerBrowserDownload(
        downloadURL!,
        `${name ?? (video.justAudio ? 'audio' : 'video')}-${Date.now()}-${file}`,
      );

      /* Auto-download thumbnail image for audio-only items */
      if (video.justAudio && task.thumbnail) {
        downloadThumbnail(task.thumbnail, name);
      }
    },
    [
      onUpdate,
      video.uuid,
      video.autoDownload,
      video.fps,
      video.justAudio,
      video.taskId,
      checkBars,
      enqueue,
      interpolateFps,
      t,
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
        onError: (errorMsg) => {
          onUpdate(video.uuid, { status: 'error', error: errorMsg });
        },
      });
    },
    [startPolling, handleTaskDone, onUpdate, video.uuid],
  );

  /* ── Download handler (each item independent) ───── */
  const handleDownload = useCallback(async () => {
    onUpdate(video.uuid, { status: 'downloading', error: null });

    try {
      const res = await fetch('/api/download-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: video.originalURL,
          justAudio: video.justAudio,
          checkCodec: video.platform === 'tiktok',
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
      onUpdate(video.uuid, { taskId });

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
    if (video.justAudio && video.thumbnail) {
      downloadThumbnail(video.thumbnail, video.name);
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
      queueMicrotask(() => handleInterpolateFps());
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

  /* ── Warn before closing during active processing ── */
  useEffect(() => {
    if (!isProcessing) return;

    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };

    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isProcessing]);

  return (
    <Box
      elevation={2}
      borderRadius={14}
      className="vi-card"
      flexDirection="column"
      styles={{ overflow: 'hidden' }}
    >
      {/* ── Status bar ────────────────────────────── */}
      <div
        className="vi-status-bar"
        style={{ backgroundColor: STATUS_COLORS[video.status] }}
      />

      {/* ── Header row ────────────────────────────── */}
      <div className="vi-header">
        <span className="vi-name" title={displayName}>
          {displayName}
        </span>
        {video.isH265 ? (
          <Badge variant="subtle" size="sm" color="#16dd00">
            H265
          </Badge>
        ) : null}
        {video.fps !== 'original' ? (
          <Badge variant="subtle" size="sm" color="#f59e0b">
            {video.fps} FPS
          </Badge>
        ) : null}
        <button
          type="button"
          className="vi-icon-btn"
          onClick={() => setDetailsOpen((p) => !p)}
          aria-label={t('toggleDetails')}
        >
          <Icon
            icon="/icons/hamburger.svg"
            size={16}
            color="var(--foreground, #171717)"
          />
        </button>
      </div>

      {/* ── Details panel (collapsible) ───────────── */}
      {detailsOpen ? <VideoDetailsPanel video={video} t={t} /> : null}

      {/* ── Media preview ─────────────────────────── */}
      <VideoMediaPreview
        downloadURL={video.downloadURL}
        justAudio={video.justAudio}
        thumbnail={video.thumbnail}
      />

      {/* ── Loading indicator ─────────────────────── */}
      {isProcessing ? (
        <ProgressBar
          value={ffmpegProgress ? ffmpegProgress : undefined}
          margin="0"
        />
      ) : null}

      {/* ── Status hints ──────────────────────────── */}
      <VideoStatusHints
        ffmpegStatus={ffmpegStatus}
        ffmpegProgress={ffmpegProgress}
        videoStatus={video.status}
        uploading={uploading}
        t={t}
      />

      {/* ── Footer actions ────────────────────────── */}
      <Box className="vi-footer">
        <div className="vi-link-row">
          <Icon icon={platformIcon} size={24} color="var(--accent, #06b6d4)" />
          <a
            className="vi-original-link"
            href={video.originalURL}
            target="_blank"
            rel="noopener noreferrer"
            title={video.originalURL}
          >
            {video.originalURL}
          </a>
        </div>

        <VideoActions
          video={video}
          isBusy={isBusy}
          copying={copying}
          extraActionsOpen={extraActionsOpen}
          onCopy={handleCopy}
          onRetry={handleDownload}
          onRedownload={handleRedownload}
          onToggleExtra={() => setExtraActionsOpen((p) => !p)}
          onDelete={() => setConfirmRemove(true)}
          t={t}
        />
      </Box>

      {/* ── Extra actions panel (collapsible) ─────────── */}
      {extraActionsOpen ? (
        <VideoExtraActions
          video={video}
          isBusy={isBusy}
          hasBars={hasBars}
          onRemoveBlackBars={handleRemoveBlackBars}
          onInterpolateFps={handleInterpolateFpsManual}
          onConvert={() => setConfirmConvert(true)}
          t={t}
        />
      ) : null}

      {/* ── Confirmation modals ───────────────────── */}
      {confirmConvert ? (
        <ConfirmationModal
          title={t('confirmConvertTitle')}
          text={t('confirmConvertText')}
          okCallback={() => {
            setConfirmConvert(false);
            handleConvertH264();
          }}
          cancelCallback={() => setConfirmConvert(false)}
        />
      ) : null}

      {confirmRemove ? (
        <ConfirmationModal
          title={t('confirmDeleteTitle')}
          text={t('confirmDeleteText')}
          okCallback={() => {
            setConfirmRemove(false);
            cancel(video.uuid);
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

/* ── Sub-components ─────────────────────────────────── */

function VideoDetailsPanel({
  video,
  t,
}: {
  video: StoredVideo;
  t: ReturnType<typeof useTranslations<'VideoGrid'>>;
}) {
  return (
    <div className="vi-details">
      <dl className="vi-dl">
        <dt>UUID</dt>
        <dd>{video.uuid}</dd>
        <dt>{t('detailStatus')}</dt>
        <dd
          className="vi-status-badge"
          style={{ color: STATUS_COLORS[video.status] }}
        >
          {t(`status_${video.status}`)}
        </dd>
        {video.h264Converted ? (
          <>
            <dt>{t('detailCodec')}</dt>
            <dd>H.264 ({t('converted')})</dd>
          </>
        ) : null}
        {video.error ? (
          <>
            <dt>{t('detailError')}</dt>
            <dd className="vi-error-text">{video.error}</dd>
          </>
        ) : null}
        <dt>FPS</dt>
        <dd>{video.fps}</dd>
        <dt>{t('detailJustAudio')}</dt>
        <dd>{video.justAudio ? t('yes') : t('no')}</dd>
        <dt>{t('detailEnhance')}</dt>
        <dd>{video.enhance ? t('yes') : t('no')}</dd>
        {video.duration ? (
          <>
            <dt>{t('detailDuration')}</dt>
            <dd>{Math.round(video.duration)}s</dd>
          </>
        ) : null}
      </dl>
    </div>
  );
}

function VideoMediaPreview({
  downloadURL,
  justAudio,
  thumbnail,
}: {
  downloadURL: string | null;
  justAudio: boolean;
  thumbnail: string | null;
}) {
  if (!downloadURL) return null;

  if (justAudio) {
    return (
      <>
        {thumbnail ? (
          <div className="vi-media-wrapper">
            <Image
              className="vi-thumbnail"
              src={thumbnail}
              alt=""
              loading="lazy"
              unoptimized
            />
          </div>
        ) : null}
        <div className="vi-media-wrapper vi-audio-wrapper">
          <audio
            className="vi-audio"
            src={downloadURL}
            loop
            controls
            preload="metadata"
          />
        </div>
      </>
    );
  }

  return (
    <div className="vi-media-wrapper">
      <video
        className="vi-video"
        src={downloadURL}
        loop
        playsInline
        preload="metadata"
        controls
      />
    </div>
  );
}

function VideoStatusHints({
  ffmpegStatus,
  ffmpegProgress,
  videoStatus,
  uploading,
  t,
}: {
  ffmpegStatus: string;
  ffmpegProgress: number | null;
  videoStatus: VideoStatus;
  uploading: boolean;
  t: ReturnType<typeof useTranslations<'VideoGrid'>>;
}) {
  if (ffmpegStatus === 'loading') {
    return <span className="vi-ffmpeg-hint">{t('ffmpegLoading')}</span>;
  }

  if (ffmpegStatus === 'processing') {
    const message =
      videoStatus === 'converting'
        ? t('convertingH264', { progress: ffmpegProgress })
        : t('ffmpegProcessing', { progress: ffmpegProgress });
    return <span className="vi-ffmpeg-hint">{message}</span>;
  }

  if (videoStatus === 'queued') {
    return <span className="vi-ffmpeg-hint">{t('queueWaiting')}</span>;
  }

  if (uploading) {
    return <span className="vi-ffmpeg-hint">{t('uploadingProcessed')}</span>;
  }

  return null;
}

function VideoActions({
  video,
  isBusy,
  copying,
  extraActionsOpen,
  onCopy,
  onRetry,
  onRedownload,
  onToggleExtra,
  onDelete,
  t,
}: {
  video: StoredVideo;
  isBusy: boolean;
  copying: boolean;
  extraActionsOpen: boolean;
  onCopy: () => void;
  onRetry: () => void;
  onRedownload: () => void;
  onToggleExtra: () => void;
  onDelete: () => void;
  t: ReturnType<typeof useTranslations<'VideoGrid'>>;
}) {
  return (
    <Box className="vi-actions" display="flex" justifyContent="space-evenly">
      <button
        type="button"
        className="vi-icon-btn vi-icon-btn--danger"
        onClick={onDelete}
        aria-label={t('delete')}
        title={t('delete')}
      >
        <Icon icon="/icons/delete-video.svg" size={15} color="#ef4444" />
      </button>

      <button
        type="button"
        className="vi-icon-btn"
        onClick={onRetry}
        disabled={isBusy}
        aria-label={t('retry')}
        title={t('retry')}
      >
        <Icon
          icon="/icons/retry.svg"
          size={15}
          color="var(--foreground, #171717)"
        />
      </button>

      <button
        type="button"
        className="vi-icon-btn"
        onClick={onCopy}
        aria-label={t('copyLink')}
        title={copying ? t('copied') : t('copyLink')}
      >
        <Icon
          icon="/icons/copy.svg"
          size={15}
          color={
            copying ? 'var(--accent, #06b6d4)' : 'var(--foreground, #171717)'
          }
        />
      </button>

      {video.downloadURL ? (
        <button
          type="button"
          className="vi-icon-btn"
          onClick={onRedownload}
          aria-label={t('redownload')}
          title={t('redownload')}
        >
          <Icon
            icon="/icons/download.svg"
            size={15}
            color={
              copying ? 'var(--accent, #06b6d4)' : 'var(--foreground, #171717)'
            }
          />
        </button>
      ) : null}

      <button
        type="button"
        className="vi-icon-btn"
        onClick={onToggleExtra}
        aria-label={t('toggleExtraActions')}
        title={t('toggleExtraActions')}
      >
        <Icon
          icon="/icons/chevron-down.svg"
          size={15}
          color="var(--foreground, #171717)"
          className={
            extraActionsOpen ? 'vi-chevron--open' : 'vi-chevron--closed'
          }
        />
      </button>
    </Box>
  );
}

/* ── Extra actions panel ─────────────────────────────── */

const FPS_OPTIONS = [
  { value: 60, label: '60 FPS' },
  { value: 90, label: '90 FPS' },
  { value: 120, label: '120 FPS' },
] as const;

function VideoExtraActions({
  video,
  isBusy,
  hasBars,
  onRemoveBlackBars,
  onInterpolateFps,
  onConvert,
  t,
}: {
  video: StoredVideo;
  isBusy: boolean;
  hasBars: boolean | null;
  onRemoveBlackBars: () => void;
  onInterpolateFps: (fps: number) => void;
  onConvert: () => void;
  t: ReturnType<typeof useTranslations<'VideoGrid'>>;
}) {
  const canProcess = !isBusy && !!video.downloadURL && !video.justAudio;

  return (
    <div className="vi-extra-actions">
      {video.isH265 && !video.h264Converted ? (
        <button
          type="button"
          className="vi-fps-btn"
          onClick={onConvert}
          disabled={isBusy}
          aria-label={t('convertH264')}
          title={t('convertH264')}
        >
          <Icon
            icon="/icons/convert.svg"
            size={14}
            color="var(--accent, #8b5cf6)"
          />
          {t('convertH264')}
        </button>
      ) : null}

      {hasBars ? (
        <button
          type="button"
          className="vi-fps-btn"
          onClick={onRemoveBlackBars}
          disabled={!canProcess || video.blackBarsRemoved}
          aria-label={t('removeBlackBars')}
          title={t('removeBlackBars')}
        >
          <Icon
            icon="/icons/remove-black-bars.svg"
            size={14}
            color="var(--accent, #8b5cf6)"
          />
          {t('removeBlackBars')}
        </button>
      ) : null}

      <Box>
        {FPS_OPTIONS.map(({ value, label }) => {
          const alreadyApplied = video.fpsApplied && value <= Number(video.fps);
          return (
            <button
              key={value}
              type="button"
              className="vi-fps-btn"
              onClick={() => onInterpolateFps(value)}
              disabled={!canProcess || alreadyApplied}
              title={label}
            >
              {label}
            </button>
          );
        })}
      </Box>
    </div>
  );
}

export default VideoItem;
