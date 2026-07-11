import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { CollectionView } from '@/components/collection-view';
import { getCategoryImages, getCategoryTree, searchCatalog } from '@/lib/api';
import { buildCollectionTitle, findCategoryBySlug, resolveModelFacet } from '@/lib/catalog';
import { buildPageMetadata } from '@/lib/metadata';
import { getModelBySlug } from '@/lib/seo';

interface Props {
  params: Promise<{ modelo: string; categoriaSlug: string }>;
  searchParams: Promise<{ page?: string }>;
}

const PAGE_SIZE = 24;
const parsePage = (value?: string) => Math.max(1, Number.parseInt(value || '1', 10) || 1);

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { modelo, categoriaSlug } = await params;
  const page = parsePage((await searchParams).page);
  const model = getModelBySlug(modelo);
  const tree = await getCategoryTree().catch(() => null);
  const category = tree ? findCategoryBySlug(tree, categoriaSlug) : null;
  const title = buildCollectionTitle({ categoryName: category?.node.name || categoriaSlug, modelName: model?.name || null });

  return buildPageMetadata({
    title,
    description: `Compre ${title.toLowerCase()} na Toyoparts. Consulte a compatibilidade pelo chassi e receba em todo o Brasil.`,
    canonical: page > 1 ? `/pecas/${modelo}/${categoriaSlug}?page=${page}` : `/pecas/${modelo}/${categoriaSlug}`,
  });
}

export default async function PecasPorModeloCategoriaPage({ params, searchParams }: Props) {
  const { modelo, categoriaSlug } = await params;
  const page = parsePage((await searchParams).page);
  const [tree, categoryImages] = await Promise.all([getCategoryTree(), getCategoryImages()]);
  const model = getModelBySlug(modelo);
  const modeloFacet = resolveModelFacet(modelo);
  const category = findCategoryBySlug(tree, categoriaSlug);

  if (!model || !modeloFacet || !category) notFound();

  const results = await searchCatalog({
    q: '',
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
    modelos: [modeloFacet],
    categories: [String(category.node.id)],
    categoryNames: [category.node.name],
    inStock: true,
  });

  return (
    <CollectionView
      title={buildCollectionTitle({ categoryName: category.node.name, modelName: model.name })}
      description={`Encontre ${category.node.name.toLowerCase()} para ${model.name}, com peças genuínas Toyota e consulta de compatibilidade pelo chassi.`}
      breadcrumbs={[
        { href: '/', label: 'Home' },
        { href: '/pecas', label: 'Peças' },
        { href: `/pecas/${model.slug}`, label: model.name },
        { href: `/pecas/${model.slug}/${categoriaSlug}`, label: category.node.name },
      ]}
      products={results.hits}
      featuredChildren={category.node.children_data.map((node) => ({ node, parents: [...category.parents, category.node] }))}
      categoryImages={categoryImages}
      modelName={model.name}
      totalProducts={results.totalHits || results.estimatedTotalHits}
      page={page}
      pageSize={PAGE_SIZE}
      canonicalPath={`/pecas/${model.slug}/${categoriaSlug}`}
    />
  );
}
