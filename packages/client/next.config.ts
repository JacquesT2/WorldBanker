import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@argentum/shared'],
  env: {
    NEXT_PUBLIC_SERVER_URL: process.env['NEXT_PUBLIC_SERVER_URL'] ?? 'http://localhost:3001',
    NEXT_PUBLIC_WS_URL: process.env['NEXT_PUBLIC_WS_URL'] ?? 'http://localhost:3001',
  },
};

export default nextConfig;
