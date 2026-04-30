import { Hono } from 'npm:hono';
import { createClient } from 'jsr:@supabase/supabase-js@2.49.8';
import { LEGACY_SITE_URL } from './media-config.tsx';

export const publicBanners = new Hono();
export const adminBanners = new Hono();

const BANNER_IMAGES_BUCKET = 'make-1d6e33e0-banner-images';
const BANNER_MANIFEST_PATH = 'manifest/banners.json';
const KV_TABLE = 'kv_store_1d6e33e0';
const BANNER_PREFIX = 'banner:';
const BANNER_INDEX_KEY = 'meta:banner_index';
const LEGACY_IMPORT_TIMEOUT_MS = 1_500;
const BANNER_MEMORY_CACHE_MS = 60_000;
const BANNER_PUBLIC_PATH = '/media/home-banners';
const PUBLIC_SITE_URL = String(
  Deno.env.get('PUBLIC_SITE_URL')
  || Deno.env.get('SITE_URL')
  || Deno.env.get('WEBSITE_URL')
  || LEGACY_SITE_URL,
).replace(/\/+$/, '');

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

let bannerBucketReady = false;
let bannerReadMemoryCache:
  | {
      expiresAt: number;
      list: HeroBannerImageOnlyRecord[];
    }
  | null = null;

export interface HeroBannerImageOnlyRecord {
  id: string;
  active: boolean;
  order: number;
  desktopImageSrc: string;
  mobileImageSrc?: string;
  linkHref?: string;
  altText?: string;
  createdAt: string;
  updatedAt: string;
}

type LegacyBannerRecord = Record<string, unknown> & {
  id?: string;
  type?: string;
  desktopImageSrc?: string;
  mobileImageSrc?: string;
  linkHref?: string;
  altText?: string;
  active?: boolean;
  order?: number;
  createdAt?: string;
  updatedAt?: string;
};

function isNotFoundError(error: any): boolean {
  const message = String(error?.message || '').toLowerCase();
  return error?.statusCode === 404 || error?.status === 404 || message.includes('not found');
}

function sanitizeOptionalString(value: unknown): string | undefined {
  const normalized = typeof value === 'string' ? value.trim() : '';
  return normalized || undefined;
}

function stripLeadingSlash(value: string): string {
  return value.replace(/^\/+/, '');
}

function extractBannerStoragePath(value: string): string | null {
  const trimmed = String(value || '').trim();
  if (!trimmed) return null;

  if (trimmed.startsWith(`${BANNER_PUBLIC_PATH}/`)) {
    return stripLeadingSlash(trimmed.slice(BANNER_PUBLIC_PATH.length));
  }

  if (trimmed.startsWith('/')) {
    return null;
  }

  if (!/^https?:\/\//i.test(trimmed)) {
    return stripLeadingSlash(trimmed);
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.pathname.startsWith(`${BANNER_PUBLIC_PATH}/`)) {
      return stripLeadingSlash(parsed.pathname.slice(BANNER_PUBLIC_PATH.length));
    }

    const bucketPrefix = `/storage/v1/object/public/${BANNER_IMAGES_BUCKET}/`;
    const bucketIndex = parsed.pathname.indexOf(bucketPrefix);
    if (bucketIndex >= 0) {
      return stripLeadingSlash(parsed.pathname.slice(bucketIndex + bucketPrefix.length));
    }
  } catch {
    return null;
  }

  return null;
}

export function canonicalizeBannerAssetUrl(value: unknown): string | undefined {
  const normalized = sanitizeOptionalString(value);
  if (!normalized) return undefined;

  const storagePath = extractBannerStoragePath(normalized);
  if (storagePath) {
    return `${PUBLIC_SITE_URL}${BANNER_PUBLIC_PATH}/${storagePath}`;
  }

  if (normalized.startsWith(`${BANNER_PUBLIC_PATH}/`)) {
    return `${PUBLIC_SITE_URL}${normalized}`;
  }

  return normalized;
}

function sanitizeBannerId(value: unknown): string {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized) {
    throw new Error('Banner id e obrigatorio');
  }
  return normalized;
}

function normalizeBannerRecord(input: unknown, index = 0): HeroBannerImageOnlyRecord | null {
  if (!input || typeof input !== 'object') return null;

  const source = input as Record<string, unknown>;
  const desktopImageSrc = canonicalizeBannerAssetUrl(source.desktopImageSrc);
  if (!desktopImageSrc) return null;

  const createdAt = sanitizeOptionalString(source.createdAt) || new Date().toISOString();
  const updatedAt = sanitizeOptionalString(source.updatedAt) || createdAt;

  return {
    id: sanitizeBannerId(source.id),
    active: source.active !== false,
    order: Number.isFinite(Number(source.order)) ? Number(source.order) : index,
    desktopImageSrc,
    mobileImageSrc: canonicalizeBannerAssetUrl(source.mobileImageSrc),
    linkHref: sanitizeOptionalString(source.linkHref),
    altText: sanitizeOptionalString(source.altText),
    createdAt,
    updatedAt,
  };
}

