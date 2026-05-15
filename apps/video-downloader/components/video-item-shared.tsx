'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Box } from '@repo/ui/core-elements/box';
import { ConfirmationModal } from '@repo/ui/core-elements/confirmation-modal';
import { Typography } from '@repo/ui/core-elements/typography';
import { Icon } from '@repo/ui/core-elements/icon';
import { Badge } from '@repo/ui/core-elements/badge';
import { Button } from '@repo/ui/core-elements/button';
import { Grid } from '@repo/ui/core-elements/grid';
import type { StoredVideo, VideoStatus } from './use-video-store';
import {
  WsClientPanel,
  THIS_DEVICE_UUID,
  type StoredWsClient,
} from './ws-client-panel';
import Divider from '@repo/ui/core-elements/divider';

export { THIS_DEVICE_UUID, type StoredWsClient };

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
  burning: '#ec4899',
  translating: '#a855f7',
  done: '#22c55e',
  error: '#ef4444',
};

const FPS_MULTIPLIERS = [2, 4, 8] as const;

function buildFpsOptions(
  sourceFps: number | null,
): { value: number; label: string }[] {
  const base = sourceFps && sourceFps > 0 ? sourceFps : 30;
  return FPS_MULTIPLIERS.map((m) => {
    const value = Math.round(base * m);
    return { value, label: `${value} FPS` };
    // return { value, label: `${value} FPS (${m}x)` };
  });
}

/* ── Helpers ────────────────────────────────────────── */

export function resolveMediaUrl(url: string): string {
  if (process.env.NODE_ENV !== 'development') return url;
  return url.replace('/api/media/', '/media/');
}

export function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    // iPadOS 13+ reports as MacIntel with touch support
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
}

function mimeTypeFromFilename(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  const map: Record<string, string> = {
    mp4: 'video/mp4',
    mov: 'video/quicktime',
    webm: 'video/webm',
    mkv: 'video/x-matroska',
    avi: 'video/x-msvideo',
    mp3: 'audio/mpeg',
    m4a: 'audio/mp4',
    aac: 'audio/aac',
    wav: 'audio/wav',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
  };
  return map[ext] ?? '';
}

/**
 * Triggers a browser download for the given URL or Blob.
 *
 * On iOS Safari the `download` attribute is ignored and the Web Share API
 * share-sheet does not give direct access to the Photos app.
 *
 * - Safari 26 / iOS 26+: uses `showSaveFilePicker` for a native Save dialog.
 * - Older iOS: opens the media URL in a new tab where the native player
 *   surfaces a "Save to Camera Roll" option via long-press / share button.
 *
 * Both iOS paths require a transient user activation (i.e. a click).
 */
