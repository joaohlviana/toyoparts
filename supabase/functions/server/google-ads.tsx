import { Hono } from 'npm:hono';
import * as kv from './kv_store.tsx';
import { getCampaignGoalsConfig, saveCampaignGoalsConfig } from './marketing.tsx';
import { resolveProductMedia } from './media-utils.tsx';
import {
  getGoogleAdsConfig,
  listWhatsAppLeads,
  listOfflineConversionJobs,
  redactGoogleAdsConfig,
  saveGoogleAdsConfig,
  summarizeOfflineJobs,
  type GoogleAdsConversionStatus,
  type GoogleAdsHealthReport,
  type GoogleAdsHealthState,
  type OfflineConversionJob,
} from './performance-marketing.tsx';
import {
  googleAdsEnsureConversionActions,
  googleAdsEnsureMerchantLink,
  googleAdsFetchCampaignPerformance,
  googleAdsFetchConversionActions,
  googleAdsFetchShoppingProductPerformance,
  googleAdsFetchShoppingProductStatuses,
  googleAdsFetchPmaxCampaigns,
  googleAdsFetchProductLinkInvitations,
  googleAdsFetchProductLinks,
  googleAdsGetCustomerInfo,
  googleAdsProvisionBasePmaxCampaign,
  resolveGoogleAdsDateRange,
  googleAdsTestConnection,
  googleAdsUploadClickConversion,
  type GoogleAdsCampaignPerformance,
  type GoogleAdsDashboardRange,
} from './google-ads-api.tsx';

export const googleAdsAdmin = new Hono();
const OPENAI_API_KEY = (Deno.env.get('OPENAI_API_KEY') || '').trim();
const GOOGLE_ADS_AI_CACHE_PREFIX = 'google_ads_ai_recommendations:';
const GOOGLE_ADS_AI_CACHE_TTL_MS = 10 * 60 * 1000;

type RecommendationPriority = 'high' | 'medium' | 'low';
type RecommendationUrgency = 'now' | 'this_week' | 'monitor';
type CampaignDecision = 'pause' | 'reduce_budget' | 'fix_measurement' | 'keep' | 'watch';
type RecommendationConfidence = 'high' | 'medium' | 'low';

interface GoogleAdsPriorityRecommendation {
  title: string;
  action: string;
  why: string;
  priority: RecommendationPriority;
  urgency: RecommendationUrgency;
  owner: string;
}

interface GoogleAdsCampaignRecommendation {
  campaign_id: string | null;
  campaign_name: string;
  classification: string | null;
  recommendation: CampaignDecision;
  priority: RecommendationPriority;
  confidence: RecommendationConfidence;
  reason: string;
}

interface GoogleAdsRecommendationReport {
  generated_at: string;
  range: ReturnType<typeof resolveGoogleAdsDateRange>;
  source: 'openai' | 'rules';
  model: string | null;
  headline: string;
  summary: string;
  root_cause: string;
  confidence: RecommendationConfidence;
  top_priorities: GoogleAdsPriorityRecommendation[];
  campaign_actions: GoogleAdsCampaignRecommendation[];
  next_checks: string[];
  warnings: string[];
  cache: {
    hit: boolean;
    age_minutes: number | null;
  };
}

function parseTimestamp(value: unknown): number {
  const time = new Date(String(value || '')).getTime();
  return Number.isFinite(time) ? time : 0;
}

function normalizeState(ok: boolean, warning = false): GoogleAdsHealthState {
  if (ok) return 'ok';
  return warning ? 'warning' : 'error';
}

function normalizeText(value: unknown): string | null {
  const normalized = String(value || '').trim();
  return normalized || null;
}

function parseRangeParam(value: string | null | undefined): GoogleAdsDashboardRange {
  const normalized = String(value || 'month').trim().toLowerCase();
  return normalized === 'month' || normalized === '7d' || normalized === '30d' || normalized === '90d'
    ? normalized
    : '30d';
}

function roundNumber(value: number, digits = 2) {
  if (!Number.isFinite(value)) return 0;
  return Number(value.toFixed(digits));
}

