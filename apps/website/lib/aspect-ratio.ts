/**
 * The frame a record's own photographs are drawn in, when the tenant would
 * rather state it than let the pictures decide.
 *
 * The column is `aspect_ratio` on the API's `BasePicture`, so every
 * picture-bearing table has one - but only the **seven** forms with a surface
 * that reads it offer the select (the three buyables, the three editorial
 * records, and the homepage flyer; see the exclusions below). Blank - `AUTO` -
 * is the default and means "as it was before this existed": the detail gallery
 * derives its frame from the most-portrait photo in the set, and every other
 * surface keeps whatever box it always had.
 *
 * ⚠ **The list here and `ASPECT_RATIO_CHOICES` in website-api's `core/models.py`
 * are one list written twice** - the API refuses a value that is not in its own
 * tuple, so a ratio added here and nowhere else is a select whose save fails.
 *
 * ⚠ **It is the *record's* frame, not each picture's.** A gallery is one box
 * holding photographs of several shapes; a per-photo answer could only disagree
 * with its neighbours', which is the thing the override exists to stop.
 *
 * ⚠ **Three surfaces are deliberately out of scope and must stay that way -
 * never import this module into any of them.**
 * - **Every hero.** `components/hero.tsx` (the landing's) is the *tenant's*
 *   band rather than a record's - it draws `System.img_hero`, and `System`
 *   carries no `aspect_ratio` column at all. The category pages' `SectionHero`
 *   keeps its fixed `clamp(220px, 30vw, 400px)`: the height of a full-bleed
 *   strip under the navbar belongs to the page, not to the picture in it, and
 *   a portrait photo there is a wall the reader scrolls past to reach the
 *   items. Which is why the three category forms have no Image frame select
 *   and no category serializer exposes the column.
 * - **The catalog cards** (`components/buyable-card.tsx` and its view): a
 *   grid's frame belongs to the grid, so the box is a hard-coded 4:5 (1:1 in
 *   compact mode) - cards of several ratios in one row stop lining up, and the
 *   same item appears in grids this record knows nothing about.
 *
 * This override is for the surfaces where one record *is* the block.
 *
 * It is `lib/` rather than `components/admin/` because both halves read it: the
 * CMS select that writes it, and the public components that draw the frame. Like
 * `lib/catalog-paths.ts` it is plain data with no server import, so a client
 * component may import it.
 */

/** Blank: the pictures decide, exactly as they did before this column existed. */
export const ASPECT_RATIO_AUTO = "";

/** Every ratio the CMS offers, in the order the select lists them. */
export const ASPECT_RATIOS = [
  ASPECT_RATIO_AUTO,
  "4:5",
  "5:4",
  "1:1",
  "16:9",
  "3:2",
  "9:16",
] as const;

export type AspectRatio = (typeof ASPECT_RATIOS)[number];

/**
 * Each ratio's key in the `Admin` message namespace. The numbers are part of
 * the label ("Portrait (4:5)") rather than rendered beside it: an operator
 * picking a frame is choosing a shape, and the figure is what names it.
 */
export const ASPECT_RATIO_LABEL_KEY: Record<AspectRatio, string> = {
  "": "aspectRatioAuto",
  "4:5": "aspectRatioPortrait",
  "5:4": "aspectRatioLandscape",
  "1:1": "aspectRatioSquare",
  "16:9": "aspectRatioWide",
  "3:2": "aspectRatioPhoto",
  "9:16": "aspectRatioTall",
};

/**
 * The stored `w:h` string as a number, or `null` for auto (and for anything
 * unrecognised - a row written before a ratio was retired, say, must not take
 * the page down with it).
 */
export function aspectRatioValue(
  value: string | null | undefined,
): number | null {
  if (!value) return null;
  const [w, h] = value.split(":").map(Number);
  if (!w || !h || !Number.isFinite(w) || !Number.isFinite(h)) return null;
  return w / h;
}
