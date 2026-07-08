import { useCallback, useEffect, useRef, useState } from "react";
import type { StreamPlayer } from "./use-stream-player";

/**
 * Netflix-style escalating skip burst, shared by the transport bar (progress-bar
 * arrows and the ±skip buttons) and the overlay's key router (Left/Right while
 * the bar is hidden) so both drive one and the same seek.
 *
 * Consecutive presses within one burst escalate the step size - 30s, then 1min,
 * then 3min - and hold at 3min after that. Each press nudges a *pending* target
 * (previewed on the progress bar) instead of seeking outright; the burst resets
 * to 30s once it commits.
 */
export const SKIP_STEPS_MS = [30_000, 60_000, 180_000];

/** i18n key for each step's on-button label (magnitude only; sign is added). */
export const SKIP_STEP_KEYS: Record<number, string> = {
  30_000: "skipStep30",
  60_000: "skipStep60",
  180_000: "skipStep180",
};

/**
 * Idle time (ms) after the last skip press before the accumulated seek commits
 * and playback resumes. Long enough to let a run of presses batch into one seek
 * and for the viewer to read the target on the progress bar, short enough not to
 * feel laggy - roughly what Netflix uses.
 */
const SKIP_COMMIT_MS = 800;

export interface SkipBurst {
  /** Previewed target (ms) while a burst is in flight, else `null`. */
  pending: number | null;
  /** The step (ms) the *next* press will apply, mirrored into the button labels. */
  skipStep: number;
  /** Nudge the pending target forward (`1`) or back (`-1`); (re)arms the commit. */
  skip: (dir: 1 | -1) => void;
  /** Force-commit any in-flight burst now (e.g. the bar is hiding mid-skip). */
  commit: () => void;
  /** Whether a burst is currently accumulating (read to route keys). */
  isPending: () => boolean;
}

/**
 * Own the skip-burst state for one player: the pending target, the escalating
 * step, and the debounced commit. Reads live playback state through refs so
 * `skip`/`commit` stay referentially stable - the overlay subscribes a window
 * key listener against them and must not re-subscribe every playhead tick.
 */
export function useSkipBurst(player: StreamPlayer): SkipBurst {
  const { phase, currentTime, duration, seekTo, play, pause } = player;

  // A skip burst previews its accumulated target in `pending`; while it's
  // non-null the bar renders this position instead of the (paused) playhead.
  const [pending, setPending] = useState<number | null>(null);
  const [skipStep, setSkipStep] = useState(SKIP_STEPS_MS[0]!);
  const pendingRef = useRef<number | null>(null);
  const stepIndexRef = useRef(0);
  const wasPlayingRef = useRef(false);
  const commitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Latest playback state for the stable callbacks below; written in an effect
  // (never during render) per react-hooks/refs.
  const currentRef = useRef(currentTime);
  const durationRef = useRef(duration);
  const phaseRef = useRef(phase);
  useEffect(() => {
    currentRef.current = currentTime;
    durationRef.current = duration;
    phaseRef.current = phase;
  });

  /**
   * Commit the burst: seek to the accumulated target, resume playback if it was
   * playing when the burst began, and reset the escalation back to 30s. Reads
   * `pendingRef` (not state) so a debounce-timer or hide-driven call always sees
   * the latest target. A no-op when nothing is pending.
   */
  const commit = useCallback(() => {
    if (commitTimerRef.current) {
      clearTimeout(commitTimerRef.current);
      commitTimerRef.current = null;
    }
    const target = pendingRef.current;
    pendingRef.current = null;
    stepIndexRef.current = 0;
    setPending(null);
    setSkipStep(SKIP_STEPS_MS[0]!);
    if (target === null) return;
    seekTo(target);
    if (wasPlayingRef.current) play();
  }, [seekTo, play]);

  /**
   * Nudge the pending target by the current step, escalate the step for the next
   * press, and (re)arm the commit timer. The first press of a burst pauses the
   * decoder and remembers whether to resume, so the seek scrubs a still frame
   * rather than fighting live playback.
   */
  const skip = useCallback(
    (dir: 1 | -1) => {
      const base = pendingRef.current ?? currentRef.current;
      const idx = stepIndexRef.current;
      const step = SKIP_STEPS_MS[idx]!;
      const total = durationRef.current;
      const max = total > 0 ? Math.max(total - 1000, 0) : base + step;
      const target = Math.max(0, Math.min(base + dir * step, max));

      if (pendingRef.current === null) {
        wasPlayingRef.current = phaseRef.current === "playing";
        pause();
      }
      pendingRef.current = target;
      setPending(target);

      const nextIdx = Math.min(idx + 1, SKIP_STEPS_MS.length - 1);
      stepIndexRef.current = nextIdx;
      setSkipStep(SKIP_STEPS_MS[nextIdx]!);

      if (commitTimerRef.current) clearTimeout(commitTimerRef.current);
      commitTimerRef.current = setTimeout(commit, SKIP_COMMIT_MS);
    },
    [pause, commit],
  );

  const isPending = useCallback(() => pendingRef.current !== null, []);

  // Drop a pending commit timer on unmount (the player tears down anyway).
  useEffect(
    () => () => {
      if (commitTimerRef.current) clearTimeout(commitTimerRef.current);
    },
    [],
  );

  return { pending, skipStep, skip, commit, isPending };
}
