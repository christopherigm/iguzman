"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Box } from "@repo/ui/core-elements/box";
import { Typography } from "@repo/ui/core-elements/typography";
import { Grid } from "@repo/ui/core-elements/grid";
import { Button } from "@repo/ui/core-elements/button";
import { Spinner } from "@repo/ui/core-elements/spinner";
import { ConfirmationModal } from "@repo/ui/core-elements/confirmation-modal";
import { Toast } from "@repo/ui/core-elements/toast";
import {
  deleteMovie,
  getMovies,
  getCategories,
  type Category,
  type Movie,
  type MovieFormat,
} from "@/lib/catalog";
import { useIsLoggedIn } from "@/lib/use-is-logged-in";
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
  genre: string;
  format: MovieFormat;
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

export function MovieCatalog() {
  const t = useTranslations("CatalogPage");
  const isLoggedIn = useIsLoggedIn();
  // Read the persisted snapshot once, on first render, so the state below can
  // be seeded from it without re-parsing sessionStorage on every render.
  const [snapshot] = useState(readSnapshot);
  const [movies, setMovies] = useState<Movie[]>([]);
  const [status, setStatus] = useState<Status>("loading");
  const [view, setView] = useState<ViewMode>(snapshot?.view ?? "grid");
  const [categories, setCategories] = useState<Category[]>([]);

  const [search, setSearch] = useState(snapshot?.search ?? "");
  const [debouncedSearch, setDebouncedSearch] = useState(
    snapshot?.search.trim() ?? "",
  );
  const [genre, setGenre] = useState(snapshot?.genre ?? "");
  const [format, setFormat] = useState<MovieFormat>(snapshot?.format ?? "");
  const [page, setPage] = useState(snapshot?.page ?? 1);
  const [totalPages, setTotalPages] = useState(1);

  const [pendingDelete, setPendingDelete] = useState<Movie | null>(null);
  const [toast, setToast] = useState<{
    text: string;
    variant: "success" | "error";
  } | null>(null);
  const [toastKey, setToastKey] = useState(0);

  function showToast(text: string, variant: "success" | "error") {
    setToast({ text, variant });
    setToastKey((k) => k + 1);
  }

  async function handleConfirmDelete() {
    if (!pendingDelete) return;
    const movie = pendingDelete;
    setPendingDelete(null);
    try {
      await deleteMovie(movie.id);
      setMovies((prev) => prev.filter((m) => m.id !== movie.id));
      showToast(t("deleted"), "success");
    } catch {
      showToast(t("deleteError"), "error");
    }
  }

  const isFiltered = debouncedSearch !== "" || genre !== "" || format !== "";

  const handleSearchChange = (value: string) => {
    setSearch(value);
    setPage(1);
  };

  const handleGenreChange = (value: string) => {
    setGenre(value);
    setPage(1);
  };

  const handleFormatChange = (value: MovieFormat) => {
    setFormat(value);
    setPage(1);
  };

  useEffect(() => {
    getCategories()
      .then(setCategories)
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    const timer = setTimeout(
      () => setDebouncedSearch(search.trim()),
      SEARCH_DEBOUNCE_MS,
    );
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    let active = true;
    getMovies({ search: debouncedSearch, genre, format, page })
      .then((data) => {
        if (!active) return;
        setMovies(data.results);
        setTotalPages(data.total_pages);
        setStatus("ready");
      })
      .catch(() => {
        if (active) setStatus("error");
      });
    return () => {
      active = false;
    };
  }, [debouncedSearch, genre, format, page]);

  // Keep the latest page/filter/view values in a ref so the scroll listener
  // can write a complete snapshot without re-subscribing on every change.
  const persistedRef = useRef({ page, search, genre, format, view });

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
    persistedRef.current = { page, search, genre, format, view };
    persist(window.scrollY);
  }, [page, search, genre, format, view, persist]);

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
      {pendingDelete && (
        <ConfirmationModal
          title={t("confirmDeleteTitle")}
          text={t("confirmDeleteText", { title: pendingDelete.title })}
          okCallback={handleConfirmDelete}
          cancelCallback={() => setPendingDelete(null)}
        />
      )}

      {toast && (
        <Toast
          key={toastKey}
          message={toast.text}
          variant={toast.variant}
          position="top-center"
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
          {t("title")}
        </Typography>
        <Box display="flex" gap={4}>
          <Button
            size="sm"
            aria-pressed={view === "grid"}
            onClick={() => setView("grid")}
            backgroundColor={view === "grid" ? "var(--accent)" : undefined}
            color={
              view === "grid" ? "var(--accent-foreground, #ffffff)" : undefined
            }
          >
            {t("gridView")}
          </Button>
          <Button
            size="sm"
            aria-pressed={view === "list"}
            onClick={() => setView("list")}
            backgroundColor={view === "list" ? "var(--accent)" : undefined}
            color={
              view === "list" ? "var(--accent-foreground, #ffffff)" : undefined
            }
          >
            {t("listView")}
          </Button>
        </Box>
      </Box>

      <MovieFilters
        search={search}
        onSearchChange={handleSearchChange}
        genre={genre}
        onGenreChange={handleGenreChange}
        format={format}
        onFormatChange={handleFormatChange}
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
        <Grid container spacing={2} marginTop={12}>
          {movies.map((movie) => (
            <Grid key={movie.id} size={{ xs: 6, sm: 4, md: 3, lg: 2 }}>
              <MovieCard
                movie={movie}
                view="grid"
                onDelete={isLoggedIn ? setPendingDelete : undefined}
              />
            </Grid>
          ))}
        </Grid>
      )}

      {status === "ready" && movies.length > 0 && view === "list" && (
        <Box flexDirection="column" gap={8} marginTop={12}>
          {movies.map((movie) => (
            <MovieCard
              key={movie.id}
              movie={movie}
              view="list"
              onDelete={isLoggedIn ? setPendingDelete : undefined}
            />
          ))}
        </Box>
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
