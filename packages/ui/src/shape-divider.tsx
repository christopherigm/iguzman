import React, { CSSProperties } from "react";

/**
 * Which edge of a box the divider notch is cut into.
 *
 * - `bottom` - the notch is cut from the bottom edge, so whatever sits *below*
 *   the box shows through it (a hero dissolving into the page beneath).
 * - `top` - the notch is cut from the top edge, so whatever sits *above* shows
 *   through it (a section dissolving into the hero above it).
 */
export type ShapeDividerEdge = "top" | "bottom";

/**
 * The named divider shapes. Each is a periodic (or, for `wave`, hand-drawn)
 * silhouette whose *filled* area is the part of the box to keep and whose
 * transparent area becomes the notch.
 *
 * - `wave`      - the original irregular, organic wave (the effect's default look).
 * - `scallop`   - a row of half-circles (a scalloped edge).
 * - `zigzag`    - bold triangular bunting.
 * - `spikes`    - a fine, sharp sawtooth comb.
 * - `arches`    - smooth, regular wide humps.
 * - `slant`     - a single straight diagonal.
 * - `brandmark` - a caller-supplied brandmark image tiled along the edge as a
 *   stamped lace border. Unlike every other shape (self-contained SVGs), this
 *   one needs a `brandmarkUrl` - and it must be **same-origin**, or the mask
 *   resolves empty in Chromium/WebKit and the notch silently vanishes.
 */
export type ShapeDividerMask =
  | "wave"
  | "scallop"
  | "zigzag"
  | "spikes"
  | "arches"
  | "slant"
  | "brandmark";

/**
 * The masks in display order - the set a picker (e.g. the website CMS) offers.
 * `wave` leads because it is the effect's signature look.
 */
export const SHAPE_DIVIDER_MASKS: readonly ShapeDividerMask[] = [
  "wave",
  "scallop",
  "zigzag",
  "spikes",
  "arches",
  "slant",
  "brandmark",
] as const;

/** Width/height of the periodic shapes' viewBox (wave keeps its own, below). */
const W = 1440;
const H = 100;

/**
 * The `d` of each shape's "keep" polygon, drawn for the **bottom** edge (filled
 * area on top, shaped boundary near the bottom). The `top` edge is derived by
 * vertically mirroring this same path, so each shape is authored once. Every
 * shape stretches to the band via `preserveAspectRatio="none"`, so the raw
 * numbers are proportions, not pixels.
 */
function scallopPath(): string {
  const r = 20; // half-chord: 24 lobes of chord 2r across the width
  const depth = r / 1.2; // 50% shorter than a full semicircle - shallow half-ellipse lobes
  // Baseline sits `depth` up from the band's far edge (V${H - depth}); each arc
  // bulges a half-ellipse lobe *down* to the far edge (sweep 1), so the material
  // hangs down in half-circles with concave gaps between them - the vertical
  // inverse of upward-cut bites.
  let d = `M0 0 H${W} V${H - depth}`;
  for (let i = 0; i < W / (2 * r); i++) d += ` a${r} ${depth} 0 0 1 ${-2 * r} 0`;
  return `${d} Z`;
}

function zigzagPath(): string {
  const s = 60; // 12 bold triangles (half-width s) pointing to the bottom edge
  let d = `M0 0 H${W} V25`;
  for (let i = 0; i < W / (2 * s); i++) d += ` l${-s} 75 l${-s} -75`;
  return `${d} Z`;
}

function spikesPath(): string {
  const s = 20; // 36 fine teeth - a sharp comb, distinct from the bold zigzag
  let d = `M0 0 H${W} V20`;
  for (let i = 0; i < W / (2 * s); i++) d += ` l${-s} 80 l${-s} -80`;
  return `${d} Z`;
}

function archesPath(): string {
  const seg = W / 4; // 4 smooth humps via quadratics dipping to ~the bottom edge
  let d = `M0 0 H${W} V55`;
  for (let i = 0; i < 4; i++) d += ` q${-seg / 2} 90 ${-seg} 0`;
  return `${d} Z`;
}

const SLANT_PATH = `M0 0 H${W} V35 L0 ${H} Z`;

/**
 * The original organic wave (kept exactly), on its own 1280x140 viewBox. Filled
 * area on top, wavy boundary near the bottom - the same convention as the
 * generated shapes above.
 */
