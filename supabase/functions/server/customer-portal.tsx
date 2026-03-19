import { Hono } from 'npm:hono';
import { createClient } from "jsr:@supabase/supabase-js@2.49.8";
import { crypto } from "jsr:@std/crypto";
import { fetchMagento } from './magento.tsx';

export const customerPortal = new Hono();

// ─── Constants ───────────────────────────────────────────────────────────────
const MAGENTO_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutos
const MAGENTO_TIMEOUT_MS   = 8_000;          // 8s — não travar a resposta
const MAGENTO_MAX_ORDERS   = 50;             // limite de histórico

// ─── Supabase ────────────────────────────────────────────────────────────────
const getSupabase = () => createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

// ─── SHA256 ──────────────────────────────────────────────────────────────────
async function sha256(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// ─── Shape normalizado de pedido ─────────────────────────────────────────────
interface NormalizedOrder {
  id: string;
  increment_id: string;
  created_at: string;
  status: string;
  grand_total: number;
  items_count?: number;
  customer_name?: string;
  source: 'loja' | 'magento';
  // Campos exclusivos da nova loja
  payment_status?: string;
  fulfillment_status?: string;
  payment_provider?: string;
  tracking_url?: string;
}

// ─── Normaliza pedido do Magento ──────────────────────────────────────────────
function normalizeMagentoOrder(order: any): NormalizedOrder {
  const firstName = order.customer_firstname || '';
  const lastName  = order.customer_lastname  || '';
  return {
    id:            `magento_${order.entity_id}`,
    increment_id:  order.increment_id,
    created_at:    order.created_at,
    status:        order.status,
    grand_total:   Number(order.grand_total || 0),
    items_count:   order.items_qty ?? order.total_item_count ?? undefined,
    customer_name: `${firstName} ${lastName}`.trim() || undefined,
    source:        'magento',
  };
}

// ─── Normaliza pedido da nova loja (KV) ───────────────────────────────────────
function normalizeStoreOrder(order: any): NormalizedOrder {
  return {
    id:                 order.id || order.orderId || String(order.entity_id || ''),
    increment_id:       order.increment_id || order.id || '',
    created_at:         order.createdAt || order.created_at || new Date(0).toISOString(),
    status:             order.payment_status || order.status || 'waiting_payment',
    grand_total:        Number(order.total || order.grand_total || 0),
    items_count:        Array.isArray(order.items) ? order.items.length : order.items_count,
    source:             'loja',
    payment_status:     order.payment_status,
    fulfillment_status: order.fulfillment_status,
    payment_provider:   order.payment_provider,
    tracking_url:       order.tracking_url,
  };
}

// ─── Busca pedidos do Magento por e-mail (com timeout + cache) ────────────────
async function fetchMagentoOrdersByEmail(email: string, emailHash: string): Promise<{
  orders: NormalizedOrder[];
  fromCache: boolean;
  error?: string;
}> {
  const supabase = getSupabase();
  const cacheKey = `cache:magento_orders:${emailHash}`;

  // 1. Verificar cache no KV
  try {
    const { data: cached } = await supabase
      .from('kv_store_1d6e33e0')
      .select('value')
      .eq('key', cacheKey)
      .maybeSingle();

    if (cached?.value) {
      const { orders, cached_at } = cached.value as { orders: NormalizedOrder[]; cached_at: string };
      const age = Date.now() - new Date(cached_at).getTime();
      if (age < MAGENTO_CACHE_TTL_MS) {
        console.log(`[CustomerPortal] Magento cache HIT para ${email.substring(0, 4)}*** (age: ${Math.round(age / 1000)}s)`);
        return { orders, fromCache: true };
      }
      console.log(`[CustomerPortal] Magento cache EXPIRADO (age: ${Math.round(age / 1000)}s) — buscando ao vivo`);
    }
  } catch (e: any) {
    console.warn('[CustomerPortal] Erro ao ler cache Magento:', e.message);
  }

  // 2. Busca ao vivo no Magento com timeout de 8s
  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('Magento timeout (8s)')), MAGENTO_TIMEOUT_MS)
  );

  try {
    const magentoQuery: Record<string, string> = {
      // Filtro exato por e-mail do cliente
      'searchCriteria[filter_groups][0][filters][0][field]':          'customer_email',
      'searchCriteria[filter_groups][0][filters][0][value]':          email,
      'searchCriteria[filter_groups][0][filters][0][condition_type]': 'eq',
      // Ordenação DESC por data
      'searchCriteria[sortOrders][0][field]':     'created_at',
      'searchCriteria[sortOrders][0][direction]': 'DESC',
      // Limite de segurança
      'searchCriteria[pageSize]':    String(MAGENTO_MAX_ORDERS),
      'searchCriteria[currentPage]': '1',
    };

    const data = await Promise.race([
      fetchMagento('/V1/orders', magentoQuery),
      timeoutPromise,
    ]) as any;

    const rawOrders: any[] = data?.items || [];
    const orders: NormalizedOrder[] = rawOrders.map(normalizeMagentoOrder);

    console.log(`[CustomerPortal] Magento retornou ${orders.length} pedidos para ${email.substring(0, 4)}***`);

    // 3. Salvar no cache KV (fire-and-forget)
    supabase.from('kv_store_1d6e33e0').upsert({
      key:   cacheKey,
      value: { orders, cached_at: new Date().toISOString() },
    }).then(() => {
      console.log(`[CustomerPortal] Cache Magento atualizado (${orders.length} pedidos)`);
    }).catch(err => {
      console.warn('[CustomerPortal] Erro ao salvar cache Magento:', err.message);
    });

    return { orders, fromCache: false };
  } catch (e: any) {
    console.error(`[CustomerPortal] Erro ao buscar Magento para ${email.substring(0, 4)}***: ${e.message}`);
    return { orders: [], fromCache: false, error: e.message };
  }
}

