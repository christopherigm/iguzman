"use client";

import { useGroq, type UseGroqOptions, type UseGroqReturn } from "./use-groq";
import type { LlmMessage } from "@repo/helpers/llm";

export type { LlmMessage, UseGroqReturn as UseLlmReturn };

export type UseLlmOptions = Partial<
  Pick<UseGroqOptions, "proxyBase" | "temperature" | "seed" | "getAuthHeaders">
>;

/**
 * LLM client for apps whose *backend* owns provider choice.
 *
 * Unlike `useGroq` / `useOllama`, this names no provider: the proxy it points at
 * decides (website-api runs Groq with an OpenRouter fallback). The wire format is
 * OpenAI-shaped SSE either way, so the streaming parser is reused from `useGroq`;
 * the `model` it sends is ignored by such a backend.
 *
 * Defaults to the `/api/ai` proxy route.
 */
export function useLlmProxy(options: UseLlmOptions = {}): UseGroqReturn {
  return useGroq({ proxyBase: "/api/ai", ...options });
}
