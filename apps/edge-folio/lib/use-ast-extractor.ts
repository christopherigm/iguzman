'use client';

import { useState, useRef, useCallback } from 'react';
import type { AstWorkerInbound, AstWorkerOutbound } from './ast-worker-types';
import type { SkeletonJson } from './skeleton-json';

export type AstExtractorStatus = 'idle' | 'running' | 'done' | 'error';

export interface UseAstExtractorResult {
  status: AstExtractorStatus;
  phase: string;
  skeleton: SkeletonJson | null;
  error: string | null;
  extract: (handle: FileSystemDirectoryHandle) => void;
  abort: () => void;
  reset: () => void;
}

export function useAstExtractor(): UseAstExtractorResult {
  const [status, setStatus] = useState<AstExtractorStatus>('idle');
  const [phase, setPhase] = useState('');
  const [skeleton, setSkeleton] = useState<SkeletonJson | null>(null);
  const [error, setError] = useState<string | null>(null);

  const workerRef = useRef<Worker | null>(null);

  function terminateWorker() {
    workerRef.current?.terminate();
    workerRef.current = null;
  }

  const extract = useCallback((handle: FileSystemDirectoryHandle) => {
    terminateWorker();
    setStatus('running');
    setPhase('init');
    setSkeleton(null);
    setError(null);

    const worker = new Worker(new URL('./ast-worker.ts', import.meta.url), { type: 'module' });
    workerRef.current = worker;

    worker.addEventListener('message', (event: MessageEvent<AstWorkerOutbound>) => {
      const msg = event.data;
      switch (msg.type) {
        case 'PROGRESS':
          setPhase(msg.phase);
          break;
        case 'DONE':
          setSkeleton(msg.skeleton);
          setStatus('done');
          terminateWorker();
          break;
        case 'ERROR':
          setError(msg.error);
          setStatus('error');
          terminateWorker();
          break;
      }
    });

    worker.addEventListener('error', (e) => {
      setError(e.message);
      setStatus('error');
      terminateWorker();
    });

    worker.postMessage({ type: 'EXTRACT', handle } satisfies AstWorkerInbound);
  }, []);

  const abort = useCallback(() => {
    workerRef.current?.postMessage({ type: 'ABORT' } satisfies AstWorkerInbound);
    terminateWorker();
    setStatus('idle');
    setPhase('');
  }, []);

  const reset = useCallback(() => {
    terminateWorker();
    setStatus('idle');
    setPhase('');
    setSkeleton(null);
    setError(null);
  }, []);

  return { status, phase, skeleton, error, extract, abort, reset };
}