function parseMoneyValue(value: unknown) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeTextValue(value: unknown): string | null {
  const normalized = String(value || '').trim();
  return normalized || null;
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

function classifyAttributionChannel(attribution: any, referrerHost?: string | null): string {
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
      return 'Google Ads / Google';
    case 'facebook':
      return 'Meta';
    case 'direct':
      return 'Direto';
    case 'organic':
      return 'Orgânico';
    case 'email':
      return 'E-mail';
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

function toTopList(
  map: Map<string, number>,
  total = 0,
  limit = 10,
  labelTransform?: (key: string) => string,
) {
  return Array.from(map.entries())
    .sort((left, right) => right[1] - left[1])
    .slice(0, limit)
    .map(([key, value]) => ({
      key,
      label: labelTransform ? labelTransform(key) : key,
      value: roundNumber(value, 2),
      pct: total > 0 ? roundNumber((value / total) * 100, 2) : 0,
    }));
}

function percentageDelta(current: number, previous: number): number | null {
  const safeCurrent = Number(current || 0);
  const safePrevious = Number(previous || 0);
  if (!safePrevious) {
    if (!safeCurrent) return 0;
    return 100;
  }
  return roundNumber(((safeCurrent - safePrevious) / safePrevious) * 100, 2);
}

function aggregateCampaignMetrics(rows: GoogleAdsCampaignPerformance[], accessor: 'current' | 'previous') {
  const merged = rows.reduce((accumulator, row) => {
    const snapshot = row[accessor];
    accumulator.impressions += Number(snapshot?.impressions || 0);
    accumulator.clicks += Number(snapshot?.clicks || 0);
    accumulator.cost += Number(snapshot?.cost || 0);
    accumulator.conversions += Number(snapshot?.conversions || 0);
    accumulator.conversion_value += Number(snapshot?.conversion_value || 0);
    return accumulator;
  }, {
    impressions: 0,
    clicks: 0,
    cost: 0,
    conversions: 0,
    conversion_value: 0,
  });

  return {
    ...merged,
    roas: merged.cost > 0 ? roundNumber(merged.conversion_value / merged.cost, 2) : 0,
    cpa: merged.conversions > 0 ? roundNumber(merged.cost / merged.conversions, 2) : null,
  };
}

function isDateWithin(value: unknown, start: string, end: string) {
  const parsed = new Date(String(value || '')).getTime();
  if (!Number.isFinite(parsed)) return false;
  const startTime = new Date(`${start}T00:00:00-03:00`).getTime();
  const endTime = new Date(`${end}T23:59:59-03:00`).getTime();
  return parsed >= startTime && parsed <= endTime;
}

function summarizeCampaignRows(
  campaigns: GoogleAdsCampaignPerformance[],
  config: Awaited<ReturnType<typeof getGoogleAdsConfig>>,
) {
  const decorated = campaigns.map((campaign) => {
    const isPaused = String(campaign.status || '').toUpperCase() !== 'ENABLED';
    const isBase = String(campaign.id || '') === String(config.pmax_base_campaign_id || '');
    const isPmax = String(campaign.advertising_channel_type || '').toUpperCase() === 'PERFORMANCE_MAX';
    const hasVolume = campaign.current.impressions > 0 || campaign.current.clicks > 0 || campaign.current.conversions > 0;
    const improving =
      !isPaused &&
      campaign.current.cost >= 50 &&
      campaign.delta.roas_pct != null &&
      campaign.delta.conversion_value_pct != null &&
      campaign.delta.roas_pct > 0 &&
      campaign.delta.conversion_value_pct > 0;
    const alert =
      !isPaused && !improving && (
        (campaign.current.clicks >= 20 && campaign.current.conversions <= 0) ||
        (
          campaign.delta.cost_pct != null &&
          campaign.delta.roas_pct != null &&
          campaign.delta.cost_pct > 0 &&
          campaign.delta.roas_pct < 0
        ) ||
        (campaign.current.cost >= 50 && campaign.current.roas > 0 && campaign.current.roas < 1.5)
      );

    const bucket = isBase ? 'pmax_base' : isPmax ? 'pmax_legacy' : 'other';
    const classification = isPaused ? 'paused' : !hasVolume ? 'no_volume' : improving ? 'improving' : alert ? 'alert' : 'stable';

    return {
      ...campaign,
      bucket,
      classification,
      is_base: isBase,
      has_volume: hasVolume,
    };
  });

  const activeByMerchantFeed = new Map<string, typeof decorated>();
  for (const campaign of decorated.filter((item) => item.classification !== 'paused')) {
    const key = `${campaign.merchant_center_id || 'none'}::${campaign.feed_label || 'default'}`;
    const list = activeByMerchantFeed.get(key) || [];
    list.push(campaign);
    activeByMerchantFeed.set(key, list);
  }

  const cannibalizationRisks = Array.from(activeByMerchantFeed.entries())
    .filter(([, items]) => items.length > 1)
    .map(([key, items]) => {
      const [merchant_center_id, feed_label] = key.split('::');
      return {
        merchant_center_id: merchant_center_id === 'none' ? null : merchant_center_id,
        feed_label: feed_label === 'default' ? null : feed_label,
        campaigns: items.map((item) => ({
          id: item.id,
          name: item.name,
          status: item.status,
          bucket: item.bucket,
          cost: item.current.cost,
          roas: item.current.roas,
        })),
      };
    })
    .sort((left, right) => right.campaigns.length - left.campaigns.length);

  return {
    campaigns: decorated,
    improving: decorated
      .filter((item) => item.classification === 'improving')
      .sort((left, right) => (right.delta.conversion_value_pct || 0) - (left.delta.conversion_value_pct || 0))
      .slice(0, 5),
    worsening: decorated
      .filter((item) => item.classification === 'alert')
      .sort((left, right) => right.current.cost - left.current.cost)
      .slice(0, 5),
    cannibalizationRisks,
  };
}

async function enrichMerchantRowsWithImages(rows: any[]) {
  const imageCache = new Map<string, string | null>();
  await Promise.all(rows.map(async (row) => {
    const sku = String(row?.item_id || '').trim();
    if (!sku || imageCache.has(sku)) return;
    const product = await kv.get(`product:${sku}`).catch(() => null);
    if (!product) {
      imageCache.set(sku, null);
      return;
    }
    const media = resolveProductMedia(product, { allowLegacy: false });
    imageCache.set(sku, media.image_url || String(product?.image_url || '').trim() || null);
  }));

  return rows.map((row) => ({
    ...row,
    image_url: imageCache.get(String(row?.item_id || '').trim()) || null,
  }));
}

async function buildMerchantProductsSnapshot(range: GoogleAdsDashboardRange) {
  const config = await getGoogleAdsConfig();
  const [statusRows, performanceRows] = await Promise.all([
    googleAdsFetchShoppingProductStatuses(config),
    googleAdsFetchShoppingProductPerformance(config, range),
  ]);

  const performanceMap = new Map<string, any>();
  for (const row of performanceRows) {
    const key = `${row.merchant_center_id || 'none'}::${row.feed_label || 'default'}::${row.item_id || 'unknown'}`;
    performanceMap.set(key, row);
  }

  const merged = await enrichMerchantRowsWithImages(statusRows.map((row) => {
    const key = `${row.merchant_center_id || 'none'}::${row.feed_label || 'default'}::${row.item_id || 'unknown'}`;
    const performance = performanceMap.get(key);
    return {
      ...row,
      performance: performance?.metrics || {
        impressions: 0,
        clicks: 0,
        ctr: 0,
        cost: 0,
        conversions: 0,
        conversion_value: 0,
        roas: 0,
        cpa: null,
      },
    };
  }));

  const summary = {
    total: merged.length,
    eligible: merged.filter((row) => row.status === 'ELIGIBLE').length,
    limited: merged.filter((row) => row.status === 'ELIGIBLE_LIMITED').length,
    not_eligible: merged.filter((row) => row.status === 'NOT_ELIGIBLE').length,
    with_issues: merged.filter((row) => Array.isArray(row.issues) && row.issues.length > 0).length,
    with_impressions: merged.filter((row) => Number(row.performance?.impressions || 0) > 0).length,
    with_clicks: merged.filter((row) => Number(row.performance?.clicks || 0) > 0).length,
    with_conversions: merged.filter((row) => Number(row.performance?.conversions || 0) > 0).length,
  };

  return {
    rows: merged,
    summary,
    top_revenue: [...merged]
      .sort((left, right) => Number(right.performance?.conversion_value || 0) - Number(left.performance?.conversion_value || 0))
      .slice(0, 8),
    approved_without_impressions: merged
      .filter((row) => row.status === 'ELIGIBLE' && Number(row.performance?.impressions || 0) === 0)
      .slice(0, 12),
    click_no_conversion: merged
      .filter((row) => Number(row.performance?.clicks || 0) > 0 && Number(row.performance?.conversions || 0) === 0)
      .sort((left, right) => Number(right.performance?.clicks || 0) - Number(left.performance?.clicks || 0))
      .slice(0, 12),
    issues: merged
      .filter((row) => Array.isArray(row.issues) && row.issues.length > 0)
      .slice(0, 12),
  };
}

async function readManualWhatsappOrders() {
  const allOrders = await kv.getByPrefix('order:').catch(() => []);
  return (Array.isArray(allOrders) ? allOrders : [])
    .filter((order: any) => String(order?.order_source || '') === 'whatsapp_manual');
}

async function buildWhatsAppOfflineSummary(range: GoogleAdsDashboardRange) {
  const resolvedRange = resolveGoogleAdsDateRange(range);
  const [leads, jobs, orders] = await Promise.all([
    listWhatsAppLeads(),
    listOfflineConversionJobs(),
    readManualWhatsappOrders(),
  ]);

  const leadsInRange = leads.filter((lead) => isDateWithin(lead.clicked_at || lead.last_clicked_at, resolvedRange.current_start, resolvedRange.current_end));
  const qualified = leadsInRange.filter((lead) => ['qualified', 'high_intent', 'linked', 'won'].includes(String(lead.status || '')));
  const highIntent = leadsInRange.filter((lead) => ['high_intent', 'linked', 'won'].includes(String(lead.status || '')));
  const won = leadsInRange.filter((lead) => String(lead.status || '') === 'won');

  const ordersInRange = orders.filter((order: any) => isDateWithin(order?.paid_at || order?.createdAt || order?.created_at, resolvedRange.current_start, resolvedRange.current_end));
  const paidOrders = ordersInRange.filter((order: any) => String(order?.payment_status || '') === 'paid');
  const unlinkedOrders = ordersInRange.filter((order: any) => !order?.lead_id);

  const jobsInRange = jobs.filter((job) => isDateWithin(job.sent_at || job.updated_at || job.created_at, resolvedRange.current_start, resolvedRange.current_end));
  const sentJobs = jobsInRange.filter((job) => job.status === 'sent');
  const pendingJobs = jobsInRange.filter((job) => job.status === 'pending' || job.status === 'failed');
  const delayMinutes = sentJobs
    .map((job) => {
      const sentAt = new Date(String(job.sent_at || '')).getTime();
      const conversionTime = new Date(String(job.conversion_time || '')).getTime();
      if (!Number.isFinite(sentAt) || !Number.isFinite(conversionTime) || sentAt < conversionTime) return null;
      return (sentAt - conversionTime) / 60000;
    })
    .filter((value): value is number => value != null);

  return {
    range: resolvedRange,
    leads_generated: leadsInRange.length,
    leads_qualified: qualified.length,
    leads_high_intent: highIntent.length,
    sales_closed: paidOrders.length,
    closure_rate: leadsInRange.length > 0 ? roundNumber((won.length / leadsInRange.length) * 100, 2) : 0,
    whatsapp_orders_without_lead: unlinkedOrders.length,
    offline_pending: pendingJobs.length,
    offline_accepted: sentJobs.length,
    offline_sent_value: roundNumber(sentJobs.reduce((sum, job) => sum + Number(job.conversion_value || 0), 0), 2),
    average_send_delay_minutes: delayMinutes.length
      ? roundNumber(delayMinutes.reduce((sum, value) => sum + value, 0) / delayMinutes.length, 1)
      : 0,
    top_pending_orders: unlinkedOrders.slice(0, 8).map((order: any) => ({
      order_id: order.orderId,
      total: Number(order?.totals?.total || 0),
      paid_at: order?.paid_at || null,
      customer_name: order?.customer?.name || null,
    })),
    recent_offline_jobs: jobsInRange.slice(0, 12),
  };
}

async function buildConversionMix(range: GoogleAdsDashboardRange) {
  const resolvedRange = resolveGoogleAdsDateRange(range);
  const [events, leads, orders] = await Promise.all([
    kv.getByPrefix('event_log:').catch(() => []),
    listWhatsAppLeads(),
    readManualWhatsappOrders(),
  ]);

  const safeEvents = Array.isArray(events) ? events : [];
  const purchaseWebsite = safeEvents.filter((event: any) =>
    String(event?.event_name || '') === 'purchase_paid' &&
    isDateWithin(event?.event_time || event?._meta?.logged_at, resolvedRange.current_start, resolvedRange.current_end)
  );

  const qualifiedLeads = leads.filter((lead) =>
    isDateWithin(lead.clicked_at || lead.last_clicked_at, resolvedRange.current_start, resolvedRange.current_end) &&
    ['qualified', 'high_intent', 'linked', 'won'].includes(String(lead.status || ''))
  );

  const whatsappClosed = orders.filter((order: any) =>
    String(order?.payment_status || '') === 'paid' &&
    isDateWithin(order?.paid_at || order?.createdAt || order?.created_at, resolvedRange.current_start, resolvedRange.current_end)
  );

  return [
    {
      key: 'purchase_website',
      label: 'Purchase - Website',
      conversions: purchaseWebsite.length,
      value: roundNumber(purchaseWebsite.reduce((sum: number, event: any) => sum + parseMoneyValue(event?.resolved_value || event?.ecommerce?.value), 0), 2),
    },
    {
      key: 'whatsapp_lead',
      label: 'WhatsApp Lead - Qualified',
      conversions: qualifiedLeads.length,
      value: roundNumber(qualifiedLeads.reduce((sum, lead) => sum + Number(lead.resolved_value || lead.checkout_total || lead.cart_total || lead.product_price || 0), 0), 2),
    },
    {
      key: 'whatsapp_closed',
      label: 'Purchase - WhatsApp Closed',
      conversions: whatsappClosed.length,
      value: roundNumber(whatsappClosed.reduce((sum: number, order: any) => sum + Number(order?.totals?.total || 0), 0), 2),
    },
  ];
}

async function buildGoogleTagActivity(range: GoogleAdsDashboardRange) {
  const resolvedRange = resolveGoogleAdsDateRange(range);
  const [events, goalConfig] = await Promise.all([
    kv.getByPrefix('event_log:').catch(() => []),
    getCampaignGoalsConfig(),
  ]);

  const safeEvents = (Array.isArray(events) ? events : []).filter((event: any) =>
    ['add_to_cart', 'begin_checkout', 'purchase_paid', 'whatsapp_banner_lead'].includes(String(event?.event_name || '')) &&
    isDateWithin(event?.event_time || event?._meta?.logged_at, resolvedRange.current_start, resolvedRange.current_end),
  );

  const eventDefinitions = [
    {
      key: 'purchase_paid',
      label: 'Compra paga',
      google_event_name: 'conversion',
      goal_label: 'Purchase - Website',
      send_to: goalConfig.googleAdsTagId && goalConfig.googleAdsPurchaseLabel
        ? `${goalConfig.googleAdsTagId}/${goalConfig.googleAdsPurchaseLabel}`
        : null,
    },
    {
      key: 'whatsapp_banner_lead',
      label: 'Clique no WhatsApp',
      google_event_name: 'conversion',
      goal_label: 'WhatsApp Lead - Qualified',
      send_to: goalConfig.googleAdsTagId && goalConfig.googleAdsWhatsappLeadLabel
        ? `${goalConfig.googleAdsTagId}/${goalConfig.googleAdsWhatsappLeadLabel}`
        : null,
    },
    {
      key: 'begin_checkout',
      label: 'Início do checkout',
      google_event_name: 'begin_checkout',
      goal_label: null,
      send_to: null,
    },
    {
      key: 'add_to_cart',
      label: 'Carrinho de compra',
      google_event_name: 'add_to_cart',
      goal_label: null,
      send_to: null,
    },
  ] as const;

  const aggregateChannelCounts = new Map<string, number>();
  const aggregateCampaignCounts = new Map<string, number>();
  const aggregateSurfaceCounts = new Map<string, number>();

  const rows = eventDefinitions.map((definition) => {
    const matchingEvents = safeEvents.filter((event: any) => String(event?.event_name || '') === definition.key);
    const channelCounts = new Map<string, number>();
    const campaignCounts = new Map<string, number>();
    const surfaceCounts = new Map<string, number>();
    const sourceCounts = new Map<string, number>();
    const pageCounts = new Map<string, number>();
    const sessionIds = new Set<string>();

    for (const event of matchingEvents) {
      const attribution = event?.attribution || {};
      const channel = classifyAttributionChannel(attribution, normalizeHost(event?.referrer || attribution?.referrer));
      const campaign = normalizeTextValue(attribution?.utm_campaign);
      const surface =
        normalizeTextValue(event?.source_surface)
        || normalizeTextValue(event?.page_type)
        || normalizeTextValue(event?.page_path);
      const source =
        normalizeTextValue(attribution?.utm_source)
        || channel;
      const page = normalizeTextValue(event?.page_path || event?.page_url);
      const sessionId = normalizeTextValue(event?.session_id || attribution?.session_id);

      incrementMap(channelCounts, channel);
      incrementMap(campaignCounts, campaign || null);
      incrementMap(surfaceCounts, surface || null);
      incrementMap(sourceCounts, source || null);
      incrementMap(pageCounts, page || null);
      incrementMap(aggregateChannelCounts, channel);
      incrementMap(aggregateCampaignCounts, campaign || null);
      incrementMap(aggregateSurfaceCounts, surface || null);
      if (sessionId) sessionIds.add(sessionId);
    }

    const totalValue = roundNumber(
      matchingEvents.reduce((sum: number, event: any) => sum + parseMoneyValue(event?.resolved_value || event?.ecommerce?.value), 0),
      2,
    );

    return {
      key: definition.key,
      label: definition.label,
      google_event_name: definition.google_event_name,
      goal_label: definition.goal_label,
      send_to: definition.send_to,
      activations: matchingEvents.length,
      sessions: sessionIds.size,
      total_value: totalValue,
      last_seen_at: matchingEvents
        .map((event: any) => String(event?.event_time || event?._meta?.logged_at || ''))
        .sort((left, right) => parseTimestamp(right) - parseTimestamp(left))[0] || null,
      top_channels: toTopList(channelCounts, matchingEvents.length, 4, channelLabel),
      top_sources: toTopList(sourceCounts, matchingEvents.length, 4),
      top_campaigns: toTopList(campaignCounts, matchingEvents.length, 4),
      top_surfaces: toTopList(surfaceCounts, matchingEvents.length, 4),
      top_pages: toTopList(pageCounts, matchingEvents.length, 3),
    };
  });

  return {
    total_activations: rows.reduce((sum, row) => sum + Number(row.activations || 0), 0),
    conversion_activations: rows
      .filter((row) => row.google_event_name === 'conversion')
      .reduce((sum, row) => sum + Number(row.activations || 0), 0),
    rows,
    top_channels: toTopList(aggregateChannelCounts, safeEvents.length, 6, channelLabel),
    top_campaigns: toTopList(aggregateCampaignCounts, safeEvents.length, 6),
    top_surfaces: toTopList(aggregateSurfaceCounts, safeEvents.length, 6),
  };
}

async function getRecentEventInfo() {
  const events = await kv.getByPrefix('event_log:').catch(() => []);
  let purchaseSeenAt: string | null = null;
  let whatsappLeadSeenAt: string | null = null;

  for (const event of Array.isArray(events) ? events : []) {
    const name = String(event?.event_name || '');
    const timestamp = String(event?.event_time || event?._meta?.logged_at || '');
    if (name === 'purchase_paid') {
      if (!purchaseSeenAt || parseTimestamp(timestamp) > parseTimestamp(purchaseSeenAt)) {
        purchaseSeenAt = timestamp;
      }
    }
    if (name === 'whatsapp_banner_lead') {
      if (!whatsappLeadSeenAt || parseTimestamp(timestamp) > parseTimestamp(whatsappLeadSeenAt)) {
        whatsappLeadSeenAt = timestamp;
      }
    }
  }

  return {
    purchaseSeenAt,
    whatsappLeadSeenAt,
  };
}

function buildConversionStatus(args: {
  key: GoogleAdsConversionStatus['key'];
  label: string;
  actionId: string | null;
  apiAction?: any;
  lastSeenEventAt: string | null;
  lastError: string | null;
}): GoogleAdsConversionStatus {
  const apiAction = args.apiAction;
  return {
    key: args.key,
    label: args.label,
    action_id: args.actionId,
    exists: Boolean(apiAction?.id || args.actionId),
    active: String(apiAction?.status || '').toUpperCase() !== 'REMOVED' && Boolean(apiAction?.id || args.actionId),
    value_mode: apiAction?.valueSettings?.alwaysUseDefaultValue === true ? 'static' : 'dynamic',
    include_in_goals:
      typeof apiAction?.includeInConversionsMetric === 'boolean'
        ? apiAction.includeInConversionsMetric
        : typeof apiAction?.include_in_conversions_metric === 'boolean'
        ? apiAction.include_in_conversions_metric
        : null,
    category: apiAction?.category || null,
    last_seen_event_at: args.lastSeenEventAt,
    last_error: args.lastError,
  };
}

async function syncCampaignGoalLabels(args: {
  googleTagId?: string | null;
  purchaseLabel?: string | null;
  whatsappLeadLabel?: string | null;
  updatedBy: string;
}) {
  const current = await getCampaignGoalsConfig();
  const next = {
    ...current,
    googleAdsTagId: args.googleTagId || current.googleAdsTagId,
    googleAdsPurchaseLabel: args.purchaseLabel || current.googleAdsPurchaseLabel,
    googleAdsWhatsappLeadLabel: args.whatsappLeadLabel || current.googleAdsWhatsappLeadLabel,
  };
  return saveCampaignGoalsConfig(next, args.updatedBy);
}

async function buildHealthReport(forceRemote = false): Promise<GoogleAdsHealthReport> {
  const config = await getGoogleAdsConfig();
  const jobs = await listOfflineConversionJobs();
  const orders = await kv.getByPrefix('order:').catch(() => []);
  const queueSummary = summarizeOfflineJobs(jobs, Array.isArray(orders) ? orders : []);
  const recentEvents = await getRecentEventInfo();

  const credentialsReady = Boolean(
    config.customer_id &&
    config.developer_token &&
    (
      (config.auth_mode === 'service_account' &&
        config.service_account_client_email &&
        config.service_account_private_key) ||
      (config.auth_mode !== 'service_account' &&
        config.oauth_client_id &&
        config.oauth_client_secret &&
        config.oauth_refresh_token)
    ),
  );

  let apiError: string | null = null;
  let customerInfo: Awaited<ReturnType<typeof googleAdsGetCustomerInfo>> | null = null;
  let conversionActions: any[] = [];
  let productLinks: any[] = [];
  let productLinkInvitations: any[] = [];
  let pmaxCampaigns: any[] = [];

  if (credentialsReady) {
    try {
      customerInfo = await googleAdsGetCustomerInfo(config);
      if (forceRemote) {
        await googleAdsTestConnection(config);
      }
      conversionActions = await googleAdsFetchConversionActions(
        config,
        customerInfo?.conversion_customer_id || config.conversion_customer_id || config.customer_id,
      );
      productLinks = await googleAdsFetchProductLinks(config);
      productLinkInvitations = await googleAdsFetchProductLinkInvitations(config);
      pmaxCampaigns = await googleAdsFetchPmaxCampaigns(config);
    } catch (error: any) {
      apiError = error?.message || 'Falha ao consultar Google Ads.';
    }
  }

  const findAction = (actionId: string | null) =>
    conversionActions.find((item: any) => String(item?.id || '') === String(actionId || ''));

  const conversions: GoogleAdsConversionStatus[] = [
    buildConversionStatus({
      key: 'purchase',
      label: 'Purchase - Website',
      actionId: config.conversion_action_purchase_id,
      apiAction: findAction(config.conversion_action_purchase_id),
      lastSeenEventAt: recentEvents.purchaseSeenAt,
      lastError: apiError,
    }),
    buildConversionStatus({
      key: 'whatsapp_lead',
      label: 'WhatsApp Lead - Qualified',
      actionId: config.conversion_action_whatsapp_lead_id,
      apiAction: findAction(config.conversion_action_whatsapp_lead_id),
      lastSeenEventAt: recentEvents.whatsappLeadSeenAt,
      lastError: apiError,
    }),
    buildConversionStatus({
      key: 'whatsapp_closed',
      label: 'Purchase - WhatsApp Closed',
      actionId: config.conversion_action_whatsapp_closed_id,
      apiAction: findAction(config.conversion_action_whatsapp_closed_id),
      lastSeenEventAt: jobs.find((job) => job.sent_at)?.sent_at || null,
      lastError: apiError,
    }),
  ];

  const merchantReady = Boolean(
    config.merchant_center_id &&
    (productLinks.length > 0 || (config.merchant_link_status && config.merchant_link_status !== 'missing')),
  );
  const conversionsReady = conversions.every((conversion) => Boolean(conversion.action_id));
  const valueTrackingReady = Boolean(recentEvents.purchaseSeenAt || recentEvents.whatsappLeadSeenAt);
  const offlineQueueReady = queueSummary.failed === 0 && queueSummary.dead_letter === 0;
  const pmaxCampaignReady = Boolean(
    pmaxCampaigns.some((campaign: any) => String(campaign?.merchant_center_id || '').trim()),
  );

  const checks = [
    {
      key: 'credentials',
      label: 'Credenciais Google Ads API',
      status: credentialsReady ? (apiError ? 'warning' : 'ok') : 'blocked',
      detail: credentialsReady
        ? apiError
          ? `Credenciais presentes, mas a consulta remota falhou: ${apiError}`
          : config.auth_mode === 'service_account'
          ? 'Customer, developer token e service account configurados.'
          : 'MCC/OAuth/developer token configurados.'
        : config.auth_mode === 'service_account'
        ? 'Preencha customer_id, developer token e credenciais da service account.'
        : 'Preencha customer_id, developer token e credenciais OAuth.',
    },
    {
      key: 'conversions',
      label: 'Conversion Actions',
      status: normalizeState(conversionsReady, conversions.some((item) => Boolean(item.action_id))),
      detail: conversionsReady
        ? `As tres conversoes canonicas estao mapeadas no conversion customer ${customerInfo?.conversion_customer_id || config.conversion_customer_id || config.customer_id || 'nao resolvido'}.`
        : 'Ainda faltam IDs de conversion action para compra, lead ou fechamento via WhatsApp.',
    },
    {
      key: 'merchant',
      label: 'Merchant / PMax',
      status: normalizeState(merchantReady, Boolean(config.merchant_center_id || productLinkInvitations.length)),
      detail: merchantReady
        ? `Merchant ${config.merchant_center_id} com ${productLinks.length} link(s) ativo(s).`
        : productLinkInvitations.length
        ? `Ha ${productLinkInvitations.length} convite(s) pendente(s) para o Merchant ${config.merchant_center_id || 'nao informado'}.`
        : 'Informe merchant_center_id e confirme o link com a conta de Ads.',
    },
    {
      key: 'value_tracking',
      label: 'Tracking com valor',
      status: normalizeState(valueTrackingReady, true),
      detail: valueTrackingReady
        ? 'Eventos recentes com valor detectados para compra e/ou lead.'
        : 'Ainda nao foram vistos eventos recentes de compra ou WhatsApp com valor.',
    },
    {
      key: 'offline_queue',
      label: 'Fila offline',
      status: normalizeState(queueSummary.failed === 0 && queueSummary.dead_letter === 0, queueSummary.pending > 0),
      detail:
        queueSummary.pending > 0
          ? `${queueSummary.pending} job(s) pendente(s), ${queueSummary.failed} falho(s), ${queueSummary.sent} enviado(s).`
          : queueSummary.sent > 0
          ? `${queueSummary.sent} conversao(oes) offline ja enviada(s).`
          : 'Nenhum job offline gerado ainda.',
    },
    {
      key: 'pmax_base',
      label: 'PMax base',
      status: normalizeState(pmaxCampaignReady, Boolean(config.pmax_enabled || config.pmax_base_campaign_id)),
      detail: pmaxCampaignReady
        ? `${pmaxCampaigns.length} campanha(s) PMax detectada(s), incluindo uma retail base.`
        : 'Nenhuma campanha PMax retail encontrada ainda. Use a provisao automatica para criar a base em PAUSED.',
    },
  ];

  const state: GoogleAdsHealthState = !credentialsReady
    ? 'blocked'
    : checks.some((check) => check.status === 'error')
    ? 'error'
    : checks.some((check) => check.status === 'warning')
    ? 'warning'
    : 'ok';

  return {
    generated_at: new Date().toISOString(),
    state,
    readiness: {
      credentials: credentialsReady,
      conversions: conversionsReady,
      merchant: merchantReady,
      value_tracking: valueTrackingReady,
      offline_queue: offlineQueueReady,
      pmax_enabled: Boolean(config.pmax_enabled || pmaxCampaignReady),
    },
    checks,
    conversions,
    conversion_customer_id: customerInfo?.conversion_customer_id || config.conversion_customer_id,
    conversion_tracking_status: customerInfo?.conversion_tracking_status || config.conversion_tracking_status,
    merchant: {
      links: productLinks,
      invitations: productLinkInvitations,
    },
    pmax: {
      campaigns: pmaxCampaigns,
    },
    queue: queueSummary,
    last_successful_api_check_at: config.last_successful_api_check_at,
    merchant_link_status:
      normalizeText(productLinks.length ? 'linked' : productLinkInvitations[0]?.status || config.merchant_link_status) ||
      config.merchant_link_status,
    errors: apiError ? [apiError] : [],
  };
}

async function buildGoogleAdsDashboardData(range: GoogleAdsDashboardRange) {
  const resolvedRange = resolveGoogleAdsDateRange(range);
  const config = await getGoogleAdsConfig();
  const [health, campaignRows, merchantSnapshot, whatsappSummary, conversionMix, tagActivity] = await Promise.all([
    buildHealthReport(false),
    googleAdsFetchCampaignPerformance(config, range),
    buildMerchantProductsSnapshot(range),
    buildWhatsAppOfflineSummary(range),
    buildConversionMix(range),
    buildGoogleTagActivity(range),
  ]);

  const summarizedCampaigns = summarizeCampaignRows(campaignRows, config);
  const current = aggregateCampaignMetrics(campaignRows, 'current');
  const previous = aggregateCampaignMetrics(campaignRows, 'previous');

  const summary = {
    spend: {
      current: roundNumber(current.cost, 2),
      previous: roundNumber(previous.cost, 2),
      delta_pct: percentageDelta(current.cost, previous.cost),
    },
    conversions: {
      current: roundNumber(current.conversions, 2),
      previous: roundNumber(previous.conversions, 2),
      delta_pct: percentageDelta(current.conversions, previous.conversions),
    },
    conversion_value: {
      current: roundNumber(current.conversion_value, 2),
      previous: roundNumber(previous.conversion_value, 2),
      delta_pct: percentageDelta(current.conversion_value, previous.conversion_value),
    },
    roas: {
      current: roundNumber(current.roas, 2),
      previous: roundNumber(previous.roas, 2),
      delta_pct: percentageDelta(current.roas, previous.roas),
    },
    cpa: {
      current: current.cpa,
      previous: previous.cpa,
      delta_pct: current.cpa == null || previous.cpa == null ? null : percentageDelta(current.cpa, previous.cpa),
    },
  };

  const alerts = [
    ...health.checks
      .filter((check) => check.status === 'warning' || check.status === 'error' || check.status === 'blocked')
      .slice(0, 6)
      .map((check) => ({
        type: 'health',
        label: check.label,
        detail: check.detail,
        status: check.status,
      })),
    ...merchantSnapshot.issues.slice(0, 4).map((product) => ({
      type: 'product_issue',
      label: product.item_id || product.title || 'Produto com issue',
      detail: product.issues?.[0]?.detail || 'Produto com issue de Merchant.',
      status: 'warning',
    })),
  ];

  return {
    resolvedRange,
    config,
    health,
    campaignRows,
    summarizedCampaigns,
    merchantSnapshot,
    whatsappSummary,
    conversionMix,
    tagActivity,
    summary,
    alerts,
  };
}

function clampRecommendationPriority(value: unknown): RecommendationPriority {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'high' || normalized === 'medium' || normalized === 'low') return normalized;
  return 'medium';
}

function clampRecommendationUrgency(value: unknown): RecommendationUrgency {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'now' || normalized === 'this_week' || normalized === 'monitor') return normalized;
  return 'monitor';
}

