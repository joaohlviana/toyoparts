import React, { useState, useEffect, useMemo } from 'react';
import { useParams, Link } from 'react-router';
import { toast } from 'sonner';
import {
  Package, ShoppingCart, Heart, Share2, Truck, Shield, RotateCcw,
  ChevronLeft, ChevronRight, Minus, Plus, Star, Check, Copy,
  Loader2, AlertCircle, Car, Calendar, Info, Ruler, ArrowRight,
  Phone, Ban
} from 'lucide-react';
import { projectId, publicAnonKey } from '../../../utils/supabase/info';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Input } from '../components/ui/input';
import { Breadcrumbs, BreadcrumbItem } from '../components/seo/Breadcrumbs';
import { SEOHead } from '../components/seo/SEOHead';
import { slugify, generateProductJsonLd, SITE_NAME, getModelById } from '../seo-config';
import { useCart } from '../lib/cart/cart-store';
import { ShippingCalculator } from '../components/ShippingCalculator';
import { ToyotaPlaceholder } from '../components/ToyotaPlaceholder';
import { copyToClipboard } from '../utils/clipboard';
import { trackProductView, trackAddToCartSI } from '../lib/search-intelligence-api';
import { RelatedProductsByView } from '../components/RelatedProductsByView';
import { NewsletterBanner } from '../components/newsletter/NewsletterBanner';
import { cacheProductData, getCachedProduct, cacheSnapshot } from '../lib/product-cache';
import { Skeleton } from '../components/ui/skeleton';

const API = `https://${projectId}.supabase.co/functions/v1/make-server-1d6e33e0`;
const HEADERS: HeadersInit = {
  Authorization: `Bearer ${publicAnonKey}`,
  apikey: publicAnonKey,
  'Content-Type': 'application/json',
};

// ─── Types ──────────────────────────────────────────────────────────────────

interface ProductData {
  sku: string;
  name: string;
  seo_title?: string;
  meta_description?: string;
  url_key?: string;
  price: number;
  special_price?: number | null;
  status: number;
  in_stock: boolean;
  weight?: number | null;
  description?: string;
  short_description?: string;
  image_url?: string;
  images?: string[];
  category_names?: { id: string; name: string; path: string }[];
  modelo_label?: string | null;
  ano_labels?: string | null;
  compat_models?: {
    codigo: string;
    modelo: string;
    motor: string;
    trim: string;
    cambio: string;
    anos: string[];
  }[];
  bullet_points?: string[];
  tags_seo?: string[];
}

// ─── WhatsApp SVG Icon ──────────────────────────────────────────────────────
function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
    </svg>
  );
}

// ─── Component ───────────────────────────────────────────────────────────────

