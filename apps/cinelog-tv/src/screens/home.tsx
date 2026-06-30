import { useCallback, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { TvGrid } from "@repo/ui-tv/tv-grid";
import { TvText } from "@repo/ui-tv/tv-typography";
import { TvImage } from "@repo/ui-tv/tv-image";
import { Focusable } from "@repo/ui-tv/focusable";
import { getMovies, UnauthorizedError, type Movie } from "@/lib/catalog";
import { TvMovieCard } from "@/components/tv-movie-card";
import { TvPagination } from "@/components/tv-pagination";
import { useT } from "@/i18n/provider";
import "./home.css";

type Status = "loading" | "ready" | "error";

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
  const [movies, setMovies] = useState<Movie[]>([]);
  const [totalPages, setTotalPages] = useState(1);
  const [status, setStatus] = useState<Status>("loading");
  // Backdrop of the currently-focused card. `prev` keeps the outgoing image
  // rendered beneath the incoming one so they crossfade instead of dipping to
  // black between movies. Held as one object so the swap is atomic.
  const [backdrop, setBackdrop] = useState({ current: "", prev: "" });

  const handleCardFocus = useCallback((movie: Movie) => {
    setBackdrop((b) =>
      movie.backdrop === b.current
        ? b
        : { current: movie.backdrop, prev: b.current },
    );
  }, []);

  useEffect(() => {
    let active = true;
    getMovies(page)
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
  }, [page, onSignOut]);

  return (
    <>
      <div className="home-backdrop" aria-hidden="true">
        {/* TvImage (not a bare <img>) so backdrops render on old Tizen Chromium -
            see @repo/ui-tv tv-image. The wrappers are stacked + crossfaded by
            the `.home-backdrop .tv-image` rules in home.css. */}
        {backdrop.prev && (
          <TvImage
            key={`prev-${backdrop.prev}`}
            src={backdrop.prev}
            fit="cover"
          />
        )}
        {backdrop.current && (
          <TvImage
            key={backdrop.current}
            className="home-backdrop__layer--current"
            src={backdrop.current}
            fit="cover"
          />
        )}
        <div className="home-backdrop__scrim" />
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 18,
          maxWidth: 1825,
        }}
      >
        <div className="home-header">
          <TvText variant="hero">{t("homeTitle")}</TvText>
          {/* Focus the sign-out when there's no grid to claim it (loading,
              error, or an empty library); otherwise the grid takes focus. */}
          <Focusable
            focusOnMount={status !== "ready" || movies.length === 0}
            onEnterPress={onSignOut}
            className="home-signout"
          >
            <TvText variant="body">{t("signOut")}</TvText>
          </Focusable>
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
          <TvText variant="body">{t("empty")}</TvText>
        )}

        {status === "ready" && movies.length > 0 && (
          <>
            <TvGrid focusOnMount>
              {movies.map((movie) => (
                <TvMovieCard
                  key={movie.id}
                  movie={movie}
                  onFocus={handleCardFocus}
                  onSelect={(m) => navigate(`/movie/${m.id}`)}
                />
              ))}
            </TvGrid>

            <TvPagination
              page={page}
              totalPages={totalPages}
              onPageChange={setPage}
            />
          </>
        )}
      </div>
    </>
  );
}
