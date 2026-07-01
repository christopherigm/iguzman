import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { setFocus } from "@noriginmedia/norigin-spatial-navigation";
import { TvGrid } from "@repo/ui-tv/tv-grid";
import { TvText } from "@repo/ui-tv/tv-typography";
import { TvButton } from "@repo/ui-tv/tv-button";
import { TvTextInput } from "@repo/ui-tv/tv-text-input";
import { TvProgressBar } from "@repo/ui-tv/tv-progress-bar";
import { TvConfirmationModal } from "@repo/ui-tv/tv-confirmation-modal";
import {
  aiSearchMovies,
  getGenres,
  getMovies,
  UnauthorizedError,
  type Genre,
  type Movie,
} from "@/lib/catalog";
import {
  clearAiSearchSnapshot,
  readAiSearchSnapshot,
  saveAiSearchSnapshot,
} from "@/lib/ai-search";
import { TvMovieCard } from "@/components/tv-movie-card";
import { TvPagination, pageFocusKey } from "@/components/tv-pagination";
import { useT } from "@/i18n/provider";
import "./home.css";

type Status = "loading" | "ready" | "error";

// Focus key for the "Genres" button so the modal can hand focus back to it on
// close (Norigin loses the trapped focus when the dialog unmounts).
const GENRES_BUTTON_KEY = "home-genres-button";
// Focus key for the "AI Search" button - same reason: modal close and the AI
// empty/searching states park focus here.
const AI_SEARCH_BUTTON_KEY = "home-ai-search-button";
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

  // AI natural-language search. `aiQuery !== null` means AI search is the active
  // (exclusive) mode: the grid renders `aiMovies` instead of the genre-filtered
  // library and the genre controls hide. Persisted to localStorage (see
  // lib/ai-search) so the movie-detail round-trip restores it without refetching.
  //
  // The persisted snapshot is read once and seeds the initial state directly
  // (rather than in a mount effect), so returning from a movie detail re-renders
  // the exact AI grid the user left with no second trip to the model.
  const initialAiSnapshot = useMemo(() => readAiSearchSnapshot(), []);
  const [aiQuery, setAiQuery] = useState<string | null>(
    initialAiSnapshot?.query ?? null,
  );
  const [aiMovies, setAiMovies] = useState<Movie[]>(
    initialAiSnapshot?.movies ?? [],
  );
  const [aiPage, setAiPage] = useState(initialAiSnapshot?.page ?? 1);
  const [aiTotalPages, setAiTotalPages] = useState(
    initialAiSnapshot?.totalPages ?? 1,
  );
  const [aiStatus, setAiStatus] = useState<Status>(
    initialAiSnapshot ? "ready" : "loading",
  );
  const [aiModalOpen, setAiModalOpen] = useState(false);
  const [aiDraft, setAiDraft] = useState("");
  // Seeded true when the initial state came from a snapshot, so the fetch effect
  // skips the (now redundant) trip to the model just to reproduce that view.
  const skipAiFetch = useRef(initialAiSnapshot !== null);

  const aiActive = aiQuery !== null;
  // The grid, its status and its paginator switch source based on the mode, so
  // the render below is written once against these `active`/`grid` derivations.
  const gridMovies = aiActive ? aiMovies : movies;
  const gridStatus: Status = aiActive ? aiStatus : status;
  const gridReady = gridStatus === "ready";
  const activePage = aiActive ? aiPage : page;
  const activeTotalPages = aiActive ? aiTotalPages : totalPages;
  const goToPage = aiActive ? setAiPage : setPage;

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
  // below performs it once the active grid has updated.
  // Seeded "first" when a restored snapshot means an AI grid is already on the
  // first render, so its first card claims focus once it paints (the effect
  // below), mirroring the focus reset a fresh search / page turn requests.
  const pendingGridFocus = useRef<"first" | "last" | null>(
    initialAiSnapshot ? "first" : null,
  );
  const requestGridFocusReset = useCallback(
    (target: "first" | "last" = "first") => {
      pendingGridFocus.current = target;
    },
    [],
  );

  // Resolve the AI search whenever the query or its page changes. Skips the one
  // fetch that would merely reproduce a restored snapshot; persists each fresh
  // page so the detail round-trip can restore it.
  useEffect(() => {
    if (aiQuery === null) return;
    if (skipAiFetch.current) {
      skipAiFetch.current = false;
      return;
    }
    let active = true;
    setAiStatus("loading");
    aiSearchMovies(aiQuery, aiPage)
      .then((data) => {
        if (!active) return;
        setAiMovies(data.results);
        setAiTotalPages(data.total_pages);
        setAiStatus("ready");
        saveAiSearchSnapshot({
          query: aiQuery,
          page: aiPage,
          totalPages: data.total_pages,
          movies: data.results,
        });
      })
      .catch((err) => {
        if (!active) return;
        if (err instanceof UnauthorizedError) {
          onSignOut();
          return;
        }
        setAiStatus("error");
      });
    return () => {
      active = false;
    };
  }, [aiQuery, aiPage, onSignOut]);

  // Move focus onto a card once freshly-rendered results arrive - for either
  // mode. Used by a filter change (Apply / Clear, targeting the first card), by
  // turning the page with the D-pad (right off the last card lands on the first
  // card of the next page; left off the first lands on the last of the previous),
  // and by entering / restoring an AI search. The control the user pressed no
  // longer holds focus, so park it deterministically, deferred a frame so the new
  // grid exists in the DOM. Empty results are left to the effect below.
  useEffect(() => {
    if (!gridReady || !pendingGridFocus.current) return;
    const target = pendingGridFocus.current;
    pendingGridFocus.current = null;
    const card =
      target === "last" ? gridMovies[gridMovies.length - 1] : gridMovies[0];
    if (!card) return;
    requestAnimationFrame(() => setFocus(movieFocusKey(card.id)));
  }, [gridReady, gridMovies]);

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

  // Open the AI-search modal, seeded with the active query so re-opening edits it.
  const openAiModal = useCallback(() => {
    setAiDraft(aiQuery ?? "");
    setAiModalOpen(true);
  }, [aiQuery]);

  const closeAiModal = useCallback(() => {
    setAiModalOpen(false);
    requestAnimationFrame(() => setFocus(AI_SEARCH_BUTTON_KEY));
  }, []);

  // Confirm the modal: an empty query is a no-op dismiss. Otherwise enter AI mode
  // from page one and park focus on the AI button while the search runs (the grid
  // claims it once results render, via the pending-focus effect).
  const confirmAiSearch = useCallback(() => {
    const q = aiDraft.trim();
    setAiModalOpen(false);
    if (!q) {
      requestAnimationFrame(() => setFocus(AI_SEARCH_BUTTON_KEY));
      return;
    }
    skipAiFetch.current = false;
    setAiQuery(q);
    setAiPage(1);
    setAiStatus("loading");
    requestGridFocusReset("first");
    requestAnimationFrame(() => setFocus(AI_SEARCH_BUTTON_KEY));
  }, [aiDraft, requestGridFocusReset]);

  // Leave AI mode: drop the snapshot and fall back to the normal library grid,
  // focusing its first card (or the Genres button when empty, via the effect).
  const clearAiSearch = useCallback(() => {
    clearAiSearchSnapshot();
    setAiQuery(null);
    setAiMovies([]);
    setAiPage(1);
    setAiTotalPages(1);
    setAiStatus("loading");
    requestGridFocusReset("first");
  }, [requestGridFocusReset]);

  // Loading / error states render no grid or filters, so park focus on the
  // always-present sign-out button (replaces the old Focusable's focusOnMount).
  // Suppressed during AI mode, which owns focus via its own controls/grid.
  useEffect(() => {
    if (!aiActive && status !== "ready") {
      setFocus(SIGNOUT_BUTTON_KEY);
    }
  }, [status, aiActive]);

  // When the active (filtered or AI) result is empty there's no grid to claim
  // focus, so move it to the mode's entry control - the user's way back to the
  // filters / clearing.
  useEffect(() => {
    if (
      gridReady &&
      gridMovies.length === 0 &&
      !genreModalOpen &&
      !aiModalOpen
    ) {
      setFocus(aiActive ? AI_SEARCH_BUTTON_KEY : GENRES_BUTTON_KEY);
    }
  }, [gridReady, gridMovies.length, genreModalOpen, aiModalOpen, aiActive]);

  // Focusing a numbered page button loads that page immediately; re-focusing the
  // current one is a no-op (no redundant refetch).
  const handlePageFocus = useCallback(
    (next: number) => {
      if (next !== activePage) goToPage(next);
    },
    [activePage, goToPage],
  );

  // Index of the first card in the last grid row - only those cards hand focus
  // down to the paginator (interior rows navigate down within the grid).
  const lastRowStart =
    gridMovies.length > 0
      ? Math.floor((gridMovies.length - 1) / COLUMNS) * COLUMNS
      : 0;
  // Where the paginator sends focus on the Up arrow: the 4th card of the second
  // row, falling back to the first card when the page holds fewer. Resolved to
  // the movie's id-based focus key (keys are per-movie, not per-index).
  const gridReentryKey = movieFocusKey(
    (gridMovies[SECOND_ROW_FOURTH_INDEX] ?? gridMovies[0])?.id ?? 0,
  );

  return (
    <>
      <div className="home-screen">
        <div className="home-header">
          <TvText variant="hero">{t("homeTitle")}</TvText>
          {/* Sign-out, then the filter / search actions, all on the right of the
              header. Genres/Clear only exist in normal mode once the catalog is
              ready; AI search is available whenever there's a catalog to search
              (or already in AI mode, to edit); sign-out is always present and
              parks focus during loading/error (no grid). */}
          <div className="home-actions">
            <TvButton focusKey={SIGNOUT_BUTTON_KEY} onPress={onSignOut}>
              {t("signOut")}
            </TvButton>
            {!aiActive && status === "ready" && (
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
            {(status === "ready" || aiActive) && (
              <TvButton focusKey={AI_SEARCH_BUTTON_KEY} onPress={openAiModal}>
                {t("aiSearch")}
              </TvButton>
            )}
            {aiActive && (
              <TvButton onPress={clearAiSearch}>{t("clearAiSearch")}</TvButton>
            )}
            {/* Search-in-progress banner, pinned to the actions row so it never
                consumes any of the grid / pagination space below. */}
            {aiActive && aiStatus === "loading" && (
              <div className="home-ai-banner">
                <TvProgressBar label={t("aiSearching")} />
                <TvText variant="label">{t("aiSearching")}</TvText>
              </div>
            )}
          </div>
        </div>

        {gridStatus === "loading" && gridMovies.length === 0 && (
          <TvText variant="body">
            {aiActive ? t("aiSearching") : t("loading")}
          </TvText>
        )}

        {gridStatus === "error" &&
          (aiActive ? (
            <TvText variant="body">{t("aiError")}</TvText>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <TvText variant="body">{t("error")}</TvText>
              {/* The TV app's own origin — this is the value the Django API needs
                  in CORS_ALLOWED_ORIGINS for the emulator/device to be allowed. */}
              <TvText variant="body">
                {t("originHint")} {window.location.origin}
              </TvText>
            </div>
          ))}

        {gridStatus === "ready" && gridMovies.length === 0 && (
          <TvText variant="body">
            {aiActive
              ? t("aiEmpty")
              : appliedGenres.length > 0
                ? t("emptyFiltered")
                : t("empty")}
          </TvText>
        )}

        {gridMovies.length > 0 && (
          <>
            <TvGrid focusOnMount className="home-grid">
              {gridMovies.map((movie, index) => (
                <TvMovieCard
                  key={movie.id}
                  movie={movie}
                  focusKey={movieFocusKey(movie.id)}
                  onArrowPress={(direction) => {
                    // Only the last row hands focus down to the paginator (and
                    // only when there is one); interior rows navigate down
                    // normally.
                    if (
                      direction === "down" &&
                      activeTotalPages > 1 &&
                      index >= lastRowStart
                    ) {
                      setFocus(pageFocusKey(activePage));
                      return false;
                    }
                    // Right off the last card in a row (rightmost column, or the
                    // final partial-row card) advances a page (unless already on
                    // the last), landing focus on the next page's first card.
                    if (
                      direction === "right" &&
                      (index === gridMovies.length - 1 ||
                        (index + 1) % COLUMNS === 0) &&
                      activePage < activeTotalPages
                    ) {
                      goToPage(activePage + 1);
                      requestGridFocusReset("first");
                      return false;
                    }
                    // Left off the first card in a row (leftmost column) steps
                    // back a page (unless already on page one), landing focus on
                    // the previous page's last card.
                    if (
                      direction === "left" &&
                      index % COLUMNS === 0 &&
                      activePage > 1
                    ) {
                      goToPage(activePage - 1);
                      requestGridFocusReset("last");
                      return false;
                    }
                    return true;
                  }}
                  onSelect={(m) => navigate(`/movie/${m.id}`)}
                />
              ))}
            </TvGrid>

            <TvPagination
              page={activePage}
              totalPages={activeTotalPages}
              onPageChange={goToPage}
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

      {aiModalOpen && (
        <TvConfirmationModal
          title={t("aiSearchTitle")}
          text={t("aiSearchText")}
          okLabel={t("aiSearchSubmit")}
          cancelLabel={t("cancel")}
          okCallback={confirmAiSearch}
          cancelCallback={closeAiModal}
          okDisabled={aiDraft.trim() === ""}
          panelMaxWidth="900px"
        >
          <TvTextInput
            value={aiDraft}
            onChange={setAiDraft}
            onSubmit={confirmAiSearch}
            ariaLabel={t("aiSearchInputLabel")}
            placeholder={t("aiSearchPlaceholder")}
          />
        </TvConfirmationModal>
      )}
    </>
  );
}
