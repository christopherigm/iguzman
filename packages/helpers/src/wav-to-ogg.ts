import { execFile } from 'child_process';

/* ------------------------------------------------------------------ */
/*  Constants                                                         */
/* ------------------------------------------------------------------ */

/** Maximum buffer size for ffmpeg command execution (2 MB). */
const MAX_BUFFER = 1024 * 2048;

const NODE_ENV = process.env.NODE_ENV?.trim() ?? 'localhost';

/** Default output folder based on the current environment. */
const DEFAULT_OUTPUT_FOLDER =
  NODE_ENV === 'production' ? '/app/media' : 'public/media';

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

/** Options accepted by {@link convertWavToOgg}. */
export interface ConvertWavToOggOptions {
  /** Relative path to the source WAV file (e.g. `"media/audio.wav"`). */
  readonly src: string;
  /** Relative path for the output OGG file (e.g. `"media/audio.ogg"`). */
  readonly dest: string;
  /**
   * Root folder where media files are stored.
   * Defaults to `"/app/media"` in production or `"public/media"` otherwise.
   */
  readonly outputFolder?: string;
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

/* ------------------------------------------------------------------ */
/*  Public API                                                        */
/* ------------------------------------------------------------------ */

/**
 * Converts a WAV audio file to OGG format using ffmpeg.
 *
 * This function uses the libvorbis audio codec with quality setting 10
 * and stereo output (2 channels).
 *
 * Uses `execFile` with an explicit args array to prevent shell-injection risks.
 *
 * @param options - Source/destination paths and output folder settings.
 * @returns Relative media path to the output file (e.g. `"media/audio.ogg"`).
 * @throws If ffmpeg exits with an error.
 *
 * @example
 * ```ts
 * const output = await convertWavToOgg({
 *   src: 'media/audio.wav',
 *   dest: 'media/audio.ogg',
 * });
 * console.log(output); // "media/audio.ogg"
 * ```
 */
const convertWavToOgg = ({
  src,
  dest,
  outputFolder = DEFAULT_OUTPUT_FOLDER,
}: ConvertWavToOggOptions): Promise<string> => {
  const cleanSrc = stripMediaPrefix(src);
  const cleanDest = stripMediaPrefix(dest);

  const srcFile = `${outputFolder}/${cleanSrc}`;
  const destFile = `${outputFolder}/${cleanDest}`;

  const args: string[] = [
    '-y',
    '-i',
    srcFile,
    '-c:a',
    'libvorbis',
    '-qscale:a',
    '10',
    '-ac',
    '2',
    destFile,
  ];

  return new Promise<string>((resolve, reject) => {
    execFile('ffmpeg', args, { maxBuffer: MAX_BUFFER }, (error) => {
      if (error) {
        console.error('convertWavToOgg error:', error);
        return reject(error);
      }
      return resolve(`media/${cleanDest}`);
    });
  });
};

export default convertWavToOgg;
