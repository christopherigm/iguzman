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
import { useFFmpeg } from './use-ffmpeg';
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
  processing: '#f59e0b',
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
  const downloadTriggered = useRef(false);

  /* FFmpeg WASM (lazy-loaded for client-side FPS interpolation) */
  const {
    status: ffmpegStatus,
    progress: ffmpegProgress,
    interpolateFps,
  } = useFFmpeg();

  const platformIcon =
    PLATFORM_ICONS[video.platform] ?? PLATFORM_ICONS.unknown!;
  const isProcessing =
    video.status === 'downloading' || video.status === 'processing';
  const displayName = video.name ?? video.uploader ?? t('untitledVideo');

  /* ── Download handler (each item independent) ───── */
  const handleDownload = useCallback(async () => {
    onUpdate(video.uuid, { status: 'downloading', error: null });

    try {
      const result = await httpPost<ApiSuccessResponse>({
        baseUrl: window.location.origin,
        url: '/api/download-video',
        body: { url: video.originalURL, justAudio: video.justAudio },
      });

      const { file, name, metadata } = result.data.data;

      const downloadURL = file ? `/api/media/${file}` : null;

      onUpdate(video.uuid, {
        status: 'done',
        file: file ?? null,
        name: name ?? null,
        downloadURL,
        thumbnail: metadata?.thumbnail ?? null,
        duration: metadata?.duration ?? null,
        uploader: metadata?.uploader ?? null,
      });

      /* Auto-trigger browser download */
      if (file && video.autoDownload) {
        let downloadHref = downloadURL!;

        /* ── FPS interpolation via FFmpeg WASM ──────── */
        if (video.fps !== 'original' && !video.justAudio) {
          try {
            onUpdate(video.uuid, { status: 'processing' });
            const sourceUrl = `${window.location.origin}/api/media/${file}`;
            const processedUrl = await interpolateFps(
              sourceUrl,
              Number(video.fps),
            );
            downloadHref = processedUrl;
            onUpdate(video.uuid, { status: 'done' });
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
    video.uuid,
    video.originalURL,
    video.justAudio,
    video.autoDownload,
    video.fps,
    onUpdate,
    interpolateFps,
    t,
  ]);

  /* ── Auto-trigger download for newly added (pending) items ── */
  useEffect(() => {
    if (video.status === 'pending' && !downloadTriggered.current) {
      downloadTriggered.current = true;
      handleDownload();
    }
  }, [video.status, handleDownload]);

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
      {isProcessing ? <ProgressBar margin="0" /> : null}

      {/* ── FFmpeg status ─────────────────────────── */}
      {ffmpegStatus === 'loading' ? (
        <span className="vi-ffmpeg-hint">{t('ffmpegLoading')}</span>
      ) : null}
      {ffmpegStatus === 'processing' ? (
        <span className="vi-ffmpeg-hint">
          {t('ffmpegProcessing', { progress: ffmpegProgress })}
        </span>
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
            disabled={isProcessing}
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

          <button
            type="button"
            className="vi-icon-btn vi-icon-btn--danger"
            onClick={() => onRemove(video.uuid)}
            aria-label={t('delete')}
            title={t('delete')}
          >
            <Icon icon="/icons/delete-video.svg" size={15} color="#ef4444" />
          </button>
        </Box>
      </Box>
    </Box>
  );
}

export default VideoItem;
