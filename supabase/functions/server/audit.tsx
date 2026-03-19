// ─── Audit Trail + Order Event Timeline ─────────────────────────────────────
//
// Dois subsistemas neste módulo:
//
// 1) AUDIT TRAIL (ações administrativas e de sistema)
//    - Chave KV: audit:{YYYY-MM-DD}:{id}
//    - Exporta: logAuditEvent(event)
//    - Rotas: GET /audit, GET /audit/stats
//
// 2) ORDER EVENT TIMELINE (histórico granular por pedido)
//    - Chave KV: order_events:{orderId} → OrderEvent[]
//    - Exporta: appendOrderEvent(orderId, type, payload, source?)
//    - Rotas: GET /audit/order/:id
//
// RETENÇÃO: Eventos de auditoria são armazenados por chave com prefixo de data.
// Para limpar eventos antigos, use o endpoint DELETE /audit/cleanup?before=YYYY-MM-DD.
// Recomendação: reter por 365 dias em produção.

import { Hono } from 'npm:hono';
import * as kv from './kv_store.tsx';

export const audit = new Hono();

// ─── Types ───────────────────────────────────────────────────────────────────

export interface AuditEvent {
  id:             string;
  action:         string;                               // "order.tracking.update"
  entity_type:    string;                               // "order" | "carrier_config" | "payment_config"
  entity_id:      string;
  admin_user_id?: string;
  admin_email?:   string;
  before?:        Record<string, unknown>;              // resumo do estado anterior
  after?:         Record<string, unknown>;              // resumo do estado novo
  source:         'admin_ui' | 'api' | 'system' | 'webhook';
  created_at:     string;                               // ISO
  correlation_id?: string;
  meta?:          Record<string, unknown>;
}

export interface OrderEvent {
  id:          string;
  type:        string;                                  // "order.created", "payment.status_changed"
  occurred_at: string;                                  // ISO
  source:      'admin_ui' | 'webhook' | 'system' | 'api';
  payload:     Record<string, unknown>;                 // sanitizado — sem segredos
}

// ─── KV Key Prefixes ─────────────────────────────────────────────────────────

const AUDIT_PREFIX        = 'audit:';
const ORDER_EVENTS_PREFIX = 'order_events:';
const MAX_ORDER_EVENTS    = 100;    // máx eventos por pedido
const PAGE_SIZE           = 50;

// ─── ID Generator ────────────────────────────────────────────────────────────

function genId(): string {
  const ts  = Date.now().toString(36).padStart(10, '0');
  const rnd = Math.random().toString(36).slice(2, 8);
  return `${ts}${rnd}`;
}

// ─── logAuditEvent ───────────────────────────────────────────────────────────
//
// Função central exportada. Falha silenciosa: nunca deve bloquear a operação.
// Uso: import { logAuditEvent } from './audit.tsx';
//
// Exemplo:
//   await logAuditEvent({
//     action: 'order.tracking.update',
//     entity_type: 'order',
//     entity_id: orderId,
//     before: { fulfillment_status: 'pending' },
//     after:  { fulfillment_status: 'shipped', tracking_code: 'AA123' },
//     source: 'admin_ui',
//   });

export async function logAuditEvent(
  event: Omit<AuditEvent, 'id' | 'created_at'>,
): Promise<void> {
  try {
    const id       = genId();
    const now      = new Date().toISOString();
    const date_pfx = now.slice(0, 10);   // YYYY-MM-DD — chave lexicograficamente ordenável
    const entry: AuditEvent = { id, created_at: now, ...event };

    await kv.set(`${AUDIT_PREFIX}${date_pfx}:${id}`, entry);
    console.log(`[Audit] ${entry.action} | ${entry.entity_type}:${entry.entity_id} | src=${entry.source}`);
  } catch (e) {
    // Nunca bloquear operação principal por falha de auditoria
    console.warn('[Audit] logAuditEvent falhou (silencioso):', e);
  }
}

// ─── appendOrderEvent ─────────────────────────────────────────────────────────
//
// Adiciona evento ao timeline do pedido. Array em KV: order_events:{orderId}.
// Falha silenciosa.
//
// Eventos de payload NUNCA devem expor tokens, API keys ou senhas.

export async function appendOrderEvent(
  orderId:  string,
  type:     string,
  payload:  Record<string, unknown>,
  source:   OrderEvent['source'] = 'system',
): Promise<void> {
  try {
    const key      = `${ORDER_EVENTS_PREFIX}${orderId}`;
    const existing = await kv.get(key);
    const events:  OrderEvent[] = Array.isArray(existing) ? existing : [];

    const evt: OrderEvent = {
      id:          genId(),
      type,
      occurred_at: new Date().toISOString(),
      source,
      payload,
    };

    events.push(evt);

    // Manter somente os MAX_ORDER_EVENTS mais recentes
    if (events.length > MAX_ORDER_EVENTS) {
      events.splice(0, events.length - MAX_ORDER_EVENTS);
    }

    await kv.set(key, events);
  } catch (e) {
    console.warn(`[Audit] appendOrderEvent(${orderId}, ${type}) falhou (silencioso):`, e);
  }
}

