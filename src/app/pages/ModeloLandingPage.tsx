import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router';
import {
  Package, ShoppingCart, Heart, Eye, Loader2, Star,
  ArrowRight, ChevronRight, Filter, Grid3X3, Car, Calendar, Phone
} from 'lucide-react';
import { toast } from 'sonner';
import { projectId, publicAnonKey } from '../../../utils/supabase/info';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Breadcrumbs, BreadcrumbItem } from '../components/seo/Breadcrumbs';
import { SEOHead } from '../components/seo/SEOHead';
import {
  SITE_NAME, SITE_URL, slugify,
  getModelBySlug, CAR_MODELS_SEO,
  generateBreadcrumbJsonLd,
} from '../seo-config';

import { ToyotaPlaceholder } from '../components/ToyotaPlaceholder';

const API = `https://${projectId}.supabase.co/functions/v1/make-server-1d6e33e0`;
const HEADERS: HeadersInit = {
  Authorization: `Bearer ${publicAnonKey}`,
  apikey: publicAnonKey,
  'Content-Type': 'application/json',
};

interface ProductHit {
  id: string;
  sku: string;
  name: string;
  price: number;
  special_price?: number | null;
  in_stock: boolean;
  image_url?: string;
  seo_title?: string;
  url_key?: string;
}

interface CategoryCount {
  name: string;
  slug: string;
  count: number;
}

// ─── SEO Landing Content per Model ──────────────────────────────────────────

const MODEL_SEO_CONTENT: Record<string, { intro: string; faq: { q: string; a: string }[] }> = {
  hilux: {
    intro: 'A Toyota Hilux e a picape mais vendida do Brasil e referencia em durabilidade. Na Toyoparts voce encontra todas as pecas genuinas e acessorios originais para sua Hilux, desde filtros de oleo e pastilhas de freio ate acessorios externos como santantonio e capota maritima.',
    faq: [
      { q: 'Quais as pecas mais procuradas para Hilux?', a: 'Filtro de oleo, pastilha de freio, amortecedor, filtro de combustivel, correia dentada e kit de embreagem sao as pecas mais vendidas para Hilux.' },
      { q: 'As pecas sao originais Toyota?', a: 'Sim, todas as pecas vendidas na Toyoparts sao genuinas Toyota, com garantia de fabrica e numero de parte original.' },
      { q: 'Qual a diferenca entre peca genuina e paralela?', a: 'Pecas genuinas Toyota sao fabricadas com os mesmos padroes de qualidade da montadora, garantindo encaixe perfeito, durabilidade e seguranca. Pecas paralelas podem nao atender esses padroes.' },
    ],
  },
  corolla: {
    intro: 'O Toyota Corolla e o sedan mais popular do mundo. Na Toyoparts voce encontra pecas genuinas e acessorios originais para todas as geracoes do Corolla, incluindo filtros, velas de ignicao, pastilhas de freio e acessorios de personalizacao.',
    faq: [
      { q: 'Quais pecas de manutencao o Corolla precisa?', a: 'As revisoes do Corolla incluem troca de oleo e filtro, filtro de ar, filtro de cabine, velas de ignicao, fluido de freio e pastilhas de freio.' },
      { q: 'Posso usar pecas de uma geracao em outra?', a: 'Nem sempre. Cada geracao do Corolla pode ter especificacoes diferentes. Confira o numero da peca (SKU) para garantir compatibilidade.' },
    ],
  },
  sw4: {
    intro: 'A Toyota SW4 (Fortuner) e o SUV de luxo derivado da Hilux. Na Toyoparts voce encontra pecas genuinas para SW4, desde componentes de motor e suspensao ate acessorios internos e externos originais Toyota.',
    faq: [
      { q: 'A SW4 usa as mesmas pecas da Hilux?', a: 'Muitas pecas de motor e suspensao sao compartilhadas entre Hilux e SW4, mas acessorios de carroceria e interior sao especificos.' },
    ],
  },
};

