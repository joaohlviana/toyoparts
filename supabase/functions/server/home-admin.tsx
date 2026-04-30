import { Hono } from 'npm:hono';
import { createClient } from 'jsr:@supabase/supabase-js@2.49.8';
import * as kv from './kv_store.tsx';
import * as meili from './meilisearch.tsx';
import { resolveProductMedia } from './media-utils.tsx';
import { getTopProductsIntelligenceSnapshot } from './search-intelligence.tsx';
import { canonicalizeBannerAssetUrl, getPublicHeroBanners } from './banners.tsx';
import {
  getPublicCategoryImagesMap,
  getPublicCategoryTreeSnapshot,
  type CategoryNode,
} from './categories.tsx';

export const homeConfigPublic = new Hono();
export const homePagePublic = new Hono();
export const homeConfigAdmin = new Hono();

const HOME_CONFIG_DRAFT_KEY = 'meta:home_config:draft';
const HOME_CONFIG_PUBLISHED_KEY = 'meta:home_config:published';
const HOME_CONFIG_PUBLIC_BUNDLE_KEY = 'meta:home_config:public_bundle';
const HOME_PAGE_SNAPSHOT_KEY = 'meta:home_page_snapshot:published';
const HOME_CONFIG_PUBLIC_MEMORY_CACHE_MS = 60_000;
const HOME_PAGE_SNAPSHOT_MEMORY_CACHE_MS = 60_000;
const HOME_CONFIG_PUBLIC_TIMEOUT_MS = 2_500;
const HOME_PAGE_PUBLIC_TIMEOUT_MS = 3_200;
const HOME_CONFIG_ADMIN_CONFIG_TIMEOUT_MS = 1_200;
const HOME_CONFIG_ADMIN_SECTION_TIMEOUT_MS = 1_500;
const HOME_CONFIG_CACHED_INTELLIGENCE_ONLY = true;
const MAX_RULE_PRODUCTS = 240;
const HOME_POPULAR_MIN_PRODUCTS = 15;
const HOME_DEPARTMENTS_REQUIRED = 15;
const KV_TABLE = 'kv_store_1d6e33e0';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

type HomeSmallBannerTheme = 'dark' | 'light' | 'primary';
type HomeMerchandisingSource = 'manual_only' | 'catalog' | 'top_searched' | 'top_promotions' | 'newest';
type HomeMerchandisingSort = 'intelligence_rank' | 'newest_desc' | 'discount_desc' | 'price_desc' | 'price_asc';
type HomeRuleConditionType =
  | 'in_stock'
  | 'has_promotion'
  | 'category_in'
  | 'category_not_in'
  | 'price_range'
  | 'sku_in'
  | 'sku_not_in';
type HomeSectionKey = 'offers' | 'popular' | 'newArrivals';

interface HomeScheduleWindow {
  startAt?: string | null;
  endAt?: string | null;
}

interface HomeDepartmentsConfig {
  selectedCategoryIds: string[];
  limit: number;
}

interface HomeSmallBannerConfig {
  id: string;
  active: boolean;
  overline: string;
  title: string;
  ctaText: string;
  href: string;
  ctaKind?: 'link' | 'whatsapp';
  trackingId?: string;
  linkedProductSku?: string | null;
  goalEnabled?: boolean;
  theme: HomeSmallBannerTheme;
  imageUrl?: string;
  schedule?: HomeScheduleWindow | null;
}

interface HomeRuleCondition {
  id: string;
  type: HomeRuleConditionType;
  values?: string[];
  minPrice?: number | null;
  maxPrice?: number | null;
}

interface HomeRuleGroup {
  id: string;
  conditions: HomeRuleCondition[];
}

interface HomeMerchandisingSectionConfig {
  enabled: boolean;
  title: string;
  subtitle: string;
  limit: number;
  source: HomeMerchandisingSource;
  sort: HomeMerchandisingSort;
  lookbackDays: number;
  ruleGroups: HomeRuleGroup[];
  pinnedSkus: string[];
  excludedSkus: string[];
  schedule?: HomeScheduleWindow | null;
}

interface HomePageConfig {
  departments: HomeDepartmentsConfig;
  smallBanners: HomeSmallBannerConfig[];
  offers: HomeMerchandisingSectionConfig;
  popular: HomeMerchandisingSectionConfig;
  newArrivals: HomeMerchandisingSectionConfig;
  updatedAt?: string | null;
  updatedBy?: string | null;
}

interface NormalizedHomeProduct {
  sku: string;
  name: string;
  price: number;
  special_price: number | null;
  image_url: string | null;
  url_key: string | null;
  in_stock: boolean;
  category_ids: string[];
  created_at: string | null;
  has_promotion: boolean;
  intelligence_score?: number;
  search_clicks?: number;
  views?: number;
}

interface HomeConfigResolvedProduct extends NormalizedHomeProduct {
  reason: 'pinned' | 'rule';
  reasonLabel: string;
}

interface HomeConfigResolvedSection {
  active: boolean;
  matchedBeforeLimit: number;
  products: HomeConfigResolvedProduct[];
  missingPinnedSkus: string[];
  excludedSkus: string[];
}

interface HomeConfigResolvedPayload {
  offers: HomeConfigResolvedSection;
  popular: HomeConfigResolvedSection;
  newArrivals: HomeConfigResolvedSection;
}

interface HomeConfigPublicBundle {
  config: HomePageConfig;
  resolved: HomeConfigResolvedPayload;
  meta: {
    publishedAt: string | null;
    generatedAt: string;
  };
}

interface HomeHeroBannerSnapshot {
  id: string;
  active: boolean;
  order: number;
  desktopImageSrc: string;
  mobileImageSrc?: string;
  linkHref?: string;
  altText?: string;
}

interface HomeDepartmentSnapshot {
  id: string;
  name: string;
  imageUrl: string;
  productCount: number;
  href: string;
  source: 'admin' | 'automatic';
}

interface HomePageSnapshot {
  version: 1;
  config: HomePageConfig;
  resolved: HomeConfigResolvedPayload;
  heroBanners: HomeHeroBannerSnapshot[];
  departments: HomeDepartmentSnapshot[];
  offers: HomeConfigResolvedSection;
  popularProducts: HomeConfigResolvedSection;
  newArrivals: HomeConfigResolvedSection;
  smallBanners: HomeSmallBannerConfig[];
  compatibilityBanner: {
    enabled: true;
  };
  newsletter: {
    enabled: true;
  };
  meta: {
    publishedAt: string | null;
    generatedAt: string;
    snapshotGeneratedAt: string;
    sources: Record<string, string>;
    warnings: string[];
  };
}

function normalizeHeroBannersSnapshot(
  banners: HomeHeroBannerSnapshot[] | undefined | null,
): HomeHeroBannerSnapshot[] {
  if (!Array.isArray(banners)) return [];

  return banners
    .map((banner, index) => {
      if (!banner || typeof banner !== 'object') return null;
      const desktopImageSrc = canonicalizeBannerAssetUrl(banner.desktopImageSrc);
      if (!desktopImageSrc) return null;
      return {
        id: String(banner.id || `banner-${index}`),
        active: banner.active !== false,
        order: Number.isFinite(Number(banner.order)) ? Number(banner.order) : index,
        desktopImageSrc,
        mobileImageSrc: canonicalizeBannerAssetUrl(banner.mobileImageSrc),
        linkHref: typeof banner.linkHref === 'string' ? banner.linkHref : undefined,
        altText: typeof banner.altText === 'string' ? banner.altText : undefined,
      };
    })
    .filter((banner): banner is HomeHeroBannerSnapshot => Boolean(banner));
}

function normalizeHomePageSnapshot(snapshot: HomePageSnapshot): HomePageSnapshot {
  return {
    ...snapshot,
    heroBanners: normalizeHeroBannersSnapshot(snapshot.heroBanners),
  };
}

let publicBundleMemoryCache:
  | {
      expiresAt: number;
      bundle: HomeConfigPublicBundle;
    }
  | null = null;

let homePageSnapshotMemoryCache:
  | {
      expiresAt: number;
      snapshot: HomePageSnapshot;
    }
  | null = null;

interface TopSourceCache {
  generatedAt: string;
  products: NormalizedHomeProduct[];
}

