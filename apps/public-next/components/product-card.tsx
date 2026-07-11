'use client';

import Link from 'next/link';
import { ShoppingCart, Truck } from 'lucide-react';
import { toast } from 'sonner';
import { useState } from 'react';
import { useCart } from '@/lib/cart-store';
import type { CatalogHit } from '@/lib/types';
import { slugify } from '@/lib/seo';

function formatCurrency(value: number | undefined | null) {
  return (value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function ProductCard({ product }: { product: CatalogHit }) {
  const [imgError, setImgError] = useState(false);
  const { addItem, setOpen } = useCart();
  const activePrice =
    product.special_price && product.special_price > 0 && product.special_price < product.price
      ? product.special_price
      : product.price;
  const slug = product.url_key || slugify(product.name || '');
  const freeShippingPromo = product.in_stock === false ? null : product.freeShippingPromo;

  return (
    <article
      className="group flex h-full flex-col overflow-hidden rounded-3xl border border-border bg-white transition-all duration-300 hover:-translate-y-1 hover:border-primary/20 hover:shadow-xl hover:shadow-primary/5"
    >
      <Link href={`/produto/${encodeURIComponent(product.sku)}/${slug}`} className="relative block aspect-square overflow-hidden bg-secondary/40">
        {freeShippingPromo ? (
          <div className="absolute left-3 top-3 z-10 inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-white/95 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-emerald-700 shadow-sm backdrop-blur">
            <Truck className="h-3 w-3" />
            Frete gratis
          </div>
        ) : null}
        {!imgError && product.image_url ? (
          <img
            src={product.image_url}
            alt={product.name}
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
            loading="lazy"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-sm font-semibold text-muted-foreground">
            Produto Toyota
          </div>
        )}
      </Link>

      <div className="flex flex-1 flex-col p-4">
        <p className="text-[11px] font-mono uppercase tracking-[0.16em] text-muted-foreground">{product.sku}</p>
        <h3 className="mt-2 line-clamp-2 text-sm font-semibold leading-6 text-foreground">
          <Link href={`/produto/${encodeURIComponent(product.sku)}/${slug}`} className="hover:text-primary">{product.name}</Link>
        </h3>

        <div className="mt-4 space-y-1">
          {activePrice !== product.price ? (
            <p className="text-xs text-muted-foreground line-through">{formatCurrency(product.price)}</p>
          ) : null}
          <p className="text-xl font-black tracking-tight text-foreground">{formatCurrency(activePrice)}</p>
          {freeShippingPromo ? (
            <div className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2.5 py-1 text-[11px] font-semibold text-green-700">
              <Truck className="h-3 w-3" />
              Frete gratis
            </div>
          ) : null}
        </div>

        <button
          type="button"
          className="mt-4 inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-primary text-sm font-bold text-white"
          onClick={() => {
            addItem(
              {
                sku: product.sku,
                name: product.name,
              unitPrice: activePrice,
              originalPrice: product.price,
              imageUrl: product.image_url || '',
              weight: Number(product.weight || 0.5),
              inStock: product.in_stock ?? true,
            },
            1
          );
            setOpen(true);
            toast.success('Produto adicionado ao carrinho');
          }}
        >
          <ShoppingCart className="h-4 w-4" />
          Comprar
        </button>
      </div>
    </article>
  );
}
