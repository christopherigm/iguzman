'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Box } from '@repo/ui/core-elements/box';
import { Card } from '@repo/ui/core-elements/card';
import { Button } from '@repo/ui/core-elements/button';
import { Select } from '@repo/ui/core-elements/select';
import { Typography } from '@repo/ui/core-elements/typography';
import {
  TILE_SIZE,
  fitBounds,
  fromWorld,
  originOf,
  tilesFor,
  toWorld,
  type LatLng,
  type Size,
} from '@/lib/mercator';
import './sightings-map.css';

/**
 * Every pinned journal entry on one map, drawn from OpenStreetMap raster tiles,
 * with each marker wearing its **species' icon**.
 *
 * ⚠ **Why this is not `@repo/ui`'s `LocationMap`.** That is Google's keyless
 * embed - a cross-origin iframe showing exactly one pin, which nothing on the
 * page can draw on top of or read a click inside. It is still the right
 * component for a single sighting's "where it was seen" (one coordinate, no
 * interaction). A map of *many* entries needs markers we own, so it needs tiles
 * we paint ourselves: the projection is in `lib/mercator.ts`, shared with the
 * CMS's `MapPicker`, and this component is the reading half of it.
 *
 * ⚠ **It makes third-party requests from the visitor's browser** -
 * `tile.openstreetmap.org`, one image per 256 px square on screen. That was
 * already true of the CMS's picker, but this is the first time it is true of a
 * *public* page. Nothing else is fetched: there is no place search here, so
 * Nominatim is not involved.
 *
 * Four things worth knowing before changing it:
 *
 * - **The wheel is cooperative: a bare scroll belongs to the page.** This map
 *   used to swallow every wheel event, so a reader scrolling past the landing
 *   snagged on it and zoomed out to the Atlantic instead of reaching the footer.
 *   Zooming now needs `Ctrl`/`⌘` + wheel - which is also how every browser
 *   reports a **trackpad pinch**, so the same branch serves both - or a
 *   two-finger pinch on a touchscreen, or the buttons. A bare scroll raises a
 *   scrim saying so, the way Google's own embeds do.
 * - **The filters narrow the pins that were loaded, they never re-query.** The
 *   dropdown options are built from the marker set itself, so a species that is
 *   not on the map is not in the list - and picking one shows that species'
 *   pins *among these*, not its full history. The alternative (refetching per
 *   selection) buys a longer history at the cost of a loading state on every
 *   change and an unbounded pin count; a map is a frame, not a search.
 * - **The camera refits when the filtered set changes, and not otherwise.** It
 *   is adjusted *during render* (React's "adjusting state when a prop changes"
 *   pattern), keyed on a string rather than on the array's identity - an effect
 *   keyed on an object would fight the reader's own panning on every parent
 *   re-render, which is the exact bug the picker's comment describes.
 * - **Markers at the same coordinate are fanned out.** Several entries filed at
 *   one place - the common case, since a sighting with no coordinates of its own
 *   inherits its location's centre - would otherwise stack into what looks like
 *   a single pin. The offset is in *screen* pixels, so the fan stays legible at
 *   every zoom rather than dissolving as you zoom out.
 */

const MIN_ZOOM = 2;
const MAX_ZOOM = 17;
/** Deepest zoom `fitBounds` may choose - a single pin should not open on rooftops. */
const MAX_FIT_ZOOM = 13;
/** Pointer travel (px) below which a press counts as a click rather than a drag. */
const DRAG_THRESHOLD = 4;
/** How far outside the viewport a marker is still rendered, in px. */
const CULL_MARGIN = 80;
/** Diameter of a marker's head. */
const MARKER_SIZE = 34;
/**
 * How tall a marker stands above the coordinate it points at. The pin is a
 * square rotated 45° (see `sightings-map.css`), so its tip sits `√2 / 2` of the
 * square below its centre and the whole thing reaches ~1.42× its own width -
 * which is the room a popup has to clear.
 */
