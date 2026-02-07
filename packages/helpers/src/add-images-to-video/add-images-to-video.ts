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

/** Configuration for a single image overlay within the video. */
export interface ImageOverlay {
  /** Path to the overlay image file (relative to the media folder, with or without a leading `media/` prefix). */
  srcImage: string;
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
}

/** Configuration for overlaying multiple images on a video. */
export interface AddImagesToVideoOptions {
  /** Path to the source video file (relative to the media folder, with or without a leading `media/` prefix). */
  srcVideo: string;
  /** Output file path (relative to the media folder, with or without a leading `media/` prefix). */
  dest: string;
  /** Array of image overlays to apply to the video. Must contain at least one entry. */
  images: ImageOverlay[];
  /** Base folder where media files are stored. Defaults to `'/app/media'` in production or `'public/media'` otherwise. */
  outputFolder?: string;
}

/** Result of a successful multi-image overlay operation. */
export interface AddImagesToVideoResult {
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

/** Image overlay with all defaults resolved (no optional fields). */
interface ResolvedImageOverlay {
  srcImage: string;
  start: number;
  end: number;
  x: FfmpegExpression;
  y: FfmpegExpression;
  width: number;
}

/**
 * Applies default values to an {@link ImageOverlay}, producing a fully resolved overlay.
 */
function resolveImageDefaults(image: ImageOverlay): ResolvedImageOverlay {
  return {
    srcImage: image.srcImage,
    start: image.start ?? 0,
    end: image.end ?? 2,
    x: image.x ?? '(main_w-overlay_w)/2',
    y: image.y ?? 'main_h-overlay_h',
    width: image.width ?? 200,
  };
}

/**
 * Validates a single resolved image overlay entry.
 *
 * @param image - The resolved image overlay to validate.
 * @param index - Zero-based index of the image in the array (used in error messages).
 * @returns An error message string if validation fails, or `null` if valid.
 */
function validateImage(
  image: ResolvedImageOverlay,
  index: number,
): string | null {
  if (!image.srcImage) {
    return `images[${index}].srcImage is required`;
  }
  if (
    typeof image.start !== 'number' ||
    !Number.isFinite(image.start) ||
    image.start < 0
  ) {
    return `images[${index}].start must be a non-negative finite number`;
  }
  if (
    typeof image.end !== 'number' ||
    !Number.isFinite(image.end) ||
    image.end < 0
  ) {
    return `images[${index}].end must be a non-negative finite number`;
  }
  if (image.start >= image.end) {
    return `images[${index}].start must be less than end`;
  }
  if (
    typeof image.width !== 'number' ||
    !Number.isFinite(image.width) ||
    image.width <= 0
  ) {
    return `images[${index}].width must be a positive finite number`;
  }
  return null;
}

/**
 * Builds the ffmpeg argument list for overlaying multiple images on a video.
 *
 * The filter chain:
 * 1. Sets the video SAR to 1 to normalise pixel aspect ratios (`setsar=1`).
 * 2. Scales each overlay image to its target width (preserving aspect ratio).
 * 3. Chains overlay filters so each image is composited on top of the previous result.
 * 4. Each overlay is time-limited via `enable='between(t, start, end)'`.
 * 5. Audio is passthrough-copied when present (`-map 0:a? -c:a copy`).
 *
 * @param srcVideoFile   - Absolute path to the source video.
 * @param srcImageFiles  - Absolute paths to each overlay image (in order).
 * @param destFile       - Absolute path to the output file.
 * @param images         - Resolved image overlay configurations (same order as `srcImageFiles`).
 * @returns An array of CLI arguments (without the `ffmpeg` binary itself).
 */
export function buildMultiImageFfmpegArgs(
  srcVideoFile: string,
  srcImageFiles: string[],
  destFile: string,
  images: ResolvedImageOverlay[],
): string[] {
  const args: string[] = ['-y', '-i', srcVideoFile];

  // Add each overlay image as an input
  for (const imageFile of srcImageFiles) {
    args.push('-i', imageFile);
  }

  // Build the filter_complex string:
  //   [0:v]setsar=1[base];
  //   [1:v]scale=<width>:-1[img1]; ...
  //   [base][img1]overlay=<x>:<y>:enable='between(t,<start>,<end>)'[v1]; ...
  //   ... last overlay outputs [outv]
  let filterComplex = '[0:v]setsar=1[base];';

  // Scale each overlay image
  for (let i = 0; i < images.length; i++) {
    filterComplex += `[${i + 1}:v]scale=${images[i]!.width}:-1[img${i + 1}];`;
  }

  // Chain overlay filters
  for (let i = 0; i < images.length; i++) {
    const { x, y, start, end } = images[i]!;
    const inputLabel = i === 0 ? '[base]' : `[v${i}]`;
    const outputLabel = i === images.length - 1 ? '[outv]' : `[v${i + 1}];`;

    filterComplex += `${inputLabel}[img${i + 1}]overlay=${x}:${y}:enable='between(t,${start},${end})'${outputLabel}`;
  }

  args.push('-filter_complex', filterComplex);
  args.push('-map', '[outv]', '-map', '0:a?', '-c:a', 'copy');
  args.push(destFile);

  return args;
}

/**
 * Overlays multiple images on a video during specified time ranges using ffmpeg.
 *
 * Each image is scaled to its configured `width` (preserving aspect ratio), positioned
 * at (`x`, `y`) on the video frame, and displayed between its `start` and `end` seconds.
 * Images are composited in array order (later entries appear on top of earlier ones).
 *
 * @param options - Overlay configuration (see {@link AddImagesToVideoOptions}).
 * @returns A promise that resolves with the output file paths.
 *
 * @throws {Error} If `srcVideo` or `dest` is missing.
 * @throws {Error} If `images` is empty.
 * @throws {Error} If any image entry has invalid fields (missing `srcImage`, bad `start`/`end`/`width`).
 * @throws {Error} If ffmpeg exits with a non-zero status.
 *
 * @example
 * ```ts
 * const result = await addImagesToVideo({
 *   srcVideo: 'intro.mp4',
 *   dest: 'intro-with-overlays.mp4',
 *   images: [
 *     { srcImage: 'logo.png', start: 0, end: 5, width: 150 },
 *     { srcImage: 'badge.png', start: 3, end: 8, x: '10', y: '10', width: 100 },
 *   ],
 * });
 * console.log(result.mediaPath); // 'media/intro-with-overlays.mp4'
 * ```
 */
export function addImagesToVideo({
  srcVideo,
  dest,
  images = [],
  outputFolder = getDefaultOutputFolder(),
}: AddImagesToVideoOptions): Promise<AddImagesToVideoResult> {
  // --- Input validation ---
  if (!srcVideo) {
    return Promise.reject(new Error('srcVideo is required'));
  }
  if (!dest) {
    return Promise.reject(new Error('dest is required'));
  }
  if (images.length === 0) {
    return Promise.reject(new Error('images must contain at least one entry'));
  }

  // Resolve defaults and validate each image
  const resolvedImages = images.map(resolveImageDefaults);
  for (let i = 0; i < resolvedImages.length; i++) {
    const error = validateImage(resolvedImages[i]!, i);
    if (error) {
      return Promise.reject(new Error(error));
    }
  }

  // --- Resolve absolute file paths ---
  const srcVideoFile = path.join(outputFolder, stripMediaPrefix(srcVideo));
  const srcImageFiles = resolvedImages.map((img) =>
    path.join(outputFolder, 'people', stripMediaPrefix(img.srcImage)),
  );
  const destClean = stripMediaPrefix(dest);
  const destFile = path.join(outputFolder, destClean);

  // --- Execute ffmpeg via execFile (safe from shell injection) ---
  const args = buildMultiImageFfmpegArgs(
    srcVideoFile,
    srcImageFiles,
    destFile,
    resolvedImages,
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
