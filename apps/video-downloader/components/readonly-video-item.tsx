'use client';

import { useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { Box } from '@repo/ui/core-elements/box';
import { ConfirmationModal } from '@repo/ui/core-elements/confirmation-modal';
import type { StoredVideo } from './use-video-store';
import {
  STATUS_COLORS,
  resolveMediaUrl,
  triggerBrowserDownload,
  downloadThumbnail,
  VideoDetailsPanel,
  VideoMediaPreview,
  VideoActions,
  VideoExtraActions,
  VideoCardHeader,
  VideoFooterLink,
} from './video-item-shared';
import './video-item.css';

/* ── Props ──────────────────────────────────────────── */

export type ReprocessAction = 'fps' | 'h264' | 'bars' | 'retry';

export interface ReadOnlyVideoItemProps {
  video: StoredVideo;
  onReprocess: (
    uuid: string,
    action: ReprocessAction,
    extra?: number,
  ) => void;
  onRemove: (uuid: string) => void;
  onUpdate: (uuid: string, patch: Partial<StoredVideo>) => void;
}

/* ── Component ──────────────────────────────────────── */

export function ReadOnlyVideoItem({
  video,
  onReprocess,
  onRemove,
}: ReadOnlyVideoItemProps) {
  const t = useTranslations('VideoGrid');
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [extraActionsOpen, setExtraActionsOpen] = useState(false);
  const [copying, setCopying] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [confirmConvert, setConfirmConvert] = useState(false);

  const displayName =
    video.name ??
    video.uploader ??
    (video.justAudio ? t('untitledAudio') : t('untitledVideo'));

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
      const thumbSrc = video.thumbnail ? resolveMediaUrl(`/api/media/${video.thumbnail}`) : null;
      if (thumbSrc) {
        downloadThumbnail(thumbSrc, video.name);
      }
    }
  }, [video.downloadURL, video.name, video.justAudio, video.thumbnail]);

  /* ── Retry → move to pinned for reprocessing ─────── */
  const handleRetry = useCallback(() => {
    onReprocess(video.uuid, 'retry');
  }, [onReprocess, video.uuid]);

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
      <VideoCardHeader
        video={video}
        displayName={displayName}
        onToggleDetails={() => setDetailsOpen((p) => !p)}
        t={t}
      />

      {/* ── Details panel (collapsible) ───────────── */}
      {detailsOpen ? (
        <VideoDetailsPanel
          video={video}
          ffmpegStatus="idle"
          ffmpegProgress={null}
          ffmpegLastError={null}
          ffmpegProcessingTime={null}
          ffmpegCores={null}
          uploading={false}
          t={t}
        />
      ) : null}

      {/* ── Media preview ─────────────────────────── */}
      <VideoMediaPreview
        downloadURL={video.downloadURL}
        justAudio={video.justAudio}
        thumbnail={video.thumbnail}
      />

      {/* ── Footer actions ────────────────────────── */}
      <Box className="vi-footer">
        <VideoFooterLink video={video} />

        <VideoActions
          video={video}
          isBusy={false}
          copying={copying}
          extraActionsOpen={extraActionsOpen}
          onCopy={handleCopy}
          onRetry={handleRetry}
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
          isBusy={false}
          fpsError={false}
          h264Error={false}
          blackBarsError={false}
          onRemoveBlackBars={() => onReprocess(video.uuid, 'bars')}
          onInterpolateFps={(fps) => onReprocess(video.uuid, 'fps', fps)}
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
            onReprocess(video.uuid, 'h264');
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
            if (video.taskId) {
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

export default ReadOnlyVideoItem;