const DEFAULT_SECTION_COPY = {
  offers: {
    title: 'Ofertas especiais',
    subtitle: 'Promoções inteligentes com prioridade para produtos mais buscados.',
    source: 'top_promotions',
    sort: 'discount_desc',
    ruleGroups: [
      {
        id: 'offers-default-group',
        conditions: [
          { id: 'offers-default-stock', type: 'in_stock' },
          { id: 'offers-default-promo', type: 'has_promotion' },
        ],
      },
    ],
  },
  popular: {
    title: 'Mais procurados',
    subtitle: 'Os produtos mais buscados pelos clientes, com estoque disponível.',
    source: 'top_searched',
    sort: 'intelligence_rank',
    ruleGroups: [
      {
        id: 'popular-default-group',
        conditions: [{ id: 'popular-default-stock', type: 'in_stock' }],
      },
    ],
  },
  newArrivals: {
    title: 'Novidades',
    subtitle: 'Itens recém-chegados ao catálogo, prontos para destaque.',
    source: 'catalog',
    sort: 'newest_desc',
    ruleGroups: [
      {
        id: 'new-default-group',
        conditions: [{ id: 'new-default-stock', type: 'in_stock' }],
      },
    ],
  },
} as const;

const DEFAULT_HOME_CONFIG: HomePageConfig = {
  departments: {
    selectedCategoryIds: [],
    limit: 15,
  },
  smallBanners: [
    {
      id: 'small_left',
      active: true,
      overline: 'Peças genuínas',
      title: 'Até 10% OFF em filtros Toyota.',
      ctaText: 'Aproveite',
      href: '/busca?q=filtro',
      ctaKind: 'link',
      trackingId: 'small_left',
      linkedProductSku: null,
      goalEnabled: false,
      theme: 'dark',
      imageUrl: '',
      schedule: null,
    },
    {
      id: 'small_right',
      active: true,
      overline: 'Acessórios',
      title: '15% OFF em acessórios originais.',
      ctaText: 'Explorar',
      href: '/busca?q=acessorio',
      ctaKind: 'link',
      trackingId: 'small_right',
      linkedProductSku: null,
      goalEnabled: false,
      theme: 'light',
      imageUrl: '',
      schedule: null,
    },
  ],
  offers: {
    enabled: true,
    title: DEFAULT_SECTION_COPY.offers.title,
    subtitle: DEFAULT_SECTION_COPY.offers.subtitle,
    limit: 10,
    source: DEFAULT_SECTION_COPY.offers.source,
    sort: DEFAULT_SECTION_COPY.offers.sort,
    lookbackDays: 30,
    ruleGroups: DEFAULT_SECTION_COPY.offers.ruleGroups as HomeRuleGroup[],
    pinnedSkus: [],
    excludedSkus: [],
    schedule: null,
  },
  popular: {
    enabled: true,
    title: DEFAULT_SECTION_COPY.popular.title,
    subtitle: DEFAULT_SECTION_COPY.popular.subtitle,
    limit: HOME_POPULAR_MIN_PRODUCTS,
    source: DEFAULT_SECTION_COPY.popular.source,
    sort: DEFAULT_SECTION_COPY.popular.sort,
    lookbackDays: 30,
    ruleGroups: DEFAULT_SECTION_COPY.popular.ruleGroups as HomeRuleGroup[],
    pinnedSkus: [],
    excludedSkus: [],
    schedule: null,
  },
  newArrivals: {
    enabled: true,
    title: DEFAULT_SECTION_COPY.newArrivals.title,
    subtitle: DEFAULT_SECTION_COPY.newArrivals.subtitle,
    limit: 10,
    source: DEFAULT_SECTION_COPY.newArrivals.source,
    sort: DEFAULT_SECTION_COPY.newArrivals.sort,
    lookbackDays: 30,
    ruleGroups: DEFAULT_SECTION_COPY.newArrivals.ruleGroups as HomeRuleGroup[],
    pinnedSkus: [],
    excludedSkus: [],
    schedule: null,
  },
  updatedAt: null,
  updatedBy: null,
};

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

async function readConfigValue<T>(key: string): Promise<T | null> {
  const { data, error } = await supabase
    .from(KV_TABLE)
    .select('value')
    .eq('key', key)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return (data?.value ?? null) as T | null;
}

async function writeConfigValue(key: string, value: unknown) {
  const { error } = await supabase
    .from(KV_TABLE)
    .upsert({ key, value });

  if (error) {
    throw new Error(error.message);
  }
}

function createId(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeStringList(input: unknown, options?: { uppercase?: boolean }) {
  const uppercase = options?.uppercase === true;
  const rawItems = Array.isArray(input)
    ? input
    : String(input || '')
        .split(/[\n,;]+/g)
        .map((item) => item.trim())
        .filter(Boolean);

  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of rawItems) {
    const base = String(value || '').trim();
    if (!base) continue;
    const normalized = uppercase ? base.toUpperCase() : base;
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

function getCustomAttr(product: any, code: string) {
  return product?.custom_attributes?.find((attr: any) => attr?.attribute_code === code)?.value;
}

function normalizeTheme(value: unknown): HomeSmallBannerTheme {
  if (value === 'light' || value === 'primary') return value;
  return 'dark';
}

function normalizeSort(value: unknown, fallback: HomeMerchandisingSort): HomeMerchandisingSort {
  if (
    value === 'intelligence_rank' ||
    value === 'newest_desc' ||
    value === 'discount_desc' ||
    value === 'price_desc' ||
    value === 'price_asc'
  ) {
    return value;
  }
  return fallback;
}

function normalizeSource(value: unknown, fallback: HomeMerchandisingSource): HomeMerchandisingSource {
  if (
    value === 'manual_only' ||
    value === 'catalog' ||
    value === 'top_searched' ||
    value === 'top_promotions' ||
    value === 'newest'
  ) {
    return value;
  }
  return fallback;
}

function normalizeLimit(value: unknown, fallback: number, max = 20) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(1, Math.round(parsed)));
}

function getSectionLimit(sectionKey: HomeSectionKey, rawLimit: unknown, fallback: number) {
  const normalized = normalizeLimit(rawLimit, fallback);
  if (sectionKey === 'popular') {
    return Math.max(HOME_POPULAR_MIN_PRODUCTS, normalized);
  }
  return normalized;
}

function sanitizeSchedule(raw: any): HomeScheduleWindow | null {
  const startAt = String(raw?.startAt || '').trim() || null;
  const endAt = String(raw?.endAt || '').trim() || null;
  return startAt || endAt ? { startAt, endAt } : null;
}

function sanitizeSmallBanners(raw: any): HomeSmallBannerConfig[] {
  const provided = Array.isArray(raw) ? raw : [];
  return DEFAULT_HOME_CONFIG.smallBanners.map((fallbackBanner, index) => {
    const next = provided[index] || {};
    const ctaKind = String(next.ctaKind || fallbackBanner.ctaKind || 'link').trim().toLowerCase() === 'whatsapp'
      ? 'whatsapp'
      : 'link';
    const trackingId = String(next.trackingId || next.id || fallbackBanner.trackingId || fallbackBanner.id).trim()
      || fallbackBanner.id;
    const linkedProductSku = String(next.linkedProductSku || '').trim().toUpperCase() || null;
    return {
      id: String(next.id || fallbackBanner.id),
      active: next.active !== false,
      overline: String(next.overline ?? fallbackBanner.overline).trim().slice(0, 60),
      title: String(next.title ?? fallbackBanner.title).trim().slice(0, 160),
      ctaText: String(next.ctaText ?? fallbackBanner.ctaText).trim().slice(0, 40),
      href: String(next.href ?? fallbackBanner.href).trim() || fallbackBanner.href,
      ctaKind,
      trackingId,
      linkedProductSku,
      goalEnabled: next.goalEnabled === true || (ctaKind === 'whatsapp' && next.goalEnabled !== false),
      theme: normalizeTheme(next.theme ?? fallbackBanner.theme),
      imageUrl: String(next.imageUrl || '').trim(),
      schedule: sanitizeSchedule(next.schedule),
    };
  });
}

