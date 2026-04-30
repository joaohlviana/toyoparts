import * as kv from './kv_store.tsx';

export const TRACKING_SCHEMA_VERSION = '2.0';
export const CAMPAIGN_GOALS_CONFIG_KEY = 'meta:campaign_goals_config';

export type MarketingEventName =
  | 'page_view'
  | 'view_item'
  | 'add_to_cart'
  | 'remove_from_cart'
  | 'begin_checkout'
  | 'purchase_paid'
  | 'refund'
  | 'whatsapp_click'
  | 'whatsapp_banner_lead'
  | 'search_performed'
  | 'search_result_click'
  | 'search_zero_results';

export interface MarketingAttributionSnapshot {
  gclid?: string;
  gbraid?: string;
  wbraid?: string;
  fbclid?: string;
  fbp?: string;
  fbc?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
  user_agent?: string;
  landing_page?: string;
  referrer?: string;
  session_id?: string;
  anonymous_id?: string;
  user_id?: string;
}

export interface MarketingUserData {
  email?: string;
  phone?: string;
  first_name?: string;
  last_name?: string;
  external_id?: string;
  client_user_agent?: string;
  client_ip_address?: string;
}

export interface MarketingEcommerceItem {
  item_id: string;
  name?: string;
  price?: number;
  quantity?: number;
  category?: string;
  brand?: string;
}

export interface MarketingTrackingEvent {
  event_name: MarketingEventName;
  event_id: string;
  event_time: string;
  schema_version: string;
  session_id: string;
  anonymous_id?: string;
  user_id?: string;
  page_url?: string;
  page_path?: string;
  page_title?: string;
  page_type?: string;
  referrer?: string;
  source_surface?: string;
  banner_id?: string;
  linked_product_sku?: string;
  quantity?: number;
  resolved_value?: number;
  resolved_value_source?: string;
  campaign_goal?: 'purchase_paid' | 'whatsapp_banner_lead';
  properties?: Record<string, unknown>;
  attribution?: MarketingAttributionSnapshot;
  consent?: {
    ads?: boolean;
    analytics?: boolean;
    timestamp?: string;
  };
  ecommerce?: {
    currency?: string;
    value?: number;
    transaction_id?: string;
    items?: MarketingEcommerceItem[];
  };
  user_data?: MarketingUserData;
}

export interface CampaignGoalsConfig {
  fallbackWhatsappLeadValue: number | null;
  enablePurchaseGoal: boolean;
  enableWhatsappLeadGoal: boolean;
  googleAdsTagId: string | null;
  googleAdsPurchaseLabel: string | null;
  googleAdsWhatsappLeadLabel: string | null;
  metaPixelId: string | null;
  metaConversionsApiEnabled: boolean;
  posthogProjectId: string | null;
  posthogHost: string | null;
  posthogAppHost: string | null;
  updatedAt: string | null;
  updatedBy: string | null;
}

function readEnv(name: string): string | null {
  const value = (Deno.env.get(name) || '').trim();
  return value || null;
}

