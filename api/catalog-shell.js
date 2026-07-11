const SUPABASE_CATALOG_SHELL_BASE =
  'https://hkxjnykrnhjtkkabgece.supabase.co/functions/v1/make-server-1d6e33e0/catalog/shell';
const SUPABASE_HOME_BANNERS_API =
  'https://hkxjnykrnhjtkkabgece.supabase.co/functions/v1/make-server-1d6e33e0/banners';
import fs from 'node:fs';

const CANONICAL_SITE_URL = 'https://www.toyoparts.com.br';
const PRIMARY_HOST = 'www.toyoparts.com.br';

let cachedStylesheetTag = null;
let cachedHomeHeroSeed = null;
let cachedHomeHeroSeedAt = 0;
const HOME_HERO_SEED_CACHE_MS = 60_000;

const HOME_HERO_FALLBACK_SEED = {
  version: 1,
  config: {
    departments: { selectedCategoryIds: [], limit: 15 },
    smallBanners: [],
    offers: { enabled: true, title: 'Ofertas especiais', subtitle: '', limit: 10, source: 'top_promotions', sort: 'discount_desc', lookbackDays: 30, ruleGroups: [], pinnedSkus: [], excludedSkus: [] },
    popular: { enabled: true, title: 'Mais procurados', subtitle: '', limit: 15, source: 'top_searched', sort: 'intelligence_rank', lookbackDays: 30, ruleGroups: [], pinnedSkus: [], excludedSkus: [] },
    newArrivals: { enabled: true, title: 'Novidades', subtitle: '', limit: 10, source: 'catalog', sort: 'newest_desc', lookbackDays: 30, ruleGroups: [], pinnedSkus: [], excludedSkus: [] },
  },
  resolved: {
    offers: { active: true, matchedBeforeLimit: 0, products: [], poolProducts: [], missingPinnedSkus: [], excludedSkus: [] },
    popular: { active: true, matchedBeforeLimit: 0, products: [], poolProducts: [], missingPinnedSkus: [], excludedSkus: [] },
    newArrivals: { active: true, matchedBeforeLimit: 0, products: [], poolProducts: [], missingPinnedSkus: [], excludedSkus: [] },
  },
  heroBanners: [
    {
      id: 'banner_1773863921865_v0azs',
      active: true,
      order: 2,
      desktopImageSrc: 'https://www.toyoparts.com.br/media/home-banners/hero/1781012317539-c6f9aedd-f94d-4275-9f4f-2351404fa644-banner-desktop.webp',
      mobileImageSrc: 'https://www.toyoparts.com.br/media/home-banners/hero/1781012329473-28bfe68e-cfa4-434f-bf33-f80caf132505-banner-mobile-828x592.webp',
      linkHref: '/busca?category=748&category_name=Ofertas',
      altText: 'Banner - Institucional',
    },
  ],
  departments: [],
  offers: { active: true, matchedBeforeLimit: 0, products: [], poolProducts: [], missingPinnedSkus: [], excludedSkus: [] },
  popularProducts: { active: true, matchedBeforeLimit: 0, products: [], poolProducts: [], missingPinnedSkus: [], excludedSkus: [] },
  newArrivals: { active: true, matchedBeforeLimit: 0, products: [], poolProducts: [], missingPinnedSkus: [], excludedSkus: [] },
  smallBanners: [],
  compatibilityBanner: { enabled: true },
  newsletter: { enabled: true },
  meta: {
    publishedAt: null,
    generatedAt: '2026-06-10T00:00:00.000Z',
    snapshotGeneratedAt: '2026-06-10T00:00:00.000Z',
    sources: { heroSeed: 'catalog-shell' },
    warnings: ['catalog_shell_hero_seed'],
  },
};

function normalizePublicHeroBanners(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((banner) => banner && banner.active !== false && banner.desktopImageSrc)
    .map((banner, index) => ({
      id: String(banner.id || `hero_${index}`),
      active: banner.active !== false,
      order: Number.isFinite(Number(banner.order)) ? Number(banner.order) : index,
      desktopImageSrc: String(banner.desktopImageSrc || ''),
      mobileImageSrc: banner.mobileImageSrc ? String(banner.mobileImageSrc) : String(banner.desktopImageSrc || ''),
      linkHref: banner.linkHref ? String(banner.linkHref) : undefined,
      altText: banner.altText ? String(banner.altText) : undefined,
    }))
    .filter((banner) => banner.desktopImageSrc)
    .sort((a, b) => a.order - b.order);
}

