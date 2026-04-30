import posthog from 'posthog-js';
import { projectId, publicAnonKey } from '../../../utils/supabase/info';

const API = `https://${projectId}.supabase.co/functions/v1/make-server-1d6e33e0`;
const STORAGE_KEY = 'toyoparts_analytics_v2';
const SESSION_KEY = 'toyoparts_session_id';
const ANONYMOUS_KEY = 'toyoparts_anonymous_id';
const PURCHASE_GOAL_KEY = 'toyoparts_purchase_goal_v1';
const PAGEVIEW_DEDUP_MS = 800;
const WHATSAPP_LOCK_MS = 1200;
const DEFAULT_WHATSAPP_LEAD_FALLBACK_VALUE = 1;

const POSTHOG_ENABLED = Boolean(import.meta.env.VITE_PUBLIC_POSTHOG_PROJECT_TOKEN);
const GOOGLE_TAG_ID = import.meta.env.VITE_PUBLIC_GOOGLE_ADS_TAG_ID;
const GOOGLE_PURCHASE_LABEL = import.meta.env.VITE_PUBLIC_GOOGLE_ADS_PURCHASE_LABEL;
const GOOGLE_WHATSAPP_LEAD_LABEL = import.meta.env.VITE_PUBLIC_GOOGLE_ADS_WHATSAPP_LEAD_LABEL;
const META_PIXEL_ID = import.meta.env.VITE_PUBLIC_META_PIXEL_ID;

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: any[]) => void;
    fbq?: (...args: any[]) => void;
    _fbq?: (...args: any[]) => void;
    __toyoparts_google_loaded__?: boolean;
    __toyoparts_meta_loaded__?: boolean;
  }
}

export interface AnalyticsData {
  gclid?: string;
  gbraid?: string;
  wbraid?: string;
  fbclid?: string;
  fbc?: string;
  fbp?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
  user_agent?: string;
  session_id?: string;
  anonymous_id?: string;
  user_id?: string;
  landing_page?: string;
  referrer?: string;
}

export interface WhatsAppLeadTrackingContext {
  source_surface: string;
  page_type: string;
  page_path?: string;
  page_url?: string;
  banner_id?: string;
  linked_product_sku?: string;
  quantity?: number;
  productPrice?: number;
  linkedProductPrice?: number;
  cartTotal?: number;
  checkoutTotal?: number;
  href?: string;
  properties?: Record<string, unknown>;
}

interface PublicCampaignGoalsConfig {
  fallbackWhatsappLeadValue?: number | null;
  enablePurchaseGoal?: boolean;
  enableWhatsappLeadGoal?: boolean;
  googleAdsTagId?: string | null;
  googleAdsPurchaseLabel?: string | null;
  googleAdsWhatsappLeadLabel?: string | null;
  metaPixelId?: string | null;
}

type LeadValueSource =
  | 'checkout_total'
  | 'cart_total'
  | 'product_value'
  | 'linked_product_price'
  | 'fallback_config'
  | 'fallback_default';

const recentWhatsappClicks = new Map<string, number>();
let lastTrackedPageSignature = '';
let lastTrackedPageAt = 0;
let publicCampaignConfigPromise: Promise<PublicCampaignGoalsConfig | null> | null = null;
let publicCampaignConfigCache: PublicCampaignGoalsConfig | null = null;

function getCookie(name: string): string | undefined {
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) return parts.pop()?.split(';').shift();
}

function setCookie(name: string, value: string, days = 30) {
  const expiresAt = new Date();
  expiresAt.setTime(expiresAt.getTime() + (days * 24 * 60 * 60 * 1000));
  document.cookie = `${name}=${value};expires=${expiresAt.toUTCString()};path=/;SameSite=Lax`;
}

function normalizeUrlPath(url: string) {
  try {
    return new URL(url, window.location.origin).pathname;
  } catch {
    return url;
  }
}

