// ═══════════════════════════════════════════════════════════════════════════════
// Search Intelligence — Enterprise Product Analytics Layer
// ═══════════════════════════════════════════════════════════════════════════════
//
// Pilares:
//   1. Ingestão — /track/search, /track/search-click, /track/view
//   2. Processamento — Agregação incremental + cache
//   3. Ativação — /intelligence/* endpoints para dashboard + UX
//
// KV Key Patterns:
//   si:s:{YYYYMMDD}:{id}        → Search event
//   si:c:{YYYYMMDD}:{id}        → Search click event
//   si:v:{YYYYMMDD}:{id}        → Product view event
//   si:dedup:{session}:{sku}    → View dedupe (15min window)
//   si:agg:{YYYYMMDD}           → Daily aggregate (incremental)
//   si:term:{normalized}        → Per-term aggregate
//   si:cache:{endpoint}         → Dashboard cache
// ═══════════════════════════════════════════════════════════════════════════════

import { Hono } from 'npm:hono';
import * as kv from './kv_store.tsx';
import * as meili from './meilisearch.tsx';

const app = new Hono();
const MAGENTO_BASE_URL = 'https://www.toyoparts.com.br';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function today(): string {
  return new Date().toISOString().slice(0, 10).replace(/-/g, '');
}

function dateKey(d: Date): string {
  return d.toISOString().slice(0, 10).replace(/-/g, '');
}

function nanoid(len = 12): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  const arr = new Uint8Array(len);
  crypto.getRandomValues(arr);
  for (let i = 0; i < len; i++) result += chars[arr[i] % chars.length];
  return result;
}

/** Normalize query: lowercase, trim, collapse whitespace, remove accents */
function normalizeQuery(q: string): string {
  return q
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/[^\w\s\-]/g, '');
}

function daysBack(days: number): string[] {
  const result: string[] = [];
  const now = Date.now();
  for (let i = 0; i < days; i++) {
    const d = new Date(now - i * 86_400_000);
    result.push(dateKey(d));
  }
  return result;
}

function dateKeyToISO(dk: string): string {
  return `${dk.slice(0, 4)}-${dk.slice(4, 6)}-${dk.slice(6, 8)}`;
}

function getCustomAttr(product: any, code: string): any {
  return product?.custom_attributes?.find((attr: any) => attr?.attribute_code === code)?.value;
}

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function resolveInStock(product: any): boolean {
  if (typeof product?.in_stock === 'boolean') return product.in_stock;
  const stock = product?.extension_attributes?.stock;
  const raw = typeof stock === 'string'
    ? (() => {
        try { return JSON.parse(stock); } catch { return null; }
      })()
    : stock;
  const value = raw?.is_in_stock;
  return value === true || value === 1 || value === '1';
}

function resolveQty(product: any): number | null {
  const direct = toNumber(product?.qty);
  if (direct !== null) return direct;
  const stock = product?.extension_attributes?.stock;
  const raw = typeof stock === 'string'
    ? (() => {
        try { return JSON.parse(stock); } catch { return null; }
      })()
    : stock;
  return toNumber(raw?.qty);
}

function resolveImageUrl(product: any): string | null {
  if (product?.image_url && String(product.image_url).startsWith('http')) {
    return product.image_url;
  }

  if (Array.isArray(product?.images) && product.images[0]) {
    return product.images[0];
  }

  if (Array.isArray(product?.media_gallery_entries)) {
    const media = product.media_gallery_entries.find((entry: any) => !entry?.disabled && (!entry?.media_type || entry.media_type === 'image'));
    if (media?.file) {
      if (String(media.file).startsWith('http')) return media.file;
      return `${MAGENTO_BASE_URL}/pub/media/catalog/product${media.file}`;
    }
  }

  const imageAttr = getCustomAttr(product, 'image') ?? product?.image;
  if (imageAttr && imageAttr !== 'no_selection') {
    if (String(imageAttr).startsWith('http')) return imageAttr;
    return `${MAGENTO_BASE_URL}/pub/media/catalog/product${imageAttr}`;
  }

  return null;
}

function normalizeRelatedProduct(product: any, sourceTag: string, meta: Record<string, any> = {}) {
  const regularPrice = toNumber(product?.price) ?? 0;
  const specialPrice = toNumber(product?.special_price);
  const validSpecialPrice = specialPrice && specialPrice > 0 && specialPrice < regularPrice ? specialPrice : null;

  return {
    ...product,
    sku: product?.sku,
    name: product?.name,
    price: regularPrice,
    special_price: validSpecialPrice,
    image_url: resolveImageUrl(product),
    in_stock: resolveInStock(product),
    qty: resolveQty(product),
    _source: sourceTag,
    ...meta,
  };
}

function isRenderableRelatedProduct(product: any): boolean {
  const price = Number(product?.price || 0);
  const specialPrice = Number(product?.special_price || 0);
  return !!product?.sku && !!product?.name && !!product?.image_url && (price > 0 || specialPrice > 0) && product?.in_stock !== false;
}

