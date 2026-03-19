// ─── Vindi Payment Integration ───────────────────────────────────────────────
// POST /vindi/webhook  — receives Vindi events with full idempotency guard
//
// Vindi webhook events → internal payment_status mapping:
//   bill_paid            → paid
//   bill_canceled        → canceled
//   charge_rejected      → overdue
//   bill_created         → waiting_payment
//   bill_refunded        → refunded
//
// Idempotency: event IDs stored at webhook_dedup:vindi:{id}
// Order lookup: bill.metadata.order_id (set during bill creation)

import { Hono } from 'npm:hono';
import * as kv from './kv_store.tsx';
import { appendOrderEvent } from './audit.tsx';

export const vindi = new Hono();

const DEDUP_PREFIX = 'webhook_dedup:vindi:';
const CONFIG_KEY   = 'meta:payment_config';

// ─── Idempotency ─────────────────────────────────────────────────────────────

async function isDuplicate(eventId: string): Promise<boolean> {
  try { return !!(await kv.get(`${DEDUP_PREFIX}${eventId}`)); }
  catch { return false; }
}

async function markProcessed(eventId: string): Promise<void> {
  try {
    await kv.set(`${DEDUP_PREFIX}${eventId}`, { processed_at: new Date().toISOString() });
  } catch (e) {
    console.warn('[Vindi] Failed to mark dedup:', e);
  }
}

// ─── Status Map ──────────────────────────────────────────────────────────────

function mapEvent(event: string): string | null {
  const map: Record<string, string> = {
    bill_paid:       'paid',
    bill_canceled:   'canceled',
    charge_rejected: 'overdue',
    bill_created:    'waiting_payment',
    bill_refunded:   'refunded',
  };
  return map[event] ?? null;
}

// ─── POST /vindi/webhook ─────────────────────────────────────────────────────

vindi.post('/webhook', async (c) => {
  try {
    const payload = await c.req.json();

    const event   = payload.event?.type || payload.type || payload.event;
    const eventId = payload.id || payload.event?.id;
    const data    = payload.data || payload.event?.data || {};

    console.log(`[Vindi Webhook] event=${event} id=${eventId}`);

    if (!event) return c.json({ received: true, ignored: 'no event type' });

    // ── Idempotency check ────────────────────────────────────────────────────
    if (eventId && await isDuplicate(String(eventId))) {
      console.log(`[Vindi Webhook] Duplicate event ${eventId}, skipping`);
      return c.json({ received: true, status: 'deduplicated', event_id: eventId });
    }

    // ── Map event → status ───────────────────────────────────────────────────
    const newStatus = mapEvent(event);

    if (newStatus) {
      // Order ID is stored in bill.metadata.order_id at creation time
      const bill    = data.bill || data.charge?.bill || data;
      const orderId = bill?.metadata?.order_id
                   || bill?.code           // fallback: sometimes bill code = orderId
                   || null;

      if (orderId) {
        const orderKey = `order:${orderId}`;
        const order    = await kv.get(orderKey);

        if (order) {
          const prevStatus = order.payment_status || order.status;
          if (prevStatus !== newStatus) {
            await kv.set(orderKey, {
              ...order,
              payment_status: newStatus,
              status:         newStatus,   // legacy compatibility
              updatedAt:      new Date().toISOString(),
              last_payment_event: event,
            });
            console.log(`[Vindi Webhook] Order ${orderId}: payment_status → ${newStatus}`);

            // Order event timeline
            await appendOrderEvent(orderId, 'payment.status_changed', {
              from:             prevStatus,
              to:               newStatus,
              payment_provider: 'vindi',
              gateway_event:    event,
              bill_id:          bill?.id,
            }, 'webhook');
          } else {
            console.log(`[Vindi Webhook] Order ${orderId} already at ${newStatus}, no change`);
            await appendOrderEvent(orderId, 'payment.webhook_received', {
              event,
              payment_status_unchanged: newStatus,
              bill_id: bill?.id,
            }, 'webhook');
          }
        } else {
          console.warn(`[Vindi Webhook] Order ${orderId} not found in KV`);
        }
      } else {
        console.warn(`[Vindi Webhook] Event ${event} has no order_id in metadata`);
      }
    } else {
      console.log(`[Vindi Webhook] Unmapped event ${event}, no status change`);
    }

    // ── Mark as processed ────────────────────────────────────────────────────
    if (eventId) await markProcessed(String(eventId));

    return c.json({ received: true, event, status_mapped: newStatus });
  } catch (err: any) {
    console.error('[Vindi Webhook Error]:', err.message);
    // Always return 200 to stop Vindi from retrying on logic errors
    return c.json({ received: true, error: err.message }, 200);
  }
});

// ─── GET /vindi/health ───────────────────────────────────────────────────────

vindi.get('/health', async (c) => {
  try {
    const config    = await kv.get(CONFIG_KEY) || {};
    const VINDI_KEY = Deno.env.get('VINDI_API_KEY') || config.vindi?.apiKey;
    if (!VINDI_KEY) return c.json({ ok: false, error: 'VINDI_API_KEY não configurado' });

    const isSandbox = config.vindi?.sandbox !== false;
    const baseUrl   = isSandbox
      ? 'https://sandbox-app.vindi.com.br/api/v1'
      : 'https://app.vindi.com.br/api/v1';

    const auth = btoa(`${VINDI_KEY.trim()}:`);
    const res  = await fetch(`${baseUrl}/merchants`, {
      headers: { Authorization: `Basic ${auth}` },
      signal:  AbortSignal.timeout(6000),
    });

    if (res.ok) return c.json({ ok: true, sandbox: isSandbox });
    const txt = await res.text().catch(() => '');
    return c.json({ ok: false, error: `Vindi ${res.status}: ${txt}` });
  } catch (err: any) {
    return c.json({ ok: false, error: err.message });
  }
});