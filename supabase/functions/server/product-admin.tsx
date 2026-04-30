import { Hono } from 'npm:hono';
import { createClient } from "jsr:@supabase/supabase-js@2.49.8";
import * as kv from './kv_store.tsx';
import * as meili from './meilisearch.tsx';
import { fetchMagento } from './magento.tsx';
import { resolveProductMedia } from './media-utils.tsx';
import { CANONICAL_VEHICLE_MODELS, resolveCanonicalVehicleSlugs } from '../../../shared/canonical-vehicle-models.ts';
import { resolveProductCompatibility } from '../../../shared/product-compatibility.ts';

const OPENAI_API_KEY = (Deno.env.get('OPENAI_API_KEY') || '').trim();
const PRODUCT_PREFIX = 'product:';
const HISTORY_PREFIX = 'history:';
const BUCKET_NAME = 'make-1d6e33e0-products';
const MAGENTO_TOKEN = (Deno.env.get('MAGENTO_TOKEN') || '').trim();
const MAGENTO_BASE_URL = 'https://www.toyoparts.com.br';
const CANONICAL_RECORD_VERSION = 4;

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

// Idempotent bucket creation
async function ensureBucket() {
  const { data: buckets } = await supabase.storage.listBuckets();
  if (!buckets?.some(b => b.name === BUCKET_NAME)) {
    await supabase.storage.createBucket(BUCKET_NAME, { public: true });
  }
}

function slugifyFilePart(value: string): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
    || 'produto';
}

export const productAdmin = new Hono();

function withAdminTimeout<T>(promise: Promise<T>, label: string, ms = 3000): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error(`[ProductAdmin] ${label} timed out after ${ms}ms`)), ms);
    }),
  ]);
}

// Helper to get product by SKU
async function getProduct(sku: string) {
  const key = `${PRODUCT_PREFIX}${sku}`;

  try {
    return await kv.get(key);
  } catch (error) {
    console.warn(`[ProductAdmin] KV product read failed for ${sku}, trying direct DB fallback:`, error);
    try {
      const { data, error: dbError } = await withAdminTimeout(
        supabase
          .from('kv_store_1d6e33e0')
          .select('value')
          .eq('key', key)
          .maybeSingle(),
        `direct product DB fallback:${sku}`,
      );

      if (dbError) {
        throw new Error(dbError.message);
      }

      return data?.value ?? null;
    } catch (dbFallbackError) {
      console.warn(`[ProductAdmin] Direct DB fallback failed for ${sku}:`, dbFallbackError);
      return null;
    }
  }
}

function normalizeSku(value: string | null | undefined) {
  return String(value || '').trim();
}

function normalizeCustomAttributes(customAttributes: any): any[] {
  if (!Array.isArray(customAttributes)) return [];
  return customAttributes
    .filter((attr) => attr?.attribute_code)
    .map((attr) => ({
      ...attr,
      attribute_code: String(attr.attribute_code).trim(),
      value: attr.value ?? '',
    }));
}

function customAttributesToMap(customAttributes: any[]): Record<string, any> {
  const map: Record<string, any> = {};
  for (const attr of customAttributes) {
    if (!attr?.attribute_code) continue;
    map[String(attr.attribute_code)] = attr.value;
  }
  return map;
}

function parseStockData(raw: any) {
  if (!raw) return {};
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }
  return typeof raw === 'object' ? raw : {};
}

function normalizeCsvValues(value: any): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeMediaEntries(entries: any): any[] {
  if (!Array.isArray(entries)) return [];
  return entries
    .filter((entry) => entry?.file)
    .map((entry, index) => ({
      file: entry.file,
      label: entry.label || '',
      position: Number(entry.position ?? index + 1),
      media_type: entry.media_type || 'image',
      disabled: entry.disabled === true,
    }));
}

function normalizeCategoryTreePayload(raw: any): any[] {
  const normalizeNode = (node: any): any | null => {
    if (!node || typeof node !== 'object') return null;
    const childrenSource = Array.isArray(node.children_data)
      ? node.children_data
      : Array.isArray(node.children)
        ? node.children
        : [];

    return {
      id: node.id,
      name: String(node.name || '').trim(),
      level: Number(node.level ?? 0) || 0,
      is_active: node.is_active !== false,
      children_data: childrenSource
        .map((child: any) => normalizeNode(child))
        .filter(Boolean),
    };
  };

  const normalized = (Array.isArray(raw) ? raw : raw ? [raw] : [])
    .map((node) => normalizeNode(node))
    .filter(Boolean);

  if (
    normalized.length === 1 &&
    Array.isArray(normalized[0]?.children_data) &&
    normalized[0].children_data.length > 0 &&
    (normalized[0].level <= 2 || ['root', 'default category', 'toyoparts'].includes(String(normalized[0].name || '').trim().toLowerCase()))
  ) {
    return normalized[0].children_data;
  }

  return normalized;
}

async function loadCategoryTree() {
  let tree: any = null;

  try {
    tree = await kv.get('meta:category_tree');
  } catch (error) {
    console.warn('[ProductAdmin] Category tree cache read failed, using fallback strategy:', error);
    tree = null;
  }

  if (!tree || (Array.isArray(tree) && tree.length === 0)) {
    console.log('Category tree cache miss, fetching from Magento...');
    tree = await fetchMagentoCategories().catch((error) => {
      console.warn('[ProductAdmin] Magento categories fallback failed:', error);
      return null;
    });
    if (tree && (Array.isArray(tree) ? tree.length > 0 : true)) {
      await kv.set('meta:category_tree', tree).catch((error) => {
        console.warn('[ProductAdmin] Category tree cache write skipped:', error);
      });
    }
  }

  const normalized = normalizeCategoryTreePayload(tree);
  return normalized.length > 0 ? normalized : normalizeCategoryTreePayload(fallbackCategories);
}

async function safeLoadCategoryTree() {
  try {
    return await loadCategoryTree();
  } catch (error) {
    console.error('[ProductAdmin] safeLoadCategoryTree fallback activated:', error);
    return normalizeCategoryTreePayload(fallbackCategories);
  }
}

const FIXED_CUSTOM_ATTRIBUTE_CODES = [
  'category_ids',
  'description',
  'short_description',
  'url_key',
  'meta_title',
  'meta_keyword',
  'meta_description',
  'special_price',
  'cost',
  'volume_length',
  'volume_width',
  'volume_height',
  'lead_time',
  'fragile',
  'frete_gratis',
  'ordena_busca',
  'modelo',
  'ano',
  'versao',
  'compatibilidade',
  'integra_anymarket',
  'marca_anymarket',
  'garantia_meses_any',
  'garantia_texto_anymarket',
  'ts_packaging_type',
  'ts_country_of_origin',
  'image',
  'small_image',
  'thumbnail',
  'swatch_image',
  'image_label',
  'small_image_label',
  'thumbnail_label',
];

