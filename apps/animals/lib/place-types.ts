/**
 * The kinds of place a location can be - `catalog.models.PLACE_TYPE_CHOICES`,
 * mirrored, plus the one-line label a place reads as in a picker.
 *
 * Its own module, and a deliberately **dependency-free** one: `lib/catalog.ts`
 * would be the obvious home, but that module imports `next/server`, and the CMS's
 * location form - one of the consumers here - is a client component. The others
 * are the public contribute flow's place picker (a server component, which labels
 * each option with its kind) and the sighting form itself (a client component,
 * which has to label the place a contributor just added without a round trip).
 *
 * The labels themselves are not here: they live in the `PlaceTypes` next-intl
 * namespace, because the API's own `place_type_display` is English-only.
 */
export const PLACE_TYPES = [
  "park",
  "reserve",
  "forest",
  "trail",
  "garden",
  "lake",
  "river",
  "beach",
  "wetland",
  "mountain",
  "desert",
  "urban",
  "backyard",
  "other",
] as const;

export type PlaceType = (typeof PLACE_TYPES)[number];

/**
 * Whether a payload's `place_type` is one this frontend can name.
 *
 * A **check**, not a cast: `place_type` arrives as a free string, so a value
 * added to the API's choices before its translation exists has to render as no
 * kind at all rather than as a raw key or a missing-message error.
 */
export function isPlaceType(
  value: string | null | undefined,
): value is PlaceType {
  return PLACE_TYPES.includes(value as PlaceType);
}

/** The fields `placeLabel` reads. Both `ContributeLocation` and the payload the
 *  contribute endpoint answers with satisfy it structurally. */
export interface LabelledPlace {
  name: string;
  en_name: string | null;
  slug: string;
  place_type: string | null;
  county_name: string | null;
  county_en_name: string | null;
}

/**
 * How one place reads in the sighting flow's picker: `Lake Estes (Lake) - Larimer`.
 *
 * The picker is a search field rather than a dropdown, so an option's label is
 * also the **haystack** it is matched against - a contributor who remembers the
 * county but not the name of the pond types "Larimer" and finds it. It is what
 * tells two places of the same name apart, too (this catalog has an "El Salto"
 * waterfall and an "El Salto" village), the same job the CMS's county picker does
 * by naming each option's state.
 *
 * Both extras are dropped when the place has neither, so a location filed before
 * the geography catalog existed still reads as its bare name.
 *
 * ⚠ **Shared rather than written twice**, and that is not tidiness: the sighting
 * page builds these labels on the server, and the sighting *form* has to build one
 * more - for the place a contributor adds mid-flow - in the browser. Two copies
 * would mean the place someone just created reading differently from every other
 * option in the same list.
 *
 * `localized` is inlined rather than imported so this module stays free of even
 * `lib/i18n-field`; the rule it applies is the same one-way fallback documented
 * there. `placeTypeLabel` is passed in because the API's `place_type_display` is
 * English-only, so the kind has to come from the `PlaceTypes` next-intl namespace
 * - which only the caller has.
 */
export function placeLabel(
  place: LabelledPlace,
  locale: string,
  placeTypeLabel: (type: PlaceType) => string,
): string {
  const pick = (base: string | null, english: string | null) => {
    const bare = (base ?? "").trim() || null;
    if (locale === "es") return bare;
    return (english ?? "").trim() || bare;
  };

  const name = pick(place.name, place.en_name) ?? place.slug;
  const kind = isPlaceType(place.place_type)
    ? placeTypeLabel(place.place_type)
    : null;
  const county = pick(place.county_name, place.county_en_name);

  return [kind ? `${name} (${kind})` : name, county].filter(Boolean).join(" - ");
}
