/**
 * Whisper Web Worker
 *
 * Runs all Whisper ASR operations in a dedicated worker thread via
 * @huggingface/transformers, keeping the main thread fully responsive
 * during model loading and audio transcription.
 *
 * Message protocol
 * ─────────────────
 * Incoming (main → worker):
 *   { id, type: 'load',       payload: { modelId: string, device: 'webgpu'|'wasm' } }
 *   { id, type: 'transcribe', payload: { modelId, device, audioUrl?, audioData?,
 *                                        language?, returnTimestamps?,
 *                                        chunkLengthS?, strideLengthS? } }
 *
 * Outgoing (worker → main):
 *   { id, type: 'model-progress', payload: { status, file?, progress?, loaded?, total? } }
 *   { id, type: 'loaded',         payload: {} }
 *   { id, type: 'result',         payload: { result: TranscriptResult } }
 *   { id, type: 'error',          payload: { message: string } }
 */

import { pipeline } from '@huggingface/transformers';
import type { AutomaticSpeechRecognitionPipeline } from '@huggingface/transformers';

/* ── Worker state ──────────────────────────────────────────────────────── */

let transcriber: AutomaticSpeechRecognitionPipeline | null = null;
let loadedModelId: string | null = null;
let loadedDevice: string | null = null;
let loadPromise: Promise<void> | null = null;

/* ── Helpers ────────────────────────────────────────────────────────────── */

async function ensureLoaded(
  loadMsgId: string,
  modelId: string,
  device: 'webgpu' | 'wasm',
): Promise<AutomaticSpeechRecognitionPipeline> {
  if (transcriber && loadedModelId === modelId && loadedDevice === device) {
    return transcriber;
  }

  // Different model/device requested — discard cached pipeline.
  transcriber = null;
  loadedModelId = null;
  loadedDevice = null;
  loadPromise = null;

  if (!loadPromise) {
    loadPromise = (async () => {
      const instance = await pipeline(
        'automatic-speech-recognition',
        modelId,
        {
          device,
          progress_callback: (event: unknown) => {
            self.postMessage({
              id: loadMsgId,
              type: 'model-progress',
              payload: event,
            });
          },
        },
      );

      transcriber = instance as AutomaticSpeechRecognitionPipeline;
      loadedModelId = modelId;
      loadedDevice = device;
    })();
  }

  await loadPromise;
  return transcriber!;
}

/* ── Main message handler ───────────────────────────────────────────────── */

self.onmessage = async (
  event: MessageEvent<{
    id: string;
    type: string;
    payload: Record<string, unknown>;
  }>,
) => {
  const { id, type, payload } = event.data;

  const sendError = (message: string) => {
    self.postMessage({ id, type: 'error', payload: { message } });
  };

  try {
    if (type === 'load') {
      const { modelId, device } = payload as {
        modelId: string;
        device: 'webgpu' | 'wasm';
      };
      await ensureLoaded(id, modelId, device);
      self.postMessage({ id, type: 'loaded', payload: {} });
      return;
    }

    if (type === 'transcribe') {
      const {
        modelId,
        device,
        audioUrl,
        audioData,
        language,
        returnTimestamps,
        chunkLengthS,
        strideLengthS,
      } = payload as {
        modelId: string;
        device: 'webgpu' | 'wasm';
        audioUrl?: string;
        audioData?: Float32Array;
        language?: string;
        returnTimestamps?: boolean | 'word';
        chunkLengthS?: number;
        strideLengthS?: number;
      };

      const pipe = await ensureLoaded(id, modelId, device);

      // Pipeline accepts a URL string or a Float32Array (16kHz mono assumed).
      const audio = audioUrl ?? audioData!;

      const opts: Record<string, unknown> = {};
      if (language !== undefined) opts.language = language;
      if (returnTimestamps !== undefined)
        opts.return_timestamps = returnTimestamps;
      if (chunkLengthS !== undefined) opts.chunk_length_s = chunkLengthS;
      if (strideLengthS !== undefined) opts.stride_length_s = strideLengthS;

      const result = await pipe(audio, opts);

      self.postMessage({ id, type: 'result', payload: { result } });
      return;
    }

    sendError(`Unknown message type: ${type}`);
  } catch (err) {
    sendError(err instanceof Error ? err.message : String(err));
  }
};
