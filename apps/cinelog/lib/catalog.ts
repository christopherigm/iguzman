export interface Category {
  id: number;
  name: string;
  slug: string;
}

export interface Actor {
  id: number;
  name: string;
}

export type MovieFormat = "dvd" | "bluray" | "4k" | "other" | "";

/**
 * Catalog sort key. Sent to the API as the `ordering` query param; the values
 * mirror Django ORM ordering expressions (a `-` prefix means descending). The
 * empty string means "no explicit sort" - the API falls back to its default
 * ordering (by title).
 */
export type MovieSort =
  | ""
  | "title"
  | "-title"
  | "-year"
  | "year"
  | "format"
  | "-created"
  | "created";

export interface Movie {
  id: number;
  barcode: string;
  title: string;
  director: string;
  year: number | null;
  format: MovieFormat;
  cover: string;
  genres: Category[];
  created: string;
}

export interface MovieDetail extends Movie {
  cover_url: string;
  /** Stored wallpaper URL for the page background; "" when none was found. */
  backdrop: string;
  tmdb_id: string;
  /** Plot summary; "" when none has been fetched. */
  synopsis: string;
  /** YouTube watch URL for the trailer; "" when none has been fetched. */
  trailer_url: string;
  cast: Actor[];
  modified: string;
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly data: Record<string, unknown>,
  ) {
    super("API request failed");
  }
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

export interface MovieFilters {
  search?: string;
  /** Genre slugs; a movie must match ALL of them (AND semantics). */
  genres?: string[];
  format?: MovieFormat;
  sort?: MovieSort;
  page?: number;
}

// Categories are bounded (TMDB genres + custom additions), so the genre
// dropdown fetches them in a single page rather than paginating.
const CATEGORY_PAGE_SIZE = 200;

export async function getMovies(
  filters: MovieFilters = {},
): Promise<Paginated<Movie>> {
  const params = new URLSearchParams();
  if (filters.search) params.set("search", filters.search);
  // Repeated `genre` params — the API ANDs them (movie must match every slug).
  filters.genres?.forEach((slug) => params.append("genre", slug));
  // Sent as "media_format" - DRF reserves the "format" query param for content negotiation.
  if (filters.format) params.set("media_format", filters.format);
  if (filters.sort) params.set("ordering", filters.sort);
  if (filters.page && filters.page > 1)
    params.set("page", String(filters.page));
  const qs = params.toString();

  const res = await fetch(`/api/catalog/movies${qs ? `?${qs}` : ""}`);
  if (!res.ok) {
    const data: Record<string, unknown> = await res.json().catch(() => ({}));
    throw new ApiError(res.status, data);
  }
  return res.json() as Promise<Paginated<Movie>>;
}

export async function getMovie(id: string | number): Promise<MovieDetail> {
  const res = await fetch(`/api/catalog/movies/${id}`);
  if (!res.ok) {
    const data: Record<string, unknown> = await res.json().catch(() => ({}));
    throw new ApiError(res.status, data);
  }
  return res.json() as Promise<MovieDetail>;
}

/** Editable fields the user can correct on a saved movie from the detail page. */
export interface MovieUpdatePayload {
  title: string;
  director: string;
  year: number | null;
  format: MovieFormat;
  synopsis: string;
  trailer_url: string;
  genres: string[];
  cast: string[];
  /** Sent only when saving a re-fetch: new poster URL for the matched version. */
  cover_url?: string;
  /** Sent only when saving a re-fetch: source URL to re-download the wallpaper. */
  backdrop_url?: string;
  /** Sent only when saving a re-fetch: TMDB id of the matched version. */
  tmdb_id?: string;
}

/**
 * Metadata resolved by a preview re-fetch. Mirrors the editable fields plus the
 * media the user can choose to keep (poster, wallpaper source, tmdb_id). Nothing
 * is persisted until the user saves; the scraper fallback may leave cast,
 * genres, and the image URLs empty.
 */
