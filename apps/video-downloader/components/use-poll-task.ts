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
  error: DownloadVideoError | null;
}

interface PollOptions {
  taskId: string;
  intervalMs?: number;
  maxAttempts?: number;
  onUpdate: (task: TaskData) => void;
  onError: (error: string) => void;
}

/* ── Hook ───────────────────────────────────────────── */

export function usePollTask() {
  const controllers = useRef<Map<string, AbortController>>(new Map());

  const startPolling = useCallback(
    ({
      taskId,
      intervalMs = 2000,
      maxAttempts = 300,
      onUpdate,
      onError,
    }: PollOptions) => {
      /* Cancel any existing poll for this task */
      controllers.current.get(taskId)?.abort();

      const controller = new AbortController();
      controllers.current.set(taskId, controller);

      let attempts = 0;

      const poll = async () => {
        if (controller.signal.aborted) return;
        attempts++;

        try {
          const res = await fetch(`/api/download-video/${taskId}`, {
            signal: controller.signal,
          });

          if (!res.ok) {
            if (attempts >= maxAttempts) {
              onError('Polling timed out');
              controllers.current.delete(taskId);
              return;
            }
            const delay = Math.min(
              intervalMs * Math.pow(1.5, Math.min(attempts - 1, 5)),
              10_000,
            );
            setTimeout(poll, delay);
            return;
          }

          const data: { task: TaskData } = await res.json();
          onUpdate(data.task);

          if (data.task.status === 'done' || data.task.status === 'error') {
            controllers.current.delete(taskId);
            return;
          }

          setTimeout(poll, intervalMs);
        } catch {
          if (controller.signal.aborted) return;
          if (attempts < maxAttempts) {
            const delay = Math.min(intervalMs * 2, 10_000);
            setTimeout(poll, delay);
          } else {
            onError('Polling failed after max attempts');
            controllers.current.delete(taskId);
          }
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
