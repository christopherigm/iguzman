'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { Box } from '@repo/ui/core-elements/box';
import { Icon } from '@repo/ui/core-elements/icon';
import { ProgressBar } from '@repo/ui/core-elements/progress-bar';
import { httpPost, HttpClientError } from '@repo/helpers/http-client';
import type {
  DownloadVideoResult,
  DownloadVideoError,
} from '@repo/helpers/download-video';
import { ConfirmationModal } from '@repo/ui/core-elements/confirmation-modal';
import { Badge } from '@repo/ui/core-elements/badge';
import { useFFmpeg } from './use-ffmpeg';
import { useProcessingQueue } from './use-processing-queue';
import type { StoredVideo, VideoStatus } from './use-video-store';
import './video-item.css';

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

interface ApiSuccessResponse {
  data: DownloadVideoResult;
}

interface ApiErrorResponse {
  error: DownloadVideoError;
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
  const [copying, setCopying] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [confirmConvert, setConfirmConvert] = useState(false);
  const downloadTriggered = useRef(false);
  const resumeChecked = useRef(false);
  const convertResumeChecked = useRef(false);

  /* FFmpeg WASM (lazy-loaded for client-side FPS interpolation) */
  const {
    status: ffmpegStatus,
    progress: ffmpegProgress,
    interpolateFps,
    convertToH264,
  } = useFFmpeg();

  const { enqueue, cancel } = useProcessingQueue();

  const platformIcon =
    PLATFORM_ICONS[video.platform] ?? PLATFORM_ICONS.unknown!;
  const isProcessing =
    video.status === 'downloading' ||
    video.status === 'processing' ||
    video.status === 'converting';
  const isBusy = isProcessing || video.status === 'queued';
  const displayName = video.name ?? video.uploader ?? t('untitledVideo');

  /* ── Download handler (each item independent) ───── */
  const handleDownload = useCallback(async () => {
    onUpdate(video.uuid, { status: 'downloading', error: null });

    try {
      const result = await httpPost<ApiSuccessResponse>({
        baseUrl: window.location.origin,
        url: '/api/download-video',
        body: {
          url: video.originalURL,
          justAudio: video.justAudio,
          checkCodec: video.platform === 'tiktok',
        },
      });

      const { file, name, metadata, isH265 } = result.data.data;

      const downloadURL = file ? `/api/media/${file}` : null;

      onUpdate(video.uuid, {
        status: 'done',
        file: file ?? null,
        name: name ?? null,
        downloadURL,
        thumbnail: metadata?.thumbnail ?? null,
        duration: metadata?.duration ?? null,
        uploader: metadata?.uploader ?? null,
        isH265: isH265 ?? false,
      });

      /* Auto-trigger browser download */
      if (file && video.autoDownload) {
        const downloadHref = downloadURL!;

        /* ── FPS interpolation via FFmpeg WASM (queued) ── */
        if (video.fps !== 'original' && !video.justAudio) {
          try {
            onUpdate(video.uuid, { status: 'queued' });
            await enqueue(video.uuid, async () => {
              onUpdate(video.uuid, { status: 'processing' });
              const sourceUrl = `${window.location.origin}/api/media/${file}`;
              const { objectUrl, blob } = await interpolateFps(
                sourceUrl,
                Number(video.fps),
              );
              onUpdate(video.uuid, { status: 'done', fpsApplied: true });

              /* Upload the processed video back to the server in parallel
                 with the browser download so the server file stays in sync */
              setUploading(true);
              const uploadPromise = fetch(
                `${window.location.origin}/api/media/${file}`,
                { method: 'PUT', body: blob },
              )
                .catch((uploadErr) => {
                  console.error(
                    'Failed to upload processed video to server:',
                    uploadErr,
                  );
                })
                .finally(() => {
                  setUploading(false);
                });

              /* Trigger browser download immediately (don't wait for upload) */
              const downloadName = `${name ?? 'video'}-${Date.now()}-${file}`;
              const link = document.createElement('a');
              link.href = objectUrl;
              link.download = downloadName;
              link.click();

              /* Await upload so we don't lose error logs if the tab closes */
              await uploadPromise;
            });
            return;
          } catch (ffErr) {
            console.error('FFmpeg interpolation failed:', ffErr);
            onUpdate(video.uuid, {
              status: 'error',
              error: t('errorFfmpegFailed'),
            });
            return;
          }
        }

        const downloadName = `${name ?? (video.justAudio ? 'audio' : 'video')}-${Date.now()}-${file}`;
        const link = document.createElement('a');
        link.href = downloadHref;
        link.download = downloadName;
        link.click();
      }
    } catch (err) {
      const message =
        err instanceof HttpClientError
          ? ((err.data as ApiErrorResponse | null)?.error?.message ??
            err.message)
          : t('errorGeneric');
      onUpdate(video.uuid, { status: 'error', error: message });
    }
  }, [
    onUpdate,
    video.uuid,
    video.originalURL,
    video.justAudio,
    video.platform,
    video.autoDownload,
    video.fps,
    enqueue,
    interpolateFps,
    t,
  ]);

