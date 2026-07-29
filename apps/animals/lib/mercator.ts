/**
 * Web Mercator: the arithmetic behind every OpenStreetMap raster tile this app
 * draws.
 *
 * Two components render tiles into their own DOM - the CMS's `MapPicker`
 * (click to place a coordinate) and the public `SightingsMap` (many markers,
 * read-only) - and both need the same conversions. They live here rather than in
 * either component because a second copy would be a second chance to get the
 * `sinh` wrong, and a pin drawn one pixel off from the tile beneath it is the
 * kind of bug nobody notices until a marker sits in the wrong bay.
 *
 * ⚠ **Why hand-rolled at all.** Google's keyless embed (`@repo/ui`'s
 * `LocationMap`) is a cross-origin iframe: nothing on the page can read a click
 * inside it or draw a marker on top of it. A real interactive map therefore
 * needs a Maps JavaScript API key - which this deployment does not have - or a
 * tile source we can paint ourselves. This is the latter, and it is about 60
 * lines: a tile is a 256 px square of a world `256 * 2^zoom` pixels wide, so a
 * lat/lng converts to a world pixel and back, and *everything* else - which
 * tiles to fetch, where a marker lands, what a drag means - falls out of that
 * one pair of functions.
 */

/** The edge length of an OSM raster tile, in CSS pixels. */
export const TILE_SIZE = 256;

/**
 * Mercator cannot express the poles - the projection runs to infinity there -
 * so latitude is clamped just short of them. This is the standard cut-off, and
 * it is what makes the world a square rather than an infinitely tall strip.
 */
export const MAX_LATITUDE = 85.05112878;

export type LatLng = { latitude: number; longitude: number };
export type Point = { x: number; y: number };
export type Size = { width: number; height: number };

/** The whole world's width in pixels at one zoom level. */
export const worldSize = (zoom: number) => TILE_SIZE * 2 ** zoom;

/** A coordinate as a pixel in the world square at one zoom level. */
export function toWorld({ latitude, longitude }: LatLng, zoom: number): Point {
  const size = worldSize(zoom);
  const lat = Math.min(MAX_LATITUDE, Math.max(-MAX_LATITUDE, latitude));
  const sin = Math.sin((lat * Math.PI) / 180);
  return {
    x: ((longitude + 180) / 360) * size,
    y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * size,
  };
}

/** The inverse of `toWorld`. */
export function fromWorld({ x, y }: Point, zoom: number): LatLng {
  const size = worldSize(zoom);
  const n = Math.PI - (2 * Math.PI * y) / size;
  return {
    latitude: (180 / Math.PI) * Math.atan(Math.sinh(n)),
    longitude: (x / size) * 360 - 180,
  };
}

/**
 * The world pixel sitting at a viewport's top-left corner - the offset every
 * tile and every marker is positioned against.
 */
export function originOf(center: LatLng, zoom: number, size: Size): Point {
  const world = toWorld(center, zoom);
  return { x: world.x - size.width / 2, y: world.y - size.height / 2 };
}

/** The coordinate under a point measured from the viewport's top-left corner. */
export function viewportToLatLng(
  center: LatLng,
  zoom: number,
  size: Size,
  px: number,
  py: number,
): LatLng {
  const origin = originOf(center, zoom, size);
  return fromWorld({ x: origin.x + px, y: origin.y + py }, zoom);
}

/**
 * Re-centres so the coordinate currently under (`px`, `py`) is still under it
 * after the zoom - which is what makes wheel-zoom feel like it is pulling the
 * map towards the cursor rather than towards the middle.
 */
export function zoomAbout(
  center: LatLng,
  from: number,
  to: number,
  px: number,
  py: number,
  size: Size,
): LatLng {
  const anchor = viewportToLatLng(center, from, size, px, py);
  const world = toWorld(anchor, to);
  return fromWorld(
    { x: world.x + size.width / 2 - px, y: world.y + size.height / 2 - py },
    to,
  );
}

/**
 * Which tiles cover a viewport, and where each one goes.
 *
 * The world repeats east-west but stops at the poles, so `x` wraps and a `y`
 * that falls off the top or bottom is simply skipped - the alternative is a
 * request for a tile that does not exist and a broken-image square in the sea.
 */
export function tilesFor(
  origin: Point,
  size: Size,
  zoom: number,
  host: string,
): { key: string; url: string; left: number; top: number }[] {
  if (size.width === 0 || size.height === 0) return [];
  const count = 2 ** zoom;
  const firstX = Math.floor(origin.x / TILE_SIZE);
  const lastX = Math.floor((origin.x + size.width) / TILE_SIZE);
  const firstY = Math.floor(origin.y / TILE_SIZE);
  const lastY = Math.floor((origin.y + size.height) / TILE_SIZE);

  const out: { key: string; url: string; left: number; top: number }[] = [];
  for (let x = firstX; x <= lastX; x += 1) {
    for (let y = firstY; y <= lastY; y += 1) {
      if (y < 0 || y >= count) continue;
      const wrappedX = ((x % count) + count) % count;
      out.push({
        key: `${zoom}/${x}/${y}`,
        url: `${host}/${zoom}/${wrappedX}/${y}.png`,
        left: x * TILE_SIZE - origin.x,
        top: y * TILE_SIZE - origin.y,
      });
    }
  }
  return out;
}

/**
 * The camera that frames every one of a set of coordinates: the middle of their
 * bounding box, and the deepest zoom at which that box still fits the viewport.
 *
 * Returns `null` for an empty set - there is nothing to frame, and a caller that
 * fell back to a default centre here would silently show the middle of the
 * country as though it meant something.
 *
 * The east-west span is measured the naive way (max minus min longitude), which
 * is wrong for a set straddling the antimeridian - it would frame the whole
 * globe instead of the strait. That is a deliberate trade: this is a field
 * journal, its pins are regional, and handling the wrap correctly costs more
 * than the case is worth. Revisit it if the journal ever spans the Pacific.
 */
export function fitBounds(
  points: LatLng[],
  size: Size,
  options: { padding?: number; minZoom?: number; maxZoom?: number } = {},
): { center: LatLng; zoom: number } | null {
  const { padding = 48, minZoom = 2, maxZoom = 16 } = options;
  if (points.length === 0) return null;

  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLng = Infinity;
  let maxLng = -Infinity;
  for (const { latitude, longitude } of points) {
    minLat = Math.min(minLat, latitude);
    maxLat = Math.max(maxLat, latitude);
    minLng = Math.min(minLng, longitude);
    maxLng = Math.max(maxLng, longitude);
  }

  const center = {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLng + maxLng) / 2,
  };

  // Before the viewport has been measured there is no box to fit into, so the
  // camera is centred and the zoom left to the caller's default.
  const usableWidth = size.width - padding * 2;
  const usableHeight = size.height - padding * 2;
  if (usableWidth <= 0 || usableHeight <= 0) return { center, zoom: maxZoom };

  // Walk down from the deepest zoom and take the first that fits. Sixteen
  // iterations of two `toWorld` calls, once per pin-set change - a closed-form
  // solution would be less obvious and no faster at this scale.
  for (let zoom = maxZoom; zoom > minZoom; zoom -= 1) {
    const topLeft = toWorld({ latitude: maxLat, longitude: minLng }, zoom);
    const bottomRight = toWorld({ latitude: minLat, longitude: maxLng }, zoom);
    if (
      bottomRight.x - topLeft.x <= usableWidth &&
      bottomRight.y - topLeft.y <= usableHeight
    ) {
      return { center, zoom };
    }
  }
  return { center, zoom: minZoom };
}
