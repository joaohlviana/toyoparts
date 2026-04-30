import { Hono } from 'npm:hono';
import { createClient } from "jsr:@supabase/supabase-js@2.49.8";
import * as kv from './kv_store.tsx';
import * as meili from './meilisearch.tsx';
import { fetchMagento } from './magento.tsx';

export const discounts = new Hono();

const PRODUCT_PREFIX = 'product:';
const DRAFT_PRICE_PREFIX = 'discounts:draft:price:';
const PRICE_IMPORT_BUFFER_PREFIX = 'discounts:buffer:price:';
const DRAFT_ADDITIONAL_PREFIX = 'discounts:draft:additional:';
const PUBLISHED_PREFIX = 'discounts:published:';
const SNAPSHOT_PRODUCT_PREFIX = 'snapshot:product:';

const PRICE_META_KEY = 'meta:discounts:draft_prices';
const PRICE_IMPORT_STATUS_KEY = 'meta:discounts:import_prices_status';
const ADDITIONAL_META_KEY = 'meta:discounts:draft_additional';
const PUBLISHED_META_KEY = 'meta:discounts:published';

const KV_TABLE = 'kv_store_1d6e33e0';
const MAGENTO_PAGE_SIZE = 250;
const MAGENTO_PARALLEL_PAGES = 3;
const DISCOUNT_IMPORT_PAGES_PER_STEP = 1;
const KV_BATCH_SIZE = 500;

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

type DiscountStatus =
  | 'desconto_publicado'
  | 'pronto_para_publicar'
  | 'publicacao_pendente_reversao'
  | 'sem_desconto_adicional'
  | 'sem_special_price_valido';

interface DraftPriceRow {
  sku: string;
  price: number;
  special_price: number | null;
  currentDiscountPercent: number;
  status: 'ready' | 'sem_special_price_valido';
  importedAt: string;
  source: 'magento' | 'catalog_cache_fallback';
}

interface DraftAdditionalRow {
  sku: string;
  additionalDiscountPercent: number;
  updatedAt: string;
  source: 'csv' | 'manual';
}

interface PublishedDiscountRow {
  sku: string;
  price: number;
  magento_special_price: number | null;
  currentDiscountPercent: number;
  additionalDiscountPercent: number;
  finalPrice: number;
  totalDiscountPercent: number;
  status: 'published';
  publishedAt: string;
}

interface ResultRow {
  sku: string;
  price: number;
  special_price: number | null;
  currentDiscountPercent: number;
  additionalDiscountPercent: number;
  finalPrice: number | null;
  totalDiscountPercent: number | null;
  status: DiscountStatus;
  isPublished: boolean;
  publishedAt: string | null;
}

interface PriceImportStatus {
  status: 'idle' | 'running' | 'completed' | 'error';
  source: 'magento' | 'catalog_cache_fallback' | null;
  startedAt?: string | null;
  importedAt?: string | null;
  completedAt?: string | null;
  failedAt?: string | null;
  totalMagentoProducts?: number;
  totalPages?: number;
  currentPage?: number;
  processedPages?: number;
  matchedRows?: number;
  valid?: number;
  invalid?: number;
  pagesPerStep?: number;
  resumePage?: number | null;
  lastBatchPages?: number[];
  lastStepMs?: number | null;
  lastError?: string | null;
}

function normalizeSku(value: string | null | undefined) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '');
}

function round2(value: number) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

