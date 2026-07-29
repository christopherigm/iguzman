'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { Box } from '@repo/ui/core-elements/box';
import { Typography } from '@repo/ui/core-elements/typography';
import { Button } from '@repo/ui/core-elements/button';
import { TextInput } from '@repo/ui/core-elements/text-input';
import {
  TILE_SIZE,
  fromWorld,
  originOf,
  tilesFor,
  toWorld,
  viewportToLatLng,
  zoomAbout,
  type LatLng,
  type Size,
} from '@/lib/mercator';
import './map-picker.css';

/**
 * A click-to-pick coordinate map, drawn from OpenStreetMap raster tiles.
 *
 * ⚠ **Why this is not Google.** Google's keyless embed
 * (`maps.google.com/maps?...&output=embed`, which `@repo/ui`'s `LocationMap`
 * uses to *display* a pin) is a cross-origin iframe: nothing on this page can
 * ever read a click inside it. A real picker therefore needs either a Maps
 * JavaScript API key - which this deployment does not have - or a tile source
 * that can be drawn into our own DOM. This is the latter, hand-rolled rather
 * than pulled from Leaflet so the app keeps its zero map dependencies and the
 * tiles inherit the CMS's own theming.
 *
 * The projection itself lives in `lib/mercator.ts`, shared with the public
 * `SightingsMap`: a tile is a 256 px square of a world that is `256 * 2^zoom`
 * pixels wide, so a lat/lng converts to a world pixel and back, and everything
 * else - which tiles to draw, where the pin lands, what a click means - falls
 * out of that pair of functions. What is left here is the *picking*.
 */

const MIN_ZOOM = 2;
const MAX_ZOOM = 18;
/** Zoom used once a place is known: a village-sized frame, not a continent. */
const PLACE_ZOOM = 15;
/** Zoom used when nothing at all is known and the map opens on the default centre. */
const WIDE_ZOOM = 4;
/**
 * Where the map opens when there is no pin and no location to borrow one from:
 * the geographic middle of Mexico, which is where this journal is kept.
 */
const DEFAULT_CENTER = { latitude: 23.6345, longitude: -102.5528 };
/** Pointer travel (px) below which a press counts as a click rather than a drag. */
const DRAG_THRESHOLD = 4;
/** What the API stores: `DecimalField(max_digits=9, decimal_places=6)`. */
const COORD_DECIMALS = 6;

/**
 * Hit-test hooks, not styling: the pointer handlers are attached to the whole
 * viewport, so they ask `closest()` whether a press landed on the pin (drag it)
 * or on the chrome floating over the map (leave it alone).
 */
const PIN_CLASS = 'mp__pin';
const CHROME_CLASS = 'mp__chrome';

const TILE_HOST = 'https://tile.openstreetmap.org';
const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
const OSM_COPYRIGHT = 'https://www.openstreetmap.org/copyright';

const clampZoom = (zoom: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));

/** A finite pair, or null - `''`, a half-typed `-` and `NaN` all mean "no pin". */
function parseCoords(latitude: string, longitude: string): LatLng | null {
  const lat = Number(latitude);
  const lng = Number(longitude);
  if (latitude.trim() === '' || longitude.trim() === '') return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { latitude: lat, longitude: lng };
}

// ── Props ──────────────────────────────────────────────────────────────────

export interface MapPickerProps {
  /** The form's own latitude value, as it is stored: a string, `''` when unset. */
  latitude: string;
  longitude: string;
  /** Both coordinates at once, already rounded to what the column accepts. */
  onChange: (latitude: string, longitude: string) => void;
  /**
   * Where to open when there is no pin yet - the chosen location's own
   * coordinates, so a new entry starts over the right valley rather than over
   * the middle of the country.
   */
  fallbackCenter?: LatLng | null;
  /** Height of the map viewport. @default 340 */
  height?: number;
}

type SearchResult = {
  id: string;
  label: string;
  latitude: number;
  longitude: number;
};

// ── MapPicker ──────────────────────────────────────────────────────────────

