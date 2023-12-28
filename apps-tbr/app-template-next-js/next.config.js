module.exports = {
  reactStrictMode: true,
  transpilePackages: ['ui'],
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'api_REPLACE',
        port: '',
        pathname: '/media/**',
      },
    ],
  },
};
