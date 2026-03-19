// ─── Stripe Payment Provider ─────────────────────────────────────────────────
// Usa Stripe Checkout Sessions (hosted page) — mesmo padrão de redirect do Asaas/Vindi.
//
// POST /stripe/create-checkout  → cria Checkout Session, retorna checkoutUrl
// GET  /stripe/payment/:id      → consulta status da Session
// POST /stripe/refund           → estorna pagamento por orderId ou paymentIntentId
// POST /stripe/webhook          → recebe eventos com validação de assinatura HMAC-SHA256
//
// Eventos → payment_status interno:
//   checkout.session.completed  → paid
//   checkout.session.expired    → canceled
//   payment_intent.payment_failed → overdue
//   charge.refunded             → refunded
//
// Idempotência: event.id armazenado em webhook_dedup:stripe:{event.id}

import { Hono } from 'npm:hono';
import * as kv from './kv_store.tsx';
import { appendOrderEvent, logAuditEvent } from './audit.tsx';

export const stripe = new Hono();

const CONFIG_KEY   = 'meta:payment_config';
const DEDUP_PREFIX = 'webhook_dedup:stripe:';

// ─── Stripe REST helper ───────────────────────────────────────────────────────

async function stripeFetch(path: string, options: { method?: string; body?: Record<string, any> } = {}): Promise<any> {
  const SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY');
  if (!SECRET_KEY) throw new Error('STRIPE_SECRET_KEY não configurado nas variáveis de ambiente');

  const method = options.method || 'GET';
  const headers: Record<string, string> = {
    Authorization: `Bearer ${SECRET_KEY}`,
    'Stripe-Version': '2024-06-20',
  };

  let fetchOptions: RequestInit = { method, headers };

  if (options.body) {
    headers['Content-Type'] = 'application/x-www-form-urlencoded';
    fetchOptions.body = encodeForm(options.body);
  }

  const res  = await fetch(`https://api.stripe.com/v1${path}`, fetchOptions);
  const data = await res.json();

  if (!res.ok) {
    const msg = data?.error?.message || `HTTP ${res.status}`;
    console.error(`[Stripe] Error ${path}: ${msg}`);
    throw new Error(`Stripe API Error: ${msg}`);
  }

  return data;
}

// Stripe usa application/x-www-form-urlencoded com objetos aninhados (param[key]=val)
function encodeForm(obj: Record<string, any>, prefix = ''): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(obj)) {
    if (value === null || value === undefined) continue;
    const fullKey = prefix ? `${prefix}[${key}]` : key;
    if (Array.isArray(value)) {
      value.forEach((v, i) => {
        if (typeof v === 'object' && v !== null) {
          parts.push(encodeForm(v, `${fullKey}[${i}]`));
        } else {
          parts.push(`${encodeURIComponent(`${fullKey}[${i}]`)}=${encodeURIComponent(String(v))}`);
        }
      });
    } else if (typeof value === 'object') {
      parts.push(encodeForm(value, fullKey));
    } else {
      parts.push(`${encodeURIComponent(fullKey)}=${encodeURIComponent(String(value))}`);
    }
  }
  return parts.join('&');
}

// ─── Idempotência ─────────────────────────────────────────────────────────────

async function isDuplicate(id: string): Promise<boolean> {
  try { return !!(await kv.get(`${DEDUP_PREFIX}${id}`)); }
  catch { return false; }
}
async function markProcessed(id: string): Promise<void> {
  try { await kv.set(`${DEDUP_PREFIX}${id}`, { processed_at: new Date().toISOString() }); }
  catch (e) { console.warn('[Stripe] Failed to mark dedup:', e); }
}

// ─── Mapeamento de eventos ────────────────────────────────────────────────────

function mapEvent(type: string): string | null {
  const map: Record<string, string> = {
    'checkout.session.completed':     'paid',
    'checkout.session.expired':       'canceled',
    'payment_intent.payment_failed':  'overdue',
    'charge.refunded':                'refunded',
  };
  return map[type] ?? null;
}

// ─── POST /stripe/create-checkout ────────────────────────────────────────────

