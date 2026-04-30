// ─── Toyoparts E-commerce — Root Entry Point ─────────────────────────────────
// Uses React Router Data Mode (createBrowserRouter + RouterProvider).
// v3 — lazy routes + ErrorBoundary for stability

import React, { Suspense, useEffect, Component } from 'react';
import type { ReactNode } from 'react';
import { RouterProvider } from 'react-router';
import { Helmet, HelmetProvider } from 'react-helmet-async';
import { router } from './routes';
import { initAnalytics } from './lib/analytics';
import { CartProvider } from './lib/cart/cart-store';
import { registerServiceWorker } from './lib/sw-register';
import { TOYOPARTS_DEFAULT_WHATSAPP_URL } from './lib/whatsapp';

const SITE_MAINTENANCE_MODE = false;

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

function MaintenancePage() {
  return (
    <>
      <Helmet>
        <title>Site em manutencao | Toyoparts</title>
        <meta name="robots" content="noindex,nofollow" />
      </Helmet>

      <div className="min-h-screen bg-[#f6f4f1] px-6 py-10 text-[#1f2937]">
        <div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-5xl items-center justify-center">
          <div className="w-full overflow-hidden rounded-[32px] border border-black/5 bg-white shadow-[0_30px_90px_rgba(15,23,42,0.08)]">
            <div className="grid gap-0 lg:grid-cols-[1.05fr_0.95fr]">
              <div className="relative overflow-hidden bg-[#f4efe7] px-8 py-12 sm:px-12 lg:px-14">
                <div className="absolute inset-x-0 top-0 h-1.5 bg-[#EB0A1E]" />
                <div className="relative z-10 max-w-xl space-y-8">
                  <div className="inline-flex items-center rounded-full border border-[#EB0A1E]/15 bg-[#fff5f5] px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-[#b91c1c]">
                    Toyoparts
                  </div>

                  <div className="space-y-4">
                    <h1 className="max-w-lg text-4xl font-bold leading-tight text-[#111827] sm:text-5xl">
                      Site em manutencao
                    </h1>
                    <p className="max-w-lg text-base leading-7 text-[#4b5563] sm:text-lg">
                      Estamos realizando ajustes importantes para voltar com uma experiencia mais estavel.
                      Em breve a loja estara disponivel novamente.
                    </p>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="rounded-2xl border border-black/5 bg-white/80 p-5 backdrop-blur">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#9ca3af]">Atendimento</p>
                      <p className="mt-2 text-lg font-semibold text-[#111827]">WhatsApp</p>
                      <a
                        href={TOYOPARTS_DEFAULT_WHATSAPP_URL}
                        className="mt-2 inline-block text-sm font-medium text-[#EB0A1E] hover:underline"
                      >
                        +55 43 3294-1144
                      </a>
                    </div>

                    <div className="rounded-2xl border border-black/5 bg-white/80 p-5 backdrop-blur">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#9ca3af]">Contato</p>
                      <p className="mt-2 text-lg font-semibold text-[#111827]">E-mail</p>
                      <a
                        href="mailto:atendimento@toyoparts.com.br"
                        className="mt-2 inline-block text-sm font-medium text-[#EB0A1E] hover:underline"
                      >
                        atendimento@toyoparts.com.br
                      </a>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex items-center bg-[#111827] px-8 py-10 text-white sm:px-12 lg:px-14">
                <div className="w-full space-y-6">
                  <div className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-white/70">
                    Manutencao programada
                  </div>

                  <div className="space-y-3">
                    <p className="text-2xl font-semibold sm:text-3xl">
                      Estamos preparando a proxima versao da Toyoparts.
                    </p>
                    <p className="max-w-md text-sm leading-7 text-white/70 sm:text-base">
                      Durante esse periodo, a navegacao, o login e o checkout ficam temporariamente pausados.
                      Se precisar de suporte imediato, fale com a nossa equipe.
                    </p>
                  </div>

                  <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
                    <p className="text-sm font-medium text-white">Canais disponiveis durante a manutencao</p>
                    <ul className="mt-4 space-y-3 text-sm text-white/75">
                      <li>Suporte e fechamento via WhatsApp</li>
                      <li>Atendimento por e-mail</li>
                      <li>Retorno assim que a loja reabrir</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
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
    if (SITE_MAINTENANCE_MODE) {
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistrations()
          .then((registrations) => Promise.all(registrations.map((registration) => registration.unregister())))
          .catch(() => undefined);
      }

      if ('caches' in window) {
        caches.keys()
          .then((keys) => Promise.all(keys.map((key) => caches.delete(key))))
          .catch(() => undefined);
      }

      return;
    }

    initAnalytics();
    registerServiceWorker().then(reg => {
      if (reg) console.log('[App] Service Worker registered');
    });
  }, []);

  return (
    <ErrorBoundary>
      <HelmetProvider>
        {SITE_MAINTENANCE_MODE ? (
          <MaintenancePage />
        ) : (
          <CartProvider>
            <Suspense fallback={<GlobalLoader />}>
              <RouterProvider router={router} />
            </Suspense>
          </CartProvider>
        )}
      </HelmetProvider>
    </ErrorBoundary>
  );
}