async function getHomeHeroSeed() {
  const now = Date.now();
  if (cachedHomeHeroSeed && now - cachedHomeHeroSeedAt < HOME_HERO_SEED_CACHE_MS) {
    return cachedHomeHeroSeed;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1_500);
    const response = await fetch(SUPABASE_HOME_BANNERS_API, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (response.ok) {
      const data = await response.json().catch(() => ({}));
      const heroBanners = normalizePublicHeroBanners(data?.banners);
      if (heroBanners.length > 0) {
        cachedHomeHeroSeed = {
          ...HOME_HERO_FALLBACK_SEED,
          heroBanners,
          meta: {
            ...HOME_HERO_FALLBACK_SEED.meta,
            generatedAt: new Date().toISOString(),
            snapshotGeneratedAt: new Date().toISOString(),
            sources: { heroSeed: 'catalog-shell-live-banners' },
            warnings: [],
          },
        };
        cachedHomeHeroSeedAt = now;
        return cachedHomeHeroSeed;
      }
    }
  } catch {
    // Fall back to the newest known hero if the banner API is briefly unavailable.
  }

  cachedHomeHeroSeed = HOME_HERO_FALLBACK_SEED;
  cachedHomeHeroSeedAt = now;
  return cachedHomeHeroSeed;
}

function normalizeShellPath(rawPath) {
  const joined = Array.isArray(rawPath) ? rawPath.join('/') : String(rawPath || '');
  const trimmed = joined.trim();
  if (!trimmed) return '/';

  let normalized = trimmed;
  if (!normalized.startsWith('/')) normalized = `/${normalized}`;
  normalized = normalized.replace(/\/{2,}/g, '/');
  if (normalized.length > 1) normalized = normalized.replace(/\/+$/, '');
  return normalized || '/';
}

function buildUpstreamUrl(request, shellPath) {
  const upstream = new URL(`${SUPABASE_CATALOG_SHELL_BASE}${shellPath === '/' ? '/' : shellPath}`);

  for (const [key, value] of Object.entries(request.query || {})) {
    if (key === 'path') continue;
    if (Array.isArray(value)) {
      for (const item of value) upstream.searchParams.append(key, item);
      continue;
    }
    if (typeof value === 'string') upstream.searchParams.set(key, value);
  }

  return upstream;
}

function buildCanonicalUrl(request, shellPath) {
  const target = new URL(`${CANONICAL_SITE_URL}${shellPath === '/' ? '/' : shellPath}`);

  for (const [key, value] of Object.entries(request.query || {})) {
    if (key === 'path') continue;
    if (Array.isArray(value)) {
      for (const item of value) target.searchParams.append(key, item);
      continue;
    }
    if (typeof value === 'string') target.searchParams.set(key, value);
  }

  return target.toString();
}

function getShellStylesheetTag() {
  if (cachedStylesheetTag !== null) {
    return cachedStylesheetTag;
  }

  try {
    const indexHtmlPath = new URL('../dist/index.html', import.meta.url);
    const indexHtml = fs.readFileSync(indexHtmlPath, 'utf8');
    const stylesheetMatch = indexHtml.match(/<link rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/i);
    cachedStylesheetTag = stylesheetMatch
      ? `<link rel="stylesheet" crossorigin href="${stylesheetMatch[1]}">`
      : '';
  } catch {
    cachedStylesheetTag = '';
  }

  return cachedStylesheetTag;
}

function injectShellStylesheet(html) {
  const stylesheetTag = getShellStylesheetTag();
  if (!stylesheetTag) return html;
  if (html.includes('rel="stylesheet"') && html.includes('/assets/')) return html;
  return html.replace('</head>', `  ${stylesheetTag}\n    </head>`);
}