function sanitizeCondition(raw: any): HomeRuleCondition | null {
  const type = raw?.type;
  if (
    type !== 'in_stock' &&
    type !== 'has_promotion' &&
    type !== 'category_in' &&
    type !== 'category_not_in' &&
    type !== 'price_range' &&
    type !== 'sku_in' &&
    type !== 'sku_not_in'
  ) {
    return null;
  }

  const id = String(raw?.id || createId('cond'));
  if (type === 'price_range') {
    return {
      id,
      type,
      minPrice: toNumber(raw?.minPrice),
      maxPrice: toNumber(raw?.maxPrice),
    };
  }

  if (type === 'category_in' || type === 'category_not_in') {
    return {
      id,
      type,
      values: normalizeStringList(raw?.values, { uppercase: false }).slice(0, 30),
    };
  }

  if (type === 'sku_in' || type === 'sku_not_in') {
    return {
      id,
      type,
      values: normalizeStringList(raw?.values, { uppercase: true }).slice(0, 120),
    };
  }

  return { id, type };
}

function sanitizeRuleGroups(raw: any, fallbackGroups: HomeRuleGroup[]) {
  const provided = Array.isArray(raw) ? raw : [];
  const groups = provided
    .map((group: any) => {
      const conditions = Array.isArray(group?.conditions)
        ? group.conditions.map(sanitizeCondition).filter(Boolean)
        : [];
      if (conditions.length === 0) return null;
      return {
        id: String(group?.id || createId('group')),
        conditions: conditions as HomeRuleCondition[],
      };
    })
    .filter(Boolean) as HomeRuleGroup[];

  return groups.length > 0 ? groups : cloneJson(fallbackGroups);
}

function mapLegacyRuleToSource(value: string | undefined, sectionKey: HomeSectionKey): HomeMerchandisingSource {
  if (value === 'search_promotions') return 'top_promotions';
  if (value === 'search_top') return 'top_searched';
  if (value === 'newest') return sectionKey === 'newArrivals' ? 'catalog' : 'newest';
  if (value === 'price_desc') return 'catalog';
  return DEFAULT_HOME_CONFIG[sectionKey].source;
}

function mapLegacyRuleToSort(value: string | undefined, sectionKey: HomeSectionKey): HomeMerchandisingSort {
  if (value === 'price_desc') return 'price_desc';
  if (value === 'newest') return 'newest_desc';
  if (value === 'search_promotions' || value === 'search_top') return 'intelligence_rank';
  return DEFAULT_HOME_CONFIG[sectionKey].sort;
}

function sanitizeSectionConfig(raw: any, sectionKey: HomeSectionKey): HomeMerchandisingSectionConfig {
  const defaults = DEFAULT_HOME_CONFIG[sectionKey];
  const copyDefaults = DEFAULT_SECTION_COPY[sectionKey];

  if (raw && typeof raw === 'object' && ('mode' in raw || 'rule' in raw || 'manualSkus' in raw)) {
    const legacyMode = raw?.mode === 'manual' ? 'manual' : raw?.mode === 'manual_first' ? 'manual_first' : 'rule';
    const source = legacyMode === 'manual'
      ? 'manual_only'
      : mapLegacyRuleToSource(raw?.rule, sectionKey);
    return {
      enabled: true,
      title: copyDefaults.title,
      subtitle: copyDefaults.subtitle,
      limit: getSectionLimit(sectionKey, raw?.limit, defaults.limit),
      source,
      sort: mapLegacyRuleToSort(raw?.rule, sectionKey),
      lookbackDays: defaults.lookbackDays,
      ruleGroups: cloneJson(copyDefaults.ruleGroups as HomeRuleGroup[]),
      pinnedSkus: normalizeStringList(raw?.manualSkus, { uppercase: true }).slice(0, 40),
      excludedSkus: [],
      schedule: null,
    };
  }

  return {
    enabled: raw?.enabled !== false,
    title: String(raw?.title ?? copyDefaults.title).trim().slice(0, 120) || copyDefaults.title,
    subtitle: String(raw?.subtitle ?? copyDefaults.subtitle).trim().slice(0, 220) || copyDefaults.subtitle,
    limit: getSectionLimit(sectionKey, raw?.limit, defaults.limit),
    source: normalizeSource(raw?.source, defaults.source),
    sort: normalizeSort(raw?.sort, defaults.sort),
    lookbackDays: normalizeLimit(raw?.lookbackDays, defaults.lookbackDays, 90),
    ruleGroups: sanitizeRuleGroups(raw?.ruleGroups, copyDefaults.ruleGroups as HomeRuleGroup[]),
    pinnedSkus: normalizeStringList(raw?.pinnedSkus, { uppercase: true }).slice(0, 40),
    excludedSkus: normalizeStringList(raw?.excludedSkus, { uppercase: true }).slice(0, 120),
    schedule: sanitizeSchedule(raw?.schedule),
  };
}

function sanitizeHomeConfig(raw: any): HomePageConfig {
  return {
    departments: {
      selectedCategoryIds: normalizeStringList(raw?.departments?.selectedCategoryIds, { uppercase: false }).slice(0, 30),
      limit: normalizeLimit(raw?.departments?.limit, DEFAULT_HOME_CONFIG.departments.limit, 20),
    },
    smallBanners: sanitizeSmallBanners(raw?.smallBanners),
    offers: sanitizeSectionConfig(raw?.offers, 'offers'),
    popular: sanitizeSectionConfig(raw?.popular, 'popular'),
    newArrivals: sanitizeSectionConfig(raw?.newArrivals, 'newArrivals'),
    updatedAt: String(raw?.updatedAt || '') || null,
    updatedBy: String(raw?.updatedBy || '') || null,
  };
}

function stripAudit(config: HomePageConfig) {
  return {
    ...config,
    updatedAt: null,
    updatedBy: null,
  };
}

function configsAreEquivalent(a: HomePageConfig, b: HomePageConfig) {
  return JSON.stringify(stripAudit(a)) === JSON.stringify(stripAudit(b));
}

function normalizeInStock(product: any) {
  if (typeof product?.in_stock === 'boolean') return product.in_stock;
  const stock = product?.extension_attributes?.stock;
  const parsed = typeof stock === 'string'
    ? (() => {
        try {
          return JSON.parse(stock);
        } catch {
          return null;
        }
      })()
    : stock;
  return parsed?.is_in_stock === true || parsed?.is_in_stock === 1 || parsed?.is_in_stock === '1';
}

function normalizeCategoryIds(product: any) {
  const categoryIdsRaw = product?.category_ids ?? getCustomAttr(product, 'category_ids') ?? product?.extension_attributes?.category_links;
  const values: string[] = [];

  if (Array.isArray(categoryIdsRaw)) {
    for (const item of categoryIdsRaw) {
      if (item && typeof item === 'object' && item.category_id !== undefined) values.push(String(item.category_id));
      else if (item !== null && item !== undefined && item !== '') values.push(String(item));
    }
  } else if (typeof categoryIdsRaw === 'string') {
    values.push(...categoryIdsRaw.split(',').map((value) => value.trim()).filter(Boolean));
  }

  return Array.from(new Set(values));
}

function normalizeHomeProduct(product: any): NormalizedHomeProduct {
  const price = toNumber(product?.price) ?? 0;
  const specialCandidate =
    toNumber(product?.special_price) ??
    toNumber(product?.magento_special_price) ??
    toNumber(getCustomAttr(product, 'special_price'));
  const specialPrice =
    specialCandidate !== null && specialCandidate > 0 && (price <= 0 || specialCandidate < price)
      ? specialCandidate
      : null;
  const media = resolveProductMedia(product, { allowLegacy: false });
  const intelligence = product?._intelligence && typeof product._intelligence === 'object'
    ? product._intelligence
    : {};

  return {
    sku: String(product?.sku || '').trim().toUpperCase(),
    name: String(product?.name || '').trim(),
    price,
    special_price: specialPrice,
    image_url: media.image_url || String(product?.image_url || '').trim() || null,
    url_key: String(product?.url_key || '').trim() || null,
    in_stock: normalizeInStock(product),
    category_ids: normalizeCategoryIds(product),
    created_at: String(product?.created_at || '').trim() || null,
    has_promotion: specialPrice !== null,
    intelligence_score: toNumber(intelligence?.score) ?? undefined,
    search_clicks: toNumber(intelligence?.search_clicks) ?? undefined,
    views: toNumber(intelligence?.views) ?? undefined,
  };
}

