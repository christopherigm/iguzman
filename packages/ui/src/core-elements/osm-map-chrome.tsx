"use client";

import Image from "next/image";
import { Box } from "./box";
import { Button } from "./button";
import { Typography } from "./typography";
import { TILE_SIZE } from "./mercator";
import "./osm-map.css";

/**
 * The furniture every OpenStreetMap surface in the monorepo wears: the graded
 * tile layer, the stacked zoom control, the data credit, the gesture scrim and
 * the "you are here" pin.
 *
 * ⚠ **Why this is its own module.** Two components paint OSM tiles into their
 * own DOM and they are deliberately *not* the same component - this package's
 * `OsmMap` **reads** a set of markers, while `apps/animals`' CMS `MapPicker` is
 * a form control that **writes** two fields (see the note at the top of each).
 * What a reader sees, though, has to be identical: the same pin geometry, the
 * same control in the same corner, the same credit in the other one. Kept as two
 * copies it drifted - the picker's zoom buttons sat in the *top* corner as loose
 * pills, and its pin was anchored by a different corner, so it drew ~half a pin
 * to the left of the coordinate it was reporting. Everything both surfaces show
 * lives here now; everything they *do* stays in each of them.
 *
 * The projection they share is `./mercator.ts`. This is the other half: one
 * projection and one set of chrome, so a pin cannot land a pixel off the tile
 * beneath it in one of them, or a step off the other's design.
 */

/** Where the tiles come from. Fetched from the visitor's browser, not the server. */
export const OSM_TILE_HOST = "https://tile.openstreetmap.org";
/** The credit the OSM tile usage policy asks for - rendered by `OsmAttribution`. */
export const OSM_COPYRIGHT_URL = "https://www.openstreetmap.org/copyright";

/**
 * Hit-test hooks, not styling: a map's pointer handlers are attached to the
 * whole viewport, so they ask `closest()` whether a press landed on a marker or
 * on the chrome floating over the map (which is the chrome's, not a pan).
 */
export const OSM_CHROME_CLASS = "ui-osm-map__chrome";
export const OSM_MARKER_CLASS = "ui-osm-map__marker";
/** The visitor's / author's own pin: the same teardrop, in its own colour. */
export const OSM_USER_MARKER_CLASS = "ui-osm-map__marker--me";

/** Diameter of a marker's head. */
export const OSM_MARKER_SIZE = 34;
/**
 * How tall a marker stands above the coordinate it points at. The pin is a
 * square rotated 45° about its **centre** (see `osm-map.css`), so its sharp
 * corner sits `√2 / 2` of the square below that centre and the whole thing
 * reaches ~1.42× its own width - which is the room a popup has to clear.
 */
export const OSM_MARKER_TIP_HEIGHT = Math.round(OSM_MARKER_SIZE * 1.42);

/**
 * Wheel travel that adds up to one zoom step. A mouse notch reports ~100 at
 * once; a trackpad pinch reports a stream of single digits, which without this
 * accumulator would cross the whole zoom range in one gesture.
 */
export const OSM_ZOOM_WHEEL_STEP = 24;
/** How long the "use Ctrl + scroll" scrim stays up after a bare wheel. */
export const OSM_HINT_MS = 1800;
/** Pointer travel (px) below which a press counts as a click rather than a drag. */
export const OSM_DRAG_THRESHOLD = 4;

/**
 * How a browser is asked where its user is - coarse and cache-friendly on both
 * surfaces. A coarse fix is enough to say "you are here" against a map framed on
 * a region, and it is the one the device can answer from wifi rather than by
 * waking the GPS; `maximumAge` lets a fix taken moments ago on another page of
 * the same site be reused outright.
 */
export const OSM_GEOLOCATION_OPTIONS: PositionOptions = {
  enableHighAccuracy: false,
  timeout: 10_000,
  maximumAge: 300_000,
};

/** One tile, as `tilesFor` hands it over. */
export interface OsmTile {
  key: string;
  url: string;
  left: number;
  top: number;
}

/** Where a marker is drawn, in viewport pixels. */
export interface OsmOffset {
  left: number;
  top: number;
}

/**
 * The map surface itself.
 *
 * The tiles live in their own layer so the palette filter that gives them their
 * look (`osm-map.css`) applies once, to the surface only - markers, cards and
 * controls sit above it untouched.
 */
