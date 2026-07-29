import { unstable_rethrow } from "next/navigation";
import { API_URL } from "./config";
import logger from "./logger";
import type { ImageFit, Kind } from "./catalog";

/**
 * Read access to animals-api's `journal` app.
 *
 * Unlike the catalog lists, `/api/journal/sightings/` **paginates** - the feed
 * grows with every outing - so it answers `{count, limit, offset, results}`
 * rather than a bare array.
 *
 * `no-store` like every other read here - see `lib/catalog.ts` for why Next's
 * data cache is deliberately not used.
 */

/**
 * One row of a sighting's gallery - `journal.SightingMedia`.
 *
 * One model with a `kind` rather than three, because the gallery is a single
 * ordered list the author arranges: an uploaded clip may sit between two photos,
 * and three tables could not share one `sort_order`. `source_url` is the API's
 * own three-way branch already resolved - the one URL to point an `<img>` or a
 * player at, whatever the kind - so nothing here has to re-derive it.
 */
export interface SightingMedia {
  id: number;
  kind: "image" | "video" | "link";
  name: string | null;
  en_name: string | null;
  description: string | null;
  en_description: string | null;
  image: string | null;
  /** An uploaded video file (`kind: 'video'`). */
  file: string | null;
  /** Poster frame for either video kind. */
  poster: string | null;
  /** A YouTube/Vimeo/direct video URL (`kind: 'link'`). */
  url: string | null;
  source_url: string | null;
  duration_seconds: number | null;
  fit: ImageFit | null;
  background_color: string | null;
  sort_order: number;
}

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
  /** An outbound reference for the entry - a checklist, an observation record. */
  href: string | null;

  /** The day of the encounter, `YYYY-MM-DD`. */
  date: string;

  /**
   * The credit line to render under the entry - who was standing there.
   *
   * An **empty string** when there is nobody to credit, which covers both cases
   * and deliberately does not distinguish them here: an entry authored in the CMS
   * that nobody put a name on, and a contribution whose author chose anonymity.
   * The API stores no name at all in the second case rather than storing one and
   * hiding it, because these payloads are cached under a key that does not vary by
   * who is asking (see animals-api's `SightingSerializer`) - so there is nothing
   * in this field to leak, and nothing for the frontend to decide.
   */
  author_name: string;
  /**
   * Whether the contributor asked not to be credited. Renders nothing on the
   * public site - `author_name` is already empty when it is true. It travels so
   * the CMS can tell "chose not to be credited" from "nobody asked", which is what
   * stops a reviewer helpfully filling in a name against the first.
   */
  author_anonymous: boolean;
  /** Whether the entry arrived through the public contribute flow. */
  is_contribution: boolean;
  time: string | null;

  /** The cover photo: the entry's own image, else its first gallery photo. */
  image: string | null;
  /** `object-fit` for `image`; `background_color` is what shows around it. */
  fit: ImageFit | null;
  background_color: string | null;

  species: number;
  species_name: string | null;
  species_en_name: string | null;
  species_slug: string | null;
  species_image: string | null;
  /** The 128 px glyph, never a photograph - what this entry's map pin wears. */
  species_icon: string | null;

  kind: Kind | null;
  category: number | null;
  category_name: string | null;
  category_en_name: string | null;
  category_slug: string | null;
  /** The branch's glyph - the pin's fallback when the species has none. */
  category_icon: string | null;
  /** The pin's fallback colour when neither of the two has an icon. */
  category_color: string | null;

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

  /**
   * The *effective* coordinates: this entry's own if it recorded any, else its
   * location's centre. Published as JSON numbers rather than DRF's
   * decimal-as-string, so they can go straight into a map embed.
   */
  latitude: number | null;
  longitude: number | null;
  /**
   * True when the place is flagged sensitive and the API blurred the pair to
   * ~1 km before publishing it - enough to say which park, not enough to find
   * the nest. The blurring is unconditional, so this is a caption, not a gate.
   */
  coordinates_are_approximate: boolean;

  /** Decimal-as-string, the DRF default for every decimal but the coordinates. */
  temperature_c: string | null;
  individuals: number | null;
  /** The entry's gallery. Embedded by the serializer on the list *and* detail. */
  media: SightingMedia[];
  media_count: number;
  is_featured: boolean;
}