stripe.post('/create-checkout', async (c) => {
  try {
    const body = await c.req.json();
    const { customer, orderId, items, totals, address, shipping, successUrl: clientSuccessUrl, cancelUrl: clientCancelUrl } = body;

    // ── Apply coupon discount server-side ──────────────────────────────────
    // The checkout.tsx handler enriches the body with validated coupon fields
    // (discountValue, shippingDiscount, freeShipping) before calling us.
    const couponDiscount   = Number(body.discountValue ?? 0);
    const shippingDiscount = body.freeShipping ? Number(body.shippingDiscount ?? 0) : 0;
    const rawTotal         = Number(totals?.total ?? 0);
    const finalTotal       = Math.max(rawTotal - couponDiscount - shippingDiscount, 0);

    if (!orderId || finalTotal <= 0) {
      console.error(`[Stripe] Validation failed: orderId=${orderId}, rawTotal=${rawTotal}, couponDiscount=${couponDiscount}, shippingDiscount=${shippingDiscount}, finalTotal=${finalTotal}`);
      return c.json({ success: false, error: `orderId e valor total são obrigatórios (total calculado: R$${finalTotal.toFixed(2)})` }, 400);
    }

    console.log(`[Stripe] Creating Checkout Session for order ${orderId} — raw=${rawTotal}, coupon=-${couponDiscount}, shipDisc=-${shippingDiscount}, final=${finalTotal}`);

    // Use URLs provided by the frontend (window.location.origin) when available,
    // otherwise fall back to FRONTEND_URL env var or the Supabase redirect handler.
    const frontendBase = Deno.env.get('FRONTEND_URL') || '';
    const successUrl = clientSuccessUrl
      || (frontendBase ? `${frontendBase}/pedido/obrigado?orderId=${orderId}&session_id={CHECKOUT_SESSION_ID}` : null)
      || (() => {
        const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
        const projectId   = supabaseUrl.match(/https:\/\/([^.]+)\./)?.[1] || '';
        return `https://${projectId}.supabase.co/functions/v1/make-server-1d6e33e0/stripe/redirect-success?orderId=${orderId}&session_id={CHECKOUT_SESSION_ID}`;
      })();

    const cancelUrl = clientCancelUrl
      || (frontendBase ? `${frontendBase}/checkout?cancelled=1` : null)
      || (() => {
        const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
        const projectId   = supabaseUrl.match(/https:\/\/([^.]+)\./)?.[1] || '';
        return `https://${projectId}.supabase.co/functions/v1/make-server-1d6e33e0/stripe/redirect-cancel?orderId=${orderId}`;
      })();

    // ── Build Stripe session (card-only — enable PIX in Stripe Dashboard first) ──
    const sessionBody: Record<string, any> = {
      mode:               'payment',
      success_url:        successUrl,
      cancel_url:         cancelUrl,
      'payment_method_types[0]': 'card',
      'metadata[orderId]':       orderId,
      'metadata[source]':        'toyoparts',
      'line_items[0][price_data][currency]':                          'brl',
      'line_items[0][price_data][unit_amount]':                       Math.round(finalTotal * 100),
      'line_items[0][price_data][product_data][name]':                `Pedido Toyoparts #${orderId.slice(0, 8).toUpperCase()}`,
      'line_items[0][price_data][product_data][description]':         items?.length
        ? items.map((i: any) => `${i.qty || i.quantity || 1}x ${i.name}`).join(', ').slice(0, 500)
        : 'Peças Toyota',
      'line_items[0][quantity]':                                      1,
      'expires_at': Math.floor(Date.now() / 1000) + 1800,
      'locale': 'pt-BR',
    };

    if (customer?.email) {
      sessionBody['customer_email'] = customer.email;
    }

    const session = await stripeFetch('/checkout/sessions', { method: 'POST', body: sessionBody });

    // Salvar pedido no KV with discount info
    const now = new Date().toISOString();
    await kv.set(`order:${orderId}`, {
      orderId,
      payment_provider:           'stripe',
      payment_status:             'waiting_payment',
      fulfillment_status:         'pending',
      status:                     'waiting_payment',
      stripe_session_id:          session.id,
      stripe_payment_intent_id:   session.payment_intent || null,
      stripe_checkout_url:        session.url,
      customer,
      address:  address  || null,
      items:    items    || [],
      totals:   { ...totals, finalTotal, couponDiscount, shippingDiscount },
      couponCode: body.couponCode || null,
      shipping: shipping || null,
      createdAt:  now,
      created_at: now,
    });

    await appendOrderEvent(orderId, 'order.created', {
      payment_provider: 'stripe',
      stripe_session_id: session.id,
      total: finalTotal,
      rawTotal,
      couponDiscount,
      shippingDiscount,
    }, 'system');

    console.log(`[Stripe] Session ${session.id} created for order ${orderId} — finalTotal=${finalTotal}`);

    return c.json({
      success:     true,
      orderId,
      checkoutUrl: session.url,
      sessionId:   session.id,
    });
  } catch (err: any) {
    console.error('[Stripe] create-checkout error:', err);
    return c.json({ success: false, error: err.message }, 500);
  }
});

