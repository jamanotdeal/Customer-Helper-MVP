import React from 'react';
import PageClient from './page-client';
import { Metadata } from 'next';
import { getSEOMetadataForService } from '@/lib/seo';

interface Props {
  searchParams: { service?: string };
}

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const service = searchParams.service;
  const { title, description, keywords } = getSEOMetadataForService(service);

  return {
    title,
    description,
    keywords,
    openGraph: {
      title,
      description,
      type: 'website',
    },
  };
}

export default function Page() {
  return <PageClient />;
}