function getModelContent(slug: string) {
  return MODEL_SEO_CONTENT[slug] || {
    intro: `Encontre todas as pecas e acessorios genuinos Toyota na Toyoparts. Qualidade garantida e envio rapido para todo Brasil.`,
    faq: [],
  };
}

// ─── Component ───────────────────────────────────────────────────────────────

export function ModeloLandingPage() {
  const { modelo, categoriaSlug } = useParams<{ modelo: string; categoriaSlug?: string }>();
  const navigate = useNavigate();
  const modelData = useMemo(() => getModelBySlug(modelo || ''), [modelo]);
  const [products, setProducts] = useState<ProductHit[]>([]);
  const [categories, setCategories] = useState<CategoryCount[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalProducts, setTotalProducts] = useState(0);
  const [activeCategorySlug, setActiveCategorySlug] = useState<string | null>(categoriaSlug || null);

  // Update active category when URL changes
  useEffect(() => {
    setActiveCategorySlug(categoriaSlug || null);
  }, [categoriaSlug]);

  useEffect(() => {
    if (!modelData) return;
    setLoading(true);
    const modeloId = modelData.modeloIds[0];

    const params = new URLSearchParams({
      q: activeCategorySlug ? activeCategorySlug.replace(/-/g, ' ') : '',
      modelos: modeloId,
      limit: '20',
      offset: '0',
    });

    fetch(`${API}/search?${params.toString()}`, {
      headers: HEADERS,
    })
      .then(r => r.text())
      .then(text => {
        try {
          const data = JSON.parse(text);
          setProducts(data.hits || []);
          setTotalProducts(data.totalHits || 0);
          // Extract category facets
          const catFacets = data.facetDistribution?.category_names || {};
          const cats: CategoryCount[] = Object.entries(catFacets)
            .map(([name, count]) => ({ name, slug: slugify(name), count: count as number }))
            .filter(c => c.count > 0)
            .sort((a, b) => b.count - a.count)
            .slice(0, 12);
          setCategories(cats);
        } catch (e) {
          console.error('[ModeloLanding] JSON Error:', e, text.substring(0, 50));
        }
      })
      .catch(e => console.error('[ModeloLanding]', e))
      .finally(() => setLoading(false));
  }, [modelData, activeCategorySlug]);

  if (!modelData) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center space-y-4">
          <Car className="w-12 h-12 text-muted-foreground/40 mx-auto" />
          <h2 className="text-lg font-semibold">Modelo nao encontrado</h2>
          <Link to="/pecas"><Button variant="outline">Ver todos os modelos</Button></Link>
        </div>
      </div>
    );
  }

  const content = getModelContent(modelData.slug);
  
  // Format category name from slug for display
  const categoryDisplayName = activeCategorySlug
    ? activeCategorySlug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
    : null;

  const breadcrumbs: BreadcrumbItem[] = [
    { label: 'Pecas', href: '/pecas' },
    { label: modelData.name, href: `/pecas/${modelData.slug}` },
    ...(categoryDisplayName ? [{ label: categoryDisplayName, href: `/pecas/${modelData.slug}/${activeCategorySlug}` }] : []),
  ];

  const jsonLd = [
    generateBreadcrumbJsonLd([
      { name: 'Inicio', url: '/' },
      { name: 'Pecas', url: '/pecas' },
      { name: modelData.name, url: `/pecas/${modelData.slug}` },
      ...(categoryDisplayName ? [{ name: categoryDisplayName, url: `/pecas/${modelData.slug}/${activeCategorySlug}` }] : []),
    ]),
    // FAQ Schema
    ...(content.faq.length > 0 ? [{
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: content.faq.map(f => ({
        '@type': 'Question',
        name: f.q,
        acceptedAnswer: { '@type': 'Answer', text: f.a },
      })),
    }] : []),
  ];

  return (
    <>
      <SEOHead
        title={categoryDisplayName ? `${categoryDisplayName} - ${modelData.name} | ${SITE_NAME}` : modelData.seoTitle}
        description={modelData.seoDescription}
        canonical={activeCategorySlug ? `/pecas/${modelData.slug}/${activeCategorySlug}` : `/pecas/${modelData.slug}`}
        robots="index,follow"
        ogImage={modelData.imgSrc}
        jsonLd={jsonLd}
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6">
        <Breadcrumbs items={breadcrumbs} className="mb-6" />

        {/* Hero */}
        <div className="bg-gradient-to-br from-primary/5 via-background to-primary/3 rounded-2xl border border-border p-6 sm:p-8 mb-8">
          <div className="flex flex-col sm:flex-row items-center gap-6">
            <div className="w-28 h-28 sm:w-36 sm:h-36 flex-shrink-0 bg-white rounded-xl border border-border flex items-center justify-center p-4 shadow-sm">
              <img src={modelData.imgSrc} alt={modelData.name} className="max-w-full max-h-full object-contain" />
            </div>
            <div className="flex-1 text-center sm:text-left">
              <h1 className="text-2xl sm:text-3xl font-bold text-foreground mb-2">
                {categoryDisplayName
                  ? `${categoryDisplayName} — Toyota ${modelData.name}`
                  : `Pecas e Acessorios Toyota ${modelData.name}`
                }
              </h1>
              {categoryDisplayName && (
                <Link
                  to={`/pecas/${modelData.slug}`}
                  className="inline-flex items-center gap-1 text-sm text-primary hover:underline mb-2"
                >
                  <ChevronRight className="w-3 h-3 rotate-180" />
                  Ver todas as categorias
                </Link>
              )}
              <p className="text-muted-foreground leading-relaxed max-w-2xl">
                {content.intro}
              </p>
              {totalProducts > 0 && (
                <p className="mt-3 text-sm text-primary font-medium">
                  {totalProducts} produtos disponiveis
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Categories for this model */}
        {categories.length > 0 && (
          <div className="mb-8">
            <h2 className="text-lg font-semibold text-foreground mb-4">Categorias para {modelData.name}</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {categories.map(cat => (
                <button
                  key={cat.slug}
                  onClick={() => navigate(`/pecas/${modelData.slug}/${cat.slug}`)}
                  className={`flex items-center justify-between gap-2 px-4 py-3 bg-card border rounded-lg hover:border-primary/40 hover:bg-primary/5 transition-all text-left group ${
                    activeCategorySlug === cat.slug
                      ? 'border-primary/50 bg-primary/5 ring-1 ring-primary/20'
                      : 'border-border'
                  }`}
                >
                  <span className={`text-sm group-hover:text-primary transition-colors truncate ${
                    activeCategorySlug === cat.slug ? 'text-primary font-medium' : 'text-foreground'
                  }`}>{cat.name}</span>
                  <Badge variant="secondary" className="text-[10px] flex-shrink-0">{cat.count}</Badge>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Products Grid */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-foreground">Produtos em Destaque</h2>
            <Link to={`/busca?modelos=${modelData.modeloIds[0]}`}>
              <Button variant="outline" size="sm" className="gap-1">
                Ver todos <ArrowRight className="w-3.5 h-3.5" />
              </Button>
            </Link>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          ) : products.length === 0 ? (
            <div className="text-center py-16">
              <Package className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">Nenhum produto encontrado para {modelData.name}.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {products.map(hit => (
                <LandingProductCard key={hit.id} hit={hit} />
              ))}
            </div>
          )}
        </div>

        {/* Other Models */}
        <div className="mb-8">
          <h2 className="text-lg font-semibold text-foreground mb-4">Outros Modelos Toyota</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {CAR_MODELS_SEO.filter(m => m.slug !== modelData.slug).map(m => (
              <Link
                key={m.slug}
                to={`/pecas/${m.slug}`}
                className="flex items-center gap-3 px-4 py-3 bg-card border border-border rounded-lg hover:border-primary/40 hover:bg-primary/5 transition-all group"
              >
                <img src={m.imgSrc} alt={m.name} className="w-10 h-10 object-contain" />
                <span className="text-sm font-medium text-foreground group-hover:text-primary transition-colors">{m.name}</span>
              </Link>
            ))}
          </div>
        </div>

        {/* FAQ */}
        {content.faq.length > 0 && (
          <div className="mb-8">
            <h2 className="text-lg font-semibold text-foreground mb-4">Perguntas Frequentes - {modelData.name}</h2>
            <div className="space-y-3">
              {content.faq.map((f, i) => (
                <details key={i} className="border border-border rounded-lg group">
                  <summary className="flex items-center justify-between px-4 py-3 cursor-pointer text-sm font-medium text-foreground hover:bg-muted/50 transition rounded-lg list-none">
                    {f.q}
                    <ChevronRight className="w-4 h-4 text-muted-foreground transition-transform group-open:rotate-90 flex-shrink-0 ml-2" />
                  </summary>
                  <div className="px-4 pb-3 text-sm text-muted-foreground leading-relaxed">
                    {f.a}
                  </div>
                </details>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  );
}

// ─── Landing Product Card ────────────────────────────────────────────────────

function LandingProductCard({ hit }: { hit: ProductHit }) {
  const [imgErr, setImgErr] = useState(false);
  const sp = hit.special_price && hit.special_price > 0 && hit.special_price < hit.price ? hit.special_price : null;
  const active = sp ?? hit.price;
  const slug = hit.url_key || slugify(hit.name);
  const outOfStock = hit.in_stock === false;

  return (
    <Link
      to={`/produto/${encodeURIComponent(hit.sku)}/${slug}`}
      className="bg-card rounded-xl border border-border group relative flex flex-col overflow-hidden transition-all duration-300 hover:shadow-lg hover:border-border/60 hover:-translate-y-0.5"
    >
      <div className="relative aspect-[4/3] bg-gradient-to-b from-muted/30 to-muted/60 flex items-center justify-center overflow-hidden">
        {hit.image_url && !imgErr ? (
          <img src={hit.image_url} alt={hit.seo_title || hit.name} className={`w-full h-full object-cover transition-transform duration-500 group-hover:scale-110 ${outOfStock ? 'opacity-50 grayscale' : ''}`} loading="lazy" onError={() => setImgErr(true)} />
        ) : (
          <div className={`absolute inset-0 flex items-center justify-center bg-white ${outOfStock ? 'opacity-50 grayscale' : ''}`}>
            <ToyotaPlaceholder />
          </div>
        )}
        {outOfStock && (
          <span className="absolute top-2.5 left-2.5 z-10 inline-flex items-center bg-foreground/80 backdrop-blur-sm text-white text-[10px] font-semibold px-2 py-1 rounded-md">
            Esgotado
          </span>
        )}
        {sp && !outOfStock && (
          <span className="absolute top-2 left-2 bg-primary text-primary-foreground text-[10px] font-bold px-1.5 py-0.5 rounded">
            -{Math.round(((hit.price - sp) / hit.price) * 100)}%
          </span>
        )}
      </div>
      <div className="p-3 flex flex-col flex-1">
        <span className="text-[10px] font-mono text-muted-foreground/50 mb-1">{hit.sku}</span>
        <p className="text-xs sm:text-sm leading-snug text-foreground/80 line-clamp-2 min-h-[32px] mb-2 group-hover:text-foreground transition-colors">
          {hit.seo_title || hit.name}
        </p>
        {outOfStock ? (
          <div className="mt-auto">
            <span className="text-[10px] font-bold text-destructive uppercase tracking-wider">Esgotado</span>
            <div className="flex items-center gap-1 mt-0.5">
              <Phone className="w-3 h-3 text-primary" />
              <span className="text-[10px] font-semibold text-primary">(43) 3294-1144</span>
            </div>
          </div>
        ) : (
          <>
            {sp && <p className="text-[10px] text-muted-foreground line-through">{hit.price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p>}
            <p className="text-sm font-bold text-foreground">{active.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p>
          </>
        )}
      </div>
    </Link>
  );
}