// ─── GET /stripe/redirect-success ────────────────────────────────────────────
// Stripe redireciona aqui após pagamento aprovado; redireciona para a página de sucesso do site

stripe.get('/redirect-success', async (c) => {
  const orderId    = c.req.query('orderId');
  const sessionId  = c.req.query('session_id');

  console.log(`[Stripe] redirect-success orderId=${orderId} session=${sessionId}`);

  // Atualizar status se ainda não foi via webhook
  if (orderId) {
    try {
      const existing = await kv.get(`order:${orderId}`);
      if (existing && existing.payment_status === 'waiting_payment') {
        await kv.set(`order:${orderId}`, {
          ...existing,
          payment_status:   'paid',
          status:           'paid',
          updatedAt:        new Date().toISOString(),
          last_payment_event: 'redirect_success',
        });
        await appendOrderEvent(orderId, 'payment.status_changed', {
          from: 'waiting_payment', to: 'paid',
          payment_provider: 'stripe', gateway_event: 'redirect_success',
        }, 'webhook');
      }
    } catch (e) {
      console.warn('[Stripe] redirect-success KV update failed:', e);
    }
  }

  // Redirecionar para a página de obrigado do e-commerce
  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  const projectId   = supabaseUrl.match(/https:\/\/([^.]+)\./)?.[1] || '';
  // A URL de sucesso do e-commerce — ajuste conforme seu domínio em produção
  const frontendBase = Deno.env.get('FRONTEND_URL') || `https://${projectId}.supabase.co`;
  return c.redirect(`${frontendBase}/pedido/obrigado?orderId=${orderId}`);
});

// ─── GET /stripe/redirect-cancel ─────────────────────────────────────────────

stripe.get('/redirect-cancel', (c) => {
  const orderId = c.req.query('orderId');
  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  const projectId   = supabaseUrl.match(/https:\/\/([^.]+)\./)?.[1] || '';
  const frontendBase = Deno.env.get('FRONTEND_URL') || `https://${projectId}.supabase.co`;
  return c.redirect(`${frontendBase}/checkout?orderId=${orderId}&cancelled=1`);
});

// ─── GET /stripe/payment/:id ──────────────────────────────────────────────────

