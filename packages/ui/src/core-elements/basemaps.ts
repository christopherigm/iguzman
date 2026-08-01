/**
 * The basemaps an `OsmMap` (or `apps/animals`' CMS `MapPicker`) can be painted
 * from, and the one place a tile URL and its attribution are kept together.
 *
 * ⚠ **The credit is not decoration and not a translation.** Every tile provider
 * here requires a specific attribution string, and it changes with the URL - a
 * CARTO basemap credited "© OpenStreetMap contributors" is under-credited, which
 * is a licence problem rather than a copy problem. That is why the two travel as
 * one record and why an app must render `attribution` from the basemap it chose
 * rather than from its own `Map.attribution` message: an i18n key cannot follow
 * a setting an operator changes at runtime. (The strings are proper nouns and
 * URLs; there is nothing in them to translate.)
 *
 * ⚠ **Why raster and not vector.** Every style here serves finished PNGs, which
 * is what the ~200-line renderer in `osm-map.tsx` draws. That renderer is the
 * whole reason these maps exist without an API key or `leaflet`; a vector style
 * (MapLibre, OpenFreeMap, Protomaps) would replace it outright, not configure
 * it. The trade is that **a raster style's contents cannot be toggled** - roads,
 * labels and building footprints are baked into the PNG before it arrives, so
 * "turn the houses off" is a choice of *style*, not a switch.
 *
 * The way to a real layer choice while staying on this renderer is `custom`
 * below, pointed at a **style you authored in a hosted provider's editor** -
 * clone their base style, delete the `building` layer, publish, and paste the
 * raster endpoint it gives you. (A self-hosted `tileserver-gl` rendering a style
 * JSON in the cluster was the other route, and there was a Helm chart for it
 * here; it was dropped as strictly more machinery than the hosted editor for the
 * same result. The trade to know is the one that made it worth considering:
 * self-hosting costs no per-tile quota, and this renderer fetches one PNG per
 * 256 px square - 12-20 for a single map view, before any panning.)
 *
 * Deliberately React-free, like `mercator.ts` and `breakpoints.ts`.
 */

/** How a basemap's tiles are colour-graded once they are on screen. */
export type BasemapFilter =
  /**
   * The treatment written for OSM's standard cartography: pulled towards a pale
   * grey-beige in the light theme, and inverted in the dark one. Right for any
   * full-colour map designed to be read on its own.
   */
  | "grade"
  /**
   * Drawn exactly as it arrives. Right for a style that is *already* muted - a
   * grey canvas, or one you rendered yourself - where grading it again would
   * wash it out to nothing.
   *
   * ⚠ It also means the dark theme does **not** invert it, so a light style
   * stays light on a dark page. That is a deliberate choice left to whoever
   * picks the style, not an oversight to "fix" in CSS: inverting a style that
   * was authored pale is what produced a muddy brown map the one time it was
   * tried.
   */
  | "none";

/** One basemap: where its tiles come from, who must be credited, how it is drawn. */
export interface Basemap {
  /** The `{z}/{x}/{y}` template - see `mercator.ts` → `tileUrlFor`. */
  tileUrl: string;
  /** The credit rendered in the map's corner. Required by every provider here. */
  attribution: string;
  /**
   * Where that credit links, when the provider's terms ask for a *linked* one.
   *
   * ⚠ **It travels with the string, for the same reason the string travels with
   * the URL.** The credit used to be a label over a hard-coded anchor to
   * OpenStreetMap's copyright page, which is right for the four styles below and
   * wrong for every other provider: a MapTiler or Mapbox credit pointing at OSM
   * names one of the two parties owed and links the other, which is worse than
   * not linking at all. Absent, the credit renders as **plain text** rather than
   * borrowing somebody else's href - a visible uncredited link is a licence
   * problem, a missing one is merely a missing one.
   */
  attributionUrl?: string;
  filter: BasemapFilter;
}

/** The styles an operator may pick without configuring anything. */
export type BasemapId = "osm" | "carto-light" | "carto-dark" | "carto-voyager";

/** The credit OSM's own tile usage policy asks for, and where it points. */
export const OSM_ATTRIBUTION = "© OpenStreetMap contributors";
export const OSM_COPYRIGHT_URL = "https://www.openstreetmap.org/copyright";
/** CARTO's basemaps are rendered from OSM data, so both parties are named. */
const CARTO_ATTRIBUTION = "© OpenStreetMap contributors © CARTO";
const CARTO_ATTRIBUTION_URL = "https://carto.com/attributions";

