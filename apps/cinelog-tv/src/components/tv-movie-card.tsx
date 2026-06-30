import { Focusable } from "@repo/ui-tv/focusable";
import { TvImage } from "@repo/ui-tv/tv-image";
import type { Movie } from "@/lib/catalog";
import { useT } from "@/i18n/provider";
import { TvFormatHeader } from "./tv-format-header";
import "./tv-movie-card.css";

/**
 * 10-foot adaptation of apps/cinelog's MovieCard (grid view). D-pad-focusable;
 * the cover comes from the API as an absolute URL and is rendered through
 * `TvImage` so it shows on old Tizen browsers (no `aspect-ratio` support).
 * Pressing Enter on a focused card fires `onSelect` (the home screen routes to
 * the detail page). The "add to library" control is intentionally omitted.
 */
export function TvMovieCard({
  movie,
  onSelect,
}: {
  movie: Movie;
  onSelect?: (movie: Movie) => void;
}) {
  const { t } = useT();

  return (
    <Focusable
      className="tv-movie-card"
      onEnterPress={onSelect ? () => onSelect(movie) : undefined}
    >
      <div className="tv-movie-card__cover">
        <TvFormatHeader
          formats={movie.formats}
          showDigital={!!movie.digital_copy_url}
        />
        <TvImage src={movie.cover} ratio={2 / 3} placeholder={t("noCover")} />
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
