import { Hono } from 'npm:hono';
import * as kv from './kv_store.tsx';
import * as meili from './meilisearch.tsx';
import { resolveProductMedia } from './media-utils.tsx';
import {
  buildCategoryFilterTree,
  getCanonicalCategoryTreeContext,
  getPublicCategoryImagesMap,
  resolveCategoryTreeSelections,
  type CategoryNode,
} from './categories.tsx';
import {
  buildCanonicalVehicleFacetTargets,
  getCanonicalVehicleModelBySlug,
  resolveCanonicalVehicleSlugs,
} from '../../../shared/canonical-vehicle-models.ts';
import { resolveProductCompatibility } from '../../../shared/product-compatibility.ts';

const app = new Hono();

const SITE_URL = 'https://www.toyoparts.com.br';
const SITE_NAME = 'Toyoparts';
const DEFAULT_OG_IMAGE = `${SITE_URL}/og-home.svg`;
const INDEXABLE_CATEGORY_THRESHOLD = 3;
const GTM_ID = 'GTM-5B9VBQ';
const FAVICON_HEAD_MARKUP = `    <link rel="icon" href="/favicon.ico" sizes="any" />
    <link rel="icon" type="image/png" sizes="48x48" href="/favicon-48x48.png" />
    <link rel="icon" type="image/png" sizes="96x96" href="/favicon-96x96.png" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
    <link rel="manifest" href="/site.webmanifest" />`;

type CatalogTreeStatus = 'live' | 'cached' | 'degraded';

interface CatalogNavigationVehicleFacet {
  slug: string;
  label: string;
  count: number;
}

interface CatalogNavigationYearFacet {
  value: string;
  count: number;
}

interface AppliedCatalogFilters {
  category: string[];
  category_name: string[];
  modelo_slug: string[];
  anos: string[];
  inStock: string | null;
  minPrice: number | null;
  maxPrice: number | null;
  q: string;
}

interface SeoPayload {
  title: string;
  description: string;
  canonical: string;
  robots: string;
  ogType: string;
  ogImage: string;
  jsonLd: Record<string, unknown> | Array<Record<string, unknown>>;
  statusCode: number;
  catalogVersion: string;
}

function compactJsonLd(entries: Array<Record<string, unknown> | null | undefined>) {
  return entries.filter((entry): entry is Record<string, unknown> => !!entry);
}

