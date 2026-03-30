import { Hono } from 'npm:hono';
import { cors } from 'npm:hono/cors';
import { logger } from 'npm:hono/logger';
import * as kv from './kv_store.tsx';
import { createClient } from "jsr:@supabase/supabase-js@2.49.8";
import * as meili from './meilisearch.tsx';
import * as aiSearch from './ai-search.tsx';
import { productAdmin } from './product-admin.tsx';
import { frenet } from './frenet.tsx';
import { seo } from './seo.tsx';

import { magento } from './magento.tsx';
import { magentoSync } from './magento-sync.tsx';
import { meiliSync } from './meili-sync.tsx';
import { customerPortal } from './customer-portal.tsx';
import { accessLinks } from './access-links.tsx'; // Import accessLinks
import { asaas } from './asaas.tsx';
import { payments } from './payments.tsx';
import { checkout } from './checkout.tsx';
import { searchOps } from './search-ops.tsx';
import { search } from './search.tsx';
import { categories } from './categories.tsx';
import { models } from './models.tsx';
import { catalogo } from './catalogo.tsx'; // Import catalogo router
import { newsletter } from './newsletter.tsx';
import { resend } from './resend.tsx';
import { carriers } from './carriers.tsx';
import { orders } from './orders.tsx';
import { vindi } from './vindi.tsx';
import { audit } from './audit.tsx';
import { health } from './health.tsx';
import { stripe } from './stripe.tsx';
import { stripeTest } from './stripe-test.tsx';
import { abandonedCart } from './abandonedCart.tsx';
import { coupons } from './coupons.tsx';
import { priceUpdate } from './price-update.tsx';
import { adminAuth, adminMiddleware } from './admin-auth.tsx';
import { seoAdmin } from './seo-admin.tsx';
import { banners } from './banners.tsx';
import { freeShippingAdmin } from './free-shipping.tsx';
import { readyStockAdmin } from './ready-stock.tsx';

import { sitemapGenerator } from './sitemap-generator.tsx';
import { snapshotGenerator } from './snapshot-generator.tsx';
import { tracking } from './tracking.tsx';
import { searchIntelligence } from './search-intelligence.tsx';
import { analytics } from './analytics.tsx';
import { recommendations } from './recommendations.tsx';

const app = new Hono();

app.use('*', cors());
app.use('*', logger(console.log));

// ─── Admin auth: login endpoint (no auth required) ──────────────────────────
app.route('/make-server-1d6e33e0/admin/auth', adminAuth);

// ─── Admin middleware: protect all /admin/* routes (except /admin/auth/*) ────
app.use('/make-server-1d6e33e0/admin/*', adminMiddleware);

app.route('/make-server-1d6e33e0/admin/products', productAdmin);
app.route('/make-server-1d6e33e0/frenet', frenet);
app.route('/make-server-1d6e33e0/seo', seo);
app.route('/make-server-1d6e33e0/sitemap', sitemapGenerator);
app.route('/make-server-1d6e33e0/snapshot', snapshotGenerator);
app.route('/make-server-1d6e33e0/tracking', tracking);
app.route('/make-server-1d6e33e0/asaas', asaas);
app.route('/make-server-1d6e33e0/payments', payments);
app.route('/make-server-1d6e33e0/checkout', checkout);
app.route('/make-server-1d6e33e0/search-ops', searchOps);
app.route('/make-server-1d6e33e0/search', search);
app.route('/make-server-1d6e33e0/categories', categories);
app.route('/make-server-1d6e33e0/models', models);
app.route('/make-server-1d6e33e0/admin/catalogo', catalogo); // Mount catalogo router
app.route('/make-server-1d6e33e0/newsletter', newsletter);
app.route('/make-server-1d6e33e0/resend', resend);
app.route('/make-server-1d6e33e0/magento', magento);
app.route('/make-server-1d6e33e0/magento-sync', magentoSync);
app.route('/make-server-1d6e33e0/meili-sync', meiliSync);
app.route('/make-server-1d6e33e0/customer', customerPortal);
app.route('/make-server-1d6e33e0/access-links', accessLinks); // Mount accessLinks
app.route('/make-server-1d6e33e0/si', searchIntelligence); // Search Intelligence
app.route('/make-server-1d6e33e0/analytics', analytics);
app.route('/make-server-1d6e33e0/recommendations', recommendations);
app.route('/make-server-1d6e33e0/carriers', carriers);
app.route('/make-server-1d6e33e0/orders', orders);
app.route('/make-server-1d6e33e0/vindi', vindi);
app.route('/make-server-1d6e33e0/audit', audit);
app.route('/make-server-1d6e33e0/health', health);
app.route('/make-server-1d6e33e0/stripe', stripe);
app.route('/make-server-1d6e33e0/admin/stripe-test', stripeTest);
app.route('/make-server-1d6e33e0/checkout/abandoned', abandonedCart);
app.route('/make-server-1d6e33e0/coupons', coupons);
app.route('/make-server-1d6e33e0/admin/price-update', priceUpdate);
app.route('/make-server-1d6e33e0/admin/seo', seoAdmin);
app.route('/make-server-1d6e33e0/banners', banners);
app.route('/make-server-1d6e33e0/admin/free-shipping', freeShippingAdmin);
app.route('/make-server-1d6e33e0/admin/ready-stock', readyStockAdmin);

// ─── Configurações ───────────────────────────────────────────────────────────
const MAGENTO_TOKEN = (Deno.env.get('MAGENTO_TOKEN') || '').trim();
const MAGENTO_BASE_URL = 'https://www.toyoparts.com.br';
const PRODUCT_PREFIX = 'product:';
const METADATA_PREFIX = 'meta:';
const SYNC_STATUS_KEY = 'meta:sync_status';
const STATS_CACHE_KEY = 'meta:stats_cache';
const STATS_CACHE_TTL = 300000; // 5 minutos (antes era 1 min)
const FILTERS_CACHE_KEY = 'meta:filters_cache';
const FILTERS_CACHE_TTL = 600000; // 10 minutos
const IMAGE_SYNC_STATUS_KEY = 'meta:image_sync_status';
const IMAGE_BUCKET_NAME = 'make-1d6e33e0-product-images';
const CATEGORY_TREE_CACHE_KEY = 'meta:category_tree';
const CATEGORY_TREE_TTL = 3600000; // 1 hora (categorias mudam raramente)
const CATEGORY_IMAGES_BUCKET = 'make-1d6e33e0-category-images';
const CATEGORY_IMAGES_MAP_KEY = 'meta:category_images_map';
const BANNER_PREFIX = 'banner:';
const BANNER_INDEX_KEY = 'meta:banner_index';
const MEILI_INDEX_STATUS_KEY = 'meta:meili_index_status';
const MEILI_INDEX_CURSOR_KEY = 'meta:meili_index_cursor';
const AUDIT_STATUS_KEY = 'meta:audit_status';
const AUDIT_REPORT_KEY = 'meta:audit_report';
const MEILI_INDEX_BATCH = 500; // docs per step
const PAGE_SIZE = 100; // Magento sync page size

// ─── Retry helper for transient KV/infra errors (502, 503, etc.) ─────────────
async function kvRetry<T>(fn: () => Promise<T>, maxAttempts = 3, delayMs = 500): Promise<T> {
  let lastError: any;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      lastError = err;
      const msg = String(err?.message || err || '');
      const isTransient = msg.includes('502') || msg.includes('503') || msg.includes('Bad Gateway') || msg.includes('ECONNRESET') || msg.includes('fetch failed');
      if (!isTransient || attempt === maxAttempts) throw err;
      console.log(`[kvRetry] attempt ${attempt}/${maxAttempts} failed (${msg.slice(0, 80)}), retrying in ${delayMs * attempt}ms...`);
      await new Promise(r => setTimeout(r, delayMs * attempt));
    }
  }
  throw lastError;
}

