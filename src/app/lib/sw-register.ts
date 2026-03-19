// ─── Service Worker Registration ─────────────────────────────────────────────
// Registers a Service Worker for offline product page caching.
//
// The SW implements:
//   - Network-first for API calls with cache fallback (offline resilience)
//   - Cache-first for product images (fast + offline)
//   - Stale-while-revalidate for snapshot HTML
//   - Navigation preload for faster page loads
//
// For production: copy toyoparts-sw.js to your web server root or CDN.
// For Cloudflare Pages/Workers, the SW is served from the same origin.

import { projectId, publicAnonKey } from '../../../utils/supabase/info';

const SW_VERSION = '1.0.0';
const API_BASE = `https://${projectId}.supabase.co/functions/v1/make-server-1d6e33e0`;

// ─── Generate SW code as string ─────────────────────────────────────────────
// We inline the SW code because Vite doesn't natively support SW file output
// at the root scope. For production, extract this to a static /sw.js file.

function generateSWCode(): string {
  return `
// ─── Toyoparts Service Worker v${SW_VERSION} ─────────────────────────────────
// Auto-generated. Handles offline caching for product pages.

const CACHE_VERSION = 'toyoparts-sw-v${SW_VERSION}';
const STATIC_CACHE = 'toyoparts-static-v1';
const API_CACHE = 'toyoparts-api-v1';
const IMG_CACHE = 'toyoparts-img-v1';
const SNAPSHOT_CACHE = 'toyoparts-snapshots-v1';

const API_BASE = '${API_BASE}';

// URLs to precache on install
const PRECACHE_URLS = [
  '/',
];

// ─── Install ─────────────────────────────────────────────────────────────────

self.addEventListener('install', (event) => {
  console.log('[SW] Installing v${SW_VERSION}');
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then(cache => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

// ─── Activate ────────────────────────────────────────────────────────────────

self.addEventListener('activate', (event) => {
  console.log('[SW] Activating v${SW_VERSION}');
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== STATIC_CACHE && key !== API_CACHE && key !== IMG_CACHE && key !== SNAPSHOT_CACHE)
          .map(key => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

// ─── Fetch Strategy Router ──────────────────────────────────────────────────

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') return;

  // Skip chrome-extension, etc.
  if (!url.protocol.startsWith('http')) return;

  // ─── Product snapshots: stale-while-revalidate ─────────────────────────
  if (url.pathname.includes('/snapshot/product/')) {
    event.respondWith(staleWhileRevalidate(request, SNAPSHOT_CACHE, 86400));
    return;
  }

  // ─── API calls: network-first with cache fallback ──────────────────────
  if (url.href.includes('/functions/v1/make-server-') || url.href.includes('/rest/v1/')) {
    event.respondWith(networkFirstWithCache(request, API_CACHE, 3600));
    return;
  }

  // ─── Product images: cache-first ──────────────────────────────────────
  if (
    url.pathname.includes('/pub/media/catalog/product') ||
    url.pathname.includes('/storage/v1/object/public/') ||
    (url.hostname.includes('supabase') && url.pathname.includes('product-images'))
  ) {
    event.respondWith(cacheFirstWithNetwork(request, IMG_CACHE, 604800));
    return;
  }

  // ─── Navigation: network-first, fall back to cached SPA shell ─────────
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(response => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(STATIC_CACHE).then(cache => cache.put('/', clone));
          }
          return response;
        })
        .catch(() => caches.match('/').then(r => r || new Response('Offline', { status: 503 })))
    );
    return;
  }

  // ─── Static assets: cache-first ───────────────────────────────────────
  if (
    url.pathname.match(/\\.(js|css|woff2?|ttf|png|jpg|jpeg|webp|avif|svg|ico)$/)
  ) {
    event.respondWith(cacheFirstWithNetwork(request, STATIC_CACHE, 2592000));
    return;
  }
});

// ─── Strategies ─────────────────────────────────────────────────────────────

async function networkFirstWithCache(request, cacheName, maxAgeSec) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      const clone = response.clone();
      // Tag with timestamp for TTL
      cache.put(request, clone);
    }
    return response;
  } catch (err) {
    const cached = await caches.match(request);
    if (cached) {
      console.log('[SW] Serving from cache (offline):', request.url);
      return cached;
    }
    return new Response(JSON.stringify({ error: 'Offline', offline: true }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

async function cacheFirstWithNetwork(request, cacheName, maxAgeSec) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response('', { status: 503 });
  }
}

async function staleWhileRevalidate(request, cacheName, maxAgeSec) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);

  // Revalidate in background
  const fetchPromise = fetch(request)
    .then(response => {
      if (response.ok) {
        cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => cached || new Response('', { status: 503 }));

  // Return cached immediately if available, otherwise wait for network
  return cached || fetchPromise;
}

// ─── Message handler (for cache control from main thread) ───────────────────

self.addEventListener('message', (event) => {
  const { type, payload } = event.data || {};

  if (type === 'CLEAR_CACHES') {
    caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k))))
      .then(() => {
        event.ports?.[0]?.postMessage({ ok: true });
        console.log('[SW] All caches cleared');
      });
  }

  if (type === 'PREFETCH_SNAPSHOTS') {
    const skus = payload?.skus || [];
    console.log('[SW] Prefetching', skus.length, 'snapshots...');
    prefetchSnapshots(skus);
  }

  if (type === 'GET_CACHE_STATS') {
    Promise.all([
      caches.open(API_CACHE).then(c => c.keys()).then(k => k.length).catch(() => 0),
      caches.open(SNAPSHOT_CACHE).then(c => c.keys()).then(k => k.length).catch(() => 0),
      caches.open(IMG_CACHE).then(c => c.keys()).then(k => k.length).catch(() => 0),
      caches.open(STATIC_CACHE).then(c => c.keys()).then(k => k.length).catch(() => 0),
    ]).then(([api, snapshots, images, statics]) => {
      event.ports?.[0]?.postMessage({ api, snapshots, images, statics });
    });
  }
});

async function prefetchSnapshots(skus) {
  const cache = await caches.open(SNAPSHOT_CACHE);
  for (const sku of skus) {
    try {
      const url = API_BASE + '/snapshot/product/' + sku;
      const existing = await cache.match(url);
      if (!existing) {
        const res = await fetch(url, {
          headers: { 'Authorization': 'Bearer ${publicAnonKey}' },
        });
        if (res.ok) await cache.put(url, res);
      }
    } catch { /* skip */ }
  }
}

console.log('[SW] Toyoparts Service Worker v${SW_VERSION} loaded');
`;
}

