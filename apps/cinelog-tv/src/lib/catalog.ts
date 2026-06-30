// Minimal catalog client for the TV app. Mirrors the shapes the cinelog web app
// reads from the Django API (apps/cinelog-api), trimmed to what the 10-foot grid
// renders: cover, title, year and the physical/digital formats. No auth — the TV
// app browses the catalog anonymously (the API allows read-only GET).

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

// The Django catalog API base. Set VITE_API_URL for local dev (e.g.
// http://localhost:8000); falls back to the production host so a packaged .wgt
// works without build-time config.
const API_URL =
  import.meta.env.VITE_API_URL ?? "https://cinelog-api.iguzman.com.mx";

// One page fills exactly two rows of the 8-column grid. Posters are tall, so a
// third row would bleed past the TV safe zone and push pagination off-screen.
const PAGE_SIZE = 16;

/** Fetch one page of the public movie catalog (two grid rows per page). */
export async function getMovies(page = 1): Promise<Paginated<Movie>> {
  const res = await fetch(
    `${API_URL}/api/catalog/movies/?page=${page}&page_size=${PAGE_SIZE}`,
  );
  if (!res.ok) throw new Error(`getMovies failed: ${res.status}`);
  return res.json() as Promise<Paginated<Movie>>;
}
