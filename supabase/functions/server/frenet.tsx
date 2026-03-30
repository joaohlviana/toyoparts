// ─── Frenet Shipping Integration (Proxy) ─────────────────────────────────────
// Proxy seguro para a API Frenet — nenhum segredo vaza para o frontend.
// Rotas: /frenet/cep/:cep | /frenet/quote | /frenet/config (GET/POST)

import { Hono } from 'npm:hono';
import * as kv from './kv_store.tsx';
import { evaluateFreeShippingRules, type PaymentMethodIntent } from './free-shipping.tsx';

const frenet = new Hono();

// ─── Secrets ─────────────────────────────────────────────────────────────────
const FRENET_TOKEN = () => (Deno.env.get('FRENET_TOKEN') || '').trim();
const FRENET_PASS  = () => (Deno.env.get('FRENET_PASS') || '').trim();

const FRENET_BASE = 'https://api.frenet.com.br';
const CONFIG_KEY = 'meta:frenet_config';

// ─── In-memory caches ───────────────────────────────────────────────────────
const cepCache = new Map<string, { data: any; ts: number }>();
const CEP_TTL = 24 * 60 * 60 * 1000; // 24h

const quoteCache = new Map<string, { data: any; ts: number }>();
const QUOTE_TTL = 90_000; // 90s
const ufCache = new Map<string, { uf: string | null; ts: number }>();
const UF_TTL = 24 * 60 * 60 * 1000;

