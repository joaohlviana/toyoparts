import { Hono } from 'npm:hono';
import * as kv from './kv_store.tsx';
import {
  buildPostHogReplayUrl,
  dateDaysAgo,
  getCampaignGoalsConfig,
  toCurrencyNumber,
  toIsoDate,
} from './marketing.tsx';
import { isStoreOrderRecord } from './order-records.tsx';
import { getOrdersReadModelEnabled, listOrderSummaries, listStoreOrdersFromSource } from './order-read-model.tsx';

export const adminAnalytics = new Hono();

const CACHE_PREFIX = 'meta:admin_analytics:';
const MS_PER_DAY = 86_400_000;
const ANALYTICS_ORDER_PAGE_SIZE = 500;
const ANALYTICS_ORDER_MAX_PAGES = 6;

type SessionAccumulator = {
  session_id: string;
  visitor_key: string;
  first_ts: number;
  last_ts: number;
  first_page: string | null;
  last_page: string | null;
  pageviews: number;
  paths: Set<string>;
  channel: string;
  utm_source: string | null;
  utm_campaign: string | null;
  referrer_host: string | null;
  device_type: string;
  browser: string;
  country: string | null;
  event_names: Set<string>;
  product_views: number;
  add_to_cart: number;
  begin_checkout: number;
  purchases: number;
  purchase_value: number;
  whatsapp_leads: number;
  whatsapp_value: number;
  top_surface: string | null;
};

function normalizeDays(raw: string | undefined): 7 | 30 | 90 {
  if (raw === '7') return 7;
  if (raw === '90') return 90;
  return 30;
}

function parseTimestamp(value: unknown): number {
  const timestamp = new Date(String(value || '')).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function round(value: number, digits = 2) {
  const base = 10 ** digits;
  return Math.round((Number(value || 0) + Number.EPSILON) * base) / base;
}

function safePct(numerator: number, denominator: number) {
  if (!denominator) return 0;
  return round((numerator / denominator) * 100, 2);
}

function safeDelta(current: number, previous: number) {
  if (!previous) return current > 0 ? 100 : 0;
  return round(((current - previous) / previous) * 100, 2);
}

function normalizeText(value: unknown): string | null {
  const normalized = String(value || '').trim();
  return normalized || null;
}

function normalizePath(value: unknown): string | null {
  const normalized = String(value || '').trim();
  if (!normalized) return null;
  if (normalized.startsWith('http://') || normalized.startsWith('https://')) {
    try {
      const url = new URL(normalized);
      return `${url.pathname}${url.search}`;
    } catch {
      return normalized;
    }
  }
  return normalized;
}

function normalizeHost(value: unknown): string | null {
  const normalized = String(value || '').trim();
  if (!normalized) return null;
  try {
    return new URL(normalized).hostname.replace(/^www\./, '') || null;
  } catch {
    return normalized.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0] || null;
  }
}

function readUserAgent(event: any): string {
  return String(
    event?.attribution?.user_agent
      || event?.properties?.user_agent
      || event?.user_data?.client_user_agent
      || '',
  ).trim();
}

function classifyDeviceType(userAgent: string): string {
  const ua = userAgent.toLowerCase();
  if (!ua) return 'desconhecido';
  if (ua.includes('ipad') || ua.includes('tablet')) return 'tablet';
  if (ua.includes('mobi') || ua.includes('android')) return 'mobile';
  return 'desktop';
}

function classifyBrowser(userAgent: string): string {
  const ua = userAgent.toLowerCase();
  if (!ua) return 'Desconhecido';
  if (ua.includes('edg/')) return 'Edge';
  if (ua.includes('opr/') || ua.includes('opera')) return 'Opera';
  if (ua.includes('chrome/') && !ua.includes('edg/')) return 'Chrome';
  if (ua.includes('safari/') && !ua.includes('chrome/')) return 'Safari';
  if (ua.includes('firefox/')) return 'Firefox';
  return 'Outro';
}

function classifyChannel(attribution: any, referrerHost?: string | null): string {
  const source = String(attribution?.utm_source || '').trim().toLowerCase();
  const medium = String(attribution?.utm_medium || '').trim().toLowerCase();
  const referrer = String(referrerHost || '').trim().toLowerCase();

  if (source.includes('google') || attribution?.gclid || attribution?.gbraid || attribution?.wbraid) return 'google';
  if (source.includes('facebook') || source.includes('instagram') || source.includes('meta') || attribution?.fbclid || attribution?.fbc || attribution?.fbp) return 'facebook';
  if (medium.includes('email') || source.includes('email')) return 'email';
  if (source.includes('whatsapp') || referrer.includes('whatsapp')) return 'whatsapp';
  if (medium.includes('organic')) return 'organic';
  if (referrer.includes('google.') || referrer.includes('bing.') || referrer.includes('yahoo.')) return 'organic';
  if (source) return source;
  if (referrer) return 'referral';
  return 'direct';
}

function channelLabel(channel: string) {
  switch (channel) {
    case 'google':
      return 'Google';
    case 'facebook':
      return 'Facebook / Instagram';
    case 'direct':
      return 'Direto';
    case 'organic':
      return 'Organico';
    case 'email':
      return 'Email';
    case 'whatsapp':
      return 'WhatsApp';
    case 'referral':
      return 'Referral';
    default:
      return channel || 'Outro';
  }
}

function incrementMap(map: Map<string, number>, key: string | null, value = 1) {
  if (!key) return;
  map.set(key, (map.get(key) || 0) + value);
}

