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

/**
 * A shape's mask geometry: its viewBox (`w x h`), the "keep" polygon `d`, and -
 * for the periodic shapes - the fixed on-screen width `tilePx` of one repeat.
 */
type MaskDef = { w: number; h: number; d: string; tilePx?: number };

const H = 100;
const W = 1440; // full-width viewBox for the non-repeating slant

/**
 * The periodic shapes are each authored as a SINGLE repeating tile and tiled
 * across the edge at a FIXED pixel width (`tilePx`), so every lobe/tooth/hump
 * keeps the same on-screen size no matter how wide the screen is - instead of
 * one instance stretched to 100% width, which grew and shrank the shapes with
 * the viewport. `wave` and `slant` (below) stay single, non-repeating drawings
 * that still stretch to span the whole edge.
 *
 * Each tile's `d` is drawn for the **bottom** edge (filled area on top, shaped
 * boundary near the bottom); the `top` edge is derived by vertically mirroring
 * it. A tile's viewBox is `w x H` and is stretched only VERTICALLY to the band
 * via `preserveAspectRatio="none"` (so the band thickness follows `size`) - it
 * is never scaled horizontally, since the fixed `tilePx` owns that dimension.
 */

// A single half-circle lobe; `tilePx` is one lobe's on-screen width.
function scallopTile(): MaskDef {
  const r = 50; // half-chord
  const depth = r / 1.5; // 50% shorter than a full semicircle - a shallow half-ellipse
  const w = 2 * r;
  // Baseline sits `depth` up from the far edge; the lobe bulges a half-ellipse
  // *down* to the far edge (sweep 1), leaving a concave gap between tiles.
  return {
    w,
    h: H,
    d: `M0 0 H${w} V${H - depth} a${r} ${depth} 0 0 1 ${-w} 0 Z`,
    tilePx: 40,
  };
}

// One bold, down-pointing triangle (bunting).
function zigzagTile(): MaskDef {
  const s = 60;
  const w = 2 * s;
  return { w, h: H, d: `M0 0 H${w} V25 l${-s} 75 l${-s} -75 Z`, tilePx: 120 };
}

// One fine, sharp sawtooth tooth.
function spikesTile(): MaskDef {
  const s = 20;
  const w = 2 * s;
  return { w, h: H, d: `M0 0 H${w} V20 l${-s} 80 l${-s} -80 Z`, tilePx: 40 };
}

// One smooth, wide hump.
function archesTile(): MaskDef {
  const seg = 360;
  return {
    w: seg,
    h: H,
    d: `M0 0 H${seg} V55 q${-seg / 2} 64 ${-seg} 0 Z`,
    tilePx: 180,
  };
}

const SLANT_PATH = `M0 0 H${W} V35 L0 ${H} Z`;

/**
 * The original organic wave (kept exactly), on its own 1280x140 viewBox. Filled
 * area on top, wavy boundary near the bottom - the same convention as the tiles
 * above. A single, non-repeating drawing (no `tilePx`), so it stretches to fill
 * the edge once.
 */
const WAVE: MaskDef = {
  w: 1280,
  h: 140,
  d: "M156 35.51l95.46 34.84 120.04.24 71.5 33.35 90.09-3.91L640 137.65l102.39-37.17 85.55 10.65 88.11-7.19L992 65.28l73.21 5.31 66.79-22.1 77-.42L1280 0H0l64.8 38.69 91.2-3.18z",
};

/** Every shape except `brandmark`, which is an external image, not an SVG path. */
type ShapeMask = Exclude<ShapeDividerMask, "brandmark">;

