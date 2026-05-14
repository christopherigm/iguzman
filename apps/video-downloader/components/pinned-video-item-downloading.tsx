'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { Box } from '@repo/ui/core-elements/box';
import { ProgressBar } from '@repo/ui/core-elements/progress-bar';
import { ConfirmationModal } from '@repo/ui/core-elements/confirmation-modal';
import { Typography } from '@repo/ui/core-elements/typography';
import { Button } from '@repo/ui/core-elements/button';
import type { DownloadVideoError } from '@repo/helpers/download-video';
import { usePollTask, type TaskData } from './use-poll-task';
import type { StoredVideo } from './use-video-store';
import {
  STATUS_COLORS,
  resolveMediaUrl,
  triggerBrowserDownload,
  downloadThumbnail,
  VideoCardHeader,
  VideoDetailsPanel,
  VideoMediaPreview,
  VideoFooterLink,
  isIOS,
  PlatformIconBg,
} from './video-item-shared';
import { useOPFSUrls } from './opfs-url-context';
import { writeToOPFS, readFromOPFS, deleteFromOPFS } from '@/lib/opfs';
import './video-item.css';

/* ── API types ──────────────────────────────────────── */

interface TaskCreateResponse {
  task: { _id: string; status: string };
  error?: DownloadVideoError;
}

/* ── Props ──────────────────────────────────────────── */

export interface PinnedVideoItemDownloadingProps {
  video: StoredVideo;
  onUpdate: (uuid: string, patch: Partial<StoredVideo>) => void;
  onComplete: (uuid: string) => void;
  onRemove: (uuid: string) => void;
}

/* ── Component ──────────────────────────────────────── */

