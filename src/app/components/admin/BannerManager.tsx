import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Plus, Trash2, Loader2, GripVertical, Eye, EyeOff,
  Save, X, Pencil, Image as ImageIcon, ArrowRight,
  Tag, Truck, ShieldCheck, Zap, Copy, ChevronDown, ChevronUp,
  Palette, Link2, ExternalLink, LayoutTemplate, MonitorSmartphone,
} from 'lucide-react';
import { toast } from 'sonner';
import { DndProvider, useDrag, useDrop } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { TouchBackend } from 'react-dnd-touch-backend';
import { MultiBackend, TouchTransition, MouseTransition } from 'react-dnd-multi-backend';
import { projectId, publicAnonKey } from '../../../../utils/supabase/info';
import { Button } from '../base/button';
import { Card } from '../base/card';
import { Badge } from '../base/badge';
import { Switch } from '../ui/switch';
import { Label } from '../ui/label';
import { Input } from '../ui/input';
import { Separator } from '../ui/separator';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '../ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../ui/tabs';
import { ImageUpload } from './ImageUpload';

const API = `https://${projectId}.supabase.co/functions/v1/make-server-1d6e33e0`;
const HEADERS: HeadersInit = {
  Authorization: `Bearer ${publicAnonKey}`,
  apikey: publicAnonKey,
  'Content-Type': 'application/json',
};

// ─── Types ───────────────────────────────────────────────────────────────────

export interface HeroBanner {
  id: string;
  type: 'promotional' | 'image' | 'editorial';
  active: boolean;
  order: number;
  createdAt: string;
  updatedAt: string;
  // Promotional fields
  productName?: string;
  modelYear?: string;
  priceDe?: string;
  pricePor?: string;
  installments?: string;
  priceAVista?: string;
  productImageSrc?: string;
  searchLink?: string;
  accentColor?: string;
  // Image banner fields (Canva exports)
  desktopImageSrc?: string;
  mobileImageSrc?: string;
  linkHref?: string;
  altText?: string;
  // Editorial fields
  overline?: string;
  headline?: string;
  subtitle?: string;
  ctaText?: string;
  ctaLink?: string;
  bgColor?: string;
  bgImageSrc?: string;
  textColor?: string;
}

const DEFAULT_BANNER: Omit<HeroBanner, 'id' | 'createdAt' | 'updatedAt'> = {
  type: 'promotional',
  active: true,
  order: 0,
  productName: '',
  modelYear: '',
  priceDe: '',
  pricePor: '',
  installments: '10x',
  priceAVista: '',
  productImageSrc: '',
  searchLink: '',
  accentColor: '#eb0a1e',
};

// ─── Seed banners (match the hardcoded fallbacks in HomePage) ─────────────────

function makeSeedBanners(): HeroBanner[] {
  const now = new Date().toISOString();
  return [
    {
      id: 'seed_promo_1', type: 'promotional', active: true, order: 0,
      productName: 'Bico Injetor', modelYear: 'Hilux 2015',
      priceDe: '4.399,50', pricePor: '356,35', installments: '10x', priceAVista: '3.563,59',
      productImageSrc: 'https://images.unsplash.com/photo-1765211002882-2ed162e7c77b?auto=format&fit=crop&q=80&w=600',
      searchLink: '/busca?q=bico+injetor+hilux', accentColor: '#eb0a1e',
      createdAt: now, updatedAt: now,
    },
    {
      id: 'seed_promo_2', type: 'promotional', active: true, order: 1,
      productName: 'Kit Pastilhas', modelYear: 'Corolla 2022',
      priceDe: '850,00', pricePor: '69,90', installments: '10x', priceAVista: '699,00',
      productImageSrc: 'https://images.unsplash.com/photo-1749415245834-ef0106c847df?auto=format&fit=crop&q=80&w=600',
      searchLink: '/busca?q=pastilha+corolla', accentColor: '#3b82f6',
      createdAt: now, updatedAt: now,
    },
    {
      id: 'seed_editorial_1', type: 'editorial', active: true, order: 2,
      overline: 'Peças Genuínas Toyota', headline: 'Qualidade que seu Toyota merece.',
      subtitle: 'Até 40% OFF em peças selecionadas. Frete grátis acima de R$ 299.',
      ctaText: 'Comprar agora', ctaLink: '/pecas',
      bgColor: '#0a0a0a', textColor: '#ffffff',
      createdAt: now, updatedAt: now,
    },
    {
      id: 'seed_editorial_2', type: 'editorial', active: true, order: 3,
      overline: 'Mecânica Completa', headline: 'Tudo para o motor.',
      subtitle: 'Filtros, pastilhas, amortecedores, correias e muito mais.',
      ctaText: 'Confira agora', ctaLink: '/busca?q=motor',
      bgColor: '#0a0a0a', bgImageSrc: 'https://images.unsplash.com/photo-1633281256183-c0f106f70d76?auto=format&fit=crop&q=80&w=1920',
      textColor: '#ffffff',
      createdAt: now, updatedAt: now,
    },
    {
      id: 'seed_editorial_3', type: 'editorial', active: true, order: 4,
      overline: 'Acessórios Originais', headline: 'Personalize seu Toyota.',
      subtitle: 'Acessórios exclusivos com frete grátis acima de R$ 299.',
      ctaText: 'Explorar', ctaLink: '/pecas',
      bgColor: '#eb0a1e', textColor: '#ffffff',
      createdAt: now, updatedAt: now,
    },
  ];
}

