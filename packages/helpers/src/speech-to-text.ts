/**
 * Shared Speech-to-Text types and pure audio utilities.
 *
 * Browser-specific processing (AudioContext, MediaRecorder, Web Worker) lives
 * in @repo/ui — this module is environment-agnostic and has no dependencies.
 */

/** Controls whether transcription happens incrementally or all at once. */
export type SttMode = 'realtime' | 'batch';

/**
 * Options shared between the helper utilities and the UI hook / component.
 */
export interface SttOptions {
  /**
   * `'batch'`   — record everything, transcribe in one shot when stopped.
   * `'realtime'` — transcribe in rolling chunks while the mic is active.
   * @default 'batch'
   */
  mode?: SttMode;
  /**
   * BCP-47 language tag. Only the first two characters are forwarded to
   * Whisper (e.g. `'en'`, `'es'`, `'de'`, `'fr'`, `'pt'`).
   * @default 'en'
   */
  language?: string;
  /**
   * Hugging Face model ID passed to the `automatic-speech-recognition`
   * pipeline.  When omitted the worker auto-selects a Whisper tiny model:
   * `tiny.en` for English, `tiny` for other languages; `onnx-community/`
   * (WebGPU) when available, `Xenova/` (WASM/CPU) otherwise.
   * @default auto (tiny.en / tiny, GPU when available)
   */
  model?: string;
  /**
   * Real-time mode only: milliseconds between successive transcription
   * passes while recording.
   * @default 4000
   */
  realtimeInterval?: number;
}

/** Result of a single transcription call. */
export interface SttResult {
  /** Transcribed text, trimmed of leading/trailing whitespace. */
  text: string;
  /** Wall-clock time from first byte to final text, in milliseconds. */
  durationMs: number;
}

/**
 * Merge multiple Float32Arrays into one contiguous array.
 *
 * Use this to combine recorded audio chunks before sending to a
 * transcription function.
 *
 * @param arrays - Audio chunks, each a mono 16 kHz Float32Array.
 * @returns A single Float32Array with all chunks concatenated in order.
 */
export function mergeFloat32Arrays(arrays: Float32Array[]): Float32Array {
  const totalLength = arrays.reduce((sum, a) => sum + a.length, 0);
  const merged = new Float32Array(totalLength);
  let offset = 0;
  for (const arr of arrays) {
    merged.set(arr, offset);
    offset += arr.length;
  }
  return merged;
}
