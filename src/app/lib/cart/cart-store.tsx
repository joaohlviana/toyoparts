// ─── Cart Context + Provider ────────────────────────────────────────────────
// Centralised cart state with localStorage persistence (versioned key).

import React, { createContext, useContext, useReducer, useEffect, useCallback, useMemo } from 'react';
import type { CartItem, CartState, CartAction, CartTotals, ShippingOption } from './cart-types';

const STORAGE_KEY = 'toyoparts_cart_v1';
const INITIAL: CartState = { items: [], version: 1 };

// ─── Reducer ─────────────────────────────────────────────────────────────────

function cartReducer(state: CartState, action: CartAction): CartState {
  switch (action.type) {
    case 'ADD_ITEM': {
      const existing = state.items.find(i => i.sku === action.item.sku);
      const addQty = action.qty ?? 1;
      if (existing) {
        return {
          ...state,
          items: state.items.map(i =>
            i.sku === action.item.sku ? { ...i, qty: i.qty + addQty } : i
          ),
        };
      }
      return {
        ...state,
        items: [...state.items, { ...action.item, qty: addQty }],
      };
    }
    case 'REMOVE_ITEM':
      return { ...state, items: state.items.filter(i => i.sku !== action.sku) };
    case 'SET_QTY':
      if (action.qty <= 0) return { ...state, items: state.items.filter(i => i.sku !== action.sku) };
      return {
        ...state,
        items: state.items.map(i =>
          i.sku === action.sku ? { ...i, qty: action.qty } : i
        ),
      };
    case 'INCREMENT':
      return {
        ...state,
        items: state.items.map(i =>
          i.sku === action.sku ? { ...i, qty: i.qty + 1 } : i
        ),
      };
    case 'DECREMENT':
      return {
        ...state,
        items: state.items
          .map(i => (i.sku === action.sku ? { ...i, qty: i.qty - 1 } : i))
          .filter(i => i.qty > 0),
      };
    case 'CLEAR':
      return INITIAL;
    case 'HYDRATE':
      return action.state;
    default:
      return state;
  }
}

// ─── Context ─────────────────────────────────────────────────────────────────

interface CartContextValue {
  items: CartItem[];
  totals: CartTotals;
  shipping: ShippingOption | null;
  setShipping: (opt: ShippingOption | null) => void;
  addItem: (item: Omit<CartItem, 'qty'>, qty?: number) => void;
  removeItem: (sku: string) => void;
  setQty: (sku: string, qty: number) => void;
  increment: (sku: string) => void;
  decrement: (sku: string) => void;
  clearCart: () => void;
  isInCart: (sku: string) => boolean;
  getItemQty: (sku: string) => number;
  open: boolean;
  setOpen: (open: boolean) => void;
}

const CartContext = createContext<CartContextValue | null>(null);

// ─── Provider ────────────────────────────────────────────────────────────────

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(cartReducer, INITIAL);
  const [shipping, setShipping] = React.useState<ShippingOption | null>(null);
  const [open, setOpen] = React.useState(false);
  const [hydrated, setHydrated] = React.useState(false);

  // Hydrate from localStorage on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed: CartState = JSON.parse(raw);
        if (parsed.version === INITIAL.version && Array.isArray(parsed.items)) {
          dispatch({ type: 'HYDRATE', state: parsed });
        }
      }
    } catch (e) {
      console.warn('[Cart] Failed to hydrate from localStorage:', e);
    }
    setHydrated(true);
  }, []);

  // Persist to localStorage on every change (skip initial mount)
  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      console.warn('[Cart] Failed to persist to localStorage:', e);
    }
  }, [state, hydrated]);

  // ── Actions ──
  const addItem = useCallback(
    (item: Omit<CartItem, 'qty'>, qty?: number) => dispatch({ type: 'ADD_ITEM', item, qty }),
    [],
  );
  const removeItem = useCallback((sku: string) => dispatch({ type: 'REMOVE_ITEM', sku }), []);
  const setQty = useCallback((sku: string, qty: number) => dispatch({ type: 'SET_QTY', sku, qty }), []);
  const increment = useCallback((sku: string) => dispatch({ type: 'INCREMENT', sku }), []);
  const decrement = useCallback((sku: string) => dispatch({ type: 'DECREMENT', sku }), []);
  const clearCart = useCallback(() => {
    dispatch({ type: 'CLEAR' });
    setShipping(null);
  }, []);

  const isInCart = useCallback((sku: string) => state.items.some(i => i.sku === sku), [state.items]);
  const getItemQty = useCallback(
    (sku: string) => state.items.find(i => i.sku === sku)?.qty ?? 0,
    [state.items],
  );

  // ── Totals ──
  const totals = useMemo<CartTotals>(() => {
    const subtotal = state.items.reduce((s, i) => s + i.unitPrice * i.qty, 0);
    const totalQty = state.items.reduce((s, i) => s + i.qty, 0);
    const shippingValue = shipping?.price ?? null;
    return {
      subtotal,
      itemCount: state.items.length,
      totalQty,
      shipping: shippingValue,
      total: subtotal + (shippingValue ?? 0),
    };
  }, [state.items, shipping]);

  const value = useMemo<CartContextValue>(
    () => ({
      items: state.items,
      totals,
      shipping,
      setShipping,
      addItem,
      removeItem,
      setQty,
      increment,
      decrement,
      clearCart,
      isInCart,
      getItemQty,
      open,
      setOpen,
    }),
    [state.items, totals, shipping, addItem, removeItem, setQty, increment, decrement, clearCart, isInCart, getItemQty, open],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used inside <CartProvider>');
  return ctx;
}
