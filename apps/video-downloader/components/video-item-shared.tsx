'use client';

import { useTranslations } from 'next-intl';
import { Box } from '@repo/ui/core-elements/box';
import { Typography } from '@repo/ui/core-elements/typography';
import { Icon } from '@repo/ui/core-elements/icon';
import { Badge } from '@repo/ui/core-elements/badge';
import type { StoredVideo, VideoStatus } from './use-video-store';
import Image from 'next/image';

/* ── Constants ──────────────────────────────────────── */

export const PLATFORM_ICONS: Record<string, string> = {
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

export const STATUS_COLORS: Record<VideoStatus, string> = {
  pending: 'var(--foreground-muted, #999)',
  downloading: 'var(--accent, #06b6d4)',
  queued: '#6366f1',
  processing: '#f59e0b',
  converting: '#8b5cf6',
  done: '#22c55e',
  error: '#ef4444',
};

export const FPS_OPTIONS = [
  { value: 60, label: '60 FPS' },
  { value: 90, label: '90 FPS' },
  { value: 120, label: '120 FPS' },
] as const;

/* ── Helpers ────────────────────────────────────────── */

export function resolveMediaUrl(url: string): string {
  if (process.env.NODE_ENV !== 'development') return url;
  return url.replace('/api/media/', '/media/');
}

function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    // iPadOS 13+ reports as MacIntel with touch support
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
}

function getMimeType(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  const map: Record<string, string> = {
    mp4: 'video/mp4',
    webm: 'video/webm',
    ogv: 'video/ogg',
    mp3: 'audio/mpeg',
    m4a: 'audio/x-m4a',
    ogg: 'audio/ogg',
    wav: 'audio/wav',
    flac: 'audio/flac',
  };
  return map[ext] ?? 'application/octet-stream';
}

/**
 * Triggers a browser download for the given URL or Blob.
 *
 * On iOS Safari the `download` attribute is ignored, so we fall back to the
 * Web Share API which opens the native share sheet and lets users save to the
 * Files app.  The share path requires a transient user activation (i.e. a
 * click); auto-downloads triggered after task completion will silently fall
 * through to the anchor method.
 */
