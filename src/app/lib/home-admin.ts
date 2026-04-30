import { projectId } from '../../../utils/supabase/info';
import { adminFetch } from './admin-auth';
import { resolveHomeSectionsForCompat } from './home-merchandising-resolver';
import type {
  HomeAdminConfigBundle,
  HomeConfigResponse,
  HomePageConfig,
  HomePickerProduct,
} from './home-config';

const ADMIN_PRODUCTS_API = `https://${projectId}.supabase.co/functions/v1/make-server-1d6e33e0/admin/products`;
const ADMIN_HOME_CONFIG_API = `https://${projectId}.supabase.co/functions/v1/home-config-1d6e33e0/admin`;
const HOME_POPULAR_MIN_PRODUCTS = 15;

type LegacyHomeSection = {
  mode?: 'manual' | 'manual_first' | 'rule' | string;
  rule?: string;
  manualSkus?: string[];
  limit?: number;
};

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

function createDefaultSection(
  sectionKey: 'offers' | 'popular' | 'newArrivals',
  legacy?: LegacyHomeSection,
): HomePageConfig['offers'] {
  const source =
    legacy?.mode === 'manual'
      ? 'manual_only'
      : legacy?.rule === 'search_promotions'
        ? 'top_promotions'
        : legacy?.rule === 'search_top'
          ? 'top_searched'
          : legacy?.rule === 'newest'
            ? 'catalog'
            : sectionKey === 'offers'
              ? 'top_promotions'
              : sectionKey === 'popular'
                ? 'top_searched'
                : 'catalog';

  const sort =
    legacy?.rule === 'price_desc'
      ? 'price_desc'
      : legacy?.rule === 'newest'
        ? 'newest_desc'
        : sectionKey === 'newArrivals'
          ? 'newest_desc'
          : 'intelligence_rank';

  const title =
    sectionKey === 'offers'
      ? 'Ofertas especiais'
      : sectionKey === 'popular'
        ? 'Mais procurados'
        : 'Novidades';

  const subtitle =
    sectionKey === 'offers'
      ? 'Promocoes inteligentes com prioridade para produtos mais buscados.'
      : sectionKey === 'popular'
        ? 'Os produtos mais buscados pelos clientes, com estoque disponivel.'
        : 'Itens recem-chegados ao catalogo, prontos para destaque.';

  return {
    enabled: true,
    title,
    subtitle,
    limit: sectionKey === 'popular'
      ? Math.max(HOME_POPULAR_MIN_PRODUCTS, Math.min(Number(legacy?.limit || HOME_POPULAR_MIN_PRODUCTS), 24))
      : Math.max(1, Math.min(Number(legacy?.limit || 10), 24)),
    source,
    sort,
    lookbackDays: 30,
    ruleGroups: [
      {
        id: `${sectionKey}-default-group`,
        conditions: [
          { id: `${sectionKey}-default-stock`, type: 'in_stock' },
          ...(sectionKey === 'offers' ? [{ id: `${sectionKey}-default-promo`, type: 'has_promotion' as const }] : []),
        ],
      },
    ],
    pinnedSkus: normalizeSkuList(legacy?.manualSkus),
    excludedSkus: [],
    schedule: null,
  };
}

function normalizeLegacyConfig(config: any): HomePageConfig {
  return {
    departments: {
      selectedCategoryIds: Array.isArray(config?.departments?.selectedCategoryIds)
        ? config.departments.selectedCategoryIds.map((value: any) => String(value))
        : [],
      limit: Math.max(1, Math.min(Number(config?.departments?.limit || 15), 20)),
    },
    smallBanners: Array.isArray(config?.smallBanners) ? config.smallBanners : [],
    offers: createDefaultSection('offers', config?.offers),
    popular: createDefaultSection('popular', config?.popular),
    newArrivals: createDefaultSection('newArrivals', config?.newArrivals),
    updatedAt: config?.updatedAt || null,
    updatedBy: config?.updatedBy || null,
  };
}

function normalizeResolvedSection(section: any) {
  return {
    active: true,
    matchedBeforeLimit: Array.isArray(section?.products) ? section.products.length : 0,
    products: Array.isArray(section?.products)
      ? section.products.map((product: any) => ({
          ...product,
          reason: product?.reason || 'rule',
          reasonLabel: product?.reasonLabel || 'Regra',
        }))
      : [],
    missingPinnedSkus: Array.isArray(section?.missingPinnedSkus)
      ? section.missingPinnedSkus
      : Array.isArray(section?.missingSkus)
        ? section.missingSkus
        : [],
    excludedSkus: Array.isArray(section?.excludedSkus) ? section.excludedSkus : [],
  };
}

function sectionNeedsFallback(section: any) {
  return !section || !Array.isArray(section.products) || section.products.length === 0;
}