async function hydrateProductBySku(sku: string): Promise<any | null> {
  try {
    return await kv.get(`product:${sku}`);
  } catch {
    return null;
  }
}

async function hydrateRelatedProducts(
  skuMeta: Array<{ sku: string; [key: string]: any }>,
  sourceTag: string
): Promise<any[]> {
  if (skuMeta.length === 0) return [];

  const ordered = skuMeta.filter((item) => !!item?.sku);
  const uniqueSkus = Array.from(new Set(ordered.map((item) => item.sku)));
  const hitsBySku = new Map<string, any>();

  if (uniqueSkus.length > 0 && meili.isConfigured()) {
    try {
      const skuList = uniqueSkus.map((value) => `"${value}"`).join(',');
      const meiliResult = await meili.search('', {
        filter: [`sku IN [${skuList}]`],
        limit: uniqueSkus.length,
      });
      for (const hit of meiliResult?.hits || []) {
        if (hit?.sku) hitsBySku.set(hit.sku, hit);
      }
    } catch (err) {
      console.warn('[SI] hydrateRelatedProducts: Meili batch lookup failed:', err);
    }
  }

  const products: any[] = [];
  for (const item of ordered) {
    let product = hitsBySku.get(item.sku) || null;

    if (!product || !isRenderableRelatedProduct(normalizeRelatedProduct(product, sourceTag, item))) {
      const hydrated = await hydrateProductBySku(item.sku);
      if (hydrated) {
        product = {
          ...hydrated,
          ...product,
        };
      }
    }

    if (!product) continue;

    const normalized = normalizeRelatedProduct(product, sourceTag, item);
    if (isRenderableRelatedProduct(normalized)) {
      products.push(normalized);
    }
  }

  return products;
}

// ─── Incremental Aggregate Updater ──────────────────────────────────────────

interface DailyAggregate {
  date: string;
  total_searches: number;
  zero_results: number;
  clicks: number;
  views: number;
  add_to_cart: number;
  sessions: string[];  // will be deduped on read
  updated_at: string;
}

async function incrementDailyAgg(
  dk: string,
  field: 'total_searches' | 'zero_results' | 'clicks' | 'views' | 'add_to_cart',
  sessionId?: string
): Promise<void> {
  try {
    const key = `si:agg:${dk}`;
    const current: DailyAggregate = (await kv.get(key)) || {
      date: dk,
      total_searches: 0,
      zero_results: 0,
      clicks: 0,
      views: 0,
      add_to_cart: 0,
      sessions: [],
      updated_at: '',
    };
    current[field]++;
    if (sessionId && !current.sessions.includes(sessionId)) {
      // Keep max 500 session IDs per day for counting (avoids KV bloat)
      if (current.sessions.length < 500) {
        current.sessions.push(sessionId);
      }
    }
    current.updated_at = new Date().toISOString();
    await kv.set(key, current);
  } catch (e) {
    console.warn(`[SI] incrementDailyAgg ${dk}/${field} failed:`, e);
  }
}

// ─── Incremental Term Aggregate ─────────────────────────────────────────────

interface TermAggregate {
  query_normalized: string;
  search_count: number;
  zero_count: number;
  click_count: number;
  click_positions: number[];  // keep last 100
  last_seen: string;
}

