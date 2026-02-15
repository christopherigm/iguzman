/**
 * Loads a base64-encoded (or data-URI) string into an `HTMLImageElement`.
 *
 * The returned promise resolves once the browser has fully decoded the image
 * and rejects if the source is invalid or the image fails to load.
 *
 * @param src - A base64 string or data URI (e.g. `"data:image/png;base64,..."`)
 * @returns A promise that resolves with the loaded {@link HTMLImageElement}
 *
 * @example
 * ```ts
 * const img = await base64ToImage('data:image/png;base64,iVBORw0KGgo...');
 * console.log(img.naturalWidth, img.naturalHeight);
 * ```
 */
const base64ToImage = (src: string): Promise<HTMLImageElement> => {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Failed to load image: ${src.slice(0, 50)}...`));
    image.src = src;
  });
};

export default base64ToImage;
