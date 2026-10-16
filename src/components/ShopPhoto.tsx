'use client';

import React, { useState } from 'react';

/**
 * Whether `src` failed to load. Keyed to the URL, so a new photo gets a fresh
 * try instead of inheriting the old one's failure.
 *
 * A store photo can be a link to someone else's server, and links copied from
 * Facebook or Instagram (fbcdn.net, cdninstagram.com) are signed and stop
 * working after a few days — the server then answers 403 to everyone. Screens
 * used to hide the broken <img> and show an empty box in its place.
 */
export function useBrokenImage(src?: string | null) {
  const [brokenSrc, setBrokenSrc] = useState<string | null>(null);
  return {
    broken: !!src && brokenSrc === src,
    onError: () => setBrokenSrc(src || null),
  };
}

interface ShopPhotoProps {
  src?: string | null;
  alt: string;
  className?: string;
  /** What the screen shows for a store with no photo; also used when the photo fails to load. */
  fallback: React.ReactNode;
}

/** A store's photo, or the screen's own placeholder when it has none or it cannot be loaded. */
export const ShopPhoto: React.FC<ShopPhotoProps> = ({ src, alt, className, fallback }) => {
  const { broken, onError } = useBrokenImage(src);
  if (!src || broken) return <>{fallback}</>;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} className={className} onError={onError} />;
};

/**
 * Image links that are known to expire: Facebook / Instagram CDN addresses
 * carry a signature that runs out within days. Saved as a store photo they
 * work for a while and then break for everyone.
 */
export function isExpiringImageUrl(url: string): boolean {
  try {
    const host = new URL(url.trim()).hostname.toLowerCase();
    return /(^|\.)fbcdn\.net$/.test(host) || /(^|\.)cdninstagram\.com$/.test(host) || /(^|\.)fbsbx\.com$/.test(host);
  } catch {
    return false;
  }
}
