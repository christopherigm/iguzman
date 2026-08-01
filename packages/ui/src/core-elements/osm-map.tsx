"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Image from "next/image";
import { Box } from "./box";
import { IconButton } from "./icon-button";
import { Typography } from "./typography";
import { useScrollLock } from "./use-scroll-lock";
import {
  fitBounds,
  fromWorld,
  originOf,
  tilesFor,
  toWorld,
  type LatLng,
  type Size,
} from "./mercator";
import {
  OSM_CHROME_CLASS,
  OSM_DRAG_THRESHOLD,
  OSM_GEOLOCATION_OPTIONS,
  OSM_HINT_MS,
  OSM_MARKER_CLASS,
  OSM_MARKER_SIZE,
  OSM_MARKER_TIP_HEIGHT,
  OSM_TILE_HOST,
  OSM_ZOOM_WHEEL_STEP,
  OsmAttribution,
  OsmGestureHint,
  OsmTileLayer,
  OsmUserMarker,
  OsmZoomControl,
} from "./osm-map-chrome";
import "./osm-map.css";

/**
 * An interactive map drawn from **OpenStreetMap raster tiles**, with a marker per
 * coordinate and an optional card per marker.
 *
 * ⚠ **This replaced the keyless Google embed** (`LocationMap`, an iframe on
 * `maps.google.com/maps?...&output=embed`) everywhere in the monorepo. That was a
 * *cross-origin iframe*: nothing on the page could draw over it, read a click
 * inside it, or give its single pin a mark of its own - which is precisely what
 * every consumer here wants (a species' glyph, a branch's logo). This component
 * paints the tiles into its own DOM instead, so the markers are ours. The
 * projection is `./mercator.ts`, shared with `apps/animals`' CMS map picker -
 * one Web Mercator, so a pin cannot land a pixel off the tile beneath it in one
 * of them.
 *
 * ⚠ **It makes third-party requests from the visitor's browser** -
 * `tile.openstreetmap.org`, one image per 256 px square on screen. Nothing else
 * is fetched: there is no geocoding here, so Nominatim is not involved. The OSM
 * tile usage policy asks for the attribution this renders in the corner; leave
 * it there.
 *
 * Four things worth knowing before changing it:
 *
 * - **The wheel is cooperative: a bare scroll belongs to the page.** A map that
 *   swallows every wheel event traps a reader scrolling past it - the page stops
 *   and the map zooms out to the Atlantic instead. Zooming needs `Ctrl`/`⌘` +
 *   wheel - which is also how every browser reports a **trackpad pinch**, so the
 *   same branch serves both - or a two-finger pinch on a touchscreen, or the
 *   buttons, or the keyboard. A bare scroll raises a scrim saying so, the way
 *   Google's own embeds do. Don't "fix" it back to plain wheel zoom.
 * - **The camera refits when the marker set changes, and not otherwise.** It is
 *   adjusted *during render* (React's "adjusting state when a prop changes"
 *   pattern), keyed on a string rather than on the array's identity - an effect
 *   keyed on an object would fight the reader's own panning on every parent
 *   re-render.
 * - **Markers at the same coordinate are fanned out**, in *screen* pixels, so
 *   the fan stays legible at every zoom rather than dissolving as you zoom out.
 *   Co-location is normal, not an edge case: a record with no coordinates of its
 *   own usually inherits its place's centre.
 * - **The tiles are colour-graded** by a CSS filter on their own layer
 *   (`osm-map.css`), light and dark, because OSM's cartography is far louder
 *   than the pages it sits on. The tiles themselves cannot be restyled - they
 *   arrive as finished PNGs.
 * - **The reader is never located until they ask.** `locateControl` renders a
 *   button; nothing here calls `navigator.geolocation` on mount. See the note
 *   on the prop.
 *
 * This package is i18n-agnostic, so every string arrives through `labels`.
 */

const MIN_ZOOM = 2;
const MAX_ZOOM = 17;
/**
 * The zoom a locate lands on when the map was framed wider than it. Centring on
 * the reader at a continental zoom answers "where am I?" with a pin in the
 * middle of a country, so a coarser camera is pulled in - but a reader already
 * looking at a street keeps their own, closer, framing.
 */
