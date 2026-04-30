// ─── Orders — Unified Order Management ───────────────────────────────────────
// GET  /orders           → list all orders (provider-agnostic)
// GET  /orders/:id       → order detail with carrier enrichment
// PATCH /orders/:id/tracking   → save tracking + trigger email (non-blocking)
// PATCH /orders/:id/fulfillment → status transition with guard rules

import { Hono } from 'npm:hono';
import * as kv from './kv_store.tsx';
import { getCarriers, matchCarrier } from './carriers.tsx';
import { logAuditEvent, appendOrderEvent } from './audit.tsx';
import { compareOrderRecordDateDesc, isStoreOrderRecord } from './order-records.tsx';
import { getOrdersReadModelEnabled, listOrderSummaries, listStoreOrdersFromSource, syncStoreOrderSummarySafe } from './order-read-model.tsx';
import { backupStoreOrderSafe, findStoreBackupOrderById, readStoreOrdersFromBackup } from './store-backup-orders.tsx';
import { sendResendEmail } from './resend-mailer.tsx';

export const orders = new Hono();

// ─── Types ───────────────────────────────────────────────────────────────────

export type PaymentStatus = 'waiting_payment' | 'paid' | 'overdue' | 'canceled' | 'refunded';
export type FulfillmentStatus = 'pending' | 'in_preparation' | 'shipped' | 'delivered' | 'canceled';

// ─── Status Transition Guard ─────────────────────────────────────────────────

const FULFILLMENT_TRANSITIONS: Record<FulfillmentStatus, FulfillmentStatus[]> = {
  pending:        ['in_preparation', 'shipped', 'canceled'],
  in_preparation: ['shipped', 'canceled'],
  shipped:        ['delivered'],
  delivered:      [],   // terminal
  canceled:       [],   // terminal
};

function validateFulfillmentTransition(from: FulfillmentStatus, to: FulfillmentStatus): { valid: boolean; error?: string } {
  const allowed = FULFILLMENT_TRANSITIONS[from] ?? [];
  if (!allowed.includes(to)) {
    const hint = allowed.length ? `Permitidas: ${allowed.join(', ')}` : 'Status terminal, nenhuma transição permitida.';
    return { valid: false, error: `Transição inválida: "${from}" → "${to}". ${hint}` };
  }
  return { valid: true };
}

// ─── Normalize legacy order (single `status` field → dual status) ─────────────

function normalizeOrder(order: any): any {
  return {
    ...order,
    payment_status:     order.payment_status     || order.status || 'waiting_payment',
    fulfillment_status: order.fulfillment_status || 'pending',
    payment_provider:   order.payment_provider   || 'asaas',
    order_source:       order.order_source       || 'checkout_web',
    lead_id:            order.lead_id            || null,
    createdAt:          order.createdAt || order.created_at || new Date(0).toISOString(),
  };
}

function isRecoverableReadError(error: any): boolean {
  const message = String(error?.message || error || '').toLowerCase();
  return (
    message.includes('schema cache') ||
    message.includes('retrying') ||
    message.includes('timed out') ||
    message.includes('abort') ||
    message.includes('maximum number of connections') ||
    message.includes('remaining connection slots are reserved') ||
    message.includes('too many clients')
  );
}

async function readStoreBackupOrdersPageForAdmin(
  page: number,
  limit: number,
  search: string,
  paymentStatus: string | null,
  fulfillmentStatus: string | null,
) {
  const backup = await readStoreOrdersFromBackup({
    page,
    limit,
    search,
    paymentStatus,
    fulfillmentStatus,
  });
  return {
    items: (backup.items || []).map((order: any) => normalizeOrder(order)),
    total: Number(backup.total || 0),
    page: Number(backup.page || page),
    limit: Number(backup.limit || limit),
    has_more: backup.has_more === true,
    source: backup.source,
  } as const;
}

// ─── Email: order_shipped ─────────────────────────────────────────────────────

