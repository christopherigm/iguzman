import duplicateAudio from '@iguzman/helpers/duplicate-audio-x-times';
import getAudioDuration from '@iguzman/helpers/get-audio-duration';
import cutVideoLength from '@iguzman/helpers/cut-video-length';
import deleteMediaFile from '@iguzman/helpers/delete-media-file';

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

/** Options accepted by {@link loopVideoToLength}. */
export interface LoopVideoToLengthOptions {
  /** Relative path to the source video file (e.g. `"media/clip.mp4"`). */
  readonly src: string;
  /** Relative path for the final output file (e.g. `"media/looped.mp4"`). */
  readonly dest: string;
  /**
   * Desired minimum duration of the output video, in seconds.
   * The source video will be duplicated enough times to cover this length,
   * then trimmed to exactly this value.
   * @defaultValue 10
   */
  readonly targetDuration: number;
  /**
   * Crossfade overlap duration (in seconds) subtracted from each copy's
   * effective length when calculating how many repetitions are needed.
   * @defaultValue 3
   */
  readonly crossfadeDuration?: number;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

/**
 * Strips a leading `media/` prefix from a path, if present.
 *
 * Only the first occurrence at the start of the string is removed so
 * that nested segments like `some/media/file.mp4` stay intact.
 */
const stripMediaPrefix = (filePath: string): string =>
  filePath.replace(/^media\//, '');

/**
 * Computes the number of copies needed so that the total duration
 * (accounting for crossfade overlap between copies) meets or exceeds
 * `targetDuration`.
 *
 * Each copy contributes `sourceDuration - crossfadeDuration` seconds of
 * effective audio (the rest overlaps with the next copy).
 */
const computeRepetitions = (
  sourceDuration: number,
  crossfadeDuration: number,
  targetDuration: number,
): number => {
  const effectiveDuration = sourceDuration - crossfadeDuration;

  if (effectiveDuration <= 0) {
    throw new Error(
      `Source duration (${sourceDuration}s) must be greater than ` +
        `crossfade duration (${crossfadeDuration}s)`,
    );
  }

  return Math.ceil(targetDuration / effectiveDuration);
};

/* ------------------------------------------------------------------ */
/*  Public API                                                        */
/* ------------------------------------------------------------------ */

/**
 * Loops a video's audio track enough times to reach `targetDuration`,
 * then trims the result to exactly that length.
 *
 * **Workflow:**
 * 1. Reads the source audio duration via `ffprobe`.
 * 2. Calculates how many copies are needed to cover `targetDuration`
 *    (accounting for crossfade overlap between copies).
 * 3. Duplicates the audio track N times with crossfade transitions.
 * 4. Trims the concatenated result to exactly `targetDuration` seconds.
 * 5. Cleans up the intermediate (untrimmed) file.
 *
 * @param options - Source/destination paths and duration settings.
 * @returns Relative media path to the trimmed output file.
 * @throws If `ffprobe` fails, duplication fails, or the trim fails.
 *
 * @example
 * ```ts
 * const output = await loopVideoToLength({
 *   src: 'media/intro.mp4',
 *   dest: 'media/intro-looped.mp4',
 *   targetDuration: 30,
 * });
 * console.log(output); // "media/intro-looped.mp4"
 * ```
 */
const loopVideoToLength = async ({
  src,
  dest,
  targetDuration = 10,
  crossfadeDuration = 3,
}: LoopVideoToLengthOptions): Promise<string> => {
  const cleanSrc = stripMediaPrefix(src);
  const cleanDest = stripMediaPrefix(dest);
  const rawDest = `raw_${cleanDest}`;

  // Step 1: Get the source audio duration
  const sourceDuration = await getAudioDuration({ src: cleanSrc });

  // Step 2: Calculate how many copies are needed
  const times = computeRepetitions(
    sourceDuration,
    crossfadeDuration,
    targetDuration,
  );

  // Step 3: Duplicate the audio track with crossfade transitions
  await duplicateAudio({
    src: cleanSrc,
    dest: rawDest,
    times,
  });

  // Step 4: Trim the concatenated result to the exact target duration
  const outputPath = await cutVideoLength({
    src: rawDest,
    dest: cleanDest,
    to: targetDuration,
  });

  // Step 5: Clean up the intermediate file
  await deleteMediaFile(`media/${rawDest}`);

  return outputPath;
};

export default loopVideoToLength;