async function hydrateProductsBySkus(skus: string[]) {
  const orderedSkus = normalizeStringList(skus, { uppercase: true });
  if (orderedSkus.length === 0) {
    return { products: [] as NormalizedHomeProduct[], missingSkus: [] as string[] };
  }

  const productsBySku = new Map<string, NormalizedHomeProduct>();

  if (meili.isConfigured()) {
    try {
      const skuList = orderedSkus.map((sku) => JSON.stringify(sku)).join(',');
      const searchResult = await meili.search('', {
        limit: orderedSkus.length,
        filter: [`sku IN [${skuList}]`],
        facets: [],
      });
      for (const hit of searchResult?.hits || []) {
        const normalized = normalizeHomeProduct(hit);
        if (normalized.sku) productsBySku.set(normalized.sku, normalized);
      }
    } catch (error) {
      console.warn('[home-config] Meili SKU hydration failed:', error);
    }
  }

  for (const sku of orderedSkus) {
    if (productsBySku.has(sku)) continue;
    try {
      const product = await kv.get(`product:${sku}`);
      if (!product) continue;
      const normalized = normalizeHomeProduct(product);
      if (normalized.sku) productsBySku.set(normalized.sku, normalized);
    } catch (error) {
      console.warn(`[home-config] KV SKU hydration failed for ${sku}:`, error);
    }
  }

  const products: NormalizedHomeProduct[] = [];
  const missingSkus: string[] = [];
  for (const sku of orderedSkus) {
    const product = productsBySku.get(sku);
    if (product?.sku && product?.name) products.push(product);
    else missingSkus.push(sku);
  }

  return { products, missingSkus };
}

async function loadCatalogCandidates(sort: HomeMerchandisingSort, limit: number) {
  if (!meili.isConfigured()) return [] as NormalizedHomeProduct[];

  const sortParam =
    sort === 'newest_desc'
      ? ['created_at:desc']
      : sort === 'price_desc'
        ? ['price:desc']
        : sort === 'price_asc'
          ? ['price:asc']
          : ['created_at:desc'];

  try {
    const result = await meili.search('', {
      limit: Math.max(limit, 40),
      filter: ['status = 1', 'in_stock = true'],
      sort: sortParam,
      facets: [],
    });
    const products = (result?.hits || []).map(normalizeHomeProduct);
    return products;
  } catch (error) {
    console.warn('[home-config] catalog candidates failed:', error);
    return [];
  }
}

function mergeProductsBySku(...groups: NormalizedHomeProduct[][]) {
  const merged: NormalizedHomeProduct[] = [];
  const used = new Set<string>();

  for (const group of groups) {
    for (const product of group || []) {
      if (!product?.sku || used.has(product.sku)) continue;
      used.add(product.sku);
      merged.push(product);
    }
  }

  return merged;
}

function getSellingPrice(product: NormalizedHomeProduct) {
  return product.special_price ?? product.price;
}

function getDiscountPercent(product: NormalizedHomeProduct) {
  if (!(product.price > 0) || !(product.special_price && product.special_price > 0 && product.special_price < product.price)) {
    return 0;
  }
  return ((product.price - product.special_price) / product.price) * 100;
}

function sortProducts(products: NormalizedHomeProduct[], sort: HomeMerchandisingSort) {
  const next = [...products];
  if (sort === 'intelligence_rank') return next;

  next.sort((a, b) => {
    if (sort === 'newest_desc') {
      return String(b.created_at || '').localeCompare(String(a.created_at || ''));
    }
    if (sort === 'discount_desc') {
      return getDiscountPercent(b) - getDiscountPercent(a) || getSellingPrice(b) - getSellingPrice(a);
    }
    if (sort === 'price_desc') {
      return getSellingPrice(b) - getSellingPrice(a);
    }
    if (sort === 'price_asc') {
      return getSellingPrice(a) - getSellingPrice(b);
    }
    return 0;
  });
  return next;
}

function matchesCondition(product: NormalizedHomeProduct, condition: HomeRuleCondition) {
  if (condition.type === 'in_stock') return product.in_stock === true;
  if (condition.type === 'has_promotion') return product.has_promotion === true;
  if (condition.type === 'category_in') {
    const values = normalizeStringList(condition.values, { uppercase: false });
    if (values.length === 0) return true;
    return values.some((value) => product.category_ids.includes(value));
  }
  if (condition.type === 'category_not_in') {
    const values = normalizeStringList(condition.values, { uppercase: false });
    if (values.length === 0) return true;
    return values.every((value) => !product.category_ids.includes(value));
  }
  if (condition.type === 'price_range') {
    const price = getSellingPrice(product);
    if (condition.minPrice !== null && condition.minPrice !== undefined && price < Number(condition.minPrice)) return false;
    if (condition.maxPrice !== null && condition.maxPrice !== undefined && price > Number(condition.maxPrice)) return false;
    return true;
  }
  if (condition.type === 'sku_in') {
    const values = normalizeStringList(condition.values, { uppercase: true });
    return values.length === 0 ? true : values.includes(product.sku);
  }
  if (condition.type === 'sku_not_in') {
    const values = normalizeStringList(condition.values, { uppercase: true });
    return values.length === 0 ? true : !values.includes(product.sku);
  }
  return true;
}

function matchesRuleGroups(product: NormalizedHomeProduct, groups: HomeRuleGroup[]) {
  if (!Array.isArray(groups) || groups.length === 0) return true;
  return groups.some((group) => group.conditions.every((condition) => matchesCondition(product, condition)));
}

function isScheduleActive(schedule: HomeScheduleWindow | null | undefined) {
  if (!schedule?.startAt && !schedule?.endAt) return true;
  const now = Date.now();
  const start = schedule?.startAt ? new Date(schedule.startAt).getTime() : null;
  const end = schedule?.endAt ? new Date(schedule.endAt).getTime() : null;
  if (start !== null && Number.isFinite(start) && now < start) return false;
  if (end !== null && Number.isFinite(end) && now > end) return false;
  return true;
}

interface ResolveHomeConfigOptions {
  cachedOnlyIntelligence?: boolean;
}

async function loadRuleCandidates(section: HomeMerchandisingSectionConfig, options?: ResolveHomeConfigOptions) {
  if (section.source === 'manual_only') return [] as NormalizedHomeProduct[];
  if (section.source === 'top_searched' || section.source === 'top_promotions') {
    const snapshot = await withTimeout(
      getTopProductsIntelligenceSnapshot({
        days: section.lookbackDays,
        limit: Math.min(Math.max(MAX_RULE_PRODUCTS, 40), 120),
        hydrate: true,
        ranking: 'search',
        cachedOnly: options?.cachedOnlyIntelligence === true,
      }),
      options?.cachedOnlyIntelligence === true ? 900 : 2500,
      `Home ${section.source} intelligence snapshot`,
    ).catch((error) => {
      console.warn(`[home-config] ${section.source} intelligence fallback:`, error);
      return null;
    });
    const rankedHits = section.source === 'top_promotions' ? snapshot?.promotional_hits : snapshot?.hits;
    const normalizedHits = Array.isArray(rankedHits)
      ? rankedHits.map(normalizeHomeProduct).filter((product) => product?.sku && product?.name)
      : [];
    if (section.source === 'top_promotions') {
      const promotionalCatalog = (await loadCatalogCandidates('discount_desc', MAX_RULE_PRODUCTS)).filter((product) => product.has_promotion);
      const mergedPromotions = mergeProductsBySku(normalizedHits, promotionalCatalog);
      if (mergedPromotions.length > 0) return mergedPromotions;
    }

    const catalogFallback = await loadCatalogCandidates(section.sort === 'intelligence_rank' ? 'newest_desc' : section.sort, MAX_RULE_PRODUCTS);
    return mergeProductsBySku(normalizedHits, catalogFallback);
  }
  if (section.source === 'newest') {
    return loadCatalogCandidates('newest_desc', MAX_RULE_PRODUCTS);
  }
  return loadCatalogCandidates(section.sort, MAX_RULE_PRODUCTS);
}

