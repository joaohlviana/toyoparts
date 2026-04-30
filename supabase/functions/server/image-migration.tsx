import { Hono } from 'npm:hono';
import { createClient } from 'jsr:@supabase/supabase-js@2.49.8';
import * as kv from './kv_store.tsx';
import * as meili from './meilisearch.tsx';
import {
  BANNER_IMAGES_BUCKET,
  BANNER_INDEX_KEY,
  BANNER_PREFIX,
  CATEGORY_IMAGES_BUCKET,
  CATEGORY_IMAGES_MAP_KEY,
  CATEGORY_IMAGE_SOURCES,
  IMAGE_SYNC_LEGACY_KEY,
  IMAGE_SYNC_STATUS_KEY,
  MODEL_IMAGES_BUCKET,
  MODEL_IMAGES_MAP_KEY,
  MODEL_IMAGE_SOURCES,
  PRODUCT_IMAGE_SYNC_BUCKET,
  PRODUCT_UPLOAD_BUCKET,
} from './media-config.tsx';
import {
  buildStoragePublicUrl,
  buildLegacyProductImageUrl,
  extractProductLegacyImagePaths,
  inferRemoteImageExtension,
  isCanonicalBannerUrl,
  isCanonicalCategoryUrl,
  isCanonicalModelUrl,
  isCanonicalProductImageUrl,
  isLegacyMediaUrl,
  parseStoragePublicUrl,
  resolveProductMedia,
  sanitizeStorageKeySegment,
} from './media-utils.tsx';

type MediaScope = 'products' | 'categories' | 'models' | 'banners';
type RequestedScope = MediaScope | 'all';

interface ScopeSyncStatus {
  total: number;
  processed: number;
  synced: number;
  skipped: number;
  missing: number;
  errors: number;
  progress: number;
  cursor_last_key?: string | null;
  offset?: number;
  status: 'pending' | 'running' | 'completed';
  started_at?: string;
  completed_at?: string;
  sample_pending?: string[];
}

interface MediaSyncStatus {
  status: 'idle' | 'running' | 'completed' | 'error';
  scope: RequestedScope;
  scopes: MediaScope[];
  current_scope: MediaScope | null;
  scope_results: Record<MediaScope, ScopeSyncStatus>;
  progress: number;
  started_at?: string;
  updated_at?: string;
  completed_at?: string;
  failed_at?: string;
  error?: string;
}

interface AuditScopeResult {
  total: number;
  canonical_storage: number;
  legacy_domain: number;
  external_noncanonical: number;
  missing_image: number;
  broken_storage_refs: number;
  pending_samples: string[];
  meili_legacy?: number;
  meili_external?: number;
  no_image_catalog?: number;
  blocking_missing_image?: number;
  sync_errors?: number;
  cutoverReady: boolean;
}

const app = new Hono();
const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

const PRODUCT_STEP_BATCH = 50;
const GENERIC_STEP_BATCH = 25;
const PRODUCT_CONCURRENCY = 4;
const ALL_SCOPES: MediaScope[] = ['products', 'categories', 'models', 'banners'];
const BANNER_IMAGE_FIELDS = ['imageUrl', 'image_url', 'desktopImageSrc', 'mobileImageSrc', 'bgImageSrc', 'productImageSrc'];
const IMAGE_AUDIT_CACHE_KEY = 'meta:image_audit_cache';

function emptyStatus(scope: RequestedScope = 'all'): MediaSyncStatus {
  return {
    status: 'idle',
    scope,
    scopes: [],
    current_scope: null,
    scope_results: {
      products: createScopeStatus(0),
      categories: createScopeStatus(0),
      models: createScopeStatus(0),
      banners: createScopeStatus(0),
    },
    progress: 0,
    updated_at: nowIso(),
  };
}

function nowIso() {
  return new Date().toISOString();
}

function uniqueStrings(values: Array<string | null | undefined>) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const normalized = String(value || '').trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

function sanitizeMeiliSkuId(raw: string | null | undefined) {
  if (!raw) return null;
  const sanitized = String(raw).trim().replace(/[^a-zA-Z0-9\-_]/g, '');
  return sanitized || null;
}

function resolveRequestedScopes(scope: RequestedScope): MediaScope[] {
  return scope === 'all' ? [...ALL_SCOPES] : [scope];
}

function createScopeStatus(total = 0): ScopeSyncStatus {
  return {
    total,
    processed: 0,
    synced: 0,
    skipped: 0,
    missing: 0,
    errors: 0,
    progress: 0,
    status: total === 0 ? 'completed' : 'pending',
    cursor_last_key: null,
    offset: 0,
    sample_pending: [],
  };
}

async function countProducts() {
  const { count, error } = await supabase
    .from('kv_store_1d6e33e0')
    .select('*', { count: 'exact', head: true })
    .like('key', 'product:%');
  if (error) throw new Error(error.message);
  return count ?? 0;
}

async function countCategories() {
  const overrides = await kv.get(CATEGORY_IMAGES_MAP_KEY).catch(() => ({}));
  return Object.keys({ ...CATEGORY_IMAGE_SOURCES, ...(overrides || {}) }).length;
}

async function countModels() {
  const overrides = await kv.get(MODEL_IMAGES_MAP_KEY).catch(() => ({}));
  return Object.keys({ ...MODEL_IMAGE_SOURCES, ...(overrides || {}) }).length;
}

async function countBanners() {
  const ids = await kv.get(BANNER_INDEX_KEY).catch(() => []);
  return Array.isArray(ids) ? ids.length : 0;
}

async function buildInitialStatus(scope: RequestedScope): Promise<MediaSyncStatus> {
  const scopes = resolveRequestedScopes(scope);
  const totals = {
    products: scopes.includes('products') ? await countProducts() : 0,
    categories: scopes.includes('categories') ? await countCategories() : 0,
    models: scopes.includes('models') ? await countModels() : 0,
    banners: scopes.includes('banners') ? await countBanners() : 0,
  };

  const scopeResults: Record<MediaScope, ScopeSyncStatus> = {
    products: createScopeStatus(totals.products),
    categories: createScopeStatus(totals.categories),
    models: createScopeStatus(totals.models),
    banners: createScopeStatus(totals.banners),
  };

  const currentScope = scopes.find((item) => scopeResults[item].total > 0) || scopes[0] || null;
  if (currentScope) {
    scopeResults[currentScope].status = 'running';
    scopeResults[currentScope].started_at = nowIso();
  }
  const status: MediaSyncStatus = {
    status: currentScope ? 'running' : 'completed',
    scope,
    scopes,
    current_scope: currentScope,
    scope_results: scopeResults,
    progress: currentScope ? 0 : 100,
    started_at: nowIso(),
    updated_at: nowIso(),
  };
  if (!currentScope) {
    status.completed_at = nowIso();
  }
  return status;
}

