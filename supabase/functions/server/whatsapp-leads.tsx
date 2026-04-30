import { Hono } from 'npm:hono';
import { createClient } from 'jsr:@supabase/supabase-js@2.49.8';
import * as kv from './kv_store.tsx';
import { appendOrderEvent, logAuditEvent } from './audit.tsx';
import { ensureOrderCustomerIndexes } from './order-indexes.tsx';
import {
  buildWhatsAppLeadFromEvent,
  buildAttributionSnapshotFromLead,
  enqueueOfflineConversionJob,
  findLeadCandidatesForSale,
  getUsefulClickIdentifier,
  getWhatsAppLead,
  listOfflineConversionJobs,
  listWhatsAppLeads,
  sanitizeManualWhatsAppSaleDraft,
  saveWhatsAppLead,
  upsertWhatsAppLeadFromEvent,
  WHATSAPP_LEAD_CAPTURE_PREFIX,
  type ManualWhatsAppSaleDraft,
  type WhatsAppLeadRecord,
} from './performance-marketing.tsx';
import { syncStoreOrderSummarySafe } from './order-read-model.tsx';
import { readStoreOrdersFromBackup } from './store-backup-orders.tsx';

export const whatsappLeadsAdmin = new Hono();
const KV_TABLE = 'kv_store_1d6e33e0';
const FAST_META_TABLE = 'order_read_model_meta_1d6e33e0';
const EVENT_LOG_PREFIX = 'event_log:';
const FAST_WHATSAPP_LEAD_PREFIX = 'whatsapp_lead_fast:';
const FAST_STORAGE_BUCKET = 'make-1d6e33e0-order-read-model';
const FAST_STORAGE_WHATSAPP_LEADS_PATH = 'whatsapp-leads/leads.json';
const DIRECT_EVENT_SCAN_TIMEOUT_MS = Math.max(
  5000,
  Number(Deno.env.get('WHATSAPP_LEADS_EVENT_SCAN_TIMEOUT_MS') || 12000),
);
const ADMIN_OPERATION_TIMEOUT_MS = Math.max(
  2500,
  Number(Deno.env.get('WHATSAPP_LEADS_ADMIN_TIMEOUT_MS') || 8000),
);
const DIRECT_EVENT_SCAN_BATCH_SIZE = Math.max(
  100,
  Number(Deno.env.get('WHATSAPP_LEADS_EVENT_SCAN_BATCH_SIZE') || 500),
);
const DIRECT_EVENT_SCAN_MAX_ROWS = Math.max(
  500,
  Number(Deno.env.get('WHATSAPP_LEADS_EVENT_SCAN_MAX_ROWS') || 5000),
);
const DIRECT_MANUAL_ORDER_SCAN_MAX_ROWS = Math.max(
  100,
  Number(Deno.env.get('WHATSAPP_LEADS_MANUAL_ORDER_SCAN_MAX_ROWS') || 300),
);
const DIRECT_OFFLINE_SCAN_MAX_ROWS = Math.max(
  100,
  Number(Deno.env.get('WHATSAPP_LEADS_OFFLINE_SCAN_MAX_ROWS') || 300),
);

function createServiceClient() {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Supabase service role indisponivel para recuperar WhatsApp Leads.');
  }
  return createClient(supabaseUrl, serviceRoleKey);
}

function prefixUpperBound(prefix: string): string {
  if (!prefix) return '\uffff';
  const chars = Array.from(prefix);
  const last = chars.pop()!;
  const nextCodePoint = (last.codePointAt(0) || 0) + 1;
  return `${chars.join('')}${String.fromCodePoint(nextCodePoint)}`;
}

async function runDirectQuery<T>(promise: Promise<T>, label: string): Promise<T> {
  return await Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(`[whatsapp-leads] ${label} timed out after ${DIRECT_EVENT_SCAN_TIMEOUT_MS}ms`)), DIRECT_EVENT_SCAN_TIMEOUT_MS);
    }),
  ]);
}

async function withAdminTimeout<T>(promise: Promise<T>, label: string, timeoutMs = ADMIN_OPERATION_TIMEOUT_MS): Promise<T> {
  return await Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(`[whatsapp-leads] ${label} timed out after ${timeoutMs}ms`)), timeoutMs);
    }),
  ]);
}

