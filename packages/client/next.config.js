/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@argentum/shared'],
  webpack(config) {
    // Allow webpack to resolve .js imports from the shared TS source as .ts files
    config.resolve.extensionAlias = {
      '.js': ['.ts', '.tsx', '.js'],
      '.mjs': ['.mts', '.mjs'],
    };
    return config;
  },
};

module.exports = nextConfig;
