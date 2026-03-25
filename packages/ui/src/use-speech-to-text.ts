'use client';

import { useRef, useState, useCallback } from 'react';
import type { SttMode, SttOptions } from '@repo/helpers/speech-to-text';

export type { SttMode, SttOptions };

const DEFAULT_REALTIME_INTERVAL = 4000;
const TARGET_SAMPLE_RATE = 16_000; // Whisper expects 16 kHz mono

let msgCounter = 0;
const nextId = () => `stt-${++msgCounter}`;

type PendingOp = {
  resolve: (text: string) => void;
  reject: (err: Error) => void;
};

export interface UseSpeechToTextOptions extends SttOptions {
  // Inherits: mode, language, model, realtimeInterval from SttOptions
}

export interface UseSpeechToTextReturn {
  /**
   * Finalized transcript text.
   * - `batch` mode: set after recording stops and transcription completes.
   * - `realtime` mode: set to the final full transcription after `stopListening`.
   */
  transcript: string;
  /**
   * In `realtime` mode: continuously updated during recording as each chunk
   * is transcribed.  Always empty in `batch` mode.
   */
  interimTranscript: string;
  /** `true` while the microphone is active. */
  isListening: boolean;
  /** `true` while the Whisper model is being downloaded / initialized. */
  isModelLoading: boolean;
  /** Model download progress percentage (0–100). */
  modelLoadProgress: number;
  /** `true` while audio data is being processed by the Whisper model. */
  isTranscribing: boolean;
  /** Last error message, or `null` if none. */
  error: string | null;
  /** Request microphone access and start recording. */
  startListening: () => Promise<void>;
  /**
   * Stop recording. In `batch` mode triggers transcription immediately.
   * In `realtime` mode finalizes the transcript with a last full pass.
   */
  stopListening: () => void;
  /** Clear `transcript` and `interimTranscript`. */
  resetTranscript: () => void;
}

/**
 * useSpeechToText — browser microphone → Whisper transcription hook.
 *
 * Runs Whisper ASR entirely in-browser via a dedicated Web Worker backed
 * by `@huggingface/transformers`.  Requires SharedArrayBuffer — the host
 * page must set `Cross-Origin-Opener-Policy: same-origin` and
 * `Cross-Origin-Embedder-Policy: require-corp` headers.
 *
 * @example
 * const { transcript, isListening, startListening, stopListening } =
 *   useSpeechToText({ mode: 'batch', language: 'en' });
 */
