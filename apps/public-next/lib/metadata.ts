import type { Metadata } from 'next';
import {
  DEFAULT_OG_IMAGE,
  SITE_NAME,
  SITE_URL,
  buildAbsoluteUrl,
} from '@/lib/seo';

export function buildPageMetadata({
  title,
  description,
  canonical,
  image = DEFAULT_OG_IMAGE,
}: {
  title: string;
  description: string;
  canonical: string;
  image?: string;
}): Metadata {
  const absoluteCanonical = buildAbsoluteUrl(canonical);
  const absoluteImage = buildAbsoluteUrl(image);

  return {
    title,
    description,
    alternates: {
      canonical: absoluteCanonical,
    },
    openGraph: {
      title: title.includes(SITE_NAME) ? title : `${title} | ${SITE_NAME}`,
      description,
      url: absoluteCanonical,
      type: 'website',
      siteName: SITE_NAME,
      images: [{ url: absoluteImage }],
    },
    twitter: {
      card: 'summary_large_image',
      title: title.includes(SITE_NAME) ? title : `${title} | ${SITE_NAME}`,
      description,
      images: [absoluteImage],
    },
  };
}

export const siteMetadataBase = new URL(SITE_URL);
