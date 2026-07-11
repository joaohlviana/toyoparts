'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, MessageCircle, Phone, Search, ShoppingCart, Sparkles, User, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useCart } from '@/lib/cart-store';
import { getModelLinks } from '@/lib/catalog';
import { CartSheet } from '@/components/cart-sheet';

const WHATSAPP_URL = 'https://wa.me/554332941144?text=Ol%C3%A1%2C%20Toyoparts.';
const WHATSAPP_DISPLAY = '(43) 3294-1144';

export function PublicHeader() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [aiMode, setAiMode] = useState(false);
  const { totals, open: cartOpen, setOpen: setCartOpen } = useCart();

  const modelLinks = useMemo(() => getModelLinks(), []);

  return (
    <>
      <header className="relative z-50 w-full">
        <nav className="border-b border-black/[0.04] bg-[#fbfbfd]">
          <div className="hidden h-[64px] max-w-7xl mx-auto items-center gap-5 px-4 sm:px-6 lg:flex lg:px-8">
            <Link href="/" className="shrink-0" aria-label="Toyoparts Home">
              <img
                src="/brand/toyoparts-email-logo.svg"
                alt="Toyoparts"
                className="h-[28px] w-auto"
                width={230}
                height={28}
              />
            </Link>

            <form action="/busca" method="get" className="relative mx-auto max-w-[580px] min-w-0 flex-1">
              <div
                className={`relative flex h-[44px] items-center gap-2 rounded-full pl-4 pr-2 transition-all duration-300 ${
                  aiMode
                    ? 'bg-white shadow-[0_0_0_2px_rgba(147,51,234,0.12)]'
                    : 'bg-[#f5f5f7] hover:bg-[#ededf0] focus-within:bg-white focus-within:ring-2 focus-within:ring-primary/10'
                }`}
              >
                <div className="relative h-[18px] w-[18px] shrink-0">
                  <Search
                    className={`absolute inset-0 h-[18px] w-[18px] text-[#86868b] transition-all duration-300 ${
                      aiMode ? 'scale-75 rotate-[-90deg] opacity-0' : 'scale-100 rotate-0 opacity-100'
                    }`}
                    strokeWidth={2}
                  />
                  <Sparkles
                    className={`absolute inset-0 h-[18px] w-[18px] text-purple-500 transition-all duration-300 ${
                      aiMode ? 'scale-100 rotate-0 opacity-100' : 'scale-75 rotate-90 opacity-0'
                    }`}
                    strokeWidth={2}
                  />
                </div>
                <input
                  type="search"
                  name="q"
                  placeholder={aiMode ? 'Descreva o que você está procurando...' : 'Buscar peças, acessórios e mais...'}
                  className="h-full min-w-0 flex-1 bg-transparent text-[14px] font-medium text-[#1d1d1f] outline-none placeholder:text-[#86868b]/60"
                />
                <button
                  type="button"
                  onClick={() => setAiMode((value) => !value)}
                  className={`inline-flex h-8 items-center rounded-full px-3 text-[11px] font-semibold transition-colors ${
                    aiMode ? 'bg-purple-100 text-purple-700' : 'bg-white text-[#6e6e73] hover:text-[#1d1d1f]'
                  }`}
                >
                  IA
                </button>
              </div>
            </form>

            <Link
              href="/busca"
              className="flex h-[64px] shrink-0 items-center px-3 text-[12px] font-normal tracking-[0.005em] text-[#1d1d1f] opacity-80 transition-opacity hover:opacity-100"
            >
              Ofertas
            </Link>

            <a
              href={WHATSAPP_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="group/wa hidden shrink-0 cursor-pointer items-center rounded-full px-2.5 py-1.5 transition-all duration-300 hover:bg-[#25D366]/[0.08] xl:flex"
              aria-label="Fale conosco no WhatsApp"
            >
              <div className="relative mr-1.5 h-3.5 w-3.5 shrink-0">
                <Phone className="absolute inset-0 h-3.5 w-3.5 text-[#86868b] transition-all duration-300 group-hover/wa:scale-50 group-hover/wa:rotate-[-90deg] group-hover/wa:opacity-0" strokeWidth={1.5} />
                <MessageCircle className="absolute inset-0 h-3.5 w-3.5 scale-50 rotate-90 text-[#25D366] opacity-0 transition-all duration-300 group-hover/wa:scale-100 group-hover/wa:rotate-0 group-hover/wa:opacity-100" strokeWidth={1.8} />
              </div>
              <div className="relative h-[14px] overflow-hidden">
                <span className="block whitespace-nowrap text-[11px] font-normal leading-[14px] text-[#86868b] transition-all duration-300 group-hover/wa:-translate-y-full group-hover/wa:opacity-0">
                  {WHATSAPP_DISPLAY}
                </span>
                <span className="block translate-y-0 whitespace-nowrap text-[11px] font-semibold leading-[14px] text-[#25D366] opacity-0 transition-all duration-300 group-hover/wa:-translate-y-full group-hover/wa:opacity-100">
                  Fale por WhatsApp
                </span>
              </div>
            </a>

            <div className="flex shrink-0 items-center gap-0.5">
              <Link
                href="/acesso"
                className="flex h-9 w-9 items-center justify-center rounded-full text-[#1d1d1f]/70 transition-all hover:bg-black/[0.03] hover:text-[#1d1d1f]"
                aria-label="Conta"
              >
                <User className="h-[15px] w-[15px]" strokeWidth={1.8} />
              </Link>
              <button
                type="button"
                onClick={() => setCartOpen(true)}
                className="relative flex h-9 w-9 items-center justify-center rounded-full text-[#1d1d1f]/70 transition-all hover:bg-black/[0.03] hover:text-[#1d1d1f]"
                aria-label="Carrinho"
              >
                <ShoppingCart className="h-[15px] w-[15px]" strokeWidth={1.8} />
                {totals.totalQty > 0 && (
                  <span className="absolute right-0.5 top-0.5 flex h-[14px] w-[14px] items-center justify-center rounded-full bg-primary text-[8px] font-semibold leading-none text-white">
                    {totals.totalQty > 9 ? '9+' : totals.totalQty}
                  </span>
                )}
              </button>
            </div>
          </div>

          <div className="relative flex h-[56px] items-center justify-between px-4 lg:hidden">
            <div className="z-10 flex items-center gap-0.5">
              <button
                type="button"
                onClick={() => setMobileOpen((value) => !value)}
                className="flex h-10 w-10 items-center justify-center rounded-full text-[#1d1d1f]/70 transition-all active:scale-90"
                aria-label={mobileOpen ? 'Fechar menu' : 'Departamentos'}
              >
                {mobileOpen ? <X className="h-[18px] w-[18px]" strokeWidth={2} /> : <Menu className="h-[18px] w-[18px]" strokeWidth={1.8} />}
              </button>
              <Link
                href="/busca"
                className="flex h-10 w-10 items-center justify-center rounded-full text-[#1d1d1f]/70 transition-all active:scale-90"
                aria-label="Buscar"
              >
                <Search className="h-[18px] w-[18px]" strokeWidth={1.8} />
              </Link>
            </div>

            <Link href="/" className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2" aria-label="Toyoparts Home">
              <img
                src="/brand/toyoparts-email-logo.svg"
                alt="Toyoparts"
                className="h-[22px] w-auto"
                width={180}
                height={22}
              />
            </Link>

            <button
              type="button"
              onClick={() => setCartOpen(true)}
              className="z-10 flex h-10 w-10 items-center justify-center rounded-full text-[#1d1d1f]/70 transition-all active:scale-90"
              aria-label="Carrinho"
            >
              <ShoppingCart className="h-[17px] w-[17px]" strokeWidth={1.8} />
            </button>
          </div>
        </nav>

        <div className="border-b border-white/[0.06] bg-[#1d1d1f]">
          <div className="max-w-7xl mx-auto flex items-center px-4 sm:px-6 lg:px-8">
            <Link
              href="/pecas"
              className="hidden shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-white/50 transition-all hover:bg-white/[0.06] hover:text-white/80 lg:flex"
            >
              <Menu className="h-[14px] w-[14px]" strokeWidth={2} />
              <span className="hidden whitespace-nowrap text-[10px] font-medium tracking-[0.02em] xl:inline">Departamentos</span>
            </Link>

            <div className="hidden h-5 w-px shrink-0 bg-white/[0.08] lg:mx-3 lg:block" />

            <div className="no-scrollbar flex flex-1 items-center justify-start gap-1 overflow-x-auto py-1 sm:gap-1.5 lg:justify-center lg:gap-2">
              {modelLinks.map((model) => {
                const active = pathname === model.href || pathname?.startsWith(`${model.href}/`);
                return (
                  <Link
                    key={model.slug}
                    href={model.href}
                    className={`group relative flex shrink-0 flex-col items-center gap-1 rounded-xl px-3 py-2 transition-all duration-200 sm:px-4 lg:px-5 ${
                      active ? 'bg-white/[0.08]' : 'hover:bg-white/[0.04]'
                    }`}
                  >
                    <span
                      className={`whitespace-nowrap text-[9px] leading-none tracking-[0.02em] transition-colors sm:text-[10px] ${
                        active ? 'font-semibold text-white' : 'font-medium text-white/50 group-hover:text-white/80'
                      }`}
                    >
                      {model.name}
                    </span>
                    {active && <span className="absolute -bottom-0.5 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-primary" />}
                  </Link>
                );
              })}
            </div>
          </div>
        </div>

        {mobileOpen && (
          <div className="border-b border-black/[0.06] bg-white lg:hidden">
            <div className="max-w-7xl mx-auto space-y-4 px-4 py-4">
              <form action="/busca" method="get">
                <label className="relative flex w-full items-center">
                  <Search className="pointer-events-none absolute left-4 h-4 w-4 text-[#86868b]" />
                  <input
                    type="search"
                    name="q"
                    placeholder="Buscar no catálogo"
                    className="h-11 w-full rounded-2xl border border-border bg-[#f5f5f7] pl-11 pr-4 text-sm outline-none"
                  />
                </label>
              </form>
              <div className="grid grid-cols-2 gap-2">
                <Link href="/pecas" className="rounded-2xl border border-border px-3 py-3 text-sm font-medium text-foreground">Peças</Link>
                <Link href="/busca" className="rounded-2xl border border-border px-3 py-3 text-sm font-medium text-foreground">Ofertas</Link>
                <Link href="/acesso" className="rounded-2xl border border-border px-3 py-3 text-sm font-medium text-foreground">Entrar</Link>
                <a href={WHATSAPP_URL} className="rounded-2xl border border-border px-3 py-3 text-sm font-medium text-foreground">WhatsApp</a>
              </div>
            </div>
          </div>
        )}
      </header>

      <CartSheet open={cartOpen} onOpenChange={setCartOpen} />
    </>
  );
}
