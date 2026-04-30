import { createClient } from "jsr:@supabase/supabase-js@2.49.8";

const BUCKET_NAME = 'make-1d6e33e0-store-order-backup';
const INDEX_PATH = 'meta/orders-index.json';
let bucketReady = false;

function getSupabase() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

function getStoreOrderIdentity(order: any): string {
  return String(order?.orderId || order?.id || '').trim();
}

function getOrderDate(order: any): string {
  const raw = String(
    order?.createdAt ||
    order?.created_at ||
    order?.updatedAt ||
    order?.updated_at ||
    new Date(0).toISOString(),
  ).trim();

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    return new Date(0).toISOString();
  }
  return parsed.toISOString();
}

function compareStoreOrderDateDesc(a: any, b: any): number {
  return new Date(getOrderDate(b)).getTime() - new Date(getOrderDate(a)).getTime();
}

function normalizeSearch(value: string): string {
  return String(value || '').trim().toLowerCase();
}

function matchesStoreOrderSearch(order: any, search: string): boolean {
  const term = normalizeSearch(search);
  if (!term) return true;

  const haystack = [
    String(order?.orderId || order?.id || ''),
    String(order?.customer?.name || ''),
    String(order?.customer?.email || ''),
    String(order?.payment_status || order?.status || ''),
    String(order?.fulfillment_status || ''),
    String(order?.tracking_code || ''),
  ].join(' ').toLowerCase();

  return haystack.includes(term);
}

async function ensureBucket() {
  if (bucketReady) return;
  const supabase = getSupabase();
  const { data: buckets, error: listError } = await supabase.storage.listBuckets();
  if (listError) {
    throw new Error(listError.message || 'Nao foi possivel listar buckets de backup da loja');
  }

  const exists = (buckets || []).some((bucket) => bucket.name === BUCKET_NAME);
  if (!exists) {
    const { error: createError } = await supabase.storage.createBucket(BUCKET_NAME, { public: false });
    if (createError && !String(createError.message || '').toLowerCase().includes('duplicate')) {
      throw new Error(createError.message || 'Nao foi possivel criar bucket de backup da loja');
    }
  }

  bucketReady = true;
}

function getOrderPath(orderId: string): string {
  return `orders/${encodeURIComponent(orderId)}.json`;
}

interface StoreOrderBackupSummary {
  orderId: string;
  createdAt: string;
  updatedAt: string | null;
  payment_provider: string | null;
  payment_status: string | null;
  fulfillment_status: string | null;
  customer_name: string | null;
  customer_email: string | null;
  total_amount: number;
  shipping_carrier: string | null;
  shipping_service: string | null;
  tracking_code: string | null;
  asaas_invoice_url: string | null;
  vindi_url: string | null;
  stripe_checkout_url: string | null;
}

interface StoreOrderBackupIndex {
  version: 1;
  updated_at: string;
  orders: StoreOrderBackupSummary[];
}

function normalizeString(value: unknown): string | null {
  const normalized = String(value || '').trim();
  return normalized || null;
}

function normalizeEmail(value: unknown): string | null {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized || null;
}

function buildStoreOrderSummary(order: any): StoreOrderBackupSummary | null {
  const orderId = getStoreOrderIdentity(order);
  if (!orderId) return null;

  const totalAmount = Number(order?.totals?.total ?? 0);

  return {
    orderId,
    createdAt: getOrderDate(order),
    updatedAt: normalizeString(order?.updatedAt || order?.updated_at || null),
    payment_provider: normalizeString(order?.payment_provider || null),
    payment_status: normalizeString(order?.payment_status || order?.status || 'waiting_payment'),
    fulfillment_status: normalizeString(order?.fulfillment_status || 'pending'),
    customer_name: normalizeString(order?.customer?.name || null),
    customer_email: normalizeEmail(order?.customer?.email || null),
    total_amount: Number.isFinite(totalAmount) ? totalAmount : 0,
    shipping_carrier: normalizeString(order?.shipping?.carrier || order?.carrier_name || null),
    shipping_service: normalizeString(order?.shipping?.service || null),
    tracking_code: normalizeString(order?.tracking_code || null),
    asaas_invoice_url: normalizeString(order?.asaas_invoice_url || null),
    vindi_url: normalizeString(order?.vindi_url || null),
    stripe_checkout_url: normalizeString(order?.stripe_checkout_url || null),
  };
}

