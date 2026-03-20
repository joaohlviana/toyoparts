import { Hono } from 'npm:hono';
import { createClient } from "jsr:@supabase/supabase-js@2.49.8";
import * as kv from './kv_store.tsx';
import { fetchMagento } from './magento.tsx';

const app = new Hono();

const CATEGORY_TREE_CACHE_KEY = 'meta:category_tree';
const CATEGORY_IMAGES_BUCKET = 'make-1d6e33e0-category-images';
const CATEGORY_IMAGES_MAP_KEY = 'meta:category_images_map';

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

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

let categoryBucketReady = false;

async function ensureCategoryBucket() {
  if (categoryBucketReady) return;

  const { data: buckets, error: listError } = await supabase.storage.listBuckets();
  if (listError) throw new Error(listError.message);

  const exists = buckets?.some(bucket => bucket.name === CATEGORY_IMAGES_BUCKET);
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
  const baseUrl = Deno.env.get("SUPABASE_URL")!;
  return `${baseUrl}/storage/v1/object/public/${CATEGORY_IMAGES_BUCKET}/${path}`;
}

function extractStoragePath(url: string): string | null {
  const marker = `/storage/v1/object/public/${CATEGORY_IMAGES_BUCKET}/`;
  const idx = url.indexOf(marker);
  if (idx === -1) return null;
  return url.slice(idx + marker.length);
}

// GET /tree - Fetches category tree from KV or Magento
app.get('/tree', async (c) => {
  try {
    // 1. Try Cache
    const cached = await kv.get(CATEGORY_TREE_CACHE_KEY);
    if (cached) {
      return c.json(cached);
    }

    // 2. Fetch from Magento
    // We need the full tree. Magento V1/categories returns the root category with children nested.
    const tree = await fetchMagento('/V1/categories');
    
    // 3. Cache it
    if (tree) {
       await kv.set(CATEGORY_TREE_CACHE_KEY, tree);
    }

    return c.json(tree);
  } catch (e: any) {
    console.error('Category Tree Error:', e);
    // Return empty tree on error to avoid crashing frontend
    return c.json({ id: 1, name: 'Root', children_data: [] });
  }
});

// GET /images - Returns the static image map
app.get('/images', async (c) => {
  const overrides = await getCategoryImageOverrides().catch(() => ({}));
  return c.json({ images: { ...CATEGORY_IMAGE_SOURCES, ...overrides } });
});

// POST /images/upload - Upload or replace a category image
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

// DELETE /images/:key - Remove a category image override
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

// POST /images/remap - Associate an existing image to a new category key
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

// POST /images/sync - Return current sync summary for admin UI
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
