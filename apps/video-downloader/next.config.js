import createNextIntlPlugin from 'next-intl/plugin';
import withSerwistInit from '@serwist/next';
import { spawnSync } from 'node:child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const revision =
  spawnSync('git', ['rev-parse', 'HEAD'], {
    encoding: 'utf-8',
  }).stdout?.trim() ?? crypto.randomUUID();

const withSerwist = withSerwistInit({
  swSrc: 'app/sw.ts',
  swDest: 'public/sw.js',
  disable: process.env.NODE_ENV === 'development',
  cacheOnNavigation: true,
  additionalPrecacheEntries: [{ url: '/~offline', revision }],
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  outputFileTracingRoot:
    process.env.NODE_ENV === 'production'
      ? path.join(__dirname, '../../')
      : undefined,

  // stt-worker.ts → @huggingface/transformers resolves to its Node.js build on
  // the server, pulling in onnxruntime-node native .node binaries that webpack
  // cannot parse. These packages are browser-only (Web Worker) and never run
  // server-side, so marking them external stops webpack from bundling them.
  serverExternalPackages: ['@huggingface/transformers', 'onnxruntime-node'],

  webpack(config) {
    // Client-side safety net: resolve onnxruntime-node to an empty module so
    // webpack skips the native binary if it reaches it via the worker chunk.
    config.resolve.alias = {
      ...config.resolve.alias,
      'onnxruntime-node': false,
    };
    return config;
  },

  /**
   * Required for FFmpeg WASM multi-threaded mode (SharedArrayBuffer).
   * These headers enable cross-origin isolation in the browser.
   */
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
          { key: 'Cross-Origin-Embedder-Policy', value: 'require-corp' },
        ],
      },
      // Media files must be loadable by the OPFS migration fetch() even when
      // the redirect target is technically cross-origin (e.g. localhost vs
      // 127.0.0.1 mismatch in dev, or R2 CDN redirect in production).
      // Without this header, COEP: require-corp blocks the fetch entirely.
      {
        source: '/media/:path*',
        headers: [
          { key: 'Cross-Origin-Resource-Policy', value: 'cross-origin' },
        ],
      },
      // Cloudflare must never cache sw.js — a stale file means users keep
      // running the old service worker indefinitely after a deployment.
      {
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'no-store, max-age=0' },
        ],
      },
    ];
  },
  allowedDevOrigins: ['127.0.0.1', '*'],

  logging: {
    incomingRequests: false,
  },
};

const withNextIntl = createNextIntlPlugin('./i18n/request.ts');

export default withSerwist(withNextIntl(nextConfig));
