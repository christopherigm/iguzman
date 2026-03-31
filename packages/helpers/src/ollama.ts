import { httpPost } from '@repo/helpers/http-client';
import { ollamaServerURL } from '@repo/helpers/constants';
import getRandomNumber from '@repo/helpers/random-number';

/* ------------------------------------------------------------------ */
/*  Model listing                                                     */
/* ------------------------------------------------------------------ */

/** A single entry from the `/api/tags` response. */
export interface OllamaTag {
  name: string;
  model: string;
  modified_at: string;
  size: number;
}

interface OllamaTagsResponse {
  models: OllamaTag[];
}

/**
 * Returns the list of models available on the Ollama server.
 * Uses the `/api/tags` endpoint.
 */
export const ollamaListModels = async (
  host: string = ollamaServerURL,
): Promise<OllamaTag[]> => {
  const response = await fetch(`${host}/api/tags`);
  if (!response.ok) {
    throw new Error(`Ollama: failed to list models (${response.status})`);
  }
  const data: OllamaTagsResponse = await response.json();
  return data.models ?? [];
};

/* ------------------------------------------------------------------ */
/*  Streaming chat                                                     */
/* ------------------------------------------------------------------ */

/** A single message passed to the Ollama chat endpoint. */
export interface OllamaChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/** Options for {@link ollamaChatStream}. */
export interface OllamaChatStreamOptions {
  host?: string;
  model: string;
  messages: OllamaChatMessage[];
  temperature?: number;
  /** Called once per streamed token as it arrives. */
  onToken: (token: string) => void;
  /** Optional AbortSignal to cancel the stream mid-flight. */
  signal?: AbortSignal;
}

/**
 * Sends a streaming chat request to `/api/chat` and calls `onToken` for
 * every token received. Returns the full accumulated response text.
 *
 * Uses native `fetch` directly (instead of `http-client`) because the
 * response body must be consumed as a `ReadableStream`.
 */
export const ollamaChatStream = async (
  options: OllamaChatStreamOptions,
): Promise<string> => {
  const {
    host = ollamaServerURL,
    model,
    messages,
    temperature,
    onToken,
    signal,
  } = options;

  const response = await fetch(`${host}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages,
      stream: true,
      ...(temperature !== undefined ? { options: { temperature } } : {}),
    }),
    signal,
  });

  if (!response.ok) {
    throw new Error(`Ollama: ${response.status} ${response.statusText}`);
  }
  if (!response.body) {
    throw new Error('Ollama: response body is empty');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let fullText = '';
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    // Keep the last (potentially incomplete) line in the buffer.
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const json = JSON.parse(trimmed) as {
          message?: { content?: string };
          done?: boolean;
        };
        const token = json.message?.content ?? '';
        if (token) {
          fullText += token;
          onToken(token);
        }
      } catch {
        // Skip lines that are not valid JSON.
      }
    }
  }

  return fullText;
};

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
