// Rede de Pecas Toyota + Enriquecimento IA
import { Hono } from 'npm:hono';
import { createClient } from 'jsr:@supabase/supabase-js@2.49.8';
import * as kv from './kv_store.tsx';
import { fetchMagento } from './magento.tsx';
import * as meili from './meilisearch.tsx';
import { normalizeProductRecord, syncProductIndex } from './product-admin.tsx';

const app = new Hono();

const PRODUCT_PREFIX = 'product:';
const HISTORY_PREFIX = 'history:';
const MEASURE_AUDIT_PREFIX = 'catalogo-medidas-audit:';
const MEASURE_REVIEW_PREFIX = 'catalogo-medidas-review:';
const CATEGORY_ENRICHMENT_AUDIT_PREFIX = 'catalogo-category-enrichment-audit:';
const CATEGORY_ENRICHMENT_MAX_SKUS = 200;
const CATEGORY_ENRICHMENT_CONFIDENCE = 0.7;
const CAT_URL = () => (Deno.env.get('CATALOGO_DB_URL') || '').trim();
const CAT_KEY = () => (Deno.env.get('CATALOGO_DB_API_KEY') || '').trim();
const OPENAI_KEY = () => (Deno.env.get('OPENAI_API_KEY') || '').trim();
const db = () => createClient(
  Deno.env.get('SUPABASE_URL'),
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
);

const MEASURE_FIELDS = ['weight', 'dimensionLength', 'dimensionWidth', 'dimensionHeight'] as const;
type MeasureField = typeof MEASURE_FIELDS[number];

const MEASURE_META: Record<MeasureField, {
  label: string;
  toyotaKey: string;
  toyopartsAttr?: string;
  decimals: number;
}> = {
  weight: { label: 'Peso', toyotaKey: 'weight', decimals: 3 },
  dimensionLength: { label: 'Comprimento', toyotaKey: 'dimensionLength', toyopartsAttr: 'volume_length', decimals: 1 },
  dimensionWidth: { label: 'Largura', toyotaKey: 'dimensionWidth', toyopartsAttr: 'volume_width', decimals: 1 },
  dimensionHeight: { label: 'Altura', toyotaKey: 'dimensionHeight', toyopartsAttr: 'volume_height', decimals: 1 },
};