function normalizeFingerprintPart(value: unknown, fallback: string) {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized || fallback;
}

async function listKvValuesDirect(
  prefix: string,
  options?: {
    ascending?: boolean;
    jsonFieldEquals?: {
      field: string;
      value: string;
    };
  },
): Promise<any[]> {
  const supabase = createServiceClient();
  const rows: any[] = [];
  let from = 0;

  while (from < DIRECT_EVENT_SCAN_MAX_ROWS) {
    let query = supabase
      .from(KV_TABLE)
      .select('value')
      .like('key', `${prefix}%`);

    if (options?.jsonFieldEquals?.field && options?.jsonFieldEquals?.value) {
      query = query.eq(`value->>${options.jsonFieldEquals.field}`, options.jsonFieldEquals.value);
    }

    query = query
      .order('key', { ascending: options?.ascending ?? true })
      .range(from, from + DIRECT_EVENT_SCAN_BATCH_SIZE - 1);

    const { data, error } = await runDirectQuery(query, `${prefix}-scan:${from}`);
    if (error) {
      throw new Error(error.message || `Falha ao ler ${prefix} diretamente.`);
    }

    const batch = (data || []) as Array<{ value: any }>;
    if (!batch.length) break;

    rows.push(...batch.map((entry) => entry?.value).filter(Boolean));

    if (batch.length < DIRECT_EVENT_SCAN_BATCH_SIZE) break;
    from += DIRECT_EVENT_SCAN_BATCH_SIZE;
  }

  return rows;
}

async function listKvValuesDirectLimited(
  prefix: string,
  options?: {
    ascending?: boolean;
    jsonFieldEquals?: {
      field: string;
      value: string;
    };
  },
  maxRows = 300,
  timeoutMs = ADMIN_OPERATION_TIMEOUT_MS,
): Promise<any[]> {
  const supabase = createServiceClient();
  const rows: any[] = [];
  let from = 0;
  const batchSize = Math.min(DIRECT_EVENT_SCAN_BATCH_SIZE, maxRows);

  while (from < maxRows) {
    let query = supabase
      .from(KV_TABLE)
      .select('value')
      .like('key', `${prefix}%`);

    if (options?.jsonFieldEquals?.field && options?.jsonFieldEquals?.value) {
      query = query.eq(`value->>${options.jsonFieldEquals.field}`, options.jsonFieldEquals.value);
    }

    query = query
      .order('key', { ascending: options?.ascending ?? true })
      .range(from, Math.min(from + batchSize - 1, maxRows - 1));

    const { data, error } = await withAdminTimeout(query, `${prefix}-limited:${from}`, timeoutMs);
    if (error) {
      throw new Error(error.message || `Falha ao ler ${prefix} em modo reduzido.`);
    }

    const batch = (data || []) as Array<{ value: any }>;
    if (!batch.length) break;

    rows.push(...batch.map((entry) => entry?.value).filter(Boolean));
    if (batch.length < batchSize) break;
    from += batchSize;
  }

  return rows;
}

async function listWhatsAppLeadEventsDirect(): Promise<any[]> {
  let rows: any[] = [];

  try {
    const captureRows = await kv.getByPrefix(WHATSAPP_LEAD_CAPTURE_PREFIX);
    rows = Array.isArray(captureRows) ? captureRows : [];
  } catch (error) {
    console.warn('[whatsapp-leads] capture prefix scan failed:', error);
  }

  if (!rows.length) {
    try {
      const directCaptures = await listKvValuesDirect(WHATSAPP_LEAD_CAPTURE_PREFIX, {
        ascending: false,
      });
      rows = Array.isArray(directCaptures) ? directCaptures : [];
    } catch (error) {
      console.warn('[whatsapp-leads] direct capture scan failed:', error);
    }
  }

  if (!rows.length) {
    try {
      const filteredEventLogs = await listKvValuesDirect(EVENT_LOG_PREFIX, {
        ascending: false,
        jsonFieldEquals: {
          field: 'event_name',
          value: 'whatsapp_banner_lead',
        },
      });
      rows = Array.isArray(filteredEventLogs) ? filteredEventLogs : [];
    } catch (error) {
      console.warn('[whatsapp-leads] filtered event_log scan failed:', error);
    }
  }

  if (!rows.length) {
    rows = await listKvValuesDirect(EVENT_LOG_PREFIX).catch(() => []);
  }

  return rows.filter((event) => String(event?.event_name || '') === 'whatsapp_banner_lead');
}

