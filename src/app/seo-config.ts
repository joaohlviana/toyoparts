// --- SEO Configuration ---
// Centralizes all SEO-related constants, slugs, and utilities

export const SITE_NAME = 'Toyoparts';
export const SITE_URL = 'https://www.toyoparts.com.br';
export const SITE_DESCRIPTION = 'Pecas e acessorios genuinos Toyota. Hilux, Corolla, SW4, Yaris, Etios, RAV4, Prius e Corolla Cross.';

// --- Slugify ---

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

// --- Car Models (SEO-ready) ---

export interface CarModelSEO {
  id: string;
  slug: string;
  name: string;
  modeloIds: string[];
  storageKey: string;
  imgSrc: string;
  svgSrc: string;
  seoTitle: string;
  seoDescription: string;
}

export const CAR_MODELS_SEO: CarModelSEO[] = [
  {
    id: 'hilux', slug: 'hilux', name: 'Hilux',
    modeloIds: ['Hilux', '35'], storageKey: 'HILUX',
    imgSrc: 'https://toyoparts.com.br/pub/media/catalog/icons/models/HILUX.png?v=1',
    svgSrc: 'https://increazy-folder.s3.amazonaws.com/5ebed78a28503303b0530072/menu-hilux.svg?v=1770898453',
    seoTitle: 'Pecas e Acessorios Toyota Hilux',
    seoDescription: 'Encontre pecas e acessorios genuinos Toyota para Hilux. Filtros, pastilhas, amortecedores e mais com garantia de fabrica.',
  },
  {
    id: 'corolla', slug: 'corolla', name: 'Corolla',
    modeloIds: ['Corolla', '38'], storageKey: 'COROLLA',
    imgSrc: 'https://toyoparts.com.br/pub/media/catalog/icons/models/COROLLA.png?v=1',
    svgSrc: 'https://increazy-folder.s3.amazonaws.com/5ebed78a28503303b0530072/menu-corolla.svg?v=1770898453',
    seoTitle: 'Pecas e Acessorios Toyota Corolla',
    seoDescription: 'Pecas genuinas Toyota para Corolla. Filtros, velas, pastilhas de freio, amortecedores e acessorios originais.',
  },
  {
    id: 'corolla-cross', slug: 'corolla-cross', name: 'Corolla Cross',
    modeloIds: ['Corolla Cross', '206'], storageKey: 'COROLLA CROSS',
    imgSrc: 'https://toyoparts.com.br/pub/media/catalog/icons/models/COROLLA%20CROSS.png?v=1',
    svgSrc: 'https://increazy-folder.s3.amazonaws.com/5ebed78a28503303b0530072/svg-corolla-cross.svg?v=1770898453',
    seoTitle: 'Pecas e Acessorios Toyota Corolla Cross',
    seoDescription: 'Pecas e acessorios originais Toyota para Corolla Cross. Tudo para seu SUV com garantia Toyota.',
  },
  {
    id: 'yaris', slug: 'yaris', name: 'Yaris',
    modeloIds: ['Yaris', '205'], storageKey: 'YARIS',
    imgSrc: 'https://toyoparts.com.br/pub/media/catalog/icons/models/YARIS.png?v=1',
    svgSrc: 'https://increazy-folder.s3.amazonaws.com/5ebed78a28503303b0530072/menu-yaris.svg?v=1770898453',
    seoTitle: 'Pecas e Acessorios Toyota Yaris',
    seoDescription: 'Pecas e acessorios genuinos Toyota para Yaris hatch e sedan. Envio rapido para todo Brasil.',
  },
  {
    id: 'sw4', slug: 'sw4', name: 'SW4',
    modeloIds: ['SW4', '204'], storageKey: 'SW4',
    imgSrc: 'https://toyoparts.com.br/pub/media/catalog/icons/models/SW4.png?v=1',
    svgSrc: 'https://increazy-folder.s3.amazonaws.com/5ebed78a28503303b0530072/menu-sw4.svg?v=1770898453',
    seoTitle: 'Pecas e Acessorios Toyota SW4',
    seoDescription: 'Pecas genuinas Toyota para SW4. Filtros, freios, suspensao, acessorios internos e externos originais.',
  },
  {
    id: 'etios', slug: 'etios', name: 'Etios',
    modeloIds: ['Etios', '37', '207'], storageKey: 'ETIOS',
    imgSrc: 'https://toyoparts.com.br/pub/media/catalog/icons/models/ETIOS.png?v=1',
    svgSrc: 'https://increazy-folder.s3.amazonaws.com/5ebed78a28503303b0530072/menu-etios.svg?v=1770898453',
    seoTitle: 'Pecas e Acessorios Toyota Etios',
    seoDescription: 'Encontre pecas e acessorios originais Toyota para Etios. Qualidade garantida e preco justo.',
  },
  {
    id: 'rav4', slug: 'rav4', name: 'RAV4',
    modeloIds: ['RAV4', 'Rav4', '36'], storageKey: 'RAV4',
    imgSrc: 'https://toyoparts.com.br/pub/media/catalog/icons/models/RAV4.png?v=1',
    svgSrc: 'https://increazy-folder.s3.amazonaws.com/5ebed78a28503303b0530072/menu-rav4.svg?v=1770898453',
    seoTitle: 'Pecas e Acessorios Toyota RAV4',
    seoDescription: 'Pecas genuinas Toyota para RAV4. Acessorios, filtros, freios e muito mais com garantia.',
  },
  {
    id: 'prius', slug: 'prius', name: 'Prius',
    modeloIds: ['Prius', '40'], storageKey: 'PRIUS',
    imgSrc: 'https://toyoparts.com.br/pub/media/catalog/icons/models/PRIUS.png?v=1',
    svgSrc: 'https://increazy-folder.s3.amazonaws.com/5ebed78a28503303b0530072/menu-prius.svg?v=1770898453',
    seoTitle: 'Pecas e Acessorios Toyota Prius',
    seoDescription: 'Pecas e acessorios originais para Toyota Prius hibrido. Componentes genuinos com garantia.',
  },
];

