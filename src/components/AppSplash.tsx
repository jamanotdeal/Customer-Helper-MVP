'use client';

import React from 'react';

/**
 * Cold-start screen: logo, name and slogan on white, shown until auth resolves.
 * It is part of the prerendered HTML, so it paints before any JS has loaded.
 *
 * It draws the very image the native launch splash draws (Android's splash icon,
 * the pre-Android-12 window background and the iOS launch screen are all made
 * from public/splash-art.png by scripts/render-splash-art.mjs), at the same
 * 192-unit size, centred on the screen the same way. So when the native splash
 * hands over to this one, nothing on screen changes. It used to rebuild the
 * look from the logo plus live text — a second, different picture of the same
 * thing, which is what showed up as "logo, then logo with slogan".
 */
export const AppSplash: React.FC = () => (
  <div
    role="status"
    aria-label="Jamanot — Ask. Relax. Done."
    className="fixed inset-0 z-50 flex items-center justify-center bg-white"
  >
    {/* A plain <img>: next/image would add lazy-loading machinery to an image
        that has to be on screen in the first frame. */}
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img
      src="/splash-art.png"
      alt=""
      width={192}
      height={192}
      fetchPriority="high"
      decoding="sync"
      data-splash-art=""
      className="w-48 h-48 select-none"
      draggable={false}
    />
  </div>
);

/**
 * Resolves once the splash art on the page (if it is there) is decoded and ready
 * to draw — the moment the native splash can go without a blank frame showing.
 * Never rejects, and gives up waiting after a second.
 */
export function whenSplashArtReady(): Promise<void> {
  if (typeof document === 'undefined') return Promise.resolve();
  const img = document.querySelector<HTMLImageElement>('img[data-splash-art]');
  if (!img) return Promise.resolve();
  const decoded = img.decode ? img.decode().catch(() => {}) : Promise.resolve();
  const timeout = new Promise<void>((resolve) => setTimeout(resolve, 1000));
  return Promise.race([decoded, timeout]);
}
