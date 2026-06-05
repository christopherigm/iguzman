import { defaultCache } from '@serwist/next/worker';
import type { PrecacheEntry, SerwistGlobalConfig } from 'serwist';
import { Serwist } from 'serwist';
import type { SwInboundMessage, SwOutboundMessage } from '../lib/sw-types';

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

// ─── Model OPFS background fetch ─────────────────────────────────────────────

let activeDownload: AbortController | null = null;

async function broadcast(payload: SwOutboundMessage): Promise<void> {
  const clients = await self.clients.matchAll({ includeUncontrolled: true });
  for (const client of clients) {
    client.postMessage(payload);
  }
}

async function resolveDir(
  root: FileSystemDirectoryHandle,
  segments: string[],
  create: boolean,
): Promise<FileSystemDirectoryHandle> {
  let dir = root;
  for (const seg of segments) {
    dir = await dir.getDirectoryHandle(seg, { create });
  }
  return dir;
}

async function modelRootDir(modelId: string): Promise<FileSystemDirectoryHandle> {
  const root = await navigator.storage.getDirectory();
  return resolveDir(root, ['models', ...modelId.split('/').filter(Boolean)], true);
}

async function fileExists(modelDir: FileSystemDirectoryHandle, relativePath: string): Promise<boolean> {
  try {
    const parts = relativePath.split('/');
    const filename = parts.pop()!;
    const parent = parts.length > 0 ? await resolveDir(modelDir, parts, false) : modelDir;
    await parent.getFileHandle(filename);
    return true;
  } catch {
    return false;
  }
}

async function streamResponseToOpfs(
  modelDir: FileSystemDirectoryHandle,
  relativePath: string,
  response: Response,
  signal: AbortSignal,
  onBytes: (loaded: number, total: number) => void,
): Promise<void> {
  const total = Number(response.headers.get('content-length') ?? 0);
  const parts = relativePath.split('/');
  const filename = parts.pop()!;
  const parent = parts.length > 0 ? await resolveDir(modelDir, parts, true) : modelDir;

  const handle = await parent.getFileHandle(filename, { create: true });
  const writable = await handle.createWritable();
  const reader = response.body!.getReader();
  let loaded = 0;

  try {
    while (!signal.aborted) {
      const { done, value } = await reader.read();
      if (done) break;
      await writable.write(value);
      loaded += value.byteLength;
      onBytes(loaded, total);
    }
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
    await writable.close();
  } catch (err) {
    await writable.abort();
    try {
      await parent.removeEntry(filename);
    } catch {
      // partial file removal is best-effort
    }
    throw err;
  }
}

async function fetchModelToOpfs(msg: Extract<SwInboundMessage, { type: 'FETCH_MODEL_TO_OPFS' }>): Promise<void> {
  const { modelId, files } = msg;
  const revision = msg.revision ?? 'main';
  const baseUrl = `https://huggingface.co/${modelId}/resolve/${revision}`;

  activeDownload = new AbortController();
  const { signal } = activeDownload;

  try {
    const dir = await modelRootDir(modelId);
    await broadcast({ type: 'MODEL_FETCH_START', modelId, fileCount: files.length });

    for (const [i, file] of files.entries()) {
      if (signal.aborted) break;

      if (await fileExists(dir, file)) {
        await broadcast({ type: 'MODEL_FETCH_FILE_DONE', modelId, file, fileIndex: i, fileCount: files.length, skipped: true });
        continue;
      }

      const response = await fetch(`${baseUrl}/${file}`, { signal });
      if (!response.ok) throw new Error(`HTTP ${response.status} fetching ${file}`);

      await streamResponseToOpfs(dir, file, response, signal, (loaded, total) => {
        void broadcast({ type: 'MODEL_FETCH_BYTES', modelId, file, bytesLoaded: loaded, bytesTotal: total });
      });

      await broadcast({ type: 'MODEL_FETCH_FILE_DONE', modelId, file, fileIndex: i, fileCount: files.length, skipped: false });
    }

    if (!signal.aborted) {
      await broadcast({ type: 'MODEL_FETCH_COMPLETE', modelId });
    }
  } catch (err) {
    if ((err as DOMException).name === 'AbortError') {
      await broadcast({ type: 'MODEL_FETCH_CANCELLED', modelId });
    } else {
      await broadcast({ type: 'MODEL_FETCH_ERROR', modelId, error: (err as Error).message });
    }
  } finally {
    activeDownload = null;
  }
}

async function checkModelCached(
  msg: Extract<SwInboundMessage, { type: 'CHECK_MODEL_CACHED' }>,
  source: Client | ServiceWorker | MessagePort | null,
): Promise<void> {
  const { modelId, files } = msg;
  const dir = await modelRootDir(modelId);
  const cached: Record<string, boolean> = {};
  for (const file of files) {
    cached[file] = await fileExists(dir, file);
  }
  const payload: SwOutboundMessage = { type: 'MODEL_CACHE_STATUS', modelId, cached };
  if (source && 'postMessage' in source) {
    (source as Client).postMessage(payload);
  } else {
    await broadcast(payload);
  }
}

self.addEventListener('message', (event: ExtendableMessageEvent) => {
  const msg = event.data as SwInboundMessage;
  if (!msg?.type) return;

  switch (msg.type) {
    case 'FETCH_MODEL_TO_OPFS':
      void fetchModelToOpfs(msg);
      break;
    case 'CHECK_MODEL_CACHED':
      void checkModelCached(msg, event.source);
      break;
    case 'CANCEL_MODEL_FETCH':
      activeDownload?.abort();
      break;
  }
});

// ─── Serwist (precache + runtime cache) ──────────────────────────────────────

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: defaultCache,
});

serwist.addEventListeners();
