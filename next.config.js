/** @type {import('next').NextConfig} */

// Capacitor needs a static /out folder, but the website deploy must stay a normal
// Next.js build. `BUILD_TARGET=native` (set by the mobile:* scripts) switches to export
// mode; without it this config is byte-identical to the web build.
const isNative = process.env.BUILD_TARGET === 'native';

const nextConfig = {
  ...(isNative
    ? {
        // Produces the static /out folder Capacitor loads into the WebView
        output: 'export',
        // Static export routing (/privacy/, /terms/) inside the WebView
        trailingSlash: true,
      }
    : {}),
  // Unconditional: required by `output: 'export'`, and a no-op cost on web.
  // next/image is used in AppHeader, CustomerHome, PWAInstallModal, privacy, terms.
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
