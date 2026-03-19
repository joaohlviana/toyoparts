// ─── Banners CRUD ─────────────────────────────────────────────────────────────
// GET  /banners           → list all banners
// POST /banners           → create / update a banner
// DELETE /banners/:id     → delete a banner
// POST /banners/upload    → upload image to storage

import { Hono } from 'npm:hono';
import * as kv from './kv_store.tsx';
import { createClient } from "jsr:@supabase/supabase-js@2.49.8";

export const banners = new Hono();

const BANNER_PREFIX    = 'banner:';
const BANNER_INDEX_KEY = 'meta:banner_index';
const BANNER_IMAGES_BUCKET = 'make-1d6e33e0-banner-images';

// Supabase client
const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

// ─── Storage Setup ────────────────────────────────────────────────────────────

let bannerBucketReady = false;

async function ensureBannerBucket() {
  if (bannerBucketReady) return;
  try {
    const { data: buckets, error: listError } = await supabase.storage.listBuckets();
    if (listError) {
      console.warn('⚠️ Storage listBuckets error:', listError.message);
      return;
    }
    
    const bucketExists = buckets?.some(bucket => bucket.name === BANNER_IMAGES_BUCKET);
    
    if (!bucketExists) {
      console.log(`📦 Creating banner bucket: ${BANNER_IMAGES_BUCKET}`);
      const { error } = await supabase.storage.createBucket(BANNER_IMAGES_BUCKET, {
        public: true,
        fileSizeLimit: 10485760, // 10MB
      });
      
      if (error) {
        console.warn('⚠️ Error creating banner bucket:', error.message);
      } else {
        console.log('✅ Banner bucket created successfully!');
        bannerBucketReady = true;
      }
    } else {
      // Make sure it's public
      try {
        await supabase.storage.updateBucket(BANNER_IMAGES_BUCKET, { public: true });
      } catch { /* ok */ }
      console.log('✅ Banner bucket already exists');
      bannerBucketReady = true;
    }
  } catch (error: any) {
    console.warn('⚠️ Storage unavailable:', error.message);
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getBannerIndex(): Promise<string[]> {
  const idx = await kv.get(BANNER_INDEX_KEY);
  return Array.isArray(idx) ? idx : [];
}

async function saveBannerIndex(ids: string[]): Promise<void> {
  await kv.set(BANNER_INDEX_KEY, ids);
}

// ─── GET / — List all banners ─────────────────────────────────────────────────

banners.get('/', async (c) => {
  try {
    const ids = await getBannerIndex();
    if (ids.length === 0) {
      return c.json({ banners: [] });
    }

    const keys = ids.map(id => `${BANNER_PREFIX}${id}`);
    const values = await kv.mget(keys);
    const result = values.filter(Boolean);

    return c.json({ banners: result });
  } catch (err: any) {
    console.error('[Banners] GET error:', err);
    return c.json({ banners: [], error: err.message }, 500);
  }
});

// ─── POST /batch — Bulk create banners (for seeding) ─────────────────────────

banners.post('/batch', async (c) => {
  try {
    const body = await c.req.json();
    const items = body.banners;
    if (!Array.isArray(items) || items.length === 0) {
      return c.json({ success: false, error: 'Array banners[] é obrigatório' }, 400);
    }

    const ids = await getBannerIndex();
    for (const banner of items) {
      if (!banner || !banner.id) continue;
      await kv.set(`${BANNER_PREFIX}${banner.id}`, banner);
      if (!ids.includes(banner.id)) {
        ids.push(banner.id);
      }
    }
    await saveBannerIndex(ids);

    return c.json({ success: true, count: items.length });
  } catch (err: any) {
    console.error('[Banners] BATCH POST error:', err);
    return c.json({ success: false, error: err.message }, 500);
  }
});

// ─── POST / — Create or update a banner ───────────────────────────────────────

banners.post('/', async (c) => {
  try {
    const body = await c.req.json();
    const banner = body.banner;
    if (!banner || !banner.id) {
      return c.json({ success: false, error: 'Banner com id é obrigatório' }, 400);
    }

    await kv.set(`${BANNER_PREFIX}${banner.id}`, banner);

    // Update index
    const ids = await getBannerIndex();
    if (!ids.includes(banner.id)) {
      ids.push(banner.id);
      await saveBannerIndex(ids);
    }

    return c.json({ success: true, banner });
  } catch (err: any) {
    console.error('[Banners] POST error:', err);
    return c.json({ success: false, error: err.message }, 500);
  }
});

// ─── DELETE /:id — Delete a banner ────────────────────────────────────────────

banners.delete('/:id', async (c) => {
  try {
    const id = c.req.param('id');
    await kv.del(`${BANNER_PREFIX}${id}`);

    // Update index
    const ids = await getBannerIndex();
    const updated = ids.filter(i => i !== id);
    await saveBannerIndex(updated);

    return c.json({ success: true });
  } catch (err: any) {
    console.error('[Banners] DELETE error:', err);
    return c.json({ success: false, error: err.message }, 500);
  }
});

// ─── POST /upload — Upload image to storage ───────────────────────────────────

banners.post('/upload', async (c) => {
  try {
    await ensureBannerBucket();

    const formData = await c.req.formData();
    const file = formData.get('image') as File;
    
    if (!file) {
      return c.json({ success: false, error: 'Arquivo de imagem é obrigatório' }, 400);
    }

    // Validate file type
    if (!file.type.startsWith('image/')) {
      return c.json({ success: false, error: 'Arquivo deve ser uma imagem' }, 400);
    }

    // Generate unique filename
    const timestamp = Date.now();
    const randomStr = Math.random().toString(36).substring(2, 8);
    const ext = file.name.split('.').pop() || 'jpg';
    const filename = `${timestamp}_${randomStr}.${ext}`;

    // Convert File to ArrayBuffer for upload
    const arrayBuffer = await file.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);

    const { data, error } = await supabase.storage
      .from(BANNER_IMAGES_BUCKET)
      .upload(filename, uint8Array, {
        contentType: file.type,
        cacheControl: '3600',
        upsert: false
      });

    if (error) {
      console.error('[Banners] Upload storage error:', error);
      return c.json({ success: false, error: error.message }, 500);
    }

    // Get public URL
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const publicUrl = `${supabaseUrl}/storage/v1/object/public/${BANNER_IMAGES_BUCKET}/${filename}`;

    return c.json({ 
      success: true, 
      url: publicUrl,
      path: data.path,
      filename
    });
  } catch (err: any) {
    console.error('[Banners] UPLOAD error:', err);
    return c.json({ success: false, error: err.message }, 500);
  }
});