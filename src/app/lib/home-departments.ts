export type HomeDepartmentCategoryNode = {
  id: number;
  parent_id: number;
  name: string;
  level: number;
  is_active: boolean;
  product_count: number;
  children_data?: HomeDepartmentCategoryNode[];
  children?: HomeDepartmentCategoryNode[];
};

export const DEFAULT_HOME_CATEGORY_IMAGES: Record<string, string> = {
  'acessorios-externos': 'https://increazy-folder.s3.amazonaws.com/5ebed78a28503303b0530072/banner-departamento-corolla-cross-acessorio-externo.jpg?v=1770635254',
  'acessorios-internos': 'https://increazy-folder.s3.amazonaws.com/5ebed78a28503303b0530072/corolla-menu-acessorios-internos.jpg?v=1770635254',
  'iluminacao': 'https://increazy-folder.s3.amazonaws.com/5ebed78a28503303b0530072/corolla-menu-iluminacao.jpg?v=1770635254',
  'pecas': 'https://increazy-folder.s3.amazonaws.com/5ebed78a28503303b0530072/corolla-menu-pecas.jpg?v=1770635254',
  'acessorios-externos-cromados': 'https://increazy-folder.s3.amazonaws.com/5ebed78a28503303b0530072/corolla-menu-acessorios-externos.jpg?v=1770635254',
  'aerofolios-spoilers-e-antenas': 'https://increazy-folder.s3.amazonaws.com/5ebed78a28503303b0530072/hilux-menu-acessorios-externos.jpg?v=1770635254',
  'alarme-e-seguranca': 'https://increazy-folder.s3.amazonaws.com/5ebed78a28503303b0530072/corolla-menu-acessorios-internos.jpg?v=1770635254',
  'engates-e-chicotes': 'https://increazy-folder.s3.amazonaws.com/5ebed78a28503303b0530072/hilux-menu-santo-antonio.jpg?v=1770635254',
  'ferramentas-e-equipamentos': 'https://increazy-folder.s3.amazonaws.com/5ebed78a28503303b0530072/corolla-menu-pecas.jpg?v=1770635254',
  'frisos-e-apliques': 'https://increazy-folder.s3.amazonaws.com/5ebed78a28503303b0530072/banner-departamento-corolla-cross-acessorio-externo.jpg?v=1770635254',
  'ponteiras': 'https://increazy-folder.s3.amazonaws.com/5ebed78a28503303b0530072/sw4-menu-pickup-suv.jpg?v=1770635254',
  'rodas-e-calotas': 'https://increazy-folder.s3.amazonaws.com/5ebed78a28503303b0530072/hilux-menu-acessorios-externos.jpg?v=1770635254',
  'sensor-de-estacionamento': 'https://increazy-folder.s3.amazonaws.com/5ebed78a28503303b0530072/corolla-menu-acessorios-internos.jpg?v=1770635254',
  'suporte-racks-e-bagageiros': 'https://increazy-folder.s3.amazonaws.com/5ebed78a28503303b0530072/hilux-menu-santo-antonio.jpg?v=1770635254',
};

const CATEGORY_IMAGE_ALIASES: Record<string, string[]> = {
  'acessorios-exteriores': ['acessorios-externos', 'frisos-e-apliques', 'rodas-e-calotas'],
  'acessorios-interiores': ['acessorios-internos', 'multimidia', 'tapetes', 'porta-malas'],
  'alarmes-e-seguranca': ['alarme-e-seguranca', 'sensor-de-estacionamento'],
  'pecas-e-manutencao': ['pecas', 'filtros', 'freio', 'suspensao', 'motor', 'ferramentas-e-equipamentos'],
  'sons-e-entretenimento': ['multimidia'],
  'tapetes': ['acessorios-internos'],
  'multimidia': ['acessorios-internos'],
  'porta-malas': ['acessorios-internos'],
  'farois-e-lanternas': ['iluminacao'],
  'lampadas': ['iluminacao'],
  'farol-de-neblina': ['iluminacao'],
  'filtros': ['pecas'],
  'freio': ['pecas'],
  'suspensao': ['pecas'],
  'motor': ['pecas'],
};

const BROKEN_CATEGORY_IMAGE_URLS = new Set<string>();

function getCategoryChildren(node: HomeDepartmentCategoryNode) {
  return (node.children_data || node.children || []).filter((child) => child?.is_active);
}

