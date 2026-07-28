import { connection } from 'next/server';
import { unstable_rethrow } from 'next/navigation';
import { API_URL } from './config';
import { cacheOptions } from './fetch-cache';
import logger from './logger';

/**
 * Read access to animals-api's `catalog` app.
 *
 * Every GET here is public and **unauthenticated**, so these use a plain
 * `fetch` rather than `apiFetch` - there is no token to attach and no 401 to
 * refresh past. animals-api is also single-tenant, so unlike website-api's
 * client there is no `X-Website-Host` to send.
 */

/** The five top-level branches. A fixed enum the frontend translates itself. */
export const KINDS = ['animal', 'plant', 'fungus', 'season', 'weather'] as const;

export type Kind = (typeof KINDS)[number];

/** Fields every catalog picture model publishes (see core.models.BasePicture). */
interface CatalogRecord {
  id: number;
  enabled: boolean;
  slug: string;
  /** Spanish. Read it through `localized()`, never directly. */
  name: string | null;
  /** English twin of `name`. */
  en_name: string | null;
  description: string | null;
  en_description: string | null;
  short_description: string | null;
  en_short_description: string | null;
  image: string | null;
  icon: string | null;
  is_featured?: boolean;
  sort_order: number;
}

export interface Category extends CatalogRecord {
  kind: Kind;
  kind_display: string;
  scientific_name: string | null;
  is_featured: boolean;
  species_count: number;
}

export interface Species extends CatalogRecord {
  /** Read through the category - Species has no `kind` column of its own. */
  kind: Kind | null;
  category: number;
  category_name: string | null;
  category_en_name: string | null;
  category_slug: string | null;
  scientific_name: string | null;
  family: string | null;
  is_featured: boolean;
  sighting_count: number;
  last_seen: string | null;
}

/**
 * GET a catalog list, answering `[]` rather than throwing.
 *
 * The landing renders three independent sections; a backend that is down or
 * still migrating should cost one empty section, not the whole page.
 */
async function fetchList<T>(path: string, init: RequestInit): Promise<T[]> {
  try {
    const res = await fetch(`${API_URL}${path}`, init);
    if (!res.ok) {
      logger.warn({ path, status: res.status }, 'catalog API returned non-OK status');
      return [];
    }
    return (await res.json()) as T[];
  } catch (err) {
    // Next signals its own control flow (a `notFound()`, a bail-out of static
    // rendering) by throwing, so a bare catch around a fetch swallows it and
    // the framework silently does the wrong thing. Put those back on the wire
    // before treating anything as a failed request.
    unstable_rethrow(err);
    logger.error({ path, err }, 'Failed to fetch from the catalog API');
    return [];
  }
}

/**
 * Every enabled category, in the API's own order (kind, then sort_order, then
 * name) - which is already the order the landing's grouped icon grid wants.
 */
export async function getCategories(): Promise<Category[]> {
  return fetchList<Category>('/api/catalog/categories/', cacheOptions());
}

/**
 * A random handful of featured species for the landing gallery.
 *
 * The API has no random ordering (and could not usefully have one - its list
 * responses are cached under a key per query, so a "random" list would be
 * frozen for the whole TTL), so the shuffle happens here, over the featured set.
 *
 * `connection()` is what makes that shuffle mean anything: without it the page
 * is prerenderable and `Math.random()` would be called **once, at build time**,
 * baking one ordering into the HTML forever. It stops the prerender at this
 * line so everything below runs per request - which is precisely what it is for
 * (see Next's `connection` reference). Note this is *not* the same as
 * `cache: 'no-store'`: the response itself still comes off the data cache, so
 * a re-shuffle costs no extra round-trip to Django.
 *
 * Species with no `image` are dropped first: a slide in a full-bleed,
 * hero-height gallery is nothing but its photograph.
 */
export async function getFeaturedSpecies(limit = 10): Promise<Species[]> {
  await connection();

  const species = await fetchList<Species>(
    '/api/catalog/species/?featured=true',
    cacheOptions(),
  );

  return shuffle(species.filter((item) => Boolean(item.image))).slice(0, limit);
}

/** Fisher-Yates, so every ordering is equally likely (`sort(() => …)` is not). */
function shuffle<T>(items: T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j] as T, result[i] as T];
  }
  return result;
}
