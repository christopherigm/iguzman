import { connection } from "next/server";
import { unstable_rethrow } from "next/navigation";
import type { CSSProperties } from "react";
import { API_URL } from "./config";
import logger from "./logger";

/**
 * Read access to animals-api's `catalog` app.
 *
 * Every GET here is public and **unauthenticated**, so these use a plain
 * `fetch` rather than `apiFetch` - there is no token to attach and no 401 to
 * refresh past. animals-api is also single-tenant, so unlike website-api's
 * client there is no `X-Website-Host` to send.
 *
 * **Every read in this app is `no-store`, and none of them may set
 * `next: { revalidate }`.** There is already exactly one cache in front of
 * animals-api - its own response cache, Redis in production - and each Django
 * app's `signals.py` clears the right namespace the moment a row is written, so
 * an author's edit is live on the next request. Next's data cache sits *above*
 * that one and knows nothing about the write: it would keep replaying the
 * payload it already has for the full revalidate window no matter what the CMS
 * just saved. That is what made a colour changed in /admin take five minutes to
 * appear, and it is why the `cacheOptions` helper this module used to import is
 * gone. Cache in Django, never here.
 */

/** The five top-level branches. A fixed enum the frontend translates itself. */
export const KINDS = [
  "animal",
  "plant",
  "fungus",
  "season",
  "weather",
] as const;

export type Kind = (typeof KINDS)[number];

/**
 * The URL segment each branch is published under - `/[locale]/animals`.
 *
 * English and plural, like every other slug in this app: a slug is a stable key,
 * never a translated label (see animals-api's CLAUDE.md → "Bilingual content"),
 * so `/es/animals` is correct and the *page* is what speaks Spanish.
 *
 * A table rather than a `+ 's'` for two reasons: `fungus` pluralises to `fungi`
 * and `weather` does not pluralise at all - and, more importantly, these five
 * strings are URLs. Deriving them would make a rename of the enum value silently
 * break every link to a branch.
 */
export const KIND_SLUGS: Record<Kind, string> = {
  animal: "animals",
  plant: "plants",
  fungus: "fungi",
  season: "seasons",
  weather: "weather",
};

const KIND_BY_SLUG = new Map<string, Kind>(
  KINDS.map((kind) => [KIND_SLUGS[kind], kind]),
);

/**
 * The branch a `/[locale]/[kind]` segment names, or `null` when it names none.
 *
 * `null` is what the branch page turns into a `notFound()`. That matters more
 * here than on the slug routes: `[kind]` is a **top-level** dynamic segment, so
 * it is also what catches every mistyped path under a locale. Next matches the
 * static segments first (`categories`, `species`, `sightings`, `admin`, …), so
 * this only ever sees what nothing else claimed.
 */
export function kindFromSlug(slug: string): Kind | null {
  return KIND_BY_SLUG.get(slug) ?? null;
}

/**
 * Where one branch lives - the destination of a category's eyebrow and crumb.
 *
 * Locale-less, like every href in this app: the locale is prefixed at render
 * time by `@repo/i18n/navigation`'s `Link`, which is what `Box`/`Button`/
 * `Breadcrumbs` render. Interpolating it here is what let a link keep pointing
 * at the locale that was current when the page was built.
 */
export function kindHref(kind: Kind): string {
  return `/${KIND_SLUGS[kind]}`;
}

/**
 * How a record's image should sit in its box - the API's `fit` column, which is
 * `object-fit` by another name (see core.models.FIT_CHOICES).
 */
export type ImageFit = NonNullable<CSSProperties["objectFit"]>;

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
  /** An outbound reference for the record - a field guide, a species page. */
  href: string | null;
  /** `object-fit` for `image`; `background_color` is what shows around it. */
  fit: ImageFit | null;
  background_color: string | null;
  is_featured?: boolean;
  sort_order: number;
}

export interface Category extends CatalogRecord {
  kind: Kind;
  kind_display: string;
  scientific_name: string | null;
  /** The category's own photographs - `catalog.CategoryImage`. */
  images: CatalogImage[];
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
  video_link: string | null;
  /** The species' reference photos, embedded by the serializer. */
  images: CatalogImage[];
  is_featured: boolean;
  sighting_count: number;
  last_seen: string | null;
}

/**
 * One photograph in a record's gallery - a `catalog.GalleryImage` row
 * (`CategoryImage`, `SpeciesImage`, and the three the public site does not read
 * yet). One shape for all of them, because the API declares one.
 *
 * ⚠ **The first row is the record's main image.** The API publishes `image` as
 * the record's own column if it has one and otherwise `images[0]`, so a strip
 * built from this list normally *contains the cover* and must not show it twice -
 * see the `seen` set in `toGalleryImages` on each detail page.
 *
 * Photos of one particular *encounter* belong to that sighting instead, and live
 * in `lib/journal.ts`.
 */
export interface CatalogImage {
  id: number;
  image: string | null;
  name: string | null;
  en_name: string | null;
  description: string | null;
  en_description: string | null;
  fit: ImageFit | null;
  background_color: string | null;
  sort_order: number;
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
      logger.warn(
        { path, status: res.status },
        "catalog API returned non-OK status",
      );
      return [];
    }
    return (await res.json()) as T[];
  } catch (err) {
    // Next signals its own control flow (a `notFound()`, a bail-out of static
    // rendering) by throwing, so a bare catch around a fetch swallows it and
    // the framework silently does the wrong thing. Put those back on the wire
    // before treating anything as a failed request.
    unstable_rethrow(err);
    logger.error({ path, err }, "Failed to fetch from the catalog API");
    return [];
  }
}

