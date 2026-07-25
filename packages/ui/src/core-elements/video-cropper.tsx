"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Box } from "./box";
import { Typography } from "./typography";
import "./video-cropper.css";

/* ── Types ──────────────────────────────────────────── */

/** A crop rectangle in **source-video pixels**, origin at the top-left. */
export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Intrinsic size of the loaded video, reported alongside every crop change. */
export interface VideoNaturalSize {
  width: number;
  height: number;
}

/** One aspect-ratio choice offered above the crop surface. */
export interface CropAspectPreset {
  /** Stable id - also drives the active-state check. */
  id: string;
  /** Button label (already localised by the caller). */
  label: string;
  /** Locked `width / height` ratio, or `null` for free-form dragging. */
  ratio: number | null;
}

/** Caller-supplied strings - this package holds no translations of its own. */
export interface VideoCropperLabels {
  /** Heading above the preset row. @default 'Aspect ratio' */
  aspect?: string;
  /** Accessible label for the frame-scrub slider. @default 'Preview frame' */
  scrub?: string;
  /** Accessible label for the crop rectangle. @default 'Crop area' */
  selection?: string;
}

export interface VideoCropperProps {
  /** Video URL (object-URL, blob-URL or same-origin path). */
  src: string;
  /**
   * Initial crop rectangle in source-video pixels. Read **once**, when the
   * video's intrinsic size becomes known - the component owns the rectangle
   * from then on, so a parent re-render never fights the drag in progress.
   */
  initialValue?: CropRect | null;
  /** Fires on every drag/preset change with the rectangle in video pixels. */
  onChange: (rect: CropRect, natural: VideoNaturalSize) => void;
  /** Aspect choices. @default DEFAULT_CROP_ASPECT_PRESETS */
  presets?: CropAspectPreset[];
  /** Hides the preset row when `false`. @default true */
  showPresets?: boolean;
  /** Hides the frame-scrub slider when `false`. @default true */
  showScrub?: boolean;
  /** Max height of the video preview. @default '42vh' */
  maxPreviewHeight?: number | string;
  labels?: VideoCropperLabels;
  className?: string;
}

/* ── Constants ──────────────────────────────────────── */

/** The default ratio row: free-form plus the four common social formats. */
export const DEFAULT_CROP_ASPECT_PRESETS: readonly CropAspectPreset[] = [
  { id: "free", label: "Free", ratio: null },
  { id: "1:1", label: "1:1", ratio: 1 },
  { id: "9:16", label: "9:16", ratio: 9 / 16 },
  { id: "16:9", label: "16:9", ratio: 16 / 9 },
  { id: "4:5", label: "4:5", ratio: 4 / 5 },
];

/** Smallest selectable side, as a fraction of the frame. */
const MIN_SIZE = 0.05;

/* ── Geometry helpers ───────────────────────────────── */

/** A rectangle in 0-1 units relative to the displayed video box. */
interface NormRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

type DragMode = "move" | "nw" | "ne" | "sw" | "se";

