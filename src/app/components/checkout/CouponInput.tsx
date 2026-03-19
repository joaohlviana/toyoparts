// ─── CouponInput — Checkout Coupon Field ─────────────────────────────────────
// Valida o cupom via API e expõe o resultado via onApply/onRemove.
// Estados: idle → loading → applied (verde) | error (vermelho)

import React, { useState, useRef } from 'react';
import { Tag, Loader2, CheckCircle2, X, AlertCircle, Truck } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Input } from '../ui/input';
import { projectId, publicAnonKey } from '../../../../utils/supabase/info';

const API = `https://${projectId}.supabase.co/functions/v1/make-server-1d6e33e0/coupons/validate`;

const ERROR_MESSAGES: Record<string, string> = {
  coupon_not_found:   'Cupom inválido ou inexistente',
  coupon_inactive:    'Este cupom não está ativo no momento',
  coupon_not_started: 'Este cupom ainda não está disponível',
  coupon_expired:     'Este cupom expirou',
  coupon_exhausted:   'Cupom esgotado — limite de usos atingido',
  already_used:       'Você já utilizou este cupom',
  not_applicable:     'Cupom não aplicável aos itens do carrinho',
  rate_limited:       'Muitas tentativas. Aguarde um momento e tente novamente.',
  server_error:       'Erro ao validar cupom. Tente novamente.',
};

export interface AppliedCoupon {
  code:             string;
  type:             'percent' | 'fixed' | 'free_shipping' | 'combo';
  discountValue:    number;
  shippingDiscount: number;
  totalDiscount:    number;
  freeShipping:     boolean;
  description:      string;
}

interface Props {
  subtotal:      number;
  shippingValue: number;
  email:         string;
  items:         Array<{ sku: string; qty: number; unitPrice: number; categoryId?: string }>;
  onApply:       (coupon: AppliedCoupon) => void;
  onRemove:      () => void;
  applied?:      AppliedCoupon | null;
}

function formatBRL(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function CouponInput({ subtotal, shippingValue, email, items, onApply, onRemove, applied }: Props) {
  const [code,      setCode]      = useState('');
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleApply = async () => {
    const trimmed = code.trim().toUpperCase();
    if (!trimmed) return;
    setError(null);
    setLoading(true);

    try {
      const res  = await fetch(API, {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${publicAnonKey}`,
        },
        body: JSON.stringify({ code: trimmed, email, subtotal, shippingValue, items }),
      });
      const data = await res.json();

      if (data.valid) {
        onApply({
          code:             data.code,
          type:             data.type,
          discountValue:    data.discountValue,
          shippingDiscount: data.shippingDiscount,
          totalDiscount:    data.totalDiscount,
          freeShipping:     data.freeShipping,
          description:      data.description,
        });
        setCode('');
      } else {
        let msg = ERROR_MESSAGES[data.reason] ?? 'Cupom inválido';
        // Enrich min_order message with actual value
        if (data.reason === 'min_order_not_met' && data.detail) {
          msg = `Valor mínimo para este cupom: ${formatBRL(Number(data.detail))}`;
        }
        if (data.reason === 'coupon_expired' && data.detail) {
          const d = new Date(data.detail).toLocaleDateString('pt-BR');
          msg = `Este cupom expirou em ${d}`;
        }
        setError(msg);
      }
    } catch {
      setError(ERROR_MESSAGES.server_error);
    } finally {
      setLoading(false);
    }
  };

  const handleRemove = () => {
    onRemove();
    setCode('');
    setError(null);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') { e.preventDefault(); handleApply(); }
  };

  // ── Applied state ──────────────────────────────────────────────────────────
  if (applied) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl border border-green-200 bg-green-50/60 p-4"
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-green-100 flex items-center justify-center flex-shrink-0">
              <CheckCircle2 className="w-4.5 h-4.5 text-green-600" />
            </div>
            <div>
              <p className="text-[13px] font-bold text-green-800 flex items-center gap-1.5">
                <span className="font-mono tracking-wider">{applied.code}</span>
                <span className="text-green-600">aplicado!</span>
              </p>
              <p className="text-[11px] text-green-600 font-medium mt-0.5">{applied.description}</p>
            </div>
          </div>
          <button
            onClick={handleRemove}
            className="p-1.5 rounded-lg text-green-400 hover:text-green-700 hover:bg-green-100 transition-colors flex-shrink-0"
            title="Remover cupom"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Discount breakdown */}
        <div className="mt-3 pt-3 border-t border-green-200 space-y-1.5">
          {applied.discountValue > 0 && (
            <div className="flex items-center justify-between text-[12px]">
              <span className="text-green-700 font-medium flex items-center gap-1.5">
                <Tag className="w-3 h-3" /> Desconto no subtotal
              </span>
              <span className="text-green-700 font-bold">−{formatBRL(applied.discountValue)}</span>
            </div>
          )}
          {applied.freeShipping && (
            <div className="flex items-center justify-between text-[12px]">
              <span className="text-green-700 font-medium flex items-center gap-1.5">
                <Truck className="w-3 h-3" /> Frete grátis
              </span>
              <span className="text-green-700 font-bold">
                {applied.shippingDiscount > 0 ? `−${formatBRL(applied.shippingDiscount)}` : '✓'}
              </span>
            </div>
          )}
          {applied.totalDiscount > 0 && (
            <div className="flex items-center justify-between text-[12px] pt-1 border-t border-green-200/60">
              <span className="text-green-800 font-bold">Total economizado</span>
              <span className="text-green-800 font-black">−{formatBRL(applied.totalDiscount)}</span>
            </div>
          )}
        </div>
      </motion.div>
    );
  }

  // ── Input state ────────────────────────────────────────────────────────────
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Tag className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          <Input
            ref={inputRef}
            value={code}
            onChange={e => { setCode(e.target.value.toUpperCase()); setError(null); }}
            onKeyDown={handleKeyDown}
            placeholder="CÓDIGO DO CUPOM"
            className={`h-12 pl-10 rounded-xl font-mono font-bold tracking-widest text-sm transition-all
              ${error
                ? 'border-red-300 bg-red-50/40 focus:ring-red-500/10 focus:border-red-400'
                : 'border-slate-200 bg-slate-50/50 focus:bg-white focus:ring-primary/5'
              }`}
            disabled={loading}
            autoComplete="off"
            spellCheck={false}
          />
        </div>
        <button
          onClick={handleApply}
          disabled={loading || !code.trim()}
          className="h-12 px-5 rounded-xl bg-slate-900 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-[13px] font-bold transition-all flex items-center gap-2 flex-shrink-0"
        >
          {loading
            ? <><Loader2 className="w-4 h-4 animate-spin" /> Validando...</>
            : 'Aplicar'
          }
        </button>
      </div>

      <AnimatePresence>
        {error && (
          <motion.p
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className="flex items-center gap-1.5 text-red-500 text-[11px] font-bold"
          >
            <AlertCircle className="w-3 h-3 flex-shrink-0" />{error}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}
