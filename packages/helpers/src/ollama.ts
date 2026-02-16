import { httpPost } from '@iguzman/helpers/http-client';
import { ollamaServerURL } from '@iguzman/helpers/constants';
import getRandomNumber from '@iguzman/helpers/random-number';

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

/** A single model entry in the registry. */
export interface OllamaModel {
  host: string;
  name: string;
}

/** Map of friendly model keys to their configuration. */
export type OllamaModelRegistry = Record<string, OllamaModel>;

/** Options accepted by {@link ollamaGenerate}. */
export interface OllamaGenerateOptions {
  host?: string;
  model?: string;
  prompt: string;
  system?: string;
  format?: string;
  /** Plain-text context that will be embedded and passed as context to the generate call. */
  stringContext?: string;
  /** Pre-computed embeddings to merge with any newly generated ones. */
  embeddings?: number[];
}

/** Shape of the Ollama `/api/generate` response. */
export interface OllamaGenerateResponse {
  model: string;
  created_at: string;
  response: string;
  done: boolean;
  done_reason: string;
  context: number[];
  total_duration: number;
  load_duration: number;
  prompt_eval_count: number;
  prompt_eval_duration: number;
  eval_count: number;
  eval_duration: number;
}

/** Payload sent to `/api/embed`. */
interface OllamaEmbedPayload {
  model: string;
  input: string;
}

/** Shape of the Ollama `/api/embed` response. */
interface OllamaEmbedResponse {
  model: string;
  embeddings: number[][];
}

/** Payload sent to `/api/generate`. */
interface OllamaGeneratePayload {
  model: string;
  prompt: string;
  stream: boolean;
  system: string;
  format?: string;
  context?: number[];
  options: { seed: number };
  keep_alive: number;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                         */
/* ------------------------------------------------------------------ */

/** 10 minutes in milliseconds. */
const DEFAULT_TIMEOUT_MS = 600_000;

/** Available model presets. */
export const models: OllamaModelRegistry = {
  gemma3: {
    host: ollamaServerURL,
    name: 'gemma3:latest',
  },
};

/* ------------------------------------------------------------------ */
/*  Internal helpers                                                  */
/* ------------------------------------------------------------------ */

/** Fetches embeddings for the given text from Ollama's `/api/embed` endpoint. */
const fetchEmbeddings = async (
  host: string,
  input: string,
): Promise<number[][]> => {
  const { data } = await httpPost<OllamaEmbedResponse>({
    baseUrl: host,
    url: '/api/embed',
    body: { model: 'mxbai-embed-large', input } satisfies OllamaEmbedPayload,
    timeoutMs: DEFAULT_TIMEOUT_MS,
  });
  return data.embeddings;
};

/* ------------------------------------------------------------------ */
/*  Public API                                                        */
/* ------------------------------------------------------------------ */

/**
 * Sends a generate request to an Ollama instance and returns the full response.
 *
 * When `stringContext` is provided, the text is first embedded via `/api/embed`
 * and the resulting vectors are merged with any supplied `embeddings` before
 * being passed as `context` to `/api/generate`.
 */
const ollamaGenerate = async (
  options: OllamaGenerateOptions,
): Promise<OllamaGenerateResponse> => {
  const {
    host = models.gemma3?.host ?? '',
    model = models.gemma3?.name ?? '',
    prompt,
    system = '',
    format,
    stringContext,
    embeddings = [],
  } = options;

  let context: number[] | undefined;

  if (stringContext) {
    const generated = await fetchEmbeddings(host, stringContext);
    context = embeddings.concat(generated[0] ?? []);
  }

  const payload: OllamaGeneratePayload = {
    model,
    prompt,
    stream: false,
    system,
    format,
    context,
    options: { seed: getRandomNumber(1, 9999) },
    keep_alive: -1,
  };

  const { data } = await httpPost<OllamaGenerateResponse>({
    baseUrl: host,
    url: '/api/generate',
    body: payload,
    timeoutMs: DEFAULT_TIMEOUT_MS,
  });

  return data;
};

export default ollamaGenerate;