export function useSpeechToText(
  options: UseSpeechToTextOptions = {},
): UseSpeechToTextReturn {
  const {
    mode = 'batch',
    language = 'en',
    model, // undefined → worker auto-selects tiny(.en) with GPU when available
    realtimeInterval = DEFAULT_REALTIME_INTERVAL,
  } = options;

  // ── Worker refs ────────────────────────────────────────────────
  const workerRef = useRef<Worker | null>(null);
  const pendingRef = useRef(new Map<string, PendingOp>());
  const loadPromiseRef = useRef<Promise<void> | null>(null);

  // ── MediaRecorder refs ─────────────────────────────────────────
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const realtimeTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  // ── State ──────────────────────────────────────────────────────
  const [transcript, setTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [isModelLoading, setIsModelLoading] = useState(false);
  const [modelLoadProgress, setModelLoadProgress] = useState(0);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Worker lifecycle ───────────────────────────────────────────

  const getWorker = useCallback((): Worker => {
    if (workerRef.current) return workerRef.current;

    const worker = new Worker(new URL('./stt-worker.ts', import.meta.url));

    worker.onmessage = ({
      data,
    }: MessageEvent<{
      id?: string;
      type: string;
      payload: Record<string, unknown>;
    }>) => {
      const { id, type, payload } = data;

      // Model download progress broadcast (no id)
      if (type === 'model-progress') {
        setModelLoadProgress((payload as { progress: number }).progress);
        return;
      }

      if (!id) return;
      const pending = pendingRef.current.get(id);
      if (!pending) return;

      if (type === 'result') {
        pendingRef.current.delete(id);
        pending.resolve((payload as { text: string }).text);
      } else if (type === 'loaded') {
        pendingRef.current.delete(id);
        pending.resolve('');
      } else if (type === 'error') {
        const msg = (payload as { message: string }).message;
        pendingRef.current.delete(id);
        setError(msg);
        pending.reject(new Error(msg));
      }
    };

    worker.onerror = (event) => {
      const msg = event.message ?? 'STT worker crashed';
      setError(msg);
      for (const [, p] of pendingRef.current) p.reject(new Error(msg));
      pendingRef.current.clear();
      // Discard the crashed worker; next call will create a fresh one.
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
      worker.postMessage({ id, type: 'load', payload: { language, model } });
    });

    loadPromiseRef.current = promise
      .catch((err) => {
        // Clear the cached promise so the next call can retry.
        loadPromiseRef.current = null;
        throw err;
      })
      .finally(() => {
        setIsModelLoading(false);
        setModelLoadProgress(100);
      });

    return loadPromiseRef.current;
  }, [getWorker, model]);

  // ── Audio processing ───────────────────────────────────────────

  /**
   * Decode MediaRecorder Blobs to a mono 16 kHz Float32Array using the
   * Web Audio API.  Handles any sample rate the browser captures.
   */
  const decodeChunks = useCallback(
    async (chunks: Blob[]): Promise<Float32Array | null> => {
      if (chunks.length === 0) return null;

      const blob = new Blob(chunks, { type: chunks[0]?.type });
      const arrayBuffer = await blob.arrayBuffer();

      if (!audioCtxRef.current) {
        audioCtxRef.current = new AudioContext();
      }

      const decoded = await audioCtxRef.current.decodeAudioData(arrayBuffer);

      // Resample to 16 kHz and downmix to mono via OfflineAudioContext.
      const offlineCtx = new OfflineAudioContext(
        1, // mono output
        Math.ceil(decoded.duration * TARGET_SAMPLE_RATE),
        TARGET_SAMPLE_RATE,
      );
      const src = offlineCtx.createBufferSource();
      src.buffer = decoded;
      // OfflineAudioContext automatically downmixes a stereo source to mono.
      src.connect(offlineCtx.destination);
      src.start(0);

      const rendered = await offlineCtx.startRendering();
      return rendered.getChannelData(0);
    },
    [],
  );

  /**
   * Send a 16 kHz mono Float32Array to the STT worker and resolve with
   * the recognized text.
   */
  const transcribeFloat32 = useCallback(
    async (audio: Float32Array): Promise<string> => {
      await ensureModelLoaded();

      return new Promise<string>((resolve, reject) => {
        const id = nextId();
        const worker = getWorker();
        pendingRef.current.set(id, { resolve, reject });
        worker.postMessage({
          id,
          type: 'transcribe',
          payload: { audioData: audio, language, model },
        });
      });
    },
    [ensureModelLoaded, getWorker, language, model],
  );

  // ── Public API ─────────────────────────────────────────────────

  const startListening = useCallback(async (): Promise<void> => {
    if (isListening) return;
    setError(null);

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Microphone access denied');
      return;
    }

    const recorder = new MediaRecorder(stream);
    recorderRef.current = recorder;
    chunksRef.current = [];

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };

    if (mode === 'realtime') {
      // Fire ondataavailable on each interval so chunks accumulate gradually.
      recorder.start(realtimeInterval);

      realtimeTimerRef.current = setInterval(async () => {
        const snapshot = [...chunksRef.current];
        if (snapshot.length === 0) return;

        try {
          const audio = await decodeChunks(snapshot);
          if (!audio) return;
          setIsTranscribing(true);
          const text = await transcribeFloat32(audio);
          setInterimTranscript(text);
        } catch {
          // Non-fatal in real-time mode — skip this interval
        } finally {
          setIsTranscribing(false);
        }
      }, realtimeInterval);
    } else {
      recorder.start();
    }

    setIsListening(true);
  }, [isListening, mode, realtimeInterval, decodeChunks, transcribeFloat32]);

  const stopListening = useCallback((): void => {
    if (!recorderRef.current || !isListening) return;

    if (realtimeTimerRef.current) {
      clearInterval(realtimeTimerRef.current);
      realtimeTimerRef.current = null;
    }

    const recorder = recorderRef.current;

    recorder.onstop = async () => {
      const chunks = [...chunksRef.current];
      chunksRef.current = [];
      recorder.stream.getTracks().forEach((t) => t.stop());
      recorderRef.current = null;
      setIsListening(false);

      if (chunks.length === 0) return;

      setIsTranscribing(true);
      try {
        const audio = await decodeChunks(chunks);
        if (audio) {
          // Both modes: do a final full transcription when stopped.
          const text = await transcribeFloat32(audio);
          setTranscript(text);
          setInterimTranscript('');
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Transcription failed');
      } finally {
        setIsTranscribing(false);
      }
    };

    recorder.stop();
  }, [isListening, decodeChunks, transcribeFloat32]);

  const resetTranscript = useCallback((): void => {
    setTranscript('');
    setInterimTranscript('');
  }, []);

  return {
    transcript,
    interimTranscript,
    isListening,
    isModelLoading,
    modelLoadProgress,
    isTranscribing,
    error,
    startListening,
    stopListening,
    resetTranscript,
  };
}