export function PinnedVideoItemDownloading({
  video,
  onUpdate,
  onComplete,
  onRemove,
}: PinnedVideoItemDownloadingProps) {
  const t = useTranslations('VideoGrid');
  const { registerUrls } = useOPFSUrls();
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [opfsMigrating, setOpfsMigrating] = useState(false);

  const downloadTriggered = useRef(false);
  const pollResumeChecked = useRef(false);

  const { startPolling, stopPolling } = usePollTask();

  const isActive =
    video.status === 'pending' ||
    video.status === 'downloading' ||
    video.status === 'queued';

  const displayName =
    video.name ??
    video.uploader ??
    (video.justAudio ? t('untitledAudio') : t('untitledVideo'));

  /* ── Handle completed download ─────────────────────── */
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

      // Migrate to OPFS before moving to completed
      if (video.opfsEnabled && file) {
        setOpfsMigrating(true);
        void (async () => {
          let thumbKey: string | null = null;
          let captionsKey: string | null = null;
          try {
            const videoRes = await fetch(resolveMediaUrl(`/api/media/${file}`));
            if (!videoRes.ok) throw new Error('video fetch failed');
            const videoBlob = await videoRes.blob();
            await writeToOPFS(file, videoBlob);

            if (task.thumbnail) {
              try {
                const thumbRes = await fetch(
                  resolveMediaUrl(`/api/media/${task.thumbnail}`),
                );
                if (thumbRes.ok) {
                  const thumbBlob = await thumbRes.blob();
                  thumbKey = `thumb_${task.thumbnail}`;
                  await writeToOPFS(thumbKey, thumbBlob);
                }
              } catch {}
            }

            if (task.captionsFile) {
              try {
                const captionsRes = await fetch(
                  resolveMediaUrl(`/api/media/${task.captionsFile}`),
                );
                if (captionsRes.ok) {
                  const captionsBlob = await captionsRes.blob();
                  captionsKey = `captions_${task.captionsFile}`;
                  await writeToOPFS(captionsKey, captionsBlob);
                }
              } catch {}
            }

            if (task._id) {
              fetch(`/api/download-video/${task._id}`, {
                method: 'DELETE',
              }).catch(() => {});
            }

            const videoFile = await readFromOPFS(file);
            const videoUrl = URL.createObjectURL(videoFile);
            let thumbnailUrl: string | null = null;
            if (thumbKey) {
              try {
                const thumbFile = await readFromOPFS(thumbKey);
                thumbnailUrl = URL.createObjectURL(thumbFile);
              } catch {}
            }
            registerUrls(video.uuid, { videoUrl, thumbnailUrl });

            onUpdate(video.uuid, {
              opfsKey: file,
              opfsThumbnailKey: thumbKey,
              opfsCaptionsKey: captionsKey,
              opfsStored: true,
              serverFileDeleted: true,
              downloadURL: `opfs://${file}`,
              fileSize: videoBlob.size,
            });

            if (video.autoDownload) {
              triggerBrowserDownload(
                videoUrl,
                `${name ?? 'video'}-${Date.now()}-${file}`,
              );
            }
          } catch (err) {
            console.error('OPFS migration failed:', err);
            const isQuotaError =
              err instanceof DOMException && err.name === 'QuotaExceededError';
            if (isQuotaError) {
              // Clean up any partially written OPFS files
              await deleteFromOPFS(file);
              if (thumbKey) await deleteFromOPFS(thumbKey);
              if (captionsKey) await deleteFromOPFS(captionsKey);
              // Remove server file and MongoDB entry
              if (task._id) {
                fetch(`/api/download-video/${task._id}`, {
                  method: 'DELETE',
                }).catch(() => {});
              }
              onUpdate(video.uuid, {
                status: 'error',
                error: t('errorStorageQuota'),
                opfsKey: null,
                opfsThumbnailKey: null,
                opfsCaptionsKey: null,
                opfsStored: false,
                downloadURL: null,
                serverFileDeleted: true,
              });
            }
          } finally {
            setOpfsMigrating(false);
            onComplete(video.uuid);
          }
        })();
        return;
      }

      void (async () => {
        if (file) {
          try {
            const headRes = await fetch(
              resolveMediaUrl(`/api/media/${file}`),
              { method: 'HEAD' },
            );
            const cl = headRes.headers.get('content-length');
            if (cl) onUpdate(video.uuid, { fileSize: parseInt(cl, 10) });
          } catch {}
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
        onComplete(video.uuid);
      })();
    },
    [
      onUpdate,
      onComplete,
      video.uuid,
      video.opfsEnabled,
      video.autoDownload,
      video.justAudio,
      registerUrls,
    ],
  );

  /* ── Poll task ──────────────────────────────────────── */
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

  /* ── Auto-trigger download for newly added items ─────── */
  useEffect(() => {
    if (video.status === 'pending' && !downloadTriggered.current) {
      downloadTriggered.current = true;
      queueMicrotask(() => handleDownload());
    }
  }, [video.status, handleDownload]);

  /* ── Resume polling after page refresh ──────────────── */
  useEffect(() => {
    if (pollResumeChecked.current) return;
    pollResumeChecked.current = true;
    if (video.status === 'downloading' && video.taskId) {
      pollForTask(video.taskId);
    }
  }, [video.status, video.taskId, pollForTask]);

  /* ── Stop polling on unmount ─────────────────────────── */
  useEffect(() => {
    const taskId = video.taskId;
    return () => {
      if (taskId) stopPolling(taskId);
    };
  }, [video.taskId, stopPolling]);

  /* ── Warn before closing during active download ──────── */
  useEffect(() => {
    if (!isActive) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isActive]);

  /* ── Auto-move errored items to completed ─────────────── */
  useEffect(() => {
    if (video.status === 'error') onComplete(video.uuid);
  }, [video.status, video.uuid, onComplete]);

  const showProgressBar = isActive || opfsMigrating;

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
      {/* ── Media preview ───────────────────────────── */}
      <VideoMediaPreview
        downloadURL={video.downloadURL}
        justAudio={video.justAudio}
        thumbnail={video.thumbnail}
        compact
      />
      {/* ── Progress bar ────────────────────────────── */}
      {showProgressBar ? <ProgressBar margin="0" /> : null}
      {/* ── Status hint ─────────────────────────────── */}
      {opfsMigrating ? (
        <Typography variant="caption" className="vi-ffmpeg-hint">
          {t('savingToDevice')}
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
        </Box>
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

export default PinnedVideoItemDownloading;