export function MapPicker({
  latitude,
  longitude,
  onChange,
  fallbackCenter,
  height = 340,
}: MapPickerProps) {
  const t = useTranslations('Admin');

  const pin = useMemo(() => parseCoords(latitude, longitude), [latitude, longitude]);

  const [center, setCenter] = useState<LatLng>(() => pin ?? fallbackCenter ?? DEFAULT_CENTER);
  const [zoom, setZoom] = useState<number>(() => (pin || fallbackCenter ? PLACE_ZOOM : WIDE_ZOOM));
  const [size, setSize] = useState<Size>({ width: 0, height: 0 });
  /** The pin's live position while it is being dragged; the form is written on release. */
  const [draftPin, setDraftPin] = useState<LatLng | null>(null);

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const viewportRef = useRef<HTMLDivElement>(null);

  // ── Writing back ──────────────────────────────────────────────────────────

  /**
   * The last pair this component itself wrote. The camera follows a pin that
   * changed *elsewhere* (someone typing into the Latitude field below), but it
   * must not follow our own click - or every click would yank the map so the
   * new pin sat dead centre under the cursor.
   */
  const [emitted, setEmitted] = useState<string | null>(null);

  const emit = useCallback(
    (next: LatLng | null) => {
      if (!next) {
        setEmitted(',');
        onChange('', '');
        return;
      }
      const lat = next.latitude.toFixed(COORD_DECIMALS);
      const lng = next.longitude.toFixed(COORD_DECIMALS);
      setEmitted(`${lat},${lng}`);
      onChange(lat, lng);
    },
    [onChange],
  );

  // ── Following the form ────────────────────────────────────────────────────
  //
  // Adjusting state while rendering, rather than in an effect: the camera is a
  // *derivation* of the pin and the chosen location that the author then takes
  // over by panning, which is exactly the case React's "adjusting state when a
  // prop changes" pattern covers - and it re-renders before painting, so the
  // map never shows one frame at the old centre.
  //
  // Both keys are strings, not objects, because the parent re-renders on every
  // keystroke anywhere in the form; keyed on identity this would re-centre the
  // map - undoing the author's panning - each time they typed.
  const fallbackLat = fallbackCenter?.latitude ?? null;
  const fallbackLng = fallbackCenter?.longitude ?? null;
  const pinKey = `${latitude},${longitude}`;
  const fallbackKey = `${fallbackLat},${fallbackLng}`;

  const [synced, setSynced] = useState({ pin: pinKey, fallback: fallbackKey });
  if (synced.pin !== pinKey || synced.fallback !== fallbackKey) {
    const followPin = synced.pin !== pinKey && pinKey !== emitted && pin !== null;
    // With no pin of its own the entry inherits its location's coordinates, so
    // the map follows whichever location the author picks above.
    const followFallback =
      !followPin &&
      synced.fallback !== fallbackKey &&
      pin === null &&
      fallbackLat !== null &&
      fallbackLng !== null;
    setSynced({ pin: pinKey, fallback: fallbackKey });
    if (followPin) {
      setCenter(pin);
      setZoom((current) => Math.max(current, PLACE_ZOOM));
    } else if (followFallback) {
      setCenter({ latitude: fallbackLat, longitude: fallbackLng });
      setZoom((current) => Math.max(current, PLACE_ZOOM));
    }
  }

  // The pointer handlers are attached imperatively (below) and must not be
  // re-bound on every camera change - a listener swapped out mid-drag would drop
  // the gesture - so they read the current camera, size, pin and writer through
  // refs, refreshed after each render.
  const cameraRef = useRef({ center, zoom });
  const sizeRef = useRef(size);
  const pinRef = useRef(pin);
  const emitRef = useRef(emit);
  useEffect(() => {
    cameraRef.current = { center, zoom };
    sizeRef.current = size;
    pinRef.current = pin;
    emitRef.current = emit;
  });

  // ── Viewport size ─────────────────────────────────────────────────────────

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

  // ── Pointer, wheel and keyboard ───────────────────────────────────────────

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;

    let drag: {
      pointerId: number;
      startX: number;
      startY: number;
      camera: { center: LatLng; zoom: number };
      origin: LatLng | null;
      onPin: boolean;
      moved: boolean;
    } | null = null;

    const localPoint = (e: PointerEvent) => {
      const rect = el.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };

    const handlePointerDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      const target = e.target as HTMLElement | null;
      // The zoom buttons and the attribution link sit inside the viewport; a
      // press on either is theirs, not the start of a pan.
      if (target?.closest(`.${CHROME_CLASS}`)) return;
      const onPin = Boolean(target?.closest(`.${PIN_CLASS}`));
      drag = {
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        camera: cameraRef.current,
        origin: onPin ? pinRef.current : null,
        onPin,
        moved: false,
      };
      el.setPointerCapture(e.pointerId);
      // Stops the browser turning the gesture into a text selection or a scroll.
      e.preventDefault();
    };

    const handlePointerMove = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.pointerId) return;
      const dx = e.clientX - drag.startX;
      const dy = e.clientY - drag.startY;
      if (!drag.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
      drag.moved = true;
      const { center: from, zoom: z } = drag.camera;

      if (drag.onPin) {
        // The pin moves with the pointer and the camera stays put.
        const base = drag.origin ?? from;
        const world = toWorld(base, z);
        setDraftPin(fromWorld({ x: world.x + dx, y: world.y + dy }, z));
        return;
      }
      // The camera moves *against* the pointer, so the map follows the hand.
      const world = toWorld(from, z);
      setCenter(fromWorld({ x: world.x - dx, y: world.y - dy }, z));
    };

    const handlePointerUp = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.pointerId) return;
      const finished = drag;
      drag = null;
      if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);

      if (finished.onPin) {
        if (finished.moved) {
          const dx = e.clientX - finished.startX;
          const dy = e.clientY - finished.startY;
          const base = finished.origin ?? finished.camera.center;
          const world = toWorld(base, finished.camera.zoom);
          emitRef.current(fromWorld({ x: world.x + dx, y: world.y + dy }, finished.camera.zoom));
        }
        setDraftPin(null);
        return;
      }
      // A press that never travelled is a click: drop the pin where it landed.
      if (!finished.moved) {
        const { x, y } = localPoint(e);
        const { center: c, zoom: z } = cameraRef.current;
        emitRef.current(viewportToLatLng(c, z, sizeRef.current, x, y));
      }
    };

    const handleWheel = (e: WheelEvent) => {
      // Non-passive on purpose: without preventDefault the page scrolls away
      // under the cursor while the map zooms.
      e.preventDefault();
      const { center: c, zoom: z } = cameraRef.current;
      const next = clampZoom(z + (e.deltaY < 0 ? 1 : -1));
      if (next === z) return;
      const rect = el.getBoundingClientRect();
      setCenter(
        zoomAbout(c, z, next, e.clientX - rect.left, e.clientY - rect.top, sizeRef.current),
      );
      setZoom(next);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
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
          setZoom((z) => clampZoom(z + 1));
          break;
        case '-':
        case '_':
          setZoom((z) => clampZoom(z - 1));
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
    };
  }, []);

  // ── Search ────────────────────────────────────────────────────────────────

  const searchAbortRef = useRef<AbortController | null>(null);
  useEffect(() => () => searchAbortRef.current?.abort(), []);

  const runSearch = useCallback(async () => {
    const q = query.trim();
    if (!q) return;
    searchAbortRef.current?.abort();
    const controller = new AbortController();
    searchAbortRef.current = controller;
    setSearching(true);
    setSearchError(null);
    setResults(null);
    try {
      // Nominatim is keyless but rate-limited to roughly one call a second,
      // which is why this runs on an explicit submit rather than as you type.
      const url = `${NOMINATIM_URL}?format=jsonv2&limit=5&q=${encodeURIComponent(q)}`;
      const res = await fetch(url, {
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(String(res.status));
      const rows: {
        place_id?: number;
        lat?: string;
        lon?: string;
        display_name?: string;
      }[] = await res.json();
      setResults(
        rows
          .map((row, index) => ({
            id: String(row.place_id ?? index),
            label: row.display_name ?? '',
            latitude: Number(row.lat),
            longitude: Number(row.lon),
          }))
          .filter((row) => Number.isFinite(row.latitude) && Number.isFinite(row.longitude)),
      );
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') return;
      setSearchError(t('mapSearchError'));
    } finally {
      if (!controller.signal.aborted) setSearching(false);
    }
  }, [query, t]);

  const chooseResult = (result: SearchResult) => {
    const next = { latitude: result.latitude, longitude: result.longitude };
    setCenter(next);
    setZoom((current) => Math.max(current, PLACE_ZOOM));
    emit(next);
    setResults(null);
    setQuery(result.label);
  };

  // ── Tiles ─────────────────────────────────────────────────────────────────

  const origin = useMemo(() => originOf(center, zoom, size), [center, zoom, size]);

  const tiles = useMemo(() => tilesFor(origin, size, zoom, TILE_HOST), [origin, size, zoom]);

  const shownPin = draftPin ?? pin;
  const pinOffset = shownPin
    ? (() => {
        const world = toWorld(shownPin, zoom);
        return { left: world.x - origin.x, top: world.y - origin.y };
      })()
    : null;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <Box flexDirection="column" gap={10}>
      <Box
        display="flex"
        alignItems="baseline"
        justifyContent="space-between"
        gap={12}
        flexWrap="wrap"
      >
        <Typography
          as="h3"
          variant="label"
          fontWeight={800}
          color="var(--foreground)"
          styles={{ letterSpacing: '0.06em', textTransform: 'uppercase' }}
        >
          {t('mapPickerTitle')}
        </Typography>
        {shownPin && <Button text={t('mapClearPin')} size="sm" onClick={() => emit(null)} />}
      </Box>

      <Typography variant="caption" color="var(--foreground)">
        {t('mapPickerHint')}
      </Typography>

      {/* ── Place search ── */}
      <Box display="flex" alignItems="flex-end" gap={8} flexWrap="wrap">
        <TextInput
          label={t('mapSearchLabel')}
          value={query}
          onChange={setQuery}
          placeholder={t('mapSearchPlaceholder')}
          flex={1}
          minWidth={220}
          onKeyDown={(e) => {
            // This picker lives inside AdminForm's <form>: an un-swallowed
            // Enter would save the whole record instead of running the search.
            if (e.key !== 'Enter') return;
            e.preventDefault();
            void runSearch();
          }}
        />
        <Button
          text={searching ? t('mapSearching') : t('mapSearchAction')}
          icon="/icons/search.svg"
          size="md"
          disabled={searching || query.trim() === ''}
          onClick={() => void runSearch()}
        />
      </Box>

      {searchError && (
        <Typography variant="caption" color="var(--error, #e53935)">
          {searchError}
        </Typography>
      )}

      {results !== null && results.length === 0 && !searching && (
        <Typography variant="caption" color="var(--foreground)">
          {t('mapSearchEmpty')}
        </Typography>
      )}

      {results !== null && results.length > 0 && (
        <Box
          flexDirection="column"
          border="1px solid color-mix(in srgb, var(--foreground) 15%, transparent)"
          borderRadius={8}
          styles={{ overflow: 'hidden' }}
        >
          {results.map((result) => (
            <Button
              key={result.id}
              unstyled
              text={result.label}
              onClick={() => chooseResult(result)}
              padding="8px 10px"
              width="100%"
              color="var(--foreground)"
              className="mp__result"
              styles={{ textAlign: 'left', cursor: 'pointer' }}
            />
          ))}
        </Box>
      )}

      {/* ── The map itself ── */}
      <Box
        ref={viewportRef}
        role="application"
        aria-label={t('mapPickerTitle')}
        tabIndex={0}
        height={height}
        borderRadius={12}
        border="1px solid color-mix(in srgb, var(--foreground) 18%, transparent)"
        backgroundColor="var(--surface-2)"
        styles={{
          position: 'relative',
          overflow: 'hidden',
          cursor: 'crosshair',
          touchAction: 'none',
          userSelect: 'none',
        }}
      >
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

        {pinOffset && (
          // A teardrop: a circle with its bottom-left corner squared off, turned
          // 45° so that corner becomes the point resting on the coordinate.
          <Box
            className={PIN_CLASS}
            aria-hidden
            width={22}
            height={22}
            backgroundColor="var(--accent, #06b6d4)"
            border="2px solid #ffffff"
            styles={{
              position: 'absolute',
              left: pinOffset.left,
              top: pinOffset.top,
              borderRadius: '50% 50% 50% 0',
              transform: 'translate(-50%, -100%) rotate(-45deg)',
              transformOrigin: 'bottom left',
              boxShadow: '0 2px 6px rgba(0, 0, 0, 0.4)',
              cursor: 'grab',
            }}
          />
        )}

        {/* ── Zoom controls ── */}
        <Box
          className={CHROME_CLASS}
          flexDirection="column"
          gap={6}
          styles={{ position: 'absolute', top: 10, right: 10, zIndex: 2 }}
        >
          <Button
            text="+"
            size="md"
            aria-label={t('mapZoomIn')}
            title={t('mapZoomIn')}
            disabled={zoom >= MAX_ZOOM}
            onClick={() => setZoom((z) => clampZoom(z + 1))}
          />
          <Button
            text="−"
            size="md"
            aria-label={t('mapZoomOut')}
            title={t('mapZoomOut')}
            disabled={zoom <= MIN_ZOOM}
            onClick={() => setZoom((z) => clampZoom(z - 1))}
          />
        </Box>

        {/* ── Attribution (required by the OSM tile usage policy) ── */}
        <Box
          className={CHROME_CLASS}
          paddingX={6}
          paddingY={2}
          backgroundColor="color-mix(in srgb, var(--background) 78%, transparent)"
          styles={{ position: 'absolute', right: 0, bottom: 0, zIndex: 2 }}
        >
          <a href={OSM_COPYRIGHT} target="_blank" rel="noopener noreferrer">
            <Typography as="span" variant="label" color="var(--foreground)">
              {t('mapAttribution')}
            </Typography>
          </a>
        </Box>
      </Box>
    </Box>
  );
}

export default MapPicker;