const MASKS: Record<ShapeMask, MaskDef> = {
  wave: WAVE,
  scallop: scallopTile(),
  zigzag: zigzagTile(),
  spikes: spikesTile(),
  arches: archesTile(),
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
  // The flat-fill layer is grown 1px past the band boundary so it OVERLAPS the
  // shape layer's full-width opaque top edge. The two layers are anchored from
  // opposite edges and meet exactly at `100% - size`; without the overlap,
  // sub-pixel rounding at some viewport sizes leaves a 1px band where neither
  // layer is fully opaque - a faint horizontal line over the media that flickers
  // in and out as the rounding shifts on resize. The overlap lands on opaque
  // pixels, so it closes the seam without changing the notch silhouette.
  const keep = `100% calc(100% - ${size} + 1px)`;
  // The periodic shapes (and the brandmark) tile across the edge at a FIXED
  // width, so each shape keeps the same size regardless of screen width; only
  // wave/slant - single, non-repeating drawings - stretch to fill the edge once.
  const tilePx = isBrandmark ? undefined : MASKS[mask].tilePx;
  const tiles = isBrandmark || tilePx != null;
  const band = isBrandmark
    ? `auto ${size}`
    : tilePx != null
      ? `${tilePx}px ${size}`
      : `100% ${size}`;
  const bandRepeat = tiles ? "repeat-x" : "no-repeat";
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
 * The fraction of the divider band each shape cuts AWAY around the MIDDLE of the
 * edge - i.e. how far the box's *visible* boundary sits inside the band there
 * instead of on its nominal edge. Measured off each shape's own path above by
 * integrating its "keep" boundary, so the numbers are properties of the geometry
 * and not taste: `scallop`'s shallow half-ellipses barely bite (~7%), while
 * `spikes` and `zigzag` remove nearly half the band.
 *
 * Why the middle rather than the whole edge: the consumer is something *centred*
 * on the edge (`Hero`'s `profile` disc). For the tiled shapes that distinction
 * is moot - a tile is 40-180px wide, so any centred object spans several and
 * sees the tile's own mean. It matters for the two single, stretched drawings:
 * `wave` is at its SHALLOWEST dead centre (its path dips to `y=137.65` of 140,
 * cutting almost nothing) and only bites deep out towards the ends, so its
 * whole-edge mean (~0.45) would lift a centred disc about three times too far;
 * the value here is integrated across the middle fifth of the drawing instead.
 * `slant` is linear, so its centre and its mean coincide.
 *
 * `brandmark` is a caller-supplied image whose alpha we cannot know, so it takes
 * a middling value - a stamped lace border tends to be mostly gaps.
 */
const NOTCH_MEAN_DEPTH: Record<ShapeDividerMask, number> = {
  wave: 0.16,
  scallop: 0.07,
  zigzag: 0.38,
  spikes: 0.4,
  arches: 0.24,
  slant: 0.33,
  brandmark: 0.5,
};

/**
 * How far a divider notch pulls the box's *effective* edge inward around the
 * middle of that edge, as a CSS length derived from the band `size` - the amount
 * anything centred on the edge has to move to stay visually attached to it, now
 * that the notch has made the nominal edge partly transparent.
 *
 * `Hero`'s `profile` layout is the motivating case: its logo disc straddles the
 * hero's bottom edge (half in, half out), and with a divider cut into that edge
 * the disc's "in" half hangs over a hole and the mark reads as having slipped
 * below the hero. Lifting it by this inset puts its centre back on the shape's
 * mean boundary, restoring the half-in/half-out read for every shape.
 *
 * Edge-agnostic: the value is a distance into the band, so a `top` divider
 * inset applies downward from the top edge in the same way.
 */
export function shapeDividerEdgeInset(
  mask: ShapeDividerMask,
  size: string,
): string {
  return `calc((${size}) * ${NOTCH_MEAN_DEPTH[mask]})`;
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
 * `elevation` follows `@repo/ui-native`'s `Box` scale (clamped to 1-24), so the
 * same number reads as roughly the same depth on web and native. Returns
 * `undefined` for a non-positive elevation (no filter at all).
 *
 * A convincing "lifted edge" shadow is DIRECTIONAL and LAYERED, not a single
 * even blur: a defined **key** shadow that falls clearly *below* the shaped edge
 * (larger vertical offset than blur), plus a wider, fainter **ambient** shadow
 * that grounds it. The earlier single-layer formula used a small offset with a
 * dark, even blur, which hugged the contour on every side and read as a dark
 * *glow* rather than an edge casting a shadow. `drop-shadow` filters stack, and
 * both layers trace the same masked notch silhouette, composing into real depth.
 */
export function shapeDividerElevationFilter(
  elevation?: number,
): string | undefined {
  if (!elevation || elevation <= 0) return undefined;
  const e = Math.min(24, Math.round(elevation));
  // Key: offset well above blur so the shadow reads as a crisp, directional
  // cast (a tight blur keeps a defined edge instead of a soft haze).
  const keyOffset = Math.max(2, Math.round(e * 1));
  const keyBlur = Math.max(1, Math.round(e * 0.5));
  const keyAlpha = Math.min(0.42, 0.16 + e * 0.014);
  // Ambient: little offset, wider blur, low alpha - the soft ground contact.
  const ambientOffset = Math.max(1, Math.round(e * 0.5));
  const ambientBlur = Math.min(48, Math.round(e * 1.2) + 4);
  const ambientAlpha = Math.min(0.2, 0.05 + e * 0.008);
  const key = `drop-shadow(0 ${keyOffset}px ${keyBlur}px rgba(0,0,0,${Number(keyAlpha.toFixed(3))}))`;
  const ambient = `drop-shadow(0 ${ambientOffset}px ${ambientBlur}px rgba(0,0,0,${Number(ambientAlpha.toFixed(3))}))`;
  return `${key} ${ambient}`;
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