/**
 * One marker on a map - `/api/journal/sightings/map/`.
 *
 * Deliberately **not** a `Sighting`. A map draws hundreds at once and needs none
 * of the prose, the gallery or the field conditions; what it does need, and the
 * feed has no use for, is `species_icon` - the glyph a marker is drawn as.
 *
 * `latitude`/`longitude` carry the same contract as the feed's: the *effective*
 * pair (the entry's own, else its location's), rounded to ~1 km for every caller
 * when the place is flagged sensitive. The API only ever returns rows that have
 * one, so unlike on a `Sighting` these are never null.
 */
export interface SightingMapPin {
  id: number;
  slug: string;
  name: string | null;
  en_name: string | null;
  date: string;

  species: number;
  species_name: string | null;
  species_en_name: string | null;
  species_slug: string | null;
  /** The 128 px glyph, never a photograph - see the API's serializer. */
  species_icon: string | null;

  kind: Kind | null;
  category: number | null;
  category_name: string | null;
  category_en_name: string | null;
  category_slug: string | null;
  category_icon: string | null;
  /** The marker's fallback colour when neither it nor its species has an icon. */
  category_color: string | null;

  location: number | null;
  location_name: string | null;
  location_en_name: string | null;
  location_slug: string | null;

  latitude: number;
  longitude: number;
  coordinates_are_approximate: boolean;

  /** The entry's cover, for the marker's popup card. */
  image: string | null;
}

/**
 * One already-fetched entry as its own map pin, or `null` when it has no
 * coordinates to pin.
 *
 * What a sighting's **own page** puts on its map. It costs no request: a
 * `Sighting` carries every field a pin does - including the two glyphs and the
 * branch colour, which the API publishes on the detail payload precisely so this
 * conversion is possible (see animals-api's `SightingSerializer`). The map
 * endpoint stays what the *many*-entry maps read.
 *
 * The narrowing is the point of the return type: `latitude`/`longitude` are
 * nullable on a `Sighting` and never null on a pin.
 */
export function sightingMapPin(sighting: Sighting): SightingMapPin | null {
  if (sighting.latitude === null || sighting.longitude === null) return null;
  return {
    id: sighting.id,
    slug: sighting.slug,
    name: sighting.name,
    en_name: sighting.en_name,
    date: sighting.date,
    species: sighting.species,
    species_name: sighting.species_name,
    species_en_name: sighting.species_en_name,
    species_slug: sighting.species_slug,
    species_icon: sighting.species_icon,
    kind: sighting.kind,
    category: sighting.category,
    category_name: sighting.category_name,
    category_en_name: sighting.category_en_name,
    category_slug: sighting.category_slug,
    category_icon: sighting.category_icon,
    category_color: sighting.category_color,
    location: sighting.location,
    location_name: sighting.location_name,
    location_en_name: sighting.location_en_name,
    location_slug: sighting.location_slug,
    latitude: sighting.latitude,
    longitude: sighting.longitude,
    coordinates_are_approximate: sighting.coordinates_are_approximate,
    image: sighting.image,
  };
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
  return fetchSightings(`/api/journal/sightings/?limit=${limit}`);
}

/**
 * The most recent entries filed under one category, newest first.
 *
 * A sighting points at a species, not a category, so the branch is reached
 * through `species__category__slug` - which the API already exposes as
 * `category_slug` (see journal/views.py). Doing it in the query is what keeps
 * the category page from over-fetching the whole feed and filtering it here.
 */
export async function getSightingsByCategory(
  categorySlug: string,
  limit = 8,
): Promise<Sighting[]> {
  return fetchSightings(
    `/api/journal/sightings/?category_slug=${encodeURIComponent(categorySlug)}&limit=${limit}`,
  );
}

/**
 * The most recent entries in one branch, newest first.
 *
 * Two joins away from the entry: a sighting points at a species, a species at a
 * category, and only the category carries `kind` - which is why the API spells
 * this `species__category__kind` and publishes it as `?kind=`. Filtering here
 * instead would mean reading the whole feed to show eight of it.
 */
export async function getSightingsByKind(
  kind: Kind,
  limit = 8,
): Promise<Sighting[]> {
  return fetchSightings(
    `/api/journal/sightings/?kind=${encodeURIComponent(kind)}&limit=${limit}`,
  );
}