const LOCATE_ZOOM = 13;
/** Deepest zoom `fitBounds` may choose - a single pin should not open on rooftops. */
const DEFAULT_MAX_FIT_ZOOM = 13;
/** How far outside the viewport a marker is still rendered, in px. */
const CULL_MARGIN = 80;
/** Radius of the fan applied to markers sharing one coordinate. */
const FAN_RADIUS = 15;
/** Width of a marker's card, and how far from an edge it may be drawn. */
const DEFAULT_POPUP_WIDTH = 228;

/**
 * What the locate and fullscreen buttons wear. An `IconButton`'s own default is
 * a faint tint over whatever is behind it, which over a map is a road: these sit
 * on the same opaque plate as the zoom control, so the two controls read as one
 * set of chrome rather than two.
 */
const CONTROL_STYLE = {
  iconColor: "var(--foreground)",
  backgroundColor: "var(--surface-1, #ffffff)",
  border: "1px solid color-mix(in srgb, var(--foreground) 14%, transparent)",
  elevation: 2,
} as const;

/** One pin. Consumers extend this with whatever their own card needs. */
export interface OsmMapMarker {
  id: string | number;
  latitude: number;
  longitude: number;
  /** The marker's accessible name - a screen reader has no pin to look at. */
  title: string;
  /** A glyph drawn inside the pin's head. */
  icon?: string | null;
  /** The pin's fill when there is no glyph. */
  color?: string | null;
}

/** Every string the map renders. The package translates nothing itself. */
export interface OsmMapLabels {
  /** Names the map region itself (`aria-label` on the viewport). */
  map: string;
  zoomIn: string;
  zoomOut: string;
  /** The OSM data credit, e.g. "© OpenStreetMap contributors". */
  attribution: string;
  /** The scrim a bare wheel raises. Both spellings travel; the client picks. */
  zoomHint: string;
  zoomHintMac: string;
  /** Shown over the map when there is nothing to pin. */
  empty?: string;
  /**
   * Names the visitor's own pin. Defaults to English, like `ConfirmationModal`'s
   * buttons - it is only rendered when `locateControl` is on.
   */
  yourLocation?: string;
  /** Names the locate button. English default, like `yourLocation`. */
  locate?: string;
  /** Names the fullscreen button, and the close button that replaces it. */
  enterFullscreen?: string;
  exitFullscreen?: string;
}

export interface OsmMapProps<M extends OsmMapMarker = OsmMapMarker> {
  markers: M[];
  labels: OsmMapLabels;
  /** Height of the map viewport. @default 420 */
  height?: number;
  /**
   * Deepest zoom the initial framing may choose. @default 13 - a single pin
   * otherwise opens on rooftops, which reads as precision the data rarely has.
   */
  maxFitZoom?: number;
  /**
   * The card a marker opens. Omit it and the markers are **not interactive** -
   * they render as labelled images rather than buttons, which is what a
   * single-pin "here we are" map wants.
   */
  renderPopup?: (marker: M, close: () => void) => ReactNode;
  /** Width of that card. @default 228 */
  popupWidth?: number;
  /**
   * Offer a button that pins where the visitor is. @default false
   *
   * ⚠ **Nothing here asks for the geolocation permission until that button is
   * pressed.** This map used to locate the reader on mount, which put a browser
   * permission dialog in front of anyone who merely scrolled onto a page
   * carrying a map - a prompt they clicked nothing to get, and one a refusal
   * makes permanent for the origin. The button is the click that asks.
   *
   * A refusal, a device with no fix, and an insecure origin are all the same
   * path: no pin, no message, the map exactly as it was - so never write a
   * branch that reports the failure.
   *
   * A *press* does move the camera - centring on the reader is the whole point
   * of asking, and a pin drawn silently outside the viewport reads as a button
   * that did nothing. The **initial framing** still belongs to `markers` alone.
   */
  locateControl?: boolean;
  /**
   * Offer a button that blows the map up to fill the viewport. @default false
   *
   * A CSS overlay (`position: fixed`), not the Fullscreen API: `requestFullscreen`
   * on an element is still unsupported on iPhone Safari, where the button would
   * simply be dead. `Escape` leaves it, and so does the close button that
   * replaces this one while it is open.
   */
  fullscreenControl?: boolean;
  /**
   * The three control glyphs. Defaulted to the paths every app in this monorepo
   * keeps them at, so a consumer only names one it has moved.
   */
  locateIcon?: string;
  fullscreenIcon?: string;
  closeIcon?: string;
  className?: string;
}

