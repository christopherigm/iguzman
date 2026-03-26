/**
 * LLM Web Worker
 *
 * Runs text-generation inference (via @huggingface/transformers) in a dedicated
 * worker thread, keeping the main thread fully responsive during model loading
 * and generation.
 *
 * Requires COOP + COEP headers on the host page (SharedArrayBuffer / WebGPU).
 *
 * Model auto-selection (when no explicit model is passed)
 * ────────────────────────────────────────────────────────
 *   WebGPU available   → onnx-community/Qwen3-0.6B-ONNX    (device: webgpu, dtype: q4f16)
 *   WebGPU unavailable → Xenova/TinyLlama-1.1B-Chat-v1.0   (device: wasm,   dtype: q4)
 *
 * Message protocol
 * ─────────────────
 * Incoming (main → worker):
 *   { id, type: 'load',     payload: { model?: string } }
 *   { id, type: 'generate', payload: { messages, model?, mode?, maxNewTokens?, temperature?, topP? } }
 *   {     type: 'abort' }                                   – no id; interrupts current streaming generation
 *
 * Outgoing (worker → main):
 *   { type: 'model-progress', payload: { progress: number } }  – model download (no id)
 *   { id, type: 'loaded',     payload: {} }                    – model ready
 *   { id, type: 'token',      payload: { text: string } }      – streaming mode only, one per decoded chunk
 *   { id, type: 'result',     payload: { text: string, durationMs: number } }
 *   { id, type: 'error',      payload: { message: string } }   – 'AbortError' when aborted
 */

import { pipeline, env, TextStreamer } from '@huggingface/transformers';

env.allowLocalModels = false;

/* ── Model constants ─────────────────────────────────────────── */

const GPU_MODEL = 'onnx-community/Qwen3-0.6B-ONNX';
const CPU_MODEL = 'Xenova/TinyLlama-1.1B-Chat-v1.0';

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

type Dtype = 'q4' | 'q4f16';

async function resolveConfig(explicitModel?: string): Promise<{
  modelId: string;
  device: 'webgpu' | 'wasm';
  dtype: Dtype;
}> {
  if (explicitModel) {
    return { modelId: explicitModel, device: 'wasm', dtype: 'q4' };
  }
  const gpu = await detectGpu();
  return gpu
    ? { modelId: GPU_MODEL, device: 'webgpu', dtype: 'q4f16' }
    : { modelId: CPU_MODEL, device: 'wasm', dtype: 'q4' };
}

/* ── Worker state ────────────────────────────────────────────── */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let generator: any = null;
let loadedKey = ''; // `${modelId}:${device}` — identifies the cached pipeline
let loadPromise: Promise<void> | null = null;

async function ensureLoaded(
  modelId: string,
  device: 'webgpu' | 'wasm',
  dtype: Dtype,
): Promise<void> {
  const key = `${modelId}:${device}`;
  if (generator && loadedKey === key) return;
  if (loadPromise && loadedKey === key) return loadPromise;

  loadedKey = key;
  loadPromise = (async () => {
    generator = await pipeline('text-generation', modelId, {
      device,
      dtype,
      progress_callback: (info: { status: string; progress?: number }) => {
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

/**
 * Extract the assistant's reply text from a text-generation pipeline result.
 *
 * With `return_full_text: false`:
 *  - String input  → result[0].generated_text is a string (the new tokens).
 *  - Message input → result[0].generated_text is the last message object.
 */
function extractText(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  result: any[],
): string {
  const raw = result[0]?.generated_text;
  if (typeof raw === 'string') return raw.trim();
  if (Array.isArray(raw)) {
    const last = raw.at(-1) as { content?: string } | undefined;
    return (last?.content ?? '').trim();
  }
  return '';
}

/* ── Abort flag ──────────────────────────────────────────────── */

let abortRequested = false;

/* ── Main message handler ────────────────────────────────────── */

self.onmessage = async (
  event: MessageEvent<{
    id: string;
    type: string;
    payload: Record<string, unknown>;
  }>,
) => {
  const { id, type, payload } = event.data;

  if (type === 'abort') {
    abortRequested = true;
    return;
  }

  const sendError = (message: string) =>
    self.postMessage({ id, type: 'error', payload: { message } });

  try {
    // ── load ────────────────────────────────────────────────────
    if (type === 'load') {
      const { model } = payload as { model?: string };
      const { modelId, device, dtype } = await resolveConfig(model);
      await ensureLoaded(modelId, device, dtype);
      self.postMessage({ id, type: 'loaded', payload: {} });
      return;
    }

    // ── generate ────────────────────────────────────────────────
    if (type === 'generate') {
      const {
        messages,
        model,
        mode = 'streaming',
        maxNewTokens = 512,
        temperature = 1,
        topP = 0.9,
      } = payload as {
        messages: Array<{ role: string; content: string }>;
        model?: string;
        mode?: string;
        maxNewTokens?: number;
        temperature?: number;
        topP?: number;
      };

      const { modelId, device, dtype } = await resolveConfig(model);
      await ensureLoaded(modelId, device, dtype);

      abortRequested = false;
      const startTime = Date.now();

      const doSample = temperature > 0;
      const inferenceOptions: Record<string, unknown> = {
        max_new_tokens: maxNewTokens,
        do_sample: doSample,
        return_full_text: false,
        ...(doSample ? { temperature, top_p: topP } : {}),
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let result: any[];

      if (mode === 'streaming') {
        const streamer = new TextStreamer(generator.tokenizer, {
          skip_prompt: true,
          skip_special_tokens: true,
          callback_function: (text: string) => {
            if (abortRequested) throw new Error('AbortError');
            self.postMessage({ id, type: 'token', payload: { text } });
          },
        });
        result = await generator(messages, { ...inferenceOptions, streamer });
      } else {
        result = await generator(messages, inferenceOptions);
      }

      self.postMessage({
        id,
        type: 'result',
        payload: {
          text: extractText(result),
          durationMs: Date.now() - startTime,
        },
      });
      return;
    }

    sendError(`Unknown message type: ${type}`);
  } catch (err) {
    sendError(err instanceof Error ? err.message : String(err));
  }
};
