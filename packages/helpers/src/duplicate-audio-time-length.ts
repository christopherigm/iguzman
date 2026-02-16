import duplicateAudio from '@iguzman/helpers/duplicate-audio-x-times';
import getAudioDuration from '@iguzman/helpers/get-audio-duration';
import cutVideoLength from '@iguzman/helpers/cut-video-length';
import deleteMediaFile from '@iguzman/helpers/delete-media-file';

/**
 * Default crossfade overlap (in seconds) applied by
 * {@link duplicateAudio} when joining adjacent copies.
 *
 * Each join shortens the total length by this amount, so the effective
 * duration per copy is `sourceDuration − CROSSFADE_OVERLAP`.
 */
const CROSSFADE_OVERLAP = 5;

/**
 * Resolves the current Node environment, defaulting to `"localhost"`
 * when `NODE_ENV` is not set.
 */
const getNodeEnv = (): string => process.env.NODE_ENV?.trim() ?? 'localhost';

/**
 * Removes a leading `media/` prefix from a file path so it can be
 * joined with the output folder without duplicating the segment.
 */
const stripMediaPrefix = (filePath: string): string =>
  filePath.replace(/^media\//, '');

/* ------------------------------------------------------------------ */
/*  Public API                                                        */
/* ------------------------------------------------------------------ */

/** Options accepted by {@link loopAudioToLength}. */
export interface LoopAudioToLengthOptions {
  /** Relative path to the source audio file (e.g. `"media/clip.wav"`). */
  readonly src: string;
  /** Relative path for the final output file (e.g. `"media/looped.wav"`). */
  readonly dest: string;
  /** Desired duration of the output audio in seconds. */
  readonly timeLength: number;
  /**
   * Root folder where media files are stored.
   * Defaults to `"/app/media"` in production or `"public/media"` otherwise.
   */
  readonly outputFolder?: string;
}

/**
 * Loops an audio file by duplicating it enough times to cover
 * {@link LoopAudioToLengthOptions.timeLength | timeLength} seconds,
 * then trims the result to exactly that duration.
 *
 * **Workflow:**
 * 1. Probes the source audio duration with `ffprobe`.
 * 2. Calculates how many copies are needed, accounting for the
 *    {@link CROSSFADE_OVERLAP} lost on each crossfade join.
 * 3. Joins the copies with {@link duplicateAudio}.
 * 4. Trims the joined file to the exact target length with ffmpeg.
 * 5. Cleans up the intermediate (untrimmed) file.
 *
 * @param options - Source/destination paths, target duration, and folder override.
 * @returns Relative media path to the output file (e.g. `"media/looped.wav"`).
 * @throws If paths are empty, `timeLength` is invalid, or any ffmpeg operation fails.
 *
 * @example
 * ```ts
 * const output = await loopAudioToLength({
 *   src: 'media/bgm.wav',
 *   dest: 'media/bgm-60s.wav',
 *   timeLength: 60,
 * });
 * console.log(output); // "media/bgm-60s.wav"
 * ```
 */
export const loopAudioToLength = async ({
  src,
  dest,
  timeLength,
  outputFolder = getNodeEnv() === 'production' ? '/app/media' : 'public/media',
}: LoopAudioToLengthOptions): Promise<string> => {
  if (!src || typeof src !== 'string') {
    throw new Error('Source file path must be a non-empty string');
  }

  if (!dest || typeof dest !== 'string') {
    throw new Error('Destination file path must be a non-empty string');
  }

  if (
    typeof timeLength !== 'number' ||
    timeLength <= 0 ||
    !Number.isFinite(timeLength)
  ) {
    throw new Error('timeLength must be a positive finite number');
  }

  const cleanSrc = stripMediaPrefix(src);
  const cleanDest = stripMediaPrefix(dest);
  const rawDest = `raw_${cleanDest}`;

  // Probe the source audio to determine its duration
  const sourceDuration = await getAudioDuration({
    src: cleanSrc,
    outputFolder,
  });

  // Each crossfade join shortens the total by CROSSFADE_OVERLAP seconds
  const effectiveDuration = sourceDuration - CROSSFADE_OVERLAP;

  if (effectiveDuration <= 0) {
    throw new Error(
      `Source audio (${sourceDuration}s) is too short for the ` +
        `crossfade overlap (${CROSSFADE_OVERLAP}s)`,
    );
  }

  const times = Math.ceil(timeLength / effectiveDuration);

  // Duplicate and join with crossfade transitions
  await duplicateAudio({
    src: cleanSrc,
    dest: rawDest,
    times,
    outputFolder,
  });

  // Trim the joined audio to exactly the target length
  const result = await cutVideoLength({
    src: rawDest,
    dest: cleanDest,
    to: timeLength,
    justAudio: true,
    outputFolder,
  });

  // Clean up the intermediate untrimmed file
  await deleteMediaFile(`media/${rawDest}`).catch(() => {
    /* best-effort cleanup */
  });

  return result;
};

export default loopAudioToLength;
