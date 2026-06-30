import { useCallback, useEffect, useState } from "react";
import { TvGrid } from "@repo/ui-tv/tv-grid";
import { TvText } from "@repo/ui-tv/tv-typography";
import { getMovies, type Movie } from "@/lib/catalog";
import { TvMovieCard } from "@/components/tv-movie-card";
import { TvPagination } from "@/components/tv-pagination";
import { useT } from "@/i18n/provider";
import "./home.css";

type Status = "loading" | "ready" | "error";

// TEMPORARY diagnostic — transport probes. `no-cors` makes each fetch resolve
// whenever DNS+TCP+TLS succeed (opaque response, CORS irrelevant) and reject
// only on a real transport failure. This separates "emulator can't reach / TLS
// distrust" from "CORS". Compare the three:
//   all ok            -> transport is fine; the catalog failure is CORS/credentials
//   api+google fail   -> Tizen distrusts Google Trust Services (our API's CA)
//   all fail          -> emulator has no network / DNS
// Remove this block (and the probe effect + render) once the cause is found.
const PROBES: { label: string; url: string }[] = [
  {
    label: "api·GTS",
    url: "https://cinelog-api.iguzman.com.mx/api/catalog/movies/?page=1&page_size=1",
  },
  { label: "google·GTS", url: "https://www.gstatic.com/generate_204" },
  { label: "example·DigiCert", url: "https://example.com/" },
];

async function probe(url: string): Promise<string> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    await fetch(url, { mode: "no-cors", signal: ctrl.signal });
    return "ok";
  } catch (e) {
    return e instanceof Error ? e.name : "err";
  } finally {
    clearTimeout(timer);
  }
}

export function Home() {
  const { t } = useT();
  const [page, setPage] = useState(1);
  const [movies, setMovies] = useState<Movie[]>([]);
  const [totalPages, setTotalPages] = useState(1);
  const [status, setStatus] = useState<Status>("loading");
  // TEMPORARY diagnostic: the raw failure reason, surfaced on the error screen
  // so the emulator tells us what actually broke (TLS reject, network/privilege
  // block = "Failed to fetch"/TypeError, vs an HTTP status). Remove once fixed.
  const [debug, setDebug] = useState("");
  // TEMPORARY diagnostic — per-host transport probe results (see PROBES above).
  const [probes, setProbes] = useState("");
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
      .catch((err: unknown) => {
        if (!active) return;
        setDebug(
          `${err instanceof Error ? `${err.name}: ${err.message}` : String(err)} | proto=${window.location.protocol}`,
        );
        setStatus("error");
      });
    return () => {
      active = false;
    };
  }, [page]);

  // TEMPORARY diagnostic — when the catalog fetch fails, probe each host so the
  // error screen shows where the transport breaks. Remove with the PROBES block.
  useEffect(() => {
    if (status !== "error") return;
    let active = true;
    Promise.all(
      PROBES.map(async (p) => `${p.label}=${await probe(p.url)}`),
    ).then((results) => {
      if (active) setProbes(results.join("  "));
    });
    return () => {
      active = false;
    };
  }, [status]);

  return (
    <>
      <div className="home-backdrop" aria-hidden="true">
        {backdrop.prev && (
          <img
            key={`prev-${backdrop.prev}`}
            className="home-backdrop__img"
            src={backdrop.prev}
            alt=""
          />
        )}
        {backdrop.current && (
          <img
            key={backdrop.current}
            className="home-backdrop__img home-backdrop__img--current"
            src={backdrop.current}
            alt=""
          />
        )}
        <div className="home-backdrop__scrim" />
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 40,
          maxWidth: 1825,
        }}
      >
        <TvText variant="hero">{t("homeTitle")}</TvText>

        {status === "loading" && <TvText variant="body">{t("loading")}</TvText>}

        {status === "error" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <TvText variant="body">{t("error")}</TvText>
            {/* The TV app's own origin — this is the value the Django API needs
                in CORS_ALLOWED_ORIGINS for the emulator/device to be allowed. */}
            <TvText variant="body">
              {t("originHint")} {window.location.origin}
            </TvText>
            {/* TEMPORARY diagnostic — raw fetch failure reason. Remove once fixed. */}
            {debug && <TvText variant="body">{debug}</TvText>}
            {/* TEMPORARY diagnostic — per-host transport probe results. */}
            {probes && <TvText variant="body">{probes}</TvText>}
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