async function ensureBucket(bucket: string, fileSizeLimit = 10485760) {
  const { data: buckets, error: listError } = await supabase.storage.listBuckets();
  if (listError) throw new Error(listError.message);
  const exists = buckets?.some((item) => item.name === bucket);
  if (!exists) {
    const { error } = await supabase.storage.createBucket(bucket, { public: true, fileSizeLimit });
    if (error) throw new Error(error.message);
  } else {
    await supabase.storage.updateBucket(bucket, { public: true }).catch(() => {});
  }
}

async function downloadRemoteImage(url: string): Promise<{ data: Uint8Array; contentType: string } | null> {
  let response: Response | null = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      response = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ToyopartsMediaMigration/1.0)' },
        signal: AbortSignal.timeout(20000),
      });
      if (response.ok) break;
      if (response.status === 404) return null;
    } catch {
      // retry
    }
    if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 800 * (attempt + 1)));
  }
  if (!response || !response.ok) return null;
  const blob = await response.blob();
  if (!blob.type.startsWith('image/')) return null;
  return {
    data: new Uint8Array(await blob.arrayBuffer()),
    contentType: blob.type || 'image/jpeg',
  };
}

async function uploadPublicImage(bucket: string, path: string, bytes: Uint8Array, contentType: string) {
  const { error } = await supabase.storage.from(bucket).upload(path, bytes, {
    contentType,
    cacheControl: '31536000',
    upsert: true,
  });
  if (error) throw new Error(error.message);
  return buildStoragePublicUrl(bucket, path);
}

async function downloadStorageObject(bucket: string, path: string) {
  const { data, error } = await supabase.storage.from(bucket).download(path);
  if (error || !data) {
    throw new Error(error?.message || 'storage download failed');
  }
  return data;
}

function getProductStorageFolders(sku: string) {
  return uniqueStrings([sanitizeStorageKeySegment(sku), sku]);
}

async function listProductStorageFolder(sku: string) {
  const folders = getProductStorageFolders(sku);
  const collected = new Map<string, { path: string; url: string }>();
  for (const folder of folders) {
    try {
      const { data, error } = await supabase.storage.from(PRODUCT_IMAGE_SYNC_BUCKET).list(folder, {
        limit: 30,
        sortBy: { column: 'name', order: 'asc' },
      });
      if (error || !data) continue;
      for (const item of data.filter((entry) => !!entry.name && !entry.name.startsWith('.'))) {
        const path = `${folder}/${item.name}`;
        if (collected.has(path)) continue;
        collected.set(path, { path, url: buildStoragePublicUrl(PRODUCT_IMAGE_SYNC_BUCKET, path) });
      }
    } catch {
      // continue
    }
  }
  return Array.from(collected.values()).sort((a, b) => a.path.localeCompare(b.path));
}

async function loadProductBySkuExact(sku: string) {
  const candidates = uniqueStrings([
    String(sku || '').trim(),
    String(sku || '').trim().toUpperCase(),
    sanitizeStorageKeySegment(String(sku || '').trim()),
  ]);

  for (const candidate of candidates) {
    if (!candidate) continue;
    const product = await kv.get(`product:${candidate}`).catch(() => null);
    if (product && typeof product === 'object') return product;
  }

  const normalizedSku = String(sku || '').trim().toUpperCase();
  if (!normalizedSku) return null;

  const { data, error } = await supabase
    .from('kv_store_1d6e33e0')
    .select('key, value')
    .like('key', `product:%${normalizedSku}%`)
    .limit(25);

  if (!error && Array.isArray(data) && data.length > 0) {
    const exact = data
      .map((row: any) => row?.value)
      .find((candidate: any) => String(candidate?.sku || '').trim().toUpperCase() === normalizedSku);
    if (exact && typeof exact === 'object') return exact;
  }

  return null;
}

function getImageIndexFromStoragePath(path: string) {
  const fileName = String(path || '').split('/').pop() || '';
  const match = fileName.match(/^(\d+)\./);
  return match ? Math.max(0, Number(match[1])) : 0;
}

async function streamLegacyProductImage(storagePath: string) {
  const normalizedPath = String(storagePath || '').replace(/^\/+/, '');
  const [rawSku] = normalizedPath.split('/');
  const sku = String(rawSku || '').trim();
  if (!sku) return null;

  const product = await loadProductBySkuExact(sku);
  if (!product) return null;

  const legacyPaths = extractProductLegacyImagePaths(product);
  if (legacyPaths.length === 0) return null;

  const imageIndex = getImageIndexFromStoragePath(normalizedPath);
  const legacyPath = legacyPaths[imageIndex] || legacyPaths[0];
  const legacyUrl = buildLegacyProductImageUrl(legacyPath);
  if (!legacyUrl) return null;

  const remote = await downloadRemoteImage(legacyUrl);
  if (!remote) return null;

  uploadPublicImage(PRODUCT_IMAGE_SYNC_BUCKET, normalizedPath, remote.data, remote.contentType).catch(() => {});

  return new Response(remote.data, {
    status: 200,
    headers: {
      'Content-Type': remote.contentType,
      'Cache-Control': 'public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400',
      'X-Toyoparts-Image-Source': 'legacy-fallback',
    },
  });
}

async function loadStatus(): Promise<MediaSyncStatus> {
  const stored = await kv.get(IMAGE_SYNC_STATUS_KEY).catch(() => null);
  if (!stored || typeof stored !== 'object') return emptyStatus();
  return {
    ...emptyStatus((stored as any).scope || 'all'),
    ...(stored as any),
    scope_results: {
      ...emptyStatus((stored as any).scope || 'all').scope_results,
      ...((stored as any).scope_results || {}),
    },
  };
}

async function saveStatus(status: MediaSyncStatus) {
  await kv.set(IMAGE_SYNC_STATUS_KEY, {
    ...status,
    updated_at: nowIso(),
  });
}

async function loadAuditCache() {
  const cached = await kv.get(IMAGE_AUDIT_CACHE_KEY).catch(() => null);
  if (!cached || typeof cached !== 'object') return null;
  return cached as any;
}

async function saveAuditCache(payload: any) {
  await kv.set(IMAGE_AUDIT_CACHE_KEY, payload);
}

function samplePush(target: string[], value: string, limit = 10) {
  if (!value || target.includes(value) || target.length >= limit) return;
  target.push(value);
}

function refreshOverallProgress(status: MediaSyncStatus) {
  const totals = status.scopes.reduce((acc, scope) => acc + (status.scope_results[scope]?.total || 0), 0);
  const processed = status.scopes.reduce((acc, scope) => acc + (status.scope_results[scope]?.processed || 0), 0);
  status.progress = totals > 0 ? Math.min(100, Math.round((processed / totals) * 100)) : 100;
  status.updated_at = nowIso();
}

