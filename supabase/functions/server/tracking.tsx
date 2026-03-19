// ─── Tracking Enterprise (Server-Side Event Relay) ──────────────────────────
// Endpoint central para receber eventos do frontend, validar, deduplicar,
// gravar log, e fazer relay para Meta CAPI / Google Ads.
//
// Decisoes nao negociaveis:
//   - Purchase so via webhook /purchase-confirmed (paid_confirmed)
//   - Deduplicacao por event_id (nunca enviar 2x o mesmo evento)
//   - Idempotencia por transaction_id (nunca 2 purchases para mesmo pedido)
//   - Consent-aware: so envia para destinos se consent.ads === true

import { Hono } from 'npm:hono';
import * as kv from './kv_store.tsx';

const app = new Hono();

// ─── Schema Version ─────────────────────────────────────────────────────────

const CURRENT_SCHEMA_VERSION = '1.0';

// ─── Valid Event Names ──────────────────────────────────────────────────────

const VALID_EVENTS = new Set([
  'page_view',
  'view_item',
  'add_to_cart',
  'remove_from_cart',
  'begin_checkout',
  'purchase',         // ONLY via /purchase-confirmed
  'refund',           // ONLY via server
  'whatsapp_click',
  'search_performed',
  'search_result_click',
  'search_zero_results',
]);

// ─── Event Validation ───────────────────────────────────────────────────────

interface TrackingEvent {
  event_name: string;
  event_id: string;
  event_time: string;
  schema_version: string;
  session_id: string;
  anonymous_id?: string;
  user_id?: string;
  page_url?: string;
  page_path?: string;
  referrer?: string;
  attribution?: {
    gclid?: string;
    gbraid?: string;
    wbraid?: string;
    fbclid?: string;
    fbp?: string;
    fbc?: string;
    utm_source?: string;
    utm_medium?: string;
    utm_campaign?: string;
  };
  consent?: {
    ads?: boolean;
    analytics?: boolean;
    timestamp?: string;
  };
  ecommerce?: {
    currency?: string;
    value?: number;
    transaction_id?: string;
    items?: Array<{
      item_id: string;
      name?: string;
      price?: number;
      quantity?: number;
      category?: string;
      brand?: string;
    }>;
  };
}

function validateEvent(event: any): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!event.event_name) errors.push('event_name required');
  if (!VALID_EVENTS.has(event.event_name)) errors.push(`Invalid event_name: ${event.event_name}`);
  if (!event.event_id) errors.push('event_id required');
  if (!event.session_id) errors.push('session_id required');

  // Purchase MUST have transaction_id + value + currency + items
  if (event.event_name === 'purchase') {
    if (!event.ecommerce?.transaction_id) errors.push('purchase requires ecommerce.transaction_id');
    if (event.ecommerce?.value == null) errors.push('purchase requires ecommerce.value');
    if (!event.ecommerce?.currency) errors.push('purchase requires ecommerce.currency');
    if (!event.ecommerce?.items?.length) errors.push('purchase requires ecommerce.items[]');
  }

  // view_item needs item_id
  if (event.event_name === 'view_item') {
    if (!event.ecommerce?.items?.[0]?.item_id) errors.push('view_item requires items[0].item_id');
  }

  return { valid: errors.length === 0, errors };
}

// ─── Deduplication ──────────────────────────────────────────────────────────

const DEDUP_TTL = 3600000; // 1 hour
const DEDUP_PREFIX = 'event_dedup:';

async function isDuplicate(eventId: string): Promise<boolean> {
  try {
    const existing = await kv.get(`${DEDUP_PREFIX}${eventId}`);
    return !!existing;
  } catch {
    return false;
  }
}

async function markProcessed(eventId: string): Promise<void> {
  try {
    await kv.set(`${DEDUP_PREFIX}${eventId}`, {
      processed_at: new Date().toISOString(),
    });
  } catch (e) {
    console.warn(`[Tracking] Failed to mark dedup for ${eventId}:`, e);
  }
}

// ─── Purchase Idempotency ───────────────────────────────────────────────────

const PURCHASE_PREFIX = 'purchase_sent:';

