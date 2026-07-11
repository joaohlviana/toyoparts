'use client';

import React, { createContext, useContext, useEffect, useMemo, useReducer } from 'react';

const STORAGE_KEY = 'toyoparts_cart_v1';

export interface CartItem {
  sku: string;
  name: string;
  unitPrice: number;
  originalPrice: number;
  qty: number;
  imageUrl?: string;
  urlKey?: string;
  weight?: number | null;
  inStock: boolean;
}

interface CartState {
  items: CartItem[];
  version: number;
}

const INITIAL: CartState = { items: [], version: 1 };

type CartAction =
  | { type: 'ADD_ITEM'; item: Omit<CartItem, 'qty'>; qty?: number }
  | { type: 'REMOVE_ITEM'; sku: string }
  | { type: 'SET_QTY'; sku: string; qty: number }
  | { type: 'INCREMENT'; sku: string }
  | { type: 'DECREMENT'; sku: string }
  | { type: 'CLEAR' }
  | { type: 'HYDRATE'; state: CartState };

function cartReducer(state: CartState, action: CartAction): CartState {
  switch (action.type) {
    case 'ADD_ITEM': {
      const existing = state.items.find((item) => item.sku === action.item.sku);
      const addQty = action.qty ?? 1;
      if (existing) {
        return {
          ...state,
          items: state.items.map((item) =>
            item.sku === action.item.sku ? { ...item, qty: item.qty + addQty } : item
          ),
        };
      }
      return { ...state, items: [...state.items, { ...action.item, qty: addQty }] };
    }
    case 'REMOVE_ITEM':
      return { ...state, items: state.items.filter((item) => item.sku !== action.sku) };
    case 'SET_QTY':
      return {
        ...state,
        items: state.items
          .map((item) => (item.sku === action.sku ? { ...item, qty: action.qty } : item))
          .filter((item) => item.qty > 0),
      };
    case 'INCREMENT':
      return {
        ...state,
        items: state.items.map((item) =>
          item.sku === action.sku ? { ...item, qty: item.qty + 1 } : item
        ),
      };
    case 'DECREMENT':
      return {
        ...state,
        items: state.items
          .map((item) => (item.sku === action.sku ? { ...item, qty: item.qty - 1 } : item))
          .filter((item) => item.qty > 0),
      };
    case 'CLEAR':
      return INITIAL;
    case 'HYDRATE':
      return action.state;
    default:
      return state;
  }
}

interface CartContextValue {
  items: CartItem[];
  totals: { subtotal: number; itemCount: number; totalQty: number; total: number };
  addItem: (item: Omit<CartItem, 'qty'>, qty?: number) => void;
  removeItem: (sku: string) => void;
  increment: (sku: string) => void;
  decrement: (sku: string) => void;
  setQty: (sku: string, qty: number) => void;
  clearCart: () => void;
  open: boolean;
  setOpen: (open: boolean) => void;
}

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(cartReducer, INITIAL);
  const [open, setOpen] = React.useState(false);
  const [hydrated, setHydrated] = React.useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as CartState;
        if (parsed.version === INITIAL.version && Array.isArray(parsed.items)) {
          dispatch({ type: 'HYDRATE', state: parsed });
        }
      }
    } catch {
      // silent hydration fallback
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state, hydrated]);

  const totals = useMemo(() => {
    const subtotal = state.items.reduce((sum, item) => sum + item.unitPrice * item.qty, 0);
    const totalQty = state.items.reduce((sum, item) => sum + item.qty, 0);
    return {
      subtotal,
      itemCount: state.items.length,
      totalQty,
      total: subtotal,
    };
  }, [state.items]);

  const value = useMemo<CartContextValue>(
    () => ({
      items: state.items,
      totals,
      addItem: (item, qty) => dispatch({ type: 'ADD_ITEM', item, qty }),
      removeItem: (sku) => dispatch({ type: 'REMOVE_ITEM', sku }),
      increment: (sku) => dispatch({ type: 'INCREMENT', sku }),
      decrement: (sku) => dispatch({ type: 'DECREMENT', sku }),
      setQty: (sku, qty) => dispatch({ type: 'SET_QTY', sku, qty }),
      clearCart: () => dispatch({ type: 'CLEAR' }),
      open,
      setOpen,
    }),
    [open, state.items, totals]
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error('useCart must be used within CartProvider');
  }
  return context;
}