function normalizeBannerList(input: unknown): HeroBannerImageOnlyRecord[] {
  if (!Array.isArray(input)) return [];

  const normalized = input
    .map((item, index) => {
      try {
        return normalizeBannerRecord(item, index);
      } catch {
        return null;
      }
    })
    .filter((item): item is HeroBannerImageOnlyRecord => Boolean(item));

  return [...normalized].sort((a, b) => {
    if (a.order !== b.order) return a.order - b.order;
    return a.id.localeCompare(b.id, 'pt-BR');
  });
}

function assertBannerPayload(input: unknown): HeroBannerImageOnlyRecord {
  const normalized = normalizeBannerRecord(input);
  if (!normalized) {
    throw new Error('Banner precisa ter id e imagem desktop');
  }
  return normalized;
}

async function ensureBannerBucket() {
  if (bannerBucketReady) return;

  try {
    const { data: buckets, error: listError } = await supabase.storage.listBuckets();
    if (listError) {
      throw new Error(listError.message);
    }

    const exists = buckets?.some((bucket) => bucket.name === BANNER_IMAGES_BUCKET);
    if (!exists) {
      const { error } = await supabase.storage.createBucket(BANNER_IMAGES_BUCKET, {
        public: true,
        fileSizeLimit: 10 * 1024 * 1024,
      });
      if (error) {
        throw new Error(error.message);
      }
    } else {
      await supabase.storage.updateBucket(BANNER_IMAGES_BUCKET, { public: true }).catch(() => {});
    }

    bannerBucketReady = true;
  } catch (error: any) {
    console.warn('[Banners] bucket setup error:', error?.message || error);
    throw error;
  }
}

async function readBannerManifest(): Promise<HeroBannerImageOnlyRecord[]> {
  await ensureBannerBucket();

  const { data, error } = await supabase.storage
    .from(BANNER_IMAGES_BUCKET)
    .download(BANNER_MANIFEST_PATH);

  if (error) {
    if (isNotFoundError(error)) {
      return [];
    }
    throw new Error(error.message || 'Nao foi possivel ler o manifesto de banners');
  }

  const text = await data.text();
  if (!text) return [];

  const parsed = JSON.parse(text);
  return normalizeBannerList(parsed?.banners ?? parsed);
}

function readBannerMemoryCache(): HeroBannerImageOnlyRecord[] {
  if (!bannerReadMemoryCache) return [];
  if (bannerReadMemoryCache.expiresAt <= Date.now()) {
    bannerReadMemoryCache = null;
    return [];
  }
  return bannerReadMemoryCache.list;
}

function writeBannerMemoryCache(list: HeroBannerImageOnlyRecord[]) {
  const normalized = normalizeBannerList(list);
  if (normalized.length === 0) return;
  bannerReadMemoryCache = {
    expiresAt: Date.now() + BANNER_MEMORY_CACHE_MS,
    list: normalized,
  };
}

async function writeBannerManifest(list: HeroBannerImageOnlyRecord[]): Promise<void> {
  await ensureBannerBucket();
  const normalized = normalizeBannerList(list);

  const payload = JSON.stringify(
    {
      version: 2,
      updatedAt: new Date().toISOString(),
      banners: normalized,
    },
    null,
    2,
  );

  const { error } = await supabase.storage
    .from(BANNER_IMAGES_BUCKET)
    .upload(BANNER_MANIFEST_PATH, new TextEncoder().encode(payload), {
      contentType: 'application/json; charset=utf-8',
      cacheControl: '60',
      upsert: true,
    });

  if (error) {
    throw new Error(error.message || 'Nao foi possivel salvar o manifesto de banners');
  }

  writeBannerMemoryCache(normalized);
}

