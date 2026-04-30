import { useEffect, useState } from 'react';
import {
  HOME_BANNERS_API,
  HOME_CATEGORY_IMAGES_API,
  HOME_CATEGORY_TREE_API,
  HOME_CONFIG_API,
  HOME_CONFIG_PUBLIC_HEADERS,
  HOME_PAGE_API,
} from './home-config-api';
import type {
  HomeConfigResponse,
  HomeConfigResolvedSection,
  HomeDepartmentSnapshot,
  HomeHeroBannerSnapshot,
  HomePageConfig,
  HomePageSnapshot,
} from './home-config';
import { fetchWithTimeout } from './fetch-with-timeout';
import {
  DEFAULT_HOME_CATEGORY_IMAGES,
  getHomeDepartmentCandidates,
  getRenderableCategoryImage,
  type HomeDepartmentCategoryNode,
} from './home-departments';

const HOME_PAGE_SNAPSHOT_CACHE_KEY = 'toyoparts:home-page-snapshot:v2';
const HOME_POPULAR_MIN_PRODUCTS = 15;
const HOME_PAGE_REQUEST_TIMEOUT_MS = 900;
const HOME_CONFIG_FALLBACK_TIMEOUT_MS = 700;
const HOME_BANNERS_TIMEOUT_MS = 6_000;
const HOME_CATEGORY_TREE_TIMEOUT_MS = 1_800;
const HOME_CATEGORY_IMAGES_TIMEOUT_MS = 600;
const HOME_DEPARTMENTS_REQUIRED = 15;

function emptyResolvedSection(active = true): HomeConfigResolvedSection {
  return {
    active,
    matchedBeforeLimit: 0,
    products: [],
    missingPinnedSkus: [],
    excludedSkus: [],
  };
}

function makeDefaultHomeConfig(): HomePageConfig {
  return {
    departments: {
      selectedCategoryIds: [],
      limit: 15,
    },
    smallBanners: [],
    offers: {
      enabled: true,
      title: 'Ofertas especiais',
      subtitle: 'Itens em promoção selecionados para a home.',
      limit: 10,
      source: 'top_promotions',
      sort: 'discount_desc',
      lookbackDays: 30,
      ruleGroups: [],
      pinnedSkus: [],
      excludedSkus: [],
    },
    popular: {
      enabled: true,
      title: 'Mais procurados',
      subtitle: 'Os produtos mais buscados pelos clientes recentemente.',
      limit: HOME_POPULAR_MIN_PRODUCTS,
      source: 'top_searched',
      sort: 'intelligence_rank',
      lookbackDays: 30,
      ruleGroups: [],
      pinnedSkus: [],
      excludedSkus: [],
    },
    newArrivals: {
      enabled: true,
      title: 'Novidades',
      subtitle: 'Últimos produtos cadastrados na Toyoparts.',
      limit: 10,
      source: 'catalog',
      sort: 'newest_desc',
      lookbackDays: 30,
      ruleGroups: [],
      pinnedSkus: [],
      excludedSkus: [],
    },
  };
}

function makeEmergencySnapshot(): HomePageSnapshot {
  const now = new Date().toISOString();
  const offers = emptyResolvedSection();
  const popular = emptyResolvedSection();
  const newArrivals = emptyResolvedSection();
  return {
    version: 1,
    config: makeDefaultHomeConfig(),
    resolved: {
      offers,
      popular,
      newArrivals,
    },
    heroBanners: [],
    departments: [],
    offers,
    popularProducts: popular,
    newArrivals,
    smallBanners: [],
    compatibilityBanner: { enabled: true },
    newsletter: { enabled: true },
    meta: {
      publishedAt: null,
      generatedAt: now,
      snapshotGeneratedAt: now,
      sources: {
        emergency: 'client',
      },
      warnings: ['client_emergency_snapshot'],
    },
  };
}

