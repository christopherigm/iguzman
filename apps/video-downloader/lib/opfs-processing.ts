import { writeToOPFS, deleteFromOPFS } from "./opfs";

type UrlCache = { videoUrl: string | null; thumbnailUrl: string | null };

/**
 * Saves a processed result blob to OPFS, registers a fresh object URL in
 * the URL context, removes the old OPFS entry, and returns the new key.
 *
 * Callers are responsible for patching the video store with the new key
 * (opfsKey, file, downloadURL, opfsStored, serverFileDeleted).
 */
export async function saveProcessedToOPFS(opts: {
  blob: Blob;
  fileExt: string;
  oldOpfsKey: string | null;
  uuid: string;
  getUrls: (uuid: string) => UrlCache;
  registerUrls: (uuid: string, urls: UrlCache) => void;
}): Promise<string> {
  const { blob, fileExt, oldOpfsKey, uuid, getUrls, registerUrls } = opts;

  const newKey = `${crypto.randomUUID()}.${fileExt}`;
  await writeToOPFS(newKey, blob);

  registerUrls(uuid, {
    videoUrl: URL.createObjectURL(blob),
    thumbnailUrl: getUrls(uuid).thumbnailUrl,
  });

  if (oldOpfsKey && oldOpfsKey !== newKey) {
    void deleteFromOPFS(oldOpfsKey);
  }

  return newKey;
}
