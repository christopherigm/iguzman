import { Focusable } from "@repo/ui-tv/focusable";
import type { Movie } from "@/lib/catalog";
import { useT } from "@/i18n/provider";
import { TvFormatHeader } from "./tv-format-header";
import "./tv-movie-card.css";

/**
 * 10-foot adaptation of apps/cinelog's MovieCard (grid view). D-pad-focusable;
 * the cover URL from the API is already absolute, so a plain <img> is used
 * instead of next/image. Detail navigation and the "add to library" control are
 * intentionally omitted for now.
 */
export function TvMovieCard({
  movie,
  onFocus,
}: {
  movie: Movie;
  onFocus?: (movie: Movie) => void;
}) {
  const { t } = useT();

  return (
    <Focusable
      className="tv-movie-card"
      onFocus={onFocus ? () => onFocus(movie) : undefined}
    >
      <div className="tv-movie-card__cover">
        <TvFormatHeader formats={movie.formats} />
        <div className="tv-movie-card__image-wrap">
          {movie.cover ? (
            <img className="tv-movie-card__image" src={movie.cover} alt="" />
          ) : (
            <div className="tv-movie-card__placeholder">{t("noCover")}</div>
          )}
        </div>
      </div>
      <div className="tv-movie-card__meta">
        <span className="tv-movie-card__title">{movie.title}</span>
        {movie.year && (
          <span className="tv-movie-card__year">{movie.year}</span>
        )}
      </div>
    </Focusable>
  );
}
