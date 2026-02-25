'use client';

import { useCallback } from 'react';
import { DownloadForm } from './download-form';
import { VideoGrid } from './video-grid';
import { useVideoStore } from './use-video-store';
import type { Platform } from '@repo/helpers/checkers';

/* ── Entry shape from DownloadForm ──────────────────── */

interface VideoAddedEntry {
  originalURL: string;
  platform: Platform;
  fps: string;
  justAudio: boolean;
  enhance: boolean;
  autoDownload: boolean;
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
      });
    },
    [addToPinned],
  );

  return (
    <>
      <DownloadForm onVideoAdded={handleVideoAdded} />
      {storageError ? (
        <p
          role="alert"
          style={{
            color: '#ef4444',
            fontSize: '0.8rem',
            textAlign: 'center',
            margin: '8px 0 0',
          }}
        >
          {storageError}
        </p>
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