export function OsmMap<M extends OsmMapMarker = OsmMapMarker>({
  markers,
  labels,
  height = 420,
  maxFitZoom = DEFAULT_MAX_FIT_ZOOM,
  renderPopup,
  popupWidth = DEFAULT_POPUP_WIDTH,
  locateControl = false,
  fullscreenControl = false,
  locateIcon = "/icons/location-arrow.svg",
  fullscreenIcon = "/icons/fullscreen.svg",
  closeIcon = "/icons/close.svg",
  className,
}: OsmMapProps<M>) {
  const [size, setSize] = useState<Size>({ width: 0, height: 0 });
  const [center, setCenter] = useState<LatLng>(() => firstPoint(markers));
  const [zoom, setZoom] = useState(maxFitZoom);
  const [selected, setSelected] = useState<string | number | null>(null);
  /** The gesture scrim's text, or `null` when it is down. */
  const [hint, setHint] = useState<string | null>(null);
  /** Where the visitor is - `null` until they ask, and if the browser never says. */
  const [userPoint, setUserPoint] = useState<LatLng | null>(null);
  /** A fix is being waited on: the locate button spins rather than repeating. */
  const [locating, setLocating] = useState(false);
  /** Whether the map is currently blown up over the page. */
  const [fullscreen, setFullscreen] = useState(false);

  const viewportRef = useRef<HTMLDivElement>(null);

  // ── Framing the pins ──────────────────────────────────────────────────────
  //
  // Adjusted while rendering rather than in an effect: the frame is a
  // *derivation* of the pin set that the reader then takes over by panning. Both
  // keys are strings, not objects - keyed on identity this would re-frame the
  // map on every parent re-render, undoing that panning.
  const fitKey = `${size.width}x${size.height}:${markers.map((m) => m.id).join(",")}`;
  const [framed, setFramed] = useState<string | null>(null);
  if (framed !== fitKey && size.width > 0) {
    setFramed(fitKey);
    const fit = fitBounds(markers, size, {
      minZoom: MIN_ZOOM,
      maxZoom: maxFitZoom,
    });
    if (fit) {
      setCenter(fit.center);
      setZoom(fit.zoom);
    }
  }

  // A pin that has just been filtered away must not keep its card open over a
  // map it is no longer on.
  if (selected !== null && !markers.some((m) => m.id === selected)) {
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
  /** Both read by `Escape`, which closes a card before it leaves fullscreen. */
  const fullscreenRef = useRef(fullscreen);
  const selectedRef = useRef(selected);
  useEffect(() => {
    cameraRef.current = { center, zoom };
    sizeRef.current = size;
    labelsRef.current = labels;
    fullscreenRef.current = fullscreen;
    selectedRef.current = selected;
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

  /**
   * The visitor's own position, asked for **when they press the button** and
   * never before - see the note on `locateControl`.
   *
   * Every failure path - the permission refused, no fix, a page served over
   * plain HTTP where the API is not exposed at all - is the same one: leave
   * `userPoint` null and draw the map without it. There is nothing to report,
   * because nothing was promised; the reader either sees their pin or does not.
   * The spinner stops either way, so a second press can try again.
   */
  const locate = () => {
    if (locating) return;
    if (typeof navigator === "undefined" || !navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const point = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        };
        setUserPoint(point);
        // The press is the reader asking to be shown, so the camera follows -
        // unlike the initial framing, which belongs to `markers` alone.
        setCenter(point);
        setZoom((z) => Math.max(z, LOCATE_ZOOM));
        setLocating(false);
      },
      () => setLocating(false),
      OSM_GEOLOCATION_OPTIONS,
    );
  };

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

    /** Wheel travel banked since the last zoom step - see `OSM_ZOOM_WHEEL_STEP`. */
    let wheelTravel = 0;
    let hintTimer: ReturnType<typeof setTimeout> | null = null;

    const raiseHint = (text: string) => {
      setHint(text);
      if (hintTimer) clearTimeout(hintTimer);
      hintTimer = setTimeout(() => setHint(null), OSM_HINT_MS);
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
      if (target?.closest(`.${OSM_CHROME_CLASS}`)) return;

      if (e.pointerType === "touch") {
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
      // ⚠ The pointer is *not* captured here, and must not be: capturing
      // retargets the whole compatibility mouse sequence - `click` included - to
      // the capture element, so a mouse press on a marker would fire the map's
      // click and never the button's, and no card would ever open on a desktop.
      // (Touch is unaffected: its click is synthesised from the tap position,
      // which is why this only ever broke with a mouse.) Capture is taken in
      // `handlePointerMove`, once the press has become a drag and there is a
      // gesture worth keeping when the pointer leaves the viewport - by then the
      // click is one the map wants swallowed anyway.
      //
      // A marker is a real button, so its own click handler selects it - and
      // suppressing the default here would take that click with it.
      if (!target?.closest(`.${OSM_MARKER_CLASS}`)) e.preventDefault();
    };

    const handlePointerMove = (e: PointerEvent) => {
      if (e.pointerType === "touch" && touches.has(e.pointerId)) {
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
          pinch.distance > 0
            ? Math.round(Math.log2(spread / pinch.distance))
            : 0;
        const next = clamp(z + steps, MIN_ZOOM, MAX_ZOOM);
        if (next === z) setCenter(panned);
        else zoomAt({ center: panned, zoom: z }, next, midX, midY);
        return;
      }

      if (!drag || e.pointerId !== drag.pointerId) return;
      // Until the press becomes a pan the pointer is uncaptured, so a button
      // released off the map never reports its `pointerup` here. A move with no
      // button down is that release: drop the gesture rather than pan the map
      // under a cursor that is merely passing over it.
      if (e.pointerType !== "touch" && e.buttons === 0) {
        drag = null;
        return;
      }
      const dx = e.clientX - drag.startX;
      const dy = e.clientY - drag.startY;
      if (!drag.moved && Math.hypot(dx, dy) < OSM_DRAG_THRESHOLD) return;
      if (!drag.moved) {
        // The press has become a pan: take the pointer now, so the drag survives
        // the cursor leaving the map. See the note in `handlePointerDown` for
        // why this cannot happen any earlier.
        el.setPointerCapture(e.pointerId);
      }
      drag.moved = true;
      draggedRef.current = true;
      // The camera moves *against* the pointer, so the map follows the hand.
      const { center: from, zoom: z } = drag.camera;
      const world = toWorld(from, z);
      setCenter(fromWorld({ x: world.x - dx, y: world.y - dy }, z));
    };

    const handlePointerUp = (e: PointerEvent) => {
      if (e.pointerType === "touch") {
        touches.delete(e.pointerId);
        // The finger left over from a pinch keeps no baseline worth panning
        // from, so nothing resumes until it lifts too.
        if (touches.size < 2) pinch = null;
      }
      if (!drag || e.pointerId !== drag.pointerId) return;
      drag = null;
      if (el.hasPointerCapture(e.pointerId))
        el.releasePointerCapture(e.pointerId);
    };

    const handleWheel = (e: WheelEvent) => {
      // ⚠ A bare wheel is the page's, not the map's. Swallowing it is what makes
      // scrolling past a map snag on it, so the map only takes the wheel when
      // the reader says it is a zoom - `ctrlKey` being both "Ctrl held" and how
      // every browser reports a trackpad pinch.
      if (!e.ctrlKey && !e.metaKey) {
        raiseHint(
          isMacRef.current
            ? labelsRef.current.zoomHintMac
            : labelsRef.current.zoomHint,
        );
        return;
      }
      // Non-passive on purpose: Ctrl + wheel is the browser's own page-zoom, and
      // this is where that is taken over.
      e.preventDefault();
      dropHint();

      wheelTravel += e.deltaY;
      if (Math.abs(wheelTravel) < OSM_ZOOM_WHEEL_STEP) return;
      const direction = wheelTravel < 0 ? 1 : -1;
      wheelTravel = 0;

      const camera = cameraRef.current;
      const next = clamp(camera.zoom + direction, MIN_ZOOM, MAX_ZOOM);
      if (next === camera.zoom) return;
      zoomAt(camera, next, e.clientX, e.clientY);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        // While the map is fullscreen, `Escape` is the window listener's - it
        // has to answer whether or not the viewport itself holds focus, and two
        // handlers would otherwise close the card *and* leave fullscreen on one
        // press.
        if (!fullscreenRef.current) setSelected(null);
        return;
      }
      const step = e.shiftKey ? 200 : 60;
      const pan = (dx: number, dy: number) => {
        const { center: c, zoom: z } = cameraRef.current;
        const world = toWorld(c, z);
        setCenter(fromWorld({ x: world.x + dx, y: world.y + dy }, z));
      };
      switch (e.key) {
        case "ArrowUp":
          pan(0, -step);
          break;
        case "ArrowDown":
          pan(0, step);
          break;
        case "ArrowLeft":
          pan(-step, 0);
          break;
        case "ArrowRight":
          pan(step, 0);
          break;
        case "+":
        case "=":
          setZoom((z) => Math.min(MAX_ZOOM, z + 1));
          break;
        case "-":
        case "_":
          setZoom((z) => Math.max(MIN_ZOOM, z - 1));
          break;
        default:
          return;
      }
      e.preventDefault();
    };

    el.addEventListener("pointerdown", handlePointerDown);
    el.addEventListener("pointermove", handlePointerMove);
    el.addEventListener("pointerup", handlePointerUp);
    el.addEventListener("pointercancel", handlePointerUp);
    el.addEventListener("wheel", handleWheel, { passive: false });
    el.addEventListener("keydown", handleKeyDown);
    return () => {
      el.removeEventListener("pointerdown", handlePointerDown);
      el.removeEventListener("pointermove", handlePointerMove);
      el.removeEventListener("pointerup", handlePointerUp);
      el.removeEventListener("pointercancel", handlePointerUp);
      el.removeEventListener("wheel", handleWheel);
      el.removeEventListener("keydown", handleKeyDown);
      if (hintTimer) clearTimeout(hintTimer);
    };
  }, []);

  /**
   * What being fullscreen costs the page underneath: its scroll, and its
   * `Escape`.
   *
   * The listener is on the window rather than on the viewport because the map
   * covering the whole screen does not mean it holds focus - a reader who got
   * here with the mouse has focus wherever they left it, and `Escape` still has
   * to let them out. It closes an open card first, so the key unwinds one layer
   * per press.
   *
   * The scroll lock is what stops the page drifting behind the overlay: without
   * it a wheel over the map (which this map deliberately gives back to the page)
   * scrolls the document underneath, and leaving fullscreen lands the reader
   * somewhere they never went. It is `useScrollLock` rather than a local
   * `document.body.style.overflow` - the copy that used to sit here locked the
   * wrong element and did nothing in any app whose `globals.css` sets
   * `html { overflow-x: hidden }`, which is all of them.
   */
  useScrollLock(fullscreen);

  useEffect(() => {
    if (!fullscreen) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (selectedRef.current !== null) setSelected(null);
      else setFullscreen(false);
    };
    window.addEventListener("keydown", handleEscape);

    return () => {
      window.removeEventListener("keydown", handleEscape);
    };
  }, [fullscreen]);

  // ── Placement ─────────────────────────────────────────────────────────────

  const origin = useMemo(
    () => originOf(center, zoom, size),
    [center, zoom, size],
  );
  const tiles = useMemo(
    () => tilesFor(origin, size, zoom, OSM_TILE_HOST),
    [origin, size, zoom],
  );

  /**
   * Where each marker is drawn, culled to what is on screen. The fan for
   * co-located markers is applied here, in screen pixels, so it holds its shape
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
    const fan = fanOffsets(markers);
    const out: { marker: M; left: number; top: number }[] = [];
    for (const marker of markers) {
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
  }, [markers, origin, zoom, size]);

  /**
   * The visitor's pin, culled the same way. It is placed on its own rather than
   * appended to `markers`: it is not one of the caller's records, so it takes no
   * part in the framing, the fan, or the card a click opens.
   */
  const userPlacement = useMemo(() => {
    if (!userPoint) return null;
    const world = toWorld(userPoint, zoom);
    const left = world.x - origin.x;
    const top = world.y - origin.y;
    if (
      size.width > 0 &&
      (left < -CULL_MARGIN ||
        top < -CULL_MARGIN ||
        left > size.width + CULL_MARGIN ||
        top > size.height + CULL_MARGIN)
    ) {
      return null;
    }
    return { left, top };
  }, [userPoint, origin, zoom, size]);

  const selectedPlacement =
    placed.find((p) => p.marker.id === selected) ?? null;

  const popupInset = popupWidth / 2 + 4;

  // English defaults, like `ConfirmationModal`'s buttons: a control this package
  // renders on its own must still be named when a consumer has not translated it.
  const locateLabel = labels.locate ?? "Show my location";
  const enterFullscreenLabel = labels.enterFullscreen ?? "Fullscreen";
  const exitFullscreenLabel = labels.exitFullscreen ?? "Exit fullscreen";

  return (
    <Box
      ref={viewportRef}
      role="application"
      aria-label={labels.map}
      tabIndex={0}
      height={fullscreen ? "100%" : height}
      borderRadius={fullscreen ? 0 : 8}
      border={
        fullscreen
          ? "none"
          : "1px solid color-mix(in srgb, var(--foreground) 18%, transparent)"
      }
      backgroundColor="var(--surface-2)"
      className={`ui-osm-map__viewport${className ? ` ${className}` : ""}`}
      styles={{
        // Fullscreen is a fixed overlay, not the Fullscreen API - see the note
        // on `fullscreenControl`. The z-index clears `Toast` (1000) so a
        // notification cannot land behind a map filling the screen.
        position: fullscreen ? "fixed" : "relative",
        ...(fullscreen ? { inset: 0, zIndex: 1100, width: "100%" } : {}),
        overflow: "hidden",
        touchAction: "none",
        userSelect: "none",
      }}
    >
      <OsmTileLayer tiles={tiles} />

      {placed.map(({ marker, left, top }) => {
        // No icon at all: the caller's colour still groups the pin, which beats
        // a field of identical grey dots.
        const background = marker.icon
          ? "var(--surface-1, #ffffff)"
          : (marker.color ?? "var(--accent, #06b6d4)");
        const glyph = marker.icon ? (
          <Image
            src={marker.icon}
            alt=""
            width={OSM_MARKER_SIZE}
            height={OSM_MARKER_SIZE}
            unoptimized
            draggable={false}
          />
        ) : null;

        // A map with no card to open has nothing for a click to do, so its pins
        // are not buttons: an unactionable button is a keyboard stop that leads
        // nowhere and a screen-reader promise the map cannot keep. A bare
        // element rather than a `Box`, like the button below and for the same
        // reason - the pin's whole geometry is one shared class, and the two
        // variants must wear it identically or they drift apart.
        if (!renderPopup) {
          return (
            <div
              key={marker.id}
              role="img"
              aria-label={marker.title}
              className={OSM_MARKER_CLASS}
              style={{
                left,
                top,
                width: OSM_MARKER_SIZE,
                height: OSM_MARKER_SIZE,
                background,
              }}
            >
              {glyph}
            </div>
          );
        }

        return (
          <button
            key={marker.id}
            type="button"
            className={`${OSM_MARKER_CLASS}${marker.id === selected ? ` ${OSM_MARKER_CLASS}--on` : ""}`}
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
              width: OSM_MARKER_SIZE,
              height: OSM_MARKER_SIZE,
              background,
            }}
          >
            {glyph}
          </button>
        );
      })}

      {/* The visitor's own pin - the shared one, so it is the same teardrop the
          CMS's picker draws for the author. Never a button: it opens nothing,
          and it is not the caller's to give a card to. */}
      {userPlacement && (
        <OsmUserMarker
          left={userPlacement.left}
          top={userPlacement.top}
          {...(labels.yourLocation ? { label: labels.yourLocation } : {})}
        />
      )}

      {renderPopup && selectedPlacement && (
        <Box
          className={`${OSM_CHROME_CLASS} ui-osm-map__popup`}
          styles={{
            position: "absolute",
            // Clamped to the viewport so a pin near an edge does not open its
            // card half outside the map.
            left: clamp(
              selectedPlacement.left,
              popupInset,
              Math.max(popupInset, size.width - popupInset),
            ),
            // Clear of the pin's head, not its tip: the coordinate is where the
            // pin *points*, and the pin stands above it.
            top: selectedPlacement.top - OSM_MARKER_TIP_HEIGHT - 6,
            transform: "translate(-50%, -100%)",
            zIndex: 3,
            width: popupWidth,
            maxWidth: "calc(100% - 20px)",
          }}
        >
          {renderPopup(selectedPlacement.marker, () => setSelected(null))}
        </Box>
      )}

      {markers.length === 0 && labels.empty && (
        <Box
          className={OSM_CHROME_CLASS}
          padding="10px 14px"
          borderRadius={10}
          backgroundColor="color-mix(in srgb, var(--background) 88%, transparent)"
          styles={{
            position: "absolute",
            left: "50%",
            top: "50%",
            transform: "translate(-50%, -50%)",
            zIndex: 2,
          }}
        >
          <Typography variant="body" color="var(--foreground)">
            {labels.empty}
          </Typography>
        </Box>
      )}

      {hint && <OsmGestureHint text={hint} />}

      {/* The reader's own controls, opposite the zoom stack. The row keeps its
          corner and its order across the toggle - the locate button never
          moves, and the close button simply takes the place the fullscreen one
          held - so nothing has to be found again after the map opens. */}
      {(locateControl || fullscreenControl) && (
        <Box
          className={OSM_CHROME_CLASS}
          gap={8}
          alignItems="center"
          styles={{ position: "absolute", right: 10, top: 10, zIndex: 4 }}
        >
          {locateControl && (
            <IconButton
              icon={locateIcon}
              aria-label={locateLabel}
              title={locateLabel}
              onClick={locate}
              isLoading={locating}
              {...CONTROL_STYLE}
            />
          )}
          {fullscreenControl && (
            <IconButton
              icon={fullscreen ? closeIcon : fullscreenIcon}
              aria-label={
                fullscreen ? exitFullscreenLabel : enterFullscreenLabel
              }
              title={fullscreen ? exitFullscreenLabel : enterFullscreenLabel}
              aria-pressed={fullscreen}
              onClick={() => setFullscreen((on) => !on)}
              {...CONTROL_STYLE}
            />
          )}
        </Box>
      )}

      <OsmZoomControl
        zoomInLabel={labels.zoomIn}
        zoomOutLabel={labels.zoomOut}
        zoomInDisabled={zoom >= MAX_ZOOM}
        zoomOutDisabled={zoom <= MIN_ZOOM}
        onZoomIn={() => setZoom((z) => Math.min(MAX_ZOOM, z + 1))}
        onZoomOut={() => setZoom((z) => Math.max(MIN_ZOOM, z - 1))}
      />

      <OsmAttribution label={labels.attribution} />
    </Box>
  );
}