function toTopList(map: Map<string, number>, total = 0, limit = 10, labelTransform?: (key: string) => string) {
  return Array.from(map.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([key, value]) => ({
      key,
      label: labelTransform ? labelTransform(key) : key,
      value: round(value, 2),
      pct: total > 0 ? round((value / total) * 100, 2) : 0,
    }));
}

function eventTimestamp(event: any) {
  return parseTimestamp(event?.event_time || event?._meta?.logged_at);
}

function eventSessionId(event: any) {
  return normalizeText(event?.session_id || event?.attribution?.session_id || 'anonymous') || 'anonymous';
}

function eventVisitorKey(event: any) {
  return (
    normalizeText(event?.user_id)
    || normalizeText(event?.attribution?.user_id)
    || normalizeText(event?.anonymous_id)
    || normalizeText(event?.attribution?.anonymous_id)
    || eventSessionId(event)
  );
}

function getEventValue(event: any) {
  return toCurrencyNumber(event?.resolved_value) ?? toCurrencyNumber(event?.ecommerce?.value) ?? 0;
}

function dateKeyFromDate(date: Date) {
  return toIsoDate(date).replace(/-/g, '');
}

async function getCachedPayload<T>(key: string, force = false): Promise<T | null> {
  if (force) return null;
  const cached = await kv.get(key).catch(() => null);
  if (!cached?.payload || Number(cached?.expires_at || 0) < Date.now()) return null;
  return cached.payload as T;
}

async function setCachedPayload(key: string, payload: unknown, ttlMs: number) {
  await kv.set(key, {
    expires_at: Date.now() + ttlMs,
    payload,
  });
}

async function setCachedPayloadSafe(key: string, payload: unknown, ttlMs: number) {
  try {
    await setCachedPayload(key, payload, ttlMs);
  } catch (error) {
    console.warn(`[admin-analytics] cache write skipped for ${key}:`, error);
  }
}

function normalizeStoreOrder(order: any) {
  const createdAt = normalizeText(order?.createdAt || order?.created_at) || new Date(0).toISOString();
  const paidAt = normalizeText(order?.paid_at || order?.updatedAt || order?.updated_at || createdAt) || createdAt;
  const paymentStatus = String(order?.payment_status || order?.status || 'waiting_payment').trim();
  return {
    ...order,
    orderId: String(order?.orderId || order?.id || '').trim(),
    payment_status: paymentStatus,
    fulfillment_status: String(order?.fulfillment_status || 'pending').trim(),
    createdAt,
    paid_at: paidAt,
    totals: order?.totals || {},
    attribution_snapshot: order?.attribution_snapshot || {},
  };
}

async function loadPaidOrdersForAnalytics() {
  const enabled = await getOrdersReadModelEnabled().catch(() => false);
  const collected: any[] = [];

  for (let page = 1; page <= ANALYTICS_ORDER_MAX_PAGES; page += 1) {
    try {
      const result = enabled
        ? await listOrderSummaries({
            recordKind: 'store_order',
            page,
            limit: ANALYTICS_ORDER_PAGE_SIZE,
            paymentStatus: 'paid',
          })
        : await listStoreOrdersFromSource({
            page,
            limit: ANALYTICS_ORDER_PAGE_SIZE,
            paymentStatus: 'paid',
          });

      const items = (Array.isArray(result?.items) ? result.items : [])
        .map(normalizeStoreOrder)
        .filter((order) => String(order?.payment_status || '').trim() === 'paid');

      if (items.length > 0) {
        collected.push(...items);
      }

      if (!result?.has_more || items.length < ANALYTICS_ORDER_PAGE_SIZE) {
        break;
      }
    } catch (error) {
      console.warn('[admin-analytics] paid orders source degraded:', error);
      break;
    }
  }

  if (collected.length > 0) {
    const deduped = new Map<string, any>();
    for (const order of collected) {
      const key = String(order?.orderId || order?.id || order?.source_key || Math.random()).trim();
      if (!key) continue;
      if (!deduped.has(key)) {
        deduped.set(key, order);
      }
    }
    return Array.from(deduped.values());
  }

  const fallbackOrdersRaw = await kv.getByPrefix('order:').catch(() => []);
  return (Array.isArray(fallbackOrdersRaw) ? fallbackOrdersRaw : [])
    .filter((order) => isStoreOrderRecord(order))
    .map(normalizeStoreOrder)
    .filter((order) => String(order?.payment_status || '').trim() === 'paid');
}

async function loadBaseAnalyticsData() {
  const [eventsRaw, paidOrders, config] = await Promise.all([
    kv.getByPrefix('event_log:').catch(() => []),
    loadPaidOrdersForAnalytics().catch((error) => {
      console.warn('[admin-analytics] paid orders fallback failed:', error);
      return [];
    }),
    getCampaignGoalsConfig(),
  ]);

  const events = (Array.isArray(eventsRaw) ? eventsRaw : []).filter((event) => event && typeof event === 'object');
  const orders = (Array.isArray(paidOrders) ? paidOrders : []).filter((order) => order && typeof order === 'object');

  return { events, orders, config };
}

