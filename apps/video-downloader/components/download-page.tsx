'use client';

import { useCallback } from 'react';
import { DownloadForm } from './download-form';
import { VideoGrid } from './video-grid';
import { ProcessingQueueProvider } from './use-processing-queue';
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
  const { videos, addVideo, updateVideo, removeVideo } = useVideoStore();

  const handleVideoAdded = useCallback(
    (entry: VideoAddedEntry) => {
      addVideo({
        originalURL: entry.originalURL,
        platform: entry.platform,
        fps: entry.fps,
        justAudio: entry.justAudio,
        enhance: entry.enhance,
        autoDownload: entry.autoDownload,
      });
    },
    [addVideo],
  );

  return (
    <ProcessingQueueProvider>
      <DownloadForm onVideoAdded={handleVideoAdded} />
      <br />
      <VideoGrid
        videos={videos}
        onUpdate={updateVideo}
        onRemove={removeVideo}
      />
    </ProcessingQueueProvider>
  );
}

export default DownloadPage;