function sortLeadDateDesc(a: WhatsAppLeadRecord, b: WhatsAppLeadRecord) {
  return new Date(String(b.last_clicked_at || b.clicked_at || 0)).getTime() - new Date(String(a.last_clicked_at || a.clicked_at || 0)).getTime();
}

function sortOrderDateDesc(a: any, b: any) {
  return new Date(String(b.createdAt || b.created_at || 0)).getTime() - new Date(String(a.createdAt || a.created_at || 0)).getTime();
}

function sortOfflineJobDateDesc(a: any, b: any) {
  return new Date(String(b.created_at || 0)).getTime() - new Date(String(a.created_at || 0)).getTime();
}

function isStorageNotFoundError(error: any): boolean {
  const message = String(error?.message || error?.error || '').toLowerCase();
  return error?.statusCode === 404 || error?.status === 404 || message.includes('not found');
}

async function readFastStorageJson<T>(path: string): Promise<T | null> {
  const supabase = createServiceClient();
  const { data, error } = await supabase.storage
    .from(FAST_STORAGE_BUCKET)
    .download(path);

  if (error) {
    if (isStorageNotFoundError(error)) return null;
    const detail = String(error?.message || error?.error || '').trim();
    throw new Error(detail || `Falha ao ler storage ${path}`);
  }

  const text = await data.text();
  if (!text) return null;
  return JSON.parse(text) as T;
}

async function readStorageWhatsAppLeadsFast(): Promise<WhatsAppLeadRecord[]> {
  const stored = await withAdminTimeout(
    readFastStorageJson<WhatsAppLeadRecord[]>(FAST_STORAGE_WHATSAPP_LEADS_PATH),
    'storage_whatsapp_leads',
  );
  return (Array.isArray(stored) ? stored : [])
    .filter((lead: any): lead is WhatsAppLeadRecord => Boolean(lead?.lead_id))
    .sort(sortLeadDateDesc);
}

async function listFastMetaValuesByPrefixForAdmin(prefix: string, maxRows = 500): Promise<any[]> {
  const supabase = createServiceClient();
  const rows: any[] = [];
  let from = 0;
  const batchSize = Math.min(250, maxRows);

  while (from < maxRows) {
    const query = supabase
      .from(FAST_META_TABLE)
      .select('value')
      .gte('key', prefix)
      .lt('key', prefixUpperBound(prefix))
      .order('key', { ascending: false })
      .range(from, Math.min(from + batchSize - 1, maxRows - 1));

    const { data, error } = await withAdminTimeout(query, `${prefix}-fast-meta:${from}`);
    if (error) {
      throw new Error(error.message || `Falha ao listar fast meta ${prefix}`);
    }

    const batch = (data || []) as Array<{ value: any }>;
    if (!batch.length) break;

    rows.push(...batch.map((entry) => entry?.value).filter(Boolean));
    if (batch.length < batchSize) break;
    from += batchSize;
  }

  return rows;
}

async function readWhatsAppLeadsForAdmin(): Promise<WhatsAppLeadRecord[]> {
  const [storageResult, fastMetaResult] = await Promise.allSettled([
    readStorageWhatsAppLeadsFast(),
    (async () => {
      const fastMetaLeads = await listFastMetaValuesByPrefixForAdmin(FAST_WHATSAPP_LEAD_PREFIX, 500);
      return (Array.isArray(fastMetaLeads) ? fastMetaLeads : [])
        .filter((lead: any): lead is WhatsAppLeadRecord => Boolean(lead?.lead_id))
        .sort(sortLeadDateDesc);
    })(),
  ]);

  if (storageResult.status === 'fulfilled' && storageResult.value.length) {
    return storageResult.value;
  }

  if (storageResult.status === 'rejected') {
    console.warn('[whatsapp-leads] storage leads fast path failed:', storageResult.reason);
  }

  if (fastMetaResult.status === 'fulfilled' && fastMetaResult.value.length) {
    return fastMetaResult.value;
  }

  if (fastMetaResult.status === 'rejected') {
    console.warn('[whatsapp-leads] fast meta leads path failed:', fastMetaResult.reason);
  }

  return [];
}