const ATTRIBUTE_DEFINITIONS = [
  {
    attribute_code: 'ean',
    label: 'EAN / GTIN',
    group: 'Catalogo',
    type: 'text',
    placeholder: 'Codigo de barras do produto',
    visibility: 'optional',
  },
  {
    attribute_code: 'ncm',
    label: 'NCM',
    group: 'Catalogo',
    type: 'text',
    placeholder: 'Classificacao fiscal',
    visibility: 'optional',
  },
  {
    attribute_code: 'cest',
    label: 'CEST',
    group: 'Catalogo',
    type: 'text',
    placeholder: 'Codigo CEST',
    visibility: 'optional',
  },
  {
    attribute_code: 'manufacturer',
    label: 'Fabricante',
    group: 'Catalogo',
    type: 'text',
    placeholder: 'Ex.: Toyota',
    visibility: 'optional',
  },
  {
    attribute_code: 'brand',
    label: 'Marca',
    group: 'Catalogo',
    type: 'text',
    placeholder: 'Marca exibida no site',
    visibility: 'optional',
  },
  {
    attribute_code: 'oem_reference',
    label: 'Referencia OEM',
    group: 'Automotivo',
    type: 'text',
    placeholder: 'Codigo OEM adicional',
    visibility: 'optional',
  },
  {
    attribute_code: 'reference_code',
    label: 'Codigo de Referencia',
    group: 'Automotivo',
    type: 'text',
    placeholder: 'Referencia cruzada',
    visibility: 'optional',
  },
  {
    attribute_code: 'application_notes',
    label: 'Notas de Aplicacao',
    group: 'Automotivo',
    type: 'textarea',
    placeholder: 'Detalhes extras de aplicacao',
    visibility: 'optional',
  },
  {
    attribute_code: 'material',
    label: 'Material',
    group: 'Catalogo',
    type: 'text',
    placeholder: 'Ex.: Aco, plastico, borracha',
    visibility: 'optional',
  },
  {
    attribute_code: 'position',
    label: 'Posicao',
    group: 'Automotivo',
    type: 'select',
    options: [
      { label: 'Dianteira', value: 'dianteira' },
      { label: 'Traseira', value: 'traseira' },
      { label: 'Superior', value: 'superior' },
      { label: 'Inferior', value: 'inferior' },
      { label: 'Interna', value: 'interna' },
      { label: 'Externa', value: 'externa' },
    ],
    visibility: 'optional',
  },
  {
    attribute_code: 'side',
    label: 'Lado',
    group: 'Automotivo',
    type: 'select',
    options: [
      { label: 'Esquerdo', value: 'esquerdo' },
      { label: 'Direito', value: 'direito' },
      { label: 'Par', value: 'par' },
      { label: 'Central', value: 'central' },
    ],
    visibility: 'optional',
  },
  {
    attribute_code: 'unit',
    label: 'Unidade de Venda',
    group: 'Catalogo',
    type: 'select',
    options: [
      { label: 'Unidade', value: 'unidade' },
      { label: 'Par', value: 'par' },
      { label: 'Kit', value: 'kit' },
      { label: 'Jogo', value: 'jogo' },
    ],
    visibility: 'optional',
  },
  {
    attribute_code: 'warranty_text',
    label: 'Garantia',
    group: 'Comercial',
    type: 'textarea',
    placeholder: 'Texto livre de garantia',
    visibility: 'optional',
  },
  {
    attribute_code: 'warranty_months',
    label: 'Garantia (Meses)',
    group: 'Comercial',
    type: 'number',
    placeholder: 'Ex.: 12',
    visibility: 'optional',
  },
  {
    attribute_code: 'requires_chassis_check',
    label: 'Exige Chassi',
    group: 'Automotivo',
    type: 'boolean',
    visibility: 'optional',
  },
  {
    attribute_code: 'universal_fit',
    label: 'Aplicacao Universal',
    group: 'Automotivo',
    type: 'boolean',
    visibility: 'optional',
  },
  {
    attribute_code: 'search_keywords',
    label: 'Palavras-chave Extras',
    group: 'SEO',
    type: 'multiselect',
    options: [],
    placeholder: 'Informe uma lista separada por virgula',
    visibility: 'advanced',
  },
];

async function loadCompatibilityMetaContext() {
  const meiliMeta = await kv.get('meili:sync:meta').catch(() => null) as {
    modelos?: Record<string, string>;
    anos?: Record<string, string>;
    versions?: Record<string, string>;
  } | null;

  const modelIdToLabel =
    await kv.get('meta:attr_modelos').catch(() => null)
    || meiliMeta?.modelos
    || {};
  const yearIdToLabel =
    await kv.get('meta:attr_anos').catch(() => null)
    || meiliMeta?.anos
    || {};
  const versionIdToLabel =
    await kv.get('meta:attr_versoes').catch(() => null)
    || meiliMeta?.versions
    || {};

  return {
    modelIdToLabel,
    yearIdToLabel,
    versionIdToLabel,
  };
}

function buildCompatibilitySchemaOptions(meta: Awaited<ReturnType<typeof loadCompatibilityMetaContext>>) {
  const modelEntries = Object.entries(meta.modelIdToLabel || {});
  const models = CANONICAL_VEHICLE_MODELS.map((model) => {
    const matchedId = modelEntries.find(([, label]) => resolveCanonicalVehicleSlugs([label]).includes(model.slug))?.[0] || '';
    return {
      slug: model.slug,
      label: model.displayName,
      modelId: matchedId,
    };
  });

  const years = Object.entries(meta.yearIdToLabel || {})
    .map(([id, label]) => ({
      id: String(id),
      label: String(label || '').trim(),
    }))
    .filter((item) => item.label)
    .sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));

  return { models, years };
}

function buildEditorSchema(categoryTree: any[], compatibilityOptions: { models: Array<{ slug: string; label: string; modelId: string }>; years: Array<{ id: string; label: string }> }) {
  return {
    categoryTree,
    fixedAttributeCodes: FIXED_CUSTOM_ATTRIBUTE_CODES,
    attributeDefinitions: ATTRIBUTE_DEFINITIONS,
    compatibilityOptions,
  };
}

function flattenCategoryTree(nodes: any[], map = new Map<string, string>()) {
  for (const node of Array.isArray(nodes) ? nodes : []) {
    if (!node) continue;
    if (node.id != null && node.name) {
      map.set(String(node.id), String(node.name));
    }
    const children = Array.isArray(node.children_data)
      ? node.children_data
      : Array.isArray(node.children)
        ? node.children
        : [];
    flattenCategoryTree(children, map);
  }
  return map;
}

