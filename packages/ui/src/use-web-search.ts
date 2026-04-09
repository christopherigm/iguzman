'use client';

import { useState, useCallback } from 'react';

export interface WebSearchResult {
  title: string;
  url: string;
  content: string;
  score?: number;
}

export type WebSearchDepth = 'basic' | 'advanced';

export interface UseWebSearchOptions {
  /** Path to the app's web-search proxy route. Defaults to '/api/web-search'. */
  proxyBase?: string;
  /** Returns auth headers to attach to every proxy request. */
  getAuthHeaders?: () => Record<string, string>;
  /** Maximum number of results to return. Defaults to 5. */
  maxResults?: number;
  /** Search depth — 'basic' costs 1 credit, 'advanced' costs 2. Defaults to 'basic'. */
  searchDepth?: WebSearchDepth;
}

export interface UseWebSearchReturn {
  results: WebSearchResult[];
  isSearching: boolean;
  error: string | null;
  search: (query: string) => Promise<WebSearchResult[]>;
  reset: () => void;
}

export function useWebSearch(options: UseWebSearchOptions = {}): UseWebSearchReturn {
  const {
    proxyBase = '/api/web-search',
    getAuthHeaders,
    maxResults = 5,
    searchDepth = 'basic',
  } = options;

  const [results, setResults] = useState<WebSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const search = useCallback(
    async (query: string): Promise<WebSearchResult[]> => {
      if (!query.trim()) return [];

      setError(null);
      setResults([]);
      setIsSearching(true);

      try {
        const authHeaders = getAuthHeaders?.() ?? {};

        const res = await fetch(proxyBase, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...authHeaders,
          },
          body: JSON.stringify({ query, maxResults, searchDepth }),
        });

        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { detail?: string };
          throw new Error(body.detail ?? `Web search proxy: ${res.status} ${res.statusText}`);
        }

        const data = (await res.json()) as { results: WebSearchResult[] };
        const found = data.results ?? [];
        setResults(found);
        return found;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg);
        throw err;
      } finally {
        setIsSearching(false);
      }
    },
    [proxyBase, getAuthHeaders, maxResults, searchDepth],
  );

  const reset = useCallback((): void => {
    setResults([]);
    setError(null);
  }, []);

  return { results, isSearching, error, search, reset };
}
