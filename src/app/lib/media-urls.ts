import { projectId } from '../../../utils/supabase/info';

const MODEL_IMAGES_BUCKET = 'make-1d6e33e0-model-images';
const SITE_URL = 'https://www.toyoparts.com.br';
const LEGACY_MEDIA_CDN_BASE = 'https://increazy-folder.s3.amazonaws.com/5ebed78a28503303b0530072';
const MODEL_MENU_ICON_VERSION = '1770898453';
const VEHICLE_MENU_IMAGE_VERSION = '1770635254';

const MODEL_STORAGE_KEY_TO_MENU_ICON_FILENAME: Record<string, string> = {
  hilux: 'menu-hilux.svg',
  corolla: 'menu-corolla.svg',
  'corolla-cross': 'svg-corolla-cross.svg',
  yaris: 'menu-yaris.svg',
  sw4: 'menu-sw4.svg',
  etios: 'menu-etios.svg',
  rav4: 'menu-rav4.svg',
  prius: 'menu-prius.svg',
};

const MODEL_MENU_ICON_URLS: Record<string, string> = {
  'menu-hilux.svg': `${LEGACY_MEDIA_CDN_BASE}/menu-hilux.svg?v=${MODEL_MENU_ICON_VERSION}`,
  'menu-corolla.svg': `${LEGACY_MEDIA_CDN_BASE}/menu-corolla.svg?v=${MODEL_MENU_ICON_VERSION}`,
  'svg-corolla-cross.svg': `${LEGACY_MEDIA_CDN_BASE}/svg-corolla-cross.svg?v=${MODEL_MENU_ICON_VERSION}`,
  'menu-yaris.svg': `${LEGACY_MEDIA_CDN_BASE}/menu-yaris.svg?v=${MODEL_MENU_ICON_VERSION}`,
  'menu-sw4.svg': `${LEGACY_MEDIA_CDN_BASE}/menu-sw4.svg?v=${MODEL_MENU_ICON_VERSION}`,
  'menu-etios.svg': `${LEGACY_MEDIA_CDN_BASE}/menu-etios.svg?v=${MODEL_MENU_ICON_VERSION}`,
  'menu-rav4.svg': `${LEGACY_MEDIA_CDN_BASE}/menu-rav4.svg?v=${MODEL_MENU_ICON_VERSION}`,
  'menu-prius.svg': `${LEGACY_MEDIA_CDN_BASE}/menu-prius.svg?v=${MODEL_MENU_ICON_VERSION}`,
};

