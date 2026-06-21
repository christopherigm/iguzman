"use client";

import { useEffect, useState } from "react";
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

export function MovieCatalog() {
  const t = useTranslations("CatalogPage");
  const isLoggedIn = useIsLoggedIn();
  const [movies, setMovies] = useState<Movie[]>([]);
  const [status, setStatus] = useState<Status>("loading");
  const [view, setView] = useState<ViewMode>("grid");
  const [categories, setCategories] = useState<Category[]>([]);

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [genre, setGenre] = useState("");
  const [format, setFormat] = useState<MovieFormat>("");
  const [page, setPage] = useState(1);
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