function buildFallbackDashboardPayload(days: 7 | 30 | 90, error?: unknown) {
  const now = Date.now();
  const currentStart = now - (days * MS_PER_DAY);
  const previousStart = currentStart - (days * MS_PER_DAY);

  return {
    window_days: days,
    generated_at: new Date().toISOString(),
    degraded: true,
    warnings: [String(error ? (error as any)?.message || error : 'Analytics em modo reduzido.')],
    range: {
      start_at: new Date(currentStart).toISOString(),
      end_at: new Date(now).toISOString(),
      previous_start_at: new Date(previousStart).toISOString(),
      previous_end_at: new Date(currentStart).toISOString(),
    },
    kpis: buildOverviewKpis([], [], [], []),
    timeseries: buildTimeseries(days, [], []),
    acquisition: buildAcquisitionSummary([]),
    content: buildContentSummary([]),
    search: {
      total_searches: 0,
      zero_result_rate: 0,
      ctr: 0,
      top_terms: [],
    },
    funnel: buildFunnelSummary([], []),
    insights: [
      {
        id: 'analytics-degraded',
        severity: 'warning',
        title: 'Analytics em modo reduzido',
        body: 'A página abriu com fallback seguro porque uma fonte auxiliar ou o cache falhou nesta leitura.',
      },
    ],
  };
}

function buildFallbackCampaignsPayload(days: 7 | 30 | 90, error?: unknown) {
  return {
    window_days: days,
    generated_at: new Date().toISOString(),
    degraded: true,
    warnings: [String(error ? (error as any)?.message || error : 'Campanhas em modo reduzido.')],
    goals: [
      {
        goal: 'purchase_paid',
        conversions: 0,
        total_value: 0,
        avg_value: 0,
        daily: [],
      },
      {
        goal: 'whatsapp_banner_lead',
        conversions: 0,
        total_value: 0,
        avg_value: 0,
        daily: [],
      },
    ],
    platforms: {
      meta_capi_relays: 0,
      google_tag_ready: false,
      google_purchase_label_ready: false,
      meta_pixel_ready: false,
      posthog_replay_ready: false,
    },
    utm_campaigns: [],
    utm_sources: [],
    top_banners: [],
  };
}

function buildFallbackReplayPayload(days: 7 | 30 | 90, limit: number, error?: unknown) {
  return {
    window_days: days,
    generated_at: new Date().toISOString(),
    degraded: true,
    warnings: [String(error ? (error as any)?.message || error : 'Replays em modo reduzido.')],
    limit,
    items: [],
  };
}

function filterEventsByRange(events: any[], startAt: number, endAt: number) {
  return events.filter((event) => {
    const timestamp = eventTimestamp(event);
    return timestamp >= startAt && timestamp < endAt;
  });
}

function filterOrdersByRange(orders: any[], startAt: number, endAt: number, usePaidAt = false) {
  return orders.filter((order) => {
    const timestamp = parseTimestamp(usePaidAt ? order?.paid_at : order?.createdAt);
    return timestamp >= startAt && timestamp < endAt;
  });
}

function buildSessionSummaries(events: any[]) {
  const sorted = [...events].sort((a, b) => eventTimestamp(a) - eventTimestamp(b));
  const sessions = new Map<string, SessionAccumulator>();

  for (const event of sorted) {
    const sessionId = eventSessionId(event);
    const timestamp = eventTimestamp(event);
    const path = normalizePath(event?.page_path || event?.page_url || event?.attribution?.landing_page);
    const attribution = event?.attribution || {};
    const referrerHost = normalizeHost(event?.referrer || attribution?.referrer);
    const userAgent = readUserAgent(event);
    const country = normalizeText(event?.properties?.country || event?.properties?.geo_country || event?.properties?.country_code);
    const sourceSurface = normalizeText(event?.source_surface);

    let session = sessions.get(sessionId);
    if (!session) {
      session = {
        session_id: sessionId,
        visitor_key: eventVisitorKey(event),
        first_ts: timestamp,
        last_ts: timestamp,
        first_page: path,
        last_page: path,
        pageviews: 0,
        paths: new Set(path ? [path] : []),
        channel: classifyChannel(attribution, referrerHost),
        utm_source: normalizeText(attribution?.utm_source),
        utm_campaign: normalizeText(attribution?.utm_campaign),
        referrer_host: referrerHost,
        device_type: classifyDeviceType(userAgent),
        browser: classifyBrowser(userAgent),
        country,
        event_names: new Set(),
        product_views: 0,
        add_to_cart: 0,
        begin_checkout: 0,
        purchases: 0,
        purchase_value: 0,
        whatsapp_leads: 0,
        whatsapp_value: 0,
        top_surface: sourceSurface,
      };
      sessions.set(sessionId, session);
    }

    session.first_ts = Math.min(session.first_ts, timestamp);
    session.last_ts = Math.max(session.last_ts, timestamp);
    if (path) {
      if (!session.first_page) session.first_page = path;
      session.last_page = path;
      session.paths.add(path);
    }
    if (!session.country && country) session.country = country;
    if ((!session.referrer_host || session.referrer_host === 'unknown') && referrerHost) session.referrer_host = referrerHost;
    if ((!session.utm_source || session.utm_source === 'unknown') && attribution?.utm_source) session.utm_source = String(attribution.utm_source);
    if ((!session.utm_campaign || session.utm_campaign === 'unknown') && attribution?.utm_campaign) session.utm_campaign = String(attribution.utm_campaign);
    if (!session.top_surface && sourceSurface) session.top_surface = sourceSurface;
    session.event_names.add(String(event?.event_name || 'unknown'));

    switch (String(event?.event_name || '')) {
      case 'page_view':
        session.pageviews += 1;
        break;
      case 'view_item':
        session.product_views += 1;
        break;
      case 'add_to_cart':
        session.add_to_cart += 1;
        break;
      case 'begin_checkout':
        session.begin_checkout += 1;
        break;
      case 'purchase_paid':
        session.purchases += 1;
        session.purchase_value += getEventValue(event);
        break;
      case 'whatsapp_banner_lead':
        session.whatsapp_leads += 1;
        session.whatsapp_value += getEventValue(event);
        break;
      default:
        break;
    }
  }

  return Array.from(sessions.values());
}

