import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { setFocus } from "@noriginmedia/norigin-spatial-navigation";
import { TvGrid } from "@repo/ui-tv/tv-grid";
import { TvText } from "@repo/ui-tv/tv-typography";
import { TvButton } from "@repo/ui-tv/tv-button";
import { TvConfirmationModal } from "@repo/ui-tv/tv-confirmation-modal";
import {
  getGenres,
  getMovies,
  UnauthorizedError,
  type Genre,
  type Movie,
} from "@/lib/catalog";
import { TvMovieCard } from "@/components/tv-movie-card";
import { TvPagination, pageFocusKey } from "@/components/tv-pagination";
import { useT } from "@/i18n/provider";
import "./home.css";

type Status = "loading" | "ready" | "error";

// Focus key for the "Genres" button so the modal can hand focus back to it on
// close (Norigin loses the trapped focus when the dialog unmounts).
const GENRES_BUTTON_KEY = "home-genres-button";
// Focus key for the sign-out button so loading/error states (which have no grid
// or filters to claim focus) can park focus on it.
const SIGNOUT_BUTTON_KEY = "home-signout-button";

// The grid is a fixed 8-column layout (see tv-grid.css).
const COLUMNS = 8;
// Re-entry target when coming back up from the paginator: the 4th card of the
// second row.
const SECOND_ROW_FOURTH_INDEX = COLUMNS + 3;
// Per-movie focus key. Keyed by the movie's id (NOT its grid index) so a card
// that survives a filter change keeps the same key even when it lands in a
// different cell. Norigin's `useFocusable` registers a node under the focusKey
// it had at mount and never re-registers when the prop changes (its
// addFocusable effect has an empty dependency array), so an index-based key on a
// reordered-but-not-remounted card corrupts the focus registry and D-pad
// navigation starts skipping cards.
const movieFocusKey = (id: number) => `home-movie-${id}`;

