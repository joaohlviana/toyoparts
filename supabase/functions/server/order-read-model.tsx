import { createClient } from "jsr:@supabase/supabase-js@2.49.8";
import * as kv from './kv_store.tsx';
import { backupStoreOrderSafe } from './store-backup-orders.tsx';
import {
  compareOrderRecordDateDesc,
  getMagentoStoredOrderIdentity,
  getOrderRecordDate,
  isMagentoStoredOrderRecord,
  isStoreOrderRecord,
} from './order-records.tsx';

const KV_TABLE = 'kv_store_1d6e33e0';
const ORDER_SUMMARY_PREFIX = 'order_summary:';
const STORE_SOURCE_PAGE_RPC = 'order_source_page_1d6e33e0';
const MAGENTO_SOURCE_PAGE_RPC = 'magento_order_source_page_1d6e33e0';
const READ_MODEL_META_BUCKET = 'make-1d6e33e0-order-read-model';
const READ_MODEL_FLAG_PATH = 'meta/flag.json';
const READ_MODEL_REBUILD_STATE_PATH = 'meta/rebuild-state.json';
const ORDER_READ_MODEL_QUERY_TIMEOUT_MS = Math.max(1500, Number(Deno.env.get('ORDER_READ_MODEL_QUERY_TIMEOUT_MS') || 1500));
const ORDER_SOURCE_SCAN_TIMEOUT_MS = Math.max(5000, Number(Deno.env.get('ORDER_SOURCE_SCAN_TIMEOUT_MS') || 12000));
const ORDER_SOURCE_SCAN_BATCH_SIZE = Math.max(100, Number(Deno.env.get('ORDER_SOURCE_SCAN_BATCH_SIZE') || 400));

export const ORDERS_READ_MODEL_FLAG_KEY = 'meta:orders_read_model_enabled';
export const ORDERS_READ_MODEL_REBUILD_STATE_KEY = 'meta:orders_read_model_rebuild_state';

export type OrderSummaryRecordKind = 'store_order' | 'magento_stored_order';

export interface OrderSummaryRecord {
  version: 1;
  record_kind: OrderSummaryRecordKind;
  summary_key: string;
  source_key: string;
  source_id: string;
  sort_key: string;
  order_id: string | null;
  entity_id: number | null;
  increment_id: string | null;
  created_at: string;
  updated_at: string | null;
  payment_provider: string | null;
  payment_status: string | null;
  fulfillment_status: string | null;
  total_amount: number | null;
  shipping_carrier: string | null;
  shipping_service: string | null;
  tracking_code: string | null;
  customer_name: string | null;
  customer_email: string | null;
  customer_firstname: string | null;
  customer_lastname: string | null;
  currency_code: string | null;
  status: string | null;
  asaas_invoice_url?: string | null;
  vindi_url?: string | null;
  stripe_checkout_url?: string | null;
  item_skus?: string[];
  orderId?: string;
  createdAt?: string;
  customer?: {
    name: string;
    email: string;
  };
  totals?: {
    total: number;
  };
  shipping?: {
    carrier?: string;
    service?: string;
  } | null;
}

interface ListOrderSummariesOptions {
  recordKind: OrderSummaryRecordKind;
  page?: number;
  limit?: number;
  search?: string;
  paymentStatus?: string | null;
  fulfillmentStatus?: string | null;
}

interface ListSourceStoreOrdersOptions {
  page?: number;
  limit?: number;
  search?: string;
  paymentStatus?: string | null;
  fulfillmentStatus?: string | null;
}

interface ReadModelHealth {
  enabled: boolean;
  state: OrderReadModelRebuildState | null;
  store_orders?: {
    source_total: number;
    summary_total: number;
    latest_source_ids?: string[];
    latest_summary_ids?: string[];
    missing_from_summary?: string[];
  };
  magento_stored_orders?: {
    source_total: number;
    summary_total: number;
    latest_source_ids?: string[];
    latest_summary_ids?: string[];
    missing_from_summary?: string[];
  };
}

export interface OrderReadModelRebuildState {
  started_at: string;
  updated_at: string;
  completed_at?: string | null;
  batch_size: number;
  phase?: string | null;
  last_error?: string | null;
  order_offset: number;
  magento_offset: number;
  order_cursor_key?: string | null;
  magento_cursor_key?: string | null;
  order_done: boolean;
  magento_done: boolean;
  processed_order_entries: number;
  processed_magento_entries: number;
  upserted_store_orders: number;
  upserted_magento_orders: number;
}

let readModelMetaBucketReady = false;

function getSupabase() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

function asIsoDate(input: unknown): string {
  const raw = String(input || '').trim();
  if (!raw) return new Date(0).toISOString();
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return new Date(0).toISOString();
  return parsed.toISOString();
}

function normalizeEmail(value: unknown): string {
  return String(value || '').trim().toLowerCase();
}

function normalizeString(value: unknown): string | null {
  const normalized = String(value || '').trim();
  return normalized || null;
}