// Simple rate-limit (in-memory, per-IP)
const rateLimits = new Map<string, { count: number; resetAt: number }>();
function checkRate(ip: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const entry = rateLimits.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimits.set(ip, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (entry.count >= limit) return false;
  entry.count++;
  return true;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function normalizeCep(raw: string): string | null {
  const digits = raw.replace(/\D/g, '');
  return /^\d{8}$/.test(digits) ? digits : null;
}

function hashPayload(obj: any): string {
  return JSON.stringify(obj);
}

async function frenetFetch(url: string, opts: RequestInit & { timeoutMs?: number } = {}): Promise<Response> {
  const { timeoutMs = 8000, ...fetchOpts } = opts;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...fetchOpts, signal: ctrl.signal });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

async function resolveUf(recipientUf: string | null | undefined, recipientCep: string): Promise<string | null> {
  const normalizedUf = String(recipientUf || '').toUpperCase();
  if (/^[A-Z]{2}$/.test(normalizedUf)) return normalizedUf;

  const cached = ufCache.get(recipientCep);
  if (cached && Date.now() - cached.ts < UF_TTL) return cached.uf;

  try {
    const res = await fetch(`https://viacep.com.br/ws/${recipientCep}/json/`);
    if (!res.ok) return null;
    const data = await res.json();
    const uf = /^[A-Z]{2}$/.test(String(data?.uf || '').toUpperCase()) ? String(data.uf).toUpperCase() : null;
    ufCache.set(recipientCep, { uf, ts: Date.now() });
    return uf;
  } catch {
    return null;
  }
}

// ─── Default config ─────────────────────────────────────────────────────────
interface FrenetConfig {
  sellerCep: string;
  defaultWeight: number;
  defaultHeight: number;
  defaultLength: number;
  defaultWidth: number;
  freeShippingThreshold: number;
  freeShippingEnabled: boolean;
  additionalDays: number;
  enabled: boolean;
}

const DEFAULT_CONFIG: FrenetConfig = {
  sellerCep: '86026010',
  defaultWeight: 0.5,
  defaultHeight: 5,
  defaultLength: 20,
  defaultWidth: 15,
  freeShippingThreshold: 299,
  freeShippingEnabled: true,
  additionalDays: 0,
  enabled: true,
};

async function getConfig(): Promise<FrenetConfig> {
  try {
    const stored = await kv.get(CONFIG_KEY);
    if (stored) {
      const parsed = typeof stored === 'string' ? JSON.parse(stored) : stored;
      return { ...DEFAULT_CONFIG, ...parsed };
    }
  } catch (e) {
    console.error('[FRENET] Config read error:', e);
  }
  return DEFAULT_CONFIG;
}

// ═══════════════════════════════════════════════════════════════════════════════
// ─── CEP → Address ──────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════

frenet.get('/cep/:cep', async (c) => {
  const ip = c.req.header('x-forwarded-for') || 'unknown';
  if (!checkRate(`cep:${ip}`, 60, 60_000)) {
    return c.json({ error: { code: 'RATE_LIMIT', message: 'Muitas requisicoes. Tente novamente em 1 minuto.' } }, 429);
  }

  const rawCep = c.req.param('cep');
  const cep = normalizeCep(rawCep);
  if (!cep) {
    return c.json({ error: { code: 'INVALID_CEP', message: 'CEP deve conter exatamente 8 digitos.' } }, 400);
  }

  // Check cache
  const cached = cepCache.get(cep);
  if (cached && Date.now() - cached.ts < CEP_TTL) {
    c.header('x-cache', 'HIT');
    return c.json(cached.data);
  }

  const token = FRENET_TOKEN();
  if (!token) {
    return c.json({ error: { code: 'CONFIG_ERROR', message: 'FRENET_TOKEN nao configurado no servidor.' } }, 500);
  }

  try {
    const url = `${FRENET_BASE}/CEP/Address/${cep}`;
    console.log(`[FRENET] CEP lookup: ${cep}`);

    const res = await frenetFetch(url, {
      method: 'GET',
      timeoutMs: 5000,
      headers: {
        'Accept': 'application/json',
        'token': token,
      },
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.error(`[FRENET] CEP ${cep} HTTP ${res.status}: ${text}`);
      if (res.status === 404) {
        return c.json({ error: { code: 'CEP_NOT_FOUND', message: 'CEP nao encontrado.' } }, 404);
      }
      return c.json({ error: { code: 'FRENET_ERROR', message: `Frenet retornou ${res.status}` } }, 502);
    }

    const raw = await res.json();

    // Normalize
    const result = {
      cep,
      address: {
        street: raw.Street || raw.street || '',
        number: '',
        complement: '',
        district: raw.District || raw.district || '',
        city: raw.City || raw.city || '',
        state: raw.State || raw.state || '',
      },
      raw,
    };

    // Cache
    cepCache.set(cep, { data: result, ts: Date.now() });
    c.header('x-cache', 'MISS');
    return c.json(result);
  } catch (e: any) {
    if (e.name === 'AbortError') {
      console.error(`[FRENET] CEP ${cep} timeout`);
      return c.json({ error: { code: 'FRENET_TIMEOUT', message: 'Timeout na consulta de CEP.' } }, 504);
    }
    console.error(`[FRENET] CEP ${cep} error:`, e.message);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: e.message } }, 500);
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// ─── Shipping Quote ─────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════

frenet.post('/quote', async (c) => {
  const ip = c.req.header('x-forwarded-for') || 'unknown';
  if (!checkRate(`quote:${ip}`, 30, 60_000)) {
    return c.json({ error: { code: 'RATE_LIMIT', message: 'Muitas requisicoes de frete.' } }, 429);
  }

  const token = FRENET_TOKEN();
  if (!token) {
    return c.json({ error: { code: 'CONFIG_ERROR', message: 'FRENET_TOKEN nao configurado.' } }, 500);
  }

  let body: any;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: { code: 'INVALID_JSON', message: 'Body JSON invalido.' } }, 400);
  }

  // Load config for defaults
  const config = await getConfig();

  const sellerCep = normalizeCep(body.sellerCep || config.sellerCep);
  const recipientCep = normalizeCep(body.recipientCep || '');

  if (!sellerCep) {
    return c.json({ error: { code: 'INVALID_SELLER_CEP', message: 'CEP do vendedor invalido.' } }, 400);
  }
  if (!recipientCep) {
    return c.json({ error: { code: 'INVALID_RECIPIENT_CEP', message: 'CEP do destinatario invalido.' } }, 400);
  }

  const invoiceValue = Number(body.invoiceValue);
  if (isNaN(invoiceValue) || invoiceValue < 0) {
    return c.json({ error: { code: 'INVALID_VALUE', message: 'invoiceValue deve ser >= 0.' } }, 400);
  }

  const items = body.items;
  if (!Array.isArray(items) || items.length === 0) {
    return c.json({ error: { code: 'INVALID_ITEMS', message: 'items deve ser um array nao-vazio.' } }, 400);
  }

  // Build Frenet ShippingItemArray
  const shippingItems = items.map((item: any, i: number) => {
    const qty = Math.max(1, Number(item.quantity) || 1);
    const weight = Number(item.weight) || config.defaultWeight;
    const height = Number(item.height) || config.defaultHeight;
    const length = Number(item.length) || config.defaultLength;
    const width = Number(item.width) || config.defaultWidth;
    return {
      Height: height,
      Length: length,
      Quantity: qty,
      Weight: weight,
      Width: width,
      SKU: item.sku || `item-${i}`,
      Category: item.category || 'Pecas Automotivas',
    };
  });

  // Check quote cache
  const paymentMethodIntent = ['pix', 'credit_card', 'boleto'].includes(String(body.paymentMethodIntent))
    ? String(body.paymentMethodIntent) as PaymentMethodIntent
    : null;

  const cacheKey = hashPayload({
    sellerCep,
    recipientCep,
    recipientUf: body.recipientUf || '',
    paymentMethodIntent: paymentMethodIntent || '',
    invoiceValue,
    shippingItems,
  });
  const cachedQuote = quoteCache.get(cacheKey);
  if (cachedQuote && Date.now() - cachedQuote.ts < QUOTE_TTL) {
    c.header('x-cache', 'HIT');
    return c.json(cachedQuote.data);
  }

  const frenetBody = {
    SellerCEP: sellerCep,
    RecipientCEP: recipientCep,
    ShipmentInvoiceValue: invoiceValue,
    ShippingServiceCode: null,
    ShippingItemArray: shippingItems,
    RecipientCountry: 'BR',
  };

  try {
    console.log(`[FRENET] Quote: ${sellerCep} -> ${recipientCep}, R$ ${invoiceValue}, ${shippingItems.length} items`);

    const res = await frenetFetch(`${FRENET_BASE}/shipping/quote`, {
      method: 'POST',
      timeoutMs: 12000,
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'token': token,
      },
      body: JSON.stringify(frenetBody),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.error(`[FRENET] Quote HTTP ${res.status}: ${text}`);
      return c.json({ error: { code: 'FRENET_ERROR', message: `Frenet retornou ${res.status}` } }, 502);
    }

    const raw = await res.json();
    const services = raw.ShippingSevicesArray || raw.ShippingServicesArray || [];

    // Normalize services
    const quotes = services.map((svc: any) => ({
      serviceCode: svc.ServiceCode || '',
      serviceDescription: svc.ServiceDescription || svc.Carrier || '',
      carrier: svc.Carrier || '',
      carrierCode: svc.CarrierCode || '',
      price: parseFloat(svc.ShippingPrice) || 0,
      originalPrice: parseFloat(svc.OriginalShippingPrice || svc.ShippingPrice) || 0,
      deliveryDays: (parseInt(svc.DeliveryTime) || 0) + config.additionalDays,
      error: svc.Error === true || svc.Error === 'true',
      message: svc.Msg || svc.ErrorMessage || null,
    }));

    const resolvedUf = await resolveUf(body.recipientUf, recipientCep);
    const evaluation = await evaluateFreeShippingRules({
      subtotal: invoiceValue,
      recipientCep,
      recipientUf: resolvedUf,
      paymentMethodIntent,
      evaluationMode: paymentMethodIntent ? 'final' : 'potential',
      items: items.map((item: any, index: number) => ({
        sku: item.sku || `item-${index}`,
        quantity: Math.max(1, Number(item.quantity) || 1),
        price: Number(invoiceValue) || 0,
        name: item.name || item.productName || item.title || item.sku || `Item ${index + 1}`,
      })),
      services: quotes.map((q: any) => ({
        serviceCode: q.serviceCode,
        serviceDescription: q.serviceDescription,
        carrier: q.carrier,
        carrierCode: q.carrierCode,
        price: q.price,
        originalPrice: q.originalPrice,
        deliveryDays: q.deliveryDays,
        error: q.error,
        message: q.message,
      })),
    });

    if (Array.isArray(evaluation.eligibleFreeShippingServiceIds) && evaluation.eligibleFreeShippingServiceIds.length > 0) {
      const freeServiceIds = new Set(evaluation.eligibleFreeShippingServiceIds);
      for (const q of quotes) {
        const serviceId = q.serviceCode || q.serviceDescription;
        if (!q.error && freeServiceIds.has(serviceId)) {
          q.originalPrice = q.price;
          q.price = 0;
          q.freeShipping = true;
        }
      }
    }

    // Sort: OK services by price asc, errors at end
    quotes.sort((a: any, b: any) => {
      if (a.error && !b.error) return 1;
      if (!a.error && b.error) return -1;
      return a.price - b.price;
    });

    const result = {
      quotes: quotes.filter((q: any) => !q.error),
      errors: quotes.filter((q: any) => q.error),
      timeout: raw.Timeout || 0,
      config: {
        freeShippingThreshold: config.freeShippingThreshold,
        freeShippingEnabled: config.freeShippingEnabled,
      },
      evaluationMode: evaluation.evaluationMode,
      appliedRule: evaluation.appliedRule ?? null,
      potentialRules: evaluation.potentialRules ?? [],
      whatsappOffer: evaluation.whatsappOffer ?? null,
      eligibleFreeShippingServiceIds: evaluation.eligibleFreeShippingServiceIds ?? [],
      legacyApplied: evaluation.legacyApplied === true,
    };

    // Cache
    quoteCache.set(cacheKey, { data: result, ts: Date.now() });
    c.header('x-cache', 'MISS');
    console.log(`[FRENET] Quote result: ${result.quotes.length} ok, ${result.errors.length} errors`);
    return c.json(result);
  } catch (e: any) {
    if (e.name === 'AbortError') {
      console.error('[FRENET] Quote timeout');
      return c.json({ error: { code: 'FRENET_TIMEOUT', message: 'Timeout na cotacao de frete (12s).' } }, 504);
    }
    console.error('[FRENET] Quote error:', e.message);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: e.message } }, 500);
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// ─── Config (Admin) ─────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════