async function getCategoryNameMap() {
  try {
    const tree = await safeLoadCategoryTree();
    return flattenCategoryTree(tree);
  } catch (error) {
    console.error('[ProductAdmin] Falling back to minimal category name map:', error);
    return flattenCategoryTree(normalizeCategoryTreePayload(fallbackCategories));
  }
}

function inferImageUrl(product: any, customMap: Record<string, any>) {
  const media = resolveProductMedia(product, { allowLegacy: false });
  if (media.image_url) return media.image_url;
  if (typeof product.image_url === 'string' && product.image_url.startsWith('http')) return product.image_url;
  return null;
}

function upsertCustomAttribute(customAttributes: any[], attributeCode: string, value: any) {
  const normalizedCode = String(attributeCode || '').trim();
  if (!normalizedCode) return customAttributes;

  const nextValue = value == null ? '' : value;
  const existingIndex = customAttributes.findIndex((attr) => String(attr?.attribute_code || '').trim() === normalizedCode);

  if (existingIndex >= 0) {
    customAttributes[existingIndex] = {
      ...customAttributes[existingIndex],
      attribute_code: normalizedCode,
      value: nextValue,
    };
    return customAttributes;
  }

  customAttributes.push({
    attribute_code: normalizedCode,
    value: nextValue,
  });
  return customAttributes;
}

function buildFallbackCustomAttributes(product: any): any[] {
  const values = new Map<string, any>();
  const setIfPresent = (attributeCode: string, value: any) => {
    if (value == null) return;
    if (Array.isArray(value) && value.length === 0) return;
    if (value === '') return;
    values.set(attributeCode, Array.isArray(value) ? value.join(',') : value);
  };

  setIfPresent('category_ids', normalizeCsvValues(product.category_ids));
  setIfPresent('description', product.description);
  setIfPresent('short_description', product.short_description);
  setIfPresent('special_price', product.special_price);
  setIfPresent('modelo', normalizeCsvValues(product.modelos));
  setIfPresent('ano', normalizeCsvValues(product.anos));
  setIfPresent('versao', normalizeCsvValues(product.versoes));
  setIfPresent('url_key', product.url_key);
  setIfPresent('meta_title', product.meta_title);
  setIfPresent('meta_keyword', product.meta_keyword);
  setIfPresent('meta_description', product.meta_description);
  setIfPresent('cost', product.cost);
  setIfPresent('volume_length', product.volume_length);
  setIfPresent('volume_width', product.volume_width);
  setIfPresent('volume_height', product.volume_height);
  setIfPresent('lead_time', product.lead_time);
  setIfPresent('fragile', product.fragile);
  setIfPresent('frete_gratis', product.frete_gratis);
  setIfPresent('compatibilidade', product.compatibilidade);

  return Array.from(values.entries()).map(([attribute_code, value]) => ({
    attribute_code,
    value,
  }));
}

function isCanonicalProductRecord(product: any) {
  if (!product || typeof product !== 'object') return false;
  if (product._record_shape === 'canonical' && Number(product._record_version) >= CANONICAL_RECORD_VERSION) {
    return true;
  }
  return false;
}

export async function normalizeProductRecord(input: any, existing: any = {}) {
  const merged = {
    ...existing,
    ...input,
  };
  const rawCustomAttributes = Array.isArray(merged.custom_attributes) && merged.custom_attributes.length > 0
    ? merged.custom_attributes
    : buildFallbackCustomAttributes(merged);
  let custom_attributes = normalizeCustomAttributes(rawCustomAttributes);
  let customMap = customAttributesToMap(custom_attributes);
  const compatibilityMeta = await loadCompatibilityMetaContext();
  const compatibility = resolveProductCompatibility({
    ...existing,
    ...merged,
    custom_attributes,
    custom_attributes_map: customMap,
    compatibility_entries: Array.isArray(merged.compatibility_entries)
      ? merged.compatibility_entries
      : existing.compatibility_entries,
  }, compatibilityMeta);

  custom_attributes = upsertCustomAttribute(custom_attributes, 'modelo', compatibility.legacyFields.modelo.join(','));
  custom_attributes = upsertCustomAttribute(custom_attributes, 'ano', compatibility.legacyFields.ano.join(','));
  custom_attributes = upsertCustomAttribute(custom_attributes, 'versao', compatibility.legacyFields.versao.join(','));
  custom_attributes = upsertCustomAttribute(custom_attributes, 'compatibilidade', compatibility.legacyFields.compatibilidade);
  customMap = customAttributesToMap(custom_attributes);
  const extension_attributes = {
    ...(existing.extension_attributes || {}),
    ...(merged.extension_attributes || {}),
    stock: parseStockData(merged.extension_attributes?.stock),
  };
  const categoryIds = normalizeCsvValues(customMap.category_ids);
  const categoryMap = await getCategoryNameMap();
  const specialPriceRaw = customMap.special_price;
  const specialPrice = specialPriceRaw === '' || specialPriceRaw == null ? null : Number(specialPriceRaw);
  const media_gallery_entries = normalizeMediaEntries(merged.media_gallery_entries || merged.media_gallery);
  const media = resolveProductMedia({ ...merged, media_gallery_entries }, { allowLegacy: false });
  const image_url = inferImageUrl({ ...merged, media_gallery_entries, images: media.images, image_url: media.image_url }, customMap);
  const now = new Date().toISOString();

  const normalized = {
    ...existing,
    ...merged,
    id: merged.id || normalizeSku(merged.sku) || existing.id,
    sku: normalizeSku(merged.sku) || normalizeSku(existing.sku),
    name: String(merged.name || existing.name || '').trim(),
    type_id: merged.type_id || existing.type_id || 'simple',
    attribute_set_id: Number(merged.attribute_set_id ?? existing.attribute_set_id ?? 4),
    status: Number(merged.status ?? existing.status ?? 1),
    visibility: Number(merged.visibility ?? existing.visibility ?? 4),
    price: Number(merged.price ?? existing.price ?? 0),
    weight: merged.weight === '' || merged.weight == null ? null : Number(merged.weight),
    custom_attributes,
    extension_attributes,
    media_gallery_entries,
    media_gallery: media_gallery_entries,
    category_ids: categoryIds,
    category_names: categoryIds
      .map((id) => categoryMap.get(String(id)))
      .filter((name): name is string => !!name),
    modelos: compatibility.legacyFields.modelo,
    anos: compatibility.legacyFields.ano,
    versoes: compatibility.legacyFields.versao,
    compatibility_entries: compatibility.entries,
    compatibility_review_required: compatibility.reviewRequired,
    compatibility_summary: compatibility.summary,
    compatibility_display: compatibility.compatibilityDisplay,
    compatibility_audit_bucket: compatibility.auditBucket,
    compat_models: compatibility.compatModels,
    modelo_labels: compatibility.modelLabels,
    ano_labels: compatibility.yearLabels,
    version_labels: compatibility.versionLabels,
    modelo_slugs: compatibility.modelSlugs,
    compat_years: compatibility.compatYears,
    compat_versions: compatibility.compatVersions,
    compatibilidade: compatibility.compatibilityLegacyText,
    description: customMap.description ?? merged.description ?? existing.description ?? '',
    short_description: customMap.short_description ?? merged.short_description ?? existing.short_description ?? '',
    special_price: Number.isFinite(specialPrice as number) ? specialPrice : null,
    image_url,
    images: media.images,
    has_image: media.has_image,
    _image_source: media._image_source,
    _legacy_image_paths: media._legacy_image_paths,
    _image_storage_paths: media._image_storage_paths,
    _image_sync_status: media._image_sync_status,
    has_promotion: Number.isFinite(specialPrice as number) && Number(specialPrice) > 0,
    _record_shape: 'canonical',
    _record_version: CANONICAL_RECORD_VERSION,
    created_at: existing.created_at || merged.created_at || now,
    updated_at: now,
  };

  delete normalized.custom_attributes_map;
  delete normalized.stock_data;

  return normalized;
}