function clampRecommendationDecision(value: unknown): CampaignDecision {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'pause' || normalized === 'reduce_budget' || normalized === 'fix_measurement' || normalized === 'keep' || normalized === 'watch') {
    return normalized;
  }
  return 'watch';
}

function clampRecommendationConfidence(value: unknown): RecommendationConfidence {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'high' || normalized === 'medium' || normalized === 'low') return normalized;
  return 'medium';
}

function normalizeStringList(value: unknown, limit = 6) {
  if (!Array.isArray(value)) return [] as string[];
  return value
    .map((item) => normalizeTextValue(item))
    .filter((item): item is string => Boolean(item))
    .slice(0, limit);
}

function buildRuleBasedGoogleAdsRecommendations(data: Awaited<ReturnType<typeof buildGoogleAdsDashboardData>>): GoogleAdsRecommendationReport {
  const activeCampaigns = (data.summarizedCampaigns?.campaigns || []).filter((campaign: any) => campaign.classification !== 'paused');
  const highSpendNoValue = activeCampaigns.filter((campaign: any) => Number(campaign.current?.cost || 0) >= 100 && Number(campaign.current?.conversion_value || 0) <= 0);
  const zeroValueConverters = activeCampaigns.filter((campaign: any) => Number(campaign.current?.conversions || 0) > 0 && Number(campaign.current?.conversion_value || 0) <= 0);
  const lowRoasCampaigns = activeCampaigns.filter((campaign: any) => Number(campaign.current?.cost || 0) >= 50 && Number(campaign.current?.roas || 0) > 0 && Number(campaign.current?.roas || 0) < 1.5);
  const missingValueTracking = !data.health.readiness?.value_tracking;
  const weakConversionValue =
    Number(data.summary?.conversions?.current || 0) >= 20 &&
    Number(data.summary?.conversion_value?.current || 0) <= Math.max(50, Number(data.summary?.spend?.current || 0) * 0.1);
  const measurementIssue = missingValueTracking || weakConversionValue || zeroValueConverters.length >= Math.max(2, Math.ceil(activeCampaigns.length / 3));
  const merchantIssue = !data.health.readiness?.merchant || Number(data.merchantSnapshot?.summary?.with_issues || 0) > 0;
  const offlineIssue = !data.health.readiness?.offline_queue || Number(data.whatsappSummary?.offline_pending || 0) > 0;

  const topPriorities: GoogleAdsPriorityRecommendation[] = [];
  if (measurementIssue) {
    topPriorities.push({
      title: 'Corrigir a mensuracao antes de confiar no ROAS',
      action: 'Deixe como metas primarias apenas purchase_paid e whatsapp_banner_lead com valor real. Microconversoes devem ir para secundarias.',
      why: `Ha ${zeroValueConverters.length} campanha(s) com conversoes sem valor e o painel soma ${roundNumber(Number(data.summary?.conversions?.current || 0), 0)} conversoes para apenas ${roundNumber(Number(data.summary?.conversion_value?.current || 0), 2)} de valor.`,
      priority: 'high',
      urgency: 'now',
      owner: 'Google Ads + tracking',
    });
  }
  if (highSpendNoValue.length) {
    topPriorities.push({
      title: 'Cortar desperdicio nas campanhas que gastam sem gerar valor',
      action: 'Reduza verba ou pause primeiro as campanhas com maior custo e valor zerado ate o tracking ficar confiavel.',
      why: `${highSpendNoValue.length} campanha(s) ja gastaram acima de R$ 100 nesta janela sem registrar valor.`,
      priority: 'high',
      urgency: 'now',
      owner: 'Midia paga',
    });
  }
  if (merchantIssue) {
    topPriorities.push({
      title: 'Limpar gargalos de Merchant antes de escalar PMax',
      action: 'Trate os produtos com issue e garanta que os itens elegiveis estejam realmente servindo impressao.',
      why: `O Merchant mostra ${Number(data.merchantSnapshot?.summary?.with_issues || 0)} item(ns) com issue e ${Number(data.merchantSnapshot?.summary?.eligible || 0)} elegiveis.`,
      priority: 'medium',
      urgency: 'this_week',
      owner: 'Merchant Center',
    });
  }
  if (offlineIssue) {
    topPriorities.push({
      title: 'Fechar o ciclo de valor do WhatsApp',
      action: 'Reprocesse a fila offline e reconcilie pedidos pagos sem job para o Google receber o valor das vendas fechadas.',
      why: `Ha ${Number(data.whatsappSummary?.offline_pending || 0)} conversao(oes) offline pendente(s).`,
      priority: 'medium',
      urgency: 'this_week',
      owner: 'Offline conversions',
    });
  }
  if (!topPriorities.length) {
    topPriorities.push({
      title: 'Manter as campanhas vencedoras sob observacao',
      action: 'Ajuste verba com calma nas campanhas que melhoram ROAS e valor, sem mexer no setup de metas.',
      why: 'A janela nao mostrou um gargalo unico dominante fora da operacao normal.',
      priority: 'medium',
      urgency: 'monitor',
      owner: 'Midia paga',
    });
  }

  const campaignActions: GoogleAdsCampaignRecommendation[] = activeCampaigns
    .slice()
    .sort((left: any, right: any) => Number(right.current?.cost || 0) - Number(left.current?.cost || 0))
    .map((campaign: any) => {
      const cost = Number(campaign.current?.cost || 0);
      const value = Number(campaign.current?.conversion_value || 0);
      const conversions = Number(campaign.current?.conversions || 0);
      const roas = Number(campaign.current?.roas || 0);
      const clicks = Number(campaign.current?.clicks || 0);
      const roasDelta = Number(campaign.delta?.roas_pct || 0);
      const costDelta = Number(campaign.delta?.cost_pct || 0);

      let recommendation: CampaignDecision = 'watch';
      let priority: RecommendationPriority = 'low';
      let confidence: RecommendationConfidence = 'medium';
      let reason = 'Sem sinal forte o suficiente para mexer agora.';

      if (clicks >= 20 && conversions <= 0) {
        recommendation = 'pause';
        priority = 'high';
        confidence = 'high';
        reason = 'A campanha ja gerou volume de clique sem converter nesta janela.';
      } else if (cost >= 100 && value <= 0) {
        recommendation = measurementIssue ? 'fix_measurement' : 'pause';
        priority = 'high';
        confidence = 'high';
        reason = measurementIssue
          ? 'Ela esta gastando sem valor medido, entao o primeiro passo e corrigir a meta/valor antes de confiar no algoritmo.'
          : 'Ela esta gastando acima do toleravel sem gerar retorno.';
      } else if (measurementIssue && conversions > 0 && value <= 0) {
        recommendation = 'fix_measurement';
        priority = 'high';
        confidence = 'high';
        reason = 'Ha conversoes, mas o valor esta zerado. O algoritmo provavelmente esta aprendendo com o sinal errado.';
      } else if (cost >= 50 && roas > 0 && roas < 0.7) {
        recommendation = 'reduce_budget';
        priority = 'high';
        confidence = 'medium';
        reason = 'O ROAS esta muito abaixo do minimo aceitavel para continuar escalando com seguranca.';
      } else if (costDelta > 0 && roasDelta < 0) {
        recommendation = 'reduce_budget';
        priority = 'medium';
        confidence = 'medium';
        reason = 'O gasto subiu enquanto o ROAS piorou frente a janela anterior.';
      } else if (campaign.classification === 'improving') {
        recommendation = 'keep';
        priority = 'medium';
        confidence = 'high';
        reason = 'A campanha melhora ROAS e valor frente a janela anterior.';
      } else if (campaign.classification === 'no_volume') {
        recommendation = 'watch';
        priority = 'low';
        confidence = 'high';
        reason = 'Ela ainda nao gerou volume suficiente para uma decisao mais forte.';
      }

      return {
        campaign_id: campaign.id || null,
        campaign_name: campaign.name || 'Campanha sem nome',
        classification: campaign.classification || null,
        recommendation,
        priority,
        confidence,
        reason,
      };
    })
    .slice(0, 12);

  const warnings = data.health.checks
    .filter((check) => check.status === 'warning' || check.status === 'error' || check.status === 'blocked')
    .slice(0, 4)
    .map((check) => `${check.label}: ${check.detail}`);

  const nextChecks = [
    'Conferir se purchase_paid e whatsapp_banner_lead sao as unicas metas primarias que entram no bidding.',
    'Validar se todas as campanhas com custo relevante estao recebendo valor real de compra ou lead.',
    'Revisar a fila de offline conversions e os pedidos pagos sem job vinculado.',
  ];

  const headline = measurementIssue
    ? 'O tracking de valor ainda esta impedindo decisoes confiaveis.'
    : highSpendNoValue.length
    ? 'Ha verba sendo desperdicada em campanhas sem retorno medido.'
    : lowRoasCampaigns.length
    ? 'O foco agora e podar as campanhas com ROAS fraco e preservar as que melhoram.'
    : 'Os dados ja permitem uma leitura mais organizada das campanhas.';

  const summary = measurementIssue
    ? 'Antes de mexer pesado em verba, corrija as metas que alimentam o algoritmo. Hoje o Google esta vendo muitas conversoes com pouco ou nenhum valor de negocio.'
    : highSpendNoValue.length
    ? 'Existem campanhas com gasto relevante e valor zerado. A leitura mais segura e conter desperdicio enquanto a mensuracao e auditada.'
    : 'Nao aparece um colapso unico no painel. A melhor leitura e manter o que melhora e reduzir o que perde eficiencia.';

  const rootCause = measurementIssue
    ? 'A conta esta otimizando em cima de sinais fracos ou sem valor, o que distorce ROAS, CPA e a priorizacao automatica do Google.'
    : highSpendNoValue.length
    ? 'Parte da verba esta concentrada em campanhas que nao devolveram valor mensurado nesta janela.'
    : 'O principal desafio agora e disciplina operacional, nao um erro estrutural unico.';

  return {
    generated_at: new Date().toISOString(),
    range: data.resolvedRange,
    source: 'rules',
    model: null,
    headline,
    summary,
    root_cause: rootCause,
    confidence: measurementIssue ? 'high' : highSpendNoValue.length ? 'medium' : 'medium',
    top_priorities: topPriorities.slice(0, 4),
    campaign_actions: campaignActions,
    next_checks: nextChecks,
    warnings,
    cache: {
      hit: false,
      age_minutes: null,
    },
  };
}