export function catSlugify(text: string): string {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function pushUniqueImageCandidate(bucket: string[], url?: string | null) {
  const normalizedUrl = String(url || '').trim();
  if (!normalizedUrl || bucket.includes(normalizedUrl)) return;
  bucket.push(normalizedUrl);
}

function collectCategoryImageCandidates(catName: string, images: Record<string, string>): string[] {
  if (!images || Object.keys(images).length === 0) return [];
  const slug = catSlugify(catName);
  const candidates = [slug, ...(CATEGORY_IMAGE_ALIASES[slug] || [])];
  const urls: string[] = [];

  for (const candidate of candidates) {
    pushUniqueImageCandidate(urls, images[candidate]);
  }

  for (const [key, url] of Object.entries(images)) {
    if (key.includes(':')) continue;
    if (candidates.some((candidate) => key.includes(candidate) || candidate.includes(key))) {
      pushUniqueImageCandidate(urls, url);
    }
  }

  for (const [key, url] of Object.entries(images)) {
    const afterColon = key.split(':')[1];
    if (afterColon && candidates.some((candidate) => afterColon.includes(candidate) || candidate.includes(afterColon))) {
      pushUniqueImageCandidate(urls, url);
    }
  }

  return urls;
}

function collectCategoryMenuImageCandidates(
  childName: string,
  images: Record<string, string>,
  parentName?: string,
): string[] {
  const urls: string[] = [];
  if (!images || Object.keys(images).length === 0) return urls;

  const childSlug = catSlugify(childName);
  const childCandidates = [childSlug, ...(CATEGORY_IMAGE_ALIASES[childSlug] || [])];

  if (parentName) {
    const parentSlug = catSlugify(parentName);
    const parentCandidates = [parentSlug, ...(CATEGORY_IMAGE_ALIASES[parentSlug] || [])];

    for (const parentCandidate of parentCandidates) {
      for (const childCandidate of childCandidates) {
        pushUniqueImageCandidate(urls, images[`${parentCandidate}:${childCandidate}`]);
        pushUniqueImageCandidate(urls, images[`${parentCandidate}-${childCandidate}`]);
      }
    }
  }

  collectCategoryImageCandidates(childName, images).forEach((url) => pushUniqueImageCandidate(urls, url));
  if (parentName) {
    collectCategoryImageCandidates(parentName, images).forEach((url) => pushUniqueImageCandidate(urls, url));
  }

  return urls;
}

export function findCategoryImage(catName: string, images: Record<string, string>): string | null {
  return collectCategoryImageCandidates(catName, images)[0] || null;
}

export function findCategoryMenuImage(
  childName: string,
  images: Record<string, string>,
  parentName?: string,
): string | null {
  return collectCategoryMenuImageCandidates(childName, images, parentName)[0] || null;
}

function pickRenderableImage(urls: string[]): string | null {
  return urls.find((url) => !BROKEN_CATEGORY_IMAGE_URLS.has(url)) || null;
}

export function getRenderableCategoryImage(catName: string, images: Record<string, string>): string | null {
  return pickRenderableImage(collectCategoryImageCandidates(catName, images));
}

export function getRenderableCategoryMenuImage(
  childName: string,
  images: Record<string, string>,
  parentName?: string,
): string | null {
  return pickRenderableImage(collectCategoryMenuImageCandidates(childName, images, parentName));
}

export function markCategoryImageUrlBroken(url?: string | null): boolean {
  const normalizedUrl = String(url || '').trim();
  if (!normalizedUrl || BROKEN_CATEGORY_IMAGE_URLS.has(normalizedUrl)) return false;
  BROKEN_CATEGORY_IMAGE_URLS.add(normalizedUrl);
  return true;
}

export function getSelectableCategories(tree: HomeDepartmentCategoryNode | null): HomeDepartmentCategoryNode[] {
  if (!tree) return [];
  const bucket = new Map<string, HomeDepartmentCategoryNode>();

  const walk = (node: HomeDepartmentCategoryNode) => {
    const hasProducts = Number(node.product_count || 0) > 0 || Number(node.id || 0) < 0;
    if (node.is_active && node.level >= 1 && hasProducts) {
      bucket.set(String(node.id), node);
    }
    getCategoryChildren(node).forEach(walk);
  };

  walk(tree);
  return Array.from(bucket.values());
}

export function getHomeDepartmentCandidates(tree: HomeDepartmentCategoryNode | null): HomeDepartmentCategoryNode[] {
  const selectable = getSelectableCategories(tree);
  const deduped = new Map<string, HomeDepartmentCategoryNode>();

  selectable.forEach((category) => {
    const key = catSlugify(category.name);
    const current = deduped.get(key);

    if (!current) {
      deduped.set(key, category);
      return;
    }

    const currentScore = Number(current.product_count || 0);
    const nextScore = Number(category.product_count || 0);

    if (nextScore > currentScore || (nextScore === currentScore && Number(category.level || 0) < Number(current.level || 0))) {
      deduped.set(key, category);
    }
  });

  return Array.from(deduped.values());
}
