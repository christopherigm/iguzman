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

// Allow next/image to load thumbnails from the nginx-media host when configured.
const mediaHostValue = process.env.NEXT_PUBLIC_MEDIA_HOST ?? '';
const mediaRemotePatterns = (() => {
  if (!mediaHostValue) return [];
  const [hostname, port] = mediaHostValue.split(':');
  return [{ protocol: 'https', hostname, ...(port ? { port } : {}) }];
})();

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',

  images: {
    remotePatterns: mediaRemotePatterns,
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
};

const withNextIntl = createNextIntlPlugin('./i18n/request.ts');

export default withPWA(withNextIntl(nextConfig));