function normalizeOpenAIRecommendationReport(
  raw: any,
  fallback: GoogleAdsRecommendationReport,
): GoogleAdsRecommendationReport {
  const priorities = Array.isArray(raw?.top_priorities)
    ? raw.top_priorities
        .map((item: any) => ({
          title: normalizeTextValue(item?.title) || null,
          action: normalizeTextValue(item?.action) || null,
          why: normalizeTextValue(item?.why) || null,
          priority: clampRecommendationPriority(item?.priority),
          urgency: clampRecommendationUrgency(item?.urgency),
          owner: normalizeTextValue(item?.owner) || 'Midia paga',
        }))
        .filter((item: any) => item.title && item.action && item.why)
        .slice(0, 4)
    : [];

  const campaignActions = Array.isArray(raw?.campaign_actions)
    ? raw.campaign_actions
        .map((item: any) => ({
          campaign_id: normalizeTextValue(item?.campaign_id),
          campaign_name: normalizeTextValue(item?.campaign_name) || 'Campanha sem nome',
          classification: normalizeTextValue(item?.classification),
          recommendation: clampRecommendationDecision(item?.recommendation),
          priority: clampRecommendationPriority(item?.priority),
          confidence: clampRecommendationConfidence(item?.confidence),
          reason: normalizeTextValue(item?.reason) || 'Sem justificativa adicional.',
        }))
        .slice(0, 12)
    : [];

  return {
    ...fallback,
    source: 'openai',
    model: 'gpt-4o-mini',
    headline: normalizeTextValue(raw?.headline) || fallback.headline,
    summary: normalizeTextValue(raw?.summary) || fallback.summary,
    root_cause: normalizeTextValue(raw?.root_cause) || fallback.root_cause,
    confidence: clampRecommendationConfidence(raw?.confidence || fallback.confidence),
    top_priorities: priorities.length ? priorities : fallback.top_priorities,
    campaign_actions: campaignActions.length ? campaignActions : fallback.campaign_actions,
    next_checks: normalizeStringList(raw?.next_checks, 6).length ? normalizeStringList(raw?.next_checks, 6) : fallback.next_checks,
    warnings: [
      ...fallback.warnings,
      ...normalizeStringList(raw?.warnings, 6),
    ].slice(0, 8),
    cache: {
      hit: false,
      age_minutes: null,
    },
  };
}

