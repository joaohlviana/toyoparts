import { Hono } from 'npm:hono';
import { createClient } from 'jsr:@supabase/supabase-js@2.49.8';
import * as kv from './kv_store.tsx';
import * as meili from './meilisearch.tsx';
import { resolveProductMedia } from './media-utils.tsx';

const SITE_URL = 'https://www.toyoparts.com.br';
const PRODUCT_PREFIX = 'product:';
const KV_TABLE = 'kv_store_1d6e33e0';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

export const googleMerchantAdmin = new Hono();

const HISTORY_SUMMARY_PREFIX = 'meta:google_merchant:history_summary:';
const HISTORY_FILE_PREFIX = 'meta:google_merchant:history_file:';
const HISTORY_LIMIT = 40;

type MerchantGenerationMode = 'filters_only' | 'skus_only' | 'combined';

interface MerchantFeedSettings {
  brand: string;
  google_product_category: string;
  shipping_weight: string;
  sale_price_effective_date: string;
  shipping_label: string;
  condition: string;
  adult: string;
  only_in_stock: boolean;
}

interface MerchantFeedRow {
  id: string;
  title: string;
  description: string;
  link: string;
  image_link: string;
  availability: string;
  price: string;
  sale_price: string;
  condition: string;
  adult: string;
  brand: string;
  google_product_category: string;
  shipping_weight: string;
  sale_price_effective_date: string;
  shipping_label: string;
}

interface MerchantHistoryRecord {
  id: string;
  key: string;
  name: string;
  mode: MerchantGenerationMode;
  created_at: string;
  filters: {
    minPrice: number | null;
    maxPrice: number | null;
  };
  selected_skus: string[];
  settings: MerchantFeedSettings;
  summary: {
    total_rows: number;
    price_filtered: number;
    manual_selected: number;
    manual_missing: number;
    skipped: number;
  };
  missing_manual_skus: string[];
  skipped: Array<{ sku: string; reason: string }>;
  rows_preview: MerchantFeedRow[];
  csv?: string;
  csv_key?: string;
}

function normalizeSku(value: unknown): string {
  return String(value || '').trim().toUpperCase();
}

