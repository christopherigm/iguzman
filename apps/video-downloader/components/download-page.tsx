'use client';

import { useCallback } from 'react';
import { Typography } from '@repo/ui/core-elements/typography';
import { DownloadForm } from './download-form';
import { VideoGrid } from './video-grid';
import { useVideoStore } from './use-video-store';
import type { Platform } from '@repo/helpers/checkers';
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
  wsClientUuid: string | null;
}

/* ── Component ──────────────────────────────────────── */

export function DownloadPage() {
  const {
    pinned,
    completed,
    addToPinned,
    updatePinned,
    completeVideo,
    reprocessVideo,
    updateCompleted,
    removePinned,
    removeCompleted,
    storageError,
  } = useVideoStore();

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
        wsClientUuid: entry.wsClientUuid,
      });
    },
    [addToPinned],
  );

  return (
    <>
      <DownloadForm onVideoAdded={handleVideoAdded} />
      {storageError ? (
        <Typography as="p" variant="body-sm" role="alert" className="dp-storage-error">
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
        onRemoveCompleted={removeCompleted}
      />
    </>
  );
}

export default DownloadPage;
