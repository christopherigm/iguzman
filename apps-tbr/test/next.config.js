module.exports = {
  reactStrictMode: true,
  experimental: {
    transpilePackages: ["ui"],
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
