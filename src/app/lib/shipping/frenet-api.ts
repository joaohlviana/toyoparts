// ─── Frenet API Client (Frontend → Server Proxy) ────────────────────────────
// NEVER calls api.frenet.com.br directly — always goes through our Edge Function.

import { projectId, publicAnonKey } from '../../../../utils/supabase/info';
import type {
  FrenetCepResponse,
  FrenetQuoteRequest,
  FrenetQuoteResponse,
  FrenetConfig,
  ShippingInput,
  ShippingQuote,
  ShippingCalculator,
} from './shipping-types';

const API = `https://${projectId}.supabase.co/functions/v1/make-server-1d6e33e0/frenet`;
const HEADERS: HeadersInit = {
  Authorization: `Bearer ${publicAnonKey}`,
  apikey: publicAnonKey,
  'Content-Type': 'application/json',
};

// ─── Client-side Cache ──────────────────────────────────────────────────────

const CEP_CACHE_TTL = 24 * 60 * 60 * 1000; // 24h
const QUOTE_CACHE_TTL = 60_000; // 60s

function getCachedCep(cep: string): FrenetCepResponse | null {
  try {
    const key = `frenet_cep:${cep}`;
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const { data, ts } = JSON.parse(raw);
    if (Date.now() - ts > CEP_CACHE_TTL) {
      localStorage.removeItem(key);
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

function setCachedCep(cep: string, data: FrenetCepResponse) {
  try {
    localStorage.setItem(`frenet_cep:${cep}`, JSON.stringify({ data, ts: Date.now() }));
  } catch { /* quota */ }
}

const quoteMemCache = new Map<string, { data: FrenetQuoteResponse; ts: number }>();

// ─── CEP Lookup ─────────────────────────────────────────────────────────────

export async function fetchCepAddress(
  cep: string,
  signal?: AbortSignal,
): Promise<FrenetCepResponse> {
  const clean = cep.replace(/\D/g, '');
  if (clean.length !== 8) {
    throw new FrenetError('INVALID_CEP', 'CEP deve conter 8 digitos.');
  }

  // Check client cache
  const cached = getCachedCep(clean);
  if (cached) return cached;

  const res = await fetch(`${API}/cep/${clean}`, {
    headers: HEADERS,
    signal,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: { code: 'UNKNOWN', message: `HTTP ${res.status}` } }));
    throw new FrenetError(
      err.error?.code || 'FETCH_ERROR',
      err.error?.message || `Erro ${res.status}`,
    );
  }

  const data: FrenetCepResponse = await res.json();
  setCachedCep(clean, data);
  return data;
}

// ─── Shipping Quote ─────────────────────────────────────────────────────────

export async function fetchShippingQuote(
  payload: FrenetQuoteRequest,
  signal?: AbortSignal,
): Promise<FrenetQuoteResponse> {
  const cacheKey = JSON.stringify(payload);
  const cached = quoteMemCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < QUOTE_CACHE_TTL) {
    return cached.data;
  }

  const res = await fetch(`${API}/quote`, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify(payload),
    signal,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: { code: 'UNKNOWN', message: `HTTP ${res.status}` } }));
    throw new FrenetError(
      err.error?.code || 'FETCH_ERROR',
      err.error?.message || `Erro ${res.status}`,
    );
  }

  const data: FrenetQuoteResponse = await res.json();
  quoteMemCache.set(cacheKey, { data, ts: Date.now() });
  return data;
}

// ─── Config (Admin) ─────────────────────────────────────────────────────────

export async function fetchFrenetConfig(): Promise<{ config: FrenetConfig; status: { tokenConfigured: boolean; passConfigured: boolean } }> {
  const res = await fetch(`${API}/config`, { headers: HEADERS });
  if (!res.ok) throw new Error('Failed to fetch Frenet config');
  return res.json();
}

export async function saveFrenetConfig(config: Partial<FrenetConfig>): Promise<FrenetConfig> {
  const res = await fetch(`${API}/config`, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify({ config }),
  });
  if (!res.ok) throw new Error('Failed to save Frenet config');
  const data = await res.json();
  return data.config;
}

export async function testFrenetHealth(): Promise<{ ok: boolean; status?: number; error?: string }> {
  const res = await fetch(`${API}/health`, { headers: HEADERS });
  return res.json();
}

// ─── ShippingCalculator implementation (drop-in replacement for mock) ────────

export const frenetShippingCalculator: ShippingCalculator = {
  async calculate(input: ShippingInput): Promise<ShippingQuote[]> {
    const recipientCep = input.cep.replace(/\D/g, '');
    if (recipientCep.length !== 8) {
      throw new FrenetError('INVALID_CEP', 'CEP invalido');
    }

    const invoiceValue = input.items.reduce((s, i) => s + i.price * i.qty, 0);
    const items = input.items.map(i => ({
      sku: i.sku,
      quantity: i.qty,
      weight: i.weight || 0.5,
      height: i.height,
      length: i.length,
      width: i.width,
    }));

    const result = await fetchShippingQuote({ recipientCep, invoiceValue, items });

    return result.quotes.map(q => ({
      id: q.serviceCode || q.serviceDescription,
      carrier: q.carrier,
      name: q.serviceDescription,
      price: q.price,
      originalPrice: q.originalPrice,
      estimatedDays: q.deliveryDays,
      freeShipping: q.freeShipping,
    }));
  },
};

// ─── Error Class ────────────────────────────────────────────────────────────

export class FrenetError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'FrenetError';
    this.code = code;
  }
}
