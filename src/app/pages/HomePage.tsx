import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Link, useNavigate } from 'react-router';
import { toast } from 'sonner';
import {
  ArrowRight, Truck, Package, MessageCircle,
  ShieldCheck, Sparkles, CreditCard,
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
import { useIsMobile } from '../hooks/useMediaQuery';
import { Skeleton } from '../components/ui/skeleton';
import type { HomeDepartmentSnapshot, HomePageConfig, HomeSmallBannerConfig } from '../lib/home-config';
import { trackWhatsappBannerLead } from '../lib/analytics';
import { useHomePageSnapshot } from '../lib/use-home-page-snapshot';
import {
  buildToyopartsWhatsAppUrl,
  isWhatsAppUrl as isToyopartsWhatsAppUrl,
  normalizeToyopartsWhatsAppUrl,
} from '../lib/whatsapp';

/* Ã¢â€â‚¬Ã¢â€â‚¬ Types for category tree Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ */

interface HeroBannerImageOnly {
  id: string;
  active: boolean;
  order: number;
  desktopImageSrc: string;
  mobileImageSrc?: string;
  linkHref?: string;
  altText?: string;
}

const DEFAULT_HOME_SMALL_BANNERS: HomeSmallBannerConfig[] = [
  {
    id: 'small_left',
    active: true,
    overline: 'Peças Genuínas',
    title: 'Até 10% OFF em filtros Toyota.',
    ctaText: 'Aproveite',
    href: '/busca?q=filtro',
    theme: 'dark',
    imageUrl: '',
  },
  {
    id: 'small_right',
    active: true,
    overline: 'Acessórios',
    title: '15% OFF em acessórios originais.',
    ctaText: 'Explorar',
    href: '/busca?q=acessorio',
    theme: 'light',
    imageUrl: '',
  },
];

function isScheduleActive(startAt?: string | null, endAt?: string | null) {
  if (!startAt && !endAt) return true;
  const now = Date.now();
  const start = startAt ? new Date(startAt).getTime() : null;
  const end = endAt ? new Date(endAt).getTime() : null;
  if (start !== null && Number.isFinite(start) && now < start) return false;
  if (end !== null && Number.isFinite(end) && now > end) return false;
  return true;
}

function fixHomePortugueseText(value?: string | null) {
  return String(value || '')
    .replace(/\bPecas\b/g, 'Peças')
    .replace(/\bPeca\b/g, 'Peça')
    .replace(/\bGenuinas\b/g, 'Genuínas')
    .replace(/\bGenuina\b/g, 'Genuína')
    .replace(/\bAcessorios\b/g, 'Acessórios')
    .replace(/\bPromocoes\b/g, 'Promoções')
    .replace(/\bpromocao\b/g, 'promoção')
    .replace(/\bdisponivel\b/g, 'disponível')
    .replace(/\bindisponivel\b/g, 'indisponível')
    .replace(/\brecem-chegados\b/g, 'recém-chegados')
    .replace(/\bcatalogo\b/g, 'catálogo')
    .replace(/\brapido\b/g, 'rápido')
    .replace(/\bAte\b/g, 'Até');
}

function getSmallBannerThemeClasses(theme: HomeSmallBannerConfig['theme']) {
  if (theme === 'light') {
    return {
      wrapper: 'bg-muted/60 text-foreground',
      overline: 'text-muted-foreground/60',
      cta: 'text-muted-foreground',
      overlay: '',
    };
  }
  if (theme === 'primary') {
    return {
      wrapper: 'bg-primary text-white',
      overline: 'text-white/55',
      cta: 'text-white/70',
      overlay: 'bg-[radial-gradient(ellipse_at_top_right,rgba(255,255,255,0.14),transparent)]',
    };
  }
  return {
    wrapper: 'bg-[#0a0a0a] text-white',
    overline: 'text-white/30',
    cta: 'text-white/50',
    overlay: 'bg-[radial-gradient(ellipse_at_top_right,rgba(235,10,30,0.15),transparent)]',
  };
}

function isWhatsAppHref(href?: string) {
  return isToyopartsWhatsAppUrl(href);
}

function isExternalHref(href?: string) {
  return /^https?:\/\//i.test(String(href || ''));
}

function isTrackedWhatsAppBanner(
  banner?: Partial<HomeSmallBannerConfig> & { ctaKind?: string; goalEnabled?: boolean },
) {
  if (!banner) return false;
  if (banner.goalEnabled === false) return false;
  return banner.ctaKind === 'whatsapp' || isWhatsAppHref(banner.href);
}

/* Ã¢â€â‚¬Ã¢â€â‚¬ Departments (fallback) Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ */

/* Ã¢â€â‚¬Ã¢â€â‚¬ Promotional Hero Slide Ã¢â‚¬â€ Horizontal 2-col Canva-style banner Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ */

const DEFAULT_FEATURED_CATEGORY_LIMIT = 15;
const HOME_POPULAR_MIN_PRODUCTS = 15;

/* Ã¢â€â‚¬Ã¢â€â‚¬ Section Header (Untitled UI style) Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ */

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

/* Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ HeroCarousel Ã¢â‚¬â€ zero-dependency autoplay slider Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ */

function HeroCarousel({ children, autoplaySpeed = 7000 }: { children: React.ReactNode[]; autoplaySpeed?: number }) {
  const slides = React.Children.toArray(children);
  const count = slides.length;
  const [paused, setPaused] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const currentRef = useRef(0);
  const scrollSyncFrameRef = useRef<number | null>(null);
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
  }, [count]);

  const advance = useCallback(() => {
    scrollToSlide(currentRef.current + 1);
  }, [scrollToSlide]);

  const goBack = useCallback(() => {
    scrollToSlide(currentRef.current - 1);
  }, [scrollToSlide]);

  useEffect(() => {
    if (paused || count <= 1) return;
    const scheduleNext = () => {
      timerRef.current = setTimeout(() => {
        advance();
        scheduleNext();
      }, autoplaySpeed);
    };

    scheduleNext();

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [paused, advance, autoplaySpeed, count]);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;

    const syncCurrentFromScroll = () => {
      if (scrollSyncFrameRef.current !== null) return;

      scrollSyncFrameRef.current = window.requestAnimationFrame(() => {
        const slideWidth = track.clientWidth || 1;
        const nextIndex = Math.round(track.scrollLeft / slideWidth);
        const clampedIndex = Math.max(0, Math.min(count - 1, nextIndex));
        currentRef.current = clampedIndex;
        scrollSyncFrameRef.current = null;
      });
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
      if (scrollSyncFrameRef.current !== null) {
        window.cancelAnimationFrame(scrollSyncFrameRef.current);
        scrollSyncFrameRef.current = null;
      }
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

/* Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â */
/* Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ HOME PAGE Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ */
/* Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â */

export function HomePage() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { snapshot, loading: snapshotLoading } = useHomePageSnapshot();
  const [featuredProducts, setFeaturedProducts] = useState<any[]>([]);
  const [promoProducts, setPromoProducts] = useState<any[]>([]);
  const [newProducts, setNewProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [aiMode, setAiMode] = useState(false);
  const [isSearchFocused, setIsSearchFocused] = useState(false);

  // Departments now come from the published home snapshot.
  const [snapshotDepartments, setSnapshotDepartments] = useState<HomeDepartmentSnapshot[]>([]);
  const [catsLoading, setCatsLoading] = useState(true);
  const [brokenDepartmentImages, setBrokenDepartmentImages] = useState<Set<string>>(() => new Set());

  // Dynamic banners from the same published home snapshot.
  const [heroBanners, setHeroBanners] = useState<HeroBannerImageOnly[]>([]);
  const [heroBannersLoading, setHeroBannersLoading] = useState(true);
  const [homeConfig, setHomeConfig] = useState<HomePageConfig | null>(null);

  const handleDepartmentImageError = useCallback((imageUrl?: string | null) => {
    const normalized = String(imageUrl || '').trim();
    if (!normalized) return;
    setBrokenDepartmentImages((current) => {
      if (current.has(normalized)) return current;
      const next = new Set(current);
      next.add(normalized);
      return next;
    });
  }, []);

  useEffect(() => {
    if (snapshotLoading) {
      setLoading(true);
      setCatsLoading(true);
      setHeroBannersLoading(true);
      return;
    }

    const resolved = snapshot?.resolved || null;
    setHomeConfig(snapshot?.config || null);
    setFeaturedProducts(snapshot?.popularProducts?.products || resolved?.popular?.products || []);
    setPromoProducts(snapshot?.offers?.products || resolved?.offers?.products || []);
    setNewProducts(snapshot?.newArrivals?.products || resolved?.newArrivals?.products || []);
    setSnapshotDepartments(snapshot?.departments || []);
    setHeroBanners((snapshot?.heroBanners || []).filter((banner) => banner.active !== false && Boolean(banner.desktopImageSrc)));
    setLoading(false);
    setCatsLoading(false);
    setHeroBannersLoading(false);
  }, [snapshot, snapshotLoading]);

  // heroSettings removed Ã¢â‚¬â€ using HeroCarousel component instead

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      const params = new URLSearchParams({ q: searchQuery.trim() });
      if (aiMode) params.set('mode', 'ai');
      navigate(`/busca?${params.toString()}`);
    }
  };

  const heroSkeleton = (
    <div className="relative h-[max(340px,52svh)] sm:h-[400px] md:h-[440px] lg:h-[480px] overflow-hidden bg-background">
      <Skeleton className="absolute inset-0 h-full w-full rounded-none bg-muted" />
    </div>
  );

  const featuredDepartments = React.useMemo(() => {
    const configuredLimit = homeConfig?.departments?.limit || DEFAULT_FEATURED_CATEGORY_LIMIT;
    const limit = Math.max(DEFAULT_FEATURED_CATEGORY_LIMIT, configuredLimit);
    return snapshotDepartments
      .filter((department) => department.imageUrl && !brokenDepartmentImages.has(department.imageUrl))
      .slice(0, limit);
  }, [brokenDepartmentImages, homeConfig?.departments?.limit, snapshotDepartments]);

  const offersSection = homeConfig?.offers;
  const popularSection = homeConfig?.popular;
  const newArrivalsSection = homeConfig?.newArrivals;

  const smallBanners = React.useMemo(() => {
    const configured = (homeConfig?.smallBanners || []).filter(
      (banner) => banner.active && isScheduleActive(banner.schedule?.startAt, banner.schedule?.endAt),
    );
    return (configured.length > 0 ? configured : DEFAULT_HOME_SMALL_BANNERS).slice(0, 2);
  }, [homeConfig?.smallBanners]);
  const firstSmallBanner = smallBanners[0] || DEFAULT_HOME_SMALL_BANNERS[0];
  const secondSmallBanner = smallBanners[1] || DEFAULT_HOME_SMALL_BANNERS[1] || firstSmallBanner;
  const firstSmallBannerTheme = getSmallBannerThemeClasses(firstSmallBanner.theme);
  const secondSmallBannerTheme = getSmallBannerThemeClasses(secondSmallBanner.theme);
  const buildHomeWhatsappFallbackMessage = useCallback((properties?: Record<string, unknown>) => {
    const candidate =
      (typeof properties?.headline === 'string' && properties.headline) ||
      (typeof properties?.title === 'string' && properties.title) ||
      (typeof properties?.overline === 'string' && properties.overline) ||
      '';

    return candidate
      ? `Quero saber mais sobre: ${candidate}.`
      : 'Quero falar com a equipe da Toyoparts.';
  }, []);
  const handleHomeWhatsappLead = useCallback((
    sourceSurface: string,
    bannerId: string,
    href?: string,
    properties?: Record<string, unknown>,
  ) => {
    const resolvedHref = normalizeToyopartsWhatsAppUrl(
      href,
      buildHomeWhatsappFallbackMessage(properties),
    );
    void trackWhatsappBannerLead({
      source_surface: sourceSurface,
      banner_id: bannerId,
      page_type: 'home',
      page_path: '/',
      href: resolvedHref,
      properties,
    });
  }, [buildHomeWhatsappFallbackMessage]);

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

      {/* Ã¢â€â‚¬Ã¢â€â‚¬ Search Backdrop (Spotlight) Ã¢â€â‚¬Ã¢â€â‚¬ */}
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
          Toyoparts - peças e acessórios genuínos Toyota para Hilux, Corolla, SW4, Yaris, Etios, RAV4, Prius e Corolla Cross
        </h1>

        {/* Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ */}
        {/*  1. HERO Ã¢â‚¬â€ Apple-style cinematic                                 */}
        {/* Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ */}
        <section className="w-full overflow-hidden">
          {heroBannersLoading ? (
            heroSkeleton
          ) : (
            <HeroCarousel autoplaySpeed={7000}>
              {[
                ...heroBanners.map((banner) => {
                  const imageSrc = isMobile && banner.mobileImageSrc ? banner.mobileImageSrc : banner.desktopImageSrc;
                  const slide = (
                    <div className="relative h-[max(340px,52svh)] overflow-hidden bg-[#0a0a0a] sm:h-[400px] md:h-[440px] lg:h-[480px]">
                      <img src={imageSrc} alt={banner.altText || ''} className="h-full w-full object-cover" />
                    </div>
                  );

                  if (!banner.linkHref) {
                    return <div key={banner.id} className="outline-none">{slide}</div>;
                  }

                  if (isWhatsAppHref(banner.linkHref)) {
                    const whatsappHref = normalizeToyopartsWhatsAppUrl(
                      banner.linkHref,
                      `Quero saber mais sobre: ${banner.altText || 'este banner'}.`,
                    );

                    return (
                      <div key={banner.id} className="outline-none">
                        <a
                          href={whatsappHref}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block outline-none"
                          onClick={() => handleHomeWhatsappLead('home_hero_banner', banner.id, whatsappHref, {
                            alt_text: banner.altText,
                            image_banner: true,
                          })}
                        >
                          {slide}
                        </a>
                      </div>
                    );
                  }

                  return (
                    <div key={banner.id} className="outline-none">
                      {isExternalHref(banner.linkHref) ? (
                        <a href={banner.linkHref} target="_blank" rel="noopener noreferrer" className="block outline-none">
                          {slide}
                        </a>
                      ) : (
                        <Link to={banner.linkHref} className="block outline-none">{slide}</Link>
                      )}
                    </div>
                  );
                }),
                ...(heroBanners.length === 0 ? [
                <div key="fb-neutral" className="outline-none">
                  <div className="relative h-[max(340px,52svh)] sm:h-[400px] md:h-[440px] lg:h-[480px] bg-[#0a0a0a] overflow-hidden">
                    <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(235,10,30,0.12),transparent)]" />
                    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center text-center px-6">
                      <p className="text-[11px] sm:text-xs font-medium tracking-[0.2em] uppercase text-white/40 mb-3 sm:mb-4">Peças Genuínas Toyota</p>
                      <h1 className="text-[32px] sm:text-[42px] md:text-[52px] lg:text-[64px] font-extrabold text-white tracking-tight leading-[1.05] max-w-2xl">Qualidade que seu{' '}<span className="bg-gradient-to-r from-white via-white/90 to-white/60 bg-clip-text">Toyota merece.</span></h1>
                <p className="text-sm sm:text-base text-white/40 mt-3 sm:mt-4 max-w-md leading-relaxed font-normal">Encontre peças e acessórios genuínos Toyota com atendimento especializado.</p>
                      <div className="flex items-center gap-3 mt-6 sm:mt-8">
                        <Button asChild className="bg-white text-[#0a0a0a] hover:bg-white/90 font-semibold rounded-full px-6 h-10 text-sm shadow-none"><Link to="/pecas">Comprar agora</Link></Button>
                        <Button variant="ghost" asChild className="text-white/60 hover:text-white hover:bg-white/5 font-medium rounded-full px-5 h-10 text-sm"><Link to="/busca?q=">Explorar <ArrowRight className="w-4 h-4 ml-1" /></Link></Button>
                      </div>
                    </div>
                  </div>
                </div>,
              ] : [])
            ]}
            </HeroCarousel>
          )}
        </section>


        {/* Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ */}
        {/*  2. SEARCH Ã¢â‚¬â€ Floating pill                                       */}
        {/* Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ */}
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

        {/* Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ */}
        {/*  4. DEPARTAMENTOS Ã¢â‚¬â€ Clean icon grid                              */}
        {/* Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ */}
        <section className="py-12 sm:py-16 lg:py-20">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <SectionHead title="Departamentos" subtitle="Os departamentos mais visitados, com acesso rápido e foto garantida." action="Ver todos" actionHref="/pecas" />

          {/* Loading skeleton */}
          {catsLoading && (
            <div className="-mx-1.5 sm:-mx-2">
              <ScrollSlider
                fadeBg="from-background"
                itemClassName="w-[calc((100%-1.5rem)/2.2)] sm:w-[calc((100%-2rem)/3)] md:w-[calc((100%-3rem)/4)] lg:w-[calc((100%-6rem)/7)]"
                arrows={false}
              >
                {Array.from({ length: 7 }).map((_, index) => (
                  <div key={index} className="h-full">
                    <Skeleton className="aspect-[4/3] rounded-2xl bg-muted/60" />
                    <div className="px-1 pt-2.5">
                      <Skeleton className="h-4 w-4/5 rounded-md bg-muted/40 mx-auto" />
                    </div>
                  </div>
                ))}
              </ScrollSlider>
            </div>
          )}

          {/* Published home snapshot categories */}
          {!catsLoading && featuredDepartments.length > 0 && (() => {
            const cards = featuredDepartments
              .map((cat) => {
                if (!cat.imageUrl) return null;

                return (
                <Link
                  key={cat.id}
                  to={cat.href}
                  className="group block h-full"
                >
                  <div className="relative aspect-[4/3] rounded-2xl overflow-hidden bg-[#f5f5f7] border border-border/70 hover:border-border/90 hover:shadow-lg transition-all duration-300">
                    <img
                      src={cat.imageUrl}
                      alt={cat.name}
                      className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.05] group-active:scale-[1.03]"
                      loading="lazy"
                      onError={() => handleDepartmentImageError(cat.imageUrl)}
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/10 to-transparent" />
                  </div>
                  <div className="px-1 pt-2.5 text-center">
                    <h3 className="text-[12px] sm:text-[13px] lg:text-[14px] font-semibold text-foreground tracking-tight leading-tight line-clamp-2 sm:line-clamp-1 min-h-[2.4em] sm:min-h-[1.25em]">
                      {cat.name}
                    </h3>
                  </div>
                </Link>
                );
              })
              .filter(Boolean);

            if (cards.length === 0) return null;

            return (
              <div className="-mx-1.5 sm:-mx-2">
                <ScrollSlider
                  fadeBg="from-background"
                  itemClassName="w-[calc((100%-1.5rem)/2.2)] sm:w-[calc((100%-2rem)/3)] md:w-[calc((100%-3rem)/4)] lg:w-[calc((100%-6rem)/7)]"
                >
                  {cards}
                </ScrollSlider>
              </div>
            );
          })()}

          {!catsLoading && featuredDepartments.length === 0 && (
            <div className="rounded-2xl border border-dashed border-border bg-muted/20 px-5 py-6 text-sm text-muted-foreground">
              Nenhum departamento com foto válida está disponível no catálogo agora.
            </div>
          )}
          </div>
        </section>

        {/* Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ */}
        {/*  5. OFERTAS                                                      */}
        {/* Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ */}
        {(loading || offersSection?.enabled !== false) && (
        <section className="pb-12 sm:pb-16 lg:pb-20">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <SectionHead
              overline="Promoções"
              title={fixHomePortugueseText(offersSection?.title || 'Ofertas especiais')}
              subtitle={fixHomePortugueseText(offersSection?.subtitle || 'Itens em promoção selecionados para a home.')}
              action="Ver todas"
              actionHref="/pecas"
            />

            {loading ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4 lg:gap-5 animate-in fade-in duration-300">
                {[...Array(5)].map((_, i) => <ProductCardSkeleton key={i} />)}
              </div>
            ) : (promoProducts.length > 0 || featuredProducts.length > 0) ? (
              <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
              <ScrollSlider>
                {(promoProducts.length > 0 ? promoProducts : featuredProducts).slice(0, 10).map(h => (
                  <ProductCard key={h.id || h.sku} hit={h} />
                ))}
              </ScrollSlider>
              </div>
            ) : (
              <div className="flex flex-col items-center py-16 text-muted-foreground">
                <Package className="w-10 h-10 mb-3 opacity-20" />
                <p className="text-sm">Nenhuma oferta no momento.</p>
              </div>
            )}
          </div>
        </section>
        )}

        {/* Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ */}
        {/*  6. PROMO BANNERS Ã¢â‚¬â€ Minimal, side by side                        */}
        {/* Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ */}
        <section className="pb-12 sm:pb-16 lg:pb-20">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid grid-cols-1 sm:grid-cols-2 gap-4">
            {isTrackedWhatsAppBanner(firstSmallBanner as any) ? (
              <a
                href={normalizeToyopartsWhatsAppUrl(firstSmallBanner.href, `Quero saber mais sobre: ${firstSmallBanner.title}.`)}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => handleHomeWhatsappLead('home_small_banner', (firstSmallBanner as any).trackingId || firstSmallBanner.id, normalizeToyopartsWhatsAppUrl(firstSmallBanner.href, `Quero saber mais sobre: ${firstSmallBanner.title}.`), {
                  title: firstSmallBanner.title,
                  linked_product_sku: (firstSmallBanner as any).linkedProductSku,
                  position: 'left',
                })}
                className={`group relative overflow-hidden rounded-2xl h-44 sm:h-52 flex items-end p-6 sm:p-8 ${firstSmallBannerTheme.wrapper}`}
              >
                {firstSmallBannerTheme.overlay ? <div className={`absolute inset-0 ${firstSmallBannerTheme.overlay}`} /> : null}
                {firstSmallBanner.imageUrl ? <img src={firstSmallBanner.imageUrl} alt="" className="absolute inset-0 h-full w-full object-cover opacity-25" loading="lazy" /> : null}
                <div className="relative z-10">
                  <p className={`text-[11px] font-medium tracking-[0.15em] uppercase mb-1.5 ${firstSmallBannerTheme.overline}`}>{firstSmallBanner.overline}</p>
                  <h3 className="text-xl sm:text-2xl font-semibold tracking-tight leading-snug">
                    {firstSmallBanner.title}
                  </h3>
                  <span className={`inline-flex items-center gap-1 text-xs font-medium mt-3 transition-colors ${firstSmallBannerTheme.cta}`}>
                    {firstSmallBanner.ctaText} <ArrowRight className="w-3.5 h-3.5" />
                  </span>
                </div>
              </a>
            ) : (
              <Link to={firstSmallBanner.href} className={`group relative overflow-hidden rounded-2xl h-44 sm:h-52 flex items-end p-6 sm:p-8 ${firstSmallBannerTheme.wrapper}`}>
                {firstSmallBannerTheme.overlay ? <div className={`absolute inset-0 ${firstSmallBannerTheme.overlay}`} /> : null}
                {firstSmallBanner.imageUrl ? <img src={firstSmallBanner.imageUrl} alt="" className="absolute inset-0 h-full w-full object-cover opacity-25" loading="lazy" /> : null}
                <div className="relative z-10">
                  <p className={`text-[11px] font-medium tracking-[0.15em] uppercase mb-1.5 ${firstSmallBannerTheme.overline}`}>{firstSmallBanner.overline}</p>
                  <h3 className="text-xl sm:text-2xl font-semibold tracking-tight leading-snug">
                    {firstSmallBanner.title}
                  </h3>
                  <span className={`inline-flex items-center gap-1 text-xs font-medium mt-3 transition-colors ${firstSmallBannerTheme.cta}`}>
                    {firstSmallBanner.ctaText} <ArrowRight className="w-3.5 h-3.5" />
                  </span>
                </div>
              </Link>
            )}

            {isTrackedWhatsAppBanner(secondSmallBanner as any) ? (
              <a
                href={normalizeToyopartsWhatsAppUrl(secondSmallBanner.href, `Quero saber mais sobre: ${secondSmallBanner.title}.`)}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => handleHomeWhatsappLead('home_small_banner', (secondSmallBanner as any).trackingId || secondSmallBanner.id, normalizeToyopartsWhatsAppUrl(secondSmallBanner.href, `Quero saber mais sobre: ${secondSmallBanner.title}.`), {
                  title: secondSmallBanner.title,
                  linked_product_sku: (secondSmallBanner as any).linkedProductSku,
                  position: 'right',
                })}
                className={`group relative overflow-hidden rounded-2xl h-44 sm:h-52 flex items-end p-6 sm:p-8 ${secondSmallBannerTheme.wrapper}`}
              >
                {secondSmallBannerTheme.overlay ? <div className={`absolute inset-0 ${secondSmallBannerTheme.overlay}`} /> : null}
                {secondSmallBanner.imageUrl ? <img src={secondSmallBanner.imageUrl} alt="" className="absolute inset-0 h-full w-full object-cover opacity-25" loading="lazy" /> : null}
                <div className="relative z-10">
                  <p className={`text-[11px] font-medium tracking-[0.15em] uppercase mb-1.5 ${secondSmallBannerTheme.overline}`}>{secondSmallBanner.overline}</p>
                  <h3 className="text-xl sm:text-2xl font-semibold tracking-tight leading-snug">
                    {secondSmallBanner.title}
                  </h3>
                  <span className={`inline-flex items-center gap-1 text-xs font-medium mt-3 transition-colors ${secondSmallBannerTheme.cta}`}>
                    {secondSmallBanner.ctaText} <ArrowRight className="w-3.5 h-3.5" />
                  </span>
                </div>
              </a>
            ) : (
              <Link to={secondSmallBanner.href} className={`group relative overflow-hidden rounded-2xl h-44 sm:h-52 flex items-end p-6 sm:p-8 ${secondSmallBannerTheme.wrapper}`}>
                {secondSmallBannerTheme.overlay ? <div className={`absolute inset-0 ${secondSmallBannerTheme.overlay}`} /> : null}
                {secondSmallBanner.imageUrl ? <img src={secondSmallBanner.imageUrl} alt="" className="absolute inset-0 h-full w-full object-cover opacity-25" loading="lazy" /> : null}
                <div className="relative z-10">
                  <p className={`text-[11px] font-medium tracking-[0.15em] uppercase mb-1.5 ${secondSmallBannerTheme.overline}`}>{secondSmallBanner.overline}</p>
                  <h3 className="text-xl sm:text-2xl font-semibold tracking-tight leading-snug">
                    {secondSmallBanner.title}
                  </h3>
                  <span className={`inline-flex items-center gap-1 text-xs font-medium mt-3 transition-colors ${secondSmallBannerTheme.cta}`}>
                    {secondSmallBanner.ctaText} <ArrowRight className="w-3.5 h-3.5" />
                  </span>
                </div>
              </Link>
            )}
          </div>
        </section>

        {/* Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ */}
        {/*  7. MODELOS Ã¢â‚¬â€ Clean slider style                                 */}
        {/* Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ */}
        <section className="py-12 sm:py-16 lg:py-20 bg-muted/30">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <SectionHead title="Encontre por modelo" subtitle="Peças e acessórios para cada modelo Toyota." />
            
            <div className="models-slider-container -mx-1.5 sm:-mx-2">
              <ScrollSlider
                fadeBg="from-muted/30"
                itemClassName="w-[calc((100%-1.5rem)/3)] sm:w-[calc((100%-3rem)/4)] md:w-[calc((100%-4rem)/5)] lg:w-[calc((100%-6rem)/7)]"
              >
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
                        className="w-full h-full object-contain brightness-0 opacity-70 group-hover:opacity-90 group-hover:scale-110 transition-all duration-500 ease-out" 
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

        {/* Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ */}
        {/*  8. EM DESTAQUE                                                  */}
        {/* Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ */}
        {(loading || popularSection?.enabled !== false) && (
        <section className="py-12 sm:py-16 lg:py-20">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <SectionHead
              overline="Destaques"
              title={fixHomePortugueseText(popularSection?.title || 'Mais procurados')}
              subtitle={fixHomePortugueseText(popularSection?.subtitle || 'Os produtos mais buscados pelos clientes recentemente.')}
              action="Ver todos"
              actionHref="/pecas"
            />

            {loading ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4 lg:gap-5 animate-in fade-in duration-300">
                {[...Array(5)].map((_, i) => <ProductCardSkeleton key={i} />)}
              </div>
            ) : featuredProducts.length > 0 ? (
              <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
              <ScrollSlider>
                {featuredProducts.slice(0, 15).map(h => (
                  <ProductCard key={h.id || h.sku} hit={h} />
                ))}
              </ScrollSlider>
              </div>
            ) : (
              <div className="flex flex-col items-center py-16 text-muted-foreground">
                <Package className="w-10 h-10 mb-3 opacity-20" />
                <p className="text-sm">Nenhum produto em destaque.</p>
              </div>
            )}
          </div>
        </section>
        )}

        {/* Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ */}
        {/*  9. NOVIDADES                                                    */}
        {/* Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ */}
        {!loading && newArrivalsSection?.enabled !== false && newProducts.length > 0 && (
            <section className="pb-12 sm:pb-16 lg:pb-20">
              <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <SectionHead title={fixHomePortugueseText(newArrivalsSection?.title || 'Novidades')} subtitle={fixHomePortugueseText(newArrivalsSection?.subtitle || '')} action="Ver todos" actionHref="/pecas" />
                <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                <ScrollSlider>
                  {newProducts.slice(0, 10).map(h => (
                    <ProductCard key={h.id || h.sku} hit={h} />
                  ))}
                </ScrollSlider>
                </div>
              </div>
            </section>
        )}

        {/* Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ */}
        {/*  10. WHATSAPP CTA Ã¢â‚¬â€ Minimal card                                 */}
        {/* Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ */}
        <section className="pb-12 sm:pb-16 lg:pb-20">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <a
              href={buildToyopartsWhatsAppUrl('Tenho dúvida sobre compatibilidade.')}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => handleHomeWhatsappLead('home_whatsapp_card', 'home_whatsapp_card', buildToyopartsWhatsAppUrl('Tenho dúvida sobre compatibilidade.'), {
                title: 'Duvida sobre compatibilidade',
              })}
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

        {/* Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ */}
        {/*  11. NEWSLETTER                                                   */}
        {/* Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ */}
        <section className="py-12 sm:py-16 lg:py-20 bg-muted/30 border-t border-border/50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <NewsletterBanner source="homepage" />
          </div>
        </section>

        {/* Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ */}
        {/*  12. TRUST BAR (bottom) Ã¢â‚¬â€ Reforço antes do footer                */}
        {/* Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ */}
        <section className="py-10 sm:py-12 lg:py-16 border-t border-border/40">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 sm:gap-0">
              {[
                { icon: Truck, label: 'Frete promocional', sub: 'Consulte no carrinho' },
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

        {/* Ã¢â€â‚¬Ã¢â€â‚¬ Floating WhatsApp Ã¢â€â‚¬Ã¢â€â‚¬ */}

      </div>
      <style>{`
        @keyframes shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>
    </>
  );
}
