import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, Loader2, MapPin, RefreshCw, Truck, Zap } from 'lucide-react';
import { fetchCepAddress, FrenetError } from '../lib/shipping/frenet-api';
import { useShippingQuote } from '../lib/shipping/useFrenet';
import { formatShippingTransitTime } from '../lib/shipping/shipping-labels';
import type { FrenetCepResponse, ShippingQuote } from '../lib/shipping/shipping-types';
import { maskCEP, isValidCEP } from '../lib/checkout/checkout-validation';
import { ShippingPromotionCallouts } from './shipping/ShippingPromotionCallouts';
import { Input } from './ui/input';
import { Button } from './ui/button';

function pickBestTwo(quotes: ShippingQuote[]): (ShippingQuote & { tag: 'cheapest' | 'fastest' })[] {
  if (quotes.length === 0) return [];
  const cheapest = quotes.reduce((a, b) => (a.price < b.price ? a : b));
  const fastest = quotes.reduce((a, b) => (a.estimatedDays < b.estimatedDays ? a : b));
  if (cheapest.id === fastest.id) {
    return [{ ...cheapest, tag: 'cheapest' }];
  }
  return [
    { ...cheapest, tag: 'cheapest' },
    { ...fastest, tag: 'fastest' },
  ];
}

interface ShippingCalculatorProps {
  items: {
    sku: string;
    qty: number;
    price: number;
    weight?: number | null;
    height?: number;
    length?: number;
    width?: number;
    name?: string;
  }[];
  onSelect?: (quote: {
    id: string;
    name: string;
    carrier: string;
    price: number;
    estimatedDays: number;
    freeShipping?: boolean;
  }) => void;
  selectedId?: string;
  compact?: boolean;
}