function ensureSessionId() {
  let sessionId = sessionStorage.getItem(SESSION_KEY);
  if (!sessionId) {
    sessionId = crypto.randomUUID();
    sessionStorage.setItem(SESSION_KEY, sessionId);
  }
  return sessionId;
}

function ensureAnonymousId() {
  let anonymousId = localStorage.getItem(ANONYMOUS_KEY);
  if (!anonymousId) {
    anonymousId = crypto.randomUUID();
    localStorage.setItem(ANONYMOUS_KEY, anonymousId);
  }
  return anonymousId;
}

function readStoredAnalytics(): AnalyticsData {
  if (typeof window === 'undefined') return {};
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
  } catch {
    return {};
  }
}

function writeStoredAnalytics(next: AnalyticsData) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}

function readPurchaseGoalStore(): Record<string, string> {
  if (typeof window === 'undefined') return {};
  try {
    return JSON.parse(localStorage.getItem(PURCHASE_GOAL_KEY) || '{}');
  } catch {
    return {};
  }
}

function writePurchaseGoalStore(next: Record<string, string>) {
  localStorage.setItem(PURCHASE_GOAL_KEY, JSON.stringify(next));
}

function loadGoogleTag() {
  const tagId = GOOGLE_TAG_ID;
  if (typeof window === 'undefined' || !tagId || window.__toyoparts_google_loaded__) return;

  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(tagId)}`;
  document.head.appendChild(script);

  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function gtag(...args: any[]) {
    window.dataLayer?.push(args);
  };

  window.gtag('js', new Date());
  window.gtag('config', tagId, {
    send_page_view: false,
  });

  window.__toyoparts_google_loaded__ = true;
}

function loadMetaPixel() {
  if (typeof window === 'undefined' || !META_PIXEL_ID || window.__toyoparts_meta_loaded__) return;

  // Standard Meta pixel bootstrap.
  if (!window.fbq) {
    const fbq = function fbq(...args: any[]) {
      if ((fbq as any).callMethod) {
        (fbq as any).callMethod(...args);
      } else {
        (fbq as any).queue.push(args);
      }
    };
    (fbq as any).queue = [];
    (fbq as any).loaded = true;
    (fbq as any).version = '2.0';
    window.fbq = fbq;
    window._fbq = fbq;
  }

  const script = document.createElement('script');
  script.async = true;
  script.src = 'https://connect.facebook.net/en_US/fbevents.js';
  document.head.appendChild(script);

  window.fbq?.('init', META_PIXEL_ID);
  window.__toyoparts_meta_loaded__ = true;
}

function capturePostHogEvent(event: string, properties: Record<string, unknown>) {
  if (!POSTHOG_ENABLED) return;
  posthog.capture(event, properties);
}

function getGoogleSendTo(label?: string | null) {
  const tagId = GOOGLE_TAG_ID;
  if (!tagId || !label) return null;
  return `${tagId}/${label}`;
}

async function getPublicCampaignGoalsConfig(): Promise<PublicCampaignGoalsConfig | null> {
  if (publicCampaignConfigPromise) return publicCampaignConfigPromise;

  publicCampaignConfigPromise = fetch(`${API}/campaign-goals/public-config`, {
    headers: {
      Authorization: `Bearer ${publicAnonKey}`,
      apikey: publicAnonKey,
      'Content-Type': 'application/json',
    },
  })
    .then((response) => (response.ok ? response.json() : null))
    .then((config) => {
      publicCampaignConfigCache = config;
      return config;
    })
    .catch(() => {
      publicCampaignConfigCache = null;
      return null;
    });

  return publicCampaignConfigPromise;
}

function getAnalyticsHeaders(): HeadersInit {
  return {
    Authorization: `Bearer ${publicAnonKey}`,
    apikey: publicAnonKey,
    'Content-Type': 'application/json',
  };
}

function getAttributionSnapshot(): AnalyticsData {
  const data = readStoredAnalytics();
  return {
    ...data,
    session_id: data.session_id || ensureSessionId(),
    anonymous_id: data.anonymous_id || ensureAnonymousId(),
    user_agent: navigator.userAgent,
  };
}

function sendTrackingEvent(body: Record<string, unknown>) {
  fetch(`${API}/tracking/track`, {
    method: 'POST',
    headers: getAnalyticsHeaders(),
    body: JSON.stringify(body),
    keepalive: true,
  }).catch(() => undefined);
}

function buildBaseEvent(eventName: string, overrides: Record<string, unknown> = {}) {
  const attribution = getAttributionSnapshot();
  const pageUrl = String(overrides.page_url || window.location.href);
  const pagePath = String(overrides.page_path || normalizeUrlPath(pageUrl));

  return {
    event_name: eventName,
    event_id: String(overrides.event_id || crypto.randomUUID()),
    event_time: new Date().toISOString(),
    schema_version: '2.0',
    session_id: attribution.session_id,
    anonymous_id: attribution.anonymous_id,
    user_id: attribution.user_id,
    page_url: pageUrl,
    page_path: pagePath,
    page_title: document.title,
    referrer: document.referrer || attribution.referrer,
    attribution,
    consent: {
      ads: true,
      analytics: true,
      timestamp: new Date().toISOString(),
    },
    ...overrides,
  };
}

function resolveWhatsappLeadValue(
  context: WhatsAppLeadTrackingContext,
  fallbackValue: number | null | undefined,
): { value: number; source: LeadValueSource } | null {
  const checkoutTotal = Number(context.checkoutTotal || 0);
  if (checkoutTotal > 0) return { value: Number(checkoutTotal.toFixed(2)), source: 'checkout_total' };

  const cartTotal = Number(context.cartTotal || 0);
  if (cartTotal > 0) return { value: Number(cartTotal.toFixed(2)), source: 'cart_total' };

  const quantity = Math.max(1, Number(context.quantity || 1));
  const productPrice = Number(context.productPrice || 0);
  if (productPrice > 0) {
    return { value: Number((productPrice * quantity).toFixed(2)), source: 'product_value' };
  }

  const linkedProductPrice = Number(context.linkedProductPrice || 0);
  if (linkedProductPrice > 0) {
    return { value: Number(linkedProductPrice.toFixed(2)), source: 'linked_product_price' };
  }

  const fallback = Number(fallbackValue || 0);
  if (fallback > 0) return { value: Number(fallback.toFixed(2)), source: 'fallback_config' };

  return { value: DEFAULT_WHATSAPP_LEAD_FALLBACK_VALUE, source: 'fallback_default' };
}

export function initAnalytics() {
  if (typeof window === 'undefined') return;

  const urlParams = new URLSearchParams(window.location.search);
  const current = readStoredAnalytics();
  const landingPage = current.landing_page || `${window.location.pathname}${window.location.search}`;
  const data: AnalyticsData = {
    ...current,
    session_id: ensureSessionId(),
    anonymous_id: ensureAnonymousId(),
    user_agent: navigator.userAgent,
    landing_page: landingPage,
    referrer: current.referrer || document.referrer || undefined,
  };

  if (urlParams.has('gclid')) data.gclid = urlParams.get('gclid') || undefined;
  if (urlParams.has('gbraid')) data.gbraid = urlParams.get('gbraid') || undefined;
  if (urlParams.has('wbraid')) data.wbraid = urlParams.get('wbraid') || undefined;
  if (urlParams.has('fbclid')) {
    data.fbclid = urlParams.get('fbclid') || undefined;
    const fbc = `fb.1.${Date.now()}.${data.fbclid}`;
    setCookie('_fbc', fbc);
    data.fbc = fbc;
  }

  if (urlParams.has('utm_source')) data.utm_source = urlParams.get('utm_source') || undefined;
  if (urlParams.has('utm_medium')) data.utm_medium = urlParams.get('utm_medium') || undefined;
  if (urlParams.has('utm_campaign')) data.utm_campaign = urlParams.get('utm_campaign') || undefined;
  if (urlParams.has('utm_content')) data.utm_content = urlParams.get('utm_content') || undefined;
  if (urlParams.has('utm_term')) data.utm_term = urlParams.get('utm_term') || undefined;

  let fbp = getCookie('_fbp');
  if (!fbp) {
    fbp = `fb.1.${Date.now()}.${Math.floor(Math.random() * 1000000000)}`;
    setCookie('_fbp', fbp);
  }
  data.fbp = fbp;
  data.fbc = data.fbc || getCookie('_fbc');

  writeStoredAnalytics(data);

  if (POSTHOG_ENABLED) {
    posthog.register(data);
  }

  loadGoogleTag();
  loadMetaPixel();
  void getPublicCampaignGoalsConfig();
}

export function getAnalyticsData(): AnalyticsData {
  return getAttributionSnapshot();
}

export function identifyAnalyticsUser(
  userId: string,
  traits?: Record<string, unknown>,
) {
  const current = getAttributionSnapshot();
  const next = {
    ...current,
    user_id: userId,
  };
  writeStoredAnalytics(next);

  if (POSTHOG_ENABLED) {
    posthog.identify(userId, traits);
  }
}

export function resetAnalyticsUser() {
  const current = getAttributionSnapshot();
  const next = {
    ...current,
    user_id: undefined,
  };
  writeStoredAnalytics(next);

  if (POSTHOG_ENABLED) {
    posthog.reset();
    posthog.register(next);
  }
}

export function trackPageView(path?: string) {
  const currentPath = path || `${window.location.pathname}${window.location.search}`;
  const signature = `${currentPath}|${document.title}`;
  const now = Date.now();

  if (signature === lastTrackedPageSignature && now - lastTrackedPageAt < PAGEVIEW_DEDUP_MS) {
    return;
  }

  lastTrackedPageSignature = signature;
  lastTrackedPageAt = now;

  const event = buildBaseEvent('page_view', {
    page_url: `${window.location.origin}${currentPath}`,
    page_path: currentPath,
    properties: {
      title: document.title,
    },
  });

  sendTrackingEvent(event);
  window.gtag?.('event', 'page_view', {
    page_location: event.page_url,
    page_path: event.page_path,
    page_title: document.title,
  });
  window.fbq?.('track', 'PageView');
}

export function trackViewItem(item: { sku: string; name: string; price: number }) {
  const event = buildBaseEvent('view_item', {
    ecommerce: {
      currency: 'BRL',
      value: item.price,
      items: [{ item_id: item.sku, name: item.name, price: item.price, quantity: 1, brand: 'Toyota' }],
    },
    properties: {
      sku: item.sku,
      name: item.name,
      price: item.price,
    },
  });

  capturePostHogEvent('view_item', {
    sku: item.sku,
    name: item.name,
    price: item.price,
    currency: 'BRL',
    event_id: event.event_id,
  });

  sendTrackingEvent(event);
  window.fbq?.('track', 'ViewContent', {
    content_ids: [item.sku],
    content_type: 'product',
    value: item.price,
    currency: 'BRL',
  }, {
    eventID: event.event_id,
  });
  window.gtag?.('event', 'view_item', {
    currency: 'BRL',
    value: item.price,
    items: [{ item_id: item.sku, item_name: item.name, price: item.price, quantity: 1 }],
  });
}

export function trackAddToCart(item: { sku: string; name: string; price: number; qty: number }) {
  const value = item.price * item.qty;
  const event = buildBaseEvent('add_to_cart', {
    ecommerce: {
      currency: 'BRL',
      value,
      items: [{ item_id: item.sku, name: item.name, price: item.price, quantity: item.qty, brand: 'Toyota' }],
    },
    properties: {
      sku: item.sku,
      name: item.name,
      price: item.price,
      quantity: item.qty,
    },
  });

  capturePostHogEvent('add_to_cart', {
    sku: item.sku,
    name: item.name,
    price: item.price,
    quantity: item.qty,
    value,
    currency: 'BRL',
    event_id: event.event_id,
  });

  sendTrackingEvent(event);
  window.fbq?.('track', 'AddToCart', {
    content_ids: [item.sku],
    content_type: 'product',
    value,
    currency: 'BRL',
  }, {
    eventID: event.event_id,
  });
  window.gtag?.('event', 'add_to_cart', {
    currency: 'BRL',
    value,
    items: [{ item_id: item.sku, item_name: item.name, price: item.price, quantity: item.qty }],
  });
}

export function trackBeginCheckout(
  items: Array<{ sku?: string; name?: string; qty?: number; unitPrice?: number }>,
  value: number,
  transactionId?: string,
) {
  const normalizedItems = items
    .map((item) => ({
      item_id: String(item?.sku || '').trim(),
      name: item?.name,
      price: Number(item?.unitPrice || 0),
      quantity: Number(item?.qty || 1),
      brand: 'Toyota',
    }))
    .filter((item) => item.item_id);

  const event = buildBaseEvent('begin_checkout', {
    ecommerce: {
      currency: 'BRL',
      value,
      transaction_id: transactionId || `checkout-${getAttributionSnapshot().session_id}`,
      items: normalizedItems,
    },
    properties: {
      item_count: normalizedItems.length,
      item_skus: normalizedItems.map((item) => item.item_id),
    },
  });

  capturePostHogEvent('begin_checkout', {
    item_count: normalizedItems.length,
    item_skus: normalizedItems.map((item) => item.item_id),
    value,
    currency: 'BRL',
    event_id: event.event_id,
  });

  sendTrackingEvent(event);
  window.fbq?.('track', 'InitiateCheckout', {
    content_ids: normalizedItems.map((item) => item.item_id),
    content_type: 'product',
    value,
    currency: 'BRL',
    num_items: normalizedItems.length,
  }, {
    eventID: event.event_id,
  });
  window.gtag?.('event', 'begin_checkout', {
    currency: 'BRL',
    value,
    items: normalizedItems.map((item) => ({
      item_id: item.item_id,
      item_name: item.name,
      price: item.price,
      quantity: item.quantity,
    })),
  });
}

export function trackSearch(query: string) {
  const normalizedQuery = query.trim();
  if (!normalizedQuery) return;

  capturePostHogEvent('search', { query: normalizedQuery });
  sendTrackingEvent(buildBaseEvent('search_performed', {
    properties: {
      query: normalizedQuery,
    },
  }));
  window.fbq?.('track', 'Search', { search_string: normalizedQuery });
}

export async function trackWhatsappBannerLead(context: WhatsAppLeadTrackingContext) {
  const publicConfig = await getPublicCampaignGoalsConfig();
  if (publicConfig?.enableWhatsappLeadGoal === false) {
    return { tracked: false, reason: 'goal_disabled' as const };
  }

  const pagePath = context.page_path || `${window.location.pathname}${window.location.search}`;
  const lockKey = [
    context.source_surface,
    context.banner_id || 'no-banner',
    context.linked_product_sku || 'no-sku',
    pagePath,
  ].join('|');
  const now = Date.now();
  const recentClickAt = recentWhatsappClicks.get(lockKey) || 0;
  if (now - recentClickAt < WHATSAPP_LOCK_MS) {
    return { tracked: false, reason: 'deduped' as const };
  }

  const resolved = resolveWhatsappLeadValue(context, publicConfig?.fallbackWhatsappLeadValue);
  if (!resolved) {
    return { tracked: false, reason: 'missing_value' as const };
  }

  recentWhatsappClicks.set(lockKey, now);
  window.setTimeout(() => {
    if ((recentWhatsappClicks.get(lockKey) || 0) === now) {
      recentWhatsappClicks.delete(lockKey);
    }
  }, WHATSAPP_LOCK_MS + 50);

  const event = buildBaseEvent('whatsapp_banner_lead', {
    page_type: context.page_type,
    page_path: pagePath,
    page_url: context.page_url || `${window.location.origin}${pagePath}`,
    source_surface: context.source_surface,
    banner_id: context.banner_id,
    linked_product_sku: context.linked_product_sku,
    quantity: context.quantity || 1,
    resolved_value: resolved.value,
    resolved_value_source: resolved.source,
    campaign_goal: 'whatsapp_banner_lead',
    ecommerce: {
      currency: 'BRL',
      value: resolved.value,
      items: context.linked_product_sku
        ? [{
            item_id: context.linked_product_sku,
            quantity: Math.max(1, Number(context.quantity || 1)),
            price: context.productPrice || context.linkedProductPrice || resolved.value,
            brand: 'Toyota',
          }]
        : [],
    },
    properties: {
      href: context.href,
      product_price: context.productPrice,
      linked_product_price: context.linkedProductPrice,
      cart_total: context.cartTotal,
      checkout_total: context.checkoutTotal,
      ...context.properties,
    },
  });

  capturePostHogEvent('whatsapp_banner_lead', {
    event_id: event.event_id,
    source_surface: context.source_surface,
    banner_id: context.banner_id,
    page_type: context.page_type,
    linked_product_sku: context.linked_product_sku,
    resolved_value: resolved.value,
    resolved_value_source: resolved.source,
    currency: 'BRL',
  });

  sendTrackingEvent(event);

  const sendToLead = getGoogleSendTo(GOOGLE_WHATSAPP_LEAD_LABEL || publicConfig?.googleAdsWhatsappLeadLabel || undefined);
  if (sendToLead) {
    window.gtag?.('event', 'conversion', {
      send_to: sendToLead,
      value: resolved.value,
      currency: 'BRL',
      transaction_id: event.event_id,
    });
  }

  window.gtag?.('event', 'whatsapp_banner_lead', {
    value: resolved.value,
    currency: 'BRL',
    event_id: event.event_id,
    source_surface: context.source_surface,
  });

  window.fbq?.('track', 'Lead', {
    value: resolved.value,
    currency: 'BRL',
    lead_channel: 'whatsapp_banner',
    source_surface: context.source_surface,
  }, {
    eventID: event.event_id,
  });

  return {
    tracked: true,
    eventId: event.event_id,
    resolvedValue: resolved.value,
    resolvedValueSource: resolved.source,
  };
}

export function getGooglePurchaseGoalConfig() {
  return {
    tagId: GOOGLE_TAG_ID,
    sendTo: getGoogleSendTo(GOOGLE_PURCHASE_LABEL || publicCampaignConfigCache?.googleAdsPurchaseLabel || undefined),
  };
}

export function trackPurchaseGoal(transactionId: string, value: number, currency = 'BRL') {
  const safeTransactionId = String(transactionId || '').trim();
  if (!safeTransactionId) return false;

  const store = readPurchaseGoalStore();
  if (store[safeTransactionId]) return false;

  const sendTo = getGoogleSendTo(GOOGLE_PURCHASE_LABEL || publicCampaignConfigCache?.googleAdsPurchaseLabel || undefined);
  if (sendTo) {
    window.gtag?.('event', 'conversion', {
      send_to: sendTo,
      value,
      currency,
      transaction_id: safeTransactionId,
    });
  }

  window.gtag?.('event', 'purchase_paid', {
    value,
    currency,
    transaction_id: safeTransactionId,
  });

  writePurchaseGoalStore({
    ...store,
    [safeTransactionId]: new Date().toISOString(),
  });

  return true;
}