function isHomePageSnapshot(value: unknown): value is HomePageSnapshot {
  const snapshot = value as HomePageSnapshot | null;
  return Boolean(
    snapshot &&
    typeof snapshot === 'object' &&
    snapshot.version === 1 &&
    snapshot.config &&
    Array.isArray(snapshot.heroBanners) &&
    Array.isArray(snapshot.departments) &&
    Array.isArray(snapshot.popularProducts?.products) &&
    Array.isArray(snapshot.offers?.products) &&
    Array.isArray(snapshot.newArrivals?.products),
  );
}

function readCachedSnapshot(): HomePageSnapshot | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(HOME_PAGE_SNAPSHOT_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return isHomePageSnapshot(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function writeCachedSnapshot(snapshot: HomePageSnapshot) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(HOME_PAGE_SNAPSHOT_CACHE_KEY, JSON.stringify(snapshot));
  } catch {
    // localStorage is best-effort only.
  }
}

function withProducts(section: HomeConfigResolvedSection, products: any[]): HomeConfigResolvedSection {
  return {
    ...section,
    active: section?.active !== false,
    matchedBeforeLimit: Math.max(Number(section?.matchedBeforeLimit || 0), products.length),
    products,
    missingPinnedSkus: Array.isArray(section?.missingPinnedSkus) ? section.missingPinnedSkus : [],
    excludedSkus: Array.isArray(section?.excludedSkus) ? section.excludedSkus : [],
  };
}

function shouldRefreshPopularProducts(snapshot: HomePageSnapshot) {
  const popular = snapshot?.config?.popular;
  if (!popular || popular.enabled === false) return false;
  return String(popular.source || '').trim().toLowerCase() === 'top_searched';
}

function buildDepartmentHref(category: HomeDepartmentCategoryNode) {
  const params = new URLSearchParams({ category_name: category.name });
  if (!String(category.id).startsWith('-')) params.set('category', String(category.id));
  return `/busca?${params.toString()}`;
}

async function fetchPublicHeroBanners(): Promise<HomeHeroBannerSnapshot[]> {
  try {
    const response = await fetchWithTimeout(
      HOME_BANNERS_API,
      { headers: HOME_CONFIG_PUBLIC_HEADERS },
      HOME_BANNERS_TIMEOUT_MS,
    );
    if (!response.ok) return [];
    const data = await response.json().catch(() => ({}));
    return Array.isArray(data?.banners)
      ? data.banners.filter((banner: HomeHeroBannerSnapshot) => banner?.active !== false && Boolean(banner?.desktopImageSrc))
      : [];
  } catch {
    return [];
  }
}

async function fetchPublicDepartmentImages() {
  try {
    const response = await fetchWithTimeout(
      HOME_CATEGORY_IMAGES_API,
      { headers: HOME_CONFIG_PUBLIC_HEADERS },
      HOME_CATEGORY_IMAGES_TIMEOUT_MS,
    );
    if (!response.ok) return DEFAULT_HOME_CATEGORY_IMAGES;
    const data = await response.json().catch(() => ({}));
    return data?.images && typeof data.images === 'object'
      ? { ...DEFAULT_HOME_CATEGORY_IMAGES, ...data.images }
      : DEFAULT_HOME_CATEGORY_IMAGES;
  } catch {
    return DEFAULT_HOME_CATEGORY_IMAGES;
  }
}

async function fetchPublicDepartments(): Promise<HomeDepartmentSnapshot[]> {
  try {
    const [treeResponse, images] = await Promise.all([
      fetchWithTimeout(
        HOME_CATEGORY_TREE_API,
        { headers: HOME_CONFIG_PUBLIC_HEADERS },
        HOME_CATEGORY_TREE_TIMEOUT_MS,
      ),
      fetchPublicDepartmentImages(),
    ]);

    if (!treeResponse.ok) return [];
    const tree = await treeResponse.json().catch(() => null);
    const categories = getHomeDepartmentCandidates(tree);
    const used = new Set<string>();

    return categories
      .map((category) => {
        const imageUrl = getRenderableCategoryImage(category.name, images);
        const productCount = Number(category.product_count || 0);
        if (!imageUrl || productCount <= 0) return null;
        const key = String(category.name || '').trim().toLowerCase();
        if (!key || used.has(key)) return null;
        used.add(key);
        return {
          id: String(category.id),
          name: category.name,
          imageUrl,
          productCount,
          href: buildDepartmentHref(category),
          source: 'automatic' as const,
        };
      })
      .filter(Boolean)
      .slice(0, HOME_DEPARTMENTS_REQUIRED) as HomeDepartmentSnapshot[];
  } catch {
    return [];
  }
}