async function generateGoogleAdsRecommendations(range: GoogleAdsDashboardRange, force = false): Promise<GoogleAdsRecommendationReport> {
  const cacheKey = `${GOOGLE_ADS_AI_CACHE_PREFIX}${range}`;
  if (!force) {
    const cached = await kv.get(cacheKey).catch(() => null);
    const generatedAt = parseTimestamp(cached?.generated_at);
    if (cached && generatedAt && (Date.now() - generatedAt) < GOOGLE_ADS_AI_CACHE_TTL_MS) {
      return {
        ...(cached as GoogleAdsRecommendationReport),
        cache: {
          hit: true,
          age_minutes: roundNumber((Date.now() - generatedAt) / 60000, 1),
        },
      };
    }
  }

  const dashboardData = await buildGoogleAdsDashboardData(range);
  const fallback = buildRuleBasedGoogleAdsRecommendations(dashboardData);

  if (!OPENAI_API_KEY) {
    const report = {
      ...fallback,
      warnings: [...fallback.warnings, 'OpenAI nao configurada no backend. Exibindo leitura por regras.'].slice(0, 8),
    };
    await kv.set(cacheKey, report);
    return report;
  }

  const aiInput = {
    range: dashboardData.resolvedRange,
    health: {
      state: dashboardData.health.state,
      readiness: dashboardData.health.readiness,
      checks: dashboardData.health.checks
        .filter((check) => check.status !== 'ok')
        .map((check) => ({
          label: check.label,
          status: check.status,
          detail: check.detail,
        })),
    },
    summary: dashboardData.summary,
    merchant_overview: dashboardData.merchantSnapshot.summary,
    whatsapp_overview: {
      leads_generated: dashboardData.whatsappSummary.leads_generated,
      leads_qualified: dashboardData.whatsappSummary.leads_qualified,
      sales_closed: dashboardData.whatsappSummary.sales_closed,
      offline_pending: dashboardData.whatsappSummary.offline_pending,
      offline_sent_value: dashboardData.whatsappSummary.offline_sent_value,
    },
    conversion_mix: dashboardData.conversionMix,
    campaigns: (dashboardData.summarizedCampaigns.campaigns || []).map((campaign: any) => ({
      id: campaign.id,
      name: campaign.name,
      classification: campaign.classification,
      bucket: campaign.bucket,
      channel: campaign.advertising_channel_type,
      bidding_strategy_type: campaign.bidding_strategy_type,
      merchant_center_id: campaign.merchant_center_id,
      feed_label: campaign.feed_label,
      current: {
        impressions: roundNumber(Number(campaign.current?.impressions || 0), 0),
        clicks: roundNumber(Number(campaign.current?.clicks || 0), 0),
        cost: roundNumber(Number(campaign.current?.cost || 0), 2),
        conversions: roundNumber(Number(campaign.current?.conversions || 0), 2),
        conversion_value: roundNumber(Number(campaign.current?.conversion_value || 0), 2),
        roas: roundNumber(Number(campaign.current?.roas || 0), 2),
        cpa: campaign.current?.cpa == null ? null : roundNumber(Number(campaign.current.cpa || 0), 2),
      },
      delta: {
        cost_pct: campaign.delta?.cost_pct,
        conversions_pct: campaign.delta?.conversions_pct,
        conversion_value_pct: campaign.delta?.conversion_value_pct,
        roas_pct: campaign.delta?.roas_pct,
        cpa_pct: campaign.delta?.cpa_pct,
      },
    })),
    draft: {
      headline: fallback.headline,
      summary: fallback.summary,
      root_cause: fallback.root_cause,
      top_priorities: fallback.top_priorities,
      campaign_actions: fallback.campaign_actions,
      next_checks: fallback.next_checks,
    },
  };

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        response_format: { type: 'json_object' },
        temperature: 0.2,
        max_tokens: 1600,
        messages: [
          {
            role: 'system',
            content:
              'Voce e um estrategista senior de performance marketing para ecommerce no Brasil. ' +
              'Use apenas os dados fornecidos. Se a mensuracao ou o valor estiverem fracos, priorize corrigir tracking e metas antes de recomendar escala de verba. ' +
              'Responda APENAS com JSON valido neste formato: ' +
              '{"headline":"","summary":"","root_cause":"","confidence":"high|medium|low","top_priorities":[{"title":"","action":"","why":"","priority":"high|medium|low","urgency":"now|this_week|monitor","owner":""}],"campaign_actions":[{"campaign_id":"","campaign_name":"","classification":"","recommendation":"pause|reduce_budget|fix_measurement|keep|watch","priority":"high|medium|low","confidence":"high|medium|low","reason":""}],"next_checks":[""],"warnings":[""]}. ' +
              'Se o dado nao sustentar uma acao forte, use watch ou keep. Nao invente numeros nem campanhas.',
          },
          {
            role: 'user',
            content: JSON.stringify(aiInput),
          },
        ],
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      const report = {
        ...fallback,
        warnings: [...fallback.warnings, `OpenAI HTTP ${response.status}. Exibindo leitura por regras.`].slice(0, 8),
      };
      console.error(`[google-ads] OpenAI HTTP ${response.status}: ${errorText.slice(0, 300)}`);
      await kv.set(cacheKey, report);
      return report;
    }

    const payload = await response.json().catch(() => null);
    const raw = String(payload?.choices?.[0]?.message?.content || '').trim();
    const parsed = JSON.parse(raw);
    const report = normalizeOpenAIRecommendationReport(parsed, fallback);
    await kv.set(cacheKey, report);
    return report;
  } catch (error: any) {
    const report = {
      ...fallback,
      warnings: [...fallback.warnings, error?.message || 'Falha ao consultar OpenAI. Exibindo leitura por regras.'].slice(0, 8),
    };
    console.error('[google-ads] recommendation fallback:', error?.message || error);
    await kv.set(cacheKey, report);
    return report;
  }
}

