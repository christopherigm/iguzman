module.exports = {
  reactStrictMode: true,
  experimental: {
    transpilePackages: ["ui"],
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'api.plant.iguzman.com.mx',
        port: '',
        pathname: '/media/**',
      },
    ],
  },
};
