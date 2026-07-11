import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { getBanners, getCategoryImages, getCategoryTree, searchCatalog } from '@/lib/api';
import { buildPageMetadata } from '@/lib/metadata';
import { buildCategoryUrl, getFeaturedCategories } from '@/lib/catalog';
import { HeroCarousel } from '@/components/hero-carousel';
import { ProductCard } from '@/components/product-card';
import { generateOrganizationJsonLd, generateWebSiteJsonLd, SITE_DESCRIPTION } from '@/lib/seo';

export const metadata = buildPageMetadata({
  title: 'Toyoparts | Peças e Acessórios Genuínos Toyota',
  description: SITE_DESCRIPTION,
  canonical: '/',
});

export default async function HomePage() {
  const [tree, images, banners, featured, fresh] = await Promise.all([
    getCategoryTree(),
    getCategoryImages(),
    getBanners(),
    searchCatalog({ q: '', limit: 8, offset: 0, sort: 'price:desc', inStock: true }),
    searchCatalog({ q: '', limit: 8, offset: 0, inStock: true }),
  ]);

  const featuredCategories = getFeaturedCategories(tree, images);
  const organizationJsonLd = generateOrganizationJsonLd();
  const webSiteJsonLd = generateWebSiteJsonLd();

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(webSiteJsonLd) }} />

      <div className="tp-shell-gradient">
        <section className="max-w-7xl mx-auto px-4 pt-6 sm:px-6 lg:px-8">
          <HeroCarousel banners={banners} />
        </section>

        <section className="max-w-7xl mx-auto px-4 py-12 sm:px-6 lg:px-8">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-primary">Departamentos</p>
              <h2 className="mt-2 text-3xl font-black tracking-tight text-foreground">Navegue pelas áreas mais relevantes</h2>
              <p className="mt-2 max-w-2xl text-sm leading-7 text-muted-foreground">
                As rotas públicas do Next já nascem indexáveis, mas continuam consumindo o mesmo backend do catálogo atual.
              </p>
            </div>
            <Link href="/pecas" className="hidden items-center gap-2 text-sm font-semibold text-primary sm:inline-flex">
              Ver catálogo completo <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {featuredCategories.map((category) => {
              const image = images[category.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')];
              const href = buildCategoryUrl({ node: category, parents: [] });
              return (
                <Link
                  key={category.id}
                  href={href}
                  className="group overflow-hidden rounded-[1.75rem] border border-border bg-white tp-soft-card transition-transform duration-300 hover:-translate-y-1"
                >
                  <div className="aspect-[16/10] overflow-hidden bg-secondary/60">
                    {image ? (
                      <img src={image} alt={category.name} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-sm font-semibold text-muted-foreground">
                        {category.name}
                      </div>
                    )}
                  </div>
                  <div className="p-5">
                    <h3 className="text-lg font-bold tracking-tight text-foreground">{category.name}</h3>
                    <p className="mt-2 text-sm text-muted-foreground">{category.product_count} produto(s)</p>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>

        <section className="max-w-7xl mx-auto px-4 pb-12 sm:px-6 lg:px-8">
          <div className="mb-6">
            <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-primary">Mais relevantes</p>
            <h2 className="mt-2 text-3xl font-black tracking-tight text-foreground">Produtos em destaque</h2>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {featured.hits.slice(0, 8).map((product) => (
              <ProductCard key={product.sku} product={product} />
            ))}
          </div>
        </section>

        <section className="max-w-7xl mx-auto px-4 pb-16 sm:px-6 lg:px-8">
          <div className="mb-6">
            <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-primary">Catálogo vivo</p>
            <h2 className="mt-2 text-3xl font-black tracking-tight text-foreground">Últimos itens priorizados na vitrine</h2>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {fresh.hits.slice(0, 8).map((product) => (
              <ProductCard key={product.sku} product={product} />
            ))}
          </div>
        </section>
      </div>
    </>
  );
}
