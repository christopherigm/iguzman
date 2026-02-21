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

/** Default black-pixel intensity threshold for cropdetect (0–255). */
const DEFAULT_LIMIT = 24;

/**
 * Default dimension rounding for cropdetect.
 * 16 is optimal for most video codecs; use 2 for 4:2:2 content.
 */
const DEFAULT_ROUND = 16;

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

/** Crop rectangle returned by {@link detectBlackBars}. */
export interface CropParams {
  /** Output width in pixels. */
  readonly w: number;
  /** Output height in pixels (video height minus top and bottom bars). */
  readonly h: number;
  /** Horizontal offset from the left edge in pixels. */
  readonly x: number;
  /** Vertical offset from the top edge in pixels. */
  readonly y: number;
}

/** Options for {@link detectBlackBars}. */
export interface DetectBlackBarsOptions {
  /** Source video path (a leading `media/` prefix is stripped automatically). */
  readonly src: string;
  /**
   * Black-pixel intensity threshold (0–255). Pixels with an intensity
   * **above** this value are considered non-black. Lower values make the
   * detector stricter (only very dark pixels count as black bars).
   * @default 24
   */
  readonly limit?: number;
  /**
   * Value that crop dimensions are rounded to.
   * Use `2` for 4:2:2 video, `16` (the default) for most codecs.
   * @default 16
   */
  readonly round?: number;
  /** Folder that contains the media files. */
  readonly outputFolder?: string;
}

/** Options for {@link removeBlackBars}. */
export interface RemoveBlackBarsOptions {
  /** Source video path (a leading `media/` prefix is stripped automatically). */
  readonly src: string;
  /** Destination video path (a leading `media/` prefix is stripped automatically). */
  readonly dest: string;
  /**
   * Black-pixel intensity threshold (0–255) forwarded to cropdetect.
   * @default 24
   */
  readonly limit?: number;
  /**
   * Dimension rounding forwarded to cropdetect.
   * @default 16
   */
  readonly round?: number;
  /** Folder that contains the media files. */
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

/**
 * Extracts the last `crop=W:H:X:Y` token from ffmpeg's cropdetect stderr.
 *
 * cropdetect emits one line per frame; the **last** line holds the
 * largest accumulated crop area (most representative of the whole video).
 *
 * Example line:
 * ```
 * [Parsed_cropdetect_0 @ 0x…] x1:0 x2:1279 y1:140 y2:859 w:1280 h:720 x:0 y:140 crop=1280:720:0:140
 * ```
 */
const parseCropParams = (output: string): CropParams | null => {
  const matches = [...output.matchAll(/crop=(\d+):(\d+):(\d+):(\d+)/g)];
  if (matches.length === 0) return null;
  const last = matches[matches.length - 1]!;
  return {
    w: parseInt(last[1]!, 10),
    h: parseInt(last[2]!, 10),
    x: parseInt(last[3]!, 10),
    y: parseInt(last[4]!, 10),
  };
};

/* ------------------------------------------------------------------ */
/*  Public API                                                        */
/* ------------------------------------------------------------------ */

/**
 * Analyses a video with ffmpeg's `cropdetect` filter and returns the
 * tightest crop rectangle that excludes black bars.
 *
 * The entire video is scanned (reset=0) and the last crop value reported
 * by cropdetect — which accumulates the largest detected area — is returned.
 *
 * Uses `execFile` with an explicit args array to prevent shell-injection risks.
 *
 * @returns The recommended {@link CropParams} for removing black bars.
 * @throws If cropdetect produces no crop output or the video cannot be read.
 *
 * @example
 * ```ts
 * const crop = await detectBlackBars({ src: 'media/movie.mp4' });
 * console.log(crop); // { w: 1920, h: 800, x: 0, y: 140 }
 * ```
 */
export const detectBlackBars = ({
  src,
  limit = DEFAULT_LIMIT,
  round = DEFAULT_ROUND,
  outputFolder = DEFAULT_OUTPUT_FOLDER,
}: DetectBlackBarsOptions): Promise<CropParams> => {
  const srcFile = `${outputFolder}/${stripMediaPrefix(src)}`;

  // cropdetect writes results to stderr; -f null discards encoded output.
  const args = [
    '-i',
    srcFile,
    '-vf',
    `cropdetect=limit=${limit}:round=${round}:reset=0`,
    '-f',
    'null',
    '-',
  ];

  return new Promise<CropParams>((resolve, reject) => {
    execFile(
      'ffmpeg',
      args,
      { maxBuffer: MAX_BUFFER },
      (error, _stdout, stderr) => {
        const params = parseCropParams(stderr);
        if (!params) {
          const reason = error
            ? `ffmpeg exited with an error: ${error.message}`
            : 'no crop parameters detected — the video may have no black bars';
          return reject(new Error(`detectBlackBars "${src}": ${reason}`));
        }
        resolve(params);
      },
    );
  });
};

/**
 * Detects and removes horizontal black bars (letterboxing) from a video
 * using ffmpeg's `cropdetect` + `crop` filter pipeline.
 *
 * **Pipeline:**
 * 1. Runs `cropdetect` on the full source video to determine the tightest crop.
 * 2. Re-encodes the video with the detected `crop` filter applied; the audio
 *    stream is copied without re-encoding.
 *
 * Uses `execFile` with an explicit args array to prevent shell-injection risks.
 *
 * @returns The relative media path of the cropped output (e.g. `"media/out.mp4"`).
 * @throws If detection fails or ffmpeg exits with an error during cropping.
 *
 * @example
 * ```ts
 * const output = await removeBlackBars({
 *   src: 'media/movie.mp4',
 *   dest: 'media/movie-cropped.mp4',
 * });
 * console.log(output); // "media/movie-cropped.mp4"
 * ```
 */
const removeBlackBars = async ({
  src,
  dest,
  limit = DEFAULT_LIMIT,
  round = DEFAULT_ROUND,
  outputFolder = DEFAULT_OUTPUT_FOLDER,
}: RemoveBlackBarsOptions): Promise<string> => {
  const cleanSrc = stripMediaPrefix(src);
  const cleanDest = stripMediaPrefix(dest);

  const srcFile = `${outputFolder}/${cleanSrc}`;
  const destFile = `${outputFolder}/${cleanDest}`;

  const { w, h, x, y } = await detectBlackBars({
    src,
    limit,
    round,
    outputFolder,
  });

  const args = [
    '-y',
    '-i',
    srcFile,
    '-vf',
    `crop=${w}:${h}:${x}:${y}`,
    '-c:a',
    'copy',
    destFile,
  ];

  return new Promise<string>((resolve, reject) => {
    execFile('ffmpeg', args, { maxBuffer: MAX_BUFFER }, (error) => {
      if (error) {
        console.error('removeBlackBars crop error:', error);
        return reject(error);
      }
      resolve(`media/${cleanDest}`);
    });
  });
};

export default removeBlackBars;
