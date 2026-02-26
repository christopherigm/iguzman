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
  /** The download URL (blob or /media/*). */
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

const PINNED_KEY = 'vd_pinned_v2';
const COMPLETED_KEY = 'vd_completed_v2';
const LEGACY_KEY = 'vd_videos_v1';

/** Statuses that represent active client- or server-side work. */
const BUSY_STATUSES = new Set<VideoStatus>([
  'pending',
  'downloading',
  'queued',
  'processing',
  'converting',
]);

/* ── Helpers ────────────────────────────────────────── */

function applyDefaults(v: StoredVideo): StoredVideo {
  return {
    ...v,
    fpsApplied: v.fpsApplied ?? v.status === 'done',
    isH265: v.isH265 ?? false,
    h264Converted: v.h264Converted ?? false,
    blackBarsRemoved: v.blackBarsRemoved ?? false,
    taskId: v.taskId ?? null,
    thumbnail:
      v.thumbnail ??
      ((v as unknown as Record<string, unknown>).thumbnailFile as string) ??
      null,
  };
}

function recoverPinnedState(v: StoredVideo): StoredVideo {
  const video = applyDefaults(v);

  if (video.status === 'queued') {
    if (video.isH265 && !video.h264Converted) {
      return { ...video, status: 'converting' as VideoStatus };
    }
    return { ...video, status: 'done' as VideoStatus };
  }
  if (video.status === 'downloading') {
    if (video.taskId) return video;
    return { ...video, status: 'pending' as VideoStatus, error: null };
  }
  if (video.status === 'processing' && !video.file) {
    return { ...video, status: 'pending' as VideoStatus, error: null };
  }
  if (video.status === 'converting' && !video.file) {
    return { ...video, status: 'done' as VideoStatus, error: null };
  }
  return video;
}

function readStorageArray(key: string): StoredVideo[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    return (JSON.parse(raw) as StoredVideo[]).map(applyDefaults);
  } catch {
    return [];
  }
}

function writeStorage(key: string, videos: StoredVideo[]): void {
  localStorage.setItem(key, JSON.stringify(videos));
}

/** One-time migration from the old single-array store. */
function migrateFromLegacy(): {
  pinned: StoredVideo[];
  completed: StoredVideo[];
} | null {
  try {
    const raw = localStorage.getItem(LEGACY_KEY);
    if (!raw) return null;
    const videos = JSON.parse(raw) as StoredVideo[];

    const pinned: StoredVideo[] = [];
    const completed: StoredVideo[] = [];

    for (const v of videos) {
      const video = applyDefaults(v);
      if (BUSY_STATUSES.has(video.status)) {
        pinned.push(recoverPinnedState(video));
      } else {
        /* 'done', 'error', and any other non-busy status → completed */
        completed.push(video);
      }
    }

    writeStorage(PINNED_KEY, pinned);
    writeStorage(COMPLETED_KEY, completed);
    localStorage.removeItem(LEGACY_KEY);

    return { pinned, completed };
  } catch {
    return null;
  }
}

function initializeStore(): { pinned: StoredVideo[]; completed: StoredVideo[] } {
  if (typeof window === 'undefined') return { pinned: [], completed: [] };

  /* Try migration from legacy single-array store. */
  const migrated = migrateFromLegacy();
  if (migrated) return migrated;

  /* Read from the new dual-key storage. */
  const rawPinned = readStorageArray(PINNED_KEY).map(recoverPinnedState);
  const completed = readStorageArray(COMPLETED_KEY);

  /* Move any errored items from pinned to completed on load. */
  const pinned: StoredVideo[] = [];
  for (const v of rawPinned) {
    if (v.status === 'error') {
      completed.unshift(v);
    } else {
      pinned.push(v);
    }
  }

  return { pinned, completed };
}

/* ── Hook ───────────────────────────────────────────── */

export function useVideoStore() {
  const initialData = useRef(initializeStore());
  const [pinned, setPinned] = useState<StoredVideo[]>(
    () => initialData.current.pinned,
  );
  const [completed, setCompleted] = useState<StoredVideo[]>(
    () => initialData.current.completed,
  );
  const [storageError, setStorageError] = useState<string | null>(null);
  const initialized = useRef(typeof window !== 'undefined');

  /* Persist each array independently. */
  useEffect(() => {
    if (initialized.current) {
      try {
        writeStorage(PINNED_KEY, pinned);
        setStorageError(null);
      } catch {
        setStorageError(
          'Storage is full — your video list may not be saved across page reloads.',
        );
      }
    } else {
      initialized.current = true;
    }
  }, [pinned]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      writeStorage(COMPLETED_KEY, completed);
    } catch {
      setStorageError(
        'Storage is full — your video list may not be saved across page reloads.',
      );
    }
  }, [completed]);

  /** Add a brand-new video entry directly to pinned and return its uuid. */
  const addToPinned = useCallback(
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
      const existing = pinned.find((v) => v.originalURL === partial.originalURL);
      if (existing) return existing.uuid;

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
      setPinned((prev) => [entry, ...prev]);
      return uuid;
    },
    [pinned],
  );

  /** Patch a single pinned video entry by uuid. */
  const updatePinned = useCallback(
    (uuid: string, patch: Partial<StoredVideo>) => {
      setPinned((prev) =>
        prev.map((v) => (v.uuid === uuid ? { ...v, ...patch } : v)),
      );
    },
    [],
  );

  /** Atomically move a video from pinned to completed.
   *  Preserves the current status (e.g. 'done' or 'error'). */
  const completeVideo = useCallback((uuid: string) => {
    setPinned((prev) => {
      const video = prev.find((v) => v.uuid === uuid);
      if (video) {
        setCompleted((c) => [{ ...video }, ...c]);
      }
      return prev.filter((v) => v.uuid !== uuid);
    });
  }, []);

  /** Atomically move a video from completed back to pinned for reprocessing. */
  const reprocessVideo = useCallback(
    (uuid: string, patch: Partial<StoredVideo>) => {
      setCompleted((prev) => {
        const video = prev.find((v) => v.uuid === uuid);
        if (video) {
          setPinned((p) => [{ ...video, ...patch }, ...p]);
        }
        return prev.filter((v) => v.uuid !== uuid);
      });
    },
    [],
  );

  /** Patch a single completed video entry by uuid. */
  const updateCompleted = useCallback(
    (uuid: string, patch: Partial<StoredVideo>) => {
      setCompleted((prev) =>
        prev.map((v) => (v.uuid === uuid ? { ...v, ...patch } : v)),
      );
    },
    [],
  );

  /** Remove a video entry from pinned. */
  const removePinned = useCallback((uuid: string) => {
    setPinned((prev) => prev.filter((v) => v.uuid !== uuid));
  }, []);

  /** Remove a video entry from completed. */
  const removeCompleted = useCallback((uuid: string) => {
    setCompleted((prev) => prev.filter((v) => v.uuid !== uuid));
  }, []);

  return {
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
  } as const;
}