const WAVE = {
  w: 1280,
  h: 140,
  d: "M156 35.51l95.46 34.84 120.04.24 71.5 33.35 90.09-3.91L640 137.65l102.39-37.17 85.55 10.65 88.11-7.19L992 65.28l73.21 5.31 66.79-22.1 77-.42L1280 0H0l64.8 38.69 91.2-3.18z",
} as const;

type MaskDef = { w: number; h: number; d: string };

/** Every shape except `brandmark`, which is an external image, not an SVG path. */
type ShapeMask = Exclude<ShapeDividerMask, "brandmark">;

const MASKS: Record<ShapeMask, MaskDef> = {
  wave: WAVE,
  scallop: { w: W, h: H, d: scallopPath() },
  zigzag: { w: W, h: H, d: zigzagPath() },
  spikes: { w: W, h: H, d: spikesPath() },
  arches: { w: W, h: H, d: archesPath() },
  slant: { w: W, h: H, d: SLANT_PATH },
};

/**
 * A `data:` URI for the divider shape's SVG, oriented for the given edge. The
 * fill colour is irrelevant - the SVG is used as an **alpha** mask, so filled =
 * opaque (kept) and empty = transparent (the notch). For the `top` edge the
 * whole shape is flipped vertically so the notch lands on the top edge.
 */
