/**
 * Persists per-title playback position for the self-hosted digital-copy player
 * (StreamOverlay) in localStorage, so closing/pausing a film and reopening it
 * later can offer to resume where it left off. Keyed by the movie `slug` (stable
 * and human-readable) rather than the signed bucket URL, which rotates.
 */

const KEY_PREFIX = "cinelog-tv:resume:";

// Below this the "resume" prompt isn't worth showing - just start from the top.
const MIN_RESUME_MS = 15_000;
// Within this window of the end, the title is effectively finished: don't resume.
const END_MARGIN_MS = 60_000;

export interface ResumePoint {
  /** Playhead in milliseconds. */
  position: number;
  /** Total length in milliseconds (0 when it wasn't known yet). */
  duration: number;
}

function keyFor(slug: string): string {
  return `${KEY_PREFIX}${slug}`;
}

/**
 * The saved position for a title, or `null` when there is nothing worth
 * resuming - unset, too near the start, or effectively finished.
 */
export function getResumePoint(slug: string): ResumePoint | null {
  try {
    const raw = localStorage.getItem(keyFor(slug));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ResumePoint>;
    const position = Number(parsed.position);
    const duration = Number(parsed.duration);
    if (!Number.isFinite(position) || position < MIN_RESUME_MS) return null;
    // Finished (or all but): treat as no resume point.
    if (duration > 0 && position >= duration - END_MARGIN_MS) return null;
    return { position, duration: Number.isFinite(duration) ? duration : 0 };
  } catch {
    return null;
  }
}

export function saveResumePoint(slug: string, point: ResumePoint): void {
  try {
    // Nothing meaningful to keep, and finished titles shouldn't linger.
    if (point.position < MIN_RESUME_MS) {
      clearResumePoint(slug);
      return;
    }
    if (
      point.duration > 0 &&
      point.position >= point.duration - END_MARGIN_MS
    ) {
      clearResumePoint(slug);
      return;
    }
    localStorage.setItem(keyFor(slug), JSON.stringify(point));
  } catch {
    /* storage full/unavailable - resuming is best-effort */
  }
}

export function clearResumePoint(slug: string): void {
  try {
    localStorage.removeItem(keyFor(slug));
  } catch {
    /* ignore */
  }
}
