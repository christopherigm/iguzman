// Runtime persistence for the TV's AI (natural-language) search.
//
// The genre filters survive the round-trip to a movie detail because they live
// in the URL. AI search is resolved entirely at runtime (semantic retrieval +
// LLM rerank), so instead we snapshot the resolved grid into localStorage - the
// same store the session JWT uses (see lib/auth) - and restore it verbatim when
// the user comes back from a movie detail, with no second trip to the model. The
// snapshot is dropped the moment the user clears AI search.

import type { Movie } from "./catalog";

const AI_SEARCH_KEY = "cinelog_tv_ai_search";

/**
 * A persisted snapshot of the active AI-search grid: the query, the current
 * page's resolved movies and the pagination total. Enough to re-render the exact
 * view the user left without re-hitting the semantic endpoint.
 */
export interface AiSearchSnapshot {
  query: string;
  page: number;
  totalPages: number;
  movies: Movie[];
}

/** Persist the current AI-search grid so the detail round-trip restores it. */
export function saveAiSearchSnapshot(snapshot: AiSearchSnapshot): void {
  try {
    localStorage.setItem(AI_SEARCH_KEY, JSON.stringify(snapshot));
  } catch {
    // Storage unavailable (private mode / quota): the search simply won't
    // persist across a movie-detail round-trip - non-fatal.
  }
}

/** Read a persisted AI-search snapshot, or null when none is stored/valid. */
export function readAiSearchSnapshot(): AiSearchSnapshot | null {
  try {
    const raw = localStorage.getItem(AI_SEARCH_KEY);
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

/** Drop the persisted AI-search snapshot (user cleared AI search). */
export function clearAiSearchSnapshot(): void {
  try {
    localStorage.removeItem(AI_SEARCH_KEY);
  } catch {
    // Non-fatal: nothing to restore is the desired end state anyway.
  }
}
