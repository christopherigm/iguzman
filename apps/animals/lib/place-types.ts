/**
 * The kinds of place a location can be - `catalog.models.PLACE_TYPE_CHOICES`,
 * mirrored.
 *
 * Its own module, and a deliberately **dependency-free** one: `lib/catalog.ts`
 * would be the obvious home, but that module imports `next/server`, and the CMS's
 * location form - one of the two consumers here - is a client component. The
 * other is the public contribute flow's place picker, which labels each option
 * with its kind.
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