const STATIC_ROUTE_SEO: Record<string, Pick<SeoPayload, 'title' | 'description' | 'robots' | 'ogType' | 'ogImage'>> = {
  '/': {
    title: 'Toyoparts | Peças e Acessórios Genuínos Toyota',
    description: 'Compre peças e acessórios genuínos Toyota para Hilux, Corolla, SW4, Yaris, Etios, RAV4, Prius e Corolla Cross com envio para todo o Brasil.',
    robots: 'index,follow,max-image-preview:large',
    ogType: 'website',
    ogImage: DEFAULT_OG_IMAGE,
  },
  '/pecas': {
    title: 'Peças Toyota | Toyoparts',
    description: 'Navegue por todas as peças e acessórios Toyota da Toyoparts com filtros por veículo, categoria e ano.',
    robots: 'index,follow',
    ogType: 'website',
    ogImage: DEFAULT_OG_IMAGE,
  },
  '/sobre': {
    title: 'Sobre a Toyoparts',
    description: 'Conheça a Toyoparts e a nossa operação especializada em peças e acessórios genuínos Toyota.',
    robots: 'index,follow',
    ogType: 'website',
    ogImage: DEFAULT_OG_IMAGE,
  },
  '/fale-conosco': {
    title: 'Fale Conosco | Toyoparts',
    description: 'Entre em contato com a equipe Toyoparts para tirar dúvidas sobre pedidos, produtos e atendimento.',
    robots: 'index,follow',
    ogType: 'website',
    ogImage: DEFAULT_OG_IMAGE,
  },
  '/loja-fisica': {
    title: 'Loja Física | Toyoparts',
    description: 'Conheça a unidade física e os canais de atendimento presencial da Toyoparts.',
    robots: 'index,follow',
    ogType: 'website',
    ogImage: DEFAULT_OG_IMAGE,
  },
  '/privacidade': {
    title: 'Política de Privacidade | Toyoparts',
    description: 'Entenda como a Toyoparts trata dados pessoais, segurança e privacidade.',
    robots: 'index,follow',
    ogType: 'website',
    ogImage: DEFAULT_OG_IMAGE,
  },
  '/politica-de-privacidade': {
    title: 'Política de Privacidade | Toyoparts',
    description: 'Entenda como a Toyoparts trata dados pessoais, segurança e privacidade.',
    robots: 'index,follow',
    ogType: 'website',
    ogImage: DEFAULT_OG_IMAGE,
  },
  '/entrega': {
    title: 'Política de Entrega | Toyoparts',
    description: 'Consulte prazos, modalidades de envio e regras de entrega da Toyoparts.',
    robots: 'index,follow',
    ogType: 'website',
    ogImage: DEFAULT_OG_IMAGE,
  },
  '/politica-de-entrega': {
    title: 'Política de Entrega | Toyoparts',
    description: 'Consulte prazos, modalidades de envio e regras de entrega da Toyoparts.',
    robots: 'index,follow',
    ogType: 'website',
    ogImage: DEFAULT_OG_IMAGE,
  },
  '/troca-devolucoes': {
    title: 'Trocas e Devoluções | Toyoparts',
    description: 'Veja como funcionam as trocas e devoluções na Toyoparts.',
    robots: 'index,follow',
    ogType: 'website',
    ogImage: DEFAULT_OG_IMAGE,
  },
  '/trocas-e-devolucoes': {
    title: 'Trocas e Devoluções | Toyoparts',
    description: 'Veja como funcionam as trocas e devoluções na Toyoparts.',
    robots: 'index,follow',
    ogType: 'website',
    ogImage: DEFAULT_OG_IMAGE,
  },
  '/rastreamento-correios': {
    title: 'Rastreamento de Pedidos | Toyoparts',
    description: 'Acompanhe o status do envio e o rastreamento do seu pedido na Toyoparts.',
    robots: 'index,follow',
    ogType: 'website',
    ogImage: DEFAULT_OG_IMAGE,
  },
  '/rastreamento': {
    title: 'Rastreamento de Pedidos | Toyoparts',
    description: 'Acompanhe o status do envio e o rastreamento do seu pedido na Toyoparts.',
    robots: 'index,follow',
    ogType: 'website',
    ogImage: DEFAULT_OG_IMAGE,
  },
};

function slugify(value: string) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function escapeHtml(value: unknown) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function normalizePathname(rawPath: string) {
  const safe = String(rawPath || '').trim();
  if (!safe) return '/';
  let path = safe.startsWith('http') ? new URL(safe).pathname : safe;
  if (!path.startsWith('/')) path = `/${path}`;
  path = path.replace(/\/{2,}/g, '/');
  if (path.length > 1) path = path.replace(/\/+$/, '');
  return path || '/';
}

function extractShellRequestPath(requestUrl: string) {
  const pathname = new URL(requestUrl).pathname;
  const marker = '/catalog/shell';
  const markerIndex = pathname.indexOf(marker);
  if (markerIndex === -1) return '/';
  const suffix = pathname.slice(markerIndex + marker.length);
  return normalizePathname(suffix || '/');
}

function buildBreadcrumbJsonLd(items: Array<{ name: string; url: string }>) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: `${SITE_URL}${item.url}`,
    })),
  };
}

function buildCollectionJsonLd(payload: {
  title: string;
  description: string;
  canonical: string;
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: payload.title,
    description: payload.description,
    url: payload.canonical,
  };
}

function buildOrganizationJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'AutoPartsStore',
    name: SITE_NAME,
    alternateName: 'Toyoparts Toyota',
    url: SITE_URL,
    logo: `${SITE_URL}/brand/toyoparts-email-logo.png`,
    image: DEFAULT_OG_IMAGE,
    telephone: '+55 43 3294-1144',
    address: {
      '@type': 'PostalAddress',
      streetAddress: 'Av. Tiradentes, 2333',
      addressLocality: 'Londrina',
      addressRegion: 'PR',
      postalCode: '86071-000',
      addressCountry: 'BR',
    },
    sameAs: [SITE_URL],
  };
}

function buildWebSiteJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: SITE_NAME,
    alternateName: 'Toyoparts Toyota',
    url: SITE_URL,
    potentialAction: {
      '@type': 'SearchAction',
      target: `${SITE_URL}/busca?q={search_term_string}`,
      'query-input': 'required name=search_term_string',
    },
  };
}