export function getModelBySlug(slug: string): CarModelSEO | undefined {
  return CAR_MODELS_SEO.find(m => m.slug === slug);
}

export function getModelById(idOrName: string): CarModelSEO | undefined {
  return CAR_MODELS_SEO.find(m => 
    m.modeloIds.includes(idOrName) || 
    m.name.toLowerCase() === idOrName.toLowerCase() ||
    m.slug.toLowerCase() === idOrName.toLowerCase()
  );
}

// --- SEO Score Calculator ---

export interface SEOScoreResult {
  total: number;
  maxScore: number;
  percentage: number;
  checks: SEOCheck[];
}

export interface SEOCheck {
  label: string;
  passed: boolean;
  score: number;
  maxScore: number;
  detail: string;
}

export function calculateSEOScore(product: {
  seo_title?: string;
  meta_description?: string;
  url_key?: string;
  name?: string;
  description?: string;
  short_description?: string;
  image_url?: string;
  modelo_label?: string;
  ano_labels?: string;
  [key: string]: any;
}): SEOScoreResult {
  const checks: SEOCheck[] = [];

  // 1. SEO Title (20 pts)
  const title = product.seo_title || product.name || '';
  const titleLen = title.length;
  const titleHasModel = product.modelo_label ? title.toLowerCase().includes(product.modelo_label.toLowerCase()) : false;
  let titleScore = 0;
  let titleDetail = '';
  if (titleLen >= 30 && titleLen <= 65) { titleScore += 10; titleDetail = `${titleLen} chars (ideal)`; }
  else if (titleLen > 0) { titleScore += 5; titleDetail = `${titleLen} chars (ideal: 30-65)`; }
  else { titleDetail = 'Sem titulo SEO'; }
  if (titleHasModel) { titleScore += 5; titleDetail += ' + modelo'; }
  if (title.length > 0 && title !== product.name) { titleScore += 5; titleDetail += ' + customizado'; }
  checks.push({ label: 'Titulo SEO', passed: titleScore >= 15, score: titleScore, maxScore: 20, detail: titleDetail });

  // 2. Meta Description (20 pts)
  const desc = product.meta_description || product.short_description || '';
  const descLen = desc.length;
  let descScore = 0;
  let descDetail = '';
  if (descLen >= 120 && descLen <= 160) { descScore = 20; descDetail = `${descLen} chars (perfeito)`; }
  else if (descLen >= 80 && descLen < 120) { descScore = 12; descDetail = `${descLen} chars (curta, ideal 120-160)`; }
  else if (descLen > 160) { descScore = 10; descDetail = `${descLen} chars (longa, sera cortada)`; }
  else if (descLen > 0) { descScore = 5; descDetail = `${descLen} chars (muito curta)`; }
  else { descDetail = 'Sem meta description'; }
  checks.push({ label: 'Meta Description', passed: descScore >= 15, score: descScore, maxScore: 20, detail: descDetail });

  // 3. URL Key (15 pts)
  const urlKey = product.url_key || '';
  let urlScore = 0;
  let urlDetail = '';
  if (urlKey.length > 0) {
    urlScore += 8;
    urlDetail = urlKey.length <= 75 ? 'URL limpa' : 'URL muito longa (>75 chars)';
    if (!/[A-Z]/.test(urlKey) && !/[^\x00-\x7F]/.test(urlKey)) { urlScore += 4; urlDetail += ' + sem acentos'; }
    if (urlKey.includes('-')) { urlScore += 3; urlDetail += ' + hifenizada'; }
  } else { urlDetail = 'Sem URL key'; }
  checks.push({ label: 'URL Amigavel', passed: urlScore >= 12, score: urlScore, maxScore: 15, detail: urlDetail });

  // 4. Descricao (20 pts)
  const fullDesc = product.description || '';
  const descTextLen = fullDesc.replace(/<[^>]*>/g, '').length;
  let fullDescScore = 0;
  let fullDescDetail = '';
  if (descTextLen >= 300) { fullDescScore = 20; fullDescDetail = `${descTextLen} chars (excelente)`; }
  else if (descTextLen >= 150) { fullDescScore = 12; fullDescDetail = `${descTextLen} chars (boa)`; }
  else if (descTextLen > 0) { fullDescScore = 5; fullDescDetail = `${descTextLen} chars (curta)`; }
  else { fullDescDetail = 'Sem descricao'; }
  checks.push({ label: 'Descricao do Produto', passed: fullDescScore >= 15, score: fullDescScore, maxScore: 20, detail: fullDescDetail });

  // 5. Imagem (10 pts)
  const hasImg = !!product.image_url;
  checks.push({ label: 'Imagem Principal', passed: hasImg, score: hasImg ? 10 : 0, maxScore: 10, detail: hasImg ? 'Imagem presente' : 'Sem imagem' });

  // 6. Compatibilidade (15 pts)
  const hasModel = !!product.modelo_label;
  const hasYear = !!product.ano_labels;
  let compatScore = 0;
  let compatDetail = '';
  if (hasModel) { compatScore += 8; compatDetail = product.modelo_label!; }
  if (hasYear) { compatScore += 7; compatDetail += (compatDetail ? ' | ' : '') + product.ano_labels!; }
  if (!hasModel && !hasYear) compatDetail = 'Sem dados de compatibilidade';
  checks.push({ label: 'Compatibilidade', passed: compatScore >= 10, score: compatScore, maxScore: 15, detail: compatDetail });

  const total = checks.reduce((s, c) => s + c.score, 0);
  const maxScore = checks.reduce((s, c) => s + c.maxScore, 0);
  return { total, maxScore, percentage: Math.round((total / maxScore) * 100), checks };
}

