import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate, Link } from 'react-router';
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
import { CategoryTreeFilter, getCategoryNameById } from '../components/CategoryTreeFilter';
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
import { TrendingSearches } from '../components/TrendingSearches';

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
  engine: 'meilisearch' | 'kv_fallback';
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
  _debug?: any;
}

// Maps our internal facet keys -> backend query param names
const FACET_TO_PARAM: Record<string, string> = {
  category_ids: 'categories',
  category_names: 'category_names',
  modelos: 'modelos',
  anos: 'anos',
  color: 'color',
  in_stock: 'inStock',
};

// ─── Price range key → {min, max} decoder ──
function decodePriceRange(key: string): { min: number; max: number } | null {
  const range = PRICE_RANGES.find(r => r.key === key);
  return range ? { min: range.min, max: range.max } : null;
}

// ─── Car Model Definitions (shared with MegaMenu) ───────────────────────────
interface CarModelDef {
  id: string;
  modeloIds: string[];
  name: string;
  imgSrc: string;
  storageKey: string;
}

const CAR_MODELS: CarModelDef[] = [
  { id: 'hilux', modeloIds: ['Hilux', '35'], name: 'Hilux', storageKey: 'HILUX', imgSrc: 'https://toyoparts.com.br/pub/media/catalog/icons/models/HILUX.png?v=1' },
  { id: 'corolla', modeloIds: ['Corolla', '38'], name: 'Corolla', storageKey: 'COROLLA', imgSrc: 'https://toyoparts.com.br/pub/media/catalog/icons/models/COROLLA.png?v=1' },
  { id: 'corolla-cross', modeloIds: ['Corolla Cross', '206'], name: 'Corolla Cross', storageKey: 'COROLLA CROSS', imgSrc: 'https://toyoparts.com.br/pub/media/catalog/icons/models/COROLLA%20CROSS.png?v=1' },
  { id: 'yaris', modeloIds: ['Yaris', '205'], name: 'Yaris', storageKey: 'YARIS', imgSrc: 'https://toyoparts.com.br/pub/media/catalog/icons/models/YARIS.png?v=1' },
  { id: 'sw4', modeloIds: ['SW4', '204'], name: 'SW4', storageKey: 'SW4', imgSrc: 'https://toyoparts.com.br/pub/media/catalog/icons/models/SW4.png?v=1' },
  { id: 'etios', modeloIds: ['Etios', '37', '207'], name: 'Etios', storageKey: 'ETIOS', imgSrc: 'https://toyoparts.com.br/pub/media/catalog/icons/models/ETIOS.png?v=1' },
  { id: 'rav4', modeloIds: ['RAV4', 'Rav4', '36'], name: 'RAV4', storageKey: 'RAV4', imgSrc: 'https://toyoparts.com.br/pub/media/catalog/icons/models/RAV4.png?v=1' },
  { id: 'prius', modeloIds: ['Prius', '40'], name: 'Prius', storageKey: 'PRIUS', imgSrc: 'https://toyoparts.com.br/pub/media/catalog/icons/models/PRIUS.png?v=1' },
];

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
      className="object-contain"
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
  onClearInitialQuery?: () => void;
  initialCategory?: string | null;
  initialCategoryName?: string | null;
  initialModelo?: string | null;
  onClearInitialFilters?: () => void;
}

