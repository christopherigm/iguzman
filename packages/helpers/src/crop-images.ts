import { mkdir, readdir } from 'fs/promises';
import path from 'path';
const sharp = require('sharp');

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

/** Supported aspect ratio presets for cropping. */
export type AspectRatio = 'portrait' | 'landscape' | 'square' | 'wide';

/** Pixel dimensions used for the resize operation. */
interface Dimensions {
  width: number;
  height: number;
}

/** Options for {@link cropImages}. */
export interface CropImagesOptions {
  /** Folder containing the source images. */
  inputFolder: string;
  /** Folder where cropped images will be written (created if missing). */
  outputFolder: string;
  /** Aspect-ratio preset that determines the target dimensions. @default "portrait" */
  aspectRatio?: AspectRatio;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                         */
/* ------------------------------------------------------------------ */

/** Map from aspect-ratio preset to target pixel dimensions. */
const DIMENSIONS: Record<AspectRatio, Dimensions> = {
  portrait: { width: 960, height: 1280 },
  landscape: { width: 1280, height: 960 },
  square: { width: 1280, height: 1280 },
  wide: { width: 1280, height: 720 },
};

/** File extensions recognised as images by sharp. */
const IMAGE_EXTENSIONS = new Set([
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
  '.gif',
  '.avif',
  '.tiff',
  '.tif',
  '.svg',
]);

/* ------------------------------------------------------------------ */
/*  Public API                                                        */
/* ------------------------------------------------------------------ */

/**
 * Resizes every image in `inputFolder` to the given aspect-ratio
 * preset and writes the results to `outputFolder`.
 *
 * Non-image files (directories, dotfiles, etc.) are silently skipped.
 *
 * @example
 * ```ts
 * await cropImages({
 *   inputFolder: 'assets/raw',
 *   outputFolder: 'assets/cropped',
 *   aspectRatio: 'landscape',
 * });
 * ```
 */
const cropImages = async ({
  inputFolder,
  outputFolder,
  aspectRatio = 'portrait',
}: CropImagesOptions): Promise<void> => {
  await mkdir(outputFolder, { recursive: true });

  const entries = await readdir(inputFolder, { withFileTypes: true });

  /** Keep only files whose extension is a known image format. */
  const imageFiles = entries
    .filter((entry) => entry.isFile())
    .filter((entry) =>
      IMAGE_EXTENSIONS.has(path.extname(entry.name).toLowerCase()),
    );

  if (imageFiles.length === 0) return;

  const { width, height } = DIMENSIONS[aspectRatio];

  await Promise.all(
    imageFiles.map((entry) =>
      sharp(path.join(inputFolder, entry.name))
        .resize(width, height)
        .toFile(path.join(outputFolder, entry.name)),
    ),
  );
};

export default cropImages;
