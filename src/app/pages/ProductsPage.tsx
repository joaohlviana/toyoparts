import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  Search, ChevronLeft, ChevronRight, ChevronDown,
  X, Image as ImageIcon,
  ArrowUp, ArrowDown,
  MoreHorizontal, Columns3,
  SlidersHorizontal, Plus, Download, Check
} from 'lucide-react';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'motion/react';
import { projectId } from '../../../utils/supabase/info';
import { adminFetch } from '../lib/admin-auth';
import { cn } from '../components/ui/utils';

import { Button } from '../components/base/button';
import { Badge } from '../components/base/badge';
import { Input } from '../components/base/input';
import { Checkbox } from '../components/ui/checkbox';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from '../components/ui/sheet';
import { Skeleton } from '../components/ui/skeleton';
import { ProductEditor } from '../components/admin/ProductEditor';

import { FilterBuilder, CategoryOption } from '../components/filter-builder/FilterBuilder';
import { filtersToBuilder, builderToFilters } from '../components/filter-builder/utils';
import type { FilterGroup as IFilterGroup } from '../components/filter-builder/types';

const API = `https://${projectId}.supabase.co/functions/v1/make-server-1d6e33e0`;


// ─── DS Token Constants (for compact inline elements) ────────────────────────
// Matches Untitled UI Input: border-input, bg-input-background, rounded-lg,
// shadow-xs, focus:ring-4 focus:ring-ring/10 focus:border-ring

const INPUT_SM =
  "h-8 w-full px-2.5 text-xs bg-input-background border border-input rounded-lg shadow-xs transition-all placeholder:text-muted-foreground focus:outline-none focus:ring-4 focus:ring-ring/10 focus:border-ring disabled:cursor-not-allowed disabled:opacity-50";

// ─── Types ───────────────────────────────────────────────────────────────────

interface Product {
  id: string;
  sku: string;
  name: string;
  price: number;
  special_price: number | null;
  status: number;
  type_id: string;
  in_stock: boolean;
  category_ids: string[];
  category_names: string[];
  modelos: string[];
  anos: string[];
  color: string | null;
  image_url: string | null;
  description: string;
  short_description: string;
  created_at?: string;
  updated_at?: string;
  has_image?: boolean;
  has_promotion?: boolean;
}

interface SearchResponse {
  hits: Product[];
  totalHits: number;
  facetDistribution: Record<string, Record<string, number>>;
  processingTimeMs: number;
  limit: number;
  offset: number;
}

interface Filters {
  status: string;
  inStock: string;
  minPrice: string;
  maxPrice: string;
  categories: string[];
  modelos: string[];
  anos: string[];
  noCategory: boolean;
  hasPromotion: boolean;
  hasImage: string;
  type_id: string;
  name: string;
  nameOp: string;
  sku: string;
  skuOp: string;
}

const EMPTY_FILTERS: Filters = {
  status: '', inStock: '', minPrice: '', maxPrice: '',
  categories: [], modelos: [], anos: [],
  noCategory: false, hasPromotion: false, hasImage: '', type_id: '',
  name: '', nameOp: '', sku: '', skuOp: '',
};

type SortField = 'name' | 'price' | 'created_at';
type SortDir = 'asc' | 'desc';

// ─── Column Definitions ──────────────────────────────────────────────────────

type ColumnId = 'sku' | 'image' | 'name' | 'status' | 'stock' | 'price' | 'category' | 'type' | 'modelos' | 'promo';

interface ColumnDef {
  id: ColumnId;
  label: string;
  defaultVisible: boolean;
  sortField?: SortField;
  minWidth?: string;
}

const ALL_COLUMNS: ColumnDef[] = [
  { id: 'sku',      label: 'SKU',        defaultVisible: true,  minWidth: 'min-w-[140px]' },
  { id: 'image',    label: 'Imagem',     defaultVisible: true,  minWidth: 'min-w-[56px]' },
  { id: 'name',     label: 'Nome',       defaultVisible: true,  sortField: 'name', minWidth: 'min-w-[240px]' },
  { id: 'status',   label: 'Status',     defaultVisible: true },
  { id: 'stock',    label: 'Estoque',    defaultVisible: true },
  { id: 'price',    label: 'Preço',      defaultVisible: true,  sortField: 'price' },
  { id: 'category', label: 'Categoria',  defaultVisible: true,  minWidth: 'min-w-[140px]' },
  { id: 'type',     label: 'Tipo',       defaultVisible: false },
  { id: 'modelos',  label: 'Modelos',    defaultVisible: false, minWidth: 'min-w-[200px]' },
  { id: 'promo',    label: 'Promoção',   defaultVisible: false },
];

