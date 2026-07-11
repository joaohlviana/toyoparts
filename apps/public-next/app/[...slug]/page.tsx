import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { CollectionView } from '@/components/collection-view';
import { getCategoryImages, getCategoryTree, getLegacyOrigin, searchCatalog } from '@/lib/api';
import { buildCollectionTitle, resolveCategoryPath } from '@/lib/catalog';
import { buildPageMetadata } from '@/lib/metadata';

interface Props {
  params: Promise<{ slug: string[] }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const tree = await getCategoryTree().catch(() => null);
  const category = tree ? resolveCategoryPath(tree, slug) : null;
  const title = buildCollectionTitle({ categoryName: category?.node.name || slug[slug.length - 1] || 'Coleção' });

  return buildPageMetadata({
    title,
    description: `Landing pública renderizada no servidor para ${title}.`,
    canonical: `/${slug.join('/')}`,
  });
}

export default async function CategoryCatchAllPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const [tree, categoryImages] = await Promise.all([getCategoryTree(), getCategoryImages()]);
  const category = resolveCategoryPath(tree, slug);

  if (category) {
    const results = await searchCatalog({
      q: '',
      limit: 24,
      categories: [String(category.node.id)],
      categoryNames: [category.node.name],
      inStock: true,
    });

    return (
      <CollectionView
        title={buildCollectionTitle({ categoryName: category.node.name })}
        description={`Landing indexável de ${category.node.name}, com HTML inicial pronto e filtros estruturais alinhados à URL canônica.`}
        breadcrumbs={[
          { href: '/', label: 'Home' },
          ...category.parents.map((parent, index) => ({
            href: `/${[...category.parents.slice(0, index + 1).map((node) => node.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''))].join('/')}`,
            label: parent.name,
          })),
          { href: `/${slug.join('/')}`, label: category.node.name },
        ]}
        products={results.hits}
        featuredChildren={category.node.children_data.map((node) => ({ node, parents: [...category.parents, category.node] }))}
        categoryImages={categoryImages}
      />
    );
  }

  const legacyOrigin = getLegacyOrigin();
  if (legacyOrigin) {
    const query = await searchParams;
    const qs = new URLSearchParams();
    Object.entries(query).forEach(([key, value]) => {
      if (Array.isArray(value)) {
        value.forEach((item) => qs.append(key, item));
      } else if (value) {
        qs.set(key, value);
      }
    });
    redirect(`${legacyOrigin}/${slug.join('/')}${qs.toString() ? `?${qs}` : ''}`);
  }

  notFound();
}