function stripBlockingGtm(html) {
  return html
    .replace(/\s*<!-- Google Tag Manager -->[\s\S]*?<!-- End Google Tag Manager -->/gi, '')
    .replace(/\s*<script>\s*\(function\(w,d,s,l,i\)\{[\s\S]*?GTM-5B9VBQ[\s\S]*?<\/script>/i, '')
    .replace(/\s*<!-- Google Tag Manager \(noscript\) -->[\s\S]*?<!-- End Google Tag Manager \(noscript\) -->/gi, '')
    .replace(/\s*<noscript>\s*<iframe[^>]+googletagmanager\.com\/ns\.html\?id=GTM-5B9VBQ[\s\S]*?<\/noscript>/i, '');
}

function injectDeferredGtm(html) {
  if (html.includes('id="toyoparts-deferred-gtm"')) return html;
  const script = `    <script id="toyoparts-deferred-gtm" data-cfasync="false">
      window.dataLayer = window.dataLayer || [];
      window.dataLayer.push({'gtm.start': new Date().getTime(), event: 'gtm.js'});
      (function loadGtmWhenCalm(){
        var loaded = false;
        function load(){
          if (loaded) return;
          loaded = true;
          var s = document.createElement('script');
          s.async = true;
          s.setAttribute('data-cfasync', 'false');
          s.src = 'https://www.googletagmanager.com/gtm.js?id=GTM-5B9VBQ';
          document.head.appendChild(s);
        }
        ['pointerdown','keydown','touchstart','scroll'].forEach(function(name){
          window.addEventListener(name, load, { once: true, passive: true });
        });
        if ('requestIdleCallback' in window) requestIdleCallback(load, { timeout: 3500 });
        else setTimeout(load, 3500);
      })();
    </script>`;
  return html.replace('</body>', `${script}\n  </body>`);
}

function injectHomePerformanceHints(html, shellPath, homeHeroSeed) {
  if (shellPath !== '/') return html;
  if (html.includes('id="toyoparts-home-perf-hints"')) return html;
  const firstHero = homeHeroSeed?.heroBanners?.[0] || HOME_HERO_FALLBACK_SEED.heroBanners[0];
  const mobilePreload = firstHero.mobileImageSrc || firstHero.desktopImageSrc;
  const desktopPreload = firstHero.desktopImageSrc;

  const hints = `    <link id="toyoparts-home-perf-hints" rel="preconnect" href="https://www.toyoparts.com.br" crossorigin>
    <link rel="preconnect" href="https://hkxjnykrnhjtkkabgece.supabase.co" crossorigin>
    <link rel="preload" as="image" href="${mobilePreload}" media="(max-width: 767px)" fetchpriority="high">
    <link rel="preload" as="image" href="${desktopPreload}" media="(min-width: 768px)" fetchpriority="high">`;

  return html.replace('</head>', `${hints}\n  </head>`);
}

function injectHomeSnapshotSeed(html, shellPath, homeHeroSeed) {
  if (shellPath !== '/') return html;
  if (html.includes('window.__TOYOPARTS_HOME_SNAPSHOT__')) return html;

  const seed = `    <script>window.__TOYOPARTS_HOME_SNAPSHOT__=${JSON.stringify(homeHeroSeed || HOME_HERO_FALLBACK_SEED)};</script>`;
  return html.replace('</head>', `${seed}\n  </head>`);
}

const FAVICON_HEAD_MARKUP = `    <link rel="icon" href="/favicon.ico" sizes="any" />
    <link rel="icon" type="image/png" sizes="48x48" href="/favicon-48x48.png" />
    <link rel="icon" type="image/png" sizes="96x96" href="/favicon-96x96.png" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
    <link rel="manifest" href="/site.webmanifest" />`;

function normalizeFaviconHead(html) {
  const cleaned = html
    .replace(/^\s*<link\b[^>]*\brel=["'][^"']*(?:shortcut\s+icon|icon|apple-touch-icon|apple-touch-icon-precomposed|manifest)[^"']*["'][^>]*>\s*$/gim, '')
    .replace(/^\s*<meta\b[^>]*\bname=["']msapplication-TileImage["'][^>]*>\s*$/gim, '');

  if (cleaned.includes('/favicon-48x48.png') && cleaned.includes('/site.webmanifest')) {
    return cleaned;
  }

  if (cleaned.includes('<meta name="theme-color"')) {
    return cleaned.replace(
      /(<meta name="theme-color"[^>]*>\s*)/i,
      `$1${FAVICON_HEAD_MARKUP}\n`,
    );
  }

  return cleaned.replace('</head>', `${FAVICON_HEAD_MARKUP}\n  </head>`);
}

function buildHomeSeoFallback() {
  return `<main id="seo-home-fallback" aria-label="Toyoparts" style="font-family:Arial,Helvetica,sans-serif;max-width:1120px;margin:0 auto;padding:32px 20px;color:#111827">
      <h1 style="font-size:32px;line-height:1.15;margin:0 0 12px">Toyoparts - pecas e acessorios genuinos Toyota</h1>
      <p style="font-size:16px;line-height:1.6;margin:0 0 18px;color:#4b5563">Compre pecas e acessorios Toyota para Hilux, Corolla, SW4, Yaris, Etios, RAV4, Prius e Corolla Cross com envio para todo o Brasil.</p>
      <nav aria-label="Atalhos principais da Toyoparts" style="display:flex;flex-wrap:wrap;gap:12px">
        <a href="/pecas" style="color:#e10600;font-weight:700">Todas as pecas Toyota</a>
        <a href="/pecas/hilux" style="color:#e10600;font-weight:700">Pecas Hilux</a>
        <a href="/pecas/corolla" style="color:#e10600;font-weight:700">Pecas Corolla</a>
        <a href="/pecas/sw4" style="color:#e10600;font-weight:700">Pecas SW4</a>
        <a href="/pecas/yaris" style="color:#e10600;font-weight:700">Pecas Yaris</a>
        <a href="/pecas/corolla-cross" style="color:#e10600;font-weight:700">Pecas Corolla Cross</a>
      </nav>
    </main>`;
}

function injectHomeSeoFallback(html, shellPath) {
  if (shellPath !== '/') return html;
  return html.replace('<div id="root"></div>', `<div id="root">${buildHomeSeoFallback()}</div>`);
}

function injectHomeSeoFallbackVisibilityGuard(html, shellPath) {
  if (shellPath !== '/') return html;
  if (html.includes('id="seo-fallback-visibility-guard"')) return html;

  const guard = `    <style id="seo-fallback-visibility-guard">html.js #seo-home-fallback{display:none!important}</style>
    <script>document.documentElement.classList.add('js');</script>`;

  return html.replace('</head>', `${guard}\n  </head>`);
}

function buildOrganizationJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'AutoPartsStore',
    name: 'Toyoparts',
    alternateName: 'Toyoparts Toyota',
    url: CANONICAL_SITE_URL,
    logo: `${CANONICAL_SITE_URL}/brand/toyoparts-email-logo.png`,
    image: `${CANONICAL_SITE_URL}/og-home.svg`,
    telephone: '+55 43 3294-1144',
    address: {
      '@type': 'PostalAddress',
      streetAddress: 'Av. Tiradentes, 2333',
      addressLocality: 'Londrina',
      addressRegion: 'PR',
      postalCode: '86071-000',
      addressCountry: 'BR',
    },
    sameAs: [CANONICAL_SITE_URL],
  };
}

function buildWebSiteJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'Toyoparts',
    alternateName: 'Toyoparts Toyota',
    url: CANONICAL_SITE_URL,
    potentialAction: {
      '@type': 'SearchAction',
      target: `${CANONICAL_SITE_URL}/busca?q={search_term_string}`,
      'query-input': 'required name=search_term_string',
    },
  };
}

function injectHomeStructuredData(html, shellPath) {
  if (shellPath !== '/') return html;
  if (html.includes('"@type":"AutoPartsStore"') || html.includes('"@type": "AutoPartsStore"')) return html;

  const scripts = [
    buildOrganizationJsonLd(),
    buildWebSiteJsonLd(),
  ].map((entry) => `    <script type="application/ld+json">${JSON.stringify(entry)}</script>`).join('\n');

  return html.replace('</head>', `${scripts}\n  </head>`);
}

export default async function handler(req, res) {
  const shellPath = normalizeShellPath(req.query?.path);

  const host = String(req.headers.host || '').split(':')[0].toLowerCase();
  if (host && host !== PRIMARY_HOST && host === 'toyoparts.com.br') {
    res.setHeader('Location', buildCanonicalUrl(req, shellPath));
    res.status(301).end();
    return;
  }

  const upstreamUrl = buildUpstreamUrl(req, shellPath);
  const upstreamResponse = await fetch(upstreamUrl.toString(), {
    headers: {
      Accept: 'text/html',
      'User-Agent': 'toyoparts-vercel-catalog-shell-proxy',
    },
  });

  let html = await upstreamResponse.text();
  const homeHeroSeed = shellPath === '/' ? await getHomeHeroSeed() : null;
  html = stripBlockingGtm(html);
  html = normalizeFaviconHead(html);
  html = injectHomeStructuredData(html, shellPath);
  html = injectHomePerformanceHints(html, shellPath, homeHeroSeed);
  html = injectHomeSnapshotSeed(html, shellPath, homeHeroSeed);
  html = injectHomeSeoFallbackVisibilityGuard(html, shellPath);
  html = injectHomeSeoFallback(html, shellPath);
  html = injectShellStylesheet(html);
  html = injectDeferredGtm(html);
  const passThroughHeaders = [
    'cache-control',
    'etag',
    'last-modified',
    'x-catalog-version',
  ];

  for (const headerName of passThroughHeaders) {
    const headerValue = upstreamResponse.headers.get(headerName);
    if (headerValue) {
      res.setHeader(headerName, headerValue);
    }
  }

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.status(upstreamResponse.status).send(html);
}
