import Link from 'next/link';
import type { StaticPageContent } from '@/lib/static-content';

export function StaticPage({ content }: { content: StaticPageContent }) {
  return (
    <div className="tp-shell-gradient">
      <section className="border-b border-border/60">
        <div className="max-w-6xl mx-auto px-4 py-14 sm:px-6 lg:px-8 lg:py-20">
          <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-primary">{content.eyebrow}</p>
          <h1 className="mt-4 max-w-3xl text-4xl font-black tracking-tight text-foreground md:text-5xl">
            {content.title.replace(' | Toyoparts', '')}
          </h1>
          <p className="mt-5 max-w-3xl text-base leading-8 text-muted-foreground md:text-lg">
            {content.intro}
          </p>
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
        <div className="grid gap-6 lg:grid-cols-[1.4fr_0.6fr]">
          <div className="space-y-6">
            {content.sections.map((section) => (
              <article key={section.title} className="rounded-[2rem] border border-border bg-white p-6 tp-soft-card sm:p-8">
                <h2 className="text-2xl font-black tracking-tight text-foreground">{section.title}</h2>
                <div className="mt-4 space-y-4 text-sm leading-7 text-muted-foreground sm:text-[15px]">
                  {section.body.map((paragraph) => (
                    <p key={paragraph.slice(0, 30)}>{paragraph}</p>
                  ))}
                </div>
              </article>
            ))}
          </div>

          <aside className="rounded-[2rem] border border-border bg-[#141416] p-6 text-white tp-soft-card sm:p-8">
            <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-white/50">Toyoparts</p>
            <h2 className="mt-4 text-2xl font-black tracking-tight">{content.ctaTitle || 'Fale com a equipe'}</h2>
            <p className="mt-4 text-sm leading-7 text-white/72">
              {content.ctaBody || 'Se você precisar de ajuda com catálogo, compatibilidade ou pedido, fale com a equipe comercial da Toyoparts.'}
            </p>
            <div className="mt-6 grid gap-3">
              <Link href="/pecas" className="inline-flex h-11 items-center justify-center rounded-2xl bg-primary px-4 text-sm font-bold text-white">
                Ir para o catálogo
              </Link>
              <Link href="/fale-conosco" className="inline-flex h-11 items-center justify-center rounded-2xl border border-white/15 px-4 text-sm font-semibold text-white">
                Canais de atendimento
              </Link>
            </div>
          </aside>
        </div>
      </section>
    </div>
  );
}
