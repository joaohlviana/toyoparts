// ─── Cart Drawer ────────────────────────────────────────────────────────────
// Apple-style slide-over cart panel from the right.

import React, { useState, useCallback } from 'react';
import { useNavigate } from 'react-router';
import {
  X, Minus, Plus, Trash2, ShoppingBag,
  Truck, ArrowRight, Loader2, Zap, MessageCircle, Sparkles,
} from 'lucide-react';
import { useCart } from '../../lib/cart/cart-store';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerClose,
} from '../ui/drawer';
import { useIsMobile } from '../ui/use-mobile';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Badge } from '../ui/badge';
import { fetchShippingQuote } from '../../lib/shipping/frenet-api';
import { maskCEP, isValidCEP } from '../../lib/checkout/checkout-validation';
import type {
  ShippingQuote,
  FreeShippingEvaluationRuleSummary,
  FreeShippingWhatsAppOffer,
} from '../../lib/shipping/shipping-types';
import { ToyotaPlaceholder } from '../ToyotaPlaceholder';

function formatBRL(v: number | undefined | null) {
  if (v === undefined || v === null) return 'R$ 0,00';
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

// ─── Pick best 2: cheapest & fastest ────────────────────────────────────────

function pickBestTwo(quotes: ShippingQuote[]): (ShippingQuote & { tag: 'cheapest' | 'fastest' })[] {
  if (quotes.length === 0) return [];

  const cheapest = quotes.reduce((a, b) => (a.price < b.price ? a : b));
  const fastest = quotes.reduce((a, b) => (a.estimatedDays < b.estimatedDays ? a : b));

  if (cheapest.id === fastest.id) {
    return [{ ...cheapest, tag: 'cheapest' }];
  }

  return [
    { ...cheapest, tag: 'cheapest' as const },
    { ...fastest, tag: 'fastest' as const },
  ];
}

interface CartDrawerProps {
  open: boolean;
  onClose: () => void;
}

export function CartDrawer({ open, onClose }: CartDrawerProps) {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const {
    items, totals, shipping, setShipping,
    increment, decrement, removeItem, clearCart,
  } = useCart();

  const [cep, setCep] = useState('');
  const [shippingQuotes, setShippingQuotes] = useState<ShippingQuote[]>([]);
  const [loadingShipping, setLoadingShipping] = useState(false);
  const [shippingError, setShippingError] = useState('');
  const [appliedRule, setAppliedRule] = useState<FreeShippingEvaluationRuleSummary | null>(null);
  const [potentialRules, setPotentialRules] = useState<FreeShippingEvaluationRuleSummary[]>([]);
  const [whatsAppOffer, setWhatsAppOffer] = useState<FreeShippingWhatsAppOffer | null>(null);
  const [eligibleServiceIds, setEligibleServiceIds] = useState<string[]>([]);
  const [imgErrors, setImgErrors] = useState<Set<string>>(new Set());

  const bestShippingOptions = pickBestTwo(shippingQuotes);

  const handleCalcShipping = useCallback(async () => {
    const cleanCep = cep.replace(/\D/g, '');
    if (!isValidCEP(cleanCep)) {
      setShippingError('CEP inválido');
      return;
    }
    setLoadingShipping(true);
    setShippingError('');
    setShippingQuotes([]);
    setAppliedRule(null);
    setPotentialRules([]);
    setWhatsAppOffer(null);
    setEligibleServiceIds([]);
    try {
      const invoiceValue = items.reduce((sum, item) => sum + item.unitPrice * item.qty, 0);
      const result = await fetchShippingQuote({
        recipientCep: cleanCep,
        invoiceValue,
        items: items.map(i => ({
          sku: i.sku,
          quantity: i.qty,
          weight: i.weight || 0.5,
          name: i.name,
        })),
      });
      const quotes = result.quotes.map((quote) => ({
        id: quote.serviceCode || quote.serviceDescription,
        carrier: quote.carrier,
        name: quote.serviceDescription,
        price: quote.price,
        originalPrice: quote.originalPrice,
        estimatedDays: quote.deliveryDays,
        freeShipping: quote.freeShipping,
        message: quote.message,
      }));
      setShippingQuotes(quotes);
      setAppliedRule(result.appliedRule ?? null);
      setPotentialRules(result.potentialRules ?? []);
      setWhatsAppOffer(result.whatsappOffer ?? null);
      setEligibleServiceIds(result.eligibleFreeShippingServiceIds ?? []);
      // Auto-select cheapest
      if (quotes.length > 0) {
        const cheapest = quotes.reduce((a, b) => (a.price < b.price ? a : b));
        setShipping({
          id: cheapest.id,
          name: cheapest.name,
          carrier: cheapest.carrier,
          price: cheapest.price,
          originalPrice: cheapest.originalPrice,
          freeShipping: cheapest.freeShipping,
          message: cheapest.message,
          estimatedDays: cheapest.estimatedDays,
        });
      }
    } catch (e: any) {
      setShippingError(e.message || 'Erro ao calcular frete');
    } finally {
      setLoadingShipping(false);
    }
  }, [cep, items, setShipping]);

  const handleSelectShipping = (q: ShippingQuote) => {
    setShipping({
      id: q.id,
      name: q.name,
      carrier: q.carrier,
      price: q.price,
      originalPrice: q.originalPrice,
      freeShipping: q.freeShipping,
      message: q.message,
      estimatedDays: q.estimatedDays,
    });
  };

  const goToCheckout = () => {
    onClose();
    navigate('/checkout');
  };

  const cartContent = (
    <div className="flex flex-col h-full overflow-hidden bg-[#fbfbfd]">
      {/* Header (for desktop/drawer fallback) */}
      {!isMobile && (
        <div className="flex-shrink-0 h-14 flex items-center justify-between px-5 border-b border-black/[0.06]">
          <div className="flex items-center gap-2">
            <ShoppingBag className="w-[18px] h-[18px] text-[#1d1d1f]" strokeWidth={1.8} />
            <span className="text-[17px] font-semibold text-[#1d1d1f] tracking-tight">Carrinho</span>
            {totals.totalQty > 0 && (
              <Badge className="h-5 min-w-5 px-1.5 text-[10px] rounded-full">{totals.totalQty}</Badge>
            )}
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center text-[#86868b] hover:text-[#1d1d1f] bg-black/[0.05] hover:bg-black/[0.08] rounded-full transition-colors active:scale-90"
          >
            <X className="w-4 h-4" strokeWidth={2.5} />
          </button>
        </div>
      )}

      {/* Content */}
      {items.length === 0 ? (
        /* ── Empty state ── */
        <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
          <div className="w-16 h-16 rounded-full bg-black/[0.03] flex items-center justify-center mb-4">
            <ShoppingBag className="w-7 h-7 text-[#86868b]" strokeWidth={1.5} />
          </div>
          <p className="text-[15px] font-semibold text-[#1d1d1f] mb-1">Carrinho vazio</p>
          <p className="text-[13px] text-[#86868b] mb-6">Adicione peças para começar.</p>
          <Button
            onClick={() => { onClose(); navigate('/pecas'); }}
            className="rounded-full px-6 h-10 text-sm font-medium active:scale-95 transition-transform"
          >
            Explorar peças
          </Button>
        </div>
      ) : (
        <>
          {/* ── Items list ── */}
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3 overscroll-contain touch-pan-y">
            {items.map(item => {
              const hasDiscount = item.originalPrice > item.unitPrice;
              return (
                <div key={item.sku} className="flex gap-3 bg-white rounded-xl p-3 border border-black/[0.04] shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
                  {/* Thumbnail */}
                  <div className="w-16 h-16 sm:w-[72px] sm:h-[72px] flex-shrink-0 rounded-lg bg-[#f5f5f7] flex items-center justify-center overflow-hidden">
                    {item.imageUrl && !imgErrors.has(item.sku) ? (
                      <img
                        src={item.imageUrl}
                        alt={item.name}
                        className="w-full h-full object-cover"
                        loading="lazy"
                        onError={() => setImgErrors(prev => new Set(prev).add(item.sku))}
                      />
                    ) : (
                      <ToyotaPlaceholder className="w-full h-full p-1" />
                    )}
                  </div>

                  {/* Details */}
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] text-[#86868b] font-mono mb-0.5">{item.sku}</p>
                    <p className="text-[13px] font-medium text-[#1d1d1f] leading-snug line-clamp-2 mb-1.5">
                      {item.name}
                    </p>

                    <div className="flex items-center justify-between">
                      {/* Price */}
                      <div>
                        {hasDiscount && (
                          <span className="text-[10px] text-[#86868b] line-through mr-1.5">{formatBRL(item.originalPrice)}</span>
                        )}
                        <span className="text-[13px] font-bold text-[#1d1d1f]">{formatBRL(item.unitPrice)}</span>
                      </div>

                      {/* Qty controls */}
                      <div className="flex items-center gap-0.5">
                        <button
                          onClick={() => decrement(item.sku)}
                          className="w-8 h-8 rounded-lg flex items-center justify-center text-[#86868b] active:bg-black/[0.08] transition-colors"
                        >
                          {item.qty === 1 ? <Trash2 className="w-3.5 h-3.5 text-red-500" /> : <Minus className="w-3.5 h-3.5" strokeWidth={2.5} />}
                        </button>
                        <span className="w-7 text-center text-[13px] font-semibold text-[#1d1d1f] tabular-nums">{item.qty}</span>
                        <button
                          onClick={() => increment(item.sku)}
                          className="w-8 h-8 rounded-lg flex items-center justify-center text-[#1d1d1f] active:bg-black/[0.08] transition-colors"
                        >
                          <Plus className="w-3.5 h-3.5" strokeWidth={2.5} />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* ── Footer: shipping + totals + CTA ── */}
          <div className="flex-shrink-0 border-t border-black/[0.06] bg-white/80 backdrop-blur-xl px-5 pt-4 pb-[max(20px,env(safe-area-inset-bottom))]">
            {/* Shipping calculator */}
            <div className="mb-3">
              <div className="flex items-center gap-2 mb-2">
                <Truck className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Frete</span>
              </div>
              <div className="flex gap-2">
                <Input
                  placeholder="CEP"
                  value={cep}
                  onChange={e => setCep(maskCEP(e.target.value))}
                  className="h-10 flex-1 rounded-lg bg-secondary border-border focus:bg-card transition-all"
                  maxLength={9}
                  onKeyDown={e => e.key === 'Enter' && handleCalcShipping()}
                />
                <Button
                  variant="outline"
                  size="sm"
                  className="h-10 px-4 text-xs font-semibold rounded-lg active:scale-95 transition-transform"
                  onClick={handleCalcShipping}
                  disabled={loadingShipping}
                >
                  {loadingShipping ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Calcular'}
                </Button>
              </div>
              {shippingError && <p className="text-xs text-destructive mt-1.5">{shippingError}</p>}

              {appliedRule && (
                <div className="mt-2.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-3 text-left">
                  <div className="flex items-start gap-2">
                    <Sparkles className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-600" />
                    <div>
                      <p className="text-xs font-bold text-emerald-800">{appliedRule.ruleName}</p>
                      <p className="mt-1 text-[11px] text-emerald-700">{appliedRule.message}</p>
                    </div>
                  </div>
                </div>
              )}

              {!appliedRule && potentialRules.length > 0 && (
                <div className="mt-2.5 rounded-xl border border-blue-200 bg-blue-50 px-3 py-3 text-left">
                  <div className="flex items-start gap-2">
                    <Sparkles className="mt-0.5 h-4 w-4 flex-shrink-0 text-blue-600" />
                    <div>
                      <p className="text-xs font-bold text-blue-800">Beneficio potencial de frete gratis</p>
                      <p className="mt-1 text-[11px] text-blue-700">
                        {potentialRules[0]?.message} Escolha a forma de pagamento no checkout para confirmar.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {whatsAppOffer && (
                <a
                  href={whatsAppOffer.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2.5 flex items-start gap-2 rounded-xl border border-[#25D366]/20 bg-[#25D366]/10 px-3 py-3 text-left transition-colors hover:bg-[#25D366]/15"
                >
                  <MessageCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-[#128C7E]" />
                  <div>
                    <p className="text-xs font-bold text-[#128C7E]">Fechar com frete gratis no WhatsApp</p>
                    <p className="mt-1 text-[11px] text-[#128C7E]/90">{whatsAppOffer.message}</p>
                  </div>
                </a>
              )}

              {/* Shipping options */}
              {bestShippingOptions.length > 0 && (
                <div className="mt-2.5 space-y-1.5">
                  {bestShippingOptions.map(q => {
                    const isSelected = shipping?.id === q.id;
                    const isCheapest = q.tag === 'cheapest';
                    const isFastest = q.tag === 'fastest';
                    const isRuleFree = eligibleServiceIds.includes(q.id) || q.freeShipping === true;

                    return (
                      <button
                        key={q.id}
                        onClick={() => handleSelectShipping(q)}
                        className={`w-full flex items-center gap-2.5 text-left px-3 py-2.5 rounded-lg border text-xs transition-all select-none ${
                          isSelected
                            ? 'border-primary bg-primary/[0.04] shadow-[0_0_0_1px_var(--primary)]'
                            : 'border-border bg-card hover:border-muted-foreground/30'
                        }`}
                      >
                        {/* Icon */}
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                          isSelected ? 'bg-primary/10 text-primary' : 'bg-secondary text-muted-foreground'
                        }`}>
                          {isFastest && !isCheapest ? (
                            <Zap className="w-3.5 h-3.5" />
                          ) : (
                            <Truck className="w-3.5 h-3.5" />
                          )}
                        </div>

                        {/* Details */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1">
                            <span className="text-sm font-medium truncate text-foreground">
                              {q.name}
                            </span>
                            {isCheapest && bestShippingOptions.length > 1 && (
                              <span className="inline-flex px-1 py-0.5 rounded text-[9px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 whitespace-nowrap">
                                Mais barato
                              </span>
                            )}
                            {isFastest && bestShippingOptions.length > 1 && (
                              <span className="inline-flex px-1 py-0.5 rounded text-[9px] font-semibold bg-blue-50 text-blue-700 border border-blue-200 whitespace-nowrap">
                                Mais rápido
                              </span>
                            )}
                            {isRuleFree && (
                              <span className="inline-flex px-1 py-0.5 rounded text-[9px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 whitespace-nowrap">
                                Gratis por regra
                              </span>
                            )}
                          </div>
                          <span className="text-xs text-muted-foreground">
                            {q.estimatedDays} dia{q.estimatedDays !== 1 ? 's' : ''} {q.estimatedDays === 1 ? 'útil' : 'úteis'}
                          </span>
                          {q.message && (
                            <p className="mt-0.5 text-[10px] text-emerald-700">
                              {q.message}
                            </p>
                          )}
                        </div>

                        {/* Price — only final price, no strikethrough */}
                        <span className={`text-sm font-bold flex-shrink-0 tabular-nums ${q.price === 0 ? 'text-emerald-600' : 'text-foreground'}`}>
                          {q.price === 0 ? 'Grátis' : formatBRL(q.price)}
                        </span>

                        {/* Radio */}
                        <div className={`w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                          isSelected ? 'border-primary' : 'border-input'
                        }`}>
                          {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-primary" />}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Totals */}
            <div className="space-y-1 mb-3 text-[13px]">
              <div className="flex justify-between text-[#86868b]">
                <span>Subtotal ({totals.totalQty} {totals.totalQty === 1 ? 'item' : 'itens'})</span>
                <span className="font-medium tabular-nums text-[#1d1d1f]">{formatBRL(totals.subtotal)}</span>
              </div>
              {totals.shipping != null && (
                <div className="flex justify-between text-[#86868b]">
                  <span>Frete ({shipping?.name})</span>
                  <span className={`font-medium tabular-nums ${totals.shipping === 0 ? 'text-green-600' : ''}`}>
                    {totals.shipping === 0 ? 'Grátis' : formatBRL(totals.shipping)}
                  </span>
                </div>
              )}
              <div className="flex justify-between text-[#1d1d1f] font-bold text-[17px] pt-1.5 border-t border-black/[0.04]">
                <span>Total</span>
                <span className="tabular-nums tracking-tight">{formatBRL(totals.total)}</span>
              </div>
            </div>

            {/* CTA */}
            <button
              onClick={goToCheckout}
              className="w-full h-[54px] bg-[#1d1d1f] active:scale-[0.97] text-white text-[16px] font-bold rounded-2xl flex items-center justify-center gap-2 transition-all mb-2 shadow-lg shadow-black/5"
            >
              Finalizar compra
              <ArrowRight className="w-5 h-5 ml-1 opacity-50" />
            </button>

            {/* Clear */}
            <button
              onClick={clearCart}
              className="w-full text-center text-[12px] text-[#86868b] active:text-red-500 transition-colors py-1.5"
            >
              Limpar carrinho
            </button>
          </div>
        </>
      )}
    </div>
  );

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={(val) => !val && onClose()}>
        <DrawerContent className="h-[92dvh] focus:outline-none">
          <div className="w-10 h-1 rounded-full bg-black/10 mx-auto mt-2 mb-4 shrink-0" />
          <div className="px-5 mb-4 shrink-0 flex items-center justify-between">
            <DrawerTitle className="text-[22px] font-extrabold text-[#1d1d1f] tracking-tight">
              Meu Carrinho
            </DrawerTitle>
            <DrawerClose className="w-8 h-8 flex items-center justify-center text-[#86868b] bg-black/[0.05] rounded-full active:scale-90 transition-transform">
              <X className="w-4 h-4" strokeWidth={2.5} />
            </DrawerClose>
          </div>
          <div className="flex-1 overflow-hidden">
            {cartContent}
          </div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <>
      {/* Scrim */}
      {open && (
        <div
          className={`fixed inset-0 z-[60] bg-black/40 backdrop-blur-[2px] transition-opacity duration-500 ${
            open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
          }`}
          onClick={onClose}
        />
      )}

      {/* Panel */}
      <div
        className={`fixed top-0 right-0 bottom-0 z-[61] w-full max-w-[420px] bg-[#fbfbfd] flex flex-col transition-transform duration-[450ms] ease-[cubic-bezier(0.32,0.72,0,1)] ${
          open ? 'translate-x-0' : 'translate-x-full pointer-events-none'
        }`}
      >
        {cartContent}
      </div>
    </>
  );
}
