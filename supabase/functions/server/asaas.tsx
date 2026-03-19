import { Hono } from 'npm:hono';
import { createClient } from "jsr:@supabase/supabase-js@2.49.8";
import * as kv from './kv_store.tsx';
import { appendOrderEvent } from './audit.tsx';

const ASAAS_API_KEY = Deno.env.get('ASAAS_API_KEY') || '';

// Config key from payments.tsx
const CONFIG_KEY = 'meta:payment_config';
const WEBHOOK_DEDUP_PREFIX = 'webhook_dedup:asaas:';

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

export const asaas = new Hono();

// Helper to resolve Asaas URL dynamically based on KV config
async function getAsaasBaseUrl() {
  try {
    const config = await kv.get(CONFIG_KEY);
    // Default to sandbox if not configured or if explicitly set to true
    const isSandbox = config?.asaas?.sandbox !== false; 
    return isSandbox 
      ? 'https://sandbox.asaas.com/api/v3' 
      : 'https://api.asaas.com/v3';
  } catch (err) {
    console.error('[Asaas] Error reading config, defaulting to Sandbox:', err);
    return 'https://sandbox.asaas.com/api/v3';
  }
}

// Helper to call Asaas
async function asaasFetch(path: string, options: RequestInit = {}) {
  const baseUrl = await getAsaasBaseUrl();
  const url = `${baseUrl}${path}`;
  console.log(`[Asaas] Requesting: ${url}`);
  
  const res = await fetch(url, {
    ...options,
    headers: {
      'access_token': ASAAS_API_KEY,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  
  if (!res.ok) {
    const errorBody = await res.text();
    console.error(`Asaas API Error [${path}]:`, res.status, errorBody);
    throw new Error(`Asaas API Error: ${res.status} - ${errorBody}`);
  }
  
  return res.json();
}

/**
 * 1. Find or Create Customer in Asaas
 */
async function getOrCreateAsaasCustomer(data: {
  name: string;
  email: string;
  cpfCnpj: string;
  mobilePhone?: string;
  address?: any;
}) {
  const cleanCpfCnpj = data.cpfCnpj.replace(/\D/g, '');
  const addr = data.address || {};
  
  const customerPayload = {
    name: data.name,
    email: data.email,
    mobilePhone: data.mobilePhone,
    cpfCnpj: cleanCpfCnpj,
    postalCode: addr.cep?.replace(/\D/g, ''),
    address: addr.street,
    addressNumber: addr.number,
    complement: addr.complement,
    province: addr.district,
  };

  try {
    // Try to find by CPF/CNPJ
    const list = await asaasFetch(`/customers?cpfCnpj=${cleanCpfCnpj}`);
    if (list.data && list.data.length > 0) {
      const customerId = list.data[0].id;
      console.log(`[Asaas] Found existing customer: ${customerId}`);
      // Update existing
      return asaasFetch(`/customers/${customerId}`, {
        method: 'POST',
        body: JSON.stringify(customerPayload),
      });
    }
  } catch (err) {
    console.warn(`[Asaas] Error searching customer, proceeding to create:`, err.message);
  }
  
  console.log(`[Asaas] Creating new customer: ${data.name}`);
  // Create new
  return asaasFetch('/customers', {
    method: 'POST',
    body: JSON.stringify(customerPayload),
  });
}

/**
 * POST /checkout/create-asaas-checkout
 */
asaas.post('/create-asaas-checkout', async (c) => {
  try {
    const body = await c.req.json();
    const { customer, orderId, items, totals, address, shipping } = body;

    console.log(`[Asaas] Creating checkout for order ${orderId}`);

    // 1. Ensure Asaas Customer
    const asaasCustomer = await getOrCreateAsaasCustomer({
      name: customer.name,
      email: customer.email,
      cpfCnpj: customer.document,
      mobilePhone: customer.phone,
      address,
    });

    // 2. Create Payment
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 3);

    const descriptionText = items.map((i: any) => `${i.qty}x ${i.name}`).join(', ').slice(0, 250);

    const paymentPayload: any = {
      customer: asaasCustomer.id,
      billingType: 'UNDEFINED',
      value: totals.total,
      dueDate: dueDate.toISOString().split('T')[0],
      externalReference: orderId,
      description: `Pedido ${orderId.slice(0,8)} - Toyoparts`,
      observations: descriptionText,
    };

    // If we have a walletId in env, use it. Otherwise Asaas uses the default account wallet.
    const WALLET_ID = Deno.env.get('ASAAS_WALLET_ID');
    if (WALLET_ID) {
      paymentPayload.walletId = WALLET_ID;
    }

    const payment = await asaasFetch('/payments', {
      method: 'POST',
      body: JSON.stringify(paymentPayload),
    });

    // 3. Save order with dual status fields + payment_provider
    const now = new Date().toISOString();
    const orderData = {
      orderId,
      payment_provider:    'asaas',
      payment_status:      'waiting_payment',
      fulfillment_status:  'pending',
      status:              'waiting_payment',   // legacy compatibility
      asaas_payment_id:    payment.id,
      asaas_invoice_url:   payment.invoiceUrl,
      customer,
      address,
      items,
      totals,
      shipping: shipping || null,
      createdAt: now,
      created_at: now,
    };
    
    await kv.set(`order:${orderId}`, orderData);

    // Order event: created
    await appendOrderEvent(orderId, 'order.created', {
      payment_provider:  'asaas',
      asaas_payment_id:  payment.id,
      total:             totals?.total,
    }, 'system');

    return c.json({ 
      success: true, 
      checkoutUrl: payment.invoiceUrl,
      orderId
    });
  } catch (error: any) {
    console.error('[Asaas Checkout Error]:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

/**
 * POST /webhook
 */
asaas.post('/webhook', async (c) => {
  try {
    const payload = await c.req.json();
    const event   = payload.event; 
    const payment = payload.payment;
    // Asaas uses payment.id as the stable event dedup key
    const eventKey = `${event}:${payment?.id || 'unknown'}`;

    console.log(`[Asaas Webhook] Received event ${event}`);

    // Some events might not have a payment object or might be test/ping events
    if (!payment || !payment.externalReference) {
      console.log(`[Asaas Webhook] Event ${event} ignored (no payment/externalReference)`);
      return c.json({ received: true });
    }

    // ── Idempotency: skip already-processed events ───────────────────────────
    if (await isWebhookDuplicate(eventKey)) {
      console.log(`[Asaas Webhook] Duplicate event ${eventKey}, skipping`);
      return c.json({ received: true, status: 'deduplicated' });
    }

    const orderId    = payment.externalReference;
    const orderKey   = `order:${orderId}`;
    const existing   = await kv.get(orderKey);

    if (existing) {
      let newPaymentStatus = existing.payment_status || existing.status;

      switch (event) {
        case 'PAYMENT_RECEIVED':
        case 'PAYMENT_CONFIRMED':
          newPaymentStatus = 'paid';
          break;
        case 'PAYMENT_OVERDUE':
          newPaymentStatus = 'overdue';
          break;
        case 'PAYMENT_REFUNDED':
          newPaymentStatus = 'refunded';
          break;
        case 'PAYMENT_DELETED':
        case 'PAYMENT_CHARGEBACK_REQUESTED':
          newPaymentStatus = 'canceled';
          break;
      }

      const prevStatus = existing.payment_status || existing.status;
      if (newPaymentStatus !== prevStatus) {
        await kv.set(orderKey, {
          ...existing,
          payment_status:     newPaymentStatus,
          status:             newPaymentStatus,   // legacy compatibility
          updatedAt:          new Date().toISOString(),
          last_payment_event: event,
        });
        console.log(`[Asaas Webhook] Order ${orderId} payment_status → ${newPaymentStatus}`);

        // Order event: payment status changed
        await appendOrderEvent(orderId, 'payment.status_changed', {
          from:           prevStatus,
          to:             newPaymentStatus,
          payment_provider: 'asaas',
          gateway_event:  event,
          payment_id:     payment?.id,
        }, 'webhook');
      } else {
        await appendOrderEvent(orderId, 'payment.webhook_received', {
          event,
          payment_status_unchanged: newPaymentStatus,
          payment_id: payment?.id,
        }, 'webhook');
      }
    } else {
      console.warn(`[Asaas Webhook] Order ${orderId} not found in KV`);
    }

    // Mark event as processed
    await markWebhookProcessed(eventKey);

    return c.json({ received: true });
  } catch (error: any) {
    console.error('[Asaas Webhook Error]:', error);
    return c.json({ success: false, error: error.message }, 200);
  }
});

/**
 * GET /orders-list
 */
asaas.get('/orders-list', async (c) => {
  try {
    const allOrders = await kv.getByPrefix('order:');
    
    // Filter and normalize
    const orders = allOrders
      .filter(o => o && typeof o === 'object' && o.orderId)
      .map(o => ({
        ...o,
        createdAt: o.createdAt || o.created_at || new Date(0).toISOString(),
      }));
    
    // Sort by date desc
    orders.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    
    return c.json({ success: true, orders });
  } catch (error: any) {
    console.error('[Admin Orders Error]:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

// ─── Webhook Idempotency ─────────────────────────────────────────────────────
async function isWebhookDuplicate(eventId: string): Promise<boolean> {
  try { return !!(await kv.get(`${WEBHOOK_DEDUP_PREFIX}${eventId}`)); }
  catch { return false; }
}
async function markWebhookProcessed(eventId: string): Promise<void> {
  try {
    await kv.set(`${WEBHOOK_DEDUP_PREFIX}${eventId}`, { processed_at: new Date().toISOString() });
  } catch (e) { console.warn('[Asaas] Failed to mark webhook dedup:', e); }
}