function getEffectiveSectionConfig(sectionKey: HomeSectionKey, section: HomeMerchandisingSectionConfig): HomeMerchandisingSectionConfig {
  const hasPinned = normalizeStringList(section.pinnedSkus, { uppercase: true }).length > 0;
  if (section.source !== 'manual_only') return section;
  if (hasPinned && sectionKey !== 'popular') return section;

  return {
    ...section,
    source: DEFAULT_HOME_CONFIG[sectionKey].source,
    sort: section.sort === 'intelligence_rank' ? DEFAULT_HOME_CONFIG[sectionKey].sort : section.sort,
    ruleGroups: Array.isArray(section.ruleGroups) && section.ruleGroups.length > 0
      ? section.ruleGroups
      : cloneJson(DEFAULT_HOME_CONFIG[sectionKey].ruleGroups as HomeRuleGroup[]),
  };
}

async function resolveSection(
  sectionKey: HomeSectionKey,
  rawSection: HomeMerchandisingSectionConfig,
  options?: ResolveHomeConfigOptions,
): Promise<HomeConfigResolvedSection> {
  const section = getEffectiveSectionConfig(sectionKey, rawSection);
  if (!section.enabled || !isScheduleActive(section.schedule)) {
    return {
      active: false,
      matchedBeforeLimit: 0,
      products: [],
      missingPinnedSkus: [],
      excludedSkus: normalizeStringList(section.excludedSkus, { uppercase: true }),
    };
  }

  const limit = normalizeLimit(section.limit, 10);
  const excluded = new Set(normalizeStringList(section.excludedSkus, { uppercase: true }));
  const { products: pinnedProducts, missingSkus } = await hydrateProductsBySkus(section.pinnedSkus);
  const candidates = sortProducts(await loadRuleCandidates(section, options), section.sort);

  const products: HomeConfigResolvedProduct[] = [];
  const usedSkus = new Set<string>();

  for (const product of pinnedProducts) {
    if (!product?.sku || excluded.has(product.sku) || usedSkus.has(product.sku)) continue;
    usedSkus.add(product.sku);
    products.push({
      ...product,
      reason: 'pinned',
      reasonLabel: 'Fixado',
    });
  }

  const matchedRuleProducts = candidates.filter((product) => {
    if (!product?.sku) return false;
    if (excluded.has(product.sku)) return false;
    if (usedSkus.has(product.sku)) return false;
    return matchesRuleGroups(product, section.ruleGroups);
  });

  for (const product of matchedRuleProducts) {
    if (products.length >= limit) break;
    usedSkus.add(product.sku);
    products.push({
      ...product,
      reason: 'rule',
      reasonLabel: 'Regra',
    });
  }

  return {
    active: true,
    matchedBeforeLimit: products.filter((product) => product.reason === 'pinned').length + matchedRuleProducts.length,
    products: products.slice(0, limit),
    missingPinnedSkus: missingSkus,
    excludedSkus: Array.from(excluded),
  };
}

async function resolveConfig(config: HomePageConfig, options?: ResolveHomeConfigOptions): Promise<HomeConfigResolvedPayload> {
  const [offers, popular, newArrivals] = await Promise.all([
    resolveSection('offers', config.offers, options),
    resolveSection('popular', config.popular, options),
    resolveSection('newArrivals', config.newArrivals, options),
  ]);
  return { offers, popular, newArrivals };
}

async function resolveConfigForAdmin(config: HomePageConfig): Promise<{ resolved: HomeConfigResolvedPayload; warning: string | null; degraded: boolean }> {
  const sectionEntries = [
    ['offers', config.offers],
    ['popular', config.popular],
    ['newArrivals', config.newArrivals],
  ] as const;

  const results = await Promise.allSettled(
    sectionEntries.map(([sectionKey, section]) =>
      withTimeout(
        resolveSection(sectionKey, section, { cachedOnlyIntelligence: HOME_CONFIG_CACHED_INTELLIGENCE_ONLY }),
        HOME_CONFIG_ADMIN_SECTION_TIMEOUT_MS,
        `Admin home section ${sectionKey}`,
      ),
    ),
  );

  const resolved = {} as HomeConfigResolvedPayload;
  const warnings: string[] = [];

  results.forEach((result, index) => {
    const [sectionKey, section] = sectionEntries[index];
    if (result.status === 'fulfilled') {
      resolved[sectionKey] = result.value;
      return;
    }

    console.error(`[home-config] admin resolve fallback for ${sectionKey}:`, result.reason);
    resolved[sectionKey] = createEmptyResolvedSection(Boolean(section.enabled && isScheduleActive(section.schedule)));
    warnings.push(sectionKey);
  });

  return {
    resolved,
    warning:
      warnings.length > 0
        ? `Preview parcial: ${warnings.join(', ')} entraram em modo seguro por indisponibilidade da inteligencia.`
        : null,
    degraded: warnings.length > 0,
  };
}

async function getStoredDraftConfig() {
  const stored = await withTimeout(
    readConfigValue<any>(HOME_CONFIG_DRAFT_KEY),
    HOME_CONFIG_ADMIN_CONFIG_TIMEOUT_MS,
    `Home admin draft key ${HOME_CONFIG_DRAFT_KEY}`,
  ).catch((error) => {
    console.warn('[home-config] draft fallback:', error);
    return null;
  });
  return sanitizeHomeConfig(stored || DEFAULT_HOME_CONFIG);
}

async function getStoredPublishedConfig() {
  const stored = await withTimeout(
    readConfigValue<any>(HOME_CONFIG_PUBLISHED_KEY),
    HOME_CONFIG_ADMIN_CONFIG_TIMEOUT_MS,
    `Home admin published key ${HOME_CONFIG_PUBLISHED_KEY}`,
  ).catch((error) => {
    console.warn('[home-config] published fallback:', error);
    return null;
  });
  return sanitizeHomeConfig(stored || DEFAULT_HOME_CONFIG);
}

function buildAdminSafeResolved(config: HomePageConfig): HomeConfigResolvedPayload {
  return {
    offers: createEmptyResolvedSection(Boolean(config.offers.enabled && isScheduleActive(config.offers.schedule))),
    popular: createEmptyResolvedSection(Boolean(config.popular.enabled && isScheduleActive(config.popular.schedule))),
    newArrivals: createEmptyResolvedSection(Boolean(config.newArrivals.enabled && isScheduleActive(config.newArrivals.schedule))),
  };
}

async function buildAdminBundle() {
  const [draft, published] = await Promise.all([getStoredDraftConfig(), getStoredPublishedConfig()]);
  return {
    draft,
    published,
    resolvedDraft: buildAdminSafeResolved(draft),
    resolvedPublished: buildAdminSafeResolved(published),
    meta: {
      draftUpdatedAt: draft.updatedAt || null,
      draftUpdatedBy: draft.updatedBy || null,
      publishedAt: published.updatedAt || null,
      publishedBy: published.updatedBy || null,
      hasDraftChanges: !configsAreEquivalent(draft, published),
      resolutionWarning: 'Preview inicial em modo seguro. Use "Pre-visualizar" para resolver os produtos sob demanda.',
      resolutionDegraded: true,
    },
  };
}