// ─── Category image source URLs ──────────────────────────────────────────────
const CATEGORY_IMAGE_SOURCES: Record<string, string> = {
  // Generic categories (toyoparts catalog)
  'acessorios-externos-cromados': 'https://toyoparts.com.br/pub/media/catalog/category/33.jpg',
  'aerofolios-spoilers-e-antenas': 'https://toyoparts.com.br/pub/media/catalog/category/34.jpg',
  'alarme-e-seguranca': 'https://toyoparts.com.br/pub/media/catalog/category/35.jpg',
  'engates-e-chicotes': 'https://toyoparts.com.br/pub/media/catalog/category/38.jpg',
  'ferramentas-e-equipamentos': 'https://toyoparts.com.br/pub/media/catalog/category/39.jpg',
  'frisos-e-apliques': 'https://toyoparts.com.br/pub/media/catalog/category/40.jpg',
  'ponteiras': 'https://toyoparts.com.br/pub/media/catalog/category/41.jpg',
  'rodas-e-calotas': 'https://toyoparts.com.br/pub/media/catalog/category/42.jpg',
  'sensor-de-estacionamento': 'https://toyoparts.com.br/pub/media/catalog/category/43.jpg',
  'suporte-racks-e-bagageiros': 'https://toyoparts.com.br/pub/media/catalog/category/44.jpg',
  // Corolla
  'corolla:acessorios-externos': 'https://increazy-folder.s3.amazonaws.com/5ebed78a28503303b0530072/corolla-menu-acessorios-externos.jpg?v=1770635254',
  'corolla:acessorios-internos': 'https://increazy-folder.s3.amazonaws.com/5ebed78a28503303b0530072/corolla-menu-acessorios-internos.jpg?v=1770635254',
  'corolla:iluminacao': 'https://increazy-folder.s3.amazonaws.com/5ebed78a28503303b0530072/corolla-menu-iluminacao.jpg?v=1770635254',
  'corolla:pecas': 'https://increazy-folder.s3.amazonaws.com/5ebed78a28503303b0530072/corolla-menu-pecas.jpg?v=1770635254',
  // Corolla Cross
  'corolla-cross:acessorios-externos': 'https://increazy-folder.s3.amazonaws.com/5ebed78a28503303b0530072/banner-departamento-corolla-cross-acessorio-externo.jpg?v=1770635254',
  'corolla-cross:acessorios-internos': 'https://increazy-folder.s3.amazonaws.com/5ebed78a28503303b0530072/banner-departamento-corolla-cross-acessorio-interno.jpg?v=1770635254',
  'corolla-cross:iluminacao': 'https://increazy-folder.s3.amazonaws.com/5ebed78a28503303b0530072/banne-departamento-corolla-cross-iluminacao.jpg?v=1770635254',
  'corolla-cross:pecas': 'https://increazy-folder.s3.amazonaws.com/5ebed78a28503303b0530072/banne-departamento-corolla-cross-pecas.jpg?v=1770635254',
  // Etios
  'etios:acessorios-externos': 'https://increazy-folder.s3.amazonaws.com/5ebed78a28503303b0530072/etios-menu-acessorios-externos.jpg?v=1770635254',
  'etios:acessorios-internos': 'https://increazy-folder.s3.amazonaws.com/5ebed78a28503303b0530072/etios-menu-acessorios-internos.jpg?v=1770635254',
  'etios:iluminacao': 'https://increazy-folder.s3.amazonaws.com/5ebed78a28503303b0530072/etios-menu-iluminacao.jpg?v=1770635254',
  'etios:pecas': 'https://increazy-folder.s3.amazonaws.com/5ebed78a28503303b0530072/etios-menu-pecas.jpg?v=1770635254',
  // Hilux
  'hilux:acessorios-externos': 'https://increazy-folder.s3.amazonaws.com/5ebed78a28503303b0530072/hilux-menu-acessorios-externos.jpg?v=1770635254',
  'hilux:acessorios-internos': 'https://increazy-folder.s3.amazonaws.com/5ebed78a28503303b0530072/hilux-menu-acessorios-internos.jpg?v=1770635254',
  'hilux:iluminacao': 'https://increazy-folder.s3.amazonaws.com/5ebed78a28503303b0530072/hilux-menu-iluminacao.jpg?v=1770635254',
  'hilux:pecas': 'https://increazy-folder.s3.amazonaws.com/5ebed78a28503303b0530072/hilux-menu-pecas.jpg?v=1770635254',
  'hilux:santo-antonio': 'https://increazy-folder.s3.amazonaws.com/5ebed78a28503303b0530072/hilux-menu-santo-antonio.jpg?v=1770635254',
  // SW4
  'sw4:acessorios-externos': 'https://increazy-folder.s3.amazonaws.com/5ebed78a28503303b0530072/sw4-menu-acessorios-externos.jpg?v=1770635254',
  'sw4:acessorios-internos': 'https://increazy-folder.s3.amazonaws.com/5ebed78a28503303b0530072/sw4-menu-acessorios-internos.jpg?v=1770635254',
  'sw4:iluminacao': 'https://increazy-folder.s3.amazonaws.com/5ebed78a28503303b0530072/sw4-menu-iluminacao.jpg?v=1770635254',
  'sw4:pecas': 'https://increazy-folder.s3.amazonaws.com/5ebed78a28503303b0530072/sw4-menu-pecas.jpg?v=1770635254',
  'sw4:acessorios-para-pick-up-e-suv': 'https://increazy-folder.s3.amazonaws.com/5ebed78a28503303b0530072/sw4-menu-pickup-suv.jpg?v=1770635254',
  // RAV4
  'rav4:acessorios-externos': 'https://increazy-folder.s3.amazonaws.com/5ebed78a28503303b0530072/rav4-menu-acessorios-externos.jpg?v=1770635254',
  'rav4:acessorios-internos': 'https://increazy-folder.s3.amazonaws.com/5ebed78a28503303b0530072/rav4-menu-acessorios-internos.jpg?v=1770635254',
  'rav4:iluminacao': 'https://increazy-folder.s3.amazonaws.com/5ebed78a28503303b0530072/rav4-menu-iluminacao.jpg?v=1770635254',
  'rav4:pecas': 'https://increazy-folder.s3.amazonaws.com/5ebed78a28503303b0530072/rav4-menu-pecas.jpg?v=1770635254',
  // Prius
  'prius:acessorios-externos': 'https://increazy-folder.s3.amazonaws.com/5ebed78a28503303b0530072/prius-menu-acessorios-externos.jpg?v=1770635254',
  'prius:acessorios-internos': 'https://increazy-folder.s3.amazonaws.com/5ebed78a28503303b0530072/prius-menu-acessorios-internos.jpg?v=1770635254',
  'prius:iluminacao': 'https://increazy-folder.s3.amazonaws.com/5ebed78a28503303b0530072/prius-menu-iluminacao.jpg?v=1770635254',
  'prius:pecas': 'https://increazy-folder.s3.amazonaws.com/5ebed78a28503303b0530072/prius-menu-pecas.jpg?v=1770635254',
};

// ─── Helper: Extrair category IDs de um produto Magento ─────────────────────
// Magento 2 armazena categorias em DOIS lugares possíveis:
// 1. custom_attributes → category_ids (string CSV "2,3,15" ou array ["2","3","15"])
// 2. extension_attributes → category_links (array de {category_id, position})
// Esta função unifica ambas as fontes para contagem/filtragem correta.
function extractCategoryIds(product: any): string[] {
  const catSet = new Set<string>();

  // Fonte 1: custom_attributes → category_ids
  const customAttrs = product.custom_attributes || [];
  const categoryIdsAttr = customAttrs.find((a: any) => a.attribute_code === 'category_ids');
  if (categoryIdsAttr && categoryIdsAttr.value) {
    let ids: string[];
    if (Array.isArray(categoryIdsAttr.value)) {
      ids = categoryIdsAttr.value.map(String);
    } else {
      ids = String(categoryIdsAttr.value).split(',').map(s => s.trim()).filter(Boolean);
    }
    for (const id of ids) catSet.add(id);
  }

  // Fonte 2: extension_attributes → category_links
  const categoryLinks = product.extension_attributes?.category_links;
  if (Array.isArray(categoryLinks)) {
    for (const link of categoryLinks) {
      if (link.category_id != null) {
        catSet.add(String(link.category_id));
      }
    }
  }

  return Array.from(catSet);
}

// ═══════════════════════════════════════════════════════════════════════════════
// ─── SHARED HELPERS & TYPES ─────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════

// ─── Interfaces ──────────────────────────────────────────────────────────────

interface OperationStatus {
  status: 'idle' | 'running' | 'completed' | 'error' | 'batch_done';
  started_at?: string;
  completed_at?: string;
  failed_at?: string;
  error?: string;
  elapsed_seconds?: number;
}

interface MeiliIndexStatus extends OperationStatus {
  phase?: 'setup' | 'loading_metadata' | 'indexing' | 'waiting_tasks' | 'smoke_test';
  total?: number;
  indexed?: number;
  skipped?: number;
  progress?: number;
  batches_completed?: number;
  tasks_queued?: number;
  pending_tasks?: number;
  docs_per_second?: number;
  eta_seconds?: number;
  smokeTest?: {
    totalHits: number;
    facetsReturned: string[];
    categoryIdsFacetCount: number;
    categoryNamesFacetCount: number;
  };
  taskWait?: { settled: boolean; remaining: number; waitMs: number } | { skipped: true };
}

interface SyncStatus extends OperationStatus {
  current_page?: number;
  total_pages?: number;
  total_products?: number;
  downloaded?: number;
  progress?: number;
  resume_page?: number;
  batch_errors?: number;
}

// ─── Supabase PostgREST Safety ──────────────────────────────────────────────
// PostgREST tem max_rows=1000 por default. Valores maiores são truncados
// silenciosamente, fazendo loops de paginação encerrarem prematuramente.
const POSTGREST_SAFE_BATCH = 1000;

// ─── Stock Parser ────────────────────────────────────────────────────────────
// Unifica as ~5 cópias espalhadas pelo código. Magento armazena stock em
// extension_attributes.stock como objeto ou string JSON.
function parseStock(product: any): boolean {
  const stockData = product?.extension_attributes?.stock;
  if (!stockData) return false;
  try {
    const stock = typeof stockData === 'string' ? JSON.parse(stockData) : stockData;
    return stock.is_in_stock === '1' || stock.is_in_stock === true || stock.is_in_stock === 1;
  } catch {
    return false;
  }
}

// ─── Custom Attribute Helpers ────────────────────────────────────────────────
function getCustomAttr(product: any, code: string): any {
  const attrs = product?.custom_attributes;
  if (!Array.isArray(attrs)) return undefined;
  return attrs.find((a: any) => a.attribute_code === code)?.value;
}

/** Parse CSV custom attribute (e.g., "1,2,3") into string array */
function getCustomAttrCSV(product: any, code: string): string[] {
  const val = getCustomAttr(product, code);
  if (!val) return [];
  if (Array.isArray(val)) return val.map(String);
  return String(val).split(',').map(s => s.trim()).filter(Boolean);
}

