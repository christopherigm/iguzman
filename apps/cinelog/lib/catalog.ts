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
  tmdb_id: string;
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
  genre?: string;
  format?: MovieFormat;
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
  if (filters.genre) params.set("genre", filters.genre);
  // Sent as "media_format" - DRF reserves the "format" query param for content negotiation.
  if (filters.format) params.set("media_format", filters.format);
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
