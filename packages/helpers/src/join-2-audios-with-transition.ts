import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/** Maximum buffer size for ffmpeg command execution (2 MB). */
const MAX_BUFFER = 1024 * 2048;

/**
 * Resolves the current Node environment, defaulting to `"localhost"`
 * when `NODE_ENV` is not set.
 */
const getNodeEnv = (): string =>
  process.env.NODE_ENV?.trim() ?? 'localhost';

/**
 * Removes a leading `media/` prefix from a file path so it can be
 * joined with the output folder without duplicating the segment.
 */
const stripMediaPrefix = (filePath: string): string =>
  filePath.replace(/^media\//, '');

/* ------------------------------------------------------------------ */
/*  Public API                                                        */
/* ------------------------------------------------------------------ */

/** Options accepted by {@link joinAudiosWithCrossfade}. */
export interface JoinAudiosWithCrossfadeOptions {
  /** Relative path to the first audio file (e.g. `"media/intro.wav"`). */
  readonly src1: string;
  /** Relative path to the second audio file (e.g. `"media/outro.wav"`). */
  readonly src2: string;
  /** Relative path for the output audio file (e.g. `"media/joined.wav"`). */
  readonly dest: string;
  /**
   * Crossfade duration in seconds.
   * The end of the first track overlaps with the beginning of the second
   * track for this many seconds using exponential / logarithmic curves.
   * @defaultValue 5
   */
  readonly duration?: number;
  /**
   * Root folder where media files are stored.
   * Defaults to `"/app/media"` in production or `"public/media"` otherwise.
   */
  readonly outputFolder?: string;
}

/**
 * Joins two audio files with an `acrossfade` transition using ffmpeg.
 *
 * The fade-out curve of the first track uses an exponential shape (`exp`)
 * and the fade-in curve of the second track uses a logarithmic shape
 * (`log`), producing a natural-sounding crossfade.
 *
 * @param options - Source paths, destination, and crossfade settings.
 * @returns Relative media path to the created file (e.g. `"media/joined.wav"`).
 * @throws If any path is empty, duration is invalid, or ffmpeg exits with an error.
 *
 * @example
 * ```ts
 * const output = await joinAudiosWithCrossfade({
 *   src1: 'media/part1.wav',
 *   src2: 'media/part2.wav',
 *   dest: 'media/combined.wav',
 *   duration: 3,
 * });
 * console.log(output); // "media/combined.wav"
 * ```
 */
export const joinAudiosWithCrossfade = async ({
  src1,
  src2,
  dest,
  duration = 5,
  outputFolder = getNodeEnv() === 'production'
    ? '/app/media'
    : 'public/media',
}: JoinAudiosWithCrossfadeOptions): Promise<string> => {
  if (!src1 || typeof src1 !== 'string') {
    throw new Error('First source file path must be a non-empty string');
  }

  if (!src2 || typeof src2 !== 'string') {
    throw new Error('Second source file path must be a non-empty string');
  }

  if (!dest || typeof dest !== 'string') {
    throw new Error('Destination file path must be a non-empty string');
  }

  if (typeof duration !== 'number' || duration <= 0 || !Number.isFinite(duration)) {
    throw new Error('Duration must be a positive finite number');
  }

  const cleanSrc1 = stripMediaPrefix(src1);
  const cleanSrc2 = stripMediaPrefix(src2);
  const cleanDest = stripMediaPrefix(dest);

  const src1File = `${outputFolder}/${cleanSrc1}`;
  const src2File = `${outputFolder}/${cleanSrc2}`;
  const destFile = `${outputFolder}/${cleanDest}`;

  const command = [
    'ffmpeg -y',
    `-i "${src1File}"`,
    `-i "${src2File}"`,
    `-filter_complex "[0:a][1:a]acrossfade=d=${duration}:c1=exp:c2=log"`,
    `"${destFile}"`,
  ].join(' ');

  try {
    await execAsync(command, { maxBuffer: MAX_BUFFER });
    return `media/${cleanDest}`;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Failed to join audios with crossfade ("${src1File}" + "${src2File}"): ${message}`,
    );
  }
};

export default joinAudiosWithCrossfade;