function buildListOrderFromSummary(summary: StoreOrderBackupSummary): any {
  return {
    orderId: summary.orderId,
    createdAt: summary.createdAt,
    created_at: summary.createdAt,
    updatedAt: summary.updatedAt,
    payment_provider: summary.payment_provider || 'asaas',
    payment_status: summary.payment_status || 'waiting_payment',
    fulfillment_status: summary.fulfillment_status || 'pending',
    tracking_code: summary.tracking_code,
    customer: {
      name: summary.customer_name || '',
      email: summary.customer_email || '',
    },
    totals: {
      total: Number.isFinite(Number(summary.total_amount)) ? Number(summary.total_amount) : 0,
    },
    shipping: (summary.shipping_carrier || summary.shipping_service)
      ? {
          carrier: summary.shipping_carrier || undefined,
          service: summary.shipping_service || undefined,
        }
      : null,
    asaas_invoice_url: summary.asaas_invoice_url,
    vindi_url: summary.vindi_url,
    stripe_checkout_url: summary.stripe_checkout_url,
  };
}

function compareSummaryDateDesc(a: StoreOrderBackupSummary, b: StoreOrderBackupSummary): number {
  return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
}

function matchesStoreOrderSummarySearch(summary: StoreOrderBackupSummary, search: string): boolean {
  const term = normalizeSearch(search);
  if (!term) return true;

  const haystack = [
    summary.orderId,
    summary.customer_name || '',
    summary.customer_email || '',
    summary.payment_status || '',
    summary.fulfillment_status || '',
    summary.tracking_code || '',
  ].join(' ').toLowerCase();

  return haystack.includes(term);
}

async function listStorageFiles(folder: 'orders'): Promise<string[]> {
  const supabase = getSupabase();
  await ensureBucket();

  const files: string[] = [];
  const pageSize = 1000;
  let offset = 0;

  while (true) {
    const { data, error } = await supabase.storage
      .from(BUCKET_NAME)
      .list(folder, {
        limit: pageSize,
        offset,
        sortBy: { column: 'name', order: 'asc' },
      });

    if (error) {
      throw new Error(error.message || `Falha ao listar backup ${folder} da loja`);
    }

    const batch = (data || [])
      .map((entry) => String(entry?.name || '').trim())
      .filter(Boolean);

    if (!batch.length) {
      break;
    }

    files.push(...batch);

    if (batch.length < pageSize) {
      break;
    }

    offset += pageSize;
  }

  return files;
}

async function downloadStorageJson(path: string): Promise<any | null> {
  const supabase = getSupabase();
  await ensureBucket();

  const { data, error } = await supabase.storage
    .from(BUCKET_NAME)
    .download(path);

  if (error) {
    const message = String(error.message || '').toLowerCase();
    if (message.includes('not found')) {
      return null;
    }
    console.warn('[StoreBackupOrders] download skipped:', path, error.message);
    return null;
  }

  try {
    return JSON.parse(await data.text());
  } catch (parseError) {
    console.warn('[StoreBackupOrders] parse skipped:', path, parseError);
    return null;
  }
}

async function readStoreBackupIndex(): Promise<StoreOrderBackupIndex | null> {
  const data = await downloadStorageJson(INDEX_PATH);
  if (!data || typeof data !== 'object' || !Array.isArray(data.orders)) {
    return null;
  }

  return {
    version: 1,
    updated_at: String(data.updated_at || '').trim() || new Date(0).toISOString(),
    orders: data.orders
      .filter((entry: any) => entry && typeof entry === 'object' && String(entry.orderId || '').trim())
      .map((entry: any) => ({
        orderId: String(entry.orderId || '').trim(),
        createdAt: getOrderDate(entry),
        updatedAt: normalizeString(entry.updatedAt || entry.updated_at || null),
        payment_provider: normalizeString(entry.payment_provider || null),
        payment_status: normalizeString(entry.payment_status || null),
        fulfillment_status: normalizeString(entry.fulfillment_status || null),
        customer_name: normalizeString(entry.customer_name || null),
        customer_email: normalizeEmail(entry.customer_email || null),
        total_amount: Number(entry.total_amount ?? 0) || 0,
        shipping_carrier: normalizeString(entry.shipping_carrier || null),
        shipping_service: normalizeString(entry.shipping_service || null),
        tracking_code: normalizeString(entry.tracking_code || null),
        asaas_invoice_url: normalizeString(entry.asaas_invoice_url || null),
        vindi_url: normalizeString(entry.vindi_url || null),
        stripe_checkout_url: normalizeString(entry.stripe_checkout_url || null),
      })),
  };
}

