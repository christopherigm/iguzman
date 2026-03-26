/**
 * TTS Web Worker
 *
 * Runs SpeechT5 neural TTS inference (via @huggingface/transformers) in a
 * dedicated worker thread, keeping the main thread responsive during model
 * loading and synthesis.
 *
 * Model auto-selection (when no explicit model is passed)
 * ────────────────────────────────────────────────────────
 *   default → Xenova/speecht5_tts  (WASM/CPU)
 *
 * Message protocol
 * ─────────────────
 * Incoming (main → worker):
 *   { id, type: 'load',       payload: { model?: string } }
 *   { id, type: 'synthesize', payload: { text: string, model?: string, speakerEmbeddings?: string } }
 *
 * Outgoing (worker → main):
 *   { type: 'model-progress', payload: { progress: number } }   – model download progress (no id)
 *   { id, type: 'loaded',     payload: {} }                     – model ready
 *   { id, type: 'result',     payload: { audio: Float32Array, samplingRate: number } }
 *   { id, type: 'error',      payload: { message: string } }    – any failure
 */

import { pipeline, env } from '@huggingface/transformers';

// Always fetch models from Hugging Face Hub; never look for local files.
env.allowLocalModels = false;

/* ── Constants ───────────────────────────────────────────── */

const DEFAULT_MODEL = 'Xenova/speecht5_tts';
// Default speaker embeddings from the transformers.js-docs dataset.
const DEFAULT_SPEAKER_EMBEDDINGS =
  'https://huggingface.co/datasets/Xenova/transformers.js-docs/resolve/main/speaker_embeddings.bin';

/* ── Worker state ────────────────────────────────────────── */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let synthesizer: any = null;
let loadedModelId = '';
let loadPromise: Promise<void> | null = null;

/* ── Helpers ─────────────────────────────────────────────── */

async function ensureLoaded(modelId: string): Promise<void> {
  if (synthesizer && loadedModelId === modelId) return;
  if (loadPromise && loadedModelId === modelId) return loadPromise;

  loadedModelId = modelId;
  loadPromise = (async () => {
    synthesizer = await pipeline('text-to-speech', modelId, {
      progress_callback: (info: {
        status: string;
        progress?: number;
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

/* ── Main message handler ────────────────────────────────── */

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
      const { model = DEFAULT_MODEL } = payload as { model?: string };
      await ensureLoaded(model);
      self.postMessage({ id, type: 'loaded', payload: {} });
      return;
    }

    if (type === 'synthesize') {
      const {
        text,
        model = DEFAULT_MODEL,
        speakerEmbeddings = DEFAULT_SPEAKER_EMBEDDINGS,
      } = payload as {
        text: string;
        model?: string;
        speakerEmbeddings?: string;
      };

      await ensureLoaded(model);

      const result = await synthesizer(text, {
        speaker_embeddings: speakerEmbeddings,
      });

      self.postMessage({
        id,
        type: 'result',
        payload: {
          audio: (result as { audio: Float32Array }).audio,
          samplingRate: (result as { sampling_rate: number }).sampling_rate,
        },
      });
      return;
    }

    sendError(`Unknown message type: ${type}`);
  } catch (err) {
    sendError(err instanceof Error ? err.message : String(err));
  }
};
