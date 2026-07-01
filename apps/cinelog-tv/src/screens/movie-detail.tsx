import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Focusable } from "@repo/ui-tv/focusable";
import { TvButton } from "@repo/ui-tv/tv-button";
import { TvText } from "@repo/ui-tv/tv-typography";
import { TvImage } from "@repo/ui-tv/tv-image";
import { TvBadge } from "@repo/ui-tv/tv-badge";
import { TvScrollable } from "@repo/ui-tv/tv-scrollable";
import { onBackButton } from "@repo/ui-tv/remote-keys";
import {
  getMovieBySlug,
  NotFoundError,
  UnauthorizedError,
  type MovieDetail as MovieDetailData,
} from "@/lib/catalog";
import { launchDigitalCopy } from "@/lib/launch-app";
import { useT } from "@/i18n/provider";
import { TvFormatHeader } from "@/components/tv-format-header";
import { TrailerOverlay } from "@/components/trailer-overlay";
import trailerIcon from "@/icons/trailer.svg";
import playStream from "@/icons/play-stream.svg";
import "./movie-detail.css";

type Status = "loading" | "ready" | "not_found" | "error";

// Code -> brand label for the disc tech-spec badges (copied from cinelog's
// tech-spec-buttons.ts; these are untranslated brand names).
const AUDIO_LABELS: Record<string, string> = {
  atmos: "Dolby Atmos",
  truehd: "Dolby TrueHD",
  ddplus: "Dolby Digital Plus",
  dd: "Dolby Digital",
  dtsx: "DTS:X",
  dtshd: "DTS-HD MA",
  dts: "DTS",
  lpcm: "LPCM",
  other: "Other",
};
const HDR_LABELS: Record<string, string> = {
  dolbyvision: "Dolby Vision",
  hdr10plus: "HDR10+",
  hdr10: "HDR10",
  hlg: "HLG",
  sdr: "SDR",
};

/** White-tinted button glyph (the source SVGs are black, so they're masked). */
function ButtonIcon({ src }: { src: string }) {
  return (
    <span
      className="movie-detail__btn-icon"
      // Quote the URL: Vite inlines these SVGs as data URIs whose path data
      // contains commas/parens that break an unquoted url() and drop the mask.
      style={{ "--icon": `url("${src}")` } as CSSProperties}
    />
  );
}

/** Label + comma-joined value block, omitted when there's nothing to show. */
function MetaText({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <div className="movie-detail__meta">
      <TvText variant="label">{label}</TvText>
      <TvText variant="body">{value}</TvText>
    </div>
  );
}

/**
 * 10-foot movie detail. Two columns (smaller left poster, larger right content),
 * modeled on apps/cinelog's MovieDetail but trimmed to read-only metadata plus
 * the Trailer and Digital-copy actions, which deep-link into the matching Tizen
 * app via `launchDigitalCopy`.
 */
