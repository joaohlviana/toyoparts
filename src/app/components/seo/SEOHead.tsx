import React from 'react';
import { Helmet } from 'react-helmet-async';
import {
  DEFAULT_OG_IMAGE,
  SITE_NAME,
  buildAbsoluteUrl,
} from '../../seo-config';

// ─── SEO Head Component ─────────────────────────────────────────────────────
// Renders <head> meta tags for SEO via react-helmet-async

interface SEOHeadProps {
  title: string;
  description?: string;
  canonical?: string;
  robots?: string; // e.g. 'index,follow' | 'noindex,follow'
  ogType?: string;
  ogImage?: string;
  keywords?: string;
  jsonLd?: object | object[];
  children?: React.ReactNode;
}

export function SEOHead({
  title,
  description,
  canonical,
  robots = 'index,follow',
  ogType = 'website',
  ogImage,
  keywords,
  jsonLd,
  children,
}: SEOHeadProps) {
  const fullTitle = title.includes(SITE_NAME) ? title : `${title} | ${SITE_NAME}`;
  const canonicalUrl = canonical ? buildAbsoluteUrl(canonical) : undefined;
  const resolvedOgImage = buildAbsoluteUrl(ogImage || DEFAULT_OG_IMAGE);

  const jsonLdScripts = jsonLd
    ? (Array.isArray(jsonLd) ? jsonLd : [jsonLd])
    : [];

  return (
    <Helmet>
      <html lang="pt-BR" />
      <title>{fullTitle}</title>
      {description && <meta name="description" content={description} />}
      {keywords && <meta name="keywords" content={keywords} />}
      <meta name="author" content={SITE_NAME} />
      <meta name="robots" content={robots} />
      <meta name="theme-color" content="#eb0a1e" />
      {canonicalUrl && <link rel="canonical" href={canonicalUrl} />}
      <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
      <link rel="apple-touch-icon" href="/apple-touch-icon.svg" />
      
      {/* Open Graph */}
      <meta property="og:title" content={fullTitle} />
      {description && <meta property="og:description" content={description} />}
      <meta property="og:type" content={ogType} />
      {canonicalUrl && <meta property="og:url" content={canonicalUrl} />}
      <meta property="og:image" content={resolvedOgImage} />
      <meta property="og:site_name" content={SITE_NAME} />
      <meta property="og:locale" content="pt_BR" />
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={fullTitle} />
      {description && <meta name="twitter:description" content={description} />}
      <meta name="twitter:image" content={resolvedOgImage} />

      {/* JSON-LD Structured Data */}
      {jsonLdScripts.map((ld, i) => (
        <script key={i} type="application/ld+json">
          {JSON.stringify(ld)}
        </script>
      ))}

      {children}
    </Helmet>
  );
}