async function updateJobStatus(job: OfflineConversionJob, partial: Partial<OfflineConversionJob>) {
  const next: OfflineConversionJob = {
    ...job,
    ...partial,
    updated_at: new Date().toISOString(),
  };
  await kv.set(`offline_conversion_job:${job.job_id}`, next);
  return next;
}

googleAdsAdmin.get('/config', async (c) => {
  const config = await getGoogleAdsConfig();
  return c.json({
    config,
    redacted: redactGoogleAdsConfig(config),
  });
});

googleAdsAdmin.put('/config', async (c) => {
  try {
    const body = await c.req.json();
    const updatedBy = String(c.req.header('X-Admin-Token') || 'admin').slice(0, 24);
    const config = await saveGoogleAdsConfig(body || {}, updatedBy);
    return c.json({
      config,
      redacted: redactGoogleAdsConfig(config),
    });
  } catch (error: any) {
    return c.json({ error: error?.message || 'Falha ao salvar configuracao Google Ads.' }, 500);
  }
});

googleAdsAdmin.get('/health', async (c) => {
  const force = c.req.query('force') === '1';
  const report = await buildHealthReport(force);
  return c.json(report);
});

googleAdsAdmin.get('/dashboard', async (c) => {
  try {
    const range = parseRangeParam(c.req.query('range'));
    const dashboard = await buildGoogleAdsDashboardData(range);

    return c.json({
      range: dashboard.resolvedRange,
      summary: dashboard.summary,
      conversion_mix: dashboard.conversionMix,
      tag_activity: dashboard.tagActivity,
      executive: {
        improving_campaigns: dashboard.summarizedCampaigns.improving.map((campaign) => ({
          id: campaign.id,
          name: campaign.name,
          roas: campaign.current.roas,
          roas_delta_pct: campaign.delta.roas_pct,
          value_delta_pct: campaign.delta.conversion_value_pct,
        })),
        worsening_campaigns: dashboard.summarizedCampaigns.worsening.map((campaign) => ({
          id: campaign.id,
          name: campaign.name,
          roas: campaign.current.roas,
          roas_delta_pct: campaign.delta.roas_pct,
          spend: campaign.current.cost,
        })),
        product_issues: dashboard.merchantSnapshot.summary.with_issues,
        alerts: dashboard.alerts,
      },
      merchant_overview: dashboard.merchantSnapshot.summary,
      whatsapp_overview: dashboard.whatsappSummary,
      health: {
        state: dashboard.health.state,
        readiness: dashboard.health.readiness,
        checks: dashboard.health.checks,
      },
    });
  } catch (error: any) {
    return c.json({ error: error?.message || 'Falha ao montar dashboard estratégico.' }, 500);
  }
});

