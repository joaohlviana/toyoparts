// ─── Integration Health Checks ───────────────────────────────────────────────
// GET  /health/integrations              → current health of all providers
// POST /health/integrations/test/:name   → run live test for a provider
//
// KV: meta:integration_health → { asaas: ProviderHealth, vindi: ..., ... }
// Rules:
//   - Never expose credentials in response
//   - Store last-success / last-failure timestamps
//   - Timeout: 8s per test
//   - Response includes response_ms for latency awareness

import { Hono } from 'npm:hono';
import * as kv from './kv_store.tsx';
import { logAuditEvent } from './audit.tsx';

export const health = new Hono();

const HEALTH_KEY = 'meta:integration_health';

// ─── Types ───────────────────────────────────────────────────────────────────

export type HealthStatus = 'healthy' | 'degraded' | 'error' | 'unknown' | 'not_configured';
export type HealthEnv    = 'sandbox' | 'production' | 'not_configured';

export interface ProviderHealth {
  status:       HealthStatus;
  environment:  HealthEnv;
  last_tested:  string | null;
  last_success: string | null;
  last_failure: string | null;
  message:      string;
  response_ms:  number | null;
}

type HealthReport = Record<string, ProviderHealth>;

const UNKNOWN_HEALTH: ProviderHealth = {
  status:       'unknown',
  environment:  'not_configured',
  last_tested:  null,
  last_success: null,
  last_failure: null,
  message:      'Nunca testado',
  response_ms:  null,
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function getReport(): Promise<HealthReport> {
  return (await kv.get(HEALTH_KEY) as HealthReport) || {};
}

async function storeResult(provider: string, result: ProviderHealth): Promise<void> {
  try {
    const current = await getReport();
    // Preserve last_success / last_failure across tests
    const prev = current[provider] || UNKNOWN_HEALTH;
    const merged: ProviderHealth = {
      ...result,
      last_success: result.status === 'healthy' ? result.last_tested : prev.last_success,
      last_failure: result.status !== 'healthy' ? result.last_tested : prev.last_failure,
    };
    await kv.set(HEALTH_KEY, { ...current, [provider]: merged });
  } catch (e) {
    console.error('[Health] storeResult failed:', e);
  }
}

function elapsed(t0: number): number {
  return Date.now() - t0;
}

// ─── Provider Testers ────────────────────────────────────────────────────────

async function testAsaas(t0: number): Promise<ProviderHealth> {
  const KEY = Deno.env.get('ASAAS_API_KEY');
  if (!KEY) {
    return { status: 'not_configured', environment: 'not_configured', last_tested: new Date().toISOString(), last_success: null, last_failure: new Date().toISOString(), message: 'ASAAS_API_KEY não configurado nas variáveis de ambiente', response_ms: null };
  }
  const config    = (await kv.get('meta:payment_config')) as any || {};
  const isSandbox = config.asaas?.sandbox !== false;
  const baseUrl   = isSandbox ? 'https://sandbox.asaas.com/api/v3' : 'https://api.asaas.com/v3';
  const env: HealthEnv = isSandbox ? 'sandbox' : 'production';

  try {
    const res = await fetch(`${baseUrl}/myAccount`, {
      headers: { 'access_token': KEY },
      signal:  AbortSignal.timeout(8000),
    });
    const ms = elapsed(t0);
    if (res.ok) {
      return { status: 'healthy', environment: env, last_tested: new Date().toISOString(), last_success: new Date().toISOString(), last_failure: null, message: `Conexão OK (${ms}ms)`, response_ms: ms };
    }
    const txt = await res.text().catch(() => '');
    return { status: 'error', environment: env, last_tested: new Date().toISOString(), last_success: null, last_failure: new Date().toISOString(), message: `HTTP ${res.status}: ${txt.slice(0, 200)}`, response_ms: ms };
  } catch (e: any) {
    return { status: 'error', environment: env, last_tested: new Date().toISOString(), last_success: null, last_failure: new Date().toISOString(), message: `Falha de rede: ${e.message}`, response_ms: elapsed(t0) };
  }
}

async function testVindi(t0: number): Promise<ProviderHealth> {
  const config  = (await kv.get('meta:payment_config')) as any || {};
  const KEY     = Deno.env.get('VINDI_API_KEY') || config.vindi?.apiKey;
  if (!KEY) {
    return { status: 'not_configured', environment: 'not_configured', last_tested: new Date().toISOString(), last_success: null, last_failure: new Date().toISOString(), message: 'VINDI_API_KEY não configurado', response_ms: null };
  }
  const isSandbox = config.vindi?.sandbox !== false;
  const baseUrl   = isSandbox ? 'https://sandbox-app.vindi.com.br/api/v1' : 'https://app.vindi.com.br/api/v1';
  const env: HealthEnv = isSandbox ? 'sandbox' : 'production';
  const auth = btoa(`${KEY.trim()}:`);

  try {
    const res = await fetch(`${baseUrl}/merchants`, {
      headers: { Authorization: `Basic ${auth}` },
      signal:  AbortSignal.timeout(8000),
    });
    const ms = elapsed(t0);
    if (res.ok) {
      return { status: 'healthy', environment: env, last_tested: new Date().toISOString(), last_success: new Date().toISOString(), last_failure: null, message: `Conexão OK (${ms}ms)`, response_ms: ms };
    }
    const txt = await res.text().catch(() => '');
    return { status: 'error', environment: env, last_tested: new Date().toISOString(), last_success: null, last_failure: new Date().toISOString(), message: `HTTP ${res.status}: ${txt.slice(0, 200)}`, response_ms: ms };
  } catch (e: any) {
    return { status: 'error', environment: env, last_tested: new Date().toISOString(), last_success: null, last_failure: new Date().toISOString(), message: `Falha de rede: ${e.message}`, response_ms: elapsed(t0) };
  }
}

async function testFrenet(t0: number): Promise<ProviderHealth> {
  const KEY = Deno.env.get('FRENET_TOKEN');
  if (!KEY) {
    return { status: 'not_configured', environment: 'not_configured', last_tested: new Date().toISOString(), last_success: null, last_failure: new Date().toISOString(), message: 'FRENET_TOKEN não configurado', response_ms: null };
  }
  try {
    const res = await fetch('https://api.frenet.com.br/DataProvider/GetAllServices', {
      headers: { token: KEY },
      signal:  AbortSignal.timeout(8000),
    });
    const ms = elapsed(t0);
    if (res.ok) {
      const data: any[] = await res.json().catch(() => []);
      return { status: 'healthy', environment: 'production', last_tested: new Date().toISOString(), last_success: new Date().toISOString(), last_failure: null, message: `${data.length} serviços disponíveis (${ms}ms)`, response_ms: ms };
    }
    return { status: 'error', environment: 'production', last_tested: new Date().toISOString(), last_success: null, last_failure: new Date().toISOString(), message: `HTTP ${res.status}`, response_ms: ms };
  } catch (e: any) {
    return { status: 'error', environment: 'production', last_tested: new Date().toISOString(), last_success: null, last_failure: new Date().toISOString(), message: `Falha de rede: ${e.message}`, response_ms: elapsed(t0) };
  }
}

async function testResend(t0: number): Promise<ProviderHealth> {
  const KEY = (Deno.env.get('RESEND_API') || '').trim();
  if (!KEY) {
    return { status: 'not_configured', environment: 'not_configured', last_tested: new Date().toISOString(), last_success: null, last_failure: new Date().toISOString(), message: 'RESEND_API não configurado', response_ms: null };
  }
  try {
    const res = await fetch('https://api.resend.com/domains', {
      headers: { Authorization: `Bearer ${KEY}` },
      signal:  AbortSignal.timeout(8000),
    });
    const ms = elapsed(t0);
    if (res.ok) {
      const data: any = await res.json().catch(() => ({}));
      const domains = data.data?.length ?? 0;
      return { status: 'healthy', environment: 'production', last_tested: new Date().toISOString(), last_success: new Date().toISOString(), last_failure: null, message: `API key válida · ${domains} domínio(s) (${ms}ms)`, response_ms: ms };
    }
    return { status: 'error', environment: 'production', last_tested: new Date().toISOString(), last_success: null, last_failure: new Date().toISOString(), message: `HTTP ${res.status} — verifique a API key`, response_ms: ms };
  } catch (e: any) {
    return { status: 'error', environment: 'production', last_tested: new Date().toISOString(), last_success: null, last_failure: new Date().toISOString(), message: `Falha de rede: ${e.message}`, response_ms: elapsed(t0) };
  }
}

async function testStripe(t0: number): Promise<ProviderHealth> {
  const KEY = Deno.env.get('STRIPE_SECRET_KEY');
  if (!KEY) {
    return { status: 'not_configured', environment: 'not_configured', last_tested: new Date().toISOString(), last_success: null, last_failure: new Date().toISOString(), message: 'STRIPE_SECRET_KEY não configurado', response_ms: null };
  }
  const env: HealthEnv = KEY.startsWith('sk_live_') ? 'production' : 'sandbox';
  try {
    const res = await fetch('https://api.stripe.com/v1/balance', {
      headers: { Authorization: `Bearer ${KEY}`, 'Stripe-Version': '2024-06-20' },
      signal: AbortSignal.timeout(8000),
    });
    const ms = elapsed(t0);
    if (res.ok) {
      const data: any = await res.json().catch(() => ({}));
      const currency = data.available?.[0]?.currency?.toUpperCase() ?? 'BRL';
      return { status: 'healthy', environment: env, last_tested: new Date().toISOString(), last_success: new Date().toISOString(), last_failure: null, message: `Conexão OK · ${currency} (${ms}ms)`, response_ms: ms };
    }
    const txt = await res.text().catch(() => '');
    return { status: 'error', environment: env, last_tested: new Date().toISOString(), last_success: null, last_failure: new Date().toISOString(), message: `HTTP ${res.status}: ${txt.slice(0, 200)}`, response_ms: ms };
  } catch (e: any) {
    return { status: 'error', environment: env, last_tested: new Date().toISOString(), last_success: null, last_failure: new Date().toISOString(), message: `Falha de rede: ${e.message}`, response_ms: elapsed(t0) };
  }
}

// ─── GET /health/integrations ─────────────────────────────────────────────────

health.get('/integrations', async (c) => {
  try {
    const report  = await getReport();
    const NAMES   = ['asaas', 'vindi', 'stripe', 'frenet', 'resend'];
    const full: HealthReport = {};
    for (const n of NAMES) full[n] = report[n] || UNKNOWN_HEALTH;
    return c.json({ integrations: full });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// ─── POST /health/integrations/test/:name ────────────────────────────────────

health.post('/integrations/test/:name', async (c) => {
  const name = c.req.param('name');
  const t0   = Date.now();
  let result: ProviderHealth;

  try {
    switch (name) {
      case 'asaas':  result = await testAsaas(t0);  break;
      case 'vindi':  result = await testVindi(t0);  break;
      case 'stripe': result = await testStripe(t0); break;
      case 'frenet': result = await testFrenet(t0); break;
      case 'resend': result = await testResend(t0); break;
      default:
        return c.json({ error: `Provider desconhecido: ${name}` }, 400);
    }
  } catch (e: any) {
    result = { status: 'error', environment: 'not_configured', last_tested: new Date().toISOString(), last_success: null, last_failure: new Date().toISOString(), message: `Erro inesperado: ${e.message}`, response_ms: elapsed(t0) };
  }

  await storeResult(name, result);

  await logAuditEvent({
    action:      'integration.test',
    entity_type: 'integration',
    entity_id:   name,
    after:       { status: result.status, message: result.message, response_ms: result.response_ms },
    source:      'admin_ui',
  });

  return c.json({ provider: name, ...result });
});