async function sendShippedEmail(
  order: any,
  trackingCode: string,
  carrierName: string,
  trackingUrl: string | null,
): Promise<{ sent: boolean; error?: string }> {
  try {
    const RESEND_API = (Deno.env.get('RESEND_API') || '').trim();
    if (!RESEND_API) return { sent: false, error: 'RESEND_API não configurado' };

    const config       = await kv.get('resend:config') || {};
    const stored       = await kv.get('resend:template:order_shipped');
    const fromName     = config.from_name  || 'Toyoparts';
    const fromEmail    = config.from_email || 'noreply@toyoparts.com.br';
    const customerName = order.customer?.name  || 'Cliente';
    const customerEmail = order.customer?.email;

    if (!customerEmail) return { sent: false, error: 'E-mail do cliente não encontrado no pedido' };

    const shortId        = (order.orderId || '').slice(0, 8).toUpperCase();
    const estDays        = order.shipping?.estimatedDays;
    const estDelivery    = estDays ? `${estDays} dias úteis` : 'Consulte a transportadora';
    const trackingBtn    = trackingUrl
      ? `<div style="text-align:center;margin:24px 0;"><a href="${trackingUrl}" style="display:inline-block;background:#EB0A1E;color:#ffffff;text-decoration:none;font-size:16px;font-weight:700;padding:14px 36px;border-radius:12px;">Rastrear Pedido →</a></div>`
      : '';

    const defaultHtml = `
      <h2 style="margin:0 0 8px;font-size:28px;font-weight:700;color:#1d1d1f;">Seu pedido está a caminho! 🚚</h2>
      <p style="margin:0 0 28px;font-size:16px;color:#666;line-height:1.7;">Olá, <strong>{{name}}</strong>! Ótima notícia — seu pedido <strong>#{{order_id}}</strong> foi despachado e está em trânsito.</p>
      <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:20px 24px;margin:0 0 16px;">
        <p style="margin:0 0 6px;font-size:11px;color:#16a34a;text-transform:uppercase;letter-spacing:1px;font-weight:700;">Código de Rastreamento</p>
        <p style="margin:0;font-size:22px;font-weight:800;color:#1d1d1f;font-family:monospace;letter-spacing:2px;">{{tracking_code}}</p>
      </div>
      <div style="background:#f8f8f8;border-radius:12px;padding:16px 24px;margin:0 0 16px;">
        <p style="margin:0 0 4px;font-size:14px;color:#666;"><strong>Transportadora:</strong> {{carrier}}</p>
        <p style="margin:0;font-size:14px;color:#666;"><strong>Prazo estimado:</strong> {{estimated_delivery}}</p>
      </div>
      ${trackingBtn}
    `;

    const html = (stored?.html || defaultHtml)
      .replace(/\{\{name\}\}/g, customerName)
      .replace(/\{\{order_id\}\}/g, shortId)
      .replace(/\{\{tracking_code\}\}/g, trackingCode)
      .replace(/\{\{carrier\}\}/g, carrierName)
      .replace(/\{\{estimated_delivery\}\}/g, estDelivery);

    const subject = (stored?.subject || 'Seu pedido #{{order_id}} foi enviado! 🚚')
      .replace(/\{\{order_id\}\}/g, shortId);

    const { data } = await sendResendEmail({
      to: [customerEmail],
      subject,
      html,
      fromName,
      fromEmail,
    });
    console.log(`[Orders] order_shipped email sent: ${data.id} → ${customerEmail}`);
    return { sent: true };
  } catch (err: any) {
    return { sent: false, error: err.message };
  }
}

// ─── GET /orders ─────────────────────────────────────────────────────────────