// ── Fetch generico PostgREST ────────────────────────────────────────────────
async function queryToyota(table: string, params: Record<string, string> = {}) {
  const url = new globalThis.URL(`${CAT_URL()}/rest/v1/${table}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url.toString(), {
    headers: { 'apikey': CAT_KEY(), 'Authorization': `Bearer ${CAT_KEY()}`, 'Content-Type': 'application/json' },
  });
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
  return res.json();
}

async function queryToyotaPartnosExact(partnos: string[]) {
  const unique = [...new Set(partnos.map((p) => String(p || '').trim()).filter(Boolean))];
  if (!unique.length) return [];

  const rows: any[] = [];
  for (let i = 0; i < unique.length; i += 100) {
    const chunk = unique.slice(i, i + 100);
    const inList = chunk.map((c) => `"${c}"`).join(',');
    const batch = await queryToyota('banco_toyoparts', {
      select: '*',
      partno: `in.(${inList})`,
      limit: String(chunk.length),
    });
    if (Array.isArray(batch)) rows.push(...batch);
  }
  return rows;
}

function getCatalogoErrorMessage(error: any): string {
  return String(error?.message || error || '').trim();
}

function isCatalogoStatementTimeout(error: any): boolean {
  const message = getCatalogoErrorMessage(error).toLowerCase();
  return message.includes('57014') || message.includes('statement timeout') || message.includes('canceling statement due to statement timeout');
}

async function queryToyotaPartnosExactSafe(partnos: string[]) {
  const unique = [...new Set(partnos.map((p) => String(p || '').trim()).filter(Boolean))];
  const rows: any[] = [];
  const failed = new Set<string>();
  if (!unique.length) return { rows, failed };

  const chunkSize = 24;
  for (let i = 0; i < unique.length; i += chunkSize) {
    const chunk = unique.slice(i, i + chunkSize);
    try {
      const batch = await queryToyotaPartnosExact(chunk);
      if (Array.isArray(batch)) rows.push(...batch);
      continue;
    } catch (error) {
      console.warn('[category-enrichment] Toyota exact batch fallback:', getCatalogoErrorMessage(error));
      if (!isCatalogoStatementTimeout(error) && chunk.length <= 2) {
        chunk.forEach((code) => failed.add(normalizeSku(code)));
        continue;
      }
    }

    for (const code of chunk) {
      try {
        const single = await queryToyotaPartnosExact([code]);
        if (Array.isArray(single)) rows.push(...single);
      } catch (error) {
        console.warn(`[category-enrichment] Toyota exact single lookup failed for ${code}:`, getCatalogoErrorMessage(error));
        failed.add(normalizeSku(code));
      }
    }
  }

  return { rows, failed };
}

async function collectCategoryEnrichmentCandidatesFallback(limit: number) {
  const supabase = db();
  const selected: string[] = [];
  const seen = new Set<string>();
  const batchSize = 400;
  const maxScannedProducts = 5000;
  const upperBound = `${PRODUCT_PREFIX}\uffff`;
  let cursorKey: string | null = null;
  let scannedProducts = 0;

  while (selected.length < limit && scannedProducts < maxScannedProducts) {
    let query = supabase
      .from('kv_store_1d6e33e0')
      .select('key, value')
      .gte('key', PRODUCT_PREFIX)
      .lt('key', upperBound)
      .order('key', { ascending: true })
      .limit(batchSize);

    if (cursorKey) {
      query = query.gt('key', cursorKey);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    if (!data?.length) break;

    scannedProducts += data.length;
    cursorKey = data[data.length - 1]?.key || null;

    for (const row of data) {
      const product = row?.value;
      const sku = normalizeSku(product?.sku || '');
      if (!sku || seen.has(sku)) continue;

      const isActive = String(product?.status || '') === '1' || product?.status === 1;
      const inStock = resolveInStock(product);
      const categoryIds = extractCategoryIds(product);
      if (!isActive || !inStock || categoryIds.length > 0) continue;

      seen.add(sku);
      selected.push(sku);

      if (selected.length >= limit) break;
    }

    if (!cursorKey) break;
  }

  return {
    skus: selected,
    scanned_products: scannedProducts,
    reached_scan_limit: scannedProducts >= maxScannedProducts,
  };
}

// Lookup cods (column name has slash)
async function queryCodsIn(codes: string[]) {
  if (!codes.length) return [];
  const inList = codes.map(c => `"${c}"`).join(',');
  const url = `${CAT_URL()}/rest/v1/banco_toyoparts_cods?select=*&"models/mod"=in.(${inList})`;
  const res = await fetch(url, {
    headers: { 'apikey': CAT_KEY(), 'Authorization': `Bearer ${CAT_KEY()}`, 'Content-Type': 'application/json' },
  });
  if (!res.ok) { console.error(`[cods] ${res.status}`); return []; }
  return res.json();
}

// Processa COMPATIBILIDADE
function processCompat(raw: string): string[] {
  if (!raw) return [];
  const codes = raw.split(',').map(c => c.trim()).filter(Boolean);
  return [...new Set(codes.map(c => c.length > 5 ? c.slice(0, -5) : c))];
}

// Magento custom attribute helper
function getAttr(product: any, code: string): any {
  return product?.custom_attributes?.find((a: any) => a.attribute_code === code)?.value;
}

export function normalizeSku(value: string): string {
  return String(value || '').toUpperCase().replace(/[\s-]/g, '').trim();
}

function parseNumber(value: any): number | null {
  if (value == null || value === '') return null;
  const normalized = String(value).replace(',', '.').trim();
  const num = Number(normalized);
  return Number.isFinite(num) ? num : null;
}

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function normalizeToyotaMetric(field: MeasureField, rawValue: any): number | null {
  const num = parseNumber(rawValue);
  if (num == null) return null;
  if (field === 'weight') return roundTo(num / 1000, MEASURE_META[field].decimals);
  return roundTo(num / 10, MEASURE_META[field].decimals);
}

function normalizeToyopartsMetric(field: MeasureField, rawValue: any): number | null {
  const num = parseNumber(rawValue);
  if (num == null) return null;
  return roundTo(num, MEASURE_META[field].decimals);
}

function getToyopartsMetric(product: any, field: MeasureField): number | null {
  if (field === 'weight') {
    return normalizeToyopartsMetric(field, product?.weight);
  }
  const attrCode = MEASURE_META[field].toyopartsAttr!;
  return normalizeToyopartsMetric(field, getAttr(product, attrCode));
}

function cloneCustomAttributes(product: any): any[] {
  return Array.isArray(product?.custom_attributes)
    ? product.custom_attributes.map((attr: any) => ({ ...attr }))
    : [];
}

function upsertCustomAttribute(product: any, code: string, value: string) {
  const attrs = cloneCustomAttributes(product);
  const idx = attrs.findIndex((attr: any) => attr?.attribute_code === code);
  if (idx >= 0) {
    attrs[idx] = { ...attrs[idx], value };
  } else {
    attrs.push({ attribute_code: code, value });
  }
  return attrs;
}

function resolveStockPayload(product: any) {
  const stockData = product?.extension_attributes?.stock;
  if (!stockData) return null;
  if (typeof stockData === 'string') {
    try {
      return JSON.parse(stockData);
    } catch {
      return null;
    }
  }
  return stockData;
}

export function resolveInStock(product: any): boolean {
  if (typeof product?.in_stock === 'boolean') return product.in_stock;
  const stock = resolveStockPayload(product);
  const value = stock?.is_in_stock;
  return value === true || value === 1 || value === '1';
}

function resolveQty(product: any): number | null {
  const directQty = parseNumber(product?.qty);
  if (directQty != null) return directQty;
  const stock = resolveStockPayload(product);
  return parseNumber(stock?.qty);
}

function getToyotaMetricPayload(toyotaRecord: any) {
  const raw: Record<MeasureField, any> = {
    weight: toyotaRecord?.weight ?? null,
    dimensionLength: toyotaRecord?.dimensionLength ?? null,
    dimensionWidth: toyotaRecord?.dimensionWidth ?? null,
    dimensionHeight: toyotaRecord?.dimensionHeight ?? null,
  };

  const normalized = {} as Record<MeasureField, number | null>;
  for (const field of MEASURE_FIELDS) {
    normalized[field] = normalizeToyotaMetric(field, raw[field]);
  }

  return { raw, normalized };
}

function getToyopartsMetricPayload(product: any) {
  const current = {} as Record<MeasureField, number | null>;
  for (const field of MEASURE_FIELDS) {
    current[field] = getToyopartsMetric(product, field);
  }
  return { current };
}

function compareMeasureField(field: MeasureField, toyotaRaw: any, toyotaNormalized: number | null, toyopartsValue: number | null, matchEligible: boolean) {
  let status: 'sincronizado' | 'faltando_no_toyoparts' | 'divergente' | 'sem_dado_toyota' = 'sem_dado_toyota';
  let different = false;
  let applyEligible = false;

  if (toyotaNormalized == null) {
    status = 'sem_dado_toyota';
  } else if (toyopartsValue == null) {
    status = 'faltando_no_toyoparts';
    different = true;
    applyEligible = matchEligible;
  } else if (toyotaNormalized === toyopartsValue) {
    status = 'sincronizado';
  } else {
    status = 'divergente';
    different = true;
    applyEligible = matchEligible;
  }

  return {
    key: field,
    label: MEASURE_META[field].label,
    toyotaRaw,
    toyotaNormalized,
    toyopartsValue,
    status,
    different,
    applyEligible,
  };
}

async function findToyotaMatchInfo(sku: string) {
  const requestedSku = String(sku || '').trim();
  const normalizedSku = normalizeSku(requestedSku);
  if (!normalizedSku) {
    return {
      found: false,
      mode: 'none',
      eligible: false,
      requestedSku,
      normalizedSku,
      matchedPartno: null,
      record: null,
    };
  }

  const exactRows = await queryToyotaPartnosExact([requestedSku, normalizedSku]);
  const normalizedExact = exactRows.find((row: any) => normalizeSku(row?.partno) === normalizedSku) || null;
  if (normalizedExact) {
    return {
      found: true,
      mode: normalizedExact.partno === requestedSku ? 'exact' : 'normalized',
      eligible: true,
      requestedSku,
      normalizedSku,
      matchedPartno: normalizedExact.partno,
      record: normalizedExact,
    };
  }

  const fallback = await findToyota(requestedSku);
  if (!fallback) {
    return {
      found: false,
      mode: 'none',
      eligible: false,
      requestedSku,
      normalizedSku,
      matchedPartno: null,
      record: null,
    };
  }

  const eligible = normalizeSku(fallback.partno) === normalizedSku;
  return {
    found: true,
    mode: eligible ? 'normalized' : 'fuzzy',
    eligible,
    requestedSku,
    normalizedSku,
    matchedPartno: fallback.partno,
    record: fallback,
  };
}

function buildMeasureComparison(sku: string, product: any, toyotaMatch: any) {
  const toyotaMetrics = getToyotaMetricPayload(toyotaMatch?.record);
  const toyopartsMetrics = getToyopartsMetricPayload(product);
  const fields = {} as Record<MeasureField, any>;

  let divergentCount = 0;
  let missingCount = 0;
  let syncedCount = 0;
  let noToyotaDataCount = 0;

  for (const field of MEASURE_FIELDS) {
    const fieldComparison = compareMeasureField(
      field,
      toyotaMetrics.raw[field],
      toyotaMetrics.normalized[field],
      toyopartsMetrics.current[field],
      !!toyotaMatch?.eligible,
    );
    fields[field] = fieldComparison;

    if (fieldComparison.status === 'divergente') divergentCount += 1;
    if (fieldComparison.status === 'faltando_no_toyoparts') missingCount += 1;
    if (fieldComparison.status === 'sincronizado') syncedCount += 1;
    if (fieldComparison.status === 'sem_dado_toyota') noToyotaDataCount += 1;
  }

  const applicableFields = MEASURE_FIELDS.filter((field) => fields[field].applyEligible);
  const diffFields = MEASURE_FIELDS.filter((field) => fields[field].status === 'divergente');
  const missingFields = MEASURE_FIELDS.filter((field) => fields[field].status === 'faltando_no_toyoparts');

  return {
    sku,
    productName: product?.name || '',
    match: {
      found: !!toyotaMatch?.found,
      mode: toyotaMatch?.mode || 'none',
      eligible: !!toyotaMatch?.eligible,
      requestedSku: toyotaMatch?.requestedSku || sku,
      matchedPartno: toyotaMatch?.matchedPartno || null,
    },
    toyota: toyotaMetrics,
    toyoparts: toyopartsMetrics,
    fields,
    summary: {
      divergentCount,
      missingCount,
      syncedCount,
      noToyotaDataCount,
      applicableFieldCount: applicableFields.length,
      applicableFields,
      diffFields,
      missingFields,
      hasDifferences: diffFields.length > 0 || missingFields.length > 0,
      canApply: !!toyotaMatch?.eligible && applicableFields.length > 0,
    },
  };
}

function resolveBulkRowStatus(comparison: any): 'pending' | 'synced' | 'sem_match' {
  if (!comparison?.match?.eligible) return 'sem_match';
  return comparison?.summary?.hasDifferences ? 'pending' : 'synced';
}

function buildMeasureComparisonSignature(comparison: any) {
  return JSON.stringify({
    matchStatus: comparison?.match?.eligible ? 'elegivel' : (comparison?.match?.found ? 'fuzzy' : 'sem_match'),
    matchedPartno: comparison?.match?.matchedPartno || null,
    rowStatus: resolveBulkRowStatus(comparison),
    toyota: comparison?.toyota?.normalized || {},
    toyoparts: comparison?.toyoparts?.current || {},
  });
}

function getMeasureReviewKey(sku: string) {
  return `${MEASURE_REVIEW_PREFIX}${String(sku || '').trim()}`;
}

function buildMeasureReviewState(review: any, comparison: any) {
  if (!review) {
    return {
      reviewed: false,
      reviewStillValid: false,
      reviewedAt: null,
      reviewedBy: null,
    };
  }

  const signature = buildMeasureComparisonSignature(comparison);
  const reviewStillValid = review?.comparisonSignature === signature;

  return {
    reviewed: true,
    reviewStillValid,
    reviewedAt: review?.reviewedAt || null,
    reviewedBy: review?.reviewedBy || null,
  };
}

async function loadMeasureReviewMap() {
  const reviews = await kv.getByPrefix(MEASURE_REVIEW_PREFIX) || [];
  const map = new Map<string, any>();
  for (const review of reviews) {
    const sku = String(review?.sku || '').trim();
    if (!sku) continue;
    map.set(sku, review);
  }
  return map;
}

function buildMeasureReviewEntry(c: any, sku: string, comparison: any) {
  return {
    sku,
    reviewedAt: new Date().toISOString(),
    reviewedBy: (c.req.header('X-Admin-Token') || '').slice(0, 8) || null,
    comparisonSignature: buildMeasureComparisonSignature(comparison),
    matchStatus: comparison?.match?.eligible ? 'elegivel' : (comparison?.match?.found ? 'fuzzy' : 'sem_match'),
    matchedPartno: comparison?.match?.matchedPartno || null,
    rowStatus: resolveBulkRowStatus(comparison),
  };
}

function getDefaultFieldsToApply(comparison: any, requestedFields?: string[]) {
  const validRequested = Array.isArray(requestedFields)
    ? requestedFields.filter((field) => MEASURE_FIELDS.includes(field as MeasureField))
    : [];

  if (validRequested.length > 0) {
    return validRequested.filter((field) => comparison?.fields?.[field]?.applyEligible);
  }

  return MEASURE_FIELDS.filter((field) => comparison?.fields?.[field]?.applyEligible);
}

async function persistMeasureUpdate(c: any, sku: string, product: any, comparison: any, requestedFields?: string[]) {
  const fieldsToApply = getDefaultFieldsToApply(comparison, requestedFields);
  if (!fieldsToApply.length) {
    return {
      success: false,
      sku,
      appliedFields: [],
      skipped: true,
      reason: 'Nenhum campo elegivel para aplicar',
    };
  }

  const updatedProduct = {
    ...product,
    custom_attributes: cloneCustomAttributes(product),
    updated_at: new Date().toISOString(),
  };

  const before: Record<string, number | null> = {} as Record<MeasureField, number | null>;
  const after: Record<string, number | null> = {} as Record<MeasureField, number | null>;

  for (const field of MEASURE_FIELDS) {
    before[field] = comparison.toyoparts.current[field];
    after[field] = comparison.toyoparts.current[field];
  }

  for (const field of fieldsToApply) {
    const normalizedValue = comparison.fields[field].toyotaNormalized;
    if (normalizedValue == null) continue;

    after[field] = normalizedValue;
    if (field === 'weight') {
      updatedProduct.weight = normalizedValue;
    } else {
      const attrCode = MEASURE_META[field as MeasureField].toyopartsAttr!;
      updatedProduct.custom_attributes = upsertCustomAttribute(updatedProduct, attrCode, String(normalizedValue));
    }
  }

  const historyTimestamp = Date.now();
  await kv.set(`${HISTORY_PREFIX}${sku}:${historyTimestamp}`, {
    ...product,
    snapshot_at: new Date().toISOString(),
    change_type: 'catalogo_medidas',
  });

  await kv.set(`${PRODUCT_PREFIX}${sku}`, updatedProduct);
  await kv.del(getMeasureReviewKey(sku));

  const auditEntry = {
    id: crypto.randomUUID(),
    sku,
    applied_at: new Date().toISOString(),
    applied_fields: fieldsToApply,
    match: comparison.match,
    before,
    after,
    toyota: {
      raw: comparison.toyota.raw,
      normalized: comparison.toyota.normalized,
    },
    admin_token_prefix: (c.req.header('X-Admin-Token') || '').slice(0, 8) || null,
  };

  await kv.set(`${MEASURE_AUDIT_PREFIX}${historyTimestamp}:${sku}`, auditEntry);

  return {
    success: true,
    sku,
    appliedFields: fieldsToApply,
    before,
    after,
    product: updatedProduct,
    audit: auditEntry,
  };
}

async function buildToyotaExactMap(skus: string[]) {
  const lookupCodes = new Set<string>();
  for (const sku of skus) {
    const trimmed = String(sku || '').trim();
    const normalized = normalizeSku(trimmed);
    if (trimmed) lookupCodes.add(trimmed);
    if (normalized) lookupCodes.add(normalized);
  }

  const rows = await queryToyotaPartnosExact([...lookupCodes]);
  const map = new Map<string, any>();
  for (const row of rows) {
    const normalized = normalizeSku(row?.partno);
    if (normalized && !map.has(normalized)) {
      map.set(normalized, row);
    }
  }
  return map;
}

async function buildToyotaExactMapSafe(skus: string[]) {
  const lookupCodes = new Set<string>();
  for (const sku of skus) {
    const trimmed = String(sku || '').trim();
    const normalized = normalizeSku(trimmed);
    if (trimmed) lookupCodes.add(trimmed);
    if (normalized) lookupCodes.add(normalized);
  }

  const { rows, failed } = await queryToyotaPartnosExactSafe([...lookupCodes]);
  const map = new Map<string, any>();
  for (const row of rows) {
    const normalized = normalizeSku(row?.partno);
    if (normalized && !map.has(normalized)) {
      map.set(normalized, row);
    }
  }

  const failedSkus = new Set<string>();
  for (const sku of skus) {
    const normalized = normalizeSku(sku);
    if (!normalized || map.has(normalized)) continue;
    if (failed.has(normalized) || failed.has(String(sku || '').trim())) {
      failedSkus.add(normalized);
    }
  }

  return { map, failedSkus };
}

function buildBulkMeasureRow(product: any, comparison: any, review?: any) {
  const reviewState = buildMeasureReviewState(review, comparison);
  return {
    sku: product?.sku || '',
    name: product?.name || '',
    inStock: resolveInStock(product),
    qty: resolveQty(product),
    matchStatus: comparison.match.eligible ? 'elegivel' : (comparison.match.found ? 'fuzzy' : 'sem_match'),
    matchedPartno: comparison.match.matchedPartno,
    rowStatus: resolveBulkRowStatus(comparison),
    canApply: comparison.summary.canApply,
    hasDifferences: comparison.summary.hasDifferences,
    divergentFields: comparison.summary.diffFields,
    missingFields: comparison.summary.missingFields,
    applicableFields: comparison.summary.applicableFields,
    current: comparison.toyoparts.current,
    suggested: comparison.toyota.normalized,
    fields: comparison.fields,
    reviewed: reviewState.reviewed,
    reviewStillValid: reviewState.reviewStillValid,
    reviewedAt: reviewState.reviewedAt,
    reviewedBy: reviewState.reviewedBy,
  };
}

// Build category ID → name + path map from KV tree
async function loadCategoryMap(): Promise<{ map: Map<string, { name: string; path: string }>; debug: any }> {
  const map = new Map<string, { name: string; path: string }>();
  const debug: any = { source: 'none', treeFound: false, mapSize: 0 };
  
  try {
    // Try 1: Direct KV get
    let tree: any = null;
    try {
      tree = await kv.get('meta:category_tree');
      debug.kvGetResult = tree ? 'object' : 'null';
      debug.kvGetType = typeof tree;
      if (tree) {
        debug.treeFound = true;
        debug.treeIsArray = Array.isArray(tree);
        debug.treeHasId = tree?.id != null;
        debug.treeHasName = !!tree?.name;
        debug.treeHasChildrenData = Array.isArray(tree?.children_data);
        debug.treeHasChildren = Array.isArray(tree?.children);
        debug.treeKeys = Object.keys(tree).slice(0, 8);
        if (tree.children_data?.length > 0) {
          const first = tree.children_data[0];
          debug.firstChildKeys = Object.keys(first || {}).slice(0, 8);
          debug.firstChildName = first?.name;
          debug.firstChildId = first?.id;
        }
      }
    } catch (e: any) {
      debug.kvGetError = e.message;
    }

    // Try 2: Fallback — fetch from Magento REST API if KV is empty
    if (!tree) {
      try {
        console.log('[loadCategoryMap] KV empty, fetching from Magento /V1/categories...');
        tree = await fetchMagento('/V1/categories');
        debug.source = 'magento_fallback';
        if (tree) {
          debug.treeFound = true;
          // Cache it in KV for next time
          await kv.set('meta:category_tree', tree);
          console.log('[loadCategoryMap] Cached Magento category tree in KV');
        }
      } catch (e: any) {
        debug.magentoFallbackError = e.message;
        console.error('[loadCategoryMap] Magento fallback failed:', e.message);
      }
    }

    if (!tree) {
      debug.source = debug.source || 'empty';
      return { map, debug };
    }

    const walk = (node: any, parentPath: string) => {
      if (!node || node.id == null) return;
      const name = node.name || '';
      const path = parentPath ? `${parentPath} > ${name}` : name;
      if (name) {
        map.set(String(node.id), { name, path });
      }
      const children = node.children_data || node.children || [];
      if (Array.isArray(children)) {
        for (const child of children) {
          walk(child, path);
        }
      }
    };

    if (Array.isArray(tree)) {
      tree.forEach((t: any) => walk(t, ''));
      debug.source = debug.source || 'array';
    } else {
      walk(tree, '');
      debug.source = debug.source || 'object';
    }
    
    debug.mapSize = map.size;
    debug.sampleEntries = [...map.entries()].slice(0, 5).map(([k, v]) => ({ id: k, name: v.name }));
    console.log('[loadCategoryMap] Result:', JSON.stringify(debug));
  } catch (e: any) {
    debug.error = e.message;
    console.error('[loadCategoryMap] Fatal error:', e.message, e.stack);
  }
  return { map, debug };
}

type CategoryOption = {
  id: string;
  name: string;
  path: string;
  normalizedName: string;
  normalizedPath: string;
  tokens: string[];
};

type CategorySuggestion = {
  categoryId: string | null;
  categoryName: string | null;
  categoryPath: string | null;
  confidence: number;
  method: 'regra' | 'similaridade' | 'ia' | 'manual' | 'none';
  reason: string;
  alternatives: Array<{ categoryId: string; categoryName: string; categoryPath: string; confidence: number; reason: string }>;
};

function normalizeSearchText(value: any): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function uniqueList(values: any[]): string[] {
  return [...new Set(values.map((value) => String(value || '').trim()).filter(Boolean))];
}

function tokenizeForCategory(value: any): string[] {
  const stop = new Set(['a', 'as', 'o', 'os', 'de', 'do', 'da', 'dos', 'das', 'e', 'para', 'por', 'com', 'sem', 'toyota', 'peca', 'pecas', 'original', 'genuina', 'genuino']);
  return uniqueList(normalizeSearchText(value).split(' ')
    .map((token) => token.length > 4 && token.endsWith('s') ? token.slice(0, -1) : token)
    .filter((token) => token.length >= 3 && !stop.has(token)));
}

function extractYearsFromText(value: any): string[] {
  const matches = String(value || '').match(/\b(?:19|20)\d{2}\b/g) || [];
  return uniqueList(matches);
}

export async function loadCategoryOptions(): Promise<{ options: CategoryOption[]; map: Map<string, { name: string; path: string }>; debug: any }> {
  const { map, debug } = await loadCategoryMap();
  const options = [...map.entries()]
    .filter(([id, item]) => !['1', '2'].includes(String(id)) && !!item?.name)
    .map(([id, item]) => {
      const normalizedName = normalizeSearchText(item.name);
      const normalizedPath = normalizeSearchText(item.path);
      return {
        id: String(id),
        name: item.name,
        path: item.path,
        normalizedName,
        normalizedPath,
        tokens: tokenizeForCategory(`${item.path} ${item.name}`),
      };
    })
    .filter((option) => option.tokens.length > 0);

  return { options, map, debug };
}

function categoryNamesForIds(ids: string[], categoryMap: Map<string, { name: string; path: string }>) {
  return ids.map((id) => {
    const entry = categoryMap.get(String(id));
    return {
      id: String(id),
      name: entry?.name || `Cat ${id}`,
      path: entry?.path || `Cat ${id}`,
    };
  });
}

function buildToyotaCategoryText(toyota: any): string {
  return [
    toyota?.category,
    toyota?.categoria,
    toyota?.subCategory,
    toyota?.subcategoria,
    toyota?.cat,
    toyota?.description,
  ].filter(Boolean).join(' ');
}

function buildProductCategoryText(product: any, currentCategories: Array<{ id: string; name: string; path: string }>) {
  return [
    product?.sku,
    product?.name,
    getAttr(product, 'short_description'),
    getAttr(product, 'description'),
    getAttr(product, 'meta_keyword'),
    getAttr(product, 'modelo'),
    getAttr(product, 'ano'),
    getAttr(product, 'compatibilidade'),
    currentCategories.map((category) => category.path || category.name || '').join(' '),
  ].filter(Boolean).join(' ');
}

function buildProductFallbackCategoryReference(product: any, currentCategories: Array<{ id: string; name: string; path: string }>) {
  return {
    category: '',
    categoria: '',
    subCategory: '',
    subcategoria: '',
    cat: '',
    description: buildProductCategoryText(product, currentCategories),
  };
}

function relabelSuggestionForProductContext(suggestion: CategorySuggestion): CategorySuggestion {
  const rewrite = (value: any) => String(value || '')
    .replace(/Subcategoria Toyota/gi, 'Termo principal do produto')
    .replace(/Categoria Toyota/gi, 'Contexto do produto')
    .replace(/Similaridade por termos Toyota/gi, 'Similaridade por termos do produto')
    .replace(/e coerencia com categoria atual/gi, 'e coerencia com categorias atuais do site')
    .replace(/coerencia com categoria atual/gi, 'coerencia com categorias atuais do site');

  return {
    ...suggestion,
    reason: rewrite(suggestion.reason),
    alternatives: (suggestion.alternatives || []).map((item) => ({
      ...item,
      reason: rewrite(item.reason),
    })),
  };
}

function scoreCategoryOption(toyota: any, option: CategoryOption, currentCategoryPaths: string[]) {
  const category = normalizeSearchText(toyota?.category || toyota?.categoria || '');
  const subcategory = normalizeSearchText(toyota?.subCategory || toyota?.subcategoria || '');
  const cat = normalizeSearchText(toyota?.cat || '');
  const text = normalizeSearchText(buildToyotaCategoryText(toyota));
  const toyotaTokens = tokenizeForCategory(`${category} ${subcategory} ${cat} ${toyota?.description || ''}`);
  const currentText = normalizeSearchText(currentCategoryPaths.join(' '));

  let confidence = 0;
  let reason = 'Similaridade por termos Toyota';

  if (subcategory && (option.normalizedName === subcategory || option.normalizedPath.endsWith(` ${subcategory}`))) {
    confidence = 0.98;
    reason = 'Subcategoria Toyota igual ao nome/caminho da categoria';
  } else if (category && (option.normalizedName === category || option.normalizedPath.endsWith(` ${category}`))) {
    confidence = 0.94;
    reason = 'Categoria Toyota igual ao nome/caminho da categoria';
  } else if (subcategory && option.normalizedPath.includes(subcategory)) {
    confidence = 0.88;
    reason = 'Subcategoria Toyota encontrada no caminho da categoria';
  } else if (category && option.normalizedPath.includes(category)) {
    confidence = 0.82;
    reason = 'Categoria Toyota encontrada no caminho da categoria';
  } else {
    const optionTokenSet = new Set(option.tokens);
    const overlap = toyotaTokens.filter((token) => optionTokenSet.has(token)).length;
    const base = toyotaTokens.length > 0 ? overlap / toyotaTokens.length : 0;
    confidence = Math.min(0.78, base * 0.75);
    if (text && option.normalizedPath.includes(text)) confidence = Math.max(confidence, 0.72);
  }

  if (currentText && option.normalizedPath && currentText.includes(option.normalizedName)) {
    confidence = Math.min(0.99, confidence + 0.05);
    reason += ' e coerencia com categoria atual';
  }

  return { confidence: Math.round(confidence * 100) / 100, reason };
}

function suggestCategoryDeterministic(toyota: any, currentCategories: Array<{ id: string; name: string; path: string }>, options: CategoryOption[]): CategorySuggestion {
  if (!options.length) {
    return {
      categoryId: null,
      categoryName: null,
      categoryPath: null,
      confidence: 0,
      method: 'none',
      reason: 'Arvore de categorias indisponivel',
      alternatives: [],
    };
  }

  const currentPaths = currentCategories.map((category) => category.path || category.name || '');
  const scored = options
    .map((option) => {
      const score = scoreCategoryOption(toyota, option, currentPaths);
      return { option, ...score };
    })
    .sort((a, b) => b.confidence - a.confidence);

  const best = scored[0];
  const method: CategorySuggestion['method'] = best.confidence >= 0.82 ? 'regra' : 'similaridade';
  const alternatives = scored.slice(0, 5).map((item) => ({
    categoryId: item.option.id,
    categoryName: item.option.name,
    categoryPath: item.option.path,
    confidence: item.confidence,
    reason: item.reason,
  }));

  return {
    categoryId: best.option.id,
    categoryName: best.option.name,
    categoryPath: best.option.path,
    confidence: best.confidence,
    method,
    reason: best.reason,
    alternatives,
  };
}

async function suggestCategoryWithAI(toyota: any, product: any, candidates: CategorySuggestion): Promise<CategorySuggestion | null> {
  if (!OPENAI_KEY() || !candidates.alternatives.length) return null;

  try {
    const allowed = candidates.alternatives.map((item) => ({
      id: item.categoryId,
      path: item.categoryPath,
      confidence_regra: item.confidence,
    }));

    const prompt = `Escolha a melhor categoria EXISTENTE da Toyoparts para uma peca Toyota.
Retorne apenas JSON valido, sem markdown.

Produto Toyoparts:
SKU: ${product?.sku || ''}
Nome: ${product?.name || ''}

Dados Toyota:
Categoria: ${toyota?.category || toyota?.categoria || ''}
Subcategoria: ${toyota?.subCategory || toyota?.subcategoria || ''}
Familia/Cat: ${toyota?.cat || ''}
Descricao: ${toyota?.description || ''}

Categorias permitidas:
${JSON.stringify(allowed)}

Retorne:
{"categoryId":"id permitido","confidence":0.80,"reason":"motivo curto"}`;

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${OPENAI_KEY()}` },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: 'Voce so pode escolher uma categoryId da lista permitida. Nunca invente categorias.' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.1,
      }),
    });

    if (!res.ok) return null;
    const json = await res.json();
    const raw = String(json.choices?.[0]?.message?.content || '').replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    const parsed = JSON.parse(raw);
    const chosen = candidates.alternatives.find((item) => item.categoryId === String(parsed?.categoryId || ''));
    if (!chosen) return null;

    return {
      ...candidates,
      categoryId: chosen.categoryId,
      categoryName: chosen.categoryName,
      categoryPath: chosen.categoryPath,
      confidence: Math.max(0, Math.min(0.95, Number(parsed?.confidence) || chosen.confidence)),
      method: 'ia',
      reason: String(parsed?.reason || 'Categoria escolhida por IA entre categorias existentes'),
    };
  } catch (error) {
    console.warn('[category-enrichment] AI category fallback skipped:', error);
    return null;
  }
}

