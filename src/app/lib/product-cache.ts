// ─── Product Cache Layer ─────────────────────────────────────────────────────
// Uses the Cache API to store product data + snapshot HTML for offline access.
// Works alongside the Service Worker for fast loading and offline resilience.
//
// Strategy:
//   - product:detail:{sku}  → JSON product data (from Meilisearch/KV)
//   - snapshot:{sku}        → Full HTML snapshot (from server SSG)
//
// The cache is populated:
//   1. On-demand: when a user visits a product page
//   2. Prefetch: popular products are cached in the background
//   3. Bulk: admin triggers via SSG admin page

import { projectId, publicAnonKey } from '../../../utils/supabase/info';

const API_BASE = `https://${projectId}.supabase.co/functions/v1/make-server-1d6e33e0`;
const CACHE_NAME = 'toyoparts-product-v1';
const SNAPSHOT_CACHE_NAME = 'toyoparts-snapshots-v1';
const PRODUCT_CACHE_TTL = 24 * 60 * 60 * 1000; // 24h
const MAX_PREFETCH = 200; // Max products to prefetch at once

// ─── Cache API Helpers ──────────────────────────────────────────────────────

async function getCache(name: string): Promise<Cache | null> {
  try {
    return await caches.open(name);
  } catch {
    return null; // Cache API not available (e.g., non-HTTPS)
  }
}

// ─── Product Data Cache ─────────────────────────────────────────────────────

export async function cacheProductData(sku: string, data: any): Promise<void> {
  const cache = await getCache(CACHE_NAME);
  if (!cache) return;

  const key = `/cache/product/${sku}`;
  const response = new Response(JSON.stringify({
    data,
    cached_at: Date.now(),
  }), {
    headers: { 'Content-Type': 'application/json' },
  });

  await cache.put(key, response);
}

export async function getCachedProduct(sku: string): Promise<any | null> {
  const cache = await getCache(CACHE_NAME);
  if (!cache) return null;

  const key = `/cache/product/${sku}`;
  const response = await cache.match(key);
  if (!response) return null;

  try {
    const { data, cached_at } = await response.json();
    // Check TTL
    if (Date.now() - cached_at > PRODUCT_CACHE_TTL) {
      await cache.delete(key);
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

// ─── Snapshot HTML Cache ────────────────────────────────────────────────────

export async function cacheSnapshot(sku: string, html: string): Promise<void> {
  const cache = await getCache(SNAPSHOT_CACHE_NAME);
  if (!cache) return;

  const key = `/cache/snapshot/${sku}`;
  const response = new Response(html, {
    headers: {
      'Content-Type': 'text/html',
      'X-Cached-At': String(Date.now()),
    },
  });

  await cache.put(key, response);
}

export async function getCachedSnapshot(sku: string): Promise<string | null> {
  const cache = await getCache(SNAPSHOT_CACHE_NAME);
  if (!cache) return null;

  const key = `/cache/snapshot/${sku}`;
  const response = await cache.match(key);
  if (!response) return null;

  const cachedAt = Number(response.headers.get('X-Cached-At') || 0);
  if (Date.now() - cachedAt > PRODUCT_CACHE_TTL) {
    await cache.delete(key);
    return null;
  }

  return response.text();
}

// ─── Prefetch: Batch pre-cache product snapshots from manifest ──────────────

export async function prefetchSnapshots(opts?: {
  limit?: number;
  onProgress?: (done: number, total: number) => void;
}): Promise<{ cached: number; errors: number }> {
  const limit = opts?.limit ?? MAX_PREFETCH;

  try {
    // Fetch manifest of available snapshots
    const res = await fetch(`${API_BASE}/snapshot/manifest`, {
      headers: { Authorization: `Bearer ${publicAnonKey}` },
    });
    if (!res.ok) throw new Error(`Manifest fetch failed: ${res.status}`);

    const manifest = await res.json();
    const urls: { sku: string }[] = (manifest.urls || []).slice(0, limit);

    if (urls.length === 0) return { cached: 0, errors: 0 };

    const snapshotCache = await getCache(SNAPSHOT_CACHE_NAME);
    if (!snapshotCache) return { cached: 0, errors: 0 };

    let cached = 0;
    let errors = 0;

    // Process in small batches of 5 concurrent requests
    for (let i = 0; i < urls.length; i += 5) {
      const batch = urls.slice(i, i + 5);

      await Promise.allSettled(
        batch.map(async ({ sku }) => {
          try {
            // Check if already cached
            const existing = await snapshotCache.match(`/cache/snapshot/${sku}`);
            if (existing) {
              const cachedAt = Number(existing.headers.get('X-Cached-At') || 0);
              if (Date.now() - cachedAt < PRODUCT_CACHE_TTL) {
                cached++; // Already fresh
                return;
              }
            }

            const snapRes = await fetch(`${API_BASE}/snapshot/product/${sku}`, {
              headers: { Authorization: `Bearer ${publicAnonKey}` },
            });
            if (snapRes.ok) {
              const html = await snapRes.text();
              await cacheSnapshot(sku, html);
              cached++;
            } else {
              errors++;
            }
          } catch {
            errors++;
          }
        })
      );

      opts?.onProgress?.(Math.min(i + batch.length, urls.length), urls.length);
    }

    console.log(`[ProductCache] Prefetched ${cached} snapshots, ${errors} errors`);
    return { cached, errors };
  } catch (e: any) {
    console.warn('[ProductCache] Prefetch error:', e.message);
    return { cached: 0, errors: 0 };
  }
}

// ─── Cache size info ────────────────────────────────────────────────────────

export async function getCacheStats(): Promise<{
  productCount: number;
  snapshotCount: number;
  estimatedSizeMB: number;
}> {
  let productCount = 0;
  let snapshotCount = 0;
  let estimatedSizeMB = 0;

  try {
    const productCache = await getCache(CACHE_NAME);
    if (productCache) {
      const keys = await productCache.keys();
      productCount = keys.length;
    }

    const snapshotCache = await getCache(SNAPSHOT_CACHE_NAME);
    if (snapshotCache) {
      const keys = await snapshotCache.keys();
      snapshotCount = keys.length;
    }

    // Estimate: ~5KB per product, ~15KB per snapshot
    estimatedSizeMB = Number(((productCount * 5 + snapshotCount * 15) / 1024).toFixed(1));
  } catch { /* Cache API not available */ }

  return { productCount, snapshotCount, estimatedSizeMB };
}

// ─── Clear all caches ───────────────────────────────────────────────────────

export async function clearAllCaches(): Promise<void> {
  try {
    await caches.delete(CACHE_NAME);
    await caches.delete(SNAPSHOT_CACHE_NAME);
    console.log('[ProductCache] All caches cleared');
  } catch { /* ignore */ }
}

// ─── Online/Offline detection ───────────────────────────────────────────────

export function isOnline(): boolean {
  return navigator.onLine !== false;
}

export function onOnlineStatusChange(callback: (online: boolean) => void): () => void {
  const onOnline = () => callback(true);
  const onOffline = () => callback(false);

  window.addEventListener('online', onOnline);
  window.addEventListener('offline', onOffline);

  return () => {
    window.removeEventListener('online', onOnline);
    window.removeEventListener('offline', onOffline);
  };
}
