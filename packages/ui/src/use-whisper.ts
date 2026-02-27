'use client';

import { useRef, useState, useCallback } from 'react';

/* ── Public constants ───────────────────────────────────────────────────── */

/**
 * Curated set of Whisper ONNX models hosted on the Hugging Face Hub.
 *
 * `.en` variants are English-only and generally faster.
 * Non-`.en` variants support 99 languages (pass `language` in TranscribeOptions).
 */
export const WHISPER_MODELS = {
  'tiny.en': 'onnx-community/whisper-tiny.en',
  tiny: 'onnx-community/whisper-tiny',
  'base.en': 'onnx-community/whisper-base.en',
  base: 'onnx-community/whisper-base',
  'small.en': 'onnx-community/whisper-small.en',
  small: 'onnx-community/whisper-small',
  'large-v3-turbo': 'onnx-community/whisper-large-v3-turbo',
} as const;

/* ── Public types ───────────────────────────────────────────────────────── */

export type WhisperModelKey = keyof typeof WHISPER_MODELS;
export type WhisperModelId = (typeof WHISPER_MODELS)[WhisperModelKey];

/** Lifecycle state of the hook. */
export type WhisperStatus = 'idle' | 'loading' | 'transcribing' | 'ready';

/** Compute backend used for inference. */
export type WhisperDevice = 'webgpu' | 'wasm';

export type WhisperTranscriptChunk = {
  /** Start and end time in seconds. `null` end means open-ended. */
  timestamp: [number, number | null];
  text: string;
};

export type WhisperTranscriptResult = {
  text: string;
  /** Populated when `returnTimestamps` is `true` or `'word'`. */
  chunks?: WhisperTranscriptChunk[];
};

export type TranscribeOptions = {
  /**
   * BCP-47 language code (e.g. `'en'`, `'es'`, `'fr'`).
   * Only relevant for multilingual models (no `.en` suffix).
   */
  language?: string;
  /**
   * Return timestamps alongside the transcript.
   * - `true`   → sentence-level chunks
   * - `'word'` → word-level chunks
   */
  returnTimestamps?: boolean | 'word';
  /** Chunk length in seconds for long-form audio. @default 30 */
  chunkLengthS?: number;
  /** Stride between chunks in seconds. @default 5 */
  strideLengthS?: number;
};

/* ── Internal types ─────────────────────────────────────────────────────── */

type ModelProgressEvent = {
  status: 'initiate' | 'progress' | 'done' | 'ready';
  file?: string;
  progress?: number;
};

type PendingOp = {
  resolve: (data: unknown) => void;
  reject: (err: Error) => void;
};

/* ── Module-level helpers ───────────────────────────────────────────────── */

let msgCounter = 0;
const nextId = () => `whisper-${++msgCounter}`;

function detectWebGPU(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    'gpu' in navigator &&
    navigator.gpu !== null
  );
}

/* ── Hook ───────────────────────────────────────────────────────────────── */

/**
 * React hook for in-browser speech-to-text using Whisper via
 * `@huggingface/transformers` with WebGPU acceleration.
 *
 * All model loading and inference runs in a dedicated Web Worker so the
 * main thread stays fully responsive. Falls back to WASM automatically
 * when WebGPU is unavailable.
 *
 * @param modelKey       Which Whisper variant to use. @default 'tiny.en'
 * @param preferredDevice Force a specific backend. Auto-detected if omitted.
 *
 * @example
 * const { transcribe, loadModel, status, progress } = useWhisper('base.en');
 *
 * // Optionally warm-up the model ahead of time
 * useEffect(() => { loadModel(); }, [loadModel]);
 *
 * // Transcribe from a URL
 * const result = await transcribe('https://example.com/clip.wav');
 *
 * // Transcribe a Blob (e.g. from MediaRecorder)
 * const result = await transcribe(audioBlob, { returnTimestamps: true });
 *
 * // Transcribe pre-decoded 16kHz mono PCM
 * const result = await transcribe(float32Array);
 */