async function fetchLegacyJson(url: URL): Promise<any> {
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!serviceRoleKey) return null;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${serviceRoleKey}`,
      apikey: serviceRoleKey,
    },
    signal: AbortSignal.timeout(LEGACY_IMPORT_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`legacy fetch failed (${response.status})`);
  }

  return await response.json();
}

async function readLegacyImageBannersBestEffort(): Promise<HeroBannerImageOnlyRecord[]> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  if (!supabaseUrl) return [];

  try {
    const indexUrl = new URL(`${supabaseUrl}/rest/v1/${KV_TABLE}`);
    indexUrl.searchParams.set('select', 'value');
    indexUrl.searchParams.set('key', `eq.${BANNER_INDEX_KEY}`);

    const indexRows = await fetchLegacyJson(indexUrl);
    const ids = Array.isArray(indexRows?.[0]?.value) ? indexRows[0].value : [];
    if (ids.length === 0) return [];

    const loaded: HeroBannerImageOnlyRecord[] = [];
    for (const id of ids) {
      const rowUrl = new URL(`${supabaseUrl}/rest/v1/${KV_TABLE}`);
      rowUrl.searchParams.set('select', 'value');
      rowUrl.searchParams.set('key', `eq.${BANNER_PREFIX}${String(id)}`);

      const rows = await fetchLegacyJson(rowUrl);
      const banner = rows?.[0]?.value as LegacyBannerRecord | undefined;
      if (!banner || banner.type !== 'image') continue;

      const normalized = normalizeBannerRecord({
        id: banner.id,
        active: banner.active,
        order: banner.order,
        desktopImageSrc: banner.desktopImageSrc,
        mobileImageSrc: banner.mobileImageSrc,
        linkHref: banner.linkHref,
        altText: banner.altText,
        createdAt: banner.createdAt,
        updatedAt: banner.updatedAt,
      }, loaded.length);

      if (normalized) {
        loaded.push(normalized);
      }
    }

    return normalizeBannerList(loaded);
  } catch (error) {
    console.warn('[Banners] legacy import unavailable:', error);
    return [];
  }
}

async function resolveBannerList(options?: {
  allowLegacyFallback?: boolean;
  persistLegacyFallback?: boolean;
}): Promise<HeroBannerImageOnlyRecord[]> {
  const allowLegacyFallback = options?.allowLegacyFallback !== false;
  const persistLegacyFallback = options?.persistLegacyFallback !== false;

  try {
    const manifestList = await readBannerManifest();
    if (manifestList.length > 0) {
      writeBannerMemoryCache(manifestList);
      return manifestList;
    }
  } catch (error) {
    console.warn('[Banners] manifest read failed, tentando fallback:', error);
  }

  const cachedList = readBannerMemoryCache();
  if (cachedList.length > 0) {
    return cachedList;
  }

  if (!allowLegacyFallback) {
    return [];
  }

  const legacyList = await readLegacyImageBannersBestEffort();
  if (legacyList.length === 0) {
    return [];
  }

  writeBannerMemoryCache(legacyList);

  if (persistLegacyFallback) {
    writeBannerManifest(legacyList).catch((error) => {
      console.warn('[Banners] nao foi possivel regravar manifesto com fallback legado:', error);
    });
  }

  return legacyList;
}

function buildPublicBannerResponse(list: HeroBannerImageOnlyRecord[]) {
  return {
    banners: list.map((banner) => ({
      id: banner.id,
      active: banner.active,
      order: banner.order,
      desktopImageSrc: banner.desktopImageSrc,
      mobileImageSrc: banner.mobileImageSrc,
      linkHref: banner.linkHref,
      altText: banner.altText,
    })),
  };
}

export async function getPublicHeroBanners(): Promise<ReturnType<typeof buildPublicBannerResponse>['banners']> {
  try {
    return buildPublicBannerResponse(await resolveBannerList()).banners;
  } catch (error) {
    console.warn('[Banners] snapshot read fallback:', error);
    return [];
  }
}

function buildAdminBannerResponse(list: HeroBannerImageOnlyRecord[]) {
  return {
    banners: list.map((banner) => ({ ...banner })),
  };
}

function buildPublicUrl(filename: string): string {
  return `${PUBLIC_SITE_URL}${BANNER_PUBLIC_PATH}/${stripLeadingSlash(filename)}`;
}

function sanitizeFileStem(name: string): string {
  return String(name || 'banner')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\.[^.]+$/, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-') || 'banner';
}

publicBanners.get('/', async (c) => {
  try {
    const list = await resolveBannerList();
    return c.json(buildPublicBannerResponse(list));
  } catch (error: any) {
    console.error('[Banners] public read error:', error);
    return c.json({ banners: [] });
  }
});

publicBanners.get('/asset/*', async (c) => {
  try {
    await ensureBannerBucket();
    const assetPath = c.req.path.replace(/^.*\/asset\//, '').trim();
    const normalizedAssetPath = stripLeadingSlash(assetPath);
    if (!normalizedAssetPath) {
      return c.body('Banner asset path is required', 400);
    }

    const { data, error } = await supabase.storage
      .from(BANNER_IMAGES_BUCKET)
      .download(normalizedAssetPath);

    if (error) {
      const status = isNotFoundError(error) ? 404 : 502;
      return c.body(error.message || 'Nao foi possivel carregar a imagem do banner', status);
    }

    const contentType = data.type || 'application/octet-stream';
    return new Response(data.stream(), {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400',
      },
    });
  } catch (error: any) {
    console.error('[Banners] asset read error:', error);
    return c.body(error?.message || 'Nao foi possivel carregar a imagem do banner', 502);
  }
});

adminBanners.get('/', async (c) => {
  try {
    const list = await resolveBannerList();
    return c.json(buildAdminBannerResponse(list));
  } catch (error: any) {
    console.error('[Banners] admin read error:', error);
    return c.json({ error: error?.message || 'Nao foi possivel carregar os banners' }, 500);
  }
});

adminBanners.post('/', async (c) => {
  try {
    const body = await c.req.json();
    const banner = assertBannerPayload(body?.banner);
    const existing = await resolveBannerList();
    const byId = new Map(existing.map((item) => [item.id, item]));
    byId.set(banner.id, {
      ...banner,
      createdAt: byId.get(banner.id)?.createdAt || banner.createdAt,
      updatedAt: new Date().toISOString(),
    });
    const updated = normalizeBannerList(Array.from(byId.values()));
    await writeBannerManifest(updated);
    return c.json({ success: true, banner: byId.get(banner.id) });
  } catch (error: any) {
    console.error('[Banners] admin save error:', error);
    return c.json({ success: false, error: error?.message || 'Nao foi possivel salvar o banner' }, 400);
  }
});

adminBanners.post('/batch', async (c) => {
  try {
    const body = await c.req.json();
    const items = body?.banners;
    if (!Array.isArray(items)) {
      return c.json({ success: false, error: 'Array banners[] e obrigatorio' }, 400);
    }

    const now = new Date().toISOString();
    const current = await resolveBannerList();
    const createdAtMap = new Map(current.map((item) => [item.id, item.createdAt]));
    const normalized = normalizeBannerList(
      items.map((item, index) => {
        const banner = assertBannerPayload(item);
        return {
          ...banner,
          order: index,
          createdAt: createdAtMap.get(banner.id) || banner.createdAt,
          updatedAt: now,
        };
      }),
    );
    await writeBannerManifest(normalized);
    return c.json({ success: true, count: normalized.length });
  } catch (error: any) {
    console.error('[Banners] admin batch save error:', error);
    return c.json({ success: false, error: error?.message || 'Nao foi possivel salvar a ordem dos banners' }, 400);
  }
});

adminBanners.delete('/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const existing = await resolveBannerList();
    const updated = existing.filter((banner) => banner.id !== id);
    await writeBannerManifest(updated);
    return c.json({ success: true });
  } catch (error: any) {
    console.error('[Banners] admin delete error:', error);
    return c.json({ success: false, error: error?.message || 'Nao foi possivel remover o banner' }, 500);
  }
});

adminBanners.post('/import-legacy', async (c) => {
  try {
    const legacy = await readLegacyImageBannersBestEffort();
    if (legacy.length === 0) {
      return c.json({ success: false, error: 'Nenhum banner image-only foi encontrado no legado' }, 404);
    }
    await writeBannerManifest(legacy);
    return c.json({ success: true, count: legacy.length });
  } catch (error: any) {
    console.error('[Banners] legacy import error:', error);
    return c.json({ success: false, error: error?.message || 'Nao foi possivel importar o legado' }, 500);
  }
});

adminBanners.post('/upload', async (c) => {
  try {
    await ensureBannerBucket();

    const formData = await c.req.formData();
    const file = formData.get('image');

    if (!(file instanceof File)) {
      return c.json({ success: false, error: 'Arquivo de imagem e obrigatorio' }, 400);
    }

    if (file.type !== 'image/webp') {
      return c.json({ success: false, error: 'O upload final do banner precisa estar em WebP' }, 400);
    }

    const arrayBuffer = await file.arrayBuffer();
    const filename = `hero/${Date.now()}-${crypto.randomUUID()}-${sanitizeFileStem(file.name)}.webp`;

    const { data, error } = await supabase.storage
      .from(BANNER_IMAGES_BUCKET)
      .upload(filename, new Uint8Array(arrayBuffer), {
        contentType: 'image/webp',
        cacheControl: '3600',
        upsert: false,
      });

    if (error) {
      throw new Error(error.message || 'Nao foi possivel enviar a imagem');
    }

    return c.json({
      success: true,
      url: buildPublicUrl(filename),
      path: data.path,
      filename,
    });
  } catch (error: any) {
    console.error('[Banners] upload error:', error);
    return c.json({ success: false, error: error?.message || 'Nao foi possivel enviar a imagem' }, 500);
  }
});
