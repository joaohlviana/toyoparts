// ─── HTML Snapshot Generator (Template Server-Side) ─────────────────────────
// Gera HTML completo para rotas SEO (produto, categoria) sem headless browser.
// O HTML inclui: title, meta description, canonical, OG, JSON-LD, conteudo
// acima da dobra, e script do bundle SPA para hidratacao posterior.
//
// Decisao arquitetural: Template server-side (nao Playwright).
// Mais estavel, barato e rapido que headless browser.

import { Hono } from 'npm:hono';
import { createClient } from "jsr:@supabase/supabase-js@2.49.8";
import * as kv from './kv_store.tsx';
import * as meili from './meilisearch.tsx';

const app = new Hono();

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const SITE_URL = 'https://www.toyoparts.com.br';
const SITE_NAME = 'Toyoparts';
const SNAPSHOT_BUCKET = 'make-1d6e33e0-snapshots';
const SNAPSHOT_PREFIX = 'snapshot:';
const CATEGORY_TREE_CACHE_KEY = 'meta:category_tree';

type SnapshotRouteType = 'home' | 'static' | 'vehicle' | 'vehicle-category' | 'department' | 'subcategory' | 'leaf';

interface CategoryNode {
  id: string | number;
  name: string;
  is_active?: boolean;
  children_data?: CategoryNode[];
  children?: CategoryNode[];
}

interface SnapshotRouteRecord {
  path: string;
  url: string;
  route_type: SnapshotRouteType;
  title: string;
  description: string;
  h1: string;
  category_id?: string;
  category_name?: string;
  model_name?: string;
  model_slug?: string;
  model_facet_value?: string;
  product_count: number;
  depth: number;
  breadcrumb: string[];
  breadcrumb_items?: Array<{ name: string; url: string }>;
  requested?: boolean;
  has_snapshot?: boolean;
  snapshot_generated_at?: string | null;
  snapshot_age_hours?: number | null;
  snapshot_status?: 'fresh' | 'stale' | 'missing';
}

interface VehicleSnapshotTarget {
  slug: string;
  name: string;
  aliases: string[];
}

const VEHICLE_SNAPSHOT_TARGETS: VehicleSnapshotTarget[] = [
  { slug: 'hilux', name: 'Hilux', aliases: ['Hilux', '35'] },
  { slug: 'corolla', name: 'Corolla', aliases: ['Corolla', '38'] },
  { slug: 'corolla-cross', name: 'Corolla Cross', aliases: ['Corolla Cross', '206'] },
  { slug: 'yaris', name: 'Yaris', aliases: ['Yaris', '205'] },
  { slug: 'sw4', name: 'SW4', aliases: ['SW4', '204'] },
  { slug: 'etios', name: 'Etios', aliases: ['Etios', '37', '207'] },
  { slug: 'rav4', name: 'RAV4', aliases: ['RAV4', 'Rav4', '36'] },
  { slug: 'prius', name: 'Prius', aliases: ['Prius', '40'] },
];

const STATIC_SNAPSHOT_ROUTES: Array<Pick<SnapshotRouteRecord, 'path' | 'route_type' | 'title' | 'description' | 'h1'>> = [
  {
    path: '/',
    route_type: 'home',
    title: `${SITE_NAME} | Pecas e Acessorios Genuinos Toyota`,
    description: 'Compre pecas e acessorios genuinos Toyota para Corolla, Hilux, SW4, Yaris, Etios, RAV4, Prius e Corolla Cross.',
    h1: 'Pecas e Acessorios Genuinos Toyota',
  },
  {
    path: '/sobre',
    route_type: 'static',
    title: `Sobre a ${SITE_NAME} | Pecas e Acessorios Toyota`,
    description: 'Conheca a Toyoparts e a nossa operacao especializada em pecas e acessorios genuinos Toyota.',
    h1: 'Sobre a Toyoparts',
  },
  {
    path: '/privacidade',
    route_type: 'static',
    title: `Politica de Privacidade | ${SITE_NAME}`,
    description: 'Entenda como a Toyoparts trata dados pessoais, seguranca e privacidade.',
    h1: 'Politica de Privacidade',
  },
  {
    path: '/entrega',
    route_type: 'static',
    title: `Politica de Entrega | ${SITE_NAME}`,
    description: 'Consulte prazos, modalidades de envio e regras de entrega da Toyoparts.',
    h1: 'Politica de Entrega',
  },
  {
    path: '/troca-devolucoes',
    route_type: 'static',
    title: `Trocas e Devolucoes | ${SITE_NAME}`,
    description: 'Veja como funcionam as trocas e devolucoes na Toyoparts.',
    h1: 'Trocas e Devolucoes',
  },
  {
    path: '/rastreamento-correios',
    route_type: 'static',
    title: `Rastreamento de Pedidos | ${SITE_NAME}`,
    description: 'Acompanhe o status do envio e o rastreamento do seu pedido na Toyoparts.',
    h1: 'Rastreamento de Pedidos',
  },
  {
    path: '/loja-fisica',
    route_type: 'static',
    title: `Loja Fisica | ${SITE_NAME}`,
    description: 'Conheca a unidade fisica e os canais de atendimento presencial da Toyoparts.',
    h1: 'Loja Fisica',
  },
  {
    path: '/fale-conosco',
    route_type: 'static',
    title: `Fale Conosco | ${SITE_NAME}`,
    description: 'Entre em contato com a equipe Toyoparts para tirar duvidas sobre pedidos, produtos e atendimento.',
    h1: 'Fale Conosco',
  },
  {
    path: '/outlet',
    route_type: 'static',
    title: `Outlet Toyota | ${SITE_NAME}`,
    description: 'Confira ofertas e oportunidades em pecas e acessorios Toyota no outlet da Toyoparts.',
    h1: 'Outlet Toyota',
  },
  {
    path: '/ofertas',
    route_type: 'static',
    title: `Ofertas Toyota | ${SITE_NAME}`,
    description: 'Veja as principais ofertas de pecas e acessorios Toyota da Toyoparts.',
    h1: 'Ofertas Toyota',
  },
  {
    path: '/pecas-promocionais',
    route_type: 'static',
    title: `Pecas Promocionais | ${SITE_NAME}`,
    description: 'Explore pecas promocionais e oportunidades especiais em produtos Toyota.',
    h1: 'Pecas Promocionais',
  },
  {
    path: '/todos-departamentos',
    route_type: 'static',
    title: `Todos os Departamentos | ${SITE_NAME}`,
    description: 'Navegue por todos os departamentos e categorias da Toyoparts.',
    h1: 'Todos os Departamentos',
  },
];

// ─── Helpers ────────────────────────────────────────────────────────────────

function slugify(text: any): string {
  const str = String(text ?? '');
  if (!str || str === 'undefined' || str === 'null') return 'sem-nome';
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\w-]+/g, '')
    .replace(/--+/g, '-')
    || 'sem-nome';
}

