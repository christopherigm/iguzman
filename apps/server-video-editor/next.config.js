import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  outputFileTracingRoot: process.env.NODE_ENV === 'production' ? path.join(__dirname, '../../') : undefined,
  allowedDevOrigins: ['127.0.0.1', '*'],
  images: {
    dangerouslyAllowLocalIP: true,
    qualities: [75, 80, 85, 90],
    remotePatterns: [
      {
        protocol: 'http',
        hostname: '127.0.0.1',
      },
    ],
  },
};

export default nextConfig;
