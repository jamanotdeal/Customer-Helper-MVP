/** @type {import('next').NextConfig} */
const nextConfig = {
  // Required for Capacitor: produces a static /out folder that Capacitor loads
  output: 'export',
  // Required for static export routing to work correctly inside WebView
  trailingSlash: true,
  // Images must be unoptimized for static export (no Next.js image server)
  images: {
    unoptimized: true,
  },
  // Compress output assets
  compress: true,
  // Tree-shake lucide-react icons (reduces bundle size significantly)
  experimental: {
    optimizePackageImports: ['lucide-react'],
  },
};

module.exports = nextConfig;