async function suggestCategoryWithAIFromProduct(product: any, currentCategories: Array<{ id: string; name: string; path: string }>, candidates: CategorySuggestion): Promise<CategorySuggestion | null> {
  if (!OPENAI_KEY() || !candidates.alternatives.length) return null;

  try {
    const allowed = candidates.alternatives.map((item) => ({
      id: item.categoryId,
      path: item.categoryPath,
      confidence_regra: item.confidence,
    }));

    const prompt = `Escolha a melhor categoria EXISTENTE da Toyoparts para um produto, usando apenas as categorias permitidas.
Retorne apenas JSON valido, sem markdown.

Produto Toyoparts:
SKU: ${product?.sku || ''}
Nome: ${product?.name || ''}
Descricao curta: ${getAttr(product, 'short_description') || ''}
Descricao completa: ${getAttr(product, 'description') || ''}
Modelo: ${getAttr(product, 'modelo') || ''}
Ano: ${getAttr(product, 'ano') || ''}
Compatibilidade: ${getAttr(product, 'compatibilidade') || ''}
Categorias atuais: ${currentCategories.map((item) => item.path || item.name || '').join(' | ')}

Categorias permitidas:
${JSON.stringify(allowed)}

Retorne:
{"categoryId":"id permitido","confidence":0.80,"reason":"motivo curto"}`;

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${OPENAI_KEY()}` },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: 'Voce so pode escolher uma categoryId da lista permitida. Nunca invente categorias.' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.1,
      }),
    });

    if (!res.ok) return null;
    const json = await res.json();
    const raw = String(json.choices?.[0]?.message?.content || '').replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    const parsed = JSON.parse(raw);
    const chosen = candidates.alternatives.find((item) => item.categoryId === String(parsed?.categoryId || ''));
    if (!chosen) return null;

    return {
      ...candidates,
      categoryId: chosen.categoryId,
      categoryName: chosen.categoryName,
      categoryPath: chosen.categoryPath,
      confidence: Math.max(0, Math.min(0.95, Number(parsed?.confidence) || chosen.confidence)),
      method: 'ia',
      reason: String(parsed?.reason || 'Categoria escolhida por IA com base no contexto do produto'),
    };
  } catch (error) {
    console.warn('[category-enrichment] AI product category fallback skipped:', error);
    return null;
  }
}

async function buildCompatibilityRows(records: any[]) {
  const codeSet = new Set<string>();
  for (const record of records) {
    const rawCompat = record?.COMPATIBILIDADE || record?.compatibilidade || '';
    processCompat(rawCompat).forEach((code) => codeSet.add(code));
  }

  const codeList = [...codeSet].slice(0, 500);
  const rows: any[] = [];
  for (let i = 0; i < codeList.length; i += 80) {
    const chunk = codeList.slice(i, i + 80);
    try {
      const batch = await queryCodsIn(chunk);
      if (Array.isArray(batch)) rows.push(...batch);
    } catch (error) {
      console.warn('[category-enrichment] compatibility lookup skipped:', error);
    }
  }

  const map = new Map<string, any[]>();
  for (const row of rows) {
    const code = String(row?.['models/mod'] || '').trim();
    if (!code) continue;
    if (!map.has(code)) map.set(code, []);
    map.get(code)!.push(row);
  }
  return map;
}

function buildToyotaCategoryPayload(record: any, compatibilityRowsByCode: Map<string, any[]>) {
  const rawCompat = record?.COMPATIBILIDADE || record?.compatibilidade || '';
  const codes = processCompat(rawCompat);
  const compatRows = codes.flatMap((code) => compatibilityRowsByCode.get(code) || []);
  const compatLines = uniqueList(compatRows.map((row) => row?.['models/description']));
  const compatModels = compatRows.map((row) => {
    const descricao = String(row?.['models/description'] || '').trim();
    return {
      codigo: String(row?.['models/mod'] || '').trim(),
      descricao,
      modelo: descricao.split(/\s+/)[0] || '',
      anos: extractYearsFromText(descricao),
      trim: '',
      cambio: '',
      motor: '',
    };
  });

  return {
    found: !!record,
    matchedPartno: record?.partno || null,
    cat: record?.cat || '',
    categoria: record?.category || record?.categoria || '',
    subcategoria: record?.subCategory || record?.subcategoria || '',
    name: record?.description || '',
    seo_title: record?.description ? `${record.description} - Peca Genuina Toyota ${record?.partno || ''}`.trim() : '',
    description: record?.description || '',
    weight: normalizeToyotaMetric('weight', record?.weight),
    compatibilityCodes: codes,
    compatibilityLines: compatLines,
    compatibilityModels: compatModels,
  };
}

function buildEmptyToyotaCategoryPayload() {
  return {
    found: false,
    matchedPartno: null,
    cat: '',
    categoria: '',
    subcategoria: '',
    name: '',
    seo_title: '',
    description: '',
    weight: null,
    compatibilityCodes: [],
    compatibilityLines: [],
    compatibilityModels: [],
  };
}

function buildCategoryEnrichmentProductPayload(product: any, sku: string, categoryMap: Map<string, { name: string; path: string }>) {
  const categoryIds = extractCategoryIds(product);
  return {
    categoryIds,
    currentCategories: categoryNamesForIds(categoryIds, categoryMap),
    payload: {
      sku: product?.sku || sku,
      name: product?.name || '',
      weight: normalizeToyopartsMetric('weight', product?.weight),
      status: product?.status || 0,
      category_ids: categoryIds,
      category_names: categoryNamesForIds(categoryIds, categoryMap),
      modelo: getAttr(product, 'modelo') || '',
      ano: getAttr(product, 'ano') || '',
      compatibilidade: getAttr(product, 'compatibilidade') || '',
      image_count: product?.media_gallery_entries?.length || product?.media_gallery?.length || 0,
    },
  };
}

async function suggestCategoryFromProductContext(
  product: any,
  currentCategories: Array<{ id: string; name: string; path: string }>,
  options: CategoryOption[],
  useAI: boolean,
  aiCache: Map<string, Promise<CategorySuggestion | null>>,
): Promise<CategorySuggestion> {
  const reference = buildProductFallbackCategoryReference(product, currentCategories);
  let suggestion = relabelSuggestionForProductContext(
    suggestCategoryDeterministic(reference, currentCategories, options),
  );

  if (useAI && suggestion.confidence < CATEGORY_ENRICHMENT_CONFIDENCE && suggestion.alternatives.length > 0 && OPENAI_KEY()) {
    const aiKey = `product:${normalizeSearchText(buildProductCategoryText(product, currentCategories))}`;
    if (!aiCache.has(aiKey)) {
      aiCache.set(aiKey, suggestCategoryWithAIFromProduct(product, currentCategories, suggestion));
    }
    const aiSuggestion = await aiCache.get(aiKey);
    if (aiSuggestion) suggestion = aiSuggestion;
  }

  return suggestion;
}

function buildFieldSuggestions(product: any, toyota: any, suggestion: CategorySuggestion) {
  const currentCategoryIds = extractCategoryIds(product);
  const toyotaWeight = toyota?.weight ?? null;
  const productWeight = normalizeToyopartsMetric('weight', product?.weight);
  const compatibilityText = uniqueList(toyota?.compatibilityLines || []).join('\n');
  const currentCompatibility = String(getAttr(product, 'compatibilidade') || '').trim();
  const modelNames = uniqueList((toyota?.compatibilityModels || []).map((item: any) => item.modelo));
  const years = uniqueList((toyota?.compatibilityModels || []).flatMap((item: any) => item.anos || []));

  return {
    category: {
      label: 'Categoria',
      canApply: !!suggestion.categoryId,
      applyDefault: !!suggestion.categoryId && !currentCategoryIds.includes(String(suggestion.categoryId)) && suggestion.confidence >= CATEGORY_ENRICHMENT_CONFIDENCE,
      current: currentCategoryIds,
      suggested: suggestion.categoryId ? [String(suggestion.categoryId)] : [],
    },
    weight: {
      label: 'Peso',
      canApply: toyotaWeight != null,
      applyDefault: toyotaWeight != null && toyotaWeight !== productWeight,
      current: productWeight,
      suggested: toyotaWeight,
    },
    compatibility: {
      label: 'Compatibilidade Toyota',
      canApply: !!compatibilityText,
      applyDefault: false,
      current: currentCompatibility,
      suggested: compatibilityText,
    },
    modelYear: {
      label: 'Modelo/Ano',
      canApply: modelNames.length > 0 || years.length > 0,
      applyDefault: false,
      current: {
        modelo: getAttr(product, 'modelo') || '',
        ano: getAttr(product, 'ano') || '',
      },
      suggested: {
        modelo: modelNames.join(','),
        ano: years.join(','),
      },
    },
    name: {
      label: 'Nome',
      canApply: !!toyota?.seo_title,
      applyDefault: false,
      current: product?.name || '',
      suggested: toyota?.seo_title || '',
    },
  };
}

export async function buildCategoryEnrichmentRows(inputSkus: string[], useAI = true) {
  const skus = uniqueList(inputSkus.map((sku) => normalizeSku(sku))).slice(0, CATEGORY_ENRICHMENT_MAX_SKUS);
  const { options, map: categoryMap, debug: categoryDebug } = await loadCategoryOptions();
  const products = await Promise.all(skus.map((sku) => kv.get(`${PRODUCT_PREFIX}${sku}`).catch(() => null)));
  const productMap = new Map<string, any>();
  skus.forEach((sku, index) => {
    if (products[index]) productMap.set(sku, products[index]);
  });

  const { map: toyotaMap, failedSkus: failedToyotaLookups } = await buildToyotaExactMapSafe(skus);
  const toyotaRecords = skus.map((sku) => toyotaMap.get(normalizeSku(sku))).filter(Boolean);
  const compatibilityRowsByCode = await buildCompatibilityRows(toyotaRecords);
  const aiCache = new Map<string, Promise<CategorySuggestion | null>>();

  const rows: any[] = [];
  for (const sku of skus) {
    const product = productMap.get(sku);
    const toyotaRecord = toyotaMap.get(normalizeSku(sku)) || null;
    if (!product) {
      const fallbackSuggestion = toyotaRecord
        ? suggestCategoryDeterministic(toyotaRecord, [], options)
        : null;
      rows.push({
        sku,
        status: 'no_product',
        statusLabel: 'Produto nao encontrado',
        productFound: false,
        toyotaFound: !!toyotaRecord,
        product: null,
        toyota: toyotaRecord ? buildToyotaCategoryPayload(toyotaRecord, compatibilityRowsByCode) : { found: false },
        suggestion: fallbackSuggestion,
        fieldSuggestions: {},
      });
      continue;
    }

    const { currentCategories, payload: productPayload } = buildCategoryEnrichmentProductPayload(product, sku, categoryMap);
    if (!toyotaRecord && failedToyotaLookups.has(normalizeSku(sku))) {
      const toyota = buildEmptyToyotaCategoryPayload();
      const suggestion = await suggestCategoryFromProductContext(product, currentCategories, options, useAI, aiCache);
      const fieldSuggestions = buildFieldSuggestions(product, toyota, suggestion);
      rows.push({
        sku,
        status: 'error',
        statusLabel: 'Erro localizado',
        productFound: true,
        toyotaFound: false,
        product: productPayload,
        toyota,
        suggestion,
        fieldSuggestions,
      });
      continue;
    }

    if (!toyotaRecord) {
      const toyota = buildEmptyToyotaCategoryPayload();
      const suggestion = await suggestCategoryFromProductContext(product, currentCategories, options, useAI, aiCache);
      const fieldSuggestions = buildFieldSuggestions(product, toyota, suggestion);
      rows.push({
        sku,
        status: 'no_toyota_match',
        statusLabel: 'Toyota nao encontrou',
        productFound: true,
        toyotaFound: false,
        product: productPayload,
        toyota,
        suggestion,
        fieldSuggestions,
      });
      continue;
    }

    const toyota = buildToyotaCategoryPayload(toyotaRecord, compatibilityRowsByCode);
    let suggestion = suggestCategoryDeterministic(toyotaRecord, currentCategories, options);

    if (useAI && suggestion.confidence < CATEGORY_ENRICHMENT_CONFIDENCE && suggestion.alternatives.length > 0 && OPENAI_KEY()) {
      const aiKey = normalizeSearchText(`${toyota.categoria}|${toyota.subcategoria}|${toyota.cat}|${toyota.name}`);
      if (!aiCache.has(aiKey)) {
        aiCache.set(aiKey, suggestCategoryWithAI(toyotaRecord, product, suggestion));
      }
      const aiSuggestion = await aiCache.get(aiKey);
      if (aiSuggestion) suggestion = aiSuggestion;
    }

    const fieldSuggestions = buildFieldSuggestions(product, toyota, suggestion);
    const hasSafeDiff = fieldSuggestions.category.applyDefault || fieldSuggestions.weight.applyDefault;
    const alreadyCorrect = !hasSafeDiff && suggestion.categoryId && productPayload.category_ids.includes(String(suggestion.categoryId));
    const status = alreadyCorrect
      ? 'already_correct'
      : suggestion.confidence >= CATEGORY_ENRICHMENT_CONFIDENCE && hasSafeDiff
        ? 'ready'
        : 'needs_review';

    rows.push({
      sku,
      status,
      statusLabel: status === 'ready' ? 'Pronto para atualizar' : status === 'already_correct' ? 'Ja esta correto' : 'Precisa revisar',
      productFound: true,
      toyotaFound: true,
      product: productPayload,
      toyota,
      suggestion,
      fieldSuggestions,
    });
  }

  return {
    rows,
    categories: options.map((option) => ({ id: option.id, name: option.name, path: option.path })),
    debug: { category: categoryDebug },
  };
}

function summarizeCategoryEnrichment(rows: any[]) {
  return {
    total: rows.length,
    product_found: rows.filter((row) => row.productFound).length,
    toyota_found: rows.filter((row) => row.toyotaFound).length,
    ready: rows.filter((row) => row.status === 'ready').length,
    needs_review: rows.filter((row) => row.status === 'needs_review').length,
    already_correct: rows.filter((row) => row.status === 'already_correct').length,
    no_product: rows.filter((row) => row.status === 'no_product').length,
    no_toyota_match: rows.filter((row) => row.status === 'no_toyota_match').length,
  };
}

function applyCategoryToDraft(draft: any, categoryId: string) {
  const categoryIds = [String(categoryId)];
  draft.custom_attributes = upsertCustomAttribute(draft, 'category_ids', categoryIds.join(','));
  draft.extension_attributes = {
    ...(draft.extension_attributes || {}),
    category_links: categoryIds.map((id, index) => ({ category_id: id, position: index })),
  };
  draft.category_ids = categoryIds;
}

export async function applyCategoryEnrichmentUpdate(
  c: any,
  update: any,
  categoryOptions: Array<{ id: string; name: string; path: string }>,
  precomputedRow?: any,
) {
  const sku = normalizeSku(update?.sku || '');
  if (!sku) return { sku: '', success: false, error: 'SKU obrigatorio' };

  const fields = Array.isArray(update?.fields) ? uniqueList(update.fields) : [];
  if (!fields.length) return { sku, success: false, error: 'Nenhum campo selecionado' };

  const product = await kv.get(`${PRODUCT_PREFIX}${sku}`);
  if (!product) return { sku, success: false, error: 'Produto nao encontrado' };

  const row = precomputedRow || (await buildCategoryEnrichmentRows([sku], false)).rows?.[0];
  if (!row) return { sku, success: false, error: 'SKU nao elegivel para atualizacao' };
  if (!row?.toyotaFound) {
    const unsupportedFields = fields.filter((field) => field !== 'category');
    if (unsupportedFields.length) {
      return { sku, success: false, error: 'Sem match Toyota: apenas categoria pode ser aplicada neste SKU' };
    }
  }

  const categoryId = String(update?.categoryId || row?.suggestion?.categoryId || '').trim();
  const selectedCategory = categoryOptions.find((category) => category.id === categoryId);
  if (fields.includes('category') && !selectedCategory) {
    return { sku, success: false, error: 'Categoria selecionada nao existe na arvore atual' };
  }

  const before = {
    name: product?.name || '',
    weight: normalizeToyopartsMetric('weight', product?.weight),
    category_ids: extractCategoryIds(product),
    modelo: getAttr(product, 'modelo') || '',
    ano: getAttr(product, 'ano') || '',
    compatibilidade: getAttr(product, 'compatibilidade') || '',
  };

  const draft = {
    ...product,
    custom_attributes: cloneCustomAttributes(product),
    updated_at: new Date().toISOString(),
  };

  const appliedFields: string[] = [];
  if (fields.includes('category') && selectedCategory) {
    applyCategoryToDraft(draft, selectedCategory.id);
    appliedFields.push('category');
  }

  if (fields.includes('weight') && row?.toyota?.weight != null) {
    draft.weight = row.toyota.weight;
    appliedFields.push('weight');
  }

  if (fields.includes('compatibility') && row?.fieldSuggestions?.compatibility?.suggested) {
    draft.custom_attributes = upsertCustomAttribute(draft, 'compatibilidade', String(row.fieldSuggestions.compatibility.suggested));
    appliedFields.push('compatibility');
  }

  if (fields.includes('modelYear') && row?.fieldSuggestions?.modelYear?.suggested) {
    const suggested = row.fieldSuggestions.modelYear.suggested;
    if (suggested.modelo) draft.custom_attributes = upsertCustomAttribute(draft, 'modelo', String(suggested.modelo));
    if (suggested.ano) draft.custom_attributes = upsertCustomAttribute(draft, 'ano', String(suggested.ano));
    appliedFields.push('modelYear');
  }

  if (fields.includes('name') && row?.fieldSuggestions?.name?.suggested) {
    draft.name = String(row.fieldSuggestions.name.suggested);
    appliedFields.push('name');
  }

  if (!appliedFields.length) {
    return { sku, success: false, error: 'Nenhum campo aplicavel para este SKU' };
  }

  const historyTimestamp = Date.now();
  await kv.set(`${HISTORY_PREFIX}${sku}:${historyTimestamp}`, {
    ...product,
    snapshot_at: new Date().toISOString(),
    change_type: 'catalogo_category_enrichment',
  });

  const updatedProduct = await normalizeProductRecord(draft, product);
  await kv.set(`${PRODUCT_PREFIX}${sku}`, updatedProduct);
  await syncProductIndex(updatedProduct);

  const after = {
    name: updatedProduct?.name || '',
    weight: normalizeToyopartsMetric('weight', updatedProduct?.weight),
    category_ids: extractCategoryIds(updatedProduct),
    modelo: getAttr(updatedProduct, 'modelo') || '',
    ano: getAttr(updatedProduct, 'ano') || '',
    compatibilidade: getAttr(updatedProduct, 'compatibilidade') || '',
  };

  const auditEntry = {
    id: crypto.randomUUID(),
    sku,
    applied_at: new Date().toISOString(),
    applied_fields: appliedFields,
    before,
    after,
    selected_category: selectedCategory || null,
    suggestion: row?.suggestion || null,
    toyota: row?.toyota || null,
    admin_token_prefix: (c?.req?.header?.('X-Admin-Token') || '').slice(0, 8) || null,
  };

  await kv.set(`${CATEGORY_ENRICHMENT_AUDIT_PREFIX}${historyTimestamp}:${sku}`, auditEntry);

  return {
    sku,
    success: true,
    appliedFields,
    before,
    after,
    audit: auditEntry,
    product: updatedProduct,
  };
}

// Buscar produto Toyota por partno (com fallback)
async function findToyota(partno: string) {
  let rows = await queryToyota('banco_toyoparts', { select: '*', partno: `eq.${partno}`, limit: '1' });
  if (!rows.length) {
    const norm = partno.replace(/[-\s]/g, '');
    if (norm !== partno) rows = await queryToyota('banco_toyoparts', { select: '*', partno: `eq.${norm}`, limit: '1' });
  }
  if (!rows.length) {
    const norm = partno.replace(/[-\s]/g, '');
    rows = await queryToyota('banco_toyoparts', { select: '*', partno: `ilike.*${norm}*`, limit: '3' });
  }
  return rows[0] || null;
}

// ── GET /ping ──
app.get('/ping', (c) => c.json({ ok: true, ts: new Date().toISOString() }));

// ── GET /diagnostico ──
app.get('/diagnostico', async (c) => {
  try {
    const main = await queryToyota('banco_toyoparts', { select: '*', limit: '2' });
    const cods = await queryToyota('banco_toyoparts_cods', { select: '*', limit: '2' });
    return c.json({
      ok: true,
      banco_toyoparts: { rows: main.length, cols: main[0] ? Object.keys(main[0]) : [] },
      banco_toyoparts_cods: { rows: cods.length, cols: cods[0] ? Object.keys(cods[0]) : [] },
    });
  } catch (e: any) {
    return c.json({ ok: false, error: e.message }, 500);
  }
});

// ── GET /buscar?partno=XXX ──
app.get('/buscar', async (c) => {
  const partno = (c.req.query('partno') || '').trim();
  if (!partno) return c.json({ found: false, error: 'partno obrigatorio' }, 400);
  try {
    const product = await findToyota(partno);
    if (!product) return c.json({ found: false, partno, message: 'Nao encontrado' });

    const rawCompat = product.COMPATIBILIDADE || product.compatibilidade || '';
    const codes = processCompat(rawCompat);
    const compatibilidades: { codigo: string; descricao: string }[] = [];

    if (codes.length > 0) {
      const cods = await queryCodsIn(codes);
      const seen = new Set<string>();
      for (const row of cods) {
        const desc = row['models/description'] || '';
        if (desc && !seen.has(desc)) {
          seen.add(desc);
          compatibilidades.push({ codigo: row['models/mod'] || '', descricao: desc });
        }
      }
    }

    return c.json({
      found: true, partno: product.partno, product,
      compatibilidade_raw: rawCompat, compatibilidade_codes: codes,
      compatibilidades, total_compatibilidades: compatibilidades.length,
    });
  } catch (e: any) {
    console.error('[Catalogo] buscar:', e.message);
    return c.json({ found: false, error: e.message }, 500);
  }
});

// ── POST /interpretar ──
app.post('/interpretar', async (c) => {
  try {
    const { descricao } = await c.req.json();
    if (!descricao) return c.json({ error: 'Campo "descricao" obrigatorio' }, 400);
    if (!OPENAI_KEY()) return c.json({ error: 'OPENAI_API_KEY nao configurada' }, 500);

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${OPENAI_KEY()}` },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: 'Voce e um especialista em autopecas Toyota. Gere conteudo tecnico e comercial para e-commerce.' },
          { role: 'user', content: `Analise e crie Titulo H1, Descricao (2 paragrafos) e Bullet Points:\n${descricao}` },
        ],
        temperature: 0.5,
      }),
    });
    if (!res.ok) return c.json({ error: `OpenAI ${res.status}: ${await res.text()}` }, 502);
    const json = await res.json();
    return c.json({ interpretacao: json.choices?.[0]?.message?.content || 'Sem resposta' });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// ENRIQUECIMENTO IA — /comparar, /enriquecer-ia, /analise-lote