googleAdsAdmin.get('/recommendations', async (c) => {
  try {
    const range = parseRangeParam(c.req.query('range'));
    const force = c.req.query('force') === '1';
    const report = await generateGoogleAdsRecommendations(range, force);
    return c.json(report);
  } catch (error: any) {
    return c.json({ error: error?.message || 'Falha ao gerar recomendacoes do Google Ads.' }, 500);
  }
});

googleAdsAdmin.get('/campaigns', async (c) => {
  try {
    const range = parseRangeParam(c.req.query('range'));
    const resolvedRange = resolveGoogleAdsDateRange(range);
    const config = await getGoogleAdsConfig();
    const campaigns = await googleAdsFetchCampaignPerformance(config, range);
    const summarized = summarizeCampaignRows(campaigns, config);

    return c.json({
      range: resolvedRange,
      groups: {
        pmax_base: summarized.campaigns.filter((campaign) => campaign.bucket === 'pmax_base'),
        pmax_legacy: summarized.campaigns.filter((campaign) => campaign.bucket === 'pmax_legacy'),
        other: summarized.campaigns.filter((campaign) => campaign.bucket === 'other'),
      },
      improving: summarized.improving,
      worsening: summarized.worsening,
      cannibalization_risks: summarized.cannibalizationRisks,
      campaigns: summarized.campaigns,
    });
  } catch (error: any) {
    return c.json({ error: error?.message || 'Falha ao carregar campanhas do Google Ads.' }, 500);
  }
});

googleAdsAdmin.get('/merchant-products', async (c) => {
  try {
    const range = parseRangeParam(c.req.query('range'));
    const status = String(c.req.query('status') || '').trim().toLowerCase();
    const search = String(c.req.query('search') || '').trim().toLowerCase();
    const snapshot = await buildMerchantProductsSnapshot(range);

    let rows = snapshot.rows;
    if (status === 'eligible') {
      rows = rows.filter((row) => row.status === 'ELIGIBLE');
    } else if (status === 'limited') {
      rows = rows.filter((row) => row.status === 'ELIGIBLE_LIMITED');
    } else if (status === 'not_eligible') {
      rows = rows.filter((row) => row.status === 'NOT_ELIGIBLE');
    } else if (status === 'serving') {
      rows = rows.filter((row) => Number(row.performance?.impressions || 0) > 0);
    }

    if (search) {
      rows = rows.filter((row) =>
        [
          row.item_id,
          row.title,
          row.feed_label,
          row.status,
          row.brand,
        ]
          .map((value) => String(value || '').toLowerCase())
          .some((value) => value.includes(search))
      );
    }

    return c.json({
      range: resolveGoogleAdsDateRange(range),
      summary: snapshot.summary,
      filtered_count: rows.length,
      top_revenue: snapshot.top_revenue,
      approved_without_impressions: snapshot.approved_without_impressions,
      click_no_conversion: snapshot.click_no_conversion,
      issues: snapshot.issues,
      rows: rows.slice(0, 250),
    });
  } catch (error: any) {
    return c.json({ error: error?.message || 'Falha ao carregar produtos do Merchant.' }, 500);
  }
});

googleAdsAdmin.get('/whatsapp-offline-summary', async (c) => {
  try {
    const range = parseRangeParam(c.req.query('range'));
    const summary = await buildWhatsAppOfflineSummary(range);
    return c.json(summary);
  } catch (error: any) {
    return c.json({ error: error?.message || 'Falha ao carregar resumo de WhatsApp e offline.' }, 500);
  }
});

googleAdsAdmin.post('/test-connection', async (c) => {
  try {
    const config = await getGoogleAdsConfig();
    const result = await googleAdsTestConnection(config);
    const saved = await saveGoogleAdsConfig(
      {
        ...config,
        conversion_customer_id: result.conversion_customer_id,
        conversion_tracking_status: result.conversion_tracking_status,
        last_successful_api_check_at: result.ok ? new Date().toISOString() : config.last_successful_api_check_at,
      },
      String(c.req.header('X-Admin-Token') || 'admin').slice(0, 24),
    );
    return c.json({
      ok: result.ok,
      customer: result.customer,
      conversion_customer_id: result.conversion_customer_id,
      conversion_tracking_status: result.conversion_tracking_status,
      checked_at: saved.last_successful_api_check_at,
    });
  } catch (error: any) {
    return c.json({ ok: false, error: error?.message || 'Falha na conexao com Google Ads.' }, 500);
  }
});