const MARKER_TIP_HEIGHT = Math.round(MARKER_SIZE * 1.42);
/** Radius of the fan applied to markers sharing one coordinate. */
const FAN_RADIUS = 15;
/**
 * Wheel travel that adds up to one zoom step. A mouse notch reports ~100 at
 * once; a trackpad pinch reports a stream of single digits, which without this
 * accumulator would cross the whole zoom range in one gesture.
 */
const ZOOM_WHEEL_STEP = 24;
/** How long the "use Ctrl + scroll" scrim stays up after a bare wheel. */
const HINT_MS = 1800;

const TILE_HOST = 'https://tile.openstreetmap.org';
const OSM_COPYRIGHT = 'https://www.openstreetmap.org/copyright';

/**
 * Hit-test hooks, not styling: the pointer handlers are attached to the whole
 * viewport, so they ask `closest()` whether a press landed on a marker (select
 * it) or on the chrome floating over the map (leave it alone).
 */
const CHROME_CLASS = 'sm__chrome';
const MARKER_CLASS = 'sm__marker';

/**
 * One entry on the map. Every string arrives **already resolved for the locale**
 * - including the date, which is formatted server-side so the entry's calendar
 * day cannot shift under the visitor's timezone (the API publishes a bare
 * `YYYY-MM-DD`, which `new Date()` would read as UTC midnight).
 */
export interface SightingMarker {
  id: number;
  /** The entry's own page - where the popup's button leads. */
  href: string;
  title: string;
  speciesName: string | null;
  categoryName: string | null;
  locationName: string | null;
  dateLabel: string;
  /** The calendar year, for the year filter - `date.slice(0, 4)`. */
  year: string;
  /** The species' glyph, falling back to its category's. */
  icon: string | null;
  /** The marker's colour when there is no glyph at all. */
  color: string | null;
  /** The entry's cover, for the popup card. */
  image: string | null;
  latitude: number;
  longitude: number;
  /** Whether the API blurred this pin to ~1 km (a protected place). */
  approximate: boolean;
}

/** Which dropdowns to offer. A filter with fewer than two values is dropped. */
export type SightingsMapFilter = 'category' | 'species' | 'location' | 'year';

interface Props {
  markers: SightingMarker[];
  filters?: SightingsMapFilter[];
  /** Height of the map viewport. @default 420 */
  height?: number;
  labels: {
    map: string;
    zoomIn: string;
    zoomOut: string;
    attribution: string;
    close: string;
    all: string;
    category: string;
    species: string;
    location: string;
    year: string;
    empty: string;
    approximate: string;
    seeDetail: string;
    /** The scrim a bare wheel raises. Both are passed; the client picks one. */
    zoomHint: string;
    zoomHintMac: string;
  };
}

type Selection = Record<SightingsMapFilter, string>;

const NO_SELECTION: Selection = {
  category: '',
  species: '',
  location: '',
  year: '',
};