async function reconcileProductSummary(previousStatus: string, nextStatus: string, sku: string) {
  const status = await loadStatus();
  const scopeState = status?.scope_results?.products;
  if (!scopeState) return;

  const decrement = (field: 'synced' | 'missing' | 'errors') => {
    scopeState[field] = Math.max(0, Number(scopeState[field] || 0) - 1);
  };
  const increment = (field: 'synced' | 'missing' | 'errors') => {
    scopeState[field] = Number(scopeState[field] || 0) + 1;
  };

  if (previousStatus !== nextStatus) {
    if (previousStatus === 'synced') decrement('synced');
    if (previousStatus === 'missing') decrement('missing');
    if (previousStatus === 'error') decrement('errors');

    if (nextStatus === 'synced') increment('synced');
    if (nextStatus === 'missing') increment('missing');
    if (nextStatus === 'error') increment('errors');
  }

  if (Array.isArray(scopeState.sample_pending)) {
    scopeState.sample_pending = scopeState.sample_pending.filter((item) => String(item || '') !== sku);
  }
  if ((scopeState.errors || 0) === 0) {
    scopeState.sample_pending = [];
  }

  refreshOverallProgress(status);
  await saveStatus(status);
}

function advanceScope(status: MediaSyncStatus) {
  const current = status.current_scope;
  if (current) {
    status.scope_results[current].status = 'completed';
    status.scope_results[current].completed_at = nowIso();
  }
  const next = status.scopes.find((scope) => status.scope_results[scope].status !== 'completed') || null;
  status.current_scope = next;
  if (next) {
    status.scope_results[next].status = 'running';
    status.scope_results[next].started_at = status.scope_results[next].started_at || nowIso();
  } else {
    status.status = 'completed';
    status.completed_at = nowIso();
    status.progress = 100;
  }
}

async function fetchProductRows(lastKey: string | null | undefined, limit = PRODUCT_STEP_BATCH) {
  let query = supabase
    .from('kv_store_1d6e33e0')
    .select('key, value')
    .like('key', 'product:%')
    .order('key')
    .limit(limit);
  if (lastKey) query = query.gt('key', lastKey);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data || [];
}

function pLimit<T>(items: T[], concurrency: number, worker: (item: T) => Promise<void>) {
  const queue = [...items];
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (queue.length > 0) {
      const item = queue.shift()!;
      await worker(item);
    }
  });
  return Promise.all(runners);
}

async function patchMeiliProductImage(sku: string, imageUrl: string | null, hasImage: boolean) {
  if (!meili.isConfigured()) return;
  const id = sanitizeMeiliSkuId(sku);
  if (!id) return;
  await meili.updateDocumentsPartial([{ id, image_url: imageUrl, has_image: hasImage }]).catch(() => {});
}

async function storageObjectExists(bucket: string, path: string) {
  const segments = String(path || '').split('/').filter(Boolean);
  const fileName = segments.pop();
  if (!fileName) return false;
  const folder = segments.join('/');
  const { data, error } = await supabase.storage.from(bucket).list(folder, {
    limit: 100,
    search: fileName,
  });
  if (error || !data) return false;
  return data.some((item: any) => item?.name === fileName && (item?.id || item?.metadata));
}

async function productCanonicalRefsExist(urls: string[], existingSyncPaths: Set<string>) {
  for (const url of urls) {
    const parsed = parseStoragePublicUrl(url);
    if (!parsed) return false;
    if (parsed.bucket === PRODUCT_IMAGE_SYNC_BUCKET) {
      if (!existingSyncPaths.has(parsed.path)) return false;
      continue;
    }
    if (parsed.bucket === PRODUCT_UPLOAD_BUCKET) {
      if (!(await storageObjectExists(parsed.bucket, parsed.path))) return false;
      continue;
    }
    return false;
  }
  return true;
}

