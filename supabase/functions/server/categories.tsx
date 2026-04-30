import { Hono } from 'npm:hono';
import { createClient } from 'jsr:@supabase/supabase-js@2.49.8';
import * as kv from './kv_store.tsx';
import * as meili from './meilisearch.tsx';

const app = new Hono();

const CATEGORY_TREE_CACHE_KEY = 'meta:category_tree';
const CATEGORY_IMAGES_BUCKET = 'make-1d6e33e0-category-images';
const CATEGORY_IMAGES_MAP_KEY = 'meta:category_images_map';
const CATEGORY_TREE_CACHE_TIMEOUT_MS = 900;
const CATEGORY_TREE_FACET_TIMEOUT_MS = 2500;
const MIN_RENDERABLE_CATEGORY_PRODUCT_COUNT = 1;

export interface CategoryNode {
  id: number;
  parent_id: number;
  name: string;
  level: number;
  is_active: boolean;
  product_count: number;
  children_data?: CategoryNode[];
}

export interface CategoryFilterTreeNode {
  id: string;
  label: string;
  level: number;
  resultCount: number;
  selectable: boolean;
  selected: boolean;
  children: CategoryFilterTreeNode[];
}

export type CategoryTreeStatus = 'live' | 'cached' | 'degraded';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

const CATEGORY_IMAGE_SOURCES: Record<string, string> = {
  'acessorios-externos-cromados': 'https://increazy-folder.s3.amazonaws.com/5ebed78a28503303b0530072/corolla-menu-acessorios-externos.jpg?v=1770635254',
  'aerofolios-spoilers-e-antenas': 'https://increazy-folder.s3.amazonaws.com/5ebed78a28503303b0530072/hilux-menu-acessorios-externos.jpg?v=1770635254',
  'alarme-e-seguranca': 'https://increazy-folder.s3.amazonaws.com/5ebed78a28503303b0530072/corolla-menu-acessorios-internos.jpg?v=1770635254',
  'engates-e-chicotes': 'https://increazy-folder.s3.amazonaws.com/5ebed78a28503303b0530072/sw4-menu-pickup-suv.jpg?v=1770635254',
  'ferramentas-e-equipamentos': 'https://increazy-folder.s3.amazonaws.com/5ebed78a28503303b0530072/hilux-menu-pecas.jpg?v=1770635254',
  'frisos-e-apliques': 'https://increazy-folder.s3.amazonaws.com/5ebed78a28503303b0530072/banner-departamento-corolla-cross-acessorio-externo.jpg?v=1770635254',
  'ponteiras': 'https://increazy-folder.s3.amazonaws.com/5ebed78a28503303b0530072/sw4-menu-pickup-suv.jpg?v=1770635254',
  'rodas-e-calotas': 'https://increazy-folder.s3.amazonaws.com/5ebed78a28503303b0530072/rav4-menu-acessorios-externos.jpg?v=1770635254',
  'sensor-de-estacionamento': 'https://increazy-folder.s3.amazonaws.com/5ebed78a28503303b0530072/corolla-menu-acessorios-internos.jpg?v=1770635254',
  'suporte-racks-e-bagageiros': 'https://increazy-folder.s3.amazonaws.com/5ebed78a28503303b0530072/hilux-menu-santo-antonio.jpg?v=1770635254',
  'corolla:acessorios-externos': 'https://increazy-folder.s3.amazonaws.com/5ebed78a28503303b0530072/corolla-menu-acessorios-externos.jpg?v=1770635254',
  'corolla:acessorios-internos': 'https://increazy-folder.s3.amazonaws.com/5ebed78a28503303b0530072/corolla-menu-acessorios-internos.jpg?v=1770635254',
  'corolla:iluminacao': 'https://increazy-folder.s3.amazonaws.com/5ebed78a28503303b0530072/corolla-menu-iluminacao.jpg?v=1770635254',
  'corolla:pecas': 'https://increazy-folder.s3.amazonaws.com/5ebed78a28503303b0530072/corolla-menu-pecas.jpg?v=1770635254',
  'corolla-cross:acessorios-externos': 'https://increazy-folder.s3.amazonaws.com/5ebed78a28503303b0530072/banner-departamento-corolla-cross-acessorio-externo.jpg?v=1770635254',
  'corolla-cross:acessorios-internos': 'https://increazy-folder.s3.amazonaws.com/5ebed78a28503303b0530072/banner-departamento-corolla-cross-acessorio-interno.jpg?v=1770635254',
  'corolla-cross:iluminacao': 'https://increazy-folder.s3.amazonaws.com/5ebed78a28503303b0530072/banne-departamento-corolla-cross-iluminacao.jpg?v=1770635254',
  'corolla-cross:pecas': 'https://increazy-folder.s3.amazonaws.com/5ebed78a28503303b0530072/banne-departamento-corolla-cross-pecas.jpg?v=1770635254',
  'etios:acessorios-externos': 'https://increazy-folder.s3.amazonaws.com/5ebed78a28503303b0530072/etios-menu-acessorios-externos.jpg?v=1770635254',
  'etios:acessorios-internos': 'https://increazy-folder.s3.amazonaws.com/5ebed78a28503303b0530072/etios-menu-acessorios-internos.jpg?v=1770635254',
  'etios:iluminacao': 'https://increazy-folder.s3.amazonaws.com/5ebed78a28503303b0530072/etios-menu-iluminacao.jpg?v=1770635254',
  'etios:pecas': 'https://increazy-folder.s3.amazonaws.com/5ebed78a28503303b0530072/etios-menu-pecas.jpg?v=1770635254',
  'hilux:acessorios-externos': 'https://increazy-folder.s3.amazonaws.com/5ebed78a28503303b0530072/hilux-menu-acessorios-externos.jpg?v=1770635254',
  'hilux:acessorios-internos': 'https://increazy-folder.s3.amazonaws.com/5ebed78a28503303b0530072/hilux-menu-acessorios-internos.jpg?v=1770635254',
  'hilux:iluminacao': 'https://increazy-folder.s3.amazonaws.com/5ebed78a28503303b0530072/hilux-menu-iluminacao.jpg?v=1770635254',
  'hilux:pecas': 'https://increazy-folder.s3.amazonaws.com/5ebed78a28503303b0530072/hilux-menu-pecas.jpg?v=1770635254',
  'hilux:santo-antonio': 'https://increazy-folder.s3.amazonaws.com/5ebed78a28503303b0530072/hilux-menu-santo-antonio.jpg?v=1770635254',
  'sw4:acessorios-externos': 'https://increazy-folder.s3.amazonaws.com/5ebed78a28503303b0530072/sw4-menu-acessorios-externos.jpg?v=1770635254',
  'sw4:acessorios-internos': 'https://increazy-folder.s3.amazonaws.com/5ebed78a28503303b0530072/sw4-menu-acessorios-internos.jpg?v=1770635254',
  'sw4:iluminacao': 'https://increazy-folder.s3.amazonaws.com/5ebed78a28503303b0530072/sw4-menu-iluminacao.jpg?v=1770635254',
  'sw4:pecas': 'https://increazy-folder.s3.amazonaws.com/5ebed78a28503303b0530072/sw4-menu-pecas.jpg?v=1770635254',
  'sw4:acessorios-para-pick-up-e-suv': 'https://increazy-folder.s3.amazonaws.com/5ebed78a28503303b0530072/sw4-menu-pickup-suv.jpg?v=1770635254',
  'rav4:acessorios-externos': 'https://increazy-folder.s3.amazonaws.com/5ebed78a28503303b0530072/rav4-menu-acessorios-externos.jpg?v=1770635254',
  'rav4:acessorios-internos': 'https://increazy-folder.s3.amazonaws.com/5ebed78a28503303b0530072/rav4-menu-acessorios-internos.jpg?v=1770635254',
  'rav4:iluminacao': 'https://increazy-folder.s3.amazonaws.com/5ebed78a28503303b0530072/rav4-menu-iluminacao.jpg?v=1770635254',
  'rav4:pecas': 'https://increazy-folder.s3.amazonaws.com/5ebed78a28503303b0530072/rav4-menu-pecas.jpg?v=1770635254',
  'prius:acessorios-externos': 'https://increazy-folder.s3.amazonaws.com/5ebed78a28503303b0530072/prius-menu-acessorios-externos.jpg?v=1770635254',
  'prius:acessorios-internos': 'https://increazy-folder.s3.amazonaws.com/5ebed78a28503303b0530072/prius-menu-acessorios-internos.jpg?v=1770635254',
  'prius:iluminacao': 'https://increazy-folder.s3.amazonaws.com/5ebed78a28503303b0530072/prius-menu-iluminacao.jpg?v=1770635254',
  'prius:pecas': 'https://increazy-folder.s3.amazonaws.com/5ebed78a28503303b0530072/prius-menu-pecas.jpg?v=1770635254',
};