async function supplementResolvedSections(config: HomePageConfig, resolved: any) {
  const incoming = {
    offers: normalizeResolvedSection(resolved?.offers),
    popular: normalizeResolvedSection(resolved?.popular),
    newArrivals: normalizeResolvedSection(resolved?.newArrivals),
  };

  if (!sectionNeedsFallback(incoming.offers) && !sectionNeedsFallback(incoming.popular) && !sectionNeedsFallback(incoming.newArrivals)) {
    return incoming;
  }

  try {
    const fallback = await resolveHomeSectionsForCompat(config, incoming);
    return {
      offers: sectionNeedsFallback(incoming.offers) ? fallback.offers : incoming.offers,
      popular: sectionNeedsFallback(incoming.popular) ? fallback.popular : incoming.popular,
      newArrivals: sectionNeedsFallback(incoming.newArrivals) ? fallback.newArrivals : incoming.newArrivals,
    };
  } catch (error) {
    console.warn('[home-admin] compat merchandising fallback skipped:', error);
    return incoming;
  }
}

async function normalizeLegacyPublicBundle(raw: HomeConfigResponse): Promise<HomeAdminConfigBundle> {
  const nextConfig = normalizeLegacyConfig(raw?.config || {});
  const nextResolved = await supplementResolvedSections(nextConfig, raw?.resolved || {});

  return {
    draft: nextConfig,
    published: nextConfig,
    resolvedDraft: nextResolved,
    resolvedPublished: nextResolved,
    meta: {
      draftUpdatedAt: nextConfig.updatedAt || null,
      draftUpdatedBy: nextConfig.updatedBy || null,
      publishedAt: nextConfig.updatedAt || null,
      publishedBy: nextConfig.updatedBy || null,
      hasDraftChanges: false,
    },
    legacyBackend: true,
  };
}

async function parseResponse<T>(response: Response): Promise<T> {
  const data = await response.json().catch(() => ({}));
  if (!response.ok || (data as any)?.error) {
    throw new Error((data as any)?.error || `HTTP ${response.status}`);
  }
  return data as T;
}

function shouldSkipCompatSupplement(data: any) {
  return Boolean(data?.meta?.resolutionDegraded);
}

export async function fetchHomeAdminBundle(): Promise<HomeAdminConfigBundle> {
  const response = await adminFetch(ADMIN_HOME_CONFIG_API);
  const data = await parseResponse<any>(response);
  if (data?.draft && data?.published && data?.meta) {
    if (shouldSkipCompatSupplement(data)) {
      return data as HomeAdminConfigBundle;
    }
    return {
      ...data,
      resolvedDraft: await supplementResolvedSections(data.draft, data.resolvedDraft),
      resolvedPublished: await supplementResolvedSections(data.published, data.resolvedPublished),
    } as HomeAdminConfigBundle;
  }
  return normalizeLegacyPublicBundle(data as HomeConfigResponse);
}

export async function saveHomeDraft(config: HomePageConfig): Promise<HomeAdminConfigBundle> {
  const response = await adminFetch(`${ADMIN_HOME_CONFIG_API}/draft`, {
    method: 'POST',
    body: JSON.stringify({ config }),
  });
  const data = await parseResponse<HomeAdminConfigBundle>(response);
  if (shouldSkipCompatSupplement(data)) {
    return data;
  }
  return {
    ...data,
    resolvedDraft: await supplementResolvedSections(data.draft, data.resolvedDraft),
    resolvedPublished: await supplementResolvedSections(data.published, data.resolvedPublished),
  };
}

export async function previewHomeDraft(config?: HomePageConfig): Promise<HomeConfigResponse> {
  const response = await adminFetch(`${ADMIN_HOME_CONFIG_API}/preview`, {
    method: 'POST',
    body: JSON.stringify(config ? { config } : {}),
  });
  const data = await parseResponse<any>(response);
  if (shouldSkipCompatSupplement(data)) {
    return data as HomeConfigResponse;
  }
  return {
    ...data,
    resolved: await supplementResolvedSections(data.config, data.resolved),
  };
}

export async function publishHomeDraft(): Promise<HomeAdminConfigBundle> {
  const response = await adminFetch(`${ADMIN_HOME_CONFIG_API}/publish`, {
    method: 'POST',
  });
  const data = await parseResponse<HomeAdminConfigBundle>(response);
  if (shouldSkipCompatSupplement(data)) {
    return data;
  }
  return {
    ...data,
    resolvedDraft: await supplementResolvedSections(data.draft, data.resolvedDraft),
    resolvedPublished: await supplementResolvedSections(data.published, data.resolvedPublished),
  };
}

export async function restorePublishedHome(): Promise<HomeAdminConfigBundle> {
  const response = await adminFetch(`${ADMIN_HOME_CONFIG_API}/restore-last-published`, {
    method: 'POST',
  });
  const data = await parseResponse<HomeAdminConfigBundle>(response);
  if (shouldSkipCompatSupplement(data)) {
    return data;
  }
  return {
    ...data,
    resolvedDraft: await supplementResolvedSections(data.draft, data.resolvedDraft),
    resolvedPublished: await supplementResolvedSections(data.published, data.resolvedPublished),
  };
}

export async function searchHomePickerProducts(query: string): Promise<HomePickerProduct[]> {
  const qs = new URLSearchParams({
    q: query,
    limit: '8',
    status: '1',
  });
  const response = await adminFetch(`${ADMIN_PRODUCTS_API}?${qs.toString()}`);
  const data = await parseResponse<{ hits?: HomePickerProduct[] }>(response);
  return data.hits || [];
}