async function processProductBatch(status: MediaSyncStatus) {
  const scopeState = status.scope_results.products;
  const rows = await fetchProductRows(scopeState.cursor_last_key, PRODUCT_STEP_BATCH);
  if (rows.length === 0) {
    advanceScope(status);
    return { message: 'scope_completed', batch: { processed: 0 } };
  }

  await ensureBucket(PRODUCT_IMAGE_SYNC_BUCKET, 5242880);
  const batchResults = {
    processed: 0,
    synced: 0,
    skipped: 0,
    missing: 0,
    errors: 0,
  };
  const meiliPatches: Array<{ sku: string; imageUrl: string | null; hasImage: boolean }> = [];

  await pLimit(rows, PRODUCT_CONCURRENCY, async (row) => {
    const product = row.value || {};
    const sku = String(product.sku || '').trim();
    if (!sku) {
      batchResults.processed += 1;
      batchResults.errors += 1;
      samplePush(scopeState.sample_pending || (scopeState.sample_pending = []), row.key);
      return;
    }

    try {
      const canonical = resolveProductMedia(product, { allowLegacy: false });
      const existingStorage = await listProductStorageFolder(sku);
      const existingStoragePaths = new Set(existingStorage.map((item) => item.path));

      const canonicalRefsHealthy =
        canonical.has_image &&
        canonical.images.every((url) => isCanonicalProductImageUrl(url)) &&
        await productCanonicalRefsExist(canonical.images, existingStoragePaths);

      if (canonicalRefsHealthy) {
        const nextRecord = {
          ...product,
          ...canonical,
          _image_sync_status: 'synced',
          _image_source: canonical._image_source,
          updated_at: product.updated_at || nowIso(),
        };
        await kv.set(`product:${sku}`, nextRecord);
        meiliPatches.push({ sku, imageUrl: canonical.image_url, hasImage: canonical.has_image });
        batchResults.skipped += 1;
        batchResults.processed += 1;
        return;
      }

      if (existingStorage.length > 0) {
        const syncedRecord = {
          ...product,
          image_url: existingStorage[0].url,
          images: existingStorage.map((item) => item.url),
          has_image: true,
          _image_source: 'storage',
          _legacy_image_paths: canonical._legacy_image_paths,
          _image_storage_paths: existingStorage.map((item) => item.path),
          _image_sync_status: 'synced',
          _image_synced_at: nowIso(),
          updated_at: nowIso(),
        };
        await kv.set(`product:${sku}`, syncedRecord);
        meiliPatches.push({ sku, imageUrl: syncedRecord.image_url, hasImage: true });
        batchResults.synced += 1;
        batchResults.processed += 1;
        return;
      }

      if (canonical._legacy_image_paths.length === 0) {
        const missingRecord = {
          ...product,
          image_url: null,
          images: [],
          has_image: false,
          _image_source: canonical._image_source,
          _legacy_image_paths: canonical._legacy_image_paths,
          _image_storage_paths: [],
          _image_sync_status: 'missing',
          _image_synced_at: nowIso(),
          updated_at: nowIso(),
        };
        await kv.set(`product:${sku}`, missingRecord);
        meiliPatches.push({ sku, imageUrl: null, hasImage: false });
        batchResults.missing += 1;
        batchResults.processed += 1;
        return;
      }

      const uploadedPaths: string[] = [];
      let notFound = 0;
      let failures = 0;
      const storageFolder = getProductStorageFolders(sku)[0] || sku;

      for (let index = 0; index < canonical._legacy_image_paths.length; index += 1) {
        const legacyPath = canonical._legacy_image_paths[index];
        const sourceUrl = `https://www.toyoparts.com.br/pub/media/catalog/product${legacyPath}`;
        const ext = inferRemoteImageExtension(legacyPath);
        const storagePath = `${storageFolder}/${String(index).padStart(2, '0')}.${ext}`;
        const remote = await downloadRemoteImage(sourceUrl);
        if (!remote) {
          notFound += 1;
          continue;
        }
        try {
          await uploadPublicImage(PRODUCT_IMAGE_SYNC_BUCKET, storagePath, remote.data, remote.contentType);
          uploadedPaths.push(storagePath);
        } catch {
          failures += 1;
        }
      }

      if (uploadedPaths.length > 0) {
        const urls = uploadedPaths.map((path) => buildStoragePublicUrl(PRODUCT_IMAGE_SYNC_BUCKET, path));
        const syncedRecord = {
          ...product,
          image_url: urls[0],
          images: urls,
          has_image: true,
          _image_source: 'storage',
          _legacy_image_paths: canonical._legacy_image_paths,
          _image_storage_paths: uploadedPaths,
          _image_sync_status: 'synced',
          _image_synced_at: nowIso(),
          updated_at: nowIso(),
        };
        await kv.set(`product:${sku}`, syncedRecord);
        meiliPatches.push({ sku, imageUrl: syncedRecord.image_url, hasImage: true });
        batchResults.synced += 1;
      } else if (notFound === canonical._legacy_image_paths.length && failures === 0) {
        const missingRecord = {
          ...product,
          image_url: null,
          images: [],
          has_image: false,
          _image_source: 'legacy',
          _legacy_image_paths: canonical._legacy_image_paths,
          _image_storage_paths: [],
          _image_sync_status: 'missing',
          _image_synced_at: nowIso(),
          updated_at: nowIso(),
        };
        await kv.set(`product:${sku}`, missingRecord);
        meiliPatches.push({ sku, imageUrl: null, hasImage: false });
        batchResults.missing += 1;
        samplePush(scopeState.sample_pending || (scopeState.sample_pending = []), sku);
      } else {
        const errorRecord = {
          ...product,
          _image_source: 'legacy',
          _legacy_image_paths: canonical._legacy_image_paths,
          _image_storage_paths: [],
          _image_sync_status: 'error',
          _image_sync_error: 'Falha ao baixar ou subir imagem legada',
          _image_synced_at: nowIso(),
          updated_at: nowIso(),
        };
        await kv.set(`product:${sku}`, errorRecord);
        batchResults.errors += 1;
        samplePush(scopeState.sample_pending || (scopeState.sample_pending = []), sku);
      }

      batchResults.processed += 1;
    } catch {
      batchResults.processed += 1;
      batchResults.errors += 1;
      samplePush(scopeState.sample_pending || (scopeState.sample_pending = []), sku);
    }
  });

  for (const patch of meiliPatches) {
    await patchMeiliProductImage(patch.sku, patch.imageUrl, patch.hasImage);
  }

  scopeState.processed += batchResults.processed;
  scopeState.synced += batchResults.synced;
  scopeState.skipped += batchResults.skipped;
  scopeState.missing += batchResults.missing;
  scopeState.errors += batchResults.errors;
  scopeState.cursor_last_key = rows[rows.length - 1]?.key || scopeState.cursor_last_key || null;
  scopeState.progress = scopeState.total > 0 ? Math.min(99, Math.round((scopeState.processed / scopeState.total) * 100)) : 100;
  if (scopeState.processed >= scopeState.total) {
    scopeState.progress = 100;
    advanceScope(status);
  }

  return { message: 'batch_done', batch: batchResults };
}