let categoryBucketReady = false;

async function ensureCategoryBucket() {
  if (categoryBucketReady) return;

  const { data: buckets, error: listError } = await supabase.storage.listBuckets();
  if (listError) throw new Error(listError.message);

  const exists = buckets?.some((bucket) => bucket.name === CATEGORY_IMAGES_BUCKET);
  if (!exists) {
    const { error } = await supabase.storage.createBucket(CATEGORY_IMAGES_BUCKET, {
      public: true,
      fileSizeLimit: 10485760,
    });
    if (error) throw new Error(error.message);
  } else {
    await supabase.storage.updateBucket(CATEGORY_IMAGES_BUCKET, { public: true }).catch(() => {});
  }

  categoryBucketReady = true;
}

async function getCategoryImageOverrides(): Promise<Record<string, string>> {
  const overrides = await kv.get(CATEGORY_IMAGES_MAP_KEY);
  return overrides && typeof overrides === 'object' ? overrides : {};
}

export async function getPublicCategoryImagesMap(): Promise<Record<string, string>> {
  const overrides = await getCategoryImageOverrides().catch((error) => {
    console.warn('[categories/images] public map fallback:', error);
    return {};
  });
  return { ...CATEGORY_IMAGE_SOURCES, ...overrides };
}

async function saveCategoryImageOverrides(map: Record<string, string>) {
  await kv.set(CATEGORY_IMAGES_MAP_KEY, map);
}