async function completeSnapshotAssets(snapshot: HomePageSnapshot): Promise<HomePageSnapshot> {
  const needsBanners = (snapshot.heroBanners?.length || 0) === 0;
  const needsDepartments = (snapshot.departments?.length || 0) < HOME_DEPARTMENTS_REQUIRED;
  if (!needsBanners && !needsDepartments) return snapshot;

  const [heroBanners, departments] = await Promise.all([
    needsBanners ? fetchPublicHeroBanners() : Promise.resolve(snapshot.heroBanners || []),
    needsDepartments ? fetchPublicDepartments() : Promise.resolve(snapshot.departments || []),
  ]);

  return {
    ...snapshot,
    heroBanners: heroBanners.length > 0 ? heroBanners : snapshot.heroBanners,
    departments: departments.length > 0 ? departments : snapshot.departments,
    meta: {
      ...snapshot.meta,
      warnings: Array.from(new Set([
        ...(snapshot.meta?.warnings || []),
        ...(needsBanners && heroBanners.length > 0 ? ['client_banner_fallback'] : []),
        ...(needsDepartments && departments.length > 0 ? ['client_departments_fallback'] : []),
      ])),
    },
  };
}

function needsClientProductResolution(snapshot: HomePageSnapshot) {
  return (
    (snapshot.popularProducts?.products?.length || 0) < HOME_POPULAR_MIN_PRODUCTS ||
    (snapshot.offers?.products?.length || 0) === 0 ||
    (snapshot.newArrivals?.products?.length || 0) === 0
  );
}

async function completeSnapshot(snapshot: HomePageSnapshot): Promise<HomePageSnapshot> {
  const withResolvedProducts = await completeSnapshotProducts(snapshot);
  return completeSnapshotAssets(withResolvedProducts);
}

async function completeSnapshotProducts(snapshot: HomePageSnapshot): Promise<HomePageSnapshot> {
  const refreshPopular = shouldRefreshPopularProducts(snapshot);
  if (!needsClientProductResolution(snapshot) && !refreshPopular) return snapshot;

  try {
    const { resolveHomeProductsForHome } = await import('./home-merchandising-resolver');
    const resolvedProducts = await resolveHomeProductsForHome(
      snapshot.config,
      refreshPopular ? { ...snapshot.resolved, popular: null } : snapshot.resolved,
    );

    const resolvedPopular = Array.isArray(resolvedProducts.popular) ? resolvedProducts.popular : [];
    const popularProducts = refreshPopular
      ? (
        resolvedPopular.length >= HOME_POPULAR_MIN_PRODUCTS
          ? withProducts(snapshot.popularProducts, resolvedPopular)
          : (snapshot.popularProducts?.products?.length || 0) >= HOME_POPULAR_MIN_PRODUCTS
            ? snapshot.popularProducts
            : withProducts(snapshot.popularProducts, resolvedPopular)
      )
      : (snapshot.popularProducts?.products?.length || 0) >= HOME_POPULAR_MIN_PRODUCTS
        ? snapshot.popularProducts
        : withProducts(snapshot.popularProducts, resolvedPopular);
    const offers = (snapshot.offers?.products?.length || 0) > 0
      ? snapshot.offers
      : withProducts(snapshot.offers, resolvedProducts.offers);
    const newArrivals = (snapshot.newArrivals?.products?.length || 0) > 0
      ? snapshot.newArrivals
      : withProducts(snapshot.newArrivals, resolvedProducts.newArrivals);

    return {
      ...snapshot,
      resolved: {
        offers,
        popular: popularProducts,
        newArrivals,
      },
      offers,
      popularProducts,
      newArrivals,
      meta: {
        ...snapshot.meta,
        sources: {
          ...(snapshot.meta?.sources || {}),
          ...(refreshPopular && resolvedPopular.length >= HOME_POPULAR_MIN_PRODUCTS
            ? { popularProducts: 'client_search_intelligence_live' }
            : {}),
        },
        warnings: Array.from(new Set([...(snapshot.meta?.warnings || []), 'client_product_resolution_fallback'])),
      },
    };
  } catch (error) {
    console.error('[home-page] client product resolution failed:', error);
    return snapshot;
  }
}

