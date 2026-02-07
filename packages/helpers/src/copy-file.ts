import { cp } from 'fs/promises';

/* ------------------------------------------------------------------ */
/*  Constants                                                         */
/* ------------------------------------------------------------------ */

const NODE_ENV = process.env.NODE_ENV?.trim() ?? 'localhost';

/** Default output folder based on the current environment. */
const DEFAULT_OUTPUT_FOLDER =
  NODE_ENV === 'production' ? '/app/media' : 'public/media';

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

/** Options for {@link copyFile}. */
export interface CopyFileOptions {
  /** Relative source path (the leading `media/` prefix is stripped automatically). */
  src: string;
  /** Relative destination path (the leading `media/` prefix is stripped automatically). */
  dest: string;
  /** Absolute or relative folder that contains the media files. */
  outputFolder?: string;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

/**
 * Strips a leading `media/` prefix from a path, if present.
 *
 * Only the first occurrence at the start of the string is removed so
 * that nested segments like `some/media/file.png` are left intact.
 */
const stripMediaPrefix = (filePath: string): string =>
  filePath.replace(/^media\//, '');

/* ------------------------------------------------------------------ */
/*  Public API                                                        */
/* ------------------------------------------------------------------ */

/**
 * Copies a file (or directory) from `src` to `dest` inside the
 * configured output folder.
 *
 * Uses Node's native `fs.cp` instead of spawning a shell process,
 * which avoids command-injection risks and works cross-platform.
 *
 * @returns The relative media path of the copied destination
 *          (e.g. `media/my-file.png`).
 */
const copyFile = async ({
  src,
  dest,
  outputFolder = DEFAULT_OUTPUT_FOLDER,
}: CopyFileOptions): Promise<string> => {
  const cleanSrc = stripMediaPrefix(src);
  const cleanDest = stripMediaPrefix(dest);

  const srcPath = `${outputFolder}/${cleanSrc}`;
  const destPath = `${outputFolder}/${cleanDest}`;

  await cp(srcPath, destPath, { recursive: true });

  return `media/${cleanDest}`;
};

export default copyFile;
