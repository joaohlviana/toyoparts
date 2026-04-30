// ─── Root Layout (Store) ─────────────────────────────────────────────────────
// Wraps all store pages with MegaMenu, VehicleMenuBar, Footer, etc.

import React, { useState, useCallback, useMemo, Suspense, useEffect } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router';
import { Toaster } from 'sonner';
import { motion, AnimatePresence } from 'motion/react';
import { AlertCircle, CheckCircle2, Loader2, Phone, ShieldCheck } from 'lucide-react';
import { MegaMenu } from './MegaMenu';
import { VehicleMenuBar } from './VehicleMenuBar';
import { Footer } from './layout/Footer';
import { CompatibilityBanner } from './CompatibilityBanner';
import { BottomNavigation } from './layout/BottomNavigation';
import { Skeleton } from './ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { useCart } from '../lib/cart/cart-store';
import { CartDrawer } from './cart/CartDrawer';
import { trackPageView, trackWhatsappBannerLead } from '../lib/analytics';
import { buildToyopartsWhatsAppUrl, normalizeToyopartsContactLinks } from '../lib/whatsapp';
import { projectId, publicAnonKey } from '../../../utils/supabase/info';

const CONTACT_API = `https://${projectId}.supabase.co/functions/v1/make-server-1d6e33e0/contact-leads`;
const EXIT_INTENT_SESSION_KEY = 'toyoparts_exit_intent_shown_v1';

function decodePathPart(value?: string) {
  const safe = String(value || '').trim();
  if (!safe) return '';
  try {
    return decodeURIComponent(safe).replace(/-/g, ' ').trim();
  } catch {
    return safe.replace(/-/g, ' ').trim();
  }
}

function buildDesktopWhatsappContext(pathname: string, search: string) {
  const params = new URLSearchParams(search);
  const query = String(params.get('q') || '').trim();
  const pathWithSearch = `${pathname}${search || ''}`;

  if (pathname === '/') {
    return {
      pageType: 'home',
      href: buildToyopartsWhatsAppUrl(
        'Ol\u00e1, Toyoparts. Preciso de ajuda para encontrar uma pe\u00e7a',
      ),
    };
  }

  if (pathname.startsWith('/produto/')) {
    const segments = pathname.split('/');
    const sku = decodePathPart(segments[2]);
    const productName = decodePathPart(segments[3]);
    const productContext = [productName, sku ? `SKU ${sku}` : ''].filter(Boolean).join(' - ');
    return {
      pageType: 'product',
      href: buildToyopartsWhatsAppUrl(
        `Estou vendo este produto e preciso de suporte t\u00e9cnico: ${productContext || 'produto Toyota'}.\nP\u00e1gina: ${pathWithSearch}`,
      ),
    };
  }

  if (pathname.startsWith('/busca')) {
    return {
      pageType: 'search',
      href: buildToyopartsWhatsAppUrl(
        query
          ? `Busquei por "${query}" e preciso de ajuda para encontrar a pe\u00e7a correta.\nP\u00e1gina: ${pathWithSearch}`
          : `Estou na busca e preciso de ajuda para encontrar uma pe\u00e7a Toyota.\nP\u00e1gina: ${pathWithSearch}`,
      ),
    };
  }

  if (pathname.startsWith('/pecas/')) {
    const segments = pathname.split('/');
    const modelo = decodePathPart(segments[2]);
    const categoria = decodePathPart(segments[3]);
    const parts = [modelo ? `modelo ${modelo}` : '', categoria ? `categoria ${categoria}` : ''].filter(Boolean).join(' / ');
    return {
      pageType: 'departments',
      href: buildToyopartsWhatsAppUrl(
        `Estou navegando em pe\u00e7as${parts ? ` (${parts})` : ''} e quero ajuda para escolher o item correto.\nP\u00e1gina: ${pathWithSearch}`,
      ),
    };
  }

  if (pathname === '/fale-conosco') {
    return {
      pageType: 'contact',
      href: buildToyopartsWhatsAppUrl(
        `Quero falar com o atendimento para tirar uma d\u00favida sobre pe\u00e7as Toyota.\nP\u00e1gina: ${pathWithSearch}`,
      ),
    };
  }

  return {
    pageType: 'site',
    href: buildToyopartsWhatsAppUrl(
      `Preciso de ajuda com pe\u00e7as Toyota nesta p\u00e1gina.\nP\u00e1gina: ${pathWithSearch}`,
    ),
  };
}