const VEHICLE_MENU_IMAGE_URLS: Record<string, string> = {
  'corolla-menu-acessorios-externos.jpg': `${LEGACY_MEDIA_CDN_BASE}/corolla-menu-acessorios-externos.jpg?v=${VEHICLE_MENU_IMAGE_VERSION}`,
  'corolla-menu-acessorios-internos.jpg': `${LEGACY_MEDIA_CDN_BASE}/corolla-menu-acessorios-internos.jpg?v=${VEHICLE_MENU_IMAGE_VERSION}`,
  'corolla-menu-iluminacao.jpg': `${LEGACY_MEDIA_CDN_BASE}/corolla-menu-iluminacao.jpg?v=${VEHICLE_MENU_IMAGE_VERSION}`,
  'corolla-menu-pecas.jpg': `${LEGACY_MEDIA_CDN_BASE}/corolla-menu-pecas.jpg?v=${VEHICLE_MENU_IMAGE_VERSION}`,
  'banner-departamento-corolla-cross-acessorio-externo.jpg': `${LEGACY_MEDIA_CDN_BASE}/banner-departamento-corolla-cross-acessorio-externo.jpg?v=${VEHICLE_MENU_IMAGE_VERSION}`,
  'banner-departamento-corolla-cross-acessorio-interno.jpg': `${LEGACY_MEDIA_CDN_BASE}/banner-departamento-corolla-cross-acessorio-interno.jpg?v=${VEHICLE_MENU_IMAGE_VERSION}`,
  'banne-departamento-corolla-cross-iluminacao.jpg': `${LEGACY_MEDIA_CDN_BASE}/banne-departamento-corolla-cross-iluminacao.jpg?v=${VEHICLE_MENU_IMAGE_VERSION}`,
  'banne-departamento-corolla-cross-pecas.jpg': `${LEGACY_MEDIA_CDN_BASE}/banne-departamento-corolla-cross-pecas.jpg?v=${VEHICLE_MENU_IMAGE_VERSION}`,
  'etios-menu-acessorios-externos.jpg': `${LEGACY_MEDIA_CDN_BASE}/etios-menu-acessorios-externos.jpg?v=${VEHICLE_MENU_IMAGE_VERSION}`,
  'etios-menu-acessorios-internos.jpg': `${LEGACY_MEDIA_CDN_BASE}/etios-menu-acessorios-internos.jpg?v=${VEHICLE_MENU_IMAGE_VERSION}`,
  'etios-menu-iluminacao.jpg': `${LEGACY_MEDIA_CDN_BASE}/etios-menu-iluminacao.jpg?v=${VEHICLE_MENU_IMAGE_VERSION}`,
  'etios-menu-pecas.jpg': `${LEGACY_MEDIA_CDN_BASE}/etios-menu-pecas.jpg?v=${VEHICLE_MENU_IMAGE_VERSION}`,
  'hilux-menu-acessorios-externos.jpg': `${LEGACY_MEDIA_CDN_BASE}/hilux-menu-acessorios-externos.jpg?v=${VEHICLE_MENU_IMAGE_VERSION}`,
  'hilux-menu-acessorios-internos.jpg': `${LEGACY_MEDIA_CDN_BASE}/hilux-menu-acessorios-internos.jpg?v=${VEHICLE_MENU_IMAGE_VERSION}`,
  'hilux-menu-iluminacao.jpg': `${LEGACY_MEDIA_CDN_BASE}/hilux-menu-iluminacao.jpg?v=${VEHICLE_MENU_IMAGE_VERSION}`,
  'hilux-menu-pecas.jpg': `${LEGACY_MEDIA_CDN_BASE}/hilux-menu-pecas.jpg?v=${VEHICLE_MENU_IMAGE_VERSION}`,
  'hilux-menu-santo-antonio.jpg': `${LEGACY_MEDIA_CDN_BASE}/hilux-menu-santo-antonio.jpg?v=${VEHICLE_MENU_IMAGE_VERSION}`,
  'sw4-menu-acessorios-externos.jpg': `${LEGACY_MEDIA_CDN_BASE}/sw4-menu-acessorios-externos.jpg?v=${VEHICLE_MENU_IMAGE_VERSION}`,
  'sw4-menu-acessorios-internos.jpg': `${LEGACY_MEDIA_CDN_BASE}/sw4-menu-acessorios-internos.jpg?v=${VEHICLE_MENU_IMAGE_VERSION}`,
  'sw4-menu-iluminacao.jpg': `${LEGACY_MEDIA_CDN_BASE}/sw4-menu-iluminacao.jpg?v=${VEHICLE_MENU_IMAGE_VERSION}`,
  'sw4-menu-pecas.jpg': `${LEGACY_MEDIA_CDN_BASE}/sw4-menu-pecas.jpg?v=${VEHICLE_MENU_IMAGE_VERSION}`,
  'sw4-menu-pickup-suv.jpg': `${LEGACY_MEDIA_CDN_BASE}/sw4-menu-pickup-suv.jpg?v=${VEHICLE_MENU_IMAGE_VERSION}`,
  'rav4-menu-acessorios-externos.jpg': `${LEGACY_MEDIA_CDN_BASE}/rav4-menu-acessorios-externos.jpg?v=${VEHICLE_MENU_IMAGE_VERSION}`,
  'rav4-menu-acessorios-internos.jpg': `${LEGACY_MEDIA_CDN_BASE}/rav4-menu-acessorios-internos.jpg?v=${VEHICLE_MENU_IMAGE_VERSION}`,
  'rav4-menu-iluminacao.jpg': `${LEGACY_MEDIA_CDN_BASE}/rav4-menu-iluminacao.jpg?v=${VEHICLE_MENU_IMAGE_VERSION}`,
  'rav4-menu-pecas.jpg': `${LEGACY_MEDIA_CDN_BASE}/rav4-menu-pecas.jpg?v=${VEHICLE_MENU_IMAGE_VERSION}`,
  'prius-menu-acessorios-externos.jpg': `${LEGACY_MEDIA_CDN_BASE}/prius-menu-acessorios-externos.jpg?v=${VEHICLE_MENU_IMAGE_VERSION}`,
  'prius-menu-acessorios-internos.jpg': `${LEGACY_MEDIA_CDN_BASE}/prius-menu-acessorios-internos.jpg?v=${VEHICLE_MENU_IMAGE_VERSION}`,
  'prius-menu-iluminacao.jpg': `${LEGACY_MEDIA_CDN_BASE}/prius-menu-iluminacao.jpg?v=${VEHICLE_MENU_IMAGE_VERSION}`,
  'prius-menu-pecas.jpg': `${LEGACY_MEDIA_CDN_BASE}/prius-menu-pecas.jpg?v=${VEHICLE_MENU_IMAGE_VERSION}`,
  // O acervo antigo nao trazia imagens dedicadas do Yaris para esse submenu.
  // Usamos o conjunto mais proximo estavel para evitar cards quebrados.
  'yaris-menu-acessorios-externos.jpg': `${LEGACY_MEDIA_CDN_BASE}/etios-menu-acessorios-externos.jpg?v=${VEHICLE_MENU_IMAGE_VERSION}`,
  'yaris-menu-acessorios-internos.jpg': `${LEGACY_MEDIA_CDN_BASE}/etios-menu-acessorios-internos.jpg?v=${VEHICLE_MENU_IMAGE_VERSION}`,
  'yaris-menu-iluminacao.jpg': `${LEGACY_MEDIA_CDN_BASE}/etios-menu-iluminacao.jpg?v=${VEHICLE_MENU_IMAGE_VERSION}`,
  'yaris-menu-pecas.jpg': `${LEGACY_MEDIA_CDN_BASE}/etios-menu-pecas.jpg?v=${VEHICLE_MENU_IMAGE_VERSION}`,
};

