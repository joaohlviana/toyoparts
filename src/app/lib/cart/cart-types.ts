// ─── Cart Domain Types ──────────────────────────────────────────────────────

export interface CartItem {
  sku: string;
  name: string;
  unitPrice: number;         // active price (special_price or price)
  originalPrice: number;     // original price (always the full price)
  qty: number;
  imageUrl?: string;
  urlKey?: string;
  weight?: number | null;
  inStock: boolean;
}

export interface CartState {
  items: CartItem[];
  version: number;
}

export interface ShippingOption {
  id: string;
  name: string;
  carrier: string;
  price: number;
  estimatedDays: number;
}

export interface CartTotals {
  subtotal: number;
  itemCount: number;
  totalQty: number;
  shipping: number | null;      // null = not calculated yet
  total: number;                // subtotal + (shipping || 0)
}

// ─── Cart Actions ────────────────────────────────────────────────────────────

export type CartAction =
  | { type: 'ADD_ITEM'; item: Omit<CartItem, 'qty'>; qty?: number }
  | { type: 'REMOVE_ITEM'; sku: string }
  | { type: 'SET_QTY'; sku: string; qty: number }
  | { type: 'INCREMENT'; sku: string }
  | { type: 'DECREMENT'; sku: string }
  | { type: 'CLEAR' }
  | { type: 'HYDRATE'; state: CartState };