export function SightingsMap({
  markers,
  filters = ['category', 'species', 'location', 'year'],
  height = 420,
  labels,
}: Props) {
  const [selection, setSelection] = useState<Selection>(NO_SELECTION);
  const [size, setSize] = useState<Size>({ width: 0, height: 0 });
  const [center, setCenter] = useState<LatLng>(() => firstPoint(markers));
  const [zoom, setZoom] = useState(MAX_FIT_ZOOM);
  const [selected, setSelected] = useState<number | null>(null);
  /** The gesture scrim's text, or `null` when it is down. */
  const [hint, setHint] = useState<string | null>(null);

  const viewportRef = useRef<HTMLDivElement>(null);

  // ── The filters ───────────────────────────────────────────────────────────

  // Built from the markers themselves: the dropdowns describe what is on the
  // map, so an option that would empty it is never offered in the first place.
  const options = useMemo(() => {
    const pick: Record<SightingsMapFilter, (m: SightingMarker) => string | null> = {
      category: (m) => m.categoryName,
      species: (m) => m.speciesName,
      location: (m) => m.locationName,
      year: (m) => m.year,
    };
    const out = {} as Record<SightingsMapFilter, string[]>;
    for (const filter of filters) {
      const values = new Set<string>();
      for (const marker of markers) {
        const value = pick[filter](marker);
        if (value) values.add(value);
      }
      // Years read newest first, like the feed they came from; the rest read
      // alphabetically in the visitor's own locale.
      out[filter] =
        filter === 'year'
          ? [...values].sort().reverse()
          : [...values].sort((a, b) => a.localeCompare(b));
    }
    return out;
  }, [markers, filters]);

  const visible = useMemo(
    () =>
      markers.filter(
        (m) =>
          (!selection.category || m.categoryName === selection.category) &&
          (!selection.species || m.speciesName === selection.species) &&
          (!selection.location || m.locationName === selection.location) &&
          (!selection.year || m.year === selection.year),
      ),
    [markers, selection],
  );

  // ── Framing the pins ──────────────────────────────────────────────────────
  //
  // Adjusted while rendering rather than in an effect, which is the pattern the
  // picker's own camera uses and for the same reason: the frame is a
  // *derivation* of the pin set that the reader then takes over by panning. Both
  // keys are strings, not objects - keyed on identity this would re-frame the
  // map on every parent re-render, undoing that panning.
  const fitKey = `${size.width}x${size.height}:${visible.map((m) => m.id).join(',')}`;
  const [framed, setFramed] = useState<string | null>(null);
  if (framed !== fitKey && size.width > 0) {
    setFramed(fitKey);
    const fit = fitBounds(visible, size, {
      minZoom: MIN_ZOOM,
      maxZoom: MAX_FIT_ZOOM,
    });
    if (fit) {
      setCenter(fit.center);
      setZoom(fit.zoom);
    }
  }

  // A pin that has just been filtered away must not keep its popup open over a
  // map it is no longer on.
  if (selected !== null && !visible.some((m) => m.id === selected)) {
    setSelected(null);
  }

  // ── Imperative gestures ───────────────────────────────────────────────────
  //
  // The handlers are attached once and must not be re-bound on every camera
  // change - a listener swapped out mid-drag would drop the gesture - so they
  // read the live camera and size through refs, refreshed after each render.
  const cameraRef = useRef({ center, zoom });
  const sizeRef = useRef(size);
  const labelsRef = useRef(labels);
  useEffect(() => {
    cameraRef.current = { center, zoom };
    sizeRef.current = size;
    labelsRef.current = labels;
  });

  /**
   * Which modifier the wheel hint should name. Read from the browser rather than
   * guessed, and kept in a ref because it is only ever consulted inside a
   * gesture - long after mount - so it never has to survive hydration.
   */
  const isMacRef = useRef(false);
  useEffect(() => {
    isMacRef.current = /Mac|iPhone|iPad|iPod/.test(
      navigator.platform || navigator.userAgent,
    );
  }, []);

  /** Set by a drag that started on a marker, so releasing it does not select. */
  const draggedRef = useRef(false);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;

    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      const { width, height: h } = entry.contentRect;
      setSize({ width: Math.round(width), height: Math.round(h) });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;

    let drag: {
      pointerId: number;
      startX: number;
      startY: number;
      camera: { center: LatLng; zoom: number };
      moved: boolean;
    } | null = null;

    /** Every finger currently down, and the two-finger gesture they opened. */
    const touches = new Map<number, { x: number; y: number }>();
    let pinch: {
      distance: number;
      x: number;
      y: number;
      camera: { center: LatLng; zoom: number };
    } | null = null;

    /** Wheel travel banked since the last zoom step - see `ZOOM_WHEEL_STEP`. */
    let wheelTravel = 0;
    let hintTimer: ReturnType<typeof setTimeout> | null = null;

    const raiseHint = (text: string) => {
      setHint(text);
      if (hintTimer) clearTimeout(hintTimer);
      hintTimer = setTimeout(() => setHint(null), HINT_MS);
    };

    const dropHint = () => {
      if (hintTimer) clearTimeout(hintTimer);
      hintTimer = null;
      setHint(null);
    };

    /** Zoom to `next`, holding the coordinate under (`clientX`, `clientY`) still. */
    const zoomAt = (
      camera: { center: LatLng; zoom: number },
      next: number,
      clientX: number,
      clientY: number,
    ) => {
      const rect = el.getBoundingClientRect();
      setCenter(
        zoomAboutPointer(
          camera.center,
          camera.zoom,
          next,
          clientX - rect.left,
          clientY - rect.top,
          sizeRef.current,
        ),
      );
      setZoom(next);
    };

    const openPinch = () => {
      const [a, b] = [...touches.values()];
      if (!a || !b) return;
      drag = null;
      draggedRef.current = true;
      pinch = {
        distance: Math.hypot(b.x - a.x, b.y - a.y),
        x: (a.x + b.x) / 2,
        y: (a.y + b.y) / 2,
        camera: cameraRef.current,
      };
    };

    const handlePointerDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement | null;
      // The zoom buttons, the popup and the attribution link float over the
      // map; a press on any of them is theirs, not the start of a pan.
      if (target?.closest(`.${CHROME_CLASS}`)) return;

      if (e.pointerType === 'touch') {
        touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
        // A second finger turns the pan already in progress into a pinch.
        if (touches.size === 2) {
          dropHint();
          openPinch();
          return;
        }
        if (touches.size > 2) return;
      }

      if (e.button !== 0) return;
      draggedRef.current = false;
      drag = {
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        camera: cameraRef.current,
        moved: false,
      };
      el.setPointerCapture(e.pointerId);
      // A marker is a real button, so its own click handler selects it - and
      // suppressing the default here would take that click with it.
      if (!target?.closest(`.${MARKER_CLASS}`)) e.preventDefault();
    };

    const handlePointerMove = (e: PointerEvent) => {
      if (e.pointerType === 'touch' && touches.has(e.pointerId)) {
        touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      }

      // ── Two fingers: pan by the midpoint, zoom by how far they spread ──
      //
      // Both are measured from where the gesture *started* rather than
      // accumulated frame by frame, so a pinch that stretches and relaxes lands
      // back where it began instead of drifting away from the reader's fingers.
      if (pinch && touches.size >= 2) {
        const [a, b] = [...touches.values()];
        if (!a || !b) return;
        const midX = (a.x + b.x) / 2;
        const midY = (a.y + b.y) / 2;
        const { center: from, zoom: z } = pinch.camera;
        const world = toWorld(from, z);
        const panned = fromWorld(
          { x: world.x - (midX - pinch.x), y: world.y - (midY - pinch.y) },
          z,
        );
        // A raster tile only exists at whole zoom levels, so the spread is read
        // as the number of doublings it has travelled - a pinch snaps between
        // levels rather than scaling smoothly through them.
        const spread = Math.hypot(b.x - a.x, b.y - a.y);
        const steps =
          pinch.distance > 0 ? Math.round(Math.log2(spread / pinch.distance)) : 0;
        const next = clamp(z + steps, MIN_ZOOM, MAX_ZOOM);
        if (next === z) setCenter(panned);
        else zoomAt({ center: panned, zoom: z }, next, midX, midY);
        return;
      }

      if (!drag || e.pointerId !== drag.pointerId) return;
      const dx = e.clientX - drag.startX;
      const dy = e.clientY - drag.startY;
      if (!drag.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
      drag.moved = true;
      draggedRef.current = true;
      // The camera moves *against* the pointer, so the map follows the hand.
      const { center: from, zoom: z } = drag.camera;
      const world = toWorld(from, z);
      setCenter(fromWorld({ x: world.x - dx, y: world.y - dy }, z));
    };

    const handlePointerUp = (e: PointerEvent) => {
      if (e.pointerType === 'touch') {
        touches.delete(e.pointerId);
        // The finger left over from a pinch keeps no baseline worth panning
        // from, so nothing resumes until it lifts too.
        if (touches.size < 2) pinch = null;
      }
      if (!drag || e.pointerId !== drag.pointerId) return;
      drag = null;
      if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
    };

    const handleWheel = (e: WheelEvent) => {
      // ⚠ A bare wheel is the page's, not the map's. Swallowing it is what made
      // scrolling past this section snag on it, so the map only takes the wheel
      // when the reader says it is a zoom - `ctrlKey` being both "Ctrl held" and
      // how every browser reports a trackpad pinch.
      if (!e.ctrlKey && !e.metaKey) {
        raiseHint(
          isMacRef.current ? labelsRef.current.zoomHintMac : labelsRef.current.zoomHint,
        );
        return;
      }
      // Non-passive on purpose: Ctrl + wheel is the browser's own page-zoom, and
      // this is where that is taken over.
      e.preventDefault();
      dropHint();

      wheelTravel += e.deltaY;
      if (Math.abs(wheelTravel) < ZOOM_WHEEL_STEP) return;
      const direction = wheelTravel < 0 ? 1 : -1;
      wheelTravel = 0;

      const camera = cameraRef.current;
      const next = clamp(camera.zoom + direction, MIN_ZOOM, MAX_ZOOM);
      if (next === camera.zoom) return;
      zoomAt(camera, next, e.clientX, e.clientY);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSelected(null);
        return;
      }
      const step = e.shiftKey ? 200 : 60;
      const pan = (dx: number, dy: number) => {
        const { center: c, zoom: z } = cameraRef.current;
        const world = toWorld(c, z);
        setCenter(fromWorld({ x: world.x + dx, y: world.y + dy }, z));
      };
      switch (e.key) {
        case 'ArrowUp':
          pan(0, -step);
          break;
        case 'ArrowDown':
          pan(0, step);
          break;
        case 'ArrowLeft':
          pan(-step, 0);
          break;
        case 'ArrowRight':
          pan(step, 0);
          break;
        case '+':
        case '=':
          setZoom((z) => Math.min(MAX_ZOOM, z + 1));
          break;
        case '-':
        case '_':
          setZoom((z) => Math.max(MIN_ZOOM, z - 1));
          break;
        default:
          return;
      }
      e.preventDefault();
    };

    el.addEventListener('pointerdown', handlePointerDown);
    el.addEventListener('pointermove', handlePointerMove);
    el.addEventListener('pointerup', handlePointerUp);
    el.addEventListener('pointercancel', handlePointerUp);
    el.addEventListener('wheel', handleWheel, { passive: false });
    el.addEventListener('keydown', handleKeyDown);
    return () => {
      el.removeEventListener('pointerdown', handlePointerDown);
      el.removeEventListener('pointermove', handlePointerMove);
      el.removeEventListener('pointerup', handlePointerUp);
      el.removeEventListener('pointercancel', handlePointerUp);
      el.removeEventListener('wheel', handleWheel);
      el.removeEventListener('keydown', handleKeyDown);
      if (hintTimer) clearTimeout(hintTimer);
    };
  }, []);

  // ── Placement ─────────────────────────────────────────────────────────────

  const origin = useMemo(() => originOf(center, zoom, size), [center, zoom, size]);
  const tiles = useMemo(
    () => tilesFor(origin, size, zoom, TILE_HOST),
    [origin, size, zoom],
  );

  /**
   * Where each marker is drawn, culled to what is on screen. The fan for
   * co-located entries is applied here, in screen pixels, so it holds its shape
   * at every zoom level.
   *
   * **Nothing is culled until the viewport has been measured.** Before that
   * there is no camera worth culling against - the map is centred on the first
   * pin at a guessed zoom - so culling would drop every distant marker from the
   * server-rendered HTML and leave a crawler (or a reader whose tiles never
   * load) with two of them. Measurement happens on mount, immediately after.
   */
  const placed = useMemo(() => {
    const measured = size.width > 0 && size.height > 0;
    const fan = fanOffsets(visible);
    const out: { marker: SightingMarker; left: number; top: number }[] = [];
    for (const marker of visible) {
      const world = toWorld(marker, zoom);
      const offset = fan.get(marker.id) ?? { x: 0, y: 0 };
      const left = world.x - origin.x + offset.x;
      const top = world.y - origin.y + offset.y;
      if (
        measured &&
        (left < -CULL_MARGIN ||
          top < -CULL_MARGIN ||
          left > size.width + CULL_MARGIN ||
          top > size.height + CULL_MARGIN)
      ) {
        continue;
      }
      out.push({ marker, left, top });
    }
    return out;
  }, [visible, origin, zoom, size]);

  const selectedPlacement = placed.find((p) => p.marker.id === selected) ?? null;

  const setFilter = useCallback((filter: SightingsMapFilter, value: string) => {
    setSelection((current) => ({ ...current, [filter]: value }));
  }, []);

  // Only the filters that have something to choose between: a dropdown offering
  // one species is a control that can only ever be a no-op.
  const shownFilters = filters.filter((filter) => (options[filter]?.length ?? 0) > 1);

  return (
    <Box flexDirection="column" gap={12} width="100%">
      {shownFilters.length > 0 && (
        <Box display="flex" flexWrap="wrap" gap={12} alignItems="flex-end">
          {shownFilters.map((filter) => (
            <Select
              key={filter}
              label={labels[filter]}
              value={selection[filter]}
              onChange={(value) => setFilter(filter, value)}
              options={[
                { value: '', label: labels.all },
                ...(options[filter] ?? []).map((value) => ({
                  value,
                  label: value,
                })),
              ]}
              flex={1}
              minWidth={150}
              maxWidth={240}
            />
          ))}
        </Box>
      )}

      <Box
        ref={viewportRef}
        role="application"
        aria-label={labels.map}
        tabIndex={0}
        height={height}
        borderRadius={12}
        border="1px solid color-mix(in srgb, var(--foreground) 18%, transparent)"
        backgroundColor="var(--surface-2)"
        className="sm__viewport"
        styles={{
          position: 'relative',
          overflow: 'hidden',
          touchAction: 'none',
          userSelect: 'none',
        }}
      >
        {/* The tiles live in their own layer so the palette filter that gives
            them their look (`sightings-map.css`) applies once, to the map
            surface only - markers, cards and controls sit above it untouched. */}
        <Box className="sm__tiles" styles={{ position: 'absolute', inset: 0 }}>
          {tiles.map((tile) => (
            <Image
              key={tile.key}
              src={tile.url}
              alt=""
              width={TILE_SIZE}
              height={TILE_SIZE}
              draggable={false}
              // `images.loader` is 'custom' in this app, so /_next/image does not
              // answer and the loader hands every URL back untouched; unoptimized
              // says so outright and keeps a pointless srcset off each tile.
              unoptimized
              style={{
                position: 'absolute',
                left: tile.left,
                top: tile.top,
                width: TILE_SIZE,
                height: TILE_SIZE,
                pointerEvents: 'none',
              }}
            />
          ))}
        </Box>

        {placed.map(({ marker, left, top }) => (
          <button
            key={marker.id}
            type="button"
            className={`${MARKER_CLASS}${marker.id === selected ? ` ${MARKER_CLASS}--on` : ''}`}
            aria-label={marker.title}
            aria-pressed={marker.id === selected}
            onClick={() => {
              // A press that turned into a pan is not a selection.
              if (draggedRef.current) return;
              setSelected(marker.id);
            }}
            style={{
              left,
              top,
              width: MARKER_SIZE,
              height: MARKER_SIZE,
              // No icon at all: the category's colour still groups the pin by
              // branch, which beats a field of identical grey dots.
              background: marker.icon
                ? 'var(--surface-1, #ffffff)'
                : (marker.color ?? 'var(--accent, #06b6d4)'),
            }}
          >
            {marker.icon && (
              <Image
                src={marker.icon}
                alt=""
                width={MARKER_SIZE}
                height={MARKER_SIZE}
                unoptimized
                draggable={false}
              />
            )}
          </button>
        ))}

        {selectedPlacement && (
          <Box
            className={`${CHROME_CLASS} sm__popup`}
            styles={{
              position: 'absolute',
              // Clamped to the viewport so a pin near an edge does not open its
              // card half outside the map.
              left: clamp(selectedPlacement.left, 118, Math.max(118, size.width - 118)),
              // Clear of the pin's head, not its tip: the coordinate is where
              // the pin *points*, and the pin stands above it.
              top: selectedPlacement.top - MARKER_TIP_HEIGHT - 6,
              transform: 'translate(-50%, -100%)',
              zIndex: 3,
              width: 228,
              maxWidth: 'calc(100% - 20px)',
            }}
          >
            <MarkerCard
              marker={selectedPlacement.marker}
              labels={labels}
              onClose={() => setSelected(null)}
            />
          </Box>
        )}

        {visible.length === 0 && (
          <Box
            className={CHROME_CLASS}
            padding="10px 14px"
            borderRadius={10}
            backgroundColor="color-mix(in srgb, var(--background) 88%, transparent)"
            styles={{
              position: 'absolute',
              left: '50%',
              top: '50%',
              transform: 'translate(-50%, -50%)',
              zIndex: 2,
            }}
          >
            <Typography variant="body" color="var(--foreground)">
              {labels.empty}
            </Typography>
          </Box>
        )}

        {/* The scrim a bare wheel raises, telling the reader which gesture the
            map does answer. Purely informational - it never takes a pointer,
            so the scroll it is explaining carries on underneath it. */}
        {hint && (
          <Box
            className={`${CHROME_CLASS} sm__hint`}
            alignItems="center"
            justifyContent="center"
            padding={20}
            backgroundColor="rgba(17, 24, 39, 0.55)"
            styles={{
              position: 'absolute',
              inset: 0,
              zIndex: 4,
              pointerEvents: 'none',
              textAlign: 'center',
            }}
          >
            <Typography variant="h6" fontWeight={600} color="#ffffff">
              {hint}
            </Typography>
          </Box>
        )}

        {/* One stacked control in the bottom corner, the shape every web map
            has put there since Google's - rather than two loose buttons. */}
        <Box
          className={CHROME_CLASS}
          flexDirection="column"
          backgroundColor="var(--surface-1, #ffffff)"
          borderRadius={8}
          elevation={2}
          styles={{
            position: 'absolute',
            right: 10,
            bottom: 10,
            zIndex: 2,
            overflow: 'hidden',
          }}
        >
          <Button
            unstyled
            className="sm__zoom"
            text="+"
            width={38}
            height={38}
            color="var(--foreground)"
            aria-label={labels.zoomIn}
            title={labels.zoomIn}
            disabled={zoom >= MAX_ZOOM}
            onClick={() => setZoom((z) => Math.min(MAX_ZOOM, z + 1))}
          />
          <Box
            height={1}
            backgroundColor="color-mix(in srgb, var(--foreground) 14%, transparent)"
          />
          <Button
            unstyled
            className="sm__zoom"
            text="−"
            width={38}
            height={38}
            color="var(--foreground)"
            aria-label={labels.zoomOut}
            title={labels.zoomOut}
            disabled={zoom <= MIN_ZOOM}
            onClick={() => setZoom((z) => Math.max(MIN_ZOOM, z - 1))}
          />
        </Box>

        {/* Required by the OSM tile usage policy. In the opposite corner from
            the controls, where a web map's data credit belongs. */}
        <Box
          className={CHROME_CLASS}
          paddingX={6}
          paddingY={2}
          backgroundColor="color-mix(in srgb, var(--background) 78%, transparent)"
          styles={{ position: 'absolute', left: 0, bottom: 0, zIndex: 2 }}
        >
          <a href={OSM_COPYRIGHT} target="_blank" rel="noopener noreferrer">
            <Typography as="span" variant="label" color="var(--foreground)">
              {labels.attribution}
            </Typography>
          </a>
        </Box>
      </Box>
    </Box>
  );
}