export function MovieDetail({ onSignOut }: { onSignOut: () => void }) {
  const { t } = useT();
  const navigate = useNavigate();
  const { slug } = useParams<{ slug: string }>();
  const [movie, setMovie] = useState<MovieDetailData | null>(null);
  // The route guarantees `:slug`; a missing one (a hand-typed hash) starts as
  // not-found so the effect never has to setState synchronously for that case.
  const [status, setStatus] = useState<Status>(() =>
    slug ? "loading" : "not_found",
  );
  const [trailerOpen, setTrailerOpen] = useState(false);
  // A ref lets the single Back listener branch on the open state without
  // re-subscribing every time it toggles.
  const trailerOpenRef = useRef(false);
  // Bumped to remount (and thus re-focus) the action row after the trailer
  // overlay closes - its Close button stole D-pad focus on the way in, and
  // Norigin doesn't restore focus when a focused node unmounts.
  const [actionsKey, setActionsKey] = useState(0);

  const openTrailer = () => {
    trailerOpenRef.current = true;
    setTrailerOpen(true);
  };
  const closeTrailer = useCallback(() => {
    trailerOpenRef.current = false;
    setTrailerOpen(false);
    setActionsKey((k) => k + 1);
  }, []);

  // Remote Back closes the trailer first, then returns to the grid (matching
  // the on-screen Back/Close buttons).
  useEffect(
    () =>
      onBackButton(() => {
        if (trailerOpenRef.current) {
          closeTrailer();
          return;
        }
        navigate(-1);
      }),
    [navigate, closeTrailer],
  );

  useEffect(() => {
    if (!slug) return;
    let active = true;
    getMovieBySlug(slug)
      .then((data) => {
        if (!active) return;
        setMovie(data);
        setStatus("ready");
      })
      .catch((err) => {
        if (!active) return;
        // The session lapsed and couldn't be refreshed - drop back to pairing.
        if (err instanceof UnauthorizedError) {
          onSignOut();
          return;
        }
        setStatus(err instanceof NotFoundError ? "not_found" : "error");
      });
    return () => {
      active = false;
    };
  }, [slug, onSignOut]);

  if (status === "loading") {
    return (
      <Focusable focusOnMount onEnterPress={() => navigate(-1)}>
        <TvText variant="body">{t("loading")}</TvText>
      </Focusable>
    );
  }

  if (status !== "ready" || !movie) {
    return (
      <div className="movie-detail__status">
        <TvText variant="title">
          {status === "not_found" ? t("notFound") : t("error")}
        </TvText>
        <Focusable focusOnMount onEnterPress={() => navigate(-1)} group>
          <TvButton onPress={() => navigate(-1)}>{t("back")}</TvButton>
        </Focusable>
      </div>
    );
  }

  const cast = movie.cast.map((a) => a.name).join(", ");
  const audio = movie.audio_formats
    .map((code) => AUDIO_LABELS[code] ?? code)
    .join(", ");
  const hdr = movie.hdr_formats
    .map((code) => HDR_LABELS[code] ?? code)
    .join(", ");

  return (
    <>
      {movie.backdrop && (
        <div className="movie-detail__backdrop" aria-hidden="true">
          {/* TvImage (not a bare <img>) so the backdrop renders on old Tizen
              Chromium - see @repo/ui-tv tv-image for why. */}
          <TvImage src={movie.backdrop} fit="cover" />
          <div className="movie-detail__scrim" />
        </div>
      )}

      <div className="movie-detail">
        {/* Action row claims D-pad focus on mount; buttons navigate left/right.
            Back sits on the left, the play actions group on the right. */}
        <Focusable
          key={actionsKey}
          group
          focusOnMount
          className="movie-detail__actions"
        >
          <TvButton onPress={() => navigate(-1)}>{t("back")}</TvButton>
          <div className="movie-detail__actions-right">
            {movie.trailer_url && (
              <TvButton kind="error" onPress={openTrailer}>
                <ButtonIcon src={trailerIcon} />
                {t("trailer")}
              </TvButton>
            )}
            {movie.digital_copy_url && (
              <TvButton
                kind="primary"
                onPress={() => launchDigitalCopy(movie.digital_copy_url)}
              >
                <ButtonIcon src={playStream} />
                {t("digitalCopy")}
              </TvButton>
            )}
          </div>
        </Focusable>

        <div className="movie-detail__layout">
          <div className="movie-detail__sidebar">
            <div className="movie-detail__cover">
              <TvFormatHeader
                formats={movie.formats}
                showDigital={!!movie.digital_copy_url}
              />
              <TvImage
                src={movie.cover}
                ratio={2 / 3}
                placeholder={t("noCover")}
              />
            </div>

            <MetaText
              label={t("spokenLanguages")}
              value={movie.spoken_languages.join(", ")}
            />
            <MetaText
              label={t("subtitles")}
              value={movie.subtitle_languages.join(", ")}
            />
          </div>

          {/* The right column can outgrow the screen on text-heavy films, so it
              is a TvScrollable: D-pad Down from the action row enters it and
              scrolls; at the bottom edge focus falls back out. maxHeight is an
              explicit vh-calc (viewport minus overscan + action row) - a
              percentage off this derived-height layout would collapse on old
              Tizen Chromium. */}
          <TvScrollable
            className="movie-detail__content"
            maxHeight="calc(100vh - 220px)"
          >
            <div className="movie-detail__title-row">
              <div className="movie-detail__title-line">
                <TvText variant="hero">{movie.title}</TvText>

                <div className="movie-detail__badges movie-detail__title-badges">
                  {movie.year && (
                    <TvBadge variant="subtle">{String(movie.year)}</TvBadge>
                  )}
                </div>
              </div>

              {movie.director && (
                <TvText variant="body" className="movie-detail__director">
                  {t("director")}: {movie.director}
                </TvText>
              )}
            </div>

            {movie.genres.length > 0 && (
              <div className="movie-detail__meta">
                <div className="movie-detail__badges">
                  {movie.genres.map((genre) => (
                    <TvBadge key={genre.id} variant="outlined">
                      {genre.name}
                    </TvBadge>
                  ))}
                </div>
              </div>
            )}

            {movie.synopsis && (
              <div className="movie-detail__meta">
                <TvText variant="label">{t("synopsis")}</TvText>
                <TvText variant="body" className="movie-detail__synopsis">
                  {movie.synopsis}
                </TvText>
              </div>
            )}

            <MetaText label={t("cast")} value={cast} />
            <MetaText label={t("audio")} value={audio} />
            <MetaText label={t("hdr")} value={hdr} />
          </TvScrollable>
        </div>
      </div>

      {trailerOpen && movie.trailer_url && (
        <TrailerOverlay url={movie.trailer_url} onClose={closeTrailer} />
      )}
    </>
  );
}
