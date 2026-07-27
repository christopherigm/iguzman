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
    // `remotePatterns` still matters even with a custom loader: it gates
    // `/_next/image`, which two features use *on purpose* to obtain a
    // same-origin copy of a remote image - the social-post flyer export (canvas
    // taint) and the hero `logo`-shape CSS mask (an empty mask otherwise).
    //
    // ⚠ A customer that connects its own R2 account with its own CDN hostname
    // (e.g. cdn.elpanbueno.com) must have that hostname added here, or those two
    // features fall back to the un-proxied URL for that tenant. It cannot be
    // read from the database: `next.config.js` is evaluated at build time and
    // baked into `.next/required-server-files.json` for the standalone server.
    // Adding a customer is already a code change in this app (sites/registry.ts),
    // so this is one more line in the same commit.
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