function maskDataUri(mask: ShapeMask, edge: ShapeDividerEdge): string {
  const { w, h, d } = MASKS[mask];
  const path = `<path d="${d}"/>`;
  const inner =
    edge === "top"
      ? `<g transform="translate(0,${h}) scale(1,-1)">${path}</g>`
      : path;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" fill="#000">${inner}</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

/**
 * The CSS `mask` properties that cut a divider notch into one edge of a box.
 * Two mask layers, unioned by the default `add` compositing: a flat opaque fill
 * over everything **except** the divider band, plus the shape's SVG in the band
 * itself - where the SVG is opaque the box is kept, where it's transparent the
 * box (and its whole subtree) is cut away to a real hole. Spread onto any
 * `position`ed, `overflow: hidden` element that has something meaningful behind
 * it - the notch reveals whatever is painted there, not a fill.
 *
 * `size` is the band's thickness (any CSS length); the notch depth grows with
 * it. The generated `ShapeDivider` component wraps this, but heavier hosts (like
 * `Hero`) spread it directly onto their existing box.
 *
 * For `mask === "brandmark"` pass `brandmarkUrl` - the image is tiled
 * horizontally (`repeat-x`) at the band height as a stamped lace border. The
 * URL **must be same-origin** (route a remote asset through `/_next/image`),
 * since a cross-origin `mask-image` resolves to an empty mask in Chromium/WebKit
 * and the notch would silently vanish in production. A `"brandmark"` mask with
 * no `brandmarkUrl` yields no mask at all (the box is left untouched). The
 * brandmark image is used as-authored for both edges - only the band position
 * follows `edge`, the image itself is not vertically flipped.
 */
export function shapeDividerMaskStyle(
  mask: ShapeDividerMask,
  edge: ShapeDividerEdge,
  size: string,
  brandmarkUrl?: string,
): CSSProperties {
  const isBrandmark = mask === "brandmark";
  if (isBrandmark && !brandmarkUrl) return {};
  const url = isBrandmark ? brandmarkUrl! : maskDataUri(mask, edge);
  const keep = `100% calc(100% - ${size})`;
  // A brandmark tiles across the edge; the SVG shapes stretch to fill it once.
  const band = isBrandmark ? `auto ${size}` : `100% ${size}`;
  const bandRepeat = isBrandmark ? "repeat-x" : "no-repeat";
  // The flat fill covers the side away from the notch; the shape sits on the
  // notch side. `add` (the default multi-layer compositing) unions their alpha.
  const notchPos = edge;
  const keepPos = edge === "top" ? "bottom" : "top";
  return {
    WebkitMaskImage: `linear-gradient(#000, #000), url("${url}")`,
    maskImage: `linear-gradient(#000, #000), url("${url}")`,
    WebkitMaskRepeat: `no-repeat, ${bandRepeat}`,
    maskRepeat: `no-repeat, ${bandRepeat}`,
    WebkitMaskPosition: `${keepPos}, ${notchPos}`,
    maskPosition: `${keepPos}, ${notchPos}`,
    WebkitMaskSize: `${keep}, ${band}`,
    maskSize: `${keep}, ${band}`,
  };
}

/**
 * A CSS `drop-shadow` filter that lends the divider's notched edge a sense of
 * elevation - the shaped edge lifts off the page below and casts a soft shadow
 * that traces the **masked silhouette** (the notch contour itself), not the
 * box's rectangle. `drop-shadow` is used rather than a `box-shadow` (the CSS
 * equivalent of `@repo/ui-native`'s `elevation`) for exactly this reason: the
 * mask cuts a *real* hole, and only `drop-shadow` follows that hole's outline -
 * a `box-shadow` would be clipped flat by the notch. It is the same trick
 * `Hero`'s badge shadow (`HERO_BADGE_SHADOW`) uses.
 *
 * `elevation` mirrors `@repo/ui-native`'s `Box`/`getShadowStyle` scale (clamped
 * to 1-24), so the same number reads as the same depth on web and native.
 * Returns `undefined` for a non-positive elevation (no filter at all).
 */
export function shapeDividerElevationFilter(
  elevation?: number,
): string | undefined {
  if (!elevation || elevation <= 0) return undefined;
  const e = Math.min(24, Math.round(elevation));
  const offsetY = Math.max(1, Math.round(e * 0.5));
  const blur = Math.min(5, Math.round(e * 1) + 1);
  const alpha = Math.min(0.4, 0.1 + e * 0.1);
  return `drop-shadow(0 ${offsetY}px ${blur}px rgba(0,0,0,${Number(alpha.toFixed(3))}))`;
}

export type ShapeDividerProps = {
  /** The masked content (a media layer, a hero, a coloured section…). */
  children: React.ReactNode;
  /**
   * The divider shape to cut. Omit (or `null`) to render `children` untouched -
   * so a caller can bind this straight to a nullable "none" setting.
   */
  mask?: ShapeDividerMask | null;
  /**
   * The brandmark image tiled along the edge when `mask === "brandmark"`.
   * **Must be same-origin** (route remote assets through `/_next/image`) or the
   * mask resolves empty and the notch vanishes. Ignored for the other shapes;
   * a `"brandmark"` mask without it renders `children` untouched.
   */
  brandmarkUrl?: string;
  /** Which edge the notch is cut into. @default "bottom" */
  edge?: ShapeDividerEdge;
  /** Thickness of the divider band (the notch depth grows with it).
   * @default "clamp(30px, 5vw, 64px)" */
  size?: string;
  /**
   * Lifts the shaped edge off the page with a `drop-shadow` that traces the
   * notch contour (not a rectangle), giving a sense of elevation. Mirrors
   * `@repo/ui-native`'s `Box` elevation scale (1-24), so the same number reads
   * as the same depth on web and native. Omit or `0` for a flat edge.
   */
  elevation?: number;
  className?: string;
  /** Extra styles merged onto the wrapper (after the mask). */
  style?: CSSProperties;
};

/**
 * Wraps `children` in a `position: relative; overflow: hidden` box and cuts a
 * shape-divider notch out of one edge, so whatever is painted behind the box
 * shows through the notch. Use it to soften the hard seam between a hero
 * image/video and the page below (or a section and the hero above). For a box
 * you already own the styles of, prefer {@link shapeDividerMaskStyle} directly.
 *
 * Because the mask cuts a real hole, only place it where something meaningful
 * sits behind the box (the page background, a watermark), and remember the mask
 * clips **every** descendant - anything that must escape the notch has to live
 * outside this wrapper.
 */
export function ShapeDivider({
  children,
  mask = null,
  brandmarkUrl,
  edge = "bottom",
  size = "clamp(30px, 5vw, 64px)",
  elevation = 24,
  className,
  style,
}: ShapeDividerProps) {
  const elevationFilter = shapeDividerElevationFilter(elevation);
  const masked = (
    <div
      className={elevationFilter ? undefined : className}
      style={{
        position: "relative",
        overflow: "hidden",
        ...(mask ? shapeDividerMaskStyle(mask, edge, size, brandmarkUrl) : {}),
        ...style,
      }}
    >
      {children}
    </div>
  );
  // The elevation shadow must live on an OUTER, unmasked wrapper - never on the
  // masked box itself. CSS applies `filter` before `mask`, so a `drop-shadow`
  // sharing the masked box would be cut away exactly where it should show (in
  // the notch and below the shaped edge). Put on a parent instead, the filter
  // rasterises the already-masked child and traces its real notched silhouette,
  // casting the shadow freely below the edge. `drop-shadow` (not `box-shadow`)
  // so it follows that silhouette rather than the box rectangle.
  if (!elevationFilter) return masked;
  return (
    <div className={className} style={{ filter: elevationFilter }}>
      {masked}
    </div>
  );
}

export default ShapeDivider;
