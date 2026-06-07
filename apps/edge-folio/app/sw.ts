import { defaultCache } from '@serwist/next/worker';
import type { PrecacheEntry, SerwistGlobalConfig } from 'serwist';
import { Serwist } from 'serwist';

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: defaultCache,
});

self.addEventListener('install', serwist.handleInstall);
self.addEventListener('activate', serwist.handleActivate);
self.addEventListener('fetch', (event: FetchEvent) => {
  if (!event.request.url.startsWith('http')) return;
  serwist.handleFetch(event);
});
self.addEventListener('message', serwist.handleCache);
