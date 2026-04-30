import { type GoogleAdsConfig, type OfflineConversionJob } from './performance-marketing.tsx';

const GOOGLE_ADS_API_VERSION = String(Deno.env.get('GOOGLE_ADS_API_VERSION') || 'v22').trim();
const GOOGLE_ADS_OAUTH_SCOPE = 'https://www.googleapis.com/auth/adwords';

type GoogleAdsConversionKey = 'purchase' | 'whatsapp_lead' | 'whatsapp_closed';

interface ConversionActionBlueprint {
  key: GoogleAdsConversionKey;
  configKey:
    | 'conversion_action_purchase_id'
    | 'conversion_action_whatsapp_lead_id'
    | 'conversion_action_whatsapp_closed_id';
  name: string;
  type: 'WEBPAGE' | 'UPLOAD_CLICKS';
  category: string;
  includeInConversionsMetric: boolean;
  defaultValue: number;
  clickThroughLookbackWindowDays: number;
  viewThroughLookbackWindowDays: number;
}

interface GoogleAdsApiResultRow {
  [key: string]: any;
}

export interface GoogleAdsConnectionInfo {
  ok: boolean;
  customer: {
    id: string | null;
    descriptive_name: string | null;
    currency_code: string | null;
  } | null;
  conversion_customer_id: string | null;
  conversion_tracking_status: string | null;
}

export interface GoogleAdsProductLinkSummary {
  product_link_id: string | null;
  type: string | null;
  status: string | null;
  merchant_center_id: string | null;
  resource_name: string | null;
}

export interface GoogleAdsProductLinkInvitationSummary {
  resource_name: string | null;
  status: string | null;
  type: string | null;
  merchant_center_id: string | null;
}

export interface GoogleAdsPmaxCampaignSummary {
  id: string | null;
  name: string | null;
  status: string | null;
  primary_status: string | null;
  merchant_center_id: string | null;
  feed_label: string | null;
  bidding_strategy_type: string | null;
  resource_name: string | null;
}

export type GoogleAdsDashboardRange = 'month' | '7d' | '30d' | '90d';

export interface GoogleAdsResolvedDateRange {
  key: GoogleAdsDashboardRange;
  label: string;
  days: number;
  current_start: string;
  current_end: string;
  previous_start: string;
  previous_end: string;
}

export interface GoogleAdsMetricSnapshot {
  impressions: number;
  clicks: number;
  ctr: number;
  cost: number;
  conversions: number;
  conversion_value: number;
  roas: number;
  cpa: number | null;
}

export interface GoogleAdsMetricDelta {
  impressions_pct: number | null;
  clicks_pct: number | null;
  ctr_pct: number | null;
  cost_pct: number | null;
  conversions_pct: number | null;
  conversion_value_pct: number | null;
  roas_pct: number | null;
  cpa_pct: number | null;
}

export interface GoogleAdsCampaignPerformance {
  id: string | null;
  name: string | null;
  status: string | null;
  primary_status: string | null;
  advertising_channel_type: string | null;
  bidding_strategy_type: string | null;
  merchant_center_id: string | null;
  feed_label: string | null;
  current: GoogleAdsMetricSnapshot;
  previous: GoogleAdsMetricSnapshot;
  delta: GoogleAdsMetricDelta;
}

export interface GoogleAdsMerchantProductIssue {
  code: string | null;
  severity: string | null;
  detail: string | null;
  documentation: string | null;
}

export interface GoogleAdsMerchantProductStatusRow {
  resource_name: string | null;
  merchant_center_id: string | null;
  feed_label: string | null;
  item_id: string | null;
  title: string | null;
  brand: string | null;
  channel: string | null;
  language_code: string | null;
  currency_code: string | null;
  price: number | null;
  availability: string | null;
  status: string | null;
  issues: GoogleAdsMerchantProductIssue[];
}

export interface GoogleAdsMerchantProductPerformanceRow {
  merchant_center_id: string | null;
  feed_label: string | null;
  item_id: string | null;
  title: string | null;
  metrics: GoogleAdsMetricSnapshot;
}

export interface GoogleAdsEnsureConversionsResult {
  actions: any[];
  created: Array<{ key: GoogleAdsConversionKey; id: string | null; name: string }>;
  effective_conversion_customer_id: string;
  conversion_tracking_status: string | null;
  google_tag_id: string | null;
  purchase_label: string | null;
  whatsapp_lead_label: string | null;
  configPatch: Partial<GoogleAdsConfig>;
}

export interface GoogleAdsEnsureMerchantLinkResult {
  status: string;
  links: GoogleAdsProductLinkSummary[];
  invitations: GoogleAdsProductLinkInvitationSummary[];
  actions: string[];
  configPatch: Partial<GoogleAdsConfig>;
}

export interface GoogleAdsProvisionPmaxResult {
  created: boolean;
  campaign: GoogleAdsPmaxCampaignSummary | null;
  asset_group_id: string | null;
  budget_resource_name: string | null;
  listing_group_resource_name: string | null;
  configPatch: Partial<GoogleAdsConfig>;
}

const CONVERSION_ACTION_BLUEPRINTS: ConversionActionBlueprint[] = [
  {
    key: 'purchase',
    configKey: 'conversion_action_purchase_id',
    name: 'Purchase - Website',
    type: 'WEBPAGE',
    category: 'PURCHASE',
    includeInConversionsMetric: true,
    defaultValue: 0,
    clickThroughLookbackWindowDays: 30,
    viewThroughLookbackWindowDays: 15,
  },
  {
    key: 'whatsapp_lead',
    configKey: 'conversion_action_whatsapp_lead_id',
    name: 'WhatsApp Lead - Qualified',
    type: 'WEBPAGE',
    category: 'CONTACT',
    includeInConversionsMetric: false,
    defaultValue: 0,
    clickThroughLookbackWindowDays: 30,
    viewThroughLookbackWindowDays: 7,
  },
  {
    key: 'whatsapp_closed',
    configKey: 'conversion_action_whatsapp_closed_id',
    name: 'Purchase - WhatsApp Closed',
    type: 'UPLOAD_CLICKS',
    category: 'PURCHASE',
    includeInConversionsMetric: true,
    defaultValue: 0,
    clickThroughLookbackWindowDays: 90,
    viewThroughLookbackWindowDays: 1,
  },
];

function assertConfigured(config: GoogleAdsConfig) {
  if (!config.customer_id) throw new Error('Google Ads customer_id nao configurado.');
  if (!config.developer_token) throw new Error('Google Ads developer_token nao configurado.');
  if (config.auth_mode === 'service_account') {
    if (!config.service_account_client_email) throw new Error('Google Ads service_account_client_email nao configurado.');
    if (!config.service_account_private_key) throw new Error('Google Ads service_account_private_key nao configurado.');
    if (!config.service_account_token_uri) throw new Error('Google Ads service_account_token_uri nao configurado.');
    return;
  }
  if (!config.oauth_client_id) throw new Error('Google Ads oauth_client_id nao configurado.');
  if (!config.oauth_client_secret) throw new Error('Google Ads oauth_client_secret nao configurado.');
  if (!config.oauth_refresh_token) throw new Error('Google Ads oauth_refresh_token nao configurado.');
}