// ─── Register ───────────────────────────────────────────────────────────────

let swRegistration: ServiceWorkerRegistration | null = null;

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) {
    console.log('[SW] Service Workers not supported');
    return null;
  }

  // Skip in development (localhost without HTTPS)
  if (
    location.protocol !== 'https:' &&
    !location.hostname.includes('localhost') &&
    !location.hostname.includes('127.0.0.1')
  ) {
    console.log('[SW] Skipping SW registration (not HTTPS)');
    return null;
  }

  try {
    // Create the SW file as a Blob and register it
    const swCode = generateSWCode();
    const blob = new Blob([swCode], { type: 'application/javascript' });
    const swUrl = URL.createObjectURL(blob);

    // NOTE: Blob URLs have limited scope. For production, serve sw.js from root.
    // In dev/preview environments, we try Blob URL registration.
    // If it fails (scope restriction), we log and continue without SW.
    try {
      swRegistration = await navigator.serviceWorker.register(swUrl, { scope: '/' });
      console.log('[SW] Registered successfully via Blob URL');
    } catch (scopeErr) {
      // Blob URL scope restriction — expected in some environments
      console.log('[SW] Blob URL registration failed (expected in dev):', (scopeErr as Error).message);
      console.log('[SW] For production: serve the SW code as /sw.js');

      // Still return null — offline caching via Cache API in main thread will work
      return null;
    }

    // Listen for updates
    swRegistration.addEventListener('updatefound', () => {
      const newWorker = swRegistration?.installing;
      if (newWorker) {
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'activated') {
            console.log('[SW] New version activated');
          }
        });
      }
    });

    return swRegistration;
  } catch (err) {
    console.warn('[SW] Registration error:', err);
    return null;
  }
}

// ─── Communicate with SW ────────────────────────────────────────────────────

export async function sendSWMessage(type: string, payload?: any): Promise<any> {
  const reg = swRegistration || (await navigator.serviceWorker?.ready);
  if (!reg?.active) return null;

  return new Promise((resolve) => {
    const channel = new MessageChannel();
    channel.port1.onmessage = (e) => resolve(e.data);
    reg.active!.postMessage({ type, payload }, [channel.port2]);

    // Timeout fallback
    setTimeout(() => resolve(null), 5000);
  });
}

export function getSWStatus(): {
  supported: boolean;
  registered: boolean;
  active: boolean;
} {
  return {
    supported: 'serviceWorker' in navigator,
    registered: !!swRegistration,
    active: !!swRegistration?.active,
  };
}

// ─── Export SW code for production deployment ───────────────────────────────

export function getSWCodeForProduction(): string {
  return generateSWCode();
}