// ─── Batch Product Scanner ──────────────────────────────────────────────────
// Abstrai o padrão "loop de batches do Supabase" usado em /filters, /stats,
// audit e indexação. Garante batch ≤ POSTGREST_SAFE_BATCH.
async function scanAllProducts(opts: {
  batchSize?: number;
  select?: string;
  onBatch: (rows: any[], batchNum: number, totalScanned: number) => void | Promise<void>;
  onProgress?: (scanned: number) => void | Promise<void>;
  maxProducts?: number;
}): Promise<{ totalScanned: number; batchCount: number }> {
  const batchSize = Math.min(opts.batchSize ?? POSTGREST_SAFE_BATCH, POSTGREST_SAFE_BATCH);
  let offset = 0;
  let totalScanned = 0;
  let batchNum = 0;
  const maxProducts = opts.maxProducts ?? Infinity;

  while (totalScanned < maxProducts) {
    const { data, error } = await supabase
      .from('kv_store_1d6e33e0')
      .select(opts.select ?? 'value')
      .like('key', 'product:%')
      .order('key')
      .range(offset, offset + batchSize - 1);

    if (error) {
      console.error(`❌ scanAllProducts batch@${offset}: ${error.message}`);
      break;
    }
    if (!data || data.length === 0) break;

    batchNum++;
    totalScanned += data.length;
    await opts.onBatch(data, batchNum, totalScanned);
    await opts.onProgress?.(totalScanned);

    offset += batchSize;
    if (data.length < batchSize) break;
  }

  return { totalScanned, batchCount: batchNum };
}

// ─── Duration Formatter ──────────────────────────────────────────────────────
function fmtDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m < 60) return `${m}m${s > 0 ? `${s}s` : ''}`;
  return `${Math.floor(m / 60)}h${m % 60}m`;
}

// ─── Throttled Status Updater Factory ────────────────────────────────────────
// Usado pelo indexer, audit e qualquer job longo para evitar writes excessivos.
function createStatusUpdater(kvKey: string, intervalMs = 5000) {
  let lastWrite = 0;
  const startedAt = new Date().toISOString();
  const t0 = Date.now();

  return {
    startedAt,
    t0,
    update: async (phase: string, extra: Record<string, any> = {}, force = false) => {
      const now = Date.now();
      if (!force && now - lastWrite < intervalMs) return;
      lastWrite = now;
      await kv.set(kvKey, {
        status: 'running',
        started_at: startedAt,
        phase,
        elapsed_seconds: Math.round((now - t0) / 1000),
        ...extra,
      }).catch(() => {}); // Non-blocking
    },
  };
}

// ─── Product Count (HEAD query) ──────────────────────────────────────────────
async function countProducts(): Promise<number> {
  const { count, error } = await supabase
    .from('kv_store_1d6e33e0')
    .select('*', { count: 'exact', head: true })
    .like('key', 'product:%');
  if (error) throw new Error(`countProducts: ${error.message}`);
  return count ?? 0;
}

// ─── Supabase Client Singleton ───────────────────────────────────────────────
const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

// Inicializar bucket do Supabase Storage (lazy — só cria quando necessário)
let storageBucketReady = false;
async function ensureStorageBucket() {
  if (storageBucketReady) return;
  try {
    const { data: buckets, error: listError } = await supabase.storage.listBuckets();
    if (listError) {
      console.warn('⚠️ Storage listBuckets indisponível, pulando criação de bucket:', listError.message);
      return;
    }
    const bucketExists = buckets?.some(bucket => bucket.name === IMAGE_BUCKET_NAME);
    
    if (!bucketExists) {
      console.log(`📦 Criando bucket PUBLIC: ${IMAGE_BUCKET_NAME}`);
      const { error } = await supabase.storage.createBucket(IMAGE_BUCKET_NAME, {
        public: true,  // v3: PUBLIC para servir URLs diretas (sem signedUrl)
        fileSizeLimit: 5242880, // 5MB
      });
      
      if (error) {
        console.warn('⚠️ Erro ao criar bucket (Storage pode não estar disponível):', error.message);
      } else {
        console.log('✅ Bucket PUBLIC criado com sucesso!');
        storageBucketReady = true;
      }
    } else {
      // Tentar tornar public se já existe como private
      try {
        await supabase.storage.updateBucket(IMAGE_BUCKET_NAME, { public: true });
      } catch { /* ok */ }
      console.log('✅ Bucket já existe');
      storageBucketReady = true;
    }
  } catch (error: any) {
    console.warn('⚠️ Storage indisponível no momento, continuando sem bucket:', error.message);
  }
}

// NÃO chamar no cold start — será chamado sob demanda nas rotas que usam Storage

// ═══════════════════════════════════════════════════════════════════════════════
// ─── IMAGE SYNC v3 — TURBO ─────────────���─────���──────────────────────────────
// Otimizações vs v2:
//   1. Batch 40 → 100 produtos/step
//   2. Download paralelo: 6 produtos simultâneos por wave (era sequencial)
//   3. Após upload → atualiza image_url no KV + MeiliSearch (Storage, não Magento)
//   4. Bucket PUBLIC → URLs diretas sem signedUrl
//   5. Performance metrics: imgs/s, ETA, elapsed
//   6. Fire-and-forget KV + Meili URL updates (não bloqueia step)
// ═══════════════════════════════════════════════════════════════════════════════

const IMAGE_STEP_BATCH = 100;  // v3: 100 (era 40)
const IMAGE_CONCURRENCY = 6;   // v3: processar 6 produtos em paralelo
const IMAGE_PATHS_KEY = 'meta:image_sync_paths';
const PLACEHOLDER_PATTERNS = ['no_selection', '/placeholder/', 'placeholder_', 'default_image'];

const SUPABASE_URL_FOR_STORAGE = Deno.env.get('SUPABASE_URL') || '';

function getPublicImageUrl(storagePath: string): string {
  return `${SUPABASE_URL_FOR_STORAGE}/storage/v1/object/public/${IMAGE_BUCKET_NAME}/${storagePath}`;
}

function fmtDurationImg(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m < 60) return `${m}m${s > 0 ? `${s}s` : ''}`;
  return `${Math.floor(m / 60)}h${m % 60}m`;
}

function isPlaceholderImage(filePath: string): boolean {
  if (!filePath) return true;
  const lower = filePath.toLowerCase();
  return PLACEHOLDER_PATTERNS.some(p => lower.includes(p));
}

function extractProductImagePaths(product: any): string[] {
  const paths: string[] = [];
  const seen = new Set<string>();
  if (Array.isArray(product.media_gallery_entries)) {
    for (const media of product.media_gallery_entries) {
      if (media.file && media.media_type === 'image' && !isPlaceholderImage(media.file) && !seen.has(media.file)) {
        seen.add(media.file);
        paths.push(media.file);
      }
    }
  }
  if (Array.isArray(product.custom_attributes)) {
    for (const attr of product.custom_attributes) {
      if (['image', 'small_image', 'thumbnail'].includes(attr.attribute_code) && attr.value && !isPlaceholderImage(attr.value) && !seen.has(attr.value)) {
        seen.add(attr.value);
        paths.push(attr.value);
      }
    }
  }
  return paths;
}

async function skuHasImages(sku: string): Promise<{ exists: boolean; urls: string[] }> {
  try {
    const { data, error } = await supabase.storage.from(IMAGE_BUCKET_NAME).list(sku, { limit: 20 });
    if (error || !data || data.length === 0) return { exists: false, urls: [] };
    const urls = data
      .filter(f => f.name && !f.name.startsWith('.'))
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(f => getPublicImageUrl(`${sku}/${f.name}`));
    return { exists: urls.length > 0, urls };
  } catch { return { exists: false, urls: [] }; }
}

async function downloadFromMagento(magentoPath: string): Promise<{ data: Uint8Array; contentType: string } | null> {
  const imageUrl = `${MAGENTO_BASE_URL}/pub/media/catalog/product${magentoPath}`;
  let response: Response | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      response = await fetch(imageUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
        signal: AbortSignal.timeout(15000),
      });
      if (response.ok) break;
      if (response.status === 404) return null;
    } catch { /* retry */ }
    if (attempt < 2) await new Promise(r => setTimeout(r, 1000));
  }
  if (!response || !response.ok) return null;
  const blob = await response.blob();
  if (!blob.type.startsWith('image/')) return null;
  return { data: new Uint8Array(await blob.arrayBuffer()), contentType: blob.type || 'image/jpeg' };
}

async function uploadToStorage(path: string, data: Uint8Array, contentType: string): Promise<boolean> {
  const { error } = await supabase.storage.from(IMAGE_BUCKET_NAME).upload(path, data, { contentType, upsert: true });
  if (error) { console.warn(`⚠️ Upload ${path}: ${error.message}`); return false; }
  return true;
}

async function copyInStorage(sourcePath: string, destPath: string): Promise<boolean> {
  try {
    const { error } = await supabase.storage.from(IMAGE_BUCKET_NAME).copy(sourcePath, destPath);
    return !error;
  } catch { return false; }
}

