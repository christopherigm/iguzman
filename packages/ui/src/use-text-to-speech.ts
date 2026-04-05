'use client';

import { useRef, useState, useCallback, useEffect } from 'react';
import type { TtsEngine, TtsOptions, TtsVoice } from '@repo/helpers/text-to-speech';

export type { TtsEngine, TtsOptions, TtsVoice };

let msgCounter = 0;
const nextId = () => `tts-${++msgCounter}`;

type PendingOp = {
  resolve: (value: unknown) => void;
  reject: (err: Error) => void;
};

export type UseTextToSpeechOptions = TtsOptions;

export interface UseTextToSpeechReturn {
  /** `true` while audio is being played. */
  isSpeaking: boolean;
  /** Neural engine only: `true` while the model is downloading / initializing. */
  isModelLoading: boolean;
  /** Neural engine only: model download progress percentage (0–100). */
  modelLoadProgress: number;
  /** Last error message, or `null` if none. */
  error: string | null;
  /** Browser engine only: list of available system voices. */
  voices: TtsVoice[];
  /**
   * Synthesize and play the given text.
   * Resolves when playback finishes (or rejects on error).
   */
  speak: (text: string) => Promise<void>;
  /** Stop any ongoing speech immediately. */
  stop: () => void;
  /** Browser engine only: pause the current utterance. */
  pause: () => void;
  /** Browser engine only: resume a paused utterance. */
  resume: () => void;
}

/**
 * useTextToSpeech — text → audio playback hook.
 *
 * Supports two engines:
 *  - `'browser'`  Web Speech API — instant, zero-download, OS voices.
 *  - `'neural'`   SpeechT5 via a Web Worker — high quality, ~100–300 MB first load.
 *
 * @example
 * const { speak, isSpeaking, stop } = useTextToSpeech({ engine: 'browser', language: 'en' });
 * await speak('Hello, world!');
 */
export function useTextToSpeech(
  options: UseTextToSpeechOptions = {},
): UseTextToSpeechReturn {
  const {
    engine = 'browser',
    language = 'en',
    model,
    speakerEmbeddings,
    rate = 1,
    pitch = 1,
    volume = 1,
  } = options;

  // ── Worker refs (neural engine) ────────────────────────────
  const workerRef = useRef<Worker | null>(null);
  const pendingRef = useRef(new Map<string, PendingOp>());
  const loadPromiseRef = useRef<Promise<void> | null>(null);

  // ── AudioContext refs (neural engine) ──────────────────────
  const audioCtxRef = useRef<AudioContext | null>(null);
  const audioSourceRef = useRef<AudioBufferSourceNode | null>(null);

  // ── State ──────────────────────────────────────────────────
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isModelLoading, setIsModelLoading] = useState(false);
  const [modelLoadProgress, setModelLoadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [voices, setVoices] = useState<TtsVoice[]>([]);

  // ── Browser engine: enumerate voices ──────────────────────
  useEffect(() => {
    if (engine !== 'browser' || typeof window === 'undefined') return;

    const loadVoices = () => {
      setVoices(
        speechSynthesis.getVoices().map((v) => ({
          id: v.voiceURI,
          name: v.name,
          language: v.lang,
          isLocal: v.localService,
        })),
      );
    };

    loadVoices();
    speechSynthesis.addEventListener('voiceschanged', loadVoices);
    return () => speechSynthesis.removeEventListener('voiceschanged', loadVoices);
  }, [engine]);

  // ── Neural engine: worker lifecycle ───────────────────────

  const getWorker = useCallback((): Worker => {
    if (workerRef.current) return workerRef.current;

    const worker = new Worker(new URL('./tts-worker.ts', import.meta.url));

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
      pendingRef.current.delete(id);

      if (type === 'loaded') {
        pending.resolve(undefined);
      } else if (type === 'result') {
        // Resolve with the raw payload; speak() unpacks and plays it.
        pending.resolve(payload);
      } else if (type === 'error') {
        const msg = (payload as { message: string }).message;
        setError(msg);
        pending.reject(new Error(msg));
      }
    };

    worker.onerror = (event) => {
      const msg = event.message ?? 'TTS worker crashed';
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

  // ── Neural engine: play Float32Array via AudioContext ──────

  const playFloat32 = useCallback(
    (audio: Float32Array, samplingRate: number): Promise<void> => {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new AudioContext();
      }
      const ctx = audioCtxRef.current;
      const buf = ctx.createBuffer(1, audio.length, samplingRate);
      buf.getChannelData(0).set(audio);

      return new Promise((resolve) => {
        const source = ctx.createBufferSource();
        source.buffer = buf;
        source.connect(ctx.destination);
        audioSourceRef.current = source;
        setIsSpeaking(true);
        source.onended = () => {
          audioSourceRef.current = null;
          setIsSpeaking(false);
          resolve();
        };
        source.start();
      });
    },
    [],
  );

  // ── Public API ─────────────────────────────────────────────

  const speak = useCallback(
    async (text: string): Promise<void> => {
      if (!text.trim()) return;
      setError(null);

      if (engine === 'browser') {
        // Cancel any ongoing utterance before starting a new one.
        speechSynthesis.cancel();

        return new Promise<void>((resolve, reject) => {
          const utterance = new SpeechSynthesisUtterance(text);
          utterance.lang = language;
          utterance.rate = rate;
          utterance.pitch = pitch;
          utterance.volume = volume;
          utterance.onstart = () => setIsSpeaking(true);
          utterance.onend = () => {
            setIsSpeaking(false);
            resolve();
          };
          utterance.onerror = (e) => {
            setIsSpeaking(false);
            const msg = e.error ?? 'Speech synthesis error';
            setError(msg);
            reject(new Error(msg));
          };
          speechSynthesis.speak(utterance);
        });
      }

      // Neural engine: ensure model loaded, send to worker, play result.
      await ensureModelLoaded();

      const payload = await new Promise<{
        audio: Float32Array;
        samplingRate: number;
      }>((resolve, reject) => {
        const id = nextId();
        const worker = getWorker();
        pendingRef.current.set(id, {
          resolve: (v) => resolve(v as { audio: Float32Array; samplingRate: number }),
          reject,
        });
        worker.postMessage({
          id,
          type: 'synthesize',
          payload: { text, model, speakerEmbeddings },
        });
      });

      await playFloat32(payload.audio, payload.samplingRate);
    },
    [
      engine,
      language,
      rate,
      pitch,
      volume,
      ensureModelLoaded,
      getWorker,
      model,
      speakerEmbeddings,
      playFloat32,
    ],
  );

  const stop = useCallback((): void => {
    if (engine === 'browser') {
      speechSynthesis.cancel();
      setIsSpeaking(false);
    } else {
      audioSourceRef.current?.stop();
      audioSourceRef.current = null;
      setIsSpeaking(false);
    }
  }, [engine]);

  const pause = useCallback((): void => {
    if (engine === 'browser') speechSynthesis.pause();
  }, [engine]);

  const resume = useCallback((): void => {
    if (engine === 'browser') speechSynthesis.resume();
  }, [engine]);

  return {
    isSpeaking,
    isModelLoading,
    modelLoadProgress,
    error,
    voices,
    speak,
    stop,
    pause,
    resume,
  };
}
