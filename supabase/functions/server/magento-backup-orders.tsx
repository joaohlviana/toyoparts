import { createClient } from "jsr:@supabase/supabase-js@2.49.8";

const BUCKET_NAME = 'make-1d6e33e0-magento-backup';

function getSupabase() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

function normalizeSearch(value: string): string {
  return String(value || '').trim().toLowerCase();
}

function buildCustomerName(order: any): string {
  return [
    String(order?.customer_firstname || '').trim(),
    String(order?.customer_lastname || '').trim(),
  ].filter(Boolean).join(' ').trim();
}

function compareBackupOrderPathDesc(a: string, b: string): number {
  const aId = Number.parseInt(a.replace(/\.json$/i, ''), 10);
  const bId = Number.parseInt(b.replace(/\.json$/i, ''), 10);
  if (Number.isFinite(aId) && Number.isFinite(bId) && aId !== bId) {
    return bId - aId;
  }
  return b.localeCompare(a);
}

function matchesMagentoBackupSearch(order: any, search: string): boolean {
  const term = normalizeSearch(search);
  if (!term) return true;

  const haystack = [
    String(order?.increment_id || ''),
    String(order?.entity_id || ''),
    buildCustomerName(order),
    String(order?.customer_email || ''),
    String(order?.status || ''),
  ].join(' ').toLowerCase();

  return haystack.includes(term);
}

async function listStorageFiles(folder: 'orders'): Promise<string[]> {
  const supabase = getSupabase();
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
      throw new Error(error.message || `Falha ao listar backup ${folder}`);
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
  const { data, error } = await supabase.storage
    .from(BUCKET_NAME)
    .download(path);

  if (error) {
    console.warn('[MagentoBackup] download skipped:', path, error.message);
    return null;
  }

  try {
    return JSON.parse(await data.text());
  } catch (parseError) {
    console.warn('[MagentoBackup] parse skipped:', path, parseError);
    return null;
  }
}

function normalizePaymentStatus(status: string): 'waiting_payment' | 'paid' | 'overdue' | 'canceled' | 'refunded' {
  const normalized = String(status || '').trim().toLowerCase();
  if (normalized.includes('cancel')) return 'canceled';
  if (normalized.includes('refund')) return 'refunded';
  if (normalized.includes('overdue')) return 'overdue';
  if (normalized === 'pending' || normalized === 'pending_payment' || normalized === 'new') return 'waiting_payment';
  return 'paid';
}

function normalizeFulfillmentStatus(status: string): 'pending' | 'in_preparation' | 'shipped' | 'delivered' | 'canceled' {
  const normalized = String(status || '').trim().toLowerCase();
  if (normalized.includes('cancel')) return 'canceled';
  if (normalized === 'complete' || normalized === 'closed') return 'delivered';
  if (normalized === 'shipped') return 'shipped';
  if (normalized === 'pending' || normalized === 'pending_payment' || normalized === 'new') return 'pending';
  return 'in_preparation';
}

function extractShippingCarrier(shippingDescription: string): string | undefined {
  const raw = String(shippingDescription || '').trim();
  if (!raw) return undefined;
  return raw.split(' - ').map((part) => part.trim()).find(Boolean);
}

export function mapMagentoBackupOrderToAdminOrder(order: any) {
  const orderId = String(order?.increment_id || order?.entity_id || '').trim();
  const customerName = buildCustomerName(order);
  const customerEmail = String(order?.customer_email || '').trim();
  const paymentMethod = String(order?.payment?.method || 'magento').trim() || 'magento';

  return {
    orderId,
    createdAt: String(order?.created_at || new Date(0).toISOString()),
    created_at: String(order?.created_at || new Date(0).toISOString()),
    payment_provider: paymentMethod,
    payment_status: normalizePaymentStatus(order?.status),
    fulfillment_status: normalizeFulfillmentStatus(order?.status),
    customer: {
      name: customerName || 'Cliente Magento',
      email: customerEmail,
    },
    totals: {
      total: Number(order?.grand_total ?? order?.base_grand_total ?? 0),
    },
    shipping: {
      carrier: extractShippingCarrier(order?.shipping_description),
      service: String(order?.shipping_description || '').trim() || undefined,
    },
    tracking_code: null,
    order_source: 'magento_backup',
    raw_magento_order: order,
  };
}

export async function readMagentoStoredOrdersFromBackup(page: number, limit: number, search: string): Promise<{
  items: any[];
  total_count: number;
  page: number;
  limit: number;
  has_more: boolean;
  source: 'storage_backup';
}> {
  const allFiles = (await listStorageFiles('orders')).sort(compareBackupOrderPathDesc);

  if (!search) {
    const start = (page - 1) * limit;
    const selectedFiles = allFiles.slice(start, start + limit);
    const items = (await Promise.all(
      selectedFiles.map((name) => downloadStorageJson(`orders/${name}`)),
    )).filter(Boolean);

    return {
      items,
      total_count: allFiles.length,
      page,
      limit,
      has_more: start + limit < allFiles.length,
      source: 'storage_backup',
    };
  }

  const matched: any[] = [];
  for (const name of allFiles) {
    const order = await downloadStorageJson(`orders/${name}`);
    if (!order || !matchesMagentoBackupSearch(order, search)) {
      continue;
    }
    matched.push(order);
  }

  const start = (page - 1) * limit;
  return {
    items: matched.slice(start, start + limit),
    total_count: matched.length,
    page,
    limit,
    has_more: start + limit < matched.length,
    source: 'storage_backup',
  };
}

export async function findMagentoBackupOrderById(id: string): Promise<any | null> {
  const target = String(id || '').trim();
  if (!target) return null;

  const allFiles = (await listStorageFiles('orders')).sort(compareBackupOrderPathDesc);
  for (const name of allFiles) {
    const numericId = name.replace(/\.json$/i, '');
    if (numericId === target) {
      return await downloadStorageJson(`orders/${name}`);
    }
  }

  for (const name of allFiles) {
    const order = await downloadStorageJson(`orders/${name}`);
    if (!order) continue;
    const incrementId = String(order?.increment_id || '').trim();
    const entityId = String(order?.entity_id || '').trim();
    if (incrementId === target || entityId === target) {
      return order;
    }
  }

  return null;
}
