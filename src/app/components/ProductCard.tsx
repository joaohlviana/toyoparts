import React, { useState } from 'react';
import { Link } from 'react-router';
import { Package, Truck, ShoppingCart, Phone } from 'lucide-react';
import { Card, CardContent } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { slugify } from '../seo-config';
import { useCart } from '../lib/cart/cart-store';
import { toast } from 'sonner';
import { ToyotaPlaceholder } from './ToyotaPlaceholder';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatBRL(value: number | undefined | null) {
  if (value === undefined || value === null) return 'R$ 0,00';
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function calcDiscount(price: number, special: number) {
  return Math.round(((price - special) / price) * 100);
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ProductCardHit {
  id?: string;
  sku: string;
  name: string;
  seo_title?: string;
  price: number;
  special_price?: number | null;
  image_url?: string;
  url_key?: string;
  in_stock?: boolean;
  _formatted?: { name?: string; sku?: string; description?: string };
  [key: string]: any;
}

interface ProductCardProps {
  hit: ProductCardHit;
  /** Optional CSS class for the outer wrapper */
  className?: string;
}

// ─── Unified Product Card ─────────────────────────────────────────────────────

export function ProductCard({ hit, className }: ProductCardProps) {
  const [imgError, setImgError] = useState(false);
  const { addItem, setOpen } = useCart();

  if (!hit.sku) return null;

  const sp =
    hit.special_price && hit.special_price > 0 && hit.special_price < hit.price
      ? hit.special_price
      : null;
  const activePrice = sp ?? hit.price;
  const discount = sp ? calcDiscount(hit.price, sp) : 0;
  const slug = hit.url_key || slugify(hit.name || '');
  const installment = activePrice > 0 ? activePrice / 10 : 0;
  const displayName = hit._formatted?.name || hit.seo_title || hit.name;

  const handleBuy = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    addItem({
      sku: hit.sku,
      name: hit.name,
      unitPrice: activePrice,
      originalPrice: hit.price,
      imageUrl: hit.image_url || '',
      weight: hit.weight || 0.5,
    }, 1);
    setOpen(true);
    toast.success('Produto adicionado ao carrinho');
  };

  return (
    <Link
      to={`/produto/${encodeURIComponent(hit.sku)}/${slug}`}
      className={`block group ${className || ''}`}
    >
      <Card className="overflow-hidden border-border/60 hover:border-primary/30 hover:shadow-lg transition-all duration-300 gap-0 rounded-xl h-full">
        {/* ── Image ── */}
        <div className="relative aspect-square bg-secondary/30 overflow-hidden">
          {/* Discount badge */}
          {sp && (
            <Badge
              variant="destructive"
              className="absolute top-2.5 right-2.5 z-10 text-[10px] font-bold px-1.5 py-0 rounded-md"
            >
              -{discount}%
            </Badge>
          )}

          {/* Out-of-stock badge */}
          {hit.in_stock === false && (
            <span className="absolute top-2.5 left-2.5 z-10 inline-flex items-center bg-foreground/80 backdrop-blur-sm text-white text-[10px] font-semibold px-2 py-1 rounded-md">
              Esgotado
            </span>
          )}

          {hit.image_url && !imgError ? (
            <img
              src={hit.image_url}
              alt={hit.seo_title || hit.name}
              className={`w-full h-full object-cover transition-transform duration-500 group-hover:scale-110 ${hit.in_stock === false ? 'opacity-50 grayscale' : ''}`}
              loading="lazy"
              onError={() => setImgError(true)}
            />
          ) : (
            <div className={`absolute inset-0 flex items-center justify-center bg-white ${hit.in_stock === false ? 'opacity-50 grayscale' : ''}`}>
              <ToyotaPlaceholder />
            </div>
          )}
        </div>

        {/* ── Info ── */}
        <CardContent className="p-3.5 pt-3 pb-4 flex flex-col flex-1 border-t border-border/40">
          {/* SKU */}
          <span className="text-[10px] font-mono text-muted-foreground/50 tracking-wider uppercase mb-1">
            {hit.sku}
          </span>

          {/* Name */}
          <p
            className="text-xs font-medium text-muted-foreground leading-snug line-clamp-2 mb-2.5 min-h-[32px] group-hover:text-foreground transition-colors"
            dangerouslySetInnerHTML={{ __html: displayName }}
          />

          {/* Price area */}
          <div className="mt-auto space-y-0.5">
            {sp && (
              <p className="text-[11px] text-muted-foreground/70 line-through font-normal">
                {formatBRL(hit.price)}
              </p>
            )}
            <p className="text-[15px] font-bold text-foreground tracking-tight">
              {formatBRL(activePrice)}
            </p>
            {installment > 1 && (
              <p className="text-[10px] text-muted-foreground">
                ou 10x de{' '}
                <span className="font-medium">{formatBRL(installment)}</span>
              </p>
            )}
            {activePrice >= 299 && (
              <div className="flex items-center gap-1 pt-0.5">
                <Badge
                  variant="secondary"
                  className="bg-green-50 text-green-700 border-green-200 text-[9px] px-1.5 py-0 font-semibold gap-0.5"
                >
                  <Truck className="w-2.5 h-2.5" />
                  Frete Grátis
                </Badge>
              </div>
            )}
          </div>

          {/* Buy Button or Out-of-stock notice */}
          <div className="mt-3">
            {hit.in_stock === false ? (
              <div className="flex flex-col items-center gap-1.5 py-1">
                <span className="text-[10px] font-bold text-destructive uppercase tracking-wider">Produto Esgotado</span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    window.location.href = 'tel:+554332941144';
                  }}
                  className="flex items-center gap-1.5 text-[10px] font-semibold text-primary hover:underline cursor-pointer"
                >
                  <Phone className="w-3 h-3" />
                  (43) 3294-1144
                </button>
              </div>
            ) : (
              <Button 
                onClick={handleBuy}
                variant="default"
                size="sm"
                className="w-full h-9 rounded-lg text-xs font-bold uppercase tracking-wider transition-all active:scale-95 flex items-center gap-2"
              >
                <ShoppingCart className="w-3.5 h-3.5" />
                Comprar
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

// ─── Skeleton for loading states ──────────────────────────────────────────────

export function ProductCardSkeleton() {
  return (
    <Card className="overflow-hidden gap-0 rounded-xl">
      <div className="aspect-square w-full bg-muted animate-pulse" />
      <CardContent className="p-3.5 pt-3 space-y-3 border-t border-border/40">
        <div className="h-3 w-[40%] bg-muted animate-pulse rounded" />
        <div className="h-4 w-[85%] bg-muted animate-pulse rounded" />
        <div className="space-y-1.5 pt-1">
          <div className="h-5 w-[50%] bg-muted animate-pulse rounded" />
          <div className="h-3 w-[70%] bg-muted animate-pulse rounded" />
        </div>
      </CardContent>
    </Card>
  );
}