// ─── Frenet Hooks ────────────────────────────────────────────────────────────
// useCepAutofill: debounced CEP → address auto-fill
// useShippingQuote: debounced quote with abort/retry

import { useState, useEffect, useRef, useCallback } from 'react';
import { fetchCepAddress, fetchShippingQuote, FrenetError } from './frenet-api';
import type { FrenetCepResponse, FrenetQuoteResponse, ShippingQuote } from './shipping-types';

// ═══════════════════════════════════════════════════════════════════════════════
// useCepAutofill
// ═══════════════════════════════════════════════════════════════════════════════

interface CepAutofillState {
  isLoading: boolean;
  error: string | null;
  data: FrenetCepResponse | null;
}

export function useCepAutofill(debounceMs = 350) {
  const [state, setState] = useState<CepAutofillState>({
    isLoading: false,
    error: null,
    data: null,
  });
  const abortRef = useRef<AbortController | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  const lookup = useCallback((cep: string) => {
    // Clear previous
    if (timerRef.current) clearTimeout(timerRef.current);
    if (abortRef.current) abortRef.current.abort();

    const clean = cep.replace(/\D/g, '');

    if (clean.length < 8) {
      setState({ isLoading: false, error: null, data: null });
      return;
    }

    if (clean.length !== 8) {
      setState({ isLoading: false, error: 'CEP invalido', data: null });
      return;
    }

    setState(prev => ({ ...prev, isLoading: true, error: null }));

    timerRef.current = setTimeout(async () => {
      const ctrl = new AbortController();
      abortRef.current = ctrl;

      try {
        const data = await fetchCepAddress(clean, ctrl.signal);
        if (!ctrl.signal.aborted) {
          setState({ isLoading: false, error: null, data });
        }
      } catch (e: any) {
        if (ctrl.signal.aborted) return;
        const msg =
          e instanceof FrenetError
            ? e.code === 'CEP_NOT_FOUND'
              ? 'CEP nao encontrado'
              : e.code === 'INVALID_CEP'
              ? 'CEP invalido'
              : e.message
            : 'Erro ao buscar CEP';
        setState({ isLoading: false, error: msg, data: null });
      }
    }, debounceMs);
  }, [debounceMs]);

  const reset = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (abortRef.current) abortRef.current.abort();
    setState({ isLoading: false, error: null, data: null });
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (abortRef.current) abortRef.current.abort();
    };
  }, []);

  return { ...state, lookup, reset };
}

// ═══════════════════════════════════════════════════════════════════════════════
// useShippingQuote
// ═══════════════════════════════════════════════════════════════════════════════

interface ShippingQuoteState {
  isLoading: boolean;
  error: string | null;
  quotes: ShippingQuote[];
  errors: { serviceDescription: string; message: string | null }[];
  freeShippingThreshold: number;
}

interface QuoteInput {
  recipientCep: string;
  items: {
    sku: string;
    qty: number;
    weight?: number | null;
    price: number;
    height?: number;
    length?: number;
    width?: number;
  }[];
}

export function useShippingQuote(debounceMs = 500) {
  const [state, setState] = useState<ShippingQuoteState>({
    isLoading: false,
    error: null,
    quotes: [],
    errors: [],
    freeShippingThreshold: 299,
  });
  const abortRef = useRef<AbortController | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  const calculate = useCallback((input: QuoteInput) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (abortRef.current) abortRef.current.abort();

    const cep = input.recipientCep.replace(/\D/g, '');
    if (cep.length !== 8 || input.items.length === 0) {
      setState(prev => ({ ...prev, isLoading: false, error: null, quotes: [], errors: [] }));
      return;
    }

    setState(prev => ({ ...prev, isLoading: true, error: null }));

    timerRef.current = setTimeout(async () => {
      const ctrl = new AbortController();
      abortRef.current = ctrl;

      try {
        const invoiceValue = input.items.reduce((s, i) => s + i.price * i.qty, 0);
        const result: FrenetQuoteResponse = await fetchShippingQuote(
          {
            recipientCep: cep,
            invoiceValue,
            items: input.items.map(i => ({
              sku: i.sku,
              quantity: i.qty,
              weight: i.weight || 0.5,
              height: i.height,
              length: i.length,
              width: i.width,
            })),
          },
          ctrl.signal,
        );

        if (!ctrl.signal.aborted) {
          setState({
            isLoading: false,
            error: null,
            quotes: result.quotes.map(q => ({
              id: q.serviceCode || q.serviceDescription,
              carrier: q.carrier,
              name: q.serviceDescription,
              price: q.price,
              originalPrice: q.originalPrice,
              estimatedDays: q.deliveryDays,
              freeShipping: q.freeShipping,
            })),
            errors: result.errors,
            freeShippingThreshold: result.config?.freeShippingThreshold ?? 299,
          });
        }
      } catch (e: any) {
        if (ctrl.signal.aborted) return;
        const msg =
          e instanceof FrenetError
            ? e.code === 'FRENET_TIMEOUT'
              ? 'Timeout no calculo de frete. Tente novamente.'
              : e.code === 'RATE_LIMIT'
              ? 'Muitas requisicoes. Aguarde um momento.'
              : e.message
            : 'Nao foi possivel calcular o frete.';
        setState(prev => ({ ...prev, isLoading: false, error: msg, quotes: [], errors: [] }));
      }
    }, debounceMs);
  }, [debounceMs]);

  const retry = useCallback((input: QuoteInput) => {
    calculate(input);
  }, [calculate]);

  const reset = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (abortRef.current) abortRef.current.abort();
    setState({ isLoading: false, error: null, quotes: [], errors: [], freeShippingThreshold: 299 });
  }, []);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (abortRef.current) abortRef.current.abort();
    };
  }, []);

  return { ...state, calculate, retry, reset };
}