export function ShippingCalculator({ items, onSelect, selectedId, compact }: ShippingCalculatorProps) {
  const [cep, setCep] = useState('');
  const [address, setAddress] = useState<FrenetCepResponse | null>(null);
  const [localError, setLocalError] = useState('');
  const {
    calculate,
    quotes,
    errors,
    isLoading,
    error,
    appliedRule,
    potentialRules,
    whatsappOffer,
    eligibleFreeShippingServiceIds,
  } = useShippingQuote(0);

  const bestTwo = useMemo(() => pickBestTwo(quotes), [quotes]);

  const calculateShipping = useCallback(async () => {
    const clean = cep.replace(/\D/g, '');
    if (!isValidCEP(clean)) {
      setLocalError('CEP invalido');
      return;
    }
    if (items.length === 0) {
      setLocalError('Nenhum item para calcular');
      return;
    }

    setLocalError('');
    setAddress(null);

    fetchCepAddress(clean)
      .then((data) => setAddress(data))
      .catch((err: any) => {
        const message = err instanceof FrenetError ? err.message : 'Nao foi possivel localizar o CEP.';
        setLocalError(message);
      });

    calculate({
      recipientCep: clean,
      items: items.map((item) => ({
        sku: item.sku,
        qty: item.qty,
        price: item.price,
        name: item.name,
        weight: item.weight,
        height: item.height,
        length: item.length,
        width: item.width,
      })),
    });
  }, [calculate, cep, items]);

  useEffect(() => {
    if (!onSelect || bestTwo.length === 0) return;
    const cheapest = bestTwo[0];
    onSelect({
      id: cheapest.id,
      name: cheapest.name,
      carrier: cheapest.carrier,
      price: cheapest.price,
      estimatedDays: cheapest.estimatedDays,
      freeShipping: cheapest.freeShipping,
    });
  }, [bestTwo, onSelect]);

  const displayError = localError || error || '';

  const formatPrice = (value: number | undefined | null) => {
    if (value === undefined || value === null) return 'R$ 0,00';
    return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  };

  return (
    <div className={compact ? 'space-y-2.5' : 'space-y-3'}>
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <MapPin className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={maskCEP(cep)}
            onChange={(event) => setCep(event.target.value.replace(/\D/g, ''))}
            placeholder="Digite seu CEP"
            maxLength={9}
            className={`pl-9 ${compact ? 'h-9' : 'h-10'}`}
            onKeyDown={(event) => event.key === 'Enter' && calculateShipping()}
          />
        </div>
        <Button variant="outline" size="sm" onClick={calculateShipping} disabled={isLoading} className={compact ? 'h-9 px-3' : 'h-10 px-4'}>
          {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Truck className="h-4 w-4" />}
          <span className="ml-1.5 text-xs font-semibold">Calcular</span>
        </Button>
      </div>

      {address ? (
        <p className="truncate text-xs text-muted-foreground">
          {address.address.street ? `${address.address.street}, ` : ''}
          {address.address.district} - {address.address.city}/{address.address.state}
        </p>
      ) : null}

      {displayError ? (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs text-red-700">
          <AlertCircle className="h-4 w-4 flex-shrink-0 text-red-500" />
          <span className="flex-1">{displayError}</span>
          <button onClick={calculateShipping} className="flex-shrink-0 text-red-400 transition-colors hover:text-red-600">
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : null}

      {(appliedRule || potentialRules.length > 0 || whatsappOffer) ? (
        <ShippingPromotionCallouts
          appliedRule={appliedRule}
          potentialRules={potentialRules}
          whatsappOffer={whatsappOffer}
          compact
        />
      ) : null}

      {isLoading && quotes.length === 0 ? (
        <div className="space-y-2">
          {[1, 2].map((value) => (
            <div key={value} className="flex animate-pulse items-center justify-between rounded-lg border border-border p-3">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-lg bg-muted" />
                <div className="space-y-1.5">
                  <div className="h-3 w-24 rounded bg-muted" />
                  <div className="h-2.5 w-16 rounded bg-muted" />
                </div>
              </div>
              <div className="h-4 w-16 rounded bg-muted" />
            </div>
          ))}
        </div>
      ) : null}

      {bestTwo.length > 0 ? (
        <div className="space-y-2">
          {bestTwo.map((quote) => {
            const isSelected = selectedId === quote.id;
            const isFreeByRule = eligibleFreeShippingServiceIds.includes(quote.id) || quote.freeShipping === true;

            return (
              <button
                key={quote.id}
                onClick={() =>
                  onSelect?.({
                    id: quote.id,
                    name: quote.name,
                    carrier: quote.carrier,
                    price: quote.price,
                    estimatedDays: quote.estimatedDays,
                    freeShipping: quote.freeShipping,
                  })
                }
                className={`w-full select-none rounded-lg border px-3 py-3 text-left transition-all ${
                  isSelected
                    ? 'border-primary bg-primary/[0.04] shadow-[0_0_0_1px_var(--primary)]'
                    : 'border-border bg-card hover:border-muted-foreground/30 hover:shadow-sm'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg ${isSelected ? 'bg-primary/10 text-primary' : 'bg-secondary text-muted-foreground'}`}>
                    {quote.tag === 'fastest' && quote.tag !== 'cheapest' ? <Zap className="h-4 w-4" /> : <Truck className="h-4 w-4" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="truncate text-sm font-medium text-foreground">{quote.name}</span>
                      {quote.tag === 'cheapest' && bestTwo.length > 1 ? (
                        <span className="whitespace-nowrap rounded border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">Mais barato</span>
                      ) : null}
                      {quote.tag === 'fastest' && bestTwo.length > 1 ? (
                        <span className="whitespace-nowrap rounded border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-[10px] font-semibold text-blue-700">Mais rapido</span>
                      ) : null}
                      {isFreeByRule ? (
                        <span className="whitespace-nowrap rounded border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">Gratis por regra</span>
                      ) : null}
                    </div>
                    <span className="text-xs text-muted-foreground">{formatShippingTransitTime(quote.estimatedDays)}</span>
                    {quote.message ? <p className="mt-1 text-[11px] text-emerald-700">{quote.message}</p> : null}
                  </div>
                  <div className="flex-shrink-0 text-right">
                    {quote.originalPrice && quote.originalPrice > quote.price ? (
                      <p className="text-[11px] text-slate-400 line-through">{formatPrice(quote.originalPrice)}</p>
                    ) : null}
                    <span className="text-sm font-bold text-foreground tabular-nums">
                      {quote.price === 0 ? 'Gratis' : formatPrice(quote.price)}
                    </span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      ) : null}

      {errors.length > 0 ? (
        <details className="text-[11px] text-muted-foreground">
          <summary className="cursor-pointer transition-colors hover:text-foreground">
            {errors.length} servico(s) indisponivel(is)
          </summary>
          <ul className="mt-1 list-disc space-y-0.5 pl-3">
            {errors.map((item, index) => (
              <li key={`${item.serviceDescription}-${index}`}>
                {item.serviceDescription}: {item.message || 'Indisponivel'}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
