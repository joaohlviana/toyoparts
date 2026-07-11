'use client';

import { Minus, Plus, ShoppingCart } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { useCart } from '@/lib/cart-store';

export function AddToCartPanel({
  sku,
  name,
  price,
  originalPrice,
  imageUrl,
  weight,
  inStock,
}: {
  sku: string;
  name: string;
  price: number;
  originalPrice: number;
  imageUrl?: string;
  weight?: number | null;
  inStock?: boolean;
}) {
  const [qty, setQty] = useState(1);
  const { addItem, setOpen } = useCart();

  if (inStock === false) {
    return (
      <div className="rounded-[2rem] border border-border bg-white p-6 tp-soft-card">
        <p className="text-sm font-bold uppercase tracking-[0.16em] text-destructive">Sem estoque</p>
        <p className="mt-3 text-sm text-muted-foreground">
          Este item está temporariamente indisponível. Use os canais de atendimento para validar reposição.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-[2rem] border border-border bg-white p-6 tp-soft-card">
      <p className="text-sm font-bold uppercase tracking-[0.16em] text-muted-foreground">Comprar agora</p>
      <div className="mt-4 inline-flex items-center rounded-full border border-border bg-secondary/60">
        <button type="button" className="inline-flex h-10 w-10 items-center justify-center" onClick={() => setQty((value) => Math.max(1, value - 1))}>
          <Minus className="h-4 w-4" />
        </button>
        <span className="min-w-10 text-center text-sm font-semibold">{qty}</span>
        <button type="button" className="inline-flex h-10 w-10 items-center justify-center" onClick={() => setQty((value) => value + 1)}>
          <Plus className="h-4 w-4" />
        </button>
      </div>
      <button
        type="button"
        className="mt-5 inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-primary text-sm font-bold text-white"
        onClick={() => {
          addItem(
            {
              sku,
              name,
              unitPrice: price,
              originalPrice,
              imageUrl: imageUrl || '',
              weight: weight || 0.5,
              inStock: true,
            },
            qty
          );
          setOpen(true);
          toast.success('Produto adicionado ao carrinho');
        }}
      >
        <ShoppingCart className="h-4 w-4" />
        Adicionar ao carrinho
      </button>
    </div>
  );
}
