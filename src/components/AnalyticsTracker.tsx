'use client';

import { useEffect, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { fallbackStore } from '@/lib/firebase';
import Script from 'next/script';

/**
 * How long after the app starts the analytics scripts are loaded. Clarity's
 * session recording and gtag together took ~0.85 s of main-thread time on a
 * mid-range phone (Infinix X6728, October 2026), all of it during the first
 * seconds, when the app is drawing its first screen and taking in the
 * Firestore snapshots. Page views are still reported; Clarity just starts
 * recording a little later.
 */
const ANALYTICS_DELAY_MS = 8000;

export default function AnalyticsTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [gaId, setGaId] = useState<string>('');
  const [clarityId, setClarityId] = useState<string>('');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let idleHandle: number | null = null;
    const timer = setTimeout(() => {
      const ric = (window as any).requestIdleCallback as ((cb: () => void, opts?: { timeout: number }) => number) | undefined;
      if (ric) idleHandle = ric(() => setReady(true), { timeout: 4000 });
      else setReady(true);
    }, ANALYTICS_DELAY_MS);
    return () => {
      clearTimeout(timer);
      const cic = (window as any).cancelIdleCallback as ((h: number) => void) | undefined;
      if (idleHandle !== null && cic) cic(idleHandle);
    };
  }, []);

  useEffect(() => {
    const syncSettings = () => {
      const settings = fallbackStore.pricingSettings;
      if (settings) {
        setGaId(settings.googleAnalyticsId || '');
        setClarityId(settings.microsoftClarityId || '');
      }
    };

    syncSettings();
    const unsub = fallbackStore.subscribe(syncSettings);
    return () => unsub();
  }, []);

  // Track page views on route change
  useEffect(() => {
    if (!gaId || typeof window === 'undefined' || !(window as any).gtag) return;
    (window as any).gtag('config', gaId, {
      page_path: pathname + (searchParams?.toString() ? '?' + searchParams.toString() : ''),
    });
  }, [pathname, searchParams, gaId]);

  return (
    <>
      {/* Google Analytics Script */}
      {ready && gaId && (
        <>
          <Script
            src={`https://www.googletagmanager.com/gtag/js?id=${gaId}`}
            strategy="afterInteractive"
          />
          <Script id="google-analytics" strategy="afterInteractive">
            {`
              window.dataLayer = window.dataLayer || [];
              function gtag(){dataLayer.push(arguments);}
              gtag('js', new Date());
              gtag('config', '${gaId}', {
                page_path: window.location.pathname,
              });
            `}
          </Script>
        </>
      )}

      {/* Microsoft Clarity Script */}
      {ready && clarityId && (
        <Script id="microsoft-clarity" strategy="afterInteractive">
          {`
            (function(c,l,a,r,i,t,y){
                c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
                t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
                y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
            })(window,document,"clarity","script","${clarityId}");
          `}
        </Script>
      )}
    </>
  );
}
