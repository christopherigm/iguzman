/** @type {import('next').NextConfig} */

const nextConfig = {
  transpilePackages: ['@repo/ui', '@repo/utils'],
  experimental: {
    swcPlugins: [['@preact-signals/safe-react/swc', {}]],
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'api.nedii.iguzman.com.mx',
        port: '',
        pathname: '/media/**',
      },
    ],
  },
};

export default nextConfig;
