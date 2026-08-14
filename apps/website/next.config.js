import createNextIntlPlugin from 'next-intl/plugin';
import withSerwistInit from '@serwist/next';
import { spawnSync } from 'node:child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const revision =
  spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf-8' }).stdout?.trim() ?? crypto.randomUUID();

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
  outputFileTracingRoot: process.env.NODE_ENV === 'production' ? path.join(__dirname, '../../') : undefined,
  webpack(config) {
    // Reached via @repo/ui's speech-button → @huggingface/transformers.
    // onnxruntime-node ships native .node binaries webpack cannot parse; alias it
    // to false so webpack emits an empty module. (The browser never uses that code
    // path.) Needed since serwist requires a webpack build - edge-folio does the same.
    config.resolve.alias = {
      ...config.resolve.alias,
      'onnxruntime-node': false,
    };
    return config;
  },
  async headers() {
    return [
      {
        source: '/admin/(.*)',
        headers: [
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
          { key: 'Cross-Origin-Embedder-Policy', value: 'require-corp' },
        ],
      },
    ];
  },
  allowedDevOrigins: ['127.0.0.1', '192.168.0.*'],
  images: {
    qualities: [75, 80, 85, 90],
    dangerouslyAllowLocalIP: true,
    // Stored media lives in Cloudflare R2 in production, so it is fetched
    // straight from the edge instead of being proxied through this pod. See
    // ./image-loader.ts for what the loader does and what it costs.
    loader: 'custom',
    loaderFile: './image-loader.ts',
    // ⚠ `remotePatterns` is **inert while `loader` is 'custom'**: Next only
    // serves `/_next/image` for the default loader and 404s the route
    // otherwise, so this list gates nothing at runtime. It is kept only so the
    // config still makes sense if the custom loader is ever dropped - do NOT
    // add a tenant's CDN hostname here expecting it to fix anything.
    //
    // The features that need a *same-origin* copy of a remote image - the flyer
    // exports (canvas taint) and the branch map capture - go through this app's
    // own `/api/media` route, which allowlists by request host and so needs no
    // per-customer entry anywhere. (The hero `logo`-shape CSS mask still points
    // at `/_next/image` inside `@repo/ui` and is therefore still broken in
    // production for tenants on a separate media origin.)
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'website-api.iguzman.com.mx',
      },
      // The platform R2 bucket's public hostname, and any other media host on
      // the company domain. Covers every tenant that has not brought its own.
      {
        protocol: 'https',
        hostname: '**.iguzman.com.mx',
      },
      {
        protocol: 'http',
        hostname: '127.0.0.1',
      },
      {
        protocol: 'http',
        hostname: 'localhost',
      },
    ],
  },
};

const withNextIntl = createNextIntlPlugin('./i18n/request.ts');

export default withSerwist(withNextIntl(nextConfig));