/** The most recent entries recording one species, newest first. */
export async function getSightingsBySpecies(
  speciesSlug: string,
  limit = 8,
): Promise<Sighting[]> {
  return fetchSightings(
    `/api/journal/sightings/?species_slug=${encodeURIComponent(speciesSlug)}&limit=${limit}`,
  );
}

/**
 * One journal entry by the slug in its URL, or `null` when nothing answers to
 * it.
 *
 * Deliberately **not** the feed's "swallow everything" contract, for the reason
 * spelled out in `lib/catalog.ts` → `fetchOne`: a list feeds one band of a page
 * that stands without it, but a detail page *is* its subject, and a 500 or a
 * refused connection collapsed into `null` would render "no such entry" for one
 * that exists. Only a real 404 is a real absence, so `notFound()` in the page is
 * trustworthy.
 *
 * A disabled entry 404s here for anyone but an administrator, which is exactly
 * what the public page wants.
 */
export async function getSighting(slug: string): Promise<Sighting | null> {
  const path = `/api/journal/sightings/slug/${encodeURIComponent(slug)}/`;
  const res = await fetch(`${API_URL}${path}`, { cache: "no-store" });

  if (res.status === 404) return null;
  if (!res.ok) {
    logger.error(
      { path, status: res.status },
      "journal API returned non-OK status",
    );
    throw new Error(`Journal request failed: ${path} (${res.status})`);
  }
  return (await res.json()) as Sighting;
}

/**
 * Every place one category has been recorded - the pins for its page's map.
 *
 * Not the same read as `getSightingsByCategory`, and not a bigger `limit` on it
 * either: that answers the six *entries* the band above the map summarises,
 * this answers all of the category's located sightings as stripped-down pins.
 * The API caps it (`MAX_MAP_PINS`), so a well-documented branch cannot turn one
 * page into a full-table serialize.
 */
export async function getCategoryMapPins(
  categorySlug: string,
): Promise<SightingMapPin[]> {
  return fetchMapPins(
    `/api/journal/sightings/map/?category_slug=${encodeURIComponent(categorySlug)}`,
  );
}

/**
 * Every place one branch has been recorded - the pins for its page's map.
 *
 * No `per_category`, deliberately: that exists so the *landing* mixes its five
 * branches evenly, and here every pin is already the one branch - capping each
 * of its categories would only hide entries. The API's `MAX_MAP_PINS` remains
 * the ceiling.
 */
export async function getKindMapPins(kind: Kind): Promise<SightingMapPin[]> {
  return fetchMapPins(
    `/api/journal/sightings/map/?kind=${encodeURIComponent(kind)}`,
  );
}

/**
 * The latest `perCategory` located entries of **each** category - the landing
 * map's pins.
 *
 * Per category rather than the newest N overall, because the landing mixes every
 * branch: taking the newest twenty outright would show nothing but birds the
 * week somebody spent birdwatching.
 */
export async function getLatestMapPins(
  perCategory = 10,
): Promise<SightingMapPin[]> {
  return fetchMapPins(
    `/api/journal/sightings/map/?per_category=${perCategory}`,
  );
}

/** GET a set of map pins, answering `[]` rather than throwing. */
async function fetchMapPins(path: string): Promise<SightingMapPin[]> {
  try {
    const res = await fetch(`${API_URL}${path}`, { cache: "no-store" });
    if (!res.ok) {
      logger.warn(
        { path, status: res.status },
        "journal API returned non-OK status",
      );
      return [];
    }
    // A bare list, not a page: a map has no "next page", it has a bounding box.
    return (await res.json()) as SightingMapPin[];
  } catch (err) {
    unstable_rethrow(err);
    logger.error({ path, err }, "Failed to fetch the map pins");
    return [];
  }
}

/** GET one page of the sighting feed, answering `[]` rather than throwing. */
async function fetchSightings(path: string): Promise<Sighting[]> {
  try {
    const res = await fetch(`${API_URL}${path}`, { cache: "no-store" });
    if (!res.ok) {
      logger.warn(
        { path, status: res.status },
        "journal API returned non-OK status",
      );
      return [];
    }
    const page = (await res.json()) as Paginated<Sighting>;
    return page.results ?? [];
  } catch (err) {
    // See the matching note in lib/catalog.ts - Next's own control-flow errors
    // must not be swallowed by this catch.
    unstable_rethrow(err);
    logger.error({ path, err }, "Failed to fetch the journal feed");
    return [];
  }
}