/**
 * GET one record by slug, answering `null` only when the API says 404.
 *
 * Deliberately *not* the list fetchers' "swallow everything" contract. A list
 * feeds one section of a page that stands without it, so an empty array is an
 * honest degradation; a detail page **is** its subject, and a 500 or a refused
 * connection turned into `null` would render "not found" for a record that
 * exists. Only a real 404 is a real absence - everything else throws and gets
 * the error page it deserves.
 */
async function fetchOne<T>(path: string): Promise<T | null> {
  const res = await fetch(`${API_URL}${path}`, { cache: "no-store" });

  if (res.status === 404) return null;
  if (!res.ok) {
    logger.error(
      { path, status: res.status },
      "catalog API returned non-OK status",
    );
    throw new Error(`Catalog request failed: ${path} (${res.status})`);
  }
  return (await res.json()) as T;
}

/**
 * Every enabled category, in the API's own order (kind, then sort_order, then
 * name) - which is already the order the landing's grouped icon grid wants.
 */
export async function getCategories(): Promise<Category[]> {
  return fetchList<Category>("/api/catalog/categories/", { cache: "no-store" });
}

/**
 * One category by the slug in its URL, or `null` when nothing answers to it.
 *
 * The public route is keyed by slug, so this uses the API's `slug/<slug>/` path
 * rather than the pk one the CMS holds. A disabled category 404s here for
 * anyone but an administrator, which is exactly what the public page wants.
 */
export async function getCategory(slug: string): Promise<Category | null> {
  return fetchOne<Category>(
    `/api/catalog/categories/slug/${encodeURIComponent(slug)}/`,
  );
}

/**
 * Every enabled category in one branch, in the API's own order.
 *
 * Filtered in the query rather than by narrowing `getCategories()` here: a
 * branch page has no use for the other four branches' categories, and the API
 * caches this list under its own key anyway.
 */
export async function getCategoriesByKind(kind: Kind): Promise<Category[]> {
  return fetchList<Category>(
    `/api/catalog/categories/?kind=${encodeURIComponent(kind)}`,
    {
      cache: "no-store",
    },
  );
}

/** One species by slug, with its reference photos embedded. */
export async function getSpecies(slug: string): Promise<Species | null> {
  return fetchOne<Species>(
    `/api/catalog/species/slug/${encodeURIComponent(slug)}/`,
  );
}

/**
 * Every enabled species filed under one category, in the API's own order
 * (sort_order, then name).
 *
 * A list again, so it keeps the list contract: a category page with a broken
 * species call is still a category page with its description and its photo.
 */
export async function getSpeciesByCategory(
  categorySlug: string,
): Promise<Species[]> {
  return fetchList<Species>(
    `/api/catalog/species/?category_slug=${encodeURIComponent(categorySlug)}`,
    { cache: "no-store" },
  );
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
 * (see Next's `connection` reference). It is a separate concern from the
 * `no-store` below, which is about *staleness* rather than prerendering: this
 * call is what re-runs the shuffle, that is what re-asks Django.
 *
 * Species with no `image` are dropped first: a slide in a full-bleed,
 * hero-height gallery is nothing but its photograph.
 */
export async function getFeaturedSpecies(limit = 10): Promise<Species[]> {
  await connection();

  const species = await fetchList<Species>(
    "/api/catalog/species/?featured=true",
    {
      cache: "no-store",
    },
  );

  return shuffle(species.filter((item) => Boolean(item.image))).slice(0, limit);
}

/**
 * A place a sighting can be filed at, as the public contribute flow needs it.
 *
 * Deliberately far narrower than the CMS's row: the flow renders these in a
 * dropdown, so it needs the name pair to label an option and the slug for nothing
 * at all yet. The geography behind a place (its county, and the state read through
 * that county) is the CMS's business - a contributor picks a place, they do not
 * file one.
 */
export interface ContributeLocation {
  id: number;
  name: string;
  en_name: string | null;
  slug: string;
  place_type: string | null;
  latitude: number | null;
  longitude: number | null;
}

/** A weather condition, as an option in the contribute flow's optional stage. */
export interface ContributeLookup {
  id: number;
  name: string;
  en_name: string | null;
  slug: string;
}

/**
 * Every enabled place, for the contribute flow's location picker.
 *
 * A list, so it keeps the list contract - and here that degradation is real
 * product rather than a shrug: with no places to choose from the flow still works,
 * because a contributor can drop a pin on the map instead (the API accepts either,
 * and refuses only an entry that has neither).
 */
export async function getContributeLocations(): Promise<ContributeLocation[]> {
  return fetchList<ContributeLocation>("/api/catalog/locations/", {
    cache: "no-store",
  });
}

/** Every enabled weather condition, for the contribute flow's optional stage. */
export async function getWeatherConditions(): Promise<ContributeLookup[]> {
  return fetchList<ContributeLookup>("/api/catalog/weather-conditions/", {
    cache: "no-store",
  });
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
