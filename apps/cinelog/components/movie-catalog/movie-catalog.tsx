"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Box } from "@repo/ui/core-elements/box";
import { Typography } from "@repo/ui/core-elements/typography";
import { Grid } from "@repo/ui/core-elements/grid";
import { IconButton } from "@repo/ui/core-elements/icon-button";
import { Spinner } from "@repo/ui/core-elements/spinner";
import {
  getMovies,
  getCategories,
  type Category,
  type Movie,
  type MovieFormat,
  type MovieSort,
  type Paginated,
} from "@/lib/catalog";
import { MovieCard } from "./movie-card";
import { MovieFilters } from "./movie-filters";
import { MoviePagination } from "./movie-pagination";

type ViewMode = "grid" | "list";
type Status = "loading" | "ready" | "error";

const SEARCH_DEBOUNCE_MS = 300;

// Persist the catalog's page, filters, view and scroll position for the
// lifetime of the tab so that returning from a movie's detail page (the
// "Back to catalog" / home link remounts this component) lands the user back
// on the exact page and scroll offset they left from. Page state is stored
// together with its filters because a page number is only meaningful relative
// to the filters that produced it.
const STORAGE_KEY = "cinelog:catalog-state";
const SCROLL_PERSIST_MS = 150;

type CatalogSnapshot = {
  page: number;
  search: string;
  genres: string[];
  format: MovieFormat;
  sort: MovieSort;
  view: ViewMode;
  scrollY: number;
};

function readSnapshot(): CatalogSnapshot | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as CatalogSnapshot) : null;
  } catch {
    return null;
  }
}

// The server prefetch always represents the default view: first page, no search,
// genre, format or sort. We can only seed the grid from it when the restored
// snapshot also points at that default view; otherwise the snapshot's page/
// filters drive a normal client fetch.
function isDefaultView(s: CatalogSnapshot | null): boolean {
  if (!s) return true;
  return (
    s.page === 1 &&
    s.search.trim() === "" &&
    (s.genres ?? []).length === 0 &&
    s.format === "" &&
    s.sort === ""
  );
}

