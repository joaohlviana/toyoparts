import { Hono } from 'npm:hono';
import * as kv from './kv_store.tsx';
import { logAuditEvent } from './audit.tsx';

export const payments = new Hono();

const CONFIG_KEY = 'meta:payment_config';

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
  activeProvider: 'asaas',
  asaas:  { enabled: true,  sandbox: true },
  vindi:  { enabled: false, sandbox: true },
  stripe: { enabled: false, sandbox: true },
  version: 1,
};

// GET /config
payments.get('/config', async (c) => {
  try {
    const config = await kv.get(CONFIG_KEY) || DEFAULT_CONFIG;
    const status = {
      asaasKeyConfigured:  !!Deno.env.get('ASAAS_API_KEY'),
      vindiKeyConfigured:  !!(Deno.env.get('VINDI_API_KEY') || config.vindi?.apiKey),
      stripeKeyConfigured: !!Deno.env.get('STRIPE_SECRET_KEY'),
      stripePublishableKeyConfigured: !!Deno.env.get('STRIPE_PUBLISHABLE_KEY'),
    };
    return c.json({ config, status });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// POST /config — raw config save (used by PaymentAdmin settings)
payments.post('/config', async (c) => {
  try {
    const newConfig = await c.req.json();
    const previous  = await kv.get(CONFIG_KEY) || DEFAULT_CONFIG;
    const versioned = {
      ...newConfig,
      version:    ((previous as any).version || 1) + 1,
      updated_at: new Date().toISOString(),
    };
    await kv.set(CONFIG_KEY, versioned);

    await logAuditEvent({
      action:      'payments.config.update',
      entity_type: 'payment_config',
      entity_id:   'payment_config',
      before:      { activeProvider: (previous as any).activeProvider, version: (previous as any).version },
      after:       { activeProvider: newConfig.activeProvider, version: versioned.version },
      source:      'admin_ui',
    });

    return c.json({ success: true, config: versioned });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// GET /test/asaas
payments.get('/test/asaas', async (c) => {
  const ASAAS_API_KEY = Deno.env.get('ASAAS_API_KEY');
  if (!ASAAS_API_KEY) return c.json({ ok: false, error: 'ASAAS_API_KEY não configurado no servidor' });

  const config    = await kv.get(CONFIG_KEY) || DEFAULT_CONFIG;
  const isSandbox = (config as any).asaas?.sandbox !== false;
  const baseUrl   = isSandbox ? 'https://sandbox.asaas.com/api/v3' : 'https://api.asaas.com/v3';

  try {
    const res = await fetch(`${baseUrl}/myAccount`, { headers: { 'access_token': ASAAS_API_KEY } });
    if (res.ok) return c.json({ ok: true });
    const text = await res.text();
    return c.json({ ok: false, error: `Erro ${res.status}: ${text}` });
  } catch (err: any) {
    return c.json({ ok: false, error: err.message });
  }
});

// GET /test/vindi
payments.get('/test/vindi', async (c) => {
  const config       = await kv.get(CONFIG_KEY) || DEFAULT_CONFIG;
  const VINDI_API_KEY = Deno.env.get('VINDI_API_KEY') || (config as any).vindi?.apiKey;
  if (!VINDI_API_KEY) return c.json({ ok: false, error: 'VINDI_API_KEY não configurado' });

  const isSandbox = (config as any).vindi?.sandbox !== false;
  const cleanKey  = VINDI_API_KEY.trim();
  let auth: string;
  try { auth = btoa(`${cleanKey}:`); }
  catch (e) { return c.json({ ok: false, error: 'Erro ao codificar chave da Vindi (verifique caracteres especiais)' }); }

  const url = isSandbox ? 'https://sandbox-app.vindi.com.br/api/v1/merchants' : 'https://app.vindi.com.br/api/v1/merchants';
  try {
    const res = await fetch(url, { headers: { 'Authorization': `Basic ${auth}` } });
    if (res.ok) return c.json({ ok: true });
    const text = await res.text();
    return c.json({ ok: false, error: `Erro ${res.status}: ${text}` });
  } catch (err: any) {
    return c.json({ ok: false, error: err.message });
  }
});

// GET /test/stripe
payments.get('/test/stripe', async (c) => {
  const SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY');
  if (!SECRET_KEY) return c.json({ ok: false, error: 'STRIPE_SECRET_KEY não configurado no servidor' });

  try {
    const res = await fetch('https://api.stripe.com/v1/balance', {
      headers: {
        Authorization: `Bearer ${SECRET_KEY}`,
        'Stripe-Version': '2024-06-20',
      },
    });
    if (res.ok) {
      const data = await res.json();
      const available = data.available?.[0];
      const env = SECRET_KEY.startsWith('sk_live_') ? 'production' : 'sandbox';
      return c.json({ ok: true, environment: env, currency: available?.currency?.toUpperCase() });
    }
    const text = await res.text();
    return c.json({ ok: false, error: `Erro ${res.status}: ${text}` });
  } catch (err: any) {
    return c.json({ ok: false, error: err.message });
  }
});

// GET /switch-preview — shows operational impact before switching
payments.get('/switch-preview', async (c) => {
  try {
    const allOrders = await kv.getByPrefix('order:');
    const orders    = (allOrders || []).filter((o: any) => o && typeof o === 'object' && o.orderId);

    const pending = orders.filter((o: any) =>
      ['waiting_payment', 'overdue'].includes(o.payment_status || o.status || '')
    );
    const paidNotShipped = orders.filter((o: any) =>
      (o.payment_status || o.status) === 'paid' &&
      !['shipped', 'delivered'].includes(o.fulfillment_status || 'pending')
    );

    const byProvider: Record<string, number> = {};
    for (const o of pending) {
      const p = (o.payment_provider || 'asaas') as string;
      byProvider[p] = (byProvider[p] || 0) + 1;
    }

    const config = await kv.get(CONFIG_KEY) || DEFAULT_CONFIG;

    return c.json({
      current_provider:    (config as any).activeProvider || 'asaas',
      pending_by_provider: byProvider,
      total_pending:       pending.length,
      paid_not_shipped:    paidNotShipped.length,
      warning: pending.length > 0
        ? `${pending.length} pedido(s) aguardando pagamento. Continuarão sendo processados pelo gateway original após a troca.`
        : null,
    });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// POST /activate-provider — safe gateway switch with validation + audit
payments.post('/activate-provider', async (c) => {
  try {
    const { provider, confirmed } = await c.req.json() as { provider: 'asaas' | 'vindi' | 'stripe'; confirmed?: boolean };

    if (!provider || !['asaas', 'vindi', 'stripe'].includes(provider)) {
      return c.json({ error: 'provider deve ser "asaas", "vindi" ou "stripe"' }, 400);
    }
    if (!confirmed) {
      return c.json({ error: 'Confirmação necessária (confirmed: true)' }, 400);
    }

    // 1. Validate credentials
    if (provider === 'asaas' && !Deno.env.get('ASAAS_API_KEY')) {
      return c.json({ error: 'ASAAS_API_KEY não configurado. Configure antes de ativar.' }, 422);
    }
    if (provider === 'vindi') {
      const cfg = (await kv.get(CONFIG_KEY) as any) || {};
      if (!Deno.env.get('VINDI_API_KEY') && !cfg.vindi?.apiKey) {
        return c.json({ error: 'VINDI_API_KEY não configurado. Configure antes de ativar.' }, 422);
      }
    }
    if (provider === 'stripe' && !Deno.env.get('STRIPE_SECRET_KEY')) {
      return c.json({ error: 'STRIPE_SECRET_KEY não configurado. Configure antes de ativar.' }, 422);
    }

    // 2. Switch
    const previous = (await kv.get(CONFIG_KEY) as PaymentConfig) || DEFAULT_CONFIG;
    if (previous.activeProvider === provider) {
      return c.json({ success: true, message: `${provider} já é o provider ativo`, no_change: true });
    }

    const newConfig: PaymentConfig = {
      ...previous,
      activeProvider: provider,
      version:    ((previous.version || 1) + 1),
      updated_at: new Date().toISOString(),
    };
    await kv.set(CONFIG_KEY, newConfig);

    // 3. Audit
    await logAuditEvent({
      action:      'payments.provider.switch',
      entity_type: 'payment_config',
      entity_id:   'payment_config',
      before:      { activeProvider: previous.activeProvider, version: previous.version },
      after:       { activeProvider: provider, version: newConfig.version },
      source:      'admin_ui',
      meta:        { confirmed: true },
    });

    console.log(`[Payments] Provider switched: ${previous.activeProvider} → ${provider}`);

    return c.json({
      success:           true,
      previous_provider: previous.activeProvider,
      active_provider:   provider,
      version:           newConfig.version,
      message:           `Gateway ativado: ${provider}. Pedidos existentes continuam processados pelo gateway original.`,
    });
  } catch (err: any) {
    console.error('[Payments] activate-provider error:', err);
    return c.json({ success: false, error: err.message }, 500);
  }
});