  /* ── Resume interrupted FPS interpolation ───────── */
  const handleResumeInterpolation = useCallback(async () => {
    if (!video.file || video.justAudio) return;

    try {
      onUpdate(video.uuid, { status: 'queued', error: null });
      await enqueue(video.uuid, async () => {
        onUpdate(video.uuid, { status: 'processing', error: null });
        const sourceUrl = `${window.location.origin}/api/media/${video.file}`;
        const { objectUrl, blob } = await interpolateFps(
          sourceUrl,
          Number(video.fps),
        );

        onUpdate(video.uuid, { status: 'done', fpsApplied: true });

        /* Upload processed video back to the server */
        setUploading(true);
        const uploadPromise = fetch(
          `${window.location.origin}/api/media/${video.file}`,
          { method: 'PUT', body: blob },
        )
          .catch((uploadErr) => {
            console.error(
              'Failed to upload processed video to server:',
              uploadErr,
            );
          })
          .finally(() => {
            setUploading(false);
          });

        /* Trigger browser download */
        if (video.autoDownload) {
          const downloadName = `${video.name ?? 'video'}-${Date.now()}-${video.file}`;
          const link = document.createElement('a');
          link.href = objectUrl;
          link.download = downloadName;
          link.click();
        }

        await uploadPromise;
      });
    } catch (ffErr) {
      console.error('FFmpeg interpolation failed:', ffErr);
      onUpdate(video.uuid, {
        status: 'error',
        error: t('errorFfmpegFailed'),
      });
    }
  }, [
    video.uuid,
    video.file,
    video.fps,
    video.justAudio,
    video.autoDownload,
    video.name,
    onUpdate,
    enqueue,
    interpolateFps,
    t,
  ]);

