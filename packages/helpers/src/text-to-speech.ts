/**
 * Shared Text-to-Speech types and pure audio utilities.
 *
 * Browser-specific processing (Web Speech API, AudioContext, Web Worker) lives
 * in @repo/ui — this module is environment-agnostic and has no dependencies.
 */

/** Which synthesis engine to use. */
export type TtsEngine = 'browser' | 'neural';

/**
 * Options shared between the helper utilities and the UI hook / component.
 */
export interface TtsOptions {
  /**
   * `'browser'`  — uses the native Web Speech API (SpeechSynthesis).
   *                 Instant, zero-download, quality varies by OS/browser.
   * `'neural'`   — runs SpeechT5 neural TTS in-browser via a Web Worker
   *                 backed by `@huggingface/transformers`. High quality but
   *                 requires ~100–300 MB model download on first use.
   * @default 'browser'
   */
  engine?: TtsEngine;
  /**
   * BCP-47 language tag (e.g. `'en'`, `'en-US'`, `'es'`, `'de'`, `'fr'`, `'pt'`).
   * Used for voice selection in browser engine.
   * @default 'en'
   */
  language?: string;
  /**
   * Neural engine only: Hugging Face model ID.
   * @default 'Xenova/speecht5_tts'
   */
  model?: string;
  /**
   * Neural engine only: URL to a 512-element Float32 speaker-embeddings binary.
   * Controls the voice characteristics of the generated speech.
   * @default Xenova transformers.js-docs default speaker embedding
   */
  speakerEmbeddings?: string;
  /**
   * Browser engine only: speech rate (0.1–10).
   * @default 1
   */
  rate?: number;
  /**
   * Browser engine only: speech pitch (0–2).
   * @default 1
   */
  pitch?: number;
  /**
   * Browser engine only: volume (0–1).
   * @default 1
   */
  volume?: number;
}

/** A single available synthesis voice (browser engine). */
export interface TtsVoice {
  /** Unique identifier (the voice URI). */
  id: string;
  /** Human-readable name (e.g. `'Google UK English Female'`). */
  name: string;
  /** BCP-47 language tag (e.g. `'en-GB'`). */
  language: string;
  /** `true` if the voice is installed locally (no network needed). */
  isLocal: boolean;
}

/**
 * Encode a mono Float32Array of PCM samples into a WAV ArrayBuffer.
 *
 * Use this to convert neural TTS output (`audio: Float32Array`) into a
 * playable or downloadable WAV file.
 *
 * @param samples    - PCM audio samples in the range [-1, 1].
 * @param sampleRate - Samples per second (e.g. 16000 or 22050).
 * @returns WAV-encoded binary data.
 */
export function float32ToWav(
  samples: Float32Array,
  sampleRate: number,
): ArrayBuffer {
  const numFrames = samples.length;
  const bytesPerSample = 2; // 16-bit PCM
  const blockAlign = bytesPerSample; // mono
  const byteRate = sampleRate * blockAlign;
  const dataSize = numFrames * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  const writeStr = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i++) {
      view.setUint8(offset + i, value.charCodeAt(i));
    }
  };

  // RIFF chunk descriptor
  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, 'WAVE');
  // fmt sub-chunk
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);          // PCM sub-chunk size
  view.setUint16(20, 1, true);           // PCM format
  view.setUint16(22, 1, true);           // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bytesPerSample * 8, true); // bits per sample
  // data sub-chunk
  writeStr(36, 'data');
  view.setUint32(40, dataSize, true);

  // Convert Float32 [-1, 1] → Int16
  let offset = 44;
  for (let i = 0; i < numFrames; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i] ?? 0));
    view.setInt16(offset, clamped * 0x7fff, true);
    offset += 2;
  }

  return buffer;
}