// ─── Color Presets ───────────────────────────────────────────────────────────

const COLOR_PRESETS = [
  { name: 'Toyota Red', value: '#eb0a1e' },
  { name: 'Blue', value: '#3b82f6' },
  { name: 'Emerald', value: '#10b981' },
  { name: 'Amber', value: '#f59e0b' },
  { name: 'Purple', value: '#8b5cf6' },
  { name: 'Black', value: '#1d1d1f' },
];

// ─── Mini Preview ────────────────────────────────────────────────────────────

function BannerMiniPreview({ banner }: { banner: HeroBanner }) {
  if (banner.type === 'image') {
    return (
      <div className="relative w-full aspect-[5/1] bg-[#0a0a0a] rounded-lg overflow-hidden">
        {banner.desktopImageSrc ? (
          <img src={banner.desktopImageSrc} alt={banner.altText || ''} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-white/20">
            <ImageIcon className="w-8 h-8" />
          </div>
        )}
      </div>
    );
  }

  if (banner.type === 'editorial') {
    return (
      <div
        className="relative w-full aspect-[5/1] rounded-lg overflow-hidden flex items-center justify-center"
        style={{ background: banner.bgColor || '#0a0a0a' }}
      >
        {banner.bgImageSrc && (
          <img src={banner.bgImageSrc} alt="" className="absolute inset-0 w-full h-full object-cover opacity-15" />
        )}
        <div className="relative z-10 text-center px-4">
          {banner.overline && (
            <p className="text-[7px] font-medium tracking-widest uppercase text-white/40 mb-0.5">{banner.overline}</p>
          )}
          <p className="text-[11px] font-extrabold text-white leading-tight">{banner.headline || 'Titulo'}</p>
        </div>
      </div>
    );
  }

  // Promotional
  const accent = banner.accentColor || '#eb0a1e';
  return (
    <div className="relative w-full aspect-[5/1] rounded-lg overflow-hidden flex items-center justify-center" style={{ background: accent }}>
      <div className="relative z-10 flex items-center gap-2 px-2 w-full">
        <div className="flex-1 min-w-0">
          <p className="text-[7px] font-black text-white leading-tight uppercase truncate">{banner.productName || 'Produto'}</p>
          <p className="text-[5px] text-white/70 uppercase">{banner.modelYear || 'Modelo'}</p>
        </div>
        {banner.productImageSrc ? (
          <img src={banner.productImageSrc} alt="" className="w-7 h-7 object-contain flex-shrink-0" />
        ) : (
          <div className="w-7 h-7 rounded bg-white/10 flex items-center justify-center flex-shrink-0">
            <ImageIcon className="w-3 h-3 text-white/30" />
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Full Preview ────────────────────────────────────────────────────────────

function BannerFullPreview({ banner }: { banner: HeroBanner }) {
  if (banner.type === 'image') {
    return (
      <div className="relative w-full aspect-[5/1] bg-[#0a0a0a] rounded-xl overflow-hidden">
        {banner.desktopImageSrc ? (
          <img src={banner.desktopImageSrc} alt={banner.altText || ''} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center text-white/20 gap-2">
            <ImageIcon className="w-12 h-12" />
            <span className="text-xs">Faça upload da imagem</span>
          </div>
        )}
        {banner.linkHref && (
          <div className="absolute bottom-2 right-2 bg-black/50 backdrop-blur-md rounded-full px-2 py-0.5 text-[9px] text-white/60 flex items-center gap-1">
            <Link2 className="w-2.5 h-2.5" /> {banner.linkHref}
          </div>
        )}
      </div>
    );
  }

  if (banner.type === 'editorial') {
    return (
      <div
        className="relative w-full aspect-[16/6] rounded-xl overflow-hidden flex flex-col items-center justify-center"
        style={{ background: banner.bgColor || '#0a0a0a' }}
      >
        {banner.bgImageSrc && (
          <img src={banner.bgImageSrc} alt="" className="absolute inset-0 w-full h-full object-cover opacity-10" />
        )}
        <div className="relative z-10 text-center px-8">
          {banner.overline && (
            <p className="text-[10px] font-medium tracking-[0.2em] uppercase text-white/40 mb-2">{banner.overline}</p>
          )}
          <h2 className="text-[28px] font-extrabold text-white tracking-tight leading-[1.1]">
            {banner.headline || 'Headline'}
          </h2>
          {banner.subtitle && (
            <p className="text-sm text-white/40 mt-2 max-w-md mx-auto">{banner.subtitle}</p>
          )}
          {banner.ctaText && (
            <div className="mt-4">
              <span className="inline-flex items-center gap-1 bg-white text-[#0a0a0a] text-xs font-semibold px-4 py-2 rounded-full">
                {banner.ctaText} <ArrowRight className="w-3 h-3" />
              </span>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Promotional
  const accent = banner.accentColor || '#eb0a1e';
  const darken = (hex: string, amt: number) => {
    const n = parseInt(hex.replace('#', ''), 16);
    const r = Math.max(0, (n >> 16) - amt);
    const g = Math.max(0, ((n >> 8) & 0xff) - amt);
    const b = Math.max(0, (n & 0xff) - amt);
    return `#${(r << 16 | g << 8 | b).toString(16).padStart(6, '0')}`;
  };
  const accentDark = darken(accent, 30);

  return (
    <div className="relative w-full aspect-[5/1.1] rounded-xl overflow-hidden" style={{ background: accent }}>
      {/* Decorative chevrons */}
      <div className="absolute top-1.5 left-[36%] z-0 flex gap-0.5 opacity-50">
        {[0, 1, 2].map(i => (
          <svg key={i} className="w-2.5 h-2.5 text-yellow-400" viewBox="0 0 24 24" fill="currentColor" style={{ transform: `translateY(${i * 2}px)` }}>
            <path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6z" />
          </svg>
        ))}
      </div>
      {/* Gradient overlay */}
      <div className="absolute inset-0 z-0" style={{ background: `linear-gradient(135deg, transparent 40%, ${accentDark}40 100%)` }} />

      {/* 2-column content */}
      <div className="relative z-10 flex items-center h-full px-4">
        {/* Left — text */}
        <div className="flex-1 min-w-0 flex flex-col justify-center pr-3">
          <p className="text-[6px] font-bold text-white/70 tracking-[0.15em] uppercase mb-0.5">Genuíno Toyota</p>
          <h2 className="text-[14px] font-black text-white leading-[0.95] tracking-tight uppercase">{banner.productName || 'Produto'}</h2>
          <p className="text-[10px] font-extrabold text-white/90 leading-[1] uppercase mt-0.5">{banner.modelYear || 'Modelo'}</p>
          <div className="flex items-center gap-1 mt-1.5">
            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[5px] font-bold uppercase bg-white/20 text-white">
              <Truck className="w-1.5 h-1.5" /> frete grátis
            </span>
          </div>
        </div>

        {/* Right — price + image */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Price block */}
          <div className="flex flex-col items-start">
            {banner.priceDe && (
              <div className="flex items-center gap-0.5 mb-0.5">
                <span className="text-[5px] font-semibold text-white/60 uppercase">DE</span>
                <span className="text-[6px] font-bold text-white/60 line-through">R$ {banner.priceDe}</span>
              </div>
            )}
            <div className="flex items-center gap-0.5">
              <span className="px-1 py-0.5 rounded text-[5px] font-black uppercase text-white" style={{ background: accentDark }}>POR</span>
              <span className="text-[5px] font-bold text-white/80 uppercase">{banner.installments}</span>
            </div>
            <div className="flex items-start mt-0.5">
              <span className="text-[6px] font-extrabold text-white leading-none mt-1 mr-0.5">R$</span>
              <span className="text-[22px] font-black text-white leading-[0.85] tracking-tighter">
                {(banner.pricePor || '0,00').split(',')[0]}
              </span>
              <span className="text-[9px] font-black text-white leading-none mt-0.5">
                ,{(banner.pricePor || '0,00').split(',')[1] || '00'}
              </span>
            </div>
            <span className="self-end -mt-0.5 px-1 py-0.5 rounded text-[4px] font-black uppercase text-white" style={{ background: accentDark }}>Sem Juros</span>
            <div className="flex items-center gap-0.5 mt-1">
              <span className="text-[5px] font-medium text-white/70 uppercase">À vista</span>
              <span className="text-[7px] font-extrabold text-white underline">R$ {banner.priceAVista || '0,00'}</span>
            </div>
          </div>

          {/* Product image */}
          <div className="w-14 h-14 flex-shrink-0">
            {banner.productImageSrc ? (
              <img src={banner.productImageSrc} alt="" className="w-full h-full object-contain drop-shadow-[0_2px_8px_rgba(0,0,0,0.3)]" />
            ) : (
              <div className="w-full h-full rounded-lg bg-white/10 flex items-center justify-center">
                <ImageIcon className="w-5 h-5 text-white/30" />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Banner Form ─────────────────────────────────────────────────────────────

function BannerForm({
  banner,
  onChange,
  onSave,
  onCancel,
  saving,
}: {
  banner: HeroBanner;
  onChange: (b: HeroBanner) => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const update = (patch: Partial<HeroBanner>) => onChange({ ...banner, ...patch });

  return (
    <div className="flex flex-col lg:flex-row gap-6">
      {/* Form Fields */}
      <div className="flex-1 space-y-5 min-w-0">
        {/* Type selector */}
        <div className="space-y-2">
          <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Tipo do Banner</Label>
          <Tabs value={banner.type} onValueChange={(v) => update({ type: v as HeroBanner['type'] })}>
            <TabsList className="w-full">
              <TabsTrigger value="promotional" className="flex-1 gap-1.5 text-xs">
                <Tag className="w-3 h-3" /> Promocional
              </TabsTrigger>
              <TabsTrigger value="image" className="flex-1 gap-1.5 text-xs">
                <ImageIcon className="w-3 h-3" /> Imagem (Canva)
              </TabsTrigger>
              <TabsTrigger value="editorial" className="flex-1 gap-1.5 text-xs">
                <LayoutTemplate className="w-3 h-3" /> Editorial
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        <Separator />

        {/* Promotional Fields */}
        {banner.type === 'promotional' && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Nome do Produto</Label>
                <Input value={banner.productName || ''} onChange={(e) => update({ productName: e.target.value })} placeholder="Bico Injetor" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Modelo / Ano</Label>
                <Input value={banner.modelYear || ''} onChange={(e) => update({ modelYear: e.target.value })} placeholder="Hilux 2015" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Preco DE (original)</Label>
                <Input value={banner.priceDe || ''} onChange={(e) => update({ priceDe: e.target.value })} placeholder="4.399,50" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Preco POR (parcela)</Label>
                <Input value={banner.pricePor || ''} onChange={(e) => update({ pricePor: e.target.value })} placeholder="356,35" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Parcelas</Label>
                <Input value={banner.installments || ''} onChange={(e) => update({ installments: e.target.value })} placeholder="10x" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Preco A Vista</Label>
                <Input value={banner.priceAVista || ''} onChange={(e) => update({ priceAVista: e.target.value })} placeholder="3.563,59" />
              </div>
            </div>

            <ImageUpload
              label="Imagem do Produto"
              value={banner.productImageSrc}
              onChange={(url) => update({ productImageSrc: url })}
              placeholder="Clique ou arraste a imagem do produto"
              helpText="Formato PNG com fundo transparente recomendado"
              aspectRatio="1/1"
            />

            <div className="space-y-1.5">
              <Label className="text-xs">Link de Busca</Label>
              <Input value={banner.searchLink || ''} onChange={(e) => update({ searchLink: e.target.value })} placeholder="/busca?q=bico+injetor+hilux" />
            </div>

            {/* Accent Color */}
            <div className="space-y-2">
              <Label className="text-xs">Cor de Destaque</Label>
              <div className="flex items-center gap-2">
                <div className="flex gap-1.5">
                  {COLOR_PRESETS.map(c => (
                    <button
                      key={c.value}
                      onClick={() => update({ accentColor: c.value })}
                      className={`w-7 h-7 rounded-lg border-2 transition-all ${banner.accentColor === c.value ? 'border-foreground scale-110' : 'border-transparent hover:border-border'}`}
                      style={{ background: c.value }}
                      title={c.name}
                    />
                  ))}
                </div>
                <Input
                  value={banner.accentColor || '#eb0a1e'}
                  onChange={(e) => update({ accentColor: e.target.value })}
                  className="w-24 font-mono text-xs"
                />
              </div>
            </div>
          </div>
        )}

        {/* Image Banner Fields */}
        {banner.type === 'image' && (
          <div className="space-y-4">
            <ImageUpload
              label="Imagem Desktop"
              value={banner.desktopImageSrc}
              onChange={(url) => update({ desktopImageSrc: url })}
              placeholder="Clique ou arraste a imagem desktop"
              helpText="1920x386 px recomendado • Exporte do Canva ou Figma"
              aspectRatio="5/1"
            />
            
            <ImageUpload
              label="Imagem Mobile (opcional)"
              value={banner.mobileImageSrc}
              onChange={(url) => update({ mobileImageSrc: url })}
              placeholder="Clique ou arraste a imagem mobile"
              helpText="750x300 px recomendado"
              aspectRatio="5/2"
            />
            
            <div className="space-y-1.5">
              <Label className="text-xs">Link de Destino</Label>
              <Input value={banner.linkHref || ''} onChange={(e) => update({ linkHref: e.target.value })} placeholder="/busca?q=bico+injetor" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Texto Alternativo (SEO)</Label>
              <Input value={banner.altText || ''} onChange={(e) => update({ altText: e.target.value })} placeholder="Banner Bico Injetor Hilux" />
            </div>
          </div>
        )}

        {/* Editorial Fields */}
        {banner.type === 'editorial' && (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Overline</Label>
              <Input value={banner.overline || ''} onChange={(e) => update({ overline: e.target.value })} placeholder="Pecas Genuinas Toyota" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Headline</Label>
              <Input value={banner.headline || ''} onChange={(e) => update({ headline: e.target.value })} placeholder="Qualidade que seu Toyota merece." />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Subtitulo</Label>
              <Input value={banner.subtitle || ''} onChange={(e) => update({ subtitle: e.target.value })} placeholder="Ate 40% OFF em pecas selecionadas."/>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Texto do CTA</Label>
                <Input value={banner.ctaText || ''} onChange={(e) => update({ ctaText: e.target.value })} placeholder="Comprar agora" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Link do CTA</Label>
                <Input value={banner.ctaLink || ''} onChange={(e) => update({ ctaLink: e.target.value })} placeholder="/pecas" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Cor de Fundo</Label>
                <div className="flex items-center gap-2">
                  <input type="color" value={banner.bgColor || '#0a0a0a'} onChange={(e) => update({ bgColor: e.target.value })} className="w-8 h-8 rounded border border-border cursor-pointer" />
                  <Input value={banner.bgColor || '#0a0a0a'} onChange={(e) => update({ bgColor: e.target.value })} className="flex-1 font-mono text-xs" />
                </div>
              </div>
            </div>
            
            <ImageUpload
              label="Imagem de Fundo (opcional)"
              value={banner.bgImageSrc}
              onChange={(url) => update({ bgImageSrc: url })}
              placeholder="Imagem decorativa"
              helpText="Aparece com baixa opacidade"
              aspectRatio="16/9"
            />
          </div>
        )}

        {/* Common: Active toggle */}
        <Separator />
        <div className="flex items-center justify-between">
          <div>
            <Label className="text-sm font-medium">Ativo</Label>
            <p className="text-xs text-muted-foreground">Banner visivel na homepage</p>
          </div>
          <Switch checked={banner.active} onCheckedChange={(checked) => update({ active: checked })} />
        </div>
      </div>

      {/* Live Preview */}
      <div className="lg:w-[400px] flex-shrink-0 space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Preview</Label>
          <Badge variant="pill-outline" color="gray" size="xs">
            <MonitorSmartphone className="w-3 h-3 mr-1" /> Desktop
          </Badge>
        </div>
        <BannerFullPreview banner={banner} />
        <div className="flex items-center gap-2 pt-2">
          <Button color="primary" size="sm" onClick={onSave} disabled={saving} className="flex-1">
            {saving ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Save className="w-3.5 h-3.5 mr-1.5" />}
            {saving ? 'Salvando...' : 'Salvar Banner'}
          </Button>
          <Button color="secondary" size="sm" onClick={onCancel}>
            Cancelar
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Banner List Item ────────────────────────────────────────────────────────

const ITEM_TYPE = 'BANNER_ITEM';

interface DragItem {
  index: number;
  id: string;
  type: string;
}

function BannerListItem({
  banner,
  index,
  onEdit,
  onToggle,
  onDelete,
  onMove,
}: {
  banner: HeroBanner;
  index: number;
  onEdit: () => void;
  onToggle: () => void;
  onDelete: () => void;
  onMove: (dragIndex: number, hoverIndex: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  const [{ isDragging }, drag, preview] = useDrag({
    type: ITEM_TYPE,
    item: { type: ITEM_TYPE, id: banner.id, index },
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
  });

  const [{ isOver }, drop] = useDrop<DragItem, void, { isOver: boolean }>({
    accept: ITEM_TYPE,
    hover(item: DragItem) {
      if (!ref.current) return;
      const dragIndex = item.index;
      const hoverIndex = index;
      if (dragIndex === hoverIndex) return;
      
      onMove(dragIndex, hoverIndex);
      item.index = hoverIndex;
    },
    collect: (monitor) => ({
      isOver: monitor.isOver(),
    }),
  });

  // Conecta drag e drop ao mesmo elemento
  drag(drop(ref));

  const typeLabel = {
    promotional: 'Promocional',
    image: 'Imagem',
    editorial: 'Editorial',
  }[banner.type];

  const typeColor = {
    promotional: 'warning' as const,
    image: 'brand' as const,
    editorial: 'gray' as const,
  }[banner.type];

  const bannerTitle = banner.type === 'promotional'
    ? `${banner.productName || 'Produto'} — ${banner.modelYear || ''}`
    : banner.type === 'image'
      ? banner.altText || 'Banner Imagem'
      : banner.headline || 'Banner Editorial';

  return (
    <div
      ref={ref}
      className={`group flex items-center gap-3 p-3 rounded-xl border transition-all ${
        banner.active ? 'border-border bg-card hover:shadow-sm' : 'border-border/50 bg-secondary/30 opacity-60 hover:opacity-80'
      } ${isDragging ? 'opacity-30 cursor-grabbing' : 'cursor-grab'} ${isOver ? 'ring-2 ring-primary/30' : ''}`}
    >
      {/* Drag handle */}
      <div className="flex-shrink-0 text-muted-foreground hover:text-foreground transition-colors cursor-grab active:cursor-grabbing">
        <GripVertical className="w-4 h-4" />
      </div>

      {/* Mini preview */}
      <div className="w-32 flex-shrink-0 hidden sm:block">
        <BannerMiniPreview banner={banner} />
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <Badge variant="pill-color" color={typeColor} size="xs">{typeLabel}</Badge>
          {!banner.active && <Badge variant="pill-outline" color="gray" size="xs"><EyeOff className="w-2.5 h-2.5 mr-0.5" /> Inativo</Badge>}
        </div>
        <p className="text-sm font-semibold text-foreground truncate">{bannerTitle}</p>
        {banner.type === 'promotional' && banner.pricePor && (
          <p className="text-xs text-muted-foreground mt-0.5">
            R$ {banner.pricePor} ({banner.installments}) - A vista R$ {banner.priceAVista}
          </p>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 flex-shrink-0">
        <button onClick={onToggle} className={`p-2 rounded-lg transition-colors ${banner.active ? 'bg-green-50 text-green-600 hover:bg-green-100 dark:bg-green-950/30 dark:text-green-400 dark:hover:bg-green-950/50' : 'bg-secondary text-muted-foreground hover:text-foreground hover:bg-secondary/80'}`} title={banner.active ? 'Desativar' : 'Ativar'}>
          {banner.active ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
        </button>
        <button onClick={onEdit} className="p-2 rounded-lg bg-secondary/60 hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors" title="Editar">
          <Pencil className="w-4 h-4" />
        </button>
        <button onClick={onDelete} className="p-2 rounded-lg bg-destructive/5 hover:bg-destructive/15 text-destructive/60 hover:text-destructive transition-colors" title="Excluir">
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function BannerManager() {
  const [banners, setBanners] = useState<HeroBanner[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingBanner, setEditingBanner] = useState<HeroBanner | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  // ── Fetch ──
  const fetchBanners = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/banners`, { headers: HEADERS });
      if (res.ok) {
        const data = await res.json();
        const list = (data.banners || []).sort((a: HeroBanner, b: HeroBanner) => a.order - b.order);
        
        // If no banners exist, seed defaults via batch endpoint and refetch
        if (list.length === 0) {
          try {
            const seeds = makeSeedBanners();
            const seedRes = await fetch(`${API}/banners/batch`, {
              method: 'POST',
              headers: HEADERS,
              body: JSON.stringify({ banners: seeds }),
            });
            if (seedRes.ok) {
              const seedData = await seedRes.json();
              if (seedData.success) {
                toast.success(`${seedData.count} banners padrão criados automaticamente.`);
                // Refetch after seed
                const res2 = await fetch(`${API}/banners`, { headers: HEADERS });
                if (res2.ok) {
                  const data2 = await res2.json();
                  setBanners((data2.banners || []).sort((a: HeroBanner, b: HeroBanner) => a.order - b.order));
                  setLoading(false);
                  return;
                }
              }
            }
          } catch (seedErr) {
            console.error('BannerManager: seed error:', seedErr);
          }
        }
        
        setBanners(list);
      } else {
        console.error('Failed to fetch banners:', res.status);
        setBanners([]);
      }
    } catch (e) {
      console.error('BannerManager: fetch error:', e);
      setBanners([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchBanners(); }, [fetchBanners]);

  // ── Create ──
  const handleCreate = () => {
    const newBanner: HeroBanner = {
      ...DEFAULT_BANNER,
      id: `banner_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      order: banners.length,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    setEditingBanner(newBanner);
  };

  // ── Save ──
  const handleSave = async () => {
    if (!editingBanner) return;
    setSaving(true);
    try {
      const res = await fetch(`${API}/banners`, {
        method: 'POST',
        headers: HEADERS,
        body: JSON.stringify({ banner: { ...editingBanner, updatedAt: new Date().toISOString() } }),
      });
      if (res.ok) {
        toast.success('Banner salvo com sucesso!');
        setEditingBanner(null);
        await fetchBanners();
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(`Erro ao salvar: ${err.error || 'Falha'}`);
      }
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  // ── Delete ──
  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`${API}/banners/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: HEADERS,
      });
      if (res.ok) {
        toast.success('Banner removido');
        setDeleteConfirm(null);
        await fetchBanners();
      } else {
        toast.error('Erro ao remover banner');
      }
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  // ── Toggle active ──
  const handleToggle = async (banner: HeroBanner) => {
    const updated = { ...banner, active: !banner.active, updatedAt: new Date().toISOString() };
    try {
      const res = await fetch(`${API}/banners`, {
        method: 'POST',
        headers: HEADERS,
        body: JSON.stringify({ banner: updated }),
      });
      if (res.ok) {
        toast.success(updated.active ? 'Banner ativado' : 'Banner desativado');
        await fetchBanners();
      }
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  // ── Reorder via drag and drop ──
  const handleMove = useCallback((dragIndex: number, hoverIndex: number) => {
    setBanners((prevBanners) => {
      const sorted = [...prevBanners].sort((a, b) => a.order - b.order);
      const draggedBanner = sorted[dragIndex];
      
      // Remove from old position and insert at new position
      sorted.splice(dragIndex, 1);
      sorted.splice(hoverIndex, 0, draggedBanner);
      
      // Update order values
      return sorted.map((banner, idx) => ({
        ...banner,
        order: idx,
      }));
    });
  }, []);

  // ── Save reordered banners to backend ──
  const saveReorderedBanners = useCallback(async () => {
    try {
      const sorted = [...banners].sort((a, b) => a.order - b.order);
      const updatePromises = sorted.map((banner) =>
        fetch(`${API}/banners`, {
          method: 'POST',
          headers: HEADERS,
          body: JSON.stringify({ banner: { ...banner, updatedAt: new Date().toISOString() } }),
        })
      );
      await Promise.all(updatePromises);
      toast.success('Ordem dos banners atualizada');
    } catch (e: any) {
      toast.error('Erro ao salvar ordem: ' + e.message);
      // Refetch to reset to server state
      await fetchBanners();
    }
  }, [banners, fetchBanners]);

  const sortedBanners = [...banners].sort((a, b) => a.order - b.order);
  const activeCount = banners.filter(b => b.active).length;

  return (
    <DndProvider backend={MultiBackend} options={{
      backends: [
        { backend: TouchBackend, transition: TouchTransition },
        { backend: HTML5Backend, transition: MouseTransition },
      ],
    }}>
      <div className="max-w-[1280px] mx-auto px-4 lg:px-6 pt-6 pb-12">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-foreground tracking-tight">Banners Hero</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Gerencie os banners do carousel da homepage.{' '}
              {!loading && <span className="text-foreground font-medium">{activeCount} ativos</span>} de {banners.length} total
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button color="secondary" size="sm" onClick={fetchBanners} disabled={loading}>
              <Loader2 className={`w-3.5 h-3.5 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
              Atualizar
            </Button>
            <Button color="primary" size="sm" onClick={handleCreate}>
              <Plus className="w-3.5 h-3.5 mr-1.5" />
              Novo Banner
            </Button>
          </div>
        </div>

        {/* Editor */}
        {editingBanner && (
          <Card.Root className="mb-6">
            <Card.Header>
              <Card.Title className="flex items-center gap-2">
                <Pencil className="w-4 h-4" />
                {banners.find(b => b.id === editingBanner.id) ? 'Editar Banner' : 'Novo Banner'}
              </Card.Title>
              <Card.Description>
                Configure os dados do banner e veja o preview em tempo real
              </Card.Description>
            </Card.Header>
            <Card.Content>
              <BannerForm
                banner={editingBanner}
                onChange={setEditingBanner}
                onSave={handleSave}
                onCancel={() => setEditingBanner(null)}
                saving={saving}
              />
            </Card.Content>
          </Card.Root>
        )}

        {/* Banner List */}
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="animate-pulse flex items-center gap-3 p-3 rounded-xl border border-border bg-card">
                <div className="w-6 flex flex-col gap-1">
                  <div className="h-3 w-3 bg-muted rounded" />
                  <div className="h-3 w-3 bg-muted rounded" />
                </div>
                <div className="w-32 aspect-[5/1] bg-muted rounded-lg hidden sm:block" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-20 bg-muted rounded" />
                  <div className="h-4 w-48 bg-muted rounded" />
                  <div className="h-3 w-32 bg-muted rounded" />
                </div>
              </div>
            ))}
          </div>
        ) : sortedBanners.length === 0 ? (
          <Card.Root>
            <Card.Content className="flex flex-col items-center justify-center py-16 text-center">
              <div className="w-16 h-16 rounded-2xl bg-secondary flex items-center justify-center mb-4">
                <ImageIcon className="w-7 h-7 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-semibold text-foreground mb-1">Nenhum banner criado</h3>
              <p className="text-sm text-muted-foreground mb-4 max-w-sm">
                Crie banners promocionais com precos, imagens do Canva ou slides editoriais para o carousel da homepage.
              </p>
              <Button color="primary" size="sm" onClick={handleCreate}>
                <Plus className="w-3.5 h-3.5 mr-1.5" /> Criar Primeiro Banner
              </Button>
            </Card.Content>
          </Card.Root>
        ) : (
          <>
            <div className="space-y-2">
              {sortedBanners.map((banner, idx) => (
                <BannerListItem
                  key={banner.id}
                  banner={banner}
                  index={idx}
                  onEdit={() => setEditingBanner({ ...banner })}
                  onToggle={() => handleToggle(banner)}
                  onDelete={() => setDeleteConfirm(banner.id)}
                  onMove={handleMove}
                />
              ))}
            </div>
            <div className="mt-4 flex justify-end">
              <Button color="primary" size="sm" onClick={saveReorderedBanners}>
                <Save className="w-3.5 h-3.5 mr-1.5" />
                Salvar Ordem
              </Button>
            </div>
          </>
        )}

        {/* Delete Confirmation */}
        <Dialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
          <DialogContent className="sm:max-w-[400px]">
            <DialogHeader>
              <DialogTitle>Remover Banner</DialogTitle>
              <DialogDescription>
                Tem certeza que deseja remover este banner? Esta acao nao pode ser desfeita.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button color="secondary" size="sm" onClick={() => setDeleteConfirm(null)}>Cancelar</Button>
              <Button color="primary" size="sm" className="bg-destructive hover:bg-destructive/90" onClick={() => deleteConfirm && handleDelete(deleteConfirm)}>
                <Trash2 className="w-3.5 h-3.5 mr-1.5" /> Remover
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DndProvider>
  );
}