const DEFAULT_VISIBLE = new Set<ColumnId>(
  ALL_COLUMNS.filter(c => c.defaultVisible).map(c => c.id)
);

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function statusLabel(s: number) { return s === 1 ? 'Ativo' : 'Inativo'; }
function statusColor(s: number): 'success' | 'gray' { return s === 1 ? 'success' : 'gray'; }
function stockLabel(s: boolean) { return s ? 'Em estoque' : 'Esgotado'; }
function stockColor(s: boolean): 'success' | 'error' { return s ? 'success' : 'error'; }

// ─── DS Inline Select (Untitled UI dropdown style) ───────────────────────────

function ColumnSelect({ value, options, onChange, placeholder }: {
  value: string;
  options: { label: string; value: string }[];
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selectedLabel = options.find(o => o.value === value)?.label;

  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={cn(
          "h-8 w-full flex items-center justify-between gap-1 px-2.5 text-xs rounded-lg border border-input bg-input-background shadow-xs",
          "hover:bg-secondary transition-colors cursor-pointer select-none whitespace-nowrap",
          !value && "text-muted-foreground"
        )}
      >
        <span className="truncate">{selectedLabel || placeholder || 'Todos'}</span>
        <ChevronDown className={cn("w-3 h-3 text-muted-foreground shrink-0 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="absolute z-50 top-full left-0 mt-1 min-w-full w-max bg-popover border border-border rounded-xl shadow-lg py-1 max-h-[200px] overflow-y-auto">
          <button
            type="button"
            onClick={() => { onChange(''); setOpen(false); }}
            className={cn(
              "w-full text-left px-3 py-1.5 text-xs hover:bg-secondary transition-colors flex items-center gap-2",
              !value && "bg-secondary font-medium text-foreground"
            )}
          >
            {!value && <Check className="w-3 h-3 text-foreground shrink-0" />}
            <span className={value ? "pl-5" : ""}>{placeholder || 'Todos'}</span>
          </button>
          {options.map(o => (
            <button
              key={o.value}
              type="button"
              onClick={() => { onChange(o.value); setOpen(false); }}
              className={cn(
                "w-full text-left px-3 py-1.5 text-xs hover:bg-secondary transition-colors flex items-center gap-2",
                o.value === value && "bg-secondary font-medium text-foreground"
              )}
            >
              {o.value === value && <Check className="w-3 h-3 text-foreground shrink-0" />}
              <span className={o.value !== value ? "pl-5" : ""}>{o.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── DS Column Picker Dropdown ───────────────────────────────────────────────

function ColumnPicker({ visible, onToggle }: {
  visible: Set<ColumnId>;
  onToggle: (id: ColumnId) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  return (
    <div ref={ref} className="relative">
      <Button color="secondary" size="sm" iconLeading={<Columns3 className="w-4 h-4" />} onClick={() => setOpen(!open)}>
        Colunas
      </Button>
      {open && (
        <div className="absolute right-0 top-full mt-1 w-52 bg-popover border border-border rounded-xl shadow-lg z-50 py-1">
          <div className="px-3 py-2 border-b border-border">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Colunas visíveis</span>
          </div>
          {ALL_COLUMNS.map(col => {
            const isOn = visible.has(col.id);
            return (
              <button
                key={col.id}
                type="button"
                onClick={() => onToggle(col.id)}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-secondary transition-colors text-left"
              >
                <div className={cn(
                  "w-4 h-4 rounded-[4px] border flex items-center justify-center shrink-0 transition-colors shadow-xs",
                  isOn ? "bg-primary border-primary" : "border-input bg-input-background"
                )}>
                  {isOn && <Check className="w-3 h-3 text-primary-foreground" />}
                </div>
                <span className={cn("text-foreground", isOn && "font-medium")}>{col.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────

// Editor Skeleton — mimics ProductEditor layout while data loads
function EditorSkeleton() {
  return (
    <div className="flex flex-col h-full bg-background overflow-hidden animate-in fade-in duration-300">
      {/* Header */}
      <div className="px-6 py-4 border-b border-border bg-card flex items-center justify-between shrink-0">
        <div className="flex items-center gap-4">
          <Skeleton className="w-9 h-9 rounded-full" />
          <div className="space-y-2">
            <Skeleton className="w-32 h-5 rounded-md" />
            <Skeleton className="w-24 h-3.5 rounded-md" />
          </div>
        </div>
        <Skeleton className="w-36 h-9 rounded-lg" />
      </div>
      {/* Tabs */}
      <div className="px-6 border-b border-border bg-card flex gap-6 shrink-0">
        {[100, 80, 110, 60].map((w, i) => (
          <div key={i} className="py-4">
            <Skeleton className="rounded-md h-4" style={{ width: w }} />
          </div>
        ))}
      </div>
      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Section 1 */}
        <div className="space-y-4">
          <Skeleton className="w-28 h-4 rounded-md" />
          <div className="grid grid-cols-2 gap-4">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="space-y-2">
                <Skeleton className="w-16 h-3 rounded-md" />
                <Skeleton className="w-full h-9 rounded-lg" />
              </div>
            ))}
          </div>
        </div>
        {/* Section 2 */}
        <div className="space-y-4">
          <Skeleton className="w-24 h-4 rounded-md" />
          <div className="grid grid-cols-3 gap-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="space-y-2">
                <Skeleton className="w-20 h-3 rounded-md" />
                <Skeleton className="w-full h-9 rounded-lg" />
              </div>
            ))}
          </div>
        </div>
        {/* Section 3 - Text area */}
        <div className="space-y-4">
          <Skeleton className="w-20 h-4 rounded-md" />
          <Skeleton className="w-full h-28 rounded-lg" />
        </div>
        {/* Section 4 */}
        <div className="space-y-4">
          <Skeleton className="w-32 h-4 rounded-md" />
          <div className="grid grid-cols-2 gap-4">
            {[1, 2].map(i => (
              <div key={i} className="space-y-2">
                <Skeleton className="w-14 h-3 rounded-md" />
                <Skeleton className="w-full h-9 rounded-lg" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function ProductsPage() {
  const [searchInput, setSearchInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<SearchResponse>({
    hits: [], totalHits: 0, facetDistribution: {},
    processingTimeMs: 0, limit: 50, offset: 0,
  });

  const [filters, setFilters] = useState<Filters>({ ...EMPTY_FILTERS, status: '1', inStock: 'true' });
  const [sortField, setSortField] = useState<SortField | ''>('');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [page, setPage] = useState(1);
  const [pageSize] = useState(50);
  const [selectedSkus, setSelectedSkus] = useState<Set<string>>(new Set());
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [visibleColumns, setVisibleColumns] = useState<Set<ColumnId>>(DEFAULT_VISIBLE);

  // Advanced filter builder tree — kept as own state so adding empty rules
  // isn't lost during the round-trip conversion tree→flat→tree.
  const [advancedRoot, setAdvancedRoot] = useState<IFilterGroup>(() => filtersToBuilder({ ...EMPTY_FILTERS, status: '1', inStock: 'true' }) as IFilterGroup);

  // Column text filter local state (debounced)
  const [colSku, setColSku] = useState('');
  const [colName, setColName] = useState('');

  // All categories (full tree, fetched once)
  const [allCategories, setAllCategories] = useState<CategoryOption[]>([]);

  // Category ID→Name map (para resolver nomes quando Meili não tem category_names)
  const categoryIdToName = useMemo(() => {
    const map = new Map<string, string>();
    for (const cat of allCategories) {
      map.set(String(cat.id), cat.name);
    }
    return map;
  }, [allCategories]);

  // Helper: resolve category names de um produto, com fallback para map local
  const resolveCategories = useCallback((p: Product): string[] => {
    if (p.category_names && p.category_names.length > 0) return p.category_names;
    // Fallback: resolver a partir de category_ids usando o map carregado do full-tree
    if (p.category_ids && p.category_ids.length > 0 && categoryIdToName.size > 0) {
      return p.category_ids
        .map(id => categoryIdToName.get(String(id)))
        .filter((n): n is string => !!n);
    }
    return [];
  }, [categoryIdToName]);

  const toggleColumn = (id: ColumnId) => {
    setVisibleColumns(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  // ─── Fetch ALL Categories (once on mount) ──────────────────────────────────

  useEffect(() => {
    (async () => {
      try {
        const res = await adminFetch(`${API}/admin/categories/full-tree`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (json.allCategories) {
          setAllCategories(json.allCategories);
          console.log(`[CATEGORIES] Loaded ${json.allCategories.length} categories from full-tree`);
        }
      } catch (err: any) {
        console.error('[CATEGORIES] Failed to load full tree:', err.message);
      }
    })();
  }, []);

  // ─── URL Sync ──────────────────────────────────────────────────────────────

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    if (Array.from(p.keys()).length === 0) return;
    const nf = { ...EMPTY_FILTERS };
    if (p.has('status')) nf.status = p.get('status')!;
    if (p.has('inStock')) nf.inStock = p.get('inStock')!;
    if (p.has('minPrice')) nf.minPrice = p.get('minPrice')!;
    if (p.has('maxPrice')) nf.maxPrice = p.get('maxPrice')!;
    if (p.has('categories')) nf.categories = p.get('categories')!.split(',');
    if (p.has('modelos')) nf.modelos = p.get('modelos')!.split(',');
    if (p.has('anos')) nf.anos = p.get('anos')!.split(',');
    if (p.has('noCategory')) nf.noCategory = p.get('noCategory') === 'true';
    if (p.has('hasPromotion')) nf.hasPromotion = p.get('hasPromotion') === 'true';
    if (p.has('hasImage')) nf.hasImage = p.get('hasImage')!;
    if (p.has('type_id')) nf.type_id = p.get('type_id')!;
    if (p.has('name')) { nf.name = p.get('name')!; setColName(nf.name); }
    if (p.has('nameOp')) nf.nameOp = p.get('nameOp')!;
    if (p.has('sku')) { nf.sku = p.get('sku')!; setColSku(nf.sku); }
    if (p.has('skuOp')) nf.skuOp = p.get('skuOp')!;
    setFilters(nf);
    if (p.has('page')) setPage(parseInt(p.get('page')!, 10));
    if (p.has('q')) setSearchInput(p.get('q')!);
    if (p.has('sort')) {
      const [f, d] = p.get('sort')!.split(':');
      const validSorts: SortField[] = ['name', 'price', 'created_at'];
      if (validSorts.includes(f as SortField)) {
        setSortField(f as SortField);
        setSortDir((d as SortDir) || 'asc');
      }
    }
  }, []);

  useEffect(() => {
    const p = new URLSearchParams();
    if (searchInput) p.set('q', searchInput);
    if (page > 1) p.set('page', String(page));
    if (filters.status) p.set('status', filters.status);
    if (filters.inStock) p.set('inStock', filters.inStock);
    if (filters.minPrice) p.set('minPrice', filters.minPrice);
    if (filters.maxPrice) p.set('maxPrice', filters.maxPrice);
    if (filters.categories.length) p.set('categories', filters.categories.join(','));
    if (filters.modelos.length) p.set('modelos', filters.modelos.join(','));
    if (filters.anos.length) p.set('anos', filters.anos.join(','));
    if (filters.type_id) p.set('type_id', filters.type_id);
    if (filters.noCategory) p.set('noCategory', 'true');
    if (filters.hasPromotion) p.set('hasPromotion', 'true');
    if (filters.hasImage) p.set('hasImage', filters.hasImage);
    if (filters.name) p.set('name', filters.name);
    if (filters.nameOp) p.set('nameOp', filters.nameOp);
    if (filters.sku) p.set('sku', filters.sku);
    if (filters.skuOp) p.set('skuOp', filters.skuOp);
    if (sortField) p.set('sort', `${sortField}:${sortDir}`);
    window.history.replaceState(null, '', `${window.location.pathname}?${p.toString()}`);
  }, [filters, page, searchInput, sortField, sortDir]);

  // Debounce column text filters into main filters
  useEffect(() => {
    const t = setTimeout(() => {
      setFilters(f => (f.sku === colSku ? f : { ...f, sku: colSku, skuOp: colSku ? 'contains' : '' }));
      setPage(1);
    }, 400);
    return () => clearTimeout(t);
  }, [colSku]);

  useEffect(() => {
    const t = setTimeout(() => {
      setFilters(f => (f.name === colName ? f : { ...f, name: colName, nameOp: colName ? 'contains' : '' }));
      setPage(1);
    }, 400);
    return () => clearTimeout(t);
  }, [colName]);

  // Debounce global search
  useEffect(() => {
    const t = setTimeout(() => { setPage(1); fetchProducts(); }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  // Fetch on filter/sort/page change
  useEffect(() => { fetchProducts(); }, [filters, sortField, sortDir, page, pageSize]);

  const fetchProducts = async () => {
    setLoading(true);
    try {
      const p = new URLSearchParams();
      if (searchInput) p.set('q', searchInput);
      p.set('limit', String(pageSize));
      p.set('offset', String((page - 1) * pageSize));
      if (filters.status) p.set('status', filters.status);
      if (filters.inStock) p.set('inStock', filters.inStock);
      if (filters.minPrice) p.set('minPrice', filters.minPrice);
      if (filters.maxPrice) p.set('maxPrice', filters.maxPrice);
      if (filters.categories.length) p.set('categories', filters.categories.join(','));
      if (filters.modelos.length) p.set('modelos', filters.modelos.join(','));
      if (filters.anos.length) p.set('anos', filters.anos.join(','));
      if (filters.type_id) p.set('type_id', filters.type_id);
      if (filters.noCategory) p.set('noCategory', 'true');
      if (filters.hasPromotion) p.set('hasPromotion', 'true');
      if (filters.hasImage) p.set('hasImage', filters.hasImage);
      if (filters.name) p.set('name', filters.name);
      if (filters.nameOp) p.set('nameOp', filters.nameOp);
      if (filters.sku) p.set('sku', filters.sku);
      if (filters.skuOp) p.set('skuOp', filters.skuOp);
      if (sortField) p.set('sort', `${sortField}:${sortDir}`);
      const res = await adminFetch(`${API}/admin/products?${p}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData(await res.json());
    } catch (err: any) {
      console.error(err);
      toast.error('Falha ao carregar produtos');
    } finally {
      setLoading(false);
    }
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('asc'); }
  };

  const toggleSelectAll = () => {
    if (!data) return;
    setSelectedSkus(prev => prev.size === data.hits.length ? new Set() : new Set(data.hits.map(p => p.sku)));
  };

  const toggleSelect = (sku: string) => {
    setSelectedSkus(prev => { const n = new Set(prev); n.has(sku) ? n.delete(sku) : n.add(sku); return n; });
  };

  const activeFilterCount = useMemo(() => {
    let c = 0;
    if (filters.status) c++;
    if (filters.inStock) c++;
    if (filters.minPrice || filters.maxPrice) c++;
    if (filters.categories.length) c++;
    if (filters.modelos.length) c++;
    if (filters.anos.length) c++;
    if (filters.noCategory) c++;
    if (filters.hasPromotion) c++;
    if (filters.hasImage) c++;
    if (filters.type_id) c++;
    if (filters.name) c++;
    if (filters.sku) c++;
    return c;
  }, [filters]);

  const clearAllFilters = () => { setFilters(EMPTY_FILTERS); setColSku(''); setColName(''); setAdvancedRoot(filtersToBuilder(EMPTY_FILTERS) as IFilterGroup); };

  const totalPages = data ? Math.ceil(data.totalHits / pageSize) : 0;

  const handleBulkStatus = async (newStatus: number) => {
    const skus = Array.from(selectedSkus);
    toast.promise(
      adminFetch(`${API}/admin/products/bulk-status`, {
        method: 'POST',
        body: JSON.stringify({ skus, status: newStatus })
      }).then(r => { if(!r.ok) throw new Error(); return r.json(); }),
      {
        loading: `Atualizando ${skus.length} produtos...`,
        success: () => {
          fetchProducts();
          setSelectedSkus(new Set());
          return `${skus.length} produtos atualizados!`;
        },
        error: 'Erro ao atualizar produtos'
      }
    );
  };

  // ─── Sort Icon ─────────────────────────────────────────────────────────────

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ArrowUp className="w-3.5 h-3.5 text-muted-foreground/30" />;
    return sortDir === 'asc'
      ? <ArrowUp className="w-3.5 h-3.5 text-foreground" />
      : <ArrowDown className="w-3.5 h-3.5 text-foreground" />;
  };

  // ─── Render Cell ───────────────────────────────────────────────────────────

  const renderCell = (col: ColumnId, p: Product) => {
    switch (col) {
      case 'sku': return <span className="font-mono text-xs text-foreground">{p.sku}</span>;
      case 'image': return (
        <div className="h-9 w-9 shrink-0 rounded-lg border border-border bg-secondary overflow-hidden flex items-center justify-center">
          {p.image_url ? <img src={p.image_url} alt="" className="h-full w-full object-cover" /> : <ImageIcon className="w-3.5 h-3.5 text-muted-foreground/30" />}
        </div>
      );
      case 'name': return <span className="text-sm text-foreground truncate block max-w-[320px]" title={p.name}>{p.name}</span>;
      case 'status': return <Badge variant="pill-color" color={statusColor(p.status)} size="sm">{statusLabel(p.status)}</Badge>;
      case 'stock': return <Badge variant="pill-color" color={stockColor(p.in_stock)} size="sm" dot>{stockLabel(p.in_stock)}</Badge>;
      case 'price': return p.special_price ? (
        <div className="flex flex-col leading-tight">
          <span className="text-sm font-medium text-foreground">{fmt(p.special_price)}</span>
          <span className="text-[11px] text-muted-foreground line-through">{fmt(p.price)}</span>
        </div>
      ) : <span className="text-sm text-foreground">{fmt(p.price)}</span>;
      case 'category': {
        const cats = resolveCategories(p);
        return (
          <div className="flex flex-wrap gap-1">
            {cats.slice(0, 1).map(c => <Badge key={c} variant="modern" color="gray" size="sm">{c}</Badge>)}
            {cats.length > 1 && <Badge variant="modern" color="gray" size="xs">+{cats.length - 1}</Badge>}
            {cats.length === 0 && p.category_ids?.length > 0 && (
              <Badge variant="modern" color="warning" size="xs" title={`IDs: ${p.category_ids.join(', ')}`}>
                {p.category_ids.length} ID{p.category_ids.length > 1 ? 's' : ''}
              </Badge>
            )}
          </div>
        );
      }
      case 'type': return <Badge variant="modern" color="gray" size="sm">{p.type_id === 'simple' ? 'Simples' : 'Configurável'}</Badge>;
      case 'modelos': return (
        <div className="flex flex-wrap gap-1">
          {p.modelos?.slice(0, 2).map(m => <Badge key={m} variant="modern" color="gray" size="xs">{m}</Badge>)}
          {(p.modelos?.length || 0) > 2 && <Badge variant="modern" color="gray" size="xs">+{p.modelos.length - 2}</Badge>}
        </div>
      );
      case 'promo': return p.special_price ? <Badge variant="pill-color" color="success" size="sm">Sim</Badge> : <span className="text-xs text-muted-foreground">—</span>;
      default: return null;
    }
  };

  // ─── Column Filter Inputs (DS-compliant) ───────────────────────────────────

  const renderColumnFilter = (col: ColumnId) => {
    switch (col) {
      case 'sku': return (
        <input type="text" value={colSku} onChange={e => setColSku(e.target.value)} placeholder="Filtrar SKU..."
          className={cn(INPUT_SM, "font-mono")} />
      );
      case 'name': return (
        <input type="text" value={colName} onChange={e => setColName(e.target.value)} placeholder="Filtrar nome..."
          className={INPUT_SM} />
      );
      case 'status': return (
        <ColumnSelect value={filters.status} onChange={v => { setFilters(f => ({ ...f, status: v })); setPage(1); }}
          options={[{ label: 'Ativo', value: '1' }, { label: 'Inativo', value: '2' }]} />
      );
      case 'stock': return (
        <ColumnSelect value={filters.inStock} onChange={v => { setFilters(f => ({ ...f, inStock: v })); setPage(1); }}
          options={[{ label: 'Em estoque', value: 'true' }, { label: 'Esgotado', value: 'false' }]} />
      );
      case 'price': return (
        <div className="flex items-center gap-1.5">
          <input type="number" value={filters.minPrice} onChange={e => { setFilters(f => ({ ...f, minPrice: e.target.value })); setPage(1); }} placeholder="Min"
            className={cn(INPUT_SM, "tabular-nums")} />
          <span className="text-muted-foreground text-xs shrink-0">–</span>
          <input type="number" value={filters.maxPrice} onChange={e => { setFilters(f => ({ ...f, maxPrice: e.target.value })); setPage(1); }} placeholder="Max"
            className={cn(INPUT_SM, "tabular-nums")} />
        </div>
      );
      case 'type': return (
        <ColumnSelect value={filters.type_id} onChange={v => { setFilters(f => ({ ...f, type_id: v })); setPage(1); }}
          options={[{ label: 'Simples', value: 'simple' }, { label: 'Configurável', value: 'configurable' }]} />
      );
      case 'promo': return (
        <ColumnSelect value={filters.hasPromotion ? 'true' : ''} onChange={v => { setFilters(f => ({ ...f, hasPromotion: v === 'true' })); setPage(1); }}
          options={[{ label: 'Com promoção', value: 'true' }]} />
      );
      default: return null;
    }
  };

  // ─── Visible Columns ───────────────────────────────────────────────────────

  const visibleCols = ALL_COLUMNS.filter(c => visibleColumns.has(c.id));

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="h-full bg-background text-foreground flex flex-col">

      {/* ═══ Page Header ═══ */}
      <div className="border-b border-border bg-card shrink-0">
        <div className="px-6 py-5">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-lg font-semibold text-foreground leading-tight">Produtos</h1>
              <p className="text-sm text-muted-foreground mt-1">Gerencie o catálogo completo de peças e acessórios Toyota</p>
            </div>
            <div className="flex items-center gap-3">
              <Button color="secondary" size="sm" iconLeading={<Download className="w-4 h-4" />}>Exportar</Button>
              <Button color="primary" size="sm" iconLeading={<Plus className="w-4 h-4" />}>Novo produto</Button>
            </div>
          </div>
        </div>

        {/* Toolbar */}
        <div className="px-6 pb-4 flex items-center gap-3">
          <div className="w-72">
            <Input value={searchInput} onChange={e => setSearchInput(e.target.value)} placeholder="Buscar por nome, SKU..." iconLeading={Search} />
          </div>

          <Button color="secondary" size="md" iconLeading={<SlidersHorizontal className="w-4 h-4" />}
            onClick={() => {
              const opening = !showAdvancedFilters;
              if (opening) {
                // Sync the builder tree from the current flat filters when opening
                setAdvancedRoot(filtersToBuilder(filters) as IFilterGroup);
              }
              setShowAdvancedFilters(opening);
            }} className={cn(showAdvancedFilters && "bg-secondary")}>
            Filtros avançados
            {activeFilterCount > 0 && (
              <Badge variant="pill-color" color="brand" size="xs" className="ml-1">{activeFilterCount}</Badge>
            )}
          </Button>

          {activeFilterCount > 0 && (
            <Button color="tertiary" size="xs" onClick={clearAllFilters}>
              Limpar filtros
            </Button>
          )}

          <div className="flex-1" />

          {!loading && data && (
            <span className="text-sm text-muted-foreground tabular-nums mr-2">
              {data.totalHits.toLocaleString('pt-BR')} resultado{data.totalHits !== 1 ? 's' : ''}
            </span>
          )}

          <ColumnPicker visible={visibleColumns} onToggle={toggleColumn} />
        </div>

        {/* Advanced Filters Panel (collapsible) */}
        {showAdvancedFilters && (
          <div className="border-t border-border bg-secondary/30">
            <div className="px-6 py-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Filtros avançados</span>
                <div className="flex items-center gap-2">
                  {activeFilterCount > 0 && (
                    <Button color="tertiary" size="xs" onClick={clearAllFilters}>Limpar tudo</Button>
                  )}
                  <Button color="tertiary" size="xs" onClick={() => setShowAdvancedFilters(false)} className="!px-1.5">
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              </div>
              <FilterBuilder
                rootGroup={advancedRoot}
                onChange={(g) => { const nf = builderToFilters(g) as Filters; setFilters(nf); setColSku(nf.sku || ''); setColName(nf.name || ''); setAdvancedRoot(g); }}
                facets={data?.facetDistribution || {}}
                allCategories={allCategories}
              />
            </div>
          </div>
        )}
      </div>

      {/* ═══ Full-Width Table ═══ */}
      <main className="flex-1 overflow-auto">
        <div className="w-full overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[800px]">
            <thead className="bg-secondary sticky top-0 z-10">
              {/* Column Headers — matches Table.HeaderCell DS tokens */}
              <tr className="border-b border-border">
                <th className="w-12 px-4 py-3">
                  <Checkbox checked={data && selectedSkus.size === data.hits.length && data.hits.length > 0} onCheckedChange={toggleSelectAll} />
                </th>
                {visibleCols.map(col => (
                  <th key={col.id}
                    className={cn(
                      "px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider whitespace-nowrap",
                      col.minWidth,
                      col.sortField && "cursor-pointer select-none hover:text-foreground transition-colors"
                    )}
                    onClick={col.sortField ? () => handleSort(col.sortField!) : undefined}>
                    <div className="flex items-center gap-1.5">
                      {col.label}
                      {col.sortField && <SortIcon field={col.sortField} />}
                    </div>
                  </th>
                ))}
                <th className="w-12 px-4 py-3" />
              </tr>
              {/* Column Filters */}
              <tr className="border-b border-border bg-secondary/70">
                <td className="px-4 py-2" />
                {visibleCols.map(col => (
                  <td key={col.id} className="px-4 py-2">{renderColumnFilter(col.id)}</td>
                ))}
                <td className="px-4 py-2" />
              </tr>
            </thead>

            {/* Table Body — matches Table.Body & Table.Row DS tokens */}
            <tbody className="divide-y divide-border/50 bg-card">
              {loading ? (
                Array.from({ length: 12 }).map((_, i) => (
                  <tr key={i}>
                    <td className="px-4 py-3"><Skeleton className="w-4 h-4 rounded-[4px]" /></td>
                    {visibleCols.map(col => (
                      <td key={col.id} className="px-4 py-3">
                        {col.id === 'image' ? <Skeleton className="w-9 h-9 rounded-lg" />
                          : (col.id === 'status' || col.id === 'stock') ? <Skeleton className="w-16 h-5 rounded-full" />
                          : <Skeleton className="w-24 h-4 rounded-md" />}
                      </td>
                    ))}
                    <td className="px-4 py-3"><Skeleton className="w-7 h-7 rounded-lg" /></td>
                  </tr>
                ))
              ) : (
                data?.hits.map(product => (
                  <tr key={product.id} className="transition-colors hover:bg-secondary/50 group">
                    <td className="px-4 py-3">
                      <Checkbox checked={selectedSkus.has(product.sku)} onCheckedChange={() => toggleSelect(product.sku)} />
                    </td>
                    {visibleCols.map(col => (
                      <td key={col.id} className="px-4 py-3 text-sm whitespace-nowrap">{renderCell(col.id, product)}</td>
                    ))}
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => { setSelectedProduct(product); setDetailOpen(true); }}
                        className="w-8 h-8 inline-flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors opacity-0 group-hover:opacity-100">
                        <MoreHorizontal className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Empty State */}
        {!loading && data?.hits.length === 0 && (
          <div className="px-6 py-20 text-center">
            <div className="w-12 h-12 bg-secondary rounded-full flex items-center justify-center mx-auto mb-4">
              <Search className="w-5 h-5 text-muted-foreground" />
            </div>
            <h3 className="text-sm font-semibold text-foreground">Nenhum produto encontrado</h3>
            <p className="text-sm text-muted-foreground mt-1 max-w-sm mx-auto">Tente ajustar os filtros ou buscar por outro termo.</p>
            <div className="mt-5">
              <Button color="secondary" size="sm" onClick={clearAllFilters}>Limpar filtros</Button>
            </div>
          </div>
        )}

        {/* Pagination — Untitled UI style */}
        {!loading && data && data.hits.length > 0 && (
          <div className="px-6 py-3.5 flex items-center justify-between border-t border-border bg-card sticky bottom-0 z-10">
            <p className="text-sm text-muted-foreground">
              <span className="tabular-nums">{Math.min(data.offset + 1, data.totalHits)}–{Math.min(data.offset + data.hits.length, data.totalHits)}</span>
              {' '}de{' '}
              <span className="font-medium text-foreground tabular-nums">{data.totalHits.toLocaleString('pt-BR')}</span>
            </p>
            <div className="flex items-center gap-1">
              <Button color="secondary" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                iconLeading={<ChevronLeft className="w-4 h-4" />}>Anterior</Button>
              <div className="hidden sm:flex items-center gap-0.5 mx-1">
                {(() => {
                  const pgs: (number | 'dots')[] = [];
                  if (totalPages <= 7) { for (let i = 1; i <= totalPages; i++) pgs.push(i); }
                  else {
                    pgs.push(1);
                    if (page > 3) pgs.push('dots');
                    for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) pgs.push(i);
                    if (page < totalPages - 2) pgs.push('dots');
                    pgs.push(totalPages);
                  }
                  return pgs.map((pg, idx) => pg === 'dots'
                    ? <span key={`d${idx}`} className="w-8 h-8 flex items-center justify-center text-muted-foreground text-sm select-none">...</span>
                    : <button key={pg} onClick={() => setPage(pg)} className={cn(
                        "w-8 h-8 flex items-center justify-center rounded-lg text-sm font-medium transition-colors",
                        pg === page
                          ? "bg-primary text-primary-foreground shadow-xs"
                          : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                      )}>{pg}</button>
                  );
                })()}
              </div>
              <Button color="secondary" size="sm" onClick={() => setPage(p => p + 1)} disabled={page >= totalPages}
                iconTrailing={<ChevronRight className="w-4 h-4" />}>Próxima</Button>
            </div>
          </div>
        )}
      </main>

      {/* Bulk Action Bar */}
      <AnimatePresence>
        {selectedSkus.size > 0 && (
          <motion.div
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 px-4 py-3 bg-foreground rounded-2xl shadow-2xl border border-white/10 flex items-center gap-6 min-w-[500px]"
          >
            <div className="flex items-center gap-3 pr-6 border-r border-white/20">
              <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-sm font-bold">
                {selectedSkus.size}
              </div>
              <span className="text-sm font-medium text-white whitespace-nowrap">Selecionados</span>
            </div>
            
            <div className="flex items-center gap-2">
              <Button 
                size="sm" 
                variant="outline" 
                className="bg-transparent text-white border-white/20 hover:bg-white/10"
                onClick={() => handleBulkStatus(1)}
              >
                Ativar
              </Button>
              <Button 
                size="sm" 
                variant="outline" 
                className="bg-transparent text-white border-white/20 hover:bg-white/10"
                onClick={() => handleBulkStatus(2)}
              >
                Desativar
              </Button>
              <Button 
                size="sm" 
                variant="outline" 
                className="bg-transparent text-destructive border-destructive/50 hover:bg-destructive/10"
              >
                Excluir
              </Button>
            </div>

            <div className="flex-1" />
            
            <button 
              onClick={() => setSelectedSkus(new Set())}
              className="p-1 hover:bg-white/10 rounded-full text-white/60 hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══ Product Detail Sheet ═══ */}
      <Sheet open={detailOpen} onOpenChange={setDetailOpen}>
        <SheetContent className="w-full sm:max-w-5xl p-0 border-none">
          <SheetHeader className="sr-only">
            <SheetTitle>Editar Produto</SheetTitle>
            <SheetDescription>Detalhes e edição do produto selecionado</SheetDescription>
          </SheetHeader>
          {selectedProduct ? (
            <ProductEditor 
              sku={selectedProduct.sku} 
              onClose={() => setDetailOpen(false)} 
              onSave={() => {
                fetchProducts();
                setDetailOpen(false);
              }}
            />
          ) : (
            <EditorSkeleton />
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}