function buildLeadFingerprintLocal(lead: WhatsAppLeadRecord) {
  return [
    normalizeFingerprintPart(lead.session_id, 'anonymous'),
    normalizeFingerprintPart(lead.sku, 'no-sku'),
    normalizeFingerprintPart(lead.source_surface, 'unknown'),
    normalizeFingerprintPart(lead.normalized_message_text || lead.message_text, 'no-message'),
  ].join(':');
}

function mergeLeadSnapshots(existing: WhatsAppLeadRecord, next: WhatsAppLeadRecord): WhatsAppLeadRecord {
  return {
    ...existing,
    click_count: Number(existing.click_count || 0) + Number(next.click_count || 1),
    updated_at: new Date().toISOString(),
    last_clicked_at: next.last_clicked_at || next.clicked_at || existing.last_clicked_at,
    message_text: existing.message_text || next.message_text,
    normalized_message_text: existing.normalized_message_text || next.normalized_message_text,
    resolved_value: existing.resolved_value ?? next.resolved_value,
    product_price: existing.product_price ?? next.product_price,
    cart_total: existing.cart_total ?? next.cart_total,
    checkout_total: existing.checkout_total ?? next.checkout_total,
    gclid: existing.gclid || next.gclid,
    gbraid: existing.gbraid || next.gbraid,
    wbraid: existing.wbraid || next.wbraid,
    attribution_snapshot: {
      ...(existing.attribution_snapshot || {}),
      ...(next.attribution_snapshot || {}),
    },
  };
}

async function recoverWhatsAppLeadsQuickForAdmin(): Promise<WhatsAppLeadRecord[]> {
  let events: any[] = [];

  try {
    events = await listKvValuesDirectLimited(WHATSAPP_LEAD_CAPTURE_PREFIX, { ascending: false }, 300, 4000);
  } catch (error) {
    console.warn('[whatsapp-leads] quick capture recovery failed:', error);
  }

  if (!events.length) {
    try {
      events = await listKvValuesDirectLimited(
        EVENT_LOG_PREFIX,
        {
          ascending: false,
          jsonFieldEquals: {
            field: 'event_name',
            value: 'whatsapp_banner_lead',
          },
        },
        300,
        4000,
      );
    } catch (error) {
      console.warn('[whatsapp-leads] quick event-log recovery failed:', error);
    }
  }

  const filtered = (Array.isArray(events) ? events : [])
    .filter((event: any) => String(event?.event_name || '') === 'whatsapp_banner_lead')
    .sort((a: any, b: any) => new Date(String(a?.event_time || a?._captured_at || 0)).getTime() - new Date(String(b?.event_time || b?._captured_at || 0)).getTime());

  if (!filtered.length) return [];

  const byLeadId = new Map<string, WhatsAppLeadRecord>();
  const fingerprintToLeadId = new Map<string, string>();

  for (const event of filtered) {
    const next = buildWhatsAppLeadFromEvent(event);
    const fingerprint = buildLeadFingerprintLocal(next);
    const existingLeadId = fingerprintToLeadId.get(fingerprint);

    if (existingLeadId) {
      const existing = byLeadId.get(existingLeadId);
      if (existing) {
        byLeadId.set(existingLeadId, mergeLeadSnapshots(existing, next));
        continue;
      }
    }

    byLeadId.set(next.lead_id, next);
    fingerprintToLeadId.set(fingerprint, next.lead_id);
  }

  return Array.from(byLeadId.values()).sort(sortLeadDateDesc);
}