orders.get('/', async (c) => {
  try {
    const enabled = await getOrdersReadModelEnabled();
    const page = Math.max(1, Number(c.req.query('page') || 1));
    const limit = Math.min(1000, Math.max(1, Number(c.req.query('limit') || 1000)));
    const search = String(c.req.query('search') || '').trim();
    const paymentStatus = String(c.req.query('payment_status') || '').trim() || null;
    const fulfillmentStatus = String(c.req.query('fulfillment_status') || '').trim() || null;

    try {
      if (enabled) {
        const result = await listOrderSummaries({
          recordKind: 'store_order',
          page,
          limit,
          search,
          paymentStatus,
          fulfillmentStatus,
        });

        return c.json({
          success: true,
          orders: result.items,
          total: result.total,
          page: result.page,
          limit: result.limit,
          has_more: result.has_more,
          source: 'read_model',
        });
      }

      const sourcePage = await listStoreOrdersFromSource({
        page,
        limit,
        search,
        paymentStatus,
        fulfillmentStatus,
      });

      const paged = (sourcePage.items || [])
        .filter((o: any) => isStoreOrderRecord(o))
        .map(normalizeOrder)
        .sort(compareOrderRecordDateDesc);

      if (paged.length > 0) {
        await Promise.all(paged.map((entry: any) => backupStoreOrderSafe(entry, 'orders_list_source')));
      }

      if (!paged.length && Number(sourcePage.total || 0) === 0) {
        const backup = await readStoreBackupOrdersPageForAdmin(page, limit, search, paymentStatus, fulfillmentStatus);
        if (backup.total > 0) {
          return c.json({
            success: true,
            orders: backup.items,
            total: backup.total,
            page: backup.page,
            limit: backup.limit,
            has_more: backup.has_more,
            source: backup.source,
          });
        }

        return c.json({
          success: true,
          orders: [],
          total: 0,
          page,
          limit,
          has_more: false,
          source: 'store_empty',
          degraded: true,
        });
      }

      return c.json({
        success: true,
        orders: paged,
        total: sourcePage.total,
        page: sourcePage.page,
        limit: sourcePage.limit,
        has_more: sourcePage.has_more,
        source: 'source_page',
      });
    } catch (readError: any) {
      if (isRecoverableReadError(readError)) {
        console.warn('[Orders] degraded list read:', readError);
        try {
          const backup = await readStoreBackupOrdersPageForAdmin(page, limit, search, paymentStatus, fulfillmentStatus);
          if (backup.total > 0) {
            return c.json({
              success: true,
              orders: backup.items,
              total: backup.total,
              page: backup.page,
              limit: backup.limit,
              has_more: backup.has_more,
              source: backup.source,
              degraded: true,
            });
          }

          return c.json({
            success: true,
            orders: [],
            total: 0,
            page,
            limit,
            has_more: false,
            source: enabled ? 'read_model_degraded' : 'source_page_degraded',
            degraded: true,
          });
        } catch (backupError) {
          console.warn('[Orders] store backup fallback failed:', backupError);
          return c.json({
            success: true,
            orders: [],
            total: 0,
            page,
            limit,
            has_more: false,
            source: enabled ? 'read_model_degraded' : 'source_page_degraded',
            degraded: true,
          });
        }
      }
      throw readError;
    }
  } catch (err: any) {
    console.error('[Orders] GET / error:', err);
    return c.json({ success: false, error: err.message }, 500);
  }
});

// ─── GET /orders/:id ─────────────────────────────────────────────────────────

orders.get('/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const order = await kv.get(`order:${id}`);
    if (!order) {
      const backupOrder = await findStoreBackupOrderById(id);
      const magentoBackupOrder = backupOrder;
      if (!magentoBackupOrder) return c.json({ error: 'Pedido não encontrado' }, 404);

      return c.json({
        success: true,
        order: normalizeOrder(backupOrder),
        source: 'store_backup',
      });
    }
    if (!order) return c.json({ error: 'Pedido não encontrado' }, 404);

    const normalized = normalizeOrder(order);
    await backupStoreOrderSafe(order, 'orders_detail_read');

    // Enrich with matched carrier config
    if (order.shipping?.carrier) {
      const list = await getCarriers();
      const matched = matchCarrier(list, order.shipping.carrier, order.shipping.service || '');
      if (matched) normalized.carrier_config = matched;
    }

    return c.json({ success: true, order: normalized });
  } catch (err: any) {
    console.error('[Orders] GET /:id error:', err);
    return c.json({ success: false, error: err.message }, 500);
  }
});

