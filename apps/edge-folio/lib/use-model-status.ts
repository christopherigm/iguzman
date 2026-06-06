'use client';

import { useState, useEffect } from 'react';
import type { SwInboundMessage, SwOutboundMessage } from './sw-types';

export type ModelStatus = 'unconfigured' | 'checking' | 'idle' | 'downloading' | 'ready' | 'error';

export function useModelStatus(): { status: ModelStatus; progress: number } {
  const [status, setStatus] = useState<ModelStatus>('unconfigured');
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const modelId = process.env.NEXT_PUBLIC_EDGE_MODEL_ID;
    const filesRaw = process.env.NEXT_PUBLIC_EDGE_MODEL_FILES;
    if (!modelId || !filesRaw) return;

    let files: string[];
    try {
      files = JSON.parse(filesRaw) as string[];
    } catch {
      return;
    }

    if (!('serviceWorker' in navigator)) return;

    function handleMessage(event: MessageEvent<SwOutboundMessage>) {
      const msg = event.data;
      if (!msg?.type) return;
      switch (msg.type) {
        case 'MODEL_CACHE_STATUS': {
          const allCached = Object.values(msg.cached).every(Boolean);
          if (allCached) {
            setStatus('ready');
            setProgress(100);
          } else {
            setStatus('idle');
            navigator.serviceWorker.ready
              .then((reg) => {
                const outMsg: SwInboundMessage = {
                  type: 'FETCH_MODEL_TO_OPFS',
                  modelId: modelId as string,
                  files,
                };
                reg.active?.postMessage(outMsg);
                setStatus('downloading');
              })
              .catch(() => undefined);
          }
          break;
        }
        case 'MODEL_FETCH_START':
          setStatus('downloading');
          break;
        case 'MODEL_FETCH_FILE_DONE':
          setProgress(((msg.fileIndex + 1) / msg.fileCount) * 100);
          break;
        case 'MODEL_FETCH_COMPLETE':
          setStatus('ready');
          setProgress(100);
          break;
        case 'MODEL_FETCH_ERROR':
          setStatus('error');
          break;
      }
    }

    navigator.serviceWorker.addEventListener('message', handleMessage);
    setStatus('checking');

    navigator.serviceWorker.ready
      .then((reg) => {
        const checkMsg: SwInboundMessage = { type: 'CHECK_MODEL_CACHED', modelId, files };
        reg.active?.postMessage(checkMsg);
      })
      .catch(() => setStatus('unconfigured'));

    return () => {
      navigator.serviceWorker.removeEventListener('message', handleMessage);
    };
  }, []);

  return { status, progress };
}