function sanitizeKeySegment(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9:_-]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function buildCategoryPublicUrl(path: string): string {
  const baseUrl = Deno.env.get('SUPABASE_URL')!;
  return `${baseUrl}/storage/v1/object/public/${CATEGORY_IMAGES_BUCKET}/${path}`;
}

function extractStoragePath(url: string): string | null {
  const marker = `/storage/v1/object/public/${CATEGORY_IMAGES_BUCKET}/`;
  const idx = url.indexOf(marker);
  if (idx === -1) return null;
  return url.slice(idx + marker.length);
}

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}

function createEmptyCategoryTree(): CategoryNode {
  return {
    id: 1,
    parent_id: 0,
    name: 'Root',
    level: 0,
    is_active: true,
    product_count: 0,
    children_data: [],
  };
}

function getNodeChildren(node: any): any[] {
  if (!node || typeof node !== 'object') return [];
  if (Array.isArray(node.children_data)) return node.children_data;
  if (Array.isArray(node.children)) return node.children;
  return [];
}

function isStructuralWrapperName(name: string): boolean {
  const normalized = String(name || '').trim().toLowerCase();
  return normalized === ''
    || normalized === 'root'
    || normalized === 'root catalog'
    || normalized === 'default category'
    || normalized === 'toyoparts';
}

function normalizeRenderableCount(value: unknown): number {
  const count = Number(value || 0);
  return Number.isFinite(count) && count >= MIN_RENDERABLE_CATEGORY_PRODUCT_COUNT ? count : 0;
}

function normalizeCategoryNode(raw: any, parentId = 0, levelFallback = 0): CategoryNode | null {
  if (!raw || typeof raw !== 'object') return null;

  const id = Number(raw.id);
  const name = String(raw.name || '').trim();
  if (!Number.isFinite(id) || !name) return null;

  const children = getNodeChildren(raw)
    .map((child) => normalizeCategoryNode(child, id, Number(raw.level ?? levelFallback) + 1))
    .filter((child): child is CategoryNode => Boolean(child));

  return {
    id,
    parent_id: Number(raw.parent_id ?? parentId) || 0,
    name,
    level: Number(raw.level ?? levelFallback) || 0,
    is_active: raw.is_active !== false && raw.is_active !== 0,
    product_count: Number(raw.product_count || 0) || 0,
    children_data: children,
  };
}

