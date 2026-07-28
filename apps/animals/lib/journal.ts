import { unstable_rethrow } from 'next/navigation';
import { API_URL } from './config';
import { cacheOptions } from './fetch-cache';
import logger from './logger';
import type { Kind } from './catalog';

/**
 * Read access to animals-api's `journal` app.
 *
 * Unlike the catalog lists, `/api/journal/sightings/` **paginates** - the feed
 * grows with every outing - so it answers `{count, limit, offset, results}`
 * rather than a bare array.
 */

export interface Sighting {
  id: number;
  slug: string;
  /** The entry's optional title (Spanish); falls back to the species name. */
  name: string | null;
  en_name: string | null;
  description: string | null;
  en_description: string | null;
  short_description: string | null;
  en_short_description: string | null;

  /** The day of the encounter, `YYYY-MM-DD`. */
  date: string;
  time: string | null;

  /** The cover photo: the entry's own image, else its first gallery photo. */
  image: string | null;

  species: number;
  species_name: string | null;
  species_en_name: string | null;
  species_slug: string | null;
  species_image: string | null;

  kind: Kind | null;
  category: number | null;
  category_name: string | null;
  category_en_name: string | null;
  category_slug: string | null;

  location: number | null;
  location_name: string | null;
  location_en_name: string | null;
  location_slug: string | null;

  season: number | null;
  season_name: string | null;
  season_en_name: string | null;
  season_slug: string | null;

  weather: number | null;
  weather_name: string | null;
  weather_en_name: string | null;
  weather_slug: string | null;

  /** Decimal-as-string, the DRF default for every decimal but the coordinates. */
  temperature_c: string | null;
  individuals: number | null;
  media_count: number;
  is_featured: boolean;
}

interface Paginated<T> {
  count: number;
  limit: number;
  offset: number;
  results: T[];
}

/**
 * The most recent entries, newest first (the model's own `-date, -created`
 * ordering). Answers `[]` rather than throwing, for the same reason the catalog
 * fetchers do: one dead section beats a dead landing page.
 */
export async function getLatestSightings(limit = 8): Promise<Sighting[]> {
  const path = `/api/journal/sightings/?limit=${limit}`;
  try {
    const res = await fetch(`${API_URL}${path}`, cacheOptions());
    if (!res.ok) {
      logger.warn({ path, status: res.status }, 'journal API returned non-OK status');
      return [];
    }
    const page = (await res.json()) as Paginated<Sighting>;
    return page.results ?? [];
  } catch (err) {
    // See the matching note in lib/catalog.ts - Next's own control-flow errors
    // must not be swallowed by this catch.
    unstable_rethrow(err);
    logger.error({ path, err }, 'Failed to fetch the journal feed');
    return [];
  }
}
