import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router';
import { toast } from 'sonner';
import { projectId, publicAnonKey } from '../../../utils/supabase/info';
import {
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  SlidersHorizontal,
  ArrowRight,
  X,
  Sparkles,
  Loader2,
  Search,
  Package,
  Check,
  Truck,
  BrainCircuit,
  AlertCircle,
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { ProductCard, ProductCardSkeleton } from '../components/ProductCard';
import { CategoryTreeFilter, type CategoryFilterTreeNode } from '../components/CategoryTreeFilter';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
  DrawerClose,
  DrawerFooter,
} from '../components/ui/drawer';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import { SEOHead } from '../components/seo/SEOHead';
import { trackSearchDebounced, trackSearchClick } from '../lib/search-intelligence-api';
import { getModelStorageIconUrl } from '../lib/media-urls';
import { TrendingSearches } from '../components/TrendingSearches';
import { CAR_MODELS_SEO, SITE_URL } from '../seo-config';

const API = `https://${projectId}.supabase.co/functions/v1/make-server-1d6e33e0`;
const HEADERS: HeadersInit = {
  Authorization: `Bearer ${publicAnonKey}`,
  apikey: publicAnonKey,
  'Content-Type': 'application/json',
};

// ─── Types ──────────────────────────────────────────────────────────────────

interface SearchHit {
  id: string;
  sku: string;
  name: string;
  price: number;
  special_price?: number | null;
  status: number;
  in_stock: boolean;
  type_id?: string;
  description?: string;
  short_description?: string;
  image_url?: string;
  skuMatchType?: 'exact' | 'similar';
  searchedSku?: string;
  _formatted?: { name?: string; sku?: string; description?: string };
  [key: string]: any;
}

interface AIExpansion {
  originalQuery: string;
  keywords: string[];
  filters: {
    modelos?: string[];
    anos?: string[];
    categories?: string[];
  };
  confidence: number;
  processingTimeMs: number;
  debug?: { raw?: string; rejectedReasons?: string[] };
  meta?: {
    applied: Record<string, string[]>;
    ignored: string[];
    conflicts: Record<string, { ai: string[]; manual: string[] }>;
  };
}

interface SearchResult {
  engine: 'meilisearch' | 'kv_fallback' | 'kv_exact';
  mode: 'instant' | 'ai';
  query: string;
  originalQuery: string;
  aiExpansion?: AIExpansion | null;
  hits: SearchHit[];
  totalHits: number;
  facetDistribution: Record<string, Record<string, number>>;
  processingTimeMs: number;
  totalTimeMs: number;
  limit: number;
  offset: number;
  queryIntent?: 'general' | 'sku_exact' | 'sku_similar';
  exactSkuQuery?: string;
  exactSkuMatched?: boolean;
  categoryTree?: CategoryFilterTreeNode[];
  categoryTreeStatus?: 'live' | 'cached' | 'degraded';
  categoryTreeVersion?: string;
  vehicleFacets?: Array<{ slug: string; label: string; count: number }>;
  yearFacets?: Array<{ value: string; count: number }>;
  appliedFilters?: {
    q?: string;
    category?: string[];
    category_name?: string[];
    modelo_slug?: string[];
    anos?: string[];
    inStock?: string | null;
    minPrice?: number | null;
    maxPrice?: number | null;
  };
  catalogVersion?: string;
  _debug?: any;
}

function areFacetSelectionsEqual(
  left: Record<string, string[]>,
  right: Record<string, string[]>,
): boolean {
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  if (leftKeys.length !== rightKeys.length) return false;

  for (let index = 0; index < leftKeys.length; index += 1) {
    if (leftKeys[index] !== rightKeys[index]) return false;
    const leftValues = [...(left[leftKeys[index]] || [])].sort();
    const rightValues = [...(right[rightKeys[index]] || [])].sort();
    if (leftValues.length !== rightValues.length) return false;
    for (let valueIndex = 0; valueIndex < leftValues.length; valueIndex += 1) {
      if (leftValues[valueIndex] !== rightValues[valueIndex]) return false;
    }
  }

  return true;
}

// Maps our internal facet keys -> backend query param names
const FACET_TO_PARAM: Record<string, string> = {
  category_ids: 'category',
  category_names: 'category_name',
  modelos: 'modelos',
  modelo_slugs: 'modelo_slug',
  anos: 'anos',
  color: 'color',
  in_stock: 'inStock',
};

function buildSearchRequestKey(
  q: string,
  page: number,
  ai: boolean,
  sort: string,
  facets: Record<string, string[]>,
) {
  const normalizedFacets = Object.entries(facets || {})
    .filter(([, values]) => Array.isArray(values) && values.length > 0)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, values]) => [key, [...values].sort()]);

  return JSON.stringify({
    q: q || '',
    page,
    ai,
    sort: sort || '',
    facets: normalizedFacets,
  });
}

// ─── Price range key → {min, max} decoder ──
function decodePriceRange(key: string): { min: number; max: number } | null {
  const range = PRICE_RANGES.find(r => r.key === key);
  return range ? { min: range.min, max: range.max } : null;
}

// ─── Car Model Definitions (shared with MegaMenu) ───────────────────────────
interface CarModelDef {
  slug: string;
  modeloIds: string[];
  name: string;
  imgSrc: string;
  storageKey: string;
}

const CAR_MODELS: CarModelDef[] = CAR_MODELS_SEO.map((model) => ({
  slug: model.slug,
  modeloIds: model.modeloIds,
  name: model.name,
  imgSrc: model.imgSrc || getModelStorageIconUrl(model.storageKey),
  storageKey: model.storageKey,
}));

// ─── Price Ranges ────────────────────────────────────────────────────────────
const PRICE_RANGES = [
  { label: 'R$ 0 a R$ 99,99', min: 0, max: 99.99, key: '0-99' },
  { label: 'R$ 100 a R$ 299,99', min: 100, max: 299.99, key: '100-299' },
  { label: 'R$ 300 a R$ 499,99', min: 300, max: 499.99, key: '300-499' },
  { label: 'R$ 500 a R$ 999,99', min: 500, max: 999.99, key: '500-999' },
  { label: 'R$ 1.000 a R$ 1.999,99', min: 1000, max: 1999.99, key: '1000-1999' },
  { label: 'Acima de R$ 2.000', min: 2000, max: Infinity, key: '2000+' },
];

// ─── Custom Checkbox (Untitled UI style) ─────────────────────────────────────

function UCheckbox({
  checked,
  onChange,
  className,
}: {
  checked: boolean;
  onChange: () => void;
  className?: string;
}) {
  return (
    <div
      role="checkbox"
      aria-checked={checked}
      tabIndex={0}
      onClick={onChange}
      onKeyDown={(e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); onChange(); } }}
      className={`w-5 h-5 rounded-lg border flex items-center justify-center flex-shrink-0 cursor-pointer transition-all duration-300 ${
        checked
          ? 'bg-primary border-primary shadow-[0_2px_8px_-2px_rgba(var(--primary),0.4)]'
          : 'bg-white border-black/[0.12] hover:border-black/30'
      } ${className || ''}`}
    >
      <div className={`transition-all duration-300 ${checked ? 'scale-100 opacity-100' : 'scale-50 opacity-0'}`}>
        <Check className="w-3 h-3 text-white" strokeWidth={3.5} />
      </div>
    </div>
  );
}

// ─── Helper Components ───────────────────────────────────────────────────────

function CarModelIcon({ model, size = 60, overrideUrl }: { model: CarModelDef; size?: number; overrideUrl?: string }) {
  return (
    <img
      src={overrideUrl || model.imgSrc}
      alt={model.name}
      style={{ width: size, height: size * 0.5 }}
      className="object-contain brightness-0 opacity-70"
      loading="lazy"
    />
  );
}

