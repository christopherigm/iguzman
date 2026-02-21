'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import type { Platform } from '@repo/helpers/checkers';
import type { VideoResultFields, VideoStatus } from '@/lib/types';

/* ── Types ──────────────────────────────────────────── */

export type { VideoStatus };

export interface StoredVideo extends Omit<VideoResultFields, 'isH265'> {
  /** Unique identifier (crypto.randomUUID). */
  uuid: string;
  /** Current download / processing status. */
  status: VideoStatus;
  /** Error message when status is 'error'. */
  error: string | null;
  /** Target FPS ('original' | '60' | '90' | '120'). */
  fps: string;
  /** Whether only audio was requested. */
  justAudio: boolean;
  /** Whether enhance was toggled on. */
  enhance: boolean;
  /** Whether to auto-trigger browser save after download completes. */
  autoDownload: boolean;
  /** The download URL (blob or /api/media/*). */
  downloadURL: string | null;
  /** Original URL pasted by the user. */
  originalURL: string;
  /** Detected platform. */
  platform: Platform;
  /** Timestamp when the item was created. */
  createdAt: number;
  /** Whether FPS interpolation has been applied successfully. */
  fpsApplied: boolean;
  /** Whether the video uses H.265 (HEVC) codec (defaults to false on client). */
  isH265: boolean;
  /** Whether the H.265→H.264 conversion has been applied successfully. */
  h264Converted: boolean;
  /** Whether black bars have been removed from the video. */
  blackBarsRemoved: boolean;
  /** MongoDB task ID (for polling and deletion). */
  taskId: string | null;
}

/* ── Constants ──────────────────────────────────────── */

const STORAGE_KEY = 'vd_videos_v1';

/* ── Helpers ────────────────────────────────────────── */

function readStorage(): StoredVideo[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const videos = JSON.parse(raw) as StoredVideo[];

    /* Recover entries stuck in transient states from a previous session. */
    return videos.map((v) => {
      /* Backwards-compat: assume done videos were fully processed. */
      const video: StoredVideo = {
        ...v,
        fpsApplied: v.fpsApplied ?? v.status === 'done',
        isH265: v.isH265 ?? false,
        h264Converted: v.h264Converted ?? false,
        blackBarsRemoved: v.blackBarsRemoved ?? false,
        taskId: v.taskId ?? null,
      };

      if (video.status === 'queued') {
        /* Queue state is transient — reset to a resumable status.
           The resume effects will re-enqueue as needed. */
        if (video.isH265 && !video.h264Converted) {
          return { ...video, status: 'converting' as VideoStatus };
        }
        return { ...video, status: 'done' as VideoStatus };
      }
      if (video.status === 'downloading') {
        /* If we have a taskId the server is still working — keep as
           downloading so the resume-polling effect restarts polling. */
        if (video.taskId) return video;
        /* Otherwise reset so auto-retry kicks in. */
        return { ...video, status: 'pending' as VideoStatus, error: null };
      }
      if (video.status === 'processing' && !video.file) {
        /* Processing without a server file shouldn't happen — reset. */
        return { ...video, status: 'pending' as VideoStatus, error: null };
      }
      /* Converting interrupted — keep status so resume logic picks it up. */
      if (video.status === 'converting' && !video.file) {
        return { ...video, status: 'done' as VideoStatus, error: null };
      }
      return video;
    });
  } catch {
    return [];
  }
}

function writeStorage(videos: StoredVideo[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(videos));
  } catch {
    /* quota exceeded — silently fail */
  }
}

/* ── Hook ───────────────────────────────────────────── */

export function useVideoStore() {
  const [videos, setVideos] = useState<StoredVideo[]>(() => {
    if (typeof window === 'undefined') return [];
    return readStorage();
  });
  const initialized = useRef(typeof window !== 'undefined');

  /* Persist every time videos change (skip SSR). */
  useEffect(() => {
    if (initialized.current) {
      writeStorage(videos);
    } else {
      initialized.current = true;
    }
  }, [videos]);

  /** Add a brand-new video entry and return its uuid. */
  const addVideo = useCallback(
    (
      partial: Pick<
        StoredVideo,
        | 'originalURL'
        | 'platform'
        | 'fps'
        | 'justAudio'
        | 'enhance'
        | 'autoDownload'
      >,
    ): string => {
      const uuid = crypto.randomUUID();
      const entry: StoredVideo = {
        uuid,
        status: 'pending',
        error: null,
        fps: partial.fps,
        justAudio: partial.justAudio,
        enhance: partial.enhance,
        autoDownload: partial.autoDownload,
        downloadURL: null,
        originalURL: partial.originalURL,
        platform: partial.platform,
        file: null,
        name: null,
        thumbnail: null,
        duration: null,
        uploader: null,
        createdAt: Date.now(),
        fpsApplied: false,
        isH265: false,
        h264Converted: false,
        blackBarsRemoved: false,
        taskId: null,
      };
      setVideos((prev) => [entry, ...prev]);
      return uuid;
    },
    [],
  );

  /** Patch a single video entry by uuid. */
  const updateVideo = useCallback(
    (uuid: string, patch: Partial<StoredVideo>) => {
      setVideos((prev) =>
        prev.map((v) => (v.uuid === uuid ? { ...v, ...patch } : v)),
      );
    },
    [],
  );

  /** Remove a video entry from storage. */
  const removeVideo = useCallback((uuid: string) => {
    setVideos((prev) => prev.filter((v) => v.uuid !== uuid));
  }, []);

  return { videos, addVideo, updateVideo, removeVideo } as const;
}