function adaptLegacyHomeConfig(data: HomeConfigResponse): HomePageSnapshot | null {
  if (!data?.config || !data?.resolved) return null;
  const now = new Date().toISOString();
  return {
    version: 1,
    config: data.config,
    resolved: data.resolved,
    heroBanners: [],
    departments: [],
    offers: data.resolved.offers,
    popularProducts: data.resolved.popular,
    newArrivals: data.resolved.newArrivals,
    smallBanners: data.config.smallBanners || [],
    compatibilityBanner: { enabled: true },
    newsletter: { enabled: true },
    meta: {
      publishedAt: data.config.updatedAt || null,
      generatedAt: now,
      snapshotGeneratedAt: now,
      sources: {
        legacy: 'home-config',
      },
      warnings: ['legacy_home_config_fallback'],
    },
  };
}

export function useHomePageSnapshot() {
  const initialSnapshot = readCachedSnapshot();
  const [snapshot, setSnapshot] = useState<HomePageSnapshot | null>(() => initialSnapshot);
  const [loading, setLoading] = useState(() => !initialSnapshot);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      try {
        const response = await fetchWithTimeout(
          HOME_PAGE_API,
          { headers: HOME_CONFIG_PUBLIC_HEADERS },
          HOME_PAGE_REQUEST_TIMEOUT_MS,
        );

        if (!response.ok) {
          throw new Error(`Home snapshot HTTP ${response.status}`);
        }

        const data = await response.json();
        if (!isHomePageSnapshot(data)) {
          throw new Error('Home snapshot inválido');
        }

        const completed = await completeSnapshot(data);
        if (!mounted) return;
        writeCachedSnapshot(completed);
        setSnapshot(completed);
        setError(null);
      } catch (snapshotError) {
        try {
          const legacyResponse = await fetchWithTimeout(
            HOME_CONFIG_API,
            { headers: HOME_CONFIG_PUBLIC_HEADERS },
            HOME_CONFIG_FALLBACK_TIMEOUT_MS,
          );
          if (!legacyResponse.ok) throw snapshotError;
          const legacy = adaptLegacyHomeConfig(await legacyResponse.json());
          if (!legacy) throw snapshotError;
          const completedLegacy = await completeSnapshot(legacy);
          if (!mounted) return;
          writeCachedSnapshot(completedLegacy);
          setSnapshot((current) => current && !needsClientProductResolution(current) ? current : completedLegacy);
          setError(snapshotError instanceof Error ? snapshotError : new Error('Falha ao carregar a home'));
        } catch {
          const cached = readCachedSnapshot();
          if (cached) {
            const completedCached = await completeSnapshot(cached);
            if (!mounted) return;
            setSnapshot(completedCached);
          } else if (!mounted) {
            return;
          } else {
            const emergency = await completeSnapshot(makeEmergencySnapshot());
            if (!mounted) return;
            writeCachedSnapshot(emergency);
            setSnapshot(emergency);
          }
          setError(snapshotError instanceof Error ? snapshotError : new Error('Falha ao carregar a home'));
        }
      } finally {
        if (mounted) setLoading(false);
      }
    };

    void load();

    return () => {
      mounted = false;
    };
  }, []);

  return { snapshot, loading, error };
}
