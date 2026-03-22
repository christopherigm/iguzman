import base64ToImage from '@repo/helpers/base64-to-image';
import type { ImageDimensions } from '@repo/helpers/get-image-dimensions-from-base64';

/**
 * Loads an image from a URL and returns its intrinsic dimensions.
 *
 * @param url - An absolute or relative image URL
 * @returns A promise that resolves with the image's {@link ImageDimensions}
 *
 * @example
 * ```ts
 * const { width, height, aspectRatio } = await getImageDimensionsFromUrl(
 *   'https://example.com/photo.jpg',
 * );
 * ```
 */
const getImageDimensionsFromUrl = async (url: string): Promise<ImageDimensions> => {
  const image = await base64ToImage(url);

  return {
    width: image.naturalWidth,
    height: image.naturalHeight,
    aspectRatio: image.naturalWidth / image.naturalHeight,
  };
};

export default getImageDimensionsFromUrl;