frenet.get('/config', async (c) => {
  try {
    const config = await getConfig();
    const token = FRENET_TOKEN();
    return c.json({
      config,
      status: {
        tokenConfigured: !!token,
        passConfigured: !!FRENET_PASS(),
      },
    });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

frenet.post('/config', async (c) => {
  try {
    const body = await c.req.json();
    const current = await getConfig();
    const updated = { ...current, ...body.config };
    await kv.set(CONFIG_KEY, JSON.stringify(updated));
    console.log('[FRENET] Config updated:', JSON.stringify(updated));
    return c.json({ success: true, config: updated });
  } catch (e: any) {
    console.error('[FRENET] Config save error:', e);
    return c.json({ error: e.message }, 500);
  }
});

// Health check / test connection
frenet.get('/health', async (c) => {
  const token = FRENET_TOKEN();
  if (!token) {
    return c.json({ ok: false, error: 'FRENET_TOKEN not set' });
  }

  try {
    // Test with a known CEP
    const res = await frenetFetch(`${FRENET_BASE}/CEP/Address/01001000`, {
      method: 'GET',
      timeoutMs: 5000,
      headers: { 'Accept': 'application/json', 'token': token },
    });

    return c.json({
      ok: res.ok,
      status: res.status,
      tokenConfigured: true,
      passConfigured: !!FRENET_PASS(),
    });
  } catch (e: any) {
    return c.json({ ok: false, error: e.message });
  }
});

export { frenet };