function escapeHtml(str: any): string {
  const s = String(str ?? '');
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatPrice(price: number): string {
  return price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

// ─── Extract product data helper ────────────────────────────────────────────

function extractProductData(product: any) {
  return {
    sku: product.sku,
    name: product.name || '',
    seo_title: product.seo_title,
    meta_description: product.meta_description,
    url_key: product.url_key,
    price: product.price || 0,
    special_price: product.special_price,
    in_stock: (() => {
      const stockData = product?.extension_attributes?.stock;
      if (!stockData) return false;
      try {
        const stock = typeof stockData === 'string' ? JSON.parse(stockData) : stockData;
        return stock.is_in_stock === '1' || stock.is_in_stock === true || stock.is_in_stock === 1;
      } catch { return false; }
    })(),
    image_url: product.image_url || (() => {
      const attrs = product.custom_attributes;
      if (!Array.isArray(attrs)) return '';
      const img = attrs.find((a: any) => a.attribute_code === 'image');
      return img?.value ? `https://www.toyoparts.com.br/pub/media/catalog/product${img.value}` : '';
    })(),
    description: product.description || (() => {
      const attrs = product.custom_attributes;
      if (!Array.isArray(attrs)) return '';
      return attrs.find((a: any) => a.attribute_code === 'description')?.value || '';
    })(),
    short_description: product.short_description || (() => {
      const attrs = product.custom_attributes;
      if (!Array.isArray(attrs)) return '';
      return attrs.find((a: any) => a.attribute_code === 'short_description')?.value || '';
    })(),
    modelo_label: product.modelo_label,
    ano_labels: product.ano_labels,
  };
}

// ─── Ensure Bucket ──────────────────────────────────────────────────────────

let bucketReady = false;
async function ensureBucket() {
  if (bucketReady) return;
  try {
    const { data: buckets } = await supabase.storage.listBuckets();
    if (!buckets?.find(b => b.name === SNAPSHOT_BUCKET)) {
      await supabase.storage.createBucket(SNAPSHOT_BUCKET, { public: true });
      console.log(`[Snapshot] Bucket '${SNAPSHOT_BUCKET}' criado.`);
    }
    bucketReady = true;
  } catch (e: any) {
    console.warn('[Snapshot] Bucket check failed:', e.message);
  }
}

function getChildren(node: CategoryNode | null | undefined): CategoryNode[] {
  if (!node) return [];
  return (node.children_data || node.children || []).filter(Boolean);
}

function getTopCategoryNodes(tree: CategoryNode | null): CategoryNode[] {
  if (!tree) return [];
  const walk = (node: CategoryNode): CategoryNode[] => {
    const activeChildren = getChildren(node).filter((child) => child.is_active !== false);
    if (activeChildren.length === 0) return [];
    if (activeChildren.length === 1) return walk(activeChildren[0]);
    return activeChildren;
  };
  return walk(tree);
}

function normalizeRoutePath(input: string): string {
  if (!input) return '';
  const trimmed = input.trim();
  if (!trimmed) return '';
  let candidate = trimmed;
  try {
    const url = new URL(trimmed.startsWith('http') ? trimmed : `${SITE_URL}${trimmed.startsWith('/') ? '' : '/'}${trimmed}`);
    candidate = url.pathname || '/';
  } catch {
    candidate = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  }

  candidate = candidate
    .replace(/[?#].*$/, '')
    .replace(/\/{2,}/g, '/')
    .trim();

  if (!candidate.startsWith('/')) candidate = `/${candidate}`;
  if (candidate.length > 1) candidate = candidate.replace(/\/+$/, '');
  return candidate || '/';
}

function deriveSnapshotAgeHours(generatedAt?: string | null): number | null {
  if (!generatedAt) return null;
  const ageMs = Date.now() - new Date(generatedAt).getTime();
  if (!Number.isFinite(ageMs) || ageMs < 0) return null;
  return Math.round((ageMs / 3600000) * 10) / 10;
}

function buildSnapshotStatus(generatedAt?: string | null): 'fresh' | 'stale' | 'missing' {
  const age = deriveSnapshotAgeHours(generatedAt);
  if (age == null) return 'missing';
  return age <= 24 ? 'fresh' : 'stale';
}

async function getCategoryFacetCounts(): Promise<Record<string, number>> {
  if (!meili.isConfigured()) return {};
  try {
    const res = await meili.search('', { limit: 0, facets: ['category_ids'] });
    return res.facetDistribution?.category_ids || {};
  } catch (err: any) {
    console.warn('[Snapshot] Facet discovery failed:', err.message);
    return {};
  }
}

async function getModelFacetCounts(): Promise<Record<string, number>> {
  if (!meili.isConfigured()) return {};
  try {
    const res = await meili.search('', {
      limit: 0,
      filter: ['in_stock = true'],
      facets: ['modelos'],
    });
    return res.facetDistribution?.modelos || {};
  } catch (err: any) {
    console.warn('[Snapshot] Model facet discovery failed:', err.message);
    return {};
  }
}

function resolveSnapshotVehicleTargets(modelFacetCounts: Record<string, number>) {
  return VEHICLE_SNAPSHOT_TARGETS
    .map((target) => {
      const matchingAlias = target.aliases.find((alias) => Number(modelFacetCounts[alias] || 0) > 0);
      if (!matchingAlias) return null;
      return {
        ...target,
        facetValue: matchingAlias,
        productCount: Number(modelFacetCounts[matchingAlias] || 0),
      };
    })
    .filter(Boolean) as Array<VehicleSnapshotTarget & { facetValue: string; productCount: number }>;
}

async function getSnapshotMetadataMap() {
  const snapshots = await kv.getByPrefix(`${SNAPSHOT_PREFIX}category:`).catch(() => []);
  const map = new Map<string, any>();
  for (const item of (snapshots || [])) {
    const key = item?.key || '';
    const value = item?.value || item;
    const path = key.replace(`${SNAPSHOT_PREFIX}category:`, '') || value?.path;
    if (path) map.set(path, value);
  }
  return map;
}

function decorateRouteWithSnapshot(route: SnapshotRouteRecord, snapshotMeta?: any): SnapshotRouteRecord {
  const generatedAt = snapshotMeta?.generated_at || null;
  return {
    ...route,
    has_snapshot: !!generatedAt,
    snapshot_generated_at: generatedAt,
    snapshot_age_hours: deriveSnapshotAgeHours(generatedAt),
    snapshot_status: buildSnapshotStatus(generatedAt),
  };
}

async function discoverCategorySnapshotRoutes(options?: {
  urls?: string[];
  minProducts?: number;
  maxDepth?: number;
  includeStatic?: boolean;
}) {
  const minProducts = Math.max(1, Number(options?.minProducts || 1));
  const maxDepth = Math.min(Math.max(1, Number(options?.maxDepth || 3)), 4);
  const requestedPaths = new Set((options?.urls || []).map(normalizeRoutePath).filter(Boolean));

  const tree = await kv.get(CATEGORY_TREE_CACHE_KEY).catch(() => null);
  const facetCounts = await getCategoryFacetCounts();
  const modelFacetCounts = await getModelFacetCounts();
  const snapshotMeta = await getSnapshotMetadataMap();

  const routes: SnapshotRouteRecord[] = [];
  const seen = new Set<string>();
  const topCats = Array.isArray(tree)
    ? tree.flatMap((node) => getTopCategoryNodes(node as CategoryNode))
    : getTopCategoryNodes(tree as CategoryNode | null);

  const pushRoute = (route: SnapshotRouteRecord) => {
    if (seen.has(route.path)) return;
    seen.add(route.path);
    routes.push(decorateRouteWithSnapshot({
      ...route,
      requested: requestedPaths.size > 0 ? requestedPaths.has(route.path) : false,
    }, snapshotMeta.get(route.path)));
  };

  if (options?.includeStatic !== false) {
    for (const preset of STATIC_SNAPSHOT_ROUTES) {
      pushRoute({
        ...preset,
        url: `${SITE_URL}${preset.path}`,
        product_count: 0,
        depth: preset.path === '/' ? 0 : preset.path.split('/').filter(Boolean).length,
        breadcrumb: preset.path === '/' ? ['Home'] : preset.path.split('/').filter(Boolean).map((part) => part.replace(/-/g, ' ')),
      });
    }
  }

  const vehicleTargets = resolveSnapshotVehicleTargets(modelFacetCounts);
  for (const vehicle of vehicleTargets) {
    if (vehicle.productCount < minProducts) continue;

    const vehiclePath = `/pecas/${vehicle.slug}`;
    pushRoute({
      path: vehiclePath,
      url: `${SITE_URL}${vehiclePath}`,
      route_type: 'vehicle',
      title: `Pecas e Acessorios Toyota ${vehicle.name} | ${SITE_NAME}`,
      description: `Explore pecas e acessorios genuinos Toyota para ${vehicle.name} com ${vehicle.productCount} produto${vehicle.productCount === 1 ? '' : 's'} em estoque na ${SITE_NAME}.`,
      h1: `Pecas e Acessorios Toyota ${vehicle.name}`,
      model_name: vehicle.name,
      model_slug: vehicle.slug,
      model_facet_value: vehicle.facetValue,
      product_count: vehicle.productCount,
      depth: 1,
      breadcrumb: ['Pecas', vehicle.name],
      breadcrumb_items: [
        { name: 'Home', url: '/' },
        { name: 'Pecas', url: '/pecas' },
        { name: vehicle.name, url: vehiclePath },
      ],
    });

    if (!meili.isConfigured()) continue;

    try {
      const categorySearch = await meili.search('', {
        limit: 0,
        filter: [`modelos = "${vehicle.facetValue}"`, 'in_stock = true'],
        facets: ['category_names'],
      });
      const categoryFacetCounts = categorySearch.facetDistribution?.category_names || {};
      for (const [categoryName, rawCount] of Object.entries(categoryFacetCounts)) {
        const productCount = Number(rawCount || 0);
        const safeCategoryName = String(categoryName || '').trim();
        if (!safeCategoryName || productCount < minProducts) continue;

        const categorySlug = slugify(safeCategoryName);
        const comboPath = `${vehiclePath}/${categorySlug}`;
        pushRoute({
          path: comboPath,
          url: `${SITE_URL}${comboPath}`,
          route_type: 'vehicle-category',
          title: `${safeCategoryName} para ${vehicle.name} | Pecas e Acessorios Toyota | ${SITE_NAME}`,
          description: `Encontre ${safeCategoryName.toLowerCase()} para Toyota ${vehicle.name} com ${productCount} produto${productCount === 1 ? '' : 's'} disponive${productCount === 1 ? 'l' : 'is'} na ${SITE_NAME}.`,
          h1: `${safeCategoryName} para ${vehicle.name}`,
          category_name: safeCategoryName,
          model_name: vehicle.name,
          model_slug: vehicle.slug,
          model_facet_value: vehicle.facetValue,
          product_count: productCount,
          depth: 2,
          breadcrumb: ['Pecas', vehicle.name, safeCategoryName],
          breadcrumb_items: [
            { name: 'Home', url: '/' },
            { name: 'Pecas', url: '/pecas' },
            { name: vehicle.name, url: vehiclePath },
            { name: safeCategoryName, url: comboPath },
          ],
        });
      }
    } catch (err: any) {
      console.warn(`[Snapshot] Vehicle category discovery failed for ${vehicle.name}:`, err.message);
    }
  }

  const visit = (node: CategoryNode, ancestors: CategoryNode[] = []) => {
    if (!node || node.is_active === false) return;
    const categoryId = String(node.id);
    const productCount = Number(facetCounts[categoryId] || 0);
    const lineage = [...ancestors, node];
    const depth = lineage.length;
    if (depth > maxDepth) return;

    if (productCount >= minProducts) {
      const path = `/${lineage.map((entry) => slugify(entry.name)).join('/')}`;
      const breadcrumb = lineage.map((entry) => entry.name);
      const titleName = node.name || breadcrumb[breadcrumb.length - 1] || 'Categoria';
      pushRoute({
        path,
        url: `${SITE_URL}${path}`,
        route_type: depth === 1 ? 'department' : depth === 2 ? 'subcategory' : 'leaf',
        title: `${titleName} | Pecas e Acessorios Toyota | ${SITE_NAME}`,
        description: `Explore ${titleName} na Toyoparts com ${productCount} produto${productCount === 1 ? '' : 's'} relacionados em estoque.`,
        h1: titleName,
        category_id: categoryId,
        category_name: titleName,
        product_count: productCount,
        depth,
        breadcrumb,
      });
    }

    for (const child of getChildren(node)) {
      visit(child, lineage);
    }
  };

  for (const node of topCats) visit(node, []);

  routes.sort((a, b) => {
    if (a.requested !== b.requested) return a.requested ? -1 : 1;
    if (a.route_type !== b.route_type) {
      const order: Record<SnapshotRouteType, number> = { home: 0, static: 1, vehicle: 2, 'vehicle-category': 3, department: 4, subcategory: 5, leaf: 6 };
      return order[a.route_type] - order[b.route_type];
    }
    if (b.product_count !== a.product_count) return b.product_count - a.product_count;
    return a.path.localeCompare(b.path, 'pt-BR');
  });

  const routePaths = new Set(routes.map((route) => route.path));
  const unmatchedRequested = requestedPaths.size > 0
    ? Array.from(requestedPaths).filter((path) => !routePaths.has(path))
    : [];

  return {
    routes,
    summary: {
      total_routes: routes.length,
      category_routes: routes.filter((route) => route.category_id).length,
      vehicle_routes: routes.filter((route) => route.route_type === 'vehicle').length,
      vehicle_category_routes: routes.filter((route) => route.route_type === 'vehicle-category').length,
      static_routes: routes.filter((route) => route.route_type === 'static' || route.route_type === 'home').length,
      requested_urls: requestedPaths.size,
      requested_matches: routes.filter((route) => route.requested).length,
      unmatched_requested: unmatchedRequested.length,
      fresh_snapshots: routes.filter((route) => route.snapshot_status === 'fresh').length,
      stale_snapshots: routes.filter((route) => route.snapshot_status === 'stale').length,
      missing_snapshots: routes.filter((route) => route.snapshot_status === 'missing').length,
    },
    unmatched_requested_paths: unmatchedRequested,
  };
}

// ─── Product JSON-LD ────────────────────────────────────────────────────────

function buildProductJsonLd(product: any) {
  const name = product.seo_title || product.name;
  const urlKey = product.url_key || slugify(product.name || '');
  const url = `${SITE_URL}/produto/${product.sku}/${urlKey}`;
  const price = product.special_price && product.special_price < product.price
    ? product.special_price
    : product.price;
  const inStock = product.in_stock !== false;

  const ld: any = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name,
    sku: product.sku,
    description: (product.description || product.short_description || '')
      .replace(/<[^>]*>/g, '').slice(0, 500),
    brand: { '@type': 'Brand', name: 'Toyota' },
    offers: {
      '@type': 'Offer',
      price: Number(price).toFixed(2),
      priceCurrency: 'BRL',
      availability: inStock
        ? 'https://schema.org/InStock'
        : 'https://schema.org/OutOfStock',
      seller: { '@type': 'Organization', name: SITE_NAME },
      url,
    },
  };

  if (product.image_url) ld.image = product.image_url;

  if (product.modelo_label) {
    ld.isRelatedTo = {
      '@type': 'Vehicle',
      brand: { '@type': 'Brand', name: 'Toyota' },
      model: product.modelo_label,
    };
  }

  return ld;
}

function buildBreadcrumbJsonLd(items: { name: string; url: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, idx) => ({
      '@type': 'ListItem',
      position: idx + 1,
      name: item.name,
      item: `${SITE_URL}${item.url}`,
    })),
  };
}

function buildOrganizationJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'AutoPartsStore',
    name: SITE_NAME,
    url: SITE_URL,
    description: 'Pecas e acessorios genuinos Toyota. Hilux, Corolla, SW4, Yaris, Etios, RAV4, Prius e Corolla Cross.',
    logo: `${SITE_URL}/pub/media/logo/toyoparts-logo.png`,
    contactPoint: {
      '@type': 'ContactPoint',
      contactType: 'customer service',
      availableLanguage: 'Portuguese',
    },
  };
}