function sanitizeStorageKeySegment(value: string) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9:_-]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

export function buildSupabasePublicUrl(bucket: string, path: string) {
  const encodedPath = path
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
  return `https://${projectId}.supabase.co/storage/v1/object/public/${bucket}/${encodedPath}`;
}

export function buildToyopartsMediaUrl(path: string) {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${SITE_URL}${normalizedPath}`;
}

export function getModelStorageIconUrl(storageKey: string, extension = 'png') {
  const normalizedStorageKey = sanitizeStorageKeySegment(storageKey);
  const mappedMenuIconFilename = MODEL_STORAGE_KEY_TO_MENU_ICON_FILENAME[normalizedStorageKey];
  if (mappedMenuIconFilename) {
    return getModelMenuIconUrl(mappedMenuIconFilename);
  }

  return buildSupabasePublicUrl(
    MODEL_IMAGES_BUCKET,
    `${normalizedStorageKey}.${extension}`,
  );
}

export function getModelMenuIconUrl(filename: string) {
  const directUrl = MODEL_MENU_ICON_URLS[filename];
  if (directUrl) return directUrl;
  return buildToyopartsMediaUrl(`/media/model-menu-icons/${encodeURIComponent(filename)}`);
}

export function getVehicleMenuDepartmentImageUrl(filename: string) {
  const directUrl = VEHICLE_MENU_IMAGE_URLS[filename];
  if (directUrl) return directUrl;
  return buildToyopartsMediaUrl(`/media/vehicle-menu/${encodeURIComponent(filename)}`);
}

export function getRelativeLegacyProductImageUrl(file: string) {
  if (!file) return '';
  if (file.startsWith('http')) return file;
  if (file.startsWith('/')) return `/pub/media/catalog/product${file}`;
  return file;
}
