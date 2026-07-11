import Link from 'next/link';
import { ArrowRight, CarFront, Package } from 'lucide-react';
import { ProductCard } from '@/components/product-card';
import type { CatalogHit, CategoryNode } from '@/lib/types';
import { Breadcrumbs, type Crumb } from '@/components/breadcrumbs';
import { buildCategoryUrl, findCategoryImage } from '@/lib/catalog';
import { generateBreadcrumbJsonLd } from '@/lib/seo';

export function CollectionView({
  title,
  description,
  breadcrumbs,
  products,
  featuredChildren = [],
  categoryImages = {},
  modelName,
  totalProducts,
  page = 1,
  pageSize = 24,
  canonicalPath,
}: {
  title: string;
  description: string;
  breadcrumbs: Crumb[];
  products: CatalogHit[];
  featuredChildren?: Array<{ node: CategoryNode; parents: CategoryNode[] }>;
  categoryImages?: Record<string, string>;
  modelName?: string | null;
  totalProducts?: number;
  page?: number;
  pageSize?: number;
  canonicalPath?: string;
}) {
  const total = totalProducts ?? products.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const pageHref = (target: number) => target <= 1 ? (canonicalPath || '#') : `${canonicalPath}?page=${target}`;
  const breadcrumbJsonLd = generateBreadcrumbJsonLd(
    breadcrumbs.map((item) => ({ name: item.label, path: item.href || canonicalPath || '/' }))
  );

  return (
    <div className="tp-shell-gradient">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />
      {page > 1 ? <link rel="prev" href={pageHref(page - 1)} /> : null}
      {page < totalPages ? <link rel="next" href={pageHref(page + 1)} /> : null}
      <section className="border-b border-border/60">
        <div className="max-w-7xl mx-auto px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
          <Breadcrumbs items={breadcrumbs} />
          <div className="mt-5 grid gap-8 lg:grid-cols-[1.2fr_0.8fr] lg:items-end">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-primary">
                {modelName ? 'Landing por veículo' : 'Landing de categoria'}
              </p>
              <h1 className="mt-4 text-4xl font-black tracking-tight text-foreground md:text-5xl">{title}</h1>
              <p className="mt-4 max-w-3xl text-base leading-8 text-muted-foreground md:text-lg">{description}</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-[1.75rem] border border-border bg-white p-5 tp-soft-card">
                <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Produtos encontrados</p>
                <p className="mt-2 text-3xl font-black tracking-tight text-foreground">{total}</p>
              </div>
              <div className="rounded-[1.75rem] border border-border bg-white p-5 tp-soft-card">
                <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Filtro ativo</p>
                <p className="mt-2 text-lg font-bold tracking-tight text-foreground">
                  {modelName ? `${modelName} + coleção` : 'Coleção estruturada'}
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {featuredChildren.length > 0 && (
        <section className="max-w-7xl mx-auto px-4 py-10 sm:px-6 lg:px-8">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-black tracking-tight text-foreground">Explore outras categorias</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Navegação estruturada para SEO e para o catálogo real da Toyoparts.
              </p>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {featuredChildren.map((child) => {
              const image = findCategoryImage(child.node.name, categoryImages);
              return (
                <Link
                  key={`${child.node.id}-${child.node.name}`}
                  href={buildCategoryUrl(child)}
                  className="group overflow-hidden rounded-[1.75rem] border border-border bg-white tp-soft-card transition-transform duration-300 hover:-translate-y-1"
                >
                  <div className="aspect-[16/10] overflow-hidden bg-secondary/60">
                    {image ? (
                      <img src={image} alt={child.node.name} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-secondary to-muted">
                        <Package className="h-8 w-8 text-muted-foreground" />
                      </div>
                    )}
                  </div>
                  <div className="p-5">
                    <h3 className="text-lg font-bold tracking-tight text-foreground">{child.node.name}</h3>
                    <p className="mt-2 text-sm text-muted-foreground">{child.node.product_count} produto(s) na coleção</p>
                    <span className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-primary">
                      Abrir categoria <ArrowRight className="h-4 w-4" />
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      <section className="max-w-7xl mx-auto px-4 pb-16 sm:px-6 lg:px-8">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-black tracking-tight text-foreground">Produtos da landing</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Resultados renderizados no servidor usando o backend atual e filtros estruturais.
            </p>
          </div>
          {modelName ? (
            <div className="hidden items-center gap-2 rounded-full bg-accent px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-accent-foreground sm:inline-flex">
              <CarFront className="h-3.5 w-3.5" />
              {modelName}
            </div>
          ) : null}
        </div>

        {products.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {products.map((product) => (
              <ProductCard key={product.sku} product={product} />
            ))}
          </div>
        ) : (
          <div className="rounded-[2rem] border border-dashed border-border bg-white p-10 text-center tp-soft-card">
            <h3 className="text-xl font-bold text-foreground">Nenhum produto encontrado nesta landing</h3>
            <p className="mt-3 text-sm text-muted-foreground">
              A estrutura da rota está pronta, mas o retorno atual do catálogo veio vazio para esse filtro.
            </p>
            <Link
              href="/pecas"
              className="mt-6 inline-flex h-11 items-center justify-center rounded-2xl bg-primary px-5 text-sm font-bold text-white"
            >
              Voltar ao catálogo
            </Link>
          </div>
        )}

        {totalPages > 1 ? (
          <nav aria-label="Paginação de produtos" className="mt-10 flex items-center justify-center gap-3">
            {page > 1 ? (
              <Link rel="prev" href={pageHref(page - 1)} className="rounded-xl border border-border bg-white px-4 py-2 text-sm font-bold text-foreground">
                Página anterior
              </Link>
            ) : null}
            <span className="text-sm font-semibold text-muted-foreground">Página {page} de {totalPages}</span>
            {page < totalPages ? (
              <Link rel="next" href={pageHref(page + 1)} className="rounded-xl bg-primary px-4 py-2 text-sm font-bold text-white">
                Próxima página
              </Link>
            ) : null}
          </nav>
        ) : null}
      </section>
    </div>
  );
}
