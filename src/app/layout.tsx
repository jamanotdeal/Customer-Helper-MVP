import type { Metadata, Viewport } from 'next';
import { Inter, Noto_Sans_Bengali } from 'next/font/google';
import './globals.css';
import { AuthProvider } from '@/context/AuthContext';
import { ModalProvider } from '@/components/CustomModal';
import { Suspense } from 'react';
import AnalyticsTracker from '@/components/AnalyticsTracker';

// Self-hosted at build time. The APK bundles its own copy, so a cold start with no
// network still paints immediately instead of blocking on fonts.googleapis.com.
const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800', '900'],
  variable: '--font-inter-src',
  display: 'swap',
});

const notoSansBengali = Noto_Sans_Bengali({
  subsets: ['bengali', 'latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-bengali-src',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Jamanot — Ask. Relax. Done.',
  description: 'Fast, minimalistic mobile-first personal helper service for on-demand nearby shopping, errands, parcel receiving and delivery.',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Jamanot',
  },
  icons: {
    icon: '/pwa-logo.png',
    apple: '/pwa-logo.png',
  },
};

export const viewport: Viewport = {
  themeColor: '#059669',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  // viewport-fit=cover: use the full iPhone screen including the notch/home indicator
  viewportFit: 'cover',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="bn" className={`${inter.variable} ${notoSansBengali.variable}`}>
      <head>
        <link rel="icon" href="/pwa-logo.png" />
        <link rel="apple-touch-icon" href="/pwa-logo.png" />
        {/* Preconnect to speed up Firebase & Google Fonts */}
        <link rel="preconnect" href="https://firestore.googleapis.com" />
        <link rel="preconnect" href="https://firebase.googleapis.com" />
        {/* Android status bar style */}
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
      </head>
      <body className="antialiased bg-gray-100 min-h-screen">
        <Suspense fallback={null}>
          <AnalyticsTracker />
        </Suspense>

        <AuthProvider>
          <ModalProvider>
            {children}
          </ModalProvider>
        </AuthProvider>

        {/* Service Worker Registration */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              // Skip the service worker inside the Capacitor shell. The app's
              // assets are already bundled in the APK, so its network-first
              // fetch handler would only add latency, and its FCM background
              // handler would double-fire against the native Java notification.
              var isNative = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
              if (isNative) {
                if ('serviceWorker' in navigator) {
                  navigator.serviceWorker.getRegistrations().then(function(rs) {
                    rs.forEach(function(r) { r.unregister(); });
                  }).catch(function() {});
                }
              } else if ('serviceWorker' in navigator) {
                window.addEventListener('load', function() {
                  navigator.serviceWorker.register('/sw.js').then(
                    function(registration) {
                      console.log('Jamanot ServiceWorker registered with scope: ', registration.scope);
                    },
                    function(err) {
                      console.log('Jamanot ServiceWorker registration failed: ', err);
                    }
                  );
                });
              }
            `,
          }}
        />
      </body>
    </html>
  );
}

