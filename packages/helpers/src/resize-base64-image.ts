import base64ToImage from '@iguzman/helpers/base64-to-image';

/** Valid rotation angles (in degrees, clockwise). */
type RotationDegrees = 0 | 90 | 180 | 270;

interface ResizeBase64ImageOptions {
  /** Maximum width of the output image in pixels. @default 100 */
  maxWidth?: number;
  /** Maximum height of the output image in pixels. @default 100 */
  maxHeight?: number;
  /** Clockwise rotation to apply after resizing. @default 0 */
  degrees?: RotationDegrees;
}

/**
 * Resizes (and optionally rotates) a base64-encoded image so it fits within
 * the given bounding box while preserving its aspect ratio.
 *
 * The image is scaled down using the smallest ratio so that neither dimension
 * exceeds the specified maximum. Rotation is applied **after** resizing.
 *
 * @param base64Image - A base64 string or data URI (e.g. `"data:image/png;base64,..."`)
 * @param options - Resize and rotation options
 * @returns A data-URI string of the resized (and optionally rotated) image
 *
 * @example
 * ```ts
 * const resized = await resizeBase64Image(base64, { maxWidth: 200, maxHeight: 200 });
 * ```
 *
 * @example
 * ```ts
 * const rotated = await resizeBase64Image(base64, { maxWidth: 400, maxHeight: 400, degrees: 90 });
 * ```
 */
const resizeBase64Image = async (
  base64Image: string,
  { maxWidth = 100, maxHeight = 100, degrees = 0 }: ResizeBase64ImageOptions = {},
): Promise<string> => {
  const img = await base64ToImage(base64Image);

  /** Pick the smallest scale factor so the image fits inside the bounding box. */
  const ratio = Math.min(maxWidth / img.width, maxHeight / img.height, 1);

  const scaledWidth = Math.round(img.width * ratio);
  const scaledHeight = Math.round(img.height * ratio);

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    throw new Error('Failed to get 2D canvas context');
  }

  /** Swap canvas dimensions when rotating 90 or 270 degrees. */
  const isOrthogonal = degrees === 90 || degrees === 270;
  canvas.width = isOrthogonal ? scaledHeight : scaledWidth;
  canvas.height = isOrthogonal ? scaledWidth : scaledHeight;

  /** Translate to center, rotate, then draw the image centered. */
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((degrees * Math.PI) / 180);
  ctx.drawImage(img, -scaledWidth / 2, -scaledHeight / 2, scaledWidth, scaledHeight);

  return canvas.toDataURL();
};

export default resizeBase64Image;