// ─── GET /audit ───────────────────────────────────────────────────────────────
// Lista eventos de auditoria com paginação e filtros opcionais.

audit.get('/', async (c) => {
  try {
    const action      = c.req.query('action')      || '';
    const entity_type = c.req.query('entity_type') || '';
    const entity_id   = c.req.query('entity_id')   || '';
    const search      = c.req.query('search')      || '';
    const page        = Math.max(1, parseInt(c.req.query('page') || '1'));

    const raw: AuditEvent[] = (await kv.getByPrefix(AUDIT_PREFIX) || [])
      .filter((e: any) => e && typeof e === 'object' && e.id && e.action);

    const filtered = raw
      .filter(e => !action      || e.action.includes(action))
      .filter(e => !entity_type || e.entity_type === entity_type)
      .filter(e => !entity_id   || e.entity_id === entity_id)
      .filter(e => !search      || (
        e.action.toLowerCase().includes(search.toLowerCase()) ||
        e.entity_id.toLowerCase().includes(search.toLowerCase()) ||
        (e.admin_email || '').toLowerCase().includes(search.toLowerCase())
      ))
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    const total  = filtered.length;
    const offset = (page - 1) * PAGE_SIZE;
    const items  = filtered.slice(offset, offset + PAGE_SIZE);

    return c.json({ events: items, total, page, page_size: PAGE_SIZE, pages: Math.ceil(total / PAGE_SIZE) });
  } catch (err: any) {
    console.error('[Audit] GET / error:', err);
    return c.json({ error: err.message }, 500);
  }
});

// ─── GET /audit/order/:id ─────────────────────────────────────────────────────
// Retorna o timeline de eventos de um pedido específico.

audit.get('/order/:id', async (c) => {
  try {
    const orderId = c.req.param('id');
    const raw     = await kv.get(`${ORDER_EVENTS_PREFIX}${orderId}`);
    const events: OrderEvent[] = Array.isArray(raw) ? raw : [];

    // Ordenar do mais recente para o mais antigo
    events.sort((a, b) => new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime());

    return c.json({ events, total: events.length });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// ─── GET /audit/stats ────────────────────────────────────────────────────────
// Estatísticas agregadas para o dashboard de auditoria.

audit.get('/stats', async (c) => {
  try {
    const raw: AuditEvent[] = (await kv.getByPrefix(AUDIT_PREFIX) || [])
      .filter((e: any) => e && typeof e === 'object' && e.id && e.action);

    const byAction: Record<string, number> = {};
    const byEntity: Record<string, number> = {};
    const bySource: Record<string, number> = {};

    for (const e of raw) {
      byAction[e.action]      = (byAction[e.action]      || 0) + 1;
      byEntity[e.entity_type] = (byEntity[e.entity_type] || 0) + 1;
      bySource[e.source]      = (bySource[e.source]      || 0) + 1;
    }

    const sorted = raw.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    // Eventos dos últimos 7 dias
    const cutoff7d   = new Date(Date.now() - 7 * 86400 * 1000).toISOString();
    const last7d     = raw.filter(e => e.created_at >= cutoff7d).length;

    return c.json({
      total:      raw.length,
      last_7_days: last7d,
      by_action:  byAction,
      by_entity:  byEntity,
      by_source:  bySource,
      last_event: sorted[0] || null,
    });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// ─── DELETE /audit/cleanup ────────────────────────────────────────────────────
// Remove eventos de auditoria anteriores a uma data (retenção).
// Ex: DELETE /audit/cleanup?before=2024-01-01

audit.delete('/cleanup', async (c) => {
  try {
    const before = c.req.query('before');
    if (!before) return c.json({ error: 'Parâmetro "before" (YYYY-MM-DD) é obrigatório' }, 400);

    const all: AuditEvent[] = (await kv.getByPrefix(AUDIT_PREFIX) || [])
      .filter((e: any) => e && e.id && e.created_at);

    const toDelete = all.filter(e => e.created_at.slice(0, 10) < before);
    const datePrefix = before.slice(0, 10);

    let deleted = 0;
    for (const e of toDelete) {
      const key = `${AUDIT_PREFIX}${e.created_at.slice(0, 10)}:${e.id}`;
      await kv.del(key);
      deleted++;
    }

    console.log(`[Audit] Cleanup: ${deleted} eventos removidos (before ${before})`);
    return c.json({ success: true, deleted, before });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});
