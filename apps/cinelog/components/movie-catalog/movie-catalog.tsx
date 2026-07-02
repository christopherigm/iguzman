"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useTransition,
  type CSSProperties,
} from "react";
import { useTranslations } from "next-intl";
import { useRouter, useSearchParams } from "next/navigation";
import { Box } from "@repo/ui/core-elements/box";
import { Typography } from "@repo/ui/core-elements/typography";
import { Grid } from "@repo/ui/core-elements/grid";
import { Button } from "@repo/ui/core-elements/button";
import { IconButton } from "@repo/ui/core-elements/icon-button";
import { Spinner } from "@repo/ui/core-elements/spinner";
import { ProgressBar } from "@repo/ui/core-elements/progress-bar";
import {
  getMovies,
  getCategories,
  buildCatalogQuery,
  parseCatalogParams,
  type AudioFormatCode,
  type Category,
  type HdrFormatCode,
  type Movie,
  type MovieFormat,
  type MovieSort,
  type Paginated,
} from "@/lib/catalog";
import {
  consumePendingAiSearch,
  onAiSearch,
  readAiSearchSnapshot,
  saveAiSearchSnapshot,
  clearAiSearchSnapshot,
  type AiSearchSnapshot,
} from "@/lib/ai-search";
import { MovieCard } from "./movie-card";
import { MovieFilters } from "./movie-filters";
import { MoviePagination } from "./movie-pagination";
import "./movie-catalog.css";

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
  // Natural-language AI query (requested from the navbar search modal). This is
  // a client-only, exclusive mode: it never touches the URL and, while active,
  // overrides the grid with results from the semantic endpoint. It resets when
  // the user clears it or touches a structured filter. Seeded empty and, if a
  // snapshot was persisted (browser-back from a movie detail), restored in the
  // mount effect below rather than here to avoid a hydration mismatch.
  const [ai, setAi] = useState("");
  // True while an AI search is resolving. Set when a query is requested and
  // cleared once the results arrive, so the AI banner can show a progress bar
  // and disable "clear" until the semantic search returns.
  const [aiLoading, setAiLoading] = useState(false);
  const [genres, setGenres] = useState<string[]>(initial.genres);
  const [format, setFormat] = useState<MovieFormat>(initial.format);
  const [audioFormats, setAudioFormats] = useState<AudioFormatCode[]>(
    initial.audioFormats,
  );
  const [hdrFormats, setHdrFormats] = useState<HdrFormatCode[]>(
    initial.hdrFormats,
  );
  const [sort, setSort] = useState<MovieSort>(initial.sort);
  const [page, setPage] = useState(initial.page);
  const [totalPages, setTotalPages] = useState(
    seedFromPrefetch ? initialMovies.total_pages : 1,
  );
  const [totalCount, setTotalCount] = useState(
    seedFromPrefetch ? initialMovies.count : 0,
  );
  // Tracks the last server-prefetched page so the render-time re-seed below only
  // fires on a real prop change, and so clearing AI can restore it instantly.
  const [seededFrom, setSeededFrom] = useState(initialMovies);
  // Set true when the mount effect restores an AI grid from the persisted
  // snapshot, so the AI-fetch effect skips its first run (the results are
  // already in state - no need to re-hit the semantic endpoint).
  const skipNextAiFetch = useRef(false);
  // Tracks whether AI mode is currently active so we can drop the persisted
  // snapshot on the transition *out* of AI mode (clear button or a structured
  // filter), without also firing on the initial mount where AI was never active.
  const aiActiveRef = useRef(false);

  const isFiltered =
    ai !== "" ||
    debouncedSearch !== "" ||
    genres.length > 0 ||
    format !== "" ||
    audioFormats.length > 0 ||
    hdrFormats.length > 0;

  // AI mode is "in progress" while the client-side semantic fetch is resolving
  // (initial query or AI-mode pagination). Drives the AI banner's progress bar
  // and disables the clear button until results land.
  const aiSearching = ai !== "" && aiLoading;

  const handleSearchChange = (value: string) => {
    setSearch(value);
    setAi("");
    setPage(1);
  };

  // Toggle a genre slug in/out of the AND-filtered selection.
  const handleGenreToggle = (slug: string) => {
    setGenres((prev) =>
      prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug],
    );
    setAi("");
    setPage(1);
  };

  const handleFormatChange = (value: MovieFormat) => {
    setFormat(value);
    setAi("");
    setPage(1);
  };

  // Toggle a disc audio-format code in/out of the AND-filtered selection.
  const handleAudioToggle = (code: AudioFormatCode) => {
    setAudioFormats((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code],
    );
    setAi("");
    setPage(1);
  };

  // Toggle a disc HDR-format code in/out of the AND-filtered selection.
  const handleHdrToggle = (code: HdrFormatCode) => {
    setHdrFormats((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code],
    );
    setAi("");
    setPage(1);
  };

  const handleSortChange = (value: MovieSort) => {
    setSort(value);
    setAi("");
    setPage(1);
  };

  // Page changes: in AI mode, flag the loading state up front (the AI fetch
  // effect below resolves the new page and clears it); in regular mode, the
  // server-driven transition handles feedback.
  const handlePageChange = (nextPage: number) => {
    setPage(nextPage);
    if (ai !== "") setAiLoading(true);
  };

  // Leave AI mode and return to the standard catalog. The structured filters
  // were reset on entering AI, so restoring the last server-prefetched grid
  // (which mirrors the current URL) brings back the regular catalog instantly;
  // if the prefetch had failed, the fallback effect refetches once ai is "".
  const handleClearAi = () => {
    setAi("");
    setAiLoading(false);
    setPage(1);
    if (seededFrom) {
      setMovies(seededFrom.results);
      setTotalPages(seededFrom.total_pages);
      setTotalCount(seededFrom.count);
      setStatus("ready");
    }
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
  if (initialMovies && initialMovies !== seededFrom) {
    setSeededFrom(initialMovies);
    // While AI mode is active it owns the grid (client-fetched), so don't clobber
    // it with a server page - just track the latest so clearing AI can restore it.
    if (ai === "") {
      setMovies(initialMovies.results);
      setTotalPages(initialMovies.total_pages);
      setTotalCount(initialMovies.count);
      setStatus("ready");
    }
  }

  // Adopt an AI search requested from the navbar (client-only - never via the
  // URL). The live event covers the same-page case; a query stashed before this
  // mounted (navbar navigated home from another page) is consumed on mount.
  // Entering AI mode resets the structured filters so clearing it later returns
  // to the full catalog; the fetch itself runs in the dedicated effect below.
  // When no fresh query is pending, restore a persisted AI grid instead (e.g.
  // browser-back from a movie detail) so the results the user left survive the
  // catalog remount - seeding movies directly and flagging the fetch effect to
  // skip, so we render the exact snapshot with no semantic-endpoint round-trip.
  useEffect(() => {
    const run = (query: string) => {
      setAi(query);
      setAiLoading(true);
      setPage(1);
      setSearch("");
      setDebouncedSearch("");
      setGenres([]);
      setFormat("");
      setAudioFormats([]);
      setHdrFormats([]);
      setSort("");
    };
    const restore = (snap: AiSearchSnapshot) => {
      skipNextAiFetch.current = true;
      setAi(snap.query);
      setAiLoading(false);
      setPage(snap.page);
      setMovies(snap.movies);
      setTotalPages(snap.totalPages);
      setTotalCount(snap.totalCount);
      setStatus("ready");
    };
    const pending = consumePendingAiSearch();
    if (pending) {
      run(pending);
    } else {
      const snap = readAiSearchSnapshot();
      if (snap) restore(snap);
    }
    return onAiSearch(run);
  }, []);

  // Resolve AI search entirely on the client (semantic endpoint via the
  // ai-search route). Runs on the initial query and on AI-mode pagination;
  // no-ops outside AI mode, where the grid is server-driven. A restore from the
  // persisted snapshot already put the results in state, so skip that one run to
  // avoid a redundant semantic-endpoint call. Every real fetch re-persists the
  // snapshot so a later browser-back restores this exact page.
  useEffect(() => {
    if (ai === "") return;
    if (skipNextAiFetch.current) {
      skipNextAiFetch.current = false;
      return;
    }
    let active = true;
    getMovies({ ai, page })
      .then((data) => {
        if (!active) return;
        setMovies(data.results);
        setTotalPages(data.total_pages);
        setTotalCount(data.count);
        setStatus("ready");
        saveAiSearchSnapshot({
          query: ai,
          page,
          totalPages: data.total_pages,
          totalCount: data.count,
          movies: data.results,
        });
      })
      .catch(() => {
        if (active) setStatus("error");
      })
      .finally(() => {
        if (active) setAiLoading(false);
      });
    return () => {
      active = false;
    };
  }, [ai, page]);

  // Drop the persisted AI snapshot the moment the user leaves AI mode - whether
  // via the "clear" button or by touching a structured filter (both set `ai` to
  // ""). Otherwise a stale AI grid could resurface on a later browser-back after
  // the user has moved on to the regular catalog. Guarded by a ref so it fires
  // only on the real exit transition, not on the initial mount.
  useEffect(() => {
    if (ai !== "") {
      aiActiveRef.current = true;
    } else if (aiActiveRef.current) {
      aiActiveRef.current = false;
      clearAiSearchSnapshot();
    }
  }, [ai]);

  // Fallback for when the server prefetch failed (initialMovies is null): fetch
  // the current view on the client so the catalog still renders. The happy path
  // above is server-driven and never enters this effect; AI mode has its own
  // fetch effect, so this handles the regular (structured-filter) catalog only.
  // Loading feedback comes from the initial "loading" status (mount) and the
  // router transition's isPending dim (filter changes).
  useEffect(() => {
    if (initialMovies || ai !== "") return;
    let active = true;
    getMovies({
      search: debouncedSearch,
      genres,
      format,
      audioFormats,
      hdrFormats,
      sort,
      page,
    })
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
  }, [
    initialMovies,
    ai,
    debouncedSearch,
    genres,
    format,
    audioFormats,
    hdrFormats,
    sort,
    page,
  ]);

  // Mirror the current filters/sort/page/view into the URL via the Next router
  // so the view is shareable, survives a refresh, AND is restored on browser
  // back/forward. router.replace (not history.replaceState) registers the
  // filtered URL as the canonical entry, so the App Router re-runs the page's
  // server prefetch for these params instead of replaying a stale cached `/`.
  // Skips when already in sync (mount, back-restore) so it only fires on a real
  // filter change; uses debouncedSearch so typing doesn't churn the URL. AI mode
  // is client-only and never encoded, so the URL is left untouched while active.
  useEffect(() => {
    if (ai !== "") return;
    const qs = buildCatalogQuery({
      search: debouncedSearch,
      genres,
      format,
      audioFormats,
      hdrFormats,
      sort,
      page,
      view,
    });
    if (qs === window.location.search.replace(/^\?/, "")) return;
    const url = qs
      ? `${window.location.pathname}?${qs}`
      : window.location.pathname;
    startTransition(() => router.replace(url, { scroll: false }));
  }, [
    debouncedSearch,
    ai,
    genres,
    format,
    audioFormats,
    hdrFormats,
    sort,
    page,
    view,
    router,
  ]);

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

  // A random backdrop from the current grid, shown dimmed and fixed behind the
  // whole page. Re-picked only when the movie list changes reference - which
  // happens exactly when a fresh set of results loads (a page turn, a filter
  // change or an AI search), not on every render - so the background holds
  // steady while the user scrolls a page and swaps when the page does. Movies
  // without a backdrop are skipped; "" (no candidates) hides the layer. The URL
  // rides in as a CSS variable consumed by the `::before` in movie-catalog.css.
  //
  // Held in state and set from an effect (not derived during render) for two
  // reasons: the pick is random (Math.random can't run in render without
  // desyncing every re-render), and deferring it to the client keeps the server
  // from rendering a different random backdrop than the client hydrates - the
  // effect only runs after mount, so SSR emits no backdrop and there's no
  // hydration mismatch.
  const [backdrop, setBackdrop] = useState("");
  useEffect(() => {
    const withBackdrops = movies.filter((m) => m.backdrop);
    if (withBackdrops.length === 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- random, client-only pick (see note above)
      setBackdrop("");
      return;
    }
    const index = Math.floor(Math.random() * withBackdrops.length);
    setBackdrop(withBackdrops[index]?.backdrop ?? "");
  }, [movies]);

  return (
    <Box
      flexDirection="column"
      gap={16}
      paddingTop={16}
      // Small gap to the footer; the pagination now reserves its own height via
      // its placeholder and docks above the footer when the grid ends.
      paddingBottom={24}
    >
      {/* Full-bleed dimmed backdrop fixed behind the whole catalog, rendered
          only when the current grid has a movie with a backdrop. A plain div
          (not a @repo/ui component) owns its full layout in CSS; the dynamic
          image URL rides in as a CSS custom property. */}
      {backdrop && (
        <div
          aria-hidden
          className="movie-catalog__backdrop"
          style={
            { "--backdrop-image": `url("${backdrop}")` } as CSSProperties
          }
        />
      )}
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
        selectedAudio={audioFormats}
        onAudioToggle={handleAudioToggle}
        selectedHdr={hdrFormats}
        onHdrToggle={handleHdrToggle}
        sort={sort}
        onSortChange={handleSortChange}
        categories={categories}
      />

      {ai !== "" && (
        <Box
          flexDirection="column"
          gap={10}
          padding={12}
          borderRadius={10}
          border="1px solid var(--border)"
          backgroundColor="var(--surface-2)"
        >
          <Box
            display="flex"
            alignItems="center"
            justifyContent="space-between"
            flexWrap="wrap"
            gap={8}
          >
            <Typography variant="body">
              {aiSearching ? t("aiSearchLoading") : t("aiSearchActive")}
              <Typography as="span" variant="body" fontWeight={700}>
                {` "${ai}"`}
              </Typography>
            </Typography>
            <Button
              text={t("aiSearchClear")}
              onClick={handleClearAi}
              size="sm"
              disabled={aiSearching}
            />
          </Box>
          {aiSearching && <ProgressBar label={t("aiSearchLoading")} />}
        </Box>
      )}

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
          onPageChange={handlePageChange}
        />
      )}
    </Box>
  );
}
