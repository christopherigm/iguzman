/**
 * Shared LLM types and utilities.
 *
 * Browser-specific inference (Web Worker, Transformers.js pipeline) lives in
 * @repo/ui — this module is environment-agnostic and has no dependencies.
 */

/** Controls whether tokens are delivered incrementally or all at once. */
export type LlmMode = 'streaming' | 'batch';

/** A single message in a chat conversation. */
export interface LlmMessage {
  /** Conversation role. */
  role: 'system' | 'user' | 'assistant';
  /** Message text. */
  content: string;
}

/**
 * Options shared between the worker and the UI hook.
 */
export interface LlmOptions {
  /**
   * `'streaming'` — emit tokens one by one as they are generated.
   * `'batch'`     — return the full response when generation is complete.
   * @default 'streaming'
   */
  mode?: LlmMode;
  /**
   * Hugging Face model ID (ONNX text-generation model).
   * When omitted the worker auto-selects:
   *  - WebGPU available → `onnx-community/Qwen3-0.6B-ONNX`  (q4f16, GPU)
   *  - WebGPU unavailable → `Xenova/TinyLlama-1.1B-Chat-v1.0` (q4, WASM)
   * @default auto
   */
  model?: string;
  /**
   * Maximum number of new tokens to generate.
   * @default 512
   */
  maxNewTokens?: number;
  /**
   * Sampling temperature. 0 = greedy (deterministic), higher = more creative.
   * @default 1
   */
  temperature?: number;
  /**
   * Top-p nucleus sampling probability (only used when temperature > 0).
   * @default 0.9
   */
  topP?: number;
}

/** Result of a single generation call. */
export interface LlmResult {
  /** Full generated text, trimmed of leading/trailing whitespace. */
  text: string;
  /** Wall-clock time from first inference call to final token, in milliseconds. */
  durationMs: number;
}
