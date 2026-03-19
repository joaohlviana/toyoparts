import { Hono } from 'npm:hono';
import * as kv from './kv_store.tsx';
import { createClient } from "jsr:@supabase/supabase-js@2.49.8";
import { fetchMagento } from './magento.tsx';
import { crypto } from "jsr:@std/crypto";

export const magentoSync = new Hono();

// ─── Config ────────────────────────────────────────────────────────
const BUCKET_NAME = 'make-1d6e33e0-magento-backup';
const CUSTOMERS_SYNC_KEY = 'magento:sync:customers';
const ORDERS_SYNC_KEY = 'magento:sync:orders';
const BATCH_SIZE = 50;

// ─── Supabase Client ───────────────────────────────────────────────
const getSupabase = () => createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

// ─── Helpers: Normalization & Hashing ──────────────────────────────
function normalizeEmail(email: string): string {
  return email ? email.trim().toLowerCase() : '';
}

function normalizeCpf(cpf: string): string {
  return cpf ? cpf.replace(/\D/g, '') : '';
}

async function sha256(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

async function ensureBucket() {
  const supabase = getSupabase();
  const { data: buckets } = await supabase.storage.listBuckets();
  const bucketExists = buckets?.some(b => b.name === BUCKET_NAME);
  if (!bucketExists) {
    await supabase.storage.createBucket(BUCKET_NAME, { public: false });
  }
}

async function uploadBatch(folder: 'customers' | 'orders', items: any[]) {
  const supabase = getSupabase();
  const uploads = items.map(item => {
    const id = folder === 'customers' ? item.id : item.entity_id;
    const path = `${folder}/${id}.json`;
    return supabase.storage.from(BUCKET_NAME).upload(path, JSON.stringify(item), { upsert: true });
  });
  await Promise.all(uploads);
}

// ─── Routes ────────────────────────────────────────────────────────

// 1. Status
magentoSync.get('/status', async (c) => {
  try {
    const [custStatus, ordStatus] = await Promise.all([
      kv.get(CUSTOMERS_SYNC_KEY).catch(() => null),
      kv.get(ORDERS_SYNC_KEY).catch(() => null)
    ]);
    
    return c.json({
      customers: custStatus || { status: 'idle', processed: 0, total: 0 },
      orders: ordStatus || { status: 'idle', processed: 0, total: 0 }
    });
  } catch (e: any) {
    console.error('Status Error:', e);
    return c.json({ error: e.message }, 500);
  }
});

// 2. Customers Sync
magentoSync.post('/customers/start', async (c) => {
  try {
    await ensureBucket();
    
    let total = 0;
    try {
      const res = await fetchMagento('/V1/customers/search', {
        'searchCriteria[pageSize]': '1',
        'searchCriteria[currentPage]': '1'
      });
      total = res.total_count || 0;
    } catch (e) {
      console.error('Error fetching total customers:', e);
    }

    const status = {
      status: 'running',
      started_at: new Date().toISOString(),
      total,
      processed: 0,
      last_id: 0,
      batch_size: BATCH_SIZE,
      errors: 0
    };

    await kv.set(CUSTOMERS_SYNC_KEY, status);
    return c.json({ message: 'Backup de clientes iniciado', status });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

magentoSync.post('/customers/step', async (c) => {
  const status = await kv.get(CUSTOMERS_SYNC_KEY);
  if (!status || status.status !== 'running') {
    return c.json({ message: 'Nenhum sync de clientes em andamento', status: 'idle' }, 400);
  }

  try {
    const lastId = status.last_id || 0;
    
    const query: Record<string, string> = {
      'searchCriteria[pageSize]': String(BATCH_SIZE),
      'searchCriteria[currentPage]': '1',
      'searchCriteria[filter_groups][0][filters][0][field]': 'entity_id',
      'searchCriteria[filter_groups][0][filters][0][value]': String(lastId),
      'searchCriteria[filter_groups][0][filters][0][condition_type]': 'gt',
      'searchCriteria[sortOrders][0][field]': 'entity_id',
      'searchCriteria[sortOrders][0][direction]': 'ASC'
    };

    const res = await fetchMagento('/V1/customers/search', query);
    const items = res.items || [];
    
    let maxId = lastId;
    
    if (items.length > 0) {
      await uploadBatch('customers', items);
      
      const supabase = getSupabase();
      const updates: { key: string, value: any }[] = [];

      for (const item of items) {
        const currentId = Number(item.id || item.entity_id);
        if (currentId > maxId) maxId = currentId;

        // 1. Save Canonical Customer JSON
        updates.push({
          key: `customer:${item.id}`,
          value: {
            id: item.id,
            email: item.email,
            firstname: item.firstname,
            lastname: item.lastname,
            taxvat: item.taxvat, // CPF/CNPJ
            created_at: item.created_at,
            group_id: item.group_id
          }
        });

        // 2. Index by Email Hash
        if (item.email) {
            const emailNorm = normalizeEmail(item.email);
            const emailHash = await sha256(emailNorm);
            updates.push({
                key: `idx_customer_by_email:${emailHash}`,
                value: item.id
            });
        }

        // 3. Index by CPF Hash (if exists)
        if (item.taxvat) {
            const cpfNorm = normalizeCpf(item.taxvat);
            // Only index if it looks like a CPF/CNPJ (at least 11 digits)
            if (cpfNorm.length >= 11) {
                const cpfHash = await sha256(cpfNorm);
                updates.push({
                    key: `idx_customer_by_cpf:${cpfHash}`,
                    value: item.id
                });
            }
        }
      }

      // Batch upsert to KV
      if (updates.length > 0) {
        const { error } = await supabase.from('kv_store_1d6e33e0').upsert(updates);
        if (error) throw error;
      }
    }

    const processed = status.processed + items.length;
    const isComplete = items.length < BATCH_SIZE;

    const newStatus = {
      ...status,
      processed,
      last_id: maxId,
      status: isComplete ? 'completed' : 'running',
      updated_at: new Date().toISOString()
    };

    if (isComplete) newStatus.completed_at = new Date().toISOString();

    await kv.set(CUSTOMERS_SYNC_KEY, newStatus);
    
    return c.json({ 
      message: isComplete ? 'completed' : 'step_done', 
      status: newStatus,
      items_processed: items.length
    });

  } catch (e: any) {
    console.error('Sync Customer Error:', e);
    const errorStatus = {
      ...status,
      errors: (status.errors || 0) + 1,
      last_error: e.message
    };
    await kv.set(CUSTOMERS_SYNC_KEY, errorStatus);
    return c.json({ error: e.message }, 500);
  }
});

// 3. Orders Sync
magentoSync.post('/orders/start', async (c) => {
  try {
    await ensureBucket();
    
    let total = 0;
    try {
      const res = await fetchMagento('/V1/orders', {
        'searchCriteria[pageSize]': '1',
        'searchCriteria[currentPage]': '1'
      });
      total = res.total_count || 0;
    } catch (e) {
      console.error('Error fetching total orders:', e);
    }

    const status = {
      status: 'running',
      started_at: new Date().toISOString(),
      total,
      processed: 0,
      last_id: 0,
      batch_size: BATCH_SIZE,
      errors: 0
    };

    await kv.set(ORDERS_SYNC_KEY, status);
    return c.json({ message: 'Backup de pedidos iniciado', status });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

magentoSync.post('/orders/step', async (c) => {
  const status = await kv.get(ORDERS_SYNC_KEY);
  if (!status || status.status !== 'running') {
    return c.json({ message: 'Nenhum sync de pedidos em andamento', status: 'idle' }, 400);
  }

  try {
    const lastId = status.last_id || 0;
    
    const query: Record<string, string> = {
      'searchCriteria[pageSize]': String(BATCH_SIZE),
      'searchCriteria[currentPage]': '1',
      'searchCriteria[filter_groups][0][filters][0][field]': 'entity_id',
      'searchCriteria[filter_groups][0][filters][0][value]': String(lastId),
      'searchCriteria[filter_groups][0][filters][0][condition_type]': 'gt',
      'searchCriteria[sortOrders][0][field]': 'entity_id',
      'searchCriteria[sortOrders][0][direction]': 'ASC'
    };
    
    const res = await fetchMagento('/V1/orders', query);
    const items = res.items || [];
    
    let maxId = lastId;
    
    if (items.length > 0) {
      await uploadBatch('orders', items);
      
      const supabase = getSupabase();
      
      const customerOrderMap = new Map<string, number[]>();
      const updates: { key: string, value: any }[] = [];
      
      for (const item of items) {
        const currentId = Number(item.entity_id);
        if (currentId > maxId) maxId = currentId;

        updates.push({
            key: `order:${item.entity_id}`,
            value: {
                entity_id: item.entity_id,
                increment_id: item.increment_id,
                created_at: item.created_at,
                status: item.status,
                grand_total: item.grand_total,
                customer_email: item.customer_email,
                customer_id: item.customer_id,
                items: item.items
            }
        });

        if (item.customer_id) {
          const cid = String(item.customer_id);
          if (!customerOrderMap.has(cid)) {
            customerOrderMap.set(cid, []);
          }
          customerOrderMap.get(cid)?.push(item.entity_id);
        }
      }

      if (updates.length > 0) {
        await supabase.from('kv_store_1d6e33e0').upsert(updates);
      }

      if (customerOrderMap.size > 0) {
        const keys = Array.from(customerOrderMap.keys()).map(cid => `idx_orders_by_customer:${cid}`);
        
        const { data: existingData } = await supabase
          .from('kv_store_1d6e33e0')
          .select('key, value')
          .in('key', keys);

        const indexUpdates: { key: string, value: any }[] = [];
        const existingMap = new Map<string, any[]>();
        
        existingData?.forEach((row: any) => {
          existingMap.set(row.key, row.value);
        });

        for (const [customerId, newOrderIds] of customerOrderMap.entries()) {
          const key = `idx_orders_by_customer:${customerId}`;
          const currentList = existingMap.get(key) || [];
          const merged = Array.from(new Set([...currentList, ...newOrderIds]));
          indexUpdates.push({ key, value: merged });
        }

        if (indexUpdates.length > 0) {
          await supabase.from('kv_store_1d6e33e0').upsert(indexUpdates);
        }
      }
    }

    const processed = status.processed + items.length;
    const isComplete = items.length < BATCH_SIZE;

    const newStatus = {
      ...status,
      processed,
      last_id: maxId,
      status: isComplete ? 'completed' : 'running',
      updated_at: new Date().toISOString()
    };

    if (isComplete) newStatus.completed_at = new Date().toISOString();

    await kv.set(ORDERS_SYNC_KEY, newStatus);
    
    return c.json({ 
      message: isComplete ? 'completed' : 'step_done', 
      status: newStatus,
      items_processed: items.length
    });

  } catch (e: any) {
    console.error('Sync Order Error:', e);
    const errorStatus = {
      ...status,
      errors: (status.errors || 0) + 1,
      last_error: e.message
    };
    await kv.set(ORDERS_SYNC_KEY, errorStatus);
    return c.json({ error: e.message }, 500);
  }
});

// 4. Stored Data Access (Admin)
magentoSync.get('/customers/stored', async (c) => {
  const page = parseInt(c.req.query('page') || '1');
  const limit = parseInt(c.req.query('limit') || '20');
  const search = c.req.query('search');
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  try {
    const supabase = getSupabase();
    
    // Base query for customer keys
    let query = supabase
      .from('kv_store_1d6e33e0')
      .select('value', { count: 'exact' })
      .like('key', 'customer:%');

    // Apply Search if present
    if (search) {
      const term = search.trim();
      // Search in email OR firstname OR lastname inside the JSONB value
      query = query.or(`value->>email.ilike.%${term}%,value->>firstname.ilike.%${term}%,value->>lastname.ilike.%${term}%`);
    }

    // Apply Sorting and Pagination
    query = query
      .order('key', { ascending: false })
      .range(from, to);

    const { data, count, error } = await query;
    if (error) throw error;
    
    return c.json({
        items: data?.map((d: any) => d.value) || [],
        total_count: count || 0,
        page,
        limit
    });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

magentoSync.get('/orders/stored', async (c) => {
  const page = parseInt(c.req.query('page') || '1');
  const limit = parseInt(c.req.query('limit') || '20');
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  try {
    const supabase = getSupabase();
    
    let query = supabase
      .from('kv_store_1d6e33e0')
      .select('value', { count: 'exact' })
      .like('key', 'order:%')
      .order('key', { ascending: false })
      .range(from, to);

    const { data, count, error } = await query;
    if (error) throw error;
    
    return c.json({
        items: data?.map((d: any) => d.value) || [],
        total_count: count || 0,
        page,
        limit
    });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// 5. Category Tree Refresh
magentoSync.post('/categories/tree/refresh', async (c) => {
  try {
    const supabase = getSupabase();
    
    // Fetch from Magento
    const res = await fetchMagento('/V1/categories');
    const root = res;
    
    if (!root || !root.id) {
        throw new Error('Invalid category tree from Magento');
    }

    // Transform
    const xform = (node: any): any => ({
      id: node.id, name: node.name, level: node.level,
      is_active: node.is_active !== false,
      product_count: node.product_count || 0,
      children_data: Array.isArray(node.children_data)
        ? node.children_data.filter((ch: any) => ch.is_active !== false).map(xform)
        : [],
    });
    
    const tree = xform(root);
    
    // Save to KV
    const CATEGORY_TREE_CACHE_KEY = 'meta:category_tree';
    await kv.set(CATEGORY_TREE_CACHE_KEY, tree);
    
    return c.json({ message: 'Árvore de categorias atualizada com sucesso', root_id: tree.id, children_count: tree.children_data.length });
  } catch (e: any) {
    console.error('Tree Refresh Error:', e);
    return c.json({ error: e.message }, 500);
  }
});
