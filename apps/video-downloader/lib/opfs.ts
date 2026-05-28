const DIR_NAME = 'vd-videos';

async function getDir(): Promise<FileSystemDirectoryHandle> {
  const root = await navigator.storage.getDirectory();
  return root.getDirectoryHandle(DIR_NAME, { create: true });
}

export function isOPFSSupported(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    'storage' in navigator &&
    typeof (navigator.storage as unknown as { getDirectory?: unknown })
      .getDirectory === 'function'
  );
}

export async function writeToOPFS(key: string, blob: Blob): Promise<void> {
  const dir = await getDir();
  const fh = await dir.getFileHandle(key, { create: true });
  const writable = await fh.createWritable();
  await writable.write(blob);
  await writable.close();
}

export async function readFromOPFS(key: string): Promise<File> {
  const dir = await getDir();
  const fh = await dir.getFileHandle(key);
  return fh.getFile();
}

export async function deleteFromOPFS(key: string): Promise<void> {
  try {
    const dir = await getDir();
    await dir.removeEntry(key);
  } catch {
    // File may already be gone — not an error
  }
}

export async function clearOPFSStorage(): Promise<void> {
  try {
    const root = await navigator.storage.getDirectory();
    const dir = await root.getDirectoryHandle(DIR_NAME, { create: false });
    const names: string[] = [];
    for await (const [name] of dir.entries()) {
      names.push(name);
    }
    for (const name of names) {
      await dir.removeEntry(name).catch(() => {});
    }
  } catch {
    // Directory doesn't exist or OPFS unavailable
  }
}

export async function listOPFSFiles(): Promise<
  { name: string; size: number }[]
> {
  const results: { name: string; size: number }[] = [];
  try {
    const dir = await getDir();
    for await (const [name, handle] of dir.entries()) {
      if (handle.kind === 'file') {
        const file = await (handle as FileSystemFileHandle).getFile();
        results.push({ name, size: file.size });
      }
    }
  } catch {
    // OPFS unavailable or directory empty
  }
  return results;
}

export async function requestPersistentStorage(): Promise<boolean> {
  if (
    typeof navigator === 'undefined' ||
    !('storage' in navigator) ||
    typeof navigator.storage.persist !== 'function'
  )
    return false;
  return navigator.storage.persist();
}

export async function getOPFSStorageInfo(): Promise<{
  usedBytes: number;
  totalBytes: number;
}> {
  let usedBytes = 0;
  try {
    const dir = await getDir();
    for await (const [, handle] of dir.entries()) {
      if (handle.kind === 'file') {
        const file = await (handle as FileSystemFileHandle).getFile();
        usedBytes += file.size;
      }
    }
  } catch {
    // OPFS unavailable or directory is empty
  }
  const estimate =
    typeof navigator !== 'undefined' &&
    'storage' in navigator &&
    typeof navigator.storage.estimate === 'function'
      ? await navigator.storage.estimate()
      : {};
  return { usedBytes, totalBytes: estimate.quota ?? 0 };
}
