'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { BannerRecord } from '@/lib/types';

function isEditorialBanner(banner: BannerRecord) {
  return banner.type === 'editorial';
}

export function HeroCarousel({ banners }: { banners: BannerRecord[] }) {
  const slides = useMemo(() => banners.filter((banner) => banner.active !== false), [banners]);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (slides.length <= 1) return;
    const timer = setInterval(() => {
      setIndex((current) => (current + 1) % slides.length);
    }, 6000);
    return () => clearInterval(timer);
  }, [slides.length]);

  if (slides.length === 0) return null;

  const current = slides[index];

  return (
    <section className="relative overflow-hidden rounded-[2rem] border border-border bg-[#141416] text-white tp-soft-card">
      {(current.desktopImageSrc || current.bgImageSrc) ? (
        <img
          src={current.desktopImageSrc || current.bgImageSrc}
          alt={current.productName || current.headline || 'Banner Toyoparts'}
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : null}
      <div className="absolute inset-0 bg-gradient-to-br from-black/35 via-black/15 to-black/55" />

      <div className="relative z-10 grid min-h-[380px] gap-8 px-6 py-8 md:min-h-[430px] md:grid-cols-[1.1fr_0.9fr] md:px-10 md:py-10">
        <div className="flex flex-col justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-white/70">
              {current.overline || 'Toyoparts'}
            </p>
            <h1 className="mt-4 max-w-xl text-4xl font-black leading-none tracking-tight md:text-5xl">
              {current.headline || current.productName || 'Peças e acessórios genuínos Toyota'}
            </h1>
            <p className="mt-4 max-w-xl text-base leading-7 text-white/78">
              {current.subtitle ||
                current.modelYear ||
                'Catálogo por modelo, filtros estruturais e experiência preparada para SEO sem abrir mão do catálogo atual.'}
            </p>
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Link
              href={current.linkHref || current.ctaLink || '/pecas'}
              className="inline-flex h-12 items-center justify-center rounded-2xl bg-primary px-5 text-sm font-bold text-white shadow-lg shadow-primary/25"
            >
              {current.ctaText || 'Ver oferta'}
            </Link>
            {current.searchLink ? (
              <Link
                href={current.searchLink}
                className="inline-flex h-12 items-center justify-center rounded-2xl border border-white/20 bg-white/10 px-5 text-sm font-semibold text-white backdrop-blur"
              >
                Pesquisar no catálogo
              </Link>
            ) : null}
          </div>
        </div>

        {!isEditorialBanner(current) && (current.pricePor || current.priceDe) ? (
          <div className="flex items-end justify-start md:justify-end">
            <div className="rounded-[2rem] border border-white/15 bg-black/35 p-5 backdrop-blur-xl">
              {current.priceDe ? (
                <p className="text-sm text-white/60 line-through">De {current.priceDe}</p>
              ) : null}
              {current.pricePor ? (
                <p className="mt-2 text-4xl font-black tracking-tight md:text-5xl">{current.pricePor}</p>
              ) : null}
              {current.installments ? (
                <p className="mt-2 text-sm font-semibold uppercase tracking-[0.18em] text-white/70">
                  {current.installments} sem juros
                </p>
              ) : null}
              {current.priceAVista ? (
                <p className="mt-4 text-sm text-white/80">À vista {current.priceAVista}</p>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>

      {slides.length > 1 && (
        <div className="absolute inset-x-0 bottom-4 z-20 flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => setIndex((currentIndex) => (currentIndex - 1 + slides.length) % slides.length)}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-black/35 text-white backdrop-blur"
            aria-label="Banner anterior"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <div className="flex items-center gap-2">
            {slides.map((slide, slideIndex) => (
              <button
                key={slide.id}
                type="button"
                onClick={() => setIndex(slideIndex)}
                className={`h-2.5 rounded-full transition-all ${slideIndex === index ? 'w-8 bg-white' : 'w-2.5 bg-white/45'}`}
                aria-label={`Ir para banner ${slideIndex + 1}`}
              />
            ))}
          </div>
          <button
            type="button"
            onClick={() => setIndex((currentIndex) => (currentIndex + 1) % slides.length)}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-black/35 text-white backdrop-blur"
            aria-label="Próximo banner"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}
    </section>
  );
}
