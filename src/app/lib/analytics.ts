
import { v4 as uuidv4 } from 'uuid';

const STORAGE_KEY = 'toyoparts_analytics_v1';
const SESSION_KEY = 'toyoparts_session_id';

interface AnalyticsData {
  gclid?: string;
  fbclid?: string;
  fbc?: string;
  fbp?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  user_agent?: string;
  session_id?: string;
}

// ─── Cookie Helpers ──────────────────────────────────────────────────────────
function getCookie(name: string): string | undefined {
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) return parts.pop()?.split(';').shift();
}

function setCookie(name: string, value: string, days = 30) {
  const d = new Date();
  d.setTime(d.getTime() + (days * 24 * 60 * 60 * 1000));
  const expires = "expires=" + d.toUTCString();
  document.cookie = name + "=" + value + ";" + expires + ";path=/";
}

// ─── Initialize Tracking ─────────────────────────────────────────────────────
export function initAnalytics() {
  if (typeof window === 'undefined') return;

  const urlParams = new URLSearchParams(window.location.search);
  const data: AnalyticsData = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');

  // Capture URL Params
  if (urlParams.has('gclid')) data.gclid = urlParams.get('gclid')!;
  if (urlParams.has('fbclid')) {
     data.fbclid = urlParams.get('fbclid')!;
     // _fbc is "fb.1.{timestamp}.{fbclid}"
     const fbc = `fb.1.${Date.now()}.${data.fbclid}`;
     setCookie('_fbc', fbc);
     data.fbc = fbc;
  }
  
  if (urlParams.has('utm_source')) data.utm_source = urlParams.get('utm_source')!;
  if (urlParams.has('utm_medium')) data.utm_medium = urlParams.get('utm_medium')!;
  if (urlParams.has('utm_campaign')) data.utm_campaign = urlParams.get('utm_campaign')!;

  // Capture FBP (Facebook Browser ID) - normally set by FB Pixel, but we ensure it exists
  let fbp = getCookie('_fbp');
  if (!fbp) {
    // Generate simple FBP if missing: fb.1.{timestamp}.{random}
    fbp = `fb.1.${Date.now()}.${Math.floor(Math.random() * 1000000000)}`;
    setCookie('_fbp', fbp);
  }
  data.fbp = fbp;

  // Session ID
  let sessionId = sessionStorage.getItem(SESSION_KEY);
  if (!sessionId) {
    sessionId = uuidv4();
    sessionStorage.setItem(SESSION_KEY, sessionId);
  }
  data.session_id = sessionId;
  data.user_agent = navigator.userAgent;

  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export function getAnalyticsData(): AnalyticsData {
  if (typeof window === 'undefined') return {};
  return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
}

// ─── Event Tracking ──────────────────────────────────────────────────────────

export function trackViewItem(item: { sku: string; name: string; price: number }) {
  // GTM / Meta Pixel Push
  // @ts-ignore
  if (window.fbq) window.fbq('track', 'ViewContent', { 
    content_ids: [item.sku], 
    content_type: 'product',
    value: item.price,
    currency: 'BRL'
  });
  
  // @ts-ignore
  if (window.gtag) window.gtag('event', 'view_item', {
    items: [{ id: item.sku, name: item.name, price: item.price }]
  });
}

export function trackAddToCart(item: { sku: string; name: string; price: number; qty: number }) {
  // @ts-ignore
  if (window.fbq) window.fbq('track', 'AddToCart', { 
    content_ids: [item.sku], 
    content_type: 'product',
    value: item.price * item.qty,
    currency: 'BRL'
  });

  // @ts-ignore
  if (window.gtag) window.gtag('event', 'add_to_cart', {
    items: [{ id: item.sku, name: item.name, price: item.price, quantity: item.qty }]
  });
}

export function trackBeginCheckout(items: any[], value: number) {
  // @ts-ignore
  if (window.fbq) window.fbq('track', 'InitiateCheckout', { 
    content_ids: items.map(i => i.sku), 
    content_type: 'product',
    value: value,
    currency: 'BRL',
    num_items: items.length
  });
}

export function trackSearch(query: string) {
    // @ts-ignore
    if (window.fbq) window.fbq('track', 'Search', { search_string: query });
}