function parseNumber(value: unknown): number | null {
  if (value == null || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const normalized = String(value)
    .trim()
    .replace(/\./g, '')
    .replace(',', '.')
    .replace(/[^\d.-]/g, '');
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function parsePercent(value: unknown): number | null {
  const parsed = parseNumber(value);
  if (parsed == null || parsed < 0 || parsed > 100) return null;
  return round2(parsed);
}

function parseMoney(value: unknown): number | null {
  const parsed = parseNumber(value);
  if (parsed == null || parsed < 0) return null;
  return round2(parsed);
}

function getCustomAttr(product: any, code: string) {
  const attributes = Array.isArray(product?.custom_attributes) ? product.custom_attributes : [];
  return attributes.find((attribute: any) => attribute?.attribute_code === code)?.value;
}

function readSpecialPrice(product: any) {
  const topLevel = parseMoney(product?.special_price);
  if (topLevel != null) return topLevel;
  return parseMoney(getCustomAttr(product, 'special_price'));
}

function readMagentoSpecialPrice(product: any) {
  const explicit = parseMoney(product?.magento_special_price);
  if (explicit != null) return explicit;
  return readSpecialPrice(product);
}

function isValidSpecialPrice(price: number, specialPrice: number | null) {
  return price > 0 && specialPrice != null && specialPrice > 0 && specialPrice < price;
}

function calculateCurrentDiscountPercent(price: number, specialPrice: number | null) {
  if (!isValidSpecialPrice(price, specialPrice)) return 0;
  return round2(((price - (specialPrice as number)) / price) * 100);
}

function deriveDefaultSpecialPrice(price: number) {
  if (!price || price <= 0) return null;
  return round2(price * 0.901);
}

function resolveImportedSpecialPrice(price: number, magentoSpecialPrice: number | null, siteProduct?: any) {
  if (isValidSpecialPrice(price, magentoSpecialPrice)) {
    return round2(magentoSpecialPrice as number);
  }

  const siteBased = readMagentoSpecialPrice(siteProduct);
  if (isValidSpecialPrice(price, siteBased)) {
    return round2(siteBased as number);
  }

  const derived = deriveDefaultSpecialPrice(price);
  if (isValidSpecialPrice(price, derived)) {
    return round2(derived as number);
  }

  return magentoSpecialPrice != null ? round2(magentoSpecialPrice) : null;
}

function calculateFinalPrice(specialPrice: number | null, additionalDiscountPercent: number) {
  if (specialPrice == null) return null;
  return round2(specialPrice * (1 - additionalDiscountPercent / 100));
}

function calculateTotalDiscountPercent(price: number, finalPrice: number | null) {
  if (!price || price <= 0 || finalPrice == null) return null;
  return round2(((price - finalPrice) / price) * 100);
}

function buildDraftPriceRow(
  sku: string,
  price: number,
  specialPrice: number | null,
  importedAt: string,
  source: DraftPriceRow['source'],
): DraftPriceRow {
  const validSpecial = isValidSpecialPrice(price, specialPrice);
  return {
    sku,
    price: round2(price),
    special_price: validSpecial ? round2(specialPrice as number) : specialPrice != null ? round2(specialPrice) : null,
    currentDiscountPercent: calculateCurrentDiscountPercent(price, specialPrice),
    status: validSpecial ? 'ready' : 'sem_special_price_valido',
    importedAt,
    source,
  };
}

function buildPublishedDiscountRow(
  priceRow: DraftPriceRow,
  additionalDiscountPercent: number,
  publishedAt: string,
): PublishedDiscountRow {
  const finalPrice = calculateFinalPrice(priceRow.special_price, additionalDiscountPercent) as number;
  return {
    sku: priceRow.sku,
    price: priceRow.price,
    magento_special_price: priceRow.special_price,
    currentDiscountPercent: priceRow.currentDiscountPercent,
    additionalDiscountPercent,
    finalPrice,
    totalDiscountPercent: calculateTotalDiscountPercent(priceRow.price, finalPrice) || 0,
    status: 'published',
    publishedAt,
  };
}

function isResultPublishedCurrent(row: ResultRow, publishedRow?: PublishedDiscountRow) {
  if (!publishedRow || row.finalPrice == null) return false;
  return (
    round2(publishedRow.finalPrice) === round2(row.finalPrice) &&
    round2(publishedRow.price) === round2(row.price) &&
    round2(publishedRow.magento_special_price || 0) === round2(row.special_price || 0) &&
    round2(publishedRow.additionalDiscountPercent) === round2(row.additionalDiscountPercent)
  );
}

function buildResultRow(
  priceRow: DraftPriceRow,
  additionalDiscountPercent: number,
  publishedRow?: PublishedDiscountRow,
): ResultRow {
  if (priceRow.status !== 'ready') {
    return {
      sku: priceRow.sku,
      price: priceRow.price,
      special_price: priceRow.special_price,
      currentDiscountPercent: priceRow.currentDiscountPercent,
      additionalDiscountPercent,
      finalPrice: null,
      totalDiscountPercent: null,
      status: 'sem_special_price_valido',
      isPublished: false,
      publishedAt: null,
    };
  }

  const finalPrice = additionalDiscountPercent > 0
    ? calculateFinalPrice(priceRow.special_price, additionalDiscountPercent)
    : priceRow.special_price;
  const totalDiscountPercent = calculateTotalDiscountPercent(priceRow.price, finalPrice);

  let status: DiscountStatus = 'sem_desconto_adicional';
  if (additionalDiscountPercent > 0) {
    status = isResultPublishedCurrent({
      sku: priceRow.sku,
      price: priceRow.price,
      special_price: priceRow.special_price,
      currentDiscountPercent: priceRow.currentDiscountPercent,
      additionalDiscountPercent,
      finalPrice,
      totalDiscountPercent,
      status: 'pronto_para_publicar',
      isPublished: false,
      publishedAt: null,
    }, publishedRow)
      ? 'desconto_publicado'
      : 'pronto_para_publicar';
  } else if (publishedRow) {
    status = 'publicacao_pendente_reversao';
  }

  return {
    sku: priceRow.sku,
    price: priceRow.price,
    special_price: priceRow.special_price,
    currentDiscountPercent: priceRow.currentDiscountPercent,
    additionalDiscountPercent,
    finalPrice,
    totalDiscountPercent,
    status,
    isPublished: status === 'desconto_publicado',
    publishedAt: publishedRow?.publishedAt || null,
  };
}

async function listKvEntries(prefix: string): Promise<Array<{ key: string; value: any }>> {
  const rows: Array<{ key: string; value: any }> = [];
  let from = 0;
  let keepGoing = true;

  while (keepGoing) {
    const { data, error } = await supabase
      .from(KV_TABLE)
      .select('key, value')
      .like('key', `${prefix}%`)
      .order('key')
      .range(from, from + KV_BATCH_SIZE - 1);

    if (error) throw new Error(error.message);
    if (!data || data.length === 0) {
      keepGoing = false;
      continue;
    }

    rows.push(...(data as Array<{ key: string; value: any }>));
    from += KV_BATCH_SIZE;
    if (data.length < KV_BATCH_SIZE) keepGoing = false;
  }

  return rows;
}

async function upsertKvEntries(entries: Array<{ key: string; value: any }>, batchSize = KV_BATCH_SIZE) {
  const effectiveBatchSize = Math.max(1, batchSize || KV_BATCH_SIZE);
  for (let index = 0; index < entries.length; index += effectiveBatchSize) {
    const batch = entries.slice(index, index + effectiveBatchSize);
    const { error } = await supabase.from(KV_TABLE).upsert(batch);
    if (error) throw new Error(error.message);
  }
}

async function deleteKvKeys(keys: string[]) {
  for (let index = 0; index < keys.length; index += KV_BATCH_SIZE) {
    const batch = keys.slice(index, index + KV_BATCH_SIZE);
    const { error } = await supabase.from(KV_TABLE).delete().in('key', batch);
    if (error) throw new Error(error.message);
  }
}

async function listProductsBySkus(skus: string[]) {
  const rows: Array<{ key: string; value: any }> = [];
  for (let index = 0; index < skus.length; index += 200) {
    const keys = skus.slice(index, index + 200).map((sku) => `${PRODUCT_PREFIX}${sku}`);
    const { data, error } = await supabase
      .from(KV_TABLE)
      .select('key, value')
      .in('key', keys);
    if (error) throw new Error(error.message);
    rows.push(...((data || []) as Array<{ key: string; value: any }>));
  }
  return rows;
}

async function listExistingProductSkus(skus: string[]) {
  const found = new Set<string>();
  for (let index = 0; index < skus.length; index += 200) {
    const keys = skus.slice(index, index + 200).map((sku) => `${PRODUCT_PREFIX}${sku}`);
    const { data, error } = await supabase
      .from(KV_TABLE)
      .select('key')
      .in('key', keys);
    if (error) throw new Error(error.message);
    for (const row of (data || []) as Array<{ key: string }>) {
      const sku = normalizeSku(row.key.replace(PRODUCT_PREFIX, ''));
      if (sku) found.add(sku);
    }
  }
  return found;
}

function cloneCustomAttributes(product: any): any[] {
  const attributes = Array.isArray(product?.custom_attributes) ? product.custom_attributes : [];
  return attributes.map((attribute: any) => ({ ...attribute }));
}

function upsertCustomAttribute(customAttributes: any[], code: string, value: string) {
  const next = cloneCustomAttributes({ custom_attributes: customAttributes });
  const index = next.findIndex((attribute: any) => attribute?.attribute_code === code);
  if (index >= 0) next[index] = { ...next[index], value };
  else next.push({ attribute_code: code, value });
  return next;
}

function removeCustomAttribute(customAttributes: any[], code: string) {
  return cloneCustomAttributes({ custom_attributes: customAttributes })
    .filter((attribute: any) => attribute?.attribute_code !== code);
}

async function loadDraftPriceRows() {
  const rows = await listKvEntries(DRAFT_PRICE_PREFIX);
  return rows.map((row) => row.value as DraftPriceRow).filter((row) => !!row?.sku);
}

async function loadDraftAdditionalRows() {
  const rows = await listKvEntries(DRAFT_ADDITIONAL_PREFIX);
  return rows.map((row) => row.value as DraftAdditionalRow).filter((row) => !!row?.sku);
}

async function loadPublishedRows() {
  const rows = await listKvEntries(PUBLISHED_PREFIX);
  return rows.map((row) => row.value as PublishedDiscountRow).filter((row) => !!row?.sku);
}

async function loadSiteProducts() {
  const rows = await listKvEntries(PRODUCT_PREFIX);
  return rows.map((row) => row.value).filter((value) => !!value?.sku);
}

async function loadSiteSkuSet() {
  const products = await loadSiteProducts();
  return new Set(products.map((product) => normalizeSku(product.sku)).filter(Boolean));
}

function buildCsvResponse(filename: string, csv: string) {
  return new Response(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}

function csvEscape(value: unknown) {
  const raw = value == null ? '' : String(value);
  if (/[",\n;]/.test(raw)) return `"${raw.replace(/"/g, '""')}"`;
  return raw;
}

function summarizeDraftPrices(rows: DraftPriceRow[], meta: any = {}) {
  const valid = rows.filter((row) => row.status === 'ready').length;
  const invalid = rows.length - valid;
  return {
    importedAt: meta.importedAt || rows[0]?.importedAt || null,
    total: rows.length,
    valid,
    invalid,
    source: meta.source || rows[0]?.source || null,
  };
}

function summarizeAdditional(rows: DraftAdditionalRow[], meta: any = {}) {
  return {
    importedAt: meta.importedAt || rows[0]?.updatedAt || null,
    total: rows.length,
    source: meta.source || null,
    rejectedCount: Number(meta.rejectedCount || 0),
  };
}

function summarizePublished(rows: PublishedDiscountRow[], publishedAt: string | null) {
  return {
    publishedAt,
    total: rows.length,
    totalWithAdditional: rows.filter((row) => row.additionalDiscountPercent > 0).length,
  };
}

function getImportStatusDefaults(): PriceImportStatus {
  return {
    status: 'idle',
    source: null,
    startedAt: null,
    importedAt: null,
    completedAt: null,
    failedAt: null,
    totalMagentoProducts: 0,
    totalPages: 0,
    currentPage: 0,
    processedPages: 0,
    matchedRows: 0,
    valid: 0,
    invalid: 0,
    pagesPerStep: DISCOUNT_IMPORT_PAGES_PER_STEP,
    resumePage: null,
    lastBatchPages: [],
    lastStepMs: null,
    lastError: null,
  };
}

function hydrateImportStatus(status: any): PriceImportStatus & { stale: boolean; elapsedMinutes: number } {
  const next = {
    ...getImportStatusDefaults(),
    ...(status || {}),
  };

  const elapsedMinutes = next.startedAt
    ? Math.max(0, Math.floor((Date.now() - new Date(next.startedAt).getTime()) / 60000))
    : 0;
  const stale = next.status === 'running' && elapsedMinutes >= 30;

  return {
    ...next,
    stale,
    elapsedMinutes,
  };
}

async function readImportStatus() {
  return hydrateImportStatus(await kv.get(PRICE_IMPORT_STATUS_KEY));
}

async function writeImportStatus(status: PriceImportStatus) {
  await kv.set(PRICE_IMPORT_STATUS_KEY, status);
  return hydrateImportStatus(status);
}

async function clearBufferedDraftPrices() {
  const existing = await listKvEntries(PRICE_IMPORT_BUFFER_PREFIX);
  if (existing.length === 0) return;
  await deleteKvKeys(existing.map((row) => row.key));
}

async function loadBufferedDraftPriceRows(importedAt?: string | null) {
  const rows = await listKvEntries(PRICE_IMPORT_BUFFER_PREFIX);
  return rows
    .map((row) => row.value as DraftPriceRow)
    .filter((row) => !!row?.sku)
    .filter((row) => !importedAt || row.importedAt === importedAt);
}

async function buildFallbackPriceImportStatus(reason?: string | null) {
  const importedAt = new Date().toISOString();
  const products = await loadSiteProducts();
  const rows = products
    .map((product) => {
      const sku = normalizeSku(product?.sku);
      if (!sku) return null;
      const price = parseMoney(product?.price) || 0;
      const specialPrice = readMagentoSpecialPrice(product);
      return buildDraftPriceRow(sku, price, specialPrice, importedAt, 'catalog_cache_fallback');
    })
    .filter((row): row is DraftPriceRow => !!row)
    .sort((left, right) => left.sku.localeCompare(right.sku));

  await replaceDraftPriceRows(rows);

  const summary = summarizeDraftPrices(rows, { importedAt, source: 'catalog_cache_fallback' });
  await kv.set(PRICE_META_KEY, summary);

  const status = await writeImportStatus({
    status: 'completed',
    source: 'catalog_cache_fallback',
    startedAt: importedAt,
    importedAt,
    completedAt: new Date().toISOString(),
    totalMagentoProducts: rows.length,
    totalPages: 1,
    currentPage: 1,
    processedPages: 1,
    matchedRows: rows.length,
    valid: summary.valid,
    invalid: summary.invalid,
    pagesPerStep: DISCOUNT_IMPORT_PAGES_PER_STEP,
    resumePage: null,
    lastBatchPages: [1],
    lastStepMs: null,
    lastError: reason || null,
  });

  return { status, summary };
}

async function finalizeMagentoDraftImport(status: PriceImportStatus) {
  const importedAt = status.importedAt || new Date().toISOString();
  const rows = (await loadBufferedDraftPriceRows(importedAt))
    .sort((left, right) => left.sku.localeCompare(right.sku));

  await replaceDraftPriceRows(rows);
  await clearBufferedDraftPrices();

  const summary = summarizeDraftPrices(rows, { importedAt, source: 'magento' });
  await kv.set(PRICE_META_KEY, summary);

  const nextStatus = await writeImportStatus({
    ...getImportStatusDefaults(),
    status: 'completed',
    source: 'magento',
    startedAt: status.startedAt || importedAt,
    importedAt,
    completedAt: new Date().toISOString(),
    totalMagentoProducts: status.totalMagentoProducts || 0,
    totalPages: status.totalPages || 0,
    currentPage: (status.totalPages || 0) + 1,
    processedPages: status.totalPages || 0,
    matchedRows: rows.length,
    valid: summary.valid,
    invalid: summary.invalid,
    pagesPerStep: status.pagesPerStep || DISCOUNT_IMPORT_PAGES_PER_STEP,
    resumePage: null,
    lastBatchPages: status.lastBatchPages || [],
    lastStepMs: status.lastStepMs || null,
    lastError: null,
  });

  return { status: nextStatus, summary };
}

function parseDelimitedLine(line: string) {
  const delimiter = line.includes('\t') ? '\t' : line.includes(';') ? ';' : ',';
  return line.split(delimiter).map((part) => part.trim());
}

function parseAdditionalImportText(text: string) {
  const lines = String(text || '')
    .split(/\r?\n/g)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return {
      validRows: [] as Array<{ sku: string; additionalDiscountPercent: number }>,
      invalidRows: [] as Array<{ line: number; reason: string; raw: string }>,
    };
  }

  const firstColumns = parseDelimitedLine(lines[0]).map((value) => value.toLowerCase());
  const hasHeader = firstColumns.includes('sku') || firstColumns.includes('desconto') || firstColumns.includes('desconto_adicional');
  const validMap = new Map<string, { sku: string; additionalDiscountPercent: number }>();
  const invalidRows: Array<{ line: number; reason: string; raw: string }> = [];

  for (let index = hasHeader ? 1 : 0; index < lines.length; index++) {
    const rawLine = lines[index];
    const columns = parseDelimitedLine(rawLine);
    if (columns.length < 2) {
      invalidRows.push({ line: index + 1, reason: 'Linha sem SKU e desconto', raw: rawLine });
      continue;
    }

    const sku = normalizeSku(columns[0]);
    const additionalDiscountPercent = parsePercent(columns[1]?.replace('%', ''));

    if (!sku) {
      invalidRows.push({ line: index + 1, reason: 'SKU invalido', raw: rawLine });
      continue;
    }
    if (additionalDiscountPercent == null) {
      invalidRows.push({ line: index + 1, reason: 'Desconto adicional invalido', raw: rawLine });
      continue;
    }

    validMap.set(sku, { sku, additionalDiscountPercent });
  }

  return {
    validRows: Array.from(validMap.values()),
    invalidRows,
  };
}

async function fetchMagentoPriceRows(siteSkuSet: Set<string>) {
  const importedAt = new Date().toISOString();
  const matchedRows = new Map<string, DraftPriceRow>();
  const magentoFields = 'items[sku,price,special_price,custom_attributes[attribute_code,value]],total_count';

  try {
    const countResponse = await fetchMagento('/V1/products', {
      'searchCriteria[pageSize]': '1',
      'searchCriteria[currentPage]': '1',
      'fields': 'items[sku],total_count',
    });

    const totalCount = Number(countResponse?.total_count || 0);
    const totalPages = Math.max(1, Math.ceil(totalCount / MAGENTO_PAGE_SIZE));

    for (let page = 1; page <= totalPages; page += MAGENTO_PARALLEL_PAGES) {
      const pages = Array.from(
        { length: Math.min(MAGENTO_PARALLEL_PAGES, totalPages - page + 1) },
        (_, offset) => page + offset,
      );

      const batchResponses = await Promise.all(
        pages.map((currentPage) =>
          fetchMagento('/V1/products', {
            'searchCriteria[pageSize]': String(MAGENTO_PAGE_SIZE),
            'searchCriteria[currentPage]': String(currentPage),
            'fields': magentoFields,
          }),
        ),
      );

      const batchCandidates = new Map<string, { sku: string; price: number; specialPrice: number | null }>();
      for (const response of batchResponses) {
        const items = Array.isArray(response?.items) ? response.items : [];
        for (const item of items) {
          const sku = normalizeSku(item?.sku);
          if (!sku || !siteSkuSet.has(sku)) continue;
          const price = parseMoney(item?.price) || 0;
          const specialPrice = readSpecialPrice(item);
          batchCandidates.set(sku, { sku, price, specialPrice });
        }
      }

      if (batchCandidates.size === 0) continue;

      const siteSkuMatches = await listExistingProductSkus(Array.from(batchCandidates.keys()));

      for (const candidate of batchCandidates.values()) {
        if (!siteSkuMatches.has(candidate.sku)) continue;
        const specialPrice = resolveImportedSpecialPrice(
          candidate.price,
          candidate.specialPrice,
          null,
        );
        matchedRows.set(candidate.sku, buildDraftPriceRow(candidate.sku, candidate.price, specialPrice, importedAt, 'magento'));
      }
    }

    if (matchedRows.size > 0) {
      return {
        rows: Array.from(matchedRows.values()).sort((left, right) => left.sku.localeCompare(right.sku)),
        importedAt,
        source: 'magento' as const,
      };
    }
  } catch (error) {
    console.warn('[discounts/import-magento] fallback to catalog cache:', error);
  }

  const products = await loadSiteProducts();
  const fallbackRows = products
    .map((product) => {
      const sku = normalizeSku(product?.sku);
      if (!sku) return null;
      const price = parseMoney(product?.price) || 0;
      const specialPrice = readMagentoSpecialPrice(product);
      return buildDraftPriceRow(sku, price, specialPrice, importedAt, 'catalog_cache_fallback');
    })
    .filter((row): row is DraftPriceRow => !!row);

  return {
    rows: fallbackRows.sort((left, right) => left.sku.localeCompare(right.sku)),
    importedAt,
    source: 'catalog_cache_fallback' as const,
  };
}

async function replaceDraftPriceRows(rows: DraftPriceRow[]) {
  const existingRows = await listKvEntries(DRAFT_PRICE_PREFIX);
  const nextKeys = new Set(rows.map((row) => `${DRAFT_PRICE_PREFIX}${row.sku}`));
  const keysToDelete = existingRows.map((row) => row.key).filter((key) => !nextKeys.has(key));

  if (rows.length > 0) {
    await upsertKvEntries(rows.map((row) => ({
      key: `${DRAFT_PRICE_PREFIX}${row.sku}`,
      value: row,
    })));
  }

  if (keysToDelete.length > 0) {
    await deleteKvKeys(keysToDelete);
  }
}

function ensureSpecialPriceMetadata(customAttributes: any[], effectiveSpecialPrice: number | null) {
  let next = cloneCustomAttributes({ custom_attributes: customAttributes });
  if (effectiveSpecialPrice != null && effectiveSpecialPrice > 0) {
    next = upsertCustomAttribute(next, 'special_price', String(effectiveSpecialPrice));
    next = upsertCustomAttribute(next, 'special_from_date', '2020-01-01 00:00:00');
    next = upsertCustomAttribute(next, 'special_to_date', '2099-12-31 23:59:59');
    return next;
  }

  next = removeCustomAttribute(next, 'special_price');
  next = removeCustomAttribute(next, 'special_from_date');
  next = removeCustomAttribute(next, 'special_to_date');
  return next;
}

async function applyPublishedDiscountsToSite(
  draftPriceMap: Map<string, DraftPriceRow>,
  currentPublishedMap: Map<string, PublishedDiscountRow>,
  desiredPublishedMap: Map<string, PublishedDiscountRow>,
) {
  const affectedSkus = Array.from(new Set([...currentPublishedMap.keys(), ...desiredPublishedMap.keys()]));

  if (affectedSkus.length === 0) {
    return { updated: 0, meiliTaskUid: null as number | null };
  }

  const productRows = await listProductsBySkus(affectedSkus);
  const productMap = new Map(
    productRows.map((row) => [normalizeSku(row.key.replace(PRODUCT_PREFIX, '')), row.value])
  );

  const upserts: Array<{ key: string; value: any }> = [];
  const meiliDocs: any[] = [];
  const snapshotKeys: string[] = [];
  const now = new Date().toISOString();

  for (const sku of affectedSkus) {
    const product = productMap.get(sku);
    if (!product) continue;

    const draftPrice = draftPriceMap.get(sku);
    const currentPublished = currentPublishedMap.get(sku);
    const desiredPublished = desiredPublishedMap.get(sku);

    const nextPrice = draftPrice?.price ?? currentPublished?.price ?? parseMoney(product?.price) ?? 0;
    const nextMagentoSpecial = draftPrice?.special_price
      ?? currentPublished?.magento_special_price
      ?? readMagentoSpecialPrice(product);
    const nextSpecialPrice = desiredPublished?.finalPrice
      ?? (isValidSpecialPrice(nextPrice, nextMagentoSpecial) ? nextMagentoSpecial : null);

    const customAttributes = ensureSpecialPriceMetadata(product?.custom_attributes || [], nextSpecialPrice);
    const hasPromotion = isValidSpecialPrice(nextPrice, nextSpecialPrice);

    const nextProduct = {
      ...product,
      price: nextPrice,
      special_price: hasPromotion ? nextSpecialPrice : null,
      magento_special_price: nextMagentoSpecial,
      discount_current_percent: draftPrice?.currentDiscountPercent ?? currentPublished?.currentDiscountPercent ?? 0,
      discount_additional_percent: desiredPublished?.additionalDiscountPercent ?? 0,
      discount_total_percent: desiredPublished?.totalDiscountPercent ?? calculateCurrentDiscountPercent(nextPrice, nextMagentoSpecial),
      discount_final_price: desiredPublished?.finalPrice ?? (hasPromotion ? nextSpecialPrice : null),
      discount_published_at: desiredPublished?.publishedAt ?? null,
      has_promotion: hasPromotion,
      custom_attributes: customAttributes,
      updated_at: now,
    };

    upserts.push({ key: `${PRODUCT_PREFIX}${sku}`, value: nextProduct });
    snapshotKeys.push(`${SNAPSHOT_PRODUCT_PREFIX}${sku}`);

    const meiliId = meili.sanitizeSku(sku) || sku;
    meiliDocs.push({
      id: meiliId,
      price: nextPrice,
      special_price: hasPromotion ? nextSpecialPrice : null,
      has_promotion: hasPromotion,
    });
  }

  if (upserts.length > 0) {
    await upsertKvEntries(upserts);
  }

  if (snapshotKeys.length > 0) {
    await deleteKvKeys(snapshotKeys).catch(() => {});
  }

  let meiliTaskUid: number | null = null;
  if (meiliDocs.length > 0 && meili.isConfigured()) {
    try {
      const response = await meili.meiliRequest('PUT', '/indexes/toyoparts/documents', meiliDocs, 30000);
      meiliTaskUid = response?.taskUid ?? null;
    } catch (error) {
      console.error('[discounts/publish] Meili partial update failed:', error);
    }
  }

  return { updated: upserts.length, meiliTaskUid };
}

discounts.get('/snapshot', async (c) => {
  try {
    const [draftPrices, draftAdditional, publishedRows, priceMeta, additionalMeta, publishedMeta] = await Promise.all([
      loadDraftPriceRows(),
      loadDraftAdditionalRows(),
      loadPublishedRows(),
      kv.get(PRICE_META_KEY),
      kv.get(ADDITIONAL_META_KEY),
      kv.get(PUBLISHED_META_KEY),
    ]);

    return c.json({
      meta: {
        prices: summarizeDraftPrices(draftPrices, priceMeta || {}),
        additional: summarizeAdditional(draftAdditional, additionalMeta || {}),
        published: summarizePublished(publishedRows, publishedMeta?.publishedAt || null),
      },
      counts: {
        draftPrices: draftPrices.length,
        draftAdditional: draftAdditional.length,
        published: publishedRows.length,
      },
      recentAdditional: draftAdditional
        .slice()
        .sort((left, right) => String(right.updatedAt || '').localeCompare(String(left.updatedAt || '')))
        .slice(0, 25),
    });
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

discounts.get('/import-magento/status', async (c) => {
  try {
    const status = await readImportStatus();
    return c.json(status);
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

discounts.post('/import-magento/reset', async (c) => {
  try {
    await clearBufferedDraftPrices();
    const status = await writeImportStatus(getImportStatusDefaults());
    return c.json({ ok: true, status });
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

discounts.post('/import-magento/start', async (c) => {
  try {
    const force = c.req.query('force') === '1';
    const currentStatus = await readImportStatus();

    if (currentStatus.status === 'running' && !force) {
      return c.json({ error: 'Importacao ja em andamento', status: currentStatus }, 409);
    }

    if (
      !force &&
      currentStatus.status === 'error' &&
      currentStatus.importedAt &&
      (currentStatus.resumePage || currentStatus.currentPage)
    ) {
      const resumed = await writeImportStatus({
        ...currentStatus,
        status: 'running',
        currentPage: currentStatus.resumePage || currentStatus.currentPage || 1,
        pagesPerStep: currentStatus.pagesPerStep || DISCOUNT_IMPORT_PAGES_PER_STEP,
        failedAt: null,
        lastError: null,
      });

      return c.json({
        ok: true,
        message: 'started',
        status: resumed,
      });
    }

    await clearBufferedDraftPrices();

    const importedAt = new Date().toISOString();

    try {
      const countResponse = await fetchMagento('/V1/products', {
        'searchCriteria[pageSize]': '1',
        'searchCriteria[currentPage]': '1',
        'fields': 'items[sku],total_count',
      });

      const totalMagentoProducts = Number(countResponse?.total_count || 0);
      const totalPages = Math.max(1, Math.ceil(totalMagentoProducts / MAGENTO_PAGE_SIZE));

      const status = await writeImportStatus({
        ...getImportStatusDefaults(),
        status: 'running',
        source: 'magento',
        startedAt: importedAt,
        importedAt,
        totalMagentoProducts,
        totalPages,
        currentPage: 1,
        processedPages: 0,
      matchedRows: 0,
      valid: 0,
      invalid: 0,
      pagesPerStep: DISCOUNT_IMPORT_PAGES_PER_STEP,
      resumePage: 1,
      lastBatchPages: [],
      lastStepMs: null,
        lastError: null,
      });

      return c.json({
        ok: true,
        message: 'started',
        status,
      });
    } catch (error: any) {
      const fallback = await buildFallbackPriceImportStatus(error?.message || 'Magento indisponivel');
      return c.json({
        ok: true,
        message: 'completed',
        status: fallback.status,
        summary: fallback.summary,
      });
    }
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

discounts.post('/import-magento/step', async (c) => {
  const live = await readImportStatus();
  const magentoFields = 'items[sku,price,special_price,custom_attributes[attribute_code,value]],total_count';

  try {
    if (live.status !== 'running' || !live.importedAt) {
      return c.json({ error: 'Nenhuma importacao em andamento', status: live }, 400);
    }

    const currentPage = Math.max(1, live.currentPage || live.resumePage || 1);
    const totalPages = Math.max(1, live.totalPages || 1);

    if (currentPage > totalPages) {
      const finalized = await finalizeMagentoDraftImport(live);
      return c.json({
        ok: true,
        message: 'completed',
        status: finalized.status,
        summary: finalized.summary,
      });
    }

    const pages = Array.from(
      { length: Math.min(live.pagesPerStep || MAGENTO_PARALLEL_PAGES, totalPages - currentPage + 1) },
      (_, offset) => currentPage + offset,
    );

    const stepStartedAt = Date.now();
    const batchResponses = await Promise.all(
      pages.map((page) =>
        fetchMagento('/V1/products', {
          'searchCriteria[pageSize]': String(MAGENTO_PAGE_SIZE),
          'searchCriteria[currentPage]': String(page),
          'fields': magentoFields,
        })
      ),
    );

    const batchCandidates = new Map<string, { sku: string; price: number; specialPrice: number | null }>();
    for (const response of batchResponses) {
      const items = Array.isArray(response?.items) ? response.items : [];
      for (const item of items) {
        const sku = normalizeSku(item?.sku);
        if (!sku) continue;
        const price = parseMoney(item?.price) || 0;
        const specialPrice = readSpecialPrice(item);
        batchCandidates.set(sku, { sku, price, specialPrice });
      }
    }

    const siteSkuMatches = await listExistingProductSkus(Array.from(batchCandidates.keys()));

    const batchRows = Array.from(batchCandidates.values())
      .filter((candidate) => siteSkuMatches.has(candidate.sku))
      .map((candidate) =>
        buildDraftPriceRow(
          candidate.sku,
          candidate.price,
          resolveImportedSpecialPrice(candidate.price, candidate.specialPrice, null),
          live.importedAt as string,
          'magento',
        )
      );

    if (batchRows.length > 0) {
      await upsertKvEntries(batchRows.map((row) => ({
        key: `${PRICE_IMPORT_BUFFER_PREFIX}${row.sku}`,
        value: row,
      })), 100);
    }

    const stepMs = Date.now() - stepStartedAt;
    const valid = batchRows.filter((row) => row.status === 'ready').length;
    const invalid = batchRows.length - valid;
    const nextPage = currentPage + pages.length;

    const nextStatusBase: PriceImportStatus = {
      ...live,
      status: 'running',
      source: 'magento',
      processedPages: Math.min(totalPages, (live.processedPages || 0) + pages.length),
      currentPage: nextPage,
      matchedRows: (live.matchedRows || 0) + batchRows.length,
      valid: (live.valid || 0) + valid,
      invalid: (live.invalid || 0) + invalid,
      resumePage: nextPage <= totalPages ? nextPage : null,
      lastBatchPages: pages,
      lastStepMs: stepMs,
      lastError: null,
    };

    if (nextPage > totalPages) {
      const finalized = await finalizeMagentoDraftImport(nextStatusBase);
      return c.json({
        ok: true,
        message: 'completed',
        status: finalized.status,
        summary: finalized.summary,
        step: {
          pages,
          matchedRows: batchRows.length,
          valid,
          invalid,
          stepMs,
        },
      });
    }

    const nextStatus = await writeImportStatus(nextStatusBase);
    return c.json({
      ok: true,
      message: 'step_done',
      status: nextStatus,
      step: {
        pages,
        matchedRows: batchRows.length,
        valid,
        invalid,
        stepMs,
      },
    });
  } catch (error: any) {
    const failedStatus = await writeImportStatus({
      ...live,
      status: 'error',
      failedAt: new Date().toISOString(),
      resumePage: live.currentPage || live.resumePage || 1,
      lastError: error.message,
    });
    return c.json({ error: error.message, status: failedStatus }, 500);
  }
});

discounts.post('/import-magento', async (c) => {
  try {
    const siteSkuSet = await loadSiteSkuSet();
    if (siteSkuSet.size === 0) {
      return c.json({ error: 'Nao foi possivel encontrar SKUs do catalogo do site' }, 400);
    }

    const result = await fetchMagentoPriceRows(siteSkuSet);
    await replaceDraftPriceRows(result.rows);

    const summary = summarizeDraftPrices(result.rows, { importedAt: result.importedAt, source: result.source });
    await kv.set(PRICE_META_KEY, summary);

    return c.json({
      ok: true,
      source: result.source,
      importedAt: result.importedAt,
      summary,
    });
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

discounts.post('/import-additional', async (c) => {
  try {
    const body = await c.req.json();
    const parsed = parseAdditionalImportText(body?.text || '');
    const draftPrices = await loadDraftPriceRows();
    const draftPriceSet = new Set(draftPrices.map((row) => row.sku));
    const siteSkuSet = await loadSiteSkuSet();
    const now = new Date().toISOString();

    const validRows: DraftAdditionalRow[] = [];
    const keysToRemove: string[] = [];
    const invalidRows = [...parsed.invalidRows];

    for (const row of parsed.validRows) {
      if (!draftPriceSet.has(row.sku) && !siteSkuSet.has(row.sku)) {
        invalidRows.push({
          line: 0,
          reason: 'SKU nao existe no snapshot de precos nem no catalogo',
          raw: `${row.sku},${row.additionalDiscountPercent}`,
        });
        continue;
      }

      if (row.additionalDiscountPercent <= 0) {
        keysToRemove.push(`${DRAFT_ADDITIONAL_PREFIX}${row.sku}`);
        continue;
      }
      validRows.push({
        sku: row.sku,
        additionalDiscountPercent: row.additionalDiscountPercent,
        updatedAt: now,
        source: 'csv',
      });
    }

    if (validRows.length > 0) {
      await upsertKvEntries(validRows.map((row) => ({
        key: `${DRAFT_ADDITIONAL_PREFIX}${row.sku}`,
        value: row,
      })));
    }
    if (keysToRemove.length > 0) {
      await deleteKvKeys(Array.from(new Set(keysToRemove)));
    }

    await kv.set(ADDITIONAL_META_KEY, {
      importedAt: now,
      total: validRows.length,
      source: 'csv',
      rejectedCount: invalidRows.length,
    });

    return c.json({
      ok: true,
      importedAt: now,
      appliedCount: validRows.length,
      invalidRows,
    });
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

discounts.post('/upsert-sku', async (c) => {
  try {
    const body = await c.req.json();
    const sku = normalizeSku(body?.sku);
    const additionalDiscountPercent = parsePercent(body?.additionalDiscountPercent);

    if (!sku) return c.json({ error: 'SKU obrigatorio' }, 400);
    if (additionalDiscountPercent == null) return c.json({ error: 'Desconto adicional invalido' }, 400);

    const siteSkuSet = await loadSiteSkuSet();
    const draftPriceRows = await loadDraftPriceRows();
    const hasDraftPrice = draftPriceRows.some((row) => row.sku === sku);

    if (!hasDraftPrice && !siteSkuSet.has(sku)) {
      return c.json({ error: 'SKU nao encontrado no catalogo' }, 404);
    }

    if (additionalDiscountPercent <= 0) {
      await kv.del(`${DRAFT_ADDITIONAL_PREFIX}${sku}`).catch(() => {});
      return c.json({ ok: true, sku, removed: true });
    }

    const row: DraftAdditionalRow = {
      sku,
      additionalDiscountPercent,
      updatedAt: new Date().toISOString(),
      source: 'manual',
    };
    await kv.set(`${DRAFT_ADDITIONAL_PREFIX}${sku}`, row);

    const existingMeta = await kv.get(ADDITIONAL_META_KEY);
    await kv.set(ADDITIONAL_META_KEY, {
      ...(existingMeta || {}),
      importedAt: row.updatedAt,
      source: 'manual',
    });

    return c.json({ ok: true, row });
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

discounts.get('/results', async (c) => {
  try {
    const q = normalizeSku(c.req.query('q') || '');
    const statusFilter = String(c.req.query('status') || 'all');
    const limit = Math.min(Number(c.req.query('limit') || '50') || 50, 500);
    const offset = Math.max(Number(c.req.query('offset') || '0') || 0, 0);

    const [draftPrices, draftAdditional, publishedRows] = await Promise.all([
      loadDraftPriceRows(),
      loadDraftAdditionalRows(),
      loadPublishedRows(),
    ]);

    const additionalMap = new Map(draftAdditional.map((row) => [row.sku, row]));
    const publishedMap = new Map(publishedRows.map((row) => [row.sku, row]));

    const rows = draftPrices
      .map((priceRow) =>
        buildResultRow(
          priceRow,
          additionalMap.get(priceRow.sku)?.additionalDiscountPercent || 0,
          publishedMap.get(priceRow.sku),
        )
      )
      .filter((row) => !q || row.sku.includes(q))
      .filter((row) => statusFilter === 'all' || row.status === statusFilter)
      .sort((left, right) => {
        const priority: Record<DiscountStatus, number> = {
          pronto_para_publicar: 0,
          publicacao_pendente_reversao: 1,
          desconto_publicado: 2,
          sem_desconto_adicional: 3,
          sem_special_price_valido: 4,
        };
        return priority[left.status] - priority[right.status] || left.sku.localeCompare(right.sku);
      });

    return c.json({
      rows: rows.slice(offset, offset + limit),
      total: rows.length,
      limit,
      offset,
      hasMore: offset + limit < rows.length,
      summary: {
        total: rows.length,
        eligible: rows.filter((row) => row.status !== 'sem_special_price_valido').length,
        invalid: rows.filter((row) => row.status === 'sem_special_price_valido').length,
        changed: rows.filter((row) => row.status === 'pronto_para_publicar' || row.status === 'publicacao_pendente_reversao').length,
        published: rows.filter((row) => row.status === 'desconto_publicado').length,
      },
    });
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

discounts.get('/export', async (c) => {
  try {
    const kind = c.req.query('kind') || 'results';
    const [draftPrices, draftAdditional, publishedRows] = await Promise.all([
      loadDraftPriceRows(),
      loadDraftAdditionalRows(),
      loadPublishedRows(),
    ]);

    if (kind === 'prices') {
      const lines = [
        'sku,price,special_price,desconto_atual_percent,status',
        ...draftPrices.map((row) => [
          csvEscape(row.sku),
          csvEscape(row.price.toFixed(2)),
          csvEscape(row.special_price != null ? row.special_price.toFixed(2) : ''),
          csvEscape(row.currentDiscountPercent.toFixed(2)),
          csvEscape(row.status),
        ].join(',')),
      ];
      return buildCsvResponse('descontos-importar-precos.csv', lines.join('\n'));
    }

    const additionalMap = new Map(draftAdditional.map((row) => [row.sku, row]));
    const publishedMap = new Map(publishedRows.map((row) => [row.sku, row]));
    const resultRows = draftPrices.map((priceRow) =>
      buildResultRow(
        priceRow,
        additionalMap.get(priceRow.sku)?.additionalDiscountPercent || 0,
        publishedMap.get(priceRow.sku),
      )
    );

    const lines = [
      'sku,price,special_price,desconto_atual,desconto_adicional,preco_final,desconto_total,status',
      ...resultRows.map((row) => [
        csvEscape(row.sku),
        csvEscape(row.price.toFixed(2)),
        csvEscape(row.special_price != null ? row.special_price.toFixed(2) : ''),
        csvEscape(row.currentDiscountPercent.toFixed(2)),
        csvEscape(row.additionalDiscountPercent.toFixed(2)),
        csvEscape(row.finalPrice != null ? row.finalPrice.toFixed(2) : ''),
        csvEscape(row.totalDiscountPercent != null ? row.totalDiscountPercent.toFixed(2) : ''),
        csvEscape(row.status),
      ].join(',')),
    ];

    return buildCsvResponse('descontos-resultado.csv', lines.join('\n'));
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

discounts.post('/publish', async (c) => {
  try {
    const draftPrices = await loadDraftPriceRows();
    if (draftPrices.length === 0) {
      return c.json({ error: 'Importe os precos do Magento antes de publicar' }, 400);
    }

    const [draftAdditional, currentPublished] = await Promise.all([
      loadDraftAdditionalRows(),
      loadPublishedRows(),
    ]);

    const draftPriceMap = new Map(draftPrices.map((row) => [row.sku, row]));
    const currentPublishedMap = new Map(currentPublished.map((row) => [row.sku, row]));
    const desiredPublishedMap = new Map<string, PublishedDiscountRow>();
    const publishedAt = new Date().toISOString();

    for (const additionalRow of draftAdditional) {
      const priceRow = draftPriceMap.get(additionalRow.sku);
      if (!priceRow || priceRow.status !== 'ready' || additionalRow.additionalDiscountPercent <= 0) continue;
      desiredPublishedMap.set(
        additionalRow.sku,
        buildPublishedDiscountRow(priceRow, additionalRow.additionalDiscountPercent, publishedAt),
      );
    }

    const publishedEntries = Array.from(desiredPublishedMap.values()).map((row) => ({
      key: `${PUBLISHED_PREFIX}${row.sku}`,
      value: row,
    }));
    const keysToDelete = currentPublished
      .map((row) => row.sku)
      .filter((sku) => !desiredPublishedMap.has(sku))
      .map((sku) => `${PUBLISHED_PREFIX}${sku}`);

    if (publishedEntries.length > 0) {
      await upsertKvEntries(publishedEntries);
    }
    if (keysToDelete.length > 0) {
      await deleteKvKeys(keysToDelete);
    }

    await kv.set(PUBLISHED_META_KEY, {
      publishedAt,
      total: desiredPublishedMap.size,
      totalWithAdditional: desiredPublishedMap.size,
    });

    const siteSync = await applyPublishedDiscountsToSite(draftPriceMap, currentPublishedMap, desiredPublishedMap);

    return c.json({
      ok: true,
      publishedAt,
      publishedCount: desiredPublishedMap.size,
      unpublishedCount: keysToDelete.length,
      updatedProducts: siteSync.updated,
      meiliTaskUid: siteSync.meiliTaskUid,
    });
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});
