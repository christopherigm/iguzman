import type { ReactNode } from "react";
import { Box } from "@repo/ui/core-elements/box";
import { ShapeDivider, type ShapeDividerMask } from "@repo/ui/shape-divider";

/** A divider setting as the API stores it: a shape name, or "none"/blank. */
export type SectionDivider = ShapeDividerMask | "none" | null | undefined;

/** `null` for anything that means "straight edge", so callers can pass raw values. */
function maskOf(divider: SectionDivider): ShapeDividerMask | null {
  return divider && divider !== "none" ? divider : null;
}

type Props = {
  /** The band's CSS background - already through `fitSectionBackground`. */
  background: string;
  /** Shape cut out of the band's top edge (`System.*_top_divider`). */
  topDivider?: SectionDivider;
  /** Shape cut out of the band's bottom edge (`System.*_bottom_divider`). */
  bottomDivider?: SectionDivider;
  children: ReactNode;
};

/**
 * A full-width background band behind a landing section (the CatalogItems and
 * CompanyHighlights bands), with an optional shape-divider notch cut into its
 * top and/or bottom edge so the page - and its logo watermark - shows through
 * and the band dissolves into the sections around it instead of meeting them at
 * a hard horizontal line. All three values are tenant settings, tuned in the CMS
 * (`System.highlights_bg` / `catalog_items_bg` and the `*_top_divider` /
 * `*_bottom_divider` pair), so every site composes the same band.
 *
 * With no divider this renders exactly the plain background `Box` the landings
 * used before, so a tenant who has not touched the setting is unchanged.
 *
 * The two edges are **nested** rather than combined into one mask: a divider
 * masks the element it is on together with everything painted inside it, so the
 * background lives on the innermost box, the bottom notch is cut from that, and
 * the top notch is cut from a wrapper around the already-notched result. The
 * mask cuts a real hole, so keep anything that must escape the band (a disc
 * straddling its edge) outside this component.
 */
export function SectionBand({
  background,
  topDivider,
  bottomDivider,
  children,
}: Props) {
  const top = maskOf(topDivider);
  const bottom = maskOf(bottomDivider);

  // The band itself: the same markup the landings had before the dividers.
  let band = <Box styles={{ width: "100%", background }}>{children}</Box>;

  // `elevation={0}`: a band sits *in* the page rhythm rather than floating over
  // it, so its shaped edge gets no drop-shadow (the component defaults to 24,
  // which the hero uses to lift off the page below it).
  if (bottom) {
    band = (
      <ShapeDivider mask={bottom} edge="bottom" elevation={0}>
        {band}
      </ShapeDivider>
    );
  }
  if (top) {
    band = (
      <ShapeDivider mask={top} edge="top" elevation={0}>
        {band}
      </ShapeDivider>
    );
  }

  return band;
}

export default SectionBand;