function isSchemaCacheError(error: any): boolean {
  const message = String(error?.message || error || '').toLowerCase();
  return (
    message.includes('schema cache') ||
    message.includes('retrying') ||
    message.includes('timed out') ||
    message.includes('maximum number of connections') ||
    message.includes('remaining connection slots are reserved') ||
    message.includes('too many clients')
  );
}

async function runAbortableQuery<T>(label: string, run: (signal: AbortSignal) => Promise<T>, timeoutMs = ORDER_READ_MODEL_QUERY_TIMEOUT_MS): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, timeoutMs) as unknown as number;
  try {
    return await run(controller.signal);
  } catch (error: any) {
    const message = String(error?.message || error || '');
    if (controller.signal.aborted || message.toLowerCase().includes('abort')) {
      throw new Error(`[OrdersReadModel] ${label} timed out after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function withSchemaRetry<T>(task: () => Promise<T>, attempts = 1): Promise<T> {
  let lastError: any;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await task();
    } catch (error: any) {
      lastError = error;
      if (!isSchemaCacheError(error) || attempt === attempts) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 250 * attempt));
    }
  }
  throw lastError;
}

function sanitizeSearchTerm(value: string): string {
  return value.replace(/[%,'"]/g, ' ').trim();
}

function clampPage(value: unknown): number {
  const page = Number(value || 1);
  return Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
}

function clampLimit(value: unknown, fallback = 20): number {
  const limit = Number(value || fallback);
  if (!Number.isFinite(limit) || limit <= 0) return fallback;
  return Math.min(1000, Math.floor(limit));
}

function buildSummaryKey(kind: OrderSummaryRecordKind, sortKey: string, sourceId: string): string {
  return `${ORDER_SUMMARY_PREFIX}${kind}:${sortKey}:${encodeURIComponent(sourceId)}`;
}

function prefixUpperBound(prefix: string): string {
  if (!prefix) return '\uffff';
  const chars = Array.from(prefix);
  const last = chars.pop()!;
  const nextCodePoint = (last.codePointAt(0) || 0) + 1;
  return `${chars.join('')}${String.fromCodePoint(nextCodePoint)}`;
}

function applyPrefixRange(query: any, prefix: string) {
  return query
    .gte('key', prefix)
    .lt('key', prefixUpperBound(prefix));
}

function extractStoreOrderCustomer(order: any) {
  const name = String(order?.customer?.name || '').trim();
  const email = normalizeEmail(order?.customer?.email || '');
  return { name, email };
}

function extractStoreOrderSkus(order: any): string[] {
  const items = Array.isArray(order?.items) ? order.items : [];
  if (!items.length) return [];

  const normalized = items
    .map((item: any) => String(item?.sku || item?.id || '').trim())
    .filter(Boolean);

  if (!normalized.length) return [];

  const unique = Array.from(new Set(normalized));
  return unique.slice(0, 12);
}

function rowToSummary(row: any): OrderSummaryRecord {
  const totalAmount = Number(row?.total_amount ?? 0);
  const createdAt = asIsoDate(row?.created_at || row?.sort_key);
  const sourceId = String(row?.source_id || '').trim();
  const recordKind = String(row?.record_kind || 'store_order') as OrderSummaryRecordKind;

  const itemSkusRaw = Array.isArray(row?.item_skus)
    ? row.item_skus
    : Array.isArray(row?.items)
    ? row.items.map((item: any) => String(item?.sku || item?.id || '').trim()).filter(Boolean)
    : [];
  const itemSkus = Array.from(new Set(itemSkusRaw.map((value: any) => String(value || '').trim()).filter(Boolean))).slice(0, 12);

  return {
    version: 1,
    record_kind: recordKind,
    summary_key: String(row?.summary_key || buildSummaryKey(recordKind, asIsoDate(row?.sort_key || createdAt), sourceId)),
    source_key: String(row?.source_key || ''),
    source_id: sourceId,
    sort_key: asIsoDate(row?.sort_key || createdAt),
    order_id: normalizeString(row?.order_id),
    entity_id: Number.isFinite(Number(row?.entity_id)) ? Number(row.entity_id) : null,
    increment_id: normalizeString(row?.increment_id),
    created_at: createdAt,
    updated_at: normalizeString(row?.updated_at),
    payment_provider: normalizeString(row?.payment_provider),
    payment_status: normalizeString(row?.payment_status),
    fulfillment_status: normalizeString(row?.fulfillment_status),
    total_amount: Number.isFinite(totalAmount) ? totalAmount : 0,
    shipping_carrier: normalizeString(row?.shipping_carrier),
    shipping_service: normalizeString(row?.shipping_service),
    tracking_code: normalizeString(row?.tracking_code),
    customer_name: normalizeString(row?.customer_name),
    customer_email: normalizeEmail(row?.customer_email || ''),
    customer_firstname: normalizeString(row?.customer_firstname),
    customer_lastname: normalizeString(row?.customer_lastname),
    currency_code: normalizeString(row?.currency_code || 'BRL'),
    status: normalizeString(row?.status),
    asaas_invoice_url: normalizeString(row?.asaas_invoice_url),
    vindi_url: normalizeString(row?.vindi_url),
    stripe_checkout_url: normalizeString(row?.stripe_checkout_url),
    item_skus: itemSkus,
    orderId: normalizeString(row?.order_id) || undefined,
    createdAt,
    customer: {
      name: String(row?.customer_name || '').trim(),
      email: normalizeEmail(row?.customer_email || ''),
    },
    totals: {
      total: Number.isFinite(totalAmount) ? totalAmount : 0,
    },
    shipping: row?.shipping_carrier || row?.shipping_service
      ? {
          carrier: String(row?.shipping_carrier || '').trim() || undefined,
          service: String(row?.shipping_service || '').trim() || undefined,
        }
      : null,
  };
}

async function fetchValuesByKeys(keys: string[]): Promise<Map<string, any>> {
  if (!keys.length) return new Map();
  const entries = new Map<string, any>();
  const concurrency = 10;

  for (let index = 0; index < keys.length; index += concurrency) {
    const chunk = keys.slice(index, index + concurrency);
    const values = await Promise.all(chunk.map(async (key) => {
      try {
        return await kv.get(key);
      } catch (error) {
        console.warn(`[OrdersReadModel] exact key fetch skipped for ${key}:`, error);
        return undefined;
      }
    }));

    chunk.forEach((key, chunkIndex) => {
      if (values[chunkIndex] !== undefined) {
        entries.set(key, values[chunkIndex]);
      }
    });
  }
  return entries;
}

async function fetchKeysAfterKey(prefix: string, afterKey: string | null | undefined, limit: number): Promise<string[]> {
  const supabase = getSupabase();
  let query = supabase
    .from(KV_TABLE)
    .select('key');

  query = afterKey
    ? query.gt('key', afterKey)
    : query.gte('key', prefix);

  const { data, error } = await runAbortableQuery(`fetchKeysAfterKey:${prefix}`, (signal) => withSchemaRetry(() => query
    .order('key', { ascending: true })
    .limit(limit)
    .abortSignal(signal)));

  if (error) {
    throw new Error(error.message);
  }

  return ((data || []) as Array<{ key: string }>)
    .map((entry) => String(entry.key || ''))
    .filter((key) => key.startsWith(prefix));
}

async function fetchEntriesAfterKey(prefix: string, afterKey: string | null | undefined, limit: number): Promise<Array<{ key: string; value: any }>> {
  const keys = await fetchKeysAfterKey(prefix, afterKey, limit);
  if (!keys.length) {
    return [];
  }

  const valueMap = await fetchValuesByKeys(keys);
  return keys
    .map((key) => ({ key, value: valueMap.get(key) }))
    .filter((entry) => entry.value !== undefined);
}

async function scanKvPrefixValues(prefix: string): Promise<any[]> {
  const supabase = getSupabase();
  const allValues: any[] = [];
  let from = 0;

  while (true) {
    let query = applyPrefixRange(
      supabase
        .from(KV_TABLE)
        .select('value'),
      prefix,
    );

    const { data, error } = await runAbortableQuery(`scanKvPrefixValues:${prefix}:${from}`, (signal) => withSchemaRetry(() => query
      .order('key', { ascending: true })
      .range(from, from + ORDER_SOURCE_SCAN_BATCH_SIZE - 1)
      .abortSignal(signal)), ORDER_SOURCE_SCAN_TIMEOUT_MS);

    if (error) {
      throw new Error(error.message);
    }

    const rows = (data || []) as Array<{ value: any }>;
    if (!rows.length) {
      break;
    }

    allValues.push(...rows.map((entry) => entry.value));

    if (rows.length < ORDER_SOURCE_SCAN_BATCH_SIZE) {
      break;
    }

    from += ORDER_SOURCE_SCAN_BATCH_SIZE;
  }

  return allValues;
}

export function buildStoreOrderSummary(order: any): OrderSummaryRecord | null {
  if (!isStoreOrderRecord(order)) return null;

  const orderId = String(order?.orderId || order?.id || '').trim();
  if (!orderId) return null;

  const createdAt = asIsoDate(getOrderRecordDate(order));
  const updatedAt = normalizeString(order?.updatedAt || order?.updated_at || null);
  const customer = extractStoreOrderCustomer(order);
  const totalAmount = Number(order?.totals?.total ?? 0);

  const itemSkus = extractStoreOrderSkus(order);

  return {
    version: 1,
    record_kind: 'store_order',
    summary_key: buildSummaryKey('store_order', createdAt, orderId),
    source_key: `order:${orderId}`,
    source_id: orderId,
    sort_key: createdAt,
    order_id: orderId,
    entity_id: null,
    increment_id: null,
    created_at: createdAt,
    updated_at: updatedAt,
    payment_provider: normalizeString(order?.payment_provider || 'asaas'),
    payment_status: normalizeString(order?.payment_status || order?.status || 'waiting_payment'),
    fulfillment_status: normalizeString(order?.fulfillment_status || 'pending'),
    total_amount: Number.isFinite(totalAmount) ? totalAmount : 0,
    shipping_carrier: normalizeString(order?.shipping?.carrier || order?.carrier_name || null),
    shipping_service: normalizeString(order?.shipping?.service || null),
    tracking_code: normalizeString(order?.tracking_code || null),
    customer_name: customer.name || null,
    customer_email: customer.email || null,
    customer_firstname: null,
    customer_lastname: null,
    currency_code: 'BRL',
    status: normalizeString(order?.payment_status || order?.status || 'waiting_payment'),
    asaas_invoice_url: normalizeString(order?.asaas_invoice_url || null),
    vindi_url: normalizeString(order?.vindi_url || null),
    stripe_checkout_url: normalizeString(order?.stripe_checkout_url || null),
    item_skus: itemSkus,
    orderId,
    createdAt,
    customer: {
      name: customer.name,
      email: customer.email,
    },
    totals: {
      total: Number.isFinite(totalAmount) ? totalAmount : 0,
    },
    shipping: order?.shipping
      ? {
          carrier: order?.shipping?.carrier,
          service: order?.shipping?.service,
        }
      : null,
  };
}

export function buildMagentoStoredOrderSummary(order: any, sourceKey?: string | null): OrderSummaryRecord | null {
  if (!isMagentoStoredOrderRecord(order)) return null;

  const identity = getMagentoStoredOrderIdentity(order);
  if (!identity) return null;

  const createdAt = asIsoDate(getOrderRecordDate(order));
  const updatedAt = normalizeString(order?.updatedAt || order?.updated_at || null);
  const firstName = String(order?.customer_firstname || '').trim();
  const lastName = String(order?.customer_lastname || '').trim();
  const customerName = `${firstName} ${lastName}`.trim();
  const customerEmail = normalizeEmail(order?.customer_email || '');
  const grandTotal = Number(order?.grand_total ?? 0);

  return {
    version: 1,
    record_kind: 'magento_stored_order',
    summary_key: buildSummaryKey('magento_stored_order', createdAt, identity),
    source_key: sourceKey || `magento_order:${identity}`,
    source_id: identity,
    sort_key: createdAt,
    order_id: null,
    entity_id: Number.isFinite(Number(order?.entity_id)) ? Number(order.entity_id) : null,
    increment_id: normalizeString(order?.increment_id || null),
    created_at: createdAt,
    updated_at: updatedAt,
    payment_provider: null,
    payment_status: null,
    fulfillment_status: null,
    total_amount: Number.isFinite(grandTotal) ? grandTotal : 0,
    shipping_carrier: null,
    shipping_service: null,
    tracking_code: null,
    customer_name: customerName || null,
    customer_email: customerEmail || null,
    customer_firstname: firstName || null,
    customer_lastname: lastName || null,
    currency_code: normalizeString(order?.base_currency_code || 'BRL'),
    status: normalizeString(order?.status || null),
  };
}

async function upsertSummaryRecord(summary: OrderSummaryRecord): Promise<void> {
  const supabase = getSupabase();
  const { error } = await withSchemaRetry(() => supabase
    .from(KV_TABLE)
    .upsert({
      key: summary.summary_key,
      value: summary,
    }));
  if (error) {
    throw new Error(error.message);
  }
}

async function upsertSummaryBatch(summaries: OrderSummaryRecord[]): Promise<void> {
  if (!summaries.length) return;
  const supabase = getSupabase();
  const payload = summaries.map((summary) => ({
    key: summary.summary_key,
    value: summary,
  }));
  const { error } = await withSchemaRetry(() => supabase
    .from(KV_TABLE)
    .upsert(payload));
  if (error) {
    throw new Error(error.message);
  }
}

async function readMetaValue<T>(key: string): Promise<T | null> {
  const path = key === ORDERS_READ_MODEL_FLAG_KEY ? READ_MODEL_FLAG_PATH : READ_MODEL_REBUILD_STATE_PATH;
  const supabase = getSupabase();
  await ensureReadModelMetaBucket();

  const { data, error } = await supabase.storage
    .from(READ_MODEL_META_BUCKET)
    .download(path);
  if (error) {
    if (isNotFoundError(error)) return null;
    throw new Error(error.message || `Nao foi possivel ler ${key}`);
  }

  const text = await data.text();
  if (!text) return null;
  return JSON.parse(text) as T;
}

async function writeMetaValue(key: string, value: any): Promise<void> {
  const path = key === ORDERS_READ_MODEL_FLAG_KEY ? READ_MODEL_FLAG_PATH : READ_MODEL_REBUILD_STATE_PATH;
  const supabase = getSupabase();
  await ensureReadModelMetaBucket();

  const payload = JSON.stringify(value, null, 2);
  const { error } = await supabase.storage
    .from(READ_MODEL_META_BUCKET)
    .upload(path, new TextEncoder().encode(payload), {
      contentType: 'application/json; charset=utf-8',
      cacheControl: '0',
      upsert: true,
    });
  if (error) {
    throw new Error(error.message);
  }
}

function isNotFoundError(error: any): boolean {
  const message = String(error?.message || '').toLowerCase();
  return error?.statusCode === 404 || error?.status === 404 || message.includes('not found');
}

async function ensureReadModelMetaBucket() {
  if (readModelMetaBucketReady) return;
  const supabase = getSupabase();
  const { data: buckets, error: listError } = await supabase.storage.listBuckets();
  if (listError) {
    throw new Error(listError.message || 'Nao foi possivel listar buckets do read model');
  }
  const exists = (buckets || []).some((bucket) => bucket.name === READ_MODEL_META_BUCKET);
  if (!exists) {
    const { error: createError } = await supabase.storage.createBucket(READ_MODEL_META_BUCKET, { public: false });
    if (createError && !String(createError.message || '').toLowerCase().includes('duplicate')) {
      throw new Error(createError.message || 'Nao foi possivel criar bucket do read model');
    }
  }
  readModelMetaBucketReady = true;
}

export async function getOrdersReadModelEnabled(): Promise<boolean> {
  try {
    const value = await readMetaValue<any>(ORDERS_READ_MODEL_FLAG_KEY);
    if (typeof value === 'boolean') return value;
    if (value && typeof value === 'object') return value.enabled === true;
    return false;
  } catch {
    return false;
  }
}

export async function setOrdersReadModelEnabled(enabled: boolean): Promise<void> {
  await writeMetaValue(ORDERS_READ_MODEL_FLAG_KEY, {
    enabled,
    updated_at: new Date().toISOString(),
  });
}

export async function getOrderReadModelRebuildState(): Promise<OrderReadModelRebuildState | null> {
  try {
    const value = await readMetaValue<any>(ORDERS_READ_MODEL_REBUILD_STATE_KEY);
    if (!value || typeof value !== 'object') return null;
    return value as OrderReadModelRebuildState;
  } catch {
    return null;
  }
}

export async function syncStoreOrderSummarySafe(order: any, context = 'order_write'): Promise<void> {
  try {
    const summary = buildStoreOrderSummary(order);
    if (!summary) return;
    await upsertSummaryRecord(summary);
  } catch (error) {
    console.warn(`[OrdersReadModel] store sync skipped (${context}):`, error);
  }

  await backupStoreOrderSafe(order, context);
}

export async function syncMagentoStoredOrderSummarySafe(order: any, sourceKey?: string | null, context = 'magento_write'): Promise<void> {
  try {
    const summary = buildMagentoStoredOrderSummary(order, sourceKey);
    if (!summary) return;
    await upsertSummaryRecord(summary);
  } catch (error) {
    console.warn(`[OrdersReadModel] magento sync skipped (${context}):`, error);
  }
}

function applySearchToQuery(query: any, recordKind: OrderSummaryRecordKind, search: string) {
  const term = sanitizeSearchTerm(search);
  if (!term) return query;

  if (recordKind === 'store_order') {
    return query.or([
      `value->>order_id.ilike.%${term}%`,
      `value->>customer_name.ilike.%${term}%`,
      `value->>customer_email.ilike.%${term}%`,
      `value->>tracking_code.ilike.%${term}%`,
    ].join(','));
  }

  return query.or([
    `value->>increment_id.ilike.%${term}%`,
    `value->>customer_name.ilike.%${term}%`,
    `value->>customer_email.ilike.%${term}%`,
    `value->>status.ilike.%${term}%`,
    `value->>source_id.ilike.%${term}%`,
  ].join(','));
}

function applyStoreSourceSearchQuery(query: any, search: string) {
  const term = sanitizeSearchTerm(search);
  if (!term) return query;

  return query.or([
    `value->>orderId.ilike.%${term}%`,
    `value->customer->>name.ilike.%${term}%`,
    `value->customer->>email.ilike.%${term}%`,
    `value->>tracking_code.ilike.%${term}%`,
  ].join(','));
}

function applyMagentoSourceSearchQuery(query: any, search: string) {
  const term = sanitizeSearchTerm(search);
  if (!term) return query;

  return query.or([
    `value->>increment_id.ilike.%${term}%`,
    `value->>customer_firstname.ilike.%${term}%`,
    `value->>customer_lastname.ilike.%${term}%`,
    `value->>customer_email.ilike.%${term}%`,
    `value->>status.ilike.%${term}%`,
    `value->>entity_id.ilike.%${term}%`,
  ].join(','));
}

export async function listOrderSummaries(options: ListOrderSummariesOptions): Promise<{
  items: OrderSummaryRecord[];
  total: number;
  page: number;
  limit: number;
  has_more: boolean;
}> {
  const supabase = getSupabase();
  const page = clampPage(options.page);
  const limit = clampLimit(options.limit, 20);
  const from = (page - 1) * limit;
  const prefix = `${ORDER_SUMMARY_PREFIX}${options.recordKind}:`;

  let query = applyPrefixRange(
    supabase
      .from(KV_TABLE)
      .select('key, value'),
    prefix,
  );

  if (options.recordKind === 'store_order') {
    if (options.paymentStatus) {
      query = query.filter('value->>payment_status', 'eq', options.paymentStatus);
    }
    if (options.fulfillmentStatus) {
      query = query.filter('value->>fulfillment_status', 'eq', options.fulfillmentStatus);
    }
  }

  query = applySearchToQuery(query, options.recordKind, options.search || '');

  const { data, error } = await runAbortableQuery(`listOrderSummaries:${options.recordKind}`, (signal) => withSchemaRetry(() => query
    .order('key', { ascending: false })
    .range(from, from + limit)
    .abortSignal(signal)));

  if (error) {
    throw new Error(error.message);
  }

  const rawItems = (data || []) as Array<{ key: string; value: any }>;
  const has_more = rawItems.length > limit;
  const items = rawItems
    .slice(0, limit)
    .map((entry: any) => rowToSummary(entry.value));

  if (options.recordKind === 'store_order' && items.length > 0) {
    const missingSkuItems = items.filter(
      (item) => (!item.item_skus || item.item_skus.length === 0) && item.source_key,
    );
    if (missingSkuItems.length > 0) {
      const sourceKeys = missingSkuItems
        .map((item) => String(item.source_key || '').trim())
        .filter(Boolean);
      const sourceMap = await fetchValuesByKeys(sourceKeys);

      for (const item of missingSkuItems) {
        const sourceOrder = sourceMap.get(String(item.source_key || '').trim());
        const skus = extractStoreOrderSkus(sourceOrder);
        if (skus.length > 0) {
          item.item_skus = skus;
        }
      }
    }
  }

  return {
    items,
    total: from + items.length + (has_more ? 1 : 0),
    page,
    limit,
    has_more,
  };
}

export async function readMagentoStoredOrdersPageFromReadModel(options: {
  page?: number;
  limit?: number;
  search?: string;
}): Promise<{
  items: any[];
  total_count: number;
  page: number;
  limit: number;
  has_more: boolean;
}> {
  const result = await listOrderSummaries({
    recordKind: 'magento_stored_order',
    page: options.page,
    limit: options.limit,
    search: options.search,
  });

  const sourceKeys = result.items
    .map((item) => item.source_key)
    .filter(Boolean);
  const rawMap = await fetchValuesByKeys(sourceKeys);

  const items = result.items.map((item) => rawMap.get(item.source_key) || {
    entity_id: item.entity_id,
    increment_id: item.increment_id,
    created_at: item.created_at,
    status: item.status,
    grand_total: item.total_amount,
    base_currency_code: item.currency_code || 'BRL',
    customer_firstname: item.customer_firstname || '',
    customer_lastname: item.customer_lastname || '',
    customer_email: item.customer_email || '',
  });

  return {
    items,
    total_count: result.total,
    page: result.page,
    limit: result.limit,
    has_more: result.has_more,
  };
}

async function callJsonRpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const supabase = getSupabase();
  const { data, error } = await supabase.rpc(fn, args);
  if (error) {
    throw new Error(error.message);
  }
  return data as T;
}

export async function listStoreOrdersFromSource(options: ListSourceStoreOrdersOptions): Promise<{
  items: any[];
  total: number;
  page: number;
  limit: number;
  has_more: boolean;
}> {
  const page = clampPage(options.page);
  const limit = clampLimit(options.limit, 100);
  try {
    const result = await callJsonRpc<any>(STORE_SOURCE_PAGE_RPC, {
      p_page: page,
      p_limit: limit,
      p_search: String(options.search || '').trim() || null,
      p_payment_status: options.paymentStatus || null,
      p_fulfillment_status: options.fulfillmentStatus || null,
    });

    const items = Array.isArray(result?.items)
      ? result.items.filter((entry) => isStoreOrderRecord(entry))
      : [];

    if (items.length > 0 || Number(result?.total || 0) > 0) {
      return {
        items,
        total: Number(result?.total || 0),
        page: Number(result?.page || page),
        limit: Number(result?.limit || limit),
        has_more: result?.has_more === true,
      };
    }

    console.warn('[OrdersReadModel] store source RPC returned empty; falling back to KV scan');
  } catch (rpcError) {
    console.warn('[OrdersReadModel] store source RPC fallback activated:', rpcError);
  }

  const from = (page - 1) * limit;

  const filtered = (await kv.getByPrefix('order:'))
    .filter((entry) => isStoreOrderRecord(entry))
    .map((entry) => entry)
    .filter((entry: any) => !options.paymentStatus || String(entry?.payment_status || entry?.status || '') === options.paymentStatus)
    .filter((entry: any) => !options.fulfillmentStatus || String(entry?.fulfillment_status || '') === options.fulfillmentStatus)
    .filter((entry: any) => {
      const term = String(options.search || '').trim().toLowerCase();
      if (!term) return true;
      const haystack = [
        String(entry?.orderId || ''),
        String(entry?.customer?.name || ''),
        String(entry?.customer?.email || ''),
        String(entry?.tracking_code || ''),
      ].join(' ').toLowerCase();
      return haystack.includes(term);
    })
    .sort(compareOrderRecordDateDesc);

  const items = filtered.slice(from, from + limit);

  return {
    items,
    total: filtered.length,
    page,
    limit,
    has_more: from + limit < filtered.length,
  };
}

export async function readMagentoStoredOrdersPageFromSource(options: {
  page?: number;
  limit?: number;
  search?: string;
}): Promise<{
  items: any[];
  total_count: number;
  page: number;
  limit: number;
  has_more: boolean;
}> {
  const page = clampPage(options.page);
  const limit = clampLimit(options.limit, 20);
  try {
    const result = await callJsonRpc<any>(MAGENTO_SOURCE_PAGE_RPC, {
      p_page: page,
      p_limit: limit,
      p_search: String(options.search || '').trim() || null,
    });

    if ((Array.isArray(result?.items) && result.items.length > 0) || Number(result?.total || 0) > 0) {
      return {
        items: Array.isArray(result?.items) ? result.items : [],
        total_count: Number(result?.total || 0),
        page: Number(result?.page || page),
        limit: Number(result?.limit || limit),
        has_more: result?.has_more === true,
      };
    }

    console.warn('[OrdersReadModel] magento source RPC returned empty; falling back to KV scan');
  } catch (rpcError) {
    console.warn('[OrdersReadModel] magento source RPC fallback activated:', rpcError);
  }

  const from = (page - 1) * limit;
  const [rawMagentoEntries, legacyOrderEntries] = await Promise.all([
    scanKvPrefixValues('magento_order:'),
    scanKvPrefixValues('order:'),
  ]);

  const dedupedByIdentity = new Map<string, any>();
  for (const entry of [...rawMagentoEntries, ...legacyOrderEntries]) {
    if (!isMagentoStoredOrderRecord(entry)) {
      continue;
    }
    const identity = getMagentoStoredOrderIdentity(entry);
    if (!identity) {
      continue;
    }
    if (!dedupedByIdentity.has(identity)) {
      dedupedByIdentity.set(identity, entry);
    }
  }

  const filtered = Array.from(dedupedByIdentity.values())
    .filter((entry: any) => {
      const term = String(options.search || '').trim().toLowerCase();
      if (!term) return true;
      const haystack = [
        String(entry?.increment_id || ''),
        String(entry?.entity_id || ''),
        String(entry?.customer_firstname || ''),
        String(entry?.customer_lastname || ''),
        String(entry?.customer_email || ''),
        String(entry?.status || ''),
      ].join(' ').toLowerCase();
      return haystack.includes(term);
    })
    .sort(compareOrderRecordDateDesc);

  const items = filtered.slice(from, from + limit);

  return {
    items,
    total_count: filtered.length,
    page,
    limit,
    has_more: from + limit < filtered.length,
  };
}

export async function rebuildOrderSummariesStep(options?: {
  batchSize?: number;
  reset?: boolean;
}): Promise<{
  state: OrderReadModelRebuildState;
}> {
  const batchSize = clampLimit(options?.batchSize, 200);
  let state = options?.reset ? null : await getOrderReadModelRebuildState();
  if (!state) {
    const now = new Date().toISOString();
    state = {
      started_at: now,
      updated_at: now,
      completed_at: null,
      batch_size: batchSize,
      phase: 'initialized',
      last_error: null,
      order_offset: 0,
      magento_offset: 0,
      order_cursor_key: null,
      magento_cursor_key: null,
      order_done: false,
      magento_done: false,
      processed_order_entries: 0,
      processed_magento_entries: 0,
      upserted_store_orders: 0,
      upserted_magento_orders: 0,
    };
  }

  state = {
    ...state,
    batch_size: batchSize,
    updated_at: new Date().toISOString(),
    completed_at: null,
    last_error: null,
  };
  await writeMetaValue(ORDERS_READ_MODEL_REBUILD_STATE_KEY, state);

  try {
    if (!state.order_done) {
      const orderEntries = await fetchEntriesAfterKey('order:', state.order_cursor_key, batchSize);
      const storeSummaries: OrderSummaryRecord[] = [];
      const legacyMagentoMap = new Map<string, OrderSummaryRecord>();

      for (const entry of orderEntries) {
        const storeSummary = buildStoreOrderSummary(entry.value);
        if (storeSummary) {
          storeSummaries.push(storeSummary);
          continue;
        }

        const legacyMagentoSummary = buildMagentoStoredOrderSummary(entry.value, entry.key);
        if (legacyMagentoSummary) {
          legacyMagentoMap.set(legacyMagentoSummary.source_id, legacyMagentoSummary);
        }
      }

      await upsertSummaryBatch(storeSummaries);
      await upsertSummaryBatch(Array.from(legacyMagentoMap.values()));

      const lastOrderKey = orderEntries.length
        ? String(orderEntries[orderEntries.length - 1]?.key || '')
        : state.order_cursor_key || null;

      state = {
        ...state,
        phase: orderEntries.length < batchSize ? 'store_orders_completed' : 'store_orders_progress',
        order_offset: state.order_offset + orderEntries.length,
        order_cursor_key: lastOrderKey,
        processed_order_entries: state.processed_order_entries + orderEntries.length,
        upserted_store_orders: state.upserted_store_orders + storeSummaries.length,
        upserted_magento_orders: state.upserted_magento_orders + legacyMagentoMap.size,
        order_done: orderEntries.length < batchSize,
        updated_at: new Date().toISOString(),
      };
      await writeMetaValue(ORDERS_READ_MODEL_REBUILD_STATE_KEY, state);
    }

    if (!state.magento_done) {
      const magentoEntries = await fetchEntriesAfterKey('magento_order:', state.magento_cursor_key, batchSize);
      const magentoSummaries: OrderSummaryRecord[] = [];

      for (const entry of magentoEntries) {
        const summary = buildMagentoStoredOrderSummary(entry.value, entry.key);
        if (summary) {
          magentoSummaries.push(summary);
        }
      }

      await upsertSummaryBatch(magentoSummaries);

      const lastMagentoKey = magentoEntries.length
        ? String(magentoEntries[magentoEntries.length - 1]?.key || '')
        : state.magento_cursor_key || null;

      state = {
        ...state,
        phase: magentoEntries.length < batchSize ? 'completed' : 'magento_orders_progress',
        magento_offset: state.magento_offset + magentoEntries.length,
        magento_cursor_key: lastMagentoKey,
        processed_magento_entries: state.processed_magento_entries + magentoEntries.length,
        upserted_magento_orders: state.upserted_magento_orders + magentoSummaries.length,
        magento_done: magentoEntries.length < batchSize,
        updated_at: new Date().toISOString(),
      };
      if (state.order_done && state.magento_done) {
        state.completed_at = new Date().toISOString();
      }
      await writeMetaValue(ORDERS_READ_MODEL_REBUILD_STATE_KEY, state);
    }

    return {
      state,
    };
  } catch (error: any) {
    state = {
      ...state,
      phase: 'error',
      last_error: error?.message || 'Falha ao reconstruir o read model.',
      updated_at: new Date().toISOString(),
    };
    await writeMetaValue(ORDERS_READ_MODEL_REBUILD_STATE_KEY, state);
    throw error;
  }
}

export async function getOrderReadModelHealthLight(): Promise<{
  enabled: boolean;
  state: OrderReadModelRebuildState | null;
}> {
  const [enabled, state] = await Promise.all([
    getOrdersReadModelEnabled(),
    getOrderReadModelRebuildState(),
  ]);

  return {
    enabled,
    state,
  };
}

export async function getOrderReadModelHealth(): Promise<ReadModelHealth> {
  const supabase = getSupabase();
  const storePrefix = `${ORDER_SUMMARY_PREFIX}store_order:`;
  const magentoPrefix = `${ORDER_SUMMARY_PREFIX}magento_stored_order:`;
  const [enabled, state, storeCountResult, magentoCountResult, latestStoreResult, latestMagentoResult] = await Promise.all([
    getOrdersReadModelEnabled(),
    getOrderReadModelRebuildState(),
    applyPrefixRange(supabase.from(KV_TABLE).select('key', { count: 'planned', head: true }), storePrefix),
    applyPrefixRange(supabase.from(KV_TABLE).select('key', { count: 'planned', head: true }), magentoPrefix),
    applyPrefixRange(supabase.from(KV_TABLE).select('value'), storePrefix).order('key', { ascending: false }).limit(20),
    applyPrefixRange(supabase.from(KV_TABLE).select('value'), magentoPrefix).order('key', { ascending: false }).limit(20),
  ]);

  if (storeCountResult.error) throw new Error(storeCountResult.error.message);
  if (magentoCountResult.error) throw new Error(magentoCountResult.error.message);
  if (latestStoreResult.error) throw new Error(latestStoreResult.error.message);
  if (latestMagentoResult.error) throw new Error(latestMagentoResult.error.message);

  const sourceStoreTotal = state?.upserted_store_orders ?? 0;
  const sourceMagentoTotal = state?.upserted_magento_orders ?? 0;
  const storeSummaryTotal = storeCountResult.count || 0;
  const magentoSummaryTotal = magentoCountResult.count || 0;

  return {
    enabled,
    state,
    store_orders: {
      source_total: sourceStoreTotal,
      summary_total: storeSummaryTotal,
      latest_summary_ids: (latestStoreResult.data || []).map((row: any) => String(row?.value?.source_id || '')).filter(Boolean),
      missing_from_summary: state?.order_done
        ? (sourceStoreTotal === storeSummaryTotal ? [] : ['store_backfill_divergence'])
        : ['store_backfill_in_progress'],
    },
    magento_stored_orders: {
      source_total: sourceMagentoTotal,
      summary_total: magentoSummaryTotal,
      latest_summary_ids: (latestMagentoResult.data || []).map((row: any) => String(row?.value?.source_id || '')).filter(Boolean),
      missing_from_summary: state?.magento_done
        ? (sourceMagentoTotal === magentoSummaryTotal ? [] : ['magento_backfill_divergence'])
        : ['magento_backfill_in_progress'],
    },
  };
}

export async function rebuildOrderSummaries(): Promise<{
  state: OrderReadModelRebuildState;
}> {
  let state: OrderReadModelRebuildState | null = null;
  for (let i = 0; i < 200; i += 1) {
    const step = await rebuildOrderSummariesStep({
      batchSize: 500,
      reset: i === 0,
    });
    state = step.state;
    if (state.order_done && state.magento_done) {
      break;
    }
  }

  if (!state) {
    throw new Error('Nao foi possivel reconstruir o read model de pedidos.');
  }

  return { state };
}