// ═══════════════════════════════════════════════════════════════════════════════

// ── POST /comparar ──────────────────────────────────────────────────────────
app.post('/comparar', async (c) => {
  try {
    const { sku } = await c.req.json();
    if (!sku) return c.json({ error: 'SKU obrigatorio' }, 400);

    // 1. Buscar Magento (KV)
    const mag = await kv.get(`${PRODUCT_PREFIX}${sku}`);
    if (!mag) return c.json({ error: `SKU "${sku}" nao encontrado no Magento (KV)` }, 404);

    // 2. Buscar Toyota
    let toyota: any = { found: false };
    try {
      const tp = await findToyota(sku);
      if (tp) {
        const rawCompat = tp.COMPATIBILIDADE || tp.compatibilidade || '';
        const codes = processCompat(rawCompat);
        const cods = await queryCodsIn(codes);

        const compatModels: any[] = [];
        const compatLines: string[] = [];
        const seen = new Set<string>();
        for (const row of cods) {
          const desc = row['models/description'] || '';
          const mod = row['models/mod'] || '';
          if (desc) compatLines.push(desc);
          if (desc && !seen.has(desc)) {
            seen.add(desc);
            compatModels.push({
              codigo: mod, descricao: desc,
              modelo: desc.split(' ')[0] || '',
              anos: [], trim: '', cambio: '', motor: '',
            });
          }
        }

        toyota = {
          found: true,
          cat: tp.cat || '',
          categoria: tp.category || tp.categoria || '',
          subcategoria: tp.subCategory || tp.subcategoria || '',
          description: tp.description || '',
          seo_title: tp.description ? `${tp.description} - Peça Genuína Toyota ${sku}` : '',
          weight: tp.weight || null,
          publicPrice: tp.price_price || null,
          compat_lines: compatLines,
          compat_models: compatModels,
        };
      }
    } catch (e: any) {
      console.error('[comparar] Toyota lookup error:', e.message);
    }

    // 3. Extrair dados Magento
    const description = getAttr(mag, 'description') || mag.description || '';
    const shortDesc = getAttr(mag, 'short_description') || '';
    const modelo = getAttr(mag, 'modelo') || null;
    const modeloLabel = getAttr(mag, 'modelo_label') || modelo;
    const ano = getAttr(mag, 'ano') || null;
    const anoLabels = getAttr(mag, 'ano_labels') || ano;
    const catIds = extractCategoryIds(mag);
    const imageCount = mag.media_gallery_entries?.length || 0;

    // 3b. Resolver nomes de categorias da arvore KV
    const { map: catMap, debug } = await loadCategoryMap();
    const categoryNames = catIds.map(id => {
      const entry = catMap.get(id);
      return { id, name: entry?.name || `Cat ${id}`, path: entry?.path || `Cat ${id}` };
    });

    const magento = {
      sku: mag.sku || sku,
      name: mag.name || '',
      price: mag.price || 0,
      weight: mag.weight || null,
      status: mag.status || 0,
      description,
      short_description: shortDesc,
      modelo, modelo_label: modeloLabel,
      ano, ano_labels: anoLabels,
      category_ids: catIds,
      category_names: categoryNames,
      image_count: imageCount,
    };

    // 4. Quality score (simple)
    const breakdown: Record<string, any> = {};
    let totalScore = 0, totalMax = 0;

    // naming
    const nameScore = mag.name ? (mag.name.length > 20 ? 20 : 10) : 0;
    breakdown.naming = { score: nameScore, max: 20, issues: mag.name ? (mag.name.length <= 20 ? ['Nome muito curto'] : []) : ['Sem nome'] };
    totalScore += nameScore; totalMax += 20;

    // category
    const catScore = catIds.length > 0 ? 20 : 0;
    breakdown.category = { score: catScore, max: 20, issues: catIds.length === 0 ? ['Sem categorias'] : [] };
    totalScore += catScore; totalMax += 20;

    // compatibility
    const compatScore = toyota.found && toyota.compat_lines?.length > 0 ? 20 : toyota.found ? 10 : 0;
    breakdown.compatibility = { score: compatScore, max: 20, issues: !toyota.found ? ['Sem match Toyota'] : toyota.compat_lines?.length === 0 ? ['Sem linhas de compatibilidade'] : [] };
    totalScore += compatScore; totalMax += 20;

    // description
    const descScore = description.length > 100 ? 20 : description.length > 20 ? 10 : 0;
    breakdown.description = { score: descScore, max: 20, issues: description.length <= 20 ? ['Descricao ausente ou muito curta'] : [] };
    totalScore += descScore; totalMax += 20;

    // images
    const imgScore = imageCount >= 3 ? 20 : imageCount > 0 ? 10 : 0;
    breakdown.images = { score: imgScore, max: 20, issues: imageCount === 0 ? ['Sem imagens'] : imageCount < 3 ? ['Poucas imagens'] : [] };
    totalScore += imgScore; totalMax += 20;

    const quality = { score: totalScore, maxScore: totalMax, breakdown };

    // 5. Suggestions
    const suggestions: any[] = [];
    if (toyota.found && toyota.seo_title && mag.name !== toyota.seo_title) {
      suggestions.push({ field: 'name', current: mag.name, suggested: toyota.seo_title, reason: 'Titulo SEO baseado no catalogo Toyota', priority: 'high' });
    }
    if (toyota.found && toyota.categoria && catIds.length === 0) {
      suggestions.push({ field: 'category', current: 'Nenhuma', suggested: `${toyota.categoria}${toyota.subcategoria ? ' > ' + toyota.subcategoria : ''}`, reason: 'Categoria do catalogo Toyota', priority: 'high' });
    }
    if (description.length < 50 && toyota.found) {
      suggestions.push({ field: 'description', current: description || '(vazia)', suggested: 'Gerar via IA com dados Toyota', reason: 'Descricao pobre impacta SEO e conversao', priority: 'medium' });
    }
    if (!mag.weight && toyota.weight) {
      suggestions.push({ field: 'weight', current: 'Nao informado', suggested: `${toyota.weight} kg`, reason: 'Peso do catalogo Toyota para calculo de frete', priority: 'medium' });
    }
    if (toyota.found && toyota.compat_lines?.length > 0 && !modelo) {
      suggestions.push({ field: 'compatibility', current: 'Vazio', suggested: `${toyota.compat_lines.length} modelos compativeis`, reason: 'Adicionar compatibilidade melhora busca e conversao', priority: 'high' });
    }

    return c.json({ sku, magento, toyota, quality, suggestions, _debug: { categoryMap: debug } });
  } catch (e: any) {
    console.error('[comparar]', e.message);
    return c.json({ error: e.message }, 500);
  }
});

