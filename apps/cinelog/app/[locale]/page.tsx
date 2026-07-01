import { setRequestLocale } from "next-intl/server";
import { Container } from "@repo/ui/core-elements/container";
import { NavbarSpacer } from "@repo/ui/core-elements/navbar";
import { apiFetch } from "@/lib/api-fetch";
import {
  buildMovieQuery,
  parseCatalogParams,
  type Category,
  type Movie,
  type MovieFilters,
  type Paginated,
} from "@/lib/catalog";
import { MovieCatalog } from "@/components/movie-catalog/movie-catalog";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

// Categories are bounded, so the genre dropdown loads them in a single page.
const CATEGORY_PAGE_SIZE = 200;

/** Convert Next's searchParams object into a URLSearchParams for parsing. */
function toSearchParams(
  sp: Record<string, string | string[] | undefined>,
): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(sp)) {
    if (Array.isArray(value)) value.forEach((v) => params.append(key, v));
    else if (value !== undefined) params.set(key, value);
  }
  return params;
}

/**
 * Prefetch the catalog for the exact view described by the URL (filters, sort,
 * page) on the server so the home page renders the grid on first paint instead
 * of after a client round-trip. The Django endpoint is Redis-backed, so this
 * stays cheap. Returns null on any failure so the client falls back to its own
 * fetch. AI search is intentionally excluded here - it is a client-only mode
 * (see lib/ai-search.ts) and never round-trips through this prefetch.
 */
async function prefetchMovies(
  filters: MovieFilters,
): Promise<Paginated<Movie> | null> {
  try {
    const query = buildMovieQuery(filters);
    const path = `/api/catalog/movies/${query ? `?${query}` : ""}`;
    const res = await apiFetch(path, {
      cache: "no-store",
      allowAnonymous: true,
    });
    if (!res.ok) return null;
    return (await res.json()) as Paginated<Movie>;
  } catch {
    return null;
  }
}

/** Prefetch the genre list for the filter dropdown. Null on any failure. */
async function prefetchCategories(): Promise<Category[] | null> {
  try {
    const res = await apiFetch(
      `/api/catalog/categories/?page_size=${CATEGORY_PAGE_SIZE}`,
      { cache: "no-store", allowAnonymous: true },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as Paginated<Category>;
    return data.results;
  } catch {
    return null;
  }
}

export default async function Home({ params, searchParams }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  const filters = parseCatalogParams(toSearchParams(await searchParams));

  const [initialMovies, initialCategories] = await Promise.all([
    prefetchMovies(filters),
    prefetchCategories(),
  ]);

  return (
    <Container paddingX={12}>
      <NavbarSpacer />
      <MovieCatalog
        initialMovies={initialMovies}
        initialCategories={initialCategories}
      />
    </Container>
  );
}