export function useWhisper(
  modelKey: WhisperModelKey = 'tiny.en',
  preferredDevice?: WhisperDevice,
) {
  const isWebGPUSupported = detectWebGPU();
  const device: WhisperDevice =
    preferredDevice ?? (isWebGPUSupported ? 'webgpu' : 'wasm');
  const modelId = WHISPER_MODELS[modelKey];

  const workerRef = useRef<Worker | null>(null);
  const pendingRef = useRef(new Map<string, PendingOp>());

  // Track which model+device combination is currently loading or loaded.
  const currentLoadRef = useRef<{
    modelId: string;
    device: WhisperDevice;
    promise: Promise<void>;
  } | null>(null);

  // Per-file download progress for aggregating an overall 0-100 progress.
  const fileProgressRef = useRef(new Map<string, number>());

  const [status, setStatus] = useState<WhisperStatus>('idle');
  const [progress, setProgress] = useState(0);
  const [lastError, setLastError] = useState<string | null>(null);
  const [lastTranscript, setLastTranscript] =
    useState<WhisperTranscriptResult | null>(null);

  /* ── Worker lifecycle ──────────────────────────────────────────────────── */

  const getWorker = useCallback((): Worker => {
    if (workerRef.current) return workerRef.current;

    const worker = new Worker(new URL('./whisper-worker.ts', import.meta.url));

    worker.onmessage = ({
      data,
    }: MessageEvent<{
      id: string;
      type: string;
      payload: Record<string, unknown>;
    }>) => {
      const { id, type, payload } = data;

      // Model download progress — update aggregated progress state.
      if (type === 'model-progress') {
        const evt = payload as ModelProgressEvent;
        if (evt.status === 'initiate' && evt.file) {
          fileProgressRef.current.set(evt.file, 0);
        } else if (evt.status === 'progress' && evt.file) {
          fileProgressRef.current.set(evt.file, evt.progress ?? 0);
          const values = [...fileProgressRef.current.values()];
          const avg = values.reduce((a, b) => a + b, 0) / values.length;
          setProgress(Math.round(avg));
        } else if (evt.status === 'done' && evt.file) {
          fileProgressRef.current.set(evt.file, 100);
        }
        return;
      }

      const pending = pendingRef.current.get(id);
      if (!pending) return;

      if (type === 'loaded') {
        pendingRef.current.delete(id);
        pending.resolve(undefined);
      } else if (type === 'result') {
        pendingRef.current.delete(id);
        pending.resolve(
          (payload as { result: WhisperTranscriptResult }).result,
        );
      } else if (type === 'error') {
        const msg = (payload as { message: string }).message;
        pendingRef.current.delete(id);
        setLastError(msg);
        pending.reject(new Error(msg));
      }
    };

    worker.onerror = (event) => {
      const msg = event.message ?? 'Whisper worker crashed';
      setLastError(msg);
      for (const [, op] of pendingRef.current) {
        op.reject(new Error(msg));
      }
      pendingRef.current.clear();
      setStatus('ready');
      // Discard crashed worker; next operation will create a fresh one.
      workerRef.current = null;
      currentLoadRef.current = null;
    };

    workerRef.current = worker;
    return worker;
  }, []);

  /* ── Model loading ─────────────────────────────────────────────────────── */

  const ensureLoaded = useCallback(async (): Promise<void> => {
    // Return existing promise if the same model+device is already loading/loaded.
    if (
      currentLoadRef.current?.modelId === modelId &&
      currentLoadRef.current?.device === device
    ) {
      return currentLoadRef.current.promise;
    }

    // Different model — reset file-progress tracking.
    fileProgressRef.current.clear();

    const promise = new Promise<void>((resolve, reject) => {
      const id = nextId();
      const worker = getWorker();
      pendingRef.current.set(id, { resolve: () => resolve(), reject });
      worker.postMessage({ id, type: 'load', payload: { modelId, device } });
    }).then(
      () => {
        setStatus('ready');
        setProgress(100);
      },
      (err: Error) => {
        currentLoadRef.current = null;
        throw err;
      },
    );

    currentLoadRef.current = { modelId, device, promise };
    setStatus('loading');
    setProgress(0);
    return promise;
  }, [getWorker, modelId, device]);

  /* ── Audio decoding ────────────────────────────────────────────────────── */

  /**
   * Decode any browser-supported audio Blob to a mono 16kHz Float32Array
   * using the Web Audio API (main-thread only).
   */
  const decodeAudioBlob = useCallback(
    async (blob: Blob): Promise<Float32Array> => {
      const arrayBuffer = await blob.arrayBuffer();
      const audioCtx = new AudioContext({ sampleRate: 16000 });
      const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
      await audioCtx.close();

      if (audioBuffer.numberOfChannels === 1) {
        return audioBuffer.getChannelData(0);
      }

      // Mix stereo → mono.
      const left = audioBuffer.getChannelData(0);
      const right = audioBuffer.getChannelData(1);
      const mono = new Float32Array(left.length);
      const SCALING_FACTOR = Math.SQRT2;
      for (let i = 0; i < left.length; i++) {
        mono[i] = ((left[i] ?? 0) + (right[i] ?? 0)) / SCALING_FACTOR;
      }
      return mono;
    },
    [],
  );

  /* ── Public API ─────────────────────────────────────────────────────────── */

  /**
   * Transcribe audio to text.
   *
   * @param audio  One of:
   *   - `string`       — URL to an audio file (fetched inside the worker)
   *   - `Blob`         — Any browser-decodable audio format (decoded on main thread)
   *   - `Float32Array` — Pre-decoded 16kHz mono PCM samples
   * @param opts   Optional transcription settings.
   */
  const transcribe = useCallback(
    async (
      audio: string | Blob | Float32Array,
      opts: TranscribeOptions = {},
    ): Promise<WhisperTranscriptResult> => {
      await ensureLoaded();
      setStatus('transcribing');
      setLastError(null);

      try {
        let audioUrl: string | undefined;
        let audioData: Float32Array | undefined;

        if (typeof audio === 'string') {
          audioUrl = audio;
        } else if (audio instanceof Blob) {
          audioData = await decodeAudioBlob(audio);
        } else {
          audioData = audio;
        }

        const result = await new Promise<WhisperTranscriptResult>(
          (resolve, reject) => {
            const id = nextId();
            const worker = getWorker();
            pendingRef.current.set(id, {
              resolve: (r) => resolve(r as WhisperTranscriptResult),
              reject,
            });

            const msgPayload: Record<string, unknown> = { modelId, device };
            if (audioUrl !== undefined) msgPayload.audioUrl = audioUrl;
            if (audioData !== undefined) msgPayload.audioData = audioData;
            if (opts.language !== undefined)
              msgPayload.language = opts.language;
            if (opts.returnTimestamps !== undefined)
              msgPayload.returnTimestamps = opts.returnTimestamps;
            if (opts.chunkLengthS !== undefined)
              msgPayload.chunkLengthS = opts.chunkLengthS;
            if (opts.strideLengthS !== undefined)
              msgPayload.strideLengthS = opts.strideLengthS;

            const transferables: Transferable[] = audioData
              ? [audioData.buffer as ArrayBuffer]
              : [];

            worker.postMessage(
              { id, type: 'transcribe', payload: msgPayload },
              transferables,
            );
          },
        );

        setLastTranscript(result);
        return result;
      } finally {
        setStatus('ready');
      }
    },
    [ensureLoaded, getWorker, decodeAudioBlob, modelId, device],
  );

  /**
   * Preload the Whisper model without transcribing anything.
   *
   * Call this early (e.g. in a `useEffect` on mount) to eliminate cold-start
   * latency when the user first triggers transcription.
   */
  const loadModel = useCallback(async (): Promise<void> => {
    await ensureLoaded();
  }, [ensureLoaded]);

  return {
    // State
    status,
    /** Aggregated model-download progress (0–100). Resets on transcription. */
    progress,
    lastError,
    lastTranscript,
    // Device info
    isWebGPUSupported,
    /** Resolved compute backend actually used. */
    device,
    /** Resolved Hugging Face model ID. */
    modelId,
    // Actions
    transcribe,
    loadModel,
    // Constants re-exported for convenience
    WHISPER_MODELS,
  } as const;
}
