import { mkdir, rm } from 'fs/promises';
import { joinAudiosWithCrossfade } from '@repo/helpers/join-2-audios-with-transition';
import copyFile from '@repo/helpers/copy-file';
import getRandomNumber from '@repo/helpers/random-number';

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

/** Options accepted by {@link duplicateAudio}. */
export interface DuplicateAudioOptions {
  /** Relative path to the source audio file (e.g. `"media/clip.wav"`). */
  readonly src: string;
  /** Relative path for the final output file (e.g. `"media/looped.wav"`). */
  readonly dest: string;
  /**
   * How many copies of the source audio to join together.
   * Must be at least 1.
   * @defaultValue 2
   */
  readonly times?: number;
  /**
   * Root folder where media files are stored.
   * Defaults to `"/app/media"` in production or `"public/media"` otherwise.
   */
  readonly outputFolder?: string;
}

/**
 * Reduces an array of audio file paths down to a single file by
 * repeatedly joining adjacent pairs with a crossfade transition.
 *
 * Works in-place on a copy of the array: pops two items, joins them
 * into a temporary file, pushes the result back, and repeats until
 * only one file remains.
 *
 * @param audios      - Mutable array of relative audio paths.
 * @param tmpFolder   - Relative path to the temporary working directory.
 * @param outputFolder - Root media folder (passed to the join function).
 * @returns The relative path of the final merged audio file.
 */
const mergeAudios = async (
  audios: string[],
  tmpFolder: string,
  outputFolder: string,
): Promise<string> => {
  if (audios.length < 2) {
    throw new Error('At least two audio files are required to merge');
  }

  const queue = [...audios];

  while (queue.length >= 2) {
    const src1 = queue.shift()!;
    const src2 = queue.shift()!;
    const dest = `${tmpFolder}/${queue.length}.tmp.wav`;

    await joinAudiosWithCrossfade({
      src1,
      src2,
      dest,
      outputFolder,
    });

    queue.push(dest);
  }

  return queue[0];
};

/**
 * Duplicates an audio file N times and joins all copies together
 * using crossfade transitions, producing a single looped output.
 *
 * **Workflow:**
 * 1. Creates a temporary directory with a random name.
 * 2. Copies the source file N times into that directory.
 * 3. Iteratively joins adjacent copies with {@link joinAudiosWithCrossfade}.
 * 4. Copies the final merged file to `dest`.
 * 5. Cleans up the temporary directory.
 *
 * @param options - Source/destination paths, repeat count, and folder override.
 * @returns Relative media path to the output file (e.g. `"media/looped.wav"`).
 * @throws If paths are empty, `times` is less than 1, or any ffmpeg operation fails.
 *
 * @example
 * ```ts
 * const output = await duplicateAudio({
 *   src: 'media/sample.wav',
 *   dest: 'media/sample-x3.wav',
 *   times: 3,
 * });
 * console.log(output); // "media/sample-x3.wav"
 * ```
 */
export const duplicateAudio = async ({
  src,
  dest,
  times = 2,
  outputFolder = getNodeEnv() === 'production' ? '/app/media' : 'public/media',
}: DuplicateAudioOptions): Promise<string> => {
  if (!src || typeof src !== 'string') {
    throw new Error('Source file path must be a non-empty string');
  }

  if (!dest || typeof dest !== 'string') {
    throw new Error('Destination file path must be a non-empty string');
  }

  if (!Number.isInteger(times) || times < 1) {
    throw new Error('Times must be a positive integer (at least 1)');
  }

  const cleanSrc = stripMediaPrefix(src);
  const cleanDest = stripMediaPrefix(dest);

  // If only 1 copy is requested, just copy the file directly
  if (times === 1) {
    return copyFile({ src: cleanSrc, dest: cleanDest, outputFolder });
  }

  const tmpFolder = getRandomNumber(4000, 999999).toString();
  const tmpFolderAbsolute = `${outputFolder}/${tmpFolder}`;

  await mkdir(tmpFolderAbsolute, { recursive: true });

  try {
    // Copy the source file N times into the temp directory
    const audios: string[] = [];

    const copyOperations = Array.from({ length: times }, (_, i) => {
      const fileName = `${tmpFolder}/${i}-${cleanSrc}`;
      audios.push(fileName);
      return copyFile({ src: cleanSrc, dest: fileName, outputFolder });
    });

    await Promise.all(copyOperations);

    // Iteratively merge all copies with crossfade transitions
    const mergedFile = await mergeAudios(audios, tmpFolder, outputFolder);

    // Copy the final result to the intended destination
    await copyFile({ src: mergedFile, dest: cleanDest, outputFolder });

    return `media/${cleanDest}`;
  } finally {
    // Clean up the temporary directory regardless of success or failure
    await rm(tmpFolderAbsolute, { recursive: true, force: true }).catch(() => {
      /* best-effort cleanup */
    });
  }
};

export default duplicateAudio;