// ─── Middleware: valida token de sessão ───────────────────────────────────────
customerPortal.use('*', async (c, next) => {
  const authHeader = c.req.header('Authorization');
  if (!authHeader) {
    return c.json({ error: 'Missing Authorization header' }, 401);
  }

  const token = authHeader.replace('Bearer ', '');
  const supabase = getSupabase();
  const { data: { user }, error } = await supabase.auth.getUser(token);

  if (error || !user || !user.email) {
    return c.json({ error: 'Unauthorized or invalid token' }, 401);
  }

  c.set('user', user);
  await next();
});

// ─── GET /customer/orders ─────────────────────────────────────────────────────
// Retorna pedidos mesclados: nova loja (KV) + histórico Magento
// com source: 'loja' | 'magento' em cada item
customerPortal.get('/orders', async (c) => {
  const user    = c.get('user');
  const email   = user.email.toLowerCase().trim();
  const supabase = getSupabase();

  try {
    const emailHash = await sha256(email);

    // ── A. Buscar pedidos da nova loja (KV) ──────────────────────────────────
    const fetchStoreOrders = async (): Promise<NormalizedOrder[]> => {
      // 1. Resolver Customer ID via hash do e-mail
      const { data: customerIndex } = await supabase
        .from('kv_store_1d6e33e0')
        .select('value')
        .eq('key', `idx_customer_by_email:${emailHash}`)
        .maybeSingle();

      let orderIds: string[] = [];

      if (customerIndex?.value) {
        const customerId = customerIndex.value;
        const { data: orderIndex } = await supabase
          .from('kv_store_1d6e33e0')
          .select('value')
          .eq('key', `idx_orders_by_customer:${customerId}`)
          .maybeSingle();
        orderIds = orderIndex?.value || [];
      } else {
        // Fallback: índice legado por e-mail direto
        const { data: legacyIndex } = await supabase
          .from('kv_store_1d6e33e0')
          .select('value')
          .eq('key', `idx:orders:${email}`)
          .maybeSingle();
        orderIds = legacyIndex?.value || [];
      }

      if (!orderIds || orderIds.length === 0) return [];

      const orderKeys = orderIds.map((id: string) => `order:${id}`);
      const { data: ordersData, error } = await supabase
        .from('kv_store_1d6e33e0')
        .select('value')
        .in('key', orderKeys);

      if (error) throw error;

      return (ordersData || []).map(d => normalizeStoreOrder(d.value));
    };

    // ── B. Buscar histórico do Magento (paralelo com A) ───────────────────────
    const [storeOrders, magentoResult] = await Promise.all([
      fetchStoreOrders().catch(err => {
        console.error('[CustomerPortal] Erro ao buscar pedidos da loja:', err.message);
        return [] as NormalizedOrder[];
      }),
      fetchMagentoOrdersByEmail(email, emailHash),
    ]);

    const magentoOrders   = magentoResult.orders;
    const magentoError    = magentoResult.error;
    const magentoFromCache = magentoResult.fromCache;

    // ── C. Deduplicação ───────────────────────────────────────────────────────
    // Se um increment_id da loja nova corresponde a um do Magento, prevalece a loja
    const storeIncrementIds = new Set(storeOrders.map(o => o.increment_id).filter(Boolean));
    const filteredMagentoOrders = magentoOrders.filter(
      o => !storeIncrementIds.has(o.increment_id)
    );

    // ── D. Merge + ordenação cronológica DESC ─────────────────────────────────
    const allOrders = [...storeOrders, ...filteredMagentoOrders].sort((a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );

    console.log(
      `[CustomerPortal] Pedidos para ${email.substring(0, 4)}***: ` +
      `loja=${storeOrders.length}, magento=${filteredMagentoOrders.length}, total=${allOrders.length}`
    );

    // ── E. Paginação em memória ───────────────────────────────────────────────
    const page  = parseInt(c.req.query('page')  || '1');
    const limit = parseInt(c.req.query('limit') || '20');
    const start = (page - 1) * limit;
    const total = allOrders.length;

    return c.json({
      orders:     allOrders.slice(start, start + limit),
      pagination: {
        page,
        limit,
        total,
        total_pages:    Math.ceil(total / limit),
        store_count:    storeOrders.length,
        magento_count:  filteredMagentoOrders.length,
      },
      magento_unavailable: !!magentoError,
      magento_from_cache:  magentoFromCache,
      ...(magentoError ? { magento_error: magentoError } : {}),
    });

  } catch (e: any) {
    console.error('[CustomerPortal] Erro inesperado em GET /orders:', e);
    return c.json({ error: e.message }, 500);
  }
});