export interface MovieRefetchPreview {
  title: string;
  director: string;
  year: number | null;
  genres: string[];
  cast: string[];
  synopsis: string;
  trailer_url: string;
  cover_url: string;
  backdrop_url: string;
  tmdb_id: string;
}

/**
 * Re-resolve a movie's metadata from TMDB (year-aware) with a scraper/LLM
 * fallback, using the user-corrected `title` and `year` to pin the right
 * version. The API returns the resolved fields as a preview WITHOUT saving;
 * the caller applies them to the form and the user saves or discards. Throws
 * ApiError when nothing could be found.
 */
export async function refetchMovie(
  id: string | number,
  title: string,
  year: number | null,
): Promise<MovieRefetchPreview> {
  const res = await fetch(`/api/catalog/movies/${id}/refetch`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title, year }),
  });
  if (!res.ok) {
    const data: Record<string, unknown> = await res.json().catch(() => ({}));
    throw new ApiError(res.status, data);
  }
  return res.json() as Promise<MovieRefetchPreview>;
}

export async function updateMovie(
  id: string | number,
  payload: MovieUpdatePayload,
): Promise<MovieDetail> {
  const res = await fetch(`/api/catalog/movies/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const data: Record<string, unknown> = await res.json().catch(() => ({}));
    throw new ApiError(res.status, data);
  }
  return res.json() as Promise<MovieDetail>;
}

/**
 * Backfill a wallpaper for an existing movie that has none. The API resolves a
 * TMDB/web backdrop synchronously and returns the updated movie detail (with
 * `backdrop` now populated). Throws ApiError when no image could be found.
 */
export async function fetchBackdrop(id: string | number): Promise<MovieDetail> {
  const res = await fetch(`/api/catalog/movies/${id}/backdrop`, {
    method: "POST",
  });
  if (!res.ok) {
    const data: Record<string, unknown> = await res.json().catch(() => ({}));
    throw new ApiError(res.status, data);
  }
  return res.json() as Promise<MovieDetail>;
}

/**
 * Fetch and store a plot synopsis for a movie on demand. The API resolves it
 * from TMDB (with a scraper/LLM fallback) and returns the updated movie detail
 * with `synopsis` populated. Throws ApiError when none could be found.
 */
export async function fetchSynopsis(id: string | number): Promise<MovieDetail> {
  const res = await fetch(`/api/catalog/movies/${id}/synopsis`, {
    method: "POST",
  });
  if (!res.ok) {
    const data: Record<string, unknown> = await res.json().catch(() => ({}));
    throw new ApiError(res.status, data);
  }
  return res.json() as Promise<MovieDetail>;
}

/**
 * Fetch and store a YouTube trailer URL for a movie on demand. The API resolves
 * it from TMDB videos (with a web-search fallback) and returns the updated
 * movie detail with `trailer_url` populated. Throws ApiError when none found.
 */
export async function fetchTrailer(id: string | number): Promise<MovieDetail> {
  const res = await fetch(`/api/catalog/movies/${id}/trailer`, {
    method: "POST",
  });
  if (!res.ok) {
    const data: Record<string, unknown> = await res.json().catch(() => ({}));
    throw new ApiError(res.status, data);
  }
  return res.json() as Promise<MovieDetail>;
}

export async function deleteMovie(id: string | number): Promise<void> {
  const res = await fetch(`/api/catalog/movies/${id}`, { method: "DELETE" });
  if (!res.ok) {
    const data: Record<string, unknown> = await res.json().catch(() => ({}));
    throw new ApiError(res.status, data);
  }
}

export async function getCategories(): Promise<Category[]> {
  const res = await fetch(
    `/api/catalog/categories?page_size=${CATEGORY_PAGE_SIZE}`,
  );
  if (!res.ok) {
    const data: Record<string, unknown> = await res.json().catch(() => ({}));
    throw new ApiError(res.status, data);
  }
  const data = (await res.json()) as Paginated<Category>;
  return data.results;
}