// ── POST /enriquecer-ia ─────────────────────────────────────────────────────
app.post('/enriquecer-ia', async (c) => {
  try {
    const { sku, magento, toyota } = await c.req.json();
    if (!sku) return c.json({ error: 'SKU obrigatorio' }, 400);
    if (!OPENAI_KEY()) return c.json({ error: 'OPENAI_API_KEY nao configurada' }, 500);

    const prompt = `Voce e um especialista em autopecas Toyota para e-commerce.
Gere conteudo SEO otimizado para esta peca. Retorne APENAS um JSON valido sem markdown.

PRODUTO:
SKU: ${sku}
Nome Magento: ${magento?.name || 'N/A'}
Descricao Magento: ${(magento?.description || '').slice(0, 300)}
Categoria Toyota: ${toyota?.categoria || 'N/A'} > ${toyota?.subcategoria || 'N/A'}
Descricao Toyota: ${toyota?.description || 'N/A'}
Compatibilidade: ${toyota?.compat_lines?.slice(0, 5)?.join('; ') || 'N/A'}

RETORNE este JSON exato:
{
  "titulo_seo": "Titulo otimizado para Google",
  "descricao_curta": "Meta description ate 160 chars",
  "descricao_completa": "HTML com paragrafos descritivos tecnicos e comerciais",
  "bullet_points": ["ponto 1", "ponto 2", "ponto 3", "ponto 4"],
  "tags_seo": ["tag1", "tag2", "tag3", "tag4", "tag5"],
  "confianca": 0.85
}`;

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${OPENAI_KEY()}` },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: 'Retorne APENAS JSON valido. Sem markdown, sem ```json, sem explicacoes.' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.4,
      }),
    });

    if (!res.ok) return c.json({ error: `OpenAI ${res.status}: ${await res.text()}` }, 502);

    const aiJson = await res.json();
    const raw = aiJson.choices?.[0]?.message?.content || '';

    // Parse JSON from response (strip markdown if present)
    const cleaned = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    let enrichment;
    try {
      enrichment = JSON.parse(cleaned);
    } catch {
      return c.json({ error: 'IA retornou formato invalido', raw: cleaned }, 502);
    }

    return c.json({ enrichment });
  } catch (e: any) {
    console.error('[enriquecer-ia]', e.message);
    return c.json({ error: e.message }, 500);
  }
});