/** The card a marker opens: what was seen, where, when, and the way in. */
function MarkerCard({
  marker,
  labels,
  onClose,
}: {
  marker: SightingMarker;
  labels: Props['labels'];
  onClose: () => void;
}) {
  return (
    <Card padding={0} gap={0} styles={{ overflow: 'hidden' }}>
      {marker.image && (
        <Box
          height={104}
          width="100%"
          styles={{ position: 'relative', overflow: 'hidden' }}
        >
          <Image
            src={marker.image}
            alt=""
            fill
            unoptimized
            style={{ objectFit: 'cover' }}
          />
        </Box>
      )}

      <Box flexDirection="column" gap={6} padding={12}>
        <Box
          display="flex"
          alignItems="flex-start"
          justifyContent="space-between"
          gap={6}
        >
          <Typography as="h3" variant="h6" fontWeight={700}>
            {marker.title}
          </Typography>
          <Button
            unstyled
            text="×"
            aria-label={labels.close}
            title={labels.close}
            onClick={onClose}
            color="var(--foreground)"
            paddingX={4}
            styles={{ cursor: 'pointer', lineHeight: 1 }}
          />
        </Box>

        {marker.speciesName && (
          <Typography variant="caption" color="var(--foreground-muted, #6b7280)">
            {marker.speciesName}
          </Typography>
        )}

        <Typography variant="caption" color="var(--foreground-muted, #6b7280)">
          {marker.locationName
            ? `${marker.dateLabel} · ${marker.locationName}`
            : marker.dateLabel}
        </Typography>

        {/* The API blurs the pair to ~1 km for *every* caller when the place is
            flagged sensitive, so this says so rather than implying an exact pin. */}
        {marker.approximate && (
          <Typography variant="label" color="var(--foreground-muted, #6b7280)">
            {labels.approximate}
          </Typography>
        )}

        <Link href={marker.href} prefetch className="sm__link">
          <Typography
            as="span"
            variant="label"
            fontWeight={700}
            color="var(--accent, #06b6d4)"
          >
            {labels.seeDetail}
          </Typography>
        </Link>
      </Box>
    </Card>
  );
}