function buildKpiMetric(current: number, previous: number) {
  return {
    current: round(current, 2),
    previous: round(previous, 2),
    delta_pct: safeDelta(current, previous),
  };
}

function buildOverviewKpis(currentSessions: SessionAccumulator[], previousSessions: SessionAccumulator[], currentPaidOrders: any[], previousPaidOrders: any[]) {
  const currentVisitors = new Set(currentSessions.map((session) => session.visitor_key)).size;
  const previousVisitors = new Set(previousSessions.map((session) => session.visitor_key)).size;
  const currentPageviews = currentSessions.reduce((sum, session) => sum + session.pageviews, 0);
  const previousPageviews = previousSessions.reduce((sum, session) => sum + session.pageviews, 0);
  const currentAvgPages = currentSessions.length ? currentPageviews / currentSessions.length : 0;
  const previousAvgPages = previousSessions.length ? previousPageviews / previousSessions.length : 0;
  const currentAvgActiveSeconds = currentSessions.length
    ? currentSessions.reduce((sum, session) => sum + Math.max(0, (session.last_ts - session.first_ts) / 1000), 0) / currentSessions.length
    : 0;
  const previousAvgActiveSeconds = previousSessions.length
    ? previousSessions.reduce((sum, session) => sum + Math.max(0, (session.last_ts - session.first_ts) / 1000), 0) / previousSessions.length
    : 0;
  const currentBounceRate = safePct(currentSessions.filter((session) => session.pageviews <= 1).length, currentSessions.length);
  const previousBounceRate = safePct(previousSessions.filter((session) => session.pageviews <= 1).length, previousSessions.length);
  const currentRevenue = currentPaidOrders.reduce((sum, order) => sum + Number(order?.totals?.total || 0), 0);
  const previousRevenue = previousPaidOrders.reduce((sum, order) => sum + Number(order?.totals?.total || 0), 0);

  return {
    visitors: buildKpiMetric(currentVisitors, previousVisitors),
    sessions: buildKpiMetric(currentSessions.length, previousSessions.length),
    pageviews: buildKpiMetric(currentPageviews, previousPageviews),
    pages_per_session: buildKpiMetric(currentAvgPages, previousAvgPages),
    avg_active_time_seconds: buildKpiMetric(currentAvgActiveSeconds, previousAvgActiveSeconds),
    bounce_rate: buildKpiMetric(currentBounceRate, previousBounceRate),
    paid_orders: buildKpiMetric(currentPaidOrders.length, previousPaidOrders.length),
    revenue: buildKpiMetric(currentRevenue, previousRevenue),
  };
}

function buildTimeseries(days: number, events: any[], paidOrders: any[]) {
  const buckets = new Map<string, any>();
  for (let index = days - 1; index >= 0; index -= 1) {
    const date = toIsoDate(dateDaysAgo(index));
    buckets.set(date, {
      date,
      sessions: 0,
      pageviews: 0,
      paid_orders: 0,
      revenue: 0,
      whatsapp_leads: 0,
      whatsapp_value: 0,
      _sessions: new Set<string>(),
    });
  }

  for (const event of events) {
    const timestamp = eventTimestamp(event);
    if (!timestamp) continue;
    const date = toIsoDate(new Date(timestamp));
    const bucket = buckets.get(date);
    if (!bucket) continue;
    bucket._sessions.add(eventSessionId(event));
    if (event?.event_name === 'page_view') bucket.pageviews += 1;
    if (event?.event_name === 'whatsapp_banner_lead') {
      bucket.whatsapp_leads += 1;
      bucket.whatsapp_value += getEventValue(event);
    }
  }

  for (const order of paidOrders) {
    const date = toIsoDate(new Date(parseTimestamp(order?.paid_at)));
    const bucket = buckets.get(date);
    if (!bucket) continue;
    bucket.paid_orders += 1;
    bucket.revenue += Number(order?.totals?.total || 0);
  }

  return Array.from(buckets.values()).map((bucket) => ({
    date: bucket.date,
    sessions: bucket._sessions.size,
    pageviews: bucket.pageviews,
    paid_orders: bucket.paid_orders,
    revenue: round(bucket.revenue, 2),
    whatsapp_leads: bucket.whatsapp_leads,
    whatsapp_value: round(bucket.whatsapp_value, 2),
  }));
}

