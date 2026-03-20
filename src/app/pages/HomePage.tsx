import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Link, useNavigate } from 'react-router';
import { toast } from 'sonner';
import {
  ArrowRight, Truck, Package, MessageCircle,
  Mail, Headphones, Lightbulb, CarFront, Sofa, ShieldCheck,
  Wrench, Sparkles, CreditCard, Loader2, CheckCircle2,
  ChevronLeft, ChevronRight
} from 'lucide-react';

import { AnimatePresence, motion } from 'motion/react';

import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { AISearchToolbar } from '../components/AISearchToolbar';
import { Tooltip, TooltipTrigger, TooltipContent } from '../components/ui/tooltip';

import { SEOHead } from '../components/seo/SEOHead';
import { ProductCard, ProductCardSkeleton } from '../components/ProductCard';
import { ScrollSlider } from '../components/ScrollSlider';
import { NewsletterBanner } from '../components/newsletter/NewsletterBanner';
import {
  CAR_MODELS_SEO,
  SITE_DESCRIPTION,
  SITE_DEFAULT_TITLE,
  SITE_KEYWORDS,
  SITE_NAME,
  generateOrganizationJsonLd,
  generateWebSiteJsonLd,
  slugify,
} from '../seo-config';
import { projectId, publicAnonKey } from '../../../utils/supabase/info';
import { useIsMobile } from '../hooks/useMediaQuery';

const API = `https://${projectId}.supabase.co/functions/v1/make-server-1d6e33e0`;
const HEADERS: HeadersInit = { Authorization: `Bearer ${publicAnonKey}`, apikey: publicAnonKey, 'Content-Type': 'application/json' };

/* ── Types for category tree ─────────────────────────────────────────────── */

interface CategoryNode {
  id: number;
  parent_id: number;
  name: string;
  level: number;
  is_active: boolean;
  product_count: number;
  children_data?: CategoryNode[];
  children?: CategoryNode[]; // fallback for old cache format
}

function getTopCategories(tree: CategoryNode | null): CategoryNode[] {
  if (!tree) return [];
  const walk = (node: CategoryNode): CategoryNode[] => {
    const children = (node.children_data || node.children || []).filter(c => c.is_active);
    if (children.length === 0) return [];
    if (children.length === 1) return walk(children[0]);
    return children;
  };
  return walk(tree);
}

