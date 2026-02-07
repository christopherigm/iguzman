import { rm } from 'fs/promises';
import path from 'path';

/* ------------------------------------------------------------------ */
/*  Constants                                                         */
/* ------------------------------------------------------------------ */

const NODE_ENV = process.env.NODE_ENV?.trim() ?? 'localhost';

/** Root folder that contains the media directory. */
const ROOT_FOLDER = NODE_ENV === 'production' ? '/app' : 'public';

/* ------------------------------------------------------------------ */
/*  Public API                                                        */
/* ------------------------------------------------------------------ */

/**
 * Deletes a media file located under the environment-specific root folder.
 *
 * The operation is idempotent — if the file does not exist the call
 * resolves silently instead of throwing.
 *
 * @param filePath - Relative path to the file inside the root folder
 *                   (e.g. `media/video.mp4`).
 *
 * @throws If the resolved path escapes the root folder (path traversal).
 * @throws If the file exists but cannot be removed (permission error, etc.).
 */
const deleteMediaFile = async (filePath: string): Promise<void> => {
  if (!filePath) return;

  const resolved = path.resolve(ROOT_FOLDER, filePath);

  /** Prevent path-traversal outside the root folder. */
  if (!resolved.startsWith(path.resolve(ROOT_FOLDER))) {
    throw new Error(
      `Path traversal detected: "${filePath}" resolves outside "${ROOT_FOLDER}"`,
    );
  }

  try {
    await rm(resolved, { force: true });
  } catch (error) {
    console.error(`deleteMediaFile failed for "${resolved}":`, error);
    throw error;
  }
};

export default deleteMediaFile;
