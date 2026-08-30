/** @type {import('next').NextConfig} */
const nextConfig = {
  // Compress output assets
  compress: true,
  // Tree-shake lucide-react icons (reduces bundle size significantly)
  experimental: {
    optimizePackageImports: ['lucide-react'],
  },
};

module.exports = nextConfig;
