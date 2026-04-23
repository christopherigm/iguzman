'use client';

import { useCallback, useRef } from 'react';
import type {
  TaskStatus,
  VideoResultFields,
  DownloadVideoError,
} from '@/lib/types';

/* ── Types ──────────────────────────────────────────── */

export interface TaskData extends VideoResultFields {
  _id: string;
  status: TaskStatus;
  progress: number;
  error: DownloadVideoError | null;
}

interface PollOptions {
  taskId: string;
  intervalMs?: number;
  onUpdate: (task: TaskData) => void;
}

/* ── Hook ───────────────────────────────────────────── */

export function usePollTask() {
  const controllers = useRef<Map<string, AbortController>>(new Map());

  const startPolling = useCallback(
    ({ taskId, intervalMs = 2000, onUpdate }: PollOptions) => {
      /* Cancel any existing poll for this task */
      controllers.current.get(taskId)?.abort();

      const controller = new AbortController();
      controllers.current.set(taskId, controller);

      let consecutiveErrors = 0;

      const poll = async () => {
        if (controller.signal.aborted) return;

        try {
          const res = await fetch(`/api/download-video/${taskId}`, {
            signal: controller.signal,
          });

          if (!res.ok) {
            consecutiveErrors++;
            const delay = Math.min(
              intervalMs * Math.pow(1.5, Math.min(consecutiveErrors - 1, 8)),
              30_000,
            );
            setTimeout(poll, delay);
            return;
          }

          consecutiveErrors = 0;
          const data: { task: TaskData } = await res.json();
          onUpdate(data.task);

          if (data.task.status === 'done' || data.task.status === 'error') {
            controllers.current.delete(taskId);
            return;
          }

          setTimeout(poll, intervalMs);
        } catch {
          if (controller.signal.aborted) return;
          consecutiveErrors++;
          const delay = Math.min(
            intervalMs * Math.pow(1.5, Math.min(consecutiveErrors - 1, 8)),
            30_000,
          );
          setTimeout(poll, delay);
        }
      };

      poll();
    },
    [],
  );

  const stopPolling = useCallback((taskId: string) => {
    controllers.current.get(taskId)?.abort();
    controllers.current.delete(taskId);
  }, []);

  return { startPolling, stopPolling } as const;
}
