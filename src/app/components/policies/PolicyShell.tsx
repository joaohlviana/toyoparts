// ─── PolicyShell — Layout compartilhado para páginas institucionais ───────────
// Hero compacto + sidebar com sumário sticky + área de conteúdo

import React, { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router';
import { ChevronRight, ArrowLeft, ArrowRight, Clock, Printer } from 'lucide-react';

export interface PolicySection {
  id:       string;
  title:    string;
  content:  React.ReactNode;
}

export interface RelatedPage {
  href:  string;
  label: string;
  icon:  React.ElementType;
}

interface PolicyShellProps {
  hero: {
    label:    string;          // tag topo
    title:    string;
    subtitle: string;
    icon:     React.ElementType;
    updatedAt?: string;
    color:    string;          // tailwind bg class e.g. "bg-primary"
  };
  sections:  PolicySection[];
  related?:  RelatedPage[];
}

export function PolicyShell({ hero, sections, related }: PolicyShellProps) {
  const [activeId, setActiveId] = useState(sections[0]?.id ?? '');
  const contentRef = useRef<HTMLDivElement>(null);

  // Highlight section in TOC as user scrolls
  useEffect(() => {
    const observer = new IntersectionObserver(
      entries => {
        const visible = entries.filter(e => e.isIntersecting);
        if (visible.length > 0) setActiveId(visible[0].target.id);
      },
      { rootMargin: '-10% 0px -80% 0px', threshold: 0 },
    );
    const nodes = contentRef.current?.querySelectorAll('[data-section]') ?? [];
    nodes.forEach(n => observer.observe(n));
    return () => observer.disconnect();
  }, []);

  const scrollTo = (id: string) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const Icon = hero.icon;

  return (
    <div className="bg-background min-h-screen">
      {/* ── Hero banner ─────────────────────────────────────────────────────── */}
      <div className={`relative overflow-hidden ${hero.color} py-12 md:py-16`}>
        {/* decorative circles */}
        <div className="absolute -right-20 -top-20 w-80 h-80 rounded-full bg-white/5 pointer-events-none" />
        <div className="absolute -left-10 bottom-0 w-56 h-56 rounded-full bg-white/5 pointer-events-none" />

        <div className="relative max-w-5xl mx-auto px-6 lg:px-8">
          {/* Breadcrumb */}
          <nav className="flex items-center gap-1.5 text-[11px] font-semibold text-white/60 mb-5">
            <Link to="/" className="hover:text-white transition-colors">Início</Link>
            <ChevronRight className="w-3 h-3" />
            <span className="text-white">{hero.label}</span>
          </nav>

          <div className="flex items-center gap-4">
            <div className="w-12 h-12 md:w-14 md:h-14 rounded-2xl bg-white/15 flex items-center justify-center flex-shrink-0">
              <Icon className="w-6 h-6 md:w-7 md:h-7 text-white" />
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl lg:text-4xl font-black text-white leading-tight">{hero.title}</h1>
              <p className="text-white/70 text-[14px] mt-1">{hero.subtitle}</p>
            </div>
          </div>

          {hero.updatedAt && (
            <div className="mt-5 flex items-center gap-1.5 text-white/60 text-[11px]">
              <Clock className="w-3.5 h-3.5" />
              <span>Última atualização: {hero.updatedAt}</span>
              <button
                onClick={() => window.print()}
                className="ml-4 flex items-center gap-1 text-white/50 hover:text-white transition-colors"
              >
                <Printer className="w-3.5 h-3.5" /> Imprimir
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Main layout ─────────────────────────────────────────────────────── */}
      <div className="max-w-5xl mx-auto px-6 lg:px-8 py-10 md:py-14">
        <div className="grid lg:grid-cols-[240px_1fr] gap-10 lg:gap-14 items-start">

          {/* Sidebar TOC — sticky */}
          <aside className="hidden lg:block sticky top-24 self-start">
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-3 px-1">
              Neste documento
            </p>
            <nav className="space-y-0.5">
              {sections.map(s => (
                <button
                  key={s.id}
                  onClick={() => scrollTo(s.id)}
                  className={`w-full text-left px-3 py-2 rounded-xl text-[13px] font-medium transition-all ${
                    activeId === s.id
                      ? 'bg-primary/8 text-primary font-bold border-l-2 border-primary pl-3'
                      : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
                  }`}
                >
                  {s.title}
                </button>
              ))}
            </nav>

            {/* Related pages */}
            {related && related.length > 0 && (
              <div className="mt-8 pt-6 border-t border-border">
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-3 px-1">
                  Páginas relacionadas
                </p>
                {related.map(r => (
                  <Link
                    key={r.href}
                    to={r.href}
                    className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-[13px] text-muted-foreground hover:text-primary hover:bg-primary/5 transition-all group"
                  >
                    <r.icon className="w-3.5 h-3.5 flex-shrink-0" />
                    <span>{r.label}</span>
                    <ArrowRight className="w-3 h-3 ml-auto opacity-0 group-hover:opacity-100 transition-opacity" />
                  </Link>
                ))}
              </div>
            )}
          </aside>

          {/* Content */}
          <main ref={contentRef} className="min-w-0">
            <div className="space-y-10 md:space-y-12">
              {sections.map(s => (
                <section
                  key={s.id}
                  id={s.id}
                  data-section
                  className="scroll-mt-28"
                >
                  <h2 className="text-[18px] font-bold text-foreground mb-4 pb-3 border-b border-border flex items-center gap-2">
                    <span className="w-1 h-5 rounded-full bg-primary flex-shrink-0" />
                    {s.title}
                  </h2>
                  <div className="prose-content text-[14px] text-muted-foreground leading-relaxed space-y-3">
                    {s.content}
                  </div>
                </section>
              ))}
            </div>

            {/* Mobile related pages */}
            {related && related.length > 0 && (
              <div className="lg:hidden mt-12 pt-8 border-t border-border">
                <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest mb-3">
                  Páginas relacionadas
                </p>
                <div className="grid sm:grid-cols-2 gap-2">
                  {related.map(r => (
                    <Link
                      key={r.href}
                      to={r.href}
                      className="flex items-center gap-3 p-3 rounded-xl border border-border hover:border-primary/30 hover:bg-primary/5 transition-all group text-[13px] text-muted-foreground hover:text-foreground"
                    >
                      <div className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center flex-shrink-0">
                        <r.icon className="w-4 h-4" />
                      </div>
                      <span>{r.label}</span>
                      <ArrowRight className="w-3.5 h-3.5 ml-auto opacity-0 group-hover:opacity-100 transition-opacity" />
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {/* Back link */}
            <div className="mt-12 pt-6 border-t border-border">
              <Link
                to="/"
                className="inline-flex items-center gap-2 text-[13px] text-muted-foreground hover:text-primary transition-colors"
              >
                <ArrowLeft className="w-4 h-4" /> Voltar para a loja
              </Link>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
