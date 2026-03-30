import { Hono } from 'npm:hono';
import * as kv from './kv_store.tsx';
import { appendOrderEvent } from './audit.tsx';
import { validateCouponInternal } from './coupons.tsx';

export const checkout = new Hono();

const CONFIG_KEY = 'meta:payment_config';

// ─── Coupon re-validation (server always re-calculates — never trusts frontend) ─
async function revalidateCoupon(body: any): Promise<{
  couponCode:      string | null;
  discountValue:   number;
  shippingDiscount: number;
  totalDiscount:   number;
  freeShipping:    boolean;
}> {
  const code = body.couponCode ? String(body.couponCode).trim().toUpperCase() : null;
  if (!code) return { couponCode: null, discountValue: 0, shippingDiscount: 0, totalDiscount: 0, freeShipping: false };

  const subtotal      = Number(body.subtotal ?? body.totals?.subtotal ?? 0);
  const shippingValue = Number(body.shippingValue ?? body.shipping?.price ?? 0);
  const email         = body.customer?.email || '';
  const items         = (body.items || []).map((i: any) => ({
    sku:        i.id || i.sku,
    qty:        i.quantity || i.qty || 1,
    unitPrice:  i.price || i.unitPrice || 0,
    categoryId: i.categoryId,
  }));

  const { ok, result } = await validateCouponInternal(code, email, subtotal, shippingValue, items);
  if (!ok || !result) {
    console.warn(`[Checkout] Coupon ${code} failed re-validation — discount zeroed.`);
    return { couponCode: null, discountValue: 0, shippingDiscount: 0, totalDiscount: 0, freeShipping: false };
  }

  return {
    couponCode:      code,
    discountValue:   result.discountValue,
    shippingDiscount: result.shippingDiscount,
    totalDiscount:   result.totalDiscount,
    freeShipping:    result.freeShipping,
  };
}

// Unified checkout route
checkout.post('/create', async (c) => {
  try {
    const body   = await c.req.json();
    const config = await kv.get(CONFIG_KEY) || { activeProvider: 'asaas' };

    console.log(`[Checkout] Provider lock active: asaas (stored=${config.activeProvider || 'asaas'}), orderId: ${body.orderId}, total: ${body.totals?.total}, couponCode: ${body.couponCode || 'none'}`);

    // Server-side coupon re-validation before dispatching to any provider
    const couponResult = await revalidateCoupon(body);
    const enrichedBody = { ...body, ...couponResult };

    console.log(`[Checkout] After coupon re-validation: discountValue=${couponResult.discountValue}, shippingDiscount=${couponResult.shippingDiscount}, freeShipping=${couponResult.freeShipping}`);

    return await createAsaasCheckout(enrichedBody, c);
  } catch (err: any) {
    console.error('[Checkout API Error]:', err);
    return c.json({ success: false, error: err.message }, 500);
  }
});

async function createAsaasCheckout(body: any, c: any) {
  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  const projectId = supabaseUrl.match(/https:\/\/([^.]+)\./)?.[1] || '';
  
  if (!projectId) {
     console.error('[Checkout] Could not determine project ID from SUPABASE_URL');
     throw new Error('Configuração de servidor inválida (Project ID missing)');
  }

  const host = `${projectId}.supabase.co`;
  const url = `https://${host}/functions/v1/make-server-1d6e33e0/asaas/create-asaas-checkout`;
  
  console.log(`[Checkout] Proxying to Asaas: ${url}`);
  
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': c.req.header('Authorization') || ''
    },
    body: JSON.stringify(body)
  });
  
  if (!res.ok) {
    const text = await res.text();
    console.error(`[Checkout] Asaas Error ${res.status}: ${text}`);
    try {
        const json = JSON.parse(text);
        return c.json(json, res.status);
    } catch {
        return c.json({ success: false, error: `Erro no provedor de pagamento: ${text}` }, res.status);
    }
  }
  
  return c.json(await res.json());
}