async function listStoredProductRows(offset: number, limit: number) {
  const safeOffset = Math.max(0, Number(offset) || 0);
  const safeLimit = Math.max(1, Math.min(Number(limit) || 100, 250));
  const { data, error } = await withAdminTimeout(
    supabase
      .from('kv_store_1d6e33e0')
      .select('key,value')
      .like('key', `${PRODUCT_PREFIX}%`)
      .order('key')
      .range(safeOffset, safeOffset + safeLimit - 1),
    `compatibility product batch:${safeOffset}:${safeLimit}`,
    8000,
  );
  if (error) throw new Error(error.message);
  return Array.isArray(data) ? data : [];
}

async function getStoredProductCount() {
  const { count, error } = await withAdminTimeout(
    supabase
      .from('kv_store_1d6e33e0')
      .select('*', { count: 'exact', head: true })
      .like('key', `${PRODUCT_PREFIX}%`),
    'compatibility product count',
    8000,
  );
  if (error) throw new Error(error.message);
  return Number(count || 0);
}

function buildCompatibilityAuditRow(product: any, compatibility: ReturnType<typeof resolveProductCompatibility>) {
  return {
    sku: normalizeSku(product?.sku),
    name: String(product?.name || '').trim(),
    audit_bucket: compatibility.auditBucket,
    review_required: compatibility.reviewRequired,
    entry_count: compatibility.entries.length,
    source_types: Array.from(new Set(compatibility.entries.map((entry) => entry.source_type))),
    model_slugs: compatibility.modelSlugs,
    model_labels: compatibility.modelLabels,
    year_labels: compatibility.yearLabels,
    version_labels: compatibility.versionLabels,
    compatibility_display: compatibility.compatibilityDisplay,
    compatibility_legacy_text: compatibility.compatibilityLegacyText,
    record_version: Number(product?._record_version || 0),
    updated_at: product?.updated_at || null,
  };
}

function summarizeCompatibilityRows(rows: Array<{ audit_bucket: string; review_required: boolean; entry_count: number }>) {
  const buckets = {
    ok_structured: 0,
    legacy_only: 0,
    toyota_only: 0,
    ambiguous: 0,
    empty: 0,
  };
  let reviewRequired = 0;
  let withEntries = 0;

  for (const row of rows) {
    if (row.audit_bucket in buckets) {
      buckets[row.audit_bucket as keyof typeof buckets] += 1;
    }
    if (row.review_required) reviewRequired += 1;
    if (row.entry_count > 0) withEntries += 1;
  }

  return {
    buckets,
    review_required: reviewRequired,
    with_entries: withEntries,
    empty_entries: Math.max(0, rows.length - withEntries),
  };
}

function buildCompatibilityFingerprint(product: any) {
  return JSON.stringify({
    version: Number(product?._record_version || 0),
    entries: Array.isArray(product?.compatibility_entries) ? product.compatibility_entries : [],
    review_required: !!product?.compatibility_review_required,
    audit_bucket: product?.compatibility_audit_bucket || '',
    model_slugs: Array.isArray(product?.modelo_slugs) ? product.modelo_slugs : [],
    compat_years: Array.isArray(product?.compat_years) ? product.compat_years : [],
    compat_versions: Array.isArray(product?.compat_versions) ? product.compat_versions : [],
    legacy_modelos: Array.isArray(product?.modelos) ? product.modelos : [],
    legacy_anos: Array.isArray(product?.anos) ? product.anos : [],
    legacy_versoes: Array.isArray(product?.versoes) ? product.versoes : [],
    compatibilidade: String(product?.compatibilidade || ''),
  });
}

async function fetchMagentoProductBySku(sku: string) {
  try {
    return await fetchMagento(`/V1/products/${encodeURIComponent(sku)}`);
  } catch (error) {
    console.warn(`[ProductAdmin] Magento read fallback failed for ${sku}:`, error);
    return null;
  }
}

async function getIndexedProductDetail(sku: string) {
  if (!meili.isConfigured()) return null;
  try {
    return await meili.getDocument(sku);
  } catch (error) {
    console.warn(`[ProductAdmin] MeiliSearch detail fallback failed for ${sku}:`, error);
    return null;
  }
}

async function getEditorProductDetail(sku: string) {
  const normalizedSku = normalizeSku(sku);
  if (!normalizedSku) return null;

  const stored = await getProduct(normalizedSku);
  if (stored) {
    return stored;
  }

  const indexedProduct = await getIndexedProductDetail(normalizedSku);
  if (indexedProduct) {
    return indexedProduct;
  }

  return await fetchMagentoProductBySku(normalizedSku);
}

async function getCanonicalProductDetail(sku: string) {
  const normalizedSku = normalizeSku(sku);
  if (!normalizedSku) return null;

  const stored = await getProduct(normalizedSku);
  if (stored && isCanonicalProductRecord(stored)) {
    return stored;
  }

  if (stored) {
    try {
      const fallbackCanonical = await normalizeProductRecord(stored, stored);
      await kv.set(`${PRODUCT_PREFIX}${normalizedSku}`, fallbackCanonical).catch((error) => {
        console.warn(`[ProductAdmin] Fallback cache write skipped for ${normalizedSku}:`, error);
      });
      return fallbackCanonical;
    } catch (error) {
      console.warn(`[ProductAdmin] Stored product normalization failed for ${normalizedSku}, trying Magento fallback:`, error);
    }
  }

  const indexedProduct = await getIndexedProductDetail(normalizedSku);
  if (indexedProduct) {
    try {
      const indexedCanonical = await normalizeProductRecord(indexedProduct, indexedProduct);
      await kv.set(`${PRODUCT_PREFIX}${normalizedSku}`, indexedCanonical).catch((error) => {
        console.warn(`[ProductAdmin] Indexed cache write skipped for ${normalizedSku}:`, error);
      });
      return indexedCanonical;
    } catch (error) {
      console.warn(`[ProductAdmin] Indexed product normalization failed for ${normalizedSku}, trying Magento fallback:`, error);
    }
  }

  const magentoProduct = await fetchMagentoProductBySku(normalizedSku);
  if (magentoProduct) {
    const canonical = await normalizeProductRecord(magentoProduct, stored || {});
    await kv.set(`${PRODUCT_PREFIX}${normalizedSku}`, canonical).catch((error) => {
      console.warn(`[ProductAdmin] Cache write skipped for ${normalizedSku}:`, error);
    });
    return canonical;
  }

  return null;
}