function normalizeCategoryTreeRoot(raw: any): CategoryNode {
  if (Array.isArray(raw)) {
    const children = raw
      .map((node) => normalizeCategoryNode(node, 1, 1))
      .filter((node): node is CategoryNode => Boolean(node));

    return {
      ...createEmptyCategoryTree(),
      children_data: children,
    };
  }

  return normalizeCategoryNode(raw, 0, 0) || createEmptyCategoryTree();
}

function hasRenderableChildren(tree: CategoryNode | null | undefined): boolean {
  return Array.isArray(tree?.children_data) && tree.children_data.length > 0;
}

async function loadCategoryFacetCounts(): Promise<{ counts: Record<string, number>; status: 'live' | 'cached' }> {
  if (!meili.isConfigured()) return { counts: {}, status: 'cached' };

  try {
    const result = await withTimeout(
      meili.search('', {
        limit: 1,
        filter: ['status = 1'],
        facets: ['category_ids'],
      }),
      CATEGORY_TREE_FACET_TIMEOUT_MS,
      null as any,
    );

    const distribution = result?.facetDistribution?.category_ids || {};
    const counts: Record<string, number> = {};
    for (const [id, count] of Object.entries(distribution)) {
      const normalized = normalizeRenderableCount(count);
      if (normalized > 0) counts[String(id)] = normalized;
    }

    return {
      counts,
      status: Object.keys(counts).length > 0 ? 'live' : 'cached',
    };
  } catch (error) {
    console.warn('[categories/tree] facet counts unavailable:', error);
    return { counts: {}, status: 'cached' };
  }
}

function hydrateCategoryTreeCounts(node: CategoryNode, counts: Record<string, number>): CategoryNode {
  const children = (node.children_data || []).map((child) => hydrateCategoryTreeCounts(child, counts));
  const ownCount = normalizeRenderableCount(counts[String(node.id)] ?? node.product_count);
  const childCount = children.reduce((sum, child) => sum + normalizeRenderableCount(child.product_count), 0);

  return {
    ...node,
    product_count: Math.max(ownCount, childCount),
    children_data: children,
  };
}

function filterTreeByVisibility(node: CategoryNode, visibility: Record<string, boolean>, preserveRoot = true): CategoryNode | null {
  if (!preserveRoot && visibility[String(node.id)] === false) return null;

  const children = (node.children_data || [])
    .map((child) => filterTreeByVisibility(child, visibility, false))
    .filter((child): child is CategoryNode => Boolean(child));

  return {
    ...node,
    children_data: children,
  };
}

function unwrapRenderableRoots(root: CategoryNode): CategoryNode[] {
  let current = root;
  let safety = 0;

  while (safety < 8 && isStructuralWrapperName(current.name) && getNodeChildren(current).length === 1) {
    current = getNodeChildren(current)[0];
    safety += 1;
  }

  if (isStructuralWrapperName(current.name)) {
    return getNodeChildren(current);
  }

  return [current];
}

function normalizeCategoryTreeName(name: string): string {
  return String(name || '').trim().toLowerCase();
}