export function Home({ onSignOut }: { onSignOut: () => void }) {
  const { t } = useT();
  const navigate = useNavigate();
  // Page lives in the URL so it survives the round-trip to the movie detail:
  // `navigate(-1)` restores the `/?page=N` history entry and the grid reopens
  // on the page the user left from.
  const [searchParams, setSearchParams] = useSearchParams();
  const page = Math.max(1, Number(searchParams.get("page")) || 1);
  const setPage = useCallback(
    (next: number) => {
      // Replace (not push) so paging doesn't stack history entries between the
      // grid and the movie detail - one Home entry that updates in place.
      setSearchParams(
        (prev) => {
          const params = new URLSearchParams(prev);
          if (next <= 1) params.delete("page");
          else params.set("page", String(next));
          return params;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );
  // Applied genre filters also live in the URL (?genre=slug, repeatable) so they
  // survive the round-trip to the movie detail alongside `page`. `getAll` returns
  // a fresh array each render, so derive a stable list keyed by its joined slugs
  // (slugs are lowercase/hyphen, never a comma) for use as an effect dependency.
  const genreKey = searchParams.getAll("genre").join(",");
  const appliedGenres = useMemo(
    () => (genreKey ? genreKey.split(",") : []),
    [genreKey],
  );

  const applyGenres = useCallback(
    (slugs: string[]) => {
      setSearchParams(
        (prev) => {
          const params = new URLSearchParams(prev);
          params.delete("genre");
          for (const slug of slugs) params.append("genre", slug);
          // A filter change re-pages from the top - the old page may not exist.
          params.delete("page");
          return params;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const [movies, setMovies] = useState<Movie[]>([]);
  const [totalPages, setTotalPages] = useState(1);
  const [status, setStatus] = useState<Status>("loading");

  // All catalog genres (for the filter modal), fetched once.
  const [genres, setGenres] = useState<Genre[]>([]);
  // Modal visibility and the in-progress selection while it is open (seeded from
  // the applied filters so re-opening edits the current selection).
  const [genreModalOpen, setGenreModalOpen] = useState(false);
  const [draftGenres, setDraftGenres] = useState<Set<string>>(new Set());

  useEffect(() => {
    let active = true;
    getMovies(page, appliedGenres)
      .then((data) => {
        if (!active) return;
        setMovies(data.results);
        setTotalPages(data.total_pages);
        setStatus("ready");
      })
      .catch((err) => {
        if (!active) return;
        // The session lapsed and couldn't be refreshed - drop back to pairing.
        if (err instanceof UnauthorizedError) {
          onSignOut();
          return;
        }
        setStatus("error");
      });
    return () => {
      active = false;
    };
  }, [page, appliedGenres, onSignOut]);

  // Load the genre list once for the filter modal. A failed/unauthorized load
  // just leaves the modal empty - the movies fetch above owns sign-out.
  useEffect(() => {
    let active = true;
    getGenres()
      .then((data) => {
        if (active) setGenres(data);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  // A filter change (apply / clear) refetches asynchronously, so the fresh grid
  // is NOT in the DOM on the frame the filter is applied - we must wait for the
  // new results to render before moving focus. Flag the reset here; the effect
  // below performs it once `movies` has updated.
  const pendingGridFocusReset = useRef(false);
  const requestGridFocusReset = useCallback(() => {
    pendingGridFocusReset.current = true;
  }, []);

  // Move focus onto the first card once the filtered results have rendered. The
  // control the user pressed (Apply in the modal, or the Clear button, which
  // itself unmounts) no longer holds focus, so park it deterministically on the
  // first card. Deferred a frame so the new grid exists in the DOM. Empty
  // results are left to the effect below, which moves focus to the Genres button
  // (no grid to claim it).
  useEffect(() => {
    if (status !== "ready" || !pendingGridFocusReset.current) return;
    pendingGridFocusReset.current = false;
    const first = movies[0];
    if (!first) return;
    requestAnimationFrame(() => setFocus(movieFocusKey(first.id)));
  }, [status, movies]);

  const openGenreModal = useCallback(() => {
    setDraftGenres(new Set(appliedGenres));
    setGenreModalOpen(true);
  }, [appliedGenres]);

  // Restore focus to the Genres button after the dialog unmounts (one frame
  // later, once Norigin has re-measured without the trapped modal node).
  const closeGenreModal = useCallback(() => {
    setGenreModalOpen(false);
    requestAnimationFrame(() => setFocus(GENRES_BUTTON_KEY));
  }, []);

  const toggleDraftGenre = useCallback((slug: string) => {
    setDraftGenres((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
  }, []);

  // Applying the filters closes the modal and drops focus onto the first card of
  // the fresh result (not back on the Genres button as Cancel does).
  const confirmGenres = useCallback(() => {
    applyGenres([...draftGenres]);
    setGenreModalOpen(false);
    requestGridFocusReset();
  }, [applyGenres, draftGenres, requestGridFocusReset]);

  // Loading / error states render no grid or filters, so park focus on the
  // always-present sign-out button (replaces the old Focusable's focusOnMount).
  useEffect(() => {
    if (status !== "ready") {
      setFocus(SIGNOUT_BUTTON_KEY);
    }
  }, [status]);

  // When the (filtered) result is empty there's no grid to claim focus, so move
  // it to the Genres button - the user's way back to the filters / clearing.
  useEffect(() => {
    if (status === "ready" && movies.length === 0 && !genreModalOpen) {
      setFocus(GENRES_BUTTON_KEY);
    }
  }, [status, movies.length, genreModalOpen]);

  // Focusing a numbered page button loads that page immediately; re-focusing the
  // current one is a no-op (no redundant refetch).
  const handlePageFocus = useCallback(
    (next: number) => {
      if (next !== page) setPage(next);
    },
    [page, setPage],
  );

  // Index of the first card in the last grid row - only those cards hand focus
  // down to the paginator (interior rows navigate down within the grid).
  const lastRowStart =
    movies.length > 0 ? Math.floor((movies.length - 1) / COLUMNS) * COLUMNS : 0;
  // Where the paginator sends focus on the Up arrow: the 4th card of the second
  // row, falling back to the first card when the page holds fewer. Resolved to
  // the movie's id-based focus key (keys are per-movie, not per-index).
  const gridReentryKey = movieFocusKey(
    (movies[SECOND_ROW_FOURTH_INDEX] ?? movies[0])?.id ?? 0,
  );

  return (
    <>
      <div className="home-screen">
        <div className="home-header">
          <TvText variant="hero">{t("homeTitle")}</TvText>
          {/* Sign-out, then the filter actions, all on the right of the header.
              Genres/Clear only exist once the catalog is ready; sign-out is
              always present and parks focus during loading/error (no grid). */}
          <div className="home-actions">
            <TvButton focusKey={SIGNOUT_BUTTON_KEY} onPress={onSignOut}>
              {t("signOut")}
            </TvButton>
            {status === "ready" && (
              <>
                <TvButton focusKey={GENRES_BUTTON_KEY} onPress={openGenreModal}>
                  {t("genres")}
                </TvButton>
                {appliedGenres.length > 0 && (
                  <TvButton
                    onPress={() => {
                      applyGenres([]);
                      requestGridFocusReset();
                    }}
                  >
                    {t("clearFilters")}
                  </TvButton>
                )}
              </>
            )}
          </div>
        </div>

        {status === "loading" && <TvText variant="body">{t("loading")}</TvText>}

        {status === "error" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <TvText variant="body">{t("error")}</TvText>
            {/* The TV app's own origin — this is the value the Django API needs
                in CORS_ALLOWED_ORIGINS for the emulator/device to be allowed. */}
            <TvText variant="body">
              {t("originHint")} {window.location.origin}
            </TvText>
          </div>
        )}

        {status === "ready" && movies.length === 0 && (
          <TvText variant="body">
            {appliedGenres.length > 0 ? t("emptyFiltered") : t("empty")}
          </TvText>
        )}

        {status === "ready" && movies.length > 0 && (
          <>
            <TvGrid focusOnMount className="home-grid">
              {movies.map((movie, index) => (
                <TvMovieCard
                  key={movie.id}
                  movie={movie}
                  focusKey={movieFocusKey(movie.id)}
                  // Only the last row hands focus down to the paginator (and only
                  // when there is one); interior rows navigate down normally.
                  onArrowPress={
                    totalPages > 1 && index >= lastRowStart
                      ? (direction) => {
                          if (direction === "down") {
                            setFocus(pageFocusKey(page));
                            return false;
                          }
                          return true;
                        }
                      : undefined
                  }
                  onSelect={(m) => navigate(`/movie/${m.id}`)}
                />
              ))}
            </TvGrid>

            <TvPagination
              page={page}
              totalPages={totalPages}
              onPageChange={setPage}
              onPageFocus={handlePageFocus}
              focusUpKey={gridReentryKey}
            />
          </>
        )}
      </div>

      {genreModalOpen && (
        <TvConfirmationModal
          title={t("filterGenresTitle")}
          text={t("filterGenresText")}
          okLabel={t("apply")}
          cancelLabel={t("cancel")}
          okCallback={confirmGenres}
          cancelCallback={closeGenreModal}
        >
          <div className="home-genre-options">
            {genres.map((genre) => (
              <TvButton
                key={genre.id}
                kind={draftGenres.has(genre.slug) ? "primary" : undefined}
                scrollOnFocus
                onPress={() => toggleDraftGenre(genre.slug)}
              >
                {genre.name}
              </TvButton>
            ))}
          </div>
        </TvConfirmationModal>
      )}
    </>
  );
}
