import type { Metadata, Viewport } from 'next';
import './globals.css';
import { AuthProvider } from '@/context/AuthContext';
import { ModalProvider } from '@/components/CustomModal';
import { Suspense } from 'react';
import AnalyticsTracker from '@/components/AnalyticsTracker';

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
    <html lang="bn">
      <head>
        <link rel="icon" href="/pwa-logo.png" />
        <link rel="apple-touch-icon" href="/pwa-logo.png" />
        {/* Preconnect to speed up Firebase & Google Fonts */}
        <link rel="preconnect" href="https://firestore.googleapis.com" />
        <link rel="preconnect" href="https://firebase.googleapis.com" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
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
              if ('serviceWorker' in navigator) {
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

