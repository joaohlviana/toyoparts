import { projectId, publicAnonKey } from '@/lib/supabase-info';
import type { BannerRecord, CategoryNode, SearchResponse, SeoProduct } from '@/lib/types';

const API_BASE = `https://${projectId}.supabase.co/functions/v1/make-server-1d6e33e0`;
type FetchConfig = RequestInit & { next?: { revalidate?: number } };

const defaultHeaders: HeadersInit = {
  Authorization: `Bearer ${publicAnonKey}`,
  apikey: publicAnonKey,
  'Content-Type': 'application/json',
};

export class CatalogApiError extends Error {
  constructor(public readonly status: number, path: string) {
    super(`API ${path} returned HTTP ${status}`);
    this.name = 'CatalogApiError';
  }
}

async function apiFetch<T>(
  path: string,
  init?: FetchConfig
): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      ...defaultHeaders,
      ...(init?.headers || {}),
    },
  });

  if (!response.ok) {
    throw new CatalogApiError(response.status, path);
  }

  return response.json() as Promise<T>;
}

export async function searchCatalog(params: {
  q?: string;
  limit?: number;
  offset?: number;
  sort?: string;
  inStock?: boolean;
  categories?: string[];
  categoryNames?: string[];
  modelos?: string[];
  anos?: string[];
}, revalidate = 300): Promise<SearchResponse> {
  const qs = new URLSearchParams();

  if (params.q) qs.set('q', params.q);
  qs.set('limit', String(params.limit ?? 24));
  qs.set('offset', String(params.offset ?? 0));
  if (params.sort) qs.set('sort', params.sort);
  if (params.inStock) qs.set('inStock', 'true');
  if (params.categories?.length) qs.set('categories', params.categories.join(','));
  if (params.categoryNames?.length) qs.set('category_names', params.categoryNames.join(','));
  if (params.modelos?.length) qs.set('modelos', params.modelos.join(','));
  if (params.anos?.length) qs.set('anos', params.anos.join(','));

  return apiFetch<SearchResponse>(`/search?${qs.toString()}`, {
    next: { revalidate },
  });
}

export async function getCategoryTree(revalidate = 900): Promise<CategoryNode> {
  return apiFetch<CategoryNode>('/categories/tree', {
    next: { revalidate },
  });
}

export async function getCategoryImages(revalidate = 900): Promise<Record<string, string>> {
  const data = await apiFetch<{ images: Record<string, string> }>('/categories/images', {
    next: { revalidate },
  });
  return data.images || {};
}

export async function getBanners(revalidate = 300): Promise<BannerRecord[]> {
  const data = await apiFetch<{ banners: BannerRecord[] }>('/banners', {
    next: { revalidate },
  });
  return (data.banners || []).filter((banner) => banner.active).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

export async function getProductBySku(sku: string, revalidate = 300): Promise<SeoProduct> {
  return apiFetch<SeoProduct>(`/seo/product/${encodeURIComponent(sku)}`, {
    next: { revalidate },
  });
}

export function getLegacyOrigin() {
  return (process.env.LEGACY_ORIGIN || process.env.NEXT_PUBLIC_LEGACY_ORIGIN || '').replace(/\/$/, '');
}
