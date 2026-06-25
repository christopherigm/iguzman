import type { ChartType } from "@repo/ui/core-elements/chart";
import { ApiError } from "./catalog";

/** A single aggregated bucket: a category and how many movies fall in it. */
export interface StatBucket {
  /** Stable code/value (format code, year, genre slug, language code, ...). */
  key: string;
  /** Human-readable display label. */
  label: string;
  count: number;
}

/** Which set of movies the statistics cover. */
export type StatsScope = "catalog" | "library";

/**
 * Aggregated catalog statistics returned by `/api/catalog/stats`. Each dimension
 * is a count breakdown the Statistics page plots; `scope` echoes which set the
 * numbers reflect (the API falls back to `catalog` for anonymous requests).
 */
export interface MovieStats {
  scope: StatsScope;
  total: number;
  formats: StatBucket[];
  years: StatBucket[];
  genres: StatBucket[];
  audio_formats: StatBucket[];
  hdr_formats: StatBucket[];
  spoken_languages: StatBucket[];
  subtitle_languages: StatBucket[];
}

/** The seven plotted dimensions, in display order. */
export const STAT_DIMENSIONS = [
  "formats",
  "years",
  "genres",
  "audio_formats",
  "hdr_formats",
  "spoken_languages",
  "subtitle_languages",
] as const;

export type StatDimension = (typeof STAT_DIMENSIONS)[number];

/**
 * The chart style each dimension defaults to - chosen for what reads most
 * naturally (the per-card picker still lets the user switch):
 * - `years` is a time trend -> line.
 * - `formats` / `genres` answer "what is the collection made of" -> pie.
 * - the disc-spec dimensions are multi-membership coverage (a disc carries
 *   several audio / HDR / language tracks), so a radar shows the spread without
 *   implying a part-to-whole -> radar.
 */
export const STAT_DEFAULT_CHART: Record<StatDimension, ChartType> = {
  formats: "pie",
  years: "line",
  genres: "pie",
  audio_formats: "radar",
  hdr_formats: "radar",
  spoken_languages: "radar",
  subtitle_languages: "radar",
};

export async function getStats(
  scope: StatsScope = "catalog",
): Promise<MovieStats> {
  const res = await fetch(`/api/catalog/stats?scope=${scope}`);
  if (!res.ok) {
    const data: Record<string, unknown> = await res.json().catch(() => ({}));
    throw new ApiError(res.status, data);
  }
  return res.json() as Promise<MovieStats>;
}