// ─── PATCH /orders/:id/tracking ──────────────────────────────────────────────
// Primary: save tracking. Secondary: email. Never block on email failure.

orders.patch('/:id/tracking', async (c) => {
  try {
    const id   = c.req.param('id');
    const body = await c.req.json();
    const { tracking_code, carrier_id, fulfillment_status, admin_email } = body;

    if (!tracking_code?.trim()) return c.json({ error: 'tracking_code é obrigatório' }, 400);

    const orderKey = `order:${id}`;
    const order = await kv.get(orderKey);
    if (!order) return c.json({ error: 'Pedido não encontrado' }, 404);

    // Validate fulfillment transition if provided
    const targetFulfillment = (fulfillment_status || 'shipped') as FulfillmentStatus;
    const currentFulfillment = (order.fulfillment_status || 'pending') as FulfillmentStatus;
    // Only validate if it's an actual change
    if (targetFulfillment !== currentFulfillment) {
      const { valid, error } = validateFulfillmentTransition(currentFulfillment, targetFulfillment);
      if (!valid) return c.json({ error }, 422);
    }

    // Resolve carrier config
    const carrierList = await getCarriers();
    let carrierConfig = carrier_id ? carrierList.find(cr => cr.id === carrier_id) || null : null;
    if (!carrierConfig && order.shipping?.carrier) {
      carrierConfig = matchCarrier(carrierList, order.shipping.carrier, order.shipping.service || '');
    }

    const carrierName = carrierConfig?.name || order.shipping?.carrier || 'Transportadora';
    const trackingUrl = carrierConfig?.tracking_url?.includes('{codigo}')
      ? carrierConfig.tracking_url.replace('{codigo}', tracking_code.trim())
      : null;

    // ── 1. SAVE tracking (always succeeds before email) ───────────────────────
    const now = new Date().toISOString();
    const updated = {
      ...order,
      tracking_code:     tracking_code.trim(),
      tracking_url:      trackingUrl,
      carrier_id:        carrier_id || carrierConfig?.id || null,
      carrier_name:      carrierName,
      fulfillment_status: targetFulfillment,
      shipped_at:        order.shipped_at || now,
      updatedAt:         now,
    };
    await kv.set(orderKey, updated);
    await syncStoreOrderSummarySafe(updated, 'orders_tracking_update');
    console.log(`[Orders] Tracking saved for order ${id}: ${tracking_code}`);

    // ── 2. SEND email (non-blocking — failure doesn't fail the request) ───────
    const emailResult = await sendShippedEmail(updated, tracking_code.trim(), carrierName, trackingUrl);
    if (emailResult.sent) {
      console.log(`[Orders] Email order_shipped sent for ${id}`);
    } else {
      console.warn(`[Orders] Email failed for ${id}: ${emailResult.error}`);
    }

    // ── 3. AUDIT + ORDER EVENTS ───────────────────────────────────────────────
    const prevTracking = order.tracking_code || null;
    await Promise.all([
      logAuditEvent({
        action:      'order.tracking.update',
        entity_type: 'order',
        entity_id:   id,
        admin_email: admin_email || undefined,
        before:      { tracking_code: prevTracking, fulfillment_status: currentFulfillment },
        after:       { tracking_code: tracking_code.trim(), fulfillment_status: targetFulfillment, carrier_name: carrierName },
        source:      'admin_ui',
      }),
      appendOrderEvent(id, 'tracking.code_saved', {
        tracking_code: tracking_code.trim(),
        carrier_name: carrierName,
        tracking_url: trackingUrl,
        fulfillment_status: targetFulfillment,
        previous_tracking_code: prevTracking,
      }, 'admin_ui'),
      appendOrderEvent(id, emailResult.sent ? 'tracking.email_sent' : 'tracking.email_failed', {
        recipient:     updated.customer?.email || 'unknown',
        carrier_name:  carrierName,
        tracking_code: tracking_code.trim(),
        ...(emailResult.error && { error: emailResult.error }),
      }, 'system'),
    ]);

    return c.json({
      success:       true,
      tracking_saved: true,
      email_sent:    emailResult.sent,
      email_error:   emailResult.error || null,
      tracking_url:  trackingUrl,
    });
  } catch (err: any) {
    console.error('[Orders] PATCH tracking error:', err);
    return c.json({ success: false, error: err.message }, 500);
  }
});

