import {
  BANNER_IMAGES_BUCKET,
  CATEGORY_IMAGES_BUCKET,
  LEGACY_SITE_URL,
  MODEL_IMAGES_BUCKET,
  PRODUCT_IMAGE_SYNC_BUCKET,
  PRODUCT_UPLOAD_BUCKET,
} from './media-config.tsx';

type ProductImageSource = 'storage' | 'upload' | 'legacy';
type ProductImageSyncStatus = 'pending' | 'synced' | 'missing' | 'error';

interface ResolveProductMediaOptions {
  allowLegacy?: boolean;
}

interface ResolvedProductMedia {
  image_url: string | null;
  images: string[];
  has_image: boolean;
  _image_source: ProductImageSource;
  _legacy_image_paths: string[];
  _image_storage_paths: string[];
  _image_sync_status: ProductImageSyncStatus;
}

const PRODUCT_CANONICAL_BUCKETS = [PRODUCT_IMAGE_SYNC_BUCKET, PRODUCT_UPLOAD_BUCKET];
const PRODUCT_IMAGE_ATTRS = ['image', 'small_image', 'thumbnail', 'swatch_image'];
const PLACEHOLDER_PATTERNS = ['no_selection', '/placeholder/', 'placeholder_', 'default_image'];
const PRODUCT_SYNC_PUBLIC_PATH = '/media/product-images';
const PRODUCT_UPLOAD_PUBLIC_PATH = '/media/product-uploads';

function supabaseUrl() {
  return String(Deno.env.get('SUPABASE_URL') || '').replace(/\/$/, '');
}

function canonicalSiteUrl() {
  return String(Deno.env.get('PUBLIC_SITE_URL') || LEGACY_SITE_URL).replace(/\/$/, '');
}

function buildCanonicalMediaUrl(publicPath: string, path: string) {
  const normalizedPath = String(path || '').replace(/^\/+/, '');
  return `${canonicalSiteUrl()}${publicPath}/${normalizedPath}`;
}

function canonicalizeProductBucketUrl(url: string | null | undefined): string | null {
  const parsed = parseStoragePublicUrl(url);
  if (!parsed) return String(url || '').trim() || null;
  if (parsed.bucket === PRODUCT_IMAGE_SYNC_BUCKET) {
    return buildCanonicalMediaUrl(PRODUCT_SYNC_PUBLIC_PATH, parsed.path);
  }
  if (parsed.bucket === PRODUCT_UPLOAD_BUCKET) {
    return buildCanonicalMediaUrl(PRODUCT_UPLOAD_PUBLIC_PATH, parsed.path);
  }
  return String(url || '').trim() || null;
}

export function buildStoragePublicUrl(bucket: string, path: string) {
  if (bucket === PRODUCT_IMAGE_SYNC_BUCKET) {
    return buildCanonicalMediaUrl(PRODUCT_SYNC_PUBLIC_PATH, path);
  }
  if (bucket === PRODUCT_UPLOAD_BUCKET) {
    return buildCanonicalMediaUrl(PRODUCT_UPLOAD_PUBLIC_PATH, path);
  }
  return `${supabaseUrl()}/storage/v1/object/public/${bucket}/${path}`;
}

export function parseStoragePublicUrl(url: string | null | undefined): { bucket: string; path: string } | null {
  const value = String(url || '').trim();
  if (!value) return null;
  try {
    const parsed = new URL(value, canonicalSiteUrl());
    if (parsed.pathname.startsWith(`${PRODUCT_SYNC_PUBLIC_PATH}/`)) {
      return {
        bucket: PRODUCT_IMAGE_SYNC_BUCKET,
        path: decodeURIComponent(parsed.pathname.slice(`${PRODUCT_SYNC_PUBLIC_PATH}/`.length)),
      };
    }
    if (parsed.pathname.startsWith(`${PRODUCT_UPLOAD_PUBLIC_PATH}/`)) {
      return {
        bucket: PRODUCT_UPLOAD_BUCKET,
        path: decodeURIComponent(parsed.pathname.slice(`${PRODUCT_UPLOAD_PUBLIC_PATH}/`.length)),
      };
    }
  } catch {
    // Fallback to storage parsing below.
  }
  const match = value.match(/\/storage\/v1\/object\/public\/([^/]+)\/(.+)$/i);
  if (!match) return null;
  return {
    bucket: decodeURIComponent(match[1]),
    path: decodeURIComponent(match[2]),
  };
}