function sanitizeCustomerId(value: unknown): string | null {
  const normalized = String(value || '').replace(/\D/g, '').trim();
  return normalized || null;
}

function buildHeaders(config: GoogleAdsConfig, accessToken: string) {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    'developer-token': String(config.developer_token || ''),
    'Content-Type': 'application/json',
  };

  const loginCustomerId = sanitizeCustomerId(config.manager_customer_id);
  if (loginCustomerId) {
    headers['login-customer-id'] = loginCustomerId;
  }

  return headers;
}

function extractIdFromResourceName(value: unknown): string | null {
  const normalized = String(value || '').trim();
  if (!normalized) return null;
  const match = normalized.match(/\/(-?\d+)$/);
  return match?.[1] || sanitizeCustomerId(normalized);
}

function roundNumber(value: number, digits = 2) {
  if (!Number.isFinite(value)) return 0;
  return Number(value.toFixed(digits));
}

function microsToCurrency(value: unknown) {
  const parsed = Number(value || 0);
  if (!Number.isFinite(parsed)) return 0;
  return roundNumber(parsed / 1_000_000, 2);
}

function toMetricNumber(value: unknown) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
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

function deriveMetricSnapshot(input: {
  impressions?: unknown;
  clicks?: unknown;
  ctr?: unknown;
  cost_micros?: unknown;
  conversions?: unknown;
  conversions_value?: unknown;
}): GoogleAdsMetricSnapshot {
  const impressions = toMetricNumber(input.impressions);
  const clicks = toMetricNumber(input.clicks);
  const cost = microsToCurrency(input.cost_micros);
  const conversions = toMetricNumber(input.conversions);
  const conversionValue = roundNumber(toMetricNumber(input.conversions_value), 2);
  const ctr = input.ctr == null || input.ctr === ''
    ? impressions > 0
      ? roundNumber((clicks / impressions) * 100, 2)
      : 0
    : roundNumber(toMetricNumber(input.ctr), 2);

  return {
    impressions,
    clicks,
    ctr,
    cost,
    conversions,
    conversion_value: conversionValue,
    roas: cost > 0 ? roundNumber(conversionValue / cost, 2) : 0,
    cpa: conversions > 0 ? roundNumber(cost / conversions, 2) : null,
  };
}

function buildMetricDelta(current: GoogleAdsMetricSnapshot, previous: GoogleAdsMetricSnapshot): GoogleAdsMetricDelta {
  return {
    impressions_pct: percentageDelta(current.impressions, previous.impressions),
    clicks_pct: percentageDelta(current.clicks, previous.clicks),
    ctr_pct: percentageDelta(current.ctr, previous.ctr),
    cost_pct: percentageDelta(current.cost, previous.cost),
    conversions_pct: percentageDelta(current.conversions, previous.conversions),
    conversion_value_pct: percentageDelta(current.conversion_value, previous.conversion_value),
    roas_pct: percentageDelta(current.roas, previous.roas),
    cpa_pct: current.cpa == null || previous.cpa == null ? null : percentageDelta(current.cpa, previous.cpa),
  };
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function formatDateInTimeZone(date: Date, timeZone = 'America/Sao_Paulo') {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(date);
}

export function resolveGoogleAdsDateRange(range?: string | null): GoogleAdsResolvedDateRange {
  const today = new Date();
  today.setUTCHours(12, 0, 0, 0);
  const normalized = String(range || 'month').trim().toLowerCase();

  if (normalized === 'month') {
    const currentEnd = today;
    const currentStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1, 12, 0, 0, 0));
    const elapsedDays = Math.max(1, Math.floor((currentEnd.getTime() - currentStart.getTime()) / 86400000) + 1);
    const previousStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1, 12, 0, 0, 0));
    const previousMonthLastDay = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 0, 12, 0, 0, 0));
    const previousEndCandidate = addDays(previousStart, elapsedDays - 1);
    const previousEnd = previousEndCandidate.getTime() > previousMonthLastDay.getTime()
      ? previousMonthLastDay
      : previousEndCandidate;

    return {
      key: 'month',
      label: 'Mês atual vs mês anterior',
      days: elapsedDays,
      current_start: formatDateInTimeZone(currentStart),
      current_end: formatDateInTimeZone(currentEnd),
      previous_start: formatDateInTimeZone(previousStart),
      previous_end: formatDateInTimeZone(previousEnd),
    };
  }

  const days = normalized === '7d' ? 7 : normalized === '90d' ? 90 : 30;
  const key = `${days}d` as GoogleAdsDashboardRange;
  const currentEnd = today;
  const currentStart = addDays(today, -(days - 1));
  const previousEnd = addDays(currentStart, -1);
  const previousStart = addDays(previousEnd, -(days - 1));

  return {
    key,
    label: `${days} dias`,
    days,
    current_start: formatDateInTimeZone(currentStart),
    current_end: formatDateInTimeZone(currentEnd),
    previous_start: formatDateInTimeZone(previousStart),
    previous_end: formatDateInTimeZone(previousEnd),
  };
}

function buildBetweenFilter(start: string, end: string) {
  return `segments.date BETWEEN '${start}' AND '${end}'`;
}

function normalizeUrl(value: unknown, fallback = 'https://www.toyoparts.com.br'): string {
  const raw = String(value || fallback).trim();
  if (!raw) return fallback;
  try {
    const url = new URL(raw);
    return url.toString();
  } catch {
    return fallback;
  }
}

function encodeBase64UrlBytes(bytes: Uint8Array) {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function encodeBase64UrlText(value: string) {
  return encodeBase64UrlBytes(new TextEncoder().encode(value));
}

function pemToPkcs8Bytes(pem: string): Uint8Array {
  const normalized = String(pem || '')
    .replace(/-----BEGIN PRIVATE KEY-----/g, '')
    .replace(/-----END PRIVATE KEY-----/g, '')
    .replace(/\s+/g, '');
  if (!normalized) {
    throw new Error('Google Ads service account private key invalida.');
  }
  const binary = atob(normalized);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

async function buildServiceAccountAssertion(config: GoogleAdsConfig) {
  const privateKeyBytes = pemToPkcs8Bytes(String(config.service_account_private_key || ''));
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    privateKeyBytes.buffer,
    {
      name: 'RSASSA-PKCS1-v1_5',
      hash: 'SHA-256',
    },
    false,
    ['sign'],
  );

  const nowSeconds = Math.floor(Date.now() / 1000);
  const header = {
    alg: 'RS256',
    typ: 'JWT',
    kid: config.service_account_private_key_id || undefined,
  };
  const payload = {
    iss: String(config.service_account_client_email || ''),
    scope: GOOGLE_ADS_OAUTH_SCOPE,
    aud: String(config.service_account_token_uri || 'https://oauth2.googleapis.com/token'),
    iat: nowSeconds,
    exp: nowSeconds + 3600,
  };

  const unsignedToken = `${encodeBase64UrlText(JSON.stringify(header))}.${encodeBase64UrlText(JSON.stringify(payload))}`;
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    new TextEncoder().encode(unsignedToken),
  );
  return `${unsignedToken}.${encodeBase64UrlBytes(new Uint8Array(signature))}`;
}

