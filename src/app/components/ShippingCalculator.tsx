// ─── Shipping Calculator Widget ─────────────────────────────────────────────
// Standalone CEP → shipping quote component. Used in product detail, cart, etc.
// Shows only the 2 best options: cheapest & fastest. Untitled UI style.

import React, { useState, useCallback, useMemo } from 'react';
import { Truck, Loader2, MapPin, RefreshCw, AlertCircle, Zap } from 'lucide-react';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { maskCEP, isValidCEP } from '../lib/checkout/checkout-validation';
import { fetchCepAddress, fetchShippingQuote, FrenetError } from '../lib/shipping/frenet-api';
import type { FrenetCepResponse, FrenetQuoteService } from '../lib/shipping/shipping-types';

// ─── Pick best 2: cheapest & fastest ────────────────────────────────────────

function pickBestTwo(quotes: FrenetQuoteService[]): (FrenetQuoteService & { tag: 'cheapest' | 'fastest' })[] {
  if (quotes.length === 0) return [];

  const cheapest = quotes.reduce((a, b) => (a.price < b.price ? a : b));
  const fastest = quotes.reduce((a, b) => (a.deliveryDays < b.deliveryDays ? a : b));

  // If same service, return just one tagged as both
  if ((cheapest.serviceCode || cheapest.serviceDescription) === (fastest.serviceCode || fastest.serviceDescription)) {
    return [{ ...cheapest, tag: 'cheapest' }];
  }

  return [
    { ...cheapest, tag: 'cheapest' as const },
    { ...fastest, tag: 'fastest' as const },
  ];
}

interface ShippingCalculatorProps {
  /** Items for quote */
  items: {
    sku: string;
    qty: number;
    price: number;
    weight?: number | null;
    height?: number;
    length?: number;
    width?: number;
  }[];
  /** Callback when a quote is selected */
  onSelect?: (quote: {
    id: string;
    name: string;
    carrier: string;
    price: number;
    estimatedDays: number;
    freeShipping?: boolean;
  }) => void;
  /** Currently selected quote id */
  selectedId?: string;
  /** Compact mode for embedded usage */
  compact?: boolean;
}