// ─── HTML Template: Product ─────────────────────────────────────────────────

function renderProductHtml(product: any): string {
  const title = product.seo_title || product.name || 'Produto';
  const fullTitle = `${title} | ${SITE_NAME}`;
  const description = product.meta_description
    || product.short_description
    || `Compre ${product.name} na Toyoparts. Peca genuina Toyota com garantia.`;
  const urlKey = product.url_key || slugify(product.name || '');
  const canonical = `${SITE_URL}/produto/${product.sku}/${urlKey}`;
  const image = product.image_url || `${SITE_URL}/pub/media/logo/toyoparts-logo.png`;
  const price = product.special_price && product.special_price < product.price
    ? product.special_price
    : product.price;
  const inStock = product.in_stock !== false;
  const cleanDesc = (product.description || '').replace(/<[^>]*>/g, '').trim();

  // Breadcrumbs
  const breadcrumbs = [
    { name: 'Home', url: '/' },
    { name: 'Pecas', url: '/pecas' },
  ];
  if (product.modelo_label) {
    breadcrumbs.push({ name: product.modelo_label, url: `/pecas/${slugify(product.modelo_label)}` });
  }
  breadcrumbs.push({ name: product.name, url: `/produto/${product.sku}/${urlKey}` });

  const productJsonLd = buildProductJsonLd(product);
  const breadcrumbJsonLd = buildBreadcrumbJsonLd(breadcrumbs);
  const orgJsonLd = buildOrganizationJsonLd();

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(fullTitle)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  <meta name="robots" content="index,follow">
  <link rel="canonical" href="${canonical}">

  <!-- Open Graph -->
  <meta property="og:type" content="product">
  <meta property="og:title" content="${escapeHtml(fullTitle)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:image" content="${escapeHtml(image)}">
  <meta property="og:image:width" content="800">
  <meta property="og:image:height" content="600">
  <meta property="og:url" content="${canonical}">
  <meta property="og:site_name" content="${SITE_NAME}">
  <meta property="og:locale" content="pt_BR">
  <meta property="product:price:amount" content="${Number(price).toFixed(2)}">
  <meta property="product:price:currency" content="BRL">

  <!-- Twitter -->
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeHtml(fullTitle)}">
  <meta name="twitter:description" content="${escapeHtml(description)}">
  <meta name="twitter:image" content="${escapeHtml(image)}">

  <!-- JSON-LD Structured Data -->
  <script type="application/ld+json">${JSON.stringify(productJsonLd)}</script>
  <script type="application/ld+json">${JSON.stringify(breadcrumbJsonLd)}</script>
  <script type="application/ld+json">${JSON.stringify(orgJsonLd)}</script>

  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 0; color: #1a1a2e; background: #fff; }
    .container { max-width: 1200px; margin: 0 auto; padding: 24px 16px; }
    .breadcrumb { display: flex; gap: 8px; font-size: 12px; color: #666; margin-bottom: 24px; flex-wrap: wrap; }
    .breadcrumb a { color: #2563eb; text-decoration: none; }
    .breadcrumb span { color: #999; }
    .product-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; }
    @media (max-width: 768px) { .product-grid { grid-template-columns: 1fr; } }
    .product-image { width: 100%; max-width: 500px; border-radius: 12px; border: 1px solid #e5e7eb; }
    .product-title { font-size: 24px; font-weight: 700; margin: 0 0 8px; line-height: 1.3; }
    .product-sku { font-size: 12px; color: #666; font-family: monospace; }
    .product-price { font-size: 28px; font-weight: 800; color: #16a34a; margin: 16px 0; }
    .product-stock { display: inline-flex; align-items: center; gap: 6px; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 600; }
    .in-stock { background: #dcfce7; color: #15803d; }
    .out-stock { background: #fee2e2; color: #dc2626; }
    .product-desc { font-size: 14px; color: #374151; line-height: 1.7; margin-top: 16px; }
    .compat { margin-top: 16px; padding: 12px; background: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0; }
    .compat-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: #64748b; font-weight: 600; margin-bottom: 4px; }
    .compat-value { font-size: 14px; font-weight: 600; color: #1e293b; }
    .cta-btn { display: inline-block; padding: 14px 32px; background: #2563eb; color: #fff; border-radius: 10px; font-size: 16px; font-weight: 700; text-decoration: none; margin-top: 20px; }
    .loading-msg { text-align: center; padding: 60px 20px; color: #666; }
  </style>
</head>
<body>
  <div class="container">
    <!-- Breadcrumbs -->
    <nav class="breadcrumb" aria-label="Breadcrumb">
      ${breadcrumbs.map((b, i) =>
        i < breadcrumbs.length - 1
          ? `<a href="${SITE_URL}${b.url}">${escapeHtml(b.name)}</a><span>/</span>`
          : `<span>${escapeHtml(b.name)}</span>`
      ).join('\n      ')}
    </nav>

    <!-- Product Content (Above the Fold) -->
    <div class="product-grid">
      <div>
        ${product.image_url
          ? `<img class="product-image" src="${escapeHtml(product.image_url)}" alt="${escapeHtml(product.name)}" width="500" height="500" loading="eager">`
          : `<div class="product-image" style="display:flex;align-items:center;justify-content:center;height:400px;background:#f3f4f6;"><span style="color:#9ca3af;font-size:48px;">&#128247;</span></div>`
        }
      </div>
      <div>
        <h1 class="product-title">${escapeHtml(product.name)}</h1>
        <p class="product-sku">SKU: ${escapeHtml(product.sku)}</p>
        
        <p class="product-price">${formatPrice(price)}</p>
        ${product.special_price && product.special_price < product.price
          ? `<p style="font-size:14px;color:#9ca3af;text-decoration:line-through;">De: ${formatPrice(product.price)}</p>`
          : ''
        }

        <span class="product-stock ${inStock ? 'in-stock' : 'out-stock'}">
          ${inStock ? '&#10003; Em estoque' : '&#10007; Indisponivel'}
        </span>

        ${product.modelo_label ? `
        <div class="compat">
          <div class="compat-label">Compatibilidade</div>
          <div class="compat-value">Toyota ${escapeHtml(product.modelo_label)}${product.ano_labels ? ` (${escapeHtml(product.ano_labels)})` : ''}</div>
        </div>
        ` : ''}

        ${cleanDesc ? `<div class="product-desc">${cleanDesc.slice(0, 500)}</div>` : ''}

        <a class="cta-btn" href="${canonical}">Ver produto completo</a>
      </div>
    </div>
  </div>

  <!-- SPA Hydration Notice -->
  <noscript>
    <p class="loading-msg">Este site funciona melhor com JavaScript ativado. <a href="${canonical}">Clique aqui</a> para acessar o produto completo.</p>
  </noscript>

  <!-- 
    NOTA: Em producao, aqui entraria o <script> do bundle SPA (React) 
    para hidratar a pagina. O Cloudflare Worker deve injetar isso.
    Por enquanto, o snapshot serve como HTML estatico para crawlers e previews.
  -->
</body>
</html>`;
}

function buildCollectionJsonLd(route: SnapshotRouteRecord, products: any[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: route.title,
    url: route.url,
    description: route.description,
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: products.length,
      itemListElement: products.map((product, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        url: `${SITE_URL}/produto/${product.sku}/${product.url_key || slugify(product.name || '')}`,
        name: product.name || product.sku,
      })),
    },
  };
}

function renderStaticSnapshotHtml(route: SnapshotRouteRecord): string {
  const breadcrumbItems = route.path === '/'
    ? [{ name: 'Home', url: '/' }]
    : [
        { name: 'Home', url: '/' },
        { name: route.h1, url: route.path },
      ];
  const breadcrumbJsonLd = buildBreadcrumbJsonLd(breadcrumbItems);
  const orgJsonLd = buildOrganizationJsonLd();

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(route.title)}</title>
  <meta name="description" content="${escapeHtml(route.description)}">
  <meta name="robots" content="index,follow">
  <link rel="canonical" href="${route.url}">
  <meta property="og:type" content="website">
  <meta property="og:title" content="${escapeHtml(route.title)}">
  <meta property="og:description" content="${escapeHtml(route.description)}">
  <meta property="og:url" content="${route.url}">
  <meta property="og:site_name" content="${SITE_NAME}">
  <meta property="og:locale" content="pt_BR">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeHtml(route.title)}">
  <meta name="twitter:description" content="${escapeHtml(route.description)}">
  <script type="application/ld+json">${JSON.stringify(breadcrumbJsonLd)}</script>
  <script type="application/ld+json">${JSON.stringify(orgJsonLd)}</script>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; background: #fff; color: #111827; }
    .wrap { max-width: 980px; margin: 0 auto; padding: 40px 16px 56px; }
    .badge { display:inline-flex; align-items:center; gap:8px; padding:8px 12px; border-radius:999px; background:#fff1f2; color:#be123c; font-size:12px; font-weight:700; }
    h1 { font-size: clamp(32px, 5vw, 54px); line-height:1.05; margin:20px 0 14px; letter-spacing:-0.03em; }
    p { font-size: 16px; line-height: 1.7; color: #4b5563; max-width: 720px; }
    .cta { display:inline-flex; margin-top:28px; padding:14px 22px; border-radius:14px; background:#111827; color:#fff; text-decoration:none; font-weight:700; }
  </style>
</head>
<body>
  <main class="wrap">
    <span class="badge">Snapshot SEO</span>
    <h1>${escapeHtml(route.h1)}</h1>
    <p>${escapeHtml(route.description)}</p>
    <a class="cta" href="${route.url}">Abrir pagina completa</a>
  </main>
</body>
</html>`;
}

function renderCategorySnapshotHtml(route: SnapshotRouteRecord, products: any[]): string {
  const breadcrumbItems = route.breadcrumb_items?.length
    ? route.breadcrumb_items
    : [
        { name: 'Home', url: '/' },
        ...route.breadcrumb.map((item, index) => ({
          name: item,
          url: `/${route.breadcrumb.slice(0, index + 1).map((part) => slugify(part)).join('/')}`,
        })),
      ];
  const breadcrumbJsonLd = buildBreadcrumbJsonLd(breadcrumbItems);
  const collectionJsonLd = buildCollectionJsonLd(route, products);
  const orgJsonLd = buildOrganizationJsonLd();
  const snapshotLabel = route.route_type === 'vehicle'
    ? 'Snapshot SEO de Veiculo'
    : route.route_type === 'vehicle-category'
      ? 'Snapshot SEO de Veiculo + Categoria'
      : 'Snapshot SEO de Categoria';
  const contextPills = [
    `${route.product_count} produto${route.product_count === 1 ? '' : 's'} encontrados`,
    'URL canonica pronta para indexacao',
  ];

  if (route.model_name) {
    contextPills.push(`Linha Toyota ${route.model_name}`);
  }

  if (route.route_type === 'vehicle-category' && route.category_name) {
    contextPills.push(`Categoria ${route.category_name}`);
  } else if (route.route_type !== 'vehicle' && route.breadcrumb.length > 0) {
    contextPills.push(`Categoria ${route.breadcrumb.join(' > ')}`);
  }

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(route.title)}</title>
  <meta name="description" content="${escapeHtml(route.description)}">
  <meta name="robots" content="index,follow">
  <link rel="canonical" href="${route.url}">
  <meta property="og:type" content="website">
  <meta property="og:title" content="${escapeHtml(route.title)}">
  <meta property="og:description" content="${escapeHtml(route.description)}">
  <meta property="og:url" content="${route.url}">
  <meta property="og:site_name" content="${SITE_NAME}">
  <meta property="og:locale" content="pt_BR">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeHtml(route.title)}">
  <meta name="twitter:description" content="${escapeHtml(route.description)}">
  <script type="application/ld+json">${JSON.stringify(collectionJsonLd)}</script>
  <script type="application/ld+json">${JSON.stringify(breadcrumbJsonLd)}</script>
  <script type="application/ld+json">${JSON.stringify(orgJsonLd)}</script>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; background: #ffffff; color: #111827; }
    .wrap { max-width: 1180px; margin: 0 auto; padding: 28px 16px 56px; }
    .breadcrumb { display:flex; gap:8px; flex-wrap:wrap; font-size:12px; color:#6b7280; margin-bottom:22px; }
    .breadcrumb a { color:#2563eb; text-decoration:none; }
    .hero { border:1px solid #e5e7eb; border-radius:28px; padding:28px; background:linear-gradient(135deg, #fff6f6 0%, #ffffff 55%, #f9fafb 100%); }
    .eyebrow { display:inline-flex; align-items:center; gap:8px; font-size:11px; font-weight:800; letter-spacing:0.08em; text-transform:uppercase; color:#b91c1c; background:#fee2e2; padding:8px 12px; border-radius:999px; }
    h1 { font-size: clamp(30px, 4.5vw, 52px); line-height:1.02; letter-spacing:-0.04em; margin:18px 0 14px; }
    .lead { max-width:760px; color:#4b5563; font-size:16px; line-height:1.75; margin:0; }
    .meta { display:flex; gap:12px; flex-wrap:wrap; margin-top:22px; }
    .pill { padding:10px 14px; border-radius:999px; background:#fff; border:1px solid #e5e7eb; font-size:13px; color:#374151; }
    .grid { display:grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap:16px; margin-top:28px; }
    .card { display:block; border-radius:20px; border:1px solid #e5e7eb; overflow:hidden; text-decoration:none; color:inherit; background:#fff; }
    .thumb { aspect-ratio: 4/3; width:100%; object-fit:cover; background:#f3f4f6; display:block; }
    .placeholder { aspect-ratio: 4/3; width:100%; background:linear-gradient(135deg, #f3f4f6, #e5e7eb); display:flex; align-items:center; justify-content:center; color:#9ca3af; font-size:32px; }
    .body { padding:16px; }
    .name { font-size:15px; font-weight:700; line-height:1.35; margin:0 0 8px; color:#111827; }
    .price { font-size:18px; font-weight:800; color:#15803d; margin:0; }
    .actions { margin-top:28px; display:flex; gap:12px; flex-wrap:wrap; }
    .btn { display:inline-flex; padding:14px 18px; border-radius:14px; background:#111827; color:#fff; text-decoration:none; font-weight:700; }
    .btn-light { background:#fff; color:#111827; border:1px solid #e5e7eb; }
  </style>
</head>
<body>
  <main class="wrap">
    <nav class="breadcrumb" aria-label="Breadcrumb">
      ${breadcrumbItems.map((item, index) =>
        index < breadcrumbItems.length - 1
          ? `<a href="${SITE_URL}${item.url}">${escapeHtml(item.name)}</a><span>/</span>`
          : `<span>${escapeHtml(item.name)}</span>`
      ).join('')}
    </nav>

    <section class="hero">
      <span class="eyebrow">${escapeHtml(snapshotLabel)}</span>
      <h1>${escapeHtml(route.h1)}</h1>
      <p class="lead">${escapeHtml(route.description)}</p>
      <div class="meta">
        ${contextPills.map((pill) => `<span class="pill">${escapeHtml(pill)}</span>`).join('')}
      </div>
      <div class="actions">
        <a class="btn" href="${route.url}">Abrir pagina completa</a>
        <a class="btn btn-light" href="${route.route_type === 'vehicle'
          ? `${SITE_URL}/busca?modelo=${encodeURIComponent(route.model_name || '')}`
          : route.route_type === 'vehicle-category'
            ? `${SITE_URL}/busca?modelo=${encodeURIComponent(route.model_name || '')}&category_name=${encodeURIComponent(route.category_name || route.h1)}`
            : `${SITE_URL}/busca?category_name=${encodeURIComponent(route.category_name || route.h1)}`}">Ver busca relacionada</a>
      </div>
    </section>

    <section class="grid">
      ${products.map((product) => {
        const urlKey = product.url_key || slugify(product.name || '');
        const productUrl = `${SITE_URL}/produto/${product.sku}/${urlKey}`;
        const price = Number(product.special_price && product.special_price > 0 && product.special_price < product.price ? product.special_price : product.price || 0);
        const image = product.image_url || '';
        return `<a class="card" href="${productUrl}">
          ${image
            ? `<img class="thumb" src="${escapeHtml(image)}" alt="${escapeHtml(product.name || product.sku)}" loading="eager">`
            : `<div class="placeholder">&#128663;</div>`}
          <div class="body">
            <p class="name">${escapeHtml(product.name || product.sku)}</p>
            <p class="price">${formatPrice(price)}</p>
          </div>
        </a>`;
      }).join('')}
    </section>
  </main>
</body>
</html>`;
}

async function fetchProductsForRouteSnapshot(route: SnapshotRouteRecord, limit = 12) {
  if (!meili.isConfigured()) return [];
  try {
    const filters: string[] = ['in_stock = true'];
    let query = '';

    if (route.category_id) {
      filters.push(`category_ids = "${route.category_id}"`);
    }
    if (route.model_facet_value) {
      filters.push(`modelos = "${route.model_facet_value}"`);
    }
    if (route.route_type === 'vehicle-category' && route.category_name) {
      filters.push(`category_names = "${route.category_name}"`);
      query = route.category_name;
    }

    const res = await meili.search(query, {
      limit,
      filter: filters,
    });
    return Array.isArray(res.hits) ? res.hits : [];
  } catch (err: any) {
    console.warn(`[Snapshot] Product fetch for route ${route.path} failed:`, err.message);
    return [];
  }
}

async function generateRouteSnapshot(route: SnapshotRouteRecord, force = false) {
  const cacheKey = `${SNAPSHOT_PREFIX}category:${route.path}`;
  if (!force) {
    const existing = await kv.get(cacheKey).catch(() => null);
    if (existing?.generated_at) {
      const age = Date.now() - new Date(existing.generated_at).getTime();
      if (age < 86400000) {
        return { status: 'skipped', generated_at: existing.generated_at, html: existing.html };
      }
    }
  }

  const html = route.route_type === 'static' || route.route_type === 'home'
    ? renderStaticSnapshotHtml(route)
    : renderCategorySnapshotHtml(route, await fetchProductsForRouteSnapshot(route, 12));

  const payload = {
    type: route.route_type,
    path: route.path,
    category_id: route.category_id || null,
    product_count: route.product_count,
    generated_at: new Date().toISOString(),
    html,
  };

  await kv.set(cacheKey, payload);
  return { status: 'generated', generated_at: payload.generated_at, html };
}

// ─── GET /snapshot/product/:sku — Gera ou retorna snapshot HTML ──────────────

app.get('/product/:sku', async (c) => {
  const sku = c.req.param('sku');
  
  try {
    // 1. Tentar buscar snapshot existente do KV (cache)
    const cacheKey = `${SNAPSHOT_PREFIX}product:${sku}`;
    const cached = await kv.get(cacheKey);
    
    if (cached && cached.html && cached.generated_at) {
      const age = Date.now() - new Date(cached.generated_at).getTime();
      // Cache valido por 24h
      if (age < 86400000) {
        return c.html(cached.html, 200, {
          'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=604800',
          'X-Snapshot': 'HIT',
          'X-Snapshot-Age': String(Math.round(age / 1000)),
        });
      }
    }

    // 2. Buscar produto do KV
    const product = await kv.get(`product:${sku}`);
    if (!product) {
      return c.html(`<html><head><title>Produto nao encontrado | ${SITE_NAME}</title><meta name="robots" content="noindex"></head><body><h1>Produto nao encontrado</h1></body></html>`, 404, {
        'X-Snapshot': 'MISS_404',
      });
    }

    // 3. Extrair dados relevantes
    const productData = extractProductData(product);

    // 4. Gerar HTML
    const html = renderProductHtml(productData);

    // 5. Cachear no KV
    await kv.set(cacheKey, {
      html,
      sku,
      generated_at: new Date().toISOString(),
    });

    console.log(`[Snapshot] Gerado snapshot para produto ${sku}`);

    return c.html(html, 200, {
      'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=604800',
      'X-Snapshot': 'MISS_GENERATED',
    });

  } catch (err: any) {
    console.error(`[Snapshot] Erro ao gerar snapshot para ${sku}:`, err.message);
    return c.json({ error: err.message }, 500);
  }
});

// ─── POST /snapshot/invalidate — Invalida snapshot(s) ───────────────────────

app.post('/invalidate', async (c) => {
  try {
    const body = await c.req.json();
    const { sku, skus, regenerate } = body;

    const skuList = skus || (sku ? [sku] : []);
    if (skuList.length === 0) {
      return c.json({ error: 'Informe sku ou skus[]' }, 400);
    }

    const results: { sku: string; status: string }[] = [];

    for (const s of skuList) {
      const cacheKey = `${SNAPSHOT_PREFIX}product:${s}`;
      try {
        await kv.del(cacheKey);
        results.push({ sku: s, status: 'invalidated' });
        console.log(`[Snapshot] Invalidado: ${s}`);
      } catch (e: any) {
        results.push({ sku: s, status: `error: ${e.message}` });
      }
    }

    // Opcional: regenerar imediatamente
    if (regenerate) {
      for (const s of skuList) {
        try {
          const product = await kv.get(`product:${s}`);
          if (product) {
            const productData = extractProductData(product);
            const html = renderProductHtml(productData);
            await kv.set(`${SNAPSHOT_PREFIX}product:${s}`, {
              html,
              sku: s,
              generated_at: new Date().toISOString(),
            });
            console.log(`[Snapshot] Regenerado: ${s}`);
          }
        } catch (e: any) {
          console.error(`[Snapshot] Erro ao regenerar ${s}:`, e.message);
        }
      }
    }

    return c.json({ invalidated: skuList.length, results, regenerated: !!regenerate });

  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// ─── GET /snapshot/stats — Status dos snapshots ──────────────────────────────

app.get('/stats', async (c) => {
  try {
    const snapshots = await kv.getByPrefix(SNAPSHOT_PREFIX);
    const total = snapshots?.length || 0;

    let oldest: string | null = null;
    let newest: string | null = null;

    for (const snap of (snapshots || [])) {
      const val = snap?.value || snap;
      if (val?.generated_at) {
        if (!oldest || val.generated_at < oldest) oldest = val.generated_at;
        if (!newest || val.generated_at > newest) newest = val.generated_at;
      }
    }

    return c.json({
      total_snapshots: total,
      oldest_snapshot: oldest,
      newest_snapshot: newest,
      cache_ttl_hours: 24,
    });
  } catch (err: any) {
    return c.json({ error: err.message, total_snapshots: 0 }, 500);
  }
});

// ─── POST /snapshot/generate-batch — Gerar snapshots em lote ─────────────────

app.post('/generate-batch', async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const limit = Math.min(body.limit || 50, 200);
    const forceRegenerate = body.force === true;

    // Cursor-based: pass `after_key` to paginate without loading all products
    const afterKey = body.after_key || null;

    let query = supabase
      .from('kv_store_1d6e33e0')
      .select('key, value')
      .like('key', 'product:%')
      .order('key')
      .limit(limit);

    if (afterKey) {
      query = query.gt('key', afterKey);
    }

    const { data: products, error } = await query;

    if (error) throw new Error(`DB error: ${error.message}`);
    if (!products || products.length === 0) {
      return c.json({ message: 'Nenhum produto restante', generated: 0, done: true });
    }

    let generated = 0;
    let skipped = 0;
    let errors = 0;
    const lastKey = products[products.length - 1]?.key || null;

    for (const row of products) {
      const product = row.value;
      if (!product?.sku) { skipped++; continue; }

      const cacheKey = `${SNAPSHOT_PREFIX}product:${product.sku}`;

      // Skip if already cached (less than 24h) unless force
      if (!forceRegenerate) {
        const existing = await kv.get(cacheKey);
        if (existing?.generated_at) {
          const age = Date.now() - new Date(existing.generated_at).getTime();
          if (age < 86400000) { skipped++; continue; }
        }
      }

      try {
        const productData = extractProductData(product);
        const html = renderProductHtml(productData);
        await kv.set(cacheKey, { html, sku: product.sku, generated_at: new Date().toISOString() });
        generated++;
      } catch (e: any) {
        errors++;
        console.error(`[Snapshot Batch] Erro para ${product.sku}: ${e.message}`);
      }
    }

    const hasMore = products.length >= limit;
    console.log(`[Snapshot Batch] Gerados: ${generated}, Skipped: ${skipped}, Erros: ${errors}, hasMore: ${hasMore}`);
    return c.json({
      generated, skipped, errors,
      total_processed: products.length,
      done: !hasMore,
      next_after_key: hasMore ? lastKey : null,
    });

  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// ─── POST /snapshot/generate-all — Regenerar TODOS via steps (cursor paginado) ─
// Inicia um job que vai rodando por steps, salvando progresso no KV.
// O frontend chama POST /generate-all/step repetidamente até done=true.

const SSG_JOB_KEY = 'meta:ssg_job';

app.post('/generate-all', async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const force = body.force === true;
    const batchSize = Math.min(body.batch_size || 100, 200);

    // Count total products
    const { count, error: cntErr } = await supabase
      .from('kv_store_1d6e33e0')
      .select('*', { count: 'exact', head: true })
      .like('key', 'product:%');

    if (cntErr) throw new Error(`Count error: ${cntErr.message}`);

    const job = {
      status: 'running',
      started_at: new Date().toISOString(),
      total_products: count || 0,
      processed: 0,
      generated: 0,
      skipped: 0,
      errors: 0,
      force,
      batch_size: batchSize,
      next_after_key: null as string | null,
      done: false,
    };
    await kv.set(SSG_JOB_KEY, job);

    console.log(`[SSG] Job iniciado: ${count} produtos, batch=${batchSize}, force=${force}`);
    return c.json({ message: 'Job SSG iniciado — chame POST /generate-all/step em loop', ...job });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

app.post('/generate-all/step', async (c) => {
  try {
    const job = await kv.get(SSG_JOB_KEY);
    if (!job || job.status !== 'running') {
      return c.json({ error: 'Nenhum job SSG em andamento. Inicie com POST /generate-all', status: job?.status || 'idle' }, 400);
    }

    if (job.done) {
      return c.json({ message: 'Job já concluído', ...job });
    }

    const batchSize = job.batch_size || 100;
    let query = supabase
      .from('kv_store_1d6e33e0')
      .select('key, value')
      .like('key', 'product:%')
      .order('key')
      .limit(batchSize);

    if (job.next_after_key) {
      query = query.gt('key', job.next_after_key);
    }

    const { data: products, error } = await query;
    if (error) throw new Error(`DB error: ${error.message}`);

    if (!products || products.length === 0) {
      // Done!
      const completed = {
        ...job,
        status: 'completed',
        done: true,
        completed_at: new Date().toISOString(),
        elapsed_seconds: Math.round((Date.now() - new Date(job.started_at).getTime()) / 1000),
      };
      await kv.set(SSG_JOB_KEY, completed);
      console.log(`[SSG] Job concluído: ${completed.generated} gerados, ${completed.skipped} skipped, ${completed.errors} erros`);
      return c.json(completed);
    }

    let generated = 0;
    let skipped = 0;
    let errors = 0;

    for (const row of products) {
      const product = row.value;
      if (!product?.sku) { skipped++; continue; }

      const cacheKey = `${SNAPSHOT_PREFIX}product:${product.sku}`;

      if (!job.force) {
        const existing = await kv.get(cacheKey);
        if (existing?.generated_at) {
          const age = Date.now() - new Date(existing.generated_at).getTime();
          if (age < 86400000) { skipped++; continue; }
        }
      }

      try {
        const productData = extractProductData(product);
        const html = renderProductHtml(productData);
        await kv.set(cacheKey, { html, sku: product.sku, generated_at: new Date().toISOString() });
        generated++;
      } catch (e: any) {
        errors++;
        console.error(`[SSG Step] Erro ${product.sku}: ${e.message}`);
      }
    }

    const lastKey = products[products.length - 1]?.key || null;
    const hasMore = products.length >= batchSize;

    const updated = {
      ...job,
      processed: job.processed + products.length,
      generated: job.generated + generated,
      skipped: job.skipped + skipped,
      errors: job.errors + errors,
      next_after_key: hasMore ? lastKey : null,
      done: !hasMore,
      status: hasMore ? 'running' : 'completed',
      ...(hasMore ? {} : { completed_at: new Date().toISOString() }),
      elapsed_seconds: Math.round((Date.now() - new Date(job.started_at).getTime()) / 1000),
      progress: job.total_products > 0 ? Math.round(((job.processed + products.length) / job.total_products) * 100) : 0,
    };
    await kv.set(SSG_JOB_KEY, updated);

    console.log(`[SSG Step] batch=${products.length}, gen=${generated}, skip=${skipped}, err=${errors}, progress=${updated.progress}%`);
    return c.json(updated);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

app.get('/generate-all/status', async (c) => {
  try {
    const job = await kv.get(SSG_JOB_KEY);
    return c.json(job || { status: 'idle' });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// ─── GET /snapshot/manifest — Lista todas as URLs de snapshots para SW ────────

app.get('/manifest', async (c) => {
  try {
    const snapshots = await kv.getByPrefix(SNAPSHOT_PREFIX);
    const urls: { sku: string; url: string; generated_at: string }[] = [];

    for (const snap of (snapshots || [])) {
      const val = snap?.value || snap;
      if (val?.sku && val?.generated_at) {
        urls.push({
          sku: val.sku,
          url: `/produto/${val.sku}`,
          generated_at: val.generated_at,
        });
      }
    }

    return c.json({
      total: urls.length,
      generated_at: new Date().toISOString(),
      urls,
    });
  } catch (err: any) {
    return c.json({ error: err.message, total: 0, urls: [] }, 500);
  }
});

// ─── DELETE /snapshot/purge — Limpa TODOS os snapshots ───────────────────────

app.post('/categories/discover', async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const rawUrls = String(body.urls || '')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    const data = await discoverCategorySnapshotRoutes({
      urls: rawUrls,
      minProducts: body.minProducts || 1,
      maxDepth: body.maxDepth || 3,
      includeStatic: body.includeStatic !== false,
    });

    return c.json({ ok: true, ...data });
  } catch (err: any) {
    return c.json({ error: err.message, ok: false }, 500);
  }
});

app.post('/categories/generate', async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const rawUrls = String(body.urls || '')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    const discovery = await discoverCategorySnapshotRoutes({
      urls: rawUrls,
      minProducts: body.minProducts || 1,
      maxDepth: body.maxDepth || 3,
      includeStatic: body.includeStatic !== false,
    });

    const requestedOnly = body.onlyRequested === true && rawUrls.length > 0;
    const force = body.force === true;
    const candidates = requestedOnly
      ? discovery.routes.filter((route) => route.requested)
      : discovery.routes;
    const limit = Math.max(1, Math.min(Number(body.limit || candidates.length || 50), 500));
    const selected = candidates.slice(0, limit);

    const results: Array<{ path: string; route_type: SnapshotRouteType; status: string; generated_at: string | null; product_count: number }> = [];
    let generated = 0;
    let skipped = 0;
    let errors = 0;

    for (const route of selected) {
      try {
        const result = await generateRouteSnapshot(route, force);
        if (result.status === 'generated') generated += 1;
        else skipped += 1;
        results.push({
          path: route.path,
          route_type: route.route_type,
          status: result.status,
          generated_at: result.generated_at || null,
          product_count: route.product_count,
        });
      } catch (err: any) {
        errors += 1;
        results.push({
          path: route.path,
          route_type: route.route_type,
          status: `error: ${err.message}`,
          generated_at: null,
          product_count: route.product_count,
        });
      }
    }

    return c.json({
      ok: true,
      processed: selected.length,
      generated,
      skipped,
      errors,
      total_discovered: discovery.routes.length,
      requested_matches: discovery.summary.requested_matches,
      unmatched_requested_paths: discovery.unmatched_requested_paths,
      results,
    });
  } catch (err: any) {
    return c.json({ error: err.message, ok: false }, 500);
  }
});

app.get('/categories/manifest', async (c) => {
  try {
    const snapshots = await kv.getByPrefix(`${SNAPSHOT_PREFIX}category:`).catch(() => []);
    const routes = (snapshots || [])
      .map((entry: any) => {
        const value = entry?.value || entry;
        return {
          path: value?.path || entry?.key?.replace(`${SNAPSHOT_PREFIX}category:`, ''),
          route_type: value?.type || 'category',
          category_id: value?.category_id || null,
          product_count: Number(value?.product_count || 0),
          generated_at: value?.generated_at || null,
        };
      })
      .filter((item: any) => !!item.path)
      .sort((a: any, b: any) => (b.generated_at || '').localeCompare(a.generated_at || ''));

    return c.json({ ok: true, total: routes.length, routes });
  } catch (err: any) {
    return c.json({ error: err.message, ok: false, total: 0, routes: [] }, 500);
  }
});

app.get('/category/*', async (c) => {
  const wildcard = c.req.param('*') || '';
  const path = normalizeRoutePath(`/${wildcard}`);

  try {
    const cacheKey = `${SNAPSHOT_PREFIX}category:${path}`;
    const cached = await kv.get(cacheKey).catch(() => null);
    if (cached?.html) {
      return c.html(cached.html, 200, {
        'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=604800',
        'X-Snapshot': 'CATEGORY_HIT',
      });
    }

    const discovery = await discoverCategorySnapshotRoutes({ includeStatic: true });
    const route = discovery.routes.find((item) => item.path === path);
    if (!route) {
      return c.html(`<html><head><title>Pagina nao encontrada | ${SITE_NAME}</title><meta name="robots" content="noindex"></head><body><h1>Pagina nao encontrada</h1></body></html>`, 404, {
        'X-Snapshot': 'CATEGORY_404',
      });
    }

    const generated = await generateRouteSnapshot(route, true);
    return c.html(generated.html, 200, {
      'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=604800',
      'X-Snapshot': 'CATEGORY_GENERATED',
    });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

app.delete('/purge', async (c) => {
  try {
    const snapshots = await kv.getByPrefix(SNAPSHOT_PREFIX);
    const keys = (snapshots || [])
      .map((s: any) => s?.key)
      .filter(Boolean);

    if (keys.length === 0) return c.json({ purged: 0 });

    // Delete in batches of 50
    for (let i = 0; i < keys.length; i += 50) {
      const batch = keys.slice(i, i + 50);
      await kv.mdel(batch);
    }

    console.log(`[Snapshot] Purged ${keys.length} snapshots`);
    return c.json({ purged: keys.length });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

export { app as snapshotGenerator };
