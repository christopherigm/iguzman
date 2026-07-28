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
    // Still needed: /_next/image remains the way to get a *same-origin* copy of
    // a remote image (canvas exports, CSS mask-image), and it checks this list.
    remotePatterns: [
      { protocol: 'http', hostname: '127.0.0.1' },
      { protocol: 'http', hostname: 'localhost' },
      { protocol: 'https', hostname: 'r2.iguzman.com.mx' },
    ],
  },
};

const withNextIntl = createNextIntlPlugin('./i18n/request.ts');
export default withSerwist(withNextIntl(nextConfig));
