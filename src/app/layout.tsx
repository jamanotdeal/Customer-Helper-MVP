import type { Metadata, Viewport } from 'next';
import './globals.css';
import { AuthProvider } from '@/context/AuthContext';
import { ModalProvider } from '@/components/CustomModal';

export const metadata: Metadata = {
  title: 'Jamanot — Ask. Relax. Done.',
  description: 'Fast, minimalistic mobile-first personal helper service for on-demand nearby shopping, errands, parcel receiving and delivery.',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Jamanot',
  },
};

export const viewport: Viewport = {
  themeColor: '#059669',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="bn">
      <head>
        <link rel="icon" href="/Jamanot-Logo.png" />
        <link rel="apple-touch-icon" href="/Jamanot-Logo.png" />
      </head>
      <body className="antialiased bg-gray-100 min-h-screen">
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
