/** @type {import('next').NextConfig} */

const nextConfig = {
  transpilePackages: ['@repo/ui', '@repo/utils'],
  experimental: {
    swcPlugins: [['@preact-signals/safe-react/swc', {}]],
  },
};

export default nextConfig;
