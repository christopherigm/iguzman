'use client';

import { useCallback, useEffect } from 'react';
import { Typography } from '@repo/ui/core-elements/typography';
import { DownloadForm } from './download-form';
import { VideoGrid } from './video-grid';
import { useVideoStore } from './use-video-store';
import type { StoredVideo } from './use-video-store';
import type { Platform } from '@repo/helpers/checkers';
import { OPFSUrlProvider, useOPFSUrls } from './opfs-url-context';
import {
  isOPFSSupported,
  writeToOPFS,
  readFromOPFS,
  deleteFromOPFS,
} from '@/lib/opfs';
import { MigrationBanner } from './migration-banner';
import './download-page.css';

/* ── Entry shape from DownloadForm ──────────────────── */

interface VideoAddedEntry {
  originalURL: string;
  platform: Platform;
  fps: string;
  justAudio: boolean;
  enhance: boolean;
  autoDownload: boolean;
  maxHeight?: number;
  captionsEnabled?: boolean;
  captionUrl?: string;
  commentsEnabled?: boolean;
  maxComments?: number;
  opfsEnabled: boolean;
}

/* ── Recovery: re-establish OPFS blob URLs and finish interrupted migrations ── */

function useOPFSRecovery({
  completed,
  updateCompleted,
  storeLoaded,
}: {
  completed: StoredVideo[];
  updateCompleted: (uuid: string, patch: Partial<StoredVideo>) => void;
  storeLoaded: boolean;
}) {
  const { registerUrls } = useOPFSUrls();

  useEffect(() => {
    if (!storeLoaded || !isOPFSSupported()) return;

    const opfsVideos = completed.filter((v) => v.opfsEnabled);

    void (async () => {
      for (const video of opfsVideos) {
        if (video.opfsStored && video.opfsKey) {
          // Normal case: OPFS has the file — re-establish blob URLs for this session.
          try {
            const videoFile = await readFromOPFS(video.opfsKey);
            const videoUrl = URL.createObjectURL(videoFile);
            let thumbnailUrl: string | null = null;
            if (video.opfsThumbnailKey) {
              try {
                const thumbFile = await readFromOPFS(video.opfsThumbnailKey);
                thumbnailUrl = URL.createObjectURL(thumbFile);
              } catch {}
            }
            registerUrls(video.uuid, { videoUrl, thumbnailUrl });

            // Server not yet told to delete — do it now.
            if (!video.serverFileDeleted && video.taskId) {
              await fetch(`/api/download-video/${video.taskId}`, {
                method: 'DELETE',
              }).catch(() => {});
              updateCompleted(video.uuid, { serverFileDeleted: true });
            }
          } catch {
            // OPFS file evicted by browser — nothing to recover.
          }
        } else if (
          !video.opfsStored &&
          !video.serverFileDeleted &&
          video.file &&
          video.taskId
        ) {
          // Browser closed before OPFS write completed — try to recover from server.
          try {
            const videoRes = await fetch(`/api/media/${video.file}`);
            if (!videoRes.ok) throw new Error('not found');
            const videoBlob = await videoRes.blob();
            await writeToOPFS(video.file, videoBlob);

            let thumbKey: string | null = null;
            if (video.thumbnail) {
              try {
                const thumbRes = await fetch(`/api/media/${video.thumbnail}`);
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
                const captionsRes = await fetch(video.captionsFile);
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
                const commentsRes = await fetch(video.commentsFile);
                if (commentsRes.ok) {
                  const commentsBlob = await commentsRes.blob();
                  const commentsFilename = video.commentsFile.split('/').pop()!;
                  commentsKey = `comments_${commentsFilename}`;
                  await writeToOPFS(commentsKey, commentsBlob);
                }
              } catch {}
            }

            await fetch(`/api/download-video/${video.taskId}`, {
              method: 'DELETE',
            }).catch(() => {});

            const videoFile = await readFromOPFS(video.file);
            const videoUrl = URL.createObjectURL(videoFile);
            let thumbnailUrl: string | null = null;
            if (thumbKey) {
              try {
                const thumbFile = await readFromOPFS(thumbKey);
                thumbnailUrl = URL.createObjectURL(thumbFile);
              } catch {}
            }
            registerUrls(video.uuid, { videoUrl, thumbnailUrl });

            updateCompleted(video.uuid, {
              opfsKey: video.file,
              opfsThumbnailKey: thumbKey,
              opfsCaptionsKey: captionsKey,
              opfsCommentsKey: commentsKey,
              opfsStored: true,
              serverFileDeleted: true,
              downloadURL: `opfs://${video.file}`,
            });
          } catch {
            // Server file already gone — leave as-is.
          }
        }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeLoaded]); // run once after store hydrates
}

/* ── Component ──────────────────────────────────────── */

function DownloadPageInner({ serverDate }: { serverDate: string }) {
  const {
    pinned,
    completed,
    storeLoaded,
    addToPinned,
    updatePinned,
    completeVideo,
    reprocessVideo,
    updateCompleted,
    removePinned,
    removeCompleted,
    removeCompletedBulk,
    clearCompleted,
    moveCompletedToFirst,
    storageError,
  } = useVideoStore();

  const { revokeUrls } = useOPFSUrls();

  useOPFSRecovery({ completed, updateCompleted, storeLoaded });

  const handleVideoAdded = useCallback(
    (entry: VideoAddedEntry) => {
      addToPinned({
        originalURL: entry.originalURL,
        platform: entry.platform,
        fps: entry.fps,
        justAudio: entry.justAudio,
        enhance: entry.enhance,
        autoDownload: entry.autoDownload,
        maxHeight: entry.maxHeight ?? null,
        captionsEnabled: entry.captionsEnabled ?? false,
        captionUrl: entry.captionUrl ?? null,
        commentsEnabled: entry.commentsEnabled ?? false,
        maxComments: entry.maxComments ?? null,
        opfsEnabled: entry.opfsEnabled,
      });
    },
    [addToPinned],
  );

  const handleRemoveCompleted = useCallback(
    async (uuid: string) => {
      const video = completed.find((v) => v.uuid === uuid);
      if (video?.opfsEnabled) {
        if (video.opfsKey) await deleteFromOPFS(video.opfsKey).catch(() => {});
        if (video.opfsThumbnailKey)
          await deleteFromOPFS(video.opfsThumbnailKey).catch(() => {});
        if (video.opfsCaptionsKey)
          await deleteFromOPFS(video.opfsCaptionsKey).catch(() => {});
        if (video.opfsCommentsKey)
          await deleteFromOPFS(video.opfsCommentsKey).catch(() => {});
        revokeUrls(uuid);
      }
      removeCompleted(uuid);
    },
    [completed, removeCompleted, revokeUrls],
  );

  return (
    <>
      <DownloadForm
        onVideoAdded={handleVideoAdded}
        completedVideos={completed}
        onMoveToFirst={moveCompletedToFirst}
        onClearStorage={clearCompleted}
        onRemoveVideosByUuids={removeCompletedBulk}
      />
      <MigrationBanner serverDate={serverDate} />
      {storageError ? (
        <Typography
          as="p"
          variant="body-sm"
          role="alert"
          className="dp-storage-error"
        >
          {storageError}
        </Typography>
      ) : null}
      <br />
      <VideoGrid
        pinned={pinned}
        completed={completed}
        onUpdatePinned={updatePinned}
        onCompletePinned={completeVideo}
        onRemovePinned={removePinned}
        onUpdateCompleted={updateCompleted}
        onReprocessCompleted={reprocessVideo}
        onRemoveCompleted={handleRemoveCompleted}
      />
    </>
  );
}

export function DownloadPage({ serverDate }: { serverDate: string }) {
  return (
    <OPFSUrlProvider>
      <DownloadPageInner serverDate={serverDate} />
    </OPFSUrlProvider>
  );
}

export default DownloadPage;