function catSlugify(text: string): string {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

const HOME_CATEGORY_IMAGE_ALIASES: Record<string, string[]> = {
  'acessorios-exteriores': ['acessorios-externos', 'frisos-e-apliques', 'rodas-e-calotas'],
  'acessorios-interiores': ['acessorios-internos', 'multimidia', 'tapetes', 'porta-malas'],
  'alarmes-e-seguranca': ['alarme-e-seguranca', 'sensor-de-estacionamento'],
  'pecas-e-manutencao': ['pecas', 'filtros', 'freio', 'suspensao', 'motor', 'ferramentas-e-equipamentos'],
  'sons-e-entretenimento': ['multimidia'],
  'farois-e-lanternas': ['iluminacao'],
  'lampadas': ['iluminacao'],
  'farol-de-neblina': ['iluminacao'],
  'tapetes': ['acessorios-internos'],
  'multimidia': ['acessorios-internos'],
  'porta-malas': ['acessorios-internos'],
  'filtros': ['pecas'],
  'freio': ['pecas'],
  'suspensao': ['pecas'],
  'motor': ['pecas'],
};

const HOME_FEATURED_CATEGORY_ORDER = [
  'acessorios-externos',
  'acessorios-exteriores',
  'acessorios-internos',
  'acessorios-interiores',
  'pecas',
  'pecas-e-manutencao',
  'iluminacao',
  'farois-e-lanternas',
  'acessorios-pick-up-e-suv',
  'outlet',
  'ofertas',
  'itens-promocionais',
];

function getCategoryChildren(node: CategoryNode): CategoryNode[] {
  return ((node as any).children_data || (node as any).children || []).filter((child: CategoryNode) => child?.is_active);
}

function flattenHomeCategories(tree: CategoryNode | null): CategoryNode[] {
  if (!tree) return [];
  const bySlug = new Map<string, CategoryNode>();

  const walk = (node: CategoryNode) => {
    const count = Number(node.product_count || 0);
    if (node.is_active && Number(node.level || 0) >= 1 && count > 0) {
      const slug = catSlugify(node.name);
      const current = bySlug.get(slug);
      if (!current || count > Number(current.product_count || 0)) {
        bySlug.set(slug, node);
      }
    }
    getCategoryChildren(node).forEach(walk);
  };

  walk(tree);
  return Array.from(bySlug.values());
}

function collectHomeCategoryImageCandidates(categoryName: string, images: Record<string, string>): string[] {
  const slug = catSlugify(categoryName);
  const candidates = [slug, ...(HOME_CATEGORY_IMAGE_ALIASES[slug] || [])];
  const urls: string[] = [];
  const pushUrl = (url?: string | null) => {
    const normalized = String(url || '').trim();
    if (normalized && !urls.includes(normalized)) urls.push(normalized);
  };

  for (const candidate of candidates) pushUrl(images[candidate]);
  for (const [key, url] of Object.entries(images || {})) {
    if (key.includes(':')) continue;
    if (candidates.some((candidate) => key.includes(candidate) || candidate.includes(key))) {
      pushUrl(url);
    }
  }
  for (const [key, url] of Object.entries(images || {})) {
    const afterColon = key.split(':')[1];
    if (afterColon && candidates.some((candidate) => afterColon.includes(candidate) || candidate.includes(afterColon))) {
      pushUrl(url);
    }
  }

  return urls;
}

function getHomeCategoryImage(categoryName: string, images: Record<string, string>): string | null {
  return collectHomeCategoryImageCandidates(categoryName, images)[0] || null;
}

function getHomeCategoryScore(category: CategoryNode) {
  const slug = catSlugify(category.name);
  const orderIndex = HOME_FEATURED_CATEGORY_ORDER.indexOf(slug);
  return orderIndex === -1 ? HOME_FEATURED_CATEGORY_ORDER.length + 1 : orderIndex;
}

function buildHomeDepartmentHref(category: CategoryNode) {
  const params = new URLSearchParams({ category_name: category.name });
  if (!String(category.id).startsWith('-')) params.set('category', String(category.id));
  return `/busca?${params.toString()}`;
}

async function resolveHomeDepartments(config: HomePageConfig): Promise<HomeDepartmentSnapshot[]> {
  const [tree, images] = await Promise.all([
    getPublicCategoryTreeSnapshot().catch((error) => {
      console.warn('[home-page] departments tree fallback:', error);
      return null;
    }),
    getPublicCategoryImagesMap().catch((error) => {
      console.warn('[home-page] departments image fallback:', error);
      return {};
    }),
  ]);

  const categories = flattenHomeCategories(tree);
  const byId = new Map(categories.map((category) => [String(category.id), category]));
  const selectedIds = normalizeStringList(config.departments?.selectedCategoryIds, { uppercase: false });
  const requestedLimit = Math.max(
    HOME_DEPARTMENTS_REQUIRED,
    normalizeLimit(config.departments?.limit, HOME_DEPARTMENTS_REQUIRED, 24),
  );
  const used = new Set<string>();
  const departments: HomeDepartmentSnapshot[] = [];

  const addCategory = (category: CategoryNode | undefined, source: HomeDepartmentSnapshot['source']) => {
    if (!category) return;
    const slug = catSlugify(category.name);
    if (!slug || used.has(slug)) return;
    const imageUrl = getHomeCategoryImage(category.name, images);
    if (!imageUrl) return;
    const productCount = Number(category.product_count || 0);
    if (productCount <= 0) return;
    used.add(slug);
    departments.push({
      id: String(category.id),
      name: category.name,
      imageUrl,
      productCount,
      href: buildHomeDepartmentHref(category),
      source,
    });
  };

  selectedIds.forEach((id) => addCategory(byId.get(String(id)), 'admin'));

  categories
    .filter((category) => !!getHomeCategoryImage(category.name, images))
    .sort((a, b) => {
      const scoreDiff = getHomeCategoryScore(a) - getHomeCategoryScore(b);
      if (scoreDiff !== 0) return scoreDiff;
      return Number(b.product_count || 0) - Number(a.product_count || 0);
    })
    .forEach((category) => {
      if (departments.length < requestedLimit) addCategory(category, 'automatic');
    });

  return departments.slice(0, requestedLimit);
}

function hasRenderableHomeProduct(product: HomeConfigResolvedProduct) {
  return Boolean(
    product?.sku &&
    product?.name &&
    Number(product?.price || 0) > 0 &&
    product?.in_stock !== false &&
    String(product?.image_url || '').trim(),
  );
}

function getDiscountValue(product: HomeConfigResolvedProduct) {
  if (!product.special_price || product.special_price <= 0 || product.special_price >= product.price) return 0;
  return product.price - product.special_price;
}

function getHomeProductPopularity(product: HomeConfigResolvedProduct) {
  return Number(product.intelligence_score || 0) ||
    (Number(product.search_clicks || 0) * 5) + Number(product.views || 0);
}

function dedupeSectionProducts(products: HomeConfigResolvedProduct[]) {
  const used = new Set<string>();
  return products.filter((product) => {
    const sku = String(product?.sku || '').trim().toUpperCase();
    if (!sku || used.has(sku)) return false;
    used.add(sku);
    return true;
  });
}

function finalizeHomeSection(
  sectionKey: HomeSectionKey,
  section: HomeConfigResolvedSection,
  limit: number,
): HomeConfigResolvedSection {
  const products = dedupeSectionProducts((section.products || []).filter(hasRenderableHomeProduct));
  if (sectionKey === 'offers') {
    products.sort((a, b) => {
      const discountPercentDiff = getDiscountPercent(b) - getDiscountPercent(a);
      if (Math.abs(discountPercentDiff) > 0.01) return discountPercentDiff;
      return getDiscountValue(b) - getDiscountValue(a) || getHomeProductPopularity(b) - getHomeProductPopularity(a);
    });
  }
  if (sectionKey === 'newArrivals') {
    products.sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
  }

  return {
    ...section,
    products: products.slice(0, limit),
    matchedBeforeLimit: Math.max(Number(section.matchedBeforeLimit || 0), products.length),
  };
}

function finalizeHomeResolvedPayload(config: HomePageConfig, resolved: HomeConfigResolvedPayload): HomeConfigResolvedPayload {
  return {
    offers: finalizeHomeSection('offers', resolved.offers, normalizeLimit(config.offers.limit, 10)),
    popular: finalizeHomeSection('popular', resolved.popular, Math.max(HOME_POPULAR_MIN_PRODUCTS, normalizeLimit(config.popular.limit, HOME_POPULAR_MIN_PRODUCTS))),
    newArrivals: finalizeHomeSection('newArrivals', resolved.newArrivals, normalizeLimit(config.newArrivals.limit, 10)),
  };
}

async function buildHomePageSnapshotFromBundle(bundle: HomeConfigPublicBundle): Promise<HomePageSnapshot> {
  const resolved = finalizeHomeResolvedPayload(bundle.config, bundle.resolved);
  const [heroBanners, departments] = await Promise.all([
    getPublicHeroBanners(),
    resolveHomeDepartments(bundle.config),
  ]);
  const warnings: string[] = [];
  if (departments.length < HOME_DEPARTMENTS_REQUIRED) warnings.push('departments_below_required_count');
  if (resolved.popular.products.length < HOME_POPULAR_MIN_PRODUCTS) warnings.push('popular_below_required_count');
  if (resolved.offers.products.length === 0 && bundle.config.offers.enabled) warnings.push('offers_empty');
  if (resolved.newArrivals.products.length === 0 && bundle.config.newArrivals.enabled) warnings.push('new_arrivals_empty');

  return normalizeHomePageSnapshot({
    version: 1,
    config: bundle.config,
    resolved,
    heroBanners,
    departments,
    offers: resolved.offers,
    popularProducts: resolved.popular,
    newArrivals: resolved.newArrivals,
    smallBanners: (bundle.config.smallBanners || []).filter((banner) => banner.active && isScheduleActive(banner.schedule)),
    compatibilityBanner: { enabled: true },
    newsletter: { enabled: true },
    meta: {
      ...bundle.meta,
      snapshotGeneratedAt: new Date().toISOString(),
      sources: {
        heroBanners: 'banner_manifest',
        departments: 'category_tree_and_images',
        offers: 'home_config_resolver',
        popularProducts: 'search_intelligence_snapshot',
        newArrivals: 'catalog_newest',
      },
      warnings,
    },
  });
}

function isResolvedSectionCacheable(section: any) {
  return section && typeof section === 'object' && Array.isArray(section.products);
}

function hasRequiredPublicProducts(bundle: any, config: HomePageConfig) {
  const popularActive = Boolean(config.popular.enabled && isScheduleActive(config.popular.schedule));
  if (!popularActive) return true;

  const products = Array.isArray(bundle?.resolved?.popular?.products)
    ? bundle.resolved.popular.products
    : [];
  const expected = Math.min(
    HOME_POPULAR_MIN_PRODUCTS,
    normalizeLimit(config.popular.limit, HOME_POPULAR_MIN_PRODUCTS),
  );

  return products.length >= expected;
}

function isCachedPublicBundleValid(bundle: any, publishedAt: string | null, config: HomePageConfig) {
  return (
    bundle &&
    typeof bundle === 'object' &&
    bundle.meta?.publishedAt === publishedAt &&
    isResolvedSectionCacheable(bundle.resolved?.offers) &&
    isResolvedSectionCacheable(bundle.resolved?.popular) &&
    isResolvedSectionCacheable(bundle.resolved?.newArrivals) &&
    hasRequiredPublicProducts(bundle, config)
  );
}

async function persistPublicBundle(config: HomePageConfig, options?: ResolveHomeConfigOptions): Promise<HomeConfigPublicBundle> {
  const bundle: HomeConfigPublicBundle = {
    config,
    resolved: await resolveConfig(config, {
      cachedOnlyIntelligence: options?.cachedOnlyIntelligence ?? HOME_CONFIG_CACHED_INTELLIGENCE_ONLY,
    }),
    meta: {
      publishedAt: config.updatedAt || null,
      generatedAt: new Date().toISOString(),
    },
  };
  publicBundleMemoryCache = {
    expiresAt: Date.now() + HOME_CONFIG_PUBLIC_MEMORY_CACHE_MS,
    bundle,
  };
  writeConfigValue(HOME_CONFIG_PUBLIC_BUNDLE_KEY, bundle).catch((error) => {
    console.warn('[home-config] public bundle async cache write failed:', error);
  });
  return bundle;
}

async function persistHomePageSnapshot(bundle: HomeConfigPublicBundle): Promise<HomePageSnapshot> {
  const snapshot = await buildHomePageSnapshotFromBundle(bundle);
  homePageSnapshotMemoryCache = {
    expiresAt: Date.now() + HOME_PAGE_SNAPSHOT_MEMORY_CACHE_MS,
    snapshot,
  };
  await writeConfigValue(HOME_PAGE_SNAPSHOT_KEY, snapshot);
  return snapshot;
}

function isHomePageSnapshotValid(snapshot: any, publishedAt: string | null) {
  return Boolean(
    snapshot &&
    typeof snapshot === 'object' &&
    snapshot.version === 1 &&
    snapshot.meta?.publishedAt === publishedAt &&
    Array.isArray(snapshot.heroBanners) &&
    Array.isArray(snapshot.departments) &&
    Array.isArray(snapshot.offers?.products) &&
    Array.isArray(snapshot.popularProducts?.products) &&
    Array.isArray(snapshot.newArrivals?.products),
  );
}

async function buildPublicBundle() {
  if (publicBundleMemoryCache && publicBundleMemoryCache.expiresAt > Date.now()) {
    return publicBundleMemoryCache.bundle;
  }

  const config = await getStoredPublishedConfig();
  const publishedAt = config.updatedAt || null;
  const cachedFast = await withTimeout(
    readConfigValue<any>(HOME_CONFIG_PUBLIC_BUNDLE_KEY),
    HOME_CONFIG_ADMIN_CONFIG_TIMEOUT_MS,
    `Home public bundle fast key ${HOME_CONFIG_PUBLIC_BUNDLE_KEY}`,
  ).catch((error) => {
    console.warn('[home-config] fast public bundle cache fallback:', error);
    return null;
  });

  if (isCachedPublicBundleValid(cachedFast, publishedAt, config)) {
    publicBundleMemoryCache = {
      expiresAt: Date.now() + HOME_CONFIG_PUBLIC_MEMORY_CACHE_MS,
      bundle: cachedFast as HomeConfigPublicBundle,
    };
    return publicBundleMemoryCache.bundle;
  }

  const cached = await withTimeout(
    readConfigValue<any>(HOME_CONFIG_PUBLIC_BUNDLE_KEY),
    HOME_CONFIG_ADMIN_CONFIG_TIMEOUT_MS,
    `Home public bundle key ${HOME_CONFIG_PUBLIC_BUNDLE_KEY}`,
  ).catch((error) => {
    console.warn('[home-config] public bundle cache fallback:', error);
    return null;
  });

  if (isCachedPublicBundleValid(cached, publishedAt, config)) {
    publicBundleMemoryCache = {
      expiresAt: Date.now() + HOME_CONFIG_PUBLIC_MEMORY_CACHE_MS,
      bundle: cached as HomeConfigPublicBundle,
    };
    return publicBundleMemoryCache.bundle;
  }

  console.warn('[home-config] public bundle missing or stale; returning safe fallback until admin publishes a validated snapshot');
  return publicBundleMemoryCache?.bundle || buildEmergencyPublicBundle();
}

async function buildHomePageSnapshot() {
  if (homePageSnapshotMemoryCache && homePageSnapshotMemoryCache.expiresAt > Date.now()) {
    return homePageSnapshotMemoryCache.snapshot;
  }

  const config = await getStoredPublishedConfig();
  const publishedAt = config.updatedAt || null;
  const cached = await withTimeout(
    readConfigValue<any>(HOME_PAGE_SNAPSHOT_KEY),
    HOME_CONFIG_ADMIN_CONFIG_TIMEOUT_MS,
    `Home page snapshot key ${HOME_PAGE_SNAPSHOT_KEY}`,
  ).catch((error) => {
    console.warn('[home-page] snapshot cache fallback:', error);
    return null;
  });

  if (isHomePageSnapshotValid(cached, publishedAt)) {
    const normalized = normalizeHomePageSnapshot(cached as HomePageSnapshot);
    homePageSnapshotMemoryCache = {
      expiresAt: Date.now() + HOME_PAGE_SNAPSHOT_MEMORY_CACHE_MS,
      snapshot: normalized,
    };
    return normalized;
  }

  const bundle = await withTimeout(
    readConfigValue<any>(HOME_CONFIG_PUBLIC_BUNDLE_KEY),
    HOME_CONFIG_ADMIN_CONFIG_TIMEOUT_MS,
    `Home page public bundle key ${HOME_CONFIG_PUBLIC_BUNDLE_KEY}`,
  ).catch((error) => {
    console.warn('[home-page] public bundle read fallback:', error);
    return null;
  });

  if (isCachedPublicBundleValid(bundle, publishedAt, config)) {
    return buildHomePageSnapshotFromBundle(bundle as HomeConfigPublicBundle);
  }

  try {
    const resolved = await resolveConfig(config, { cachedOnlyIntelligence: HOME_CONFIG_CACHED_INTELLIGENCE_ONLY });
    return buildHomePageSnapshotFromBundle({
      config,
      resolved,
      meta: {
        publishedAt,
        generatedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.warn('[home-page] computed fallback unavailable:', error);
  }

  return buildHomePageSnapshotFromBundle(publicBundleMemoryCache?.bundle || buildEmergencyPublicBundle());
}

function createEmptyResolvedSection(active: boolean): HomeConfigResolvedSection {
  return {
    active,
    matchedBeforeLimit: 0,
    products: [],
    missingPinnedSkus: [],
    excludedSkus: [],
  };
}

function buildEmergencyPublicBundle(): HomeConfigPublicBundle {
  return {
    config: cloneJson(DEFAULT_HOME_CONFIG),
    resolved: {
      offers: createEmptyResolvedSection(Boolean(DEFAULT_HOME_CONFIG.offers.enabled)),
      popular: createEmptyResolvedSection(Boolean(DEFAULT_HOME_CONFIG.popular.enabled)),
      newArrivals: createEmptyResolvedSection(Boolean(DEFAULT_HOME_CONFIG.newArrivals.enabled)),
    },
    meta: {
      publishedAt: null,
      generatedAt: new Date().toISOString(),
    },
  };
}

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  const timeout = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });

  return await Promise.race([promise, timeout]);
}

async function buildPublicBundleFast() {
  try {
    return await withTimeout(
      buildPublicBundle(),
      HOME_CONFIG_PUBLIC_TIMEOUT_MS,
      'Home public bundle',
    );
  } catch (error) {
    console.error('[home-config] using emergency public bundle:', error);
    return publicBundleMemoryCache?.bundle || buildEmergencyPublicBundle();
  }
}

async function buildHomePageSnapshotFast() {
  try {
    return await withTimeout(
      buildHomePageSnapshot(),
      HOME_PAGE_PUBLIC_TIMEOUT_MS,
      'Home page snapshot',
    );
  } catch (error) {
    console.error('[home-page] using last available snapshot:', error);
    const cached = await withTimeout(
      readConfigValue<any>(HOME_PAGE_SNAPSHOT_KEY),
      HOME_CONFIG_ADMIN_CONFIG_TIMEOUT_MS,
      `Home page last snapshot key ${HOME_PAGE_SNAPSHOT_KEY}`,
    ).catch(() => null);
    if (isHomePageSnapshotValid(cached, cached?.meta?.publishedAt || null)) {
      return normalizeHomePageSnapshot(cached as HomePageSnapshot);
    }
    if (homePageSnapshotMemoryCache?.snapshot) return normalizeHomePageSnapshot(homePageSnapshotMemoryCache.snapshot);
    const bundle = publicBundleMemoryCache?.bundle || buildEmergencyPublicBundle();
    return buildHomePageSnapshotFromBundle(bundle);
  }
}

homeConfigPublic.get('/', async (c) => {
  try {
    c.header('Cache-Control', 'public, max-age=60, s-maxage=60, stale-while-revalidate=300');
    return c.json(await buildPublicBundleFast());
  } catch (error: any) {
    console.error('[home-config] public GET failed:', error);
    return c.json(buildEmergencyPublicBundle());
  }
});

homeConfigPublic.get('/page', async (c) => {
  try {
    c.header('Cache-Control', 'public, max-age=60, s-maxage=60, stale-while-revalidate=300');
    return c.json(await buildHomePageSnapshotFast());
  } catch (error: any) {
    console.error('[home-page] public GET /home-config/page failed:', error);
    const bundle = publicBundleMemoryCache?.bundle || buildEmergencyPublicBundle();
    return c.json(await buildHomePageSnapshotFromBundle(bundle));
  }
});

homePagePublic.get('/', async (c) => {
  try {
    c.header('Cache-Control', 'public, max-age=60, s-maxage=60, stale-while-revalidate=300');
    return c.json(await buildHomePageSnapshotFast());
  } catch (error: any) {
    console.error('[home-page] public GET failed:', error);
    const bundle = publicBundleMemoryCache?.bundle || buildEmergencyPublicBundle();
    return c.json(await buildHomePageSnapshotFromBundle(bundle));
  }
});

homeConfigAdmin.get('/', async (c) => {
  try {
    return c.json(await buildAdminBundle());
  } catch (error: any) {
    console.error('[home-config] admin GET failed:', error);
    return c.json({ error: error?.message || 'Falha ao carregar configuracao da home' }, 500);
  }
});

homeConfigAdmin.get('/draft', async (c) => {
  try {
    const draft = await getStoredDraftConfig();
    const published = await getStoredPublishedConfig();
    return c.json({
      draft,
      resolved: buildAdminSafeResolved(draft),
      meta: {
        draftUpdatedAt: draft.updatedAt || null,
        draftUpdatedBy: draft.updatedBy || null,
        publishedAt: published.updatedAt || null,
        publishedBy: published.updatedBy || null,
        hasDraftChanges: !configsAreEquivalent(draft, published),
        resolutionWarning: 'Rascunho carregado em modo seguro. Use "Pre-visualizar" para resolver os produtos sob demanda.',
        resolutionDegraded: true,
      },
    });
  } catch (error: any) {
    console.error('[home-config] admin GET /draft failed:', error);
    return c.json({ error: error?.message || 'Falha ao carregar rascunho da home' }, 500);
  }
});

async function persistDraftFromRequest(req: Request) {
  const body = await req.json().catch(() => ({}));
  const nextConfig = sanitizeHomeConfig(body?.config || body?.draft || body || {});
  const adminToken = String(req.headers.get('X-Admin-Token') || '').trim();
  const storedConfig: HomePageConfig = {
    ...nextConfig,
    updatedAt: new Date().toISOString(),
    updatedBy: adminToken ? 'admin' : 'unknown',
  };
  await writeConfigValue(HOME_CONFIG_DRAFT_KEY, storedConfig);
  return storedConfig;
}

homeConfigAdmin.post('/', async (c) => {
  try {
    await persistDraftFromRequest(c.req.raw);
    return c.json(await buildAdminBundle());
  } catch (error: any) {
    console.error('[home-config] admin POST failed:', error);
    return c.json({ error: error?.message || 'Falha ao salvar rascunho da home' }, 500);
  }
});

homeConfigAdmin.post('/draft', async (c) => {
  try {
    await persistDraftFromRequest(c.req.raw);
    return c.json(await buildAdminBundle());
  } catch (error: any) {
    console.error('[home-config] admin POST /draft failed:', error);
    return c.json({ error: error?.message || 'Falha ao salvar rascunho da home' }, 500);
  }
});

homeConfigAdmin.post('/preview', async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const config = body?.config ? sanitizeHomeConfig(body.config) : await getStoredDraftConfig();
    const resolvedResult = await resolveConfigForAdmin(config);
    const previewBundle: HomeConfigPublicBundle = {
      config,
      resolved: resolvedResult.resolved,
      meta: {
        publishedAt: config.updatedAt || null,
        generatedAt: new Date().toISOString(),
      },
    };
    return c.json({
      config,
      resolved: resolvedResult.resolved,
      snapshot: await buildHomePageSnapshotFromBundle(previewBundle).catch(() => null),
      meta: {
        resolutionWarning: resolvedResult.warning,
        resolutionDegraded: resolvedResult.degraded,
      },
    });
  } catch (error: any) {
    console.error('[home-config] admin POST /preview failed:', error);
    return c.json({ error: error?.message || 'Falha ao gerar preview da home' }, 500);
  }
});