function normalizePhoneBR(value: string) {
  let digits = String(value || '').replace(/\D+/g, '');

  while (digits.startsWith('55') && digits.length > 11) {
    digits = digits.slice(2);
  }

  while (digits.startsWith('0') && digits.length > 11) {
    digits = digits.slice(1);
  }

  if (digits.length > 11) {
    digits = digits.slice(-11);
  }

  return digits;
}

function formatPhoneInputBR(value: string) {
  let digits = String(value || '').replace(/\D+/g, '');

  while (digits.startsWith('55') && digits.length > 11) {
    digits = digits.slice(2);
  }

  while (digits.startsWith('0') && digits.length > 11) {
    digits = digits.slice(1);
  }

  digits = digits.slice(0, 11);

  if (digits.length > 10) {
    return digits.replace(/^(\d{2})(\d{5})(\d{0,4}).*$/, '($1) $2-$3');
  }
  if (digits.length > 6) {
    return digits.replace(/^(\d{2})(\d{4})(\d{0,4}).*$/, '($1) $2-$3');
  }
  if (digits.length > 2) {
    return digits.replace(/^(\d{2})(\d{0,5}).*$/, '($1) $2');
  }
  if (digits.length > 0) {
    return digits.replace(/^(\d*)$/, '($1');
  }

  return '';
}

