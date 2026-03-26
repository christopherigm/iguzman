'use client';

import { useRef, useState, useCallback } from 'react';
import type { LlmMode, LlmMessage, LlmOptions } from '@repo/helpers/llm';

export type { LlmMode, LlmMessage, LlmOptions };

let msgCounter = 0;
const nextId = () => `llm-${++msgCounter}`;

type PendingOp = {
  resolve: (text: string) => void;
  reject: (err: Error) => void;
};

export interface UseLlmOptions extends LlmOptions {
  // Inherits: mode, model, maxNewTokens, temperature, topP
}

export interface UseLlmReturn {
  /**
   * Finalized response text.
   * - `batch` mode: set when generation completes.
   * - `streaming` mode: set to the full text once the last token arrives.
   */
  text: string;
  /**
   * In `streaming` mode: grows token-by-token while generating.
   * Always empty in `batch` mode.
   */
  streamingText: string;
  /** `true` while the model is being downloaded / initialized. */
  isModelLoading: boolean;
  /** Model download progress percentage (0–100). */
  modelLoadProgress: number;
  /** `true` while the model is generating a response. */
  isGenerating: boolean;
  /** Last error message, or `null` if none. */
  error: string | null;
  /**
   * Send messages to the model and return the full assistant reply.
   * Rejects with an `Error('AbortError')` if `abort()` is called first.
   */
  generate: (messages: LlmMessage[]) => Promise<string>;
  /**
   * Abort the current generation.
   * In streaming mode the in-progress generation stops on the next token.
   * In batch mode the pending promise is rejected immediately (the worker
   * finishes in the background but its result is discarded).
   */
  abort: () => void;
  /** Clear `text` and `streamingText`. */
  reset: () => void;
}

/**
 * useLlm — run a small language model entirely in the browser.
 *
 * Uses a dedicated Web Worker backed by `@huggingface/transformers` (ONNX).
 * Auto-selects WebGPU when available, falls back to WASM/CPU otherwise.
 *
 * Requires `Cross-Origin-Opener-Policy: same-origin` and
 * `Cross-Origin-Embedder-Policy: require-corp` for WebGPU support.
 *
 * @example
 * const { generate, streamingText, isGenerating } = useLlm({ mode: 'streaming' });
 * await generate([{ role: 'user', content: 'Hello!' }]);
 */
export function useLlm(options: UseLlmOptions = {}): UseLlmReturn {
  const {
    mode = 'streaming',
    model,
    maxNewTokens = 512,
    temperature = 1,
    topP = 0.9,
  } = options;

  // ── Worker refs ────────────────────────────────────────────
  const workerRef = useRef<Worker | null>(null);
  const pendingRef = useRef(new Map<string, PendingOp>());
  const loadPromiseRef = useRef<Promise<void> | null>(null);
  const currentGenerateIdRef = useRef<string | null>(null);

  // ── State ──────────────────────────────────────────────────
  const [text, setText] = useState('');
  const [streamingText, setStreamingText] = useState('');
  const [isModelLoading, setIsModelLoading] = useState(false);
  const [modelLoadProgress, setModelLoadProgress] = useState(0);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Worker lifecycle ───────────────────────────────────────

  const getWorker = useCallback((): Worker => {
    if (workerRef.current) return workerRef.current;

    const worker = new Worker(new URL('./llm-worker.ts', import.meta.url));

    worker.onmessage = ({
      data,
    }: MessageEvent<{
      id?: string;
      type: string;
      payload: Record<string, unknown>;
    }>) => {
      const { id, type, payload } = data;

      // Model download progress broadcast (no id).
      if (type === 'model-progress') {
        setModelLoadProgress((payload as { progress: number }).progress);
        return;
      }

      // Streaming token: append to streamingText, don't resolve pending.
      if (type === 'token') {
        setStreamingText((prev) => prev + (payload as { text: string }).text);
        return;
      }

      if (!id) return;
      const pending = pendingRef.current.get(id);
      if (!pending) return; // Stale message (e.g. after abort); ignore.

      if (type === 'result') {
        pendingRef.current.delete(id);
        const responseText = (payload as { text: string }).text;
        setText(responseText);
        setStreamingText('');
        pending.resolve(responseText);
      } else if (type === 'loaded') {
        pendingRef.current.delete(id);
        pending.resolve('');
      } else if (type === 'error') {
        const msg = (payload as { message: string }).message;
        pendingRef.current.delete(id);
        if (msg !== 'AbortError') setError(msg);
        pending.reject(new Error(msg));
      }
    };

    worker.onerror = (event) => {
      const msg = event.message ?? 'LLM worker crashed';
      setError(msg);
      for (const [, p] of pendingRef.current) p.reject(new Error(msg));
      pendingRef.current.clear();
      currentGenerateIdRef.current = null;
      workerRef.current = null;
      loadPromiseRef.current = null;
    };

    workerRef.current = worker;
    return worker;
  }, []);

  const ensureModelLoaded = useCallback(async (): Promise<void> => {
    if (loadPromiseRef.current) return loadPromiseRef.current;

    setIsModelLoading(true);
    setModelLoadProgress(0);

    const promise = new Promise<void>((resolve, reject) => {
      const id = nextId();
      const worker = getWorker();
      pendingRef.current.set(id, { resolve: () => resolve(), reject });
      worker.postMessage({ id, type: 'load', payload: { model } });
    });

    loadPromiseRef.current = promise
      .catch((err) => {
        loadPromiseRef.current = null;
        throw err;
      })
      .finally(() => {
        setIsModelLoading(false);
        setModelLoadProgress(100);
      });

    return loadPromiseRef.current;
  }, [getWorker, model]);

  // ── Public API ─────────────────────────────────────────────

  const generate = useCallback(
    async (messages: LlmMessage[]): Promise<string> => {
      if (isGenerating) throw new Error('Already generating — call abort() first');
      setError(null);
      setStreamingText('');

      await ensureModelLoaded();

      return new Promise<string>((resolve, reject) => {
        const id = nextId();
        currentGenerateIdRef.current = id;
        const worker = getWorker();

        pendingRef.current.set(id, {
          resolve: (t) => {
            currentGenerateIdRef.current = null;
            setIsGenerating(false);
            resolve(t);
          },
          reject: (err) => {
            currentGenerateIdRef.current = null;
            setIsGenerating(false);
            reject(err);
          },
        });

        setIsGenerating(true);
        worker.postMessage({
          id,
          type: 'generate',
          payload: { messages, model, mode, maxNewTokens, temperature, topP },
        });
      });
    },
    [isGenerating, ensureModelLoaded, getWorker, model, mode, maxNewTokens, temperature, topP],
  );

  const abort = useCallback((): void => {
    const genId = currentGenerateIdRef.current;
    if (!genId) return;

    // Signal the worker (stops streaming on the next token callback).
    workerRef.current?.postMessage({ type: 'abort' });

    // Immediately reject the pending promise from the hook side.
    // This also handles batch mode where the worker can't be interrupted mid-run.
    const pending = pendingRef.current.get(genId);
    if (pending) {
      pendingRef.current.delete(genId);
      pending.reject(new Error('AbortError'));
    }

    currentGenerateIdRef.current = null;
    setIsGenerating(false);
    setStreamingText('');
  }, []);

  const reset = useCallback((): void => {
    setText('');
    setStreamingText('');
  }, []);

  return {
    text,
    streamingText,
    isModelLoading,
    modelLoadProgress,
    isGenerating,
    error,
    generate,
    abort,
    reset,
  };
}
