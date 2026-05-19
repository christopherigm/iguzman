'use client';

import { useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { Box } from '@repo/ui/core-elements/box';
import { ConfirmationModal } from '@repo/ui/core-elements/confirmation-modal';
import type { BurnCaptionsConfig } from '@/lib/types';
import type { StoredVideo, VideoStatus } from './use-video-store';
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
  PlatformIconBg,
} from './video-item-shared';
import { VideoComments } from './video-comments';
import { useOPFSUrls } from './opfs-url-context';
import {
  deleteFromOPFS,
  writeToOPFS,
  readFromOPFS,
  isOPFSSupported,
} from '@/lib/opfs';
import { BurnCaptionsModal } from './burn-captions-modal';
import './video-item.css';

/* ── Props ──────────────────────────────────────────── */

export type ReprocessAction =
  | 'fps'
  | 'h264'
  | 'h265'
  | 'bars'
  | 'burnCaptions'
  | 'scaleDown';

export interface ReadOnlyVideoItemProps {
  video: StoredVideo;
  onReprocess: (
    uuid: string,
    action: ReprocessAction,
    extra?: number,
    config?: BurnCaptionsConfig,
  ) => void;
  onRemove: (uuid: string) => void;
  onUpdate: (uuid: string, patch: Partial<StoredVideo>) => void;
  onDuplicate: (newVideo: StoredVideo) => void;
}

/* ── Component ──────────────────────────────────────── */

