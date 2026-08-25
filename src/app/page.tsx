import React from 'react';
import PageClient from './page-client';

// This page is 100% client-rendered via PageClient.
// Metadata is handled statically in layout.tsx — no dynamic searchParams needed.
export const dynamic = 'force-static';

export default function Page() {
  return <PageClient />;
}
