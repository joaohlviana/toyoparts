// ─── Root Layout (Store) ─────────────────────────────────────────────────────
// Wraps all store pages with MegaMenu, VehicleMenuBar, Footer, etc.

import React, { useState, useCallback, useMemo, Suspense, useEffect } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router';
import { Toaster } from 'sonner';
import { motion, AnimatePresence } from 'motion/react';
import { MegaMenu } from './MegaMenu';
import { VehicleMenuBar } from './VehicleMenuBar';
import { Footer } from './layout/Footer';
import { CompatibilityBanner } from './CompatibilityBanner';
import { BottomNavigation } from './layout/BottomNavigation';
import { Skeleton } from './ui/skeleton';
import { useCart } from '../lib/cart/cart-store';
import { CartDrawer } from './cart/CartDrawer';

// ─── Page loading fallback ───────────────────────────────────────────────────
function PageLoader() {
  return (
    <div className="min-h-[60vh] animate-in fade-in duration-300">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10 space-y-8">
        <div className="space-y-3">
          <Skeleton className="h-4 w-28 rounded-full bg-primary/10" />
          <Skeleton className="h-10 w-full max-w-2xl rounded-2xl" />
          <Skeleton className="h-5 w-full max-w-xl" />
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-5">
          {[...Array(8)].map((_, index) => (
            <div key={index} className="rounded-2xl border border-border/50 bg-card/60 overflow-hidden">
              <Skeleton className="aspect-square w-full rounded-none" />
              <div className="p-4 space-y-3">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-4 w-[85%]" />
                <Skeleton className="h-4 w-[60%]" />
                <Skeleton className="h-9 w-full rounded-xl bg-primary/10" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Inner component that uses cart context
function RootLayoutInner() {
  const navigate = useNavigate();
  const location = useLocation();
  const { open: cartOpen, setOpen: setCartOpen } = useCart();
  const [mobileDeptOpen, setMobileDeptOpen] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);

  // Scroll to top on every route change
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  }, [location.pathname]);

  const handleCategorySelect = useCallback((categoryId: string, name: string) => {
    navigate(`/busca?category=${encodeURIComponent(categoryId)}&category_name=${encodeURIComponent(name)}`);
  }, [navigate]);

  const handleModeloSelect = useCallback((_modeloId: string, name: string) => {
    const slug = name.toLowerCase().replace(/\s+/g, '-');
    navigate(`/pecas/${slug}`);
  }, [navigate]);

  const handleSearchSubmit = useCallback((query: string, aiMode?: boolean) => {
    const params = new URLSearchParams({ q: query });
    if (aiMode) params.set('mode', 'ai');
    navigate(`/busca?${params.toString()}`);
  }, [navigate]);

  const handleProductSelect = useCallback((sku: string, name: string) => {
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    navigate(`/produto/${encodeURIComponent(sku)}/${slug}`);
  }, [navigate]);

  const handleNavigate = useCallback((page: string) => {
    if (page === 'home') navigate('/');
    else if (page === 'search') navigate('/busca');
    else if (page === 'search-overlay') setMobileSearchOpen(true);
    else if (page === 'admin' || page === 'sync') navigate('/admin');
    else if (page === 'account') navigate('/minha-conta/pedidos');
    else if (page === 'products') navigate('/pecas');
    else if (page === 'departments') setMobileDeptOpen(true);
    else if (page === 'cart') setCartOpen(true);
    else if (page === 'atendimento') window.open('https://wa.me/554332941144', '_blank');
    else navigate('/');
  }, [navigate, setCartOpen]);

  const handleCartOpen = useCallback(() => setCartOpen(true), [setCartOpen]);

  const currentPage = useMemo(() => {
    if (location.pathname === '/') return 'home' as const;
    if (location.pathname.startsWith('/busca')) return 'search' as const;
    if (location.pathname.startsWith('/pecas')) return 'search' as const;
    if (location.pathname.startsWith('/produto')) return 'search' as const;
    return 'search' as const;
  }, [location.pathname]);

  return (
    <div className="min-h-screen bg-background font-sans antialiased">
      <Toaster position="top-right" theme="light" closeButton richColors />
      <MegaMenu
        currentPage={currentPage as any}
        onNavigate={handleNavigate}
        onCategorySelect={handleCategorySelect}
        onModeloSelect={handleModeloSelect}
        onSearchSubmit={handleSearchSubmit}
        onProductSelect={handleProductSelect}
        onCartClick={handleCartOpen}
        mobileDeptOpen={mobileDeptOpen}
        onMobileDeptToggle={setMobileDeptOpen}
        mobileSearchOpen={mobileSearchOpen}
        onMobileSearchToggle={setMobileSearchOpen}
      />
      <VehicleMenuBar />
      <main className="overflow-x-hidden min-h-[calc(100vh-64px)] pb-24 lg:pb-0 relative">
        <Suspense fallback={<PageLoader />}>
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, scale: 0.985 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.015 }}
              transition={{ duration: 0.35, ease: [0.32, 0.72, 0, 1] }}
              className="w-full"
            >
              <Outlet />
            </motion.div>
          </AnimatePresence>
        </Suspense>
      </main>
      <CompatibilityBanner />
      <Footer />
      {!location.pathname.startsWith('/produto') && (
        <BottomNavigation
          onNavigate={handleNavigate}
          activePage={currentPage as any}
        />
      )}
      <CartDrawer open={cartOpen} onClose={() => setCartOpen(false)} />
    </div>
  );
}

// Outer component
export function RootLayout() {
  return (
    <RootLayoutInner />
  );
}