function catSlugify(text: string): string {
  return text.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function findCategoryImage(catName: string, images: Record<string, string>): string | null {
  if (!images || Object.keys(images).length === 0) return null;
  const slug = catSlugify(catName);
  // Direct match
  if (images[slug]) return images[slug];
  // Partial match — slug is contained in a key or vice-versa
  for (const key of Object.keys(images)) {
    // Skip model-scoped keys (e.g. "hilux:pecas")
    if (key.includes(':')) continue;
    if (key.includes(slug) || slug.includes(key)) return images[key];
  }
  // Try model-scoped keys as fallback (pick first match)
  for (const key of Object.keys(images)) {
    const afterColon = key.split(':')[1];
    if (afterColon && (afterColon.includes(slug) || slug.includes(afterColon))) return images[key];
  }
  return null;
}

/* ── Departments (fallback) ──────────────────────────────────────────────── */

const DEPARTMENTS = [
  { name: 'Sons e Entretenimento', short: 'Sons', query: 'som', icon: Headphones },
  { name: 'Faróis e Lanternas', short: 'Faróis', query: 'farol lanterna', icon: Lightbulb },
  { name: 'Acessórios Exteriores', short: 'Exterior', query: 'acessorio exterior', icon: CarFront },
  { name: 'Acessórios Interiores', short: 'Interior', query: 'acessorio interior', icon: Sofa },
  { name: 'Alarmes e Segurança', short: 'Segurança', query: 'alarme seguranca', icon: ShieldCheck },
  { name: 'Peças e Manutenção', short: 'Peças', query: 'filtro oleo', icon: Wrench },
];

/* ── Promotional Hero Slide — Horizontal 2-col Canva-style banner ─────── */

function PromotionalHeroSlide({ 
  productName, 
  modelYear, 
  priceDe, 
  pricePor, 
  installments, 
  priceAVista,
  imageSrc,
  searchLink,
  accentColor = '#eb0a1e',
}: {
  productName: string;
  modelYear: string;
  priceDe: string;
  pricePor: string;
  installments: string;
  priceAVista: string;
  imageSrc: string;
  searchLink?: string;
  accentColor?: string;
}) {
  // Darken accent for contrast elements (POR pill, SEM JUROS)
  const darken = (hex: string, amt: number) => {
    const n = parseInt(hex.replace('#', ''), 16);
    const r = Math.max(0, (n >> 16) - amt);
    const g = Math.max(0, ((n >> 8) & 0xff) - amt);
    const b = Math.max(0, (n & 0xff) - amt);
    return `#${(r << 16 | g << 8 | b).toString(16).padStart(6, '0')}`;
  };
  const accentDark = darken(accentColor, 30);

  const content = (
    <div
      className="relative w-full h-[max(340px,52svh)] sm:h-[400px] md:h-[440px] lg:h-[480px] overflow-hidden group cursor-pointer select-none"
      style={{ background: accentColor }}
    >
      {/* Decorative chevrons — top area */}
      <div className="absolute top-4 right-[10%] sm:left-[42%] sm:right-auto z-0 flex gap-1 opacity-50">
        {[0, 1, 2].map(i => (
          <svg key={i} className="w-5 h-5 sm:w-6 sm:h-6 text-yellow-400" viewBox="0 0 24 24" fill="currentColor" style={{ transform: `translateY(${i * 3}px)` }}>
            <path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6z" />
          </svg>
        ))}
      </div>
      {/* Decorative chevrons — bottom-right */}
      <div className="absolute bottom-4 right-6 sm:right-10 z-0 flex gap-1 opacity-30 rotate-180">
        {[0, 1].map(i => (
          <svg key={i} className="w-5 h-5 sm:w-6 sm:h-6 text-yellow-400" viewBox="0 0 24 24" fill="currentColor" style={{ transform: `translateY(${i * 3}px)` }}>
            <path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6z" />
          </svg>
        ))}
      </div>

      {/* Subtle gradient overlay */}
      <div className="absolute inset-0 z-0" style={{ background: `linear-gradient(135deg, transparent 40%, ${accentDark}40 100%)` }} />

      {/* ── Content: stacked on mobile, 2-col on sm+ ── */}
      <div className="relative z-10 max-w-[1400px] mx-auto flex flex-col sm:flex-row items-start justify-center sm:items-center sm:justify-between h-full px-5 sm:px-10 md:px-14 lg:px-20 py-6 sm:py-0 gap-3 sm:gap-6">

        {/* LEFT / TOP — Text info */}
        <div className="flex-1 min-w-0 flex flex-col justify-center items-start text-left">
          <p className="text-[11px] sm:text-[13px] md:text-[15px] lg:text-[17px] font-bold text-white/80 tracking-[0.15em] uppercase mb-0 sm:mb-2">
            Genuíno Toyota
          </p>
          <h2 className="text-[28px] sm:text-[42px] md:text-[54px] lg:text-[64px] font-black text-white leading-[0.85] sm:leading-[0.92] tracking-tight uppercase">
            {productName}
          </h2>
          <p className="text-[18px] sm:text-[24px] md:text-[32px] lg:text-[38px] font-extrabold text-white/90 leading-[1] uppercase mt-0 sm:mt-1">
            {modelYear}
          </p>
          <div className="flex items-center gap-2 mt-2 sm:mt-5">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[9px] sm:text-[11px] font-bold uppercase tracking-wider bg-white/20 text-white backdrop-blur-sm">
              <Truck className="w-3 h-3" />
              frete grátis
            </span>
            <span className="text-[9px] sm:text-[11px] font-medium text-white/60 hidden sm:inline">
              para compras via <span className="font-bold text-white/80">whatsapp</span> e <span className="font-bold text-white/80">pix</span>
            </span>
          </div>
        </div>

        {/* RIGHT / BOTTOM — Price block + Product image */}
        <div className="flex items-center gap-4 sm:gap-5 md:gap-8 flex-shrink-0">

          {/* Price Block */}
          <div className="flex flex-col items-start">
            <div className="flex items-center gap-1 mb-0.5 sm:mb-1">
              <span className="text-[10px] sm:text-[12px] md:text-[13px] font-semibold text-white/60 uppercase">DE</span>
              <span className="text-[12px] sm:text-[14px] md:text-[16px] font-bold text-white/60 line-through">R$ {priceDe}</span>
            </div>
            <div className="flex items-center gap-1.5 sm:gap-2">
              <span
                className="px-2 py-0.5 rounded-md text-[9px] sm:text-[11px] font-black uppercase tracking-wide text-white"
                style={{ background: accentDark }}
              >
                POR
              </span>
              <span className="text-[10px] sm:text-[13px] font-bold text-white/80 uppercase">{installments}</span>
            </div>
            <div className="flex items-start mt-0.5">
              <span className="text-[14px] sm:text-[18px] md:text-[20px] font-extrabold text-white leading-none mt-2 sm:mt-3 mr-0.5">R$</span>
              <span className="text-[52px] sm:text-[64px] md:text-[80px] lg:text-[92px] font-black text-white leading-[0.82] tracking-tighter">
                {pricePor.split(',')[0]}
              </span>
              <span className="text-[20px] sm:text-[26px] md:text-[32px] font-black text-white leading-none mt-0.5">
                ,{pricePor.split(',')[1]}
              </span>
            </div>
            <span
              className="self-end -mt-1 sm:-mt-2 px-2 py-0.5 rounded text-[8px] sm:text-[10px] md:text-[12px] font-black uppercase tracking-wider text-white"
              style={{ background: accentDark }}
            >
              Sem Juros
            </span>
            <div className="flex items-center gap-1.5 mt-1.5 sm:mt-3">
              <span className="text-[11px] sm:text-[13px] md:text-[15px] font-medium text-white/70 uppercase">À vista</span>
              <span className="text-[14px] sm:text-[18px] md:text-[21px] font-extrabold text-white underline decoration-1 underline-offset-2">R$ {priceAVista}</span>
            </div>
          </div>

          {/* Product Image */}
          <div className="relative w-[110px] h-[110px] sm:w-[160px] sm:h-[160px] md:w-[220px] md:h-[220px] lg:w-[280px] lg:h-[280px] flex-shrink-0">
            <img
              src={imageSrc}
              alt={productName}
              className="w-full h-full object-contain drop-shadow-[0_4px_24px_rgba(0,0,0,0.35)] group-hover:scale-[1.05] transition-transform duration-500 ease-out"
            />
          </div>
        </div>
      </div>
    </div>
  );

  if (searchLink) {
    return <Link to={searchLink} className="block outline-none">{content}</Link>;
  }
  return content;
}

/* ── Section Header (Untitled UI style) ──────────────────────────────────── */

function SectionHead({ overline, title, subtitle, action, actionHref }: {
  overline?: string; title: string; subtitle?: string; action?: string; actionHref?: string;
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-8 sm:mb-10">
      <div>
        {overline && (
          <p className="text-[11px] sm:text-xs font-semibold text-primary tracking-widest uppercase mb-2">{overline}</p>
        )}
        <h2 className="text-[24px] sm:text-[30px] lg:text-[36px] font-bold text-foreground tracking-tight leading-[1.1]">
          {title}
        </h2>
        {subtitle && (
          <p className="text-[14px] sm:text-base text-muted-foreground mt-2 leading-relaxed max-w-xl">{subtitle}</p>
        )}
      </div>
      {action && actionHref && (
        <Link to={actionHref} className="group inline-flex items-center gap-1 text-sm font-semibold text-primary hover:text-primary/80 transition-colors flex-shrink-0 pb-0.5">
          {action}
          <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
        </Link>
      )}
    </div>
  );
}

/* ─── HeroCarousel — zero-dependency autoplay slider ────────────────────── */

function HeroCarousel({ children, autoplaySpeed = 7000 }: { children: React.ReactNode[]; autoplaySpeed?: number }) {
  const slides = React.Children.toArray(children);
  const count = slides.length;
  const [current, setCurrent] = useState(0);
  const [paused, setPaused] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const currentRef = useRef(0);
  const touchStartXRef = useRef<number | null>(null);
  const touchStartYRef = useRef<number | null>(null);
  const touchDeltaXRef = useRef(0);
  const touchMovedRef = useRef(false);
  const suppressClickRef = useRef(false);

  const scrollToSlide = useCallback((index: number, behavior: ScrollBehavior = 'smooth') => {
    const track = trackRef.current;
    if (!track || count <= 0) return;

    const normalizedIndex = ((index % count) + count) % count;
    const slideWidth = track.clientWidth;

    track.scrollTo({
      left: normalizedIndex * slideWidth,
      behavior,
    });
    currentRef.current = normalizedIndex;
    setCurrent(normalizedIndex);
  }, [count]);

  const advance = useCallback(() => {
    scrollToSlide(currentRef.current + 1);
  }, [scrollToSlide]);

  const goBack = useCallback(() => {
    scrollToSlide(currentRef.current - 1);
  }, [scrollToSlide]);

  useEffect(() => {
    currentRef.current = current;
  }, [current]);

  useEffect(() => {
    if (paused || count <= 1) return;
    timerRef.current = setTimeout(advance, autoplaySpeed);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [current, paused, advance, autoplaySpeed, count]);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;

    const syncCurrentFromScroll = () => {
      const slideWidth = track.clientWidth || 1;
      const nextIndex = Math.round(track.scrollLeft / slideWidth);
      const clampedIndex = Math.max(0, Math.min(count - 1, nextIndex));
      if (clampedIndex !== currentRef.current) {
        currentRef.current = clampedIndex;
        setCurrent(clampedIndex);
      }
    };

    const onResize = () => {
      scrollToSlide(currentRef.current, 'auto');
    };

    const resizeObserver = new ResizeObserver(onResize);
    resizeObserver.observe(track);
    track.addEventListener('scroll', syncCurrentFromScroll, { passive: true });
    window.addEventListener('resize', onResize);
    window.setTimeout(() => scrollToSlide(currentRef.current, 'auto'), 0);

    return () => {
      resizeObserver.disconnect();
      track.removeEventListener('scroll', syncCurrentFromScroll);
      window.removeEventListener('resize', onResize);
    };
  }, [count, scrollToSlide]);

  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.targetTouches[0];
    touchStartXRef.current = touch.clientX;
    touchStartYRef.current = touch.clientY;
    touchDeltaXRef.current = 0;
    touchMovedRef.current = false;
    setPaused(true);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (touchStartXRef.current === null || touchStartYRef.current === null) return;

    const touch = e.targetTouches[0];
    const deltaX = touch.clientX - touchStartXRef.current;
    const deltaY = touch.clientY - touchStartYRef.current;

    touchDeltaXRef.current = deltaX;

    if (Math.abs(deltaX) > 12) {
      touchMovedRef.current = true;
    }

  };

  const handleTouchEnd = () => {
    const deltaX = touchDeltaXRef.current;
    const isLeftSwipe = deltaX < -50;
    const isRightSwipe = deltaX > 50;

    if (isLeftSwipe) advance();
    else if (isRightSwipe) goBack();
    else scrollToSlide(currentRef.current);

    suppressClickRef.current = touchMovedRef.current && Math.abs(deltaX) > 10;

    touchStartXRef.current = null;
    touchStartYRef.current = null;
    touchDeltaXRef.current = 0;
    touchMovedRef.current = false;
    setPaused(false);
    window.setTimeout(() => {
      suppressClickRef.current = false;
    }, 50);
  };

  if (count === 0) return null;
  if (count === 1) return <>{slides[0]}</>;

  return (
    <div
      className="relative w-full overflow-hidden group/carousel"
      style={{ touchAction: 'pan-y' }}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
      onClickCapture={(e) => {
        if (suppressClickRef.current) {
          e.preventDefault();
          e.stopPropagation();
        }
      }}
    >
      <div
        ref={trackRef}
        className="flex overflow-x-auto scroll-smooth snap-x snap-mandatory no-scrollbar"
        style={{ WebkitOverflowScrolling: 'touch' }}
      >
        {slides.map((slide, i) => (
          <div key={i} className="w-full flex-shrink-0 snap-start">{slide}</div>
        ))}
      </div>
      {/* Arrow navigation - hidden on mobile */}
      <button
        onClick={goBack}
        className="absolute left-3 sm:left-5 top-1/2 -translate-y-1/2 z-20 w-10 h-10 sm:w-11 sm:h-11 rounded-full bg-black/20 backdrop-blur-md border border-white/10 flex items-center justify-center text-white/70 hover:text-white hover:bg-black/40 transition-all duration-300 opacity-0 group-hover/carousel:opacity-100 hidden sm:flex"
        aria-label="Slide anterior"
      >
        <ChevronLeft className="w-5 h-5" />
      </button>
      <button
        onClick={advance}
        className="absolute right-3 sm:right-5 top-1/2 -translate-y-1/2 z-20 w-10 h-10 sm:w-11 sm:h-11 rounded-full bg-black/20 backdrop-blur-md border border-white/10 flex items-center justify-center text-white/70 hover:text-white hover:bg-black/40 transition-all duration-300 opacity-0 group-hover/carousel:opacity-100 hidden sm:flex"
        aria-label="Próximo slide"
      >
        <ChevronRight className="w-5 h-5" />
      </button>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/* ─── HOME PAGE ─────────────────────────────────────────────────────────── */
/* ═══════════════════════════════════════════════════════════════════════════ */

export function HomePage() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [featuredProducts, setFeaturedProducts] = useState<any[]>([]);
  const [promoProducts, setPromoProducts] = useState<any[]>([]);
  const [newProducts, setNewProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [aiMode, setAiMode] = useState(false);
  const [isSearchFocused, setIsSearchFocused] = useState(false);

  // Real categories from API
  const [realCategories, setRealCategories] = useState<CategoryNode[]>([]);
  const [categoryImages, setCategoryImages] = useState<Record<string, string>>({});
  const [catsLoading, setCatsLoading] = useState(true);

  // Dynamic banners from admin
  const [heroBanners, setHeroBanners] = useState<any[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const qs = (o: Record<string, string>) => new URLSearchParams(o).toString();
        const [fRes, nRes] = await Promise.all([
          fetch(`${API}/search?${qs({ q: '', limit: '20', offset: '0', sort: 'price:desc', inStock: 'true' })}`, { headers: HEADERS }),
          fetch(`${API}/search?${qs({ q: '', limit: '8', offset: '0', sort: '', inStock: 'true' })}`, { headers: HEADERS }),
        ]);
        if (!fRes.ok) console.error('HomePage featured:', fRes.status, await fRes.text());
        if (!nRes.ok) console.error('HomePage new:', nRes.status, await nRes.text());
        const [fd, nd] = await Promise.all([fRes.ok ? fRes.json() : { hits: [] }, nRes.ok ? nRes.json() : { hits: [] }]);
        const all = fd.hits || [];
        setFeaturedProducts(all.slice(0, 12));
        setPromoProducts(all.filter((h: any) => h.special_price && h.special_price > 0 && h.special_price < h.price).slice(0, 8));
        setNewProducts(nd.hits?.slice(0, 8) || []);
      } catch (e) { console.error('HomePage:', e); } finally { setLoading(false); }
    })();

    // Fetch real categories + images
    (async () => {
      try {
        const [treeRes, imgRes] = await Promise.all([
          fetch(`${API}/categories/tree`, { headers: HEADERS }),
          fetch(`${API}/categories/images`, { headers: HEADERS }),
        ]);
        if (treeRes.ok) {
          const tree = await treeRes.json();
          setRealCategories(getTopCategories(tree));
        }
        if (imgRes.ok) {
          const data = await imgRes.json();
          if (data.images) setCategoryImages(data.images);
        }
      } catch (e) {
        console.error('HomePage categories:', e);
      } finally {
        setCatsLoading(false);
      }
    })();

    // Fetch hero banners (with retry for cold-start / transient 502s)
    (async () => {
      const maxRetries = 2;
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          if (attempt > 0) await new Promise(r => setTimeout(r, 800 * attempt));
          const res = await fetch(`${API}/banners`, { headers: HEADERS });
          if (res.ok) {
            const data = await res.json();
            const active = (data.banners || [])
              .filter((b: any) => b.active)
              .sort((a: any, b: any) => (a.order ?? 0) - (b.order ?? 0));
            setHeroBanners(active);
            break; // success
          }
          // Non-ok but not worth retrying (e.g. 400/404)
          if (res.status < 500) break;
          console.warn(`[Banners] HTTP ${res.status}, attempt ${attempt + 1}/${maxRetries + 1}`);
        } catch (e) {
          console.error(`[Banners] fetch error (attempt ${attempt + 1}):`, e);
          if (attempt === maxRetries) break;
        }
      }
    })();
  }, []);

  // heroSettings removed — using HeroCarousel component instead

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      const params = new URLSearchParams({ q: searchQuery.trim() });
      if (aiMode) params.set('mode', 'ai');
      navigate(`/busca?${params.toString()}`);
    }
  };

  return (
    <>
      <SEOHead
        title={SITE_DEFAULT_TITLE}
        description={SITE_DESCRIPTION}
        canonical="/"
        robots="index,follow"
        keywords={SITE_KEYWORDS}
        jsonLd={[generateOrganizationJsonLd(), generateWebSiteJsonLd()]}
      />

      {/* ── Search Backdrop (Spotlight) ── */}
      <AnimatePresence>
        {isSearchFocused && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[55] bg-black/40 backdrop-blur-md pointer-events-none"
          />
        )}
      </AnimatePresence>

      <div className="flex flex-col bg-background min-h-screen">
        <h1 className="sr-only">
          Toyoparts - pecas e acessorios genuinos Toyota para Hilux, Corolla, SW4, Yaris, Etios, RAV4, Prius e Corolla Cross
        </h1>

        {/* ────────────────────────────────────────────────────────────────── */}
        {/*  1. HERO — Apple-style cinematic                                 */}
        {/* ────────────────────────────────────────────────────────────────── */}
        <section className="w-full overflow-hidden">
          <HeroCarousel autoplaySpeed={7000}>
            {[
              ...(heroBanners.length > 0 ? heroBanners : []).map((b: any) => {
                if (b.type === 'promotional') {
                  return (
                    <div key={b.id} className="outline-none">
                      <PromotionalHeroSlide
                        productName={b.productName || ''} modelYear={b.modelYear || ''}
                        priceDe={b.priceDe || ''} pricePor={b.pricePor || ''}
                        installments={b.installments || '10x'} priceAVista={b.priceAVista || ''}
                        imageSrc={b.productImageSrc || ''} searchLink={b.searchLink}
                        accentColor={b.accentColor || '#eb0a1e'}
                      />
                    </div>
                  );
                }
                if (b.type === 'image') {
                  const imgSrc = isMobile && b.mobileImageSrc ? b.mobileImageSrc : (b.desktopImageSrc || '');
                  const imgContent = (
                    <div className="relative h-[max(340px,52svh)] sm:h-[400px] md:h-[440px] lg:h-[480px] bg-[#0a0a0a] overflow-hidden">
                      <img src={imgSrc} alt={b.altText || ''} className="w-full h-full object-cover" />
                    </div>
                  );
                  return (
                    <div key={b.id} className="outline-none">
                      {b.linkHref ? <Link to={b.linkHref} className="block outline-none">{imgContent}</Link> : imgContent}
                    </div>
                  );
                }
                return (
                  <div key={b.id} className="outline-none">
                    <div className="relative h-[max(340px,52svh)] sm:h-[400px] md:h-[440px] lg:h-[480px] overflow-hidden" style={{ background: b.bgColor || '#0a0a0a' }}>
                      {b.bgImageSrc && <img src={b.bgImageSrc} alt="" className="absolute inset-0 w-full h-full object-cover opacity-10" />}
                      <div className="absolute inset-0 z-10 flex flex-col items-center justify-center text-center px-6">
                        {b.overline && <p className="text-[11px] sm:text-xs font-medium tracking-[0.2em] uppercase text-white/40 mb-3 sm:mb-4">{b.overline}</p>}
                        <h2 className="text-[32px] sm:text-[42px] md:text-[52px] lg:text-[64px] font-extrabold text-white tracking-tight leading-[1.05] max-w-2xl">{b.headline || ''}</h2>
                        {b.subtitle && <p className="text-sm sm:text-base text-white/40 mt-3 sm:mt-4 max-w-md leading-relaxed font-normal">{b.subtitle}</p>}
                        {b.ctaText && b.ctaLink && (
                          <Button asChild className="bg-white text-[#0a0a0a] hover:bg-white/90 font-semibold rounded-full px-6 h-10 text-sm shadow-none mt-6 sm:mt-8">
                            <Link to={b.ctaLink}>{b.ctaText}</Link>
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              }),
              ...(heroBanners.length === 0 ? [
                <div key="fb-1" className="outline-none"><PromotionalHeroSlide productName="Bico Injetor" modelYear="Hilux 2015" priceDe="4.399,50" pricePor="356,35" installments="10x" priceAVista="3.563,59" imageSrc="https://images.unsplash.com/photo-1765211002882-2ed162e7c77b?auto=format&fit=crop&q=80&w=600" searchLink="/busca?q=bico+injetor+hilux" accentColor="#eb0a1e" /></div>,
                <div key="fb-2" className="outline-none"><PromotionalHeroSlide productName="Kit Pastilhas" modelYear="Corolla 2022" priceDe="850,00" pricePor="69,90" installments="10x" priceAVista="699,00" imageSrc="https://images.unsplash.com/photo-1749415245834-ef0106c847df?auto=format&fit=crop&q=80&w=600" searchLink="/busca?q=pastilha+corolla" accentColor="#3b82f6" /></div>,
                <div key="fb-3" className="outline-none">
                  <div className="relative h-[max(340px,52svh)] sm:h-[400px] md:h-[440px] lg:h-[480px] bg-[#0a0a0a] overflow-hidden">
                    <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(235,10,30,0.12),transparent)]" />
                    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center text-center px-6">
                      <p className="text-[11px] sm:text-xs font-medium tracking-[0.2em] uppercase text-white/40 mb-3 sm:mb-4">Peças Genuínas Toyota</p>
                      <h1 className="text-[32px] sm:text-[42px] md:text-[52px] lg:text-[64px] font-extrabold text-white tracking-tight leading-[1.05] max-w-2xl">Qualidade que seu{' '}<span className="bg-gradient-to-r from-white via-white/90 to-white/60 bg-clip-text">Toyota merece.</span></h1>
                      <p className="text-sm sm:text-base text-white/40 mt-3 sm:mt-4 max-w-md leading-relaxed font-normal">Até 40% OFF em peças selecionadas. Frete grátis acima de R$ 299.</p>
                      <div className="flex items-center gap-3 mt-6 sm:mt-8">
                        <Button asChild className="bg-white text-[#0a0a0a] hover:bg-white/90 font-semibold rounded-full px-6 h-10 text-sm shadow-none"><Link to="/pecas">Comprar agora</Link></Button>
                        <Button variant="ghost" asChild className="text-white/60 hover:text-white hover:bg-white/5 font-medium rounded-full px-5 h-10 text-sm"><Link to="/busca?q=">Explorar <ArrowRight className="w-4 h-4 ml-1" /></Link></Button>
                      </div>
                    </div>
                  </div>
                </div>,
                <div key="fb-4" className="outline-none">
                  <div className="relative h-[max(340px,52svh)] sm:h-[400px] md:h-[440px] lg:h-[480px] bg-[#0a0a0a] overflow-hidden">
                    <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(245,158,11,0.1),transparent)]" />
                    <img src="https://images.unsplash.com/photo-1633281256183-c0f106f70d76?auto=format&fit=crop&q=80&w=1920" alt="" className="absolute inset-0 w-full h-full object-cover opacity-10" />
                    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center text-center px-6">
                      <p className="text-[11px] sm:text-xs font-medium tracking-[0.2em] uppercase text-amber-400/60 mb-3 sm:mb-4">Mecânica Completa</p>
                      <h2 className="text-[32px] sm:text-[42px] md:text-[52px] lg:text-[64px] font-extrabold text-white tracking-tight leading-[1.05] max-w-2xl">Tudo para o motor.</h2>
                      <p className="text-sm sm:text-base text-white/40 mt-3 sm:mt-4 max-w-md leading-relaxed font-normal">Filtros, pastilhas, amortecedores, correias e muito mais.</p>
                      <Button asChild className="bg-white text-[#0a0a0a] hover:bg-white/90 font-semibold rounded-full px-6 h-10 text-sm shadow-none mt-6 sm:mt-8"><Link to="/busca?q=motor">Confira agora</Link></Button>
                    </div>
                  </div>
                </div>,
                <div key="fb-5" className="outline-none">
                  <div className="relative h-[max(340px,52svh)] sm:h-[400px] md:h-[440px] lg:h-[480px] bg-primary overflow-hidden">
                    <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_60%_at_50%_110%,rgba(255,255,255,0.08),transparent)]" />
                    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center text-center px-6">
                      <p className="text-[11px] sm:text-xs font-medium tracking-[0.2em] uppercase text-white/50 mb-3 sm:mb-4">Acessórios Originais</p>
                      <h2 className="text-[32px] sm:text-[42px] md:text-[52px] lg:text-[64px] font-extrabold text-white tracking-tight leading-[1.05] max-w-2xl">Personalize seu Toyota.</h2>
                      <p className="text-sm sm:text-base text-white/60 mt-3 sm:mt-4 max-w-md leading-relaxed font-normal">Acessórios exclusivos com frete grátis acima de R$ 299.</p>
                      <Button asChild className="bg-white text-primary hover:bg-white/90 font-semibold rounded-full px-6 h-10 text-sm shadow-none mt-6 sm:mt-8"><Link to="/pecas">Explorar</Link></Button>
                    </div>
                  </div>
                </div>,
              ] : [])
            ]}
          </HeroCarousel>
        </section>


        {/* ────────────────────────────────────────────────────────────────── */}
        {/*  2. SEARCH — Floating pill                                       */}
        {/* ────────────────────────────────────────────────────────────────── */}
        <div className="relative z-20 -mt-7 sm:-mt-8 px-4 sm:px-6">
          <div className="max-w-xl mx-auto">
            <AISearchToolbar
              query={searchQuery}
              setQuery={setSearchQuery}
              aiMode={aiMode}
              setAiMode={setAiMode}
              onSubmit={handleSearch}
              onFocusChange={setIsSearchFocused}
            />
          </div>
        </div>

        {/* ────────────────────────────────────────────────────────────────── */}
        {/*  4. DEPARTAMENTOS — Clean icon grid                              */}
        {/* ────────────────────────────────────────────────────────────────── */}
        <section className="py-12 sm:py-16 lg:py-20">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <SectionHead title="Departamentos" subtitle="Encontre a peça certa para seu veículo navegando por categoria." action="Ver todos" actionHref="/pecas" />

          {/* Loading skeleton */}
          {catsLoading && (
            <>
              {/* Mobile: horizontal skeleton — break out right with -mr-4 */}
              <div className="flex gap-3 overflow-hidden -mr-4 sm:mr-0 sm:hidden">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="flex-shrink-0 w-[120px]">
                    <div className="animate-pulse rounded-2xl bg-muted/60 aspect-square" />
                    <div className="animate-pulse rounded-md bg-muted/40 h-3 w-[80%] mt-2.5 mx-auto" />
                  </div>
                ))}
              </div>
              {/* Desktop: grid skeleton */}
              <div className="hidden sm:grid grid-cols-3 lg:grid-cols-4 gap-4">
                {[...Array(8)].map((_, i) => (
                  <div key={i} className="animate-pulse rounded-2xl bg-muted/60 aspect-[16/10]" />
                ))}
              </div>
            </>
          )}

          {/* Real categories from API */}
          {!catsLoading && realCategories.length > 0 && (() => {
            const renderCard = (cat: CategoryNode, isMobile: boolean) => {
              const imgUrl = findCategoryImage(cat.name, categoryImages);
              const childCount = (cat.children_data || cat.children || []).filter(c => c.is_active).length;
              const catLink = `/busca?category=${encodeURIComponent(String(cat.id))}&category_name=${encodeURIComponent(cat.name)}`;

              if (isMobile) {
                return (
                  <Link
                    key={cat.id}
                    to={catLink}
                    className="group flex-shrink-0 w-[120px] snap-start"
                  >
                    <div className="relative aspect-square rounded-2xl overflow-hidden bg-[#f5f5f7]">
                      {imgUrl ? (
                        <img
                          src={imgUrl}
                          alt={cat.name}
                          className="w-full h-full object-cover transition-transform duration-500 group-active:scale-[1.03]"
                          loading="lazy"
                          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                        />
                      ) : null}
                      <div className={`absolute inset-0 ${
                        imgUrl
                          ? 'bg-gradient-to-t from-black/50 via-transparent to-transparent'
                          : 'bg-gradient-to-br from-[#e8e8ed] to-[#d2d2d7]'
                      }`} />
                      {!imgUrl && (
                        <div className="absolute inset-0 flex items-center justify-center">
                          <span className="text-[36px] font-bold text-black/[0.06] select-none">
                            {cat.name.charAt(0)}
                          </span>
                        </div>
                      )}
                    </div>
                    <p className="text-[12px] font-semibold text-foreground text-center mt-2 leading-tight tracking-tight line-clamp-2 px-0.5">
                      {cat.name}
                    </p>
                    {childCount > 0 && (
                      <p className="text-[10px] text-muted-foreground text-center leading-none mt-0.5">
                        {childCount} sub.
                      </p>
                    )}
                  </Link>
                );
              }

              return (
                <Link
                  key={cat.id}
                  to={catLink}
                  className="group relative rounded-2xl overflow-hidden bg-[#f5f5f7] hover:shadow-lg transition-all duration-300"
                >
                  <div className="relative aspect-[16/10] overflow-hidden">
                    {imgUrl ? (
                      <img
                        src={imgUrl}
                        alt={cat.name}
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.05]"
                        loading="lazy"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                      />
                    ) : null}
                    <div className={`absolute inset-0 ${
                      imgUrl
                        ? 'bg-gradient-to-t from-black/60 via-black/20 to-transparent'
                        : 'bg-gradient-to-br from-[#e8e8ed] to-[#d2d2d7]'
                    }`} />
                    {!imgUrl && (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span className="text-[48px] font-bold text-white/20 select-none">
                          {cat.name.charAt(0)}
                        </span>
                      </div>
                    )}
                    <div className="absolute bottom-0 left-0 right-0 p-4">
                      <h3 className={`text-[15px] font-semibold tracking-tight leading-snug ${
                        imgUrl ? 'text-white' : 'text-[#1d1d1f]'
                      }`}>
                        {cat.name}
                      </h3>
                      {childCount > 0 && (
                        <p className={`text-[12px] mt-0.5 flex items-center gap-1 ${
                          imgUrl ? 'text-white/70' : 'text-[#86868b]'
                        }`}>
                          {childCount} subcategoria{childCount > 1 ? 's' : ''}
                          <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
                        </p>
                      )}
                    </div>
                  </div>
                </Link>
              );
            };

            return (
              <>
                {/* Mobile: horizontal scroll like an app */}
                <div className="sm:hidden -mr-4">
                  <div className="flex gap-3 overflow-x-auto no-scrollbar snap-x snap-mandatory pr-4 pb-1">
                    {realCategories.map(cat => renderCard(cat, true))}
                    {/* Spacer for last-item peek */}
                    <div className="flex-shrink-0 w-1" aria-hidden />
                  </div>
                </div>
                {/* Desktop: grid */}
                <div className="hidden sm:grid grid-cols-3 lg:grid-cols-4 gap-4">
                  {realCategories.map(cat => renderCard(cat, false))}
                </div>
              </>
            );
          })()}

          {/* Fallback: static departments (only if API returned nothing) */}
          {!catsLoading && realCategories.length === 0 && (
            <>
              {/* Mobile fallback: horizontal scroll */}
              <div className="sm:hidden -mr-4">
                <div className="flex gap-3 overflow-x-auto no-scrollbar snap-x snap-mandatory pr-4 pb-1">
                  {DEPARTMENTS.map(d => {
                    const Icon = d.icon;
                    return (
                      <Link
                        key={d.short}
                        to={`/busca?q=${encodeURIComponent(d.query)}`}
                        className="group flex-shrink-0 w-[120px] snap-start"
                      >
                        <div className="aspect-square rounded-2xl bg-gradient-to-br from-[#f5f5f7] to-[#e8e8ed] flex items-center justify-center">
                          <div className="w-12 h-12 rounded-xl bg-white/80 flex items-center justify-center group-active:scale-95 transition-transform">
                            <Icon className="w-6 h-6 text-[#1d1d1f]/60" strokeWidth={1.5} />
                          </div>
                        </div>
                        <p className="text-[12px] font-semibold text-foreground text-center mt-2 leading-tight tracking-tight line-clamp-2 px-0.5">
                          {d.name}
                        </p>
                      </Link>
                    );
                  })}
                  <div className="flex-shrink-0 w-1" aria-hidden />
                </div>
              </div>
              {/* Desktop fallback: grid */}
              <div className="hidden sm:grid grid-cols-3 gap-4">
                {DEPARTMENTS.map(d => {
                  const Icon = d.icon;
                  return (
                    <Link
                      key={d.short}
                      to={`/busca?q=${encodeURIComponent(d.query)}`}
                      className="group relative rounded-2xl overflow-hidden bg-gradient-to-br from-[#f5f5f7] to-[#e8e8ed] hover:shadow-lg transition-all duration-300"
                    >
                      <div className="aspect-[16/10] flex flex-col items-center justify-center p-4">
                        <div className="w-14 h-14 rounded-2xl bg-white/80 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform duration-300">
                          <Icon className="w-7 h-7 text-[#1d1d1f]/60 group-hover:text-[#1d1d1f] transition-colors" strokeWidth={1.5} />
                        </div>
                        <span className="text-[14px] font-semibold text-[#1d1d1f] tracking-tight text-center">
                          {d.name}
                        </span>
                        <span className="text-[11px] text-[#86868b] mt-0.5 flex items-center gap-0.5">
                          Ver produtos <ArrowRight className="w-3 h-3" />
                        </span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </>
          )}
          </div>
        </section>

        {/* ────────────────────────────────────────────────────────────────── */}
        {/*  5. OFERTAS                                                      */}
        {/* ────────────────────────────────────────────────────────────────── */}
        <section className="pb-12 sm:pb-16 lg:pb-20">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <SectionHead overline="Promoções" title="Ofertas especiais" subtitle="Peças selecionadas com descontos exclusivos." action="Ver todas" actionHref="/pecas" />

            {loading ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4 lg:gap-5">
                {[...Array(5)].map((_, i) => <ProductCardSkeleton key={i} />)}
              </div>
            ) : (promoProducts.length > 0 || featuredProducts.length > 0) ? (
              <ScrollSlider>
                {(promoProducts.length > 0 ? promoProducts : featuredProducts).slice(0, 10).map(h => (
                  <ProductCard key={h.id || h.sku} hit={h} />
                ))}
              </ScrollSlider>
            ) : (
              <div className="flex flex-col items-center py-16 text-muted-foreground">
                <Package className="w-10 h-10 mb-3 opacity-20" />
                <p className="text-sm">Nenhuma oferta no momento.</p>
              </div>
            )}
          </div>
        </section>

        {/* ────────────────────────────────────────────────────────────────── */}
        {/*  6. PROMO BANNERS — Minimal, side by side                        */}
        {/* ───────────────────────────────────────────────────────────────── */}
        <section className="pb-12 sm:pb-16 lg:pb-20">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Link to="/busca?q=filtro" className="group relative overflow-hidden rounded-2xl bg-[#0a0a0a] h-44 sm:h-52 flex items-end p-6 sm:p-8">
              <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(235,10,30,0.15),transparent)]" />
              <div className="relative z-10">
                <p className="text-[11px] font-medium tracking-[0.15em] uppercase text-white/30 mb-1.5">Peças Genuínas</p>
                <h3 className="text-xl sm:text-2xl font-semibold text-white tracking-tight leading-snug">
                  Até 10% OFF<br />em filtros Toyota.
                </h3>
                <span className="inline-flex items-center gap-1 text-xs font-medium text-white/50 mt-3 group-hover:text-white/70 transition-colors">
                  Aproveite <ArrowRight className="w-3.5 h-3.5" />
                </span>
              </div>
            </Link>

            <Link to="/busca?q=acessorio" className="group relative overflow-hidden rounded-2xl bg-muted/60 h-44 sm:h-52 flex items-end p-6 sm:p-8">
              <div className="relative z-10">
                <p className="text-[11px] font-medium tracking-[0.15em] uppercase text-muted-foreground/60 mb-1.5">Acessórios</p>
                <h3 className="text-xl sm:text-2xl font-semibold text-foreground tracking-tight leading-snug">
                  15% OFF em<br />acessórios originais.
                </h3>
                <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground mt-3 group-hover:text-foreground transition-colors">
                  Explorar <ArrowRight className="w-3.5 h-3.5" />
                </span>
              </div>
            </Link>
          </div>
        </section>

        {/* ────────────────────────────────────────────────────────────────── */}
        {/*  7. MODELOS — Clean slider style                                 */}
        {/* ────────────────────────────────────────────────────────────────── */}
        <section className="py-12 sm:py-16 lg:py-20 bg-muted/30">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <SectionHead title="Encontre por modelo" subtitle="Peças e acessórios para cada modelo Toyota." />
            
            <div className="models-slider-container -mx-1.5 sm:-mx-2">
              <ScrollSlider fadeBg="from-muted/30">
                {CAR_MODELS_SEO.map(m => (
                  <Link
                    key={m.slug}
                    to={`/pecas/${m.slug}`}
                    className="group flex flex-col items-center justify-center gap-3 bg-card border border-border rounded-2xl p-6 hover:border-border/80 hover:shadow-lg transition-all duration-300 h-full min-h-[160px]"
                  >
                    <div className="relative w-full aspect-[16/9] flex items-center justify-center">
                      <img 
                        src={m.imgSrc} 
                        alt={m.name} 
                        className="w-full h-full object-contain group-hover:scale-110 transition-transform duration-500 ease-out" 
                        loading="lazy" 
                      />
                    </div>
                    <div className="text-center">
                      <span className="text-base font-bold text-foreground group-hover:text-primary transition-colors block">{m.name}</span>
                      <p className="text-[11px] text-muted-foreground uppercase tracking-widest font-semibold mt-1">Ver peças</p>
                    </div>
                  </Link>
                ))}
              </ScrollSlider>
            </div>
          </div>
        </section>

        {/* ────────────────────────────────────────────────────────────────── */}
        {/*  8. EM DESTAQUE                                                  */}
        {/* ────────────────────────────────────────────────────────────────── */}
        <section className="py-12 sm:py-16 lg:py-20">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <SectionHead overline="Destaques" title="Mais procurados" subtitle="Os produtos mais populares da nossa loja." action="Ver todos" actionHref="/pecas" />

            {loading ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4 lg:gap-5">
                {[...Array(5)].map((_, i) => <ProductCardSkeleton key={i} />)}
              </div>
            ) : featuredProducts.length > 0 ? (
              <ScrollSlider>
                {featuredProducts.slice(0, 10).map(h => (
                  <ProductCard key={h.id || h.sku} hit={h} />
                ))}
              </ScrollSlider>
            ) : (
              <div className="flex flex-col items-center py-16 text-muted-foreground">
                <Package className="w-10 h-10 mb-3 opacity-20" />
                <p className="text-sm">Nenhum produto em destaque.</p>
              </div>
            )}
          </div>
        </section>

        {/* ────────────────────────────────────────────────────────────────── */}
        {/*  9. NOVIDADES                                                    */}
        {/* ────────────────────────────────────────────────────────────────── */}
        {!loading && newProducts.length > 0 && (
          <section className="pb-12 sm:pb-16 lg:pb-20">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <SectionHead title="Novidades" action="Ver todos" actionHref="/pecas" />
              <ScrollSlider>
                {newProducts.slice(0, 10).map(h => (
                  <ProductCard key={h.id || h.sku} hit={h} />
                ))}
              </ScrollSlider>
            </div>
          </section>
        )}

        {/* ────────────────────────────────────────────────────────────────── */}
        {/*  10. WHATSAPP CTA — Minimal card                                 */}
        {/* ────────────────────────────────────────────────────────────────── */}
        <section className="pb-12 sm:pb-16 lg:pb-20">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <a
              href="https://wa.me/554332941144"
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-center gap-4 sm:gap-5 bg-muted/50 border border-border rounded-2xl px-5 sm:px-8 py-5 sm:py-6 hover:bg-muted/70 transition-colors duration-200"
            >
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-[#25D366]/10 flex items-center justify-center flex-shrink-0">
                <MessageCircle className="w-5 h-5 sm:w-6 sm:h-6 text-[#25D366]" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm sm:text-[15px] font-semibold text-foreground tracking-tight leading-snug">
                  Dúvida sobre compatibilidade?
                </p>
                <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
                  Nosso time técnico responde pelo WhatsApp em minutos.
                </p>
              </div>
              <ArrowRight className="w-5 h-5 text-muted-foreground/30 group-hover:text-muted-foreground group-hover:translate-x-0.5 transition-all flex-shrink-0" />
            </a>
          </div>
        </section>

        {/* ────────────────────────────────────────────────────────────────── */}
        {/*  11. NEWSLETTER                                                   */}
        {/* ────────────────────────────────────────────────────────────────── */}
        <section className="py-12 sm:py-16 lg:py-20 bg-muted/30 border-t border-border/50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <NewsletterBanner source="homepage" />
          </div>
        </section>

        {/* ────────────────────────────────────────────────────────────────── */}
        {/*  12. TRUST BAR (bottom) — Reforço antes do footer                */}
        {/* ───────────────────────────────────────────────────────────────── */}
        <section className="py-10 sm:py-12 lg:py-16 border-t border-border/40">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 sm:gap-0">
              {[
                { icon: Truck, label: 'Frete grátis', sub: 'Acima de R$ 299' },
                { icon: ShieldCheck, label: 'Genuíno Toyota', sub: 'Garantia de fábrica' },
                { icon: CreditCard, label: '10x sem juros', sub: 'No cartão de crédito' },
                { icon: Sparkles, label: 'Envio em 24h', sub: 'Pedidos até às 14h' },
              ].map((b, i) => (
                <div
                  key={b.label}
                  className={`flex flex-col items-center text-center gap-3 ${
                    i > 0 ? 'sm:border-l sm:border-border/40' : ''
                  }`}
                >
                  <div className="w-12 h-12 rounded-2xl bg-[#f5f5f7] flex items-center justify-center">
                    <b.icon className="w-5 h-5 text-[#86868b]" strokeWidth={1.5} />
                  </div>
                  <div>
                    <p className="text-[13px] sm:text-sm font-bold text-foreground leading-snug tracking-tight">{b.label}</p>
                    <p className="text-[11px] sm:text-xs text-[#86868b] leading-relaxed mt-0.5">{b.sub}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Floating WhatsApp ── */}

      </div>
    </>
  );
}
