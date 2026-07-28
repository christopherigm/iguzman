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
  allowedDevOrigins: ['127.0.0.1', '*'],
  logging: { incomingRequests: false },
  images: {
    dangerouslyAllowLocalIP: true,
    qualities: [75, 80, 85, 90],
    // Uploaded media lives in Cloudflare R2 and the API returns absolute URLs on
    // the bucket's hostname; the loader hands those to the browser untouched so
    // they come off the edge instead of through this pod. See image-loader.ts.
    loader: 'custom',
    loaderFile: './image-loader.ts',
    // ⚠ Inert while `loader` is 'custom'. Next 404s /_next/image outright unless
    // `images.loader === 'default'` (next/dist/server/next-server.js), so the
    // route that reads this list no longer answers, and next/image skips the
    // allowlist check entirely - an un-listed host renders just as well as a
    // listed one. In particular this is NOT a way to get a *same-origin* copy of
    // a remote image: anything that needs one (an html-to-image/canvas export,
    // which taints cross-origin; a CSS mask-image, which resolves empty) needs
    // its own route handler in this app. Kept only so the allowlist is already
    // right if `loader` ever goes back to 'default'. `qualities` and
    // `dangerouslyAllowLocalIP` above are dead for the same reason.
    remotePatterns: [
      { protocol: 'http', hostname: '127.0.0.1' },
      { protocol: 'http', hostname: 'localhost' },
      { protocol: 'https', hostname: 'r2.iguzman.com.mx' },
    ],
  },
};

const withNextIntl = createNextIntlPlugin('./i18n/request.ts');
export default withSerwist(withNextIntl(nextConfig));
