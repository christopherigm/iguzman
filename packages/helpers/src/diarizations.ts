/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

/** A single speaker-attributed time segment from a diarization pass. */
export interface Diarization {
  /** Zero-based speaker index. */
  speaker: number;
  /** Segment start time in seconds. */
  start: number;
  /** Segment end time in seconds. */
  end: number;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                         */
/* ------------------------------------------------------------------ */

/** Minimum segment duration in seconds to keep after normalization. */
const MIN_SEGMENT_DURATION = 1;

/* ------------------------------------------------------------------ */
/*  Public API                                                        */
/* ------------------------------------------------------------------ */

/**
 * Normalizes a list of diarization segments:
 *
 * 1. **Re-indexes speakers** — If the first segment's speaker is `1`
 *    (instead of the expected `0`), all speaker indices are swapped
 *    (`0 ↔ 1`) so the primary speaker is always `0`.
 * 2. **Filters short segments** — Segments shorter than
 *    {@link MIN_SEGMENT_DURATION} second are dropped, as they
 *    typically represent noise or mis-detections.
 *
 * The original array is never mutated.
 *
 * @param diarizations - Raw diarization segments to normalize.
 * @returns A new array of normalized segments.
 */
const normalizeDiarizations = (diarizations: Diarization[]): Diarization[] => {
  if (diarizations.length === 0) return [];

  const needsSwap = diarizations[0]?.speaker === 1;

  const swapped = needsSwap
    ? diarizations.map((segment) => ({
        ...segment,
        speaker: segment.speaker === 0 ? 1 : 0,
      }))
    : diarizations;

  return swapped.filter(
    (segment) => segment.end - segment.start >= MIN_SEGMENT_DURATION,
  );
};

export default normalizeDiarizations;