function WhatsAppIconSvg({ className = '' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12.04 2C6.49 2 2 6.39 2 11.8c0 2.1.7 4.06 1.9 5.66L2 22l4.74-1.54a10.2 10.2 0 0 0 5.3 1.48h.01C17.6 21.94 22 17.55 22 12.13 22 6.72 17.58 2.33 12.04 2Zm5.9 14.22c-.25.68-1.43 1.29-1.97 1.37-.5.07-1.13.1-1.82-.1-.42-.12-.95-.31-1.64-.6-2.88-1.2-4.75-4.07-4.9-4.27-.15-.2-1.17-1.51-1.17-2.88 0-1.38.72-2.05.98-2.33.26-.28.56-.34.74-.34.19 0 .37 0 .53.01.17 0 .4-.06.62.47.24.58.82 2 .89 2.15.07.15.11.33.02.53-.09.2-.14.33-.29.5-.14.17-.3.39-.43.53-.14.14-.28.3-.12.58.15.29.68 1.12 1.45 1.82.99.88 1.83 1.16 2.12 1.29.29.12.45.1.62-.06.16-.17.69-.8.87-1.07.18-.28.37-.23.62-.14.25.08 1.59.74 1.86.88.27.14.45.2.52.31.06.1.06.62-.2 1.3Z" />
    </svg>
  );
}

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
  const [exitIntentOpen, setExitIntentOpen] = useState(false);
  const [exitIntentPhone, setExitIntentPhone] = useState('');
  const [exitIntentSubmitting, setExitIntentSubmitting] = useState(false);
  const [exitIntentFeedback, setExitIntentFeedback] = useState<{
    tone: 'success' | 'warning';
    message: string;
  } | null>(null);

  // Scroll to top on every route change
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  }, [location.pathname]);

  useEffect(() => {
    trackPageView(`${location.pathname}${location.search}`);
  }, [location.pathname, location.search]);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;

    let frameId = 0;
    const normalizeContacts = () => {
      if (frameId) window.cancelAnimationFrame(frameId);
      frameId = window.requestAnimationFrame(() => {
        normalizeToyopartsContactLinks(document);
      });
    };

    normalizeContacts();

    const observer = new MutationObserver(normalizeContacts);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['href'],
    });

    return () => {
      if (frameId) window.cancelAnimationFrame(frameId);
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (location.pathname.startsWith('/checkout')) return;
    if (sessionStorage.getItem(EXIT_INTENT_SESSION_KEY) === '1') return;

    const isDesktopPointer = window.matchMedia('(min-width: 1024px) and (pointer: fine)').matches;
    if (!isDesktopPointer) return;

    const handleMouseOut = (event: MouseEvent) => {
      if (sessionStorage.getItem(EXIT_INTENT_SESSION_KEY) === '1') return;
      if (event.clientY > 0) return;
      if (event.relatedTarget) return;

      sessionStorage.setItem(EXIT_INTENT_SESSION_KEY, '1');
      setExitIntentFeedback(null);
      setExitIntentOpen(true);
    };

    document.addEventListener('mouseout', handleMouseOut);
    return () => document.removeEventListener('mouseout', handleMouseOut);
  }, [location.pathname]);

  const handleCategorySelect = useCallback((categoryId: string, _name: string) => {
    const params = new URLSearchParams();
    if (!String(categoryId).startsWith('-')) {
      params.set('category', categoryId);
    }
    navigate(`/busca${params.toString() ? `?${params.toString()}` : ''}`);
  }, [navigate]);

  const handleModeloSelect = useCallback((modeloSlug: string, _name: string) => {
    navigate(`/pecas/${modeloSlug}`);
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
    else if (page === 'atendimento') {
      const whatsappContext = buildDesktopWhatsappContext(location.pathname, location.search);
      void trackWhatsappBannerLead({
        source_surface: 'bottom_nav_atendimento',
        banner_id: 'bottom_nav_atendimento',
        page_type: whatsappContext.pageType,
        page_path: `${location.pathname}${location.search}`,
        href: whatsappContext.href,
      });
      window.open(whatsappContext.href, '_blank', 'noopener,noreferrer');
    }
    else navigate('/');
  }, [location.pathname, location.search, navigate, setCartOpen]);

  const handleCartOpen = useCallback(() => setCartOpen(true), [setCartOpen]);

  const currentPage = useMemo(() => {
    if (location.pathname === '/') return 'home' as const;
    if (location.pathname.startsWith('/busca')) return 'search' as const;
    if (location.pathname.startsWith('/pecas')) return 'search' as const;
    if (location.pathname.startsWith('/produto')) return 'search' as const;
    return 'search' as const;
  }, [location.pathname]);

  const desktopWhatsapp = useMemo(
    () => buildDesktopWhatsappContext(location.pathname, location.search),
    [location.pathname, location.search],
  );

  const handleDesktopWhatsappClick = useCallback(() => {
    void trackWhatsappBannerLead({
      source_surface: 'floating_whatsapp_desktop',
      banner_id: 'floating_whatsapp_desktop',
      page_type: desktopWhatsapp.pageType,
      page_path: `${location.pathname}${location.search}`,
      href: desktopWhatsapp.href,
    });
  }, [desktopWhatsapp.href, desktopWhatsapp.pageType, location.pathname, location.search]);

  const handleExitIntentSubmit = useCallback(async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedPhone = normalizePhoneBR(exitIntentPhone);

    if (normalizedPhone.length < 10) {
      setExitIntentFeedback({
        tone: 'warning',
        message: 'Digite um WhatsApp v\u00e1lido com DDD.',
      });
      return;
    }

    setExitIntentSubmitting(true);
    setExitIntentFeedback(null);

    try {
      const response = await fetch(`${CONTACT_API}/submit`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${publicAnonKey}`,
          apikey: publicAnonKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: '',
          email: '',
          phone: normalizedPhone,
          message: 'Lead capturado via modal de sa\u00edda (exit intent).',
          preferredChannel: 'whatsapp',
          pagePath: `${location.pathname}${location.search}`,
        }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(String(data?.error || `HTTP ${response.status}`));
      }

      const syonetStatus = data?.integrations?.syonet?.status;
      setExitIntentFeedback({
        tone: syonetStatus === 'success' ? 'success' : 'warning',
        message: syonetStatus === 'success'
          ? 'Perfeito. Seu contato foi enviado com sucesso.'
          : 'Contato salvo. Se preferir, chame no WhatsApp agora.',
      });
      setExitIntentPhone(formatPhoneInputBR(normalizedPhone));
    } catch (error) {
      console.error('[exit-intent] submit error:', error);
      setExitIntentFeedback({
        tone: 'warning',
        message: 'N\u00e3o foi poss\u00edvel enviar agora. Tente o bot\u00e3o do WhatsApp.',
      });
    } finally {
      setExitIntentSubmitting(false);
    }
  }, [exitIntentPhone, location.pathname, location.search]);

  const handleExitIntentConsultant = useCallback(() => {
    void trackWhatsappBannerLead({
      source_surface: 'exit_intent_modal',
      banner_id: 'exit_intent_modal',
      page_type: desktopWhatsapp.pageType,
      page_path: `${location.pathname}${location.search}`,
      href: desktopWhatsapp.href,
    });

    window.open(desktopWhatsapp.href, '_blank', 'noopener,noreferrer');
    setExitIntentOpen(false);
  }, [desktopWhatsapp.href, desktopWhatsapp.pageType, location.pathname, location.search]);

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
      {!location.pathname.startsWith('/checkout') && (
        <a
          href={desktopWhatsapp.href}
          target="_blank"
          rel="noopener noreferrer"
          onClick={handleDesktopWhatsappClick}
          aria-label="Falar no WhatsApp"
          title="Falar no WhatsApp"
          className="fixed bottom-6 right-6 z-40 hidden lg:flex items-center gap-2 rounded-full bg-[#25D366] px-3 py-2.5 text-white shadow-[0_14px_28px_rgba(37,211,102,0.35)] transition-transform hover:scale-[1.02] hover:brightness-105 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#25D366]/35"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/14">
            <WhatsAppIconSvg className="h-5 w-5" />
          </span>
          <span className="pr-1 text-sm font-semibold tracking-tight">Fale com um consultor</span>
        </a>
      )}
      <Dialog
        open={exitIntentOpen}
        onOpenChange={(open) => {
          setExitIntentOpen(open);
          if (!open && !exitIntentSubmitting) {
            setExitIntentFeedback(null);
          }
        }}
      >
        <DialogContent className="overflow-hidden rounded-[28px] border-0 bg-white p-0 shadow-2xl sm:max-w-[500px]">
          <div className="relative isolate px-6 pb-6 pt-7 sm:px-8 sm:pb-8">
            <div className="absolute inset-x-0 top-0 -z-10 h-40 bg-[radial-gradient(circle_at_50%_0%,rgba(37,211,102,0.18),rgba(37,211,102,0)_68%)]" />
            <DialogHeader className="items-center text-center">
              <div className="mb-2 flex h-16 w-16 items-center justify-center rounded-3xl bg-[#25D366]/10 text-[#128C4A] ring-1 ring-[#25D366]/20">
                <WhatsAppIconSvg className="h-8 w-8" />
              </div>
              <div className="mb-1 inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-emerald-700 ring-1 ring-emerald-100">
                <ShieldCheck className="h-3.5 w-3.5" />
                Atendimento especializado
              </div>
              <DialogTitle className="text-center text-2xl font-bold leading-tight tracking-tight text-[#111827]">
                Antes de sair, a gente acha a peça
              </DialogTitle>
              <DialogDescription className="mx-auto max-w-[340px] text-center text-[15px] leading-relaxed text-muted-foreground">
                Fale agora com um consultor ou deixe seu WhatsApp para receber ajuda.
              </DialogDescription>
            </DialogHeader>

            <form className="mt-5 space-y-3" onSubmit={handleExitIntentSubmit}>
              <label className="block space-y-1.5">
                <span className="text-sm font-semibold text-foreground">Seu WhatsApp</span>
                <div className="relative">
                  <Phone className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    value={exitIntentPhone}
                    onChange={(event) => setExitIntentPhone(formatPhoneInputBR(event.target.value))}
                    inputMode="tel"
                    placeholder="(43) 99999-9999"
                    className="h-12 w-full rounded-2xl border border-border bg-white pl-10 pr-3 text-base outline-none transition-colors placeholder:text-muted-foreground/60 focus:border-[#25D366] focus:ring-4 focus:ring-[#25D366]/10"
                  />
                </div>
              </label>

              {exitIntentFeedback && (
                <div
                  className={`flex items-start gap-2.5 rounded-2xl border px-3 py-2 text-sm ${
                    exitIntentFeedback.tone === 'success'
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                      : 'border-amber-200 bg-amber-50 text-amber-800'
                  }`}
                >
                  {exitIntentFeedback.tone === 'success' ? (
                    <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0" />
                  ) : (
                    <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                  )}
                  <p>{exitIntentFeedback.message}</p>
                </div>
              )}

              <button
                type="button"
                onClick={handleExitIntentConsultant}
                className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[#25D366] px-4 text-base font-bold text-white shadow-lg shadow-[#25D366]/20 transition-all hover:-translate-y-0.5 hover:bg-[#20ba59] hover:shadow-xl hover:shadow-[#25D366]/25"
              >
                <WhatsAppIconSvg className="h-5 w-5" />
                Falar no WhatsApp agora
              </button>

              <div className="flex items-center gap-3 py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground/70">
                <span className="h-px flex-1 bg-border" />
                ou
                <span className="h-px flex-1 bg-border" />
              </div>

              <button
                type="submit"
                disabled={exitIntentSubmitting}
                className="inline-flex h-12 w-full items-center justify-center rounded-2xl border border-border bg-white px-4 text-sm font-bold text-foreground transition-colors hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-65"
              >
                {exitIntentSubmitting ? (
                  <span className="inline-flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Enviando...
                  </span>
                ) : (
                  'Quero que me chamem'
                )}
              </button>

              <p className="pt-1 text-center text-xs text-muted-foreground">
                Seus dados estão seguros. Não enviamos spam.
              </p>
            </form>
          </div>
        </DialogContent>
      </Dialog>
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
