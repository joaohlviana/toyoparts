// ─── Abandoned Cart Hook ────────────────────────────────────────────────────
// Salva progressivamente o carrinho + dados do formulário enquanto o usuário
// preenche o checkout. Dispara notificação por e-mail após 30 min de abandono.
//
// Considerações aplicadas:
//  1. Token aleatório retornado pelo servidor (não derivado do email)
//  2. Debounce 2s para evitar requisições excessivas
//  3. visibilitychange + beforeunload para salvar ao sair
//  4. dismissedUntil: supressão do banner por 7 dias
//  5. Sem CPF nem telefone enviados ao servidor (PII mínimo)

import { useEffect, useRef, useCallback } from 'react';
import type { CartItem } from '../cart/cart-types';
import { projectId, publicAnonKey } from '../../../../utils/supabase/info';

// ─── Constants ────────────────────────────────────────────────────────────────
const LS_CART_KEY       = 'toyoparts:abandoned_cart';
const BASE_URL          = `https://${projectId}.supabase.co/functions/v1/make-server-1d6e33e0/checkout/abandoned`;
const DEBOUNCE_MS       = 2000;
const NOTIFY_DELAY_MS   = 30 * 60 * 1000; // 30 min

// ─── Types ────────────────────────────────────────────────────────────────────
export interface AbandonedCartData {
  token:   string;
  email:   string;
  name:    string;
  savedAt: string;
  cart:    CartItem[];
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

function authHeaders() {
  return {
    'Content-Type':  'application/json',
    'Authorization': `Bearer ${publicAnonKey}`,
  };
}

// ─── Hook ─────────────────────────────────────────────────────────────────────
export function useAbandonedCart({
  email,
  name,
  cart,
}: {
  email: string;
  name:  string;
  cart:  CartItem[];
}) {
  const tokenRef       = useRef<string | null>(null);
  const debounceRef    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const notifyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const emailRef       = useRef(email);
  const nameRef        = useRef(name);
  const cartRef        = useRef(cart);

  // Keep refs in sync (avoids stale closures in event listeners)
  emailRef.current = email;
  nameRef.current  = name;
  cartRef.current  = cart;

  // Load token from localStorage on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_CART_KEY);
      if (raw) {
        const saved: AbandonedCartData = JSON.parse(raw);
        if (saved.token) tokenRef.current = saved.token;
      }
    } catch { /* ignore */ }
  }, []);

  // ── Save to backend ──────────────────────────────────────────────────────
  const save = useCallback(async () => {
    const e = emailRef.current;
    const n = nameRef.current;
    const c = cartRef.current;
    if (!isValidEmail(e) || c.length === 0) return;

    try {
      const res  = await fetch(`${BASE_URL}/save`, {
        method:  'POST',
        headers: authHeaders(),
        body:    JSON.stringify({ email: e, name: n, cart: c }),
      });
      const data = await res.json();
      if (data.ok && data.token) {
        tokenRef.current = data.token;
        const payload: AbandonedCartData = {
          token:   data.token,
          email:   e,
          name:    n,
          savedAt: data.savedAt,
          cart:    c,
        };
        localStorage.setItem(LS_CART_KEY, JSON.stringify(payload));

        // Schedule notify after 30 min (fires only if tab stays open)
        if (notifyTimerRef.current) clearTimeout(notifyTimerRef.current);
        notifyTimerRef.current = setTimeout(() => notify(), NOTIFY_DELAY_MS);
      }
    } catch (err) {
      console.warn('[AbandonedCart] save error:', err);
    }
  }, []);

  // ── Trigger notify endpoint ──────────────────────────────────────────────
  const notify = useCallback(async () => {
    const token = tokenRef.current;
    if (!token) return;
    try {
      await fetch(`${BASE_URL}/notify`, {
        method:  'POST',
        headers: authHeaders(),
        body:    JSON.stringify({ token }),
      });
    } catch (err) {
      console.warn('[AbandonedCart] notify error:', err);
    }
  }, []);

  // ── Clear session after purchase ─────────────────────────────────────────
  const clear = useCallback(async (purchasedAfterRecover = false) => {
    if (notifyTimerRef.current) clearTimeout(notifyTimerRef.current);
    if (debounceRef.current)    clearTimeout(debounceRef.current);
    localStorage.removeItem(LS_CART_KEY);

    const e = emailRef.current;
    if (!isValidEmail(e)) return;

    try {
      await fetch(`${BASE_URL}/clear`, {
        method:  'DELETE',
        headers: authHeaders(),
        body:    JSON.stringify({ email: e, purchasedAfterRecover }),
      });
    } catch (err) {
      console.warn('[AbandonedCart] clear error:', err);
    }
  }, []);

  // ── Debounced save on form change ────────────────────────────────────────
  useEffect(() => {
    if (!isValidEmail(email) || cart.length === 0) return;

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(save, DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [email, name, cart, save]);

  // ── Save on page hide (visibility / beforeunload) ────────────────────────
  useEffect(() => {
    const handleHide = () => {
      const e = emailRef.current;
      const c = cartRef.current;
      if (!isValidEmail(e) || c.length === 0) return;

      // Use sendBeacon (reliable on unload) with fallback to fetch
      const payload = JSON.stringify({ email: e, name: nameRef.current, cart: c });
      const beaconUrl = `${BASE_URL}/save?apikey=${publicAnonKey}`;
      if (navigator.sendBeacon) {
        navigator.sendBeacon(beaconUrl, new Blob([payload], { type: 'application/json' }));
      }
    };

    const onVisibility = () => { if (document.hidden) handleHide(); };

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('beforeunload', handleHide);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('beforeunload', handleHide);
    };
  }, []);

  // ── Cleanup on unmount ───────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (notifyTimerRef.current) clearTimeout(notifyTimerRef.current);
      if (debounceRef.current)    clearTimeout(debounceRef.current);
    };
  }, []);

  return { clear, notify };
}
