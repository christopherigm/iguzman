import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/** Maximum buffer size for ffprobe command execution (2 MB). */
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

/** Options accepted by {@link getAudioDuration}. */
export interface GetAudioDurationOptions {
  /** Relative path to the audio file (e.g. `"media/clip.wav"`). */
  readonly src: string;
  /**
   * Root folder where media files are stored.
   * Defaults to `"/app/media"` in production or `"public/media"` otherwise.
   */
  readonly outputFolder?: string;
}

/**
 * Returns the duration (in seconds) of an audio file using `ffprobe`.
 *
 * Works with any format that ffprobe supports (WAV, MP3, OGG, etc.),
 * not only WAV files.
 *
 * @param options - Source path and optional output folder override.
 * @returns Duration of the audio file in seconds.
 * @throws If `src` is empty or `ffprobe` exits with an error.
 *
 * @example
 * ```ts
 * const seconds = await getAudioDuration({ src: 'media/clip.wav' });
 * console.log(`Duration: ${seconds}s`);
 * ```
 */
export const getAudioDuration = async ({
  src,
  outputFolder = getNodeEnv() === 'production'
    ? '/app/media'
    : 'public/media',
}: GetAudioDurationOptions): Promise<number> => {
  if (!src || typeof src !== 'string') {
    throw new Error('Source file path must be a non-empty string');
  }

  const cleanSrc = stripMediaPrefix(src);
  const filePath = `${outputFolder}/${cleanSrc}`;

  const command = [
    'ffprobe -v error',
    '-show_entries format=duration',
    '-of default=noprint_wrappers=1:nokey=1',
    `"${filePath}"`,
  ].join(' ');

  try {
    const { stdout } = await execAsync(command, { maxBuffer: MAX_BUFFER });
    const duration = Number(stdout.trim());

    if (Number.isNaN(duration)) {
      throw new Error(`ffprobe returned non-numeric output: "${stdout.trim()}"`);
    }

    return duration;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to get audio duration for "${filePath}": ${message}`);
  }
};

export default getAudioDuration;