// --- SEO Content Templates ---

export function generateProductJsonLd(product: {
  sku: string;
  name: string;
  seo_title?: string;
  description?: string;
  price: number;
  special_price?: number | null;
  image_url?: string;
  in_stock?: boolean;
  url_key?: string;
  modelo_label?: string;
  ano_labels?: string;
  [key: string]: any;
}) {
  const name = product.seo_title || product.name;
  const url = `${SITE_URL}/produto/${product.sku}/${product.url_key || slugify(product.name)}`;
  
  const jsonLd: any = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name,
    sku: product.sku,
    description: (product.description || '').replace(/<[^>]*>/g, '').slice(0, 500),
    brand: { '@type': 'Brand', name: 'Toyota' },
    offers: {
      '@type': 'Offer',
      price: product.special_price && product.special_price < product.price
        ? product.special_price.toFixed(2)
        : product.price.toFixed(2),
      priceCurrency: 'BRL',
      availability: product.in_stock !== false
        ? 'https://schema.org/InStock'
        : 'https://schema.org/OutOfStock',
      seller: { '@type': 'Organization', name: SITE_NAME },
      url,
    },
  };

  if (product.image_url) {
    jsonLd.image = product.image_url;
  }

  if (product.modelo_label) {
    jsonLd.isRelatedTo = {
      '@type': 'Vehicle',
      brand: { '@type': 'Brand', name: 'Toyota' },
      model: product.modelo_label,
      ...(product.ano_labels ? { vehicleModelDate: product.ano_labels } : {}),
    };
  }

  return jsonLd;
}

export function generateBreadcrumbJsonLd(
  items: { name: string; url: string }[]
) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, idx) => ({
      '@type': 'ListItem',
      position: idx + 1,
      name: item.name,
      item: `${SITE_URL}${item.url}`,
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
    logo: `${SITE_URL}/pub/media/logo/toyoparts-logo.png`,
    contactPoint: {
      '@type': 'ContactPoint',
      contactType: 'customer service',
      availableLanguage: 'Portuguese',
    },
  };
}