async function repairSingleProductBySku(rawSku: string) {
  const sku = String(rawSku || '').trim();
  if (!sku) throw new Error('SKU obrigatorio');
  const product = await loadProductBySkuExact(sku);
  if (!product) throw new Error(`Produto ${sku} nao encontrado no KV`);
  const previousSyncStatus = String(product._image_sync_status || '');
  const canonical = resolveProductMedia(product, { allowLegacy: false });
  const existingStorage = await listProductStorageFolder(sku);
  const existingStoragePaths = new Set(existingStorage.map((item) => item.path));
  const canonicalRefsHealthy =
    canonical.has_image &&
    canonical.images.every((url) => isCanonicalProductImageUrl(url)) &&
    await productCanonicalRefsExist(canonical.images, existingStoragePaths);

  if (canonicalRefsHealthy) {
    const nextRecord = {
      ...product,
      ...canonical,
      _image_sync_status: 'synced',
      _image_source: canonical._image_source,
      _image_synced_at: nowIso(),
      updated_at: nowIso(),
    };
    await kv.set(`product:${sku}`, nextRecord);
    await patchMeiliProductImage(sku, nextRecord.image_url || null, !!nextRecord.has_image);
    await reconcileProductSummary(previousSyncStatus, 'synced', sku);
    return { outcome: 'already_synced', product: nextRecord };
  }

  if (existingStorage.length > 0) {
    const syncedRecord = {
      ...product,
      image_url: existingStorage[0].url,
      images: existingStorage.map((item) => item.url),
      has_image: true,
      _image_source: 'storage',
      _legacy_image_paths: canonical._legacy_image_paths,
      _image_storage_paths: existingStorage.map((item) => item.path),
      _image_sync_status: 'synced',
      _image_synced_at: nowIso(),
      updated_at: nowIso(),
    };
    await kv.set(`product:${sku}`, syncedRecord);
    await patchMeiliProductImage(sku, syncedRecord.image_url, true);
    await reconcileProductSummary(previousSyncStatus, 'synced', sku);
    return { outcome: 'relinked_existing_storage', product: syncedRecord };
  }

  if (canonical._legacy_image_paths.length === 0) {
    const missingRecord = {
      ...product,
      image_url: null,
      images: [],
      has_image: false,
      _image_source: canonical._image_source,
      _legacy_image_paths: canonical._legacy_image_paths,
      _image_storage_paths: [],
      _image_sync_status: 'missing',
      _image_synced_at: nowIso(),
      updated_at: nowIso(),
    };
    await kv.set(`product:${sku}`, missingRecord);
    await patchMeiliProductImage(sku, null, false);
    await reconcileProductSummary(previousSyncStatus, 'missing', sku);
    return { outcome: 'missing', product: missingRecord };
  }

  const uploadedPaths: string[] = [];
  let notFound = 0;
  let failures = 0;
  const storageFolder = getProductStorageFolders(sku)[0] || sku;

  for (let index = 0; index < canonical._legacy_image_paths.length; index += 1) {
    const legacyPath = canonical._legacy_image_paths[index];
    const sourceUrl = `https://www.toyoparts.com.br/pub/media/catalog/product${legacyPath}`;
    const ext = inferRemoteImageExtension(legacyPath);
    const storagePath = `${storageFolder}/${String(index).padStart(2, '0')}.${ext}`;
    const remote = await downloadRemoteImage(sourceUrl);
    if (!remote) {
      notFound += 1;
      continue;
    }
    try {
      await uploadPublicImage(PRODUCT_IMAGE_SYNC_BUCKET, storagePath, remote.data, remote.contentType);
      uploadedPaths.push(storagePath);
    } catch {
      failures += 1;
    }
  }

  if (uploadedPaths.length > 0) {
    const urls = uploadedPaths.map((path) => buildStoragePublicUrl(PRODUCT_IMAGE_SYNC_BUCKET, path));
    const syncedRecord = {
      ...product,
      image_url: urls[0],
      images: urls,
      has_image: true,
      _image_source: 'storage',
      _legacy_image_paths: canonical._legacy_image_paths,
      _image_storage_paths: uploadedPaths,
      _image_sync_status: 'synced',
      _image_sync_error: null,
      _image_synced_at: nowIso(),
      updated_at: nowIso(),
    };
    await kv.set(`product:${sku}`, syncedRecord);
    await patchMeiliProductImage(sku, syncedRecord.image_url, true);
    await reconcileProductSummary(previousSyncStatus, 'synced', sku);
    return { outcome: 'repaired_and_synced', product: syncedRecord };
  }

  if (notFound === canonical._legacy_image_paths.length && failures === 0) {
    const missingRecord = {
      ...product,
      image_url: null,
      images: [],
      has_image: false,
      _image_source: 'legacy',
      _legacy_image_paths: canonical._legacy_image_paths,
      _image_storage_paths: [],
      _image_sync_status: 'missing',
      _image_sync_error: null,
      _image_synced_at: nowIso(),
      updated_at: nowIso(),
    };
    await kv.set(`product:${sku}`, missingRecord);
    await patchMeiliProductImage(sku, null, false);
    await reconcileProductSummary(previousSyncStatus, 'missing', sku);
    return { outcome: 'missing', product: missingRecord };
  }

  const errorRecord = {
    ...product,
    _image_source: 'legacy',
    _legacy_image_paths: canonical._legacy_image_paths,
    _image_storage_paths: [],
    _image_sync_status: 'error',
    _image_sync_error: 'Falha ao baixar ou subir imagem legada',
    _image_synced_at: nowIso(),
    updated_at: nowIso(),
  };
  await kv.set(`product:${sku}`, errorRecord);
  await patchMeiliProductImage(sku, product.image_url || null, !!product.has_image);
  await reconcileProductSummary(previousSyncStatus, 'error', sku);
  return { outcome: 'error', product: errorRecord };
}

async function processMappedAssetScope(
  scope: 'categories' | 'models',
  bucket: string,
  sourceMap: Record<string, string>,
  keyName: string,
  isCanonical: (url: string | null | undefined) => boolean,
  status: MediaSyncStatus,
) {
  const scopeState = status.scope_results[scope];
  const overrides = await kv.get(keyName).catch(() => ({}));
  const merged = { ...sourceMap, ...(overrides || {}) } as Record<string, string>;
  const bucketObjects = await listBucketObjects(bucket);
  const keys = Object.keys(merged).sort();
  const offset = scopeState.offset || 0;
  const nextKeys = keys.slice(offset, offset + GENERIC_STEP_BATCH);

  if (nextKeys.length === 0) {
    scopeState.progress = 100;
    advanceScope(status);
    return { message: 'scope_completed', batch: { processed: 0 } };
  }

  await ensureBucket(bucket);
  const updatedOverrides = { ...(overrides || {}) };
  const batch = { processed: 0, synced: 0, skipped: 0, missing: 0, errors: 0 };

  for (const key of nextKeys) {
    const currentUrl = merged[key];
    batch.processed += 1;

    if (!currentUrl) {
      batch.missing += 1;
      samplePush(scopeState.sample_pending || (scopeState.sample_pending = []), key);
      continue;
    }

    let sourceUrl = currentUrl;
    if (isCanonical(currentUrl)) {
      const parsed = parseStoragePublicUrl(currentUrl);
      if (parsed && bucketObjects.has(parsed.path)) {
        batch.skipped += 1;
        continue;
      }
      sourceUrl = sourceMap[key] || '';
    }

    if (!String(sourceUrl).startsWith('http')) {
      batch.errors += 1;
      samplePush(scopeState.sample_pending || (scopeState.sample_pending = []), key);
      continue;
    }

    const remote = await downloadRemoteImage(sourceUrl);
    if (!remote) {
      batch.missing += 1;
      samplePush(scopeState.sample_pending || (scopeState.sample_pending = []), key);
      continue;
    }

    try {
      const ext = inferRemoteImageExtension(currentUrl);
      const storagePath = `${sanitizeStorageKeySegment(key)}.${ext}`;
      const publicUrl = await uploadPublicImage(bucket, storagePath, remote.data, remote.contentType);
      updatedOverrides[key] = publicUrl;
      batch.synced += 1;
    } catch {
      batch.errors += 1;
      samplePush(scopeState.sample_pending || (scopeState.sample_pending = []), key);
    }
  }

  await kv.set(keyName, updatedOverrides);

  scopeState.processed += batch.processed;
  scopeState.synced += batch.synced;
  scopeState.skipped += batch.skipped;
  scopeState.missing += batch.missing;
  scopeState.errors += batch.errors;
  scopeState.offset = offset + nextKeys.length;
  scopeState.progress = scopeState.total > 0 ? Math.min(99, Math.round((scopeState.processed / scopeState.total) * 100)) : 100;
  if ((scopeState.offset || 0) >= keys.length) {
    scopeState.progress = 100;
    advanceScope(status);
  }

  return { message: 'batch_done', batch };
}