function toNumber(value: unknown): number | null {
  if (value == null || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const normalized = String(value)
    .trim()
    .replace(/\.(?=\d{3}(\D|$))/g, '')
    .replace(',', '.')
    .replace(/[^\d.-]/g, '');
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function round2(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function getCustomAttr(product: any, code: string) {
  const attrs = Array.isArray(product?.custom_attributes) ? product.custom_attributes : [];
  return attrs.find((attr: any) => String(attr?.attribute_code || '').trim() === code)?.value;
}

function stripHtml(value: unknown) {
  return String(value || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function slugify(value: unknown) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'produto';
}

function resolveStock(product: any) {
  if (typeof product?.in_stock === 'boolean') return product.in_stock;
  const stockData = product?.extension_attributes?.stock;
  if (!stockData) return false;
  try {
    const stock = typeof stockData === 'string' ? JSON.parse(stockData) : stockData;
    const value = stock?.is_in_stock;
    return value === true || value === 1 || value === '1';
  } catch {
    return false;
  }
}

function readPrice(product: any) {
  return round2(toNumber(product?.price) || 0);
}

function readSpecialPrice(product: any) {
  const direct = toNumber(product?.special_price);
  if (direct != null) return round2(direct);
  const attr = toNumber(getCustomAttr(product, 'special_price'));
  return attr != null ? round2(attr) : null;
}

function readBrand(product: any, fallback: string) {
  const brand = String(
    getCustomAttr(product, 'brand') ||
    getCustomAttr(product, 'manufacturer') ||
    product?.brand ||
    fallback,
  ).trim();
  return brand || fallback;
}

function readWeight(product: any, fallback: string) {
  const direct = toNumber(product?.weight);
  const attr = toNumber(getCustomAttr(product, 'weight'));
  const resolved = direct ?? attr;
  if (resolved != null && resolved > 0) {
    return `${String(round2(resolved)).replace('.', '.')} kg`;
  }
  const safeFallback = String(fallback || '').trim();
  return safeFallback || '1 kg';
}

function formatPrice(value: number | null) {
  if (value == null || !Number.isFinite(value) || value <= 0) return '';
  return `${value.toFixed(2)} BRL`;
}

function formatMerchantDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const offsetMinutes = -date.getTimezoneOffset();
  const signal = offsetMinutes >= 0 ? '+' : '-';
  const absOffset = Math.abs(offsetMinutes);
  const offsetHours = String(Math.floor(absOffset / 60)).padStart(2, '0');
  const offsetMins = String(absOffset % 60).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}${signal}${offsetHours}${offsetMins}`;
}

function buildDefaultSaleWindow() {
  const start = new Date();
  start.setHours(13, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 11);
  end.setHours(15, 30, 0, 0);
  return `${formatMerchantDate(start)}/${formatMerchantDate(end)}`;
}

function getDefaultSettings(): MerchantFeedSettings {
  return {
    brand: 'Toyota',
    google_product_category: '899',
    shipping_weight: '1 kg',
    sale_price_effective_date: buildDefaultSaleWindow(),
    shipping_label: 'PEÇA',
    condition: 'new',
    adult: 'no',
    only_in_stock: true,
  };
}

function normalizeMode(value: unknown): MerchantGenerationMode {
  if (value === 'filters_only' || value === 'skus_only') return value;
  return 'combined';
}

function normalizeSettings(raw: any): MerchantFeedSettings {
  const defaults = getDefaultSettings();
  return {
    brand: String(raw?.brand || defaults.brand).trim() || defaults.brand,
    google_product_category: String(raw?.google_product_category || defaults.google_product_category).trim() || defaults.google_product_category,
    shipping_weight: String(raw?.shipping_weight || defaults.shipping_weight).trim() || defaults.shipping_weight,
    sale_price_effective_date: String(raw?.sale_price_effective_date || defaults.sale_price_effective_date).trim() || defaults.sale_price_effective_date,
    shipping_label: String(raw?.shipping_label || defaults.shipping_label).trim() || defaults.shipping_label,
    condition: String(raw?.condition || defaults.condition).trim() || defaults.condition,
    adult: String(raw?.adult || defaults.adult).trim() || defaults.adult,
    only_in_stock: raw?.only_in_stock !== false,
  };
}

function buildProductLink(product: any, sku: string) {
  const urlKey = String(product?.url_key || getCustomAttr(product, 'url_key') || slugify(product?.name || sku)).trim();
  return `${SITE_URL}/produto/${encodeURIComponent(sku)}/${urlKey}`;
}

function buildDescription(product: any) {
  const shortDescription = stripHtml(product?.short_description);
  if (shortDescription && shortDescription.length >= 20) {
    return shortDescription.slice(0, 480);
  }

  const name = String(product?.name || product?.sku || 'Peca Toyota').trim();
  return `${name} com 3 meses garantia de fabrica.`;
}

function isRenderableProduct(product: any, settings: MerchantFeedSettings) {
  const sku = normalizeSku(product?.sku);
  if (!sku) return { ok: false, reason: 'SKU ausente' };
  if (Number(product?.status || 0) !== 1) return { ok: false, reason: 'Produto inativo' };
  if (settings.only_in_stock && !resolveStock(product)) return { ok: false, reason: 'Sem estoque' };
  const price = readPrice(product);
  if (!price || price <= 0) return { ok: false, reason: 'Preço inválido' };
  const media = resolveProductMedia(product, { allowLegacy: true });
  if (!media.image_url) return { ok: false, reason: 'Sem imagem pública' };
  return { ok: true, media };
}

function buildFeedRow(product: any, settings: MerchantFeedSettings): MerchantFeedRow {
  const sku = normalizeSku(product?.sku);
  const media = resolveProductMedia(product, { allowLegacy: true });
  const price = readPrice(product);
  const specialPrice = readSpecialPrice(product);
  const validSale = specialPrice != null && specialPrice > 0 && specialPrice < price;

  return {
    id: sku,
    title: String(product?.name || sku).trim(),
    description: buildDescription(product),
    link: buildProductLink(product, sku),
    image_link: String(media.image_url || '').trim(),
    availability: resolveStock(product) ? 'in_stock' : 'out_of_stock',
    price: formatPrice(price),
    sale_price: validSale ? formatPrice(specialPrice) : '',
    condition: settings.condition,
    adult: settings.adult,
    brand: readBrand(product, settings.brand),
    google_product_category: settings.google_product_category,
    shipping_weight: readWeight(product, settings.shipping_weight),
    sale_price_effective_date: validSale ? settings.sale_price_effective_date : '',
    shipping_label: settings.shipping_label,
  };
}

function toCsv(rows: MerchantFeedRow[]) {
  const headers = [
    'id',
    'title',
    'description',
    'link',
    'image_link',
    'availability',
    'price',
    'sale_price',
    'condition',
    'adult',
    'brand',
    'google_product_category',
    'shipping_weight',
    'sale_price_effective_date',
    'shipping_label',
  ] as const;

  const escape = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;
  const lines = [
    headers.join(','),
    ...rows.map((row) => headers.map((header) => escape(row[header])).join(',')),
  ];
  return lines.join('\n');
}

function getHistorySummaryKey(id: string, createdAt: string) {
  return `${HISTORY_SUMMARY_PREFIX}${createdAt}:${id}`;
}

function getHistoryFileKey(id: string, createdAt: string) {
  return `${HISTORY_FILE_PREFIX}${createdAt}:${id}`;
}

function buildHistoryName(name: unknown, mode: MerchantGenerationMode) {
  const raw = String(name || '').trim();
  if (raw) return raw;
  const label =
    mode === 'filters_only'
      ? 'Filtros'
      : mode === 'skus_only'
        ? 'SKUs em massa'
        : 'Filtros + SKUs';
  const stamp = new Date().toLocaleString('pt-BR');
  return `${label} - ${stamp}`;
}

function summarizeHistoryRecord(record: MerchantHistoryRecord) {
  return {
    id: record.id,
    key: record.key,
    name: record.name,
    mode: record.mode,
    created_at: record.created_at,
    filters: record.filters,
    selected_skus_count: record.selected_skus.length,
    settings: record.settings,
    summary: record.summary,
    missing_manual_skus: record.missing_manual_skus,
    skipped: record.skipped,
    rows_preview: record.rows_preview,
  };
}

async function saveHistoryRecord(record: MerchantHistoryRecord) {
  const summaryRecord = {
    ...record,
    csv: undefined,
  };
  const csvValue = record.csv || '';

  const { error: summaryError } = await supabase
    .from(KV_TABLE)
    .upsert({ key: record.key, value: summaryRecord });

  if (summaryError) {
    throw new Error(summaryError.message);
  }

  const { error: csvError } = await supabase
    .from(KV_TABLE)
    .upsert({
      key: record.csv_key,
      value: {
        id: record.id,
        csv: csvValue,
        created_at: record.created_at,
      },
    });

  if (csvError) {
    throw new Error(csvError.message);
  }

  const { data: existing, error: listError } = await supabase
    .from(KV_TABLE)
    .select('key, value')
    .like('key', `${HISTORY_SUMMARY_PREFIX}%`)
    .order('key', { ascending: false })
    .range(0, HISTORY_LIMIT + 20);

  if (listError) {
    throw new Error(listError.message);
  }

  const stale = (Array.isArray(existing) ? existing : []).slice(HISTORY_LIMIT);
  if (stale.length > 0) {
    const staleKeys = stale
      .map((item: any) => String(item?.key || '').trim())
      .filter(Boolean);
    const staleCsvKeys = stale
      .map((item: any) => String(item?.value?.csv_key || '').trim())
      .filter(Boolean);
    const allKeys = [...new Set([...staleKeys, ...staleCsvKeys])];

    if (allKeys.length > 0) {
      await supabase.from(KV_TABLE).delete().in('key', allKeys);
    }
  }
}

async function listHistoryRecords() {
  const { data, error } = await supabase
    .from(KV_TABLE)
    .select('value')
    .like('key', `${HISTORY_SUMMARY_PREFIX}%`)
    .order('key', { ascending: false })
    .range(0, HISTORY_LIMIT - 1);

  if (error) {
    throw new Error(error.message);
  }

  return (Array.isArray(data) ? data : [])
    .map((item: any) => item?.value)
    .filter((item: any) => item?.id && item?.key && item?.created_at)
    .map((item: any) => summarizeHistoryRecord(item as MerchantHistoryRecord));
}

async function getHistoryRecordById(id: string) {
  const { data, error } = await supabase
    .from(KV_TABLE)
    .select('value')
    .like('key', `${HISTORY_SUMMARY_PREFIX}%`)
    .order('key', { ascending: false })
    .range(0, HISTORY_LIMIT + 20);

  if (error) {
    throw new Error(error.message);
  }

  const record = (Array.isArray(data) ? data : [])
    .map((item: any) => item?.value)
    .find((item: any) => String(item?.id || '') === id);

  if (!record) return null;

  const csvKey = String(record?.csv_key || '').trim();
  if (csvKey) {
    const { data: csvRow, error: csvError } = await supabase
      .from(KV_TABLE)
      .select('value')
      .eq('key', csvKey)
      .maybeSingle();

    if (csvError) {
      throw new Error(csvError.message);
    }

    return {
      ...(record as MerchantHistoryRecord),
      csv: String(csvRow?.value?.csv || ''),
    };
  }

  return record as MerchantHistoryRecord;
}

async function listCatalogProducts() {
  const allProducts: any[] = [];
  const batchSize = 500;
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from(KV_TABLE)
      .select('value')
      .like('key', `${PRODUCT_PREFIX}%`)
      .order('key', { ascending: true })
      .range(from, from + batchSize - 1);

    if (error) {
      throw new Error(error.message);
    }

    const batch = Array.isArray(data) ? data.map((row: any) => row?.value).filter(Boolean) : [];
    if (batch.length === 0) break;

    allProducts.push(...batch);
    if (batch.length < batchSize) break;
    from += batchSize;
  }

  return allProducts;
}

async function loadProductsBySkus(skus: string[]) {
  const normalized = [...new Set((Array.isArray(skus) ? skus : []).map((sku) => normalizeSku(sku)).filter(Boolean))];
  if (!normalized.length) return [];
  const keys = normalized.map((sku) => `${PRODUCT_PREFIX}${sku}`);
  const products = await kv.mget(keys).catch(async () => {
    const results: any[] = [];
    for (const sku of normalized) {
      results.push(await kv.get(`${PRODUCT_PREFIX}${sku}`).catch(() => null));
    }
    return results;
  });
  return normalized.map((sku, index) => ({
    sku,
    product: products[index] || null,
  }));
}

async function searchProducts(query: string) {
  const normalizedQuery = String(query || '').trim();
  if (!normalizedQuery) return [];

  try {
    if (meili.isConfigured()) {
      const result = await meili.search(normalizedQuery, {
        limit: 12,
        offset: 0,
        filter: ['status = 1'],
        facets: [],
      });

      const mapped = Array.isArray(result?.hits) ? result.hits : [];
      if (mapped.length > 0) {
        return mapped.map((hit: any) => ({
          sku: normalizeSku(hit?.sku || hit?.id),
          name: String(hit?.name || '').trim(),
          price: readPrice(hit),
          special_price: readSpecialPrice(hit),
          in_stock: hit?.in_stock === true,
          image_url: String(hit?.image_url || '').trim() || null,
        })).filter((item) => item.sku);
      }
    }
  } catch (error) {
    console.warn('[google-merchant] search via Meili failed:', error);
  }

  const allProducts = await listCatalogProducts().catch(() => []);
  return (Array.isArray(allProducts) ? allProducts : [])
    .filter((product: any) => Number(product?.status || 0) === 1)
    .filter((product: any) => {
      const sku = normalizeSku(product?.sku);
      const name = String(product?.name || '').toLowerCase();
      const q = normalizedQuery.toLowerCase();
      return sku.includes(q.toUpperCase()) || name.includes(q);
    })
    .slice(0, 12)
    .map((product: any) => {
      const media = resolveProductMedia(product, { allowLegacy: true });
      return {
        sku: normalizeSku(product?.sku),
        name: String(product?.name || '').trim(),
        price: readPrice(product),
        special_price: readSpecialPrice(product),
        in_stock: resolveStock(product),
        image_url: media.image_url,
      };
    });
}

googleMerchantAdmin.get('/defaults', (c) => {
  return c.json({ settings: getDefaultSettings() });
});

googleMerchantAdmin.get('/search-products', async (c) => {
  try {
    const q = String(c.req.query('q') || '').trim();
    const rows = await searchProducts(q);
    return c.json({ products: rows });
  } catch (error: any) {
    return c.json({ error: error?.message || 'Falha ao buscar produtos do Merchant.' }, 500);
  }
});

googleMerchantAdmin.get('/history', async (c) => {
  try {
    const history = await listHistoryRecords();
    return c.json({ history });
  } catch (error: any) {
    return c.json({ error: error?.message || 'Falha ao carregar historico do Merchant.' }, 500);
  }
});

googleMerchantAdmin.get('/history/:id', async (c) => {
  try {
    const id = String(c.req.param('id') || '').trim();
    const record = await getHistoryRecordById(id);
    if (!record) {
      return c.json({ error: 'Arquivo nao encontrado no historico.' }, 404);
    }
    return c.json({ record });
  } catch (error: any) {
    return c.json({ error: error?.message || 'Falha ao carregar arquivo do historico.' }, 500);
  }
});

googleMerchantAdmin.delete('/history/:id', async (c) => {
  try {
    const id = String(c.req.param('id') || '').trim();
    const record = await getHistoryRecordById(id);
    if (!record?.key) {
      return c.json({ error: 'Arquivo nao encontrado no historico.' }, 404);
    }
    const keysToDelete = [record.key, String(record.csv_key || '').trim()].filter(Boolean);
    const { error } = await supabase.from(KV_TABLE).delete().in('key', keysToDelete);
    if (error) {
      throw new Error(error.message);
    }
    return c.json({ ok: true });
  } catch (error: any) {
    return c.json({ error: error?.message || 'Falha ao remover arquivo do historico.' }, 500);
  }
});

googleMerchantAdmin.post('/generate', async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const minPrice = toNumber(body?.minPrice);
    const maxPrice = toNumber(body?.maxPrice);
    const selectedSkus = Array.isArray(body?.selectedSkus) ? body.selectedSkus : [];
    const normalizedSelectedSkus = [...new Set(selectedSkus.map((sku) => normalizeSku(sku)).filter(Boolean))];
    const mode = normalizeMode(body?.mode);
    const saveToHistory = body?.saveToHistory !== false;
    const settings = normalizeSettings(body?.settings || {});

    const shouldUsePriceFilter = mode === 'filters_only' || mode === 'combined';
    const shouldUseManualSkus = mode === 'skus_only' || mode === 'combined';

    if (!shouldUsePriceFilter && !shouldUseManualSkus) {
      return c.json({ ok: false, error: 'Modo de geracao invalido.' }, 400);
    }

    if (mode === 'filters_only' && minPrice == null && maxPrice == null) {
      return c.json({ ok: false, error: 'Defina ao menos um filtro de preco para gerar somente por filtros.' }, 400);
    }

    if (mode === 'skus_only' && normalizedSelectedSkus.length === 0) {
      return c.json({ ok: false, error: 'Adicione ao menos um SKU para gerar somente por SKUs.' }, 400);
    }

    const allProducts = shouldUsePriceFilter ? await listCatalogProducts() : [];
    const catalogProducts = (Array.isArray(allProducts) ? allProducts : []).filter((product: any) => {
      if (!shouldUsePriceFilter) return false;
      if (Number(product?.status || 0) !== 1) return false;
      const price = readPrice(product);
      if (minPrice != null && price < minPrice) return false;
      if (maxPrice != null && price > maxPrice) return false;
      return true;
    });

    const manualProducts = shouldUseManualSkus ? await loadProductsBySkus(normalizedSelectedSkus) : [];
    const merged = new Map<string, { product: any; source: 'price' | 'manual' | 'both' }>();

    for (const product of catalogProducts) {
      const sku = normalizeSku(product?.sku);
      if (!sku) continue;
      merged.set(sku, { product, source: 'price' });
    }

    const missingManualSkus: string[] = [];
    for (const entry of manualProducts) {
      if (!entry.product) {
        missingManualSkus.push(entry.sku);
        continue;
      }
      const existing = merged.get(entry.sku);
      merged.set(entry.sku, {
        product: existing?.product || entry.product,
        source: existing ? 'both' : 'manual',
      });
    }

    const skipped: Array<{ sku: string; reason: string }> = [];
    const rows: Array<MerchantFeedRow & { source: 'price' | 'manual' | 'both' }> = [];

    for (const [sku, entry] of merged.entries()) {
      const validation = isRenderableProduct(entry.product, settings);
      if (!validation.ok) {
        skipped.push({ sku, reason: validation.reason });
        continue;
      }
      rows.push({
        ...buildFeedRow(entry.product, settings),
        source: entry.source,
      });
    }

    rows.sort((left, right) => {
      if (left.source !== right.source) {
        const weight = { both: 0, manual: 1, price: 2 } as const;
        return weight[left.source] - weight[right.source];
      }
      return left.title.localeCompare(right.title, 'pt-BR');
    });

    const merchantRows = rows.map(({ source: _source, ...row }) => row);
    const summary = {
      total_rows: merchantRows.length,
      price_filtered: rows.filter((row) => row.source === 'price' || row.source === 'both').length,
      manual_selected: rows.filter((row) => row.source === 'manual' || row.source === 'both').length,
      manual_missing: missingManualSkus.length,
      skipped: skipped.length,
    };
    const csv = toCsv(merchantRows);

    let historyRecord: MerchantHistoryRecord | null = null;
    let historyWarning: string | null = null;
    if (saveToHistory) {
      const createdAt = new Date().toISOString();
      const id = crypto.randomUUID();
      historyRecord = {
        id,
        key: getHistorySummaryKey(id, createdAt),
        name: buildHistoryName(body?.name, mode),
        mode,
        created_at: createdAt,
        filters: {
          minPrice,
          maxPrice,
        },
        selected_skus: normalizedSelectedSkus,
        settings,
        summary,
        missing_manual_skus: missingManualSkus,
        skipped,
        rows_preview: merchantRows.slice(0, 20),
        csv,
        csv_key: getHistoryFileKey(id, createdAt),
      };
      try {
        await saveHistoryRecord(historyRecord);
      } catch (historyError: any) {
        console.error('[google-merchant] failed to save history:', historyError);
        historyWarning = historyError?.message || 'Falha ao salvar historico.';
        historyRecord = null;
      }
    }

    return c.json({
      ok: true,
      mode,
      settings,
      summary,
      missing_manual_skus: missingManualSkus,
      skipped,
      rows: merchantRows,
      csv,
      history_warning: historyWarning,
      history_record: historyRecord ? summarizeHistoryRecord(historyRecord) : null,
    });
  } catch (error: any) {
    return c.json({ ok: false, error: error?.message || 'Falha ao gerar feed do Google Merchant.' }, 500);
  }
});