// ── POST /analise-lote ──────────────────────────────────────────────────────
app.post('/analise-lote', async (c) => {
  try {
    const { offset = 0, limit = 30 } = await c.req.json();

    // Get all products from KV
    const allProducts = await kv.getByPrefix(PRODUCT_PREFIX);
    if (!allProducts || allProducts.length === 0) {
      return c.json({ error: 'Nenhum produto no KV' }, 404);
    }

    const totalProducts = allProducts.length;
    const slice = allProducts.slice(offset, offset + limit);

    const products: any[] = [];
    let totalMatched = 0, totalUnmatched = 0;
    let scoreSum = 0;
    const dist = { excellent: 0, good: 0, fair: 0, poor: 0 };

    for (const mag of slice) {
      const sku = mag.sku || '';
      if (!sku) continue;

      let toyotaMatch = false;
      let toyotaCategory: string | null = null;
      let compatCount = 0;

      try {
        const tp = await findToyota(sku);
        if (tp) {
          toyotaMatch = true;
          toyotaCategory = tp.category || tp.categoria || null;
          const rawCompat = tp.COMPATIBILIDADE || tp.compatibilidade || '';
          compatCount = processCompat(rawCompat).length;
        }
      } catch { /* skip */ }

      // Simple quality
      const issues: string[] = [];
      let score = 0;
      const max = 100;

      if (mag.name && mag.name.length > 20) score += 20; else issues.push('Nome fraco');
      const catIds = extractCategoryIds(mag);
      if (catIds.length > 0) score += 20; else issues.push('Sem categoria');
      const desc = getAttr(mag, 'description') || mag.description || '';
      if (desc.length > 100) score += 20; else issues.push('Descricao curta');
      if (toyotaMatch) { score += 20; totalMatched++; } else { issues.push('Sem match Toyota'); totalUnmatched++; }
      const imgs = mag.media_gallery_entries?.length || 0;
      if (imgs >= 3) score += 20; else if (imgs > 0) score += 10; else issues.push('Sem imagens');

      const pct = Math.round((score / max) * 100);
      scoreSum += pct;
      if (pct >= 80) dist.excellent++;
      else if (pct >= 60) dist.good++;
      else if (pct >= 40) dist.fair++;
      else dist.poor++;

      products.push({
        sku, name: mag.name || '', price: mag.price || 0, status: mag.status || 0,
        toyota_match: toyotaMatch, toyota_category: toyotaCategory,
        quality_score: score, quality_max: max, quality_pct: pct,
        issues_count: issues.length, top_issues: issues.slice(0, 3),
      });
    }

    return c.json({
      products,
      total_analyzed: products.length,
      total_products: totalProducts,
      offset,
      has_more: offset + limit < totalProducts,
      stats: {
        total_matched: totalMatched,
        total_unmatched: totalUnmatched,
        avg_quality_pct: products.length > 0 ? Math.round(scoreSum / products.length) : 0,
        distribution: dist,
      },
    });
  } catch (e: any) {
    console.error('[analise-lote]', e.message);
    return c.json({ error: e.message }, 500);
  }
});

