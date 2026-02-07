import base64ToImage from '@iguzman/helpers/base64-to-image';

/** The intrinsic dimensions of a decoded image. */
export interface ImageDimensions {
  /** Width in pixels (intrinsic / natural). */
  width: number;
  /** Height in pixels (intrinsic / natural). */
  height: number;
  /** Aspect ratio (`width / height`). */
  aspectRatio: number;
}

/**
 * Decodes a base64-encoded image and returns its intrinsic dimensions.
 *
 * @param base64String - A base64 string or data URI (e.g. `"data:image/png;base64,..."`)
 * @returns A promise that resolves with the image's {@link ImageDimensions}
 *
 * @example
 * ```ts
 * const { width, height, aspectRatio } = await getImageDimensionsFromBase64(
 *   'data:image/png;base64,iVBORw0KGgo...',
 * );
 * ```
 */
const getImageDimensionsFromBase64 = async (
  base64String: string,
): Promise<ImageDimensions> => {
  const image = await base64ToImage(base64String);

  return {
    width: image.naturalWidth,
    height: image.naturalHeight,
    aspectRatio: image.naturalWidth / image.naturalHeight,
  };
};

export default getImageDimensionsFromBase64;
