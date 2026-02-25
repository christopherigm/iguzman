'use client';

import {
  createContext,
  useContext,
  useCallback,
  useRef,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';

/* ── Constants ──────────────────────────────────────── */

/**
 * Maximum number of FFmpeg tasks that can run concurrently.
 * Derived from logical CPU count: floor(cores / 4), clamped to [2, 4].
 * Examples: 4 cores → 2, 8 cores → 2, 12 cores → 3, 16+ cores → 4.
 * Falls back to 2 in non-browser environments.
 */
function deriveMaxConcurrent(): number {
  if (typeof navigator === 'undefined') return 2;
  const cores = navigator.hardwareConcurrency ?? 4;
  return Math.max(2, Math.min(4, Math.floor(cores / 4)));
}

const MAX_CONCURRENT = deriveMaxConcurrent();

/* ── Types ──────────────────────────────────────────── */

interface QueueItem {
  videoUuid: string;
  execute: () => Promise<void>;
  resolve: () => void;
  reject: (err: Error) => void;
}

export interface FFmpegState {
  status: 'loading' | 'processing';
  progress: number;
}

interface ProcessingQueueContextValue {
  /**
   * Enqueue a processing task. Resolves when the task completes.
   * At most `MAX_CONCURRENT` tasks run simultaneously; the rest wait.
   */
  enqueue: (videoUuid: string, execute: () => Promise<void>) => Promise<void>;
  /** Remove a pending (not yet running) task from the queue. */
  cancel: (videoUuid: string) => void;
  /** Whether a video UUID is waiting in the queue (not yet started). */
  isQueued: (videoUuid: string) => boolean;
  /** Number of tasks waiting in the queue. */
  queueSize: number;
  /** Number of tasks currently running. */
  activeCount: number;
  /** Write FFmpeg status/progress for a video (null clears it). */
  setFFmpegState: (uuid: string, state: FFmpegState | null) => void;
  /** Read the current FFmpeg status/progress for a video (imperative). */
  getFFmpegState: (uuid: string) => FFmpegState | null;
  /** Subscribe to FFmpegState changes (for useSyncExternalStore). */
  subscribeFFmpegStore: (listener: () => void) => () => void;
}

/* ── Context ────────────────────────────────────────── */

const ProcessingQueueContext =
  createContext<ProcessingQueueContextValue | null>(null);

/* ── Provider ───────────────────────────────────────── */

export function ProcessingQueueProvider({ children }: { children: ReactNode }) {
  const queueRef = useRef<QueueItem[]>([]);
  const activeRef = useRef(0);
  const [tick, setTick] = useState(0);

  /* ── FFmpeg state store (separate from queue tick) ─────────────
   *  Progress updates are very frequent (every frame).  Using a
   *  dedicated subscriber list + useSyncExternalStore lets us
   *  re-render ONLY the VideoItem whose progress actually changed,
   *  instead of every context consumer.
   */
  const ffmpegDataRef = useRef(new Map<string, FFmpegState>());
  const ffmpegListenersRef = useRef(new Set<() => void>());

  /** Trigger a re-render so consumers see updated queue counts. */
  const flush = useCallback(() => setTick((n) => n + 1), []);

  /** Notify useSyncExternalStore subscribers (FFmpeg state only). */
  const notifyFFmpegListeners = useCallback(() => {
    for (const listener of ffmpegListenersRef.current) {
      listener();
    }
  }, []);

  const subscribeFFmpegStore = useCallback((listener: () => void) => {
    ffmpegListenersRef.current.add(listener);
    return () => {
      ffmpegListenersRef.current.delete(listener);
    };
  }, []);

  const setFFmpegState = useCallback(
    (uuid: string, state: FFmpegState | null) => {
      if (state === null) {
        ffmpegDataRef.current.delete(uuid);
      } else {
        ffmpegDataRef.current.set(uuid, state);
      }
      notifyFFmpegListeners();
    },
    [notifyFFmpegListeners],
  );

  const getFFmpegState = useCallback(
    (uuid: string): FFmpegState | null =>
      ffmpegDataRef.current.get(uuid) ?? null,
    [],
  );

  /** Start queued tasks until we hit the concurrency limit. */
  const processNext = useCallback(() => {
    let dispatched = false;
    while (activeRef.current < MAX_CONCURRENT && queueRef.current.length > 0) {
      const item = queueRef.current.shift()!;
      activeRef.current += 1;
      dispatched = true;

      item
        .execute()
        .then(() => item.resolve())
        .catch((err: unknown) =>
          item.reject(err instanceof Error ? err : new Error(String(err))),
        )
        .finally(() => {
          activeRef.current -= 1;
          flush();
          processNext();
        });
    }
    /* Only re-render when something actually changed. */
    if (dispatched) flush();
  }, [flush]);

  const enqueue = useCallback(
    (videoUuid: string, execute: () => Promise<void>): Promise<void> =>
      new Promise<void>((resolve, reject) => {
        queueRef.current.push({ videoUuid, execute, resolve, reject });
        processNext();
      }),
    [processNext],
  );

  const cancel = useCallback(
    (videoUuid: string) => {
      const idx = queueRef.current.findIndex((i) => i.videoUuid === videoUuid);
      if (idx !== -1) {
        const [removed] = queueRef.current.splice(idx, 1);
        /* Resolve silently — the video is being removed. */
        removed!.resolve();
        flush();
      }
    },
    [flush],
  );

  const isQueued = useCallback(
    (videoUuid: string) =>
      queueRef.current.some((i) => i.videoUuid === videoUuid),
    [],
  );

  /* Recompute on every tick so consumers see updated queue counts.
   * FFmpeg progress is intentionally NOT included here — it uses
   * useSyncExternalStore via useFFmpegState() to avoid re-rendering
   * every consumer on every progress tick. */
  const value = useMemo<ProcessingQueueContextValue>(
    () => ({
      enqueue,
      cancel,
      isQueued,
      queueSize: queueRef.current.length,
      activeCount: activeRef.current,
      setFFmpegState,
      getFFmpegState,
      subscribeFFmpegStore,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      enqueue,
      cancel,
      isQueued,
      tick,
      setFFmpegState,
      getFFmpegState,
      subscribeFFmpegStore,
    ],
  );

  return (
    <ProcessingQueueContext.Provider value={value}>
      {children}
    </ProcessingQueueContext.Provider>
  );
}

/* ── Consumer hooks ─────────────────────────────────── */

export function useProcessingQueue() {
  const ctx = useContext(ProcessingQueueContext);
  if (!ctx) {
    throw new Error(
      'useProcessingQueue must be used within a <ProcessingQueueProvider>',
    );
  }
  return ctx;
}

/**
 * Subscribe to a single video's FFmpeg processing state.
 *
 * Uses `useSyncExternalStore` so that only the VideoItem whose
 * UUID's state actually changed re-renders — other items in the
 * grid are completely unaffected by progress ticks.
 */
const SERVER_SNAPSHOT: FFmpegState | null = null;

export function useFFmpegState(uuid: string): FFmpegState | null {
  const ctx = useContext(ProcessingQueueContext);
  if (!ctx) {
    throw new Error(
      'useFFmpegState must be used within a <ProcessingQueueProvider>',
    );
  }

  const getSnapshot = useCallback(
    () => ctx.getFFmpegState(uuid),
    [ctx.getFFmpegState, uuid],
  );

  const getServerSnapshot = useCallback(() => SERVER_SNAPSHOT, []);

  return useSyncExternalStore(
    ctx.subscribeFFmpegStore,
    getSnapshot,
    getServerSnapshot,
  );
}