// ─── Filter Section Wrapper ──────────────────────────────────────────────────

function FilterSection({
  title,
  defaultOpen = true,
  children,
  count,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
  count?: number;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="border-b border-black/[0.04] last:border-b-0">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between py-4 px-1 text-left group active:opacity-60 transition-opacity"
      >
        <span className="text-[11px] font-bold text-[#86868b] uppercase tracking-[0.05em]">{title}</span>
        <div className="flex items-center gap-2">
          {count != null && count > 0 && (
            <span className="bg-primary text-white text-[10px] font-bold h-4 min-w-[16px] px-1 rounded-full flex items-center justify-center">
              {count}
            </span>
          )}
          <ChevronDown
            className={`w-3.5 h-3.5 text-[#c1c1c7] transition-transform duration-300 ease-[cubic-bezier(0.25,0.1,0.25,1)] ${open ? '' : '-rotate-90'}`}
          />
        </div>
      </button>
      {open && <div className="pb-4 animate-in fade-in slide-in-from-top-1 duration-200">{children}</div>}
    </div>
  );
}

// ─── Filter Item (label + checkbox) ──────────────────────────────────────────

function FilterItem({
  label,
  count,
  checked,
  onChange,
  variant = 'list'
}: {
  label: string;
  count?: number;
  checked: boolean;
  onChange: () => void;
  variant?: 'list' | 'grid';
}) {
  if (variant === 'grid') {
    return (
      <button
        onClick={onChange}
        className={`flex flex-col items-center justify-center gap-1 p-2.5 rounded-xl border transition-all duration-200 text-center ${
          checked
            ? 'border-primary bg-primary/[0.04] text-primary shadow-[inset_0_0_0_1px_rgba(var(--primary),0.1)]'
            : 'border-black/[0.06] bg-white text-[#1d1d1f] hover:border-black/20 hover:bg-[#f5f5f7] active:scale-[0.97]'
        }`}
      >
        <span className={`text-[13px] font-semibold leading-tight ${checked ? 'text-primary' : 'text-[#1d1d1f]'}`}>{label}</span>
        {count != null && count > 0 && (
          <span className={`text-[10px] ${checked ? 'text-primary/60' : 'text-[#86868b]'}`}>{count}</span>
        )}
      </button>
    );
  }

  return (
    <button
      onClick={onChange}
      className={`w-full flex items-center gap-3 py-2.5 px-3 cursor-pointer rounded-xl transition-all duration-200 text-[14px] select-none text-left ${
        checked 
          ? 'bg-primary/[0.04] text-primary font-semibold shadow-[inset_0_0_0_1px_rgba(var(--primary),0.1)]' 
          : 'text-[#1d1d1f] hover:bg-[#f5f5f7] active:bg-black/[0.05]'
      }`}
    >
      <UCheckbox checked={checked} onChange={() => {}} className={checked ? 'ring-2 ring-primary/20' : ''} />
      <span className="flex-1 truncate leading-tight">{label}</span>
      {count != null && (
        <span className={`text-[11px] tabular-nums flex-shrink-0 px-1.5 py-0.5 rounded-full ${
          checked ? 'bg-primary/10 text-primary' : 'bg-black/[0.04] text-[#86868b]'
        }`}>
          {count}
        </span>
      )}
    </button>
  );
}

// ─── Main Search Page ────────────────────────────────────────────────────────

interface SearchPageProps {
  initialQuery?: string | null;
  initialCategory?: string | null;
  initialCategoryName?: string | null;
  initialModeloSlug?: string | null;
  initialModelo?: string | null;
}

