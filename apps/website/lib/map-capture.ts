/**
 * Painting a map of one place into a canvas, so it can be sent somewhere that
 * cannot draw one.
 *
 * ⚠ **Why an image at all, when every surface on the site draws a live map.**
 * A booking confirmation is an email. It cannot run `PlaceMap`, it cannot fetch
 * tiles a client will render, and the API that sends it cannot render tiles
 * either - Django would have to fetch six PNGs from a third-party host for every
 * message it queues, from a pod behind a VPN sidecar, under a tile-usage policy
 * written for interactive maps. There is exactly one moment where a map of this
 * place already exists in a browser: an operator dropping the pin in the CMS.
 * This is that moment, captured.
 *
 * The result is stored on `Branch.map_image` and is therefore a **snapshot**:
 * moving the pin re-renders it, changing the tenant's brandmark or its basemap
 * does not. That is the trade for a picture that costs nothing to send.
 *
 * ⚠ **Everything drawn here has to be same-origin or CORS-clean**, or
 * `toDataURL` throws `SecurityError` on a tainted canvas and there is no
 * screenshot at all. Tiles are requested `crossOrigin="anonymous"` (OSM and
 * CARTO both answer with `Access-Control-Allow-Origin: *`); the brandmark is
 * routed through `/api/media` first (see `lib/same-origin-image.ts`). A tenant
 * whose **custom** tile URL serves no CORS header simply gets no capture - the
 * pin still saves, the site's live maps are unaffected, and the email falls back
 * to its Directions button, which is the half that actually does something.
 *
 * The geometry is `@repo/ui`'s `mercator` - the same projection the live maps
 * use, so the captured frame is the frame the operator was looking at - and the
 * pin is drawn to match `osm-map.css`'s teardrop by hand, because a canvas has
 * no CSS. ⚠ Keep the two in step: the pin's **tip**, not its centre, is the
 * coordinate.
 */

import {
  TILE_SIZE,
  originOf,
  tilesFor,
  type LatLng,
} from "@repo/ui/core-elements/mercator";
import { toSameOriginDataUrl } from "./same-origin-image";

/** Capture size in CSS px. 16:9, which is the shape an email body wants. */
export const CAPTURE_WIDTH = 640;
export const CAPTURE_HEIGHT = 360;
/**
 * Drawn at twice the CSS size, so the stored file survives a retina inbox. The
 * API caps it at the STANDARD tier (900 px) on the way in, which lands a 16:9
 * capture at 900×506 - comfortably above the ~520 px an email renders it at.
 */
const CAPTURE_SCALE = 2;

/**
 * The zoom band a capture is allowed to sit in, whatever the picker is showing.
 * A screenshot of a continent tells the customer nothing, and one at zoom 19 is
 * a roof; the operator's own zoom is honoured between them.
 */
const MIN_CAPTURE_ZOOM = 12;
const MAX_CAPTURE_ZOOM = 18;

/** Marker geometry, mirroring `OSM_MARKER_SIZE` and `osm-map.css`. */
const PIN_SIZE = 34;
const PIN_BORDER = 2;
/** Rotating a square 45° about its centre puts the sharp corner √2/2 below it. */
const PIN_TIP_OFFSET = Math.SQRT1_2;

/** Fallback pin fill, matching `var(--accent)`'s own default in the CSS. */
const PIN_FALLBACK_COLOR = "#06b6d4";

/** How long a single tile is waited for before the capture gives up on it. */
const TILE_TIMEOUT_MS = 6000;

export interface CaptureMapOptions {
  /** The coordinate the pin marks; the capture is centred on it. */
  center: LatLng;
  /** The basemap's `{z}/{x}/{y}` template - the tenant's own, from `useBasemap`. */
  tileUrl: string;
  /** The provider's required credit, burned into the image - see below. */
  attribution: string;
  /** What the picker is currently showing, clamped into the band above. */
  zoom: number;
  /** The tenant's brandmark, as the live maps' pins wear it. May be absent. */
  pinIcon?: string | null;
}