function buildAcquisitionSummary(sessions: SessionAccumulator[]) {
  const totalSessions = sessions.length;
  const channelCounts = new Map<string, number>();
  const sourceCounts = new Map<string, number>();
  const campaignCounts = new Map<string, number>();
  const landingCounts = new Map<string, number>();
  const exitCounts = new Map<string, number>();
  const referrerCounts = new Map<string, number>();
  const deviceCounts = new Map<string, number>();
  const browserCounts = new Map<string, number>();
  const countryCounts = new Map<string, number>();

  for (const session of sessions) {
    incrementMap(channelCounts, session.channel);
    incrementMap(sourceCounts, session.utm_source || session.channel);
    incrementMap(campaignCounts, session.utm_campaign);
    incrementMap(landingCounts, session.first_page);
    incrementMap(exitCounts, session.last_page);
    incrementMap(referrerCounts, session.referrer_host || 'direct');
    incrementMap(deviceCounts, session.device_type);
    incrementMap(browserCounts, session.browser);
    incrementMap(countryCounts, session.country);
  }

  return {
    channels: toTopList(channelCounts, totalSessions, 8, channelLabel),
    sources: toTopList(sourceCounts, totalSessions, 10),
    campaigns: toTopList(campaignCounts, totalSessions, 10),
    landing_pages: toTopList(landingCounts, totalSessions, 10),
    exit_pages: toTopList(exitCounts, totalSessions, 10),
    referrers: toTopList(referrerCounts, totalSessions, 10),
    devices: toTopList(deviceCounts, totalSessions, 5),
    browsers: toTopList(browserCounts, totalSessions, 6),
    countries: toTopList(countryCounts, totalSessions, 10),
  };
}