/**
 * The keyless styles. Every one of these can be fetched straight from a
 * visitor's browser with no account, which is the bar for being in this list -
 * a provider needing an API key belongs behind `custom`, where the key lives in
 * a setting rather than in the repository.
 *
 * The CARTO entries take `filter: 'none'`: Positron and Dark Matter are already
 * the pale/dark grey canvases the grading filter exists to *approximate* out of
 * OSM's standard tiles, and each is authored for one theme - which is why both
 * are offered rather than one being flipped into the other.
 */
export const BASEMAPS: Record<BasemapId, Basemap> = {
  osm: {
    tileUrl: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: OSM_ATTRIBUTION,
    attributionUrl: OSM_COPYRIGHT_URL,
    filter: "grade",
  },
  "carto-light": {
    tileUrl: "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png",
    attribution: CARTO_ATTRIBUTION,
    attributionUrl: CARTO_ATTRIBUTION_URL,
    filter: "none",
  },
  "carto-dark": {
    tileUrl: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
    attribution: CARTO_ATTRIBUTION,
    attributionUrl: CARTO_ATTRIBUTION_URL,
    filter: "none",
  },
  "carto-voyager": {
    tileUrl:
      "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png",
    attribution: CARTO_ATTRIBUTION,
    attributionUrl: CARTO_ATTRIBUTION_URL,
    filter: "none",
  },
};

/** What a map falls back to, and what a fresh database is configured with. */
export const DEFAULT_BASEMAP: BasemapId = "osm";

/** Shorthand for the default's tile template - the historical hard-coded URL. */
export const OSM_TILE_URL = BASEMAPS.osm.tileUrl;

/** The operator's own basemap, when `style` is `'custom'`. Every part optional. */
export interface CustomBasemap {
  tileUrl?: string | null;
  attribution?: string | null;
  attributionUrl?: string | null;
  filter?: BasemapFilter | null;
}

/**
 * The basemap a stored setting names.
 *
 * `style` is either one of the ids above or the string `'custom'`, in which case
 * the URL and credit are the operator's own - typically a hosted provider that
 * needs an API key (MapTiler, Mapbox, Thunderforest), whose template carries it
 * as a query parameter: `tileUrlFor` substitutes only the placeholders it knows,
 * so a `?key=…` survives untouched. That key is fetched from the visitor's own
 * browser and is therefore **public by construction** - restrict it by origin at
 * the provider rather than treating the setting as a secret.
 *
 * **A custom style with no URL falls back to the default rather than to a blank
 * map.** A half-filled setting is the normal state of a form someone is still
 * typing into, and a map that renders nothing at all reads as a broken page
 * rather than as a setting waiting to be finished.
 *
 * ⚠ **The custom credit gets no link unless one was configured.** Defaulting it
 * to OpenStreetMap's copyright page is what the hard-coded anchor in
 * `osm-map-chrome` used to do, and it is wrong the moment the tiles are somebody
 * else's - see `Basemap.attributionUrl`. The exception is the credit *string*
 * also being blank, since then the fallback OSM credit is what is on screen and
 * the OSM link is the right one for it.
 */
export function resolveBasemap(
  style: string | null | undefined,
  custom: CustomBasemap = {},
): Basemap {
  if (style === "custom") {
    const tileUrl = custom.tileUrl?.trim();
    if (!tileUrl) return BASEMAPS[DEFAULT_BASEMAP];
    // A self-rendered style is still OSM data in every realistic case, so the
    // OSM credit is the safe default when the operator has not written one.
    const attribution = custom.attribution?.trim();
    const attributionUrl = custom.attributionUrl?.trim();
    return {
      tileUrl,
      attribution: attribution || OSM_ATTRIBUTION,
      ...(attributionUrl
        ? { attributionUrl }
        : attribution
          ? {}
          : { attributionUrl: OSM_COPYRIGHT_URL }),
      filter: custom.filter ?? "none",
    };
  }
  return (
    BASEMAPS[(style as BasemapId) ?? DEFAULT_BASEMAP] ??
    BASEMAPS[DEFAULT_BASEMAP]
  );
}
