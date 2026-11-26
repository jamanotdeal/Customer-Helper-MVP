'use client';

import React from 'react';
import Image from 'next/image';

/**
 * Cold-start screen: logo, name and slogan on white, shown until auth resolves.
 * It is part of the prerendered HTML, so it paints before any JS has loaded.
 *
 * The logo box is centred on the screen and sized so the mark is drawn as large
 * as the native Android splash draws it (~96dp wide) — when the native splash
 * fades out, the mark stays put and only the text appears. The text hangs below
 * the box rather than sitting in the flex flow, which would push the mark off
 * centre. Its negative margin eats the blank band under the mark in the PNG.
 */
export const AppSplash: React.FC = () => (
  <div
    role="status"
    aria-label="Jamanot"
    className="fixed inset-0 z-50 flex items-center justify-center bg-white"
  >
    <div className="relative w-60 h-60">
      <Image
        src="/Jamanot-Logo.png"
        alt=""
        fill
        sizes="240px"
        priority
        className="object-contain"
      />
      <div className="absolute left-1/2 top-full -translate-x-1/2 -mt-9 text-center whitespace-nowrap">
        <p className="font-extrabold text-2xl tracking-tight text-gray-900 font-sans">Jamanot</p>
        <p className="mt-0.5 text-sm font-medium text-emerald-700 font-sans">Ask. Relax. Done.</p>
      </div>
    </div>
  </div>
);
