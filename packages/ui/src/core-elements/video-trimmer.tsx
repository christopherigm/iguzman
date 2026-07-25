"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Box } from "./box";
import { Button } from "./button";
import { Typography } from "./typography";
import "./video-trimmer.css";

/* ── Types ──────────────────────────────────────────── */

/** A trim selection in seconds, measured from the start of the source video. */
export interface TrimRange {
  start: number;
  end: number;
}

/** Caller-supplied strings - this package holds no translations of its own. */
export interface VideoTrimmerLabels {
  /** Play the current selection. @default 'Play selection' */
  play?: string;
  /** Pause playback. @default 'Pause' */
  pause?: string;
  /** Accessible label for the start handle. @default 'Selection start' */
  start?: string;
  /** Accessible label for the end handle. @default 'Selection end' */
  end?: string;
  /** Suffix for the selected length, e.g. "15.6s selected". @default 'selected' */
  selected?: string;
}

export interface VideoTrimmerProps {
  /** Video URL (object-URL, blob-URL or same-origin path). */
  src: string;
  /**
   * Known duration in seconds, used until the video's own metadata loads.
   * Optional - the component reads `video.duration` as soon as it can.
   */
  duration?: number | null;
  /**
   * Initial selection. Read **once**, when the duration becomes known, so a
   * parent re-render never fights a drag in progress. Defaults to the whole
   * video.
   */
  initialValue?: TrimRange | null;
  /** Fires on every handle drag with the current selection in seconds. */
  onChange: (range: TrimRange) => void;
  /** Number of filmstrip thumbnails to extract. @default 8 */
  frameCount?: number;
  /** Max height of the video preview. @default '32vh' */
  maxPreviewHeight?: number | string;
  labels?: VideoTrimmerLabels;
  className?: string;
}

/* ── Constants ──────────────────────────────────────── */

/** Shortest selectable clip, in seconds. */
const MIN_DURATION = 0.5;

/** Pixel width of an extracted filmstrip thumbnail. */
const THUMB_WIDTH = 96;

/* ── Helpers ────────────────────────────────────────── */

/** Formats seconds as `M:SS.d` (e.g. `1:04.2`). */
export function formatTimecode(seconds: number): string {
  const safe = Number.isFinite(seconds) && seconds > 0 ? seconds : 0;
  const mins = Math.floor(safe / 60);
  const secs = Math.floor(safe % 60);
  const tenths = Math.floor((safe * 10) % 10);
  return `${mins}:${String(secs).padStart(2, "0")}.${tenths}`;
}

/**
 * Extracts `count` evenly-spaced frames as JPEG data-URLs.
 *
 * Runs off a detached `<video>` + `<canvas>`; a cross-origin source taints the
 * canvas, so `toDataURL` is guarded and the strip simply stays empty.
 */
function extractFilmstrip(
  src: string,
  count: number,
  onFrame: (index: number, dataUrl: string) => void,
): () => void {
  let cancelled = false;
  const video = document.createElement("video");
  video.src = src;
  video.crossOrigin = "anonymous";
  video.muted = true;
  video.preload = "auto";

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");

  const seekTo = (time: number) =>
    new Promise<void>((resolve) => {
      const onSeeked = () => {
        video.removeEventListener("seeked", onSeeked);
        resolve();
      };
      video.addEventListener("seeked", onSeeked);
      video.currentTime = time;
    });

  const run = async () => {
    await new Promise<void>((resolve, reject) => {
      video.addEventListener("loadeddata", () => resolve(), { once: true });
      video.addEventListener("error", () => reject(new Error("load")), {
        once: true,
      });
    });

    if (cancelled || !ctx) return;
    const total = Number.isFinite(video.duration) ? video.duration : 0;
    if (total <= 0 || !video.videoWidth) return;

    canvas.width = THUMB_WIDTH;
    canvas.height = Math.max(
      1,
      Math.round((THUMB_WIDTH * video.videoHeight) / video.videoWidth),
    );

    for (let i = 0; i < count; i++) {
      if (cancelled) return;
      await seekTo((total * (i + 0.5)) / count);
      if (cancelled) return;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      try {
        onFrame(i, canvas.toDataURL("image/jpeg", 0.6));
      } catch {
        // Tainted canvas (cross-origin source) - give up on the whole strip.
        return;
      }
    }
  };

  void run().catch(() => {
    /* A source the browser can't decode simply gets no filmstrip. */
  });

  return () => {
    cancelled = true;
    video.removeAttribute("src");
    video.load();
  };
}

