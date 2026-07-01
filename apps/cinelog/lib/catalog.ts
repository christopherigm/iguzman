export interface Category {
  id: number;
  name: string;
  slug: string;
}

export interface Actor {
  id: number;
  name: string;
}

export type MovieFormat = "dvd" | "bluray" | "4k" | "digital" | "other" | "";

/**
 * Canonical disc audio-format codes (the catalog's controlled vocabulary). Used
 * as the button keys in the metadata forms and carried through the API.
 */
export type AudioFormatCode =
  | "atmos"
  | "truehd"
  | "ddplus"
  | "dd"
  | "dtsx"
  | "dtshd"
  | "dts"
  | "lpcm"
  | "other";

/** Canonical disc HDR / dynamic-range codes (controlled vocabulary). */
export type HdrFormatCode =
  | "dolbyvision"
  | "hdr10plus"
  | "hdr10"
  | "hlg"
  | "sdr";

/** One of a movie's barcodes: the release UPC and the format it was pressed in. */
export interface MovieBarcode {
  code: string;
  format: MovieFormat;
}

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
  | "-created"
  | "created";

export interface Movie {
  id: number;
  title: string;
  director: string;
  year: number | null;
  /** Formats this title is available in (union of its barcodes' formats). */
  formats: Exclude<MovieFormat, "">[];
  cover: string;
  genres: Category[];
  /**
   * True when the signed-in user already owns this movie; gates the catalog's
   * "add to library" button. Present everywhere the user can act, including
   * related-movie cards (the cross-user cached block has the requesting user's
   * ownership overlaid per request). Optional only for anonymous browsing.
   */
  owned?: boolean;
  /**
   * The signed-in user's private link to their own digital copy of this title
   * (a YouTube / Prime / etc. URL), or "" when they have none. Per-user and
   * visible only to its owner; gates the digital streaming icon on cards.
   */
  digital_copy_url?: string;
  created: string;
}

export interface MovieDetail extends Movie {
  /** Release UPCs for this title; empty for movies added without a barcode. */
  barcodes: MovieBarcode[];
  cover_url: string;
  /** Stored wallpaper URL for the page background; "" when none was found. */
  backdrop: string;
  tmdb_id: string;
  /** Plot summary; "" when none has been fetched. */
  synopsis: string;
  /** YouTube watch URL for the trailer; "" when none has been fetched. */
  trailer_url: string;
  cast: Actor[];
  /** Disc audio-track formats (controlled-vocab codes); best-effort, may be empty. */
  audio_formats: AudioFormatCode[];
  /** Disc HDR / dynamic-range formats (controlled-vocab codes); may be empty. */
  hdr_formats: HdrFormatCode[];
  /** Languages the disc has audio tracks in (English names); may be empty. */
  spoken_languages: string[];
  /** Languages the disc has subtitle tracks in (English names); may be empty. */
  subtitle_languages: string[];
  /** Up to 6 suggested movies sharing a genre or director. */
  related: Movie[];
  /** True when the signed-in user owns this movie (gates edit/delete in the UI). */
  owned: boolean;
  /**
   * The signed-in user's private digital-copy link, or "" when they have none.
   * Gates the detail page's "stream digital copy" button (per-user, never shared).
   */
  digital_copy_url: string;
  /** True for staff users; gates the "purge" control that hard-deletes the movie. */
  can_purge: boolean;
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
  /**
   * Natural-language AI search query. When set, the catalog is resolved via the
   * AI-search endpoint (semantic match + LLM rerank) and the structured filters
   * below are ignored - AI search is an exclusive mode driven from the navbar.
   */
  ai?: string;
  /** Genre slugs; a movie must match ALL of them (AND semantics). */
  genres?: string[];
  format?: MovieFormat;
  /** Disc audio-format codes; a movie must carry ALL of them (AND semantics). */
  audioFormats?: AudioFormatCode[];
  /** Disc HDR-format codes; a movie must carry ALL of them (AND semantics). */
  hdrFormats?: HdrFormatCode[];
  sort?: MovieSort;
  page?: number;
}

// Categories are bounded (TMDB genres + custom additions), so the genre
// dropdown fetches them in a single page rather than paginating.
const CATEGORY_PAGE_SIZE = 200;

/**
 * Build the API query string for the movies endpoint from catalog filters.
 * Shared by the client `getMovies` fetch and the server-side prefetch in
 * `app/[locale]/page.tsx`, so both hit the API with identical params.
 */
