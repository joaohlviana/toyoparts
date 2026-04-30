import React from 'react';
import { Link } from 'react-router';
import { SEOHead } from '../components/seo/SEOHead';

export function NotFoundPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-24 text-center">
      <SEOHead
        title="Página não encontrada"
        description="A página que você tentou acessar não foi encontrada na Toyoparts."
        robots="noindex,follow"
        canonical="/404"
      />

      <span className="inline-flex items-center rounded-full bg-muted px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        Erro 404
      </span>
      <h1 className="mt-5 text-3xl sm:text-4xl font-bold tracking-tight text-foreground">
        Não encontramos esta página
      </h1>
      <p className="mt-3 text-sm sm:text-base text-muted-foreground max-w-2xl mx-auto">
        O link pode ter mudado ou a página não existe mais. Vamos te levar de volta para áreas válidas do catálogo.
      </p>

      <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
        <Link
          to="/"
          className="inline-flex h-11 items-center justify-center rounded-xl bg-[#1d1d1f] px-5 text-sm font-semibold text-white transition-transform active:scale-[0.98]"
        >
          Ir para a home
        </Link>
        <Link
          to="/pecas"
          className="inline-flex h-11 items-center justify-center rounded-xl border border-border bg-background px-5 text-sm font-semibold text-foreground transition-transform active:scale-[0.98]"
        >
          Ver catálogo
        </Link>
      </div>
    </div>
  );
}
