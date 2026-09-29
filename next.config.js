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
  async headers() {
    return [
      {
        source: '/:all*(svg|jpg|png|webp|ico|woff2|woff)',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
      {
        source: '/manifest.json',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=86400, stale-while-revalidate=86400',
          },
        ],
      },
      {
        source: '/sw.js',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=0, must-revalidate',
          },
          {
            key: 'Service-Worker-Allowed',
            value: '/',
          },
        ],
      },
    ];
  },
};

module.exports = nextConfig;