function normalizeConversionAction(action: any) {
  const tagSnippets = Array.isArray(action?.tagSnippets)
    ? action.tagSnippets
    : Array.isArray(action?.tag_snippets)
    ? action.tag_snippets
    : [];

  return {
    id: String(action?.id || '').trim() || null,
    resourceName: action?.resourceName || action?.resource_name || null,
    name: action?.name || null,
    status: action?.status || null,
    category: action?.category || null,
    type: action?.type || null,
    includeInConversionsMetric:
      typeof action?.includeInConversionsMetric === 'boolean'
        ? action.includeInConversionsMetric
        : typeof action?.include_in_conversions_metric === 'boolean'
        ? action.include_in_conversions_metric
        : null,
    primaryForGoal:
      typeof action?.primaryForGoal === 'boolean'
        ? action.primaryForGoal
        : typeof action?.primary_for_goal === 'boolean'
        ? action.primary_for_goal
        : null,
    valueSettings: action?.valueSettings || action?.value_settings || null,
    tagSnippets,
  };
}

function extractTagMetadata(action: any) {
  const normalized = normalizeConversionAction(action);
  const textBlob = normalized.tagSnippets
    .map((snippet: any) => [
      snippet?.globalSiteTag,
      snippet?.global_site_tag,
      snippet?.eventSnippet,
      snippet?.event_snippet,
    ].filter(Boolean).join('\n'))
    .join('\n');

  const tagId = textBlob.match(/\b(AW-\d+)\b/i)?.[1] || null;
  const label = textBlob.match(/\bAW-\d+\/([A-Za-z0-9_-]+)\b/i)?.[1] || null;

  return { tagId, label };
}

function parseGoogleAdsRows(data: any): GoogleAdsApiResultRow[] {
  const chunks = Array.isArray(data) ? data : [data];
  const rows: GoogleAdsApiResultRow[] = [];
  for (const chunk of chunks) {
    if (Array.isArray(chunk?.results)) rows.push(...chunk.results);
  }
  return rows;
}

function ensureResponseOk(response: Response, data: any, message: string) {
  if (response.ok) return;
  throw new Error(`${message} (${response.status}): ${JSON.stringify(data)}`);
}

