'use client';

import { useEffect, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { fallbackStore } from '@/lib/firebase';
import Script from 'next/script';

export default function AnalyticsTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [gaId, setGaId] = useState<string>('');
  const [clarityId, setClarityId] = useState<string>('');

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
      {gaId && (
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
      {clarityId && (
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
