import { projectId, publicAnonKey } from '../../../utils/supabase/info';
import type {
  HomeConfigResolvedPayload,
  HomeConfigResolvedProduct,
  HomeConfigResolvedSection,
  HomePageConfig,
} from './home-config';

const API = `https://${projectId}.supabase.co/functions/v1/make-server-1d6e33e0`;
const HEADERS: HeadersInit = {
  Authorization: `Bearer ${publicAnonKey}`,
  apikey: publicAnonKey,
  'Content-Type': 'application/json',
};
const searchProductsRequestCache = new Map<string, Promise<any[]>>();
const intelligenceProductsRequestCache = new Map<string, Promise<any[]>>();
const HOME_INTELLIGENCE_TIMEOUT_MS = 1_500;

type LegacyHomeSectionConfig = {
  enabled?: boolean;
  limit?: number;
  mode?: 'manual' | 'manual_first' | 'rule' | string;
  rule?: string;
  manualSkus?: string[];
  source?: string;
  sort?: string;
  pinnedSkus?: string[];
  excludedSkus?: string[];
  ruleGroups?: Array<{
    conditions?: Array<{
      type?: string;
      values?: string[];
      minPrice?: number | null;
      maxPrice?: number | null;
    }>;
  }>;
};

type HomeSectionKey = 'offers' | 'popular' | 'newArrivals';
const HOME_POPULAR_MIN_PRODUCTS = 15;

type ResolverCache = {
  skuHits: Map<string, Promise<any | null>>;
  candidatePools: Map<string, Promise<any[]>>;
};

function createResolverCache(): ResolverCache {
  return {
    skuHits: new Map(),
    candidatePools: new Map(),
  };
}

function normalizeSkuList(value: unknown) {
  const list = Array.isArray(value) ? value : [];
  return Array.from(
    new Set(
      list
        .map((item) => String(item || '').trim().toUpperCase())
        .filter(Boolean),
    ),
  );
}

function hasPromotion(product: any) {
  const price = Number(product?.price || 0);
  const special = Number(product?.special_price || 0);
  return price > 0 && special > 0 && special < price;
}

function matchesHomeRuleCondition(product: any, condition: any) {
  const type = String(condition?.type || '').trim();
  const values = Array.isArray(condition?.values)
    ? condition.values.map((value: any) => String(value || '').trim()).filter(Boolean)
    : [];
  const categoryNames = Array.isArray(product?.category_names)
    ? product.category_names.map((value: any) => String(value || '').trim().toLowerCase())
    : [];
  const categoryIds = Array.isArray(product?.category_ids)
    ? product.category_ids.map((value: any) => String(value || '').trim())
    : [];
  const sku = String(product?.sku || '').trim().toUpperCase();
  const price = Number(product?.price || 0);

  switch (type) {
    case 'in_stock':
      return product?.in_stock !== false;
    case 'has_promotion':
      return hasPromotion(product);
    case 'category_in':
      return values.some((value) => {
        const normalized = value.toLowerCase();
        return categoryNames.includes(normalized) || categoryIds.includes(value);
      });
    case 'category_not_in':
      return values.every((value) => {
        const normalized = value.toLowerCase();
        return !categoryNames.includes(normalized) && !categoryIds.includes(value);
      });
    case 'price_range': {
      const min = condition?.minPrice != null ? Number(condition.minPrice) : null;
      const max = condition?.maxPrice != null ? Number(condition.maxPrice) : null;
      if (min != null && Number.isFinite(min) && price < min) return false;
      if (max != null && Number.isFinite(max) && price > max) return false;
      return true;
    }
    case 'sku_in':
      return values.map((value) => value.toUpperCase()).includes(sku);
    case 'sku_not_in':
      return !values.map((value) => value.toUpperCase()).includes(sku);
    default:
      return true;
  }
}

function matchesHomeRuleGroups(product: any, groups: LegacyHomeSectionConfig['ruleGroups']) {
  if (!Array.isArray(groups) || groups.length === 0) return true;
  return groups.some((group) => {
    const conditions = Array.isArray(group?.conditions) ? group.conditions : [];
    if (conditions.length === 0) return true;
    return conditions.every((condition) => matchesHomeRuleCondition(product, condition));
  });
}

function sortHomeProducts(products: any[], sort: string | undefined) {
  const next = [...products];
  next.sort((a, b) => {
    if (sort === 'price_desc') return Number(b?.price || 0) - Number(a?.price || 0);
    if (sort === 'price_asc') return Number(a?.price || 0) - Number(b?.price || 0);
    if (sort === 'discount_desc') {
      const aDiscount = hasPromotion(a) ? Number(a.price || 0) - Number(a.special_price || 0) : 0;
      const bDiscount = hasPromotion(b) ? Number(b.price || 0) - Number(b.special_price || 0) : 0;
      return bDiscount - aDiscount;
    }
    if (sort === 'newest_desc') {
      return String(b?.created_at || '').localeCompare(String(a?.created_at || ''));
    }
    const aScore = Number(a?._intelligence?.score || 0);
    const bScore = Number(b?._intelligence?.score || 0);
    return bScore - aScore;
  });
  return next;
}

