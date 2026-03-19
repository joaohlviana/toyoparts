// ═══════════════════════════════════════════════════════════════════════════════
// Search Intelligence API Client
// ═══════════════════════════════════════════════════════════════════════════════
// Frontend client for the Search Intelligence edge function.
// Covers: tracking (fire-and-forget), analytics (dashboard), activation (UX).

import { projectId, publicAnonKey } from '../../../utils/supabase/info';

const BASE = `https://${projectId}.supabase.co/functions/v1/make-server-1d6e33e0/si`;

const HEADERS: HeadersInit = {
  'Content-Type': 'application/json',
  Authorization: `Bearer ${publicAnonKey}`,
};

// Session ID (persisted in sessionStorage)
const SESSION_KEY = 'toyoparts_session_id';
function getSessionId(): string {
  if (typeof window === 'undefined') return 'ssr';
  let sid = sessionStorage.getItem(SESSION_KEY);
  if (!sid) {
    sid = crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    sessionStorage.setItem(SESSION_KEY, sid);
  }
  return sid;
}

// ─── Fetch Helpers ──────────────────────────────────────────────────────────

async function post(path: string, body: any): Promise<any> {
  try {
    const res = await fetch(`${BASE}${path}`, {
      method: 'POST',
      headers: HEADERS,
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text();
      console.error(`[SI API] POST ${path} ${res.status}: ${text}`);
      return null;
    }
    return res.json();
  } catch (err) {
    console.error(`[SI API] POST ${path} error:`, err);
    return null;
  }
}

async function get(path: string): Promise<any> {
  try {
    const res = await fetch(`${BASE}${path}`, { headers: HEADERS });
    if (!res.ok) {
      const text = await res.text();
      console.error(`[SI API] GET ${path} ${res.status}: ${text}`);
      return null;
    }
    return res.json();
  } catch (err) {
    console.error(`[SI API] GET ${path} error:`, err);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// 1. TRACKING (fire-and-forget — never blocks UI)
// ═══════════════════════════════════════════════════════════════════════════════

/** Track a search performed by the user. Call AFTER receiving Meili results. */
export function trackSearch(params: {
  query_original: string;
  results_count: number;
  filters?: Record<string, any>;
  source?: string;
  latency_ms?: number;
}): void {
  // Fire-and-forget
  post('/track/search', {
    ...params,
    session_id: getSessionId(),
  });
}

// Debounce guard for search tracking
let _lastTrackedQuery = '';
let _lastTrackedTime = 0;
const TRACK_DEBOUNCE_MS = 2000;

/** Track search with debounce (500ms) + duplicate check. Use from SearchPage. */
export function trackSearchDebounced(params: {
  query_original: string;
  results_count: number;
  filters?: Record<string, any>;
  source?: string;
  latency_ms?: number;
}): void {
  const q = params.query_original.trim().toLowerCase();
  const now = Date.now();
  if (q === _lastTrackedQuery && now - _lastTrackedTime < TRACK_DEBOUNCE_MS) return;
  if (q.length < 2) return;
  _lastTrackedQuery = q;
  _lastTrackedTime = now;
  trackSearch(params);
}

/** Track click on a search result */
export function trackSearchClick(params: {
  query_original: string;
  product_sku: string;
  position: number;
  source?: string;
}): void {
  post('/track/search-click', {
    query_original: params.query_original,
    product_sku: params.product_sku,
    position: params.position,
    session_id: getSessionId(),
    source: params.source || 'search_page',
  });
}

/** Track product view (PDP). Server handles 15-min dedupe per SKU+session. */
export function trackProductView(params: {
  product_sku: string;
  source?: string;
  ref_query_normalized?: string;
  metadata?: Record<string, any>;
}): void {
  post('/track/view', {
    ...params,
    session_id: getSessionId(),
  });
}

/** Track add-to-cart. Completes the conversion funnel. */
export function trackAddToCartSI(params: {
  product_sku: string;
  source?: string;
}): void {
  post('/track/add-to-cart', {
    ...params,
    session_id: getSessionId(),
  });
}
// ═══════════════════════════════════════════════════════════════════════════════
// 2. ANALYTICS (Dashboard data)
// ═══════════════════════════════════════════════════════════════════════════════

export const siAnalytics = {
  /** Executive overview KPIs + daily volume chart */
  getOverview: (days = 7) => get(`/intelligence/overview?days=${days}`),

  /** Top searched terms with CTR, zero-rate, avg position */
  getTopTerms: (limit = 50) => get(`/intelligence/top-terms?limit=${limit}`),

  /** Zero result terms prioritized by impact */
  getZeroResults: (limit = 30) => get(`/intelligence/zero-results?limit=${limit}`),

  /** Search quality: low CTR terms */
  getQuality: (limit = 30, minSearches = 3) =>
    get(`/intelligence/quality?limit=${limit}&min_searches=${minSearches}`),

  /** Conversion funnel: Search → Click → View → ATC */
  getFunnel: (days = 7) => get(`/intelligence/funnel?days=${days}`),

  /** Co-view pairs ("quem viu, viu também") */
  getCoViews: (days = 7, limit = 20) =>
    get(`/intelligence/co-views?days=${days}&limit=${limit}`),

  /** Click position distribution */
  getPositionDistribution: () => get('/intelligence/position-distribution'),

  /** Most viewed products */
  getTopProducts: (days = 7, limit = 20) =>
    get(`/intelligence/top-products?days=${days}&limit=${limit}`),
};

// ═══════════════════════════════════════════════════════════════════════════════
// 3. ACTIVATION (UX components data)
// ═══════════════════════════════════════════════════════════════════════════════

export const siActivation = {
  /** Trending searches for search bar suggestions */
  getTrending: (limit = 8) => get(`/intelligence/trending?limit=${limit}`),

  /** Related products for PDP ("quem viu, viu também") with 3-level fallback */
  getRelatedProducts: (sku: string, limit = 8) =>
    get(`/intelligence/related/${encodeURIComponent(sku)}?limit=${limit}&days=30`),
};