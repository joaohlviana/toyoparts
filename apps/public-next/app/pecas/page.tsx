import { notFound } from 'next/navigation';
import { CollectionView } from '@/components/collection-view';
import { getCategoryImages, getCategoryTree, searchCatalog } from '@/lib/api';
import { buildCollectionTitle, buildCategoryUrl, resolveCategoryPath } from '@/lib/catalog';
import { buildPageMetadata } from '@/lib/metadata';

const PAGE_SIZE = 24;

interface Props {
  searchParams: Promise<{ page?: string }>;
}

function parsePage(value?: string) {
  const page = Number.parseInt(value || '1', 10);
  return Number.isFinite(page) && page > 0 ? page : 1;
}

const baseMetadata = buildPageMetadata({
  title: 'Peças e acessórios genuínos Toyota',
  description: 'Encontre peças e acessórios genuínos Toyota por categoria e veículo, com envio para todo o Brasil.',
  canonical: '/pecas',
});

export async function generateMetadata({ searchParams }: Props) {
  const page = parsePage((await searchParams).page);
  if (page === 1) return baseMetadata;
  return buildPageMetadata({
    title: `Peças Toyota — página ${page}`,
    description: 'Explore peças e acessórios genuínos Toyota por categoria e veículo.',
    canonical: `/pecas?page=${page}`,
  });
}

export default async function PecasPage({ searchParams }: Props) {
  const page = parsePage((await searchParams).page);
  const [tree, categoryImages] = await Promise.all([getCategoryTree(), getCategoryImages()]);
  const category = resolveCategoryPath(tree, ['pecas']);

  if (!category) notFound();

  const results = await searchCatalog({
    q: '',
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
    categories: [String(category.node.id)],
    inStock: true,
  });

  return (
    <CollectionView
      title={buildCollectionTitle({ categoryName: category.node.name })}
      description="Encontre peças e acessórios genuínos Toyota por categoria, aplicação e veículo. Consulte a compatibilidade pelo chassi antes da compra."
      breadcrumbs={[
        { href: '/', label: 'Home' },
        { href: '/pecas', label: 'Peças' },
      ]}
      products={results.hits}
      featuredChildren={category.node.children_data.map((node) => ({ node, parents: [category.node] }))}
      categoryImages={categoryImages}
      totalProducts={results.totalHits || results.estimatedTotalHits}
      page={page}
      pageSize={PAGE_SIZE}
      canonicalPath="/pecas"
    />
  );
}
