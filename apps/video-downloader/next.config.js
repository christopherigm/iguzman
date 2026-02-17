import createNextIntlPlugin from 'next-intl/plugin';
import withPWAInit from '@ducanh2912/next-pwa';

const withPWA = withPWAInit({
  dest: 'public',
  disable: process.env.NODE_ENV === 'development',
  register: true,
  skipWaiting: true,
  cacheOnFrontendNav: true,
  fallbacks: {
    document: '/~offline',
  },
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',

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
};

const withNextIntl = createNextIntlPlugin('./i18n/request.ts');

export default withPWA(withNextIntl(nextConfig));
