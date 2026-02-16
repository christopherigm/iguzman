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

/** Options accepted by {@link upscaleVideoFps}. */
export interface UpscaleVideoFpsOptions {
  /** Relative path to the source video file (e.g. `"media/clip.mp4"`). */
  readonly src: string;
  /** Relative path for the output video file (e.g. `"media/clip-60fps.mp4"`). */
  readonly dest: string;
  /**
   * Target frame rate for the output video.
   * Uses motion interpolation (`minterpolate`) to generate intermediate frames.
   * @defaultValue 60
   */
  readonly fps?: number;
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
 * Upscales the frame rate of a video using ffmpeg's `minterpolate` filter.
 *
 * Motion interpolation generates intermediate frames to produce smoother
 * playback at the target frame rate.
 *
 * Uses `execFile` with an explicit args array to prevent shell-injection risks.
 *
 * @param options - Source/destination paths and FPS settings.
 * @returns Relative media path to the output file (e.g. `"media/clip-60fps.mp4"`).
 * @throws If ffmpeg exits with an error.
 *
 * @example
 * ```ts
 * const output = await upscaleVideoFps({
 *   src: 'media/clip.mp4',
 *   dest: 'media/clip-60fps.mp4',
 *   fps: 60,
 * });
 * console.log(output); // "media/clip-60fps.mp4"
 * ```
 */
const upscaleVideoFps = ({
  src,
  dest,
  fps = 60,
  outputFolder = DEFAULT_OUTPUT_FOLDER,
}: UpscaleVideoFpsOptions): Promise<string> => {
  const cleanSrc = stripMediaPrefix(src);
  const cleanDest = stripMediaPrefix(dest);

  const srcFile = `${outputFolder}/${cleanSrc}`;
  const destFile = `${outputFolder}/${cleanDest}`;

  const args: string[] = [
    '-y',
    '-i', srcFile,
    '-filter:v', 'minterpolate',
    '-r', String(fps),
    destFile,
  ];

  return new Promise<string>((resolve, reject) => {
    execFile('ffmpeg', args, { maxBuffer: MAX_BUFFER }, (error) => {
      if (error) {
        console.error('upscaleVideoFps error:', error);
        return reject(error);
      }
      return resolve(`media/${cleanDest}`);
    });
  });
};

export default upscaleVideoFps;
