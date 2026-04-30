import { Hono } from 'npm:hono';
import { createClient } from "jsr:@supabase/supabase-js@2.49.8";
import * as kv from './kv_store.tsx';
import {
  getOrderReadModelHealthLight,
  getOrdersReadModelEnabled,
  rebuildOrderSummariesStep,
  setOrdersReadModelEnabled,
} from './order-read-model.tsx';
import { isMagentoStoredOrderRecord, isStoreOrderRecord } from './order-records.tsx';

export const ordersAdmin = new Hono();

const KV_TABLE = 'kv_store_1d6e33e0';
const STORE_READ_MODEL_TABLE = 'order_summaries_1d6e33e0';
const STORE_BACKUP_BUCKET = 'make-1d6e33e0-store-order-backup';
const MAGENTO_BACKUP_BUCKET = 'make-1d6e33e0-magento-backup';
const ORDER_EVENTS_PREFIX = 'order_events:';
const INDEX_BY_CUSTOMER_PREFIX = 'idx_orders_by_customer:';
const LEGACY_INDEX_PREFIX = 'idx:orders:';

function getSupabase() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

function prefixUpperBound(prefix: string): string {
  if (!prefix) return '\uffff';
  const chars = Array.from(prefix);
  const last = chars.pop()!;
  const nextCodePoint = (last.codePointAt(0) || 0) + 1;
  return `${chars.join('')}${String.fromCodePoint(nextCodePoint)}`;
}

async function countBucketFiles(bucket: string, folder: string): Promise<number> {
  const supabase = getSupabase();
  let total = 0;
  let offset = 0;
  const limit = 1000;

  while (true) {
    const { data, error } = await supabase.storage
      .from(bucket)
      .list(folder, {
        limit,
        offset,
        sortBy: { column: 'name', order: 'asc' },
      });

    if (error) {
      throw new Error(error.message || `Falha ao listar bucket ${bucket}`);
    }

    const batch = (data || []).length;
    total += batch;
    if (batch < limit) break;
    offset += limit;
  }

  return total;
}

ordersAdmin.get('/read-model-health', async (c) => {
  try {
    const health = await getOrderReadModelHealthLight();
    return c.json({ success: true, health });
  } catch (error: any) {
    console.error('[OrdersAdmin] read-model-health error:', error);
    return c.json({ success: false, error: error?.message || 'Falha ao verificar o read model.' }, 500);
  }
});

