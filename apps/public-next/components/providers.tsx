'use client';

import { CartProvider } from '@/lib/cart-store';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <CartProvider>
      {children}
    </CartProvider>
  );
}