function buildContentSummary(events: any[]) {
  const pageCounts = new Map<string, number>();
  const productCounts = new Map<string, number>();
  const productNames = new Map<string, string>();
  const whatsappSurfaceCounts = new Map<string, number>();
  const whatsappSurfaceValues = new Map<string, number>();

  for (const event of events) {
    if (event?.event_name === 'page_view') {
      incrementMap(pageCounts, normalizePath(event?.page_path || event?.page_url));
    }
    if (event?.event_name === 'view_item') {
      const sku = normalizeText(event?.ecommerce?.items?.[0]?.item_id || event?.properties?.sku || event?.linked_product_sku);
      if (!sku) continue;
      incrementMap(productCounts, sku);
      const name = normalizeText(event?.ecommerce?.items?.[0]?.name || event?.properties?.name);
      if (name) productNames.set(sku, name);
    }
    if (event?.event_name === 'whatsapp_banner_lead') {
      const key = normalizeText(event?.banner_id || event?.source_surface) || 'whatsapp';
      incrementMap(whatsappSurfaceCounts, key);
      whatsappSurfaceValues.set(key, (whatsappSurfaceValues.get(key) || 0) + getEventValue(event));
    }
  }

  return {
    top_pages: toTopList(pageCounts, 0, 12),
    top_products: Array.from(productCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
      .map(([sku, views]) => ({
        sku,
        name: productNames.get(sku) || sku,
        views,
      })),
    whatsapp_surfaces: Array.from(whatsappSurfaceCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
      .map(([surface, leads]) => ({
        surface,
        leads,
        value: round(whatsappSurfaceValues.get(surface) || 0, 2),
      })),
  };
}

async function buildSearchSummary(days: number) {
  const dayKeys = Array.from({ length: days }, (_, index) => dateKeyFromDate(dateDaysAgo(index)));
  const aggs = await Promise.all(dayKeys.map((dayKey) => kv.get(`si:agg:${dayKey}`).catch(() => null)));
  const allTerms = await kv.getByPrefix('si:term:').catch(() => []);
  const startAt = dateDaysAgo(days - 1).getTime();

  let totalSearches = 0;
  let zeroResults = 0;
  let clicks = 0;

  for (const agg of aggs) {
    totalSearches += Number(agg?.total_searches || 0);
    zeroResults += Number(agg?.zero_results || 0);
    clicks += Number(agg?.clicks || 0);
  }

  const topTerms = (Array.isArray(allTerms) ? allTerms : [])
    .filter((term) => parseTimestamp(term?.last_seen) >= startAt)
    .sort((a, b) => Number(b?.search_count || 0) - Number(a?.search_count || 0))
    .slice(0, 12)
    .map((term) => ({
      term: String(term?.query_normalized || '').trim(),
      searches: Number(term?.search_count || 0),
      zero_rate: safePct(Number(term?.zero_count || 0), Number(term?.search_count || 0)),
      ctr: safePct(Number(term?.click_count || 0), Number(term?.search_count || 0)),
      last_seen: term?.last_seen || null,
    }));

  return {
    total_searches: totalSearches,
    zero_results: zeroResults,
    zero_result_rate: safePct(zeroResults, totalSearches),
    ctr: safePct(clicks, totalSearches),
    top_terms: topTerms,
  };
}

function buildFunnelSummary(sessions: SessionAccumulator[], orders: any[]) {
  const sessionCount = sessions.length;
  const pdpSessionCount = sessions.filter((session) => session.product_views > 0).length;
  const addToCartSessionCount = sessions.filter((session) => session.add_to_cart > 0).length;
  const checkoutSessionCount = sessions.filter((session) => session.begin_checkout > 0).length;
  const purchaseCount = orders.length;

  const funnelSteps = [
    { key: 'sessions', label: 'Sessoes', value: sessionCount, pct_of_sessions: 100, dropoff_pct: 0 },
    { key: 'view_item', label: 'PDP view', value: pdpSessionCount, pct_of_sessions: safePct(pdpSessionCount, sessionCount), dropoff_pct: safePct(sessionCount - pdpSessionCount, sessionCount) },
    { key: 'add_to_cart', label: 'Add to cart', value: addToCartSessionCount, pct_of_sessions: safePct(addToCartSessionCount, sessionCount), dropoff_pct: safePct(pdpSessionCount - addToCartSessionCount, pdpSessionCount) },
    { key: 'begin_checkout', label: 'Begin checkout', value: checkoutSessionCount, pct_of_sessions: safePct(checkoutSessionCount, sessionCount), dropoff_pct: safePct(addToCartSessionCount - checkoutSessionCount, addToCartSessionCount) },
    { key: 'purchase_paid', label: 'Pedido pago', value: purchaseCount, pct_of_sessions: safePct(purchaseCount, sessionCount), dropoff_pct: safePct(checkoutSessionCount - purchaseCount, checkoutSessionCount) },
  ];

  const byChannel = new Map<string, { sessions: number; purchases: number; revenue: number; whatsapp_leads: number }>();
  for (const session of sessions) {
    const current = byChannel.get(session.channel) || { sessions: 0, purchases: 0, revenue: 0, whatsapp_leads: 0 };
    current.sessions += 1;
    current.whatsapp_leads += session.whatsapp_leads;
    byChannel.set(session.channel, current);
  }
  for (const order of orders) {
    const attribution = order?.attribution_snapshot || {};
    const channel = classifyChannel(attribution, normalizeHost(attribution?.referrer));
    const current = byChannel.get(channel) || { sessions: 0, purchases: 0, revenue: 0, whatsapp_leads: 0 };
    current.purchases += 1;
    current.revenue += Number(order?.totals?.total || 0);
    byChannel.set(channel, current);
  }

  const byCampaign = new Map<string, { sessions: number; purchases: number; revenue: number }>();
  for (const session of sessions) {
    if (!session.utm_campaign) continue;
    const current = byCampaign.get(session.utm_campaign) || { sessions: 0, purchases: 0, revenue: 0 };
    current.sessions += 1;
    byCampaign.set(session.utm_campaign, current);
  }
  for (const order of orders) {
    const campaign = normalizeText(order?.attribution_snapshot?.utm_campaign);
    if (!campaign) continue;
    const current = byCampaign.get(campaign) || { sessions: 0, purchases: 0, revenue: 0 };
    current.purchases += 1;
    current.revenue += Number(order?.totals?.total || 0);
    byCampaign.set(campaign, current);
  }

  return {
    steps: funnelSteps,
    by_channel: Array.from(byChannel.entries())
      .sort((a, b) => b[1].revenue - a[1].revenue || b[1].purchases - a[1].purchases || b[1].sessions - a[1].sessions)
      .slice(0, 8)
      .map(([channel, metrics]) => ({
        channel,
        label: channelLabel(channel),
        sessions: metrics.sessions,
        purchases: metrics.purchases,
        revenue: round(metrics.revenue, 2),
        whatsapp_leads: metrics.whatsapp_leads,
        purchase_rate: safePct(metrics.purchases, metrics.sessions),
      })),
    by_campaign: Array.from(byCampaign.entries())
      .sort((a, b) => b[1].revenue - a[1].revenue || b[1].purchases - a[1].purchases || b[1].sessions - a[1].sessions)
      .slice(0, 10)
      .map(([campaign, metrics]) => ({
        campaign,
        sessions: metrics.sessions,
        purchases: metrics.purchases,
        revenue: round(metrics.revenue, 2),
        purchase_rate: safePct(metrics.purchases, metrics.sessions),
      })),
  };
}

function buildReplayItems(sessions: SessionAccumulator[], config: Awaited<ReturnType<typeof getCampaignGoalsConfig>>, limit = 20) {
  return [...sessions]
    .filter((session) => session.begin_checkout > 0 || session.whatsapp_leads > 0 || session.purchases > 0)
    .sort((a, b) => {
      const scoreA = (a.purchase_value * 2) + a.whatsapp_value + (a.begin_checkout * 250);
      const scoreB = (b.purchase_value * 2) + b.whatsapp_value + (b.begin_checkout * 250);
      if (scoreA !== scoreB) return scoreB - scoreA;
      return b.last_ts - a.last_ts;
    })
    .slice(0, limit)
    .map((session) => ({
      session_id: session.session_id,
      started_at: new Date(session.first_ts).toISOString(),
      duration_seconds: round(Math.max(0, (session.last_ts - session.first_ts) / 1000), 2),
      entry_url: session.first_page,
      utm_source: session.utm_source,
      utm_campaign: session.utm_campaign,
      device_type: session.device_type,
      reason: session.purchases > 0 ? 'purchase_paid' : session.whatsapp_leads > 0 ? 'whatsapp_banner_lead' : 'begin_checkout',
      posthog_url: buildPostHogReplayUrl(config, session.session_id),
      value: round(session.purchase_value + session.whatsapp_value, 2),
    }));
}

function buildInsights(kpis: any, funnel: any, search: any) {
  const insights: Array<{ id: string; severity: 'info' | 'warning' | 'critical'; title: string; body: string }> = [];

  if (kpis.sessions.delta_pct <= -20) {
    insights.push({ id: 'sessions-drop', severity: 'critical', title: 'Queda forte de sessoes', body: `As sessoes cairam ${Math.abs(kpis.sessions.delta_pct)}% versus a janela anterior.` });
  }
  if (kpis.bounce_rate.current >= 60) {
    insights.push({ id: 'bounce-rate-high', severity: 'warning', title: 'Bounce rate acima do ideal', body: `O bounce rate atual esta em ${kpis.bounce_rate.current}%.` });
  }
  const pdpToCart = safePct(
    Number(funnel?.steps?.find((step: any) => step.key === 'add_to_cart')?.value || 0),
    Number(funnel?.steps?.find((step: any) => step.key === 'view_item')?.value || 0),
  );
  if (pdpToCart > 0 && pdpToCart < 15) {
    insights.push({ id: 'pdp-cart-low', severity: 'warning', title: 'Conversao PDP -> carrinho baixa', body: `A taxa entre PDP e carrinho esta em ${pdpToCart}%.` });
  }
  const checkoutToPaid = safePct(
    Number(funnel?.steps?.find((step: any) => step.key === 'purchase_paid')?.value || 0),
    Number(funnel?.steps?.find((step: any) => step.key === 'begin_checkout')?.value || 0),
  );
  if (checkoutToPaid > 0 && checkoutToPaid < 35) {
    insights.push({ id: 'checkout-paid-low', severity: 'warning', title: 'Conversao checkout -> pago baixa', body: `A taxa entre checkout iniciado e pagamento esta em ${checkoutToPaid}%.` });
  }
  if (search?.zero_result_rate >= 12) {
    insights.push({ id: 'search-zero-high', severity: 'warning', title: 'Zero result rate alto', body: `${search.zero_result_rate}% das buscas terminaram sem resultado no periodo.` });
  }
  if (insights.length === 0) {
    insights.push({ id: 'healthy', severity: 'info', title: 'Sinais principais estaveis', body: 'Nao identificamos alertas graves nas metricas principais desta janela.' });
  }
  return insights;
}

async function buildDashboardPayload(days: 7 | 30 | 90) {
  const { events, orders } = await loadBaseAnalyticsData();
  const now = Date.now();
  const currentStart = now - (days * MS_PER_DAY);
  const previousStart = currentStart - (days * MS_PER_DAY);

  const currentEvents = filterEventsByRange(events, currentStart, now);
  const previousEvents = filterEventsByRange(events, previousStart, currentStart);
  const currentPaidOrders = filterOrdersByRange(orders.filter((order) => order.payment_status === 'paid'), currentStart, now, true);
  const previousPaidOrders = filterOrdersByRange(orders.filter((order) => order.payment_status === 'paid'), previousStart, currentStart, true);

  const currentSessions = buildSessionSummaries(currentEvents);
  const previousSessions = buildSessionSummaries(previousEvents);
  const kpis = buildOverviewKpis(currentSessions, previousSessions, currentPaidOrders, previousPaidOrders);
  const timeseries = buildTimeseries(days, currentEvents, currentPaidOrders);
  const acquisition = buildAcquisitionSummary(currentSessions);
  const content = buildContentSummary(currentEvents);
  const search = await buildSearchSummary(days);
  const funnel = buildFunnelSummary(currentSessions, currentPaidOrders);
  const insights = buildInsights(kpis, funnel, search);

  return {
    window_days: days,
    generated_at: new Date().toISOString(),
    range: {
      start_at: new Date(currentStart).toISOString(),
      end_at: new Date(now).toISOString(),
      previous_start_at: new Date(previousStart).toISOString(),
      previous_end_at: new Date(currentStart).toISOString(),
    },
    kpis,
    timeseries,
    acquisition,
    content,
    search,
    funnel,
    insights,
  };
}

async function buildCampaignsPayload(days: 7 | 30 | 90) {
  const { events, orders, config } = await loadBaseAnalyticsData();
  const now = Date.now();
  const currentStart = now - (days * MS_PER_DAY);
  const currentEvents = filterEventsByRange(events, currentStart, now);
  const currentPaidOrders = filterOrdersByRange(orders.filter((order) => order.payment_status === 'paid'), currentStart, now, true);

  const leadEvents = currentEvents.filter((event) => event?.event_name === 'whatsapp_banner_lead');
  const purchaseEvents = currentEvents.filter((event) => event?.event_name === 'purchase_paid');
  const dailyLeadMap = new Map<string, { conversions: number; value: number }>();
  const dailyPurchaseMap = new Map<string, { conversions: number; value: number }>();
  const utmCampaigns = new Map<string, number>();
  const utmSources = new Map<string, number>();
  const bannerValues = new Map<string, number>();
  const bannerLeads = new Map<string, number>();

  for (const lead of leadEvents) {
    const date = toIsoDate(new Date(eventTimestamp(lead)));
    const bucket = dailyLeadMap.get(date) || { conversions: 0, value: 0 };
    bucket.conversions += 1;
    bucket.value += getEventValue(lead);
    dailyLeadMap.set(date, bucket);

    const campaign = normalizeText(lead?.attribution?.utm_campaign);
    const source = normalizeText(lead?.attribution?.utm_source) || classifyChannel(lead?.attribution, normalizeHost(lead?.referrer));
    const banner = normalizeText(lead?.banner_id || lead?.source_surface) || 'whatsapp';
    incrementMap(utmCampaigns, campaign, getEventValue(lead));
    incrementMap(utmSources, source, getEventValue(lead));
    incrementMap(bannerLeads, banner);
    bannerValues.set(banner, (bannerValues.get(banner) || 0) + getEventValue(lead));
  }

  for (const order of currentPaidOrders) {
    const date = toIsoDate(new Date(parseTimestamp(order?.paid_at)));
    const bucket = dailyPurchaseMap.get(date) || { conversions: 0, value: 0 };
    bucket.conversions += 1;
    bucket.value += Number(order?.totals?.total || 0);
    dailyPurchaseMap.set(date, bucket);

    const campaign = normalizeText(order?.attribution_snapshot?.utm_campaign);
    const source = normalizeText(order?.attribution_snapshot?.utm_source) || classifyChannel(order?.attribution_snapshot, normalizeHost(order?.attribution_snapshot?.referrer));
    incrementMap(utmCampaigns, campaign, Number(order?.totals?.total || 0));
    incrementMap(utmSources, source, Number(order?.totals?.total || 0));
  }

  const metaRelays = purchaseEvents.filter((event) => Array.isArray(event?._meta?.relayed_to) && event._meta.relayed_to.includes('meta_capi')).length
    + leadEvents.filter((event) => Array.isArray(event?._meta?.relayed_to) && event._meta.relayed_to.includes('meta_capi')).length;

  return {
    window_days: days,
    generated_at: new Date().toISOString(),
    goals: [
      {
        goal: 'purchase_paid',
        conversions: currentPaidOrders.length,
        total_value: round(currentPaidOrders.reduce((sum, order) => sum + Number(order?.totals?.total || 0), 0), 2),
        avg_value: round(currentPaidOrders.reduce((sum, order) => sum + Number(order?.totals?.total || 0), 0) / Math.max(currentPaidOrders.length, 1), 2),
        daily: Array.from(dailyPurchaseMap.entries()).sort((a, b) => a[0].localeCompare(b[0])).map(([date, metrics]) => ({ date, ...metrics })),
      },
      {
        goal: 'whatsapp_banner_lead',
        conversions: leadEvents.length,
        total_value: round(leadEvents.reduce((sum, event) => sum + getEventValue(event), 0), 2),
        avg_value: round(leadEvents.reduce((sum, event) => sum + getEventValue(event), 0) / Math.max(leadEvents.length, 1), 2),
        daily: Array.from(dailyLeadMap.entries()).sort((a, b) => a[0].localeCompare(b[0])).map(([date, metrics]) => ({ date, ...metrics })),
      },
    ],
    platforms: {
      meta_capi_relays: metaRelays,
      google_tag_ready: Boolean(config.googleAdsTagId && config.googleAdsWhatsappLeadLabel),
      google_purchase_label_ready: Boolean(config.googleAdsTagId && config.googleAdsPurchaseLabel),
      meta_pixel_ready: Boolean(config.metaPixelId),
      posthog_replay_ready: Boolean(config.posthogHost && config.posthogProjectId),
    },
    utm_campaigns: toTopList(utmCampaigns, 0, 10),
    utm_sources: toTopList(utmSources, 0, 10, channelLabel),
    top_banners: Array.from(bannerLeads.entries())
      .sort((a, b) => (bannerValues.get(b[0]) || 0) - (bannerValues.get(a[0]) || 0) || b[1] - a[1])
      .slice(0, 12)
      .map(([banner, leads]) => ({ banner, leads, value: round(bannerValues.get(banner) || 0, 2) })),
  };
}

async function buildReplayPayload(days: 7 | 30 | 90, limit: number) {
  const { events, config } = await loadBaseAnalyticsData();
  const now = Date.now();
  const currentStart = now - (days * MS_PER_DAY);
  const currentEvents = filterEventsByRange(events, currentStart, now);
  const sessions = buildSessionSummaries(currentEvents);

  return {
    window_days: days,
    generated_at: new Date().toISOString(),
    items: buildReplayItems(sessions, config, limit),
  };
}

adminAnalytics.get('/dashboard', async (c) => {
  const days = normalizeDays(c.req.query('days'));
  const force = c.req.query('force') === '1';
  const cacheKey = `${CACHE_PREFIX}dashboard:${days}`;
  try {
    const cached = await getCachedPayload<any>(cacheKey, force);
    if (cached) return c.json(cached);
    const payload = await buildDashboardPayload(days);
    await setCachedPayloadSafe(cacheKey, payload, 900_000);
    return c.json(payload);
  } catch (error) {
    console.error('[admin-analytics] dashboard error:', error);
    return c.json(buildFallbackDashboardPayload(days, error));
  }
});

adminAnalytics.get('/campaigns', async (c) => {
  const days = normalizeDays(c.req.query('days'));
  const force = c.req.query('force') === '1';
  const cacheKey = `${CACHE_PREFIX}campaigns:${days}`;
  try {
    const cached = await getCachedPayload<any>(cacheKey, force);
    if (cached) return c.json(cached);
    const payload = await buildCampaignsPayload(days);
    await setCachedPayloadSafe(cacheKey, payload, 900_000);
    return c.json(payload);
  } catch (error) {
    console.error('[admin-analytics] campaigns error:', error);
    return c.json(buildFallbackCampaignsPayload(days, error));
  }
});

adminAnalytics.get('/replays', async (c) => {
  const days = normalizeDays(c.req.query('days'));
  const limit = Math.max(1, Math.min(Number(c.req.query('limit') || 20), 50));
  const force = c.req.query('force') === '1';
  const cacheKey = `${CACHE_PREFIX}replays:${days}:${limit}`;
  try {
    const cached = await getCachedPayload<any>(cacheKey, force);
    if (cached) return c.json(cached);
    const payload = await buildReplayPayload(days, limit);
    await setCachedPayloadSafe(cacheKey, payload, 600_000);
    return c.json(payload);
  } catch (error) {
    console.error('[admin-analytics] replays error:', error);
    return c.json(buildFallbackReplayPayload(days, limit, error));
  }
});