ordersAdmin.get('/deep-health', async (c) => {
  try {
    const supabase = getSupabase();
    const kvOrderValues = (await kv.getByPrefix('order:').catch(() => []))
      .filter((entry: any) => entry && typeof entry === 'object');

    const [
      orderEventsCountResult,
      orderEventsLatestResult,
      indexByCustomerCountResult,
      indexByCustomerLatestResult,
      legacyIndexCountResult,
      legacyIndexLatestResult,
      sqlStoreCountResult,
      sqlMagentoCountResult,
      sqlStoreLatestResult,
      sqlMagentoLatestResult,
      storeBackupCount,
      magentoBackupCount,
    ] = await Promise.all([
      supabase
        .from(KV_TABLE)
        .select('key', { count: 'exact', head: true })
        .gte('key', ORDER_EVENTS_PREFIX)
        .lt('key', prefixUpperBound(ORDER_EVENTS_PREFIX)),
      supabase
        .from(KV_TABLE)
        .select('key, value')
        .gte('key', ORDER_EVENTS_PREFIX)
        .lt('key', prefixUpperBound(ORDER_EVENTS_PREFIX))
        .order('key', { ascending: false })
        .limit(10),
      supabase
        .from(KV_TABLE)
        .select('key', { count: 'exact', head: true })
        .gte('key', INDEX_BY_CUSTOMER_PREFIX)
        .lt('key', prefixUpperBound(INDEX_BY_CUSTOMER_PREFIX)),
      supabase
        .from(KV_TABLE)
        .select('key, value')
        .gte('key', INDEX_BY_CUSTOMER_PREFIX)
        .lt('key', prefixUpperBound(INDEX_BY_CUSTOMER_PREFIX))
        .order('key', { ascending: false })
        .limit(10),
      supabase
        .from(KV_TABLE)
        .select('key', { count: 'exact', head: true })
        .gte('key', LEGACY_INDEX_PREFIX)
        .lt('key', prefixUpperBound(LEGACY_INDEX_PREFIX)),
      supabase
        .from(KV_TABLE)
        .select('key, value')
        .gte('key', LEGACY_INDEX_PREFIX)
        .lt('key', prefixUpperBound(LEGACY_INDEX_PREFIX))
        .order('key', { ascending: false })
        .limit(10),
      supabase
        .from(STORE_READ_MODEL_TABLE)
        .select('source_id', { count: 'exact', head: true })
        .eq('record_kind', 'store_order'),
      supabase
        .from(STORE_READ_MODEL_TABLE)
        .select('source_id', { count: 'exact', head: true })
        .eq('record_kind', 'magento_stored_order'),
      supabase
        .from(STORE_READ_MODEL_TABLE)
        .select('source_id, order_id, increment_id, created_at, payment_provider, payment_status, fulfillment_status, customer_email')
        .eq('record_kind', 'store_order')
        .order('created_at', { ascending: false })
        .limit(10),
      supabase
        .from(STORE_READ_MODEL_TABLE)
        .select('source_id, order_id, increment_id, created_at, status, customer_email')
        .eq('record_kind', 'magento_stored_order')
        .order('created_at', { ascending: false })
        .limit(10),
      countBucketFiles(STORE_BACKUP_BUCKET, 'orders').catch(() => 0),
      countBucketFiles(MAGENTO_BACKUP_BUCKET, 'orders').catch(() => 0),
    ]);

    if (orderEventsCountResult.error) throw new Error(orderEventsCountResult.error.message);
    if (orderEventsLatestResult.error) throw new Error(orderEventsLatestResult.error.message);
    if (indexByCustomerCountResult.error) throw new Error(indexByCustomerCountResult.error.message);
    if (indexByCustomerLatestResult.error) throw new Error(indexByCustomerLatestResult.error.message);
    if (legacyIndexCountResult.error) throw new Error(legacyIndexCountResult.error.message);
    if (legacyIndexLatestResult.error) throw new Error(legacyIndexLatestResult.error.message);
    if (sqlStoreCountResult.error && !String(sqlStoreCountResult.error.message || '').toLowerCase().includes('relation')) {
      throw new Error(sqlStoreCountResult.error.message);
    }
    if (sqlMagentoCountResult.error && !String(sqlMagentoCountResult.error.message || '').toLowerCase().includes('relation')) {
      throw new Error(sqlMagentoCountResult.error.message);
    }

    const kvStoreRows = kvOrderValues.filter((value) => isStoreOrderRecord(value));
    const kvMagentoRows = kvOrderValues.filter((value) => isMagentoStoredOrderRecord(value));

    return c.json({
      success: true,
      diagnostics: {
        kv_orders: {
          total_keys: kvOrderValues.length,
          latest_sample: kvOrderValues
            .slice()
            .sort((a: any, b: any) => {
              const aDate = new Date(String(a?.createdAt || a?.created_at || 0)).getTime();
              const bDate = new Date(String(b?.createdAt || b?.created_at || 0)).getTime();
              return bDate - aDate;
            })
            .slice(0, 10)
            .map((value: any) => ({
            orderId: value?.orderId || value?.id || null,
            increment_id: value?.increment_id || null,
            entity_id: value?.entity_id || null,
            customer_email: value?.customer?.email || value?.customer_email || null,
            payment_provider: value?.payment_provider || null,
            payment_status: value?.payment_status || value?.status || null,
            fulfillment_status: value?.fulfillment_status || null,
            created_at: value?.createdAt || value?.created_at || null,
            classification: isStoreOrderRecord(value)
              ? 'store_order'
              : (isMagentoStoredOrderRecord(value) ? 'magento_legacy' : 'unknown'),
          })),
          latest_store_sample_count: kvStoreRows.length,
          latest_magento_sample_count: kvMagentoRows.length,
        },
        sql_read_model: {
          store_total: sqlStoreCountResult.count || 0,
          magento_total: sqlMagentoCountResult.count || 0,
          latest_store: sqlStoreLatestResult.data || [],
          latest_magento: sqlMagentoLatestResult.data || [],
        },
        order_events: {
          total_keys: orderEventsCountResult.count || 0,
          latest_keys: (orderEventsLatestResult.data || []).map((row: any) => String(row?.key || '')),
        },
        order_indexes: {
          by_customer_total: indexByCustomerCountResult.count || 0,
          by_customer_latest: (indexByCustomerLatestResult.data || []).map((row: any) => ({
            key: row.key,
            order_ids: Array.isArray(row.value) ? row.value.slice(0, 10) : [],
          })),
          legacy_email_total: legacyIndexCountResult.count || 0,
          legacy_email_latest: (legacyIndexLatestResult.data || []).map((row: any) => ({
            key: row.key,
            order_ids: Array.isArray(row.value) ? row.value.slice(0, 10) : [],
          })),
        },
        backups: {
          store_orders_files: storeBackupCount,
          magento_orders_files: magentoBackupCount,
        },
      },
    });
  } catch (error: any) {
    console.error('[OrdersAdmin] deep-health error:', error);
    return c.json({ success: false, error: error?.message || 'Falha ao montar o diagnóstico profundo.' }, 500);
  }
});

ordersAdmin.post('/rebuild-read-model', async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const batchSize = Number(body?.batch_size || 200);
    const reset = body?.reset === true;
    const result = await rebuildOrderSummariesStep({
      batchSize,
      reset,
    });
    const health = await getOrderReadModelHealthLight();
    return c.json({
      success: true,
      rebuilt: result,
      health,
    });
  } catch (error: any) {
    console.error('[OrdersAdmin] rebuild-read-model error:', error);
    return c.json({ success: false, error: error?.message || 'Falha ao reconstruir o read model.' }, 500);
  }
});

ordersAdmin.post('/read-model-flag', async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const enabled = body?.enabled === true;
    await setOrdersReadModelEnabled(enabled);
    return c.json({
      success: true,
      enabled: await getOrdersReadModelEnabled(),
    });
  } catch (error: any) {
    console.error('[OrdersAdmin] read-model-flag error:', error);
    return c.json({ success: false, error: error?.message || 'Falha ao atualizar a flag do read model.' }, 500);
  }
});
