'use client';

import { useRef, useState, useCallback } from 'react';
import { fetchFile } from '@ffmpeg/util';

const CORE_VERSION = '0.12.10';
const BASE_URL = `https://cdn.jsdelivr.net/npm/@ffmpeg/core-mt@${CORE_VERSION}/dist/umd`;

const CORE_URL = `${BASE_URL}/ffmpeg-core.js`;
const WASM_URL = `${BASE_URL}/ffmpeg-core.wasm`;
const WORKER_URL = `${BASE_URL}/ffmpeg-core.worker.js`;

export type FFmpegStatus = 'idle' | 'loading' | 'processing' | 'ready';

type PendingOp = {
  resolve: (data: unknown) => void;
  reject: (err: Error) => void;
  onProgress?: (p: number) => void;
};

let msgCounter = 0;
const nextId = () => `ffmpeg-${++msgCounter}`;

/**
 * Lazy-loaded FFmpeg WASM hook.
 *
 * – Runs all FFmpeg operations in a dedicated Web Worker via ffmpeg-worker.ts,
 *   keeping the main thread fully responsive during heavy video processing.
 * – Loads the multi-threaded core on first use.
 */
export function useFFmpeg() {
  const workerRef = useRef<Worker | null>(null);
  const loadPromiseRef = useRef<Promise<void> | null>(null);
  const pendingRef = useRef(new Map<string, PendingOp>());
  const processingStartRef = useRef<number | null>(null);
  const [status, setStatus] = useState<FFmpegStatus>('idle');
  const [progress, setProgress] = useState(0);
  const [lastError, setLastError] = useState<string | null>(null);
  const [lastProcessingTime, setLastProcessingTime] = useState<number | null>(
    null,
  );
  const cores =
    typeof navigator !== 'undefined'
      ? (navigator.hardwareConcurrency ?? 1)
      : null;

  /** Get or create the worker, attaching a single persistent message handler. */
  const getWorker = useCallback((): Worker => {
    if (workerRef.current) return workerRef.current;

    const worker = new Worker(new URL('./ffmpeg-worker.ts', import.meta.url));

    worker.onmessage = ({
      data,
    }: MessageEvent<{
      id: string;
      type: string;
      payload: Record<string, unknown>;
    }>) => {
      const { id, type, payload } = data;
      const pending = pendingRef.current.get(id);
      if (!pending) return;

      if (type === 'progress') {
        pending.onProgress?.((payload as { progress: number }).progress);
      } else if (type === 'result') {
        pendingRef.current.delete(id);
        pending.resolve((payload as { data: Uint8Array }).data);
      } else if (type === 'loaded') {
        pendingRef.current.delete(id);
        pending.resolve(undefined);
      } else if (type === 'error') {
        const msg = (payload as { message: string }).message;
        pendingRef.current.delete(id);
        setLastError(msg);
        pending.reject(new Error(msg));
      }
    };

    worker.onerror = (event) => {
      const msg = event.message ?? 'FFmpeg worker crashed';
      setLastError(msg);
      // Reject every in-flight operation so callers don't hang.
      for (const [, pending] of pendingRef.current) {
        pending.reject(new Error(msg));
      }
      pendingRef.current.clear();
      setStatus('ready');
      // Discard the crashed worker; next op will create a fresh one.
      workerRef.current = null;
      loadPromiseRef.current = null;
    };

    workerRef.current = worker;
    return worker;
  }, []);

  /** Ensure the FFmpeg WASM module is loaded in the worker (idempotent). */
  const ensureLoaded = useCallback(async (): Promise<void> => {
    if (loadPromiseRef.current) return loadPromiseRef.current;

    const promise = new Promise<void>((resolve, reject) => {
      const id = nextId();
      const worker = getWorker();
      pendingRef.current.set(id, { resolve: () => resolve(), reject });
      worker.postMessage({
        id,
        type: 'load',
        payload: {
          coreURL: CORE_URL,
          wasmURL: WASM_URL,
          workerURL: WORKER_URL,
        },
      });
    });

    loadPromiseRef.current = promise.then(
      () => {
        setStatus('ready');
      },
      (err: Error) => {
        loadPromiseRef.current = null;
        throw err;
      },
    );

    setStatus('loading');
    return loadPromiseRef.current;
  }, [getWorker]);

  /**
   * Send a video-processing message to the worker and resolve with the
   * resulting Uint8Array.  Handles status/progress bookkeeping.
   */
  const sendVideoOp = useCallback(
    async (
      type: string,
      videoUrl: string,
      extraPayload: Record<string, unknown> = {},
      externalOnProgress?: (p: number) => void,
    ): Promise<Uint8Array> => {
      await ensureLoaded();
      setStatus('processing');
      setProgress(0);
      processingStartRef.current = Date.now();

      const videoData = await fetchFile(videoUrl);

      return new Promise<Uint8Array>((resolve, reject) => {
        const id = nextId();
        const worker = getWorker();
        pendingRef.current.set(id, {
          resolve: (data) => resolve(data as Uint8Array),
          reject,
          onProgress: (p) => {
            setProgress(p);
            externalOnProgress?.(p);
          },
        });
        worker.postMessage(
          {
            id,
            type,
            payload: {
              coreURL: CORE_URL,
              wasmURL: WASM_URL,
              workerURL: WORKER_URL,
              videoData,
              ...extraPayload,
            },
          },
          [videoData.buffer as ArrayBuffer],
        );
      }).finally(() => {
        setStatus('ready');
        if (processingStartRef.current !== null) {
          setLastProcessingTime(
            (Date.now() - processingStartRef.current) / 1000,
          );
          processingStartRef.current = null;
        }
      });
    },
    [ensureLoaded, getWorker],
  );

  /**
   * Apply motion-interpolated FPS conversion using the minterpolate filter.
   *
   * @param videoUrl   URL (or object-URL) of the source video
   * @param targetFps  Target frame-rate (e.g. 60, 90, 120)
   * @returns          `{ objectUrl, blob }` – object-URL for immediate use
   *                   and the raw Blob for uploading back to the server.
   */
  const interpolateFps = useCallback(
    async (
      videoUrl: string,
      targetFps: number,
      onProgress?: (p: number) => void,
    ): Promise<{ objectUrl: string; blob: Blob }> => {
      const data = await sendVideoOp(
        'interpolateFps',
        videoUrl,
        { targetFps },
        onProgress,
      );
      const blob = new Blob([new Uint8Array(data)], { type: 'video/mp4' });
      return { objectUrl: URL.createObjectURL(blob), blob };
    },
    [sendVideoOp],
  );

  /**
   * Convert an H.265 (HEVC) video to H.264 (AVC) using FFmpeg WASM.
   *
   * @param videoUrl   URL (or object-URL) of the source H.265 video
   * @returns          `{ objectUrl, blob }` – object-URL for immediate use
   *                   and the raw Blob for uploading back to the server.
   */
  const convertToH264 = useCallback(
    async (
      videoUrl: string,
      onProgress?: (p: number) => void,
    ): Promise<{ objectUrl: string; blob: Blob }> => {
      const data = await sendVideoOp('convertToH264', videoUrl, {}, onProgress);
      const blob = new Blob([new Uint8Array(data)], { type: 'video/mp4' });
      return { objectUrl: URL.createObjectURL(blob), blob };
    },
    [sendVideoOp],
  );

  /**
   * Detect and remove horizontal black bars (letterboxing) from a video.
   *
   * @param videoUrl    URL (or object-URL) of the source video.
   * @param limit       Black-pixel intensity threshold (0–255). @default 24
   * @param round       Crop dimension rounding. @default 16
   * @param cropString  Pre-computed crop string (`W:H:X:Y`) to skip the
   *                    cropdetect pass when bars were already detected.
   * @returns           `{ objectUrl, blob }` – object-URL for immediate use
   *                    and the raw Blob for uploading back to the server.
   */
  const removeBlackBars = useCallback(
    async (
      videoUrl: string,
      limit = 24,
      round = 16,
      cropString?: string,
      onProgress?: (p: number) => void,
    ): Promise<{ objectUrl: string; blob: Blob }> => {
      const data = await sendVideoOp(
        'removeBlackBars',
        videoUrl,
        {
          limit,
          round,
          ...(cropString !== undefined && { cropString }),
        },
        onProgress,
      );
      const blob = new Blob([new Uint8Array(data)], { type: 'video/mp4' });
      return { objectUrl: URL.createObjectURL(blob), blob };
    },
    [sendVideoOp],
  );

  /**
   * Extract the audio track from a video file.
   *
   * By default outputs a 16 kHz mono WAV suitable for Whisper transcription.
   *
   * @param videoUrl  URL (or object-URL) of the source video.
   * @param format    Output container: `'wav'` (default, 16 kHz mono PCM) or
   *                  `'aac'` / `'mp3'` etc. (copy codec when non-wav).
   * @returns         `{ objectUrl, blob }` – object-URL for immediate use
   *                  and the raw Blob for downstream processing.
   */
  const extractAudio = useCallback(
    async (
      videoUrl: string,
      format: string = 'wav',
      onProgress?: (p: number) => void,
    ): Promise<{ objectUrl: string; blob: Blob }> => {
      const mimeMap: Record<string, string> = {
        wav: 'audio/wav',
        mp3: 'audio/mpeg',
        aac: 'audio/aac',
        ogg: 'audio/ogg',
      };
      const data = await sendVideoOp(
        'extractAudio',
        videoUrl,
        { format },
        onProgress,
      );
      const mime = mimeMap[format] ?? 'audio/wav';
      const blob = new Blob([new Uint8Array(data)], { type: mime });
      return { objectUrl: URL.createObjectURL(blob), blob };
    },
    [sendVideoOp],
  );

  /**
   * Burn SRT subtitles into a video using the FFmpeg `subtitles` filter.
   *
   * @param videoUrl  URL (or object-URL) of the source video.
   * @param opts      Subtitle style options.
   * @returns         `{ objectUrl, blob }` – object-URL for immediate use
   *                  and the raw Blob for uploading back to the server.
   */
  const burnSubtitles = useCallback(
    async (
      videoUrl: string,
      opts: {
        srtContent: string;
        alignment?: number;
        marginV?: number;
        fontSize?: number;
        primaryColour?: string;
        backColour?: string;
        borderStyle?: number;
        outline?: number;
      },
      onProgress?: (p: number) => void,
    ): Promise<{ objectUrl: string; blob: Blob }> => {
      const data = await sendVideoOp(
        'burnSubtitles',
        videoUrl,
        { ...opts },
        onProgress,
      );
      const blob = new Blob([new Uint8Array(data)], { type: 'video/mp4' });
      return { objectUrl: URL.createObjectURL(blob), blob };
    },
    [sendVideoOp],
  );

  return {
    status,
    progress,
    lastError,
    lastProcessingTime,
    cores,
    interpolateFps,
    convertToH264,
    removeBlackBars,
    extractAudio,
    burnSubtitles,
  } as const;
}
