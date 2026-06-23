import { setRequestLocale } from "next-intl/server";
import { Container } from "@repo/ui/core-elements/container";
import { NavbarSpacer } from "@repo/ui/core-elements/navbar";
import { apiFetch } from "@/lib/api-fetch";
import type { Category, Movie, Paginated } from "@/lib/catalog";
import { MovieCatalog } from "@/components/movie-catalog/movie-catalog";

type Props = { params: Promise<{ locale: string }> };

// Categories are bounded, so the genre dropdown loads them in a single page.
const CATEGORY_PAGE_SIZE = 200;

/**
 * Prefetch the default (unfiltered, first-page) catalog on the server so the
 * home page renders the grid on first paint instead of after a client
 * round-trip. The Django endpoint is Redis-backed, so this stays cheap. Returns
 * null on any failure so the client component falls back to its own fetch.
 */
async function prefetchMovies(): Promise<Paginated<Movie> | null> {
  try {
    const res = await apiFetch("/api/catalog/movies/", {
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

export default async function Home({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  const [initialMovies, initialCategories] = await Promise.all([
    prefetchMovies(),
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