function readEnvNumber(name: string): number | null {
  const raw = readEnv(name);
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

export function inferPostHogAppHost(host?: string | null): string | null {
  const cleaned = String(host || '').trim().replace(/\/+$/, '');
  if (!cleaned) return null;
  if (cleaned.includes('.i.posthog.com')) return cleaned.replace('.i.posthog.com', '.posthog.com');
  return cleaned;
}

const DEFAULT_CAMPAIGN_GOALS_CONFIG: CampaignGoalsConfig = {
  fallbackWhatsappLeadValue: readEnvNumber('WHATSAPP_LEAD_FALLBACK_VALUE'),
  enablePurchaseGoal: true,
  enableWhatsappLeadGoal: true,
  googleAdsTagId: readEnv('GOOGLE_ADS_TAG_ID') || readEnv('VITE_PUBLIC_GOOGLE_ADS_TAG_ID'),
  googleAdsPurchaseLabel: readEnv('GOOGLE_ADS_PURCHASE_LABEL') || readEnv('VITE_PUBLIC_GOOGLE_ADS_PURCHASE_LABEL'),
  googleAdsWhatsappLeadLabel: readEnv('GOOGLE_ADS_WHATSAPP_LEAD_LABEL') || readEnv('VITE_PUBLIC_GOOGLE_ADS_WHATSAPP_LEAD_LABEL'),
  metaPixelId: readEnv('META_PIXEL_ID') || readEnv('VITE_PUBLIC_META_PIXEL_ID'),
  metaConversionsApiEnabled: Boolean(readEnv('META_ACCESS_TOKEN') && readEnv('META_PIXEL_ID')),
  posthogProjectId: readEnv('POSTHOG_PROJECT_ID'),
  posthogHost: readEnv('POSTHOG_HOST'),
  posthogAppHost: inferPostHogAppHost(readEnv('POSTHOG_APP_HOST') || readEnv('POSTHOG_HOST')),
  updatedAt: null,
  updatedBy: null,
};

function sanitizeNullableString(value: unknown): string | null {
  const normalized = String(value || '').trim();
  return normalized || null;
}

function sanitizeNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function sanitizeBoolean(value: unknown, fallback = false): boolean {
  if (typeof value === 'boolean') return value;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return fallback;
}

export function sanitizeCampaignGoalsConfig(
  raw: any,
  fallback: CampaignGoalsConfig = DEFAULT_CAMPAIGN_GOALS_CONFIG,
): CampaignGoalsConfig {
  const posthogHost = sanitizeNullableString(raw?.posthogHost) ?? fallback.posthogHost;
  const posthogAppHost =
    sanitizeNullableString(raw?.posthogAppHost) ??
    inferPostHogAppHost(posthogHost) ??
    fallback.posthogAppHost;

  return {
    fallbackWhatsappLeadValue:
      sanitizeNullableNumber(raw?.fallbackWhatsappLeadValue) ?? fallback.fallbackWhatsappLeadValue,
    enablePurchaseGoal: sanitizeBoolean(raw?.enablePurchaseGoal, fallback.enablePurchaseGoal),
    enableWhatsappLeadGoal: sanitizeBoolean(raw?.enableWhatsappLeadGoal, fallback.enableWhatsappLeadGoal),
    googleAdsTagId: sanitizeNullableString(raw?.googleAdsTagId) ?? fallback.googleAdsTagId,
    googleAdsPurchaseLabel:
      sanitizeNullableString(raw?.googleAdsPurchaseLabel) ?? fallback.googleAdsPurchaseLabel,
    googleAdsWhatsappLeadLabel:
      sanitizeNullableString(raw?.googleAdsWhatsappLeadLabel) ?? fallback.googleAdsWhatsappLeadLabel,
    metaPixelId: sanitizeNullableString(raw?.metaPixelId) ?? fallback.metaPixelId,
    metaConversionsApiEnabled: sanitizeBoolean(
      raw?.metaConversionsApiEnabled,
      fallback.metaConversionsApiEnabled,
    ),
    posthogProjectId: sanitizeNullableString(raw?.posthogProjectId) ?? fallback.posthogProjectId,
    posthogHost,
    posthogAppHost,
    updatedAt: sanitizeNullableString(raw?.updatedAt),
    updatedBy: sanitizeNullableString(raw?.updatedBy),
  };
}

export async function getCampaignGoalsConfig(): Promise<CampaignGoalsConfig> {
  const stored = await kv.get(CAMPAIGN_GOALS_CONFIG_KEY).catch(() => null);
  return sanitizeCampaignGoalsConfig(stored || {});
}

export async function saveCampaignGoalsConfig(
  raw: any,
  updatedBy = 'admin',
): Promise<CampaignGoalsConfig> {
  const existing = await getCampaignGoalsConfig();
  const next = sanitizeCampaignGoalsConfig(raw, existing);
  const saved: CampaignGoalsConfig = {
    ...next,
    updatedAt: new Date().toISOString(),
    updatedBy,
  };
  await kv.set(CAMPAIGN_GOALS_CONFIG_KEY, saved);
  return saved;
}

export function getPublicCampaignGoalsConfig(config: CampaignGoalsConfig) {
  return {
    fallbackWhatsappLeadValue: config.fallbackWhatsappLeadValue,
    enablePurchaseGoal: config.enablePurchaseGoal,
    enableWhatsappLeadGoal: config.enableWhatsappLeadGoal,
    googleAdsTagId: config.googleAdsTagId,
    googleAdsPurchaseLabel: config.googleAdsPurchaseLabel,
    googleAdsWhatsappLeadLabel: config.googleAdsWhatsappLeadLabel,
    metaPixelId: config.metaPixelId,
    updatedAt: config.updatedAt,
  };
}

export function buildPostHogReplayUrl(
  config: CampaignGoalsConfig,
  sessionId?: string | null,
): string | null {
  const safeSessionId = String(sessionId || '').trim();
  if (!safeSessionId || !config.posthogProjectId || !config.posthogAppHost) return null;
  return `${config.posthogAppHost.replace(/\/+$/, '')}/project/${encodeURIComponent(config.posthogProjectId)}/replay/${encodeURIComponent(safeSessionId)}`;
}

function sanitizeTrackingField(value: unknown): string | undefined {
  const normalized = String(value || '').trim();
  return normalized || undefined;
}

export function extractAttributionSnapshot(raw: any): MarketingAttributionSnapshot {
  return {
    gclid: sanitizeTrackingField(raw?.gclid),
    gbraid: sanitizeTrackingField(raw?.gbraid),
    wbraid: sanitizeTrackingField(raw?.wbraid),
    fbclid: sanitizeTrackingField(raw?.fbclid),
    fbp: sanitizeTrackingField(raw?.fbp),
    fbc: sanitizeTrackingField(raw?.fbc),
    utm_source: sanitizeTrackingField(raw?.utm_source),
    utm_medium: sanitizeTrackingField(raw?.utm_medium),
    utm_campaign: sanitizeTrackingField(raw?.utm_campaign),
    utm_content: sanitizeTrackingField(raw?.utm_content),
    utm_term: sanitizeTrackingField(raw?.utm_term),
    user_agent: sanitizeTrackingField(raw?.user_agent),
    landing_page: sanitizeTrackingField(raw?.landing_page),
    referrer: sanitizeTrackingField(raw?.referrer),
    session_id: sanitizeTrackingField(raw?.session_id),
    anonymous_id: sanitizeTrackingField(raw?.anonymous_id),
    user_id: sanitizeTrackingField(raw?.user_id),
  };
}

export function toCurrencyNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Number(parsed.toFixed(2)) : null;
}

export function dateDaysAgo(daysAgo: number) {
  return new Date(Date.now() - (daysAgo * 86_400_000));
}

export function toIsoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}
