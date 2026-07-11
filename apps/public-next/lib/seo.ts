export const SITE_NAME = 'Toyoparts';
export const SITE_URL = 'https://www.toyoparts.com.br';
export const SITE_DESCRIPTION = 'Compre pecas e acessorios genuinos Toyota para Hilux, Corolla, SW4, Yaris, Etios, RAV4, Prius e Corolla Cross com envio para todo o Brasil.';
export const SITE_DEFAULT_TITLE = 'Toyoparts | Pecas e Acessorios Genuinos Toyota';
export const DEFAULT_OG_IMAGE = '/og-home.svg';

export function buildAbsoluteUrl(pathOrUrl: string): string {
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  const normalizedPath = pathOrUrl.startsWith('/') ? pathOrUrl : `/${pathOrUrl}`;
  return `${SITE_URL}${normalizedPath}`;
}

export function normalizeProductImages(product: { image_url?: string | null; images?: unknown[] }) {
  const seen = new Set<string>();
  const images: string[] = [];
  const candidates = [
    product.image_url,
    ...(Array.isArray(product.images) ? product.images : []),
  ];

  for (const candidate of candidates) {
    const value = String(candidate || '').trim();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    images.push(buildAbsoluteUrl(value));
  }

  return images;
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

export interface CarModelSEO {
  id: string;
  slug: string;
  name: string;
  modeloIds: string[];
  storageKey?: string;
  imgSrc?: string;
  svgSrc?: string;
  seoTitle: string;
  seoDescription: string;
}

export const CAR_MODELS_SEO: CarModelSEO[] = [
  {
    id: 'hilux',
    slug: 'hilux',
    name: 'Hilux',
    modeloIds: ['Hilux', '38'],
    seoTitle: 'Pecas e Acessorios Toyota Hilux',
    seoDescription: 'Encontre pecas e acessorios genuinos Toyota para Hilux.',
  },
  {
    id: 'corolla',
    slug: 'corolla',
    name: 'Corolla',
    modeloIds: ['Corolla', '35'],
    seoTitle: 'Pecas e Acessorios Toyota Corolla',
    seoDescription: 'Pecas genuinas Toyota para Corolla.',
  },
  {
    id: 'corolla-cross',
    slug: 'corolla-cross',
    name: 'Corolla Cross',
    modeloIds: ['Corolla Cross', '5646'],
    seoTitle: 'Pecas e Acessorios Toyota Corolla Cross',
    seoDescription: 'Pecas e acessorios originais Toyota para Corolla Cross.',
  },
  {
    id: 'yaris',
    slug: 'yaris',
    name: 'Yaris',
    modeloIds: ['Yaris', '37'],
    seoTitle: 'Pecas e Acessorios Toyota Yaris',
    seoDescription: 'Pecas e acessorios genuinos Toyota para Yaris.',
  },
  {
    id: 'sw4',
    slug: 'sw4',
    name: 'SW4',
    modeloIds: ['SW4', '40'],
    seoTitle: 'Pecas e Acessorios Toyota SW4',
    seoDescription: 'Pecas genuinas Toyota para SW4.',
  },
  {
    id: 'etios',
    slug: 'etios',
    name: 'Etios',
    modeloIds: ['Etios', '36'],
    seoTitle: 'Pecas e Acessorios Toyota Etios',
    seoDescription: 'Encontre pecas e acessorios originais Toyota para Etios.',
  },
  {
    id: 'rav4',
    slug: 'rav4',
    name: 'RAV4',
    modeloIds: ['RAV4', 'Rav4', '39'],
    seoTitle: 'Pecas e Acessorios Toyota RAV4',
    seoDescription: 'Pecas genuinas Toyota para RAV4.',
  },
  {
    id: 'prius',
    slug: 'prius',
    name: 'Prius',
    modeloIds: ['Prius', '42'],
    seoTitle: 'Pecas e Acessorios Toyota Prius',
    seoDescription: 'Pecas e acessorios originais para Toyota Prius.',
  },
];

export function getModelBySlug(slug: string): CarModelSEO | undefined {
  return CAR_MODELS_SEO.find((model) => model.slug === slug);
}

export function getModelById(idOrName: string): CarModelSEO | undefined {
  return CAR_MODELS_SEO.find((model) =>
    model.modeloIds.includes(idOrName) ||
    model.name.toLowerCase() === idOrName.toLowerCase() ||
    model.slug.toLowerCase() === idOrName.toLowerCase()
  );
}

export function generateProductJsonLd(product: {
  sku: string;
  name: string;
  seo_title?: string;
  description?: string;
  price: number;
  special_price?: number | null;
  image_url?: string;
  images?: unknown[];
  in_stock?: boolean;
  url_key?: string;
  url_slug?: string;
  modelo_label?: string;
  ano_labels?: string;
}) {
  const images = normalizeProductImages(product);

  const name = product.seo_title || product.name;
  const url = `${SITE_URL}/produto/${product.sku}/${product.url_slug || product.url_key || slugify(product.name)}`;

  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name,
    sku: product.sku,
    description: (product.description || '').replace(/<[^>]*>/g, '').slice(0, 500),
    brand: { '@type': 'Brand', name: 'Toyota' },
    ...(images.length > 0 ? { image: images } : {}),
    offers: {
      '@type': 'Offer',
      price: product.special_price && product.special_price < product.price
        ? product.special_price.toFixed(2)
        : product.price.toFixed(2),
      priceCurrency: 'BRL',
      availability: product.in_stock !== false ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
      seller: { '@type': 'Organization', name: SITE_NAME },
      url,
    },
  };
}

export function generateBreadcrumbJsonLd(items: Array<{ name: string; path: string }>) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: buildAbsoluteUrl(item.path),
    })),
  };
}

export function generateOrganizationJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'AutoPartsStore',
    name: SITE_NAME,
    url: SITE_URL,
    description: SITE_DESCRIPTION,
    logo: buildAbsoluteUrl('/brand/toyoparts-email-logo.png'),
    contactPoint: {
      '@type': 'ContactPoint',
      contactType: 'customer service',
      availableLanguage: 'Portuguese',
    },
  };
}

export function generateWebSiteJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: SITE_NAME,
    url: SITE_URL,
    description: SITE_DESCRIPTION,
    potentialAction: {
      '@type': 'SearchAction',
      target: `${SITE_URL}/busca?q={search_term_string}`,
      'query-input': 'required name=search_term_string',
    },
  };
}