async function rebuildWhatsAppLeadsFromEventLogDirect(): Promise<WhatsAppLeadRecord[]> {
  const events = await listWhatsAppLeadEventsDirect();
  if (!events.length) return [];

  const sortedEvents = events.sort((a, b) => new Date(String(a?.event_time || 0)).getTime() - new Date(String(b?.event_time || 0)).getTime());
  const leadsById = new Map<string, WhatsAppLeadRecord>();

  for (const event of sortedEvents) {
    try {
      const lead = await upsertWhatsAppLeadFromEvent(event);
      leadsById.set(lead.lead_id, lead);
    } catch (error) {
      const fallbackLead = buildWhatsAppLeadFromEvent(event);
      leadsById.set(fallbackLead.lead_id, fallbackLead);
      console.warn('[whatsapp-leads] direct event-log recovery fallback used:', error);
    }
  }

  return Array.from(leadsById.values())
    .sort((a, b) => new Date(String(b.last_clicked_at || b.clicked_at || 0)).getTime() - new Date(String(a.last_clicked_at || a.clicked_at || 0)).getTime());
}

function genOrderId() {
  return `ws-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`.toUpperCase();
}

function normalizeOrder(order: any) {
  return {
    ...order,
    payment_provider: order.payment_provider || 'whatsapp_manual',
    payment_status: order.payment_status || 'paid',
    fulfillment_status: order.fulfillment_status || 'pending',
    order_source: order.order_source || 'whatsapp_manual',
    createdAt: order.createdAt || order.created_at || new Date().toISOString(),
  };
}

function filterLeadSearch(lead: WhatsAppLeadRecord, search: string) {
  const term = search.trim().toLowerCase();
  if (!term) return true;
  return [
    lead.lead_id,
    lead.sku,
    lead.message_text,
    lead.source_surface,
    lead.page_path,
  ]
    .map((value) => String(value || '').toLowerCase())
    .some((value) => value.includes(term));
}

async function readManualWhatsappOrders() {
  try {
    const supabase = createServiceClient();
    const query = supabase
      .from(KV_TABLE)
      .select('value')
      .gte('key', 'order:')
      .lt('key', prefixUpperBound('order:'))
      .eq('value->>payment_provider', 'whatsapp_manual')
      .order('key', { ascending: false })
      .range(0, DIRECT_MANUAL_ORDER_SCAN_MAX_ROWS - 1);

    const { data, error } = await withAdminTimeout(query, 'manual_orders_direct');
    if (error) {
      throw new Error(error.message || 'Falha ao carregar pedidos manuais.');
    }

    const directOrders = (Array.isArray(data) ? data : [])
      .map((entry: any) => normalizeOrder(entry?.value))
      .filter((order: any) => String(order?.payment_provider || order?.order_source || '') === 'whatsapp_manual')
      .sort(sortOrderDateDesc);

    if (directOrders.length) return directOrders;
  } catch (error) {
    console.warn('[whatsapp-leads] direct manual orders path failed:', error);
  }

  try {
    const backupPage = await withAdminTimeout(
      readStoreOrdersFromBackup({ page: 1, limit: DIRECT_MANUAL_ORDER_SCAN_MAX_ROWS }),
      'manual_orders_backup',
      6000,
    );
    return (Array.isArray(backupPage?.items) ? backupPage.items : [])
      .map((order: any) => normalizeOrder(order))
      .filter((order: any) => String(order?.payment_provider || order?.order_source || '') === 'whatsapp_manual')
      .sort(sortOrderDateDesc);
  } catch (error) {
    console.warn('[whatsapp-leads] backup manual orders path failed:', error);
  }

  return [];
}

async function readOfflineConversionJobsForAdmin() {
  try {
    const supabase = createServiceClient();
    const query = supabase
      .from(KV_TABLE)
      .select('value')
      .gte('key', OFFLINE_CONVERSION_JOB_PREFIX)
      .lt('key', prefixUpperBound(OFFLINE_CONVERSION_JOB_PREFIX))
      .order('key', { ascending: false })
      .range(0, DIRECT_OFFLINE_SCAN_MAX_ROWS - 1);

    const { data, error } = await withAdminTimeout(query, 'offline_jobs_direct');
    if (error) {
      throw new Error(error.message || 'Falha ao carregar fila offline.');
    }

    const jobs = (Array.isArray(data) ? data : [])
      .map((entry: any) => entry?.value)
      .filter((job: any) => Boolean(job?.job_id))
      .sort(sortOfflineJobDateDesc);

    if (jobs.length) return jobs;
  } catch (error) {
    console.warn('[whatsapp-leads] direct offline jobs path failed:', error);
  }

  try {
    return await withAdminTimeout(listOfflineConversionJobs(), 'offline_jobs_full', 6000);
  } catch (error) {
    console.warn('[whatsapp-leads] fallback offline jobs path failed:', error);
  }

  return [];
}