export function buildMovieQuery(filters: MovieFilters = {}): string {
  const params = new URLSearchParams();
  if (filters.search) params.set("search", filters.search);
  // Repeated `genre` params - the API ANDs them (movie must match every slug).
  filters.genres?.forEach((slug) => params.append("genre", slug));
  // Sent as "media_format" - DRF reserves the "format" query param for content negotiation.
  if (filters.format) params.set("media_format", filters.format);
  // Repeated `audio_format` / `hdr_format` params - the API ANDs them (movie
  // must carry every selected code).
  filters.audioFormats?.forEach((code) => params.append("audio_format", code));
  filters.hdrFormats?.forEach((code) => params.append("hdr_format", code));
  if (filters.sort) params.set("ordering", filters.sort);
  if (filters.page && filters.page > 1)
    params.set("page", String(filters.page));
  return params.toString();
}

/**
 * Build the query string for the AI-search endpoint from catalog filters. AI
 * search is an exclusive mode, so only the natural-language query and the page
 * carry over - the structured filters are ignored.
 */
export function buildAiSearchQuery(filters: MovieFilters = {}): string {
  const params = new URLSearchParams();
  if (filters.ai) params.set("q", filters.ai);
  if (filters.page && filters.page > 1)
    params.set("page", String(filters.page));
  return params.toString();
}

export async function getMovies(
  filters: MovieFilters = {},
): Promise<Paginated<Movie>> {
  // AI search is an exclusive mode: hit the semantic endpoint and ignore the
  // structured filters. The response shape matches the regular list, so the
  // grid renders it unchanged.
  if (filters.ai) {
    const qs = buildAiSearchQuery(filters);
    const res = await fetch(`/api/catalog/ai-search${qs ? `?${qs}` : ""}`);
    if (!res.ok) {
      const data: Record<string, unknown> = await res.json().catch(() => ({}));
      throw new ApiError(res.status, data);
    }
    return res.json() as Promise<Paginated<Movie>>;
  }

  const qs = buildMovieQuery(filters);
  const res = await fetch(`/api/catalog/movies${qs ? `?${qs}` : ""}`);
  if (!res.ok) {
    const data: Record<string, unknown> = await res.json().catch(() => ({}));
    throw new ApiError(res.status, data);
  }
  return res.json() as Promise<Paginated<Movie>>;
}

export type CatalogView = "grid" | "list";

/**
 * Catalog state encoded in the page URL's query string: filters, sort, page and
 * view. Keeping it in the URL (rather than sessionStorage) makes a catalog view
 * shareable and bookmarkable and lets the server prefetch the exact grid.
 */
export interface CatalogParams {
  search: string;
  genres: string[];
  format: MovieFormat;
  /** Selected disc audio-format codes (AND-filtered). */
  audioFormats: AudioFormatCode[];
  /** Selected disc HDR-format codes (AND-filtered). */
  hdrFormats: HdrFormatCode[];
  sort: MovieSort;
  page: number;
  view: CatalogView;
}

const VALID_FORMATS: MovieFormat[] = [
  "dvd",
  "bluray",
  "4k",
  "digital",
  "other",
];
const VALID_AUDIO_FORMATS: AudioFormatCode[] = [
  "atmos",
  "truehd",
  "ddplus",
  "dd",
  "dtsx",
  "dtshd",
  "dts",
  "lpcm",
  "other",
];
const VALID_HDR_FORMATS: HdrFormatCode[] = [
  "dolbyvision",
  "hdr10plus",
  "hdr10",
  "hlg",
  "sdr",
];
const VALID_SORTS: MovieSort[] = [
  "title",
  "-title",
  "year",
  "-year",
  "created",
  "-created",
];

/**
 * Parse catalog filters/sort/page/view from a URL query string (friendly param
 * names: `q`, `genre`, `format`, `sort`, `page`, `view`). Used by both the
 * server page (to prefetch) and the client catalog (to seed its initial state),
 * so a shared link reproduces the same grid. Unknown or malformed values fall
 * back to defaults since the query string is user-editable.
 */
