'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import type { ChatMessage, EdgeWorkerInbound, EdgeWorkerOutbound } from './edge-worker-types';

export type EdgeEngineStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface GenerateCallbacks {
  onToken?: (token: string) => void;
  onDone?: (text: string) => void;
  onError?: (error: string) => void;
}

export interface UseEdgeEngineResult {
  webgpuSupported: boolean;
  status: EdgeEngineStatus;
  loadProgress: number;
  device: 'webgpu' | 'wasm' | null;
  load: (modelId: string) => void;
  generate: (id: string, messages: ChatMessage[], maxNewTokens?: number, callbacks?: GenerateCallbacks) => void;
  abort: (id: string) => void;
}

export function useEdgeEngine(): UseEdgeEngineResult {
  const [webgpuSupported, setWebgpuSupported] = useState(false);
  const [status, setStatus] = useState<EdgeEngineStatus>('idle');
  const [loadProgress, setLoadProgress] = useState(0);
  const [device, setDevice] = useState<'webgpu' | 'wasm' | null>(null);

  const workerRef = useRef<Worker | null>(null);
  const callbacksRef = useRef<Map<string, GenerateCallbacks>>(new Map());
  const statusRef = useRef<EdgeEngineStatus>('idle');

  // Keep statusRef in sync so callbacks inside getOrCreateWorker see current value
  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  useEffect(() => {
    if (!('gpu' in navigator)) return;
    navigator.gpu
      .requestAdapter()
      .then((adapter) => setWebgpuSupported(!!adapter))
      .catch(() => setWebgpuSupported(false));
  }, []);

  useEffect(() => {
    return () => {
      workerRef.current?.terminate();
    };
  }, []);

  function getOrCreateWorker(): Worker {
    if (workerRef.current) return workerRef.current;

    const worker = new Worker(new URL('./edge-worker.ts', import.meta.url), { type: 'module' });

    worker.addEventListener('message', (event: MessageEvent<EdgeWorkerOutbound>) => {
      const msg = event.data;
      if (!msg?.type) return;

      switch (msg.type) {
        case 'LOAD_PROGRESS':
          setLoadProgress(msg.progress);
          break;
        case 'LOAD_DONE':
          setStatus('ready');
          setDevice(msg.device);
          break;
        case 'LOAD_ERROR':
          setStatus('error');
          break;
        case 'GENERATE_TOKEN':
          callbacksRef.current.get(msg.id)?.onToken?.(msg.token);
          break;
        case 'GENERATE_DONE':
          callbacksRef.current.get(msg.id)?.onDone?.(msg.text);
          callbacksRef.current.delete(msg.id);
          break;
        case 'GENERATE_ERROR':
          callbacksRef.current.get(msg.id)?.onError?.(msg.error);
          callbacksRef.current.delete(msg.id);
          break;
      }
    });

    workerRef.current = worker;
    return worker;
  }

  const load = useCallback(
    (modelId: string) => {
      if (statusRef.current === 'ready' || statusRef.current === 'loading') return;

      const targetDevice: 'webgpu' | 'wasm' = webgpuSupported ? 'webgpu' : 'wasm';
      const worker = getOrCreateWorker();
      setStatus('loading');
      setLoadProgress(0);
      worker.postMessage({ type: 'LOAD', modelId, device: targetDevice } satisfies EdgeWorkerInbound);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [webgpuSupported],
  );

  const generate = useCallback(
    (
      id: string,
      messages: ChatMessage[],
      maxNewTokens?: number,
      callbacks?: GenerateCallbacks,
    ) => {
      if (!workerRef.current || statusRef.current !== 'ready') {
        callbacks?.onError?.('Engine not ready');
        return;
      }
      if (callbacks) callbacksRef.current.set(id, callbacks);
      workerRef.current.postMessage({
        type: 'GENERATE',
        id,
        messages,
        maxNewTokens,
      } satisfies EdgeWorkerInbound);
    },
    [],
  );

  const abort = useCallback((id: string) => {
    workerRef.current?.postMessage({ type: 'ABORT', id } satisfies EdgeWorkerInbound);
  }, []);

  return { webgpuSupported, status, loadProgress, device, load, generate, abort };
}