async function processBannerBatch(status: MediaSyncStatus) {
  const scopeState = status.scope_results.banners;
  const ids = (await kv.get(BANNER_INDEX_KEY).catch(() => [])) || [];
  const bannerObjects = await listBucketObjects(BANNER_IMAGES_BUCKET);
  const offset = scopeState.offset || 0;
  const nextIds = ids.slice(offset, offset + GENERIC_STEP_BATCH);

  if (nextIds.length === 0) {
    scopeState.progress = 100;
    advanceScope(status);
    return { message: 'scope_completed', batch: { processed: 0 } };
  }

  await ensureBucket(BANNER_IMAGES_BUCKET);
  const batch = { processed: 0, synced: 0, skipped: 0, missing: 0, errors: 0 };

  for (const id of nextIds) {
    batch.processed += 1;
    const banner = await kv.get(`${BANNER_PREFIX}${id}`).catch(() => null);
    if (!banner) {
      batch.missing += 1;
      samplePush(scopeState.sample_pending || (scopeState.sample_pending = []), String(id));
      continue;
    }

    const fields = BANNER_IMAGE_FIELDS.filter((field) => String(banner[field] || '').trim().length > 0);
    if (fields.length === 0) {
      batch.missing += 1;
      samplePush(scopeState.sample_pending || (scopeState.sample_pending = []), String(id));
      continue;
    }

    const nextBanner = { ...banner };
    const legacyFieldMap = (banner._legacy_image_fields && typeof banner._legacy_image_fields === 'object')
      ? { ...banner._legacy_image_fields }
      : {};
    let changed = false;
    let errored = false;
    let hasNonCanonical = false;

    for (const field of fields) {
      const currentUrl = String(banner[field] || '').trim();
      let sourceUrl = currentUrl;
      if (isCanonicalBannerUrl(currentUrl)) {
        const parsed = parseStoragePublicUrl(currentUrl);
        if (parsed && bannerObjects.has(parsed.path)) continue;
        sourceUrl = String(legacyFieldMap[field] || '').trim();
      } else {
        hasNonCanonical = true;
      }
      if (!sourceUrl.startsWith('http')) {
        errored = true;
        continue;
      }
      const remote = await downloadRemoteImage(sourceUrl);
      if (!remote) {
        errored = true;
        continue;
      }

      try {
        const ext = inferRemoteImageExtension(sourceUrl);
        const storagePath = `${sanitizeStorageKeySegment(String(id))}/${sanitizeStorageKeySegment(field)}.${ext}`;
        nextBanner[field] = await uploadPublicImage(BANNER_IMAGES_BUCKET, storagePath, remote.data, remote.contentType);
        legacyFieldMap[field] = sourceUrl;
        changed = true;
      } catch {
        errored = true;
      }
    }

    if (changed) {
      nextBanner._legacy_image_fields = legacyFieldMap;
      await kv.set(`${BANNER_PREFIX}${id}`, nextBanner);
      batch.synced += 1;
    } else if (errored) {
      batch.errors += 1;
      samplePush(scopeState.sample_pending || (scopeState.sample_pending = []), String(id));
    } else if (hasNonCanonical) {
      batch.errors += 1;
      samplePush(scopeState.sample_pending || (scopeState.sample_pending = []), String(id));
    } else {
      batch.skipped += 1;
    }
  }

  scopeState.processed += batch.processed;
  scopeState.synced += batch.synced;
  scopeState.skipped += batch.skipped;
  scopeState.missing += batch.missing;
  scopeState.errors += batch.errors;
  scopeState.offset = offset + nextIds.length;
  scopeState.progress = scopeState.total > 0 ? Math.min(99, Math.round((scopeState.processed / scopeState.total) * 100)) : 100;
  if ((scopeState.offset || 0) >= ids.length) {
    scopeState.progress = 100;
    advanceScope(status);
  }

  return { message: 'batch_done', batch };
}

async function listBucketObjects(bucket: string) {
  const objects = new Set<string>();
  const queue = [''];

  while (queue.length > 0) {
    const prefix = queue.shift() || '';
    let offset = 0;
    const pageSize = 1000;

    while (true) {
      const { data, error } = await supabase.storage.from(bucket).list(prefix, {
        limit: pageSize,
        offset,
        sortBy: { column: 'name', order: 'asc' },
      });
      if (error) throw new Error(error.message);
      if (!data || data.length === 0) break;

      for (const item of data as any[]) {
        const fullPath = prefix ? `${prefix}/${item.name}` : item.name;
        if (item?.id || item?.metadata) {
          objects.add(fullPath);
        } else {
          queue.push(fullPath);
        }
      }

      if (data.length < pageSize) break;
      offset += data.length;
    }
  }

  return objects;
}

async function auditMeiliImages() {
  if (!meili.isConfigured()) {
    return { legacy: 0, external: 0 };
  }

  let offset = 0;
  const limit = 1000;
  let legacy = 0;
  let external = 0;

  while (true) {
    const result = await meili.search('', {
      limit,
      offset,
      // @ts-ignore
      attributesToRetrieve: ['sku', 'image_url'],
    });
    const hits = result?.hits || [];
    if (hits.length === 0) break;
    for (const hit of hits) {
      const imageUrl = String(hit?.image_url || '').trim();
      if (!imageUrl) continue;
      if (isLegacyMediaUrl(imageUrl)) legacy += 1;
      else if (!isCanonicalProductImageUrl(imageUrl)) external += 1;
    }
    offset += hits.length;
    if (hits.length < limit) break;
  }

  return { legacy, external };
}