/* ── Component ──────────────────────────────────────── */

/**
 * VideoTrimmer - pick a start and end point on a filmstrip timeline.
 *
 * Renders a seeking preview above a thumbnail strip with two drag handles; the
 * preview follows whichever handle is being dragged, and the play button
 * auditions just the selection.
 *
 * The strings default to English; a localised app passes `labels`.
 *
 * @example
 * <VideoTrimmer
 *   src={videoUrl}
 *   duration={video.duration}
 *   onChange={(range) => setTrim(range)}
 *   labels={{ play: t('trimPlay'), pause: tCommon('pause') }}
 * />
 */
export const VideoTrimmer: React.FC<VideoTrimmerProps> = ({
  src,
  duration: durationProp,
  initialValue,
  onChange,
  frameCount = 8,
  maxPreviewHeight = "32vh",
  labels,
  className,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<"start" | "end" | null>(null);
  const seededRef = useRef(false);

  const [duration, setDuration] = useState(
    durationProp && durationProp > 0 ? durationProp : 0,
  );
  const [range, setRange] = useState<TrimRange>({
    start: 0,
    end: durationProp && durationProp > 0 ? durationProp : 0,
  });
  /* The filmstrip is stored with the `src` it belongs to, so switching sources
     clears it by derivation at render time rather than by a setState in the
     extraction effect (which would cascade an extra render). */
  const [strip, setStrip] = useState<{
    src: string;
    frames: (string | null)[];
    // An empty `src` never matches a real one, so the first render shows
    // placeholders until the first frame lands.
  }>({ src: "", frames: [] });
  const [playing, setPlaying] = useState(false);

  const emptyFrames = useMemo<(string | null)[]>(
    () => Array.from({ length: frameCount }, () => null),
    [frameCount],
  );
  const frames: (string | null)[] =
    strip.src === src ? strip.frames : emptyFrames;

  /* Report upward without making `onChange` a dependency of the emit effect -
     an inline arrow from the parent would otherwise re-fire it every render. */
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });

  useEffect(() => {
    if (duration <= 0) return;
    onChangeRef.current(range);
  }, [range, duration]);

  /* ── Filmstrip extraction ──────────────────────────── */
  useEffect(
    () =>
      extractFilmstrip(src, frameCount, (index, dataUrl) => {
        setStrip((prev) => {
          const base =
            prev.src === src
              ? prev.frames
              : Array.from({ length: frameCount }, () => null);
          const next = [...base];
          next[index] = dataUrl;
          return { src, frames: next };
        });
      }),
    [src, frameCount],
  );

  /* ── Metadata ──────────────────────────────────────── */
  const handleLoadedMetadata = useCallback(() => {
    const el = videoRef.current;
    if (!el || !Number.isFinite(el.duration) || el.duration <= 0) return;
    setDuration(el.duration);
    if (seededRef.current) return;
    seededRef.current = true;
    const start = Math.max(0, Math.min(initialValue?.start ?? 0, el.duration));
    const end = Math.min(initialValue?.end ?? el.duration, el.duration);
    setRange({
      start,
      end: end > start + MIN_DURATION ? end : el.duration,
    });
  }, [initialValue]);

  /* ── Selection playback ────────────────────────────── */
  const handleTimeUpdate = useCallback(() => {
    const el = videoRef.current;
    if (!el || !playing) return;
    if (el.currentTime >= range.end) {
      el.pause();
      el.currentTime = range.start;
      setPlaying(false);
    }
  }, [playing, range.end, range.start]);

  const togglePlay = useCallback(() => {
    const el = videoRef.current;
    if (!el) return;
    if (playing) {
      el.pause();
      setPlaying(false);
      return;
    }
    if (el.currentTime < range.start || el.currentTime >= range.end) {
      el.currentTime = range.start;
    }
    void el.play().then(
      () => setPlaying(true),
      () => setPlaying(false),
    );
  }, [playing, range.start, range.end]);

  /* ── Handle dragging ───────────────────────────────── */
  const pointerToTime = (e: React.PointerEvent): number => {
    const el = trackRef.current;
    if (!el || duration <= 0) return 0;
    const box = el.getBoundingClientRect();
    if (box.width <= 0) return 0;
    const pct = Math.min(1, Math.max(0, (e.clientX - box.left) / box.width));
    return pct * duration;
  };

  /* Which handle is being dragged comes off the target's `data-handle` rather
     than a per-handle closure: a factory called during render would read refs
     at render time. */
  const startDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    const which = (e.target as HTMLElement).dataset.handle as
      | "start"
      | "end"
      | undefined;
    if (!which) return;
    e.preventDefault();
    e.stopPropagation();
    const track = trackRef.current;
    if (!track) return;
    // Capture on the track so the pointer can leave the narrow handle mid-drag.
    track.setPointerCapture(e.pointerId);
    dragRef.current = which;
    const el = videoRef.current;
    if (el) {
      el.pause();
      setPlaying(false);
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    const which = dragRef.current;
    if (!which || duration <= 0) return;
    const time = pointerToTime(e);
    // Computed outside the state updater so seeking the preview stays a plain
    // side effect - an updater must be pure (it can run twice in dev).
    const next =
      which === "start"
        ? {
            start: Math.max(0, Math.min(time, range.end - MIN_DURATION)),
            end: range.end,
          }
        : {
            start: range.start,
            end: Math.min(duration, Math.max(time, range.start + MIN_DURATION)),
          };
    const el = videoRef.current;
    if (el) el.currentTime = which === "start" ? next.start : next.end;
    setRange(next);
  };

  const endDrag = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    dragRef.current = null;
    trackRef.current?.releasePointerCapture(e.pointerId);
  };

  const pct = (time: number) => (duration > 0 ? (time / duration) * 100 : 0);
  const startPct = pct(range.start);
  const endPct = pct(range.end);
  const selectedLength = Math.max(0, range.end - range.start);

  return (
    <Box className={className} flexDirection="column" gap={10} width="100%">
      <div className="uvt-frame">
        <video
          ref={videoRef}
          className="uvt-media"
          src={src}
          muted
          playsInline
          preload="metadata"
          onLoadedMetadata={handleLoadedMetadata}
          onTimeUpdate={handleTimeUpdate}
          onEnded={() => setPlaying(false)}
          style={{ maxHeight: maxPreviewHeight }}
        />
      </div>

      <div
        ref={trackRef}
        className="uvt-track"
        onPointerDown={startDrag}
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <div className="uvt-strip" aria-hidden="true">
          {frames.map((frame, i) =>
            frame ? (
              <img key={i} className="uvt-thumb" src={frame} alt="" />
            ) : (
              <span key={i} className="uvt-thumb uvt-thumb--empty" />
            ),
          )}
        </div>

        <div className="uvt-dim" style={{ left: 0, width: `${startPct}%` }} />
        <div
          className="uvt-dim"
          style={{ left: `${endPct}%`, width: `${100 - endPct}%` }}
        />
        <div
          className="uvt-selection"
          style={{ left: `${startPct}%`, width: `${endPct - startPct}%` }}
        />

        <div
          className="uvt-handle uvt-handle--start"
          style={{ left: `${startPct}%` }}
          role="slider"
          tabIndex={0}
          aria-label={labels?.start ?? "Selection start"}
          aria-valuemin={0}
          aria-valuemax={duration}
          aria-valuenow={range.start}
          aria-valuetext={formatTimecode(range.start)}
          data-handle="start"
        />
        <div
          className="uvt-handle uvt-handle--end"
          style={{ left: `${endPct}%` }}
          role="slider"
          tabIndex={0}
          aria-label={labels?.end ?? "Selection end"}
          aria-valuemin={0}
          aria-valuemax={duration}
          aria-valuenow={range.end}
          aria-valuetext={formatTimecode(range.end)}
          data-handle="end"
        />
      </div>

      <Box alignItems="center" justifyContent="space-between" gap={8}>
        <Button
          text={
            playing
              ? (labels?.pause ?? "Pause")
              : (labels?.play ?? "Play selection")
          }
          onClick={togglePlay}
          size="sm"
          disabled={duration <= 0}
        />
        <Typography variant="caption" color="var(--foreground-muted, #888)">
          {formatTimecode(range.start)} → {formatTimecode(range.end)} ·{" "}
          {selectedLength.toFixed(1)}s {labels?.selected ?? "selected"}
        </Typography>
      </Box>
    </Box>
  );
};

export default VideoTrimmer;