export function ProductDetailPage() {
  const { sku } = useParams<{ sku: string; slug?: string }>();
  const [product, setProduct] = useState<ProductData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedImage, setSelectedImage] = useState(0);
  const [imgError, setImgError] = useState(false);
  const [quantity, setQuantity] = useState(1);
  const [isFav, setIsFav] = useState(false);
  const [copiedSku, setCopiedSku] = useState(false);
  const [cep, setCep] = useState('');

  const { addItem, setOpen } = useCart();

  const ProductDetailSkeleton = () => (
    <div className="min-h-screen bg-secondary animate-in fade-in duration-300">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 space-y-4">
        <Skeleton className="h-4 w-56" />
        <div className="bg-card rounded-2xl shadow-sm border border-border overflow-hidden">
          <div className="grid grid-cols-1 lg:grid-cols-12">
            <div className="lg:col-span-5 border-b lg:border-b-0 lg:border-r border-border/60 p-4 sm:p-5 bg-secondary/5">
              <Skeleton className="aspect-[4/3] sm:aspect-square w-full rounded-2xl" />
              <div className="flex gap-3 mt-3">
                {[...Array(4)].map((_, index) => (
                  <Skeleton key={index} className="w-20 h-20 rounded-xl" />
                ))}
              </div>
            </div>

            <div className="lg:col-span-4 p-4 lg:p-6 space-y-4 border-b lg:border-b-0 lg:border-r border-border/60">
              <Skeleton className="h-8 w-[85%]" />
              <Skeleton className="h-5 w-[65%]" />
              <div className="flex gap-2">
                <Skeleton className="h-7 w-28 rounded-md" />
                <Skeleton className="h-7 w-24 rounded-md" />
              </div>
              <Skeleton className="h-24 w-full rounded-2xl" />
              <div className="grid grid-cols-3 gap-3">
                {[...Array(3)].map((_, index) => (
                  <Skeleton key={index} className="h-20 rounded-xl" />
                ))}
              </div>
            </div>

            <div className="lg:col-span-3 p-4 lg:p-6 space-y-4">
              <Skeleton className="h-10 w-32" />
              <Skeleton className="h-7 w-40" />
              <Skeleton className="h-28 w-full rounded-2xl" />
              <Skeleton className="h-11 w-full rounded-xl bg-muted/80" />
              <Skeleton className="h-11 w-full rounded-xl bg-muted/70" />
            </div>
          </div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Skeleton className="h-40 rounded-2xl lg:col-span-2" />
          <Skeleton className="h-40 rounded-2xl" />
        </div>
      </div>
    </div>
  );

  useEffect(() => {
    if (!sku) return;
    setLoading(true);
    setError(null);
    setImgError(false);
    fetch(`${API}/seo/product/${encodeURIComponent(sku)}`, { headers: HEADERS })
      .then(async r => {
        if (!r.ok) {
          const text = await r.text();
          console.error(`[PDP] HTTP ${r.status}:`, text);
          throw new Error(`HTTP ${r.status}: ${text.slice(0, 200)}`);
        }
        return r.json();
      })
      .then(data => {
        if (data.error) throw new Error(data.error);
        setProduct(data);
        // Cache for offline access (fire-and-forget)
        cacheProductData(sku, data).catch(() => {});
        // Also prefetch the SSG snapshot in the background
        fetch(`${API}/snapshot/product/${encodeURIComponent(sku)}`, { headers: HEADERS })
          .then(r => r.ok ? r.text() : null)
          .then(html => html && cacheSnapshot(sku, html))
          .catch(() => {});
      })
      .catch(async e => {
        console.error('[PDP] Error loading product:', e);
        // Try offline cache fallback
        const cached = await getCachedProduct(sku).catch(() => null);
        if (cached) {
          console.log('[PDP] Using cached product data (offline)');
          setProduct(cached);
        } else {
          setError(e.message);
        }
      })
      .finally(() => setLoading(false));
  }, [sku]);

  // Track product view (server handles 15min dedupe per SKU+session)
  useEffect(() => {
    if (!product?.sku) return;
    // Determine source from URL referrer
    const params = new URLSearchParams(window.location.search);
    const refQuery = params.get('q') || undefined;
    const source = refQuery ? 'search'
      : document.referrer.includes('/busca') ? 'search'
      : document.referrer.includes('/produto/') ? 'related'
      : 'direct';
    trackProductView({
      product_sku: product.sku,
      source,
      ref_query_normalized: refQuery,
      metadata: { name: product.name, price: product.price },
    });
  }, [product?.sku]);

  // Price calculations
  const pricing = useMemo(() => {
    if (!product) return null;
    const price = product.price || 0;
    const sp = product.special_price;
    const hasDiscount = sp != null && sp > 0 && sp < price;
    const active = hasDiscount ? sp : price;
    const pct = hasDiscount ? Math.round(((price - sp!) / price) * 100) : 0;
    const installments = active >= 300 ? 10 : active >= 100 ? 6 : active >= 30 ? 3 : 0;
    const installmentValue = installments > 0 ? active / installments : 0;
    return { price, active, hasDiscount, pct, installments, installmentValue };
  }, [product]);

  // Breadcrumbs
  const breadcrumbs = useMemo<BreadcrumbItem[]>(() => {
    if (!product) return [];
    const items: BreadcrumbItem[] = [{ label: 'Pecas', href: '/pecas' }];
    if (product.modelo_label) {
      const model = getModelById(product.modelo_label);
      if (model) items.push({ label: model.name, href: `/pecas/${model.slug}` });
    }
    if (product.category_names?.length) {
      const cat = product.category_names[product.category_names.length - 1];
      items.push({ label: cat.name, href: `/busca?category=${encodeURIComponent(cat.id)}` });
    }
    items.push({ label: product.name.slice(0, 50), href: `/produto/${product.sku}/${product.url_key || slugify(product.name)}` });
    return items;
  }, [product]);

  // JSON-LD
  const jsonLd = useMemo(() => {
    if (!product) return null;
    return generateProductJsonLd({
      sku: product.sku,
      name: product.name,
      seo_title: product.seo_title,
      description: product.description,
      price: product.price,
      special_price: product.special_price,
      image_url: product.image_url,
      in_stock: product.in_stock,
      url_key: product.url_key,
      modelo_label: product.modelo_label || undefined,
      ano_labels: product.ano_labels || undefined,
    });
  }, [product]);

  const images = product?.images?.length ? product.images : (product?.image_url ? [product.image_url] : []);

  const handleCopySku = async () => {
    if (!product) return;
    await copyToClipboard(product.sku);
    setCopiedSku(true);
    setTimeout(() => setCopiedSku(false), 2000);
  };

  const handleBuy = () => {
    if (!product || !pricing) return;
    addItem({
      sku: product.sku,
      name: product.name,
      unitPrice: pricing.active,
      originalPrice: pricing.price,
      imageUrl: product.image_url || product.images?.[0] || '',
      weight: product.weight || 0.5,
    }, quantity);
    setOpen(true);
    toast.success('Produto adicionado ao carrinho!');
    // Track ATC for conversion funnel (fire-and-forget)
    trackAddToCartSI({ product_sku: product.sku, source: 'pdp' });
  };

  // ─── Loading ────────────────────────────────────────────────────────────
  if (loading) {
    return <ProductDetailSkeleton />;
  }

  // ─── Error ──────────────────────────────────────────────────────────────
  if (error || !product) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-4 max-w-md bg-card p-8 rounded-lg shadow-sm border border-border">
            <AlertCircle className="w-12 h-12 text-muted-foreground/40 mx-auto" />
            <h2 className="text-lg font-semibold text-foreground">Produto nao encontrado</h2>
            <p className="text-sm text-muted-foreground">{error || 'O produto solicitado nao existe ou foi removido.'}</p>
            <Link to="/pecas">
              <Button variant="outline"><ChevronLeft className="w-4 h-4 mr-1" /> Voltar para Pecas</Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const seoTitle = product.seo_title || product.name;
  const metaDesc = product.meta_description || product.short_description || `${product.name} - Peca genuina Toyota. Compre na ${SITE_NAME} com garantia.`;

  return (
    <>
      <SEOHead
        title={seoTitle}
        description={metaDesc}
        canonical={`/produto/${product.sku}/${product.url_key || slugify(product.name)}`}
        robots="index,follow"
        ogType="product"
        ogImage={product.image_url}
        jsonLd={jsonLd || undefined}
      />

      <div className="min-h-screen bg-secondary">
        
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6">
          <Breadcrumbs items={breadcrumbs} className="mb-4" />

          {/* ── Mobile: Price sticky bar (visible below lg) ── */}
          {product.in_stock !== false && (
          <div className="fixed bottom-4 left-4 right-4 z-50 lg:hidden bg-background/80 backdrop-blur-xl rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.12)] border border-white/10 p-2 pl-4 flex items-center justify-between gap-3 animate-in fade-in slide-in-from-bottom-4 duration-300 ring-1 ring-black/5">
            <div className="flex flex-col justify-center min-w-0">
              {pricing && (
                <>
                  <div className="text-lg font-bold text-foreground tracking-tight leading-none">
                    {pricing.active.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                  </div>
                  {pricing.installments > 0 && (
                    <div className="text-[10px] text-muted-foreground font-medium truncate mt-0.5">
                      {pricing.installments}x sem juros
                    </div>
                  )}
                </>
              )}
            </div>
            
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                className="h-12 w-12 rounded-xl bg-success/10 text-success hover:bg-success/20 transition-all shrink-0"
                asChild
              >
                <a href="https://wa.me/554332941144" target="_blank" rel="noopener noreferrer">
                  <WhatsAppIcon className="w-10 h-10 fill-current" />
                </a>
              </Button>
              <Button 
                onClick={handleBuy}
                className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold h-12 px-8 rounded-xl shadow-xl shadow-primary/20 flex items-center justify-center gap-2 active:scale-95 transition-all text-base"
              >
                Comprar
              </Button>
            </div>
          </div>
          )}

          {/* ── Mobile: Esgotado sticky bar ── */}
          {product.in_stock === false && (
          <div className="fixed bottom-4 left-4 right-4 z-50 lg:hidden bg-background/80 backdrop-blur-xl rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.12)] border border-destructive/20 p-3 px-4 flex items-center justify-between gap-3 animate-in fade-in slide-in-from-bottom-4 duration-300 ring-1 ring-destructive/10">
            <div className="flex items-center gap-2.5 min-w-0">
              <Ban className="w-5 h-5 text-destructive shrink-0" />
              <div className="flex flex-col min-w-0">
                <span className="text-sm font-bold text-destructive">Esgotado</span>
                <span className="text-[10px] text-muted-foreground truncate">Ligue para consultar</span>
              </div>
            </div>
            <Button asChild className="bg-foreground hover:bg-foreground/90 text-background font-bold h-12 px-6 rounded-xl flex items-center gap-2 shrink-0">
              <a href="tel:+554332941144">
                <Phone className="w-4 h-4" />
                (43) 3294-1144
              </a>
            </Button>
          </div>
          )}
          
          {/* ── Main Product Card ── */}
          <div className="bg-card rounded-2xl shadow-sm border border-border overflow-hidden mb-4">
            <div className="grid grid-cols-1 lg:grid-cols-12">
              
              {/* ── Left: Image Gallery (5 cols) ── */}
              <div className="lg:col-span-5 border-b lg:border-b-0 lg:border-r border-border/60 bg-secondary/5 p-[0px]">
                <div className="relative aspect-[4/3] sm:aspect-square mb-2 flex items-center justify-center bg-transparent">
                    {/* Overlays */}
                    <div className="absolute top-0 left-0 z-10">
                        <Badge className="bg-primary text-primary-foreground border-0 rounded-none rounded-br-xl px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest shadow-sm">
                            Toyota Genuine Parts
                        </Badge>
                    </div>
                    {product.modelo_label && (
                       <div className="absolute bottom-4 left-4 z-10 bg-background/90 backdrop-blur-md border border-border/60 rounded-xl p-3 shadow-md max-w-[85%]">
                           <span className="font-bold block text-foreground text-base sm:text-lg uppercase tracking-tight mb-0.5">{product.modelo_label}</span>
                           {product.ano_labels && (
                             <span className="block text-[10px] sm:text-xs text-muted-foreground font-medium uppercase tracking-wide">
                               {product.ano_labels.split(',').join(' • ')}
                             </span>
                           )}
                       </div>
                    )}

                    {/* Main Image */}
                    {images.length > 0 && !imgError ? (
                        <div className="w-full h-full p-4 flex items-center justify-center">
                          <img
                            src={images[selectedImage]}
                            alt={seoTitle}
                            className="max-w-full max-h-full object-contain mix-blend-multiply transition-opacity duration-300"
                            onError={() => setImgError(true)}
                          />
                        </div>
                    ) : (
                        <div className="w-full h-full p-6 sm:p-10 flex items-center justify-center bg-white">
                          <ToyotaPlaceholder />
                        </div>
                    )}

                    {images.length > 1 && (
                        <>
                            <button
                                onClick={() => setSelectedImage(i => Math.max(0, i - 1))}
                                className="absolute left-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-background/80 backdrop-blur-sm border border-border flex items-center justify-center text-foreground hover:bg-background transition shadow-sm z-10"
                                disabled={selectedImage === 0}
                            >
                                <ChevronLeft className="w-5 h-5" />
                            </button>
                            <button
                                onClick={() => setSelectedImage(i => Math.min(images.length - 1, i + 1))}
                                className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-background/80 backdrop-blur-sm border border-border flex items-center justify-center text-foreground hover:bg-background transition shadow-sm z-10"
                                disabled={selectedImage === images.length - 1}
                            >
                                <ChevronRight className="w-5 h-5" />
                            </button>
                        </>
                    )}
                </div>

                {/* Thumbnails */}
                {images.length > 1 && (
                  <div className="flex gap-3 overflow-x-auto no-scrollbar px-[8px] pt-[0px] pb-[8px]">
                    {images.map((img, idx) => (
                      <button
                        key={idx}
                        onClick={() => setSelectedImage(idx)}
                        className={`flex-shrink-0 w-20 h-20 rounded-xl border-2 transition-all overflow-hidden bg-background ${
                          idx === selectedImage ? 'border-primary shadow-md' : 'border-border hover:border-muted-foreground/40'
                        }`}
                      >
                        <img src={img} alt="" className="w-full h-full object-contain p-2" />
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* ── Center: Info (4 cols) ── */}
              <div className="lg:col-span-4 p-4 lg:p-6 flex flex-col border-b lg:border-b-0 lg:border-r border-border/60">
                <div className="mb-4">
                   <h1 className="text-lg sm:text-2xl lg:text-3xl font-bold text-foreground leading-tight mb-2 uppercase tracking-tight">
                      {seoTitle}
                   </h1>
                   <div className="flex items-center gap-3 mb-3 flex-wrap">
                      <div className="flex items-center gap-1.5 px-2 py-1 bg-muted rounded-md border border-border/50">
                         <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">SKU</span>
                         <span className="text-[11px] text-foreground font-bold">{product.sku}</span>
                      </div>
                      {product.status === 1 && (
                         <Badge className="bg-[#EB0A1E] hover:bg-[#CC0000] text-white border-[#EB0A1E] text-[10px] uppercase font-bold tracking-widest px-2.5 py-1 h-auto rounded-md shadow-sm border flex items-center gap-1.5">
                            <svg className="w-6 h-auto fill-current" viewBox="407.03 71.6433 50.0569 32.4182" xmlns="http://www.w3.org/2000/svg">
                               <path d="M432.79,104.06h-1.61a12.78,12.78,0,0,1-1.64-.08c-1.07-.1-2.15-.21-3.22-.34a29.75,29.75,0,0,1-3.62-.73,27.45,27.45,0,0,1-5.06-1.8l-1.35-.66a21.84,21.84,0,0,1-4.74-3.29,14.65,14.65,0,0,1-3.77-5.33,9.68,9.68,0,0,1-.65-2.54,5.57,5.57,0,0,0-.1-.82V87.12c.09-.59.14-1.2.27-1.78a11.85,11.85,0,0,1,1.91-4.16,17.69,17.69,0,0,1,3.67-3.76c.54-.41,1.1-.8,1.68-1.16a28.65,28.65,0,0,1,5.63-2.72q1.05-.37,2.13-.66A28.69,28.69,0,0,1,427,72c1.07-.12,2.15-.24,3.23-.3a33.29,33.29,0,0,1,5.82.17c1.13.14,2.26.29,3.37.5a26.43,26.43,0,0,1,4.7,1.31L445,74a24.07,24.07,0,0,1,6.42,3.62,16,16,0,0,1,4.29,5A10.94,10.94,0,0,1,457,89.31a11.33,11.33,0,0,1-1.44,4.11,15.53,15.53,0,0,1-3.16,3.83c-.43.4-.89.76-1.36,1.12a26.66,26.66,0,0,1-4.76,2.85c-.56.27-1.15.49-1.73.71a29.14,29.14,0,0,1-3.9,1.16,25.78,25.78,0,0,1-3.49.63c-1.16.12-2.32.21-3.48.31ZM413.28,81.12c-.15.22-.27.4-.4.57a10.85,10.85,0,0,0-1.83,3.85,9.83,9.83,0,0,0-.27,3.15,10.65,10.65,0,0,0,1.66,4.85,14.82,14.82,0,0,0,3.64,3.85,19,19,0,0,0,4,2.37,31.4,31.4,0,0,0,4.11,1.47c.79.23,1.61.38,2.42.53a26.68,26.68,0,0,0,3.44.41h.9l-.31-.19a4.74,4.74,0,0,1-1.58-1.44,12.38,12.38,0,0,1-1.93-3.86,19.8,19.8,0,0,1-.79-3.21c-.15-1-.3-2.08-.39-3.13-.07-.89-.05-1.79-.08-2.69v-.14c-.63-.11-1.25-.19-1.86-.31-1-.2-1.94-.39-2.9-.64a18.2,18.2,0,0,1-3.37-1.18,13.11,13.11,0,0,1-2.84-1.68A4.1,4.1,0,0,1,413.28,81.12Zm19.87,21h.13c.6,0,1.2-.06,1.8-.12a24.25,24.25,0,0,0,5.13-1c.9-.29,1.81-.56,2.7-.9A19.82,19.82,0,0,0,448.32,97a14.51,14.51,0,0,0,3.57-4,10.54,10.54,0,0,0,1.46-4.63,9.93,9.93,0,0,0-.78-4.47A13.28,13.28,0,0,0,451,81.31l-.18-.23c-.08.25-.13.49-.22.71a4.85,4.85,0,0,1-1.36,1.75,13.44,13.44,0,0,1-3.74,2.12,28.36,28.36,0,0,1-5.8,1.54c-.51.09-1,.16-1.54.24v.1a26.49,26.49,0,0,1-.13,3.33c-.11.91-.2,1.82-.37,2.72s-.41,1.81-.66,2.69a13.57,13.57,0,0,1-1.46,3.39,7.07,7.07,0,0,1-1.62,1.91,7.31,7.31,0,0,1-.85.61Zm0-28.52.09.08A4.38,4.38,0,0,1,434.88,75a10.58,10.58,0,0,1,1.51,2.58,23.36,23.36,0,0,1,1.5,5.44.78.78,0,0,0,.06.37c.95-.21,1.88-.38,2.79-.62a13,13,0,0,0,3.75-1.47,5.3,5.3,0,0,0,1.63-1.42,1.93,1.93,0,0,0,.25-1.92,3,3,0,0,0-.87-1.17,9.53,9.53,0,0,0-2.82-1.57A23.2,23.2,0,0,0,437.82,74a39.55,39.55,0,0,0-4.06-.39,3.75,3.75,0,0,1-.67,0Zm-2.14,0h-.33c-.92.06-1.85.11-2.77.19a30.5,30.5,0,0,0-3.55.57,18.37,18.37,0,0,0-4.08,1.39A6.44,6.44,0,0,0,418.47,77a2.73,2.73,0,0,0-.74,1.35,2,2,0,0,0,.5,1.68,6.06,6.06,0,0,0,1.83,1.51,11.25,11.25,0,0,0,2.56,1c.87.24,1.76.44,2.65.64.33.07.66.13,1,.17v-.1c.11-.59.21-1.18.32-1.77a20.76,20.76,0,0,1,1.31-4.14A9.51,9.51,0,0,1,429,75.4a5.28,5.28,0,0,1,1.76-1.66Zm-2.68,14.06v.19a21.55,21.55,0,0,0,.25,3,14.53,14.53,0,0,0,1.14,3.93A4.71,4.71,0,0,0,431,96.45a1.7,1.7,0,0,0,2.22.06,4.21,4.21,0,0,0,.85-.94,9.66,9.66,0,0,0,1.26-2.91,20.2,20.2,0,0,0,.62-4.37v-.6a50.07,50.07,0,0,1-7.55,0Zm.27-4a39,39,0,0,0,7,0,.29.29,0,0,0,0-.13,14.17,14.17,0,0,0-1.11-3.71,4.8,4.8,0,0,0-1.16-1.59,1.71,1.71,0,0,0-2.41,0,4.94,4.94,0,0,0-1.17,1.68,13.22,13.22,0,0,0-1,3c-.09.31-.13.56-.19.84Z" />
                            </svg>
                            Peça Genuína
                         </Badge>
                      )}
                   </div>
                </div>

                {/* Mobile-only: Compact Price Box */}
                <div className="lg:hidden mb-4">
                  {pricing && (
                    <div>
                       {pricing.hasDiscount && (
                          <div className="flex items-center gap-2 mb-1">
                             <span className="text-sm text-muted-foreground line-through font-medium opacity-60">
                                {pricing.price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                             </span>
                             <Badge className="bg-success text-success-foreground border-0 gap-1 text-[10px] font-bold py-0.5 h-auto">
                                -{pricing.pct}%
                             </Badge>
                          </div>
                       )}
                       <div className="text-3xl font-bold text-foreground mb-2 tracking-tight">
                          {pricing.active.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                       </div>
                       {pricing.installments > 0 && (
                          <div className="text-xs text-muted-foreground font-medium flex items-center gap-1.5 text-left">
                             <span className="text-foreground font-bold">{pricing.installments}x</span> de <span className="text-foreground font-bold">{pricing.installmentValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
                             <span className="text-success font-bold uppercase tracking-tighter ml-1.5 text-[9px]">Sem juros</span>
                          </div>
                       )}
                    </div>
                  )}
                </div>

                

                <div className="flex items-center gap-6 mt-4 pt-4 border-t border-border/60">
                   <div className="flex flex-col items-center gap-2 text-center group cursor-pointer">
                      <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center group-hover:bg-primary/10 group-hover:text-primary transition-all duration-300 border border-transparent group-hover:border-primary/20 shadow-sm">
                         <Info className="w-4 h-4" />
                      </div>
                      <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest group-hover:text-foreground transition-colors">Detalhes</span>
                   </div>
                   <div className="flex flex-col items-center gap-2 text-center group cursor-pointer">
                      <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center group-hover:bg-primary/10 group-hover:text-primary transition-all duration-300 border border-transparent group-hover:border-primary/20 shadow-sm">
                         <RotateCcw className="w-4 h-4" />
                      </div>
                      <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest group-hover:text-foreground transition-colors">Troca Fácil</span>
                   </div>
                   <div className="flex flex-col items-center gap-2 text-center group cursor-pointer">
                      <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center group-hover:bg-primary/10 group-hover:text-primary transition-all duration-300 border border-transparent group-hover:border-primary/20 shadow-sm">
                         <Shield className="w-4 h-4" />
                      </div>
                      <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest group-hover:text-foreground transition-colors">Garantia</span>
                   </div>
                </div>
              </div>

              {/* ── Right: Buy Box (3 cols) — hidden on mobile, shown on lg ── */}
              <div className="hidden lg:flex lg:col-span-3 p-6 bg-transparent flex-col h-fit self-start">

                {/* ── Out of stock panel ── */}
                {product.in_stock === false ? (
                  <div className="space-y-5">
                    {/* Esgotado badge */}
                    <div className="bg-destructive/5 border border-destructive/20 rounded-xl p-5 text-center space-y-3">
                      <div className="w-14 h-14 bg-destructive/10 rounded-2xl flex items-center justify-center mx-auto">
                        <Ban className="w-7 h-7 text-destructive" />
                      </div>
                      <div>
                        <p className="text-xl font-bold text-destructive uppercase tracking-tight">Produto Esgotado</p>
                        <p className="text-sm text-muted-foreground mt-1">Este produto esta temporariamente indisponivel para compra online.</p>
                      </div>
                    </div>

                    {/* Contact by phone */}
                    <a 
                      href="tel:+554332941144"
                      className="flex items-center gap-4 p-4 rounded-xl border-2 border-foreground/10 bg-foreground/[0.02] hover:bg-foreground/[0.05] transition-all group"
                    >
                      <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform shrink-0">
                        <Phone className="w-6 h-6 text-primary" />
                      </div>
                      <div>
                        <span className="text-sm font-bold text-foreground block">Ligue para consultar</span>
                        <span className="text-lg font-bold text-primary block tracking-tight">(43) 3294-1144</span>
                      </div>
                    </a>

                    {/* WhatsApp */}
                    <a 
                      href="https://wa.me/554332941144"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-3 p-4 rounded-xl border border-border bg-secondary/10 hover:bg-secondary/20 transition-all group"
                    >
                      <div className="w-10 h-10 bg-success/10 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform shrink-0 border border-success/20">
                        <WhatsAppIcon className="w-5 h-5 fill-success" />
                      </div>
                      <div className="flex flex-col overflow-hidden">
                        <span className="text-[11px] font-bold text-foreground uppercase tracking-tight truncate">Ou fale pelo WhatsApp</span>
                        <span className="text-[10px] text-muted-foreground font-medium truncate">Consultor verifica disponibilidade</span>
                      </div>
                    </a>

                    {/* Price disclaimer */}
                    {pricing && (
                      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-2">
                        <div className="flex items-start gap-2">
                          <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                          <div>
                            <p className="text-xs font-bold text-amber-800 uppercase tracking-wider">Aviso sobre o preco</p>
                            <p className="text-[11px] text-amber-700 leading-relaxed mt-1">
                              O preco exibido de <span className="font-bold">{pricing.active.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span> e referencial e pode ter sofrido alteracao. Consulte o valor atualizado pelo telefone ou WhatsApp.
                            </p>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                <>
                 {pricing && (
                    <div className="mb-4">
                       <div className="flex flex-col gap-0.5">
                          {pricing.hasDiscount && (
                             <div className="flex items-center gap-2 mb-0.5">
                                <span className="text-xs text-muted-foreground line-through decoration-muted-foreground/40 font-medium">
                                   {pricing.price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                </span>
                                <Badge className="bg-success/10 text-success border-success/20 py-0 px-1.5 text-[10px] font-bold shadow-none border h-5">
                                   {pricing.pct}% OFF
                                </Badge>
                             </div>
                          )}
                          <div className="text-3xl font-bold text-foreground tracking-tight leading-none mb-3">
                             {pricing.active.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                          </div>
                          
                          {pricing.installments > 0 && (
                             <div className="pt-3 border-t border-border/60">
                                <div className="text-sm text-muted-foreground flex items-center gap-2">
                                   <span className="text-foreground font-medium text-xs">
                                      {pricing.installments}x de <span className="font-bold">{pricing.installmentValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
                                   </span>
                                   <span className="text-success text-[9px] font-bold uppercase tracking-wider">Sem juros</span>
                                </div>
                             </div>
                          )}
                       </div>
                    </div>
                 )}

                 {/* Qty & Buy Button row */}
                 <div className="flex flex-col gap-4 mb-5">
                    <div className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest">Selecione a quantidade</div>
                    <div className="flex items-center gap-3">
                       <div className="flex items-center border border-border rounded-xl p-1 bg-background h-11 w-28 shrink-0">
                          <button 
                             onClick={() => setQuantity(q => Math.max(1, q - 1))} 
                             className="flex-1 h-full flex items-center justify-center text-muted-foreground hover:bg-muted rounded-lg transition-all"
                          >
                             <Minus className="w-4 h-4" />
                          </button>
                          <span className="w-8 text-center text-sm font-bold text-foreground">{quantity}</span>
                          <button 
                             onClick={() => setQuantity(q => q + 1)} 
                             className="flex-1 h-full flex items-center justify-center text-primary hover:bg-muted rounded-lg transition-all"
                          >
                             <Plus className="w-4 h-4" />
                          </button>
                       </div>
                       <Button 
                          onClick={handleBuy}
                          className="flex-1 bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-sm h-11 rounded-xl uppercase tracking-wide transition-all active:scale-[0.98]"
                       >
                          Comprar
                       </Button>
                    </div>
                 </div>

                 {/* WhatsApp / Sales Consultant Banner — Compact */}
                 <a 
                    href="https://wa.me/554332941144"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 p-4 rounded-xl border border-border bg-secondary/10 hover:bg-secondary/20 transition-all group mb-5"
                 >
                    <div className="w-10 h-10 bg-success/10 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform shrink-0 border border-success/20">
                       <WhatsAppIcon className="w-5 h-5 fill-success" />
                    </div>
                    <div className="flex flex-col overflow-hidden">
                       <span className="text-[11px] font-bold text-foreground uppercase tracking-tight truncate">Dúvidas sobre a peça?</span>
                       <span className="text-[10px] text-muted-foreground font-medium truncate">Chame um consultor Toyota</span>
                    </div>
                 </a>

                 {/* Shipping */}
                 <div className="border-t border-border pt-5">
                    <div className="flex items-center gap-2 mb-4">
                       <Truck className="w-4 h-4 text-muted-foreground" />
                       <span className="text-[11px] font-bold text-foreground uppercase tracking-wider">Simular Prazo de Entrega</span>
                    </div>
                    <ShippingCalculator
                      compact
                      items={product ? [{
                        sku: product.sku,
                        qty: quantity,
                        price: pricing?.active || 0,
                        weight: product.weight,
                      }] : []}
                    />
                    <a 
                      href="https://buscacepinter.correios.com.br/app/endereco/index.php" 
                      target="_blank" 
                      rel="noopener noreferrer" 
                      className="text-muted-foreground/60 mt-4 inline-block hover:text-primary transition-colors underline underline-offset-4 decoration-border/50 text-[10px]"
                    >
                       Não sei meu CEP
                    </a>
                 </div>
                </>
                )}
              </div>

            </div>
          </div>

          {/* ── Mobile: Qty + Shipping (shown below product card on small screens) ── */}
          {product.in_stock === false ? (
          <div className="lg:hidden space-y-4 mb-6">
            {/* Mobile out-of-stock panel */}
            <div className="bg-destructive/5 border border-destructive/20 rounded-2xl p-5 text-center space-y-3">
              <Ban className="w-8 h-8 text-destructive mx-auto" />
              <p className="text-lg font-bold text-destructive uppercase tracking-tight">Produto Esgotado</p>
              <p className="text-sm text-muted-foreground">Indisponivel para compra online. Entre em contato.</p>
            </div>
            <a href="tel:+554332941144" className="flex items-center gap-4 p-4 rounded-2xl border-2 border-foreground/10 bg-card shadow-sm">
              <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center shrink-0">
                <Phone className="w-6 h-6 text-primary" />
              </div>
              <div>
                <span className="text-sm font-bold text-foreground block">Ligue para consultar</span>
                <span className="text-lg font-bold text-primary block tracking-tight">(43) 3294-1144</span>
              </div>
            </a>
            {pricing && (
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <p className="text-[11px] text-amber-700 leading-relaxed">
                    O preco exibido de <span className="font-bold">{pricing.active.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span> e referencial e pode ter sofrido alteracao. Consulte o valor atualizado.
                  </p>
                </div>
              </div>
            )}
          </div>
          ) : (
          <div className="lg:hidden space-y-4 mb-6">
            <div className="flex flex-col gap-3">
              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest ml-1">Quantidade</label>
              <div className="flex items-center border border-border rounded-xl bg-card h-12 w-full px-1 shadow-sm">
                <button onClick={() => setQuantity(q => Math.max(1, q - 1))} className="flex-1 h-full text-muted-foreground hover:bg-muted flex items-center justify-center transition-colors"><Minus className="w-4 h-4" /></button>
                <span className="w-12 text-center text-base font-bold text-foreground">{quantity}</span>
                <button onClick={() => setQuantity(q => q + 1)} className="flex-1 h-full text-primary hover:bg-muted flex items-center justify-center transition-colors"><Plus className="w-4 h-4" /></button>
              </div>
            </div>
            {/* Shipping */}
            <div className="bg-card rounded-2xl border border-border p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-4">
                <Truck className="w-4 h-4 text-muted-foreground" />
                <span className="text-xs font-bold text-foreground uppercase tracking-widest">Simular Frete</span>
              </div>
              <ShippingCalculator
                compact
                items={product ? [{
                  sku: product.sku,
                  qty: quantity,
                  price: pricing?.active || 0,
                  weight: product.weight,
                }] : []}
              />
            </div>
          </div>
          )}
          
          {/* ── Details Section ── */}
          <div className="bg-card rounded-2xl shadow-sm border border-border p-4 sm:p-6 lg:p-8 mb-6">
             <div className="flex items-center gap-3 mb-6 border-b border-border/60 pb-4">
                <Package className="w-6 h-6 text-primary" />
                <h2 className="text-lg sm:text-xl font-bold text-foreground uppercase tracking-tight">Informações Técnicas</h2>
             </div>
             
             <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 sm:gap-12">
                <div className="lg:col-span-2 prose prose-zinc max-w-none text-muted-foreground prose-headings:text-foreground prose-headings:font-bold prose-strong:text-foreground">
                   <div className="bg-secondary/20 rounded-xl p-4 border border-border/50 mb-6">
                      
                      <div className="text-sm space-y-1">
                         <p className="font-bold text-foreground text-base mb-2">{seoTitle}</p>
                         <p className="flex items-center gap-2">
                            <span className="text-muted-foreground">Código SKU:</span>
                            <span className="font-bold text-foreground">{product.sku}</span>
                         </p>
                         {product.modelo_label && (
                            <p className="flex items-center gap-2">
                               <span className="text-muted-foreground">Compatibilidade:</span>
                               <span className="font-bold text-foreground">{product.modelo_label} {product.ano_labels}</span>
                            </p>
                         )}
                      </div>
                   </div>

                   {product.description ? (
                      <div className="text-sm leading-relaxed" dangerouslySetInnerHTML={{ __html: product.description }} />
                   ) : (
                      <p className="italic text-muted-foreground/60 text-sm">Nenhuma descrição técnica detalhada disponível para este produto.</p>
                   )}
                </div>

                <div className="bg-muted/30 rounded-2xl p-5 border border-border/60 h-fit">
                   <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.2em] mb-4 border-b border-border/60 pb-3">Políticas e Garantia</div>
                   <div className="space-y-4">
                      <div className="flex gap-3">
                         <Shield className="w-4 h-4 text-primary shrink-0" />
                         <div>
                            <p className="text-xs font-bold text-foreground mb-1 uppercase tracking-tighter">Garantia de Fábrica</p>
                            <p className="text-[11px] text-muted-foreground leading-relaxed">Cobertura de 3 meses contra defeitos de fabricação.</p>
                         </div>
                      </div>
                      <div className="flex gap-3">
                         <AlertCircle className="w-4 h-4 text-warning shrink-0" />
                         <div>
                            <p className="text-xs font-bold text-foreground mb-1 uppercase tracking-tighter">Instalação Profissional</p>
                            <p className="text-[11px] text-muted-foreground leading-relaxed">Recomendamos instaladores credenciados para evitar perda de garantia.</p>
                         </div>
                      </div>
                      <div className="flex gap-3">
                         <Info className="w-4 h-4 text-muted-foreground shrink-0" />
                         <div>
                            <p className="text-xs font-bold text-foreground mb-1 uppercase tracking-tighter">Imagens e Versões</p>
                            <p className="text-[11px] text-muted-foreground leading-relaxed">Fotos meramente ilustrativas. Valor referente a uma unidade.</p>
                         </div>
                      </div>
                   </div>
                </div>
             </div>
          </div>

          {/* ── Compatibility Banner ── */}
          <div className="bg-foreground rounded-2xl shadow-xl p-5 sm:p-8 flex flex-col lg:flex-row items-center justify-between gap-6 text-center lg:text-left mb-6 overflow-hidden relative group">
             <div className="absolute top-0 right-0 w-64 h-64 bg-primary/10 rounded-full -mr-32 -mt-32 blur-3xl group-hover:bg-primary/20 transition-all duration-700" />
             <div className="flex flex-col lg:flex-row items-center gap-6 z-10">
                <div className="w-16 h-16 sm:w-20 sm:h-20 bg-primary rounded-2xl flex items-center justify-center text-white shadow-2xl shadow-primary/40 rotate-3 group-hover:rotate-0 transition-transform">
                   <WhatsAppIcon className="w-8 h-8 sm:w-10 sm:h-10 fill-current" />
                </div>
                <div>
                   <h3 className="text-xl sm:text-2xl md:text-3xl font-bold text-white uppercase tracking-tight mb-2">Ainda tem dúvidas?</h3>
                   <p className="text-white/70 font-medium text-sm sm:text-lg max-w-md">Nossos especialistas Toyota verificam a compatibilidade exata pelo chassi do seu veículo.</p>
                </div>
             </div>
             <Button asChild className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold h-14 px-10 rounded-xl shadow-lg shadow-primary/20 transition-all active:scale-95 text-lg z-10 shrink-0">
                <a href="https://wa.me/554332941144" target="_blank" rel="noopener noreferrer">Falar no WhatsApp</a>
             </Button>
          </div>

          {/* ── Newsletter ── */}
           <NewsletterBanner source="pdp" className="mb-20 lg:mb-12" />
         {/* ─── Related Products (Quem viu, viu tambem) ─────────────────── */}
         <RelatedProductsByView sku={product.sku} limit={8} />

         </div>

       </div>
     </>
   );
}