async function createVindiCheckout(body: any, vindiConfig: any, c: any) {
  const VINDI_API_KEY = Deno.env.get('VINDI_API_KEY') || vindiConfig?.apiKey;
  if (!VINDI_API_KEY) throw new Error('VINDI_API_KEY não configurado');
  
  const isSandbox = vindiConfig?.sandbox !== false;
  const baseUrl = isSandbox ? 'https://sandbox-app.vindi.com.br/api/v1' : 'https://app.vindi.com.br/api/v1';
  const auth = btoa(`${VINDI_API_KEY.trim()}:`);

  const { customer, orderId, items, totals, address, shipping } = body;

  // 1. Create Customer in Vindi (Vindi doesn't have an "update" flow — create is idempotent by email)
  const customerRes = await fetch(`${baseUrl}/customers`, {
    method: 'POST',
    headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name:          customer.name,
      email:         customer.email,
      registry_code: customer.document?.replace(/\D/g, ''),
      address: {
        street:             address.street,
        number:             address.number,
        additional_details: address.complement,
        zipcode:            address.cep?.replace(/\D/g, ''),
        neighborhood:       address.district,
        city:               address.city,
        state:              address.state,
        country:            'BR',
      },
    }),
  });
  const vindiCustomer = await customerRes.json();
  if (!customerRes.ok) throw new Error(`Erro Vindi (Customer): ${JSON.stringify(vindiCustomer)}`);

  // 2. Create Bill with order_id in metadata (required for webhook lookup)
  const billRes = await fetch(`${baseUrl}/bills`, {
    method: 'POST',
    headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      customer_id:         vindiCustomer.customer.id,
      payment_method_code: 'online_bank_transfer',
      bill_items: items.map((i: any) => ({
        product_code: i.id || i.sku,
        amount:       i.price || i.unitPrice,
        quantity:     i.quantity || i.qty || 1,
        description:  i.description || i.name,
      })),
      metadata: {
        order_id: orderId,   // used by /vindi/webhook to look up the order
        source:   'Toyoparts',
      },
    }),
  });
  const bill = await billRes.json();
  if (!billRes.ok) throw new Error(`Erro Vindi (Bill): ${JSON.stringify(bill)}`);

  // 3. Save order with dual status fields + payment_provider
  const now = new Date().toISOString();
  await kv.set(`order:${orderId}`, {
    orderId,
    payment_provider:   'vindi',
    payment_status:     'waiting_payment',
    fulfillment_status: 'pending',
    status:             'waiting_payment',   // legacy compatibility
    vindi_bill_id:      bill.bill.id,
    vindi_url:          bill.bill.url,
    customer,
    address,
    items,
    totals,
    shipping: shipping || null,
    createdAt: now,
    created_at: now,
  });

  // Order event: created (consistent with Asaas and Stripe)
  await appendOrderEvent(orderId, 'order.created', {
    payment_provider: 'vindi',
    vindi_bill_id:    bill.bill.id,
    total:            totals?.total,
  }, 'system');

  console.log(`[Checkout] Vindi bill created for order ${orderId}: ${bill.bill.id}`);

  return c.json({
    success:     true,
    checkoutUrl: bill.bill.url,
    orderId,
  });
}

async function createStripeCheckout(body: any, c: any) {
  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  const projectId   = supabaseUrl.match(/https:\/\/([^.]+)\./)?.[1] || '';

  if (!projectId) throw new Error('Configuração de servidor inválida (Project ID missing)');

  const url = `https://${projectId}.supabase.co/functions/v1/make-server-1d6e33e0/stripe/create-checkout`;

  console.log(`[Checkout] Proxying to Stripe: ${url}`);

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': c.req.header('Authorization') || '',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error(`[Checkout] Stripe Error ${res.status}: ${text}`);
    try {
      return c.json(JSON.parse(text), res.status);
    } catch {
      return c.json({ success: false, error: `Erro no provedor de pagamento: ${text}` }, res.status);
    }
  }

  return c.json(await res.json());
}