async function isPurchaseSent(transactionId: string): Promise<boolean> {
  try {
    const existing = await kv.get(`${PURCHASE_PREFIX}${transactionId}`);
    return !!existing;
  } catch {
    return false;
  }
}

async function markPurchaseSent(transactionId: string, eventId: string): Promise<void> {
  try {
    await kv.set(`${PURCHASE_PREFIX}${transactionId}`, {
      event_id: eventId,
      sent_at: new Date().toISOString(),
    });
  } catch (e) {
    console.warn(`[Tracking] Failed to mark purchase sent for ${transactionId}:`, e);
  }
}

// ─── Event Logging ──────────────────────────────────────────────────────────

const EVENT_LOG_PREFIX = 'event_log:';

async function logEvent(event: TrackingEvent, meta: { source: string; deduped: boolean; relayed_to: string[] }): Promise<void> {
  try {
    const key = `${EVENT_LOG_PREFIX}${event.event_id}`;
    await kv.set(key, {
      ...event,
      _meta: {
        ...meta,
        logged_at: new Date().toISOString(),
      },
    });
  } catch (e) {
    console.warn(`[Tracking] Failed to log event ${event.event_id}:`, e);
  }
}

// ─── POST /track — Recebe eventos do frontend ──────────────────────────────

app.post('/track', async (c) => {
  try {
    const event: TrackingEvent = await c.req.json();

    // 1. Validate
    const validation = validateEvent(event);
    if (!validation.valid) {
      return c.json({ error: 'Validation failed', details: validation.errors }, 400);
    }

    // 2. Block purchase from client (must come from /purchase-confirmed)
    if (event.event_name === 'purchase') {
      return c.json({
        error: 'Purchase events must be sent via /purchase-confirmed webhook, not from client.',
        hint: 'Use begin_checkout from client. Purchase is confirmed server-side when payment is verified.',
      }, 403);
    }

    // 3. Check dedup
    if (await isDuplicate(event.event_id)) {
      return c.json({ status: 'deduplicated', event_id: event.event_id });
    }

    // 4. Normalize
    event.event_time = event.event_time || new Date().toISOString();
    event.schema_version = CURRENT_SCHEMA_VERSION;

    // 5. Log
    const relayedTo: string[] = [];
    await logEvent(event, { source: 'client', deduped: false, relayed_to: relayedTo });

    // 6. Mark as processed
    await markProcessed(event.event_id);

    // 7. Relay to destinations (Meta CAPI / Google) — placeholder for Phase 2
    // This is where we'd call Meta Conversions API and Google Ads API
    // For now, we just log and store.
    // if (event.consent?.ads) {
    //   await sendToMetaCAPI(event);
    //   await sendToGoogleAds(event);
    // }

    console.log(`[Tracking] ${event.event_name} | session=${event.session_id?.slice(0, 8)} | event_id=${event.event_id.slice(0, 8)}`);

    return c.json({
      status: 'ok',
      event_id: event.event_id,
      event_name: event.event_name,
      logged: true,
    });

  } catch (err: any) {
    console.error('[Tracking] Error:', err.message);
    return c.json({ error: `Tracking error: ${err.message}` }, 500);
  }
});

// ─── POST /purchase-confirmed — Webhook do gateway (Asaas) ─────────────────
// Esta rota e chamada pelo gateway de pagamento quando o pagamento e confirmado.
// E a UNICA forma de gerar um evento Purchase valido.

