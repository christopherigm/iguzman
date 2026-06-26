"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter, useSearchParams } from "next/navigation";
import { Box } from "@repo/ui/core-elements/box";
import { Typography } from "@repo/ui/core-elements/typography";
import { Grid } from "@repo/ui/core-elements/grid";
import { IconButton } from "@repo/ui/core-elements/icon-button";
import { Spinner } from "@repo/ui/core-elements/spinner";
import {
  getMovies,
  getCategories,
  buildCatalogQuery,
  parseCatalogParams,
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

// The catalog's page, filters, sort and view live in the URL query string so a
// view is shareable/bookmarkable and the server can prefetch the exact grid on
// first paint (see app/[locale]/page.tsx). Only the scroll offset stays in
// sessionStorage - it's per-tab and meaningless in a shared link - and is
// restored when returning to the catalog (e.g. browser-back from a detail page).
const SCROLL_KEY = "cinelog:catalog-scroll";
const SCROLL_PERSIST_MS = 150;

function readScroll(): number {
  if (typeof window === "undefined") return 0;
  try {
    return Number(sessionStorage.getItem(SCROLL_KEY)) || 0;
  } catch {
    return 0;
  }
}

export function MovieCatalog({
  initialMovies = null,
  initialCategories = null,
}: {
  /** Server-prefetched page for the URL's view; seeds the first paint. */
  initialMovies?: Paginated<Movie> | null;
  /** Server-prefetched genre list; skips the client categories fetch. */
  initialCategories?: Category[] | null;
} = {}) {
  const t = useTranslations("CatalogPage");
  const router = useRouter();
  const searchParams = useSearchParams();
  // Filter changes drive a router.replace; the transition keeps the current
  // grid on screen (no spinner flash) until the server returns the new page.
  const [isPending, startTransition] = useTransition();
  // Seed all filter/sort/page/view state from the URL once, on first render.
  // The server prefetched movies for this exact query, so the grid can paint
  // from `initialMovies` without a client round-trip.
  const [initial] = useState(() =>
    parseCatalogParams(new URLSearchParams(searchParams.toString())),
  );
  // The server prefetch now mirrors the URL's view, so any non-null result can
  // seed the grid directly - no "is this the default view?" check needed.
  const seedFromPrefetch = initialMovies !== null;
  const [movies, setMovies] = useState<Movie[]>(
    seedFromPrefetch ? initialMovies.results : [],
  );
  const [status, setStatus] = useState<Status>(
    seedFromPrefetch ? "ready" : "loading",
  );
  const [view, setView] = useState<ViewMode>(initial.view);
  const [categories, setCategories] = useState<Category[]>(
    initialCategories ?? [],
  );

  const [search, setSearch] = useState(initial.search);
  const [debouncedSearch, setDebouncedSearch] = useState(initial.search);
  const [genres, setGenres] = useState<string[]>(initial.genres);
  const [format, setFormat] = useState<MovieFormat>(initial.format);
  const [sort, setSort] = useState<MovieSort>(initial.sort);
  const [page, setPage] = useState(initial.page);
  const [totalPages, setTotalPages] = useState(
    seedFromPrefetch ? initialMovies.total_pages : 1,
  );
  const [totalCount, setTotalCount] = useState(
    seedFromPrefetch ? initialMovies.count : 0,
  );

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
    // Already seeded from the server prefetch - no client round-trip needed.
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

  // The grid is server-driven: a filter change pushes the new query into the URL
  // (effect below), Next re-runs the page's prefetch, and the fresh page arrives
  // as a new `initialMovies` prop. Re-seed from it whenever it changes so the
  // grid follows the URL - including on browser-back from a detail page, where
  // the router restores the filtered URL and the server prefetches that view.
  // Done during render (React's "adjust state on prop change" pattern) rather
  // than in an effect, so the grid updates in the same commit with no extra
  // render and no cascading-setState lint warning.
  const [seededFrom, setSeededFrom] = useState(initialMovies);
  if (initialMovies && initialMovies !== seededFrom) {
    setSeededFrom(initialMovies);
    setMovies(initialMovies.results);
    setTotalPages(initialMovies.total_pages);
    setTotalCount(initialMovies.count);
    setStatus("ready");
  }

  // Fallback for when the server prefetch failed (initialMovies is null): fetch
  // the current view on the client so the catalog still renders. The happy path
  // above is server-driven and never enters this effect. Loading feedback comes
  // from the initial "loading" status (mount) and the router transition's
  // isPending dim (filter changes), so no synchronous setState is needed here.
  useEffect(() => {
    if (initialMovies) return;
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
  }, [initialMovies, debouncedSearch, genres, format, sort, page]);

  // Mirror the current filters/sort/page/view into the URL via the Next router
  // so the view is shareable, survives a refresh, AND is restored on browser
  // back/forward. router.replace (not history.replaceState) registers the
  // filtered URL as the canonical entry, so the App Router re-runs the page's
  // server prefetch for these params instead of replaying a stale cached `/`.
  // Skips when already in sync (mount, back-restore) so it only fires on a real
  // filter change; uses debouncedSearch so typing doesn't churn the URL.
  useEffect(() => {
    const qs = buildCatalogQuery({
      search: debouncedSearch,
      genres,
      format,
      sort,
      page,
      view,
    });
    if (qs === window.location.search.replace(/^\?/, "")) return;
    const url = qs
      ? `${window.location.pathname}?${qs}`
      : window.location.pathname;
    startTransition(() => router.replace(url, { scroll: false }));
  }, [debouncedSearch, genres, format, sort, page, view, router]);

  const persistScroll = useCallback((scrollY: number) => {
    try {
      sessionStorage.setItem(SCROLL_KEY, String(scrollY));
    } catch {
      // sessionStorage may be unavailable (private mode / quota) - non-fatal.
    }
  }, []);

  // Throttle scroll writes so the latest offset is captured before navigation.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const onScroll = () => {
      if (timer) return;
      timer = setTimeout(() => {
        timer = null;
        persistScroll(window.scrollY);
      }, SCROLL_PERSIST_MS);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (timer) clearTimeout(timer);
    };
  }, [persistScroll]);

  // Restore the saved scroll offset once, after the first batch of movies has
  // rendered (the grid reserves height via aspect-ratio, so layout is stable).
  const [initialScroll] = useState(readScroll);
  const didRestoreScroll = useRef(false);
  useEffect(() => {
    if (status !== "ready" || didRestoreScroll.current) return;
    didRestoreScroll.current = true;
    if (initialScroll > 0) window.scrollTo(0, initialScroll);
  }, [status, initialScroll]);

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
        <Grid
          container
          spacing={1}
          marginTop={12}
          styles={{ opacity: isPending ? 0.5 : 1, transition: "opacity 150ms" }}
        >
          {movies.map((movie) => (
            <Grid key={movie.id} size={{ xs: 6, sm: 4, md: 3, lg: 2 }}>
              <MovieCard movie={movie} view="grid" />
            </Grid>
          ))}
        </Grid>
      )}

      {status === "ready" && movies.length > 0 && view === "list" && (
        <Grid
          container
          flexDirection="column"
          spacing={1}
          marginTop={12}
          styles={{ opacity: isPending ? 0.5 : 1, transition: "opacity 150ms" }}
        >
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