googleAdsAdmin.post('/sync-conversions', async (c) => {
  try {
    const report = await buildHealthReport(true);
    return c.json({
      ok: report.errors.length === 0,
      conversions: report.conversions,
      state: report.state,
      errors: report.errors,
      generated_at: report.generated_at,
    });
  } catch (error: any) {
    return c.json({ ok: false, error: error?.message || 'Falha ao sincronizar conversoes.' }, 500);
  }
});

googleAdsAdmin.post('/ensure-conversions', async (c) => {
  try {
    const updatedBy = String(c.req.header('X-Admin-Token') || 'admin').slice(0, 24);
    const config = await getGoogleAdsConfig();
    const result = await googleAdsEnsureConversionActions(config);
    const savedConfig = await saveGoogleAdsConfig(
      {
        ...config,
        ...result.configPatch,
      },
      updatedBy,
    );

    await syncCampaignGoalLabels({
      googleTagId: result.google_tag_id,
      purchaseLabel: result.purchase_label,
      whatsappLeadLabel: result.whatsapp_lead_label,
      updatedBy,
    });

    return c.json({
      ok: true,
      created: result.created,
      conversion_customer_id: result.effective_conversion_customer_id,
      conversion_tracking_status: result.conversion_tracking_status,
      actions: result.actions,
      config: savedConfig,
      labels: {
        google_tag_id: result.google_tag_id,
        purchase_label: result.purchase_label,
        whatsapp_lead_label: result.whatsapp_lead_label,
      },
    });
  } catch (error: any) {
    return c.json({ ok: false, error: error?.message || 'Falha ao garantir conversion actions.' }, 500);
  }
});

googleAdsAdmin.post('/ensure-merchant-link', async (c) => {
  try {
    const updatedBy = String(c.req.header('X-Admin-Token') || 'admin').slice(0, 24);
    const config = await getGoogleAdsConfig();
    const result = await googleAdsEnsureMerchantLink(config);
    const savedConfig = await saveGoogleAdsConfig(
      {
        ...config,
        ...result.configPatch,
      },
      updatedBy,
    );

    return c.json({
      ok: true,
      status: result.status,
      actions: result.actions,
      links: result.links,
      invitations: result.invitations,
      config: savedConfig,
    });
  } catch (error: any) {
    return c.json({ ok: false, error: error?.message || 'Falha ao garantir o link com Merchant.' }, 500);
  }
});

googleAdsAdmin.post('/provision-pmax', async (c) => {
  try {
    const updatedBy = String(c.req.header('X-Admin-Token') || 'admin').slice(0, 24);
    const body = await c.req.json().catch(() => ({}));
    const config = await getGoogleAdsConfig();
    const result = await googleAdsProvisionBasePmaxCampaign(config, {
      campaign_name: normalizeText(body?.campaign_name) || undefined,
      feed_label: normalizeText(body?.feed_label),
      daily_budget_brl: body?.daily_budget_brl == null ? undefined : Number(body.daily_budget_brl),
      target_roas: body?.target_roas == null ? undefined : Number(body.target_roas),
      website_url: normalizeText(body?.website_url),
    });
    const savedConfig = await saveGoogleAdsConfig(
      {
        ...config,
        ...result.configPatch,
      },
      updatedBy,
    );

    return c.json({
      ok: true,
      created: result.created,
      campaign: result.campaign,
      asset_group_id: result.asset_group_id,
      budget_resource_name: result.budget_resource_name,
      listing_group_resource_name: result.listing_group_resource_name,
      config: savedConfig,
    });
  } catch (error: any) {
    return c.json({ ok: false, error: error?.message || 'Falha ao provisionar a PMax base.' }, 500);
  }
});

googleAdsAdmin.post('/provision-base', async (c) => {
  try {
    const updatedBy = String(c.req.header('X-Admin-Token') || 'admin').slice(0, 24);
    const body = await c.req.json().catch(() => ({}));
    let config = await getGoogleAdsConfig();

    const conversions = await googleAdsEnsureConversionActions(config);
    config = await saveGoogleAdsConfig(
      {
        ...config,
        ...conversions.configPatch,
      },
      updatedBy,
    );

    await syncCampaignGoalLabels({
      googleTagId: conversions.google_tag_id,
      purchaseLabel: conversions.purchase_label,
      whatsappLeadLabel: conversions.whatsapp_lead_label,
      updatedBy,
    });

    const merchant = await googleAdsEnsureMerchantLink(config);
    config = await saveGoogleAdsConfig(
      {
        ...config,
        ...merchant.configPatch,
      },
      updatedBy,
    );

    const pmax = await googleAdsProvisionBasePmaxCampaign(config, {
      campaign_name: normalizeText(body?.campaign_name) || undefined,
      feed_label: normalizeText(body?.feed_label),
      daily_budget_brl: body?.daily_budget_brl == null ? undefined : Number(body.daily_budget_brl),
      target_roas: body?.target_roas == null ? undefined : Number(body.target_roas),
      website_url: normalizeText(body?.website_url),
    });
    config = await saveGoogleAdsConfig(
      {
        ...config,
        ...pmax.configPatch,
      },
      updatedBy,
    );

    return c.json({
      ok: true,
      config,
      conversions,
      merchant,
      pmax,
    });
  } catch (error: any) {
    return c.json({ ok: false, error: error?.message || 'Falha ao automatizar o setup base.' }, 500);
  }
});

googleAdsAdmin.get('/offline-queue', async (c) => {
  const jobs = await listOfflineConversionJobs();
  const orders = await kv.getByPrefix('order:').catch(() => []);
  return c.json({
    jobs,
    summary: summarizeOfflineJobs(jobs, Array.isArray(orders) ? orders : []),
  });
});

googleAdsAdmin.post('/offline-queue/reprocess', async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const jobIds = Array.isArray(body?.job_ids)
      ? body.job_ids.map((item: unknown) => String(item || '').trim()).filter(Boolean)
      : null;
    const limit = Math.max(1, Math.min(25, Number(body?.limit || 10)));

    const config = await getGoogleAdsConfig();
    const jobs = (await listOfflineConversionJobs())
      .filter((job) => job.status === 'pending' || job.status === 'failed')
      .filter((job) => (jobIds ? jobIds.includes(job.job_id) : true))
      .slice(0, limit);

    const processed: any[] = [];
    for (const job of jobs) {
      try {
        await googleAdsUploadClickConversion(config, job);
        const updated = await updateJobStatus(job, {
          status: 'sent',
          attempts: Number(job.attempts || 0) + 1,
          sent_at: new Date().toISOString(),
          last_error: null,
        });
        processed.push({ job_id: job.job_id, status: updated.status });
      } catch (error: any) {
        const attempts = Number(job.attempts || 0) + 1;
        const nextStatus: OfflineConversionJob['status'] = attempts >= 5 ? 'dead_letter' : 'failed';
        const updated = await updateJobStatus(job, {
          status: nextStatus,
          attempts,
          last_error: error?.message || 'Falha ao enviar conversao offline.',
        });
        processed.push({
          job_id: job.job_id,
          status: updated.status,
          error: updated.last_error,
        });
      }
    }

    return c.json({
      ok: true,
      processed,
      summary: summarizeOfflineJobs(await listOfflineConversionJobs()),
    });
  } catch (error: any) {
    return c.json({ ok: false, error: error?.message || 'Falha ao reprocessar fila offline.' }, 500);
  }
});

googleAdsAdmin.post('/reconcile', async (c) => {
  try {
    const jobs = await listOfflineConversionJobs();
    const orders = await kv.getByPrefix('order:').catch(() => []);
    const whatsappOrders = (Array.isArray(orders) ? orders : [])
      .filter((order: any) => String(order?.order_source || '') === 'whatsapp_manual');

    const paidWithoutJob = whatsappOrders
      .filter((order: any) => String(order?.payment_status || '') === 'paid')
      .filter((order: any) => !jobs.some((job) => job.order_id === order.orderId))
      .map((order: any) => ({
        order_id: order.orderId,
        lead_id: order.lead_id || null,
        has_click_id: Boolean(
          order?.attribution_snapshot?.gclid ||
          order?.attribution_snapshot?.gbraid ||
          order?.attribution_snapshot?.wbraid,
        ),
      }));

    const sentWithoutOrder = jobs
      .filter((job) => job.status === 'sent')
      .filter((job) => !whatsappOrders.some((order: any) => order.orderId === job.order_id))
      .map((job) => ({
        job_id: job.job_id,
        order_id: job.order_id,
        lead_id: job.lead_id,
      }));

    const recurringFailures = jobs
      .filter((job) => job.status === 'failed' || job.status === 'dead_letter')
      .map((job) => ({
        job_id: job.job_id,
        order_id: job.order_id,
        attempts: job.attempts,
        last_error: job.last_error,
      }));

    return c.json({
      generated_at: new Date().toISOString(),
      paid_without_job: paidWithoutJob,
      sent_without_order: sentWithoutOrder,
      recurring_failures: recurringFailures,
    });
  } catch (error: any) {
    return c.json({ error: error?.message || 'Falha ao reconciliar Google Ads.' }, 500);
  }
});