// ─── POST /images/sync/start ────────────────────────────────────────────────
app.post('/make-server-1d6e33e0/images/sync/start', async (c) => {
  try {
    await ensureStorageBucket();
    const force = c.req.query('force') === '1';
    const currentStatus = await kv.get(IMAGE_SYNC_STATUS_KEY);

    if (currentStatus?.status === 'running' && !force) {
      const startedAt = currentStatus.started_at ? new Date(currentStatus.started_at).getTime() : 0;
      const elapsed = Date.now() - startedAt;
      if (elapsed < 15 * 60 * 1000) {
        return c.json({ message: 'Image sync já em andamento — use /images/sync/step', status: currentStatus, _hint: '?force=1' }, 409);
      }
    }

    const t0 = Date.now();
    console.log('[IMG v3] Iniciando Image Sync TURBO...');
    const total = await countProducts();
    console.log(`[IMG v3] Total produtos: ${total}`);

    await kv.set(IMAGE_PATHS_KEY, { downloadedPaths: {} });
    await kv.set(IMAGE_SYNC_STATUS_KEY, {
      status: 'running', phase: 'downloading', started_at: new Date().toISOString(),
      total, processed: 0, downloaded: 0, skipped_existing: 0, copied_dedup: 0,
      no_images: 0, errors: 0, batches_completed: 0, cursor_last_key: null, progress: 0,
      unique_magento_paths: 0, urls_updated: 0,
      imgs_per_second: 0, eta_seconds: 0, eta_human: '...',
      config: { batch_size: IMAGE_STEP_BATCH, concurrency: IMAGE_CONCURRENCY },
    });

    return c.json({
      message: 'Image sync v3 TURBO iniciado — chame POST /images/sync/step em loop',
      total,
      setup_ms: Date.now() - t0,
      config: { batch_size: IMAGE_STEP_BATCH, concurrency: IMAGE_CONCURRENCY },
    });
  } catch (error: any) {
    console.error('[IMG v3] Start error:', error);
    await kv.set(IMAGE_SYNC_STATUS_KEY, { status: 'error', error: error.message, failed_at: new Date().toISOString() });
    return c.json({ error: error.message }, 500);
  }
});

// ─── POST /images/sync/step — TURBO: parallel download + URL update ─────────
app.post('/make-server-1d6e33e0/images/sync/step', async (c) => {
  try {
    const live = await kv.get(IMAGE_SYNC_STATUS_KEY);
    if (!live || live.status !== 'running') {
      return c.json({ message: 'Nenhum image sync em andamento', action: 'POST /images/sync/start', current_status: live?.status ?? 'idle' }, 400);
    }

    const stepT0 = Date.now();
    
    // ─── 1. Fetch products by cursor ─────────────────────────────────────────
    const lastKey = live.cursor_last_key;
    let query = supabase
      .from('kv_store_1d6e33e0')
      .select('key, value')
      .like('key', 'product:%')
      .order('key')
      .limit(IMAGE_STEP_BATCH);
    
    if (lastKey) {
      query = query.gt('key', lastKey);
    }
    
    const { data: rows, error } = await query;
    if (error) throw error;

    // ─── 2. Check completion ─────────────────────────────────────────────────
    if (!rows || rows.length === 0) {
      const elapsed = Math.round((Date.now() - new Date(live.started_at).getTime()) / 1000);
      const completed = {
        status: 'completed' as const, started_at: live.started_at, completed_at: new Date().toISOString(),
        total: live.total, processed: live.processed, downloaded: live.downloaded,
        skipped_existing: live.skipped_existing, copied_dedup: live.copied_dedup,
        no_images: live.no_images, errors: live.errors, unique_magento_paths: live.unique_magento_paths,
        urls_updated: live.urls_updated || 0,
        elapsed_seconds: elapsed, elapsed_human: fmtDurationImg(elapsed), progress: 100,
        imgs_per_second: elapsed > 0 ? Math.round((live.downloaded || 0) / elapsed) : 0,
      };
      await kv.set(IMAGE_SYNC_STATUS_KEY, completed);
      await kv.del(IMAGE_PATHS_KEY).catch(() => {});
      console.log(`[IMG v3] ✅ Concluído: ${live.downloaded} baixadas, ${live.skipped_existing} skip, ${live.copied_dedup} dedup, ${live.urls_updated || 0} URLs atualizadas, ${live.errors} erros, ${elapsed}s`);
      return c.json({ message: 'completed', status: completed });
    }

    // ─── 3. Load dedup map ───────────────────────────────────────────────────
    const acc = await kv.get(IMAGE_PATHS_KEY) || { downloadedPaths: {} };
    const downloadedPaths: Record<string, string> = acc.downloadedPaths || {};

    // ─── 4. Process products in PARALLEL waves ──────────────────────────────
    const products = rows.filter(r => r.value?.sku);
    let bP = 0, bD = 0, bS = 0, bC = 0, bN = 0, bE = 0;
    const urlUpdates: { sku: string; image_url: string; images: string[] }[] = [];

    for (let w = 0; w < products.length; w += IMAGE_CONCURRENCY) {
      const wave = products.slice(w, w + IMAGE_CONCURRENCY);
      
      const results = await Promise.allSettled(wave.map(async (row) => {
        const product = row.value;
        const sku = String(product.sku);
        const result = { downloaded: 0, skipped: false, copied: 0, noImages: false, errors: 0, storageUrls: [] as string[], sku };
        
        // Check if already has images
        const existing = await skuHasImages(sku);
        if (existing.exists) {
          result.skipped = true;
          result.storageUrls = existing.urls;
          return result;
        }

        const imagePaths = extractProductImagePaths(product);
        if (imagePaths.length === 0) {
          result.noImages = true;
          return result;
        }

        // Download all images for this product in parallel
        await Promise.allSettled(imagePaths.map(async (magentoPath, i) => {
          const storageDest = `${sku}/${i}.jpg`;
          try {
            if (downloadedPaths[magentoPath]) {
              if (await copyInStorage(downloadedPaths[magentoPath], storageDest)) {
                result.copied++;
                result.storageUrls.push(getPublicImageUrl(storageDest));
                return;
              }
            }
            const imgData = await downloadFromMagento(magentoPath);
            if (!imgData) { result.errors++; return; }
            if (await uploadToStorage(storageDest, imgData.data, imgData.contentType)) {
              result.downloaded++;
              downloadedPaths[magentoPath] = storageDest;
              result.storageUrls.push(getPublicImageUrl(storageDest));
            } else { result.errors++; }
          } catch { result.errors++; }
        }));

        return result;
      }));

      for (const res of results) {
        if (res.status !== 'fulfilled') { bE++; continue; }
        const r = res.value;
        bP++;
        if (r.skipped) bS++;
        else if (r.noImages) bN++;
        bD += r.downloaded;
        bC += r.copied;
        bE += r.errors;

        // Collect URL updates for products with storage URLs
        if (r.storageUrls.length > 0) {
          urlUpdates.push({ sku: r.sku, image_url: r.storageUrls[0], images: r.storageUrls });
        }
      }
    }

    // ─── 5. Save dedup map (fire-and-forget) ─────────────────────────────────
    const uniquePaths = Object.keys(downloadedPaths).length;
    if (bD > 0) {
      kv.set(IMAGE_PATHS_KEY, { downloadedPaths }).catch(() => {});
    }

    // ─── 6. Update KV + MeiliSearch with Storage URLs (fire-and-forget) ──────
    let urlsUpdated = 0;
    if (urlUpdates.length > 0) {
      urlsUpdated = urlUpdates.length;
      
      // Fire-and-forget: update KV product records
      (async () => {
        try {
          for (const u of urlUpdates) {
            try {
              const existing = await kv.get(`product:${u.sku}`);
              if (existing) {
                await kv.set(`product:${u.sku}`, {
                  ...existing,
                  image_url: u.image_url,
                  images: u.images,
                  has_image: true,
                  _image_source: 'storage',
                });
              }
            } catch { /* skip individual failures */ }
          }
        } catch (e: any) {
          console.warn(`[IMG v3] KV URL update error: ${e.message}`);
        }
      })();

      // Fire-and-forget: partial update MeiliSearch
      if (meili.isConfigured()) {
        (async () => {
          try {
            const meiliDocs = urlUpdates.map(u => {
              const id = u.sku.replace(/[^a-zA-Z0-9\-_]/g, '');
              if (!id) return null;
              return { id, image_url: u.image_url, has_image: true };
            }).filter(Boolean);
            if (meiliDocs.length > 0) {
              await meili.updateDocumentsPartial(meiliDocs);
            }
          } catch (e: any) {
            console.warn(`[IMG v3] MeiliSearch URL update error: ${e.message}`);
          }
        })();
      }
    }

    // ─── 7. Update status ────────────────────────────────────────────────────
    const newLastKey = rows[rows.length - 1].key;
    const processedNow = (live.processed || 0) + bP;
    const downloadedNow = (live.downloaded || 0) + bD;
    const skippedNow = (live.skipped_existing || 0) + bS;
    const copiedNow = (live.copied_dedup || 0) + bC;
    const noImagesNow = (live.no_images || 0) + bN;
    const errorsNow = (live.errors || 0) + bE;
    const urlsUpdatedNow = (live.urls_updated || 0) + urlsUpdated;
    const batchesNow = (live.batches_completed || 0) + 1;
    const total = live.total || 0;
    const pct = total ? Math.min(99, Math.round((processedNow / total) * 100)) : 0;
    const stepMs = Date.now() - stepT0;

    // Performance metrics
    const elapsedSec = Math.max(1, Math.round((Date.now() - new Date(live.started_at).getTime()) / 1000));
    const imgsPerSecond = Math.round(downloadedNow / elapsedSec);
    const prodsPerSecond = Math.max(1, Math.round(processedNow / elapsedSec));
    const remaining = Math.max(0, total - processedNow);
    const etaSeconds = prodsPerSecond > 0 ? Math.round(remaining / prodsPerSecond) : 0;

    console.log(`[IMG v3] Step ${batchesNow}: ${bP} prods (×${IMAGE_CONCURRENCY}) | ${bD} new/${bS} skip/${bC} dedup/${bN} no-img/${bE} err | ${urlsUpdated} URLs→Storage | ${processedNow}/${total} (${pct}%) | ${stepMs}ms | ETA ${fmtDurationImg(etaSeconds)}`);

    await kv.set(IMAGE_SYNC_STATUS_KEY, {
      ...live, phase: 'downloading', cursor_last_key: newLastKey,
      processed: processedNow, downloaded: downloadedNow, skipped_existing: skippedNow,
      copied_dedup: copiedNow, no_images: noImagesNow, errors: errorsNow,
      urls_updated: urlsUpdatedNow,
      batches_completed: batchesNow, progress: pct, unique_magento_paths: uniquePaths,
      updated_at: new Date().toISOString(),
      elapsed_seconds: elapsedSec, elapsed_human: fmtDurationImg(elapsedSec),
      imgs_per_second: imgsPerSecond, eta_seconds: etaSeconds, eta_human: fmtDurationImg(etaSeconds),
    });

    const hasMore = rows.length >= IMAGE_STEP_BATCH;
    return c.json({
      message: hasMore ? 'batch_done' : 'completed',
      batch: { processed: bP, downloaded: bD, skipped: bS, copied: bC, no_images: bN, errors: bE, urls_updated: urlsUpdated },
      progress: { processed: processedNow, total, pct },
      performance: {
        imgs_per_second: imgsPerSecond, eta_seconds: etaSeconds, eta_human: fmtDurationImg(etaSeconds),
        elapsed_seconds: elapsedSec, elapsed_human: fmtDurationImg(elapsedSec),
      },
      step_ms: stepMs,
    });
  } catch (error: any) {
    console.error('[IMG v3] Step error:', error);
    const cur = await kv.get(IMAGE_SYNC_STATUS_KEY).catch(() => null);
    await kv.set(IMAGE_SYNC_STATUS_KEY, { ...(cur || {}), status: 'error', error: error.message, failed_at: new Date().toISOString() }).catch(() => {});
    return c.json({ error: error.message }, 500);
  }
});