function getSectionDefaults(sectionKey: HomeSectionKey) {
  if (sectionKey === 'offers') {
    return { limit: 10, source: 'top_promotions', sort: 'intelligence_rank' };
  }
  if (sectionKey === 'popular') {
    return { limit: HOME_POPULAR_MIN_PRODUCTS, source: 'top_searched', sort: 'intelligence_rank' };
  }
  return { limit: 10, source: 'catalog', sort: 'newest_desc' };
}

function normalizeHomeSectionConfig(section: unknown, sectionKey: HomeSectionKey) {
  const defaults = getSectionDefaults(sectionKey);
  const raw = (section && typeof section === 'object' ? section : {}) as LegacyHomeSectionConfig;
  const pinnedSkus = normalizeSkuList(raw.pinnedSkus?.length ? raw.pinnedSkus : raw.manualSkus);
  const legacyMode = raw.mode === 'manual' || raw.mode === 'manual_first' || raw.mode === 'rule'
    ? raw.mode
    : undefined;
  const requestedSource = raw.source
    || (legacyMode === 'manual'
      ? 'manual_only'
      : raw.rule === 'search_promotions'
        ? 'top_promotions'
        : raw.rule === 'search_top'
          ? 'top_searched'
          : raw.rule === 'newest'
            ? 'catalog'
            : defaults.source);
  const shouldAutoFillPopular = sectionKey === 'popular' && requestedSource === 'manual_only';
  const source = requestedSource === 'manual_only' && (pinnedSkus.length === 0 || shouldAutoFillPopular)
    ? defaults.source
    : requestedSource;

  const sort = raw.sort
    || (raw.rule === 'price_desc'
      ? 'price_desc'
      : raw.rule === 'newest'
        ? 'newest_desc'
        : defaults.sort);

  const inferredMode = shouldAutoFillPopular ? 'rule' : (legacyMode || (source === 'manual_only' ? 'manual' : 'rule'));
  const mode = inferredMode === 'manual' && pinnedSkus.length === 0
    ? 'rule'
    : inferredMode;

  return {
    enabled: raw.enabled !== false,
    limit: sectionKey === 'popular'
      ? Math.max(HOME_POPULAR_MIN_PRODUCTS, Math.min(Number(raw.limit || defaults.limit || HOME_POPULAR_MIN_PRODUCTS), 24))
      : Math.max(1, Math.min(Number(raw.limit || defaults.limit || 10), 24)),
    mode,
    source,
    sort,
    pinnedSkus,
    excludedSkus: normalizeSkuList(raw.excludedSkus),
    ruleGroups: Array.isArray(raw.ruleGroups) ? raw.ruleGroups : [],
  };
}

async function fetchSearchProducts(params: Record<string, string>) {
  const query = new URLSearchParams(params);
  const cacheKey = query.toString();
  if (!searchProductsRequestCache.has(cacheKey)) {
    searchProductsRequestCache.set(
      cacheKey,
      (async () => {
        const response = await fetch(`${API}/search?${cacheKey}`, { headers: HEADERS });
        if (!response.ok) {
          throw new Error(`Home merchandising search failed (${response.status})`);
        }
        const data = await response.json().catch(() => ({}));
        return Array.isArray(data?.hits) ? data.hits : [];
      })().catch((error) => {
        searchProductsRequestCache.delete(cacheKey);
        throw error;
      }),
    );
  }
  return searchProductsRequestCache.get(cacheKey) as Promise<any[]>;
}

async function fetchIntelligenceHomeProducts(limit: number, promotionsOnly: boolean) {
  const query = new URLSearchParams({
    limit: String(Math.min(Math.max(limit, 15), 50)),
      days: '30',
      hydrate: 'true',
      ranking: 'search',
      cachedOnly: 'true',
    });
  const cacheKey = `${query.toString()}:promo=${promotionsOnly ? '1' : '0'}`;

  if (!intelligenceProductsRequestCache.has(cacheKey)) {
    intelligenceProductsRequestCache.set(
      cacheKey,
      (async () => {
        const controller = new AbortController();
        const timeout = window.setTimeout(() => controller.abort(), HOME_INTELLIGENCE_TIMEOUT_MS);
        try {
          const response = await fetch(`${API}/si/intelligence/top-products?${query.toString()}`, {
            headers: HEADERS,
            signal: controller.signal,
          });
          if (!response.ok) return [];
          const data = await response.json().catch(() => ({}));
          const hits = promotionsOnly && Array.isArray(data?.promotional_hits) && data.promotional_hits.length > 0
            ? data.promotional_hits
            : Array.isArray(data?.hits)
              ? data.hits
              : [];
          return hits.filter(Boolean);
        } catch {
          return [];
        } finally {
          window.clearTimeout(timeout);
        }
      })(),
    );
  }

  return intelligenceProductsRequestCache.get(cacheKey) as Promise<any[]>;
}