async function incrementTermAgg(
  queryNormalized: string,
  field: 'search_count' | 'zero_count' | 'click_count',
  clickPosition?: number
): Promise<void> {
  try {
    const key = `si:term:${queryNormalized}`;
    const current: TermAggregate = (await kv.get(key)) || {
      query_normalized: queryNormalized,
      search_count: 0,
      zero_count: 0,
      click_count: 0,
      click_positions: [],
      last_seen: '',
    };
    current[field]++;
    if (clickPosition !== undefined) {
      current.click_positions = [...current.click_positions.slice(-99), clickPosition];
    }
    current.last_seen = new Date().toISOString();
    await kv.set(key, current);
  } catch (e) {
    console.warn(`[SI] incrementTermAgg ${queryNormalized}/${field} failed:`, e);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// ─── INGESTÃO (TRACKING) ────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════

// ─── POST /track/search ─────────────────────────────────────────────────────
app.post('/track/search', async (c) => {
  try {
    const body = await c.req.json();
    const {
      query_original,
      results_count,
      filters,
      session_id,
      user_id,
      source = 'search_page',
      latency_ms,
    } = body;

    // Validate
    if (!query_original || typeof query_original !== 'string') {
      return c.json({ error: 'query_original required (string)' }, 400);
    }
    if (query_original.trim().length < 2) {
      return c.json({ error: 'query must have > 2 chars' }, 400);
    }
    if (!session_id) {
      return c.json({ error: 'session_id required' }, 400);
    }
    if (results_count === undefined || results_count === null) {
      return c.json({ error: 'results_count required' }, 400);
    }

    // Normalize
    const query_normalized = normalizeQuery(query_original);
    const dk = today();
    const id = nanoid();
    const isZero = results_count === 0;
    const now = new Date().toISOString();

    // Store event
    const eventKey = `si:s:${dk}:${id}`;
    await kv.set(eventKey, {
      query_original,
      query_normalized,
      results_count,
      filters: filters || null,
      session_id,
      user_id: user_id || null,
      source,
      latency_ms: latency_ms || null,
      is_zero: isZero,
      created_at: now,
    });

    // Increment aggregates (fire-and-forget pattern)
    const aggPromises = [
      incrementDailyAgg(dk, 'total_searches', session_id),
      incrementTermAgg(query_normalized, 'search_count'),
    ];
    if (isZero) {
      aggPromises.push(incrementDailyAgg(dk, 'zero_results'));
      aggPromises.push(incrementTermAgg(query_normalized, 'zero_count'));
    }
    await Promise.allSettled(aggPromises);

    console.log(`[SI] search | q="${query_normalized}" | results=${results_count} | zero=${isZero} | session=${session_id.slice(0, 8)}`);

    return c.json({ status: 'ok', event_id: id, query_normalized });
  } catch (err: any) {
    console.error('[SI] track/search error:', err.message);
    return c.json({ error: err.message }, 500);
  }
});

// ─── POST /track/search-click ───────────────────────────────────────────────
app.post('/track/search-click', async (c) => {
  try {
    const body = await c.req.json();
    const {
      query_normalized: rawQuery,
      query_original,
      product_sku,
      position,
      session_id,
      user_id,
      source = 'search_page',
    } = body;

    if (!product_sku) return c.json({ error: 'product_sku required' }, 400);
    if (!session_id) return c.json({ error: 'session_id required' }, 400);
    if (position === undefined) return c.json({ error: 'position required' }, 400);

    const query_normalized = rawQuery
      ? normalizeQuery(rawQuery)
      : query_original
        ? normalizeQuery(query_original)
        : 'unknown';

    const dk = today();
    const id = nanoid();
    const now = new Date().toISOString();

    await kv.set(`si:c:${dk}:${id}`, {
      query_normalized,
      product_sku,
      position: Number(position),
      session_id,
      user_id: user_id || null,
      source,
      created_at: now,
    });

    // Increment aggregates
    await Promise.allSettled([
      incrementDailyAgg(dk, 'clicks', session_id),
      incrementTermAgg(query_normalized, 'click_count', Number(position)),
    ]);

    console.log(`[SI] click | q="${query_normalized}" | sku=${product_sku} | pos=${position}`);

    return c.json({ status: 'ok', event_id: id });
  } catch (err: any) {
    console.error('[SI] track/search-click error:', err.message);
    return c.json({ error: err.message }, 500);
  }
});

// ─── POST /track/view ───────────────────────────────────────────────────────
app.post('/track/view', async (c) => {
  try {
    const body = await c.req.json();
    const {
      product_sku,
      session_id,
      user_id,
      source = 'direct',
      ref_query_normalized,
      metadata,
    } = body;

    if (!product_sku) return c.json({ error: 'product_sku required' }, 400);
    if (!session_id) return c.json({ error: 'session_id required' }, 400);

    // Dedupe: same SKU + session in 15 min window
    const dedupKey = `si:dedup:${session_id}:${product_sku}`;
    const existing = await kv.get(dedupKey);
    if (existing) {
      const elapsed = Date.now() - new Date(existing.ts).getTime();
      if (elapsed < 15 * 60 * 1000) {
        return c.json({ status: 'deduplicated', product_sku });
      }
    }

    // Mark dedupe
    await kv.set(dedupKey, { ts: new Date().toISOString() });

    const dk = today();
    const id = nanoid();
    const now = new Date().toISOString();

    await kv.set(`si:v:${dk}:${id}`, {
      product_sku,
      session_id,
      user_id: user_id || null,
      source,
      ref_query_normalized: ref_query_normalized || null,
      metadata: metadata || null,
      created_at: now,
    });

    // Increment aggregate
    await incrementDailyAgg(dk, 'views', session_id);

    console.log(`[SI] view | sku=${product_sku} | source=${source} | session=${session_id.slice(0, 8)}`);

    return c.json({ status: 'ok', event_id: id });
  } catch (err: any) {
    console.error('[SI] track/view error:', err.message);
    return c.json({ error: err.message }, 500);
  }
});

// ─── POST /track/add-to-cart ────────────────────────────────────────────────
// Completes the conversion funnel: Search → Click → View → ATC
app.post('/track/add-to-cart', async (c) => {
  try {
    const body = await c.req.json();
    const { product_sku, session_id, source = 'pdp', ref_query } = body;

    if (!product_sku) return c.json({ error: 'product_sku required' }, 400);
    if (!session_id) return c.json({ error: 'session_id required' }, 400);

    const dk = today();
    await incrementDailyAgg(dk, 'add_to_cart', session_id);

    console.log(`[SI] atc | sku=${product_sku} | source=${source} | session=${session_id.slice(0, 8)}`);
    return c.json({ status: 'ok' });
  } catch (err: any) {
    console.error('[SI] track/add-to-cart error:', err.message);
    return c.json({ error: err.message }, 500);
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// ─── PROCESSAMENTO (ANALYTICS / INTELLIGENCE) ───────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════

const CACHE_TTL = 120_000; // 2 min

async function getCached(cacheKey: string): Promise<any | null> {
  try {
    const cached = await kv.get(cacheKey);
    if (cached && cached._ts && Date.now() - cached._ts < CACHE_TTL) {
      return cached.data;
    }
  } catch {}
  return null;
}

async function setCache(cacheKey: string, data: any): Promise<void> {
  try {
    await kv.set(cacheKey, { _ts: Date.now(), data });
  } catch {}
}

// ─── GET /intelligence/overview ─────────────────────────────────────────────
// Main KPIs for the executive dashboard
app.get('/intelligence/overview', async (c) => {
  try {
    const days = Math.min(Math.max(parseInt(c.req.query('days') || '7'), 1), 90);
    const cacheKey = `si:cache:overview:${days}`;

    const cached = await getCached(cacheKey);
    if (cached) return c.json(cached);

    const dateKeys = daysBack(days);

    let total_searches = 0;
    let zero_results = 0;
    let clicks = 0;
    let views = 0;
    const allSessions = new Set<string>();
    const daily_volume: any[] = [];

    for (const dk of dateKeys) {
      const agg: DailyAggregate | null = await kv.get(`si:agg:${dk}`);
      const dayData = {
        date: dateKeyToISO(dk),
        searches: agg?.total_searches || 0,
        zero: agg?.zero_results || 0,
        clicks: agg?.clicks || 0,
        views: agg?.views || 0,
        sessions: agg?.sessions?.length || 0,
      };
      daily_volume.push(dayData);
      total_searches += dayData.searches;
      zero_results += dayData.zero;
      clicks += dayData.clicks;
      views += dayData.views;
      if (agg?.sessions) {
        for (const s of agg.sessions) allSessions.add(s);
      }
    }

    // Sort by date ascending
    daily_volume.sort((a, b) => a.date.localeCompare(b.date));

    const zero_rate = total_searches > 0 ? Math.round((zero_results / total_searches) * 10000) / 100 : 0;
    const ctr = total_searches > 0 ? Math.round((clicks / total_searches) * 10000) / 100 : 0;

    const result = {
      period_days: days,
      kpis: {
        total_searches,
        zero_results,
        zero_rate,
        clicks,
        ctr,
        views,
        unique_sessions: allSessions.size,
      },
      daily_volume,
      generated_at: new Date().toISOString(),
    };

    await setCache(cacheKey, result);
    return c.json(result);
  } catch (err: any) {
    console.error('[SI] intelligence/overview error:', err.message);
    return c.json({ error: err.message }, 500);
  }
});

// ─── GET /intelligence/top-terms ────────────────────────────────────────────
// Top searched terms with CTR, zero-rate, avg position
app.get('/intelligence/top-terms', async (c) => {
  try {
    const limit = Math.min(parseInt(c.req.query('limit') || '50'), 100);
    const cacheKey = `si:cache:top_terms:${limit}`;

    const cached = await getCached(cacheKey);
    if (cached) return c.json(cached);

    // Fetch all term aggregates
    const allTerms = await kv.getByPrefix('si:term:');
    if (!allTerms || allTerms.length === 0) {
      const empty = { terms: [], total: 0, generated_at: new Date().toISOString() };
      await setCache(cacheKey, empty);
      return c.json(empty);
    }

    // Parse and rank
    const terms = allTerms
      .map((row: any) => {
        const val = row?.value || row;
        if (!val?.query_normalized) return null;
        const searchCount = val.search_count || 0;
        const clickCount = val.click_count || 0;
        const zeroCount = val.zero_count || 0;
        const positions = val.click_positions || [];
        const avgPosition = positions.length > 0
          ? Math.round((positions.reduce((a: number, b: number) => a + b, 0) / positions.length) * 10) / 10
          : null;
        const ctr = searchCount > 0 ? Math.round((clickCount / searchCount) * 10000) / 100 : 0;
        const zeroRate = searchCount > 0 ? Math.round((zeroCount / searchCount) * 10000) / 100 : 0;

        return {
          term: val.query_normalized,
          search_count: searchCount,
          click_count: clickCount,
          zero_count: zeroCount,
          ctr,
          zero_rate: zeroRate,
          avg_position: avgPosition,
          last_seen: val.last_seen,
        };
      })
      .filter(Boolean)
      .sort((a: any, b: any) => b.search_count - a.search_count)
      .slice(0, limit);

    const result = { terms, total: allTerms.length, generated_at: new Date().toISOString() };
    await setCache(cacheKey, result);
    return c.json(result);
  } catch (err: any) {
    console.error('[SI] intelligence/top-terms error:', err.message);
    return c.json({ error: err.message }, 500);
  }
});

// ─── GET /intelligence/zero-results ─────────────────────────────────────────
// Zero result terms prioritized by impact (volume)
app.get('/intelligence/zero-results', async (c) => {
  try {
    const limit = Math.min(parseInt(c.req.query('limit') || '30'), 100);
    const cacheKey = `si:cache:zero_results:${limit}`;

    const cached = await getCached(cacheKey);
    if (cached) return c.json(cached);

    const allTerms = await kv.getByPrefix('si:term:');
    if (!allTerms || allTerms.length === 0) {
      return c.json({ terms: [], generated_at: new Date().toISOString() });
    }

    const zeroTerms = allTerms
      .map((row: any) => {
        const val = row?.value || row;
        if (!val?.query_normalized || !val.zero_count) return null;
        return {
          term: val.query_normalized,
          zero_count: val.zero_count,
          total_searches: val.search_count || 0,
          zero_rate: val.search_count > 0
            ? Math.round((val.zero_count / val.search_count) * 100)
            : 100,
          last_seen: val.last_seen,
        };
      })
      .filter(Boolean)
      .sort((a: any, b: any) => b.zero_count - a.zero_count)
      .slice(0, limit);

    const result = { terms: zeroTerms, generated_at: new Date().toISOString() };
    await setCache(cacheKey, result);
    return c.json(result);
  } catch (err: any) {
    console.error('[SI] intelligence/zero-results error:', err.message);
    return c.json({ error: err.message }, 500);
  }
});

// ─── GET /intelligence/quality ──────────────────────────────────────────────
// Search quality: low CTR terms (have results but no clicks)
app.get('/intelligence/quality', async (c) => {
  try {
    const limit = Math.min(parseInt(c.req.query('limit') || '30'), 100);
    const minSearches = parseInt(c.req.query('min_searches') || '3');
    const cacheKey = `si:cache:quality:${limit}:${minSearches}`;

    const cached = await getCached(cacheKey);
    if (cached) return c.json(cached);

    const allTerms = await kv.getByPrefix('si:term:');
    if (!allTerms || allTerms.length === 0) {
      return c.json({ terms: [], generated_at: new Date().toISOString() });
    }

    // Low CTR terms (have results but users don't click)
    const lowCtrTerms = allTerms
      .map((row: any) => {
        const val = row?.value || row;
        if (!val?.query_normalized) return null;
        const sc = val.search_count || 0;
        const cc = val.click_count || 0;
        const zc = val.zero_count || 0;
        if (sc < minSearches) return null;
        // Only include terms that have results (not zero-result dominated)
        if (zc >= sc * 0.8) return null;
        const ctr = sc > 0 ? Math.round((cc / sc) * 10000) / 100 : 0;
        const positions = val.click_positions || [];
        const avgPos = positions.length > 0
          ? Math.round((positions.reduce((a: number, b: number) => a + b, 0) / positions.length) * 10) / 10
          : null;

        return {
          term: val.query_normalized,
          search_count: sc,
          click_count: cc,
          ctr,
          avg_position: avgPos,
          priority: ctr < 5 && sc > 10 ? 'high' : ctr < 10 ? 'medium' : 'low',
        };
      })
      .filter(Boolean)
      .sort((a: any, b: any) => a.ctr - b.ctr)
      .slice(0, limit);

    const result = { terms: lowCtrTerms, generated_at: new Date().toISOString() };
    await setCache(cacheKey, result);
    return c.json(result);
  } catch (err: any) {
    console.error('[SI] intelligence/quality error:', err.message);
    return c.json({ error: err.message }, 500);
  }
});

// ─── GET /intelligence/co-views ─────────────────────────────────────────────
// "Quem viu, viu também" — products viewed in same session
app.get('/intelligence/co-views', async (c) => {
  try {
    const days = Math.min(parseInt(c.req.query('days') || '7'), 30);
    const limit = Math.min(parseInt(c.req.query('limit') || '20'), 50);
    const cacheKey = `si:cache:coviews:${days}:${limit}`;

    const cached = await getCached(cacheKey);
    if (cached) return c.json(cached);

    // Scan recent view events to build co-view pairs
    const dateKeys = daysBack(days);
    const sessionProducts: Record<string, string[]> = {};

    for (const dk of dateKeys) {
      const dayViews = await kv.getByPrefix(`si:v:${dk}:`);
      if (!dayViews) continue;
      for (const row of dayViews) {
        const val = row?.value || row;
        if (!val?.session_id || !val?.product_sku) continue;
        if (!sessionProducts[val.session_id]) sessionProducts[val.session_id] = [];
        if (!sessionProducts[val.session_id].includes(val.product_sku)) {
          sessionProducts[val.session_id].push(val.product_sku);
        }
      }
    }

    // Build pair counts
    const pairCounts: Record<string, number> = {};
    for (const skus of Object.values(sessionProducts)) {
      if (skus.length < 2) continue;
      // Generate all pairs for sessions with 2-10 products (avoid noise)
      const subset = skus.slice(0, 10);
      for (let i = 0; i < subset.length; i++) {
        for (let j = i + 1; j < subset.length; j++) {
          const pair = [subset[i], subset[j]].sort().join('|');
          pairCounts[pair] = (pairCounts[pair] || 0) + 1;
        }
      }
    }

    const pairs = Object.entries(pairCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, limit)
      .map(([pair, count]) => {
        const [sku_a, sku_b] = pair.split('|');
        return { sku_a, sku_b, co_view_count: count };
      });

    const result = {
      pairs,
      sessions_analyzed: Object.keys(sessionProducts).length,
      period_days: days,
      generated_at: new Date().toISOString(),
    };
    await setCache(cacheKey, result);
    return c.json(result);
  } catch (err: any) {
    console.error('[SI] intelligence/co-views error:', err.message);
    return c.json({ error: err.message }, 500);
  }
});

// ─── GET /intelligence/trending ─────────────────────────────────────────────
// Trending searches for UX activation (search bar, zero-result fallback)
app.get('/intelligence/trending', async (c) => {
  try {
    const limit = Math.min(parseInt(c.req.query('limit') || '10'), 30);
    const cacheKey = `si:cache:trending:${limit}`;

    const cached = await getCached(cacheKey);
    if (cached) return c.json(cached);

    const allTerms = await kv.getByPrefix('si:term:');
    if (!allTerms || allTerms.length === 0) {
      return c.json({ trending: [], generated_at: new Date().toISOString() });
    }

    // Filter: terms with results, recent, decent volume
    const trending = allTerms
      .map((row: any) => {
        const val = row?.value || row;
        if (!val?.query_normalized) return null;
        const sc = val.search_count || 0;
        const zr = val.zero_count || 0;
        // Exclude dominated zero-result terms
        if (sc > 0 && zr / sc > 0.7) return null;
        // Exclude very short or very long terms
        if (val.query_normalized.length < 3 || val.query_normalized.length > 60) return null;
        return {
          term: val.query_normalized,
          count: sc,
          last_seen: val.last_seen,
        };
      })
      .filter(Boolean)
      .sort((a: any, b: any) => b.count - a.count)
      .slice(0, limit);

    const result = { trending, generated_at: new Date().toISOString() };
    await setCache(cacheKey, result);
    return c.json(result);
  } catch (err: any) {
    console.error('[SI] intelligence/trending error:', err.message);
    return c.json({ error: err.message }, 500);
  }
});

// ─── GET /intelligence/top-products ─────────────────────────────────────────
// Most viewed products
app.get('/intelligence/top-products', async (c) => {
  try {
    const days = Math.min(parseInt(c.req.query('days') || '7'), 30);
    const limit = Math.min(parseInt(c.req.query('limit') || '20'), 50);
    const cacheKey = `si:cache:top_products:${days}:${limit}`;

    const cached = await getCached(cacheKey);
    if (cached) return c.json(cached);

    const dateKeys = daysBack(days);
    const skuCounts: Record<string, { views: number; sources: Record<string, number> }> = {};

    for (const dk of dateKeys) {
      const dayViews = await kv.getByPrefix(`si:v:${dk}:`);
      if (!dayViews) continue;
      for (const row of dayViews) {
        const val = row?.value || row;
        if (!val?.product_sku) continue;
        if (!skuCounts[val.product_sku]) {
          skuCounts[val.product_sku] = { views: 0, sources: {} };
        }
        skuCounts[val.product_sku].views++;
        const src = val.source || 'unknown';
        skuCounts[val.product_sku].sources[src] = (skuCounts[val.product_sku].sources[src] || 0) + 1;
      }
    }

    const products = Object.entries(skuCounts)
      .sort(([, a], [, b]) => b.views - a.views)
      .slice(0, limit)
      .map(([sku, data]) => ({
        sku,
        views: data.views,
        top_source: Object.entries(data.sources).sort(([, a], [, b]) => b - a)[0]?.[0] || 'unknown',
        sources: data.sources,
      }));

    const result = { products, period_days: days, generated_at: new Date().toISOString() };
    await setCache(cacheKey, result);
    return c.json(result);
  } catch (err: any) {
    console.error('[SI] intelligence/top-products error:', err.message);
    return c.json({ error: err.message }, 500);
  }
});

// ─── GET /intelligence/funnel ───────────────────────────────────────────────
// Conversion funnel: Search → Click → View → ATC
app.get('/intelligence/funnel', async (c) => {
  try {
    const days = Math.min(parseInt(c.req.query('days') || '7'), 90);
    const cacheKey = `si:cache:funnel:${days}`;

    const cached = await getCached(cacheKey);
    if (cached) return c.json(cached);

    const dateKeys = daysBack(days);
    let searches = 0, clicks = 0, views = 0, atc = 0;

    for (const dk of dateKeys) {
      const agg: DailyAggregate | null = await kv.get(`si:agg:${dk}`);
      if (!agg) continue;
      searches += agg.total_searches || 0;
      clicks += agg.clicks || 0;
      views += agg.views || 0;
      atc += agg.add_to_cart || 0;
    }

    const funnel = [
      { stage: 'Buscas', value: searches, pct: 100 },
      { stage: 'Cliques no resultado', value: clicks, pct: searches > 0 ? Math.round((clicks / searches) * 100) : 0 },
      { stage: 'Visualizacoes PDP', value: views, pct: searches > 0 ? Math.round((views / searches) * 100) : 0 },
      { stage: 'Add ao Carrinho', value: atc, pct: searches > 0 ? Math.round((atc / searches) * 100) : 0 },
    ];

    // Step-over rates
    const step_rates = [
      { from: 'Busca', to: 'Clique', rate: searches > 0 ? Math.round((clicks / searches) * 10000) / 100 : 0 },
      { from: 'Clique', to: 'PDP View', rate: clicks > 0 ? Math.round((views / clicks) * 10000) / 100 : 0 },
      { from: 'PDP View', to: 'Add to Cart', rate: views > 0 ? Math.round((atc / views) * 10000) / 100 : 0 },
      { from: 'Busca', to: 'Carrinho (total)', rate: searches > 0 ? Math.round((atc / searches) * 10000) / 100 : 0 },
    ];

    const result = { funnel, step_rates, period_days: days, generated_at: new Date().toISOString() };
    await setCache(cacheKey, result);
    return c.json(result);
  } catch (err: any) {
    console.error('[SI] intelligence/funnel error:', err.message);
    return c.json({ error: err.message }, 500);
  }
});

// ─── GET /intelligence/position-distribution ────────────────────────────────
// Click position distribution (ranking quality signal)
app.get('/intelligence/position-distribution', async (c) => {
  try {
    const cacheKey = 'si:cache:pos_dist';
    const cached = await getCached(cacheKey);
    if (cached) return c.json(cached);

    const allTerms = await kv.getByPrefix('si:term:');
    const allPositions: number[] = [];

    for (const row of (allTerms || [])) {
      const val = row?.value || row;
      if (val?.click_positions) {
        allPositions.push(...val.click_positions);
      }
    }

    // Group by position bucket
    const buckets: Record<number, number> = {};
    for (const pos of allPositions) {
      const p = Math.min(pos, 20); // cap at 20+
      buckets[p] = (buckets[p] || 0) + 1;
    }

    const distribution = Object.entries(buckets)
      .map(([pos, count]) => ({
        position: Number(pos),
        clicks: count,
        pct: allPositions.length > 0 ? Math.round((count / allPositions.length) * 10000) / 100 : 0,
      }))
      .sort((a, b) => a.position - b.position);

    const result = {
      distribution,
      total_clicks: allPositions.length,
      avg_position: allPositions.length > 0
        ? Math.round((allPositions.reduce((a, b) => a + b, 0) / allPositions.length) * 10) / 10
        : null,
      generated_at: new Date().toISOString(),
    };

    await setCache(cacheKey, result);
    return c.json(result);
  } catch (err: any) {
    console.error('[SI] intelligence/position-distribution error:', err.message);
    return c.json({ error: err.message }, 500);
  }
});

// ─── GET /intelligence/related/:sku ─────────────────────────────────────────
// "Quem viu, viu também" for a SPECIFIC product — used on PDP.
// Strategy (3 levels of fallback):
//   1. Behavioral co-view: products viewed in same sessions as this SKU
//   2. Meilisearch similarity: same model/category
//   3. Most viewed products (global popularity)
app.get('/intelligence/related/:sku', async (c) => {
  try {
    const sku = c.req.param('sku');
    if (!sku) return c.json({ error: 'sku required' }, 400);

    const limit = Math.min(parseInt(c.req.query('limit') || '8'), 20);
    const days = Math.min(parseInt(c.req.query('days') || '30'), 90);
    const cacheKey = `si:cache:related:${sku}:${days}:${limit}`;

    const cached = await getCached(cacheKey);
    if (cached) return c.json(cached);

    // ── Level 1: Behavioral co-view ─────────────────────────────────────
    const dateKeys = daysBack(days);
    const sessionsWithSku: string[] = [];
    const coViewCounts: Record<string, number> = {};

    for (const dk of dateKeys) {
      const dayViews = await kv.getByPrefix(`si:v:${dk}:`);
      if (!dayViews) continue;
      for (const row of dayViews) {
        const val = row?.value || row;
        if (val?.product_sku === sku && val?.session_id) {
          if (!sessionsWithSku.includes(val.session_id)) {
            sessionsWithSku.push(val.session_id);
          }
        }
      }
    }

    // Now find other products in those sessions
    if (sessionsWithSku.length > 0) {
      const sessionSet = new Set(sessionsWithSku);
      for (const dk of dateKeys) {
        const dayViews = await kv.getByPrefix(`si:v:${dk}:`);
        if (!dayViews) continue;
        for (const row of dayViews) {
          const val = row?.value || row;
          if (val?.session_id && sessionSet.has(val.session_id) && val.product_sku && val.product_sku !== sku) {
            coViewCounts[val.product_sku] = (coViewCounts[val.product_sku] || 0) + 1;
          }
        }
      }
    }

    const coViewSkus = Object.entries(coViewCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, limit)
      .map(([s, count]) => ({ sku: s, co_view_count: count }));

    // ── Resolve product details via Meilisearch ─────────────────────────
    let products: any[] = [];
    let source = 'co_view';

    if (coViewSkus.length > 0) {
      products = await hydrateRelatedProducts(coViewSkus, 'co_view');
    }

    // ── Level 2: Meilisearch similarity (if co-view insufficient) ───────
    if (products.length < limit) {
      source = products.length > 0 ? 'mixed' : 'similarity';
      try {
        // Get the current product to find its model/category
        // Sanitize SKU to match document ID in MeiliSearch
        const docId = sku.replace(/[^a-zA-Z0-9\-_]/g, '').slice(0, 511);
        const baseProduct = await meili.getDocument(docId);
        
        if (baseProduct) {
          const existingSkus = new Set(products.map((p: any) => p.sku));
          existingSkus.add(sku); // exclude self

          const filters: string[] = [];
          if (baseProduct.modelos?.[0]) filters.push(`modelos = "${baseProduct.modelos[0]}"`);
          else if (baseProduct.category_ids?.[0]) filters.push(`category_ids = "${baseProduct.category_ids[0]}"`);
          else if (baseProduct.category_names?.[0]) filters.push(`category_names = "${baseProduct.category_names[0]}"`);

          if (filters.length > 0) {
            const needed = limit - products.length;
            const similarResult = await meili.search('', {
              filter: filters,
              limit: needed + 10, // fetch extra to filter out existing
            });
            if (similarResult?.hits) {
              const candidateSkus = similarResult.hits
                .filter((h: any) => !existingSkus.has(h.sku))
                .slice(0, needed + 6)
                .map((h: any) => ({ sku: h.sku }));
              const newHits = await hydrateRelatedProducts(candidateSkus, 'similarity');
              products = [...products, ...newHits.slice(0, needed)];
            }
          }
        }
      } catch (e) {
        console.warn('[SI] related: Meili similarity fallback failed:', e);
      }
    }

    // ── Level 3: Most viewed / popular (if still insufficient) ──────────
    if (products.length < 4) {
      source = products.length > 0 ? 'mixed' : 'popular';
      try {
        const existingSkus = new Set(products.map((p: any) => p.sku));
        existingSkus.add(sku);

        // Get top viewed SKUs from aggregates
        const topSkuCounts: Record<string, number> = {};
        for (const dk of dateKeys.slice(0, 7)) { // last 7 days only for popularity
          const dayViews = await kv.getByPrefix(`si:v:${dk}:`);
          if (!dayViews) continue;
          for (const row of dayViews) {
            const val = row?.value || row;
            if (val?.product_sku && !existingSkus.has(val.product_sku)) {
              topSkuCounts[val.product_sku] = (topSkuCounts[val.product_sku] || 0) + 1;
            }
          }
        }

        const popularSkus = Object.entries(topSkuCounts)
          .sort(([, a], [, b]) => b - a)
          .slice(0, 4 - products.length)
          .map(([s]) => s);

        if (popularSkus.length > 0) {
          const newHits = await hydrateRelatedProducts(
            popularSkus.map((value) => ({ sku: value })),
            'popular'
          );
          products = [...products, ...newHits];
        }
      } catch (e) {
        console.warn('[SI] related: popularity fallback failed:', e);
      }
    }

    products = products
      .filter((product, index, list) =>
        isRenderableRelatedProduct(product) &&
        list.findIndex((candidate) => candidate.sku === product.sku) === index
      )
      .slice(0, limit);

    const result = {
      sku,
      products,
      source,
      co_view_sessions: sessionsWithSku.length,
      period_days: days,
      generated_at: new Date().toISOString(),
    };

    await setCache(cacheKey, result);
    console.log(`[SI] related | sku=${sku} | ${products.length} results | source=${source} | sessions=${sessionsWithSku.length}`);
    return c.json(result);
  } catch (err: any) {
    console.error('[SI] intelligence/related error:', err.message);
    return c.json({ error: err.message }, 500);
  }
});

export { app as searchIntelligence };
