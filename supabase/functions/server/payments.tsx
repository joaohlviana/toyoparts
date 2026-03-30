import { Hono } from 'npm:hono';
import * as kv from './kv_store.tsx';
import { logAuditEvent } from './audit.tsx';

export const payments = new Hono();

const CONFIG_KEY = 'meta:payment_config';
const LOCKED_PROVIDER = 'asaas' as const;

interface PaymentConfig {
  activeProvider: 'asaas' | 'vindi' | 'stripe';
  asaas: {
    enabled: boolean;
    sandbox: boolean;
  };
  vindi: {
    enabled: boolean;
    sandbox: boolean;
    apiKey?: string;
  };
  stripe: {
    enabled: boolean;
    sandbox: boolean;
  };
  version?: number;
  updated_at?: string;
  updated_by?: string;
}

const DEFAULT_CONFIG: PaymentConfig = {
  activeProvider: LOCKED_PROVIDER,
  asaas: { enabled: true, sandbox: false },
  vindi: { enabled: false, sandbox: true },
  stripe: { enabled: false, sandbox: true },
  version: 1,
};

function normalizeAsaasOnlyConfig(input: Partial<PaymentConfig> | null | undefined): PaymentConfig {
  const source = (input && typeof input === 'object' ? input : {}) as Partial<PaymentConfig>;

  return {
    ...DEFAULT_CONFIG,
    ...source,
    activeProvider: LOCKED_PROVIDER,
    asaas: {
      ...DEFAULT_CONFIG.asaas,
      ...(source.asaas || {}),
      enabled: true,
      sandbox: false,
    },
    vindi: {
      ...DEFAULT_CONFIG.vindi,
      ...(source.vindi || {}),
      enabled: false,
      sandbox: true,
    },
    stripe: {
      ...DEFAULT_CONFIG.stripe,
      ...(source.stripe || {}),
      enabled: false,
      sandbox: true,
    },
  };
}