// ── Helper: extract category IDs from Magento product ───────────────────────
// ── POST /comparar-medidas ───────────────────────────────────────────────────
app.post('/comparar-medidas', async (c) => {
  try {
    const { sku } = await c.req.json();
    const requestedSku = String(sku || '').trim();
    if (!requestedSku) return c.json({ error: 'SKU obrigatorio' }, 400);

    const product = await kv.get(`${PRODUCT_PREFIX}${requestedSku}`);
    if (!product) return c.json({ error: `SKU "${requestedSku}" nao encontrado no Toyoparts` }, 404);

    const toyotaMatch = await findToyotaMatchInfo(requestedSku);
    const comparison = buildMeasureComparison(requestedSku, product, toyotaMatch);
    const review = buildMeasureReviewState(await kv.get(getMeasureReviewKey(requestedSku)), comparison);

    return c.json({ sku: requestedSku, comparison, review });
  } catch (e: any) {
    console.error('[comparar-medidas]', e.message);
    return c.json({ error: e.message }, 500);
  }
});

// ── POST /comparar-medidas-lote ──────────────────────────────────────────────
app.post('/comparar-medidas-lote', async (c) => {
  try {
    const {
      offset = 0,
      limit = 50,
      q = '',
      onlyDivergent = true,
      inStockOnly = false,
      field = 'all',
      matchStatus = 'all',
      rowStatus = 'all',
      showReviewed = false,
    } = await c.req.json();

    const safeOffset = Math.max(0, Number(offset) || 0);
    const safeLimit = Math.min(100, Math.max(1, Number(limit) || 50));
    const query = String(q || '').trim().toLowerCase();
    const onlyInStock = Boolean(inStockOnly);
    const includeReviewed = Boolean(showReviewed);
    const rowStatusFilter = ['all', 'pending', 'synced', 'sem_match'].includes(String(rowStatus))
      ? String(rowStatus)
      : 'all';

    const allProducts = (await kv.getByPrefix(PRODUCT_PREFIX) || [])
      .filter((product: any) => product?.sku)
      .sort((a: any, b: any) => String(a.sku).localeCompare(String(b.sku)));

    const searchedProducts = query
      ? allProducts.filter((product: any) => {
          const sku = String(product?.sku || '').toLowerCase();
          const name = String(product?.name || '').toLowerCase();
          return sku.includes(query) || name.includes(query);
        })
      : allProducts;

    const toyotaMap = await buildToyotaExactMap(searchedProducts.map((product: any) => product.sku));
    const reviewMap = await loadMeasureReviewMap();

    const rows = searchedProducts.map((product: any) => {
      const normalizedSku = normalizeSku(product.sku);
      const toyotaRecord = toyotaMap.get(normalizedSku) || null;
      const comparison = buildMeasureComparison(product.sku, product, {
        found: !!toyotaRecord,
        mode: toyotaRecord ? (toyotaRecord.partno === product.sku ? 'exact' : 'normalized') : 'none',
        eligible: !!toyotaRecord,
        requestedSku: product.sku,
        normalizedSku,
        matchedPartno: toyotaRecord?.partno || null,
        record: toyotaRecord,
      });
      return buildBulkMeasureRow(product, comparison, reviewMap.get(String(product?.sku || '').trim()));
    });

    const filteredRows = rows.filter((row: any) => {
      if (onlyDivergent && !row.hasDifferences) return false;
      if (onlyInStock && !row.inStock) return false;
      if (field !== 'all' && ![...row.divergentFields, ...row.missingFields].includes(field)) return false;
      if (matchStatus !== 'all' && row.matchStatus !== matchStatus) return false;
      if (rowStatusFilter !== 'all' && row.rowStatus !== rowStatusFilter) return false;
      if (!includeReviewed && row.reviewed && row.reviewStillValid) return false;
      return true;
    });

    const pagedRows = filteredRows.slice(safeOffset, safeOffset + safeLimit);
    const nextOffset = safeOffset + pagedRows.length;

    const stats = {
      total_catalog_rows: allProducts.length,
      total_analyzed: rows.length,
      total_after_filters: filteredRows.length,
      total_in_stock: rows.filter((row: any) => row.inStock).length,
      total_eligible_matches: rows.filter((row: any) => row.matchStatus === 'elegivel').length,
      total_without_match: rows.filter((row: any) => row.rowStatus === 'sem_match').length,
      total_with_differences: rows.filter((row: any) => row.hasDifferences).length,
      total_eligible_to_apply: rows.filter((row: any) => row.canApply).length,
      total_pending: rows.filter((row: any) => row.rowStatus === 'pending').length,
      total_synced: rows.filter((row: any) => row.rowStatus === 'synced').length,
      total_reviewed: rows.filter((row: any) => row.reviewed && row.reviewStillValid).length,
      field_counts: {
        weight: {
          divergente: rows.filter((row: any) => row.fields.weight.status === 'divergente').length,
          faltando_no_toyoparts: rows.filter((row: any) => row.fields.weight.status === 'faltando_no_toyoparts').length,
          sincronizado: rows.filter((row: any) => row.fields.weight.status === 'sincronizado').length,
          sem_dado_toyota: rows.filter((row: any) => row.fields.weight.status === 'sem_dado_toyota').length,
        },
        dimensionLength: {
          divergente: rows.filter((row: any) => row.fields.dimensionLength.status === 'divergente').length,
          faltando_no_toyoparts: rows.filter((row: any) => row.fields.dimensionLength.status === 'faltando_no_toyoparts').length,
          sincronizado: rows.filter((row: any) => row.fields.dimensionLength.status === 'sincronizado').length,
          sem_dado_toyota: rows.filter((row: any) => row.fields.dimensionLength.status === 'sem_dado_toyota').length,
        },
        dimensionWidth: {
          divergente: rows.filter((row: any) => row.fields.dimensionWidth.status === 'divergente').length,
          faltando_no_toyoparts: rows.filter((row: any) => row.fields.dimensionWidth.status === 'faltando_no_toyoparts').length,
          sincronizado: rows.filter((row: any) => row.fields.dimensionWidth.status === 'sincronizado').length,
          sem_dado_toyota: rows.filter((row: any) => row.fields.dimensionWidth.status === 'sem_dado_toyota').length,
        },
        dimensionHeight: {
          divergente: rows.filter((row: any) => row.fields.dimensionHeight.status === 'divergente').length,
          faltando_no_toyoparts: rows.filter((row: any) => row.fields.dimensionHeight.status === 'faltando_no_toyoparts').length,
          sincronizado: rows.filter((row: any) => row.fields.dimensionHeight.status === 'sincronizado').length,
          sem_dado_toyota: rows.filter((row: any) => row.fields.dimensionHeight.status === 'sem_dado_toyota').length,
        },
      },
    };

    return c.json({
      rows: pagedRows,
      total_rows: filteredRows.length,
      total_source_rows: rows.length,
      offset: safeOffset,
      limit: safeLimit,
      nextOffset,
      has_more: nextOffset < filteredRows.length,
      stats,
      filters: {
        q: query,
        onlyDivergent,
        inStockOnly: onlyInStock,
        field,
        matchStatus,
        rowStatus: rowStatusFilter,
        showReviewed: includeReviewed,
      },
    });
  } catch (e: any) {
    console.error('[comparar-medidas-lote]', e.message);
    return c.json({ error: e.message }, 500);
  }
});

// ── POST /aplicar-medidas ────────────────────────────────────────────────────
app.post('/aplicar-medidas', async (c) => {
  try {
    const { sku, fields } = await c.req.json();
    const requestedSku = String(sku || '').trim();
    if (!requestedSku) return c.json({ error: 'SKU obrigatorio' }, 400);

    const product = await kv.get(`${PRODUCT_PREFIX}${requestedSku}`);
    if (!product) return c.json({ error: `SKU "${requestedSku}" nao encontrado no Toyoparts` }, 404);

    const toyotaMatch = await findToyotaMatchInfo(requestedSku);
    const comparison = buildMeasureComparison(requestedSku, product, toyotaMatch);
    if (!comparison.match.eligible) {
      return c.json({ error: 'SKU sem match elegivel na Toyota para aplicacao', comparison }, 409);
    }

    const result = await persistMeasureUpdate(c, requestedSku, product, comparison, fields);
    const refreshedComparison = buildMeasureComparison(requestedSku, result.product || product, toyotaMatch);

    return c.json({
      success: result.success,
      result,
      comparison: refreshedComparison,
      row: buildBulkMeasureRow(result.product || product, refreshedComparison),
    });
  } catch (e: any) {
    console.error('[aplicar-medidas]', e.message);
    return c.json({ error: e.message }, 500);
  }
});