interface DragState {
  mode: DragMode;
  startX: number;
  startY: number;
  origin: NormRect;
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/**
 * The largest centered rectangle of `normAspect` that fits the frame.
 * `normAspect` is `null` for free-form, which falls back to an 80% inset.
 */
function fitRect(normAspect: number | null): NormRect {
  if (normAspect == null) return { x: 0.1, y: 0.1, w: 0.8, h: 0.8 };
  let w = 1;
  let h = w / normAspect;
  if (h > 1) {
    h = 1;
    w = h * normAspect;
  }
  return { x: (1 - w) / 2, y: (1 - h) / 2, w, h };
}

/**
 * Resolves the rectangle for the current pointer position.
 *
 * With a locked ratio the pointer drives the **width** and the height follows,
 * clamped against whichever edge the drag is anchored to, so a corner drag can
 * never push the selection outside the frame or invert it.
 */
function computeRect(
  drag: DragState,
  px: number,
  py: number,
  normAspect: number | null,
): NormRect {
  const o = drag.origin;
  const dx = px - drag.startX;
  const dy = py - drag.startY;

  if (drag.mode === "move") {
    return {
      x: Math.min(1 - o.w, Math.max(0, o.x + dx)),
      y: Math.min(1 - o.h, Math.max(0, o.y + dy)),
      w: o.w,
      h: o.h,
    };
  }

  const right = o.x + o.w;
  const bottom = o.y + o.h;
  const west = drag.mode === "nw" || drag.mode === "sw";
  const north = drag.mode === "nw" || drag.mode === "ne";

  if (normAspect != null) {
    const maxW = west ? right : 1 - o.x;
    const maxH = north ? bottom : 1 - o.y;

    let w = west
      ? right - Math.min(right - MIN_SIZE, Math.max(0, o.x + dx))
      : Math.max(MIN_SIZE, o.w + dx);
    w = Math.min(w, maxW);
    let h = w / normAspect;
    if (h > maxH) {
      h = maxH;
      w = h * normAspect;
    }
    if (w < MIN_SIZE) {
      w = MIN_SIZE;
      h = w / normAspect;
    }

    return {
      x: clamp01(west ? right - w : o.x),
      y: clamp01(north ? bottom - h : o.y),
      w,
      h,
    };
  }

  let x = o.x;
  let y = o.y;
  let w = o.w;
  let h = o.h;

  if (west) {
    x = Math.min(right - MIN_SIZE, Math.max(0, o.x + dx));
    w = right - x;
  } else {
    w = Math.min(1 - o.x, Math.max(MIN_SIZE, o.w + dx));
  }

  if (north) {
    y = Math.min(bottom - MIN_SIZE, Math.max(0, o.y + dy));
    h = bottom - y;
  } else {
    h = Math.min(1 - o.y, Math.max(MIN_SIZE, o.h + dy));
  }

  return { x, y, w, h };
}

/** Converts a normalized rectangle to source-video pixels (even-aligned). */
function toPixels(rect: NormRect, natural: VideoNaturalSize): CropRect {
  const even = (v: number) => Math.max(2, Math.round(v / 2) * 2);
  const width = Math.min(natural.width, even(rect.w * natural.width));
  const height = Math.min(natural.height, even(rect.h * natural.height));
  return {
    x: Math.min(natural.width - width, even(rect.x * natural.width)),
    y: Math.min(natural.height - height, even(rect.y * natural.height)),
    width,
    height,
  };
}

/* ── Component ──────────────────────────────────────── */

/**
 * VideoCropper - drag a crop rectangle over a live video frame.
 *
 * The rectangle is reported in **source-video pixels**, ready to hand to
 * FFmpeg's `crop=W:H:X:Y`. Sides are rounded to even numbers so the result is
 * always encodable as yuv420p.
 *
 * The strings default to English; a localised app passes `labels`.
 *
 * @example
 * <VideoCropper
 *   src={videoUrl}
 *   onChange={(rect) => setCrop(rect)}
 *   labels={{ aspect: t('cropAspect'), scrub: t('cropScrub') }}
 * />
 */
export const VideoCropper: React.FC<VideoCropperProps> = ({
  src,
  initialValue,
  onChange,
  presets = DEFAULT_CROP_ASPECT_PRESETS as CropAspectPreset[],
  showPresets = true,
  showScrub = true,
  maxPreviewHeight = "42vh",
  labels,
  className,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const seededRef = useRef(false);

  const [natural, setNatural] = useState<VideoNaturalSize | null>(null);
  const [duration, setDuration] = useState(0);
  const [scrubTime, setScrubTime] = useState(0);
  const [presetId, setPresetId] = useState(presets[0]?.id ?? "free");
  const [rect, setRect] = useState<NormRect>({
    x: 0.1,
    y: 0.1,
    w: 0.8,
    h: 0.8,
  });

  const ratio = useMemo(
    () => presets.find((p) => p.id === presetId)?.ratio ?? null,
    [presets, presetId],
  );

  /* A pixel ratio maps to a different ratio in normalized space, because the
     two axes are normalized by different pixel counts. */
  const normAspect =
    ratio != null && natural ? ratio * (natural.height / natural.width) : null;

  /* Report upward without making `onChange` a dependency of the emit effect -
     an inline arrow from the parent would otherwise re-fire it every render. */
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });

  useEffect(() => {
    if (!natural) return;
    onChangeRef.current(toPixels(rect, natural), natural);
  }, [rect, natural]);

  /* ── Metadata: intrinsic size + seed from initialValue ── */
  const handleLoadedMetadata = useCallback(() => {
    const el = videoRef.current;
    if (!el || !el.videoWidth || !el.videoHeight) return;
    const size = { width: el.videoWidth, height: el.videoHeight };
    setNatural(size);
    setDuration(Number.isFinite(el.duration) ? el.duration : 0);

    if (!seededRef.current) {
      seededRef.current = true;
      if (initialValue) {
        setRect({
          x: clamp01(initialValue.x / size.width),
          y: clamp01(initialValue.y / size.height),
          w: clamp01(initialValue.width / size.width),
          h: clamp01(initialValue.height / size.height),
        });
      }
      /* Nudge off frame 0 - many encodes open on a black or blank frame. */
      try {
        el.currentTime = Math.min(0.1, (el.duration || 1) / 2);
      } catch {
        /* seeking before the buffer is ready is harmless - ignore */
      }
    }
  }, [initialValue]);