export function ReadOnlyVideoItem({
  video,
  onReprocess,
  onRemove,
  onUpdate,
  onDuplicate,
}: ReadOnlyVideoItemProps) {
  const t = useTranslations('VideoGrid');
  const { getUrls, registerUrls } = useOPFSUrls();
  const opfsUrls = video.opfsEnabled ? getUrls(video.uuid) : null;

  const [detailsOpen, setDetailsOpen] = useState(false);
  const [extraActionsOpen, setExtraActionsOpen] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [copying, setCopying] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [showBurnModal, setShowBurnModal] = useState(false);

  const displayName =
    video.fulltitle ??
    video.name ??
    video.uploader ??
    (video.justAudio ? t('untitledAudio') : t('untitledVideo'));

  /* ── Server mode toggle ──────────────────────────── */
  const handleServerModeChange = useCallback(
    (enabled: boolean) => {
      onUpdate(video.uuid, { useServerProcessing: enabled });
    },
    [onUpdate, video.uuid],
  );

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
    const url = opfsUrls?.videoUrl ?? video.downloadURL;
    triggerBrowserDownload(
      url,
      `${video.name ?? (video.justAudio ? 'audio' : 'video')}-${Date.now()}`,
    );
    if (video.justAudio) {
      const thumbSrc =
        opfsUrls?.thumbnailUrl ??
        (video.thumbnail
          ? resolveMediaUrl(`/api/media/${video.thumbnail}`)
          : null);
      if (thumbSrc) {
        downloadThumbnail(thumbSrc, video.name);
      }
    }
  }, [
    video.downloadURL,
    video.name,
    video.justAudio,
    video.thumbnail,
    opfsUrls,
  ]);

  /* ── Make video offline (save to OPFS) ─────────────── */
  const handleMakeOffline = useCallback(async () => {
    if (!video.file || !isOPFSSupported()) return;

    const videoRes = await fetch(resolveMediaUrl(`/api/media/${video.file}`));
    if (!videoRes.ok)
      throw new Error(`Failed to fetch video: ${videoRes.status}`);
    const videoBlob = await videoRes.blob();
    const key = video.file;
    await writeToOPFS(key, videoBlob);

    let thumbKey: string | null = null;
    if (video.thumbnail) {
      try {
        const thumbRes = await fetch(
          resolveMediaUrl(`/api/media/${video.thumbnail}`),
        );
        if (thumbRes.ok) {
          const thumbBlob = await thumbRes.blob();
          thumbKey = `thumb_${video.thumbnail}`;
          await writeToOPFS(thumbKey, thumbBlob);
        }
      } catch {}
    }

    let captionsKey: string | null = null;
    if (video.captionsFile) {
      try {
        const captionsRes = await fetch(resolveMediaUrl(video.captionsFile));
        if (captionsRes.ok) {
          const captionsBlob = await captionsRes.blob();
          const captionsFilename = video.captionsFile.split('/').pop()!;
          captionsKey = `captions_${captionsFilename}`;
          await writeToOPFS(captionsKey, captionsBlob);
        }
      } catch {}
    }

    let commentsKey: string | null = null;
    if (video.commentsFile) {
      try {
        const commentsRes = await fetch(resolveMediaUrl(video.commentsFile));
        if (commentsRes.ok) {
          const commentsBlob = await commentsRes.blob();
          const commentsFilename = video.commentsFile.split('/').pop()!;
          commentsKey = `comments_${commentsFilename}`;
          await writeToOPFS(commentsKey, commentsBlob);
        }
      } catch {}
    }

    const videoFile = await readFromOPFS(key);
    const videoUrl = URL.createObjectURL(videoFile);
    let thumbnailUrl: string | null = null;
    if (thumbKey) {
      try {
        const thumbFile = await readFromOPFS(thumbKey);
        thumbnailUrl = URL.createObjectURL(thumbFile);
      } catch {}
    }
    registerUrls(video.uuid, { videoUrl, thumbnailUrl });

    if (video.taskId && !video.serverFileDeleted) {
      await fetch(`/api/download-video/${video.taskId}`, {
        method: 'DELETE',
      }).catch(() => {});
    }

    onUpdate(video.uuid, {
      opfsEnabled: true,
      opfsKey: key,
      opfsThumbnailKey: thumbKey,
      opfsCaptionsKey: captionsKey,
      opfsCommentsKey: commentsKey,
      opfsStored: true,
      serverFileDeleted: video.taskId ? true : video.serverFileDeleted,
      downloadURL: `opfs://${key}`,
    });
  }, [video, onUpdate, registerUrls]);

  /* ── Duplicate video (OPFS only) ─────────────────── */
  const handleDuplicate = useCallback(async () => {
    if (!video.opfsStored || !video.opfsKey) return;

    const newUuid = crypto.randomUUID();
    const ext = (key: string) => key.match(/(\.[^.]+)$/)?.[1] ?? '';

    const newOpfsKey = `dup_${newUuid}${ext(video.opfsKey)}`;
    const videoFile = await readFromOPFS(video.opfsKey);
    await writeToOPFS(newOpfsKey, videoFile);
    const videoUrl = URL.createObjectURL(videoFile);

    let newThumbnailKey: string | null = null;
    let thumbnailUrl: string | null = null;
    if (video.opfsThumbnailKey) {
      try {
        const thumbFile = await readFromOPFS(video.opfsThumbnailKey);
        newThumbnailKey = `dup_thumb_${newUuid}${ext(video.opfsThumbnailKey)}`;
        await writeToOPFS(newThumbnailKey, thumbFile);
        thumbnailUrl = URL.createObjectURL(thumbFile);
      } catch {}
    }

    let newCaptionsKey: string | null = null;
    if (video.opfsCaptionsKey) {
      try {
        const captionsFile = await readFromOPFS(video.opfsCaptionsKey);
        newCaptionsKey = `dup_captions_${newUuid}${ext(video.opfsCaptionsKey)}`;
        await writeToOPFS(newCaptionsKey, captionsFile);
      } catch {}
    }

    let newCommentsKey: string | null = null;
    if (video.opfsCommentsKey) {
      try {
        const commentsFile = await readFromOPFS(video.opfsCommentsKey);
        newCommentsKey = `dup_comments_${newUuid}${ext(video.opfsCommentsKey)}`;
        await writeToOPFS(newCommentsKey, commentsFile);
      } catch {}
    }

    registerUrls(newUuid, { videoUrl, thumbnailUrl });

    const newVideo: StoredVideo = {
      ...video,
      uuid: newUuid,
      name: video.name ? `(Copy) ${video.name}` : null,
      fulltitle: video.fulltitle ? `(Copy) ${video.fulltitle}` : null,
      createdAt: Date.now(),
      opfsKey: newOpfsKey,
      opfsThumbnailKey: newThumbnailKey,
      opfsCaptionsKey: newCaptionsKey,
      opfsCommentsKey: newCommentsKey,
      downloadURL: `opfs://${newOpfsKey}`,
      taskId: video.taskId,
      serverTaskId: null,
      serverFileDeleted: true,
      status: 'done' as VideoStatus,
      error: null,
    };

    onDuplicate(newVideo);
  }, [video, registerUrls, onDuplicate]);

  /* ── Download captions file ──────────────────────── */
  const handleDownloadCaptions = useCallback(async () => {
    const name = video.name ?? 'video';
    if (video.opfsCaptionsKey) {
      try {
        const file = await readFromOPFS(video.opfsCaptionsKey);
        await triggerBrowserDownload(file, `${name}-captions.txt`);
      } catch (err) {
        console.error('Failed to read captions from OPFS:', err);
      }
      return;
    }
    if (!video.captionsFile) return;
    const url = resolveMediaUrl(video.captionsFile);
    await triggerBrowserDownload(url, `${name}-captions.txt`);
  }, [video.captionsFile, video.opfsCaptionsKey, video.name]);

  /* ── Burn captions: collect config then hand off to PinnedVideoItem ── */
  const handleBurnCaptions = useCallback(
    (config: BurnCaptionsConfig) => {
      setShowBurnModal(false);
      onReprocess(video.uuid, 'burnCaptions', undefined, config);
    },
    [onReprocess, video.uuid],
  );

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
          ffmpegStatus="idle"
          ffmpegProgress={null}
          ffmpegLastError={null}
          ffmpegLastWarning={null}
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
        withComments={commentsOpen}
        opfsVideoUrl={opfsUrls?.videoUrl}
        opfsThumbnailUrl={opfsUrls?.thumbnailUrl}
      />
      {/* ── Comments panel ────────────────────────── */}
      {commentsOpen && video.commentsFile ? (
        <VideoComments
          commentsUrl={video.commentsFile}
          opfsCommentsKey={video.opfsCommentsKey}
        />
      ) : null}
      {/* ── Footer actions ────────────────────────── */}
      <Box className="vi-footer">
        <VideoFooterLink video={video} />

        <VideoActions
          video={video}
          isBusy={false}
          copying={copying}
          extraActionsOpen={extraActionsOpen}
          commentsOpen={commentsOpen}
          onCopy={handleCopy}
          onRedownload={handleRedownload}
          onToggleExtra={() => setExtraActionsOpen((p) => !p)}
          onToggleComments={video.commentsFile ? () => setCommentsOpen((p) => !p) : undefined}
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
          h265Error={false}
          blackBarsError={false}
          onRemoveBlackBars={() => onReprocess(video.uuid, 'bars')}
          onInterpolateFps={(fps) => onReprocess(video.uuid, 'fps', fps)}
          onConvert={() => onReprocess(video.uuid, 'h264')}
          onConvertH265={() => onReprocess(video.uuid, 'h265')}
          onDownloadCaptions={handleDownloadCaptions}
          onBurnCaptions={() => setShowBurnModal(true)}
          onScaleDown={(height) => onReprocess(video.uuid, 'scaleDown', height)}
          onMakeOffline={handleMakeOffline}
          onDuplicate={handleDuplicate}
          useServerProcessing={video.useServerProcessing}
          onServerModeChange={handleServerModeChange}
          t={t}
        />
      ) : null}
      {/* ── Confirmation modals ───────────────────── */}
      {showBurnModal ? (
        <BurnCaptionsModal
          onConfirm={handleBurnCaptions}
          onCancel={() => setShowBurnModal(false)}
          videoUrl={opfsUrls?.videoUrl ?? video.downloadURL ?? null}
          videoWidth={video.width}
          videoHeight={video.height}
        />
      ) : null}
      {confirmRemove ? (
        <ConfirmationModal
          title={t('confirmDeleteTitle')}
          text={t('confirmDeleteText')}
          okCallback={() => {
            setConfirmRemove(false);
            if (video.taskId && !video.serverFileDeleted) {
              fetch(`/api/download-video/${video.taskId}`, {
                method: 'DELETE',
              }).catch(console.error);
            }
            if (video.opfsKey) void deleteFromOPFS(video.opfsKey);
            if (video.opfsThumbnailKey)
              void deleteFromOPFS(video.opfsThumbnailKey);
            if (video.opfsCaptionsKey)
              void deleteFromOPFS(video.opfsCaptionsKey);
            if (video.opfsCommentsKey)
              void deleteFromOPFS(video.opfsCommentsKey);
            onRemove(video.uuid);
          }}
          cancelCallback={() => setConfirmRemove(false)}
        />
      ) : null}
    </Box>
  );
}

export default ReadOnlyVideoItem;