export async function triggerBrowserDownload(
  urlOrBlob: string | Blob,
  filename: string,
): Promise<void> {
  if (isIOS()) {
    // Safari 26 / iOS 26+: File System Access API
    if ('showSaveFilePicker' in window) {
      try {
        const blob =
          urlOrBlob instanceof Blob
            ? urlOrBlob
            : await fetch(resolveMediaUrl(urlOrBlob)).then((r) => r.blob());

        const mimeType = blob.type || mimeTypeFromFilename(filename);
        const ext = filename.split('.').pop() ?? '';

        const handle = await (
          window as Window & {
            showSaveFilePicker: (opts?: {
              suggestedName?: string;
              types?: {
                description?: string;
                accept: Record<string, string[]>;
              }[];
            }) => Promise<FileSystemFileHandle>;
          }
        ).showSaveFilePicker({
          suggestedName: filename,
          types: mimeType
            ? [
                {
                  description: 'Media file',
                  accept: { [mimeType]: ext ? [`.${ext}`] : [] },
                },
              ]
            : undefined,
        });

        const writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
        return;
      } catch (err) {
        // AbortError = user cancelled the picker — no fallback needed.
        if ((err as DOMException)?.name === 'AbortError') return;
        // Any other failure: fall through to the window.open path.
        console.error('showSaveFilePicker failed, falling back:', err);
      }
    }

    // Fallback for older iOS: open in a new Safari tab.
    if (urlOrBlob instanceof Blob) {
      const objectUrl = URL.createObjectURL(urlOrBlob);
      window.open(objectUrl, '_blank');
      // Keep the object URL alive long enough for Safari to open the new tab.
      setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
    } else {
      window.open(resolveMediaUrl(urlOrBlob), '_blank');
    }
    return;
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

export function formatFileSize(bytes: number): string {
  if (bytes >= 1_000_000_000) return `${(bytes / 1_000_000_000).toFixed(2)} GB`;
  return `${(bytes / 1_000_000).toFixed(2)} MB`;
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

/* ── Online status hook ─────────────────────────────── */

export function useOnlineStatus(): boolean {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true,
  );
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);
  return isOnline;
}

/* ── Sub-components ─────────────────────────────────── */

type TranslationFn = ReturnType<typeof useTranslations<'VideoGrid'>>;

export function VideoDetailsPanel({
  video,
  ffmpegStatus,
  ffmpegProgress,
  ffmpegLastError,
  ffmpegLastWarning,
  ffmpegProcessingTime,
  ffmpegCores,
  uploading,
  t,
}: {
  video: StoredVideo;
  ffmpegStatus: string;
  ffmpegProgress: number | null;
  ffmpegLastError: string | null;
  ffmpegLastWarning: string | null;
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
        {video.h264Converted && !video.isH265 ? (
          <>
            <dt>{t('detailCodec')}</dt>
            <dd>H.264 ({t('converted')})</dd>
          </>
        ) : null}
        {video.h265Converted && video.isH265 ? (
          <>
            <dt>{t('detailCodec')}</dt>
            <dd>H.265 ({t('converted')})</dd>
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
        {video.fileSize != null ? (
          <>
            <dt>{t('detailFileSize')}</dt>
            <dd>{formatFileSize(video.fileSize)}</dd>
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
        {ffmpegLastWarning ? (
          <>
            <dt>{t('detailFfmpegWarning')}</dt>
            <dd className="vi-warning-text">{ffmpegLastWarning}</dd>
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
  opfsVideoUrl,
  opfsThumbnailUrl,
}: {
  downloadURL: string | null;
  justAudio: boolean;
  thumbnail: string | null;
  compact?: boolean;
  opfsVideoUrl?: string | null;
  opfsThumbnailUrl?: string | null;
}) {
  const isOnline = useOnlineStatus();
  const t = useTranslations('VideoGrid');
  const isOpfs = downloadURL?.startsWith('opfs://') ?? false;

  if (!downloadURL) return null;
  if (isOpfs && !opfsVideoUrl) return null;

  // When offline and the media is not stored locally on the device, show a placeholder
  if (!isOnline && !opfsVideoUrl) {
    return (
      <Box
        className="vi-media-wrapper"
        display="flex"
        alignItems="center"
        justifyContent="center"
        minHeight={80}
        color="var(--foreground-muted, #999)"
      >
        <Typography variant="caption">
          {t('videoNotAvailableOffline')}
        </Typography>
      </Box>
    );
  }

  const src = opfsVideoUrl ?? resolveMediaUrl(downloadURL);
  const thumbnailSrc =
    opfsThumbnailUrl ??
    (thumbnail ? resolveMediaUrl(`/api/media/${thumbnail}`) : null);

  if (justAudio) {
    return (
      <>
        {thumbnailSrc ? (
          <Box className="vi-media-wrapper">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              className="vi-thumbnail"
              src={thumbnailSrc}
              alt=""
              loading="lazy"
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
        poster={isIOS() && thumbnailSrc ? thumbnailSrc : undefined}
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
  opfsMigrating,
  conversionTarget,
  t,
}: {
  ffmpegStatus: string;
  ffmpegProgress: number | null;
  videoStatus: VideoStatus;
  uploading: boolean;
  opfsMigrating?: boolean;
  conversionTarget?: 'h264' | 'h265';
  t: TranslationFn;
}) {
  if (opfsMigrating) {
    return (
      <Typography variant="caption" className="vi-ffmpeg-hint">
        {t('savingToDevice')}
      </Typography>
    );
  }

  if (ffmpegStatus === 'loading') {
    return (
      <Typography variant="caption" className="vi-ffmpeg-hint">
        {t('ffmpegLoading')}
      </Typography>
    );
  }

  if (ffmpegStatus === 'processing') {
    const message =
      videoStatus === 'converting' && conversionTarget === 'h265'
        ? t('convertingH265', { progress: ffmpegProgress })
        : videoStatus === 'converting'
          ? t('convertingH264', { progress: ffmpegProgress })
          : videoStatus === 'burning'
            ? t('burningCaptions', { progress: ffmpegProgress })
            : t('ffmpegProcessing', { progress: ffmpegProgress });
    return (
      <Typography variant="caption" className="vi-ffmpeg-hint">
        {message}
      </Typography>
    );
  }

  if (videoStatus === 'translating') {
    return (
      <Typography variant="caption" className="vi-ffmpeg-hint">
        {t('translatingCaptions')}
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
  onRedownload: () => void;
  onToggleExtra: () => void;
  onDelete: () => void;
  t: TranslationFn;
}) {
  const isOnline = useOnlineStatus();

  return (
    <Box className="vi-actions" display="flex" justifyContent="space-evenly">
      <Button
        unstyled
        className="vi-icon-btn"
        onClick={onDelete}
        aria-label={t('delete')}
        title={t('delete')}
        icon="/icons/delete-video.svg"
        iconSize="15px"
        iconColor="var(--foreground, #171717)"
      />

      <Button
        unstyled
        className="vi-icon-btn"
        onClick={onCopy}
        aria-label={t('copyLink')}
        title={copying ? t('copied') : t('copyLink')}
        icon="/icons/copy.svg"
        iconSize="15px"
        iconColor={
          copying ? 'var(--accent, #06b6d4)' : 'var(--foreground, #171717)'
        }
      />

      {video.downloadURL ? (
        <Button
          unstyled
          className="vi-icon-btn"
          onClick={onRedownload}
          aria-label={t('redownload')}
          title={t('redownload')}
          icon={isIOS() ? '/icons/safari.svg' : '/icons/download.svg'}
          iconSize="15px"
          iconColor="var(--foreground, #171717)"
        />
      ) : null}

      <Button
        unstyled
        className="vi-icon-btn"
        onClick={onToggleExtra}
        aria-label={t('toggleExtraActions')}
        title={t('toggleExtraActions')}
        disabled={isBusy || !isOnline}
      >
        <Icon
          icon="/icons/chevron-down.svg"
          size={15}
          color="var(--foreground, #171717)"
          className={
            extraActionsOpen ? 'vi-chevron--open' : 'vi-chevron--closed'
          }
        />
      </Button>
    </Box>
  );
}

/* ── Extra actions panel ─────────────────────────────── */

export function VideoExtraActions({
  video,
  isBusy,
  fpsError,
  h264Error,
  h265Error,
  blackBarsError,
  scaleDownError,
  onRemoveBlackBars,
  onInterpolateFps,
  onConvert,
  onConvertH265,
  onDownloadCaptions,
  onBurnCaptions,
  onMakeOffline,
  onScaleDown,
  initialWsClientUuid,
  onWsClientChange,
  t,
}: {
  video: StoredVideo;
  isBusy: boolean;
  fpsError: boolean;
  h264Error: boolean;
  h265Error: boolean;
  blackBarsError: boolean;
  scaleDownError?: boolean;
  onRemoveBlackBars: () => void;
  onInterpolateFps: (fps: number) => void;
  onConvert: () => void;
  onConvertH265: () => void;
  onDownloadCaptions?: () => void;
  onBurnCaptions?: () => void;
  onMakeOffline?: () => Promise<void>;
  onScaleDown?: (targetHeight: number) => void;
  initialWsClientUuid?: string | null;
  onWsClientChange?: (uuid: string) => void;
  t: TranslationFn;
}) {
  const [currentWsUuid, setCurrentWsUuid] = useState<string>(
    initialWsClientUuid ?? THIS_DEVICE_UUID,
  );
  const [wsClientOnline, setWsClientOnline] = useState(true);
  const [fpsDeviceModalFps, setFpsDeviceModalFps] = useState<number | null>(
    null,
  );
  const [offlineMigrating, setOfflineMigrating] = useState(false);
  const [showScaleDownModal, setShowScaleDownModal] = useState(false);

  const serverSelected = currentWsUuid !== THIS_DEVICE_UUID;
  const canProcess =
    !isBusy &&
    !!video.downloadURL &&
    !video.justAudio &&
    (!serverSelected || wsClientOnline);

  const isFhdOrHigher =
    video.height != null
      ? (video.width != null
          ? Math.min(video.height, video.width)
          : video.height) >= 1080
      : false;

  /* Resolutions available for scale-down: only those smaller than the
     current short-side pixel count (Math.min of height × width). */
  const SCALE_DOWN_STEPS = [2160, 1440, 1080, 720, 480, 360] as const;
  const currentShortSide =
    video.height != null && video.width != null
      ? Math.min(video.height, video.width)
      : (video.height ?? 0);
  const availableScaleResolutions = SCALE_DOWN_STEPS.filter(
    (h) => currentShortSide > 0 && h < currentShortSide,
  );

  const handleFpsClick = (fps: number) => {
    if (isFhdOrHigher && currentWsUuid === THIS_DEVICE_UUID) {
      setFpsDeviceModalFps(fps);
      return;
    }
    onInterpolateFps(fps);
  };

  return (
    <>
      {fpsDeviceModalFps !== null ? (
        <ConfirmationModal
          title={t('fpsDeviceOnlyTitle')}
          text={t('fpsDeviceOnlyText')}
          okCallback={() => setFpsDeviceModalFps(null)}
        />
      ) : null}
      {showScaleDownModal ? (
        <ConfirmationModal
          title={t('scaleDownTitle')}
          text={t('scaleDownText')}
          okCallback={() => setShowScaleDownModal(false)}
          panelMaxWidth="340px"
        >
          <Box
            display="flex"
            styles={{ flexWrap: 'wrap', gap: '6px', marginTop: '10px' }}
          >
            {availableScaleResolutions.map((h) => (
              <Button
                key={h}
                unstyled
                className="vi-fps-btn"
                onClick={() => {
                  setShowScaleDownModal(false);
                  onScaleDown?.(h);
                }}
              >
                {buildResolutionLabel(h)}
              </Button>
            ))}
          </Box>
        </ConfirmationModal>
      ) : null}
      <Box className="vi-extra-actions">
        {onWsClientChange ? (
          <WsClientPanel
            showManagement
            initialValue={initialWsClientUuid}
            onChange={(uuid) => {
              setCurrentWsUuid(uuid);
              onWsClientChange(uuid);
            }}
            onOnlineChange={setWsClientOnline}
            labels={{
              thisDevice: t('thisDevice'),
              server: t('server'),
              addServer: t('addServer'),
              deleteServer: t('deleteServer'),
              addServerTitle: t('addServerTitle'),
              addServerText: t('addServerText'),
              wsClientUuidLabel: t('wsClientUuidLabel'),
              wsClientNameLabel: t('wsClientNameLabel'),
              deleteServerTitle: t('deleteServerTitle'),
              deleteServerText: (label) => t('deleteServerText', { label }),
              installHint: t('installHint'),
              downloadLinux: t('downloadLinux'),
              // downloadWindows: t('downloadWindows'), // Future: fix Windows client and uncomment this
              offline: t('wsClientOffline'),
            }}
          />
        ) : null}
        {/* ── Divider ──────────────────────────────────── */}
        <Divider marginTop={5} opacity={0.5} />
        <Grid container spacing={1} marginTop={5} marginBottom={5}>
          {onMakeOffline &&
          !video.opfsStored &&
          !!video.file &&
          !video.serverFileDeleted ? (
            <Grid size={{ xs: 6 }}>
              <Button
                unstyled
                className="vi-fps-btn"
                onClick={() => {
                  setOfflineMigrating(true);
                  onMakeOffline()
                    .catch(() => {})
                    .finally(() => setOfflineMigrating(false));
                }}
                disabled={isBusy || offlineMigrating}
                aria-label={
                  offlineMigrating ? t('savingToDevice') : t('makeOffline')
                }
                title={
                  offlineMigrating ? t('savingToDevice') : t('makeOffline')
                }
                icon="/icons/offline.svg"
                iconSize="14px"
                iconColor="var(--accent, #8b5cf6)"
                isLoading={offlineMigrating}
              >
                {offlineMigrating ? t('savingToDevice') : t('makeOffline')}
              </Button>
            </Grid>
          ) : null}

          {video.isH265 ? (
            <Grid size={{ xs: 6 }}>
              <Button
                unstyled
                className="vi-fps-btn"
                onClick={onConvert}
                disabled={
                  isBusy || h264Error || (serverSelected && !wsClientOnline)
                }
                aria-label={t('convertH264')}
                title={t('convertH264')}
                icon="/icons/convert.svg"
                iconSize="14px"
                iconColor="var(--accent, #8b5cf6)"
              >
                {t('convertH264')}
              </Button>
            </Grid>
          ) : null}

          {!video.justAudio && !video.isH265 ? (
            <Grid size={{ xs: 6 }}>
              <Button
                unstyled
                className="vi-fps-btn"
                onClick={onConvertH265}
                disabled={
                  isBusy || h265Error || (serverSelected && !wsClientOnline)
                }
                aria-label={t('convertH265')}
                title={t('convertH265')}
                icon="/icons/h265.svg"
                iconSize="14px"
                iconColor="var(--accent, #8b5cf6)"
              >
                {t('convertH265')}
              </Button>
            </Grid>
          ) : null}

          {!video.justAudio && !video.blackBarsRemoved ? (
            <Grid size={{ xs: 6 }}>
              <Button
                unstyled
                className="vi-fps-btn"
                onClick={onRemoveBlackBars}
                disabled={!canProcess || blackBarsError}
                aria-label={t('removeBlackBars')}
                title={t('removeBlackBars')}
                icon="/icons/remove-black-bars.svg"
                iconSize="14px"
                iconColor="var(--accent, #8b5cf6)"
              >
                {t('removeBlackBars')}
              </Button>
            </Grid>
          ) : null}

          {video.captionsFile && onDownloadCaptions ? (
            <Grid size={{ xs: 6 }}>
              <Button
                unstyled
                className="vi-fps-btn"
                onClick={onDownloadCaptions}
                aria-label={t('downloadCaptions')}
                title={t('downloadCaptions')}
                icon="/icons/captions.svg"
                iconSize="14px"
                iconColor="var(--accent, #8b5cf6)"
              >
                {t('downloadCaptions')}
              </Button>
            </Grid>
          ) : null}

          {video.captionsFile && !video.justAudio && onBurnCaptions ? (
            <Grid size={{ xs: 6 }}>
              <Button
                unstyled
                className="vi-fps-btn"
                onClick={onBurnCaptions}
                disabled={!canProcess || isBusy}
                aria-label={t('burnCaptions')}
                title={t('burnCaptions')}
                icon="/icons/write.svg"
                iconSize="14px"
                iconColor="var(--accent, #8b5cf6)"
              >
                {t('burnCaptions')}
              </Button>
            </Grid>
          ) : null}

          {!video.justAudio &&
          !!onScaleDown &&
          availableScaleResolutions.length > 0 ? (
            <Grid size={{ xs: 6 }}>
              <Button
                unstyled
                className="vi-fps-btn"
                onClick={() => setShowScaleDownModal(true)}
                disabled={!canProcess || scaleDownError}
                aria-label={t('scaleDown')}
                title={t('scaleDown')}
                icon="/icons/scale-down.svg"
                iconSize="14px"
                iconColor="var(--accent, #8b5cf6)"
              >
                {t('scaleDown')}
              </Button>
            </Grid>
          ) : null}
        </Grid>

        {/* ── Divider ──────────────────────────────────── */}
        <Divider marginBottom={5} opacity={0.5} />

        {!video.justAudio ? (
          <Box>
            {buildFpsOptions(video.sourceFps).map(({ value, label }) => {
              const alreadyApplied =
                video.fpsApplied && value <= Number(video.fps);
              return (
                <Button
                  key={value}
                  unstyled
                  className="vi-fps-btn"
                  onClick={() => handleFpsClick(value)}
                  disabled={!canProcess || alreadyApplied || fpsError}
                  title={label}
                >
                  {label}
                </Button>
              );
            })}
          </Box>
        ) : null}
      </Box>
    </>
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

/** Formats a height value as a human-readable resolution option label, e.g. "FHD 1080". */
export function buildResolutionLabel(height: number): string {
  const name = resolveResolutionLabel(height);
  return name ? `${name} ${height}` : `${height}p`;
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
      <Button
        unstyled
        className="vi-icon-btn"
        onClick={onToggleDetails}
        aria-label={t('toggleDetails')}
        icon="/icons/hamburger.svg"
        iconSize="16px"
        iconColor="var(--foreground, #171717)"
      />
    </Box>
  );
}

/* ── Platform icon background ───────────────────────── */

export function PlatformIconBg({
  platform,
  position = 'bottom-left',
  widthPct = 40,
  iconMarginTop,
  iconMarginLeft,
}: {
  platform: string;
  position?: 'top-left' | 'bottom-left';
  widthPct?: number;
  iconMarginTop?: number | string;
  iconMarginLeft?: number | string;
}) {
  const icon = PLATFORM_ICONS[platform];
  const isTop = position === 'top-left';

  if (!icon || platform === 'unknown') return null;

  return (
    <div className={`pib-root pib-root--${isTop ? 'top' : 'bottom'}`}>
      <div
        className="pib-gradient"
        style={{
          background: `radial-gradient(ellipse at ${isTop ? 'top' : 'bottom'} left, color-mix(in srgb, var(--accent, #06b6d4) 40%, transparent) 0%, transparent 70%)`,
        }}
      />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={icon}
        alt=""
        aria-hidden="true"
        className="pib-icon"
        style={{
          width: `${widthPct}%`,
          marginTop: iconMarginTop,
          marginLeft: iconMarginLeft,
        }}
      />
    </div>
  );
}

/* ── Card footer link row ──────────────────────────── */

export function VideoFooterLink({ video }: { video: StoredVideo }) {
  const platformIcon =
    PLATFORM_ICONS[video.platform] ?? PLATFORM_ICONS.unknown!;

  const fpsBadge = video.fpsApplied
    ? `${video.fps} FPS`
    : video.sourceFps != null
      ? `${video.sourceFps} FPS`
      : video.fps !== 'original'
        ? `${video.fps} FPS`
        : null;

  const resolutionLabel = !video.justAudio
    ? resolveResolutionLabel(video.height, video.width)
    : null;

  return (
    <Box
      className="vi-link-row"
      display="flex"
      justifyContent="space-between"
      alignItems="center"
    >
      <Box
        display="flex"
        alignItems="center"
        styles={{ gap: '6px', minWidth: 0 }}
      >
        <a
          href={video.originalURL}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={video.originalURL}
          style={{ display: 'flex', alignItems: 'center' }}
        >
          <Icon icon={platformIcon} size={24} color="var(--accent, #06b6d4)" />
        </a>
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
      <Box
        display="flex"
        alignItems="center"
        styles={{ gap: '4px', flexShrink: 0 }}
      >
        {video.isH265 ? (
          <Badge variant="subtle" size="sm" color="#16dd00">
            H265
          </Badge>
        ) : null}
        {fpsBadge ? (
          <Badge variant="subtle" size="sm" color="#f59e0b">
            {fpsBadge}
          </Badge>
        ) : null}
        {resolutionLabel ? (
          <Badge variant="subtle" size="sm" color="#38bdf8">
            {resolutionLabel}
          </Badge>
        ) : null}
      </Box>
    </Box>
  );
}