  /* ── Preset change ─────────────────────────────────── */
  const handlePreset = useCallback(
    (preset: CropAspectPreset) => {
      setPresetId(preset.id);
      if (!natural) return;
      setRect(
        fitRect(
          preset.ratio != null
            ? preset.ratio * (natural.height / natural.width)
            : null,
        ),
      );
    },
    [natural],
  );

  /* ── Drag handling ─────────────────────────────────── */
  const pointerToNorm = (e: React.PointerEvent) => {
    const el = surfaceRef.current;
    if (!el) return { x: 0, y: 0 };
    const box = el.getBoundingClientRect();
    return {
      x: box.width > 0 ? clamp01((e.clientX - box.left) / box.width) : 0,
      y: box.height > 0 ? clamp01((e.clientY - box.top) / box.height) : 0,
    };
  };

  /* The mode comes off the target's `data-mode` rather than a per-handle
     closure: a factory called during render would read refs at render time. */
  const startDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    const mode = (e.target as HTMLElement).dataset.mode as DragMode | undefined;
    if (!mode) return;
    e.preventDefault();
    e.stopPropagation();
    const surface = surfaceRef.current;
    if (!surface) return;
    // Capture on the surface (not the handle) so the pointer can leave the
    // small handle box mid-drag without dropping the gesture.
    surface.setPointerCapture(e.pointerId);
    const p = pointerToNorm(e);
    dragRef.current = { mode, startX: p.x, startY: p.y, origin: rect };
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    const p = pointerToNorm(e);
    setRect(computeRect(drag, p.x, p.y, normAspect));
  };

  const endDrag = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    dragRef.current = null;
    surfaceRef.current?.releasePointerCapture(e.pointerId);
  };

  /* ── Scrub ─────────────────────────────────────────── */
  const handleScrub = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = Number(e.target.value);
    setScrubTime(time);
    const el = videoRef.current;
    if (el) el.currentTime = time;
  };

  const pixels = natural ? toPixels(rect, natural) : null;

  const selectionStyle: React.CSSProperties = {
    left: `${rect.x * 100}%`,
    top: `${rect.y * 100}%`,
    width: `${rect.w * 100}%`,
    height: `${rect.h * 100}%`,
  };

  return (
    <Box className={className} flexDirection="column" gap={10} width="100%">
      {showPresets ? (
        <Box flexDirection="column" gap={6}>
          <Typography
            variant="label"
            color="var(--foreground-muted, #888)"
            fontWeight={700}
            styles={{ letterSpacing: "0.05em", textTransform: "uppercase" }}
          >
            {labels?.aspect ?? "Aspect ratio"}
          </Typography>
          <Box flexWrap="wrap" gap={6}>
            {presets.map((preset) => (
              <button
                key={preset.id}
                type="button"
                className={`uvc-preset${preset.id === presetId ? " uvc-preset--active" : ""}`}
                onClick={() => handlePreset(preset)}
                aria-pressed={preset.id === presetId}
              >
                {preset.label}
              </button>
            ))}
          </Box>
        </Box>
      ) : null}

      <div className="uvc-frame">
        <div className="uvc-stage">
          <video
            ref={videoRef}
            className="uvc-media"
            src={src}
            muted
            playsInline
            preload="metadata"
            onLoadedMetadata={handleLoadedMetadata}
            style={{ maxHeight: maxPreviewHeight }}
          />
          <div
            ref={surfaceRef}
            className="uvc-surface"
            onPointerMove={handlePointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
          >
            <div
              className="uvc-selection"
              style={selectionStyle}
              role="group"
              aria-label={labels?.selection ?? "Crop area"}
              data-mode="move"
              onPointerDown={startDrag}
            >
              <span className="uvc-handle uvc-handle--nw" data-mode="nw" />
              <span className="uvc-handle uvc-handle--ne" data-mode="ne" />
              <span className="uvc-handle uvc-handle--sw" data-mode="sw" />
              <span className="uvc-handle uvc-handle--se" data-mode="se" />
            </div>
          </div>
        </div>
      </div>

      {showScrub && duration > 0 ? (
        <input
          type="range"
          className="uvc-scrub"
          min={0}
          max={duration}
          step={duration / 200}
          value={scrubTime}
          onChange={handleScrub}
          aria-label={labels?.scrub ?? "Preview frame"}
        />
      ) : null}

      {pixels ? (
        <Typography variant="caption" color="var(--foreground-muted, #888)">
          {pixels.width} × {pixels.height} · {pixels.x}, {pixels.y}
        </Typography>
      ) : null}
    </Box>
  );
};

export default VideoCropper;