async function googleAdsApiRequest(
  config: GoogleAdsConfig,
  path: string,
  options: {
    method?: 'GET' | 'POST';
    body?: unknown;
  } = {},
) {
  const accessToken = await refreshGoogleAdsAccessToken(config);
  const response = await fetch(`https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}/${path}`, {
    method: options.method || 'POST',
    headers: buildHeaders(config, accessToken),
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const data = await response.json().catch(() => ({}));
  return { response, data };
}

async function googleAdsMutate(
  config: GoogleAdsConfig,
  customerId: string,
  resource: string,
  operations: any[],
  extraBody: Record<string, unknown> = {},
) {
  const { response, data } = await googleAdsApiRequest(
    config,
    `customers/${encodeURIComponent(customerId)}/${resource}:mutate`,
    {
      body: {
        operations,
        ...extraBody,
      },
    },
  );
  ensureResponseOk(response, data, `Google Ads mutate em ${resource} falhou`);
  return data;
}

async function googleAdsRpc(
  config: GoogleAdsConfig,
  customerId: string,
  rpcPath: string,
  body: Record<string, unknown>,
) {
  const { response, data } = await googleAdsApiRequest(
    config,
    `customers/${encodeURIComponent(customerId)}/${rpcPath}`,
    { body },
  );
  ensureResponseOk(response, data, `Google Ads RPC ${rpcPath} falhou`);
  return data;
}

function resolveSearchCustomerId(config: GoogleAdsConfig, customerId?: string | null) {
  const resolved = sanitizeCustomerId(customerId) || sanitizeCustomerId(config.customer_id);
  if (!resolved) throw new Error('Google Ads customer_id nao configurado.');
  return resolved;
}

function resolveConversionCustomerId(config: GoogleAdsConfig, customerId?: string | null) {
  return (
    sanitizeCustomerId(customerId) ||
    sanitizeCustomerId(config.conversion_customer_id) ||
    sanitizeCustomerId(config.customer_id)
  );
}

function buildConversionActionPayload(blueprint: ConversionActionBlueprint) {
  return {
    name: blueprint.name,
    type: blueprint.type,
    category: blueprint.category,
    status: 'ENABLED',
    clickThroughLookbackWindowDays: blueprint.clickThroughLookbackWindowDays,
    viewThroughLookbackWindowDays: blueprint.viewThroughLookbackWindowDays,
    valueSettings: {
      defaultValue: blueprint.defaultValue,
      defaultCurrencyCode: 'BRL',
      alwaysUseDefaultValue: false,
    },
  };
}

function parseMutateResourceName(data: any): string | null {
  const result = Array.isArray(data?.results) ? data.results[0] : null;
  return String(
    result?.resourceName ||
    result?.resource_name ||
    result?.conversionAction?.resourceName ||
    result?.campaignBudget?.resourceName ||
    result?.campaign?.resourceName ||
    result?.assetGroup?.resourceName ||
    result?.assetGroupListingGroupFilter?.resourceName ||
    '',
  ).trim() || null;
}

function findConversionAction(actions: any[], actionId: string | null, exactName: string) {
  const byId = sanitizeCustomerId(actionId);
  if (byId) {
    const match = actions.find((action) => String(action?.id || '') === byId);
    if (match) return match;
  }

  return actions.find((action) => String(action?.name || '').trim() === exactName) || null;
}

function normalizeProductLink(row: any): GoogleAdsProductLinkSummary {
  const link = row?.product_link || row?.productLink || row || {};
  const merchantCenter =
    link?.merchantCenter || link?.merchant_center || row?.merchantCenter || row?.merchant_center || {};

  return {
    product_link_id: sanitizeCustomerId(link?.productLinkId || link?.product_link_id || link?.id),
    type: String(link?.type || '').trim() || null,
    status: String(link?.status || '').trim() || null,
    merchant_center_id: sanitizeCustomerId(
      merchantCenter?.merchantCenterId ||
      merchantCenter?.merchant_center_id ||
      link?.merchantCenterId ||
      link?.merchant_center_id,
    ),
    resource_name: String(link?.resourceName || link?.resource_name || '').trim() || null,
  };
}

function normalizeProductLinkInvitation(row: any): GoogleAdsProductLinkInvitationSummary {
  const invitation = row?.product_link_invitation || row?.productLinkInvitation || row || {};
  const merchantCenter =
    invitation?.merchantCenter ||
    invitation?.merchant_center ||
    row?.merchantCenter ||
    row?.merchant_center ||
    {};

  return {
    resource_name: String(invitation?.resourceName || invitation?.resource_name || '').trim() || null,
    status: String(invitation?.status || '').trim() || null,
    type: String(invitation?.type || '').trim() || null,
    merchant_center_id: sanitizeCustomerId(
      merchantCenter?.merchantCenterId ||
      merchantCenter?.merchant_center_id ||
      invitation?.merchantCenterId ||
      invitation?.merchant_center_id,
    ),
  };
}

function normalizePmaxCampaign(row: any): GoogleAdsPmaxCampaignSummary {
  const campaign = row?.campaign || {};
  const shoppingSetting = campaign?.shoppingSetting || campaign?.shopping_setting || {};

  return {
    id: sanitizeCustomerId(campaign?.id),
    name: String(campaign?.name || '').trim() || null,
    status: String(campaign?.status || '').trim() || null,
    primary_status: String(campaign?.primaryStatus || campaign?.primary_status || '').trim() || null,
    merchant_center_id: sanitizeCustomerId(shoppingSetting?.merchantId || shoppingSetting?.merchant_id),
    feed_label: String(shoppingSetting?.feedLabel || shoppingSetting?.feed_label || '').trim() || null,
    bidding_strategy_type: String(campaign?.biddingStrategyType || campaign?.bidding_strategy_type || '').trim() || null,
    resource_name: String(campaign?.resourceName || campaign?.resource_name || '').trim() || null,
  };
}

function normalizeCampaignPerformanceRow(row: any): Omit<GoogleAdsCampaignPerformance, 'previous' | 'delta'> {
  const campaign = row?.campaign || {};
  const shoppingSetting = campaign?.shoppingSetting || campaign?.shopping_setting || {};
  const metrics = row?.metrics || {};

  return {
    id: sanitizeCustomerId(campaign?.id),
    name: String(campaign?.name || '').trim() || null,
    status: String(campaign?.status || '').trim() || null,
    primary_status: String(campaign?.primaryStatus || campaign?.primary_status || '').trim() || null,
    advertising_channel_type:
      String(campaign?.advertisingChannelType || campaign?.advertising_channel_type || '').trim() || null,
    bidding_strategy_type:
      String(campaign?.biddingStrategyType || campaign?.bidding_strategy_type || '').trim() || null,
    merchant_center_id: sanitizeCustomerId(shoppingSetting?.merchantId || shoppingSetting?.merchant_id),
    feed_label: String(shoppingSetting?.feedLabel || shoppingSetting?.feed_label || '').trim() || null,
    current: deriveMetricSnapshot({
      impressions: metrics?.impressions,
      clicks: metrics?.clicks,
      ctr: metrics?.ctr,
      cost_micros: metrics?.costMicros || metrics?.cost_micros,
      conversions: metrics?.conversions,
      conversions_value: metrics?.conversionsValue || metrics?.conversions_value,
    }),
  };
}

function normalizeShoppingProductIssue(issue: any): GoogleAdsMerchantProductIssue {
  const code =
    String(issue?.code || issue?.issueCode || issue?.issue_code || issue?.type || '').trim() || null;
  const severity =
    String(issue?.severity || issue?.servability || issue?.resolution || '').trim() || null;
  const detail =
    String(
      issue?.detail ||
      issue?.description ||
      issue?.message ||
      issue?.shortDescription ||
      issue?.short_description ||
      code ||
      '',
    ).trim() || null;

  const documentationCandidate =
    issue?.documentation?.value ||
    issue?.documentation?.url ||
    issue?.documentation ||
    issue?.documentationUrl ||
    issue?.documentation_url ||
    issue?.helpCenterUrl ||
    null;

  return {
    code,
    severity,
    detail,
    documentation: String(documentationCandidate || '').trim() || null,
  };
}

function normalizeShoppingProductStatusRow(row: any): GoogleAdsMerchantProductStatusRow {
  const product = row?.shoppingProduct || row?.shopping_product || row || {};
  const issues = Array.isArray(product?.issues)
    ? product.issues
    : Array.isArray(product?.Issues)
    ? product.Issues
    : [];

  return {
    resource_name: String(product?.resourceName || product?.resource_name || '').trim() || null,
    merchant_center_id: sanitizeCustomerId(product?.merchantCenterId || product?.merchant_center_id),
    feed_label: String(product?.feedLabel || product?.feed_label || '').trim() || null,
    item_id: String(product?.itemId || product?.item_id || '').trim() || null,
    title: String(product?.title || '').trim() || null,
    brand: String(product?.brand || '').trim() || null,
    channel: String(product?.channel || '').trim() || null,
    language_code: String(product?.languageCode || product?.language_code || '').trim() || null,
    currency_code: String(product?.currencyCode || product?.currency_code || '').trim() || null,
    price: microsToCurrency(product?.priceMicros || product?.price_micros),
    availability: String(product?.availability || '').trim() || null,
    status: String(product?.status || '').trim() || null,
    issues: issues.map(normalizeShoppingProductIssue),
  };
}

function normalizeShoppingPerformanceRow(row: any): GoogleAdsMerchantProductPerformanceRow {
  const segments = row?.segments || {};
  const metrics = row?.metrics || {};

  return {
    merchant_center_id: sanitizeCustomerId(
      segments?.productMerchantId ||
      segments?.product_merchant_id ||
      row?.shoppingProduct?.merchantCenterId ||
      row?.shopping_product?.merchant_center_id,
    ),
    feed_label: String(
      segments?.productFeedLabel ||
      segments?.product_feed_label ||
      row?.shoppingProduct?.feedLabel ||
      row?.shopping_product?.feed_label ||
      '',
    ).trim() || null,
    item_id: String(
      segments?.productItemId ||
      segments?.product_item_id ||
      row?.shoppingProduct?.itemId ||
      row?.shopping_product?.item_id ||
      '',
    ).trim() || null,
    title: String(
      segments?.productTitle ||
      segments?.product_title ||
      row?.shoppingProduct?.title ||
      row?.shopping_product?.title ||
      '',
    ).trim() || null,
    metrics: deriveMetricSnapshot({
      impressions: metrics?.impressions,
      clicks: metrics?.clicks,
      ctr: metrics?.ctr,
      cost_micros: metrics?.costMicros || metrics?.cost_micros,
      conversions: metrics?.conversions,
      conversions_value: metrics?.conversionsValue || metrics?.conversions_value,
    }),
  };
}

export async function refreshGoogleAdsAccessToken(config: GoogleAdsConfig): Promise<string> {
  assertConfigured(config);

  const body =
    config.auth_mode === 'service_account'
      ? new URLSearchParams({
          grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
          assertion: await buildServiceAccountAssertion(config),
        })
      : new URLSearchParams({
          client_id: String(config.oauth_client_id),
          client_secret: String(config.oauth_client_secret),
          refresh_token: String(config.oauth_refresh_token),
          grant_type: 'refresh_token',
        });

  const tokenUri =
    config.auth_mode === 'service_account'
      ? String(config.service_account_token_uri || 'https://oauth2.googleapis.com/token')
      : 'https://oauth2.googleapis.com/token';

  const response = await fetch(tokenUri, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Falha ao obter access token do Google Ads (${response.status}): ${text}`);
  }

  const data = await response.json();
  if (!data?.access_token) {
    throw new Error('Google OAuth nao retornou access_token.');
  }

  return String(data.access_token);
}

export async function googleAdsSearch(
  config: GoogleAdsConfig,
  query: string,
  customerId?: string | null,
): Promise<GoogleAdsApiResultRow[]> {
  const resolvedCustomerId = resolveSearchCustomerId(config, customerId);
  const { response, data } = await googleAdsApiRequest(
    config,
    `customers/${encodeURIComponent(resolvedCustomerId)}/googleAds:searchStream`,
    {
      body: { query },
    },
  );

  ensureResponseOk(response, data, 'Google Ads search falhou');
  return parseGoogleAdsRows(data);
}

export async function googleAdsGetCustomerInfo(
  config: GoogleAdsConfig,
): Promise<GoogleAdsConnectionInfo> {
  const rows = await googleAdsSearch(
    config,
    [
      'SELECT',
      'customer.id,',
      'customer.descriptive_name,',
      'customer.currency_code,',
      'customer.conversion_tracking_setting.google_ads_conversion_customer,',
      'customer.conversion_tracking_setting.conversion_tracking_status',
      'FROM customer',
      'LIMIT 1',
    ].join(' '),
  );

  const customer = rows[0]?.customer || null;
  const tracking = customer?.conversionTrackingSetting || customer?.conversion_tracking_setting || {};
  return {
    ok: Boolean(customer?.id),
    customer: customer
      ? {
          id: String(customer.id || '').trim() || null,
          descriptive_name: customer.descriptiveName || customer.descriptive_name || null,
          currency_code: customer.currencyCode || customer.currency_code || null,
        }
      : null,
    conversion_customer_id: extractIdFromResourceName(
      tracking?.googleAdsConversionCustomer || tracking?.google_ads_conversion_customer,
    ),
    conversion_tracking_status:
      String(tracking?.conversionTrackingStatus || tracking?.conversion_tracking_status || '').trim() || null,
  };
}

export async function googleAdsTestConnection(config: GoogleAdsConfig) {
  return googleAdsGetCustomerInfo(config);
}

export async function googleAdsFetchConversionActions(
  config: GoogleAdsConfig,
  customerId?: string | null,
) {
  const queries = [
    [
      'SELECT',
      'conversion_action.id,',
      'conversion_action.resource_name,',
      'conversion_action.name,',
      'conversion_action.status,',
      'conversion_action.category,',
      'conversion_action.type,',
      'conversion_action.include_in_conversions_metric,',
      'conversion_action.primary_for_goal,',
      'conversion_action.value_settings.default_value,',
      'conversion_action.value_settings.default_currency_code,',
      'conversion_action.value_settings.always_use_default_value,',
      'conversion_action.tag_snippets',
      'FROM conversion_action',
      'ORDER BY conversion_action.name',
    ].join(' '),
    [
      'SELECT',
      'conversion_action.id,',
      'conversion_action.resource_name,',
      'conversion_action.name,',
      'conversion_action.status,',
      'conversion_action.category,',
      'conversion_action.type,',
      'conversion_action.include_in_conversions_metric,',
      'conversion_action.primary_for_goal,',
      'conversion_action.value_settings.default_value,',
      'conversion_action.value_settings.default_currency_code,',
      'conversion_action.value_settings.always_use_default_value',
      'FROM conversion_action',
      'ORDER BY conversion_action.name',
    ].join(' '),
  ];

  for (const query of queries) {
    try {
      const rows = await googleAdsSearch(config, query, customerId);
      return rows
        .map((row) => normalizeConversionAction(row?.conversionAction || row?.conversion_action || row))
        .filter(Boolean);
    } catch {
      // Try a simpler query when the account does not expose all fields.
    }
  }

  return [];
}

async function googleAdsCreateConversionAction(
  config: GoogleAdsConfig,
  customerId: string,
  blueprint: ConversionActionBlueprint,
) {
  const data = await googleAdsMutate(
    config,
    customerId,
    'conversionActions',
    [{ create: buildConversionActionPayload(blueprint) }],
  );
  return {
    resource_name: parseMutateResourceName(data),
    id: extractIdFromResourceName(parseMutateResourceName(data)),
  };
}

export async function googleAdsEnsureConversionActions(
  config: GoogleAdsConfig,
): Promise<GoogleAdsEnsureConversionsResult> {
  const connection = await googleAdsGetCustomerInfo(config);
  const effectiveConversionCustomerId = resolveConversionCustomerId(
    config,
    connection.conversion_customer_id || config.conversion_customer_id || config.customer_id,
  );

  if (!effectiveConversionCustomerId) {
    throw new Error('Nao foi possivel resolver o conversion customer do Google Ads.');
  }

  let actions = await googleAdsFetchConversionActions(config, effectiveConversionCustomerId);
  const created: Array<{ key: GoogleAdsConversionKey; id: string | null; name: string }> = [];

  for (const blueprint of CONVERSION_ACTION_BLUEPRINTS) {
    const currentActionId = String((config as any)[blueprint.configKey] || '').trim() || null;
    let action = findConversionAction(actions, currentActionId, blueprint.name);
    if (!action) {
      await googleAdsCreateConversionAction(config, effectiveConversionCustomerId, blueprint);
      created.push({ key: blueprint.key, id: null, name: blueprint.name });
      actions = await googleAdsFetchConversionActions(config, effectiveConversionCustomerId);
      action = findConversionAction(actions, null, blueprint.name);
    }

    const createdItem = created.find((item) => item.key === blueprint.key);
    if (createdItem) {
      createdItem.id = String(action?.id || '').trim() || null;
    }
  }

  const purchaseAction = findConversionAction(actions, config.conversion_action_purchase_id, 'Purchase - Website');
  const whatsappLeadAction = findConversionAction(actions, config.conversion_action_whatsapp_lead_id, 'WhatsApp Lead - Qualified');
  const whatsappClosedAction = findConversionAction(actions, config.conversion_action_whatsapp_closed_id, 'Purchase - WhatsApp Closed');

  const purchaseTag = extractTagMetadata(purchaseAction);
  const whatsappLeadTag = extractTagMetadata(whatsappLeadAction);
  const googleTagId = purchaseTag.tagId || whatsappLeadTag.tagId || null;

  return {
    actions,
    created,
    effective_conversion_customer_id: effectiveConversionCustomerId,
    conversion_tracking_status: connection.conversion_tracking_status,
    google_tag_id: googleTagId,
    purchase_label: purchaseTag.label,
    whatsapp_lead_label: whatsappLeadTag.label,
    configPatch: {
      conversion_customer_id: effectiveConversionCustomerId,
      conversion_tracking_status: connection.conversion_tracking_status,
      conversion_action_purchase_id: String(purchaseAction?.id || '').trim() || null,
      conversion_action_whatsapp_lead_id: String(whatsappLeadAction?.id || '').trim() || null,
      conversion_action_whatsapp_closed_id: String(whatsappClosedAction?.id || '').trim() || null,
      last_successful_api_check_at: new Date().toISOString(),
    },
  };
}

export async function googleAdsFetchProductLinks(
  config: GoogleAdsConfig,
  customerId?: string | null,
): Promise<GoogleAdsProductLinkSummary[]> {
  const resolvedCustomerId = resolveSearchCustomerId(config, customerId);

  const queries = [
    [
      'SELECT',
      'product_link.resource_name,',
      'product_link.product_link_id,',
      'product_link.type,',
      'product_link.status,',
      'product_link.merchant_center.merchant_center_id',
      'FROM product_link',
    ].join(' '),
    [
      'SELECT',
      'product_link.resource_name,',
      'product_link.product_link_id,',
      'product_link.type',
      'FROM product_link',
    ].join(' '),
  ];

  for (const query of queries) {
    try {
      const rows = await googleAdsSearch(config, query, resolvedCustomerId);
      return rows.map(normalizeProductLink);
    } catch {
      // Try the next query shape.
    }
  }

  return [];
}

export async function googleAdsFetchProductLinkInvitations(
  config: GoogleAdsConfig,
  customerId?: string | null,
): Promise<GoogleAdsProductLinkInvitationSummary[]> {
  const resolvedCustomerId = resolveSearchCustomerId(config, customerId);

  const queries = [
    [
      'SELECT',
      'product_link_invitation.resource_name,',
      'product_link_invitation.status,',
      'product_link_invitation.type,',
      'product_link_invitation.merchant_center.merchant_center_id',
      'FROM product_link_invitation',
    ].join(' '),
    [
      'SELECT',
      'product_link_invitation.resource_name,',
      'product_link_invitation.status,',
      'product_link_invitation.type',
      'FROM product_link_invitation',
    ].join(' '),
  ];

  for (const query of queries) {
    try {
      const rows = await googleAdsSearch(config, query, resolvedCustomerId);
      return rows.map(normalizeProductLinkInvitation);
    } catch {
      // Try the next query shape.
    }
  }

  return [];
}

async function googleAdsCreateProductLink(
  config: GoogleAdsConfig,
  customerId: string,
  merchantCenterId: string,
) {
  return googleAdsRpc(config, customerId, 'productLinks:create', {
    productLink: {
      merchantCenter: {
        merchantCenterId,
      },
    },
  });
}

async function googleAdsCreateProductLinkInvitation(
  config: GoogleAdsConfig,
  customerId: string,
  merchantCenterId: string,
) {
  return googleAdsRpc(config, customerId, 'productLinkInvitations:create', {
    productLinkInvitation: {
      merchantCenter: {
        merchantCenterId,
      },
    },
  });
}

async function googleAdsUpdateProductLinkInvitation(
  config: GoogleAdsConfig,
  customerId: string,
  resourceName: string,
  status: 'ACCEPTED' | 'REJECTED',
) {
  return googleAdsRpc(config, customerId, 'productLinkInvitations:update', {
    productLinkInvitation: {
      resourceName,
      status,
    },
    updateMask: 'status',
  });
}

export async function googleAdsEnsureMerchantLink(
  config: GoogleAdsConfig,
): Promise<GoogleAdsEnsureMerchantLinkResult> {
  const customerId = resolveSearchCustomerId(config);
  const merchantCenterId = sanitizeCustomerId(config.merchant_center_id);

  if (!merchantCenterId) {
    throw new Error('merchant_center_id nao configurado.');
  }

  const actions: string[] = [];
  let links = await googleAdsFetchProductLinks(config, customerId);
  let invitations = await googleAdsFetchProductLinkInvitations(config, customerId);

  const findRelevantLink = () =>
    links.find((link) => !link.merchant_center_id || link.merchant_center_id === merchantCenterId) || null;
  const findRelevantInvitation = () =>
    invitations.find((invitation) => !invitation.merchant_center_id || invitation.merchant_center_id === merchantCenterId) || null;

  let linked = findRelevantLink();
  if (linked) {
    return {
      status: 'linked',
      links,
      invitations,
      actions,
      configPatch: {
        merchant_link_status: 'linked',
      },
    };
  }

  const invitation = findRelevantInvitation();
  if (invitation && invitation.resource_name && invitation.status === 'PENDING_APPROVAL') {
    try {
      await googleAdsUpdateProductLinkInvitation(config, customerId, invitation.resource_name, 'ACCEPTED');
      actions.push('accepted_pending_invitation');
      links = await googleAdsFetchProductLinks(config, customerId);
      invitations = await googleAdsFetchProductLinkInvitations(config, customerId);
      linked = findRelevantLink();
    } catch (error: any) {
      actions.push(`accept_invitation_failed:${error?.message || 'unknown'}`);
    }
  } else if (invitation && invitation.status) {
    actions.push(`invitation_${String(invitation.status).toLowerCase()}`);
  }

  if (!linked) {
    try {
      await googleAdsCreateProductLink(config, customerId, merchantCenterId);
      actions.push('created_direct_link');
    } catch (error: any) {
      actions.push(`direct_link_failed:${error?.message || 'unknown'}`);
      try {
        await googleAdsCreateProductLinkInvitation(config, customerId, merchantCenterId);
        actions.push('created_invitation');
      } catch (invitationError: any) {
        actions.push(`create_invitation_failed:${invitationError?.message || 'unknown'}`);
      }
    }

    links = await googleAdsFetchProductLinks(config, customerId);
    invitations = await googleAdsFetchProductLinkInvitations(config, customerId);
    linked = findRelevantLink();
  }

  const nextInvitation = findRelevantInvitation();
  const status = linked
    ? 'linked'
    : nextInvitation?.status === 'PENDING_APPROVAL'
    ? 'pending_approval'
    : nextInvitation?.status === 'REQUESTED'
    ? 'requested'
    : 'missing';

  return {
    status,
    links,
    invitations,
    actions,
    configPatch: {
      merchant_link_status: status,
    },
  };
}

export async function googleAdsFetchPmaxCampaigns(
  config: GoogleAdsConfig,
  customerId?: string | null,
): Promise<GoogleAdsPmaxCampaignSummary[]> {
  const rows = await googleAdsSearch(
    config,
    [
      'SELECT',
      'campaign.id,',
      'campaign.resource_name,',
      'campaign.name,',
      'campaign.status,',
      'campaign.primary_status,',
      'campaign.shopping_setting.merchant_id,',
      'campaign.shopping_setting.feed_label,',
      'campaign.bidding_strategy_type',
      'FROM campaign',
      "WHERE campaign.advertising_channel_type = 'PERFORMANCE_MAX'",
      'ORDER BY campaign.id DESC',
    ].join(' '),
    customerId,
  );

  return rows.map(normalizePmaxCampaign);
}

export async function googleAdsFetchCampaignPerformance(
  config: GoogleAdsConfig,
  range: GoogleAdsDashboardRange = '30d',
  customerId?: string | null,
): Promise<GoogleAdsCampaignPerformance[]> {
  const resolvedRange = resolveGoogleAdsDateRange(range);
  const baseQuery = (start: string, end: string) => [
    'SELECT',
    'campaign.id,',
    'campaign.name,',
    'campaign.status,',
    'campaign.primary_status,',
    'campaign.advertising_channel_type,',
    'campaign.bidding_strategy_type,',
    'campaign.shopping_setting.merchant_id,',
    'campaign.shopping_setting.feed_label,',
    'metrics.impressions,',
    'metrics.clicks,',
    'metrics.ctr,',
    'metrics.cost_micros,',
    'metrics.conversions,',
    'metrics.conversions_value',
    'FROM campaign',
    `WHERE ${buildBetweenFilter(start, end)}`,
    'ORDER BY metrics.cost_micros DESC',
  ].join(' ');

  const [currentRows, previousRows] = await Promise.all([
    googleAdsSearch(config, baseQuery(resolvedRange.current_start, resolvedRange.current_end), customerId),
    googleAdsSearch(config, baseQuery(resolvedRange.previous_start, resolvedRange.previous_end), customerId),
  ]);

  const currentMap = new Map<string, Omit<GoogleAdsCampaignPerformance, 'previous' | 'delta'>>();
  for (const row of currentRows) {
    const normalized = normalizeCampaignPerformanceRow(row);
    const key = normalized.id || normalized.name || crypto.randomUUID();
    currentMap.set(key, normalized);
  }

  const previousMap = new Map<string, Omit<GoogleAdsCampaignPerformance, 'previous' | 'delta'>>();
  for (const row of previousRows) {
    const normalized = normalizeCampaignPerformanceRow(row);
    const key = normalized.id || normalized.name || crypto.randomUUID();
    previousMap.set(key, normalized);
  }

  const mergedKeys = new Set<string>([...currentMap.keys(), ...previousMap.keys()]);
  const result: GoogleAdsCampaignPerformance[] = [];
  for (const key of mergedKeys) {
    const current = currentMap.get(key);
    const previousRow = previousMap.get(key);
    const previous = previousRow?.current || deriveMetricSnapshot({});
    if (!current) {
      result.push({
        id: previousRow?.id || null,
        name: previousRow?.name || null,
        status: previousRow?.status || null,
        primary_status: previousRow?.primary_status || null,
        advertising_channel_type: previousRow?.advertising_channel_type || null,
        bidding_strategy_type: previousRow?.bidding_strategy_type || null,
        merchant_center_id: previousRow?.merchant_center_id || null,
        feed_label: previousRow?.feed_label || null,
        current: deriveMetricSnapshot({}),
        previous,
        delta: buildMetricDelta(deriveMetricSnapshot({}), previous),
      });
      continue;
    }

    result.push({
      ...current,
      previous,
      delta: buildMetricDelta(current.current, previous),
    });
  }

  return result.sort((left, right) => right.current.cost - left.current.cost);
}

export async function googleAdsFetchShoppingProductStatuses(
  config: GoogleAdsConfig,
  customerId?: string | null,
): Promise<GoogleAdsMerchantProductStatusRow[]> {
  const rows = await googleAdsSearch(
    config,
    [
      'SELECT',
      'shopping_product.resource_name,',
      'shopping_product.merchant_center_id,',
      'shopping_product.feed_label,',
      'shopping_product.item_id,',
      'shopping_product.title,',
      'shopping_product.brand,',
      'shopping_product.channel,',
      'shopping_product.language_code,',
      'shopping_product.currency_code,',
      'shopping_product.price_micros,',
      'shopping_product.availability,',
      'shopping_product.status,',
      'shopping_product.issues',
      'FROM shopping_product',
      'ORDER BY shopping_product.item_id',
    ].join(' '),
    customerId,
  );

  return rows.map(normalizeShoppingProductStatusRow);
}

export async function googleAdsFetchShoppingProductPerformance(
  config: GoogleAdsConfig,
  range: GoogleAdsDashboardRange = '30d',
  customerId?: string | null,
): Promise<GoogleAdsMerchantProductPerformanceRow[]> {
  const resolvedRange = resolveGoogleAdsDateRange(range);
  const primaryQuery = [
    'SELECT',
    'segments.product_item_id,',
    'segments.product_title,',
    'segments.product_feed_label,',
    'segments.product_merchant_id,',
    'metrics.impressions,',
    'metrics.clicks,',
    'metrics.ctr,',
    'metrics.cost_micros,',
    'metrics.conversions,',
    'metrics.conversions_value',
    'FROM shopping_performance_view',
    `WHERE ${buildBetweenFilter(resolvedRange.current_start, resolvedRange.current_end)}`,
    'ORDER BY metrics.impressions DESC',
  ].join(' ');

  const fallbackQuery = [
    'SELECT',
    'shopping_product.merchant_center_id,',
    'shopping_product.feed_label,',
    'shopping_product.item_id,',
    'shopping_product.title,',
    'metrics.impressions,',
    'metrics.clicks,',
    'metrics.ctr,',
    'metrics.cost_micros,',
    'metrics.conversions,',
    'metrics.conversions_value',
    'FROM shopping_product',
    `WHERE ${buildBetweenFilter(resolvedRange.current_start, resolvedRange.current_end)}`,
    'ORDER BY metrics.impressions DESC',
  ].join(' ');

  try {
    const rows = await googleAdsSearch(config, primaryQuery, customerId);
    return rows.map(normalizeShoppingPerformanceRow);
  } catch {
    const rows = await googleAdsSearch(config, fallbackQuery, customerId);
    return rows.map(normalizeShoppingPerformanceRow);
  }
}

async function googleAdsCreateCampaignBudget(
  config: GoogleAdsConfig,
  customerId: string,
  campaignName: string,
  dailyBudgetBrl: number,
) {
  const amountMicros = Math.round(Math.max(1, dailyBudgetBrl) * 1_000_000);
  const data = await googleAdsMutate(
    config,
    customerId,
    'campaignBudgets',
    [
      {
        create: {
          name: `${campaignName} | Budget`,
          amountMicros,
          deliveryMethod: 'STANDARD',
          explicitlyShared: false,
        },
      },
    ],
  );

  return { resource_name: parseMutateResourceName(data) };
}

async function googleAdsCreatePmaxCampaign(
  config: GoogleAdsConfig,
  customerId: string,
  budgetResourceName: string,
  input: {
    campaignName: string;
    merchantCenterId: string;
    feedLabel?: string | null;
    targetRoas?: number | null;
  },
) {
  const maximizeConversionValue = input.targetRoas && input.targetRoas > 0
    ? { targetRoas: input.targetRoas }
    : {};

  const data = await googleAdsMutate(
    config,
    customerId,
    'campaigns',
    [
      {
        create: {
          name: input.campaignName,
          status: 'PAUSED',
          advertisingChannelType: 'PERFORMANCE_MAX',
          campaignBudget: budgetResourceName,
          maximizeConversionValue,
          shoppingSetting: {
            merchantId: input.merchantCenterId,
            feedLabel: input.feedLabel || undefined,
          },
          containsEuPoliticalAdvertising: 'DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING',
        },
      },
    ],
  );

  return { resource_name: parseMutateResourceName(data) };
}

async function googleAdsCreateAssetGroup(
  config: GoogleAdsConfig,
  customerId: string,
  input: {
    campaignResourceName: string;
    assetGroupName: string;
    websiteUrl: string;
  },
) {
  const data = await googleAdsMutate(
    config,
    customerId,
    'assetGroups',
    [
      {
        create: {
          name: input.assetGroupName,
          campaign: input.campaignResourceName,
          finalUrls: [input.websiteUrl],
          finalMobileUrls: [input.websiteUrl],
          status: 'PAUSED',
        },
      },
    ],
  );

  return { resource_name: parseMutateResourceName(data) };
}

async function googleAdsCreateAllProductsListingGroup(
  config: GoogleAdsConfig,
  customerId: string,
  assetGroupResourceName: string,
) {
  const data = await googleAdsMutate(
    config,
    customerId,
    'assetGroupListingGroupFilters',
    [
      {
        create: {
          assetGroup: assetGroupResourceName,
          type: 'UNIT_INCLUDED',
          listingSource: 'SHOPPING',
        },
      },
    ],
  );

  return { resource_name: parseMutateResourceName(data) };
}

export async function googleAdsProvisionBasePmaxCampaign(
  config: GoogleAdsConfig,
  overrides: Partial<{
    campaign_name: string;
    feed_label: string | null;
    daily_budget_brl: number | null;
    target_roas: number | null;
    website_url: string | null;
  }> = {},
): Promise<GoogleAdsProvisionPmaxResult> {
  const customerId = resolveSearchCustomerId(config);
  const merchantCenterId = sanitizeCustomerId(config.merchant_center_id);
  if (!merchantCenterId) {
    throw new Error('merchant_center_id nao configurado.');
  }

  const campaignName = String(
    overrides.campaign_name ||
    config.pmax_base_campaign_name ||
    'Toyoparts | PMax Retail Base',
  ).trim();
  const feedLabel = String(
    overrides.feed_label === undefined ? config.pmax_feed_label || '' : overrides.feed_label || '',
  ).trim() || null;
  const dailyBudgetBrl = Number(
    overrides.daily_budget_brl === undefined
      ? config.pmax_default_daily_budget_brl || 150
      : overrides.daily_budget_brl || 150,
  );
  const targetRoas =
    overrides.target_roas === undefined
      ? config.pmax_default_target_roas
      : overrides.target_roas ?? null;
  const websiteUrl = normalizeUrl(overrides.website_url || config.website_url || 'https://www.toyoparts.com.br');

  const existingCampaigns = await googleAdsFetchPmaxCampaigns(config, customerId);
  const existingCampaign =
    existingCampaigns.find((campaign) => campaign.id && campaign.id === sanitizeCustomerId(config.pmax_base_campaign_id)) ||
    existingCampaigns.find((campaign) => String(campaign.name || '').trim() === campaignName) ||
    null;

  if (existingCampaign) {
    return {
      created: false,
      campaign: existingCampaign,
      asset_group_id: sanitizeCustomerId(config.pmax_base_asset_group_id),
      budget_resource_name: null,
      listing_group_resource_name: null,
      configPatch: {
        pmax_enabled: true,
        pmax_base_campaign_id: existingCampaign.id,
        pmax_base_campaign_name: existingCampaign.name,
      },
    };
  }

  const budget = await googleAdsCreateCampaignBudget(config, customerId, campaignName, dailyBudgetBrl);
  if (!budget.resource_name) {
    throw new Error('Google Ads nao retornou o resource name do campaign budget.');
  }

  const campaign = await googleAdsCreatePmaxCampaign(config, customerId, budget.resource_name, {
    campaignName,
    merchantCenterId,
    feedLabel,
    targetRoas,
  });
  if (!campaign.resource_name) {
    throw new Error('Google Ads nao retornou o resource name da campanha PMax.');
  }

  const assetGroup = await googleAdsCreateAssetGroup(config, customerId, {
    campaignResourceName: campaign.resource_name,
    assetGroupName: `${campaignName} | Asset Group`,
    websiteUrl,
  });
  if (!assetGroup.resource_name) {
    throw new Error('Google Ads nao retornou o resource name do asset group.');
  }

  const listingGroup = await googleAdsCreateAllProductsListingGroup(config, customerId, assetGroup.resource_name);
  const refreshedCampaigns = await googleAdsFetchPmaxCampaigns(config, customerId);
  const createdCampaign =
    refreshedCampaigns.find((item) => item.resource_name === campaign.resource_name) ||
    refreshedCampaigns.find((item) => String(item.name || '').trim() === campaignName) ||
    null;

  return {
    created: true,
    campaign: createdCampaign,
    asset_group_id: extractIdFromResourceName(assetGroup.resource_name),
    budget_resource_name: budget.resource_name,
    listing_group_resource_name: listingGroup.resource_name,
    configPatch: {
      pmax_enabled: true,
      pmax_base_campaign_id: createdCampaign?.id || extractIdFromResourceName(campaign.resource_name),
      pmax_base_campaign_name: createdCampaign?.name || campaignName,
      pmax_base_asset_group_id: extractIdFromResourceName(assetGroup.resource_name),
      pmax_last_provisioned_at: new Date().toISOString(),
      website_url: websiteUrl,
      pmax_feed_label: feedLabel,
      pmax_default_daily_budget_brl: dailyBudgetBrl,
      pmax_default_target_roas: targetRoas ?? null,
    },
  };
}

export async function googleAdsUploadClickConversion(
  config: GoogleAdsConfig,
  job: OfflineConversionJob,
) {
  if (!config.conversion_action_whatsapp_closed_id) {
    throw new Error('conversion_action_whatsapp_closed_id nao configurado.');
  }

  const conversionCustomerId = resolveConversionCustomerId(config);
  if (!conversionCustomerId) {
    throw new Error('Nao foi possivel resolver o conversion customer para upload offline.');
  }

  const accessToken = await refreshGoogleAdsAccessToken(config);
  const payload = {
    conversions: [
      {
        conversionAction: `customers/${conversionCustomerId}/conversionActions/${config.conversion_action_whatsapp_closed_id}`,
        conversionDateTime: formatGoogleAdsDateTime(job.conversion_time),
        conversionValue: Number(job.conversion_value || 0),
        currencyCode: job.currency_code || 'BRL',
        orderId: job.transaction_id,
        [job.click_id_type]: job.click_id_value,
      },
    ],
    partialFailure: true,
    validateOnly: false,
  };

  const response = await fetch(
    `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}/customers/${encodeURIComponent(String(conversionCustomerId))}:uploadClickConversions`,
    {
      method: 'POST',
      headers: buildHeaders(config, accessToken),
      body: JSON.stringify(payload),
    },
  );

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`Upload de conversao offline falhou (${response.status}): ${JSON.stringify(data)}`);
  }

  const partialFailureError = data?.partialFailureError || data?.partial_failure_error;
  if (partialFailureError) {
    throw new Error(`Google Ads retornou partial failure: ${JSON.stringify(partialFailureError)}`);
  }

  return data;
}

export function formatGoogleAdsDateTime(value: string): string {
  const date = new Date(String(value || ''));
  if (!Number.isFinite(date.getTime())) {
    throw new Error('conversion_time invalido para Google Ads.');
  }

  const formatter = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  const parts = formatter.formatToParts(date);
  const read = (type: string) => parts.find((item) => item.type === type)?.value || '00';
  return `${read('year')}-${read('month')}-${read('day')} ${read('hour')}:${read('minute')}:${read('second')}-03:00`;
}