async function auditProducts(syncObjects: Set<string>, uploadObjects: Set<string>): Promise<AuditScopeResult> {
  let from = 0;
  const pageSize = 500;
  const result: AuditScopeResult = {
    total: 0,
    canonical_storage: 0,
    legacy_domain: 0,
    external_noncanonical: 0,
    missing_image: 0,
    broken_storage_refs: 0,
    pending_samples: [],
    no_image_catalog: 0,
    blocking_missing_image: 0,
    sync_errors: 0,
    cutoverReady: false,
  };

  while (true) {
    const { data, error } = await supabase
      .from('kv_store_1d6e33e0')
      .select('key, value')
      .like('key', 'product:%')
      .order('key')
      .range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;

    for (const row of data) {
      const product = row.value || {};
      const sku = String(product.sku || row.key.replace(/^product:/, ''));
      const media = resolveProductMedia(product, { allowLegacy: false });
      const rawUrls = uniqueStrings([
        product.image_url,
        ...(Array.isArray(product.images) ? product.images : []),
        ...(Array.isArray(product.media_gallery_entries) ? product.media_gallery_entries.map((entry: any) => entry?.file) : []),
        ...(Array.isArray(product.media_gallery) ? product.media_gallery.map((entry: any) => entry?.file) : []),
      ]);

      result.total += 1;

      if (rawUrls.some((url) => isLegacyMediaUrl(url))) {
        result.legacy_domain += 1;
        samplePush(result.pending_samples, sku);
        continue;
      }

      if (media.images.length === 0) {
        const syncStatus = String(product._image_sync_status || '');
        const hasExpectedSource = media._legacy_image_paths.length > 0;
        if (syncStatus === 'error') {
          result.sync_errors = (result.sync_errors || 0) + 1;
          result.missing_image += 1;
          samplePush(result.pending_samples, sku);
        } else if (hasExpectedSource) {
          result.blocking_missing_image = (result.blocking_missing_image || 0) + 1;
          result.missing_image += 1;
          samplePush(result.pending_samples, sku);
        } else {
          result.no_image_catalog = (result.no_image_catalog || 0) + 1;
        }
        continue;
      }

      let nonCanonical = false;
      let broken = false;
      for (const url of media.images) {
        if (!isCanonicalProductImageUrl(url)) {
          nonCanonical = true;
          continue;
        }
        const parsed = parseStoragePublicUrl(url);
        if (!parsed) {
          nonCanonical = true;
          continue;
        }
        if (parsed.bucket === PRODUCT_IMAGE_SYNC_BUCKET && !syncObjects.has(parsed.path)) broken = true;
        if (parsed.bucket === PRODUCT_UPLOAD_BUCKET && !uploadObjects.has(parsed.path)) broken = true;
      }

      if (broken) {
        result.broken_storage_refs += 1;
        samplePush(result.pending_samples, sku);
        continue;
      }

      if (nonCanonical) {
        result.external_noncanonical += 1;
        samplePush(result.pending_samples, sku);
        continue;
      }

      result.canonical_storage += 1;
    }

    if (data.length < pageSize) break;
    from += pageSize;
  }

  const meiliState = await auditMeiliImages();
  result.meili_legacy = meiliState.legacy;
  result.meili_external = meiliState.external;
  result.cutoverReady =
    result.legacy_domain === 0 &&
    result.external_noncanonical === 0 &&
    (result.blocking_missing_image || 0) === 0 &&
    (result.sync_errors || 0) === 0 &&
    result.broken_storage_refs === 0 &&
    meiliState.legacy === 0 &&
    meiliState.external === 0;

  return result;
}

async function auditMappedScope(
  items: Record<string, string>,
  bucket: string,
  canonicalCheck: (url: string | null | undefined) => boolean,
) {
  const objectSet = await listBucketObjects(bucket);
  const result: AuditScopeResult = {
    total: 0,
    canonical_storage: 0,
    legacy_domain: 0,
    external_noncanonical: 0,
    missing_image: 0,
    broken_storage_refs: 0,
    pending_samples: [],
    cutoverReady: false,
  };

  for (const [key, url] of Object.entries(items)) {
    result.total += 1;
    if (!url) {
      result.missing_image += 1;
      samplePush(result.pending_samples, key);
      continue;
    }
    if (isLegacyMediaUrl(url)) {
      result.legacy_domain += 1;
      samplePush(result.pending_samples, key);
      continue;
    }
    if (!canonicalCheck(url)) {
      result.external_noncanonical += 1;
      samplePush(result.pending_samples, key);
      continue;
    }
    const parsed = parseStoragePublicUrl(url);
    if (!parsed || !objectSet.has(parsed.path)) {
      result.broken_storage_refs += 1;
      samplePush(result.pending_samples, key);
      continue;
    }
    result.canonical_storage += 1;
  }

  result.cutoverReady =
    result.legacy_domain === 0 &&
    result.external_noncanonical === 0 &&
    result.missing_image === 0 &&
    result.broken_storage_refs === 0;

  return result;
}

async function auditBanners() {
  const ids = (await kv.get(BANNER_INDEX_KEY).catch(() => [])) || [];
  const bannerObjects = await listBucketObjects(BANNER_IMAGES_BUCKET);
  const result: AuditScopeResult = {
    total: 0,
    canonical_storage: 0,
    legacy_domain: 0,
    external_noncanonical: 0,
    missing_image: 0,
    broken_storage_refs: 0,
    pending_samples: [],
    cutoverReady: false,
  };

  for (const id of ids) {
    const banner = await kv.get(`${BANNER_PREFIX}${id}`).catch(() => null);
    if (!banner) {
      result.total += 1;
      result.missing_image += 1;
      samplePush(result.pending_samples, String(id));
      continue;
    }

    if (banner.active === false) {
      continue;
    }

    result.total += 1;

    const urls = uniqueStrings(BANNER_IMAGE_FIELDS.map((field) => banner[field]));
    if (urls.length === 0) {
      result.missing_image += 1;
      samplePush(result.pending_samples, String(id));
      continue;
    }

    if (urls.some((url) => isLegacyMediaUrl(url))) {
      result.legacy_domain += 1;
      samplePush(result.pending_samples, String(id));
      continue;
    }

    if (urls.some((url) => !isCanonicalBannerUrl(url))) {
      result.external_noncanonical += 1;
      samplePush(result.pending_samples, String(id));
      continue;
    }

    let broken = false;
    for (const url of urls) {
      const parsed = parseStoragePublicUrl(url);
      if (!parsed || !bannerObjects.has(parsed.path)) {
        broken = true;
        break;
      }
    }
    if (broken) {
      result.broken_storage_refs += 1;
      samplePush(result.pending_samples, String(id));
      continue;
    }

    result.canonical_storage += 1;
  }

  result.cutoverReady =
    result.legacy_domain === 0 &&
    result.external_noncanonical === 0 &&
    result.missing_image === 0 &&
    result.broken_storage_refs === 0;

  return result;
}

app.post('/sync/start', async (c) => {
  try {
    const requestedScope = (c.req.query('scope') || 'all') as RequestedScope;
    const scope = requestedScope === 'products' || requestedScope === 'categories' || requestedScope === 'models' || requestedScope === 'banners' || requestedScope === 'all'
      ? requestedScope
      : 'all';
    const force = c.req.query('force') === '1';
    const current = await loadStatus();

    if (current?.status === 'running' && !force) {
      return c.json({ message: 'Media sync ja em andamento', status: current, _hint: '?force=1' }, 409);
    }

    const status = await buildInitialStatus(scope);
    await kv.del(IMAGE_SYNC_LEGACY_KEY).catch(() => {});
    await kv.del(IMAGE_AUDIT_CACHE_KEY).catch(() => {});
    await saveStatus(status);

    return c.json({
      ok: true,
      message: 'Media sync iniciado',
      scope,
      status,
    });
  } catch (error: any) {
    await saveStatus({
      ...emptyStatus(),
      status: 'error',
      failed_at: nowIso(),
      error: error.message,
    });
    return c.json({ error: error.message }, 500);
  }
});