// ─── PATCH /orders/:id/fulfillment ───────────────────────────────────────────

orders.patch('/:id/fulfillment', async (c) => {
  try {
    const id = c.req.param('id');
    const { fulfillment_status, admin_email } = await c.req.json();
    if (!fulfillment_status) return c.json({ error: 'fulfillment_status é obrigatório' }, 400);

    const orderKey = `order:${id}`;
    const order = await kv.get(orderKey);
    if (!order) return c.json({ error: 'Pedido não encontrado' }, 404);

    const from = (order.fulfillment_status || 'pending') as FulfillmentStatus;
    const to   = fulfillment_status as FulfillmentStatus;
    const { valid, error } = validateFulfillmentTransition(from, to);
    if (!valid) return c.json({ error }, 422);

    const now = new Date().toISOString();
    const updated = {
      ...order,
      fulfillment_status: to,
      updatedAt: now,
      ...(to === 'shipped'   && !order.shipped_at   && { shipped_at: now }),
      ...(to === 'delivered' && !order.delivered_at && { delivered_at: now }),
    };
    await kv.set(orderKey, updated);
    console.log(`[Orders] Fulfillment ${id}: ${from} → ${to}`);

    await syncStoreOrderSummarySafe(updated, 'orders_fulfillment_update');

    // Audit + order events
    await Promise.all([
      logAuditEvent({
        action:      'order.fulfillment.update',
        entity_type: 'order',
        entity_id:   id,
        admin_email: admin_email || undefined,
        before:      { fulfillment_status: from },
        after:       { fulfillment_status: to },
        source:      'admin_ui',
      }),
      appendOrderEvent(id, 'fulfillment.status_changed', {
        from,
        to,
        ...(to === 'shipped'   && { shipped_at: now }),
        ...(to === 'delivered' && { delivered_at: now }),
      }, 'admin_ui'),
    ]);

    return c.json({ success: true, order: updated });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
});

// ─── POST /orders/:id/resend-email ────────────────────────────────────────────
// Reenvia o e-mail de rastreio para o cliente.

orders.post('/:id/resend-email', async (c) => {
  try {
    const id   = c.req.param('id');
    const body = await c.req.json().catch(() => ({}));
    const { admin_email } = body;

    const order = await kv.get(`order:${id}`);
    if (!order) return c.json({ error: 'Pedido não encontrado' }, 404);

    if (!order.tracking_code) {
      return c.json({ error: 'Pedido não possui código de rastreio. Insira o rastreio antes de reenviar.' }, 422);
    }

    const carrierName = order.carrier_name || order.shipping?.carrier || 'Transportadora';
    const trackingUrl = order.tracking_url || null;

    const emailResult = await sendShippedEmail(order, order.tracking_code, carrierName, trackingUrl);

    // Audit + order events
    await Promise.all([
      logAuditEvent({
        action:      'order.tracking.email_resent',
        entity_type: 'order',
        entity_id:   id,
        admin_email: admin_email || undefined,
        after:       { tracking_code: order.tracking_code, email_sent: emailResult.sent },
        source:      'admin_ui',
      }),
      appendOrderEvent(id, emailResult.sent ? 'tracking.email_sent' : 'tracking.email_failed', {
        resent:        true,
        recipient:     order.customer?.email || 'unknown',
        tracking_code: order.tracking_code,
        carrier_name:  carrierName,
        ...(emailResult.error && { error: emailResult.error }),
      }, 'admin_ui'),
    ]);

    return c.json({
      success:    emailResult.sent,
      email_sent: emailResult.sent,
      email_error: emailResult.error || null,
    });
  } catch (err: any) {
    console.error('[Orders] resend-email error:', err);
    return c.json({ success: false, error: err.message }, 500);
  }
});
