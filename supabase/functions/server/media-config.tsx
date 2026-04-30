export const LEGACY_SITE_URL = 'https://www.toyoparts.com.br';

export const PRODUCT_IMAGE_SYNC_BUCKET = 'make-1d6e33e0-product-images';
export const PRODUCT_UPLOAD_BUCKET = 'make-1d6e33e0-products';
export const CATEGORY_IMAGES_BUCKET = 'make-1d6e33e0-category-images';
export const MODEL_IMAGES_BUCKET = 'make-1d6e33e0-model-images';
export const BANNER_IMAGES_BUCKET = 'make-1d6e33e0-banner-images';

export const CATEGORY_IMAGES_MAP_KEY = 'meta:category_images_map';
export const MODEL_IMAGES_MAP_KEY = 'meta:model_images_map';
export const IMAGE_SYNC_STATUS_KEY = 'meta:image_sync_status';
export const IMAGE_SYNC_LEGACY_KEY = 'meta:image_sync_paths';

export const CATEGORY_IMAGE_SOURCES: Record<string, string> = {
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

export const MODEL_IMAGE_SOURCES: Record<string, string> = {
  HILUX: 'https://toyoparts.com.br/pub/media/catalog/icons/models/HILUX.png?v=1',
  COROLLA: 'https://toyoparts.com.br/pub/media/catalog/icons/models/COROLLA.png?v=1',
  'COROLLA CROSS': 'https://toyoparts.com.br/pub/media/catalog/icons/models/COROLLA%20CROSS.png?v=1',
  YARIS: 'https://toyoparts.com.br/pub/media/catalog/icons/models/YARIS.png?v=1',
  SW4: 'https://toyoparts.com.br/pub/media/catalog/icons/models/SW4.png?v=1',
  ETIOS: 'https://toyoparts.com.br/pub/media/catalog/icons/models/ETIOS.png?v=1',
  RAV4: 'https://toyoparts.com.br/pub/media/catalog/icons/models/RAV4.png?v=1',
  PRIUS: 'https://toyoparts.com.br/pub/media/catalog/icons/models/PRIUS.png?v=1',
};

export const BANNER_PREFIX = 'banner:';
export const BANNER_INDEX_KEY = 'meta:banner_index';