export async function triggerBrowserDownload(
  urlOrBlob: string | Blob,
  filename: string,
): Promise<void> {
  if (isIOS() && navigator.canShare) {
    try {
      const blob =
        urlOrBlob instanceof Blob
          ? urlOrBlob
          : await fetch(urlOrBlob).then((r) => r.blob());
      const type = blob.type || getMimeType(filename);
      const file = new File([blob], filename, { type });
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: filename });
        return;
      }
    } catch {
      // No transient activation (auto-download) or share cancelled — fall through.
    }
  }

  const url =
    urlOrBlob instanceof Blob ? URL.createObjectURL(urlOrBlob) : urlOrBlob;
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  if (urlOrBlob instanceof Blob) {
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

export function downloadThumbnail(url: string, name: string | null) {
  fetch(url)
    .then((res) => res.blob())
    .then((blob) => {
      const ext = url.match(/\.(jpe?g|png|webp)/i)?.[1] ?? 'jpg';
      // Pass the blob directly so triggerBrowserDownload controls the object
      // URL lifetime (important for the async iOS share path).
      triggerBrowserDownload(
        blob,
        `${name ?? 'thumbnail'}-${Date.now()}.${ext}`,
      );
    })
    .catch((err) => console.error('Thumbnail download failed:', err));
}

export function formatProcessingTime(seconds: number): string {
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}m ${s}s`;
}

export async function uploadProcessedVideo(
  file: string,
  blob: Blob,
  taskUpdate: Record<string, unknown>,
  setUploading: (v: boolean) => void,
): Promise<string | null> {
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
      return null;
    }

    const data = await res.json();
    return (data.file as string) ?? null;
  } catch (err) {
    console.error('Failed to upload processed video to server:', err);
    return null;
  } finally {
    setUploading(false);
  }
}

/* ── Sub-components ─────────────────────────────────── */

type TranslationFn = ReturnType<typeof useTranslations<'VideoGrid'>>;

export function VideoDetailsPanel({
  video,
  ffmpegStatus,
  ffmpegProgress,
  ffmpegLastError,
  ffmpegProcessingTime,
  ffmpegCores,
  uploading,
  t,
}: {
  video: StoredVideo;
  ffmpegStatus: string;
  ffmpegProgress: number | null;
  ffmpegLastError: string | null;
  ffmpegProcessingTime: number | null;
  ffmpegCores: number | null;
  uploading: boolean;
  t: TranslationFn;
}) {
  const ffmpegActive =
    ffmpegStatus === 'loading' || ffmpegStatus === 'processing';

  return (
    <Box className="vi-details">
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
        <dt>FPS (target)</dt>
        <dd>{video.fps}</dd>
        {video.sourceFps != null ? (
          <>
            <dt>FPS (source)</dt>
            <dd>{video.sourceFps}</dd>
          </>
        ) : null}
        <dt>{t('detailJustAudio')}</dt>
        <dd>{video.justAudio ? t('yes') : t('no')}</dd>
        {!video.justAudio && video.width && video.height ? (
          <>
            <dt>{t('detailResolution')}</dt>
            <dd>
              {video.width}×{video.height}
            </dd>
          </>
        ) : null}
        {video.duration ? (
          <>
            <dt>{t('detailDuration')}</dt>
            <dd>{Math.round(video.duration)}s</dd>
          </>
        ) : null}

        {/* ── FFmpeg live state ── */}
        <dt>FFmpeg</dt>
        <dd>
          {ffmpegStatus === 'loading'
            ? t('ffmpegLoading')
            : ffmpegStatus === 'processing'
              ? video.status === 'converting'
                ? t('convertingH264', { progress: ffmpegProgress })
                : t('ffmpegProcessing', { progress: ffmpegProgress })
              : uploading
                ? t('uploadingProcessed')
                : ffmpegStatus}
        </dd>
        {ffmpegActive && ffmpegProgress !== null ? (
          <>
            <dt>{t('detailProgress')}</dt>
            <dd>{ffmpegProgress}%</dd>
          </>
        ) : null}
        {ffmpegLastError ? (
          <>
            <dt>{t('detailFfmpegError')}</dt>
            <dd className="vi-error-text">{ffmpegLastError}</dd>
          </>
        ) : null}
        {ffmpegProcessingTime !== null ? (
          <>
            <dt>{t('detailProcessingTime')}</dt>
            <dd>{formatProcessingTime(ffmpegProcessingTime)}</dd>
          </>
        ) : null}
        {ffmpegCores !== null ? (
          <>
            <dt>{t('detailCores')}</dt>
            <dd>{ffmpegCores}</dd>
          </>
        ) : null}
      </dl>
    </Box>
  );
}

export function VideoMediaPreview({
  downloadURL,
  justAudio,
  thumbnail,
  compact,
}: {
  downloadURL: string | null;
  justAudio: boolean;
  thumbnail: string | null;
  compact?: boolean;
}) {
  if (!downloadURL) return null;

  const src = resolveMediaUrl(downloadURL);
  const thumbnailSrc = thumbnail
    ? resolveMediaUrl(`/api/media/${thumbnail}`)
    : null;

  if (justAudio) {
    return (
      <>
        {thumbnailSrc ? (
          <Box className="vi-media-wrapper">
            <Image
              className="vi-thumbnail"
              src={thumbnailSrc}
              alt=""
              loading="lazy"
              unoptimized
            />
          </Box>
        ) : null}
        <Box className="vi-media-wrapper vi-audio-wrapper">
          <audio
            className="vi-audio"
            src={src}
            loop
            controls
            preload="metadata"
          />
        </Box>
      </>
    );
  }

  return (
    <Box className="vi-media-wrapper">
      <video
        className={`vi-video${compact ? ' vi-video--compact' : ''}`}
        src={src}
        loop
        playsInline
        preload="metadata"
        controls
      />
    </Box>
  );
}

export function VideoStatusHints({
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
  t: TranslationFn;
}) {
  if (ffmpegStatus === 'loading') {
    return (
      <Typography variant="caption" className="vi-ffmpeg-hint">
        {t('ffmpegLoading')}
      </Typography>
    );
  }

  if (ffmpegStatus === 'processing') {
    const message =
      videoStatus === 'converting'
        ? t('convertingH264', { progress: ffmpegProgress })
        : t('ffmpegProcessing', { progress: ffmpegProgress });
    return (
      <Typography variant="caption" className="vi-ffmpeg-hint">
        {message}
      </Typography>
    );
  }

  if (videoStatus === 'queued') {
    return (
      <Typography variant="caption" className="vi-ffmpeg-hint">
        {t('queueWaiting')}
      </Typography>
    );
  }

  if (uploading) {
    return (
      <Typography variant="caption" className="vi-ffmpeg-hint">
        {t('uploadingProcessed')}
      </Typography>
    );
  }

  return null;
}

export function VideoActions({
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
  t: TranslationFn;
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
            color="var(--foreground, #171717)"
          />
        </button>
      ) : null}

      <button
        type="button"
        className="vi-icon-btn"
        onClick={onToggleExtra}
        aria-label={t('toggleExtraActions')}
        title={t('toggleExtraActions')}
        disabled={isBusy}
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

export function VideoExtraActions({
  video,
  isBusy,
  fpsError,
  h264Error,
  blackBarsError,
  onRemoveBlackBars,
  onInterpolateFps,
  onConvert,
  t,
}: {
  video: StoredVideo;
  isBusy: boolean;
  fpsError: boolean;
  h264Error: boolean;
  blackBarsError: boolean;
  onRemoveBlackBars: () => void;
  onInterpolateFps: (fps: number) => void;
  onConvert: () => void;
  t: TranslationFn;
}) {
  const canProcess = !isBusy && !!video.downloadURL && !video.justAudio;

  return (
    <Box className="vi-extra-actions">
      {video.isH265 && !video.h264Converted ? (
        <button
          type="button"
          className="vi-fps-btn"
          onClick={onConvert}
          disabled={isBusy || h264Error}
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

      {!video.justAudio && !video.blackBarsRemoved ? (
        <button
          type="button"
          className="vi-fps-btn"
          onClick={onRemoveBlackBars}
          disabled={!canProcess || blackBarsError}
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
              disabled={!canProcess || alreadyApplied || fpsError}
              title={label}
            >
              {label}
            </button>
          );
        })}
      </Box>
    </Box>
  );
}

/* ── Resolution label helper ─────────────────────────── */

export function resolveResolutionLabel(
  height: number | null,
  width?: number | null,
): string | null {
  if (height == null) return null;
  const px = width != null ? Math.min(height, width) : height;
  if (px >= 2160) return '4K';
  if (px >= 1440) return '2K';
  if (px >= 1080) return 'FHD';
  if (px >= 720) return 'HD';
  if (px >= 480) return 'SD';
  if (px >= 360) return '360p';
  return null;
}

/* ── Card header ─────────────────────────────────────── */

export function VideoCardHeader({
  video,
  displayName,
  detailsOpen,
  onToggleDetails,
  t,
}: {
  video: StoredVideo;
  displayName: string;
  detailsOpen: boolean;
  onToggleDetails: () => void;
  t: TranslationFn;
}) {
  return (
    <Box className="vi-header">
      <Typography
        as="span"
        variant="body"
        className={`vi-name${detailsOpen ? ' vi-name--expanded' : ''}`}
      >
        {displayName}
      </Typography>
      {video.isH265 ? (
        <Badge variant="subtle" size="sm" color="#16dd00">
          H265
        </Badge>
      ) : null}
      {video.fpsApplied ? (
        <Badge variant="subtle" size="sm" color="#f59e0b">
          {video.fps} FPS
        </Badge>
      ) : video.sourceFps != null ? (
        <Badge variant="subtle" size="sm" color="#f59e0b">
          {video.sourceFps} FPS
        </Badge>
      ) : video.fps !== 'original' ? (
        <Badge variant="subtle" size="sm" color="#f59e0b">
          {video.fps} FPS
        </Badge>
      ) : null}
      {!video.justAudio && resolveResolutionLabel(video.height, video.width) ? (
        <Badge variant="subtle" size="sm" color="#38bdf8">
          {resolveResolutionLabel(video.height, video.width)}
        </Badge>
      ) : null}
      <button
        type="button"
        className="vi-icon-btn"
        onClick={onToggleDetails}
        aria-label={t('toggleDetails')}
      >
        <Icon
          icon="/icons/hamburger.svg"
          size={16}
          color="var(--foreground, #171717)"
        />
      </button>
    </Box>
  );
}

/* ── Card footer link row ──────────────────────────── */

export function VideoFooterLink({ video }: { video: StoredVideo }) {
  const platformIcon =
    PLATFORM_ICONS[video.platform] ?? PLATFORM_ICONS.unknown!;

  return (
    <Box className="vi-link-row">
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
    </Box>
  );
}