/**
 * Load one image with CORS asked for, or resolve `null` rather than rejecting.
 *
 * A missing tile is a hole in the picture, not a failed capture: a provider that
 * rate-limits one square should not cost the operator the whole screenshot.
 */
function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    // Not set for a data URL: `crossOrigin` on one is harmless in every browser
    // that matters, but the brandmark has already been made same-origin and
    // saying so keeps the two paths readable.
    if (!src.startsWith("data:")) img.crossOrigin = "anonymous";
    const timer = setTimeout(() => resolve(null), TILE_TIMEOUT_MS);
    img.onload = () => {
      clearTimeout(timer);
      resolve(img);
    };
    img.onerror = () => {
      clearTimeout(timer);
      resolve(null);
    };
    img.src = src;
  });
}

/**
 * Draw the teardrop pin, tip-down, with its tip at (`x`, `y`).
 *
 * The shape is `osm-map.css`'s: a square with `border-radius: 50% 50% 50% 0`
 * rotated -45°, which at that radius is a circle plus one sharp corner. Written
 * out as arcs rather than `roundRect` so it does not depend on a canvas API that
 * only landed in Safari 16.4.
 */
function drawPin(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  glyph: HTMLImageElement | null,
) {
  const half = size / 2;

  ctx.save();
  // The pin's centre sits √2/2 of its width above its tip - see `PIN_TIP_OFFSET`.
  ctx.translate(x, y - PIN_TIP_OFFSET * size);
  ctx.rotate(-Math.PI / 4);

  ctx.beginPath();
  ctx.moveTo(-half, half); // the sharp corner, which after the rotation is the tip
  ctx.lineTo(-half, 0);
  // The three rounded corners are one 270° arc: at radius = half the corner
  // circles all centre on the box's own centre.
  ctx.arc(0, 0, half, Math.PI, Math.PI / 2, false);
  ctx.closePath();

  // `box-shadow: 0 2px 5px rgba(0,0,0,.35)` in screen space. The context is
  // rotated, so the offset is rotated with it or the shadow falls sideways.
  ctx.shadowColor = "rgba(0, 0, 0, 0.35)";
  ctx.shadowBlur = 5 * (size / PIN_SIZE);
  ctx.shadowOffsetX = -Math.SQRT2 * (size / PIN_SIZE);
  ctx.shadowOffsetY = Math.SQRT2 * (size / PIN_SIZE);

  // A pin with a brandmark is a white plate the mark sits on; without one it is
  // the accent teardrop, exactly as the live maps draw it.
  ctx.fillStyle = glyph ? "#ffffff" : PIN_FALLBACK_COLOR;
  ctx.fill();

  ctx.shadowColor = "transparent";
  ctx.lineWidth = PIN_BORDER * (size / PIN_SIZE);
  ctx.strokeStyle = "#ffffff";
  ctx.stroke();

  if (glyph) {
    ctx.save();
    // Circle-cropped and inset by the border, then counter-rotated so the mark
    // stands upright on a pin that does not - `.ui-osm-map__marker img`.
    const inner = half - PIN_BORDER * (size / PIN_SIZE);
    ctx.beginPath();
    ctx.arc(0, 0, inner, 0, Math.PI * 2);
    ctx.clip();
    ctx.rotate(Math.PI / 4);
    // `object-fit: cover`: the shorter side fills the circle and the longer one
    // is cropped, rather than a wordmark being squashed into a square.
    const side = inner * 2;
    const ratio = glyph.width / glyph.height || 1;
    const w = ratio >= 1 ? side * ratio : side;
    const h = ratio >= 1 ? side : side / ratio;
    ctx.drawImage(glyph, -w / 2, -h / 2, w, h);
    ctx.restore();
  }

  ctx.restore();
}

/**
 * The tile provider's credit, burned into the bottom-left corner.
 *
 * ⚠ **Not decoration, and not optional.** Every provider requires attribution,
 * and this image leaves the site entirely - it is emailed, and it renders on a
 * page that draws no live map beside it. The live maps carry the credit as
 * `OsmAttribution`; a still has nowhere to put one but inside itself.
 */
