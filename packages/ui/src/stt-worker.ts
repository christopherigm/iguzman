/**
 * STT Web Worker
 *
 * Runs Whisper ASR inference (via @huggingface/transformers) in a dedicated
 * worker thread, keeping the main thread fully responsive during model
 * loading and transcription.
 *
 * Requires COOP + COEP headers on the host page (SharedArrayBuffer support).
 *
 * Model auto-selection (when no explicit model is passed)
 * ────────────────────────────────────────────────────────
 *   language = 'en' + WebGPU available  → onnx-community/whisper-tiny.en  (device: webgpu)
 *   language = 'en' + no WebGPU         → Xenova/whisper-tiny.en           (device: wasm)
 *   other language + WebGPU available   → onnx-community/whisper-tiny      (device: webgpu)
 *   other language + no WebGPU          → Xenova/whisper-tiny              (device: wasm)
 *
 * Message protocol
 * ─────────────────
 * Incoming (main → worker):
 *   { id, type: 'load',       payload: { language?: string, model?: string } }
 *   { id, type: 'transcribe', payload: { audioData: Float32Array, language?: string, model?: string } }
 *
 * Outgoing (worker → main):
 *   { type: 'model-progress', payload: { progress: number } }   – model download progress (no id)
 *   { id, type: 'loaded',     payload: {} }                     – model ready
 *   { id, type: 'result',     payload: { text: string } }       – transcription done
 *   { id, type: 'error',      payload: { message: string } }    – any failure
 */

import { pipeline, env } from '@huggingface/transformers';

// Always fetch models from Hugging Face Hub; never look for local files.
env.allowLocalModels = false;

/* ── Model constants ─────────────────────────────────────────── */

const CPU_TINY    = 'Xenova/whisper-tiny';
const CPU_TINY_EN = 'Xenova/whisper-tiny.en';
const GPU_TINY    = 'onnx-community/whisper-tiny';
const GPU_TINY_EN = 'onnx-community/whisper-tiny.en';

/* ── GPU detection ───────────────────────────────────────────── */

let gpuAvailable: boolean | null = null;

async function detectGpu(): Promise<boolean> {
  if (gpuAvailable !== null) return gpuAvailable;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const adapter = await (navigator as any).gpu?.requestAdapter();
    gpuAvailable = !!adapter;
  } catch {
    gpuAvailable = false;
  }
  return gpuAvailable ?? false;
}

async function resolveConfig(
  language: string,
  explicitModel?: string,
): Promise<{ modelId: string; device: 'webgpu' | 'wasm' }> {
  if (explicitModel) {
    // Caller provided an explicit model — honour it; assume CPU/WASM.
    return { modelId: explicitModel, device: 'wasm' };
  }
  const gpu = await detectGpu();
  const isEn = language.slice(0, 2) === 'en';
  if (gpu) {
    return { modelId: isEn ? GPU_TINY_EN : GPU_TINY, device: 'webgpu' };
  }
  return { modelId: isEn ? CPU_TINY_EN : CPU_TINY, device: 'wasm' };
}

/* ── Worker state ────────────────────────────────────────────── */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let transcriber: any = null;
let loadedKey = ''; // `${modelId}:${device}` — identifies the cached pipeline
let loadPromise: Promise<void> | null = null;

/* ── Helpers ─────────────────────────────────────────────────── */

async function ensureLoaded(
  modelId: string,
  device: 'webgpu' | 'wasm',
): Promise<void> {
  const key = `${modelId}:${device}`;
  if (transcriber && loadedKey === key) return;
  if (loadPromise && loadedKey === key) return loadPromise;

  loadedKey = key;
  loadPromise = (async () => {
    transcriber = await pipeline('automatic-speech-recognition', modelId, {
      device,
      progress_callback: (info: {
        status: string;
        progress?: number;
        file?: string;
      }) => {
        if (info.status === 'progress' && info.progress !== undefined) {
          self.postMessage({
            type: 'model-progress',
            payload: { progress: Math.round(info.progress) },
          });
        }
      },
    });
  })();

  return loadPromise;
}

/* ── Main message handler ────────────────────────────────────── */

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
      const { language = 'en', model } = payload as {
        language?: string;
        model?: string;
      };
      const { modelId, device } = await resolveConfig(language, model);
      await ensureLoaded(modelId, device);
      self.postMessage({ id, type: 'loaded', payload: {} });
      return;
    }

    if (type === 'transcribe') {
      const { audioData, language = 'en', model } = payload as {
        audioData: Float32Array;
        language?: string;
        model?: string;
      };

      const { modelId, device } = await resolveConfig(language, model);
      await ensureLoaded(modelId, device);

      // English-only models (*.en) don't accept `language` or `task` options.
      const inferenceOptions = modelId.endsWith('.en')
        ? {}
        : { language, task: 'transcribe' as const };
      const result = await transcriber(audioData, inferenceOptions);

      const text = (result as { text: string }).text?.trim() ?? '';
      self.postMessage({ id, type: 'result', payload: { text } });
      return;
    }

    sendError(`Unknown message type: ${type}`);
  } catch (err) {
    sendError(err instanceof Error ? err.message : String(err));
  }
};