function buildProductJsonLd(product: any, compatibilityDisplay: string[]) {
  const canonical = `${SITE_URL}/produto/${encodeURIComponent(product.sku)}/${product.url_key || slugify(product.name || product.sku)}`;
  const media = resolveProductMedia(product, { allowLegacy: true });

  const description = String(product.meta_description || product.short_description || product.description || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 500);
  const price = Number(product.special_price && product.special_price > 0 && product.special_price < product.price
    ? product.special_price
    : product.price || 0);

  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: String(product.seo_title || product.name || product.sku),
    sku: product.sku,
    description,
    brand: {
      '@type': 'Brand',
      name: 'Toyota',
    },
    ...(media.images.length > 0 ? { image: media.images } : {}),
    isAccessoryOrSparePartFor: compatibilityDisplay.length > 0
      ? compatibilityDisplay.map((entry) => ({
          '@type': 'Vehicle',
          name: entry,
        }))
      : undefined,
    offers: {
      '@type': 'Offer',
      price: Number.isFinite(price) ? price.toFixed(2) : '0.00',
      priceCurrency: 'BRL',
      availability: product.in_stock === false
        ? 'https://schema.org/OutOfStock'
        : 'https://schema.org/InStock',
      seller: {
        '@type': 'Organization',
        name: SITE_NAME,
      },
      url: canonical,
    },
  };
}

function resolveCategoryTreeStatus(
  treeStatus: CatalogTreeStatus,
  facetStatus: 'live' | 'cached',
): CatalogTreeStatus {
  if (treeStatus === 'degraded') return 'degraded';
  if (facetStatus === 'live') return 'live';
  return 'cached';
}

function resolveLegacyModelSlugs(values: string[]) {
  return Array.from(new Set(resolveCanonicalVehicleSlugs(values)));
}

function buildCatalogFilters(
  input: {
    categoryValues: string[];
    categoryNameValues: string[];
    modeloSlugValues: string[];
    anosValues: string[];
    inStock: string | null;
    minPrice: number | null;
    maxPrice: number | null;
  },
) {
  const filters: string[] = ['status = 1'];

  if (input.inStock === 'true') filters.push('in_stock = true');
  if (input.inStock === 'false') filters.push('in_stock = false');

  if (input.categoryValues.length === 1) {
    filters.push(`category_ids = "${input.categoryValues[0]}"`);
  } else if (input.categoryValues.length > 1) {
    filters.push(`category_ids IN [${input.categoryValues.map((value) => `"${value}"`).join(',')}]`);
  }

  if (!input.categoryValues.length && input.categoryNameValues.length === 1) {
    filters.push(`category_names = "${input.categoryNameValues[0]}"`);
  } else if (!input.categoryValues.length && input.categoryNameValues.length > 1) {
    filters.push(`category_names IN [${input.categoryNameValues.map((value) => `"${value}"`).join(',')}]`);
  }

  if (input.modeloSlugValues.length === 1) {
    filters.push(`modelo_slugs = "${input.modeloSlugValues[0]}"`);
  } else if (input.modeloSlugValues.length > 1) {
    filters.push(`modelo_slugs IN [${input.modeloSlugValues.map((value) => `"${value}"`).join(',')}]`);
  }

  if (input.anosValues.length === 1) {
    filters.push(`compat_years = "${input.anosValues[0]}"`);
  } else if (input.anosValues.length > 1) {
    filters.push(`compat_years IN [${input.anosValues.map((value) => `"${value}"`).join(',')}]`);
  }

  if (input.minPrice != null && Number.isFinite(input.minPrice)) {
    filters.push(`price >= ${input.minPrice}`);
  }

  if (input.maxPrice != null && Number.isFinite(input.maxPrice)) {
    filters.push(`price <= ${input.maxPrice}`);
  }

  return filters;
}