export async function syncProductIndex(product: any) {
  if (!meili.isConfigured()) return;
  try {
    await meili.setupIndexIfNeeded();
    const doc = meili.transformProduct(product);
    if (!doc?.id) {
      console.warn('[ProductAdmin] Produto sem id valido para indexacao Meili:', product?.sku);
      return;
    }
    await meili.indexDocuments([doc]);
  } catch (error) {
    console.error('[ProductAdmin] Falha ao sincronizar produto no MeiliSearch:', error);
  }
}

// ─── AI Enrichment Logic ─────────────────────────────────────────────────────

async function enrichProductData(product: any) {
  if (!OPENAI_API_KEY) throw new Error("OpenAI API Key not configured");

  const prompt = `Você é o Diretor de Catálogo da Toyoparts, focado em uma experiência de luxo inspirada na Apple para peças genuínas Toyota.
Sua missão é transformar dados técnicos brutos em uma vitrine de precisão e confiança.

PRODUTO ATUAL:
Nome: ${product.name}
SKU: ${product.sku}
Descrição Atual: ${product.description || 'Nenhuma'}
Dados Brutos (Catalog): ${JSON.stringify(product.raw || {}, null, 2)}

DIRETRIZES DE DESIGN E CONTEÚDO:
1. NOME PREMIUM: Remova códigos, siglas e lixo de sistema. Deve ser limpo: "Amortecedor Dianteiro - Corolla (2020-2023)".
2. DESCRIÇÃO NARRATIVA: Escreva como se estivesse descrevendo uma peça de engenharia de alta performance. Use parágrafos curtos, elegantes e focados na "Paz de Espírito" que uma peça genuína traz.
3. BULLET POINTS DE ENGENHARIA: Foque em durabilidade, encaixe perfeito e segurança.
4. ESPECIFICAÇÕES TÉCNICAS: Extraia dados como material, peso, dimensões, lado (se houver), posição e códigos de compatibilidade cruzada.
5. TOM DE VOZ: Autoritário, Minimalista, Sofisticado.

ESTRUTURA DE RETORNO (JSON APENAS):
{
  "name": "Nome Refinado",
  "description": "Texto descritivo longo e elegante",
  "short_description": "Um resumo de impacto em uma frase",
  "specifications": [
    { "label": "Posição", "value": "Dianteira" },
    { "label": "Lado", "value": "Esquerdo (Motorista)" }
  ],
  "compatibility_notes": "Série Corolla 2020+, motores 1.8 e 2.0 Hybrid",
  "seo": {
    "title": "Peça Genuína Toyota | Nome do Produto",
    "description": "Descrição focada em conversão para Google"
  },
  "tags": ["Peças Genuínas", "Suspensão", "Segurança"]
}`;

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: 'Você é um assistente de catálogo de e-commerce.' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.7,
      }),
    });

    if (!res.ok) throw new Error(`OpenAI Error: ${await res.text()}`);
    const data = await res.json();
    const content = data.choices[0].message.content;
    const jsonStr = content.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
    return JSON.parse(jsonStr);
  } catch (error) {
    console.error('Enrichment failed:', error);
    throw error;
  }
}

// ─── Metadata Helpers ────────────────────────────────────────────────────────

// Get unique values for a specific field across all products
async function getUniqueMetadata(field: string) {
  const cacheKey = `meta:unique:${field}`;
  const cached = await kv.get(cacheKey);
  if (cached && (Date.now() - new Date(cached.updated_at).getTime() < 3600000)) {
    return cached.values;
  }

  const values = new Set<string>();
  let offset = 0;
  const batchSize = 1000;

  while (true) {
    const { data, error } = await supabase
      .from('kv_store_1d6e33e0')
      .select('value')
      .like('key', `${PRODUCT_PREFIX}%`)
      .range(offset, offset + batchSize - 1);

    if (error || !data || data.length === 0) break;

    for (const item of data) {
      const prod = item.value;
      
      // Support nested fields (e.g. raw.position)
      let fieldValues;
      if (field.startsWith('raw.')) {
        fieldValues = prod.raw?.[field.split('.')[1]];
      } else {
        fieldValues = prod[field];
      }

      if (Array.isArray(fieldValues)) {
        fieldValues.forEach(v => {
          if (v) values.add(String(v).trim());
        });
      } else if (fieldValues !== undefined && fieldValues !== null) {
        if (typeof fieldValues === 'string') {
          fieldValues.split(',').forEach(v => {
            if (v) values.add(v.trim());
          });
        } else {
          values.add(String(fieldValues));
        }
      }
    }

    if (data.length < batchSize) break;
    offset += batchSize;
  }

  const sortedValues = Array.from(values).sort();
  await kv.set(cacheKey, { values: sortedValues, updated_at: new Date().toISOString() });
  return sortedValues;
}

// ─── Category Tree Sync ─────────────────────────────────────────────────────

async function fetchMagentoCategories() {
  if (!MAGENTO_TOKEN) {
    console.warn('⚠️ MAGENTO_TOKEN missing, cannot fetch categories');
    return normalizeCategoryTreePayload(fallbackCategories);
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);

  try {
    const res = await fetch(`${MAGENTO_BASE_URL}/rest/V1/categories`, {
      headers: { 'Authorization': `Bearer ${MAGENTO_TOKEN}` },
      signal: controller.signal,
    });

    if (!res.ok) throw new Error(`Magento API Error: ${res.status}`);
    
    const root = await res.json();
    
    // Transform Magento tree to our simple structure
    const transform = (node: any): any => ({
      id: node.id,
      name: node.name,
      level: node.level,
      is_active: node.is_active !== false,
      children_data: Array.isArray(node.children_data || node.children) 
        ? (node.children_data || node.children).filter((c: any) => c.is_active).map(transform) 
        : []
    });

    const tree = transform(root);
    return normalizeCategoryTreePayload(tree);
  } catch (error) {
    console.error('Failed to fetch Magento categories:', error);
    return normalizeCategoryTreePayload(fallbackCategories);
  } finally {
    clearTimeout(timeoutId);
  }
}