export function parseCatalogParams(sp: URLSearchParams): CatalogParams {
  const rawFormat = sp.get("format") ?? "";
  const rawSort = sp.get("sort") ?? "";
  const pageNum = Number.parseInt(sp.get("page") ?? "", 10);
  return {
    search: sp.get("q")?.trim() ?? "",
    genres: sp.getAll("genre"),
    format: (VALID_FORMATS as string[]).includes(rawFormat)
      ? (rawFormat as MovieFormat)
      : "",
    audioFormats: sp
      .getAll("audio")
      .filter((c) =>
        (VALID_AUDIO_FORMATS as string[]).includes(c),
      ) as AudioFormatCode[],
    hdrFormats: sp
      .getAll("hdr")
      .filter((c) =>
        (VALID_HDR_FORMATS as string[]).includes(c),
      ) as HdrFormatCode[],
    sort: (VALID_SORTS as string[]).includes(rawSort)
      ? (rawSort as MovieSort)
      : "",
    page: Number.isFinite(pageNum) && pageNum > 1 ? pageNum : 1,
    view: sp.get("view") === "list" ? "list" : "grid",
  };
}

/**
 * Encode catalog state into a URL query string. Defaults (page 1, grid view,
 * empty filters/sort) are omitted to keep the bare catalog URL clean. Inverse
 * of `parseCatalogParams`.
 */
export function buildCatalogQuery(p: CatalogParams): string {
  const params = new URLSearchParams();
  // Note: AI search is deliberately NOT encoded here - it is a client-only mode
  // (see lib/ai-search.ts) and never appears in the URL. Only the structured
  // filters/sort/page/view are shareable via the query string.
  if (p.search) params.set("q", p.search);
  p.genres.forEach((slug) => params.append("genre", slug));
  if (p.format) params.set("format", p.format);
  p.audioFormats.forEach((code) => params.append("audio", code));
  p.hdrFormats.forEach((code) => params.append("hdr", code));
  if (p.sort) params.set("sort", p.sort);
  if (p.page > 1) params.set("page", String(p.page));
  if (p.view !== "grid") params.set("view", p.view);
  return params.toString();
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
  /** Formats the title is available in (multi-select). */
  formats: Exclude<MovieFormat, "">[];
  /** Full replacement set of the movie's release barcodes. */
  barcodes: MovieBarcode[];
  synopsis: string;
  trailer_url: string;
  /**
   * The user's private digital-copy link, saved onto THEIR ownership (never the
   * shared movie). Sent as "" to clear it; the API leaves it untouched when the
   * key is absent, but the edit form always sends the current value.
   */
  digital_copy_url: string;
  genres: string[];
  cast: string[];
  /** Disc audio-track formats (controlled-vocab codes). */
  audio_formats: AudioFormatCode[];
  /** Disc HDR / dynamic-range formats (controlled-vocab codes). */
  hdr_formats: HdrFormatCode[];
  /** Audio-track languages (English names; unrecognised names are dropped). */
  spoken_languages: string[];
  /** Subtitle-track languages (English names; unrecognised names are dropped). */
  subtitle_languages: string[];
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
  /** Disc audio-track formats (controlled-vocab codes); best-effort, may be empty. */
  audio_formats: AudioFormatCode[];
  /** Disc HDR / dynamic-range formats (controlled-vocab codes); may be empty. */
  hdr_formats: HdrFormatCode[];
  /** Audio-track languages (English names); may be empty. */
  spoken_languages: string[];
  /** Subtitle-track languages (English names); may be empty. */
  subtitle_languages: string[];
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

/**
 * Hard-delete the shared movie from the catalog for everyone (staff only). Unlike
 * `deleteMovie`, which only drops the requesting user's ownership, this removes
 * the Movie row itself. The backend gates the `purge` flag on `is_staff`.
 */
export async function purgeMovie(id: string | number): Promise<void> {
  const res = await fetch(`/api/catalog/movies/${id}?purge=true`, {
    method: "DELETE",
  });
  if (!res.ok) {
    const data: Record<string, unknown> = await res.json().catch(() => ({}));
    throw new ApiError(res.status, data);
  }
}

/**
 * Add an existing catalog movie to the signed-in user's library without a scan,
 * in the chosen `format`. The API records ownership, advertises the format on
 * the title, and links the ownership to that format's existing barcode when the
 * title already carries one. Returns the updated movie detail (now `owned`).
 */
export async function addToLibrary(
  id: string | number,
  format: Exclude<MovieFormat, "">,
  /** Required for the "digital" format: the user's private streaming link. */
  digitalCopyUrl = "",
): Promise<MovieDetail> {
  const res = await fetch(`/api/catalog/movies/${id}/own`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ format, digital_copy_url: digitalCopyUrl }),
  });
  if (!res.ok) {
    const data: Record<string, unknown> = await res.json().catch(() => ({}));
    throw new ApiError(res.status, data);
  }
  return res.json() as Promise<MovieDetail>;
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