export function SearchPage({
  initialQuery,
  initialCategory,
  initialCategoryName,
  initialModeloSlug,
  initialModelo,
}: SearchPageProps = {}) {
  const navigate = useNavigate();
  const location = useLocation();
  const [query, setQuery] = useState(initialQuery || '');
  const [results, setResults] = useState<SearchResult | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [isFirstLoad, setIsFirstLoad] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [aiMode, setAiMode] = useState(false);
  const [sortBy, setSortBy] = useState('');
  const [selectedFacets, setSelectedFacets] = useState<Record<string, string[]>>({});
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [isSearchFocused, setIsSearchFocused] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Guard: prevents debounced search from racing with the initial params search on mount
  const initialSearchDoneRef = useRef(false);
  // Ref to always hold the latest selectedFacets so the debounced search uses current values
  const selectedFacetsRef = useRef<Record<string, string[]>>({});
  selectedFacetsRef.current = selectedFacets;
  const selectedCategoryLabelMemoryRef = useRef<Record<string, string>>({});
  const inFlightSearchKeyRef = useRef<string | null>(null);
  const lastCompletedSearchRef = useRef<{ key: string; at: number } | null>(null);

  const pageSize = 24;
  const slugify = useCallback((text: string) => (
    String(text || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '')
  ), []);

  // ─── Bidirectional lookup helpers for attribute display ──────────────────────
  // Meta stores { optionId: label }, but MeiliSearch facets may contain labels
  // (if transformProduct already resolved them) OR raw IDs (if mapping failed).
  // These helpers resolve EITHER direction: id→label or label→label (passthrough).
  const resolveAno = useCallback((val: string): string => String(val || '').trim(), []);

  const resolveColor = useCallback((val: string): string => String(val || '').trim(), []);

  useEffect(() => {
    return () => {
      if (abortRef.current) abortRef.current.abort();
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, []);

  // Apply initial filters from MegaMenu
  useEffect(() => {
    const nextQuery = initialQuery || '';
    const nextFacets: Record<string, string[]> = {};

    if (initialCategory) {
      nextFacets.category_ids = [initialCategory];
    } else if (initialCategoryName) {
      nextFacets.category_names = [initialCategoryName];
    }

    if (initialModeloSlug) {
      nextFacets.modelo_slugs = [initialModeloSlug];
    } else if (initialModelo) {
      nextFacets.modelos = [initialModelo];
    }

    setQuery(nextQuery);
    setSelectedFacets(nextFacets);
    setCurrentPage(1);
    performSearch(nextQuery, 1, false, '', nextFacets);
    initialSearchDoneRef.current = true;
  }, [initialQuery, initialCategory, initialCategoryName, initialModeloSlug, initialModelo]); // eslint-disable-line react-hooks/exhaustive-deps

  // Search function (with retry for cold-start resilience)
  const performSearch = useCallback(
    async (q: string, page: number, ai: boolean, sort: string, facets: Record<string, string[]>) => {
      const searchKey = buildSearchRequestKey(q, page, ai, sort, facets);
      if (inFlightSearchKeyRef.current === searchKey) {
        return;
      }

      const lastCompleted = lastCompletedSearchRef.current;
      if (lastCompleted?.key === searchKey && Date.now() - lastCompleted.at < 2000) {
        return;
      }

      if (abortRef.current) abortRef.current.abort();
      const ac = new AbortController();
      abortRef.current = ac;
      inFlightSearchKeyRef.current = searchKey;
      setIsSearching(true);

      const maxRetries = 2;

      try {
        const offset = (page - 1) * pageSize;
        const params = new URLSearchParams({
          q,
          limit: pageSize.toString(),
          offset: offset.toString(),
          mode: ai ? 'ai' : 'instant',
        });
        if (sort) params.set('sort', sort);

        for (const [key, values] of Object.entries(facets)) {
          if (!values?.length) continue;
          if (key === 'in_stock' && values.length === 2) continue;
          // Price ranges: decode key to minPrice/maxPrice params
          if (key === 'price') {
            const decoded = decodePriceRange(values[0]);
            if (decoded) {
              params.set('minPrice', String(decoded.min));
              if (decoded.max !== Infinity) params.set('maxPrice', String(decoded.max));
            }
            continue;
          }
          const paramName = FACET_TO_PARAM[key];
          if (paramName) params.set(paramName, values.join(','));
        }

        const url = `${API}/search?${params.toString()}`;
        console.log(`[SEARCH] ${url}`);

        let res: Response | null = null;
        let lastError: any = null;

        for (let attempt = 0; attempt <= maxRetries; attempt++) {
          if (ac.signal.aborted) return;
          try {
            if (attempt > 0) {
              console.log(`[SEARCH] retry attempt ${attempt}/${maxRetries}...`);
              await new Promise(r => setTimeout(r, 1000 * attempt));
            }
            res = await fetch(url, {
              headers: HEADERS,
              signal: ac.signal,
            });
            // Retry on server errors (500/502/503) — usually MeiliSearch cold-start or timeout
            if (res.status >= 500 && attempt < maxRetries) {
              console.warn(`[SEARCH] HTTP ${res.status} (attempt ${attempt + 1}/${maxRetries + 1}), retrying...`);
              res = null;
              continue;
            }
            lastError = null;
            break;
          } catch (fetchErr: any) {
            if (fetchErr.name === 'AbortError') throw fetchErr;
            lastError = fetchErr;
            console.warn(`[SEARCH] fetch failed (attempt ${attempt + 1}):`, fetchErr.message);
          }
        }

        if (lastError || !res) {
          throw lastError || new Error('Search fetch failed after retries');
        }

        if (!res.ok) {
          const errText = await res.text();
          console.error('[SEARCH] HTTP error:', res.status, errText);
          throw new Error(`HTTP ${res.status}`);
        }

        const data: SearchResult = await res.json();
        setResults(data);
        setIsFirstLoad(false);

        const applied = data.appliedFilters;
        if (applied) {
          const nextCanonicalFacets: Record<string, string[]> = {};

          if (Array.isArray(applied.category) && applied.category.length > 0) {
            nextCanonicalFacets.category_ids = [...applied.category];
          } else if (Array.isArray(applied.category_name) && applied.category_name.length > 0) {
            nextCanonicalFacets.category_names = [...applied.category_name];
          }

          if (Array.isArray(applied.modelo_slug) && applied.modelo_slug.length > 0) {
            nextCanonicalFacets.modelo_slugs = [...applied.modelo_slug];
          }

          if (Array.isArray(applied.anos) && applied.anos.length > 0) {
            nextCanonicalFacets.anos = [...applied.anos];
          }

          if (applied.inStock) {
            nextCanonicalFacets.in_stock = [applied.inStock];
          }

          for (const [key, values] of Object.entries(facets || {})) {
            if (!Array.isArray(values) || values.length === 0) continue;
            if (['category_ids', 'category_names', 'modelo_slugs', 'modelos', 'anos', 'in_stock'].includes(key)) continue;
            nextCanonicalFacets[key] = [...values];
          }

          setSelectedFacets((current) => (
            areFacetSelectionsEqual(current, nextCanonicalFacets)
              ? current
              : nextCanonicalFacets
          ));
        }

        console.log(`[SEARCH] "${q}" -> ${data.totalHits} hits, ${data.totalTimeMs}ms, engine=${data.engine}, mode=${data.mode}`);
        if (data.aiExpansion) {
          console.log(`[AI] confidence=${data.aiExpansion.confidence}, filters=${JSON.stringify(data.aiExpansion.filters)}`);
          if (data.aiExpansion.debug?.rejectedReasons?.length) {
            console.warn('[AI] rejected:', data.aiExpansion.debug.rejectedReasons);
          }
        }
        console.log('[FACETS]', JSON.stringify(Object.keys(data.facetDistribution || {})));

        // ─── DIAGNÓSTICO: Categorias no facetDistribution ─────────────────
        const fd = data.facetDistribution || {};
        const catIdsCount = Object.keys(fd.category_ids || {}).length;
        const catNamesCount = Object.keys(fd.category_names || {}).length;
        // Log apenas informativo para debug, sem warn visível ao usuário
        if (catIdsCount > 0 || catNamesCount > 0) {
           console.log(`[FACETS] ✅ category_ids=${catIdsCount}, category_names=${catNamesCount}`);
        } else {
           console.log('[FACETS] ℹ️ Nenhuma faceta de categoria retornada.');
        }
        if ((data as any)._debug) {
          console.log('[FACETS] _debug:', JSON.stringify((data as any)._debug));
        }

        // ─── Search Intelligence Tracking (fire-and-forget) ────────────────
        if (q && q.length >= 2 && page === 1) {
          trackSearchDebounced({
            query_original: q,
            results_count: data.totalHits ?? 0,
            filters: facets,
            source: ai ? 'search_ai' : 'search_page',
            latency_ms: data.totalTimeMs,
          });
        }
      } catch (err: any) {
        if (err.name === 'AbortError') return;
        console.error('[SEARCH] error:', err);
        toast.error('Erro na busca. Tente novamente.');
      } finally {
        if (inFlightSearchKeyRef.current === searchKey) {
          inFlightSearchKeyRef.current = null;
        }
        if (!ac.signal.aborted) {
          lastCompletedSearchRef.current = { key: searchKey, at: Date.now() };
        }
        if (!ac.signal.aborted) setIsSearching(false);
      }
    },
    [],
  );

  // Debounced search (skip on initial mount — handled by the initial params effect above)
  useEffect(() => {
    if (!initialSearchDoneRef.current) return; // guard: initial search handles the first query
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    const delay = aiMode ? 600 : 200;
    searchTimerRef.current = setTimeout(() => {
      setCurrentPage(1);
      performSearch(query, 1, aiMode, sortBy, selectedFacetsRef.current);
    }, delay);
    return () => { if (searchTimerRef.current) clearTimeout(searchTimerRef.current); };
  }, [query, aiMode, sortBy]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleFacet = (facetKey: string, value: string) => {
    setSelectedFacets(prev => {
      const cur = prev[facetKey] || [];
      const isSelected = cur.includes(value);
      const updated = isSelected ? cur.filter(v => v !== value) : [...cur, value];
      const next = { ...prev, [facetKey]: updated };

      if (facetKey === 'category_ids') {
        delete next.category_names;
      }

      if (facetKey === 'category_names') {
        delete next.category_ids;
      }

      if (facetKey === 'modelo_slugs') {
        delete next.modelos;
      }

      if (facetKey === 'modelos') {
        delete next.modelo_slugs;
      }

      // Clean up empty arrays
      for (const k of Object.keys(next)) {
        if (Array.isArray(next[k]) && next[k].length === 0) {
          delete next[k];
        }
      }

      setCurrentPage(1);
      performSearch(query, 1, aiMode, sortBy, next);
      return next;
    });
  };

  const toggleCategory = (categoryId: string) => {
    const resolvedLabel = categoryLabelMap.get(categoryId);
    if (resolvedLabel) {
      selectedCategoryLabelMemoryRef.current[categoryId] = resolvedLabel;
    }
    toggleFacet('category_ids', categoryId);
  };

  const selectSingleFacet = (facetKey: string, value: string) => {
    setSelectedFacets(prev => {
      const cur = prev[facetKey] || [];
      const isSelected = cur.includes(value);
      const next = { ...prev, [facetKey]: isSelected ? [] : [value] };

      if (facetKey === 'category_ids') {
        delete next.category_names;
      }

      if (facetKey === 'category_names') {
        delete next.category_ids;
      }

      if (facetKey === 'modelo_slugs') {
        delete next.modelos;
      }

      if (facetKey === 'modelos') {
        delete next.modelo_slugs;
      }

      for (const key of Object.keys(next)) {
        if (Array.isArray(next[key]) && next[key].length === 0) {
          delete next[key];
        }
      }

      setCurrentPage(1);
      performSearch(query, 1, aiMode, sortBy, next);
      return next;
    });
  };

  const clearAll = () => {
    setQuery('');
    setSelectedFacets({});
    setCurrentPage(1);
    performSearch('', 1, aiMode, sortBy, {});
  };

  const goToPage = (page: number) => {
    setCurrentPage(page);
    performSearch(query, page, aiMode, sortBy, selectedFacets);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Derived
  const totalPages = results ? Math.ceil((results.totalHits ?? 0) / pageSize) : 0;
  const hits = results?.hits || [];
  const facets = results?.facetDistribution || {};
  const categoryTree = results?.categoryTree || [];
  const vehicleFacets = results?.vehicleFacets || [];
  const yearFacets = results?.yearFacets || [];
  const ai = results?.aiExpansion;
  const queryIntent = results?.queryIntent || 'general';
  const exactSkuQuery = results?.exactSkuQuery || '';
  const isSkuExact = queryIntent === 'sku_exact';
  const isSkuSimilar = queryIntent === 'sku_similar';

  const flattenCategoryTree = useCallback((nodes: CategoryFilterTreeNode[]): CategoryFilterTreeNode[] => {
    const flat: CategoryFilterTreeNode[] = [];
    const walk = (items: CategoryFilterTreeNode[]) => {
      for (const item of items) {
        flat.push(item);
        walk(item.children || []);
      }
    };
    walk(nodes);
    return flat;
  }, []);

  const categoryLabelMap = useMemo(() => {
    return new Map(flattenCategoryTree(categoryTree).map((node) => [node.id, node.label]));
  }, [categoryTree, flattenCategoryTree]);

  const vehicleFacetMap = useMemo(() => {
    return new Map(vehicleFacets.map((entry) => [entry.slug, entry.count]));
  }, [vehicleFacets]);

  const pathSegments = useMemo(
    () => location.pathname.split('/').filter(Boolean),
    [location.pathname],
  );

  const selectedCategoryIds = selectedFacets.category_ids || [];
  const selectedLegacyCategoryNames = selectedFacets.category_names || [];
  const selectedCategoryCount = selectedCategoryIds.length > 0
    ? selectedCategoryIds.length
    : selectedLegacyCategoryNames.length;

  const activeFacetCount = useMemo(() => {
    return Object.entries(selectedFacets).reduce((s, [key, a]) => {
      if (key === 'category_names' && (selectedFacets.category_ids || []).length > 0) return s;
      return s + a.length;
    }, 0);
  }, [selectedFacets]);

  // ─── Price range counts: aggregate raw price distribution into buckets ──
  const priceFacetCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    const distribution = facets.price || {};
    
    PRICE_RANGES.forEach(range => {
      let sum = 0;
      Object.entries(distribution).forEach(([priceStr, count]) => {
        const p = parseFloat(priceStr);
        if (p >= range.min && p <= range.max) {
          sum += count;
        }
      });
      counts[range.key] = sum;
    });
    return counts;
  }, [facets.price]);

  // Build context title from active filters
  const contextTitle = useMemo(() => {
    const parts: string[] = [];
    const selectedModelSlugs = selectedFacets.modelo_slugs || [];
    if (selectedModelSlugs.length > 0) {
      const modelNames = selectedModelSlugs.map((slug) => {
        const model = CAR_MODELS.find((entry) => entry.slug === slug);
        return model?.name || slug;
      });
      parts.push(...modelNames);
    } else {
      const selectedModelos = selectedFacets.modelos || [];
      if (selectedModelos.length > 0) {
        const modelNames = selectedModelos.map((value) => {
          const model = CAR_MODELS.find((entry) => entry.modeloIds.includes(value));
          return model?.name || value;
        });
        parts.push(...modelNames);
      }
    }
    if (selectedCategoryIds.length > 0) {
      parts.push(...selectedCategoryIds.slice(0, 2).map((val) => categoryLabelMap.get(val) || val));
    } else if (selectedLegacyCategoryNames.length > 0) {
      parts.push(...selectedLegacyCategoryNames.slice(0, 2));
    }
    if (query) parts.push(`"${query}"`);
    return parts.join(' > ') || 'Todos os Produtos';
  }, [selectedCategoryIds, selectedLegacyCategoryNames, selectedFacets.modelo_slugs, selectedFacets.modelos, query, categoryLabelMap]);

  const activeModelSlug = useMemo(() => {
    const selectedSlug = (selectedFacets.modelo_slugs || [])[0];
    if (selectedSlug) return selectedSlug;
    if (initialModeloSlug) return initialModeloSlug;
    if (pathSegments[0] === 'pecas' && pathSegments[1]) return pathSegments[1];
    return null;
  }, [initialModeloSlug, pathSegments, selectedFacets.modelo_slugs]);

  const activeModel = useMemo(
    () => CAR_MODELS_SEO.find((model) => model.slug === activeModelSlug) || null,
    [activeModelSlug],
  );

  const activeCategoryLabel = useMemo(() => {
    if (selectedCategoryIds.length > 0) {
      return categoryLabelMap.get(selectedCategoryIds[0])
        || selectedCategoryLabelMemoryRef.current[selectedCategoryIds[0]]
        || selectedCategoryIds[0];
    }
    if (selectedLegacyCategoryNames.length > 0) {
      return selectedLegacyCategoryNames[0];
    }
    if (pathSegments[0] === 'pecas' && pathSegments[2]) {
      return pathSegments[2].replace(/-/g, ' ');
    }
    return null;
  }, [categoryLabelMap, pathSegments, selectedCategoryIds, selectedLegacyCategoryNames]);

  const activeCategorySlug = useMemo(() => {
    if (activeCategoryLabel) return slugify(activeCategoryLabel);
    if (pathSegments[0] === 'pecas' && pathSegments[2]) return pathSegments[2];
    return null;
  }, [activeCategoryLabel, pathSegments]);

  const canonicalCatalogUrl = useMemo(() => {
    const params = new URLSearchParams();
    const selectedModelSlugs = selectedFacets.modelo_slugs || [];
    const selectedYears = selectedFacets.anos || [];
    const selectedInStock = selectedFacets.in_stock || [];
    const selectedPrices = selectedFacets.price || [];
    const selectedColors = selectedFacets.color || [];
    const transientFacetKeys = Object.keys(selectedFacets).filter((key) => ![
      'category_ids',
      'category_names',
      'modelo_slugs',
      'modelos',
      'anos',
      'in_stock',
      'price',
      'color',
    ].includes(key));
    const hasTransientFacets = Boolean(query.trim())
      || Boolean(sortBy)
      || selectedYears.length > 0
      || selectedInStock.length > 0
      || selectedPrices.length > 0
      || selectedColors.length > 0
      || selectedModelSlugs.length > 1
      || selectedCategoryIds.length > 1
      || transientFacetKeys.some((key) => (selectedFacets[key] || []).length > 0);

    if (!hasTransientFacets && selectedModelSlugs.length === 1) {
      if (selectedCategoryIds.length === 1) {
        const resolvedCategorySlug = activeCategoryLabel
          ? slugify(activeCategoryLabel)
          : activeCategorySlug;
        if (resolvedCategorySlug) {
          return `/pecas/${selectedModelSlugs[0]}/${resolvedCategorySlug}`;
        }
      }
      return `/pecas/${selectedModelSlugs[0]}`;
    }

    if (!hasTransientFacets && selectedModelSlugs.length === 0 && selectedCategoryIds.length === 0) {
      return '/pecas';
    }

    if (query.trim()) params.set('q', query.trim());
    if (sortBy) params.set('sort', sortBy);
    if (selectedCategoryIds.length > 0) params.set('category', selectedCategoryIds.join(','));
    if (selectedModelSlugs.length > 0) params.set('modelo_slug', selectedModelSlugs.join(','));
    if (selectedYears.length > 0) params.set('anos', selectedYears.join(','));
    if (selectedInStock.length === 1) params.set('inStock', selectedInStock[0]);
    if (selectedColors.length > 0) params.set('color', selectedColors.join(','));

    if (selectedPrices.length > 0) {
      const decodedRange = decodePriceRange(selectedPrices[0]);
      if (decodedRange) {
        params.set('minPrice', String(decodedRange.min));
        if (decodedRange.max !== Infinity) params.set('maxPrice', String(decodedRange.max));
      }
    }

    for (const key of transientFacetKeys) {
      const values = selectedFacets[key] || [];
      if (!values.length) continue;
      const paramName = FACET_TO_PARAM[key] || key;
      params.set(paramName, values.join(','));
    }

    const queryString = params.toString();
    return `/busca${queryString ? `?${queryString}` : ''}`;
  }, [
    activeCategoryLabel,
    activeCategorySlug,
    query,
    selectedCategoryIds,
    selectedFacets,
    sortBy,
    slugify,
  ]);

  const isSearchRoute = location.pathname.startsWith('/busca');
  const isCatalogRootRoute = location.pathname === '/pecas';
  const isModelRoute = pathSegments[0] === 'pecas' && Boolean(pathSegments[1]) && !pathSegments[2];
  const isModelCategoryRoute = pathSegments[0] === 'pecas' && Boolean(pathSegments[1]) && Boolean(pathSegments[2]);
  const hasTransientCatalogFilters = Boolean(query.trim())
    || (selectedFacets.anos || []).length > 0
    || (selectedFacets.in_stock || []).length > 0
    || (selectedFacets.price || []).length > 0
    || (selectedFacets.color || []).length > 0
    || (selectedFacets.modelo_slugs || []).length > 1
    || (selectedCategoryIds.length > 1);
  const shouldIndexModelCategory = isModelCategoryRoute
    && !hasTransientCatalogFilters
    && (results?.totalHits ?? 0) >= 3;

  const seoPayload = useMemo(() => {
    let title = query ? `Busca: ${query}` : 'Busca de Peças';
    let description = 'Encontre peças genuínas Toyota para seu veículo.';
    let robots = 'noindex,follow';
    let canonical = '/busca';
    const breadcrumbItems = [
      { '@type': 'ListItem', position: 1, name: 'Home', item: SITE_URL },
    ];

    if (isCatalogRootRoute) {
      title = 'Peças Toyota';
      description = 'Navegue por todas as peças e acessórios Toyota da Toyoparts com filtros por veículo, categoria e ano.';
      robots = 'index,follow';
      canonical = '/pecas';
      breadcrumbItems.push({
        '@type': 'ListItem',
        position: 2,
        name: 'Peças',
        item: `${SITE_URL}/pecas`,
      });
    } else if (isModelRoute && activeModel) {
      title = activeModel.seoTitle;
      description = activeModel.seoDescription;
      robots = results && results.totalHits > 0 ? 'index,follow' : 'noindex,follow';
      canonical = `/pecas/${activeModel.slug}`;
      breadcrumbItems.push(
        {
          '@type': 'ListItem',
          position: 2,
          name: 'Peças',
          item: `${SITE_URL}/pecas`,
        },
        {
          '@type': 'ListItem',
          position: 3,
          name: activeModel.name,
          item: `${SITE_URL}/pecas/${activeModel.slug}`,
        },
      );
    } else if (isModelCategoryRoute && activeModel && activeCategorySlug) {
      title = activeCategoryLabel
        ? `${activeCategoryLabel} para Toyota ${activeModel.name}`
        : `Peças ${activeModel.name}`;
      description = activeCategoryLabel
        ? `Confira ${activeCategoryLabel.toLowerCase()} compatíveis com Toyota ${activeModel.name} na Toyoparts.`
        : `Confira peças Toyota ${activeModel.name} na Toyoparts.`;
      robots = shouldIndexModelCategory ? 'index,follow' : 'noindex,follow';
      canonical = `/pecas/${activeModel.slug}/${activeCategorySlug}`;
      breadcrumbItems.push(
        {
          '@type': 'ListItem',
          position: 2,
          name: 'Peças',
          item: `${SITE_URL}/pecas`,
        },
        {
          '@type': 'ListItem',
          position: 3,
          name: activeModel.name,
          item: `${SITE_URL}/pecas/${activeModel.slug}`,
        },
        {
          '@type': 'ListItem',
          position: 4,
          name: activeCategoryLabel || activeCategorySlug,
          item: `${SITE_URL}/pecas/${activeModel.slug}/${activeCategorySlug}`,
        },
      );
    }

    return {
      title,
      description,
      robots,
      canonical,
      jsonLd: [
        {
          '@context': 'https://schema.org',
          '@type': 'CollectionPage',
          name: title,
          description,
          url: `${SITE_URL}${canonical}`,
        },
        {
          '@context': 'https://schema.org',
          '@type': 'BreadcrumbList',
          itemListElement: breadcrumbItems,
        },
      ],
    };
  }, [
    activeCategoryLabel,
    activeCategorySlug,
    activeModel,
    isCatalogRootRoute,
    isModelCategoryRoute,
    isModelRoute,
    query,
    results,
    shouldIndexModelCategory,
  ]);

  useEffect(() => {
    if (!results) return;
    const currentUrl = `${location.pathname}${location.search}`;
    if (canonicalCatalogUrl === currentUrl) return;
    navigate(canonicalCatalogUrl, { replace: true });
  }, [canonicalCatalogUrl, location.pathname, location.search, navigate, results]);

  // ─── Sidebar Content ──────────────────────────────────────────────────────

  const sidebarContent = (
    <div className="space-y-0">
      {/* ── Departamento (Categories — Tree View) ── */}
      {(categoryTree.length > 0 || selectedCategoryCount > 0) && (
      <FilterSection
        title="Departamentos"
        defaultOpen={true}
        count={selectedCategoryCount}
      >
        <div className="max-h-[60vh] overflow-y-auto pr-1 custom-scrollbar">
          <CategoryTreeFilter
            nodes={categoryTree}
            onToggle={toggleCategory}
            isLoading={isFirstLoad}
          />
        </div>
      </FilterSection>
      )}

      {/* ── Modelo de veículo ── */}
      <FilterSection
        title="Modelo de Veículo"
        defaultOpen={true}
        count={(selectedFacets.modelo_slugs || []).length}
      >
        <div className="grid grid-cols-2 gap-2 max-h-[380px] overflow-y-auto pr-1 custom-scrollbar">
          {CAR_MODELS.map(model => {
            const isSelected = (selectedFacets.modelo_slugs || []).includes(model.slug);
            const modelCount = vehicleFacetMap.get(model.slug) ?? null;
            return (
              <button
                key={model.slug}
                onClick={() => selectSingleFacet('modelo_slugs', model.slug)}
                className={`flex flex-col items-center gap-1.5 p-3 rounded-2xl border transition-all text-center ${
                  isSelected
                    ? 'border-primary bg-primary/[0.04] text-primary shadow-[inset_0_0_0_1px_rgba(var(--primary),0.1)]'
                    : 'border-black/[0.06] bg-white text-[#86868b] hover:border-black/20 hover:bg-[#f5f5f7] active:scale-[0.97]'
                }`}
              >
                <div className={`h-6 flex items-center justify-center transition-all duration-300 ${isSelected ? 'scale-110' : 'opacity-60'}`}>
                  <CarModelIcon model={model} size={54} />
                </div>
                <span className={`text-[12px] font-bold leading-tight mt-0.5 ${isSelected ? 'text-primary' : 'text-[#1d1d1f]'}`}>{model.name}</span>
                {modelCount != null && modelCount > 0 && (
                  <span className={`text-[10px] ${isSelected ? 'text-primary/60' : 'text-[#86868b]'}`}>{modelCount}</span>
                )}
              </button>
            );
          })}
        </div>
      </FilterSection>

      {/* ── Ano de veículo ── */}
      {yearFacets.length > 0 && (
        <FilterSection
          title="Ano do Veículo"
          defaultOpen={true}
          count={(selectedFacets.anos || []).length}
        >
          <div className="space-y-0.5 pr-1 max-h-[380px] overflow-y-auto custom-scrollbar">
            {yearFacets.map(({ value: val, count }) => {
                const checked = (selectedFacets.anos || []).includes(val);
                const displayVal = resolveAno(val);
                return (
                  <FilterItem
                    key={val}
                    label={displayVal}
                    count={count}
                    checked={checked}
                    variant="list"
                    onChange={() => toggleFacet('anos', val)}
                  />
                );
              })}
          </div>
        </FilterSection>
      )}

      {/* ── Preço ── */}
      <FilterSection
        title="Faixa de Preço"
        defaultOpen={false}
        count={(selectedFacets.price || []).length}
      >
        <div className="grid grid-cols-1 gap-1">
          {PRICE_RANGES.map(range => {
            const isChecked = (selectedFacets.price || []).includes(range.key);
            const count = priceFacetCounts[range.key] || 0;
            return (
              <FilterItem
                key={range.key}
                label={range.label}
                count={count}
                checked={isChecked}
                onChange={() => selectSingleFacet('price', range.key)}
              />
            );
          })}
        </div>
      </FilterSection>

      {/* ── Estoque ── */}
      {facets.in_stock && Object.keys(facets.in_stock).length > 0 && (
        <FilterSection
          title="Estoque"
          defaultOpen={true}
          count={(selectedFacets.in_stock || []).length}
        >
          <div className="space-y-0.5">
            {Object.entries(facets.in_stock)
              .sort((a, b) => (a[0] === 'true' ? -1 : 1))
              .map(([val, count]) => {
                const checked = (selectedFacets.in_stock || []).includes(val);
                const displayVal = val === 'true' ? 'Em estoque' : 'Sem estoque';
                return (
                  <FilterItem
                    key={val}
                    label={displayVal}
                    count={count}
                    checked={checked}
                    onChange={() => toggleFacet('in_stock', val)}
                  />
                );
              })}
          </div>
        </FilterSection>
      )}

      {/* ── Color ── */}
      {facets.color && Object.keys(facets.color).length > 0 && (
        <FilterSection
          title="Cor"
          defaultOpen={false}
          count={(selectedFacets.color || []).length}
        >
          <div className="max-h-40 overflow-y-auto pr-1 custom-scrollbar space-y-0.5">
            {Object.entries(facets.color)
              .sort((a, b) => b[1] - a[1])
              .map(([val, count]) => {
                const checked = (selectedFacets.color || []).includes(val);
                const displayVal = resolveColor(val);
                return (
                  <FilterItem
                    key={val}
                    label={displayVal}
                    count={count}
                    checked={checked}
                    onChange={() => toggleFacet('color', val)}
                  />
                );
              })}
          </div>
        </FilterSection>
      )}

      {/* ── Other dynamic facets (exclude internal fields) ── */}
      {Object.entries(facets)
        .filter(([key]) => !['category_names', 'category_ids', 'modelos', 'modelo_slugs', 'anos', 'in_stock', 'color', 'status', 'type_id', 'price'].includes(key))
        .filter(([, valuesMap]) => Object.keys(valuesMap).length > 0)
        .map(([facetKey, valuesMap]) => (
          <FilterSection key={facetKey} title={facetKey} defaultOpen={false}>
            <div className="max-h-40 overflow-y-auto pr-1 space-y-0.5">
              {Object.entries(valuesMap)
                .sort((a, b) => b[1] - a[1])
                .map(([val, count]) => {
                  const checked = (selectedFacets[facetKey] || []).includes(val);
                  return (
                    <FilterItem
                      key={val}
                      label={val}
                      count={count}
                      checked={checked}
                      onChange={() => toggleFacet(facetKey, val)}
                    />
                  );
                })}
            </div>
          </FilterSection>
        ))}
    </div>
  );

  // ─── Pagination ────────────────────────────────────────────────────────────

  // Show fewer page buttons on mobile
  const maxPageButtons = typeof window !== 'undefined' && window.innerWidth < 640 ? 5 : 7;
  const paginationUI = totalPages > 1 && (
    <div className="flex items-center justify-center gap-2 mt-8 sm:mt-10 mb-6">
      <Button
        variant="outline"
        size="icon"
        disabled={currentPage === 1}
        onClick={() => goToPage(currentPage - 1)}
        className="w-11 h-11 sm:w-10 sm:h-10 rounded-xl border-black/[0.05] bg-white active:scale-90 transition-transform shadow-sm"
      >
        <ChevronLeft className="w-5 h-5" />
      </Button>
      {Array.from({ length: Math.min(totalPages, maxPageButtons) }, (_, i) => {
        let p: number;
        const half = Math.floor(maxPageButtons / 2);
        if (totalPages <= maxPageButtons) p = i + 1;
        else if (currentPage <= half + 1) p = i + 1;
        else if (currentPage >= totalPages - half) p = totalPages - maxPageButtons + 1 + i;
        else p = currentPage - half + i;
        return (
          <Button
            key={p}
            variant={p === currentPage ? 'default' : 'outline'}
            size="icon"
            onClick={() => goToPage(p)}
            className={`w-11 h-11 sm:w-10 sm:h-10 text-[15px] sm:text-sm font-bold rounded-xl active:scale-90 transition-transform ${
              p === currentPage 
                ? 'bg-[#1d1d1f] text-white shadow-md' 
                : 'border-black/[0.05] bg-white text-[#1d1d1f] shadow-sm'
            }`}
          >
            {p}
          </Button>
        );
      })}
      <Button
        variant="outline"
        size="icon"
        disabled={currentPage === totalPages}
        onClick={() => goToPage(currentPage + 1)}
        className="w-11 h-11 sm:w-10 sm:h-10 rounded-xl border-black/[0.05] bg-white active:scale-90 transition-transform shadow-sm"
      >
        <ChevronRight className="w-5 h-5" />
      </Button>
    </div>
  );

  // ─── Render ────────────────────────────────────────────────────────────────


  const goToProduct = (hit: SearchHit, index?: number) => {
    if (!hit.sku) return;
    const slug = hit.url_key || slugify(hit.name);
    navigate(`/produto/${encodeURIComponent(hit.sku)}/${slug}`);
    // Track search result click (fire-and-forget)
    if (query) {
      trackSearchClick({
        query_original: query,
        product_sku: hit.sku,
        position: (index ?? 0) + 1 + (currentPage - 1) * pageSize,
        source: aiMode ? 'search_ai' : 'search_page',
      });
    }
  };

  return (
    <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-4 sm:pt-6 pb-10 sm:pb-16">
      <SEOHead
        title={seoPayload.title}
        robots={seoPayload.robots}
        description={seoPayload.description}
        canonical={seoPayload.canonical}
        ogType="website"
        jsonLd={seoPayload.jsonLd}
      />
      
      {/* ── Search Backdrop (Spotlight) ── */}
      {isSearchFocused && (
        <div 
          className="fixed inset-0 z-[55] bg-black/40 backdrop-blur-md pointer-events-none"
        />
      )}

      {/* ── AI Mode Banner (enhanced) ── */}
      {ai && aiMode && (
        <div className="mb-5 space-y-2">
          <div className="flex items-center gap-2 flex-wrap text-[11px] text-muted-foreground bg-purple-50/50 p-2 rounded-lg border border-purple-100/50">
            <BrainCircuit className="w-3.5 h-3.5 text-purple-500 flex-shrink-0" />
            <span className="font-bold text-purple-600 uppercase tracking-tight">Inteligência Toyoparts</span>
            <span>·</span>
            <span className="tabular-nums">{ai.processingTimeMs}ms</span>
            <span>·</span>
            <span className="tabular-nums">{(ai.confidence * 100).toFixed(0)}% confiança</span>
            
            {ai.meta?.applied && Object.keys(ai.meta.applied).length > 0 && (
              <div className="flex items-center gap-1.5 ml-1">
                <span className="text-muted-foreground/60">Aplicou:</span>
                {Object.entries(ai.meta.applied).map(([key, vals]) => (
                  <Badge key={key} variant="secondary" className="h-4 px-1.5 text-[9px] bg-purple-100 text-purple-700 border-purple-200 capitalize">
                    {key}: {Array.isArray(vals) ? vals.join(', ') : vals}
                  </Badge>
                ))}
              </div>
            )}
          </div>

          {ai.meta?.conflicts && Object.keys(ai.meta.conflicts).length > 0 && (
            <div className="flex flex-col gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-[11px] text-amber-800 animate-in fade-in slide-in-from-top-1">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-3.5 h-3.5 text-amber-600 flex-shrink-0" />
                <strong className="whitespace-nowrap">Conflito detectado:</strong>
                <span className="flex-1">Você selecionou filtros manuais que divergem da interpretação da IA.</span>
              </div>
              <div className="flex flex-wrap gap-2 ml-5.5">
                {Object.entries(ai.meta.conflicts).map(([key, conflict]: [string, any]) => (
                  <div key={key} className="flex items-center gap-2 bg-white/60 px-2 py-1 rounded border border-amber-100">
                    <span className="font-bold capitalize">{key}:</span>
                    <span className="line-through text-muted-foreground">{conflict.ai.join(', ')}</span>
                    <ChevronRight className="w-3 h-3 text-amber-400" />
                    <span className="font-bold text-amber-900">{conflict.manual.join(', ')} (Soberano)</span>
                    <button 
                      onClick={() => {
                        const nextFacets = { ...selectedFacets };
                        const facetKey = key === 'categories' ? 'category_names' : key;
                        if (facetKey === 'category_names') {
                          delete nextFacets.category_ids;
                        }
                        nextFacets[facetKey] = conflict.ai;
                        setSelectedFacets(nextFacets);
                        setCurrentPage(1);
                        performSearch(query, 1, aiMode, sortBy, nextFacets);
                      }}
                      className="ml-1 text-[10px] font-bold text-primary hover:underline"
                    >
                      Trocar para IA
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {ai.confidence < 0.65 && (
            <div className="px-3 py-1.5 bg-red-50 border border-red-100 rounded-lg text-[11px] text-red-700 flex items-center gap-2">
              <X className="w-3 h-3 flex-shrink-0" />
              Baixa confiança na interpretação. Filtros automáticos ignorados.
            </div>
          )}
        </div>
      )}

      {/* ── Main Layout ── */}
      <div className="flex gap-8 items-start">

        {/* ── Desktop Sidebar (borderless, minimal) ── */}
        <aside className="hidden lg:block w-[220px] flex-shrink-0 sticky top-6">
          {activeFacetCount > 0 && (
            <div className="flex justify-end mb-4">
              <button onClick={clearAll} className="text-[11px] text-primary font-medium hover:underline">
                Limpar ({activeFacetCount})
              </button>
            </div>
          )}
          <div>{sidebarContent}</div>
        </aside>

        {/* ── Mobile Filters (Bottom Sheet) ── */}
        <Drawer open={mobileSidebarOpen} onOpenChange={setMobileSidebarOpen}>
          <DrawerContent className="h-[85dvh] flex flex-col focus:outline-none z-[100]">
            {/* Header Area */}
            <div className="flex-shrink-0 px-5 pt-2 pb-4">
              <div className="w-10 h-1 rounded-full bg-black/10 mx-auto mb-4" />
              <div className="flex items-center justify-between">
                <DrawerTitle className="text-[22px] font-extrabold text-[#1d1d1f] tracking-tight">
                  Filtros
                </DrawerTitle>
                <div className="flex items-center gap-3">
                  {activeFacetCount > 0 && (
                    <button
                      onClick={clearAll}
                      className="text-[14px] text-primary font-bold active:opacity-60 transition-opacity"
                    >
                      Limpar ({activeFacetCount})
                    </button>
                  )}
                  <DrawerClose className="w-8 h-8 flex items-center justify-center text-[#86868b] bg-black/[0.05] rounded-full active:scale-90 transition-transform">
                    <X className="w-4 h-4" strokeWidth={2.5} />
                  </DrawerClose>
                </div>
              </div>
            </div>

            {/* Scrollable Content Area */}
            <div className="flex-1 overflow-y-auto overscroll-contain px-5 pb-10 space-y-6 custom-scrollbar touch-pan-y">
              {sidebarContent}
            </div>

            {/* Footer / Apply Button */}
            <div className="flex-shrink-0 p-5 border-t border-black/[0.06] bg-white/80 backdrop-blur-xl pb-[max(20px,env(safe-area-inset-bottom))]">
              <button
                onClick={() => setMobileSidebarOpen(false)}
                className="w-full h-[54px] bg-[#1d1d1f] active:scale-[0.97] text-white text-[17px] font-bold rounded-2xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-black/10"
              >
                {results ? (
                  <>
                    Ver {(results.totalHits ?? 0).toLocaleString('pt-BR')} resultados
                    <ArrowRight className="w-5 h-5 ml-1 opacity-50" />
                  </>
                ) : 'Aplicar filtros'}
              </button>
            </div>
          </DrawerContent>
        </Drawer>

        {/* ── Content Area ── */}
        <div className="flex-1 min-w-0">

          {/* ── Header: Title + Result count ── */}
          <div className="flex items-baseline justify-between mb-4 sm:mb-5">
            <h1 className="text-lg sm:text-xl font-semibold text-foreground tracking-tight truncate">
              {contextTitle}
            </h1>
            {results && !isFirstLoad && (
              <span className="text-xs text-muted-foreground tabular-nums flex-shrink-0 ml-3 font-medium">
                {(results.totalHits ?? 0).toLocaleString('pt-BR')} {(results.totalHits ?? 0) === 1 ? 'resultado' : 'resultados'}
              </span>
            )}
          </div>

          {/* ── Toolbar: unified search bar row ── */}
          <div className="flex items-center gap-2 sm:gap-2.5 mb-4">
            {/* Mobile filter toggle */}
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => setMobileSidebarOpen(true)} 
              className="lg:hidden gap-1.5 flex-shrink-0 h-10 rounded-xl border-black/[0.08] bg-white active:scale-95 transition-transform"
            >
              <SlidersHorizontal className="w-4 h-4 text-[#1d1d1f]" />
              <span className="hidden sm:inline text-sm font-bold text-[#1d1d1f]">Filtros</span>
              {activeFacetCount > 0 && (
                <Badge className="h-5 min-w-5 px-1.5 text-[10px] font-bold rounded-full bg-primary text-white border-0">{activeFacetCount}</Badge>
              )}
            </Button>

            {/* Search input with integrated AI toggle */}
            <div className={`relative flex items-center flex-1 h-10 rounded-xl transition-all duration-500 z-10 overflow-hidden ${
              aiMode
                ? 'ai-search-active bg-white shadow-lg shadow-purple-500/20 ring-2 ring-purple-500/30'
                : 'bg-[#f5f5f7] border border-black/[0.03] focus-within:bg-white focus-within:ring-2 focus-within:ring-primary/20 focus-within:shadow-lg focus-within:shadow-black/5'
            }`}>
              {/* Icon */}
              <div className="relative flex-shrink-0 w-4 h-4 ml-3">
                <Search className={`absolute inset-0 w-4 h-4 text-[#86868b] transition-all duration-500 ${
                  aiMode ? 'opacity-0 scale-75 rotate-[-90deg]' : 'opacity-100 scale-100 rotate-0'
                }`} strokeWidth={2.5} />
                <Sparkles className={`absolute inset-0 w-4 h-4 text-purple-500 transition-all duration-500 ${
                  aiMode ? 'opacity-100 scale-100 rotate-0' : 'opacity-0 scale-75 rotate-90'
                }`} strokeWidth={2.5} />
              </div>

              {/* Input */}
              <input
                type="search"
                enterKeyHint="search"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder={aiMode ? 'Descreva o que procura...' : 'Buscar peças...'}
                className="flex-1 h-full bg-transparent text-[15px] sm:text-sm text-[#1d1d1f] placeholder:text-[#86868b]/50 outline-none px-2.5 min-w-0 font-medium"
              />

              {/* Loading indicator */}
              {isSearching && (
                <Loader2 className="w-3.5 h-3.5 text-muted-foreground/50 animate-spin mr-1 flex-shrink-0" />
              )}

              {/* AI toggle pill */}
              <button
                type="button"
                onClick={() => setAiMode(!aiMode)}
                className={`flex items-center gap-1.5 rounded-full px-2.5 h-[28px] text-[10px] font-bold transition-all duration-500 mr-1.5 flex-shrink-0 cursor-pointer ${
                  aiMode
                    ? 'bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 text-white shadow-[0_2px_8px_-2px_rgba(139,92,246,0.5)]'
                    : 'bg-[#f5f5f7] text-[#86868b] hover:bg-[#e8e8ed] hover:text-[#6e6e73]'
                }`}
                title={aiMode ? 'Desativar busca IA' : 'Ativar busca com IA'}
              >
                <Sparkles className={`w-3 h-3 transition-transform duration-500 ${aiMode ? 'animate-pulse' : ''}`} strokeWidth={2.5} />
                <span className="tracking-wide">IA</span>
              </button>
            </div>

            {/* Sort dropdown */}
            <Select
              value={sortBy || '_relevance'}
              onValueChange={v => setSortBy(v === '_relevance' ? '' : v)}
            >
              <SelectTrigger size="sm" className="hidden sm:flex w-auto min-w-[120px] max-w-[160px] h-10 rounded-lg text-xs border-border/60">
                <SelectValue placeholder="Relevância" />
              </SelectTrigger>
              <SelectContent align="end">
                <SelectItem value="_relevance">Relevância</SelectItem>
                <SelectItem value="price:asc">Menor preço</SelectItem>
                <SelectItem value="price:desc">Maior preço</SelectItem>
                <SelectItem value="name:asc">A-Z</SelectItem>
                <SelectItem value="name:desc">Z-A</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {isSearching && !isFirstLoad && (
            <div className="mb-4 rounded-full bg-muted/60 overflow-hidden">
              <div className="h-1.5 w-full bg-[linear-gradient(90deg,transparent,rgba(235,10,30,0.35),transparent)] bg-[length:200%_100%] animate-[shimmer_1.6s_linear_infinite]" />
            </div>
          )}

          {/* ── Active Filters Chips ── */}
          {activeFacetCount > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 mb-5">
              {Object.entries(selectedFacets)
                .filter(([key]) => !(key === 'category_names' && (selectedFacets.category_ids || []).length > 0))
                .map(([key, values]) =>
                values.map(val => {
                  let display = val;
                  if (key === 'in_stock') display = val === 'true' ? 'Em estoque' : 'Sem estoque';
                  if (key === 'modelo_slugs') {
                    const m = CAR_MODELS.find(cm => cm.slug === val);
                    if (m) display = m.name;
                  }
                  if (key === 'modelos') {
                    const m = CAR_MODELS.find(cm => cm.modeloIds.includes(val));
                    if (m) display = m.name;
                  }
                  if (key === 'price') {
                    const r = PRICE_RANGES.find(pr => pr.key === val);
                    if (r) display = r.label;
                  }
                  if (key === 'category_ids') {
                    display = categoryLabelMap.get(val) || val;
                  }
                  if (key === 'anos') {
                    display = resolveAno(val);
                  }
                  if (key === 'color') {
                    display = resolveColor(val);
                  }
                  return (
                    <button
                      key={`${key}:${val}`}
                      onClick={() => toggleFacet(key, val)}
                      className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground bg-muted/60 hover:bg-muted px-2 py-1 rounded-md transition-colors"
                    >
                      {display}
                      <X className="w-3 h-3" />
                    </button>
                  );
                })
              )}
              <button onClick={clearAll} className="text-[11px] text-primary font-medium hover:underline ml-1">
                Limpar tudo
              </button>
            </div>
          )}

          {/* ── Loading State ── */}

          {isFirstLoad && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 animate-in fade-in duration-300">
              {[...Array(8)].map((_, i) => <ProductCardSkeleton key={i} />)}
            </div>
          )}

          {/* ── Empty State ── */}
          {!isFirstLoad && hits.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 animate-in fade-in duration-300">
              <Package className="w-10 h-10 text-muted-foreground/20 mb-4" />
              <p className="text-sm font-medium text-foreground mb-1">
                {isSkuSimilar ? 'Nenhum SKU exato encontrado' : 'Nenhum resultado'}
              </p>
              <p className="text-xs text-muted-foreground mb-4">
                {isSkuSimilar && exactSkuQuery
                  ? `Nao encontramos o SKU exato ${exactSkuQuery} nem produtos similares com essa busca.`
                  : 'Tente ajustar os filtros ou termos de busca'}
              </p>
              <Button variant="outline" size="sm" onClick={clearAll}>Limpar filtros</Button>
              {/* Zero-result fallback: trending suggestions from real analytics */}
              <div className="mt-8 w-full max-w-lg">
                <TrendingSearches
                  onSelect={(term) => {
                    setQuery(term);
                    setCurrentPage(1);
                    performSearch(term, 1, aiMode, sortBy, {});
                  }}
                  isZeroResultFallback
                  variant="chips"
                  limit={6}
                />
              </div>
            </div>
          )}

          {/* ── Product Grid ── */}
          {!isFirstLoad && hits.length > 0 && (
            <div className={`grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4 lg:gap-5 transition-opacity duration-200 ${isSearching ? 'opacity-65' : 'opacity-100'} animate-in fade-in duration-300`}>
              {hits.map((hit, idx) => (
                <ProductCard key={hit.id} hit={hit} onClick={() => goToProduct(hit, idx)} />
              ))}
            </div>
          )}

          {/* ── Pagination ── */}
          {paginationUI}
        </div>
      </div>

      {/* ── Custom scrollbar styles ── */}
      <style>{`
        @keyframes shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #d1d5db; border-radius: 2px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #9ca3af; }
      `}</style>
    </div>
  );
}