stripe.get('/payment/:id', async (c) => {
  try {
    const { id } = c.req.param();
    // Aceita session ID (cs_...) ou payment intent ID (pi_...)
    const isSession = id.startsWith('cs_');
    const data = isSession
      ? await stripeFetch(`/checkout/sessions/${id}`)
      : await stripeFetch(`/payment_intents/${id}`);

    const sessionStatusMap: Record<string, string> = {
      complete:   'paid',
      expired:    'canceled',
      open:       'waiting_payment',
    };
    const intentStatusMap: Record<string, string> = {
      succeeded:                   'paid',
      requires_payment_method:     'overdue',
      canceled:                    'canceled',
      requires_action:             'waiting_payment',
      processing:                  'waiting_payment',
    };

    const paymentStatus = isSession
      ? (sessionStatusMap[data.status] ?? 'waiting_payment')
      : (intentStatusMap[data.status] ?? 'waiting_payment');

    return c.json({
      id:             data.id,
      status:         data.status,
      payment_status: paymentStatus,
      amount:         (data.amount_total ?? data.amount ?? 0) / 100,
      currency:       data.currency,
      metadata:       data.metadata,
    });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// ─── POST /stripe/refund ──────────────────��───────────────────────────────────

stripe.post('/refund', async (c) => {
  try {
    const { paymentIntentId, orderId, amount } = await c.req.json();
    if (!paymentIntentId && !orderId) {
      return c.json({ error: 'Informe paymentIntentId ou orderId' }, 400);
    }

    let piId = paymentIntentId;
    let oid  = orderId;

    if (!piId && oid) {
      const order = await kv.get(`order:${oid}`);
      piId = order?.stripe_payment_intent_id;
      if (!piId) {
        // Tentar via session
        const sessionId = order?.stripe_session_id;
        if (sessionId) {
          const session = await stripeFetch(`/checkout/sessions/${sessionId}`);
          piId = session.payment_intent;
        }
      }
      if (!piId) return c.json({ error: 'payment_intent não encontrado para este pedido' }, 404);
    }

    const refundBody: Record<string, any> = { payment_intent: piId };
    if (amount) refundBody.amount = Math.round(amount * 100);

    const refund = await stripeFetch('/refunds', { method: 'POST', body: refundBody });

    if (oid) {
      const existing = await kv.get(`order:${oid}`);
      if (existing) {
        await kv.set(`order:${oid}`, {
          ...existing,
          payment_status:   'refunded',
          status:           'refunded',
          stripe_refund_id: refund.id,
          updatedAt:        new Date().toISOString(),
        });
        await appendOrderEvent(oid, 'payment.refunded', {
          stripe_refund_id: refund.id,
          amount: refund.amount / 100,
          payment_provider: 'stripe',
        }, 'admin');
      }
    }

    await logAuditEvent({
      action: 'payments.stripe.refund',
      entity_type: 'payment',
      entity_id: piId,
      after: { refund_id: refund.id, amount: refund.amount / 100 },
      source: 'admin_ui',
    });

    return c.json({ success: true, refundId: refund.id, status: refund.status });
  } catch (err: any) {
    console.error('[Stripe] refund error:', err);
    return c.json({ success: false, error: err.message }, 500);
  }
});

// ─── POST /stripe/webhook ────────────────────────────────────────────────────

stripe.post('/webhook', async (c) => {
  let payload: string;
  try { payload = await c.req.text(); }
  catch { return c.json({ error: 'Failed to read body' }, 400); }

  const sig    = c.req.header('stripe-signature') || '';
  const secret = Deno.env.get('STRIPE_WEBHOOK_SECRET') || '';

  if (secret) {
    const valid = await verifySignature(payload, sig, secret);
    if (!valid) {
      console.warn('[Stripe Webhook] Invalid signature');
      return c.json({ error: 'Invalid signature' }, 400);
    }
  } else {
    console.warn('[Stripe Webhook] STRIPE_WEBHOOK_SECRET not set — skipping validation');
  }

  let event: any;
  try { event = JSON.parse(payload); }
  catch { return c.json({ error: 'Invalid JSON' }, 400); }

  const eventId   = event.id;
  const eventType = event.type;
  console.log(`[Stripe Webhook] ${eventType} (${eventId})`);

  if (eventId && await isDuplicate(eventId)) {
    return c.json({ received: true, status: 'deduplicated' });
  }

  const newStatus = mapEvent(eventType);
  if (newStatus) {
    const object  = event.data?.object;
    const orderId = object?.metadata?.orderId || null;

    if (orderId) {
      const orderKey = `order:${orderId}`;
      const existing = await kv.get(orderKey);

      if (existing) {
        const prevStatus = existing.payment_status || existing.status;
        const update: Record<string, any> = {
          ...existing,
          payment_status:     newStatus,
          status:             newStatus,
          updatedAt:          new Date().toISOString(),
          last_payment_event: eventType,
        };

        // Persistir payment_intent id quando disponível
        if (object?.payment_intent && !existing.stripe_payment_intent_id) {
          update.stripe_payment_intent_id = object.payment_intent;
        }

        if (newStatus !== prevStatus) {
          await kv.set(orderKey, update);
          console.log(`[Stripe Webhook] Order ${orderId}: ${prevStatus} → ${newStatus}`);
          await appendOrderEvent(orderId, 'payment.status_changed', {
            from: prevStatus, to: newStatus,
            payment_provider: 'stripe', gateway_event: eventType,
          }, 'webhook');
        } else {
          await appendOrderEvent(orderId, 'payment.webhook_received', {
            event: eventType, payment_status_unchanged: newStatus,
          }, 'webhook');
        }
      } else {
        console.warn(`[Stripe Webhook] Order ${orderId} not found`);
      }
    } else {
      console.warn(`[Stripe Webhook] No orderId in metadata for ${eventType}`);
    }
  }

  if (eventId) await markProcessed(eventId);
  return c.json({ received: true });
});

// ─── Validação de assinatura Stripe (HMAC-SHA256 manual) ─────────────────────

async function verifySignature(payload: string, sigHeader: string, secret: string): Promise<boolean> {
  try {
    const parts: Record<string, string> = {};
    for (const part of sigHeader.split(',')) {
      const eq = part.indexOf('=');
      if (eq < 0) continue;
      parts[part.slice(0, eq).trim()] = part.slice(eq + 1).trim();
    }
    const ts = parts['t'];
    const v1 = parts['v1'];
    if (!ts || !v1) return false;

    // Tolerância de ±5 minutos
    if (Math.abs(Date.now() / 1000 - Number(ts)) > 300) {
      console.warn('[Stripe] Webhook timestamp too old');
      return false;
    }

    const enc     = new TextEncoder();
    const key     = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const sig     = await crypto.subtle.sign('HMAC', key, enc.encode(`${ts}.${payload}`));
    const computed = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
    return computed === v1;
  } catch (e) {
    console.error('[Stripe] Signature error:', e);
    return false;
  }
}