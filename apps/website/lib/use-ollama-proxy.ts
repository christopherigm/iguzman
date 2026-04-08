'use client';

import { useRef, useState, useCallback } from 'react';
import { getAccessToken } from '@/lib/auth';
import type { LlmMessage } from '@repo/helpers/llm';

export type { LlmMessage };

const PROXY_BASE = '/api/ollama';

const PREFERRED_MODELS = [
  'gemma4:latest',
  'gemma3:latest',
  'llama3.2:latest',
  'llama3.1:latest',
  'mistral:latest',
  'phi3:latest',
  'phi3.5:latest',
  'qwen2.5:latest',
];

export interface UseOllamaProxyOptions {
  temperature?: number;
  /** Random seed for generation. Defaults to a random integer each call. */
  seed?: number;
  /** When true, the proxy fetches live Tavily web-search results and injects them before calling the model. */
  webSearch?: boolean;
}

export interface UseOllamaProxyReturn {
  streamingText: string;
  isGenerating: boolean;
  error: string | null;
  selectedModel: string | null;
  generate: (messages: LlmMessage[]) => Promise<string>;
  abort: () => void;
  reset: () => void;
}

export function useOllamaProxy(
  options: UseOllamaProxyOptions = {},
): UseOllamaProxyReturn {
  const { temperature, seed: seedOption, webSearch = false } = options;

  const [streamingText, setStreamingText] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState<string | null>(null);

  const resolvedModelRef = useRef<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const authHeaders = useCallback((): Record<string, string> => {
    const token = getAccessToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  }, []);

  const resolveModel = useCallback(async (): Promise<string> => {
    if (resolvedModelRef.current) return resolvedModelRef.current;

    const res = await fetch(`${PROXY_BASE}/api/tags`, {
      headers: authHeaders(),
    });
    if (!res.ok) throw new Error(`Failed to list models (${res.status})`);
    const data = (await res.json()) as { models: { name: string }[] };
    const available = (data.models ?? []).map((m) => m.name);

    const picked =
      PREFERRED_MODELS.find((m) => available.includes(m)) ?? available[0];
    if (!picked) throw new Error('No models available on the Ollama server');

    resolvedModelRef.current = picked;
    setSelectedModel(picked);
    return picked;
  }, [authHeaders]);

  const generate = useCallback(
    async (messages: LlmMessage[]): Promise<string> => {
      if (isGenerating)
        throw new Error('Already generating — call abort() first');

      setError(null);
      setStreamingText('');
      setIsGenerating(true);

      const controller = new AbortController();
      abortControllerRef.current = controller;

      try {
        const model = await resolveModel();
        const seed = seedOption ?? Math.floor(Math.random() * 9999) + 1;

        const res = await fetch(`${PROXY_BASE}/api/chat`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...authHeaders(),
          },
          body: JSON.stringify({
            model,
            messages,
            stream: true,
            keep_alive: -1,
            ...(webSearch ? { webSearch: true } : {}),
            options: {
              seed,
              ...(temperature !== undefined ? { temperature } : {}),
            },
          }),
          signal: controller.signal,
        });

        if (!res.ok)
          throw new Error(`Ollama proxy: ${res.status} ${res.statusText}`);
        if (!res.body) throw new Error('Ollama proxy: empty response body');

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let fullText = '';
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            try {
              const json = JSON.parse(trimmed) as {
                message?: { content?: string };
              };
              const token = json.message?.content ?? '';
              if (token) {
                fullText += token;
                setStreamingText((prev) => prev + token);
              }
            } catch {
              // skip non-JSON lines
            }
          }
        }

        return fullText;
      } catch (err) {
        if (
          err instanceof Error &&
          (err.name === 'AbortError' || err.message === 'AbortError')
        ) {
          return '';
        }
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg);
        throw err;
      } finally {
        setIsGenerating(false);
        abortControllerRef.current = null;
      }
    },
    [
      isGenerating,
      resolveModel,
      authHeaders,
      temperature,
      seedOption,
      webSearch,
    ],
  );

  const abort = useCallback((): void => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setIsGenerating(false);
    setStreamingText('');
  }, []);

  const reset = useCallback((): void => {
    setStreamingText('');
  }, []);

  return {
    streamingText,
    isGenerating,
    error,
    selectedModel,
    generate,
    abort,
    reset,
  };
}