// ── POST /aplicar-medidas-lote ───────────────────────────────────────────────
app.post('/aplicar-medidas-lote', async (c) => {
  try {
    const { skus = [] } = await c.req.json();
    const uniqueSkus = [...new Set((Array.isArray(skus) ? skus : []).map((sku: any) => String(sku || '').trim()).filter(Boolean))];
    if (!uniqueSkus.length) return c.json({ error: 'Lista de SKUs obrigatoria' }, 400);

    const products = await Promise.all(uniqueSkus.map((sku) => kv.get(`${PRODUCT_PREFIX}${sku}`)));
    const productMap = new Map<string, any>();
    uniqueSkus.forEach((sku, index) => {
      if (products[index]) productMap.set(sku, products[index]);
    });

    const toyotaMap = await buildToyotaExactMap(uniqueSkus);

    const applied: any[] = [];
    const skipped: any[] = [];
    const errors: any[] = [];

    for (const sku of uniqueSkus) {
      const product = productMap.get(sku);
      if (!product) {
        skipped.push({ sku, reason: 'Produto nao encontrado no Toyoparts' });
        continue;
      }

      const normalizedSku = normalizeSku(sku);
      const toyotaRecord = toyotaMap.get(normalizedSku) || null;
      const comparison = buildMeasureComparison(sku, product, {
        found: !!toyotaRecord,
        mode: toyotaRecord ? (toyotaRecord.partno === sku ? 'exact' : 'normalized') : 'none',
        eligible: !!toyotaRecord,
        requestedSku: sku,
        normalizedSku,
        matchedPartno: toyotaRecord?.partno || null,
        record: toyotaRecord,
      });

      if (!comparison.match.eligible) {
        skipped.push({ sku, reason: 'Sem match elegivel na Toyota' });
        continue;
      }

      if (!comparison.summary.canApply) {
        skipped.push({ sku, reason: 'Sem divergencias aplicaveis' });
        continue;
      }

      try {
        const result = await persistMeasureUpdate(c, sku, product, comparison);
        const refreshedComparison = buildMeasureComparison(sku, result.product || product, {
          found: !!toyotaRecord,
          mode: toyotaRecord ? (toyotaRecord.partno === sku ? 'exact' : 'normalized') : 'none',
          eligible: !!toyotaRecord,
          requestedSku: sku,
          normalizedSku,
          matchedPartno: toyotaRecord?.partno || null,
          record: toyotaRecord,
        });
        applied.push({
          sku,
          appliedFields: result.appliedFields,
          before: result.before,
          after: result.after,
          comparison: refreshedComparison,
          row: buildBulkMeasureRow(result.product || product, refreshedComparison),
        });
      } catch (err: any) {
        errors.push({ sku, error: err.message });
      }
    }

    return c.json({
      success: errors.length === 0,
      applied_count: applied.length,
      skipped_count: skipped.length,
      error_count: errors.length,
      applied,
      skipped,
      errors,
    });
  } catch (e: any) {
    console.error('[aplicar-medidas-lote]', e.message);
    return c.json({ error: e.message }, 500);
  }
});

// ── POST /marcar-medidas-conferidas ───────────────────────────────────────────
app.post('/marcar-medidas-conferidas', async (c) => {
  try {
    const { skus = [] } = await c.req.json();
    const uniqueSkus = [...new Set((Array.isArray(skus) ? skus : []).map((sku: any) => String(sku || '').trim()).filter(Boolean))];
    if (!uniqueSkus.length) return c.json({ error: 'Lista de SKUs obrigatoria' }, 400);

    const products = await Promise.all(uniqueSkus.map((sku) => kv.get(`${PRODUCT_PREFIX}${sku}`)));
    const productMap = new Map<string, any>();
    uniqueSkus.forEach((sku, index) => {
      if (products[index]) productMap.set(sku, products[index]);
    });

    const toyotaMap = await buildToyotaExactMap(uniqueSkus);
    const reviewed: any[] = [];
    const skipped: any[] = [];

    for (const sku of uniqueSkus) {
      const product = productMap.get(sku);
      if (!product) {
        skipped.push({ sku, reason: 'Produto nao encontrado no Toyoparts' });
        continue;
      }

      const normalizedSku = normalizeSku(sku);
      const toyotaRecord = toyotaMap.get(normalizedSku) || null;
      const comparison = buildMeasureComparison(sku, product, {
        found: !!toyotaRecord,
        mode: toyotaRecord ? (toyotaRecord.partno === sku ? 'exact' : 'normalized') : 'none',
        eligible: !!toyotaRecord,
        requestedSku: sku,
        normalizedSku,
        matchedPartno: toyotaRecord?.partno || null,
        record: toyotaRecord,
      });

      const reviewEntry = buildMeasureReviewEntry(c, sku, comparison);
      await kv.set(getMeasureReviewKey(sku), reviewEntry);
      reviewed.push({
        sku,
        review: buildMeasureReviewState(reviewEntry, comparison),
        row: buildBulkMeasureRow(product, comparison, reviewEntry),
      });
    }

    return c.json({
      success: true,
      reviewed_count: reviewed.length,
      skipped_count: skipped.length,
      reviewed,
      skipped,
    });
  } catch (e: any) {
    console.error('[marcar-medidas-conferidas]', e.message);
    return c.json({ error: e.message }, 500);
  }
});

// ── POST /desmarcar-medidas-conferidas ───────────────────────────────────────
app.post('/desmarcar-medidas-conferidas', async (c) => {
  try {
    const { skus = [] } = await c.req.json();
    const uniqueSkus = [...new Set((Array.isArray(skus) ? skus : []).map((sku: any) => String(sku || '').trim()).filter(Boolean))];
    if (!uniqueSkus.length) return c.json({ error: 'Lista de SKUs obrigatoria' }, 400);

    await Promise.all(uniqueSkus.map((sku) => kv.del(getMeasureReviewKey(sku))));

    return c.json({
      success: true,
      unreviewed_count: uniqueSkus.length,
      skus: uniqueSkus,
    });
  } catch (e: any) {
    console.error('[desmarcar-medidas-conferidas]', e.message);
    return c.json({ error: e.message }, 500);
  }
});

// ── GET /historico-medidas ───────────────────────────────────────────────────
app.get('/historico-medidas', async (c) => {
  try {
    const limit = Math.min(200, Math.max(1, Number(c.req.query('limit') || 50)));
    const sku = String(c.req.query('sku') || '').trim();
    const history = await kv.getByPrefix(MEASURE_AUDIT_PREFIX) || [];
    const filtered = sku ? history.filter((entry: any) => entry?.sku === sku) : history;
    const sorted = filtered.sort((a: any, b: any) =>
      new Date(b?.applied_at || 0).getTime() - new Date(a?.applied_at || 0).getTime()
    );

    return c.json({
      items: sorted.slice(0, limit),
      total: filtered.length,
    });
  } catch (e: any) {
    console.error('[historico-medidas]', e.message);
    return c.json({ error: e.message }, 500);
  }
});

// -- POST /category-enrichment/preview ------------------------------------------------
app.post('/category-enrichment/preview', async (c) => {
  try {
    const body = await c.req.json();
    const rawSkus = Array.isArray(body?.skus)
      ? body.skus
      : String(body?.text || '')
        .split(/[\r\n,;]+/g);
    const skus = uniqueList(rawSkus.map((sku: any) => normalizeSku(sku))).slice(0, CATEGORY_ENRICHMENT_MAX_SKUS);

    if (!skus.length) return c.json({ error: 'Informe ao menos um SKU' }, 400);

    const result = await buildCategoryEnrichmentRows(skus, body?.useAI !== false);
    return c.json({
      rows: result.rows,
      categories: result.categories,
      summary: summarizeCategoryEnrichment(result.rows),
      limits: {
        max_skus: CATEGORY_ENRICHMENT_MAX_SKUS,
        received: rawSkus.length,
        analyzed: skus.length,
      },
      debug: result.debug,
    });
  } catch (e: any) {
    console.error('[category-enrichment/preview]', e.message);
    return c.json({ error: e.message }, 500);
  }
});

// -- POST /category-enrichment/apply --------------------------------------------------
app.post('/category-enrichment/apply', async (c) => {
  try {
    const body = await c.req.json();
    const updates = Array.isArray(body?.updates) ? body.updates : [];
    if (!updates.length) return c.json({ error: 'Lista de updates obrigatoria' }, 400);
    if (updates.length > CATEGORY_ENRICHMENT_MAX_SKUS) {
      return c.json({ error: `Limite de ${CATEGORY_ENRICHMENT_MAX_SKUS} SKUs por aplicacao` }, 400);
    }

    const { categories } = await buildCategoryEnrichmentRows(
      uniqueList(updates.map((update: any) => normalizeSku(update?.sku || ''))),
      false,
    );

    const applied: any[] = [];
    const skipped: any[] = [];
    const errors: any[] = [];

    for (const update of updates) {
      try {
        const result = await applyCategoryEnrichmentUpdate(c, update, categories);
        if (result.success) applied.push(result);
        else skipped.push(result);
      } catch (err: any) {
        errors.push({ sku: normalizeSku(update?.sku || ''), error: err.message });
      }
    }

    return c.json({
      success: errors.length === 0,
      applied_count: applied.length,
      skipped_count: skipped.length,
      error_count: errors.length,
      applied,
      skipped,
      errors,
    });
  } catch (e: any) {
    console.error('[category-enrichment/apply]', e.message);
    return c.json({ error: e.message }, 500);
  }
});

// -- GET /category-enrichment/history -------------------------------------------------
app.get('/category-enrichment/history', async (c) => {
  try {
    const limit = Math.min(200, Math.max(1, Number(c.req.query('limit') || 50)));
    const sku = normalizeSku(c.req.query('sku') || '');
    const history = await kv.getByPrefix(CATEGORY_ENRICHMENT_AUDIT_PREFIX) || [];
    const filtered = sku ? history.filter((entry: any) => normalizeSku(entry?.sku || '') === sku) : history;
    const sorted = filtered.sort((a: any, b: any) =>
      new Date(b?.applied_at || 0).getTime() - new Date(a?.applied_at || 0).getTime()
    );

    return c.json({
      items: sorted.slice(0, limit),
      total: filtered.length,
    });
  } catch (e: any) {
    console.error('[category-enrichment/history]', e.message);
    return c.json({ error: e.message }, 500);
  }
});

// -- GET /category-enrichment/candidates ----------------------------------------------
app.get('/category-enrichment/candidates', async (c) => {
  try {
    const limit = Math.min(CATEGORY_ENRICHMENT_MAX_SKUS, Math.max(1, Number(c.req.query('limit') || CATEGORY_ENRICHMENT_MAX_SKUS)));
    const filters = {
      active: true,
      in_stock: true,
      without_categories: true,
    };

    if (meili.isConfigured()) {
      try {
        const result = await meili.search('', {
          limit,
          offset: 0,
          filter: ['status = 1', 'in_stock = true', 'category_ids IS EMPTY'],
          sort: ['created_at:desc'],
          facets: [],
        });

        const skus = [...new Set(
          (result?.hits || [])
            .map((hit: any) => normalizeSku(hit?.sku || ''))
            .filter(Boolean),
        )].slice(0, limit);

        if (skus.length > 0) {
          return c.json({
            skus,
            total_candidates: result?.totalHits ?? result?.estimatedTotalHits ?? skus.length,
            selected_count: skus.length,
            filters,
            source: 'meilisearch',
          });
        }

        console.warn('[category-enrichment/candidates] Meilisearch returned no hits, using bounded fallback');
      } catch (meiliError: any) {
        console.warn('[category-enrichment/candidates] Meilisearch failed, using bounded fallback:', meiliError?.message || String(meiliError));
      }
    }

    const fallback = await collectCategoryEnrichmentCandidatesFallback(limit);

    return c.json({
      skus: fallback.skus,
      total_candidates: fallback.skus.length,
      selected_count: fallback.skus.length,
      filters,
      source: 'kv_bounded_fallback',
      scanned_products: fallback.scanned_products,
      reached_scan_limit: fallback.reached_scan_limit,
    });
  } catch (e: any) {
    console.error('[category-enrichment/candidates]', e.message);
    return c.json({ error: e.message }, 500);
  }
});

export function extractCategoryIds(product: any): string[] {
  const catSet = new Set<string>();
  const customAttrs = product?.custom_attributes || [];
  const catAttr = customAttrs.find((a: any) => a.attribute_code === 'category_ids');
  if (catAttr?.value) {
    const ids = Array.isArray(catAttr.value) ? catAttr.value : String(catAttr.value).split(',');
    ids.forEach((id: any) => { const s = String(id).trim(); if (s && s !== '1' && s !== '2') catSet.add(s); });
  }
  const catLinks = product?.extension_attributes?.category_links;
  if (Array.isArray(catLinks)) {
    catLinks.forEach((l: any) => { const s = String(l.category_id).trim(); if (s && s !== '1' && s !== '2') catSet.add(s); });
  }
  return [...catSet];
}

export const catalogo = app;