app.post('/purchase-confirmed', async (c) => {
  try {
    const body = await c.req.json();

    // Espera: { transaction_id, order_id, value, currency, items[], user_data?, attribution? }
    const {
      transaction_id,
      order_id,
      value,
      currency = 'BRL',
      items = [],
      user_data,
      attribution,
      event_id: clientEventId,
    } = body;

    if (!transaction_id) {
      return c.json({ error: 'transaction_id required' }, 400);
    }
    if (value == null) {
      return c.json({ error: 'value required' }, 400);
    }

    // 1. Idempotency check
    if (await isPurchaseSent(transaction_id)) {
      console.log(`[Tracking] Purchase already sent for transaction ${transaction_id}, skipping.`);
      return c.json({ status: 'already_sent', transaction_id });
    }

    // 2. Generate deterministic event_id (or use client's)
    const eventId = clientEventId || `purchase-${transaction_id}`;

    // 3. Build purchase event
    const purchaseEvent: TrackingEvent = {
      event_name: 'purchase',
      event_id: eventId,
      event_time: new Date().toISOString(),
      schema_version: CURRENT_SCHEMA_VERSION,
      session_id: body.session_id || 'server',
      user_id: body.user_id,
      attribution: attribution || {},
      consent: { ads: true, analytics: true }, // Server-side, consent already given at checkout
      ecommerce: {
        currency,
        value,
        transaction_id,
        items: items.map((item: any) => ({
          item_id: item.sku || item.item_id,
          name: item.name,
          price: item.price,
          quantity: item.quantity || 1,
          category: item.category,
          brand: item.brand || 'Toyota',
        })),
      },
    };

    // 4. Log
    const relayedTo: string[] = [];

    // 5. Send to Meta CAPI (Phase 2)
    // if (attribution?.fbp || attribution?.fbc) {
    //   await sendToMetaCAPI(purchaseEvent, user_data);
    //   relayedTo.push('meta_capi');
    // }

    // 6. Send to Google Ads (Phase 2)
    // if (attribution?.gclid) {
    //   await sendToGoogleEnhanced(purchaseEvent, user_data);
    //   relayedTo.push('google_ads');
    // }

    await logEvent(purchaseEvent, { source: 'webhook', deduped: false, relayed_to: relayedTo });

    // 7. Mark as sent
    await markPurchaseSent(transaction_id, eventId);

    console.log(`[Tracking] PURCHASE CONFIRMED | tx=${transaction_id} | value=${value} ${currency} | items=${items.length}`);

    return c.json({
      status: 'purchase_confirmed',
      transaction_id,
      event_id: eventId,
      value,
      items_count: items.length,
      relayed_to: relayedTo,
    });

  } catch (err: any) {
    console.error('[Tracking] Purchase confirmed error:', err.message);
    return c.json({ error: `Purchase confirmation error: ${err.message}` }, 500);
  }
});

// ─── POST /refund — Evento de reembolso ─────────────────────────────────────

app.post('/refund', async (c) => {
  try {
    const body = await c.req.json();
    const { transaction_id, value, reason } = body;

    if (!transaction_id) {
      return c.json({ error: 'transaction_id required' }, 400);
    }

    const eventId = `refund-${transaction_id}-${Date.now()}`;

    const refundEvent: TrackingEvent = {
      event_name: 'refund',
      event_id: eventId,
      event_time: new Date().toISOString(),
      schema_version: CURRENT_SCHEMA_VERSION,
      session_id: 'server',
      ecommerce: {
        transaction_id,
        value: value || 0,
        currency: 'BRL',
      },
    };

    await logEvent(refundEvent, { source: 'server', deduped: false, relayed_to: [] });

    console.log(`[Tracking] REFUND | tx=${transaction_id} | value=${value} | reason=${reason || 'N/A'}`);

    return c.json({ status: 'refund_logged', transaction_id, event_id: eventId });

  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// ─── GET /tracking/stats — Estatisticas de eventos ──────────────────────────

app.get('/stats', async (c) => {
  try {
    const logs = await kv.getByPrefix(EVENT_LOG_PREFIX);
    const purchases = await kv.getByPrefix(PURCHASE_PREFIX);

    const eventCounts: Record<string, number> = {};
    for (const log of (logs || [])) {
      const val = log?.value || log;
      const name = val?.event_name || 'unknown';
      eventCounts[name] = (eventCounts[name] || 0) + 1;
    }

    return c.json({
      total_events_logged: logs?.length || 0,
      total_purchases_confirmed: purchases?.length || 0,
      event_counts: eventCounts,
    });
  } catch (err: any) {
    return c.json({ error: err.message, total_events_logged: 0, total_purchases_confirmed: 0 }, 500);
  }
});

export { app as tracking };