async function resolveCatalogContext(c: { req: { query: (name: string) => string | undefined } }) {
  const categoryTreeContext = await getCanonicalCategoryTreeContext();
  const rawCategoryValues = String(c.req.query('category') || c.req.query('categories') || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
  const rawCategoryNameValues = String(c.req.query('category_name') || c.req.query('category_names') || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
  const resolvedCategorySelection = resolveCategoryTreeSelections(categoryTreeContext.tree, [
    ...rawCategoryValues,
    ...rawCategoryNameValues,
  ]);

  const rawModeloSlugValues = String(c.req.query('modelo_slug') || '')
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
  const rawLegacyModelValues = String(c.req.query('modelos') || c.req.query('modelo') || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
  const modeloSlugValues = rawModeloSlugValues.length > 0
    ? rawModeloSlugValues
    : resolveLegacyModelSlugs(rawLegacyModelValues);
  const anosValues = String(c.req.query('anos') || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
  const inStock = (() => {
    const raw = String(c.req.query('inStock') || '').trim().toLowerCase();
    if (raw === 'true' || raw === 'false') return raw;
    return null;
  })();
  const minPriceRaw = c.req.query('minPrice');
  const maxPriceRaw = c.req.query('maxPrice');
  const minPrice = minPriceRaw ? Number(minPriceRaw) : null;
  const maxPrice = maxPriceRaw ? Number(maxPriceRaw) : null;
  const q = String(c.req.query('q') || '').trim();

  const appliedFilters: AppliedCatalogFilters = {
    category: resolvedCategorySelection.ids,
    category_name: resolvedCategorySelection.names,
    modelo_slug: modeloSlugValues,
    anos: anosValues,
    inStock,
    minPrice: Number.isFinite(minPrice) ? minPrice : null,
    maxPrice: Number.isFinite(maxPrice) ? maxPrice : null,
    q,
  };

  return {
    categoryTreeContext,
    appliedFilters,
    filters: buildCatalogFilters({
      categoryValues: appliedFilters.category,
      categoryNameValues: appliedFilters.category_name,
      modeloSlugValues: appliedFilters.modelo_slug,
      anosValues: appliedFilters.anos,
      inStock: appliedFilters.inStock,
      minPrice: appliedFilters.minPrice,
      maxPrice: appliedFilters.maxPrice,
    }),
  };
}

async function fetchCatalogNavigation(params: {
  q: string;
  filters: string[];
  categoryTree: CategoryNode;
  treeStatus: CatalogTreeStatus;
  treeVersion: string;
  selectedCategoryIds: string[];
  selectedCategoryNames: string[];
}) {
  const images = await getPublicCategoryImagesMap().catch(() => ({}));

  if (!meili.isConfigured()) {
    return {
      engine: 'degraded',
      totalHits: 0,
      categoryTree: buildCategoryFilterTree(params.categoryTree, {}, params.selectedCategoryIds, params.selectedCategoryNames),
      categoryTreeStatus: 'degraded' as CatalogTreeStatus,
      categoryTreeVersion: params.treeVersion,
      vehicleFacets: [] as CatalogNavigationVehicleFacet[],
      yearFacets: [] as CatalogNavigationYearFacet[],
      images,
    };
  }

  const result = await meili.search(params.q, {
    limit: 0,
    offset: 0,
    filter: params.filters,
    facets: ['category_ids', 'modelo_slugs', 'compat_years'],
  });

  const totalHits = Number(result.totalHits ?? result.estimatedTotalHits ?? 0);
  const facetDistribution = result.facetDistribution || {};
  const categoryCounts = facetDistribution.category_ids || {};
  const vehicleCounts = facetDistribution.modelo_slugs || {};
  const yearCounts = facetDistribution.compat_years || {};

  const categoryTree = buildCategoryFilterTree(
    params.categoryTree,
    categoryCounts,
    params.selectedCategoryIds,
    params.selectedCategoryNames,
  );

  return {
    engine: 'meilisearch',
    totalHits,
    categoryTree,
    categoryTreeStatus: resolveCategoryTreeStatus(
      params.treeStatus,
      Object.keys(categoryCounts).length > 0 ? 'live' : 'cached',
    ),
    categoryTreeVersion: params.treeVersion,
    vehicleFacets: buildCanonicalVehicleFacetTargets(vehicleCounts).map((entry) => ({
      slug: entry.slug,
      label: entry.displayName,
      count: entry.productCount,
    })),
    yearFacets: Object.entries(yearCounts)
      .sort(([left], [right]) => right.localeCompare(left))
      .map(([value, count]) => ({
        value,
        count: Number(count || 0),
      }))
      .filter((entry) => entry.count > 0),
    images,
  };
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

function renderAppShellHtml(seo: SeoPayload) {
  const baseJsonLdScripts = compactJsonLd(Array.isArray(seo.jsonLd) ? seo.jsonLd : [seo.jsonLd]);
  const isHome = seo.canonical === `${SITE_URL}/`;
  const jsonLdScripts = isHome
    ? [...baseJsonLdScripts, buildOrganizationJsonLd(), buildWebSiteJsonLd()]
    : baseJsonLdScripts;
  const rootContent = isHome ? buildHomeSeoFallback() : '';

  return `<!DOCTYPE html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <script>
      (function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
      new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
      j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
      'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
      })(window,document,'script','dataLayer','${GTM_ID}');
    </script>
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title data-rh="true">${escapeHtml(seo.title)}</title>
    <meta data-rh="true" name="description" content="${escapeHtml(seo.description)}" />
    <meta data-rh="true" name="robots" content="${escapeHtml(seo.robots)}" />
    <meta name="author" content="${SITE_NAME}" />
    <meta name="theme-color" content="#eb0a1e" />
${FAVICON_HEAD_MARKUP}
    <link data-rh="true" rel="canonical" href="${escapeHtml(seo.canonical)}" />
    <meta property="og:locale" content="pt_BR" />
    <meta data-rh="true" property="og:type" content="${escapeHtml(seo.ogType)}" />
    <meta property="og:site_name" content="${SITE_NAME}" />
    <meta data-rh="true" property="og:title" content="${escapeHtml(seo.title)}" />
    <meta data-rh="true" property="og:description" content="${escapeHtml(seo.description)}" />
    <meta data-rh="true" property="og:url" content="${escapeHtml(seo.canonical)}" />
    <meta data-rh="true" property="og:image" content="${escapeHtml(seo.ogImage)}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta data-rh="true" name="twitter:title" content="${escapeHtml(seo.title)}" />
    <meta data-rh="true" name="twitter:description" content="${escapeHtml(seo.description)}" />
    <meta data-rh="true" name="twitter:image" content="${escapeHtml(seo.ogImage)}" />
    ${jsonLdScripts.map((entry) => `<script data-rh="true" type="application/ld+json">${JSON.stringify(entry)}</script>`).join('\n    ')}
  </head>
  <body>
    <noscript><iframe src="https://www.googletagmanager.com/ns.html?id=${GTM_ID}" height="0" width="0" style="display:none;visibility:hidden"></iframe></noscript>
    <div id="root">${rootContent}</div>
    <script type="module" src="/assets/app.js" data-cfasync="false"></script>
  </body>
</html>`;
}

function findCategoryBySlug(root: CategoryNode, slug: string): CategoryNode | null {
  const normalizedSlug = slugify(slug);
  let match: CategoryNode | null = null;

  const walk = (node: CategoryNode) => {
    if (slugify(node.name) === normalizedSlug) {
      match = node;
      return;
    }
    for (const child of node.children_data || []) {
      if (match) return;
      walk(child);
    }
  };

  walk(root);
  return match;
}

async function buildProductSeoPayload(pathname: string, treeVersion: string): Promise<SeoPayload> {
  const segments = pathname.split('/').filter(Boolean);
  const sku = decodeURIComponent(segments[1] || '').trim();
  const product = sku ? await kv.get(`product:${sku}`).catch(() => null) : null;

  if (!product) {
    return {
      title: `Produto não encontrado | ${SITE_NAME}`,
      description: 'O produto solicitado não foi encontrado na Toyoparts.',
      canonical: `${SITE_URL}${pathname}`,
      robots: 'noindex,follow',
      ogType: 'website',
      ogImage: DEFAULT_OG_IMAGE,
      jsonLd: buildCollectionJsonLd({
        title: `Produto não encontrado | ${SITE_NAME}`,
        description: 'O produto solicitado não foi encontrado na Toyoparts.',
        canonical: `${SITE_URL}${pathname}`,
      }),
      statusCode: 404,
      catalogVersion: treeVersion,
    };
  }

  const compatibility = resolveProductCompatibility(product);
  const media = resolveProductMedia(product, { allowLegacy: true });
  const canonical = `${SITE_URL}/produto/${encodeURIComponent(product.sku)}/${product.url_key || slugify(product.name || product.sku)}`;
  const title = `${String(product.seo_title || product.name || product.sku)} | ${SITE_NAME}`;
  const description = String(product.meta_description || product.short_description || product.description || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160)
    || `Compre ${product.name || product.sku} na Toyoparts. Peça genuína Toyota com garantia.`;
  const breadcrumb = buildBreadcrumbJsonLd([
    { name: 'Home', url: '/' },
    { name: 'Produto', url: canonical.replace(SITE_URL, '') },
  ]);
  const productJsonLd = buildProductJsonLd(product, compatibility.compatibilityDisplay);

  return {
    title,
    description,
    canonical,
    robots: 'index,follow',
    ogType: 'product',
    ogImage: media.image_url || DEFAULT_OG_IMAGE,
    jsonLd: compactJsonLd([
      productJsonLd,
      breadcrumb,
    ]),
    statusCode: 200,
    catalogVersion: treeVersion,
  };
}

async function buildCatalogSeoPayload(pathname: string, searchParams: URLSearchParams): Promise<SeoPayload> {
  const categoryTreeContext = await getCanonicalCategoryTreeContext();
  const canonicalBase = `${SITE_URL}${pathname}`;
  const staticRoute = STATIC_ROUTE_SEO[pathname];

  if (staticRoute) {
    const breadcrumb = buildBreadcrumbJsonLd(
      pathname === '/'
        ? [{ name: 'Home', url: '/' }]
        : [
            { name: 'Home', url: '/' },
            { name: String(staticRoute.title).replace(` | ${SITE_NAME}`, ''), url: pathname },
          ],
    );
    return {
      title: staticRoute.title,
      description: staticRoute.description,
      canonical: canonicalBase,
      robots: staticRoute.robots,
      ogType: staticRoute.ogType,
      ogImage: staticRoute.ogImage,
      jsonLd: [buildCollectionJsonLd({ title: staticRoute.title, description: staticRoute.description, canonical: canonicalBase }), breadcrumb],
      statusCode: 200,
      catalogVersion: categoryTreeContext.version,
    };
  }

  if (pathname === '/busca') {
    const query = String(searchParams.get('q') || '').trim();
    const title = query ? `Busca: ${query} | ${SITE_NAME}` : `Busca de Peças | ${SITE_NAME}`;
    return {
      title,
      description: 'Encontre peças genuínas Toyota usando a busca da Toyoparts.',
      canonical: `${SITE_URL}/busca`,
      robots: 'noindex,follow',
      ogType: 'website',
      ogImage: DEFAULT_OG_IMAGE,
      jsonLd: buildCollectionJsonLd({
        title,
        description: 'Encontre peças genuínas Toyota usando a busca da Toyoparts.',
        canonical: `${SITE_URL}/busca`,
      }),
      statusCode: 200,
      catalogVersion: categoryTreeContext.version,
    };
  }

  if (pathname.startsWith('/produto/')) {
    return buildProductSeoPayload(pathname, categoryTreeContext.version);
  }

  if (pathname === '/pecas') {
    return {
      title: 'Peças Toyota | Toyoparts',
      description: 'Navegue por todas as peças e acessórios Toyota da Toyoparts com filtros por veículo, categoria e ano.',
      canonical: canonicalBase,
      robots: 'index,follow',
      ogType: 'website',
      ogImage: DEFAULT_OG_IMAGE,
      jsonLd: buildCollectionJsonLd({
        title: 'Peças Toyota | Toyoparts',
        description: 'Navegue por todas as peças e acessórios Toyota da Toyoparts com filtros por veículo, categoria e ano.',
        canonical: canonicalBase,
      }),
      statusCode: 200,
      catalogVersion: categoryTreeContext.version,
    };
  }

  if (pathname.startsWith('/pecas/')) {
    const segments = pathname.split('/').filter(Boolean);
    const modelSlug = String(segments[1] || '').trim().toLowerCase();
    const categorySlug = String(segments[2] || '').trim().toLowerCase();
    const model = getCanonicalVehicleModelBySlug(modelSlug);

    if (!model) {
      return {
        title: `Página não encontrada | ${SITE_NAME}`,
        description: 'A página solicitada não foi encontrada na Toyoparts.',
        canonical: canonicalBase,
        robots: 'noindex,follow',
        ogType: 'website',
        ogImage: DEFAULT_OG_IMAGE,
        jsonLd: buildCollectionJsonLd({
          title: `Página não encontrada | ${SITE_NAME}`,
          description: 'A página solicitada não foi encontrada na Toyoparts.',
          canonical: canonicalBase,
        }),
        statusCode: 404,
        catalogVersion: categoryTreeContext.version,
      };
    }

    const modelSearch = await meili.search('', {
      limit: 0,
      offset: 0,
      filter: [`status = 1`, `modelo_slugs = "${model.slug}"`],
      facets: ['category_ids'],
    }).catch(() => null);
    const modelTotal = Number(modelSearch?.totalHits ?? modelSearch?.estimatedTotalHits ?? 0);

    if (modelTotal <= 0) {
      return {
        title: `${model.displayName} | ${SITE_NAME}`,
        description: `Não encontramos catálogo ativo para ${model.displayName} neste momento.`,
        canonical: canonicalBase,
        robots: 'noindex,follow',
        ogType: 'website',
        ogImage: DEFAULT_OG_IMAGE,
        jsonLd: buildCollectionJsonLd({
          title: `${model.displayName} | ${SITE_NAME}`,
          description: `Não encontramos catálogo ativo para ${model.displayName} neste momento.`,
          canonical: canonicalBase,
        }),
        statusCode: 404,
        catalogVersion: categoryTreeContext.version,
      };
    }

    if (!categorySlug) {
      const canonical = `${SITE_URL}/pecas/${model.slug}`;
      return {
        title: `${model.displayName} | ${SITE_NAME}`,
        description: `Explore peças e acessórios Toyota compatíveis com ${model.displayName} na Toyoparts.`,
        canonical,
        robots: 'index,follow',
        ogType: 'website',
        ogImage: DEFAULT_OG_IMAGE,
        jsonLd: [
          buildCollectionJsonLd({
            title: `${model.displayName} | ${SITE_NAME}`,
            description: `Explore peças e acessórios Toyota compatíveis com ${model.displayName} na Toyoparts.`,
            canonical,
          }),
          buildBreadcrumbJsonLd([
            { name: 'Home', url: '/' },
            { name: 'Peças', url: '/pecas' },
            { name: model.displayName, url: `/pecas/${model.slug}` },
          ]),
        ],
        statusCode: 200,
        catalogVersion: categoryTreeContext.version,
      };
    }

    const categoryNode = findCategoryBySlug(categoryTreeContext.tree, categorySlug);
    if (!categoryNode) {
      return {
        title: `Página não encontrada | ${SITE_NAME}`,
        description: 'A categoria solicitada não foi encontrada na Toyoparts.',
        canonical: canonicalBase,
        robots: 'noindex,follow',
        ogType: 'website',
        ogImage: DEFAULT_OG_IMAGE,
        jsonLd: buildCollectionJsonLd({
          title: `Página não encontrada | ${SITE_NAME}`,
          description: 'A categoria solicitada não foi encontrada na Toyoparts.',
          canonical: canonicalBase,
        }),
        statusCode: 404,
        catalogVersion: categoryTreeContext.version,
      };
    }

    const categorySearch = await meili.search('', {
      limit: 0,
      offset: 0,
      filter: [
        'status = 1',
        'in_stock = true',
        `modelo_slugs = "${model.slug}"`,
        `category_ids = "${categoryNode.id}"`,
      ],
    }).catch(() => null);
    const categoryTotal = Number(categorySearch?.totalHits ?? categorySearch?.estimatedTotalHits ?? 0);

    if (categoryTotal <= 0) {
      return {
        title: `Página não encontrada | ${SITE_NAME}`,
        description: 'Não encontramos produtos ativos para essa combinação de veículo e categoria.',
        canonical: canonicalBase,
        robots: 'noindex,follow',
        ogType: 'website',
        ogImage: DEFAULT_OG_IMAGE,
        jsonLd: buildCollectionJsonLd({
          title: `Página não encontrada | ${SITE_NAME}`,
          description: 'Não encontramos produtos ativos para essa combinação de veículo e categoria.',
          canonical: canonicalBase,
        }),
        statusCode: 404,
        catalogVersion: categoryTreeContext.version,
      };
    }

    const canonical = `${SITE_URL}/pecas/${model.slug}/${slugify(categoryNode.name)}`;
    const shouldIndex = categoryTotal >= INDEXABLE_CATEGORY_THRESHOLD;
    const title = `${categoryNode.name} para ${model.displayName} | ${SITE_NAME}`;
    const description = `Veja produtos de ${categoryNode.name.toLowerCase()} compatíveis com ${model.displayName} na Toyoparts.`;
    return {
      title,
      description,
      canonical,
      robots: shouldIndex ? 'index,follow' : 'noindex,follow',
      ogType: 'website',
      ogImage: DEFAULT_OG_IMAGE,
      jsonLd: [
        buildCollectionJsonLd({ title, description, canonical }),
        buildBreadcrumbJsonLd([
          { name: 'Home', url: '/' },
          { name: 'Peças', url: '/pecas' },
          { name: model.displayName, url: `/pecas/${model.slug}` },
          { name: categoryNode.name, url: `/pecas/${model.slug}/${slugify(categoryNode.name)}` },
        ]),
      ],
      statusCode: 200,
      catalogVersion: categoryTreeContext.version,
    };
  }

  return {
    title: `Página não encontrada | ${SITE_NAME}`,
    description: 'A página solicitada não foi encontrada na Toyoparts.',
    canonical: canonicalBase,
    robots: 'noindex,follow',
    ogType: 'website',
    ogImage: DEFAULT_OG_IMAGE,
    jsonLd: buildCollectionJsonLd({
      title: `Página não encontrada | ${SITE_NAME}`,
      description: 'A página solicitada não foi encontrada na Toyoparts.',
      canonical: canonicalBase,
    }),
    statusCode: 404,
    catalogVersion: categoryTreeContext.version,
  };
}

app.get('/navigation', async (c) => {
  try {
    const { categoryTreeContext, appliedFilters, filters } = await resolveCatalogContext(c);
    const navigation = await fetchCatalogNavigation({
      q: appliedFilters.q,
      filters,
      categoryTree: categoryTreeContext.tree,
      treeStatus: categoryTreeContext.status,
      treeVersion: categoryTreeContext.version,
      selectedCategoryIds: appliedFilters.category,
      selectedCategoryNames: appliedFilters.category_name,
    });

    return c.json({
      engine: navigation.engine,
      categoryTree: navigation.categoryTree,
      categoryTreeStatus: navigation.categoryTreeStatus,
      categoryTreeVersion: navigation.categoryTreeVersion,
      vehicleFacets: navigation.vehicleFacets,
      yearFacets: navigation.yearFacets,
      images: navigation.images,
      stats: {
        totalHits: navigation.totalHits,
      },
      appliedFilters,
      catalogVersion: navigation.categoryTreeVersion,
    });
  } catch (error: any) {
    console.error('[catalog/navigation]', error);
    return c.json({ error: error.message || 'navigation failed' }, 500);
  }
});

app.get('/seo', async (c) => {
  try {
    const path = normalizePathname(c.req.query('path') || '/');
    const queryString = String(c.req.query('query') || '').trim();
    const searchParams = new URLSearchParams(queryString);
    const requestUrl = new URL(c.req.url);
    for (const [key, value] of requestUrl.searchParams.entries()) {
      if (key === 'path' || key === 'query') continue;
      searchParams.set(key, value);
    }
    const payload = await buildCatalogSeoPayload(path, searchParams);
    return c.json(payload, payload.statusCode >= 400 ? payload.statusCode : 200);
  } catch (error: any) {
    console.error('[catalog/seo]', error);
    return c.json({ error: error.message || 'seo failed' }, 500);
  }
});

app.get('/shell', async (c) => {
  try {
    const path = extractShellRequestPath(c.req.url);
    const payload = await buildCatalogSeoPayload(path, new URL(c.req.url).searchParams);
    return new Response(renderAppShellHtml(payload), {
      status: payload.statusCode,
      headers: {
        'Content-Type': 'text/html; charset=UTF-8',
        'Cache-Control': payload.statusCode >= 400 ? 'no-store' : 'public, s-maxage=300, stale-while-revalidate=600',
        'X-Catalog-Version': payload.catalogVersion,
      },
    });
  } catch (error: any) {
    return c.json({ error: error.message || 'shell failed' }, 500);
  }
});

app.get('/shell/*', async (c) => {
  try {
    const path = extractShellRequestPath(c.req.url);
    const payload = await buildCatalogSeoPayload(path, new URL(c.req.url).searchParams);
    return new Response(renderAppShellHtml(payload), {
      status: payload.statusCode,
      headers: {
        'Content-Type': 'text/html; charset=UTF-8',
        'Cache-Control': payload.statusCode >= 400 ? 'no-store' : 'public, s-maxage=300, stale-while-revalidate=600',
        'X-Catalog-Version': payload.catalogVersion,
      },
    });
  } catch (error: any) {
    return c.json({ error: error.message || 'shell failed' }, 500);
  }
});

export const catalogPublic = app;
