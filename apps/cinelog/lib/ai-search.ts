// Client-only coordination for AI (natural-language) search between the global
// navbar and the catalog. Unlike the structured filters, AI search is
// deliberately NOT encoded in the URL - it never round-trips through the server
// prefetch. The navbar requests a query here; the catalog runs it entirely on
// the client via the `/api/catalog/ai-search` route.
//
// Two delivery paths, because the navbar and catalog are separate components:
//   - Same page (catalog already mounted): the event notifies it immediately.
//   - Cross page (navbar navigates home first): the query is stashed and the
//     catalog consumes it on mount.
//
// A third concern is *persistence*: AI search is client-only, so when the user
// opens a movie and hits browser-back the catalog re-mounts and would otherwise
// lose its AI results (the pending-query path is one-shot). We snapshot the
// resolved AI grid into sessionStorage - the same per-tab store the catalog uses
// for scroll - so the exact results are restored instantly on return, with no
// refetch. The snapshot is dropped the moment the user leaves AI mode.

import type { Movie } from "./catalog";

const AI_SEARCH_EVENT = "cinelog:ai-search";

// Per-tab snapshot key (parallels the catalog's "cinelog:catalog-scroll").
const AI_SEARCH_SNAPSHOT_KEY = "cinelog:ai-search";

// A query queued before the catalog was mounted (cross-page navigation). The
// live event path clears it so it is never applied twice.
let pendingQuery: string | null = null;

/** Queue an AI search and notify any mounted catalog to run it. */
export function requestAiSearch(query: string): void {
  pendingQuery = query;
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent<string>(AI_SEARCH_EVENT, { detail: query }));
  }
}

/** Consume a query queued before the catalog mounted, if any. */
export function consumePendingAiSearch(): string | null {
  const q = pendingQuery;
  pendingQuery = null;
  return q;
}

/** Subscribe to live AI-search requests; returns an unsubscribe function. */
export function onAiSearch(handler: (query: string) => void): () => void {
  const listener = (e: Event) => {
    // The live path handled it - drop any queued copy so mount doesn't re-run it.
    pendingQuery = null;
    handler((e as CustomEvent<string>).detail);
  };
  window.addEventListener(AI_SEARCH_EVENT, listener);
  return () => window.removeEventListener(AI_SEARCH_EVENT, listener);
}

/**
 * A persisted snapshot of the active AI-search grid: the query, the current
 * page's resolved movies, and the pagination totals. Enough to re-render the
 * exact view the user left without re-hitting the semantic endpoint.
 */
export interface AiSearchSnapshot {
  query: string;
  page: number;
  totalPages: number;
  totalCount: number;
  movies: Movie[];
}

/** Persist the current AI-search grid so browser-back can restore it verbatim. */
export function saveAiSearchSnapshot(snapshot: AiSearchSnapshot): void {
  try {
    sessionStorage.setItem(AI_SEARCH_SNAPSHOT_KEY, JSON.stringify(snapshot));
  } catch {
    // sessionStorage may be unavailable (private mode / quota) - non-fatal.
  }
}

/** Read a persisted AI-search snapshot, or null when none is stored/valid. */
export function readAiSearchSnapshot(): AiSearchSnapshot | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(AI_SEARCH_SNAPSHOT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AiSearchSnapshot;
    // Guard against a malformed/partial payload - a snapshot without a query or
    // a movies array is meaningless, so treat it as absent.
    if (
      !parsed ||
      typeof parsed.query !== "string" ||
      parsed.query === "" ||
      !Array.isArray(parsed.movies)
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

/** Drop the persisted AI-search snapshot (user left AI mode). */
export function clearAiSearchSnapshot(): void {
  try {
    sessionStorage.removeItem(AI_SEARCH_SNAPSHOT_KEY);
  } catch {
    // Non-fatal: nothing to restore is the desired end state anyway.
  }
}
