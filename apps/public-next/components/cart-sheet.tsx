'use client';

import Link from 'next/link';
import { Minus, Plus, ShoppingBag, Trash2, X } from 'lucide-react';
import { useCart } from '@/lib/cart-store';

function formatCurrency(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function CartSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (value: boolean) => void;
}) {
  const { items, totals, increment, decrement, removeItem } = useCart();

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        className="absolute inset-0 bg-black/45 backdrop-blur-[2px]"
        onClick={() => onOpenChange(false)}
        aria-label="Fechar carrinho"
      />

      <aside className="relative flex h-full w-full max-w-md flex-col border-l border-border bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <p className="text-sm font-semibold text-foreground">Seu carrinho</p>
            <p className="text-xs text-muted-foreground">{totals.totalQty} item(ns)</p>
          </div>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-border"
            aria-label="Fechar carrinho"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {items.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center text-center">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-secondary">
                <ShoppingBag className="h-7 w-7 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-semibold text-foreground">Carrinho vazio</h3>
              <p className="mt-2 max-w-xs text-sm text-muted-foreground">
                Revise os itens adicionados antes de finalizar sua compra.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {items.map((item) => (
                <div key={item.sku} className="rounded-2xl border border-border bg-card p-3">
                  <div className="flex gap-3">
                    <div className="h-20 w-20 overflow-hidden rounded-xl bg-secondary">
                      {item.imageUrl ? (
                        <img src={item.imageUrl} alt={item.name} className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
                          Toyota
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-2 text-sm font-semibold text-foreground">{item.name}</p>
                      <p className="mt-1 text-[11px] font-mono uppercase tracking-[0.14em] text-muted-foreground">
                        {item.sku}
                      </p>
                      <p className="mt-2 text-sm font-bold text-foreground">{formatCurrency(item.unitPrice)}</p>

                      <div className="mt-3 flex items-center justify-between">
                        <div className="inline-flex items-center rounded-full border border-border bg-secondary/60">
                          <button
                            type="button"
                            onClick={() => decrement(item.sku)}
                            className="inline-flex h-8 w-8 items-center justify-center"
                          >
                            <Minus className="h-3 w-3" />
                          </button>
                          <span className="min-w-8 text-center text-sm font-semibold">{item.qty}</span>
                          <button
                            type="button"
                            onClick={() => increment(item.sku)}
                            className="inline-flex h-8 w-8 items-center justify-center"
                          >
                            <Plus className="h-3 w-3" />
                          </button>
                        </div>

                        <button
                          type="button"
                          onClick={() => removeItem(item.sku)}
                          className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="h-3 w-3" />
                          Remover
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="border-t border-border px-5 py-4">
          <div className="mb-4 flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Subtotal</span>
            <span className="text-lg font-bold text-foreground">{formatCurrency(totals.subtotal)}</span>
          </div>
          <Link
            href="/checkout"
            className="inline-flex h-12 w-full items-center justify-center rounded-2xl bg-primary text-sm font-bold text-white transition-transform hover:scale-[1.01]"
            onClick={() => onOpenChange(false)}
          >
            Ir para checkout
          </Link>
        </div>
      </aside>
    </div>
  );
}
