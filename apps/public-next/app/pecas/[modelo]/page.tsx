import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { CollectionView } from '@/components/collection-view';
import { getCategoryImages, getCategoryTree, searchCatalog } from '@/lib/api';
import { buildCollectionTitle, getTopCategories, resolveModelFacet } from '@/lib/catalog';
import { buildPageMetadata } from '@/lib/metadata';
import { getModelBySlug } from '@/lib/seo';

interface Props {
  params: Promise<{ modelo: string }>;
  searchParams: Promise<{ page?: string }>;
}

const PAGE_SIZE = 24;
const parsePage = (value?: string) => Math.max(1, Number.parseInt(value || '1', 10) || 1);

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { modelo } = await params;
  const page = parsePage((await searchParams).page);
  const model = getModelBySlug(modelo);

  if (!model) {
    return buildPageMetadata({
      title: 'Peças por modelo Toyota',
      description: 'Encontre peças e acessórios genuínos para o seu modelo Toyota.',
      canonical: `/pecas/${modelo}`,
    });
  }

  return buildPageMetadata({
    title: `${model.name} | Peças e acessórios Toyota`,
    description: `Encontre peças e acessórios genuínos Toyota para ${model.name}. Consulte a compatibilidade pelo chassi e compre com envio para todo o Brasil.`,
    canonical: page > 1 ? `/pecas/${model.slug}?page=${page}` : `/pecas/${model.slug}`,
    image: model.imgSrc,
  });
}

export default async function PecasPorModeloPage({ params, searchParams }: Props) {
  const { modelo } = await params;
  const page = parsePage((await searchParams).page);
  const model = getModelBySlug(modelo);
  const modeloFacet = resolveModelFacet(modelo);

  if (!model || !modeloFacet) notFound();

  const [tree, categoryImages, results] = await Promise.all([
    getCategoryTree(),
    getCategoryImages(),
    searchCatalog({
      q: '',
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
      modelos: [modeloFacet],
      inStock: true,
    }),
  ]);

  return (
    <CollectionView
      title={buildCollectionTitle({ modelName: model.name })}
      description={`Peças e acessórios genuínos Toyota para ${model.name}, organizados por categoria para você encontrar a aplicação correta com facilidade.`}
      breadcrumbs={[
        { href: '/', label: 'Home' },
        { href: '/pecas', label: 'Peças' },
        { href: `/pecas/${model.slug}`, label: model.name },
      ]}
      products={results.hits}
      featuredChildren={getTopCategories(tree).map((node) => ({ node, parents: [] }))}
      categoryImages={categoryImages}
      modelName={model.name}
      totalProducts={results.totalHits || results.estimatedTotalHits}
      page={page}
      pageSize={PAGE_SIZE}
      canonicalPath={`/pecas/${model.slug}`}
    />
  );
}
