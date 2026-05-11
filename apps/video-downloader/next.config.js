import createNextIntlPlugin from 'next-intl/plugin';
import withPWAInit from '@ducanh2912/next-pwa';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const withPWA = withPWAInit({
  dest: 'public',
  disable: process.env.NODE_ENV === 'development',
  register: true,
  skipWaiting: true,
  cacheOnFrontendNav: true,
  aggressiveFrontEndNavCaching: true,
  fallbacks: {
    document: '/~offline',
  },
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
    ];
  },
  allowedDevOrigins: ['127.0.0.1', '*'],
};

const withNextIntl = createNextIntlPlugin('./i18n/request.ts');

export default withPWA(withNextIntl(nextConfig));