async function fetchTopHomeProducts(limit: number, promotionsOnly: boolean, preferIntelligence = false) {
  const catalogPromise = fetchSearchProducts({
    limit: String(Math.min(Math.max(limit, 24), 50)),
    sort: promotionsOnly ? 'price:desc' : 'created_at:desc',
    inStock: 'true',
  });
  const intelligencePromise = preferIntelligence
    ? fetchIntelligenceHomeProducts(limit, promotionsOnly)
    : Promise.resolve([]);

  const [intelligenceResult, catalogResult] = await Promise.allSettled([
    intelligencePromise,
    catalogPromise,
  ]);

  const intelligenceHits = intelligenceResult.status === 'fulfilled' ? intelligenceResult.value : [];
  if (intelligenceHits.length > 0) {
    return intelligenceHits;
  }

  const catalogHits = catalogResult.status === 'fulfilled' ? catalogResult.value : [];

  if (!promotionsOnly) {
    return catalogHits;
  }

  const promotionalHits = catalogHits.filter((product: any) => hasPromotion(product));
  return promotionalHits.length > 0 ? promotionalHits : catalogHits;
}

function mergeProductsBySku(...groups: any[][]) {
  const merged: any[] = [];
  const used = new Set<string>();

  for (const group of groups) {
    for (const product of group || []) {
      const sku = String(product?.sku || '').trim().toUpperCase();
      if (!sku || used.has(sku)) continue;
      used.add(sku);
      merged.push(product);
    }
  }

  return merged;
}

async function fetchProductsBySkus(skus: string[], cache: ResolverCache) {
  const unique = normalizeSkuList(skus);
  const hydrated = await Promise.all(
    unique.map(async (sku) => {
      if (!cache.skuHits.has(sku)) {
        cache.skuHits.set(
          sku,
          (async () => {
            try {
              const hits = await fetchSearchProducts({ q: sku, limit: '8' });
              return hits.find((hit: any) => String(hit?.sku || '').trim().toUpperCase() === sku) || null;
            } catch (error) {
              console.error(`[home-merchandising] failed to hydrate SKU ${sku}:`, error);
              return null;
            }
          })(),
        );
      }
      return cache.skuHits.get(sku) as Promise<any | null>;
    }),
  );
  return hydrated.filter(Boolean);
}

function normalizeResolvedProduct(product: any, reason: 'pinned' | 'rule'): HomeConfigResolvedProduct {
  return {
    ...product,
    reason,
    reasonLabel: reason === 'pinned' ? 'Fixado' : 'Regra',
  };
}

function emptyResolvedSection(active = true): HomeConfigResolvedSection {
  return {
    active,
    matchedBeforeLimit: 0,
    products: [],
    missingPinnedSkus: [],
    excludedSkus: [],
  };
}

function normalizeIncomingResolvedSection(section: any): HomeConfigResolvedSection | null {
  if (!section || typeof section !== 'object') return null;
  const products = Array.isArray(section?.products)
    ? section.products.filter(Boolean).map((product: any) => ({
        ...product,
        reason: product?.reason === 'pinned' ? 'pinned' : 'rule',
        reasonLabel: product?.reasonLabel || (product?.reason === 'pinned' ? 'Fixado' : 'Regra'),
      }))
    : [];

  return {
    active: section?.active !== false,
    matchedBeforeLimit: Number(section?.matchedBeforeLimit || products.length || 0),
    products,
    missingPinnedSkus: Array.isArray(section?.missingPinnedSkus)
      ? section.missingPinnedSkus
      : Array.isArray(section?.missingSkus)
        ? section.missingSkus
        : [],
    excludedSkus: Array.isArray(section?.excludedSkus) ? section.excludedSkus : [],
  };
}

