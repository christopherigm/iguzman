import { existsSync, readdirSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';

/** Maps common base64 image MIME types to file extensions. */
const MIME_TO_EXTENSION: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'image/svg+xml': '.svg',
  'image/bmp': '.bmp',
  'image/avif': '.avif',
};

/** Default file extension when the MIME type cannot be determined. */
const DEFAULT_EXTENSION = '.jpg';

/**
 * Extracts the MIME type and raw base64 data from a data-URI string.
 *
 * @param dataUri - A string such as `"data:image/png;base64,iVBOR..."`.
 * @returns A tuple of `[extension, base64Data]`.
 */
function parseDataUri(dataUri: string): [extension: string, base64Data: string] {
  const [header, data] = dataUri.split(';base64,');

  if (!data) {
    // Plain base64 string without a data-URI prefix — assume JPEG.
    return [DEFAULT_EXTENSION, dataUri];
  }

  const mime = header?.replace('data:', '') ?? '';
  const extension = MIME_TO_EXTENSION[mime] ?? DEFAULT_EXTENSION;

  return [extension, data];
}

/**
 * Writes an array of base64-encoded images to disk inside `destinationFolder`.
 *
 * Files are numbered sequentially starting after any files already present in
 * the folder, so existing files are never overwritten. The file extension is
 * inferred from the data-URI MIME type (defaults to `.jpg`).
 *
 * @param destinationFolder - Absolute or relative path to the target directory.
 * @param images - Array of base64 strings or data URIs.
 *
 * @example
 * ```ts
 * await saveBase64Images('/tmp/photos', [
 *   'data:image/png;base64,iVBOR...',
 *   'data:image/jpeg;base64,/9j/4A...',
 * ]);
 * ```
 */
const saveBase64Images = async (
  destinationFolder: string,
  images: string[] = [],
): Promise<void> => {
  if (!images.length) return;

  if (!existsSync(destinationFolder)) {
    await mkdir(destinationFolder, { recursive: true });
  }

  const existingFiles = readdirSync(destinationFolder);
  const startIndex = existingFiles.length;

  await Promise.all(
    images.map(async (image, index) => {
      const [extension, base64Data] = parseDataUri(image);
      const filePath = `${destinationFolder}/${startIndex + index}${extension}`;

      await writeFile(filePath, base64Data, { encoding: 'base64' });
    }),
  );
};

export default saveBase64Images;
