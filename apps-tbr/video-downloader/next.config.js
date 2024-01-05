module.exports = {
  reactStrictMode: true,
  transpilePackages: ['ui'],
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'api.vd.iguzman.com.mx',
        port: '',
        pathname: '/media/**',
      },
    ],
  },
};
