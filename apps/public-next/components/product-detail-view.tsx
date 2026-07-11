'use client';

import Link from 'next/link';
import {
  AlertCircle,
  Ban,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Info,
  Loader2,
  Minus,
  Package,
  Phone,
  Plus,
  RotateCcw,
  Shield,
  Truck,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { useCart } from '@/lib/cart-store';
import type { CatalogHit, SeoProduct } from '@/lib/types';
import { ProductCard } from '@/components/product-card';
import { Breadcrumbs } from '@/components/breadcrumbs';
import { getModelById, slugify } from '@/lib/seo';
import { projectId, publicAnonKey } from '@/lib/supabase-info';

function formatCurrency(value: number | undefined | null) {
  return (value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function buildWhatsappUrl(product?: SeoProduct) {
  const message = product
    ? `Tenho interesse na peca ${product.sku} - ${product.name}.`
    : 'Tenho interesse em uma peca Toyota.';
  return `https://wa.me/554332941144?text=${encodeURIComponent(message)}`;
}

function formatTransitTime(days: number) {
  if (!days || days <= 0) return 'Prazo a confirmar';
  if (days === 1) return '1 dia util';
  return `${days} dias uteis`;
}

function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}

function ToyotaPlaceholder() {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center rounded-2xl border border-border bg-secondary text-muted-foreground">
      <Package className="h-12 w-12 opacity-40" />
      <span className="mt-3 text-xs font-bold uppercase tracking-[0.18em]">Imagem indisponivel</span>
    </div>
  );
}

function ShippingBox({
  sku,
  quantity,
  price,
  weight,
}: {
  sku: string;
  quantity: number;
  price: number;
  weight?: number | null;
}) {
  const [cep, setCep] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [quotes, setQuotes] = useState<Array<{
    id: string;
    name: string;
    carrier: string;
    price: number;
    originalPrice: number;
    deliveryDays: number;
    freeShipping?: boolean;
    message?: string | null;
    promotionApplied?: boolean;
    promotionDiscountPercent?: number;
    promotionMessage?: string | null;
  }>>([]);

  async function calculateShipping() {
    const cleanCep = cep.replace(/\D/g, '');
    if (cleanCep.length !== 8) {
      setError('Informe um CEP valido.');
      return;
    }

    setLoading(true);
    setError('');
    setQuotes([]);

    try {
      const response = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-1d6e33e0/frenet/quote`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${publicAnonKey}`,
          apikey: publicAnonKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          recipientCep: cleanCep,
          invoiceValue: price * quantity,
          items: [{
            sku,
            quantity,
            weight: weight || 0.5,
            price,
          }],
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error?.message || 'Nao foi possivel calcular o frete.');

      const nextQuotes = (data.quotes || []).slice(0, 3).map((quote: any) => ({
        id: quote.serviceCode || quote.serviceDescription,
        name: quote.serviceDescription || quote.carrier || 'Entrega',
        carrier: quote.carrier || '',
        price: Number(quote.price || 0),
        originalPrice: Number(quote.originalPrice ?? quote.price ?? 0),
        deliveryDays: Number(quote.deliveryDays || 0),
        freeShipping: quote.freeShipping === true,
        message: quote.message || null,
        promotionApplied: quote.promotionApplied === true,
        promotionDiscountPercent: Number(quote.promotionDiscountPercent || 0),
        promotionMessage: quote.promotionMessage || null,
      }));
      setQuotes(nextQuotes);
      if (nextQuotes.length === 0) setError('Nenhuma opcao de frete disponivel para este CEP.');
    } catch (err: any) {
      setError(err?.message || 'Nao foi possivel calcular o frete.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        calculateShipping();
      }}
    >
      <div className="flex gap-2">
        <input
          inputMode="numeric"
          name="cep"
          placeholder="Digite seu CEP"
          value={cep}
          onChange={(event) => setCep(event.target.value.replace(/\D/g, '').slice(0, 8))}
          className="h-11 min-w-0 flex-1 rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-primary"
        />
        <button type="submit" disabled={loading} className="h-11 rounded-xl bg-foreground px-4 text-xs font-bold uppercase tracking-wide text-background disabled:opacity-60">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'OK'}
        </button>
      </div>
      {error ? <p className="text-[11px] font-semibold text-destructive">{error}</p> : null}
      {quotes.length > 0 ? (
        <div className="space-y-2">
          {quotes.map((quote) => {
            const free = quote.freeShipping || quote.price === 0;
            const hasDePor = quote.originalPrice > quote.price;
            const promoMessage = quote.promotionMessage || quote.message;
            return (
              <div key={quote.id} className="rounded-xl border border-border bg-background p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="truncate text-xs font-bold text-foreground">{quote.name}</span>
                      {free ? (
                        <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700">
                          <CheckCircle2 className="h-3 w-3" />
                          Frete gratis aplicado
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">{formatTransitTime(quote.deliveryDays)}</p>
                    {promoMessage ? (
                      <p className={`mt-1 text-[11px] font-semibold ${quote.promotionApplied ? 'text-red-700' : 'text-emerald-700'}`}>
                        {promoMessage}
                      </p>
                    ) : null}
                  </div>
                  <div className="shrink-0 text-right tabular-nums">
                    {hasDePor ? (
                      <div className="mb-0.5 space-y-0.5">
                        <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                          De <span className="text-[11px] font-semibold line-through">{formatCurrency(quote.originalPrice)}</span>
                        </p>
                        {!free ? (
                          <p className="text-[10px] font-black uppercase tracking-wide text-red-700">Por</p>
                        ) : null}
                      </div>
                    ) : null}
                    <p className={`text-sm font-black ${free ? 'text-emerald-700' : quote.promotionApplied ? 'text-red-700' : 'text-foreground'}`}>
                      {free ? 'Gratis' : formatCurrency(quote.price)}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
      <a
        href="https://buscacepinter.correios.com.br/app/endereco/index.php"
        target="_blank"
        rel="noopener noreferrer"
        className="inline-block text-[10px] text-muted-foreground/70 underline underline-offset-4 hover:text-primary"
      >
        Nao sei meu CEP
      </a>
    </form>
  );
}

function FreeShippingPromoBanner({ promo }: { promo: SeoProduct['freeShippingPromo'] }) {
  if (!promo) return null;
  return (
    <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-950">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-emerald-700 shadow-sm">
          <Truck className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-black uppercase tracking-wide">Frete gratis para todo o Brasil.</p>
          <p className="mt-1 text-[11px] font-medium text-emerald-800">Faca a compra ou fale com um consultor por WhatsApp.</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="rounded-lg bg-white px-3 py-1.5 font-mono text-xs font-black tracking-widest text-emerald-800 shadow-sm">
              CUPOM {promo.couponCode}
            </span>
            <a href={promo.whatsappUrl} target="_blank" rel="noopener noreferrer" className="text-[11px] font-bold text-emerald-800 underline underline-offset-4">
              WhatsApp
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

function NewsletterStrip() {
  return (
    <section className="mb-20 rounded-2xl border border-border bg-card p-5 shadow-sm lg:mb-12">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary">Toyoparts</p>
          <h2 className="mt-1 text-lg font-bold uppercase tracking-tight text-foreground">Receba novidades e ofertas</h2>
          <p className="mt-1 text-sm text-muted-foreground">Pecas genuinas Toyota, alertas de estoque e oportunidades do catalogo.</p>
        </div>
        <form className="flex w-full max-w-md gap-2">
          <input
            type="email"
            placeholder="Seu e-mail"
            className="h-12 min-w-0 flex-1 rounded-xl border border-border bg-background px-4 text-sm outline-none focus:border-primary"
          />
          <button type="button" className="h-12 rounded-xl bg-primary px-5 text-sm font-bold text-white">
            Enviar
          </button>
        </form>
      </div>
    </section>
  );
}

export function ProductDetailView({
  product,
  relatedProducts,
}: {
  product: SeoProduct;
  relatedProducts: CatalogHit[];
}) {
  const [selectedImage, setSelectedImage] = useState(0);
  const [imgError, setImgError] = useState(false);
  const [quantity, setQuantity] = useState(1);
  const { addItem, setOpen } = useCart();

  const seoTitle = product.seo_title || product.name;
  const images = product.images?.length ? product.images : (product.image_url ? [product.image_url] : []);
  const currentSlug = product.url_key || slugify(product.name || '');
  const productWhatsappHref = buildWhatsappUrl(product);
  const freeShippingPromo = product.freeShippingPromo || null;

  const pricing = useMemo(() => {
    const price = product.price || 0;
    const specialPrice = product.special_price;
    const hasDiscount = specialPrice != null && specialPrice > 0 && specialPrice < price;
    const active = hasDiscount ? specialPrice : price;
    const pct = hasDiscount && price > 0 ? Math.round(((price - specialPrice) / price) * 100) : 0;
    const installments = active >= 300 ? 10 : active >= 100 ? 6 : active >= 30 ? 3 : 0;
    const installmentValue = installments > 0 ? active / installments : 0;
    return { price, active, hasDiscount, pct, installments, installmentValue };
  }, [product.price, product.special_price]);

  const breadcrumbs = useMemo(() => {
    const items = [{ href: '/pecas', label: 'Pecas' }];

    if (product.modelo_label) {
      const primaryModelLabel = product.modelo_label.split(',')[0]?.trim() || product.modelo_label;
      const model = getModelById(primaryModelLabel);
      if (model) items.push({ href: `/pecas/${model.slug}`, label: model.name });
    }

    if (product.category_names?.length) {
      const category = product.category_names[product.category_names.length - 1];
      items.push({ href: `/busca?category=${encodeURIComponent(category.id)}`, label: category.name });
    }

    items.push({ href: `/produto/${encodeURIComponent(product.sku)}/${currentSlug}`, label: product.name.slice(0, 50) });
    return items;
  }, [currentSlug, product]);

  function handleBuy() {
    addItem(
      {
        sku: product.sku,
        name: product.name,
        unitPrice: pricing.active,
        originalPrice: pricing.price,
        imageUrl: product.image_url || product.images?.[0] || '',
        weight: product.weight || 0.5,
        inStock: true,
      },
      quantity,
    );
    setOpen(true);
    toast.success('Produto adicionado ao carrinho');
  }

  return (
    <div className="min-h-screen bg-secondary">
      <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 sm:py-6 lg:px-8">
        <Breadcrumbs items={breadcrumbs} />

        {product.in_stock !== false ? (
          <div className="fixed bottom-4 left-4 right-4 z-50 flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-background/80 p-2 pl-4 shadow-[0_8px_32px_rgba(0,0,0,0.12)] ring-1 ring-black/5 backdrop-blur-xl lg:hidden">
            <div className="flex min-w-0 flex-col justify-center">
              <div className="text-lg font-bold leading-none tracking-tight text-foreground">{formatCurrency(pricing.active)}</div>
              {pricing.installments > 0 ? (
                <div className="mt-0.5 truncate text-[10px] font-medium text-muted-foreground">{pricing.installments}x sem juros</div>
              ) : null}
            </div>
            <div className="flex items-center gap-2">
              <a
                href={productWhatsappHref}
                target="_blank"
                rel="noopener noreferrer"
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-success/10 text-success transition-all hover:bg-success/20"
              >
                <WhatsAppIcon className="h-10 w-10 fill-current" />
              </a>
              <button
                type="button"
                onClick={handleBuy}
                className="flex h-12 items-center justify-center gap-2 rounded-xl bg-primary px-8 text-base font-bold text-primary-foreground shadow-xl shadow-primary/20 transition-all active:scale-95"
              >
                Comprar
              </button>
            </div>
          </div>
        ) : (
          <div className="fixed bottom-4 left-4 right-4 z-50 flex items-center justify-between gap-3 rounded-2xl border border-destructive/20 bg-background/80 p-3 px-4 shadow-[0_8px_32px_rgba(0,0,0,0.12)] ring-1 ring-destructive/10 backdrop-blur-xl lg:hidden">
            <div className="flex min-w-0 items-center gap-2.5">
              <Ban className="h-5 w-5 shrink-0 text-destructive" />
              <div className="flex min-w-0 flex-col">
                <span className="text-sm font-bold text-destructive">Esgotado</span>
                <span className="truncate text-[10px] text-muted-foreground">Ligue para consultar</span>
              </div>
            </div>
            <a href="tel:+554332941144" className="flex h-12 shrink-0 items-center gap-2 rounded-xl bg-foreground px-6 font-bold text-background">
              <Phone className="h-4 w-4" />
              (43) 3294-1144
            </a>
          </div>
        )}

        <section className="mb-4 mt-4 overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
          <div className="grid grid-cols-1 lg:grid-cols-12">
            <div className="border-b border-border/60 bg-secondary/5 p-0 lg:col-span-5 lg:border-b-0 lg:border-r">
              <div className="relative mb-2 flex aspect-[4/3] items-center justify-center bg-transparent sm:aspect-square">
                <div className="absolute left-0 top-0 z-10">
                  <span className="inline-flex rounded-none rounded-br-xl bg-primary px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-primary-foreground shadow-sm">
                    Toyota Genuine Parts
                  </span>
                </div>

                {product.modelo_label ? (
                  <div className="absolute bottom-4 left-4 z-10 max-w-[85%] rounded-xl border border-border/60 bg-background/90 p-3 shadow-md backdrop-blur-md">
                    <span className="mb-0.5 block text-base font-bold uppercase tracking-tight text-foreground sm:text-lg">{product.modelo_label}</span>
                    {product.ano_labels ? (
                      <span className="block text-[10px] font-medium uppercase tracking-wide text-muted-foreground sm:text-xs">
                        {product.ano_labels.split(',').join(' - ')}
                      </span>
                    ) : null}
                  </div>
                ) : null}

                {images.length > 0 && !imgError ? (
                  <div className="flex h-full w-full items-center justify-center p-4">
                    <img
                      src={images[selectedImage]}
                      alt={seoTitle}
                      className="max-h-full max-w-full object-contain mix-blend-multiply transition-opacity duration-300"
                      onError={() => setImgError(true)}
                    />
                  </div>
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-white p-6 sm:p-10">
                    <ToyotaPlaceholder />
                  </div>
                )}

                {images.length > 1 ? (
                  <>
                    <button
                      type="button"
                      onClick={() => setSelectedImage((value) => Math.max(0, value - 1))}
                      disabled={selectedImage === 0}
                      className="absolute left-2 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-background/80 text-foreground shadow-sm backdrop-blur-sm transition hover:bg-background disabled:opacity-40"
                    >
                      <ChevronLeft className="h-5 w-5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedImage((value) => Math.min(images.length - 1, value + 1))}
                      disabled={selectedImage === images.length - 1}
                      className="absolute right-2 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-background/80 text-foreground shadow-sm backdrop-blur-sm transition hover:bg-background disabled:opacity-40"
                    >
                      <ChevronRight className="h-5 w-5" />
                    </button>
                  </>
                ) : null}
              </div>

              {images.length > 1 ? (
                <div className="flex gap-3 overflow-x-auto px-2 pb-2">
                  {images.map((image, index) => (
                    <button
                      key={`${image}-${index}`}
                      type="button"
                      onClick={() => setSelectedImage(index)}
                      className={`h-20 w-20 flex-shrink-0 overflow-hidden rounded-xl border-2 bg-background transition-all ${
                        index === selectedImage ? 'border-primary shadow-md' : 'border-border hover:border-muted-foreground/40'
                      }`}
                    >
                      <img src={image} alt="" className="h-full w-full object-contain p-2" />
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            <div className="flex flex-col border-b border-border/60 p-4 lg:col-span-4 lg:border-b-0 lg:border-r lg:p-6">
              <div className="mb-4">
                <h1 className="mb-2 text-lg font-bold uppercase leading-tight tracking-tight text-foreground sm:text-2xl lg:text-3xl">
                  {seoTitle}
                </h1>
                <div className="mb-3 flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-1.5 rounded-md border border-border/50 bg-muted px-2 py-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">SKU</span>
                    <span className="text-[11px] font-bold text-foreground">{product.sku}</span>
                  </div>
                  {product.status === 1 || product.status == null ? (
                    <span className="inline-flex h-auto items-center gap-1.5 rounded-md border border-[#EB0A1E] bg-[#EB0A1E] px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-white shadow-sm">
                      Peca Genuina
                    </span>
                  ) : null}
                </div>
              </div>

              <div className="mb-4 lg:hidden">
                {pricing.hasDiscount ? (
                  <div className="mb-1 flex items-center gap-2">
                    <span className="text-sm font-medium text-muted-foreground line-through opacity-60">{formatCurrency(pricing.price)}</span>
                    <span className="rounded-md bg-success px-2 py-0.5 text-[10px] font-bold text-success-foreground">-{pricing.pct}%</span>
                  </div>
                ) : null}
                <div className="mb-2 text-3xl font-bold tracking-tight text-foreground">{formatCurrency(pricing.active)}</div>
                {pricing.installments > 0 ? (
                  <div className="flex items-center gap-1.5 text-left text-xs font-medium text-muted-foreground">
                    <span className="font-bold text-foreground">{pricing.installments}x</span> de{' '}
                    <span className="font-bold text-foreground">{formatCurrency(pricing.installmentValue)}</span>
                    <span className="ml-1.5 text-[9px] font-bold uppercase tracking-tighter text-success">Sem juros</span>
                  </div>
                ) : null}
              </div>

              <div className="mt-4 flex items-center gap-6 border-t border-border/60 pt-4">
                {[
                  { label: 'Detalhes', icon: Info },
                  { label: 'Troca Facil', icon: RotateCcw },
                  { label: 'Garantia', icon: Shield },
                ].map((item) => (
                  <div key={item.label} className="group flex cursor-pointer flex-col items-center gap-2 text-center">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-transparent bg-muted shadow-sm transition-all duration-300 group-hover:border-primary/20 group-hover:bg-primary/10 group-hover:text-primary">
                      <item.icon className="h-4 w-4" />
                    </div>
                    <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground transition-colors group-hover:text-foreground">
                      {item.label}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <aside className="hidden h-fit flex-col self-start bg-transparent p-6 lg:col-span-3 lg:flex">
              {product.in_stock === false ? (
                <div className="space-y-5">
                  <div className="space-y-3 rounded-xl border border-destructive/20 bg-destructive/5 p-5 text-center">
                    <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-destructive/10">
                      <Ban className="h-7 w-7 text-destructive" />
                    </div>
                    <div>
                      <p className="text-xl font-bold uppercase tracking-tight text-destructive">Produto Esgotado</p>
                      <p className="mt-1 text-sm text-muted-foreground">Este produto esta temporariamente indisponivel para compra online.</p>
                    </div>
                  </div>
                  <a href="tel:+554332941144" className="group flex items-center gap-4 rounded-xl border-2 border-foreground/10 bg-foreground/[0.02] p-4 transition-all hover:bg-foreground/[0.05]">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 transition-transform group-hover:scale-110">
                      <Phone className="h-6 w-6 text-primary" />
                    </div>
                    <div>
                      <span className="block text-sm font-bold text-foreground">Ligue para consultar</span>
                      <span className="block text-lg font-bold tracking-tight text-primary">(43) 3294-1144</span>
                    </div>
                  </a>
                </div>
              ) : (
                <>
                  <div className="mb-4">
                    {pricing.hasDiscount ? (
                      <div className="mb-0.5 flex items-center gap-2">
                        <span className="text-xs font-medium text-muted-foreground line-through decoration-muted-foreground/40">{formatCurrency(pricing.price)}</span>
                        <span className="h-5 rounded border border-success/20 bg-success/10 px-1.5 py-0 text-[10px] font-bold text-success shadow-none">
                          {pricing.pct}% OFF
                        </span>
                      </div>
                    ) : null}
                    <div className="mb-3 text-3xl font-bold leading-none tracking-tight text-foreground">{formatCurrency(pricing.active)}</div>
                    {pricing.installments > 0 ? (
                      <div className="border-t border-border/60 pt-3">
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <span className="text-xs font-medium text-foreground">
                            {pricing.installments}x de <span className="font-bold">{formatCurrency(pricing.installmentValue)}</span>
                          </span>
                          <span className="text-[9px] font-bold uppercase tracking-wider text-success">Sem juros</span>
                        </div>
                      </div>
                    ) : null}
                  </div>

                  <div className="mb-5 flex flex-col gap-4">
                    <FreeShippingPromoBanner promo={freeShippingPromo} />

                    <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Selecione a quantidade</div>
                    <div className="flex items-center gap-3">
                      <div className="flex h-11 w-28 shrink-0 items-center rounded-xl border border-border bg-background p-1">
                        <button type="button" onClick={() => setQuantity((value) => Math.max(1, value - 1))} className="flex h-full flex-1 items-center justify-center rounded-lg text-muted-foreground transition-all hover:bg-muted">
                          <Minus className="h-4 w-4" />
                        </button>
                        <span className="w-8 text-center text-sm font-bold text-foreground">{quantity}</span>
                        <button type="button" onClick={() => setQuantity((value) => value + 1)} className="flex h-full flex-1 items-center justify-center rounded-lg text-primary transition-all hover:bg-muted">
                          <Plus className="h-4 w-4" />
                        </button>
                      </div>
                      <button type="button" onClick={handleBuy} className="h-11 flex-1 rounded-xl bg-primary text-sm font-bold uppercase tracking-wide text-primary-foreground transition-all hover:bg-primary/90 active:scale-[0.98]">
                        Comprar
                      </button>
                    </div>
                  </div>

                  <a href={productWhatsappHref} target="_blank" rel="noopener noreferrer" className="group mb-5 flex items-center gap-3 rounded-xl border border-border bg-secondary/10 p-4 transition-all hover:bg-secondary/20">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-success/20 bg-success/10 transition-transform group-hover:scale-110">
                      <WhatsAppIcon className="h-5 w-5 fill-success" />
                    </div>
                    <div className="flex flex-col overflow-hidden">
                      <span className="truncate text-[11px] font-bold uppercase tracking-tight text-foreground">Duvidas sobre a peca?</span>
                      <span className="truncate text-[10px] font-medium text-muted-foreground">Chame um consultor Toyota</span>
                    </div>
                  </a>

                  <div className="border-t border-border pt-5">
                    <div className="mb-4 flex items-center gap-2">
                      <Truck className="h-4 w-4 text-muted-foreground" />
                      <span className="text-[11px] font-bold uppercase tracking-wider text-foreground">Simular Prazo de Entrega</span>
                    </div>
                    <ShippingBox sku={product.sku} quantity={quantity} price={pricing.active} weight={product.weight} />
                  </div>
                </>
              )}
            </aside>
          </div>
        </section>

        {product.in_stock === false ? (
          <section className="mb-6 space-y-4 lg:hidden">
            <div className="space-y-3 rounded-2xl border border-destructive/20 bg-destructive/5 p-5 text-center">
              <Ban className="mx-auto h-8 w-8 text-destructive" />
              <p className="text-lg font-bold uppercase tracking-tight text-destructive">Produto Esgotado</p>
              <p className="text-sm text-muted-foreground">Indisponivel para compra online. Entre em contato.</p>
            </div>
          </section>
        ) : (
          <section className="mb-6 space-y-4 lg:hidden">
            <div className="flex flex-col gap-3">
              <label className="ml-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Quantidade</label>
              <div className="flex h-12 w-full items-center rounded-xl border border-border bg-card px-1 shadow-sm">
                <button type="button" onClick={() => setQuantity((value) => Math.max(1, value - 1))} className="flex h-full flex-1 items-center justify-center text-muted-foreground transition-colors hover:bg-muted">
                  <Minus className="h-4 w-4" />
                </button>
                <span className="w-12 text-center text-base font-bold text-foreground">{quantity}</span>
                <button type="button" onClick={() => setQuantity((value) => value + 1)} className="flex h-full flex-1 items-center justify-center text-primary transition-colors hover:bg-muted">
                  <Plus className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
              {freeShippingPromo ? (
                <div className="mb-4">
                  <FreeShippingPromoBanner promo={freeShippingPromo} />
                </div>
              ) : null}
              <div className="mb-4 flex items-center gap-2">
                <Truck className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs font-bold uppercase tracking-widest text-foreground">Simular Frete</span>
              </div>
              <ShippingBox sku={product.sku} quantity={quantity} price={pricing.active} weight={product.weight} />
            </div>
          </section>
        )}

        <section className="mb-6 rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-6 lg:p-8">
          <div className="mb-6 flex items-center gap-3 border-b border-border/60 pb-4">
            <Package className="h-6 w-6 text-primary" />
            <h2 className="text-lg font-bold uppercase tracking-tight text-foreground sm:text-xl">Informacoes Tecnicas</h2>
          </div>
          <div className="grid grid-cols-1 gap-6 sm:gap-12 lg:grid-cols-3">
            <div className="max-w-none text-muted-foreground lg:col-span-2">
              <div className="mb-6 rounded-xl border border-border/50 bg-secondary/20 p-4">
                <div className="space-y-1 text-sm">
                  <p className="mb-2 text-base font-bold text-foreground">{seoTitle}</p>
                  <p className="flex items-center gap-2">
                    <span className="text-muted-foreground">Codigo SKU:</span>
                    <span className="font-bold text-foreground">{product.sku}</span>
                  </p>
                  {product.modelo_label ? (
                    <p className="flex items-center gap-2">
                      <span className="text-muted-foreground">Compatibilidade:</span>
                      <span className="font-bold text-foreground">{product.modelo_label} {product.ano_labels}</span>
                    </p>
                  ) : null}
                </div>
              </div>
              {product.description ? (
                <div className="text-sm leading-relaxed [&_strong]:text-foreground" dangerouslySetInnerHTML={{ __html: product.description }} />
              ) : (
                <p className="text-sm italic text-muted-foreground/60">Nenhuma descricao tecnica detalhada disponivel para este produto.</p>
              )}
            </div>

            <div className="h-fit rounded-2xl border border-border/60 bg-muted/30 p-5">
              <div className="mb-4 border-b border-border/60 pb-3 text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Politicas e Garantia</div>
              <div className="space-y-4">
                {[
                  ['Garantia de Fabrica', 'Cobertura de 3 meses contra defeitos de fabricacao.', Shield, 'text-primary'],
                  ['Instalacao Profissional', 'Recomendamos instaladores credenciados para evitar perda de garantia.', AlertCircle, 'text-warning'],
                  ['Imagens e Versoes', 'Fotos meramente ilustrativas. Valor referente a uma unidade.', Info, 'text-muted-foreground'],
                ].map(([title, body, Icon, color]) => (
                  <div key={String(title)} className="flex gap-3">
                    <Icon className={`h-4 w-4 shrink-0 ${color}`} />
                    <div>
                      <p className="mb-1 text-xs font-bold uppercase tracking-tighter text-foreground">{title as string}</p>
                      <p className="text-[11px] leading-relaxed text-muted-foreground">{body as string}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="group relative mb-6 flex flex-col items-center justify-between gap-6 overflow-hidden rounded-2xl bg-foreground p-5 text-center shadow-xl sm:p-8 lg:flex-row lg:text-left">
          <div className="absolute right-0 top-0 -mr-32 -mt-32 h-64 w-64 rounded-full bg-primary/10 blur-3xl transition-all duration-700 group-hover:bg-primary/20" />
          <div className="z-10 flex flex-col items-center gap-6 lg:flex-row">
            <div className="flex h-16 w-16 rotate-3 items-center justify-center rounded-2xl bg-primary text-white shadow-2xl shadow-primary/40 transition-transform group-hover:rotate-0 sm:h-20 sm:w-20">
              <WhatsAppIcon className="h-8 w-8 fill-current sm:h-10 sm:w-10" />
            </div>
            <div>
              <h3 className="mb-2 text-xl font-bold uppercase tracking-tight text-white sm:text-2xl md:text-3xl">Ainda tem duvidas?</h3>
              <p className="max-w-md text-sm font-medium text-white/70 sm:text-lg">Nossos especialistas Toyota verificam a compatibilidade exata pelo chassi do seu veiculo.</p>
            </div>
          </div>
          <a href={productWhatsappHref} target="_blank" rel="noopener noreferrer" className="z-10 h-14 shrink-0 rounded-xl bg-primary px-10 py-4 text-lg font-bold text-primary-foreground shadow-lg shadow-primary/20 transition-all hover:bg-primary/90 active:scale-95">
            Falar no WhatsApp
          </a>
        </section>

        <NewsletterStrip />

        {relatedProducts.length > 0 ? (
          <section className="pb-16">
            <div className="mb-6">
              <h2 className="text-2xl font-black tracking-tight text-foreground">Quem viu, viu tambem</h2>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {relatedProducts.map((related) => (
                <ProductCard key={related.sku} product={related} />
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}