// ─── POST /images/sync (legacy wrapper) ─────────────────────────────────────
app.post('/make-server-1d6e33e0/images/sync', async (c) => {
  return c.json({
    message: 'Endpoint migrado para step-based v3',
    _new_flow: ['1. POST /images/sync/start', '2. POST /images/sync/step (em loop)'],
  });
});

// ─── POST /images/reset ─────────────────────────────────────────────────────
app.post('/make-server-1d6e33e0/images/reset', async (c) => {
  try {
    await kv.del(IMAGE_SYNC_STATUS_KEY).catch(() => {});
    await kv.del(IMAGE_PATHS_KEY).catch(() => {});
    console.log('[IMG v3] Status reset');
    return c.json({ message: 'Reset successful', status: 'idle' });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// Status da sincronização de imagens (com stale detection + live metrics)
app.get('/make-server-1d6e33e0/images/status', async (c) => {
  try {
    const status = await kv.get(IMAGE_SYNC_STATUS_KEY) || { status: 'idle' };
    if (status.status === 'running' && status.started_at) {
      const elapsedMs = Date.now() - new Date(status.started_at).getTime();
      const elapsedSec = Math.round(elapsedMs / 1000);
      status._elapsed_minutes = Math.round(elapsedMs / 60000);
      status.elapsed_seconds = elapsedSec;
      status.elapsed_human = fmtDurationImg(elapsedSec);
      
      // Recalculate live metrics
      const downloaded = status.downloaded || 0;
      const processed = status.processed || 0;
      const total = status.total || 0;
      if (downloaded > 0) {
        status.imgs_per_second = Math.round(downloaded / Math.max(1, elapsedSec));
      }
      if (processed > 0 && total > 0) {
        const prodsPerSec = Math.round(processed / Math.max(1, elapsedSec));
        const remaining = Math.max(0, total - processed);
        status.eta_seconds = prodsPerSec > 0 ? Math.round(remaining / prodsPerSec) : 0;
        status.eta_human = fmtDurationImg(status.eta_seconds);
      }
      
      if (elapsedMs > 15 * 60 * 1000) {
        status._warning = 'Provavelmente travou. Use POST /images/sync/start?force=1';
        status._stale = true;
      }
    }
    return c.json(status);
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// ─── HEALTH ─────────────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════
app.get('/make-server-1d6e33e0/health', async (c) => {
  try {
    const t0 = Date.now();
    await kv.get('_health_ping').catch(() => null);
    const kvMs = Date.now() - t0;
    return c.json({ ok: true, kv_ms: kvMs, meili_configured: meili.isConfigured(), ts: new Date().toISOString() });
  } catch (e: any) {
    return c.json({ ok: false, error: e.message }, 500);
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// ─── CATEGORIES ──────────────────────────────────────────────────────────────
// ═��═════════════════════════════════════════════════════════════════════════════

// ─── POST /categories/visibility ──────────────────────────────────────────────
app.post('/make-server-1d6e33e0/categories/visibility', async (c) => {
  try {
    const body = await c.req.json();
    await kv.set('meta:category_visibility', body);
    return c.json({ success: true });
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

// ─── GET /categories/visibility ───────────────────────────────────────────────
app.get('/make-server-1d6e33e0/categories/visibility', async (c) => {
  try {
    const visibility = await kv.get('meta:category_visibility') || {};
    return c.json(visibility);
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

// ─── GET /categories/images ──────────────────────────────────────────────────
app.get('/make-server-1d6e33e0/categories/images', (c) => {
  return c.json({ images: CATEGORY_IMAGE_SOURCES });
});

// GET /categories/tree — returns cached Magento category tree
// IMPORTANTE: Todos os componentes frontend (CategoryTreeFilter, CategoryTree,
// MegaMenu, VehicleMenuBar) esperam `children_data` nos nós da árvore.
app.get('/make-server-1d6e33e0/categories/tree', async (c) => {
  try {
    let tree = await kv.get(CATEGORY_TREE_CACHE_KEY).catch(() => null);

    // Migration helper: se o cache antigo usa 'children' ao invés de 'children_data',
    // renomeia recursivamente para o formato que o frontend espera.
    const migrateChildren = (node: any): any => {
      if (!node) return node;
      const kids = node.children_data || node.children || [];
      const migrated = { ...node };
      delete migrated.children; // remove a key antiga
      migrated.children_data = Array.isArray(kids) ? kids.map(migrateChildren) : [];
      return migrated;
    };

    // Se cache existe mas usa key antiga 'children', migra e re-salva
    if (tree && !tree.children_data && tree.children) {
      console.log('[categories/tree] Migrando cache: children → children_data');
      tree = migrateChildren(tree);
      await kv.set(CATEGORY_TREE_CACHE_KEY, tree).catch(() => {});
    }

    if (!tree || (Array.isArray(tree) && tree.length === 0)) {
      if (MAGENTO_TOKEN) {
        try {
          const res = await fetch(`${MAGENTO_BASE_URL}/rest/V1/categories`, {
            headers: { 'Authorization': `Bearer ${MAGENTO_TOKEN}` },
            signal: AbortSignal.timeout(15000),
          });
          if (res.ok) {
            const root = await res.json();
            const xform = (node: any): any => ({
              id: node.id, name: node.name, level: node.level,
              is_active: node.is_active !== false,
              product_count: node.product_count || 0,
              children_data: Array.isArray(node.children_data)
                ? node.children_data.filter((ch: any) => ch.is_active !== false).map(xform)
                : [],
            });
            tree = xform(root);
            await kv.set(CATEGORY_TREE_CACHE_KEY, tree);
          }
        } catch (e: any) {
          console.warn('[categories/tree] Magento fetch failed:', e.message);
        }
      }
    }

    // Filter by visibility (unless ?all=true)
    const showHidden = c.req.query('all') === 'true';
    if (!showHidden && tree) {
      const visibility = await kv.get('meta:category_visibility') || {};
      
      const filterNode = (node: any): any | null => {
        // Se marcado como false no mapa, oculta
        if (visibility[String(node.id)] === false) return null;

        // Processa filhos
        const children = node.children_data || node.children || [];
        const filteredChildren = children
          .map((child: any) => filterNode(child))
          .filter((child: any) => child !== null);
        
        return {
          ...node,
          children_data: filteredChildren,
          children: filteredChildren // mantém compatibilidade
        };
      };

      // Root nunca deve ser ocultado totalmente, mas aplicamos filtro
      tree = filterNode(tree);
    }

    return c.json(tree || { id: 1, name: 'Root', children_data: [] });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// GET /admin/categories/full-tree — flattened tree with facet counts from Meili
app.get('/make-server-1d6e33e0/admin/categories/full-tree', async (c) => {
  try {
    const tree = await kv.get(CATEGORY_TREE_CACHE_KEY).catch(() => null);
    let facetCounts: Record<string, number> = {};
    let facetNameCounts: Record<string, number> = {};
    let totalProductsInIndex = 0;
    if (meili.isConfigured()) {
      try {
        const r = await meili.search('', { limit: 0, facets: ['category_ids', 'category_names'] });
        facetCounts = r.facetDistribution?.category_ids || {};
        facetNameCounts = r.facetDistribution?.category_names || {};
        totalProductsInIndex = r.estimatedTotalHits || r.totalHits || 0;
      } catch (e: any) { console.warn('[admin/categories] Meili facets failed:', e.message); }
    }
    const allCategories: any[] = [];
    let maxDepth = 0;
    // Helper: suporta tanto children_data (novo) quanto children (legado)
    const getKids = (node: any): any[] => node.children_data || node.children || [];
    const flatten = (node: any, depth: number, path: string) => {
      if (!node) return;
      const id = String(node.id);
      const catPath = path ? `${path} > ${node.name}` : node.name;
      const children = getKids(node);
      allCategories.push({
        id, name: node.name || `Category ${id}`, depth, path: catPath,
        productCount: facetCounts[id] || 0, isActive: node.is_active !== false,
        childrenCount: children.length, position: node.position || 0,
      });
      if (depth > maxDepth) maxDepth = depth;
      for (const ch of children) flatten(ch, depth + 1, catPath);
    };
    if (tree) {
      if (Array.isArray(tree)) tree.forEach((t: any) => flatten(t, 0, ''));
      else flatten(tree, 0, '');
    }
    const mkText = (node: any, ind: string): string => {
      if (!node) return '';
      let s = `${ind}${node.name} (${facetCounts[String(node.id)] || 0} products)\n`;
      for (const ch of getKids(node)) s += mkText(ch, ind + '  ');
      return s;
    };
    let textTree = '';
    if (tree) {
      if (Array.isArray(tree)) tree.forEach((t: any) => { textTree += mkText(t, ''); });
      else textTree = mkText(tree, '');
    }
    const treeIds = new Set(allCategories.map((x: any) => x.id));
    const orphanFacetIds = Object.entries(facetCounts)
      .filter(([id]) => !treeIds.has(id)).map(([id, count]) => ({ id, count }))
      .sort((a, b) => b.count - a.count);
    const withProducts = allCategories.filter((x: any) => x.productCount > 0).length;
    return c.json({
      _admin: 'category-tree-admin',
      summary: {
        totalCategories: allCategories.length, totalProductsInIndex,
        categoriesWithProducts: withProducts,
        categoriesWithoutProducts: allCategories.length - withProducts,
        inactiveCategories: allCategories.filter((x: any) => !x.isActive).length,
        maxDepth, orphanFacetIds: orphanFacetIds.length,
        facetCategoryIdsCount: Object.keys(facetCounts).length,
        facetCategoryNamesCount: Object.keys(facetNameCounts).length,
      },
      textTree, allCategories, orphanFacetIds, facetCounts, facetNameCounts,
    });
  } catch (e: any) {
    console.error('[admin/categories/full-tree] Error:', e);
    return c.json({ error: e.message }, 500);
  }
});

// Route moved to catalogo.tsx

// ═══════════════════════════════════════════════════════════════════════════════
// ─── MAGENTO → KV PRODUCT SYNC ──────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════
app.get('/make-server-1d6e33e0/sync/status', async (c) => {
  try {
    const status = await kv.get(SYNC_STATUS_KEY) || { status: 'idle' };
    if (status.status === 'running' && status.started_at) {
      const elapsedMs = Date.now() - new Date(status.started_at).getTime();
      status._elapsed_minutes = Math.round(elapsedMs / 60000);
      if (elapsedMs > 30 * 60 * 1000) { status._stale = true; }
    }
    return c.json(status);
  } catch (e: any) {
    return c.json({ status: 'error', error: e.message }, 500);
  }
});

app.post('/make-server-1d6e33e0/sync/start', async (c) => {
  try {
    if (!MAGENTO_TOKEN) return c.json({ error: 'MAGENTO_TOKEN nao configurado' }, 400);

    const startPage = parseInt(c.req.query('startPage') || '1');
    const force = c.req.query('force') === '1';
    const current = await kv.get(SYNC_STATUS_KEY);

    if (current?.status === 'running' && !force) {
      const elapsed = current.started_at ? Date.now() - new Date(current.started_at).getTime() : 0;
      if (elapsed < 30 * 60 * 1000) {
        return c.json({ message: 'Sync ja em andamento', status: current, _hint: '?force=1' });
      }
    }

    const t0 = Date.now();
    const BATCH_PAGES = 10;
    let downloaded = current?.downloaded || 0;
    let batchErrors = 0;

    if (startPage === 1) downloaded = 0;

    const firstUrl = `${MAGENTO_BASE_URL}/rest/V1/products?searchCriteria[pageSize]=${PAGE_SIZE}&searchCriteria[currentPage]=${startPage}`;
    const firstRes = await fetch(firstUrl, { headers: { Authorization: `Bearer ${MAGENTO_TOKEN}` } });
    if (!firstRes.ok) throw new Error(`Magento API: ${firstRes.status} ${await firstRes.text().catch(() => '')}`);
    const firstData = await firstRes.json();
    const totalCount = firstData.total_count || 0;
    const totalPages = Math.ceil(totalCount / PAGE_SIZE);

    await kv.set(SYNC_STATUS_KEY, {
      status: 'running', started_at: new Date().toISOString(),
      current_page: startPage, total_pages: totalPages, total_products: totalCount,
      downloaded, progress: Math.round((startPage / totalPages) * 100),
    });

    const endPage = Math.min(startPage + BATCH_PAGES - 1, totalPages);
    for (let page = startPage; page <= endPage; page++) {
      try {
        let data = firstData;
        if (page !== startPage) {
          const url = `${MAGENTO_BASE_URL}/rest/V1/products?searchCriteria[pageSize]=${PAGE_SIZE}&searchCriteria[currentPage]=${page}`;
          const res = await fetch(url, { headers: { Authorization: `Bearer ${MAGENTO_TOKEN}` } });
          if (!res.ok) { batchErrors++; continue; }
          data = await res.json();
        }

        const items = data.items || [];
        if (items.length === 0) break;

        const kvOps: Array<[string, any]> = [];
        for (const p of items) {
          if (!p.sku) continue;
          kvOps.push([`${PRODUCT_PREFIX}${p.sku}`, p]);
        }
        if (kvOps.length > 0) {
          await kv.mset(kvOps.map(o => o[0]), kvOps.map(o => o[1]));
          downloaded += kvOps.length;
        }

        if (page % 3 === 0 || page === endPage) {
          await kv.set(SYNC_STATUS_KEY, {
            status: 'running', started_at: current?.started_at || new Date().toISOString(),
            current_page: page, total_pages: totalPages, total_products: totalCount,
            downloaded, progress: Math.round((page / totalPages) * 100), batch_errors: batchErrors,
          }).catch(() => {});
        }
      } catch (pageErr: any) {
        console.error(`[Sync] Page ${page} error: ${pageErr.message}`);
        batchErrors++;
      }
    }

    const hasMore = endPage < totalPages;
    const status: SyncStatus = {
      status: hasMore ? 'batch_done' : 'completed',
      started_at: current?.started_at || new Date().toISOString(),
      current_page: endPage, total_pages: totalPages, total_products: totalCount,
      downloaded, progress: hasMore ? Math.round((endPage / totalPages) * 100) : 100,
      resume_page: hasMore ? endPage + 1 : undefined,
      batch_errors: batchErrors, elapsed_seconds: Math.round((Date.now() - t0) / 1000),
    };
    if (!hasMore) status.completed_at = new Date().toISOString();
    await kv.set(SYNC_STATUS_KEY, status);

    // ─── Auto-trigger SSG regeneration on sync completion ────────────────
    if (!hasMore) {
      console.log('[Sync] ✅ Sync completo! Disparando SSG auto-regeneration...');
      try {
        const SSG_JOB_KEY = 'meta:ssg_job';
        const existingJob = await kv.get(SSG_JOB_KEY);
        if (!existingJob || existingJob.status !== 'running') {
          const productCount = await countProducts();
          await kv.set(SSG_JOB_KEY, {
            status: 'running',
            started_at: new Date().toISOString(),
            total_products: productCount,
            processed: 0, generated: 0, skipped: 0, errors: 0,
            force: false, batch_size: 100,
            next_after_key: null, done: false,
            auto_triggered_by: 'magento_sync',
          });
          console.log(`[SSG Auto] Job SSG iniciado para ${productCount} produtos (triggered by sync completion)`);
        } else {
          console.log('[SSG Auto] Job SSG já em andamento, ignorando auto-trigger');
        }
      } catch (ssgErr: any) {
        console.error('[SSG Auto] Erro ao iniciar SSG auto-trigger:', ssgErr.message);
      }
    }

    return c.json({ message: hasMore ? 'Batch concluido' : 'Sync completo!', status, ssg_triggered: !hasMore });
  } catch (e: any) {
    console.error('[Sync] Error:', e);
    await kv.set(SYNC_STATUS_KEY, { status: 'error', error: e.message, failed_at: new Date().toISOString() }).catch(() => {});
    return c.json({ error: e.message }, 500);
  }
});

app.post('/make-server-1d6e33e0/sync/reset', async (c) => {
  await kv.set(SYNC_STATUS_KEY, { status: 'idle' });
  return c.json({ ok: true });
});

// ═══════════════════════════════════════════════════════════════════════════════
// ─── KV → MEILISEARCH STEP-BASED INDEXING ───────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════

async function loadAttributeMaps() {
  const tree = await kv.get(CATEGORY_TREE_CACHE_KEY).catch(() => null);
  const maps: Parameters<typeof meili.transformProduct>[1] = {};

  if (tree) {
    const catMap = new Map<string, string>();
    const parentMap = new Map<string, string>();
    const walkTree = (node: any, parentId?: string) => {
      if (!node) return;
      if (node.id != null && node.name) catMap.set(String(node.id), node.name);
      if (node.id != null && parentId) parentMap.set(String(node.id), parentId);
      for (const child of (node.children_data || node.children || [])) {
        walkTree(child, String(node.id));
      }
    };
    if (Array.isArray(tree)) tree.forEach((t: any) => walkTree(t));
    else walkTree(tree);
    maps.categories = catMap;
    maps.categoryParents = parentMap;
  }

  const modelosMap = await kv.get('meta:attr_modelos').catch(() => null);
  const anosMap = await kv.get('meta:attr_anos').catch(() => null);
  const colorsMap = await kv.get('meta:attr_colors').catch(() => null);
  if (modelosMap && typeof modelosMap === 'object') maps.modelos = new Map(Object.entries(modelosMap));
  if (anosMap && typeof anosMap === 'object') maps.anos = new Map(Object.entries(anosMap));
  if (colorsMap && typeof colorsMap === 'object') maps.colors = new Map(Object.entries(colorsMap));

  return maps;
}

app.get('/make-server-1d6e33e0/meili/status', async (c) => {
  try {
    const status = await kv.get(MEILI_INDEX_STATUS_KEY) || { status: 'idle' };
    if (status.status === 'running' && status.started_at) {
      const elapsedMs = Date.now() - new Date(status.started_at).getTime();
      status._elapsed_minutes = Math.round(elapsedMs / 60000);
      if (elapsedMs > 30 * 60 * 1000) { status._stale = true; }
    }
    return c.json(status);
  } catch (e: any) {
    return c.json({ status: 'error', error: e.message }, 500);
  }
});

app.get('/make-server-1d6e33e0/meili/config', async (c) => {
  try {
    const configured = meili.isConfigured();
    const config = meili.getConfig();
    let health: any = null;
    let indexStats: any = null;
    if (configured) {
      health = await meili.healthCheck().catch((e: any) => ({ ok: false, error: e.message }));
      indexStats = await meili.getIndexStats().catch(() => null);
    }
    const openaiKey = Deno.env.get('OPENAI_API_KEY');
    return c.json({
      configured, health, indexStats,
      host: config.host ? config.host.replace(/\/\/.+@/, '//***@') : null,
      openai_configured: !!openaiKey,
    });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.get('/make-server-1d6e33e0/meili/debug/failed-tasks', async (c) => {
  try {
    const limit = parseInt(c.req.query('limit') || '10');
    const result = await meili.getFailedTasks(limit);
    return c.json({ tasks: result.results || [], total: result.total || 0 });
  } catch (e: any) {
    return c.json({ error: e.message, tasks: [] }, 500);
  }
});

app.post('/make-server-1d6e33e0/meili/index/start', async (c) => {
  try {
    if (!meili.isConfigured()) return c.json({ error: 'Meilisearch nao configurado' }, 400);

    const force = c.req.query('force') === '1';
    const current = await kv.get(MEILI_INDEX_STATUS_KEY);
    if (current?.status === 'running' && !force) {
      const elapsed = current.started_at ? Date.now() - new Date(current.started_at).getTime() : 0;
      if (elapsed < 30 * 60 * 1000) {
        return c.json({ message: 'Indexacao ja em andamento', status: current, _hint: '?force=1' }, 409);
      }
    }

    const t0 = Date.now();
    console.log('[Meili] Starting step-based indexing...');
    const setupResult = await meili.setupIndexIfNeeded();
    console.log(`[Meili] Setup: ${setupResult.action}`);

    const maps = await loadAttributeMaps();
    const catCount = maps.categories?.size || 0;
    console.log(`[Meili] Maps loaded: ${catCount} categories, ${maps.modelos?.size || 0} modelos`);

    const total = await countProducts();
    console.log(`[Meili] Total products in KV: ${total}`);

    await kv.set(MEILI_INDEX_CURSOR_KEY, { lastKey: null, indexed: 0, skipped: 0, batches: 0, taskUids: [] });
    await kv.set(MEILI_INDEX_STATUS_KEY, {
      status: 'running', phase: 'indexing', started_at: new Date().toISOString(),
      total, indexed: 0, skipped: 0, progress: 0, batches_completed: 0, tasks_queued: 0,
    });

    return c.json({
      message: 'Indexacao iniciada', total,
      setup: setupResult.action, maps_loaded: { categories: catCount, modelos: maps.modelos?.size || 0 },
      setup_ms: Date.now() - t0,
    });
  } catch (e: any) {
    console.error('[Meili] Start error:', e);
    await kv.set(MEILI_INDEX_STATUS_KEY, { status: 'error', error: e.message, failed_at: new Date().toISOString() }).catch(() => {});
    return c.json({ error: e.message }, 500);
  }
});

app.post('/make-server-1d6e33e0/meili/index/step', async (c) => {
  try {
    const live = await kv.get(MEILI_INDEX_STATUS_KEY);
    if (!live || live.status !== 'running') {
      return c.json({ message: 'Nenhuma indexacao em andamento', current_status: live?.status ?? 'idle' }, 400);
    }

    const pending = await meili.getPendingTaskCount();
    if (pending.total > 50) {
      return c.json({ message: 'backpressure', meili_pending: pending.total });
    }

    const cursor = await kv.get(MEILI_INDEX_CURSOR_KEY);
    if (!cursor) return c.json({ error: 'Cursor nao encontrado' }, 400);

    const stepT0 = Date.now();

    let query = supabase.from('kv_store_1d6e33e0').select('key, value')
      .like('key', 'product:%').order('key').limit(MEILI_INDEX_BATCH);
    if (cursor.lastKey) query = query.gt('key', cursor.lastKey);

    const { data: rows, error } = await query;
    if (error) throw new Error(`KV scan: ${error.message}`);

    if (!rows || rows.length === 0) {
      return c.json({ message: 'all_batches_done', indexed: cursor.indexed, batches: cursor.batches });
    }

    const maps = await loadAttributeMaps();
    const docs: any[] = [];
    let skipped = 0;
    for (const row of rows) {
      try {
        const product = row.value;
        if (!product?.sku) { skipped++; continue; }
        const transformed = meili.transformProduct(product, maps);
        if (transformed) docs.push(transformed);
        else skipped++;
      } catch { skipped++; }
    }

    let taskUid: number | null = null;
    if (docs.length > 0) {
      const result = await meili.indexDocuments(docs);
      taskUid = result?.taskUid ?? null;
    }

    const newLastKey = rows[rows.length - 1].key;
    const newIndexed = cursor.indexed + docs.length;
    const newSkipped = cursor.skipped + skipped;
    const newBatches = cursor.batches + 1;
    const taskUids = taskUid ? [...(cursor.taskUids || []).slice(-50), taskUid] : (cursor.taskUids || []);

    await kv.set(MEILI_INDEX_CURSOR_KEY, { lastKey: newLastKey, indexed: newIndexed, skipped: newSkipped, batches: newBatches, taskUids });

    const total = live.total || 0;
    const pct = total ? Math.min(99, Math.round((newIndexed / total) * 100)) : 0;
    const elapsed = Math.round((Date.now() - new Date(live.started_at).getTime()) / 1000);
    const docsPerSec = elapsed > 0 ? Math.round(newIndexed / elapsed) : 0;
    const remaining = total - newIndexed;
    const etaSec = docsPerSec > 0 ? Math.round(remaining / docsPerSec) : 0;

    if (newBatches % 3 === 0 || rows.length < MEILI_INDEX_BATCH) {
      await kv.set(MEILI_INDEX_STATUS_KEY, {
        ...live, phase: 'indexing', indexed: newIndexed, skipped: newSkipped,
        progress: pct, batches_completed: newBatches, tasks_queued: taskUids.length,
        docs_per_second: docsPerSec, eta_seconds: etaSec,
      }).catch(() => {});
    }

    const hasMore = rows.length >= MEILI_INDEX_BATCH;

    // Auto-trigger SSG when Meili indexing completes
    if (!hasMore) {
      try {
        const SSG_JOB_KEY = 'meta:ssg_job';
        const existingJob = await kv.get(SSG_JOB_KEY);
        if (!existingJob || existingJob.status !== 'running') {
          const productCount = await countProducts();
          await kv.set(SSG_JOB_KEY, {
            status: 'running',
            started_at: new Date().toISOString(),
            total_products: productCount,
            processed: 0, generated: 0, skipped: 0, errors: 0,
            force: false, batch_size: 100,
            next_after_key: null, done: false,
            auto_triggered_by: 'meili_index',
          });
          console.log(`[SSG Auto] Job SSG iniciado (triggered by Meili index completion)`);
        }
      } catch (ssgErr: any) {
        console.error('[SSG Auto] Meili trigger error:', ssgErr.message);
      }
    }

    return c.json({
      message: hasMore ? 'batch_done' : 'all_batches_done',
      progress: { indexed: newIndexed, total, pct, docs_per_second: docsPerSec, eta: fmtDuration(etaSec) },
      step_ms: Date.now() - stepT0,
      ssg_triggered: !hasMore,
    });
  } catch (e: any) {
    console.error('[Meili] Step error:', e);
    const cur = await kv.get(MEILI_INDEX_STATUS_KEY).catch(() => null);
    await kv.set(MEILI_INDEX_STATUS_KEY, { ...(cur || {}), status: 'error', error: e.message, failed_at: new Date().toISOString() }).catch(() => {});
    return c.json({ error: e.message }, 500);
  }
});

app.post('/make-server-1d6e33e0/meili/index/finalize', async (c) => {
  try {
    const live = await kv.get(MEILI_INDEX_STATUS_KEY);
    const cursor = await kv.get(MEILI_INDEX_CURSOR_KEY);

    await kv.set(MEILI_INDEX_STATUS_KEY, { ...(live || {}), phase: 'waiting_tasks' }).catch(() => {});

    let taskWait: any = { skipped: true };
    if (cursor?.taskUids?.length > 0) {
      const lastTaskUid = cursor.taskUids[cursor.taskUids.length - 1];
      try {
        await meili.waitForTask(lastTaskUid, 120000, 2000);
        taskWait = { settled: true };
      } catch (e: any) {
        taskWait = { settled: false, error: e.message };
      }
    }

    await kv.set(MEILI_INDEX_STATUS_KEY, { ...(live || {}), phase: 'smoke_test' }).catch(() => {});
    let smokeTest: any = null;
    try {
      const testSearch = await meili.search('', {
        limit: 0,
        facets: ['category_ids', 'category_names', 'modelos', 'in_stock'],
      });
      smokeTest = {
        totalHits: testSearch.estimatedTotalHits || testSearch.totalHits || 0,
        facetsReturned: Object.keys(testSearch.facetDistribution || {}),
        categoryIdsFacetCount: Object.keys(testSearch.facetDistribution?.category_ids || {}).length,
        categoryNamesFacetCount: Object.keys(testSearch.facetDistribution?.category_names || {}).length,
      };
    } catch (e: any) {
      smokeTest = { error: e.message };
    }

    const elapsed = live?.started_at ? Math.round((Date.now() - new Date(live.started_at).getTime()) / 1000) : 0;
    const finalStatus: MeiliIndexStatus = {
      status: 'completed', phase: 'smoke_test',
      started_at: live?.started_at, completed_at: new Date().toISOString(),
      total: cursor?.indexed || live?.total || 0,
      indexed: cursor?.indexed || 0, skipped: cursor?.skipped || 0,
      progress: 100, batches_completed: cursor?.batches || 0,
      tasks_queued: cursor?.taskUids?.length || 0,
      elapsed_seconds: elapsed, smokeTest, taskWait,
    };

    await kv.set(MEILI_INDEX_STATUS_KEY, finalStatus);
    await kv.del(MEILI_INDEX_CURSOR_KEY).catch(() => {});

    return c.json({ message: 'Indexacao finalizada', status: finalStatus });
  } catch (e: any) {
    console.error('[Meili] Finalize error:', e);
    await kv.set(MEILI_INDEX_STATUS_KEY, { status: 'error', error: e.message, failed_at: new Date().toISOString() }).catch(() => {});
    return c.json({ error: e.message }, 500);
  }
});

app.post('/make-server-1d6e33e0/meili/reset', async (c) => {
  await kv.set(MEILI_INDEX_STATUS_KEY, { status: 'idle' });
  await kv.del(MEILI_INDEX_CURSOR_KEY).catch(() => {});
  return c.json({ ok: true });
});

// ═══════════════════════════════════════════════════════════════════════════════
// ─── PRODUCT AUDIT ──────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════
app.get('/make-server-1d6e33e0/audit/status', async (c) => {
  try {
    const status = await kv.get(AUDIT_STATUS_KEY) || { status: 'idle' };
    return c.json(status);
  } catch (e: any) {
    return c.json({ status: 'error', error: e.message }, 500);
  }
});

app.post('/make-server-1d6e33e0/audit/step', async (c) => {
  try {
    let live = await kv.get(AUDIT_STATUS_KEY);

    if (!live || live.status !== 'running') {
      const total = await countProducts();
      live = {
        status: 'running', started_at: new Date().toISOString(), phase: 'scanning',
        total, scanned: 0, in_stock: 0, out_of_stock: 0, no_sku: 0, errors: 0,
        cursor_last_key: null,
      };
      await kv.set(AUDIT_STATUS_KEY, live);
    }

    let query = supabase.from('kv_store_1d6e33e0').select('key, value')
      .like('key', 'product:%').order('key').limit(500);
    if (live.cursor_last_key) query = query.gt('key', live.cursor_last_key);

    const { data: rows, error } = await query;
    if (error) throw error;

    if (!rows || rows.length === 0) {
      return c.json({ message: 'all_batches_done', scanned: live.scanned });
    }

    let inStock = 0, outOfStock = 0, noSku = 0, errs = 0;
    for (const row of rows) {
      try {
        const p = row.value;
        if (!p?.sku) { noSku++; continue; }
        if (parseStock(p)) inStock++; else outOfStock++;
      } catch { errs++; }
    }

    const newScanned = (live.scanned || 0) + rows.length;
    const hasMore = rows.length >= 500;
    const newLive = {
      ...live,
      scanned: newScanned,
      in_stock: (live.in_stock || 0) + inStock,
      out_of_stock: (live.out_of_stock || 0) + outOfStock,
      no_sku: (live.no_sku || 0) + noSku,
      errors: (live.errors || 0) + errs,
      cursor_last_key: rows[rows.length - 1].key,
      progress: live.total ? Math.min(99, Math.round((newScanned / live.total) * 100)) : 0,
    };
    await kv.set(AUDIT_STATUS_KEY, newLive);

    return c.json({ message: hasMore ? 'batch_done' : 'all_batches_done', scanned: newScanned, total: live.total });
  } catch (e: any) {
    console.error('[Audit] Step error:', e);
    return c.json({ error: e.message }, 500);
  }
});

app.post('/make-server-1d6e33e0/audit/finalize', async (c) => {
  try {
    const live = await kv.get(AUDIT_STATUS_KEY) || {};
    const elapsed = live.started_at ? Math.round((Date.now() - new Date(live.started_at).getTime()) / 1000) : 0;

    let meiliDocs = 0;
    try {
      const stats = await meili.getIndexStats();
      meiliDocs = stats?.numberOfDocuments || 0;
    } catch {}

    const summary = {
      kv_count: live.scanned || 0, in_stock: live.in_stock || 0,
      out_of_stock: live.out_of_stock || 0, no_sku: live.no_sku || 0,
      meili_docs: meiliDocs, raw_complete: true, magento_total: live.total || 0,
    };

    const finalStatus = {
      status: 'completed', started_at: live.started_at, completed_at: new Date().toISOString(),
      elapsed_seconds: elapsed, summary, scanned: live.scanned, total: live.total,
    };

    await kv.set(AUDIT_STATUS_KEY, finalStatus);
    await kv.set(AUDIT_REPORT_KEY, { ...summary, generated_at: new Date().toISOString() });

    return c.json({ message: 'Audit finalizado', status: finalStatus });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.post('/make-server-1d6e33e0/audit/reset', async (c) => {
  await kv.set(AUDIT_STATUS_KEY, { status: 'idle' });
  return c.json({ ok: true });
});

app.get('/make-server-1d6e33e0/audit/report', async (c) => {
  try {
    const report = await kv.get(AUDIT_REPORT_KEY) || { message: 'Nenhum report disponivel' };
    return c.json(report);
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.get('/make-server-1d6e33e0/audit/debug/sample', async (c) => {
  try {
    const limit = parseInt(c.req.query('limit') || '5');
    const { data, error } = await supabase.from('kv_store_1d6e33e0').select('key, value')
      .like('key', 'product:%').order('key').limit(limit);
    if (error) throw error;

    const sample = (data || []).map((row: any) => {
      const p = row.value;
      return {
        key: row.key, sku: p?.sku, name: p?.name?.slice(0, 60),
        in_stock: parseStock(p), category_ids: extractCategoryIds(p),
        has_image: !!(p?.media_gallery_entries?.length),
      };
    });
    return c.json({ sample, count: sample.length });
  } catch (e: any) {
    return c.json({ error: e.message, sample: [] }, 500);
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// ─── TEST / DIAGNOSTIC ──────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════
app.get('/make-server-1d6e33e0/test/magento', async (c) => {
  try {
    const tests: any = {};
    if (MAGENTO_TOKEN) {
      const t0 = Date.now();
      try {
        const res = await fetch(`${MAGENTO_BASE_URL}/rest/V1/products?searchCriteria[pageSize]=1&searchCriteria[currentPage]=1`, {
          headers: { Authorization: `Bearer ${MAGENTO_TOKEN}` },
          signal: AbortSignal.timeout(20000),
        });
        const ms = Date.now() - t0;
        if (res.ok) {
          const data = await res.json();
          tests.api_products = { ok: true, total_count: data.total_count, ms };
        } else {
          tests.api_products = { ok: false, status: res.status, ms };
        }
      } catch (e: any) {
        tests.api_products = { ok: false, error: e.message, ms: Date.now() - t0 };
      }
    } else {
      tests.api_products = { ok: false, error: 'MAGENTO_TOKEN nao configurado' };
    }
    return c.json({ tests });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.get('/make-server-1d6e33e0/test/database', async (c) => {
  try {
    const total = await countProducts();
    return c.json({ ok: true, total_products: total });
  } catch (e: any) {
    return c.json({ ok: false, error: e.message }, 500);
  }
});

Deno.serve(app.fetch);