/**
 * A screen-pixel offset per marker, spreading the ones that share a coordinate
 * around a small circle.
 *
 * Co-location is the *normal* case, not an edge one: a record with no
 * coordinates of its own usually inherits its place's centre, so a season of
 * visits to one pond is a season of identical pins. Stacked, they read as one.
 */
function fanOffsets(
  markers: OsmMapMarker[],
): Map<string | number, { x: number; y: number }> {
  const groups = new Map<string, OsmMapMarker[]>();
  for (const marker of markers) {
    // Five decimals is about a metre - closer than that is the same spot by any
    // reading, and rounding is what makes two independently-entered pins group.
    const key = `${marker.latitude.toFixed(5)},${marker.longitude.toFixed(5)}`;
    const group = groups.get(key);
    if (group) group.push(marker);
    else groups.set(key, [marker]);
  }

  const offsets = new Map<string | number, { x: number; y: number }>();
  for (const group of groups.values()) {
    if (group.length === 1) continue;
    // Rings of eight, so a place with twenty pins fans rather than overlaps on
    // one increasingly crowded circle.
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
 * `./mercator.ts` has the general version; this is it with the viewport's own
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
 * Where the map opens before the viewport has been measured (and `fitBounds` can
 * run): the first pin, or the middle of the Atlantic when there are none - a
 * neutral nowhere, since a map with nothing to show should not imply a place.
 */
function firstPoint(markers: OsmMapMarker[]): LatLng {
  const first = markers[0];
  if (!first) return { latitude: 20, longitude: -30 };
  return { latitude: first.latitude, longitude: first.longitude };
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

export default OsmMap;
