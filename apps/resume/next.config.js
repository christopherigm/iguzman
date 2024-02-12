/** @type {import('next').NextConfig} */

module.exports = {
  transpilePackages: ['@repo/ui', '@repo/utils'],
  experimental: {
    swcPlugins: [['@preact-signals/safe-react/swc', {}]],
  },
};
