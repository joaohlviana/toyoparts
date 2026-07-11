import { CAR_MODELS_SEO, getModelBySlug, slugify } from '@/lib/seo';
import type { CategoryNode, CategoryWithPath } from '@/lib/types';

function normalizeChildren(children: unknown): CategoryNode[] {
  if (!Array.isArray(children)) return [];
  return children
    .filter((child): child is Record<string, unknown> => !!child && typeof child === 'object')
    .map((child) => normalizeCategoryNode(child));
}

export function normalizeCategoryNode(raw: unknown): CategoryNode {
  const data = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    id: Number(data.id || 0),
    name: String(data.name || ''),
    level: Number(data.level || 0),
    is_active: data.is_active !== false && data.is_active !== 0,
    product_count: Number(data.product_count || 0),
    children_data: normalizeChildren(data.children_data || data.children),
  };
}

export function normalizeCategoryTree(tree: unknown): CategoryNode {
  return normalizeCategoryNode(tree);
}

export function getTopCategories(root: CategoryNode): CategoryNode[] {
  let current = root;

  while (current.children_data.length === 1 && current.level <= 1) {
    current = current.children_data[0];
  }

  return current.children_data.filter((child) => child.is_active);
}

export function flattenCategoryTree(
  node: CategoryNode,
  parents: CategoryNode[] = []
): CategoryWithPath[] {
  const slug = slugify(node.name);
  const currentParents = parents.filter((parent) => parent.level >= 2);
  const slugPath = [...currentParents.map((parent) => slugify(parent.name)), slug].filter(Boolean);
  const current: CategoryWithPath = { node, parents: currentParents, slug, slugPath };
  const children = node.children_data.flatMap((child) => flattenCategoryTree(child, [...parents, node]));
  return [current, ...children];
}

export function resolveCategoryPath(root: CategoryNode, slugPath: string[]): CategoryWithPath | null {
  const segments = slugPath.filter(Boolean).map((segment) => segment.toLowerCase());
  if (segments.length === 0) return null;

  let currentLevel = getTopCategories(root);
  const parents: CategoryNode[] = [];
  let currentNode: CategoryNode | null = null;

  for (const segment of segments) {
    const match = currentLevel.find((candidate) => slugify(candidate.name) === segment);
    if (!match) return null;
    currentNode = match;
    parents.push(match);
    currentLevel = match.children_data;
  }

  if (!currentNode) return null;

  return {
    node: currentNode,
    parents: parents.slice(0, -1),
    slug: slugify(currentNode.name),
    slugPath: parents.map((parent) => slugify(parent.name)),
  };
}

export function findCategoryBySlug(root: CategoryNode, slug: string): CategoryWithPath | null {
  const normalized = slug.trim().toLowerCase();
  return flattenCategoryTree(root)
    .find((entry) => entry.slug === normalized && entry.node.level >= 2) || null;
}

export function buildCategoryUrl(entry: CategoryWithPath | { node: CategoryNode; parents: CategoryNode[] }) {
  const path = [...entry.parents, entry.node]
    .filter((node) => node.level >= 2)
    .map((node) => slugify(node.name));

  return `/${path.join('/')}`;
}

export function resolveModelFacet(modelSlug: string) {
  const model = getModelBySlug(modelSlug);
  return model?.modeloIds?.[0] || null;
}

export function getModelLinks() {
  return CAR_MODELS_SEO.map((model) => ({
    slug: model.slug,
    name: model.name,
    href: `/pecas/${model.slug}`,
  }));
}

export function findCategoryImage(name: string, images: Record<string, string>, modelSlug?: string | null) {
  const slug = slugify(name);

  if (modelSlug) {
    const scoped = `${modelSlug}:${slug}`;
    if (images[scoped]) return images[scoped];
  }

  if (images[slug]) return images[slug];

  const fallback = Object.entries(images).find(([key]) => {
    const clean = key.includes(':') ? key.split(':')[1] : key;
    return clean === slug;
  });

  return fallback?.[1] || null;
}

const FEATURED_CATEGORY_ORDER = [
  'acessorios-externos',
  'acessorios-internos',
  'pecas',
  'iluminacao',
  'acessorios-pick-up-e-suv',
  'outlet',
  'ofertas',
  'itens-promocionais',
];

export function getFeaturedCategories(root: CategoryNode, images: Record<string, string>) {
  return getTopCategories(root)
    .filter((category) => !!findCategoryImage(category.name, images))
    .sort((a, b) => {
      const aIndex = FEATURED_CATEGORY_ORDER.indexOf(slugify(a.name));
      const bIndex = FEATURED_CATEGORY_ORDER.indexOf(slugify(b.name));
      const aScore = aIndex === -1 ? FEATURED_CATEGORY_ORDER.length + 1 : aIndex;
      const bScore = bIndex === -1 ? FEATURED_CATEGORY_ORDER.length + 1 : bIndex;

      if (aScore !== bScore) return aScore - bScore;
      return b.product_count - a.product_count;
    })
    .slice(0, 8);
}

export function buildCollectionTitle(params: {
  categoryName?: string | null;
  modelName?: string | null;
}) {
  const { categoryName, modelName } = params;
  if (categoryName && modelName) return `${categoryName} para ${modelName}`;
  if (modelName) return `Peças e acessórios para ${modelName}`;
  if (categoryName) return categoryName;
  return 'Peças e acessórios Toyota';
}
