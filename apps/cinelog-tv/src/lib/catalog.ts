// Minimal catalog client for the TV app. Mirrors the shapes the cinelog web app
// reads from the Django API (apps/cinelog-api), trimmed to what the 10-foot grid
// renders: cover, title, year and the physical/digital formats. The TV is paired
// to a user (see lib/auth), so it requests `?scope=library` with the session's
// access token to render only that user's owned movies.

import { API_URL } from "./config";
import { getAccessToken, refreshSession } from "./auth";

export type MovieFormat = "dvd" | "bluray" | "4k" | "digital" | "other";

export interface Movie {
  id: number;
  title: string;
  director: string;
  year: number | null;
  /** Formats this title is available in (union of its barcodes' formats). */
  formats: MovieFormat[];
  /** Absolute cover URL (R2 CDN or API-served); "" when the title has no poster. */
  cover: string;
  /** Absolute wide backdrop URL; "" when the title has no backdrop. */
  backdrop: string;
  /**
   * The paired user's private link to their own digital copy; "" when they
   * have none. Per-user (not part of the shared `formats`), so it gates the
   * card's digital icon rather than appearing as a format. Returned by the
   * `?scope=library` list because the request is authenticated as that user.
   */
  digital_copy_url: string;
}

export interface Actor {
  id: number;
  name: string;
}

export interface Genre {
  id: number;
  name: string;
  slug: string;
}

/**
 * One movie's full record, mirroring the web app's MovieDetail (the fields
 * `MovieDetailSerializer` returns from `apps/cinelog-api`), trimmed to what the
 * 10-foot detail screen renders. `audio_formats` / `hdr_formats` are canonical
 * codes (label lookups live in the screen); the language lists are English names.
 */
export interface MovieDetail extends Movie {
  synopsis: string;
  /** YouTube watch URL for the trailer; "" when none has been fetched. */
  trailer_url: string;
  cast: Actor[];
  genres: Genre[];
  audio_formats: string[];
  hdr_formats: string[];
  spoken_languages: string[];
  subtitle_languages: string[];
}

export interface Paginated<T> {
  count: number;
  total_pages: number;
  page: number;
  page_size: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

// One page fills exactly two rows of the 8-column grid. Posters are tall, so a
// third row would bleed past the TV safe zone and push pagination off-screen.
const PAGE_SIZE = 16;

/** Raised when the session is no longer valid (refresh failed) - the UI re-pairs. */
export class UnauthorizedError extends Error {
  constructor() {
    super("TV session is no longer valid");
  }
}

/** Raised when a requested movie does not exist (404) - the detail screen says so. */
export class NotFoundError extends Error {
  constructor() {
    super("Movie not found");
  }
}

/**
 * Fetch one page of the signed-in user's library (two grid rows per page),
 * optionally narrowed to movies tagged with ALL of `genres` (genre slugs - the
 * API's `?genre=` repeats with AND semantics). Attaches the session access
 * token; on a 401 it refreshes once and retries, and throws `UnauthorizedError`
 * when the session can't be recovered.
 */
export async function getMovies(
  page = 1,
  genres: string[] = [],
): Promise<Paginated<Movie>> {
  const params = new URLSearchParams({
    scope: "library",
    page: String(page),
    page_size: String(PAGE_SIZE),
  });
  // `genre` repeats once per selected slug (AND across the m2m on the server).
  for (const slug of genres) params.append("genre", slug);
  const url = `${API_URL}/api/catalog/movies/?${params.toString()}`;

  const request = (token: string | null): Promise<Response> =>
    fetch(url, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });

  let res = await request(getAccessToken());
  if (res.status === 401) {
    const refreshed = await refreshSession();
    if (!refreshed) throw new UnauthorizedError();
    res = await request(refreshed);
    if (res.status === 401) throw new UnauthorizedError();
  }
  if (!res.ok) throw new Error(`getMovies failed: ${res.status}`);
  return res.json() as Promise<Paginated<Movie>>;
}

/**
 * Run the AI natural-language search over the paired user's library. Hits the
 * catalog's `movies/ai-search/` endpoint (semantic retrieval + LLM rerank) with
 * `?scope=library` so only the user's own movies are ranked, and returns the
 * same paginated `Movie` shape as `getMovies` (the grid renders it unchanged).
 * Same session handling: attaches the access token, refreshes once on a 401 and
 * retries, and throws `UnauthorizedError` when the session can't be recovered.
 */
export async function aiSearchMovies(
  query: string,
  page = 1,
): Promise<Paginated<Movie>> {
  const params = new URLSearchParams({
    scope: "library",
    q: query,
    page: String(page),
    page_size: String(PAGE_SIZE),
  });
  const url = `${API_URL}/api/catalog/movies/ai-search/?${params.toString()}`;

  const request = (token: string | null): Promise<Response> =>
    fetch(url, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });

  let res = await request(getAccessToken());
  if (res.status === 401) {
    const refreshed = await refreshSession();
    if (!refreshed) throw new UnauthorizedError();
    res = await request(refreshed);
    if (res.status === 401) throw new UnauthorizedError();
  }
  if (!res.ok) throw new Error(`aiSearchMovies failed: ${res.status}`);
  return res.json() as Promise<Paginated<Movie>>;
}

/**
 * Fetch the full list of catalog genres (categories) for the filter modal. The
 * API paginates categories but the page size (50) comfortably exceeds the genre
 * count, so the first page is the whole set. Same session handling as
 * `getMovies`: attaches the access token, refreshes once on a 401 and retries.
 */
export async function getGenres(): Promise<Genre[]> {
  const url = `${API_URL}/api/catalog/categories/`;

  const request = (token: string | null): Promise<Response> =>
    fetch(url, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });

  let res = await request(getAccessToken());
  if (res.status === 401) {
    const refreshed = await refreshSession();
    if (!refreshed) throw new UnauthorizedError();
    res = await request(refreshed);
    if (res.status === 401) throw new UnauthorizedError();
  }
  if (!res.ok) throw new Error(`getGenres failed: ${res.status}`);
  const data = (await res.json()) as Paginated<Genre>;
  return data.results;
}

/**
 * Fetch one movie's full detail for the detail screen. Same session handling as
 * `getMovies`: attaches the access token, refreshes once on a 401 and retries,
 * and throws `UnauthorizedError` when the session can't be recovered.
 */
export async function getMovie(id: number | string): Promise<MovieDetail> {
  const url = `${API_URL}/api/catalog/movies/${id}/`;

  const request = (token: string | null): Promise<Response> =>
    fetch(url, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });

  let res = await request(getAccessToken());
  if (res.status === 401) {
    const refreshed = await refreshSession();
    if (!refreshed) throw new UnauthorizedError();
    res = await request(refreshed);
    if (res.status === 401) throw new UnauthorizedError();
  }
  if (res.status === 404) throw new NotFoundError();
  if (!res.ok) throw new Error(`getMovie failed: ${res.status}`);
  return res.json() as Promise<MovieDetail>;
}