function slugifyCategoryTreeName(name: string): string {
  return String(name || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function computeCategoryTreeVersion(root: CategoryNode): string {
  const parts: string[] = [];
  const walk = (node: CategoryNode) => {
    parts.push(`${node.id}:${node.name}:${node.level}:${node.children_data?.length || 0}`);
    for (const child of node.children_data || []) walk(child);
  };
  walk(root);
  return `${parts.length}:${parts.slice(0, 24).join('|')}`;
}

export async function getCanonicalCategoryTreeContext(): Promise<{
  tree: CategoryNode;
  status: CategoryTreeStatus;
  version: string;
}> {
  let status: CategoryTreeStatus = 'degraded';
  let tree = createEmptyCategoryTree();

  try {
    const cached = await withTimeout(kv.get(CATEGORY_TREE_CACHE_KEY), CATEGORY_TREE_CACHE_TIMEOUT_MS, null);
    const normalized = normalizeCategoryTreeRoot(cached);
    if (hasRenderableChildren(normalized)) {
      tree = normalized;
      status = 'cached';
    }
  } catch (cacheError) {
    console.warn('[categories/tree] canonical cache lookup failed:', cacheError);
  }

  try {
    const visibility = await withTimeout(kv.get('meta:category_visibility'), CATEGORY_TREE_CACHE_TIMEOUT_MS, {});
    if (visibility && typeof visibility === 'object') {
      tree = filterTreeByVisibility(tree, visibility as Record<string, boolean>, true) || createEmptyCategoryTree();
    }
  } catch (visibilityError) {
    console.warn('[categories/tree] visibility lookup failed:', visibilityError);
  }

  return {
    tree,
    status,
    version: computeCategoryTreeVersion(tree),
  };
}

export async function getPublicCategoryTreeSnapshot(): Promise<CategoryNode> {
  const [context, facetResult] = await Promise.all([
    getCanonicalCategoryTreeContext(),
    loadCategoryFacetCounts(),
  ]);

  return hydrateCategoryTreeCounts(context.tree, facetResult.counts);
}

function buildCategoryFilterTreeNode(
  node: CategoryNode,
  facetCounts: Record<string, number>,
  selectedIds: Set<string>,
  selectedNames: Set<string>,
): CategoryFilterTreeNode | null {
  const children = (node.children_data || [])
    .map((child) => buildCategoryFilterTreeNode(child, facetCounts, selectedIds, selectedNames))
    .filter((child): child is CategoryFilterTreeNode => Boolean(child));

  const ownCount = normalizeRenderableCount(facetCounts[String(node.id)]);
  const childCount = children.reduce((sum, child) => sum + normalizeRenderableCount(child.resultCount), 0);
  const resultCount = Math.max(ownCount, childCount);
  const selected = selectedIds.has(String(node.id)) || selectedNames.has(normalizeCategoryTreeName(node.name));
  const hasSelectedDescendant = children.some((child) => child.selected || child.children.length > 0);

  if (resultCount === 0 && !selected && !hasSelectedDescendant) {
    return null;
  }

  return {
    id: String(node.id),
    label: node.name,
    level: Number(node.level || 0),
    resultCount,
    selectable: node.is_active !== false,
    selected,
    children,
  };
}

export function buildCategoryFilterTree(
  root: CategoryNode | null | undefined,
  facetCounts: Record<string, number>,
  selectedCategoryIds: string[] = [],
  selectedCategoryNames: string[] = [],
): CategoryFilterTreeNode[] {
  if (!root) return [];

  const selectedIds = new Set(selectedCategoryIds.map((value) => String(value).trim()).filter(Boolean));
  const selectedNames = new Set(selectedCategoryNames.map((value) => normalizeCategoryTreeName(value)).filter(Boolean));
  const roots = unwrapRenderableRoots(root);

  return roots
    .map((node) => buildCategoryFilterTreeNode(node, facetCounts, selectedIds, selectedNames))
    .filter((node): node is CategoryFilterTreeNode => Boolean(node));
}

export function resolveCategoryTreeSelections(
  root: CategoryNode | null | undefined,
  rawValues: string[] = [],
): { ids: string[]; names: string[]; unresolved: string[] } {
  if (!root) return { ids: [], names: [], unresolved: rawValues.filter(Boolean) };

  const byId = new Map<string, CategoryNode>();
  const byName = new Map<string, CategoryNode>();
  const bySlug = new Map<string, CategoryNode>();

  const walk = (node: CategoryNode) => {
    byId.set(String(node.id), node);
    byName.set(normalizeCategoryTreeName(node.name), node);

    const slug = slugifyCategoryTreeName(node.name);
    if (slug) bySlug.set(slug, node);

    for (const child of node.children_data || []) walk(child);
  };

  walk(root);

  const resolvedIds: string[] = [];
  const resolvedNames: string[] = [];
  const unresolved: string[] = [];
  const seenIds = new Set<string>();

  for (const rawValue of rawValues) {
    const value = String(rawValue || '').trim();
    if (!value) continue;

    const normalizedName = normalizeCategoryTreeName(value);
    const slug = slugifyCategoryTreeName(value);
    const match = byId.get(value) || byName.get(normalizedName) || bySlug.get(slug);

    if (!match) {
      unresolved.push(value);
      continue;
    }

    const id = String(match.id);
    if (seenIds.has(id)) continue;
    seenIds.add(id);
    resolvedIds.push(id);
    resolvedNames.push(match.name);
  }

  return { ids: resolvedIds, names: resolvedNames, unresolved };
}

app.get('/tree', async (c) => {
  try {
    const snapshot = await getPublicCategoryTreeSnapshot();
    return c.json(snapshot);
  } catch (error: any) {
    console.error('Category Tree Error:', error);
    return c.json(createEmptyCategoryTree());
  }
});

app.get('/images', async (c) => {
  return c.json({ images: await getPublicCategoryImagesMap() });
});

app.post('/images/upload', async (c) => {
  try {
    await ensureCategoryBucket();

    const formData = await c.req.formData();
    const key = String(formData.get('key') || '').trim();
    const file = (formData.get('file') || formData.get('image')) as File | null;

    if (!key) return c.json({ error: 'key obrigatoria' }, 400);
    if (!file) return c.json({ error: 'arquivo obrigatorio' }, 400);
    if (!file.type.startsWith('image/')) return c.json({ error: 'arquivo deve ser imagem' }, 400);

    const safeKey = sanitizeKeySegment(key);
    const extension = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
    const storagePath = `${safeKey}.${extension}`;

    const { error } = await supabase.storage
      .from(CATEGORY_IMAGES_BUCKET)
      .upload(storagePath, file, { upsert: true, contentType: file.type || 'image/jpeg' });

    if (error) return c.json({ error: error.message }, 500);

    const publicUrl = buildCategoryPublicUrl(storagePath);
    const overrides = await getCategoryImageOverrides();
    overrides[key] = publicUrl;
    await saveCategoryImageOverrides(overrides);

    return c.json({ ok: true, key, publicUrl, signedUrl: publicUrl });
  } catch (error: any) {
    console.error('[categories/images/upload]', error);
    return c.json({ error: error.message || 'upload failed' }, 500);
  }
});

app.delete('/images/:key', async (c) => {
  try {
    const key = decodeURIComponent(c.req.param('key') || '');
    const overrides = await getCategoryImageOverrides();
    const existingUrl = overrides[key];

    if (existingUrl) {
      const storagePath = extractStoragePath(existingUrl);
      if (storagePath) {
        await supabase.storage.from(CATEGORY_IMAGES_BUCKET).remove([storagePath]).catch(() => {});
      }
      delete overrides[key];
      await saveCategoryImageOverrides(overrides);
    }

    return c.json({ ok: true, key });
  } catch (error: any) {
    console.error('[categories/images/:key delete]', error);
    return c.json({ error: error.message || 'delete failed' }, 500);
  }
});

app.post('/images/remap', async (c) => {
  try {
    const body = await c.req.json();
    const oldKey = String(body.oldKey || '').trim();
    const newKey = String(body.newKey || '').trim();

    if (!oldKey || !newKey) return c.json({ error: 'oldKey e newKey sao obrigatorios' }, 400);

    const overrides = await getCategoryImageOverrides();
    const currentUrl = overrides[oldKey] || CATEGORY_IMAGE_SOURCES[oldKey];
    if (!currentUrl) return c.json({ error: 'imagem original nao encontrada' }, 404);

    overrides[newKey] = currentUrl;
    delete overrides[oldKey];
    await saveCategoryImageOverrides(overrides);

    return c.json({ ok: true, oldKey, newKey, signedUrl: currentUrl, publicUrl: currentUrl });
  } catch (error: any) {
    console.error('[categories/images/remap]', error);
    return c.json({ error: error.message || 'remap failed' }, 500);
  }
});

app.post('/images/sync', async (c) => {
  try {
    const overrides = await getCategoryImageOverrides();
    const merged = { ...CATEGORY_IMAGE_SOURCES, ...overrides };
    return c.json({
      ok: Object.keys(merged).length,
      total: Object.keys(merged).length,
      overrides: Object.keys(overrides).length,
    });
  } catch (error: any) {
    return c.json({ error: error.message || 'sync failed' }, 500);
  }
});

export const categories = app;
