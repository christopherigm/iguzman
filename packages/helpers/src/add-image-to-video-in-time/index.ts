import { execFile } from 'child_process';
import * as path from 'path';

/**
 * Supported ffmpeg overlay position expressions.
 *
 * These correspond to ffmpeg filter expression variables:
 * - `main_w` / `main_h` — dimensions of the base (video) layer.
 * - `overlay_w` / `overlay_h` — dimensions of the overlay (image) layer.
 *
 * You may pass any valid ffmpeg expression string (e.g. `'(main_w-overlay_w)/2'`).
 */
export type FfmpegExpression = string;

/** Configuration for overlaying an image on a video during a time range. */
export interface AddImageToVideoOptions {
  /** Path to the source video file (relative to the media folder, with or without a leading `media/` prefix). */
  srcVideo: string;
  /** Path to the overlay image file (relative to the media folder, with or without a leading `media/` prefix). */
  srcImage: string;
  /** Output file path (relative to the media folder, with or without a leading `media/` prefix). */
  dest: string;
  /** Time in seconds when the overlay starts appearing. Defaults to `0`. */
  start?: number;
  /** Time in seconds when the overlay stops appearing. Defaults to `2`. */
  end?: number;
  /**
   * Horizontal position of the overlay as an ffmpeg expression.
   * Defaults to `'(main_w-overlay_w)/2'` (horizontally centred).
   */
  x?: FfmpegExpression;
  /**
   * Vertical position of the overlay as an ffmpeg expression.
   * Defaults to `'main_h-overlay_h'` (bottom edge).
   */
  y?: FfmpegExpression;
  /** Width in pixels to scale the overlay image to. Height is calculated automatically to preserve aspect ratio. Defaults to `200`. */
  width?: number;
  /** Base folder where media files are stored. Defaults to `'/app/media'` in production or `'public/media'` otherwise. */
  outputFolder?: string;
}

/** Result of a successful image overlay operation. */
export interface AddImageToVideoResult {
  /** Relative media path to the output file (e.g. `'media/output.mp4'`). */
  mediaPath: string;
  /** Absolute file path to the output file on disk. */
  absolutePath: string;
}

/**
 * Returns the default media output folder based on `NODE_ENV`.
 * @returns `'/app/media'` in production, `'public/media'` otherwise.
 */
function getDefaultOutputFolder(): string {
  const nodeEnv = process.env.NODE_ENV?.trim() ?? 'localhost';
  return nodeEnv === 'production' ? '/app/media' : 'public/media';
}

/**
 * Strips a leading `media/` prefix from a path. Only removes the prefix
 * at the start of the string — occurrences elsewhere are left intact.
 */
export function stripMediaPrefix(filePath: string): string {
  return filePath.replace(/^media\//, '');
}

/**
 * Builds the ffmpeg argument list for the image overlay operation.
 *
 * The filter chain:
 * 1. Scales the overlay image to the target width (preserving aspect ratio).
 * 2. Positions the scaled image on the video at (`x`, `y`).
 * 3. Limits visibility to the `[start, end]` time window via `enable='between(t, start, end)'`.
 *
 * @param srcVideoFile - Absolute path to the source video.
 * @param srcImageFile - Absolute path to the overlay image.
 * @param destFile     - Absolute path to the output file.
 * @param start        - Start time in seconds for the overlay.
 * @param end          - End time in seconds for the overlay.
 * @param x            - Horizontal position ffmpeg expression.
 * @param y            - Vertical position ffmpeg expression.
 * @param width        - Width in pixels to scale the overlay image to.
 * @returns An array of CLI arguments (without the `ffmpeg` binary itself).
 */
export function buildFfmpegArgs(
  srcVideoFile: string,
  srcImageFile: string,
  destFile: string,
  start: number,
  end: number,
  x: FfmpegExpression,
  y: FfmpegExpression,
  width: number,
): string[] {
  // Build the filter_complex string:
  //   [1:v]scale=<width>:-1[scaled_img];[0:v][scaled_img]overlay=<x>:<y>:enable='between(t,<start>,<end>)'
  const filterComplex =
    `[1:v]scale=${width}:-1[scaled_img];` +
    `[0:v][scaled_img]overlay=${x}:${y}:` +
    `enable='between(t,${start},${end})'`;

  return [
    '-y',
    '-i',
    srcVideoFile,
    '-i',
    srcImageFile,
    '-filter_complex',
    filterComplex,
    destFile,
  ];
}

/**
 * Overlays an image on a video during a specified time range using ffmpeg.
 *
 * The image is scaled to the given `width` (preserving aspect ratio), positioned
 * at (`x`, `y`) on the video frame, and displayed between `start` and `end` seconds.
 *
 * @param options - Overlay configuration (see {@link AddImageToVideoOptions}).
 * @returns A promise that resolves with the output file paths.
 *
 * @throws {Error} If any required parameter is missing or invalid.
 * @throws {Error} If `start` is greater than or equal to `end`.
 * @throws {Error} If ffmpeg exits with a non-zero status.
 *
 * @example
 * ```ts
 * const result = await addImageToVideoInTime({
 *   srcVideo: 'intro.mp4',
 *   srcImage: 'watermark.png',
 *   dest: 'intro-watermarked.mp4',
 *   start: 0,
 *   end: 10,
 *   width: 150,
 * });
 * console.log(result.mediaPath); // 'media/intro-watermarked.mp4'
 * ```
 */
export function addImageToVideoInTime({
  srcVideo,
  srcImage,
  dest,
  start = 0,
  end = 2,
  x = '(main_w-overlay_w)/2',
  y = 'main_h-overlay_h',
  width = 200,
  outputFolder = getDefaultOutputFolder(),
}: AddImageToVideoOptions): Promise<AddImageToVideoResult> {
  // --- Input validation ---
  if (!srcVideo) {
    return Promise.reject(new Error('srcVideo is required'));
  }
  if (!srcImage) {
    return Promise.reject(new Error('srcImage is required'));
  }
  if (!dest) {
    return Promise.reject(new Error('dest is required'));
  }
  if (typeof start !== 'number' || !Number.isFinite(start) || start < 0) {
    return Promise.reject(
      new Error('start must be a non-negative finite number'),
    );
  }
  if (typeof end !== 'number' || !Number.isFinite(end) || end < 0) {
    return Promise.reject(
      new Error('end must be a non-negative finite number'),
    );
  }
  if (start >= end) {
    return Promise.reject(new Error('start must be less than end'));
  }
  if (typeof width !== 'number' || !Number.isFinite(width) || width <= 0) {
    return Promise.reject(new Error('width must be a positive finite number'));
  }

  // --- Resolve absolute file paths ---
  const srcVideoFile = path.join(outputFolder, stripMediaPrefix(srcVideo));
  const srcImageFile = path.join(outputFolder, stripMediaPrefix(srcImage));
  const destClean = stripMediaPrefix(dest);
  const destFile = path.join(outputFolder, destClean);

  // --- Execute ffmpeg via execFile (safe from shell injection) ---
  const args = buildFfmpegArgs(
    srcVideoFile,
    srcImageFile,
    destFile,
    start,
    end,
    x,
    y,
    width,
  );

  return new Promise((resolve, reject) => {
    execFile(
      'ffmpeg',
      args,
      { maxBuffer: 1024 * 2048 },
      (error: Error | null) => {
        if (error) {
          reject(new Error(`ffmpeg failed: ${error.message}`));
          return;
        }
        resolve({
          mediaPath: `media/${destClean}`,
          absolutePath: destFile,
        });
      },
    );
  });
}
