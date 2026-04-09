'use client';

import { useRef, useState, useCallback } from 'react';
import type { LlmMessage } from '@repo/helpers/llm';

export type { LlmMessage };

export const GROQ_MODELS = [
  'openai/gpt-oss-120b',
  'openai/gpt-oss-20b',
  'llama-3.3-70b-versatile',
  'llama-3.1-8b-instant',
  'llama3-70b-8192',
  'llama3-8b-8192',
  'mixtral-8x7b-32768',
  'gemma2-9b-it',
] as const;

export type GroqModel = (typeof GROQ_MODELS)[number];

export interface UseGroqOptions {
  /** Required — path to your app's Groq proxy route, e.g. '/api/groq' */
  proxyBase: string;
  /** Groq model to use. Defaults to 'llama-3.3-70b-versatile'. */
  model?: string;
  temperature?: number;
  /** Random seed for generation. Defaults to a random integer each call. */
  seed?: number;
  /** When true, the proxy fetches live Tavily web-search results and injects them before calling the model. */
  webSearch?: boolean;
  /** Returns auth headers to attach to every proxy request. */
  getAuthHeaders?: () => Record<string, string>;
}

export interface UseGroqReturn {
  streamingText: string;
  isGenerating: boolean;
  error: string | null;
  selectedModel: string;
  generate: (messages: LlmMessage[]) => Promise<string>;
  abort: () => void;
  reset: () => void;
}

export function useGroqProxy(
  options: Omit<UseGroqOptions, 'proxyBase'> & { proxyBase?: string } = {},
): UseGroqReturn {
  return useGroq({ proxyBase: '/api/groq', ...options });
}

export function useGroq(options: UseGroqOptions): UseGroqReturn {
  const {
    proxyBase,
    model = 'openai/gpt-oss-120b',
    temperature,
    seed: seedOption,
    webSearch = false,
    getAuthHeaders,
  } = options;

  const [streamingText, setStreamingText] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);

  const generate = useCallback(
    async (messages: LlmMessage[]): Promise<string> => {
      if (isGenerating) throw new Error('Already generating — call abort() first');

      setError(null);
      setStreamingText('');
      setIsGenerating(true);

      const controller = new AbortController();
      abortControllerRef.current = controller;

      try {
        const seed = seedOption ?? Math.floor(Math.random() * 9999) + 1;
        const authHeaders = getAuthHeaders?.() ?? {};

        const res = await fetch(`${proxyBase}/chat`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...authHeaders,
          },
          body: JSON.stringify({
            model,
            messages,
            stream: true,
            seed,
            ...(temperature !== undefined ? { temperature } : {}),
            ...(webSearch ? { webSearch: true } : {}),
          }),
          signal: controller.signal,
        });

        if (!res.ok) throw new Error(`Groq proxy: ${res.status} ${res.statusText}`);
        if (!res.body) throw new Error('Groq proxy: empty response body');

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
            if (!trimmed || trimmed === 'data: [DONE]') continue;

            const jsonStr = trimmed.startsWith('data: ')
              ? trimmed.slice(6)
              : trimmed;

            try {
              const json = JSON.parse(jsonStr) as {
                choices?: { delta?: { content?: string } }[];
              };
              const token = json.choices?.[0]?.delta?.content ?? '';
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
    [isGenerating, proxyBase, model, temperature, seedOption, webSearch, getAuthHeaders],
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
    selectedModel: model,
    generate,
    abort,
    reset,
  };
}