export function SearchPage({
  initialQuery,
  onClearInitialQuery,
  initialCategory,
  initialCategoryName,
  initialModelo,
  onClearInitialFilters,
}: SearchPageProps = {}) {
  const navigate = useNavigate();
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
  const [attributeMeta, setAttributeMeta] = useState<any>(null);

  const abortRef = useRef<AbortController | null>(null);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Guard: prevents debounced search from racing with the initial params search on mount
  const initialSearchDoneRef = useRef(false);
  // Ref to always hold the latest selectedFacets so the debounced search uses current values
  const selectedFacetsRef = useRef<Record<string, string[]>>({});
  selectedFacetsRef.current = selectedFacets;

  const pageSize = 24;

  // ─── Bidirectional lookup helpers for attribute display ──────────────────────
  // Meta stores { optionId: label }, but MeiliSearch facets may contain labels
  // (if transformProduct already resolved them) OR raw IDs (if mapping failed).
  // These helpers resolve EITHER direction: id→label or label→label (passthrough).
  const resolveAno = useCallback((val: string): string => {
    if (!attributeMeta?.anos) return val;
    // Direct lookup: val is an optionId → return label
    if (attributeMeta.anos[val]) return attributeMeta.anos[val];
    // Reverse check: val might already be a label → return as-is
    const allLabels = Object.values(attributeMeta.anos) as string[];
    if (allLabels.includes(val)) return val;
    return val; // raw fallback
  }, [attributeMeta]);

  const resolveColor = useCallback((val: string): string => {
    if (!attributeMeta?.colors) return val;
    // Direct lookup: val is an optionId → return label
    if (attributeMeta.colors[val]) return attributeMeta.colors[val];
    // Reverse check: val might already be a label → return as-is
    const allLabels = Object.values(attributeMeta.colors) as string[];
    if (allLabels.includes(val)) return val;
    return val; // raw fallback
  }, [attributeMeta]);

  // Fetch metadata for labels
  useEffect(() => {
    const fetchMeta = async (attempt = 1) => {
      try {
        const res = await fetch(`${API}/search/meta`, { headers: HEADERS });
        if (!res.ok) {
          console.warn(`[SEARCH] Meta fetch HTTP ${res.status} (attempt ${attempt})`);
          if (attempt < 3) setTimeout(() => fetchMeta(attempt + 1), 1000 * attempt);
          return;
        }
        const data = await res.json();
        if (data && Object.keys(data).length > 0) {
          console.log('[SEARCH] Meta loaded:', {
            anos: Object.keys(data.anos || {}).length,
            colors: Object.keys(data.colors || {}).length,
            modelos: Object.keys(data.modelos || {}).length,
            categories: Object.keys(data.categories || {}).length,
            sampleAnos: Object.entries(data.anos || {}).slice(0, 3),
            sampleColors: Object.entries(data.colors || {}).slice(0, 3),
          });
          setAttributeMeta(data);
        } else {
          console.warn('[SEARCH] Meta endpoint returned empty. Has sync been run?');
          if (attempt < 3) setTimeout(() => fetchMeta(attempt + 1), 2000 * attempt);
        }
      } catch (e) {
        console.warn(`[SEARCH] Meta fetch failed (attempt ${attempt}):`, e);
        if (attempt < 3) setTimeout(() => fetchMeta(attempt + 1), 1000 * attempt);
      }
    };
    fetchMeta();
  }, []);

  useEffect(() => {
    return () => {
      if (abortRef.current) abortRef.current.abort();
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, []);

  // Apply initial filters from MegaMenu
  useEffect(() => {
    let hasChanges = false;
    const nextFacets: Record<string, string[]> = { ...selectedFacets };
    if (initialQuery) { setQuery(initialQuery); onClearInitialQuery?.(); hasChanges = true; }
    
    // Initialize category_names if provided
    if (initialCategoryName) {
      nextFacets.category_names = [initialCategoryName];
      hasChanges = true;
    }
    
    // Initialize category_ids if provided (do NOT delete it even if name is present)
    // This ensures UI fallback works if facetKey switches to IDs
    if (initialCategory) {
      nextFacets.category_ids = [initialCategory];
      hasChanges = true;
    }

    if (initialModelo) { nextFacets.modelos = [initialModelo]; hasChanges = true; }
    if (hasChanges) {
      setSelectedFacets(nextFacets);
      setCurrentPage(1);
      performSearch(initialQuery || query, 1, aiMode, sortBy, nextFacets);
      onClearInitialFilters?.();
    } else {
      // No initial params (e.g. bare /pecas or /busca) — browse all products
      performSearch('', 1, false, sortBy, {});
    }
    // Mark initial search as done so debounced effect doesn't race
    initialSearchDoneRef.current = true;
  }, [initialQuery, initialCategory, initialCategoryName, initialModelo]); // eslint-disable-line react-hooks/exhaustive-deps

  // Search function (with retry for cold-start resilience)
  const performSearch = useCallback(
    async (q: string, page: number, ai: boolean, sort: string, facets: Record<string, string[]>) => {
      if (abortRef.current) abortRef.current.abort();
      const ac = new AbortController();
      abortRef.current = ac;
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

  const toggleFacet = (facetKey: string, value: string, id?: string) => {
    setSelectedFacets(prev => {
      const cur = prev[facetKey] || [];
      const isSelected = cur.includes(value);
      const updated = isSelected ? cur.filter(v => v !== value) : [...cur, value];
      const next = { ...prev, [facetKey]: updated };

      // ── Sync category_names ↔ category_ids bidirectionally ─���
      if (facetKey === 'category_names') {
        if (isSelected) {
          // Unchecking a name → also remove its ID from backup
          if (next.category_ids) {
            // Try using provided id, otherwise find by name from tree
            const idToRemove = id || value; // fallback: value might be the name
            next.category_ids = next.category_ids.filter(vid => vid !== idToRemove);
            if (next.category_ids.length === 0) delete next.category_ids;
          }
        } else if (id) {
          // Checking a name → add its ID to backup for robustness
          const currentIds = next.category_ids || [];
          if (!currentIds.includes(id)) {
            next.category_ids = [...currentIds, id];
          }
        }
      }

      if (facetKey === 'category_ids') {
        if (isSelected) {
          // Unchecking an ID → also remove matching name from backup
          if (next.category_names) {
            const catName = getCategoryNameById(value);
            if (catName) {
              next.category_names = next.category_names.filter(n => n !== catName);
              if (next.category_names.length === 0) delete next.category_names;
            }
          }
        } else if (id) {
          // Checking an ID → add name to backup
          const catName = getCategoryNameById(value);
          if (catName) {
            const currentNames = next.category_names || [];
            if (!currentNames.includes(catName)) {
              next.category_names = [...currentNames, catName];
            }
          }
        }
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

  const selectSingleFacet = (facetKey: string, value: string) => {
    setSelectedFacets(prev => {
      const cur = prev[facetKey] || [];
      const isSelected = cur.includes(value);
      const next = { ...prev, [facetKey]: isSelected ? [] : [value] };
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
  const ai = results?.aiExpansion;

  // ─── Category facet key: prefer category_names (legible), fallback to category_ids ──
  // CORRIGIDO: `{}` é truthy em JS, então `facets.category_names || facets.category_ids`
  // curto-circuita incorretamente quando category_names existe mas é vazio.
  // Agora checa Object.keys().length para determinar qual tem dados de verdade.
  const categoryFacetKey = useMemo<'category_names' | 'category_ids'>(() => {
    const namesCount = Object.keys(facets.category_names || {}).length;
    const idsCount = Object.keys(facets.category_ids || {}).length;
    if (namesCount > 0) return 'category_names';
    if (idsCount > 0) return 'category_ids';
    return 'category_ids'; // default fallback
  }, [facets]);

  // ─── Determine "backup" category key to exclude from counts/chips ──
  // When both category_names AND category_ids are in selectedFacets,
  // the backup key is the one NOT used as the primary facet key.
  // This prevents double-counting and duplicate chips.
  const backupCategoryKey = categoryFacetKey === 'category_names' ? 'category_ids' : 'category_names';

  const activeFacetCount = useMemo(() => {
    return Object.entries(selectedFacets).reduce((s, [key, a]) => {
      if (key === backupCategoryKey) return s; // skip backup to avoid double-count
      return s + a.length;
    }, 0);
  }, [selectedFacets, backupCategoryKey]);

  const categoryFacetCounts = useMemo(() => {
    return facets[categoryFacetKey] || {};
  }, [facets, categoryFacetKey]);

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
    const selectedModelos = selectedFacets.modelos || [];
    if (selectedModelos.length > 0) {
      const modelNames = selectedModelos.map(id => {
        const model = CAR_MODELS.find(m => m.modeloIds.includes(id));
        return model?.name || id;
      });
      parts.push(...modelNames);
    }
    const selectedCats = selectedFacets[categoryFacetKey] || [];
    if (selectedCats.length > 0) {
      const catNames = selectedCats.slice(0, 2).map(val => {
        if (categoryFacetKey === 'category_ids') {
          return getCategoryNameById(val) || val;
        }
        return val;
      });
      parts.push(...catNames);
    }
    if (query) parts.push(`"${query}"`);
    return parts.join(' > ') || 'Todos os Produtos';
  }, [selectedFacets, query, categoryFacetKey]);

  // ─── Sidebar Content ──────────────────────────────────────────────────────

  const sidebarContent = (
    <div className="space-y-0">
      {/* ── Departamento (Categories — Tree View) ── */}
      {(Object.keys(categoryFacetCounts).length > 0 || (selectedFacets[categoryFacetKey] || []).length > 0) && (
      <FilterSection
        title="Departamentos"
        defaultOpen={true}
        count={(selectedFacets[categoryFacetKey] || []).length}
      >
        <div className="max-h-[60vh] overflow-y-auto pr-1 custom-scrollbar">
          <CategoryTreeFilter
            facetCounts={categoryFacetCounts}
            facetKey={categoryFacetKey}
            selectedValues={selectedFacets[categoryFacetKey] || []}
            selectedIds={selectedFacets.category_ids || []}
            onToggle={(val, id) => toggleFacet(categoryFacetKey, val, id)}
            isLoading={isFirstLoad}
          />
        </div>
      </FilterSection>
      )}

      {/* ── Modelo de veículo ── */}
      <FilterSection
        title="Modelo de Veículo"
        defaultOpen={true}
        count={(selectedFacets.modelos || []).length}
      >
        <div className="grid grid-cols-2 gap-2 max-h-[380px] overflow-y-auto pr-1 custom-scrollbar">
          {CAR_MODELS.map(model => {
            const isSelected = model.modeloIds.some(mid => (selectedFacets.modelos || []).includes(mid));
            const modelCount = facets.modelos
              ? model.modeloIds.reduce((sum, mid) => sum + (facets.modelos?.[mid] || 0), 0)
              : null;
            return (
              <button
                key={model.id}
                onClick={() => selectSingleFacet('modelos', model.modeloIds[0])}
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
      {facets.anos && Object.keys(facets.anos).length > 0 && (
        <FilterSection
          title="Ano do Veículo"
          defaultOpen={true}
          count={(selectedFacets.anos || []).length}
        >
          <div className="space-y-0.5 pr-1 max-h-[380px] overflow-y-auto custom-scrollbar">
            {Object.entries(facets.anos)
              .sort((a, b) => b[0].localeCompare(a[0]))
              .map(([val, count]) => {
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
        .filter(([key]) => !['category_names', 'category_ids', 'modelos', 'anos', 'in_stock', 'color', 'status', 'type_id', 'price'].includes(key))
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

  // Helper to slugify
  const slugify = (text: string) =>
    text.toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');

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
        title={query ? `Busca: ${query} | Toyoparts` : 'Busca de Peças | Toyoparts'} 
        robots="noindex,follow" 
        description="Encontre peças genuínas Toyota para seu veículo."
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
                        const facetKey = key === 'categories' ? categoryFacetKey : key;
                        nextFacets[facetKey] = conflict.ai;
                        setSelectedFacets(nextFacets);
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
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Filtros</span>
            {activeFacetCount > 0 && (
              <button onClick={clearAll} className="text-[11px] text-primary font-medium hover:underline">
                Limpar ({activeFacetCount})
              </button>
            )}
          </div>
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

          {/* ── Active Filters Chips ── */}
          {activeFacetCount > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 mb-5">
              {Object.entries(selectedFacets)
                .filter(([key]) => key !== backupCategoryKey) // skip backup category to prevent duplicate chips
                .map(([key, values]) =>
                values.map(val => {
                  let display = val;
                  if (key === 'in_stock') display = val === 'true' ? 'Em estoque' : 'Sem estoque';
                  if (key === 'modelos') {
                    const m = CAR_MODELS.find(cm => cm.modeloIds.includes(val));
                    if (m) display = m.name;
                  }
                  if (key === 'price') {
                    const r = PRICE_RANGES.find(pr => pr.key === val);
                    if (r) display = r.label;
                  }
                  if (key === 'category_ids') {
                    const catName = getCategoryNameById(val);
                    if (catName) display = catName;
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
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {[...Array(8)].map((_, i) => <ProductCardSkeleton key={i} />)}
            </div>
          )}

          {/* ── Empty State ── */}
          {!isFirstLoad && hits.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20">
              <Package className="w-10 h-10 text-muted-foreground/20 mb-4" />
              <p className="text-sm font-medium text-foreground mb-1">Nenhum resultado</p>
              <p className="text-xs text-muted-foreground mb-4">Tente ajustar os filtros ou termos de busca</p>
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
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4 lg:gap-5">
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
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #d1d5db; border-radius: 2px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #9ca3af; }
      `}</style>
    </div>
  );
}