// Minimal fallback if Magento fails — usa children_data para consistência com o cache
const fallbackCategories = [
  {
    id: 2,
    name: "Default Category",
    children_data: [
      { id: 3, name: "Acessórios", children_data: [
        { id: 33, name: "Acessórios Externos Cromados", children_data: [] },
        { id: 34, name: "Aerofólios, Spoilers e Antenas", children_data: [] },
        { id: 35, name: "Alarme e Segurança", children_data: [] }
      ]},
      { id: 4, name: "Modelos", children_data: [
        { id: 10, name: "Corolla", children_data: [] },
        { id: 11, name: "Hilux", children_data: [] },
        { id: 12, name: "Etios", children_data: [] },
        { id: 13, name: "Yaris", children_data: [] },
        { id: 14, name: "RAV4", children_data: [] }
      ]}
    ]
  }
];

// ─── Routes ──────────────────────────────────────────────────────────────────

// List / search products via Meilisearch (or KV fallback)
productAdmin.get('/', async (c) => {
  const t0 = Date.now();
  try {
    const q = c.req.query('q') || '';
    const limit = Math.min(parseInt(c.req.query('limit') || '24'), 200);
    const offset = parseInt(c.req.query('offset') || '0');
    const sortParam = c.req.query('sort') || '';

    // Build Meilisearch filter array
    const filterParts: string[] = [];

    const status = c.req.query('status');
    if (status) filterParts.push(`status = ${status}`);

    const inStock = c.req.query('inStock');
    if (inStock === 'true') filterParts.push('in_stock = true');
    else if (inStock === 'false') filterParts.push('in_stock = false');

    const categories = c.req.query('categories');
    if (categories) {
      const catIds = categories.split(',').map(s => s.trim()).filter(Boolean);
      if (catIds.length === 1) filterParts.push(`category_ids = "${catIds[0]}"`);
      else if (catIds.length > 1) filterParts.push(`category_ids IN [${catIds.map(id => `"${id}"`).join(',')}]`);
    }

    const modelos = c.req.query('modelos');
    if (modelos) {
      const vals = modelos.split(',').map(s => s.trim()).filter(Boolean);
      if (vals.length === 1) filterParts.push(`modelos = "${vals[0]}"`);
      else if (vals.length > 1) filterParts.push(`modelos IN [${vals.map(v => `"${v}"`).join(',')}]`);
    }

    const anos = c.req.query('anos');
    if (anos) {
      const vals = anos.split(',').map(s => s.trim()).filter(Boolean);
      if (vals.length === 1) filterParts.push(`anos = "${vals[0]}"`);
      else if (vals.length > 1) filterParts.push(`anos IN [${vals.map(v => `"${v}"`).join(',')}]`);
    }

    const minPrice = c.req.query('minPrice');
    if (minPrice) filterParts.push(`price >= ${parseFloat(minPrice)}`);
    const maxPrice = c.req.query('maxPrice');
    if (maxPrice) filterParts.push(`price <= ${parseFloat(maxPrice)}`);

    const typeId = c.req.query('type_id');
    if (typeId) filterParts.push(`type_id = "${typeId}"`);

    const hasPromotion = c.req.query('hasPromotion');
    if (hasPromotion === 'true') filterParts.push('special_price IS NOT NULL');

    const hasImage = c.req.query('hasImage');
    if (hasImage === 'true') filterParts.push('image_url IS NOT NULL');
    else if (hasImage === 'false') filterParts.push('image_url IS NULL');

    // noCategory: produtos sem nenhuma categoria atribuída
    const noCategory = c.req.query('noCategory');
    if (noCategory === 'true') filterParts.push('category_ids IS EMPTY');

    // Build search query — merge column-level name/sku filters into q
    let searchQuery = q;
    const nameFilter = c.req.query('name');
    const skuFilter = c.req.query('sku');
    // Se temos filtro de nome ou sku, adicionamos ao q para full-text search
    if (nameFilter && !searchQuery) searchQuery = nameFilter;
    if (skuFilter && !searchQuery) searchQuery = skuFilter;
    // Se ambos existem, concatena (Meilisearch faz AND implícito)
    if (nameFilter && skuFilter) searchQuery = `${skuFilter} ${nameFilter}`;
    else if (nameFilter && q) searchQuery = `${q} ${nameFilter}`;
    else if (skuFilter && q) searchQuery = `${q} ${skuFilter}`;

    // Build sort
    const sort: string[] = [];
    if (sortParam) {
      const [field, dir] = sortParam.split(':');
      const meiliField = field === 'stock' ? 'in_stock' : field;
      sort.push(`${meiliField}:${dir || 'asc'}`);
    }

    // Try Meilisearch first
    if (meili.isConfigured()) {
      try {
        const result = await meili.search(searchQuery, { limit, offset, filter: filterParts, sort });
        return c.json({
          hits: result.hits || [],
          totalHits: result.estimatedTotalHits || result.totalHits || 0,
          facetDistribution: result.facetDistribution || {},
          processingTimeMs: result.processingTimeMs || (Date.now() - t0),
          limit, offset,
        });
      } catch (meiliErr: any) {
        console.warn('[ProductAdmin] Meilisearch search failed, falling back to KV:', meiliErr.message);
      }
    }

    // KV fallback: scan products from database
    console.log('[ProductAdmin] Using KV fallback for product listing');
    const { data: rows, error } = await supabase.from('kv_store_1d6e33e0')
      .select('value').like('key', `${PRODUCT_PREFIX}%`).order('key')
      .range(offset, offset + limit - 1);
    if (error) throw error;

    const { count } = await supabase.from('kv_store_1d6e33e0')
      .select('*', { count: 'exact', head: true }).like('key', `${PRODUCT_PREFIX}%`);

    const hits = (rows || []).map((r: any) => {
      const p = r.value;
      return {
        id: p.sku || p.id,
        sku: p.sku,
        name: p.name,
        price: p.price,
        special_price: p.special_price || null,
        status: p.status ?? 1,
        type_id: p.type_id || 'simple',
        in_stock: !!(p.extension_attributes?.stock?.is_in_stock),
        category_ids: p.category_ids || [],
        category_names: p.category_names || [],
        modelos: p.modelos || [],
        anos: p.anos || [],
        color: p.color || null,
        image_url: p.image_url || null,
        description: p.description || '',
        short_description: p.short_description || '',
      };
    });

    return c.json({
      hits, totalHits: count || hits.length,
      facetDistribution: {}, processingTimeMs: Date.now() - t0,
      limit, offset, _source: 'kv_fallback',
    });
  } catch (err: any) {
    console.error('[ProductAdmin] List error:', err);
    return c.json({ error: err.message, hits: [], totalHits: 0, facetDistribution: {}, processingTimeMs: Date.now() - t0, limit: 24, offset: 0 }, 500);
  }
});