async function writeStoreBackupIndex(index: StoreOrderBackupIndex): Promise<void> {
  const supabase = getSupabase();
  await ensureBucket();

  const payload = JSON.stringify(index, null, 2);
  const { error } = await supabase.storage
    .from(BUCKET_NAME)
    .upload(INDEX_PATH, new TextEncoder().encode(payload), {
      contentType: 'application/json; charset=utf-8',
      cacheControl: '0',
      upsert: true,
    });

  if (error) {
    throw new Error(error.message || 'Falha ao atualizar o indice do backup da loja');
  }
}

async function rebuildStoreBackupIndexFromFiles(): Promise<StoreOrderBackupIndex> {
  const files = await listStorageFiles('orders');
  const allOrders = (await Promise.all(
    files.map((name) => downloadStorageJson(`orders/${name}`)),
  )).filter(Boolean);

  const orders = allOrders
    .map((order: any) => buildStoreOrderSummary(order))
    .filter(Boolean)
    .sort(compareSummaryDateDesc) as StoreOrderBackupSummary[];

  const index: StoreOrderBackupIndex = {
    version: 1,
    updated_at: new Date().toISOString(),
    orders,
  };

  try {
    await writeStoreBackupIndex(index);
  } catch (error) {
    console.warn('[StoreBackupOrders] rebuild index write skipped:', error);
  }

  return index;
}

export async function backupStoreOrderSafe(order: any, context = 'store_order_write'): Promise<void> {
  try {
    const orderId = getStoreOrderIdentity(order);
    if (!orderId) return;

    const supabase = getSupabase();
    await ensureBucket();

    const payload = JSON.stringify(order, null, 2);
    const { error } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(getOrderPath(orderId), new TextEncoder().encode(payload), {
        contentType: 'application/json; charset=utf-8',
        cacheControl: '0',
        upsert: true,
      });

    if (error) {
      throw new Error(error.message || `Falha ao salvar backup do pedido ${orderId}`);
    }

    const summary = buildStoreOrderSummary(order);
    if (!summary) return;

    try {
      const current = await readStoreBackupIndex();
      const deduped = new Map<string, StoreOrderBackupSummary>();
      for (const entry of current?.orders || []) {
        deduped.set(entry.orderId, entry);
      }
      deduped.set(summary.orderId, summary);

      await writeStoreBackupIndex({
        version: 1,
        updated_at: new Date().toISOString(),
        orders: Array.from(deduped.values()).sort(compareSummaryDateDesc),
      });
    } catch (indexError) {
      console.warn(`[StoreBackupOrders] index update skipped (${context}):`, indexError);
    }
  } catch (error) {
    console.warn(`[StoreBackupOrders] backup skipped (${context}):`, error);
  }
}

export async function readStoreOrdersFromBackup(options: {
  page?: number;
  limit?: number;
  search?: string;
  paymentStatus?: string | null;
  fulfillmentStatus?: string | null;
}): Promise<{
  items: any[];
  total: number;
  page: number;
  limit: number;
  has_more: boolean;
  source: 'store_backup';
}> {
  const page = Math.max(1, Number(options.page || 1));
  const limit = Math.min(1000, Math.max(1, Number(options.limit || 50)));
  let index = await readStoreBackupIndex();
  if (!index || !Array.isArray(index.orders) || index.orders.length === 0) {
    index = await rebuildStoreBackupIndexFromFiles();
  }

  const filtered = (index.orders || [])
    .filter((summary) => matchesStoreOrderSummarySearch(summary, String(options.search || '')))
    .filter((summary) => !options.paymentStatus || String(summary.payment_status || '') === options.paymentStatus)
    .filter((summary) => !options.fulfillmentStatus || String(summary.fulfillment_status || '') === options.fulfillmentStatus)
    .sort(compareSummaryDateDesc);

  const from = (page - 1) * limit;
  const items = filtered
    .slice(from, from + limit)
    .map((summary) => buildListOrderFromSummary(summary));

  return {
    items,
    total: filtered.length,
    page,
    limit,
    has_more: from + limit < filtered.length,
    source: 'store_backup',
  };
}

export async function findStoreBackupOrderById(id: string): Promise<any | null> {
  const target = String(id || '').trim();
  if (!target) return null;
  return await downloadStorageJson(getOrderPath(target));
}
