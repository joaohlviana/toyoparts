// ─── Abandoned Cart Banner ──────────────────────────────────────────────────
// Exibe um banner quando existe um carrinho salvo no localStorage.
// "Ignorar" seta dismissedUntil por 7 dias (ponto 4 do plano).
// "Restaurar" repassa os dados para o checkout.

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ShoppingBag, X, RotateCcw, Clock, AlertTriangle } from 'lucide-react';
import type { CartItem } from '../../lib/cart/cart-types';

const LS_CART_KEY    = 'toyoparts:abandoned_cart';
const LS_DISMISS_KEY = 'toyoparts:abandoned_cart_dismissed';

export interface AbandonedCartData {
  token:   string;
  email:   string;
  name:    string;
  savedAt: string;
  cart:    CartItem[];
}

interface Props {
  onRestore:  (data: AbandonedCartData) => void;
  className?: string;
}

function timeAgo(iso: string): string {
  const diff    = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60_000);
  const hours   = Math.floor(minutes / 60);
  const days    = Math.floor(hours / 24);
  if (days   > 0) return `${days} dia${days > 1 ? 's' : ''} atrás`;
  if (hours  > 0) return `${hours}h atrás`;
  if (minutes > 0) return `${minutes} min atrás`;
  return 'agora mesmo';
}

function formatBRL(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function AbandonedCartBanner({ onRestore, className = '' }: Props) {
  const [data,    setData]    = useState<AbandonedCartData | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Check dismiss cooldown (ponto 4)
    try {
      const dismissed = localStorage.getItem(LS_DISMISS_KEY);
      if (dismissed && new Date(dismissed) > new Date()) return;
    } catch { /* ignore */ }

    // Load saved cart
    try {
      const raw = localStorage.getItem(LS_CART_KEY);
      if (!raw) return;
      const parsed: AbandonedCartData = JSON.parse(raw);

      const age = Date.now() - new Date(parsed.savedAt).getTime();
      const TTL = 7 * 24 * 60 * 60 * 1000; // 7 days

      if (age < TTL && parsed.cart?.length > 0) {
        setData(parsed);
        setVisible(true);
      } else {
        localStorage.removeItem(LS_CART_KEY);
      }
    } catch {
      localStorage.removeItem(LS_CART_KEY);
    }
  }, []);

  const handleRestore = () => {
    if (!data) return;
    onRestore(data);
    setVisible(false);
  };

  const handleDismiss = () => {
    // Suppress for 7 days (ponto 4)
    const until = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    localStorage.setItem(LS_DISMISS_KEY, until);
    localStorage.removeItem(LS_CART_KEY);
    setVisible(false);
  };

  if (!visible || !data) return null;

  const total = data.cart.reduce((s, i) => s + i.unitPrice * i.qty, 0);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: -12, scale: 0.98 }}
          animate={{ opacity: 1, y: 0,   scale: 1    }}
          exit   ={{ opacity: 0, y: -12, scale: 0.98 }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
          className={`bg-amber-50 border border-amber-200 rounded-2xl p-4 sm:p-5 shadow-sm ${className}`}
        >
          <div className="flex items-start gap-4">
            {/* Icon */}
            <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center flex-shrink-0 mt-0.5">
              <ShoppingBag className="w-5 h-5 text-amber-600" />
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <p className="text-[13px] font-bold text-amber-900">
                  Você tem um carrinho salvo!
                </p>
                <span className="hidden sm:flex items-center gap-1 text-[11px] text-amber-600 font-medium">
                  <Clock className="w-3 h-3" /> {timeAgo(data.savedAt)}
                </span>
              </div>

              {/* Items preview */}
              <p className="text-[12px] text-amber-700 font-medium mb-2">
                {data.cart.length} item(ns) · {formatBRL(total)}
              </p>
              <div className="flex flex-wrap gap-1 mb-3">
                {data.cart.slice(0, 3).map(item => (
                  <span
                    key={item.sku}
                    className="inline-block bg-amber-100 text-amber-800 text-[10px] font-bold px-2 py-0.5 rounded-full max-w-[180px] truncate"
                  >
                    {item.name}
                  </span>
                ))}
                {data.cart.length > 3 && (
                  <span className="inline-block bg-amber-100 text-amber-600 text-[10px] font-bold px-2 py-0.5 rounded-full">
                    +{data.cart.length - 3} mais
                  </span>
                )}
              </div>

              {/* Price revalidation notice (ponto 2) */}
              <div className="flex items-center gap-1.5 mb-3 text-[11px] text-amber-600 font-medium">
                <AlertTriangle className="w-3 h-3 flex-shrink-0" />
                <span>Preços e estoque serão verificados ao restaurar</span>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2">
                <button
                  onClick={handleRestore}
                  className="flex items-center gap-1.5 bg-amber-600 hover:bg-amber-700 text-white text-[12px] font-bold px-3.5 py-1.5 rounded-lg transition-colors"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Restaurar carrinho
                </button>
                <button
                  onClick={handleDismiss}
                  className="text-[12px] font-medium text-amber-600 hover:text-amber-800 transition-colors px-1"
                >
                  Ignorar
                </button>
              </div>
            </div>

            {/* Close */}
            <button
              onClick={handleDismiss}
              className="p-1 rounded-lg hover:bg-amber-100 transition-colors flex-shrink-0 text-amber-400 hover:text-amber-700"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
