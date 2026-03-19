import React from 'react';
import { Helmet } from 'react-helmet-async';
import { SITE_NAME, SITE_URL } from '../../seo-config';

// ─── SEO Head Component ─────────────────────────────────────────────────────
// Renders <head> meta tags for SEO via react-helmet-async

interface SEOHeadProps {
  title: string;
  description?: string;
  canonical?: string;
  robots?: string; // e.g. 'index,follow' | 'noindex,follow'
  ogType?: string;
  ogImage?: string;
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
  jsonLd,
  children,
}: SEOHeadProps) {
  const fullTitle = title.includes(SITE_NAME) ? title : `${title} | ${SITE_NAME}`;
  const canonicalUrl = canonical ? `${SITE_URL}${canonical}` : undefined;

  const jsonLdScripts = jsonLd
    ? (Array.isArray(jsonLd) ? jsonLd : [jsonLd])
    : [];

  return (
    <Helmet>
      <title>{fullTitle}</title>
      {description && <meta name="description" content={description} />}
      <meta name="robots" content={robots} />
      {canonicalUrl && <link rel="canonical" href={canonicalUrl} />}
      
      {/* Open Graph */}
      <meta property="og:title" content={fullTitle} />
      {description && <meta property="og:description" content={description} />}
      <meta property="og:type" content={ogType} />
      {canonicalUrl && <meta property="og:url" content={canonicalUrl} />}
      {ogImage && <meta property="og:image" content={ogImage} />}
      <meta property="og:site_name" content={SITE_NAME} />
      <meta property="og:locale" content="pt_BR" />

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
