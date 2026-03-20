import { Hono } from 'npm:hono';
import { createClient } from "jsr:@supabase/supabase-js@2.49.8";
import * as kv from './kv_store.tsx';

export const models = new Hono();

const MODEL_IMAGES_BUCKET = 'make-1d6e33e0-model-images';
const MODEL_IMAGES_MAP_KEY = 'meta:model_images_map';

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

let modelBucketReady = false;

async function ensureModelBucket() {
  if (modelBucketReady) return;

  const { data: buckets, error: listError } = await supabase.storage.listBuckets();
  if (listError) throw new Error(listError.message);

  const exists = buckets?.some(bucket => bucket.name === MODEL_IMAGES_BUCKET);
  if (!exists) {
    const { error } = await supabase.storage.createBucket(MODEL_IMAGES_BUCKET, {
      public: true,
      fileSizeLimit: 10485760,
    });
    if (error) throw new Error(error.message);
  } else {
    await supabase.storage.updateBucket(MODEL_IMAGES_BUCKET, { public: true }).catch(() => {});
  }

  modelBucketReady = true;
}

async function getModelImages(): Promise<Record<string, string>> {
  const map = await kv.get(MODEL_IMAGES_MAP_KEY);
  return map && typeof map === 'object' ? map : {};
}

async function saveModelImages(map: Record<string, string>) {
  await kv.set(MODEL_IMAGES_MAP_KEY, map);
}

function sanitizeModel(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function buildModelPublicUrl(path: string): string {
  const baseUrl = Deno.env.get("SUPABASE_URL")!;
  return `${baseUrl}/storage/v1/object/public/${MODEL_IMAGES_BUCKET}/${path}`;
}

models.get('/images', async (c) => {
  const urls = await getModelImages().catch(() => ({}));
  return c.json({ urls });
});

models.post('/images/upload', async (c) => {
  try {
    await ensureModelBucket();

    const formData = await c.req.formData();
    const model = String(formData.get('model') || '').trim();
    const file = (formData.get('file') || formData.get('image')) as File | null;

    if (!model) return c.json({ error: 'model obrigatorio' }, 400);
    if (!file) return c.json({ error: 'arquivo obrigatorio' }, 400);
    if (!file.type.startsWith('image/')) return c.json({ error: 'arquivo deve ser imagem' }, 400);

    const safeModel = sanitizeModel(model);
    const extension = (file.name.split('.').pop() || 'png').toLowerCase().replace(/[^a-z0-9]/g, '') || 'png';
    const storagePath = `${safeModel}.${extension}`;

    const { error } = await supabase.storage
      .from(MODEL_IMAGES_BUCKET)
      .upload(storagePath, file, { upsert: true, contentType: file.type || 'image/png' });

    if (error) return c.json({ error: error.message }, 500);

    const publicUrl = buildModelPublicUrl(storagePath);
    const urls = await getModelImages();
    urls[model] = publicUrl;
    await saveModelImages(urls);

    return c.json({ ok: true, model, publicUrl, signedUrl: publicUrl });
  } catch (error: any) {
    console.error('[models/images/upload]', error);
    return c.json({ error: error.message || 'upload failed' }, 500);
  }
});

models.post('/images/sync', async (c) => {
  try {
    const urls = await getModelImages();
    return c.json({
      synced: Object.keys(urls).length,
      total: Object.keys(urls).length,
    });
  } catch (error: any) {
    return c.json({ error: error.message || 'sync failed' }, 500);
  }
});
