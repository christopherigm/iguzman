'use client';

import {
  createContext,
  useContext,
  useCallback,
  useRef,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

/* ── Constants ──────────────────────────────────────── */

/** Maximum number of FFmpeg tasks that can run concurrently. */
const MAX_CONCURRENT = 2;

/* ── Types ──────────────────────────────────────────── */

interface QueueItem {
  videoUuid: string;
  execute: () => Promise<void>;
  resolve: () => void;
  reject: (err: Error) => void;
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
}

/* ── Context ────────────────────────────────────────── */

const ProcessingQueueContext =
  createContext<ProcessingQueueContextValue | null>(null);

/* ── Provider ───────────────────────────────────────── */

export function ProcessingQueueProvider({ children }: { children: ReactNode }) {
  const queueRef = useRef<QueueItem[]>([]);
  const activeRef = useRef(0);
  const [tick, setTick] = useState(0);

  /** Trigger a re-render so consumers see updated counts. */
  const flush = useCallback(() => setTick((n) => n + 1), []);

  /** Start queued tasks until we hit the concurrency limit. */
  const processNext = useCallback(() => {
    while (activeRef.current < MAX_CONCURRENT && queueRef.current.length > 0) {
      const item = queueRef.current.shift()!;
      activeRef.current += 1;

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
    flush();
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

  /* Recompute on every tick so consumers see updated counts. */
  const value = useMemo<ProcessingQueueContextValue>(
    () => ({
      enqueue,
      cancel,
      isQueued,
      queueSize: queueRef.current.length,
      activeCount: activeRef.current,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [enqueue, cancel, isQueued, tick],
  );

  return (
    <ProcessingQueueContext.Provider value={value}>
      {children}
    </ProcessingQueueContext.Provider>
  );
}

/* ── Consumer hook ──────────────────────────────────── */

export function useProcessingQueue() {
  const ctx = useContext(ProcessingQueueContext);
  if (!ctx) {
    throw new Error(
      'useProcessingQueue must be used within a <ProcessingQueueProvider>',
    );
  }
  return ctx;
}
