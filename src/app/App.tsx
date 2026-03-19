// ─── Toyoparts E-commerce — Root Entry Point ─────────────────────────────────
// Uses React Router Data Mode (createBrowserRouter + RouterProvider).
// v3 — lazy routes + ErrorBoundary for stability

import React, { Suspense, useEffect, Component } from 'react';
import type { ReactNode } from 'react';
import { RouterProvider } from 'react-router';
import { HelmetProvider } from 'react-helmet-async';
import { router } from './routes';
import { initAnalytics } from './lib/analytics';
import { CartProvider } from './lib/cart/cart-store';
import { registerServiceWorker } from './lib/sw-register';

// ─── Global Loading Fallback ─────────────────────────────────────────────────

function GlobalLoader() {
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-4">
        <div className="w-10 h-10 border-3 border-primary/20 border-t-primary rounded-full animate-spin" />
        <p className="text-sm text-muted-foreground font-medium">Carregando...</p>
      </div>
    </div>
  );
}

// ─── Error Boundary ──────────────────────────────────────────────────────────

interface EBProps { children: ReactNode }
interface EBState { hasError: boolean; error: Error | null }

class ErrorBoundary extends Component<EBProps, EBState> {
  constructor(props: EBProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): EBState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[Toyoparts ErrorBoundary]', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-background p-6">
          <div className="max-w-md w-full bg-card rounded-xl border border-border shadow-sm p-8 text-center">
            <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-destructive" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
              </svg>
            </div>
            <h2 className="text-lg font-semibold text-foreground mb-2">Algo deu errado</h2>
            <p className="text-sm text-muted-foreground mb-4">
              {this.state.error?.message || 'Erro inesperado ao carregar a página.'}
            </p>
            <button
              onClick={() => { this.setState({ hasError: false, error: null }); window.location.href = '/'; }}
              className="inline-flex items-center justify-center rounded-lg bg-primary text-primary-foreground px-5 py-2.5 text-sm font-medium hover:bg-primary/90 transition-colors cursor-pointer"
            >
              Voltar ao início
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// ─── App ─────────────────────────────────────────────────────────────────────

export default function App() {
  useEffect(() => {
    initAnalytics();
    // Register Service Worker for offline caching (non-blocking)
    registerServiceWorker().then(reg => {
      if (reg) console.log('[App] Service Worker registered');
    });
  }, []);

  return (
    <ErrorBoundary>
      <HelmetProvider>
        <CartProvider>
          <Suspense fallback={<GlobalLoader />}>
            <RouterProvider router={router} />
          </Suspense>
        </CartProvider>
      </HelmetProvider>
    </ErrorBoundary>
  );
}