export function ShippingCalculator({ items, onSelect, selectedId, compact }: ShippingCalculatorProps) {
  const [cep, setCep] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [address, setAddress] = useState<FrenetCepResponse | null>(null);
  const [quotes, setQuotes] = useState<FrenetQuoteService[]>([]);
  const [quoteErrors, setQuoteErrors] = useState<FrenetQuoteService[]>([]);

  const bestTwo = useMemo(() => pickBestTwo(quotes), [quotes]);

  const calculate = useCallback(async () => {
    const clean = cep.replace(/\D/g, '');
    if (!isValidCEP(clean)) {
      setError('CEP invalido');
      return;
    }
    if (items.length === 0) {
      setError('Nenhum item para calcular');
      return;
    }

    setLoading(true);
    setError('');
    setQuotes([]);
    setQuoteErrors([]);
    setAddress(null);

    try {
      // Fetch address in parallel with quote
      const [addrResult, quoteResult] = await Promise.allSettled([
        fetchCepAddress(clean),
        fetchShippingQuote({
          recipientCep: clean,
          invoiceValue: items.reduce((s, i) => s + i.price * i.qty, 0),
          items: items.map(i => ({
            sku: i.sku,
            quantity: i.qty,
            weight: i.weight || 0.5,
            height: i.height,
            length: i.length,
            width: i.width,
          })),
        }),
      ]);

      if (addrResult.status === 'fulfilled') {
        setAddress(addrResult.value);
      }

      if (quoteResult.status === 'fulfilled') {
        setQuotes(quoteResult.value.quotes);
        setQuoteErrors(quoteResult.value.errors);

        // Auto-select cheapest
        if (quoteResult.value.quotes.length > 0 && onSelect) {
          const best = pickBestTwo(quoteResult.value.quotes);
          if (best.length > 0) {
            const cheapest = best[0]; // first is always cheapest
            onSelect({
              id: cheapest.serviceCode || cheapest.serviceDescription,
              name: cheapest.serviceDescription,
              carrier: cheapest.carrier,
              price: cheapest.price,
              estimatedDays: cheapest.deliveryDays,
              freeShipping: cheapest.freeShipping,
            });
          }
        }
      } else {
        const err = quoteResult.reason;
        setError(
          err instanceof FrenetError
            ? err.message
            : 'Nao foi possivel calcular o frete.',
        );
      }
    } catch (e: any) {
      setError(e.message || 'Erro inesperado');
    } finally {
      setLoading(false);
    }
  }, [cep, items, onSelect]);

  const formatPrice = (v: number | undefined | null) => {
    if (v === undefined || v === null) return 'R$ 0,00';
    return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  };

  return (
    <div className={compact ? 'space-y-2.5' : 'space-y-3'}>
      {/* CEP Input */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <Input
            value={maskCEP(cep)}
            onChange={(e) => setCep(e.target.value.replace(/\D/g, ''))}
            placeholder="Digite seu CEP"
            maxLength={9}
            className={`pl-9 ${compact ? 'h-9' : 'h-10'}`}
            onKeyDown={(e) => e.key === 'Enter' && calculate()}
          />
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={calculate}
          disabled={loading}
          className={compact ? 'h-9 px-3' : 'h-10 px-4'}
        >
          {loading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Truck className="w-4 h-4" />
          )}
          <span className="ml-1.5 text-xs font-semibold">Calcular</span>
        </Button>
      </div>

      {/* Address preview */}
      {address && (
        <p className="text-xs text-muted-foreground truncate">
          {address.address.street && `${address.address.street}, `}
          {address.address.district} — {address.address.city}/{address.address.state}
        </p>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 p-2.5 rounded-lg border border-red-200 bg-red-50 text-xs text-red-700">
          <AlertCircle className="w-4 h-4 flex-shrink-0 text-red-500" />
          <span className="flex-1">{error}</span>
          <button onClick={calculate} className="flex-shrink-0 text-red-400 hover:text-red-600 transition-colors">
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Skeleton loading */}
      {loading && quotes.length === 0 && (
        <div className="space-y-2">
          {[1, 2].map(i => (
            <div key={i} className="animate-pulse flex items-center justify-between p-3 rounded-lg border border-border">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-muted rounded-lg" />
                <div className="space-y-1.5">
                  <div className="h-3 w-24 bg-muted rounded" />
                  <div className="h-2.5 w-16 bg-muted rounded" />
                </div>
              </div>
              <div className="h-4 w-16 bg-muted rounded" />
            </div>
          ))}
        </div>
      )}

      {/* Quote results — only best 2 */}
      {bestTwo.length > 0 && (
        <div className="space-y-2">
          {bestTwo.map((q) => {
            const qId = q.serviceCode || q.serviceDescription;
            const isSelected = selectedId === qId;
            const isCheapest = q.tag === 'cheapest';
            const isFastest = q.tag === 'fastest';

            return (
              <button
                key={qId}
                onClick={() =>
                  onSelect?.({
                    id: qId,
                    name: q.serviceDescription,
                    carrier: q.carrier,
                    price: q.price,
                    estimatedDays: q.deliveryDays,
                    freeShipping: q.freeShipping,
                  })
                }
                className={`w-full flex items-center gap-3 text-left px-3 py-3 rounded-lg border transition-all select-none ${
                  isSelected
                    ? 'border-primary bg-primary/[0.04] shadow-[0_0_0_1px_var(--primary)]'
                    : 'border-border bg-card hover:border-muted-foreground/30 hover:shadow-sm'
                }`}
              >
                {/* Icon */}
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${
                  isSelected ? 'bg-primary/10 text-primary' : 'bg-secondary text-muted-foreground'
                }`}>
                  {isFastest && !isCheapest ? (
                    <Zap className="w-4 h-4" />
                  ) : (
                    <Truck className="w-4 h-4" />
                  )}
                </div>

                {/* Details */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className={`text-sm font-medium truncate ${isSelected ? 'text-foreground' : 'text-foreground'}`}>
                      {q.serviceDescription}
                    </span>
                    {isCheapest && bestTwo.length > 1 && (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 whitespace-nowrap">
                        Mais barato
                      </span>
                    )}
                    {isFastest && bestTwo.length > 1 && (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-blue-50 text-blue-700 border border-blue-200 whitespace-nowrap">
                        Mais rápido
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {q.carrier} — {q.deliveryDays} dia{q.deliveryDays !== 1 ? 's' : ''} {q.deliveryDays === 1 ? 'útil' : 'úteis'}
                  </span>
                </div>

                {/* Price */}
                <div className="text-right flex-shrink-0">
                  {q.freeShipping ? (
                    <span className="text-sm font-bold text-emerald-600">Grátis</span>
                  ) : (
                    <span className="text-sm font-bold text-foreground tabular-nums">
                      {formatPrice(q.price)}
                    </span>
                  )}
                </div>

                {/* Radio indicator */}
                
              </button>
            );
          })}
        </div>
      )}

      {/* Quote errors (collapsed) */}
      {quoteErrors.length > 0 && (
        <details className="text-[11px] text-muted-foreground">
          <summary className="cursor-pointer hover:text-foreground transition-colors">
            {quoteErrors.length} serviço(s) indisponível(is)
          </summary>
          <ul className="mt-1 space-y-0.5 pl-3 list-disc">
            {quoteErrors.map((e, i) => (
              <li key={i}>
                {e.serviceDescription}: {e.message || 'Indisponível'}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}