  /* ── Auto-trigger download for newly added (pending) items ── */
  useEffect(() => {
    if (video.status === 'pending' && !downloadTriggered.current) {
      downloadTriggered.current = true;
      queueMicrotask(() => handleDownload());
    }
  }, [video.status, handleDownload]);

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
      queueMicrotask(() => handleResumeInterpolation());
    }
  }, [
    video.file,
    video.fps,
    video.justAudio,
    video.fpsApplied,
    video.status,
    handleResumeInterpolation,
  ]);

  /* ── Warn before closing during active processing ── */
  useEffect(() => {
    if (
      video.status !== 'downloading' &&
      video.status !== 'processing' &&
      video.status !== 'converting'
    )
      return;

    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };

    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [video.status]);

  /* ── H.265 → H.264 conversion handler ───────────── */
  const handleConvertH264 = useCallback(async () => {
    if (!video.file || video.justAudio) return;

    try {
      onUpdate(video.uuid, { status: 'queued', error: null });
      await enqueue(video.uuid, async () => {
        onUpdate(video.uuid, { status: 'converting', error: null });
        const sourceUrl = `${window.location.origin}/api/media/${video.file}`;
        const { objectUrl, blob } = await convertToH264(sourceUrl);

        onUpdate(video.uuid, {
          status: 'done',
          h264Converted: true,
          isH265: false,
        });

        /* Upload converted video back to the server */
        setUploading(true);
        const uploadPromise = fetch(
          `${window.location.origin}/api/media/${video.file}`,
          { method: 'PUT', body: blob },
        )
          .catch((uploadErr) => {
            console.error(
              'Failed to upload H.264-converted video to server:',
              uploadErr,
            );
          })
          .finally(() => {
            setUploading(false);
          });

        /* Trigger browser download */
        if (video.autoDownload) {
          const downloadName = `${video.name ?? 'video'}-h264-${Date.now()}-${video.file}`;
          const link = document.createElement('a');
          link.href = objectUrl;
          link.download = downloadName;
          link.click();
        }

        await uploadPromise;
      });
    } catch (convertErr) {
      console.error('H.265→H.264 conversion failed:', convertErr);
      onUpdate(video.uuid, {
        status: 'error',
        error: t('errorConvertFailed'),
      });
    }
  }, [
    video.uuid,
    video.file,
    video.justAudio,
    video.autoDownload,
    video.name,
    onUpdate,
    enqueue,
    convertToH264,
    t,
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
    const link = document.createElement('a');
    link.href = video.downloadURL;
    link.download = `${video.name ?? 'video'}-${Date.now()}`;
    link.click();
  }, [video.downloadURL, video.name]);

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
          <Badge variant="subtle" size="sm" color="#f59e0b">
            H265
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
      {detailsOpen ? (
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
      ) : null}

      {/* ── Video / Audio preview ─────────────────── */}
      {video.downloadURL && !video.justAudio ? (
        <div className="vi-media-wrapper">
          <video
            className="vi-video"
            src={video.downloadURL}
            loop
            playsInline
            preload="metadata"
            controls
          />
        </div>
      ) : null}

      {video.downloadURL && video.justAudio ? (
        <div className="vi-media-wrapper vi-audio-wrapper">
          <audio
            className="vi-audio"
            src={video.downloadURL}
            loop
            controls
            preload="metadata"
          />
        </div>
      ) : null}

      {/* ── Loading indicator ─────────────────────── */}
      {isProcessing ? (
        <ProgressBar
          value={ffmpegProgress ? ffmpegProgress : undefined}
          margin="0"
        />
      ) : null}

      {/* ── FFmpeg status ─────────────────────────── */}
      {ffmpegStatus === 'loading' ? (
        <span className="vi-ffmpeg-hint">{t('ffmpegLoading')}</span>
      ) : null}
      {ffmpegStatus === 'processing' && video.status === 'converting' ? (
        <span className="vi-ffmpeg-hint">
          {t('convertingH264', { progress: ffmpegProgress })}
        </span>
      ) : null}
      {ffmpegStatus === 'processing' && video.status !== 'converting' ? (
        <span className="vi-ffmpeg-hint">
          {t('ffmpegProcessing', { progress: ffmpegProgress })}
        </span>
      ) : null}
      {video.status === 'queued' ? (
        <span className="vi-ffmpeg-hint">{t('queueWaiting')}</span>
      ) : null}
      {uploading ? (
        <span className="vi-ffmpeg-hint">{t('uploadingProcessed')}</span>
      ) : null}

      {/* ── Footer actions ────────────────────────── */}
      <Box className="vi-footer">
        {/* Platform badge + original link */}
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

        {/* Action buttons */}
        <Box
          className="vi-actions"
          display="flex"
          justifyContent="space-evenly"
        >
          <button
            type="button"
            className="vi-icon-btn"
            onClick={handleCopy}
            aria-label={t('copyLink')}
            title={copying ? t('copied') : t('copyLink')}
          >
            <Icon
              icon="/icons/copy.svg"
              size={15}
              color={
                copying
                  ? 'var(--accent, #06b6d4)'
                  : 'var(--foreground, #171717)'
              }
            />
          </button>

          <button
            type="button"
            className="vi-icon-btn"
            onClick={handleDownload}
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

          {video.downloadURL ? (
            <button
              type="button"
              className="vi-icon-btn"
              onClick={handleRedownload}
              aria-label={t('redownload')}
              title={t('redownload')}
            >
              <Icon
                icon="/icons/download.svg"
                size={15}
                color={
                  copying
                    ? 'var(--accent, #06b6d4)'
                    : 'var(--foreground, #171717)'
                }
              />
            </button>
          ) : null}

          {video.isH265 && video.downloadURL && !video.h264Converted ? (
            <button
              type="button"
              className="vi-icon-btn"
              onClick={() => setConfirmConvert(true)}
              disabled={isBusy}
              aria-label={t('convertH264')}
              title={t('convertH264')}
            >
              <Icon icon="/icons/convert.svg" size={15} color="#8b5cf6" />
            </button>
          ) : null}

          <button
            type="button"
            className="vi-icon-btn vi-icon-btn--danger"
            onClick={() => setConfirmRemove(true)}
            aria-label={t('delete')}
            title={t('delete')}
          >
            <Icon icon="/icons/delete-video.svg" size={15} color="#ef4444" />
          </button>
        </Box>
      </Box>

      {/* ── H.264 conversion confirmation modal ──── */}
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

      {/* ── Delete confirmation modal ─────────────── */}
      {confirmRemove ? (
        <ConfirmationModal
          title={t('confirmDeleteTitle')}
          text={t('confirmDeleteText')}
          okCallback={() => {
            setConfirmRemove(false);
            cancel(video.uuid);
            onRemove(video.uuid);
          }}
          cancelCallback={() => setConfirmRemove(false)}
        />
      ) : null}
    </Box>
  );
}

export default VideoItem;