homeConfigAdmin.post('/publish', async (c) => {
  try {
    const draft = await getStoredDraftConfig();
    const publishedConfig: HomePageConfig = {
      ...draft,
      updatedAt: new Date().toISOString(),
      updatedBy: draft.updatedBy || 'admin',
    };
    const bundle = await persistPublicBundle(publishedConfig, { cachedOnlyIntelligence: false });
    await persistHomePageSnapshot(bundle);
    await writeConfigValue(HOME_CONFIG_PUBLISHED_KEY, publishedConfig);
    return c.json(await buildAdminBundle());
  } catch (error: any) {
    console.error('[home-config] admin POST /publish failed:', error);
    return c.json({ error: error?.message || 'Falha ao publicar configuracao da home' }, 500);
  }
});

homeConfigAdmin.post('/restore-last-published', async (c) => {
  try {
    const published = await getStoredPublishedConfig();
    await writeConfigValue(HOME_CONFIG_DRAFT_KEY, {
      ...published,
      updatedAt: new Date().toISOString(),
      updatedBy: 'admin',
    });
    return c.json(await buildAdminBundle());
  } catch (error: any) {
    console.error('[home-config] admin POST /restore-last-published failed:', error);
    return c.json({ error: error?.message || 'Falha ao restaurar a ultima publicacao da home' }, 500);
  }
});