function buildManualOrderFromDraft(draft: ManualWhatsAppSaleDraft, lead?: WhatsAppLeadRecord | null, existing?: any) {
  const now = new Date().toISOString();
  const orderId = String(existing?.orderId || draft.order_id || genOrderId()).trim();
  const quantity = Math.max(1, Number(draft.quantity || 1));
  const unitPrice = Number(draft.unit_price || draft.total || 0);
  const total = Number(draft.total || unitPrice * quantity || 0);
  const sku = String(draft.sku || lead?.sku || '').trim();
  const itemName = String(draft.item_name || sku || 'Venda WhatsApp').trim();
  const attribution = {
    ...(existing?.attribution_snapshot || {}),
    ...buildAttributionSnapshotFromLead(lead),
  };

  return {
    ...(existing || {}),
    orderId,
    order_source: 'whatsapp_manual',
    lead_id: draft.lead_id || lead?.lead_id || existing?.lead_id || null,
    payment_provider: 'whatsapp_manual',
    payment_status: draft.payment_status || existing?.payment_status || 'paid',
    fulfillment_status: existing?.fulfillment_status || 'pending',
    status: draft.payment_status || existing?.payment_status || 'paid',
    transaction_id: draft.transaction_id || existing?.transaction_id || orderId,
    customer: {
      ...(existing?.customer || {}),
      name: draft.customer_name || existing?.customer?.name || 'Cliente WhatsApp',
      email: draft.customer_email || existing?.customer?.email || '',
      phone: draft.customer_phone || existing?.customer?.phone || '',
    },
    items: [
      {
        sku,
        id: sku,
        name: itemName,
        description: itemName,
        quantity,
        qty: quantity,
        price: unitPrice,
        unitPrice,
      },
    ],
    totals: {
      ...(existing?.totals || {}),
      total,
      subtotal: total,
    },
    shipping: existing?.shipping || null,
    attribution_snapshot: attribution,
    whatsapp_sale_context: {
      message_text: draft.message_text || lead?.message_text || null,
      source_surface: draft.source_surface || lead?.source_surface || null,
      matched_via: lead ? 'manual_assisted' : 'manual_unmatched',
      last_lead_click_at: lead?.last_clicked_at || lead?.clicked_at || null,
      has_click_identifier: Boolean(getUsefulClickIdentifier(lead)),
    },
    createdAt: existing?.createdAt || now,
    created_at: existing?.created_at || now,
    updatedAt: now,
    paid_at: draft.paid_at || existing?.paid_at || draft.sale_time || now,
  };
}