export function isStoragePublicUrl(url: string | null | undefined, buckets?: string[]) {
  const parsed = parseStoragePublicUrl(url);
  if (!parsed) return false;
  return !buckets || buckets.includes(parsed.bucket);
}

export function isLegacyMediaUrl(url: string | null | undefined) {
  const value = String(url || '').trim();
  if (!value) return false;
  return value.startsWith(`${LEGACY_SITE_URL}/pub/media/`);
}

export function normalizeMagentoProductImagePath(value: string | null | undefined): string | null {
  const raw = String(value || '').trim();
  if (!raw || raw === 'no_selection') return null;
  if (PLACEHOLDER_PATTERNS.some((pattern) => raw.toLowerCase().includes(pattern))) return null;
  if (raw.startsWith('http')) {
    const marker = '/pub/media/catalog/product';
    const idx = raw.indexOf(marker);
    if (idx === -1) return null;
    const path = raw.slice(idx + marker.length);
    return path.startsWith('/') ? path : `/${path}`;
  }
  if (raw.startsWith('/')) return raw;
  return `/${raw}`;
}

export function buildLegacyProductImageUrl(path: string | null | undefined): string | null {
  const normalized = normalizeMagentoProductImagePath(path);
  if (!normalized) return null;
  return `${LEGACY_SITE_URL}/pub/media/catalog/product${normalized}`;
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

function getCustomAttr(product: any, code: string) {
  return product?.custom_attributes?.find((attr: any) => attr?.attribute_code === code)?.value;
}

export function extractProductLegacyImagePaths(product: any) {
  const values: string[] = [];
  for (const attrCode of PRODUCT_IMAGE_ATTRS) {
    const attrValue = getCustomAttr(product, attrCode);
    const normalized = normalizeMagentoProductImagePath(attrValue);
    if (normalized) values.push(normalized);
  }

  const galleries = [product?.media_gallery_entries, product?.media_gallery];
  for (const entries of galleries) {
    if (!Array.isArray(entries)) continue;
    for (const entry of entries) {
      const normalized = normalizeMagentoProductImagePath(entry?.file);
      if (normalized) values.push(normalized);
    }
  }

  return uniqueStrings(values);
}

function collectCanonicalProductUrls(product: any) {
  const urls: string[] = [];

  if (product?.image_url && String(product.image_url).startsWith('http') && !isLegacyMediaUrl(product.image_url)) {
    urls.push(canonicalizeProductBucketUrl(String(product.image_url)) || String(product.image_url));
  }

  if (Array.isArray(product?.images)) {
    for (const image of product.images) {
      if (String(image || '').startsWith('http') && !isLegacyMediaUrl(String(image))) {
        urls.push(canonicalizeProductBucketUrl(String(image)) || String(image));
      }
    }
  }

  const galleries = [product?.media_gallery_entries, product?.media_gallery];
  for (const entries of galleries) {
    if (!Array.isArray(entries)) continue;
    for (const entry of entries) {
      if (String(entry?.file || '').startsWith('http') && !isLegacyMediaUrl(String(entry.file))) {
        urls.push(canonicalizeProductBucketUrl(String(entry.file)) || String(entry.file));
      }
    }
  }

  return uniqueStrings(urls);
}

function deriveStorageUrlsFromPaths(storagePaths: string[]) {
  return storagePaths
    .map((path) => {
      const trimmed = String(path || '').trim();
      if (!trimmed) return null;
      return buildStoragePublicUrl(PRODUCT_IMAGE_SYNC_BUCKET, trimmed);
    })
    .filter((value): value is string => !!value);
}

export function resolveProductMedia(product: any, options: ResolveProductMediaOptions = {}): ResolvedProductMedia {
  const allowLegacy = options.allowLegacy === true;
  const legacyPaths = uniqueStrings([
    ...(Array.isArray(product?._legacy_image_paths) ? product._legacy_image_paths : []),
    ...extractProductLegacyImagePaths(product),
  ]);
  const storagePaths = uniqueStrings([
    ...(Array.isArray(product?._image_storage_paths) ? product._image_storage_paths : []),
    ...(Array.isArray(product?.images) ? product.images : [])
      .map((url: any) => parseStoragePublicUrl(String(url || '')))
      .filter((value): value is { bucket: string; path: string } => !!value && value.bucket === PRODUCT_IMAGE_SYNC_BUCKET)
      .map((value) => value.path),
  ]);

  const canonicalUrls = uniqueStrings([
    ...collectCanonicalProductUrls(product),
    ...deriveStorageUrlsFromPaths(storagePaths),
  ]);

  let imageSource: ProductImageSource = 'legacy';
  if (canonicalUrls.some((url) => isStoragePublicUrl(url, [PRODUCT_UPLOAD_BUCKET]))) {
    imageSource = 'upload';
  } else if (canonicalUrls.some((url) => isStoragePublicUrl(url, [PRODUCT_IMAGE_SYNC_BUCKET]))) {
    imageSource = 'storage';
  }

  const legacyUrls = allowLegacy ? legacyPaths.map((path) => buildLegacyProductImageUrl(path)).filter((value): value is string => !!value) : [];
  const images = canonicalUrls.length > 0 ? canonicalUrls : legacyUrls;
  const explicitStatus = String(product?._image_sync_status || '').trim();
  let syncStatus: ProductImageSyncStatus;

  if (explicitStatus === 'pending' || explicitStatus === 'synced' || explicitStatus === 'missing' || explicitStatus === 'error') {
    syncStatus = explicitStatus;
  } else if (canonicalUrls.length > 0) {
    syncStatus = 'synced';
  } else if (legacyPaths.length > 0) {
    syncStatus = 'pending';
  } else {
    syncStatus = 'missing';
  }

  return {
    image_url: images[0] || null,
    images,
    has_image: images.length > 0,
    _image_source: imageSource,
    _legacy_image_paths: legacyPaths,
    _image_storage_paths: storagePaths,
    _image_sync_status: syncStatus,
  };
}

export function isCanonicalProductImageUrl(url: string | null | undefined) {
  return isStoragePublicUrl(url, PRODUCT_CANONICAL_BUCKETS);
}

export function isCanonicalScopedUrl(url: string | null | undefined, bucket: string) {
  return isStoragePublicUrl(url, [bucket]);
}

export function sanitizeStorageKeySegment(value: string) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9:_-]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

export function inferRemoteImageExtension(value: string | null | undefined) {
  const normalized = String(value || '').split('?')[0].toLowerCase();
  const match = normalized.match(/\.([a-z0-9]{3,4})$/);
  const ext = match?.[1] || 'jpg';
  return ['jpg', 'jpeg', 'png', 'webp', 'gif', 'svg'].includes(ext) ? ext : 'jpg';
}

export function isCanonicalCategoryUrl(url: string | null | undefined) {
  return isCanonicalScopedUrl(url, CATEGORY_IMAGES_BUCKET);
}

export function isCanonicalModelUrl(url: string | null | undefined) {
  return isCanonicalScopedUrl(url, MODEL_IMAGES_BUCKET);
}

export function isCanonicalBannerUrl(url: string | null | undefined) {
  return isCanonicalScopedUrl(url, BANNER_IMAGES_BUCKET);
}