// Get metadata options for filters/editor
productAdmin.get('/metadata/:field', async (c) => {
  const field = c.req.param('field');
  const values = await getUniqueMetadata(field);
  return c.json(values);
});

// Get category tree
productAdmin.get('/metadata/structure/tree', async (c) => {
  const tree = await safeLoadCategoryTree();
  return c.json(tree || []);
});

productAdmin.get('/schema', async (c) => {
  try {
    const categoryTree = await safeLoadCategoryTree();
    const compatibilityMeta = await loadCompatibilityMetaContext();
    return c.json(buildEditorSchema(categoryTree, buildCompatibilitySchemaOptions(compatibilityMeta)));
  } catch (error: any) {
    console.error('[ProductAdmin] Schema fallback failed:', error);
    const compatibilityMeta = await loadCompatibilityMetaContext();
    return c.json(buildEditorSchema(normalizeCategoryTreePayload(fallbackCategories), buildCompatibilitySchemaOptions(compatibilityMeta)));
  }
});

productAdmin.get('/compatibility/audit', async (c) => {
  try {
    const limit = Math.max(1, Math.min(parseInt(c.req.query('limit') || '100', 10) || 100, 250));
    const offset = Math.max(0, parseInt(c.req.query('offset') || '0', 10) || 0);
    const requestedBuckets = (c.req.query('buckets') || '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
    const reviewRequiredParam = (c.req.query('review_required') || '').trim().toLowerCase();
    const skuFilter = normalizeSku(c.req.query('sku'));
    const compatibilityMeta = await loadCompatibilityMetaContext();
    const totalProducts = skuFilter ? 1 : await getStoredProductCount();

    let products: any[] = [];
    if (skuFilter) {
      const product = await getProduct(skuFilter);
      products = product ? [product] : [];
    } else {
      const rows = await listStoredProductRows(offset, limit);
      products = rows.map((row: any) => row?.value).filter(Boolean);
    }

    const auditRows = products
      .map((product) => {
        const compatibility = resolveProductCompatibility(product, compatibilityMeta);
        return buildCompatibilityAuditRow(product, compatibility);
      })
      .filter((row) => {
        if (requestedBuckets.length > 0 && !requestedBuckets.includes(row.audit_bucket)) return false;
        if (reviewRequiredParam === 'true' && !row.review_required) return false;
        if (reviewRequiredParam === 'false' && row.review_required) return false;
        return true;
      });

    return c.json({
      rows: auditRows,
      summary: summarizeCompatibilityRows(auditRows),
      offset,
      limit,
      nextOffset: skuFilter ? null : offset + products.length,
      totalProducts,
      filters: {
        sku: skuFilter || null,
        buckets: requestedBuckets,
        review_required: reviewRequiredParam || null,
      },
    });
  } catch (error: any) {
    console.error('[ProductAdmin] Compatibility audit failed:', error);
    return c.json({ error: error?.message || 'Compatibility audit failed' }, 500);
  }
});

productAdmin.post('/compatibility/backfill', async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const limit = Math.max(1, Math.min(parseInt(String(body?.limit ?? '50'), 10) || 50, 200));
    const offset = Math.max(0, parseInt(String(body?.offset ?? '0'), 10) || 0);
    const dryRun = String(body?.dryRun ?? 'false').toLowerCase() === 'true' || body?.dryRun === true;
    const reindex = body?.reindex !== false;
    const requestedBuckets = Array.isArray(body?.buckets)
      ? body.buckets.map((item: any) => String(item || '').trim()).filter(Boolean)
      : [];
    const requestedSkus = Array.isArray(body?.skus)
      ? body.skus.map((item: any) => normalizeSku(item)).filter(Boolean)
      : [];
    const reviewRequiredOnly = String(body?.reviewRequiredOnly ?? 'false').toLowerCase() === 'true' || body?.reviewRequiredOnly === true;
    const compatibilityMeta = await loadCompatibilityMetaContext();

    let products: any[] = [];
    if (requestedSkus.length > 0) {
      for (const sku of requestedSkus) {
        const product = await getProduct(sku);
        if (product) products.push(product);
      }
    } else {
      const rows = await listStoredProductRows(offset, limit);
      products = rows.map((row: any) => row?.value).filter(Boolean);
    }

    const filteredProducts = products.filter((product) => {
      const compatibility = resolveProductCompatibility(product, compatibilityMeta);
      if (requestedBuckets.length > 0 && !requestedBuckets.includes(compatibility.auditBucket)) return false;
      if (reviewRequiredOnly && !compatibility.reviewRequired) return false;
      return true;
    });

    const touchedRows: any[] = [];
    const reindexDocs: any[] = [];
    let updated = 0;
    let unchanged = 0;
    let failed = 0;

    for (const product of filteredProducts) {
      const sku = normalizeSku(product?.sku);
      if (!sku) continue;

      try {
        const beforeFingerprint = buildCompatibilityFingerprint(product);
        const normalized = await normalizeProductRecord(product, product);
        const afterFingerprint = buildCompatibilityFingerprint(normalized);
        const changed = beforeFingerprint !== afterFingerprint || !isCanonicalProductRecord(product);
        const compatibility = resolveProductCompatibility(normalized, compatibilityMeta);
        const auditRow = buildCompatibilityAuditRow(normalized, compatibility);

        touchedRows.push({
          ...auditRow,
          changed,
        });

        if (changed) {
          updated += 1;
          if (!dryRun) {
            await kv.set(`${PRODUCT_PREFIX}${sku}`, normalized);
            if (reindex && meili.isConfigured()) {
              const doc = meili.transformProduct(normalized);
              if (doc?.id) reindexDocs.push(doc);
            }
          }
        } else {
          unchanged += 1;
        }
      } catch (error: any) {
        failed += 1;
        touchedRows.push({
          sku,
          audit_bucket: 'ambiguous',
          review_required: true,
          changed: false,
          error: error?.message || String(error),
        });
      }
    }

    let indexError: string | null = null;
    if (!dryRun && reindexDocs.length > 0) {
      try {
        await meili.setupIndexIfNeeded();
        await meili.indexDocuments(reindexDocs);
      } catch (error: any) {
        indexError = error?.message || String(error);
        console.error('[ProductAdmin] Compatibility backfill Meili sync failed:', error);
      }
    }

    return c.json({
      success: true,
      dryRun,
      processed: filteredProducts.length,
      updated,
      unchanged,
      failed,
      indexError,
      summary: summarizeCompatibilityRows(
        touchedRows.filter((row) => typeof row?.audit_bucket === 'string') as Array<{ audit_bucket: string; review_required: boolean; entry_count: number }>
      ),
      rows: touchedRows,
      offset,
      limit,
      nextOffset: requestedSkus.length > 0 ? null : offset + products.length,
      filters: {
        buckets: requestedBuckets,
        reviewRequiredOnly,
        skus: requestedSkus,
      },
    });
  } catch (error: any) {
    console.error('[ProductAdmin] Compatibility backfill failed:', error);
    return c.json({ error: error?.message || 'Compatibility backfill failed' }, 500);
  }
});