export function OsmTileLayer({ tiles }: { tiles: OsmTile[] }) {
  return (
    <Box
      className="ui-osm-map__tiles"
      styles={{ position: "absolute", inset: 0 }}
    >
      {tiles.map((tile) => (
        <Image
          key={tile.key}
          src={tile.url}
          alt=""
          width={TILE_SIZE}
          height={TILE_SIZE}
          draggable={false}
          // A tile is already exactly the size it is drawn at, and the apps that
          // mount these maps run a custom `images.loader` (so `/_next/image` may
          // not answer at all). `unoptimized` says so outright and keeps a
          // pointless srcset off every one of them.
          unoptimized
          style={{
            position: "absolute",
            left: tile.left,
            top: tile.top,
            width: TILE_SIZE,
            height: TILE_SIZE,
            pointerEvents: "none",
          }}
        />
      ))}
    </Box>
  );
}

/**
 * One stacked control in the bottom-right corner, the shape every web map has
 * put there since Google's - rather than two loose buttons.
 */
export function OsmZoomControl({
  onZoomIn,
  onZoomOut,
  zoomInDisabled = false,
  zoomOutDisabled = false,
  zoomInLabel,
  zoomOutLabel,
}: {
  onZoomIn: () => void;
  onZoomOut: () => void;
  zoomInDisabled?: boolean;
  zoomOutDisabled?: boolean;
  zoomInLabel: string;
  zoomOutLabel: string;
}) {
  return (
    <Box
      className={OSM_CHROME_CLASS}
      flexDirection="column"
      backgroundColor="var(--surface-1, #ffffff)"
      borderRadius={8}
      elevation={2}
      styles={{
        position: "absolute",
        right: 10,
        bottom: 10,
        zIndex: 2,
        overflow: "hidden",
      }}
    >
      <Button
        unstyled
        className="ui-osm-map__zoom"
        text="+"
        width={38}
        height={38}
        color="var(--foreground)"
        aria-label={zoomInLabel}
        title={zoomInLabel}
        disabled={zoomInDisabled}
        onClick={onZoomIn}
      />
      <Box
        height={1}
        backgroundColor="color-mix(in srgb, var(--foreground) 14%, transparent)"
      />
      <Button
        unstyled
        className="ui-osm-map__zoom"
        text="−"
        width={38}
        height={38}
        color="var(--foreground)"
        aria-label={zoomOutLabel}
        title={zoomOutLabel}
        disabled={zoomOutDisabled}
        onClick={onZoomOut}
      />
    </Box>
  );
}

/**
 * Required by the OSM tile usage policy. In the opposite corner from the
 * controls, where a web map's data credit belongs - leave it there.
 */
export function OsmAttribution({ label }: { label: string }) {
  return (
    <Box
      className={OSM_CHROME_CLASS}
      paddingX={6}
      paddingY={2}
      backgroundColor="color-mix(in srgb, var(--background) 78%, transparent)"
      styles={{ position: "absolute", left: 0, bottom: 0, zIndex: 2 }}
    >
      <a href={OSM_COPYRIGHT_URL} target="_blank" rel="noopener noreferrer">
        <Typography as="span" variant="label" color="var(--foreground)">
          {label}
        </Typography>
      </a>
    </Box>
  );
}

/**
 * The scrim a bare wheel raises, naming the gesture the map does answer. Purely
 * informational - it never takes a pointer, so the scroll it is explaining
 * carries on underneath it.
 */
export function OsmGestureHint({ text }: { text: string }) {
  return (
    <Box
      className={`${OSM_CHROME_CLASS} ui-osm-map__hint`}
      alignItems="center"
      justifyContent="center"
      padding={20}
      backgroundColor="rgba(17, 24, 39, 0.55)"
      styles={{
        position: "absolute",
        inset: 0,
        zIndex: 4,
        pointerEvents: "none",
        textAlign: "center",
      }}
    >
      <Typography variant="h6" fontWeight={600} color="#ffffff">
        {text}
      </Typography>
    </Box>
  );
}

/**
 * Where the person reading the map is: the same teardrop a record wears, so it
 * reads as a place on the map rather than as chrome floating over it - in its
 * own colour, with a dot in its head, because it is the one pin that is not a
 * record.
 *
 * It is never a button and never takes a pointer: it opens nothing, and a press
 * that lands on it belongs to the map underneath (a pan, or - in the CMS's
 * picker - a click that drops the real pin beneath it).
 */
export function OsmUserMarker({
  left,
  top,
  label,
}: {
  left: number;
  top: number;
  label?: string;
}) {
  return (
    <div
      role="img"
      aria-label={label ?? "Your location"}
      className={`${OSM_MARKER_CLASS} ${OSM_USER_MARKER_CLASS}`}
      style={{ left, top, width: OSM_MARKER_SIZE, height: OSM_MARKER_SIZE }}
    />
  );
}
