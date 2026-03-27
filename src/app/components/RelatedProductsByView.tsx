// ═══════════════════════════════════════════════════════════════════════════════
// RelatedProductsByView — "Quem viu, viu tambem" (PDP Component)
// ═══════════════════════════════════════════════════════════════════════════════
// Enterprise recommendation component powered by behavioral analytics.
//
// Strategy (3 fallback levels, all server-side):
//   1. Co-view: products viewed in same sessions (behavioral)
//   2. Similarity: same model/category via Meilisearch
//   3. Popular: most viewed products globally
//
// Tracking:
//   - When user clicks a related product, they navigate to a new PDP.
//   - The PDP detects referrer=/produto/* and tracks source="related" automatically.

import React, { useEffect, useState } from 'react';
import { TrendingUp, Sparkles, Users, Eye } from 'lucide-react';
import { ProductCard, ProductCardHit } from './ProductCard';
import { ScrollSlider } from './ScrollSlider';
import { siActivation } from '../lib/search-intelligence-api';
import { Skeleton } from './ui/skeleton';

interface RelatedProductsByViewProps {
  /** Current product SKU (excluded from recommendations) */
  sku: string;
  /** Max products to show */
  limit?: number;
  /** Optional CSS class */
  className?: string;
}

const SOURCE_LABELS: Record<string, { icon: React.ReactNode; label: string }> = {
  co_view: { icon: <Users className="w-3.5 h-3.5" />, label: 'Baseado em navegacao real' },
  similarity: { icon: <Sparkles className="w-3.5 h-3.5" />, label: 'Produtos similares' },
  mixed: { icon: <TrendingUp className="w-3.5 h-3.5" />, label: 'Recomendacoes inteligentes' },
  popular: { icon: <Eye className="w-3.5 h-3.5" />, label: 'Mais vistos' },
};

function hasRenderablePrice(hit: any) {
  const price = Number(hit?.price || 0);
  const specialPrice = Number(hit?.special_price || 0);
  return price > 0 || specialPrice > 0;
}

function isRenderableRelatedProduct(hit: any) {
  return (
    !!hit?.sku &&
    !!hit?.name &&
    !!hit?.image_url &&
    hasRenderablePrice(hit) &&
    hit?.in_stock !== false &&
    hit?.qty !== 0
  );
}

export function RelatedProductsByView({ sku, limit = 8, className = '' }: RelatedProductsByViewProps) {
  const [products, setProducts] = useState<any[]>([]);
  const [source, setSource] = useState<string>('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!sku) return;
    let cancelled = false;

    (async () => {
      setLoading(true);
      try {
        const data = await siActivation.getRelatedProducts(sku, limit);
        if (!cancelled && data?.products?.length > 0) {
          setProducts(data.products);
          setSource(data.source || 'mixed');
        }
      } catch (err) {
        console.error('[RelatedProducts] Error:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [sku, limit]);

  const visibleProducts = products
    .filter((hit: any) => isRenderableRelatedProduct(hit))
    .slice(0, limit);

  // Don't render anything if no products and not loading
  if (!loading && visibleProducts.length === 0) return null;

  if (loading) {
    return (
      <section className={`py-8 sm:py-12 animate-in fade-in duration-300 ${className}`}>
        <div className="flex items-center justify-between mb-6">
          <div className="space-y-2">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-40" />
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4 lg:gap-5">
          {[...Array(Math.min(limit, 4))].map((_, index) => (
            <div key={index} className="rounded-xl border border-border/50 overflow-hidden bg-card/70">
              <Skeleton className="aspect-square w-full rounded-none" />
              <div className="p-4 space-y-3">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-4 w-[80%]" />
                <Skeleton className="h-4 w-[55%]" />
              </div>
            </div>
          ))}
        </div>
      </section>
    );
  }

  const sourceInfo = SOURCE_LABELS[source] || SOURCE_LABELS.mixed;

  return (
    <section className={`py-8 sm:py-12 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg sm:text-xl font-bold text-foreground tracking-tight">
            Você também pode gostar
          </h2>
          <div className="flex items-center gap-1.5 mt-1">
            <span className="text-muted-foreground">{sourceInfo.icon}</span>
            <span className="text-xs text-muted-foreground">{sourceInfo.label}</span>
          </div>
        </div>
      </div>

      {/* Product Slider */}
      <ScrollSlider>
        {visibleProducts.map((hit: any) => (
            <ProductCard
              key={hit.sku || hit.id}
              hit={hit as ProductCardHit}
              className="min-w-0"
            />
          ))}
      </ScrollSlider>
    </section>
  );
}