function drawAttribution(
  ctx: CanvasRenderingContext2D,
  label: string,
  width: number,
  height: number,
  scale: number,
) {
  if (!label) return;
  const fontSize = 11 * scale;
  ctx.save();
  ctx.font = `${fontSize}px Arial, Helvetica, sans-serif`;
  ctx.textBaseline = "middle";
  const padding = 5 * scale;
  const boxHeight = fontSize + padding * 2;
  const textWidth = ctx.measureText(label).width;
  ctx.fillStyle = "rgba(255, 255, 255, 0.78)";
  ctx.fillRect(0, height - boxHeight, textWidth + padding * 2, boxHeight);
  ctx.fillStyle = "#374151";
  ctx.fillText(label, padding, height - boxHeight / 2);
  ctx.restore();
}

/**
 * A JPEG data URL of `center` on the tenant's basemap, with the brandmark pin,
 * or `null` when the browser could not produce one.
 *
 * `null` is an ordinary outcome, not an error to report: a tile host with no
 * CORS header, an offline moment, a browser refusing `toDataURL`. The caller
 * saves the coordinates either way.
 */
export async function captureMapImage({
  center,
  tileUrl,
  attribution,
  zoom,
  pinIcon = null,
}: CaptureMapOptions): Promise<string | null> {
  if (typeof document === "undefined") return null;

  const captureZoom = Math.min(
    MAX_CAPTURE_ZOOM,
    Math.max(MIN_CAPTURE_ZOOM, Math.round(zoom)),
  );
  const size = { width: CAPTURE_WIDTH, height: CAPTURE_HEIGHT };
  const origin = originOf(center, captureZoom, size);
  const tiles = tilesFor(origin, size, captureZoom, tileUrl);

  // The brandmark is fetched through this app's own media proxy first; a mark
  // that could not be proxied is dropped rather than drawn, because drawing it
  // is what would taint the canvas and lose the whole capture. A relative path
  // is already this origin and needs neither the proxy nor the guard.
  const iconSrc = pinIcon ? await toSameOriginDataUrl(pinIcon) : null;
  const [glyph, ...loaded] = await Promise.all([
    iconSrc && (iconSrc.startsWith("data:") || iconSrc.startsWith("/"))
      ? loadImage(iconSrc)
      : Promise.resolve(null),
    ...tiles.map((tile) => loadImage(tile.url)),
  ]);

  // Not one tile arrived: the provider refuses cross-origin reads, or the
  // network is gone. Either way there is no map to draw.
  if (!loaded.some(Boolean)) return null;

  const canvas = document.createElement("canvas");
  canvas.width = CAPTURE_WIDTH * CAPTURE_SCALE;
  canvas.height = CAPTURE_HEIGHT * CAPTURE_SCALE;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  // The colour under any tile that did not arrive - the same neutral the live
  // map's viewport shows while its own tiles load.
  ctx.fillStyle = "#e5e7eb";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  tiles.forEach((tile, index) => {
    const img = loaded[index];
    if (!img) return;
    ctx.drawImage(
      img,
      tile.left * CAPTURE_SCALE,
      tile.top * CAPTURE_SCALE,
      TILE_SIZE * CAPTURE_SCALE,
      TILE_SIZE * CAPTURE_SCALE,
    );
  });

  drawPin(
    ctx,
    (CAPTURE_WIDTH / 2) * CAPTURE_SCALE,
    (CAPTURE_HEIGHT / 2) * CAPTURE_SCALE,
    PIN_SIZE * CAPTURE_SCALE,
    glyph ?? null,
  );

  drawAttribution(ctx, attribution, canvas.width, canvas.height, CAPTURE_SCALE);

  try {
    // JPEG rather than PNG: map tiles are photographic enough that PNG triples
    // the bytes of something that is emailed with every booking.
    return canvas.toDataURL("image/jpeg", 0.82);
  } catch {
    // A tainted canvas - a tile host answered without CORS after all.
    return null;
  }
}