export function MovieCatalog({
  initialMovies = null,
  initialCategories = null,
}: {
  /** Server-prefetched first page (default filters); seeds the first paint. */
  initialMovies?: Paginated<Movie> | null;
  /** Server-prefetched genre list; skips the client categories fetch. */
  initialCategories?: Category[] | null;
} = {}) {
  const t = useTranslations("CatalogPage");
  // Read the persisted snapshot once, on first render, so the state below can
  // be seeded from it without re-parsing sessionStorage on every render.
  const [snapshot] = useState(readSnapshot);
  // Use the server-prefetched movies only when the restored view is the default
  // one they represent; otherwise fall through to a client fetch.
  const seedFromPrefetch = initialMovies !== null && isDefaultView(snapshot);
  const [movies, setMovies] = useState<Movie[]>(
    seedFromPrefetch ? initialMovies.results : [],
  );
  const [status, setStatus] = useState<Status>(
    seedFromPrefetch ? "ready" : "loading",
  );
  const [view, setView] = useState<ViewMode>(snapshot?.view ?? "grid");
  const [categories, setCategories] = useState<Category[]>(
    initialCategories ?? [],
  );

  const [search, setSearch] = useState(snapshot?.search ?? "");
  const [debouncedSearch, setDebouncedSearch] = useState(
    snapshot?.search.trim() ?? "",
  );
  const [genres, setGenres] = useState<string[]>(snapshot?.genres ?? []);
  const [format, setFormat] = useState<MovieFormat>(snapshot?.format ?? "");
  const [sort, setSort] = useState<MovieSort>(snapshot?.sort ?? "");
  const [page, setPage] = useState(snapshot?.page ?? 1);
  const [totalPages, setTotalPages] = useState(
    seedFromPrefetch ? initialMovies.total_pages : 1,
  );
  const [totalCount, setTotalCount] = useState(
    seedFromPrefetch ? initialMovies.count : 0,
  );
  // Skip the first client fetch when the grid was seeded from the server, the
  // same way the detail page short-circuits its mount fetch on prefetched data.
  const skipInitialFetch = useRef(seedFromPrefetch);

  const isFiltered =
    debouncedSearch !== "" || genres.length > 0 || format !== "";

  const handleSearchChange = (value: string) => {
    setSearch(value);
    setPage(1);
  };

  // Toggle a genre slug in/out of the AND-filtered selection.
  const handleGenreToggle = (slug: string) => {
    setGenres((prev) =>
      prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug],
    );
    setPage(1);
  };

  const handleFormatChange = (value: MovieFormat) => {
    setFormat(value);
    setPage(1);
  };

  const handleSortChange = (value: MovieSort) => {
    setSort(value);
    setPage(1);
  };

  useEffect(() => {
    // Already seeded from the server prefetch — no client round-trip needed.
    if (initialCategories) return;
    getCategories()
      .then(setCategories)
      .catch(() => undefined);
  }, [initialCategories]);

  useEffect(() => {
    const timer = setTimeout(
      () => setDebouncedSearch(search.trim()),
      SEARCH_DEBOUNCE_MS,
    );
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    // First run after a server-seeded mount: the grid already holds the default
    // page, so skip the redundant fetch (subsequent filter/page changes fetch).
    if (skipInitialFetch.current) {
      skipInitialFetch.current = false;
      return;
    }
    let active = true;
    getMovies({ search: debouncedSearch, genres, format, sort, page })
      .then((data) => {
        if (!active) return;
        setMovies(data.results);
        setTotalPages(data.total_pages);
        setTotalCount(data.count);
        setStatus("ready");
      })
      .catch(() => {
        if (active) setStatus("error");
      });
    return () => {
      active = false;
    };
  }, [debouncedSearch, genres, format, sort, page]);

  // Keep the latest page/filter/view values in a ref so the scroll listener
  // can write a complete snapshot without re-subscribing on every change.
  const persistedRef = useRef({ page, search, genres, format, sort, view });

  const persist = useCallback((scrollY: number) => {
    try {
      sessionStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ ...persistedRef.current, scrollY }),
      );
    } catch {
      // sessionStorage may be unavailable (private mode / quota) — non-fatal.
    }
  }, []);

  // Sync the ref and persist immediately whenever the page, filters or view
  // change so the snapshot is current even if the user leaves without scrolling.
  useEffect(() => {
    persistedRef.current = { page, search, genres, format, sort, view };
    persist(window.scrollY);
  }, [page, search, genres, format, sort, view, persist]);

  // Throttle scroll writes so the latest offset is captured before navigation.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const onScroll = () => {
      if (timer) return;
      timer = setTimeout(() => {
        timer = null;
        persist(window.scrollY);
      }, SCROLL_PERSIST_MS);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (timer) clearTimeout(timer);
    };
  }, [persist]);

  // Restore the saved scroll offset once, after the first batch of movies has
  // rendered (the grid reserves height via aspect-ratio, so layout is stable).
  const didRestoreScroll = useRef(false);
  useEffect(() => {
    if (status !== "ready" || didRestoreScroll.current) return;
    didRestoreScroll.current = true;
    if (snapshot && snapshot.scrollY > 0) {
      window.scrollTo(0, snapshot.scrollY);
    }
  }, [status, snapshot]);

  return (
    <Box flexDirection="column" gap={16} paddingY={16}>
      <Box
        display="flex"
        alignItems="center"
        justifyContent="space-between"
        flexWrap="wrap"
        gap={8}
        marginBottom={16}
      >
        <Typography as="h1" variant="h2" fontWeight={700}>
          {status === "ready" ? `${t("title")} (${totalCount})` : t("title")}
        </Typography>
        <IconButton
          icon={view === "grid" ? "/icons/list.svg" : "/icons/grid.svg"}
          aria-label={view === "grid" ? t("listView") : t("gridView")}
          onClick={() => setView(view === "grid" ? "list" : "grid")}
          size="sm"
        />
      </Box>

      <MovieFilters
        search={search}
        onSearchChange={handleSearchChange}
        selectedGenres={genres}
        onGenreToggle={handleGenreToggle}
        format={format}
        onFormatChange={handleFormatChange}
        sort={sort}
        onSortChange={handleSortChange}
        categories={categories}
      />

      {status === "loading" && (
        <Box display="flex" justifyContent="center" paddingY={40}>
          <Spinner label={t("loading")} />
        </Box>
      )}

      {status === "error" && (
        <Typography variant="body" role="alert" textAlign="center">
          {t("error")}
        </Typography>
      )}

      {status === "ready" && movies.length === 0 && (
        <Typography variant="body" textAlign="center" styles={{ opacity: 0.6 }}>
          {isFiltered ? t("noResults") : t("empty")}
        </Typography>
      )}

      {status === "ready" && movies.length > 0 && view === "grid" && (
        <Grid container spacing={1} marginTop={12}>
          {movies.map((movie) => (
            <Grid key={movie.id} size={{ xs: 6, sm: 4, md: 3, lg: 2 }}>
              <MovieCard movie={movie} view="grid" />
            </Grid>
          ))}
        </Grid>
      )}

      {status === "ready" && movies.length > 0 && view === "list" && (
        <Grid container flexDirection="column" spacing={1} marginTop={12}>
          {movies.map((movie) => (
            <MovieCard key={movie.id} movie={movie} view="list" />
          ))}
        </Grid>
      )}

      {status === "ready" && movies.length > 0 && (
        <MoviePagination
          page={page}
          totalPages={totalPages}
          onPageChange={setPage}
        />
      )}
    </Box>
  );
}
