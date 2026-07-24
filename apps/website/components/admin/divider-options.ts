import {
  SHAPE_DIVIDER_MASKS,
  type ShapeDividerMask,
} from "@repo/ui/shape-divider";

/**
 * A divider shape the CMS offers: the self-contained SVG shapes only.
 * `brandmark` is excluded - it needs a same-origin brandmark URL that neither
 * the hero nor the section bands plumb through, so a tenant picking it would
 * get no notch at all.
 */
export type DividerShape = Exclude<ShapeDividerMask, "brandmark">;

/** A divider setting: a shape, or "none" for the straight edge. */
export type DividerOption = DividerShape | "none";

/**
 * The options in picker order: "none" (the default hard edge) first, then every
 * shape the site can cut. Shared by every CMS control that picks a divider - the
 * hero's bottom edge and both section bands' top/bottom edges - so the set
 * cannot drift between them or from the API's DIVIDER_CHOICES.
 */
export const DIVIDER_OPTIONS: DividerOption[] = [
  "none",
  ...SHAPE_DIVIDER_MASKS.filter((m): m is DividerShape => m !== "brandmark"),
];

/** Admin-namespace message key for each option's label. */
export const DIVIDER_LABEL_KEY: Record<DividerOption, string> = {
  none: "dividerNone",
  wave: "dividerWave",
  scallop: "dividerScallop",
  zigzag: "dividerZigzag",
  spikes: "dividerSpikes",
  arches: "dividerArches",
  slant: "dividerSlant",
  "inverted-slant": "dividerInvertedSlant",
};

/**
 * Narrows a stored value onto the offered set, falling back to "none" - the
 * same fallback the site applies, so the CMS control shows what the page draws
 * rather than a value the site is quietly ignoring.
 */
export function toDividerOption(value: unknown): DividerOption {
  return DIVIDER_OPTIONS.includes(value as DividerOption)
    ? (value as DividerOption)
    : "none";
}