/**
 * A screen-pixel offset per marker, spreading the ones that share a coordinate
 * around a small circle.
 *
 * Co-location is the *normal* case here, not an edge one: an entry with no
 * coordinates of its own inherits its location's centre, so a season of visits
 * to one pond is a season of identical pins. Stacked, they read as a single
 * sighting.
 */
function fanOffsets(markers: SightingMarker[]): Map<number, { x: number; y: number }> {
  const groups = new Map<string, SightingMarker[]>();
  for (const marker of markers) {
    // Five decimals is about a metre - closer than that is the same spot by any
    // reading, and rounding is what makes two independently-entered pins group.
    const key = `${marker.latitude.toFixed(5)},${marker.longitude.toFixed(5)}`;
    const group = groups.get(key);
    if (group) group.push(marker);
    else groups.set(key, [marker]);
  }

  const offsets = new Map<number, { x: number; y: number }>();
  for (const group of groups.values()) {
    if (group.length === 1) continue;
    // Rings of eight, so a place with twenty entries fans rather than overlaps
    // on one increasingly crowded circle.
    group.forEach((marker, index) => {
      const ring = Math.floor(index / 8) + 1;
      const angle = ((index % 8) / 8) * 2 * Math.PI;
      offsets.set(marker.id, {
        x: Math.cos(angle) * FAN_RADIUS * ring,
        y: Math.sin(angle) * FAN_RADIUS * ring,
      });
    });
  }
  return offsets;
}

/**
 * Re-centres so the coordinate under the pointer stays there across a zoom.
 * `lib/mercator.ts` has the general version; this is it with the viewport's own
 * top-left already subtracted by the caller.
 */
function zoomAboutPointer(
  center: LatLng,
  from: number,
  to: number,
  px: number,
  py: number,
  size: Size,
): LatLng {
  const origin = originOf(center, from, size);
  const anchor = fromWorld({ x: origin.x + px, y: origin.y + py }, from);
  const world = toWorld(anchor, to);
  return fromWorld(
    { x: world.x + size.width / 2 - px, y: world.y + size.height / 2 - py },
    to,
  );
}

/**
 * Where the map opens before the viewport has been measured (and `fitBounds`
 * can run): the first pin, or the geographic middle of Mexico when there are
 * none - which is where this journal is kept.
 */
function firstPoint(markers: SightingMarker[]): LatLng {
  const first = markers[0];
  if (!first) return { latitude: 23.6345, longitude: -102.5528 };
  return { latitude: first.latitude, longitude: first.longitude };
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

export default SightingsMap;