app.post('/sync/step', async (c) => {
  try {
    const status = await loadStatus();
    if (!status || status.status !== 'running' || !status.current_scope) {
      return c.json({ message: 'Nenhum media sync em andamento', current_status: status?.status || 'idle' }, 400);
    }

    let response: any;
    if (status.current_scope === 'products') {
      response = await processProductBatch(status);
    } else if (status.current_scope === 'categories') {
      response = await processMappedAssetScope('categories', CATEGORY_IMAGES_BUCKET, CATEGORY_IMAGE_SOURCES, CATEGORY_IMAGES_MAP_KEY, isCanonicalCategoryUrl, status);
    } else if (status.current_scope === 'models') {
      response = await processMappedAssetScope('models', MODEL_IMAGES_BUCKET, MODEL_IMAGE_SOURCES, MODEL_IMAGES_MAP_KEY, isCanonicalModelUrl, status);
    } else {
      response = await processBannerBatch(status);
    }

    refreshOverallProgress(status);
    await saveStatus(status);

    return c.json({
      ...response,
      status,
    });
  } catch (error: any) {
    const current = await loadStatus();
    await saveStatus({
      ...emptyStatus(),
      ...current,
      status: 'error',
      failed_at: nowIso(),
      error: error.message,
    });
    return c.json({ error: error.message }, 500);
  }
});

app.post('/repair/product', async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const sku = String(body?.sku || c.req.query('sku') || '').trim();
    if (!sku) return c.json({ error: 'SKU obrigatorio' }, 400);

    const result = await repairSingleProductBySku(sku);
    await kv.del(IMAGE_AUDIT_CACHE_KEY).catch(() => {});
    return c.json({
      ok: true,
      sku,
      ...result,
      repaired_at: nowIso(),
    });
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

app.get('/status', async (c) => {
  try {
    const status = await loadStatus();
    return c.json(status || { status: 'idle' });
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

app.post('/reset', async (c) => {
  try {
    await kv.del(IMAGE_SYNC_STATUS_KEY).catch(() => {});
    await kv.del(IMAGE_SYNC_LEGACY_KEY).catch(() => {});
    await kv.del(IMAGE_AUDIT_CACHE_KEY).catch(() => {});
    return c.json({ ok: true, status: 'idle' });
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

app.get('/audit', async (c) => {
  try {
    const requestedScope = (c.req.query('scope') || 'all') as RequestedScope;
    const scope = requestedScope === 'products' || requestedScope === 'categories' || requestedScope === 'models' || requestedScope === 'banners' || requestedScope === 'all'
      ? requestedScope
      : 'all';
    const scopes = resolveRequestedScopes(scope);
    const refresh = c.req.query('refresh') === '1';

    if (!refresh) {
      const cached = await loadAuditCache();
      const cachedScopesResult = cached?.scopes_result || {};
      if (cached && scopes.every((item) => cachedScopesResult[item])) {
        const cutoverReady = scopes.every((item) => cachedScopesResult[item]?.cutoverReady === true);
        return c.json({
          ok: true,
          scope,
          scopes,
          cutoverReady,
          scopes_result: Object.fromEntries(scopes.map((item) => [item, cachedScopesResult[item]])),
          generated_at: cached.generated_at || nowIso(),
          cache_hit: true,
        });
      }
    }

    const scopeResults: Partial<Record<MediaScope, AuditScopeResult>> = {};

    const needProducts = scopes.includes('products');
    const needCategories = scopes.includes('categories');
    const needModels = scopes.includes('models');
    const needBanners = scopes.includes('banners');

    const productSyncObjects = needProducts ? await listBucketObjects(PRODUCT_IMAGE_SYNC_BUCKET) : new Set<string>();
    const productUploadObjects = needProducts ? await listBucketObjects(PRODUCT_UPLOAD_BUCKET) : new Set<string>();

    if (needProducts) scopeResults.products = await auditProducts(productSyncObjects, productUploadObjects);
    if (needCategories) {
      const overrides = await kv.get(CATEGORY_IMAGES_MAP_KEY).catch(() => ({}));
      scopeResults.categories = await auditMappedScope({ ...CATEGORY_IMAGE_SOURCES, ...(overrides || {}) }, CATEGORY_IMAGES_BUCKET, isCanonicalCategoryUrl);
    }
    if (needModels) {
      const overrides = await kv.get(MODEL_IMAGES_MAP_KEY).catch(() => ({}));
      scopeResults.models = await auditMappedScope({ ...MODEL_IMAGE_SOURCES, ...(overrides || {}) }, MODEL_IMAGES_BUCKET, isCanonicalModelUrl);
    }
    if (needBanners) scopeResults.banners = await auditBanners();

    const cutoverReady = scopes.every((item) => scopeResults[item]?.cutoverReady === true);
    const payload = {
      ok: true,
      scope,
      scopes,
      cutoverReady,
      scopes_result: scopeResults,
      generated_at: nowIso(),
      cache_hit: false,
    };
    await saveAuditCache({
      scope,
      scopes,
      cutoverReady,
      scopes_result: scopeResults,
      generated_at: payload.generated_at,
    }).catch(() => {});

    return c.json(payload);
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

app.get('/product-assets/synced/*', async (c) => {
  const storagePath = c.req.path.replace(/^.*\/product-assets\/synced\//, '').trim();
  const normalizedPath = String(storagePath || '').replace(/^\/+/, '');

  if (!normalizedPath) {
    return c.body('Product image path is required', 400);
  }

  try {
    const blob = await downloadStorageObject(PRODUCT_IMAGE_SYNC_BUCKET, normalizedPath);
    return new Response(blob.stream(), {
      status: 200,
      headers: {
        'Content-Type': blob.type || 'application/octet-stream',
        'Cache-Control': 'public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400',
        'X-Toyoparts-Image-Source': 'storage',
      },
    });
  } catch {
    const legacyFallback = await streamLegacyProductImage(normalizedPath);
    if (legacyFallback) return legacyFallback;
    return c.body('Nao foi possivel carregar a imagem do produto', 502);
  }
});

app.get('/product-assets/uploads/*', async (c) => {
  const storagePath = c.req.path.replace(/^.*\/product-assets\/uploads\//, '').trim();
  const normalizedPath = String(storagePath || '').replace(/^\/+/, '');

  if (!normalizedPath) {
    return c.body('Product upload image path is required', 400);
  }

  try {
    const blob = await downloadStorageObject(PRODUCT_UPLOAD_BUCKET, normalizedPath);
    return new Response(blob.stream(), {
      status: 200,
      headers: {
        'Content-Type': blob.type || 'application/octet-stream',
        'Cache-Control': 'public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400',
        'X-Toyoparts-Image-Source': 'upload-storage',
      },
    });
  } catch (error: any) {
    return c.body(error?.message || 'Nao foi possivel carregar a imagem enviada do produto', 502);
  }
});

export const imageMigration = app;