async function linkLeadToOrder(lead: WhatsAppLeadRecord, order: any, adminEmail?: string | null) {
  const status = order?.payment_status === 'paid' ? 'won' : 'linked';
  const updatedLead: WhatsAppLeadRecord = {
    ...lead,
    matched_order_id: order.orderId,
    status,
    updated_at: new Date().toISOString(),
  };
  await saveWhatsAppLead(updatedLead);

  const updatedOrder = {
    ...order,
    lead_id: lead.lead_id,
    attribution_snapshot: {
      ...(order?.attribution_snapshot || {}),
      ...buildAttributionSnapshotFromLead(lead),
    },
    updatedAt: new Date().toISOString(),
  };
  await kv.set(`order:${order.orderId}`, updatedOrder);
  await syncStoreOrderSummarySafe(updatedOrder, 'whatsapp_link_lead_to_order');

  await Promise.all([
    logAuditEvent({
      action: 'whatsapp_lead.linked_to_order',
      entity_type: 'whatsapp_lead',
      entity_id: lead.lead_id,
      admin_email: adminEmail || undefined,
      before: { matched_order_id: lead.matched_order_id, status: lead.status },
      after: { matched_order_id: updatedLead.matched_order_id, status: updatedLead.status, order_id: order.orderId },
      source: 'admin_ui',
    }),
    appendOrderEvent(order.orderId, 'order.whatsapp_lead_linked', {
      lead_id: lead.lead_id,
      source_surface: lead.source_surface,
      sku: lead.sku,
      matched_via: 'manual_assisted',
    }, 'admin_ui'),
  ]);

  const conversionValue = Number(updatedOrder?.totals?.total || 0);
  if (updatedOrder.payment_status === 'paid' && conversionValue > 0) {
    await enqueueOfflineConversionJob({
      lead: updatedLead,
      order: updatedOrder,
      conversion_value: conversionValue,
      transaction_id: String(updatedOrder.transaction_id || updatedOrder.orderId),
    });
  }

  return {
    lead: updatedLead,
    order: updatedOrder,
  };
}

whatsappLeadsAdmin.get('/', async (c) => {
  try {
    const status = String(c.req.query('status') || '').trim();
    const search = String(c.req.query('search') || '').trim();
    const [leadsResult, ordersResult, jobsResult] = await Promise.allSettled([
      readWhatsAppLeadsForAdmin(),
      readManualWhatsappOrders(),
      readOfflineConversionJobsForAdmin(),
    ]);

    const warnings: string[] = [];
    if (leadsResult.status !== 'fulfilled') {
      warnings.push(`leads:${leadsResult.reason?.message || 'Falha ao carregar leads'}`);
    }
    if (ordersResult.status !== 'fulfilled') {
      warnings.push(`orders:${ordersResult.reason?.message || 'Falha ao carregar pedidos manuais'}`);
    }
    if (jobsResult.status !== 'fulfilled') {
      warnings.push(`offline:${jobsResult.reason?.message || 'Falha ao carregar fila offline'}`);
    }

    const leads = (leadsResult.status === 'fulfilled' ? leadsResult.value : [])
      .filter((lead) => (!status ? true : lead.status === status))
      .filter((lead) => filterLeadSearch(lead, search));
    const orders = ordersResult.status === 'fulfilled' ? ordersResult.value : [];
    const jobs = jobsResult.status === 'fulfilled' ? jobsResult.value : [];

    let finalLeads = leads;
    if (!finalLeads.length) {
      try {
        const recovered = await withAdminTimeout(
          recoverWhatsAppLeadsQuickForAdmin(),
          'whatsapp_leads_quick_recovery',
          5000,
        );
        finalLeads = recovered
          .filter((lead) => (!status ? true : lead.status === status))
          .filter((lead) => filterLeadSearch(lead, search));
        if (finalLeads.length) {
          warnings.push(`recovered:${finalLeads.length}`);
        }
      } catch (error: any) {
        warnings.push(`recovery:${error?.message || 'Falha ao recuperar leads do event_log'}`);
      }
    }

    const stats = {
      total: finalLeads.length,
      clicked: finalLeads.filter((lead) => lead.status === 'clicked').length,
      qualified: finalLeads.filter((lead) => lead.status === 'qualified').length,
      high_intent: finalLeads.filter((lead) => lead.status === 'high_intent').length,
      won: finalLeads.filter((lead) => lead.status === 'won').length,
      unlinked: finalLeads.filter((lead) => !lead.matched_order_id).length,
    };

    const pendingOrders = orders.filter((order: any) => !order.lead_id);
    const offlineReady = jobs.filter((job) => job.status === 'pending' || job.status === 'failed');

    return c.json({
      leads: finalLeads.slice(0, 200),
      stats,
      pending_orders: pendingOrders.slice(0, 50),
      offline_ready: offlineReady.slice(0, 50),
      warnings,
    });
  } catch (error: any) {
    return c.json({ error: error?.message || 'Falha ao carregar WhatsApp Leads.' }, 500);
  }
});

