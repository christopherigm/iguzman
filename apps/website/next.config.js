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
  allowedDevOrigins: ['127.0.0.1', '*'],
  images: {
    qualities: [75, 80, 85, 90],
    dangerouslyAllowLocalIP: true,
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'api.website.iguzman.com.mx',
      },
      {
        protocol: 'http',
        hostname: '127.0.0.1',
      },
    ],
  },
};

const withNextIntl = createNextIntlPlugin('./i18n/request.ts');

export default withPWA(withNextIntl(nextConfig));
