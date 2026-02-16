import { exec } from 'child_process';
import { promisify } from 'util';
import { getAudioDuration } from '@repo/helpers/get-audio-duration';

const execAsync = promisify(exec);

/** Maximum buffer size for ffmpeg command execution (2 MB). */
const MAX_BUFFER = 1024 * 2048;

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
/*  Transition types                                                   */
/* ------------------------------------------------------------------ */

/**
 * Video transition effects supported by the ffmpeg `xfade` filter.
 *
 * @see https://ffmpeg.org/ffmpeg-filters.html#xfade
 */
export type XfadeTransition =
  | 'circleclose'
  | 'circleopen'
  | 'circlecrop'
  | 'diagtl'
  | 'dissolve'
  | 'distance'
  | 'fadeblack'
  | 'fadegrays'
  | 'fadewhite'
  | 'hblur'
  | 'hlslice'
  | 'hrslice'
  | 'pixelize'
  | 'radial'
  | 'rectcrop'
  | 'slidedown'
  | 'slideleft'
  | 'slideright'
  | 'slideup'
  | 'vdslice'
  | 'vuslice'
  | 'wipeleft'
  | 'wiperight';

/* ------------------------------------------------------------------ */
/*  Public API                                                        */
/* ------------------------------------------------------------------ */

/** Options accepted by {@link joinVideosWithTransition}. */
export interface JoinVideosWithTransitionOptions {
  /** Relative path to the first video file (e.g. `"media/intro.mp4"`). */
  readonly src1: string;
  /** Relative path to the second video file (e.g. `"media/outro.mp4"`). */
  readonly src2: string;
  /** Relative path for the output video file (e.g. `"media/joined.mp4"`). */
  readonly dest: string;
  /**
   * Crossfade duration in seconds. The transition begins this many
   * seconds before the first video ends.
   * @defaultValue 3
   */
  readonly duration?: number;
  /**
   * The xfade transition effect to apply.
   * @defaultValue `"dissolve"`
   */
  readonly transition?: XfadeTransition;
  /**
   * Root folder where media files are stored.
   * Defaults to `"/app/media"` in production or `"public/media"` otherwise.
   */
  readonly outputFolder?: string;
}

/**
 * Joins two video files with an `xfade` transition using ffmpeg.
 *
 * The transition offset is computed automatically: the first video's
 * duration is probed via `ffprobe`, then `offset = duration − crossfadeDuration`
 * so the crossfade starts at the right moment.
 *
 * @param options - Source paths, destination, and transition settings.
 * @returns Relative media path to the created file (e.g. `"media/joined.mp4"`).
 * @throws If any path is empty, duration is invalid, or ffmpeg/ffprobe exits with an error.
 *
 * @example
 * ```ts
 * const output = await joinVideosWithTransition({
 *   src1: 'media/part1.mp4',
 *   src2: 'media/part2.mp4',
 *   dest: 'media/combined.mp4',
 *   duration: 2,
 *   transition: 'fadeblack',
 * });
 * console.log(output); // "media/combined.mp4"
 * ```
 */
export const joinVideosWithTransition = async ({
  src1,
  src2,
  dest,
  duration = 3,
  transition = 'dissolve',
  outputFolder = getNodeEnv() === 'production' ? '/app/media' : 'public/media',
}: JoinVideosWithTransitionOptions): Promise<string> => {
  if (!src1 || typeof src1 !== 'string') {
    throw new Error('First source file path must be a non-empty string');
  }

  if (!src2 || typeof src2 !== 'string') {
    throw new Error('Second source file path must be a non-empty string');
  }

  if (!dest || typeof dest !== 'string') {
    throw new Error('Destination file path must be a non-empty string');
  }

  if (
    typeof duration !== 'number' ||
    duration <= 0 ||
    !Number.isFinite(duration)
  ) {
    throw new Error('Duration must be a positive finite number');
  }

  const cleanSrc1 = stripMediaPrefix(src1);
  const cleanSrc2 = stripMediaPrefix(src2);
  const cleanDest = stripMediaPrefix(dest);

  const src1File = `${outputFolder}/${cleanSrc1}`;
  const src2File = `${outputFolder}/${cleanSrc2}`;
  const destFile = `${outputFolder}/${cleanDest}`;

  // Probe the first video's length to compute the transition offset
  const videoLength = await getAudioDuration({
    src: cleanSrc1,
    outputFolder,
  });

  const offset = videoLength - duration;

  if (offset < 0) {
    throw new Error(
      `Crossfade duration (${duration}s) exceeds first video length (${videoLength}s)`,
    );
  }

  const command = [
    'ffmpeg -y',
    `-i "${src1File}"`,
    `-i "${src2File}"`,
    `-filter_complex "xfade=transition=${transition}:duration=${duration}:offset=${offset}"`,
    `"${destFile}"`,
  ].join(' ');

  try {
    await execAsync(command, { maxBuffer: MAX_BUFFER });
    return `media/${cleanDest}`;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Failed to join videos with transition ("${src1File}" + "${src2File}"): ${message}`,
    );
  }
};

export default joinVideosWithTransition;