async function fetchCandidatePool(sectionKey: HomeSectionKey, normalized: ReturnType<typeof normalizeHomeSectionConfig>, cache: ResolverCache) {
  const cacheKey = `${sectionKey}:${normalized.source}:${normalized.sort}:${normalized.limit}`;
  if (!cache.candidatePools.has(cacheKey)) {
    const poolLimit = Math.min(Math.max(normalized.limit * 6, 24), 50);
    cache.candidatePools.set(
      cacheKey,
      (async () => {
        if (normalized.source === 'top_promotions') {
          const promotionalHits = await fetchTopHomeProducts(poolLimit, true);
          if (promotionalHits.length > 0) return promotionalHits;
          const catalogPromotions = (await fetchSearchProducts({
            limit: String(poolLimit),
            sort: 'created_at:desc',
            inStock: 'true',
          })).filter((product: any) => hasPromotion(product));
          if (catalogPromotions.length > 0) return catalogPromotions;
          return fetchSearchProducts({
            limit: String(poolLimit),
            sort: 'created_at:desc',
            inStock: 'true',
          });
        }
        if (normalized.source === 'top_searched') {
          const topSearched = await fetchTopHomeProducts(poolLimit, false, true);
          const catalogFallback = await fetchSearchProducts({
            limit: String(poolLimit),
            sort: 'created_at:desc',
            inStock: 'true',
          });
          return mergeProductsBySku(topSearched, catalogFallback);
        }
        if (normalized.source === 'catalog' || normalized.source === 'newest') {
          return fetchSearchProducts({
            limit: String(poolLimit),
            sort: normalized.sort === 'price_desc'
              ? 'price:desc'
              : normalized.sort === 'price_asc'
                ? 'price:asc'
                : 'created_at:desc',
            inStock: 'true',
          });
        }
        return [];
      })(),
    );
  }
  return cache.candidatePools.get(cacheKey) as Promise<any[]>;
}

async function resolveHomeSection(
  sectionKey: HomeSectionKey,
  section: unknown,
  incomingResolved: any,
  cache: ResolverCache,
): Promise<HomeConfigResolvedSection> {
  const normalized = normalizeHomeSectionConfig(section, sectionKey);
  const normalizedIncoming = normalizeIncomingResolvedSection(incomingResolved);
  const minIncomingProducts = sectionKey === 'popular'
    ? Math.min(normalized.limit, HOME_POPULAR_MIN_PRODUCTS)
    : 1;

  if (normalizedIncoming && normalizedIncoming.products.length >= minIncomingProducts) {
    return normalizedIncoming;
  }

  if (!normalized.enabled) return emptyResolvedSection(false);

  const excluded = new Set(normalized.excludedSkus);
  const pinnedProducts = await fetchProductsBySkus(normalized.pinnedSkus, cache);
  let candidates: any[] = [];

  try {
    if (normalized.mode !== 'manual') {
      candidates = await fetchCandidatePool(sectionKey, normalized, cache);
    }
  } catch (error) {
    console.error(`[home-merchandising] fallback resolve for ${sectionKey} failed:`, error);
  }

  const products: HomeConfigResolvedProduct[] = [];
  const used = new Set<string>();
  const missingPinnedSkus: string[] = [];

  const include = (product: any, reason: 'pinned' | 'rule') => {
    const sku = String(product?.sku || '').trim().toUpperCase();
    if (!sku || used.has(sku) || excluded.has(sku)) return;
    used.add(sku);
    products.push(normalizeResolvedProduct(product, reason));
  };

  normalized.pinnedSkus.forEach((sku) => {
    const product = pinnedProducts.find((item) => String(item?.sku || '').trim().toUpperCase() === sku);
    if (product) {
      include(product, 'pinned');
    } else {
      missingPinnedSkus.push(sku);
    }
  });

  let matchedByRule = 0;
  if (normalized.mode !== 'manual') {
    const sorted = sortHomeProducts(candidates, normalized.sort);
    for (const product of sorted) {
      if (!matchesHomeRuleGroups(product, normalized.ruleGroups)) continue;
      const sku = String(product?.sku || '').trim().toUpperCase();
      if (!sku || excluded.has(sku) || used.has(sku)) continue;
      matchedByRule += 1;
      include(product, 'rule');
    }
  }

  return {
    active: true,
    matchedBeforeLimit: Math.max(products.length, normalizedIncoming?.matchedBeforeLimit || 0, normalized.pinnedSkus.length + matchedByRule),
    products: products.slice(0, normalized.limit),
    missingPinnedSkus,
    excludedSkus: normalized.excludedSkus,
  };
}

export async function resolveHomeSectionsForCompat(config: any, resolved: any): Promise<HomeConfigResolvedPayload> {
  const cache = createResolverCache();
  const [offers, popular, newArrivals] = await Promise.all([
    resolveHomeSection('offers', config?.offers, resolved?.offers, cache),
    resolveHomeSection('popular', config?.popular, resolved?.popular, cache),
    resolveHomeSection('newArrivals', config?.newArrivals, resolved?.newArrivals, cache),
  ]);

  return { offers, popular, newArrivals };
}

export async function resolveHomeProductsForHome(
  config: HomePageConfig | null | undefined,
  resolved: any,
): Promise<{ popular: any[]; offers: any[]; newArrivals: any[] }> {
  const sections = await resolveHomeSectionsForCompat(config || {}, resolved || {});
  return {
    popular: sections.popular.products || [],
    offers: sections.offers.products || [],
    newArrivals: sections.newArrivals.products || [],
  };
}