whatsappLeadsAdmin.get('/match-candidates', async (c) => {
  try {
    const draft = sanitizeManualWhatsAppSaleDraft({
      sale_time: c.req.query('sale_time'),
      paid_at: c.req.query('paid_at'),
      sku: c.req.query('sku'),
      item_name: c.req.query('item_name'),
      quantity: c.req.query('quantity'),
      total: c.req.query('total'),
      message_text: c.req.query('message_text'),
      source_surface: c.req.query('source_surface'),
    });
    const candidates = await findLeadCandidatesForSale(draft);
    return c.json({ candidates });
  } catch (error: any) {
    return c.json({ error: error?.message || 'Falha ao sugerir leads.' }, 500);
  }
});

whatsappLeadsAdmin.get('/:id', async (c) => {
  try {
    const lead = await getWhatsAppLead(c.req.param('id'));
    if (!lead) return c.json({ error: 'Lead não encontrado.' }, 404);

    const order = lead.matched_order_id
      ? await kv.get(`order:${lead.matched_order_id}`).catch(() => null)
      : null;

    return c.json({
      lead,
      order: order ? normalizeOrder(order) : null,
    });
  } catch (error: any) {
    return c.json({ error: error?.message || 'Falha ao carregar lead.' }, 500);
  }
});

whatsappLeadsAdmin.post('/manual-sale', async (c) => {
  try {
    const body = await c.req.json();
    const draft = sanitizeManualWhatsAppSaleDraft(body || {});
    const adminEmail = String(body?.admin_email || '').trim() || null;

    const lead = draft.lead_id ? await getWhatsAppLead(draft.lead_id) : null;
    const existingOrder = draft.order_id
      ? await kv.get(`order:${draft.order_id}`).catch(() => null)
      : null;
    const order = buildManualOrderFromDraft(draft, lead, existingOrder);

    await kv.set(`order:${order.orderId}`, order);
    await ensureOrderCustomerIndexes(order.orderId, order);
    await syncStoreOrderSummarySafe(order, 'whatsapp_manual_sale');

    await Promise.all([
      logAuditEvent({
        action: existingOrder ? 'order.whatsapp_manual.updated' : 'order.whatsapp_manual.created',
        entity_type: 'order',
        entity_id: order.orderId,
        admin_email: adminEmail || undefined,
        after: {
          order_source: order.order_source,
          total: order.totals?.total,
          lead_id: order.lead_id,
          payment_status: order.payment_status,
        },
        source: 'admin_ui',
      }),
      appendOrderEvent(order.orderId, existingOrder ? 'order.manual_whatsapp_updated' : 'order.manual_whatsapp_created', {
        total: order.totals?.total,
        payment_status: order.payment_status,
        lead_id: order.lead_id,
      }, 'admin_ui'),
    ]);

    let linked = null;
    if (lead) {
      linked = await linkLeadToOrder(lead, order, adminEmail);
    }

    const candidates = await findLeadCandidatesForSale(draft);

    return c.json({
      success: true,
      order: linked?.order || order,
      linked_lead: linked?.lead || null,
      candidates,
    });
  } catch (error: any) {
    return c.json({ success: false, error: error?.message || 'Falha ao registrar venda manual.' }, 500);
  }
});

whatsappLeadsAdmin.post('/:id/link-order', async (c) => {
  try {
    const leadId = c.req.param('id');
    const body = await c.req.json();
    const orderId = String(body?.order_id || '').trim();
    const adminEmail = String(body?.admin_email || '').trim() || null;

    if (!orderId) return c.json({ error: 'order_id é obrigatório.' }, 400);

    const lead = await getWhatsAppLead(leadId);
    if (!lead) return c.json({ error: 'Lead não encontrado.' }, 404);

    const order = await kv.get(`order:${orderId}`).catch(() => null);
    if (!order) return c.json({ error: 'Pedido não encontrado.' }, 404);

    const result = await linkLeadToOrder(lead, normalizeOrder(order), adminEmail);
    return c.json({
      success: true,
      lead: result.lead,
      order: result.order,
    });
  } catch (error: any) {
    return c.json({ success: false, error: error?.message || 'Falha ao vincular lead ao pedido.' }, 500);
  }
});