// Create product
productAdmin.post('/', async (c) => {
  const payload = await c.req.json();
  const sku = normalizeSku(payload?.sku);
  const name = String(payload?.name || '').trim();

  if (!sku) return c.json({ error: 'SKU obrigatorio' }, 400);
  if (!name) return c.json({ error: 'Nome do produto obrigatorio' }, 400);

  const existing = await getProduct(sku);
  if (existing) return c.json({ error: 'Ja existe um produto com esse SKU' }, 409);

  const createdProduct = await normalizeProductRecord({
    ...payload,
    id: payload?.id || sku,
    sku,
    name,
    type_id: payload?.type_id || 'simple',
    attribute_set_id: payload?.attribute_set_id ?? 4,
    status: payload?.status ?? 1,
    visibility: payload?.visibility ?? 4,
    media_gallery_entries: payload?.media_gallery_entries || [],
    media_gallery: payload?.media_gallery || [],
    extension_attributes: {
      ...(payload?.extension_attributes || {}),
      stock: payload?.extension_attributes?.stock ?? {
        is_in_stock: 1,
        manage_stock: 1,
        qty: 0,
      },
    },
  });

  await kv.set(`${PRODUCT_PREFIX}${sku}`, createdProduct);
  await syncProductIndex(createdProduct);

  return c.json({ success: true, product: createdProduct }, 201);
});

productAdmin.get('/:sku/detail', async (c) => {
  const sku = c.req.param('sku');
  const product = await getCanonicalProductDetail(sku);
  if (!product) return c.json({ error: 'Product not found' }, 404);
  return c.json(product);
});

// Get full product data (canonical)
productAdmin.get('/:sku', async (c) => {
  const sku = c.req.param('sku');
  const product = await getCanonicalProductDetail(sku);
  if (!product) return c.json({ error: 'Product not found' }, 404);
  return c.json(product);
});

// Update product
productAdmin.patch('/:sku', async (c) => {
  const sku = c.req.param('sku');
  const updates = await c.req.json();
  const existing = await getCanonicalProductDetail(sku);
  
  if (!existing) return c.json({ error: 'Product not found' }, 404);

  // Save to history before update
  const historyTimestamp = Date.now();
  await kv.set(`${HISTORY_PREFIX}${sku}:${historyTimestamp}`, {
    ...existing,
    snapshot_at: new Date().toISOString(),
    change_type: updates._is_revert ? 'revert' : (updates._is_ai ? 'ai' : 'manual')
  });

  // Remove internal flags if they exist
  const { _is_revert, _is_ai, ...cleanUpdates } = updates;

  const updatedProduct = await normalizeProductRecord(cleanUpdates, existing);

  await kv.set(`${PRODUCT_PREFIX}${sku}`, updatedProduct);
  await syncProductIndex(updatedProduct);
  
  return c.json({ success: true, product: updatedProduct });
});

// Get product history
productAdmin.get('/:sku/history', async (c) => {
  const sku = c.req.param('sku');
  const history = await kv.getByPrefix(`${HISTORY_PREFIX}${sku}:`);
  return c.json(history.sort((a: any, b: any) => 
    new Date(b.snapshot_at).getTime() - new Date(a.snapshot_at).getTime()
  ));
});

// Upload product image
productAdmin.post('/:sku/upload-image', async (c) => {
  const sku = c.req.param('sku');
  const existing = await getCanonicalProductDetail(sku);
  if (!existing) return c.json({ error: 'Product not found' }, 404);

  try {
    await ensureBucket();
    const formData = await c.req.parseBody();
    const file = formData['file'] as File;
    if (!file) return c.json({ error: 'No file uploaded' }, 400);

    const productSlug = slugifyFilePart(existing.name || sku);
    const skuSlug = slugifyFilePart(sku);
    const isWebp = file.type === 'image/webp' || file.name.toLowerCase().endsWith('.webp');
    const ext = isWebp ? 'webp' : (file.name.split('.').pop() || 'jpg').toLowerCase();
    const fileName = `${productSlug}-${skuSlug}-${Date.now()}.${ext}`;
    const filePath = `products/${sku}/${fileName}`;

    const { data, error } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(filePath, file, {
        contentType: isWebp ? 'image/webp' : file.type,
        upsert: true
      });

    if (error) throw error;

    const { data: { publicUrl } } = supabase.storage
      .from(BUCKET_NAME)
      .getPublicUrl(filePath);

    // Add to gallery and set as main if no image exists
    const mediaEntry = {
      file: publicUrl, 
      label: existing.name || 'Upload Admin',
      position: (existing.media_gallery?.length || 0) + 1,
      media_type: 'image',
      disabled: false
    };

    const updatedMedia = [...(existing.media_gallery || []), mediaEntry];
    const updatedGalleryEntries = [...(existing.media_gallery_entries || []), mediaEntry];

    const updatedProduct = await normalizeProductRecord({
      ...existing,
      image_url: existing.image_url || publicUrl,
      media_gallery: updatedMedia,
      media_gallery_entries: updatedGalleryEntries,
    }, existing);

    await kv.set(`${PRODUCT_PREFIX}${sku}`, updatedProduct);
    await syncProductIndex(updatedProduct);

    return c.json({ success: true, url: publicUrl, product: updatedProduct });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// Bulk status update
productAdmin.post('/bulk-status', async (c) => {
  const { skus, status } = await c.req.json();
  if (!Array.isArray(skus)) return c.json({ error: 'Invalid SKUs' }, 400);

  const promises = skus.map(async (sku) => {
    const existing = await getProduct(sku);
    if (existing) {
      await kv.set(`${PRODUCT_PREFIX}${sku}`, {
        ...existing,
        status,
        updated_at: new Date().toISOString()
      });
    }
  });

  await Promise.all(promises);
  return c.json({ success: true });
});

// AI Enrichment
productAdmin.post('/:sku/enrich', async (c) => {
  const sku = c.req.param('sku');
  const product = await getProduct(sku);
  
  if (!product) return c.json({ error: 'Product not found' }, 404);

  try {
    const enrichedData = await enrichProductData(product);
    return c.json({ success: true, enrichedData });
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});