// GET /config
payments.get('/config', async (c) => {
  try {
    const config = normalizeAsaasOnlyConfig(await kv.get(CONFIG_KEY));
    const status = {
      asaasKeyConfigured: !!Deno.env.get('ASAAS_API_KEY'),
      vindiKeyConfigured: !!(Deno.env.get('VINDI_API_KEY') || config.vindi?.apiKey),
      stripeKeyConfigured: !!Deno.env.get('STRIPE_SECRET_KEY'),
      stripePublishableKeyConfigured: !!Deno.env.get('STRIPE_PUBLISHABLE_KEY'),
      lockedProvider: LOCKED_PROVIDER,
      liveLocked: true,
    };
    return c.json({ config, status });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// POST /config — admin saves are normalized so production stays Asaas-only
payments.post('/config', async (c) => {
  try {
    const newConfig = await c.req.json();
    const previous = normalizeAsaasOnlyConfig(await kv.get(CONFIG_KEY));
    const locked = normalizeAsaasOnlyConfig(newConfig);
    const versioned = {
      ...locked,
      version: ((previous as any).version || 1) + 1,
      updated_at: new Date().toISOString(),
    };
    await kv.set(CONFIG_KEY, versioned);

    await logAuditEvent({
      action: 'payments.config.update',
      entity_type: 'payment_config',
      entity_id: 'payment_config',
      before: { activeProvider: (previous as any).activeProvider, version: (previous as any).version },
      after: { activeProvider: versioned.activeProvider, version: versioned.version },
      source: 'admin_ui',
      meta: { lock: true },
    });

    return c.json({ success: true, config: versioned });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// GET /test/asaas
payments.get('/test/asaas', async (c) => {
  const asaasApiKey = Deno.env.get('ASAAS_API_KEY');
  if (!asaasApiKey) return c.json({ ok: false, error: 'ASAAS_API_KEY nao configurado no servidor' });

  const config = normalizeAsaasOnlyConfig(await kv.get(CONFIG_KEY));
  const isSandbox = config.asaas?.sandbox !== false;
  const baseUrl = isSandbox ? 'https://sandbox.asaas.com/api/v3' : 'https://api.asaas.com/v3';

  try {
    const res = await fetch(`${baseUrl}/myAccount`, { headers: { access_token: asaasApiKey } });
    if (res.ok) {
      return c.json({
        ok: true,
        environment: isSandbox ? 'sandbox' : 'production',
        provider: LOCKED_PROVIDER,
      });
    }
    const text = await res.text();
    return c.json({ ok: false, error: `Erro ${res.status}: ${text}` });
  } catch (err: any) {
    return c.json({ ok: false, error: err.message });
  }
});

// GET /test/vindi
payments.get('/test/vindi', async (c) => {
  const config = normalizeAsaasOnlyConfig(await kv.get(CONFIG_KEY));
  const vindiApiKey = Deno.env.get('VINDI_API_KEY') || config.vindi?.apiKey;
  if (!vindiApiKey) return c.json({ ok: false, error: 'VINDI_API_KEY nao configurado' });

  const cleanKey = vindiApiKey.trim();
  let auth: string;
  try {
    auth = btoa(`${cleanKey}:`);
  } catch {
    return c.json({ ok: false, error: 'Erro ao codificar chave da Vindi (verifique caracteres especiais)' });
  }

  try {
    const res = await fetch('https://sandbox-app.vindi.com.br/api/v1/merchants', {
      headers: { Authorization: `Basic ${auth}` },
    });
    if (res.ok) return c.json({ ok: true, legacyOnly: true });
    const text = await res.text();
    return c.json({ ok: false, error: `Erro ${res.status}: ${text}`, legacyOnly: true });
  } catch (err: any) {
    return c.json({ ok: false, error: err.message, legacyOnly: true });
  }
});

// GET /test/stripe
payments.get('/test/stripe', async (c) => {
  const secretKey = Deno.env.get('STRIPE_SECRET_KEY');
  if (!secretKey) return c.json({ ok: false, error: 'STRIPE_SECRET_KEY nao configurado no servidor' });

  try {
    const res = await fetch('https://api.stripe.com/v1/balance', {
      headers: {
        Authorization: `Bearer ${secretKey}`,
        'Stripe-Version': '2024-06-20',
      },
    });
    if (res.ok) {
      const data = await res.json();
      const available = data.available?.[0];
      const env = secretKey.startsWith('sk_live_') ? 'production' : 'sandbox';
      return c.json({ ok: true, environment: env, currency: available?.currency?.toUpperCase(), legacyOnly: true });
    }
    const text = await res.text();
    return c.json({ ok: false, error: `Erro ${res.status}: ${text}`, legacyOnly: true });
  } catch (err: any) {
    return c.json({ ok: false, error: err.message, legacyOnly: true });
  }
});

// GET /switch-preview — legacy status overview for existing orders
payments.get('/switch-preview', async (c) => {
  try {
    const allOrders = await kv.getByPrefix('order:');
    const orders = (allOrders || []).filter((o: any) => o && typeof o === 'object' && o.orderId);

    const pending = orders.filter((o: any) =>
      ['waiting_payment', 'overdue'].includes(o.payment_status || o.status || '')
    );
    const paidNotShipped = orders.filter((o: any) =>
      (o.payment_status || o.status) === 'paid' &&
      !['shipped', 'delivered'].includes(o.fulfillment_status || 'pending')
    );

    const byProvider: Record<string, number> = {};
    for (const order of pending) {
      const provider = (order.payment_provider || LOCKED_PROVIDER) as string;
      byProvider[provider] = (byProvider[provider] || 0) + 1;
    }

    const config = normalizeAsaasOnlyConfig(await kv.get(CONFIG_KEY));

    return c.json({
      current_provider: config.activeProvider || LOCKED_PROVIDER,
      locked_provider: LOCKED_PROVIDER,
      pending_by_provider: byProvider,
      total_pending: pending.length,
      paid_not_shipped: paidNotShipped.length,
      warning: pending.length > 0
        ? `${pending.length} pedido(s) aguardando pagamento. Continuarao sendo processados pelo gateway original apos a troca.`
        : null,
    });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// POST /activate-provider — production is permanently locked to Asaas for new orders
payments.post('/activate-provider', async (c) => {
  try {
    const { provider, confirmed } = await c.req.json() as { provider: 'asaas' | 'vindi' | 'stripe'; confirmed?: boolean };

    if (!provider || !['asaas', 'vindi', 'stripe'].includes(provider)) {
      return c.json({ error: 'provider deve ser "asaas", "vindi" ou "stripe"' }, 400);
    }
    if (!confirmed) {
      return c.json({ error: 'Confirmacao necessaria (confirmed: true)' }, 400);
    }
    if (provider !== LOCKED_PROVIDER) {
      return c.json({
        error: `Producao travada em ${LOCKED_PROVIDER}. Stripe e Vindi permanecem apenas para pedidos legados.`,
        active_provider: LOCKED_PROVIDER,
        locked: true,
      }, 423);
    }
    if (!Deno.env.get('ASAAS_API_KEY')) {
      return c.json({ error: 'ASAAS_API_KEY nao configurado. Configure antes de ativar.' }, 422);
    }

    const previous = normalizeAsaasOnlyConfig(await kv.get(CONFIG_KEY) as PaymentConfig | null);
    if (previous.activeProvider === LOCKED_PROVIDER && previous.asaas.enabled && previous.asaas.sandbox === false) {
      return c.json({
        success: true,
        message: 'Asaas ja esta ativo em producao e travado para novos pedidos.',
        active_provider: LOCKED_PROVIDER,
        no_change: true,
      });
    }

    const newConfig: PaymentConfig = normalizeAsaasOnlyConfig({
      ...previous,
      version: (previous.version || 1) + 1,
      updated_at: new Date().toISOString(),
    });
    await kv.set(CONFIG_KEY, newConfig);

    await logAuditEvent({
      action: 'payments.provider.switch',
      entity_type: 'payment_config',
      entity_id: 'payment_config',
      before: { activeProvider: previous.activeProvider, version: previous.version },
      after: { activeProvider: LOCKED_PROVIDER, version: newConfig.version },
      source: 'admin_ui',
      meta: { confirmed: true, lock: true },
    });

    console.log(`[Payments] Production lock enforced: ${previous.activeProvider} -> ${LOCKED_PROVIDER}`);

    return c.json({
      success: true,
      previous_provider: previous.activeProvider,
      active_provider: LOCKED_PROVIDER,
      version: newConfig.version,
      message: 'Asaas ativado em producao. Pedidos existentes continuam processados pelo gateway original.',
    });
  } catch (err: any) {
    console.error('[Payments] activate-provider error:', err);
    return c.json({ success: false, error: err.message }, 500);
  }
});
