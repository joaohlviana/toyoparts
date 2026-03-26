import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Search, User, ShoppingCart, X, Settings, Truck, Phone, ArrowRight, Clock, TrendingUp, LogIn, Sparkles, Grid3X3, Menu, ChevronRight, ChevronLeft, MessageCircle } from 'lucide-react';
import { projectId, publicAnonKey } from '../../../utils/supabase/info';
import { useNavigate, Link } from 'react-router';
import { ToyopartsLogo } from './ToyopartsLogo';
import { useCart } from '../lib/cart/cart-store';
import { Skeleton } from './ui/skeleton';

const API = `https://${projectId}.supabase.co/functions/v1/make-server-1d6e33e0`;
const HEADERS: HeadersInit = {
  Authorization: `Bearer ${publicAnonKey}`,
  apikey: publicAnonKey,
  'Content-Type': 'application/json',
};

// ─── Types ───────────────────────────────────────────────────────────────────
interface CategoryNode {
  id: number;
  parent_id: number;
  name: string;
  level: number;
  is_active: boolean;
  product_count: number;
  children_data?: CategoryNode[];
  children?: CategoryNode[];
}

// ─── Car Model Definitions (for mobile menu) ────────────────────────────────
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

function CarModelIcon({ model, size = 80, overrideUrl }: { model: CarModelDef; size?: number; overrideUrl?: string }) {
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

// ─── Props ───────────────────────────────────────────────────────────────────

interface MegaMenuProps {
  currentPage: 'sync' | 'products' | 'search' | 'admin' | 'home';
  onNavigate: (page: 'sync' | 'products' | 'search' | 'admin' | 'home' | 'departments' | 'cart') => void;
  onCategorySelect?: (categoryId: string, categoryName: string) => void;
  onModeloSelect?: (modeloId: string, modeloName: string) => void;
  onSearchSubmit?: (query: string, aiMode?: boolean) => void;
  onProductSelect?: (sku: string, name: string) => void;
  onCartClick?: () => void;
  mobileDeptOpen?: boolean;
  onMobileDeptToggle?: (open: boolean) => void;
  mobileSearchOpen?: boolean;
  onMobileSearchToggle?: (open: boolean) => void;
}

export function MegaMenu({
  currentPage,
  onNavigate,
  onCategorySelect,
  onModeloSelect,
  onSearchSubmit,
  onProductSelect,
  onCartClick,
  mobileDeptOpen: mobileDeptOpenProp,
  onMobileDeptToggle,
  mobileSearchOpen: mobileSearchOpenProp,
  onMobileSearchToggle,
}: MegaMenuProps) {
  const navigate = useNavigate();
  const { totals } = useCart();
  // ─── State ─────────────────────────────────────────────────────────────────
  const [categoryTree, setCategoryTree] = useState<CategoryNode | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [categoryImages, setCategoryImages] = useState<Record<string, string>>({});
  const [modelImageUrls, setModelImageUrls] = useState<Record<string, string>>({});

  const [searchValue, setSearchValue] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  
  // Mobile search state (Internal syncs with prop if provided)
  const [mobileSearchOpenInternal, setMobileSearchOpenInternal] = useState(false);
  const mobileSearchOpen = mobileSearchOpenProp !== undefined ? mobileSearchOpenProp : mobileSearchOpenInternal;
  const setMobileSearchOpen = (val: boolean) => {
    if (onMobileSearchToggle) onMobileSearchToggle(val);
    else setMobileSearchOpenInternal(val);
  };

  const [mobileAccountOpen, setMobileAccountOpen] = useState(false);

  // Mobile department menu (Internal state syncs with prop if provided)
  const [mobileDeptOpenInternal, setMobileDeptOpenInternal] = useState(false);
  const mobileDeptOpen = mobileDeptOpenProp !== undefined ? mobileDeptOpenProp : mobileDeptOpenInternal;
  
  const setMobileDeptOpen = (val: boolean) => {
    if (onMobileDeptToggle) onMobileDeptToggle(val);
    else setMobileDeptOpenInternal(val);
  };
  const [mobileDeptStack, setMobileDeptStack] = useState<CategoryNode[]>([]);
  const [mobileDeptAnimDir, setMobileDeptAnimDir] = useState<'forward' | 'back'>('forward');

  // Autocomplete
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [categorySuggestions, setCategorySuggestions] = useState<{ name: string; count: number }[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [aiMode, setAiMode] = useState(false);
  const suggestionsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const mobileSearchInputRef = useRef<HTMLInputElement>(null);

  // ─── Effects ───────────────────────────────────────────────────────────────
  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 0);
    window.addEventListener('scroll', handleScroll);
    // Load recent searches from localStorage
    try {
      const saved = localStorage.getItem('toyoparts_recent_searches');
      if (saved) setRecentSearches(JSON.parse(saved).slice(0, 5));
    } catch {}
    // Fetch category tree for autocomplete
    fetchCategoryTree();
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Close on Escape
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSearchOpen(false);
        setMobileSearchOpen(false);
        setMobileDeptOpen(false);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  // Lock body scroll when mobile search is open
  useEffect(() => {
    if (mobileSearchOpen) {
      document.body.style.overflow = 'hidden';
      setTimeout(() => mobileSearchInputRef.current?.focus(), 100);
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [mobileSearchOpen]);

  // Lock body scroll when mobile dept menu is open
  useEffect(() => {
    if (mobileDeptOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
      // Reset stack when closing
      setMobileDeptStack([]);
    }
    return () => { document.body.style.overflow = ''; };
  }, [mobileDeptOpen]);

  // ─── Data Fetching ────────────────────────────────────────────────────────
  const fetchCategoryTree = async () => {
    try {
      const [treeRes, imgRes] = await Promise.all([
        fetch(`${API}/categories/tree`, { headers: HEADERS }).catch(e => {
          console.warn('MegaMenu: categories tree endpoint unavailable (servidor pode estar offline)');
          return { ok: false };
        }),
        fetch(`${API}/categories/images`, { headers: HEADERS }).catch(e => {
          console.warn('MegaMenu: categories images endpoint unavailable');
          return { ok: false };
        }),
      ]);
      
      if (treeRes.ok) {
        const treeData = await treeRes.json();
        setCategoryTree(treeData);
      } else {
        // Fallback to empty tree - menu will work but categories won't be visible
        setCategoryTree({ id: 1, name: 'Root', children_data: [] });
      }
      
      if (imgRes.ok) {
        const data = await imgRes.json();
        if (data.images) setCategoryImages(data.images);
      } else {
        // Fallback to empty images
        setCategoryImages({});
      }
    } catch (e) {
      // Silently handle - this is expected if backend is not running
      console.info('MegaMenu: Rodando sem backend (categorias não disponíveis)');
      setCategoryTree({ id: 1, name: 'Root', children_data: [] });
      setCategoryImages({});
    } finally {
      setIsLoading(false);
    }
  };

  // ─── Helpers ───────────────────────────────────────────────────────────────
  const slugify = (text: string): string =>
    text.toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');

  const getCategoryImage = (childName: string, parentName?: string): string | null => {
    if (!categoryImages || Object.keys(categoryImages).length === 0) return null;
    const childSlug = slugify(childName);
    
    // 1. Exact composite key
    if (parentName) {
      const parentSlug = slugify(parentName);
      const compositeKey = `${parentSlug}:${childSlug}`;
      if (categoryImages[compositeKey]) return categoryImages[compositeKey];
      const hyphenatedKey = `${parentSlug}-${childSlug}`;
      if (categoryImages[hyphenatedKey]) return categoryImages[hyphenatedKey];
    }

    // 2. Child slug only
    if (categoryImages[childSlug]) return categoryImages[childSlug];

    // 3. Fuzzy search
    for (const key of Object.keys(categoryImages)) {
      if (key.includes(childSlug) || childSlug.includes(key)) return categoryImages[key];
    }
    return null;
  };
  const getTopCategories = useCallback((tree: CategoryNode | null): CategoryNode[] => {
    if (!tree) return [];
    const walk = (node: CategoryNode): CategoryNode[] => {
      const children = (node.children_data || node.children || []).filter(c => c.is_active);
      if (children.length === 0) return [];
      if (children.length === 1) return walk(children[0]);
      return children;
    };
    return walk(tree);
  }, []);

  const topCategories = getTopCategories(categoryTree);

  // Filter categories that match search query
  const filterCategories = useCallback((query: string): { name: string; id: number }[] => {
    if (!query.trim() || !categoryTree) return [];
    const q = query.toLowerCase();
    const matches: { name: string; id: number }[] = [];
    const walk = (node: CategoryNode) => {
      if (node.is_active && node.name.toLowerCase().includes(q) && node.level >= 2) {
        matches.push({ name: node.name, id: node.id });
      }
      (node.children_data || node.children || []).forEach(walk);
    };
    walk(categoryTree);
    return matches.slice(0, 4);
  }, [categoryTree]);

  // ─── Autocomplete ─────────────────────────────────��───────────────────────
  const fetchSuggestions = useCallback(async (query: string, useAi = false) => {
    if (!query.trim() || query.trim().length < 2) {
      setSuggestions([]);
      setCategorySuggestions([]);
      return;
    }
    setSuggestionsLoading(true);
    try {
      const params = new URLSearchParams({
        q: query.trim(),
        limit: '6',
        offset: '0',
        ...(useAi ? { mode: 'ai' } : {}),
      });
      const res = await fetch(`${API}/search?${params.toString()}`, { headers: HEADERS });
      if (res.ok) {
        const data = await res.json();
        const hits = data.hits || [];
        setSuggestions(hits);

        // Extract unique categories from product hits
        const catMap = new Map<string, number>();
        hits.forEach((h: any) => {
          const cats: string[] = h.category_names || h.categories || [];
          if (Array.isArray(cats)) {
            cats.forEach(c => {
              if (c && typeof c === 'string') catMap.set(c, (catMap.get(c) || 0) + 1);
            });
          }
        });
        const cats = Array.from(catMap.entries())
          .map(([name, count]) => ({ name, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 4);
        setCategorySuggestions(cats);
      } else {
        console.warn('Autocomplete fetch failed:', res.status);
        setSuggestions([]);
        setCategorySuggestions([]);
      }
    } catch (e) {
      console.error('Autocomplete error:', e);
      setSuggestions([]);
      setCategorySuggestions([]);
    } finally {
      setSuggestionsLoading(false);
    }
  }, []);

  const handleSearchInputChange = (value: string) => {
    setSearchValue(value);
    if (suggestionsTimerRef.current) clearTimeout(suggestionsTimerRef.current);
    suggestionsTimerRef.current = setTimeout(() => fetchSuggestions(value, aiMode), 250);
  };

  const toggleAiMode = () => {
    const next = !aiMode;
    setAiMode(next);
    if (searchValue.trim().length >= 2) {
      if (suggestionsTimerRef.current) clearTimeout(suggestionsTimerRef.current);
      fetchSuggestions(searchValue, next);
    }
  };

  const saveRecentSearch = (query: string) => {
    const updated = [query, ...recentSearches.filter(s => s !== query)].slice(0, 5);
    setRecentSearches(updated);
    try { localStorage.setItem('toyoparts_recent_searches', JSON.stringify(updated)); } catch {}
  };

  // ─── Handlers ──────────────────────────────────────────────────────────────
  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchValue.trim()) {
      saveRecentSearch(searchValue.trim());
      onSearchSubmit?.(searchValue.trim(), aiMode);
      // onSearchSubmit already navigates with params via RootLayout
      setSearchOpen(false);
      setMobileSearchOpen(false);
      setSuggestions([]);
      setCategorySuggestions([]);
    }
  };

  const handleSuggestionClick = (product: any) => {
    const sku = product.sku || product.id || '';
    const name = product.name || '';
    saveRecentSearch(name);
    // Navigate directly to product page if possible
    if (sku && onProductSelect) {
      onProductSelect(sku, name);
    } else {
      onSearchSubmit?.(name, aiMode);
    }
    setMobileSearchOpen(false);
    setSearchOpen(false);
    setSuggestions([]);
    setCategorySuggestions([]);
    setSearchValue('');
  };

  const handleCategorySuggestionClick = (catName: string) => {
    // Find matching category node
    const match = filterCategories(catName).find(c => c.name === catName);
    if (match) {
      onCategorySelect?.(String(match.id), match.name);
    } else {
      onSearchSubmit?.(catName, aiMode);
    }
    // onCategorySelect / onSearchSubmit already navigate with params via RootLayout
    setMobileSearchOpen(false);
    setSearchOpen(false);
    setSuggestions([]);
    setCategorySuggestions([]);
    setSearchValue('');
  };

  const handleRecentClick = (query: string) => {
    setSearchValue(query);
    onSearchSubmit?.(query, aiMode);
    // onSearchSubmit already navigates with params via RootLayout
    setMobileSearchOpen(false);
    setSearchOpen(false);
    setSuggestions([]);
    setCategorySuggestions([]);
  };

  const formatPrice = (price: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(price);

  // ─── AI Mode Toggle Pill ──────────────────────────────────────────────────
  const AiToggle = ({ size = 'sm' }: { size?: 'sm' | 'md' }) => (
    <button
      type="button"
      onMouseDown={e => e.preventDefault()}
      onClick={toggleAiMode}
      className={`flex items-center gap-1.5 rounded-full px-2.5 transition-all duration-500 flex-shrink-0 cursor-pointer ${
        aiMode
          ? 'bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 text-white shadow-[0_2px_12px_-2px_rgba(139,92,246,0.5)]'
          : 'bg-[#f5f5f7] text-[#86868b] hover:bg-[#e8e8ed] hover:text-[#6e6e73]'
      } ${size === 'md' ? 'h-[36px] px-3.5 text-[12px]' : 'h-[30px] text-[11px]'}`}
      aria-label="Busca IA"
    >
      <Sparkles className={`${size === 'md' ? 'w-4 h-4' : 'w-3.5 h-3.5'} transition-transform duration-500 ${aiMode ? 'animate-pulse' : ''}`} strokeWidth={2} />
      <span className="font-semibold tracking-wide">IA</span>
    </button>
  );

  // ─── Autocomplete Content (shared between desktop dropdown and mobile fullscreen) ──
  const AutocompleteContent = ({ isMobile = false }: { isMobile?: boolean }) => {
    const px = isMobile ? 'px-5' : 'px-4';
    const py = isMobile ? 'py-3.5' : 'py-3';

    return (
      <>
        {/* Recent searches (when input empty) */}
        {!searchValue.trim() && recentSearches.length > 0 && (
          <div className="py-2">
            <div className={`${px} py-1.5 flex items-center gap-1.5`}>
              <Clock className="w-3 h-3 text-[#86868b]" strokeWidth={2} />
              <span className="text-[11px] font-semibold text-[#86868b] uppercase tracking-wider">Buscas recentes</span>
            </div>
            {recentSearches.map((q, i) => (
              <button
                key={i}
                onMouseDown={isMobile ? undefined : () => handleRecentClick(q)}
                onClick={isMobile ? () => handleRecentClick(q) : undefined}
                className={`w-full flex items-center gap-3 ${px} ${py} hover:bg-black/[0.03] active:bg-black/[0.04] text-left transition-colors`}
              >
                <Clock className="w-4 h-4 text-[#86868b]/50 flex-shrink-0" strokeWidth={1.5} />
                <span className={`${isMobile ? 'text-[16px]' : 'text-[13px]'} text-[#1d1d1f]`}>{q}</span>
                <ArrowRight className="w-3.5 h-3.5 text-[#86868b]/40 ml-auto flex-shrink-0" strokeWidth={2} />
              </button>
            ))}
          </div>
        )}

        {/* Empty state */}
        {!searchValue.trim() && recentSearches.length === 0 && isMobile && (
          <div className="px-5 py-10 text-center">
            <Search className="w-10 h-10 text-[#86868b]/20 mx-auto mb-3" strokeWidth={1.2} />
            <p className="text-[16px] text-[#86868b] font-medium">O que voc&ecirc; est&aacute; procurando?</p>
            <p className="text-[14px] text-[#86868b]/70 mt-1">Busque por nome, c&oacute;digo ou modelo</p>
          </div>
        )}

        {/* Loading */}
        {suggestionsLoading && searchValue.trim().length >= 2 && suggestions.length === 0 && (
            <div className={`${isMobile ? 'py-6 px-4' : 'py-4 px-3'} space-y-3 animate-in fade-in duration-200`}>
              {[...Array(isMobile ? 4 : 3)].map((_, index) => (
                <div key={index} className="flex items-center gap-3">
                  <Skeleton className={`${isMobile ? 'w-12 h-12 rounded-xl' : 'w-11 h-11 rounded-lg'} bg-[#f5f5f7]`} />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-3 w-[70%] bg-[#f0f0f2]" />
                    <Skeleton className="h-3 w-[45%] bg-[#f5f5f7]" />
                  </div>
                </div>
              ))}
            </div>
          )}

        {/* Category Suggestions */}
        {searchValue.trim().length >= 2 && categorySuggestions.length > 0 && (
          <div className={`${isMobile ? 'py-2' : 'py-1'} border-b border-black/[0.04]`}>
            <div className={`${px} py-1.5 flex items-center gap-1.5`}>
              <Grid3X3 className="w-3 h-3 text-[#86868b]" strokeWidth={2} />
              <span className="text-[11px] font-semibold text-[#86868b] uppercase tracking-wider">Categorias</span>
            </div>
            {categorySuggestions.map((cat, i) => (
              <button
                key={i}
                onMouseDown={isMobile ? undefined : () => handleCategorySuggestionClick(cat.name)}
                onClick={isMobile ? () => handleCategorySuggestionClick(cat.name) : undefined}
                className={`w-full flex items-center gap-3 ${px} ${isMobile ? 'py-3' : 'py-2.5'} hover:bg-black/[0.03] active:bg-black/[0.04] text-left transition-colors`}
              >
                <div className={`${isMobile ? 'w-9 h-9' : 'w-7 h-7'} rounded-lg bg-[#f5f5f7] flex items-center justify-center flex-shrink-0`}>
                  <Grid3X3 className={`${isMobile ? 'w-4 h-4' : 'w-3 h-3'} text-[#86868b]/60`} strokeWidth={1.5} />
                </div>
                <span className={`${isMobile ? 'text-[15px]' : 'text-[13px]'} text-[#1d1d1f] font-medium`}>{cat.name}</span>
                <span className={`${isMobile ? 'text-[13px]' : 'text-[11px]'} text-[#86868b] ml-auto flex-shrink-0`}>{cat.count} produto{cat.count > 1 ? 's' : ''}</span>
              </button>
            ))}
          </div>
        )}

        {/* Also show filtered tree categories */}
        {searchValue.trim().length >= 2 && categorySuggestions.length === 0 && (
          (() => {
            const treeCats = filterCategories(searchValue);
            if (treeCats.length === 0) return null;
            return (
              <div className={`${isMobile ? 'py-2' : 'py-1'} border-b border-black/[0.04]`}>
                <div className={`${px} py-1.5 flex items-center gap-1.5`}>
                  <Grid3X3 className="w-3 h-3 text-[#86868b]" strokeWidth={2} />
                  <span className="text-[11px] font-semibold text-[#86868b] uppercase tracking-wider">Categorias</span>
                </div>
                {treeCats.map((cat, i) => (
                  <button
                    key={i}
                    onMouseDown={isMobile ? undefined : () => {
                      onCategorySelect?.(String(cat.id), cat.name);
                      // onCategorySelect already navigates with params via RootLayout
                      setSearchOpen(false);
                      setSuggestions([]);
                      setCategorySuggestions([]);
                      setSearchValue('');
                    }}
                    onClick={isMobile ? () => {
                      onCategorySelect?.(String(cat.id), cat.name);
                      // onCategorySelect already navigates with params via RootLayout
                      setMobileSearchOpen(false);
                      setSuggestions([]);
                      setCategorySuggestions([]);
                      setSearchValue('');
                    } : undefined}
                    className={`w-full flex items-center gap-3 ${px} ${isMobile ? 'py-3' : 'py-2.5'} hover:bg-black/[0.03] active:bg-black/[0.04] text-left transition-colors`}
                  >
                    <div className={`${isMobile ? 'w-9 h-9' : 'w-7 h-7'} rounded-lg bg-[#f5f5f7] flex items-center justify-center flex-shrink-0`}>
                      <Grid3X3 className={`${isMobile ? 'w-4 h-4' : 'w-3 h-3'} text-[#86868b]/60`} strokeWidth={1.5} />
                    </div>
                    <span className={`${isMobile ? 'text-[15px]' : 'text-[13px]'} text-[#1d1d1f] font-medium`}>{cat.name}</span>
                  </button>
                ))}
              </div>
            );
          })()
        )}

        {/* Product Suggestions */}
        {searchValue.trim().length >= 2 && suggestions.length > 0 && (
          <div className="py-1">
            <div className={`${px} py-1.5 flex items-center gap-1.5`}>
              <TrendingUp className="w-3 h-3 text-[#86868b]" strokeWidth={2} />
              <span className="text-[11px] font-semibold text-[#86868b] uppercase tracking-wider">Produtos</span>
            </div>
            {suggestions.map((product, i) => (
              <button
                key={product.id || i}
                onMouseDown={isMobile ? undefined : () => handleSuggestionClick(product)}
                onClick={isMobile ? () => handleSuggestionClick(product) : undefined}
                className={`w-full flex items-center gap-3 ${px} ${py} hover:bg-black/[0.03] active:bg-black/[0.05] transition-colors text-left`}
              >
                {/* Thumbnail */}
                <div className={`${isMobile ? 'w-12 h-12 rounded-xl' : 'w-11 h-11 rounded-lg'} bg-[#f5f5f7] flex-shrink-0 flex items-center justify-center overflow-hidden`}>
                  {(product.image_url || product.image) ? (
                    <img src={product.image_url || product.image} alt="" className="w-full h-full object-cover" loading="lazy" />
                  ) : (
                    <Search className="w-4 h-4 text-[#86868b]/50" />
                  )}
                </div>
                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className={`${isMobile ? 'text-[15px] line-clamp-2' : 'text-[13px] truncate'} text-[#1d1d1f] font-medium leading-snug`}>
                    {product.name}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5">
                    {product.sku && (
                      <span className="text-[11px] text-[#86868b] truncate">SKU: {product.sku}</span>
                    )}
                  </div>
                </div>
                {/* Price */}
                {product.price > 0 && (
                  <span className={`${isMobile ? 'text-[14px]' : 'text-[13px]'} font-semibold text-[#1d1d1f] flex-shrink-0`}>
                    {formatPrice(product.price)}
                  </span>
                )}
              </button>
            ))}

            {/* View all */}
            <button
              onMouseDown={isMobile ? undefined : (handleSearch as any)}
              onClick={isMobile ? (handleSearch as any) : undefined}
              className={`w-full flex items-center justify-center gap-2 ${px} ${isMobile ? 'py-4' : 'py-3'} ${isMobile ? 'text-[15px]' : 'text-[13px]'} font-semibold text-primary hover:bg-primary/[0.04] active:bg-primary/[0.08] border-t border-black/[0.04] transition-colors mt-1`}
            >
              Ver todos os resultados
              <ArrowRight className={`${isMobile ? 'w-4 h-4' : 'w-3.5 h-3.5'}`} strokeWidth={2} />
            </button>
          </div>
        )}

        {/* No results */}
        {!suggestionsLoading && suggestions.length === 0 && categorySuggestions.length === 0 && searchValue.trim().length >= 2 && (
          <div className={`${px} ${isMobile ? 'py-10' : 'py-6'} text-center`}>
            {isMobile && <Search className="w-8 h-8 text-[#86868b]/20 mx-auto mb-2" strokeWidth={1.2} />}
            <p className={`${isMobile ? 'text-[16px]' : 'text-[13px]'} text-[#86868b] font-medium`}>
              Nenhum resultado para &ldquo;{searchValue}&rdquo;
            </p>
            {isMobile && (
              <p className="text-[14px] text-[#86868b]/70 mt-1">
                {aiMode ? 'Tente desativar a busca IA' : 'Tente ativar a busca IA para melhores resultados'}
              </p>
            )}
          </div>
        )}
      </>
    );
  };

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <>
      <header className="w-full z-50">
        {/* ─── Main Navigation Bar ─── */}
        <nav
          className={`transition-all duration-300 ${
            isScrolled
              ? 'bg-[rgba(251,251,253,0.88)] backdrop-blur-2xl backdrop-saturate-[180%] border-b border-black/[0.06]'
              : 'bg-[#fbfbfd] border-b border-black/[0.04]'
          }`}
        >
          {/* ═══ DESKTOP NAV BAR (lg+) ═══ */}
          <div className="hidden lg:flex max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-[64px] items-center gap-5">
            {/* Logo */}
            <button
              onClick={() => onNavigate('home')}
              className="flex-shrink-0"
              aria-label="Toyoparts Home"
            >
              <ToyopartsLogo className="h-[28px] w-auto" color="#D41216" />
            </button>

            {/* Inline Search Bar */}
            <form
              onSubmit={handleSearch}
              className="relative flex-1 min-w-0 max-w-[580px] mx-auto"
            >
              <div
                className={`relative flex items-center rounded-full h-[44px] pl-4 pr-2 gap-2 transition-all duration-500 ${
                  aiMode
                    ? 'ai-search-active bg-white'
                    : 'bg-[#f5f5f7] hover:bg-[#ededf0] focus-within:bg-white focus-within:ring-2 focus-within:ring-primary/10'
                }`}
              >
                {/* Left icon — transitions between Search and Sparkles */}
                <div className="relative flex-shrink-0 w-[18px] h-[18px]">
                  <Search
                    className={`absolute inset-0 w-[18px] h-[18px] text-[#86868b] transition-all duration-500 ${
                      aiMode ? 'opacity-0 scale-75 rotate-[-90deg]' : 'opacity-100 scale-100 rotate-0'
                    }`}
                    strokeWidth={2}
                  />
                  <Sparkles
                    className={`absolute inset-0 w-[18px] h-[18px] text-purple-500 transition-all duration-500 ${
                      aiMode ? 'opacity-100 scale-100 rotate-0' : 'opacity-0 scale-75 rotate-90'
                    }`}
                    strokeWidth={2}
                  />
                </div>

                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchValue}
                  onChange={e => handleSearchInputChange(e.target.value)}
                  onFocus={() => setSearchOpen(true)}
                  onBlur={() => setTimeout(() => setSearchOpen(false), 300)}
                  placeholder={aiMode ? "Descreva o que você está procurando..." : "Buscar peças, acessórios e mais..."}
                  className="flex-1 bg-transparent text-[14px] text-[#1d1d1f] placeholder:text-[#86868b]/60 outline-none min-w-0 font-medium h-full"
                />

                {/* Clear + IA toggle */}
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  {searchValue && (
                    <button
                      type="button"
                      onClick={() => { setSearchValue(''); setSuggestions([]); setCategorySuggestions([]); }}
                      className="w-5 h-5 rounded-full bg-black/[0.06] hover:bg-black/[0.1] flex items-center justify-center transition-colors"
                    >
                      <X className="w-2.5 h-2.5 text-[#86868b]" strokeWidth={2.5} />
                    </button>
                  )}
                  <AiToggle size="sm" />
                </div>
              </div>

              {/* Desktop Autocomplete Dropdown */}
              {searchOpen && (searchValue.trim().length >= 2 || recentSearches.length > 0) && (
                <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-2xl shadow-xl border border-black/[0.06] overflow-hidden z-50 max-h-[480px] overflow-y-auto">
                  <AutocompleteContent isMobile={false} />
                </div>
              )}
            </form>

            {/* Desktop Nav Link */}
            <button
              className="h-[64px] flex items-center px-3 text-[12px] tracking-[0.005em] text-[#1d1d1f] font-normal opacity-80 hover:opacity-100 transition-opacity flex-shrink-0"
              onClick={() => onNavigate('search')}
            >
              Ofertas
            </button>

            {/* Desktop WhatsApp — phone → "Fale por WhatsApp" on hover */}
            <a
              href="https://api.whatsapp.com/send?phone=554332941144&text=Ol%C3%A1!%20Toyoparts!"
              target="_blank"
              rel="noopener noreferrer"
              className="hidden xl:flex items-center flex-shrink-0 group/wa rounded-full px-2.5 py-1.5 hover:bg-[#25D366]/[0.08] transition-all duration-300 cursor-pointer"
              aria-label="Fale conosco no WhatsApp"
            >
              {/* Icon container — Phone swaps to MessageCircle */}
              <div className="relative w-3.5 h-3.5 mr-1.5 flex-shrink-0">
                <Phone
                  className="absolute inset-0 w-3.5 h-3.5 text-[#86868b] transition-all duration-300 ease-out group-hover/wa:opacity-0 group-hover/wa:scale-50 group-hover/wa:rotate-[-90deg]"
                  strokeWidth={1.5}
                />
                <MessageCircle
                  className="absolute inset-0 w-3.5 h-3.5 text-[#25D366] transition-all duration-300 ease-out opacity-0 scale-50 rotate-90 group-hover/wa:opacity-100 group-hover/wa:scale-100 group-hover/wa:rotate-0"
                  strokeWidth={1.8}
                />
              </div>
              {/* Text container — vertical slide swap */}
              <div className="relative h-[14px] overflow-hidden">
                <span className="block text-[11px] text-[#86868b] font-normal whitespace-nowrap leading-[14px] transition-all duration-300 ease-out group-hover/wa:-translate-y-full group-hover/wa:opacity-0">
                  (43) 3294-1144
                </span>
                <span className="block text-[11px] text-[#25D366] font-semibold whitespace-nowrap leading-[14px] transition-all duration-300 ease-out translate-y-0 group-hover/wa:-translate-y-full opacity-0 group-hover/wa:opacity-100">
                  Fale por WhatsApp
                </span>
              </div>
            </a>

            {/* Desktop Actions */}
            <div className="flex items-center gap-0.5 flex-shrink-0">
              <Link
                to="/acesso"
                className="w-9 h-9 flex items-center justify-center text-[#1d1d1f]/70 hover:text-[#1d1d1f] rounded-full hover:bg-black/[0.03] transition-all"
                aria-label="Conta"
              >
                <User className="w-[15px] h-[15px]" strokeWidth={1.8} />
              </Link>
              <button
                onClick={onCartClick}
                className="w-9 h-9 flex items-center justify-center text-[#1d1d1f]/70 hover:text-[#1d1d1f] rounded-full hover:bg-black/[0.03] transition-all relative"
                aria-label="Carrinho"
              >
                <ShoppingCart className="w-[15px] h-[15px]" strokeWidth={1.8} />
                {totals.totalQty > 0 && (
                  <span className="absolute top-0.5 right-0.5 w-[14px] h-[14px] text-[8px] font-semibold leading-none bg-primary text-white rounded-full flex items-center justify-center">
                    {totals.totalQty > 9 ? '9+' : totals.totalQty}
                  </span>
                )}
              </button>
            </div>
          </div>

          {/* ═══ MOBILE NAV BAR (<lg) ═══ */}
          <div className="lg:hidden relative h-[56px] flex items-center justify-between px-4">
            {/* Left Actions — Hamburger + Search */}
            <div className="flex items-center gap-0.5 z-10">
              {/* Hamburger (Departamentos) */}
              <button
                onClick={() => setMobileDeptOpen(true)}
                className="w-10 h-10 flex items-center justify-center text-[#1d1d1f]/70 hover:text-[#1d1d1f] rounded-full hover:bg-black/[0.03] active:scale-90 transition-all"
                aria-label="Departamentos"
              >
                <Menu className="w-[18px] h-[18px]" strokeWidth={1.8} />
              </button>

              {/* Search trigger */}
              <button
                onClick={() => setMobileSearchOpen(true)}
                className="w-10 h-10 flex items-center justify-center text-[#1d1d1f]/70 hover:text-[#1d1d1f] rounded-full hover:bg-black/[0.03] active:scale-90 transition-all"
                aria-label="Buscar"
              >
                <Search className="w-[18px] h-[18px]" strokeWidth={1.8} />
              </button>
            </div>

            {/* Logo — absolutely centered */}
            <button
              onClick={() => onNavigate('home')}
              className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
              aria-label="Toyoparts Home"
            >
              <ToyopartsLogo className="h-[22px] w-auto" color="#D41216" />
            </button>

            {/* Right Actions — Cart + Account */}
            <div className="flex items-center gap-0.5 z-10">
              {/* Cart */}
              <button
                onClick={onCartClick}
                className="w-10 h-10 flex items-center justify-center text-[#1d1d1f]/70 hover:text-[#1d1d1f] rounded-full hover:bg-black/[0.03] active:scale-90 transition-all relative"
                aria-label="Carrinho"
              >
                <ShoppingCart className="w-[17px] h-[17px]" strokeWidth={1.8} />
                {totals.totalQty > 0 && (
                  <span className="absolute top-1 right-1 w-[14px] h-[14px] text-[8px] font-semibold leading-none bg-primary text-white rounded-full flex items-center justify-center">
                    {totals.totalQty > 9 ? '9+' : totals.totalQty}
                  </span>
                )}
              </button>

              {/* Account */}
              <button
                onClick={() => setMobileAccountOpen(!mobileAccountOpen)}
                className="w-10 h-10 flex items-center justify-center text-[#1d1d1f]/70 hover:text-[#1d1d1f] rounded-full hover:bg-black/[0.03] active:scale-90 transition-all"
                aria-label="Minha Conta"
              >
                {mobileAccountOpen ? (
                  <X className="w-[17px] h-[17px]" strokeWidth={2} />
                ) : (
                  <User className="w-[17px] h-[17px]" strokeWidth={1.8} />
                )}
              </button>
            </div>
          </div>
        </nav>
      </header>

      {/* ═══ MOBILE FULLSCREEN SEARCH ═══ */}
      {mobileSearchOpen && (
        <div className="fixed inset-0 z-[110] bg-white flex flex-col lg:hidden animate-in fade-in duration-150">
          {/* Search Header */}
          <div className="px-4 pt-3 pb-3 border-b border-black/[0.06]">
            <div className="flex items-center gap-2">
              <form onSubmit={handleSearch} className="flex-1">
                <div
                  className={`relative flex items-center rounded-xl h-[44px] pl-3.5 pr-2 gap-2 transition-all duration-500 ${
                    aiMode
                      ? 'ai-search-active bg-white'
                      : 'bg-[#f5f5f7] border border-transparent'
                  }`}
                >
                  <div className="relative flex-shrink-0 w-[17px] h-[17px]">
                    <Search
                      className={`absolute inset-0 w-[17px] h-[17px] text-[#86868b] transition-all duration-500 ${
                        aiMode ? 'opacity-0 scale-75 rotate-[-90deg]' : 'opacity-100 scale-100 rotate-0'
                      }`}
                      strokeWidth={2}
                    />
                    <Sparkles
                      className={`absolute inset-0 w-[17px] h-[17px] text-purple-500 transition-all duration-500 ${
                        aiMode ? 'opacity-100 scale-100 rotate-0' : 'opacity-0 scale-75 rotate-90'
                      }`}
                      strokeWidth={2}
                    />
                  </div>
                  <input
                    ref={mobileSearchInputRef}
                    type="text"
                    value={searchValue}
                    onChange={e => handleSearchInputChange(e.target.value)}
                    placeholder={aiMode ? 'Descreva o que procura...' : 'Buscar peças, acessórios...'}
                    className="flex-1 bg-transparent text-[16px] text-[#1d1d1f] placeholder:text-[#86868b]/60 outline-none font-medium h-full"
                    autoFocus
                    style={{ fontSize: '16px' }}
                  />
                  {searchValue && (
                    <button
                      type="button"
                      onClick={() => { setSearchValue(''); setSuggestions([]); setCategorySuggestions([]); }}
                      className="w-6 h-6 rounded-full bg-black/[0.06] flex items-center justify-center transition-colors"
                    >
                      <X className="w-3 h-3 text-[#86868b]" strokeWidth={2.5} />
                    </button>
                  )}
                </div>
              </form>

              {/* AI Toggle */}
              <button
                type="button"
                onClick={toggleAiMode}
                className={`flex-shrink-0 h-[44px] px-3.5 rounded-xl flex items-center justify-center gap-1.5 transition-all duration-500 ${
                  aiMode
                    ? 'bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 text-white shadow-[0_2px_12px_-2px_rgba(139,92,246,0.5)]'
                    : 'bg-[#f5f5f7] text-[#86868b]'
                }`}
                aria-label="Busca IA"
              >
                <Sparkles className={`w-[18px] h-[18px] transition-transform duration-500 ${aiMode ? 'scale-110 animate-pulse' : ''}`} strokeWidth={2} />
                <span className="text-[13px] font-bold tracking-wide">IA</span>
              </button>

              {/* Close */}
              <button
                onClick={() => { setMobileSearchOpen(false); setSuggestions([]); setCategorySuggestions([]); }}
                className="flex-shrink-0 w-[44px] h-[44px] rounded-xl bg-[#f5f5f7] flex items-center justify-center text-[#86868b]"
              >
                <X className="w-[17px] h-[17px]" strokeWidth={2} />
              </button>
            </div>
          </div>

          {/* Results / Suggestions */}
          <div className="flex-1 overflow-y-auto overscroll-contain">
            {/* When input is empty: show recents + real categories + vehicle models */}
            {!searchValue.trim() ? (
              <div>
                {/* Recent searches */}
                {recentSearches.length > 0 && (
                  <div className="py-3">
                    <div className="px-5 pb-2 flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-[#86868b]" strokeWidth={2} />
                      <span className="text-[12px] font-semibold text-[#86868b] uppercase tracking-wider">Recentes</span>
                    </div>
                    {recentSearches.map((q, i) => (
                      <button
                        key={i}
                        onClick={() => handleRecentClick(q)}
                        className="w-full flex items-center gap-3 px-5 py-3 active:bg-black/[0.04] text-left transition-colors"
                      >
                        <Clock className="w-[18px] h-[18px] text-[#86868b]/40 flex-shrink-0" strokeWidth={1.5} />
                        <span className="text-[16px] text-[#1d1d1f] flex-1">{q}</span>
                        <ArrowRight className="w-4 h-4 text-[#86868b]/30 flex-shrink-0" strokeWidth={2} />
                      </button>
                    ))}
                  </div>
                )}

                {/* Popular categories from real tree */}
                {topCategories.length > 0 && (
                  <div className="py-3 border-t border-black/[0.04]">
                    <div className="px-5 pb-3 flex items-center gap-1.5">
                      <Grid3X3 className="w-3.5 h-3.5 text-[#86868b]" strokeWidth={2} />
                      <span className="text-[12px] font-semibold text-[#86868b] uppercase tracking-wider">Categorias</span>
                    </div>
                    <div className="px-5 flex flex-wrap gap-2">
                      {topCategories.slice(0, 12).map(cat => (
                        <button
                          key={cat.id}
                          onClick={() => {
                            onCategorySelect?.(String(cat.id), cat.name);
                            // onCategorySelect already navigates with params via RootLayout
                            setMobileSearchOpen(false);
                            setSuggestions([]);
                            setCategorySuggestions([]);
                            setSearchValue('');
                          }}
                          className="px-3.5 py-2 bg-[#f5f5f7] hover:bg-[#ebebed] active:bg-[#e0e0e2] rounded-full text-[14px] text-[#1d1d1f] font-medium transition-colors"
                        >
                          {cat.name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Vehicle models grid */}
                <div className="py-3 border-t border-black/[0.04]">
                  <div className="px-5 pb-3 flex items-center gap-1.5">
                    <span className="text-[12px] font-semibold text-[#86868b] uppercase tracking-wider">Modelos</span>
                  </div>
                  <div className="px-5 grid grid-cols-4 gap-2">
                    {CAR_MODELS.map(model => (
                      <button
                        key={model.id}
                        onClick={() => {
                          onModeloSelect?.(model.modeloIds[0], model.name);
                          // onModeloSelect already navigates via RootLayout
                          setMobileSearchOpen(false);
                          setSuggestions([]);
                          setCategorySuggestions([]);
                          setSearchValue('');
                        }}
                        className="flex flex-col items-center gap-1.5 py-3 px-1 rounded-xl bg-[#f5f5f7] hover:bg-[#ebebed] active:bg-[#e0e0e2] transition-colors"
                      >
                        <CarModelIcon model={model} size={48} />
                        <span className="text-[11px] font-semibold text-[#1d1d1f] leading-tight">{model.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              /* When typing: autocomplete results */
              <AutocompleteContent isMobile={true} />
            )}
          </div>
        </div>
      )}

      {/* ═══ MOBILE FULLSCREEN DEPARTMENT MENU (App-like Stack) ═══ */}
      <AnimatePresence>
        {mobileDeptOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[65] lg:hidden"
          >
            {/* Backdrop */}
            <div
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
              onClick={() => setMobileDeptOpen(false)}
            />

            {/* Panel — Slide-up from bottom */}
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="absolute inset-0 bg-[#fbfbfd] flex flex-col overflow-hidden"
            >
              {/* ── Header ── */}
              <div className="flex-shrink-0 bg-[#fbfbfd]/95 backdrop-blur-xl border-b border-black/[0.06] z-10">
                <div className="h-[60px] flex items-center justify-between px-5">
                  <div className="flex items-center gap-1">
                    {mobileDeptStack.length > 0 && (
                      <button
                        onClick={() => {
                          setMobileDeptAnimDir('back');
                          setMobileDeptStack(prev => prev.slice(0, -1));
                        }}
                        className="flex items-center justify-center w-10 h-10 -ml-2 text-primary active:scale-90 transition-transform"
                      >
                        <ChevronLeft className="w-6 h-6" strokeWidth={2.5} />
                      </button>
                    )}
                    <span className={`text-[17px] font-bold tracking-tight transition-all duration-300 ${mobileDeptStack.length > 0 ? 'text-primary' : 'text-[#1d1d1f]'}`}>
                      {mobileDeptStack.length > 0 ? 'Voltar' : 'Departamentos'}
                    </span>
                  </div>

                  <button
                    onClick={() => setMobileDeptOpen(false)}
                    className="w-10 h-10 flex items-center justify-center text-[#86868b] bg-black/[0.05] rounded-full active:scale-90 transition-transform"
                  >
                    <X className="w-5 h-5" strokeWidth={2} />
                  </button>
                </div>

                {/* Breadcrumbs / Active Title */}
                <div className="px-5 pb-4 overflow-hidden">
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={mobileDeptStack.length > 0 ? mobileDeptStack[mobileDeptStack.length - 1].id : 'root'}
                      initial={{ opacity: 0, x: mobileDeptAnimDir === 'forward' ? 20 : -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: mobileDeptAnimDir === 'forward' ? -20 : 20 }}
                      className="space-y-0.5"
                    >
                      <h2 className="text-[26px] font-extrabold text-[#1d1d1f] tracking-tight leading-tight">
                        {mobileDeptStack.length > 0 
                          ? mobileDeptStack[mobileDeptStack.length - 1].name 
                          : 'Explore Categorias'}
                      </h2>
                      {mobileDeptStack.length > 1 && (
                        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar whitespace-nowrap">
                          {mobileDeptStack.slice(0, -1).map((s, i) => (
                            <span key={s.id} className="flex items-center gap-1 flex-shrink-0">
                              <span className="text-[11px] font-medium text-[#86868b]">{s.name}</span>
                              <ChevronRight className="w-3 h-3 text-[#86868b]/30" />
                            </span>
                          ))}
                        </div>
                      )}
                    </motion.div>
                  </AnimatePresence>
                </div>
              </div>

              {/* ── Content Stack ── */}
              <div className="flex-1 relative overflow-hidden bg-[#f5f5f7]/30">
                <AnimatePresence initial={false} mode="popLayout" custom={mobileDeptAnimDir}>
                  <motion.div
                    key={mobileDeptStack.length}
                    custom={mobileDeptAnimDir}
                    variants={{
                      enter: (direction: string) => ({
                        x: direction === 'forward' ? '100%' : '-100%',
                        opacity: 0,
                      }),
                      center: {
                        x: 0,
                        opacity: 1,
                      },
                      exit: (direction: string) => ({
                        x: direction === 'forward' ? '-100%' : '100%',
                        opacity: 0,
                      }),
                    }}
                    initial="enter"
                    animate="center"
                    exit="exit"
                    transition={{
                      x: { type: 'spring', stiffness: 300, damping: 30 },
                      opacity: { duration: 0.2 }
                    }}
                    className="absolute inset-0 overflow-y-auto overscroll-contain"
                  >
                    <div className="p-3">
                      {/* Current Level Categories */}
                      <div className="bg-white rounded-2xl shadow-sm border border-black/[0.04] overflow-hidden">
                        {isLoading ? (
                            <div className="p-4 space-y-3 animate-in fade-in duration-200">
                              {[...Array(6)].map((_, index) => (
                                <div key={index} className="flex items-center gap-3 rounded-2xl border border-black/[0.04] bg-[#fbfbfd] p-3">
                                  <Skeleton className="w-12 h-12 rounded-xl bg-[#f0f0f2]" />
                                  <div className="flex-1 space-y-2">
                                    <Skeleton className="h-3.5 w-[55%] bg-[#ececf0]" />
                                    <Skeleton className="h-3 w-[35%] bg-[#f3f3f6]" />
                                  </div>
                                  <Skeleton className="w-5 h-5 rounded-full bg-[#f0f0f2]" />
                                </div>
                              ))}
                            </div>
                          ) : (() => {
                          const nodes = mobileDeptStack.length === 0 
                            ? topCategories 
                            : (mobileDeptStack[mobileDeptStack.length - 1].children_data || mobileDeptStack[mobileDeptStack.length - 1].children || []).filter(c => c.is_active);

                          if (nodes.length === 0) {
                            return (
                              <div className="py-20 text-center px-10">
                                <Grid3X3 className="w-12 h-12 text-[#86868b]/20 mx-auto mb-4" />
                                <p className="text-[16px] text-[#86868b] font-medium">Nenhuma subcategoria encontrada</p>
                                <button
                                  onClick={() => {
                                    if (mobileDeptStack.length > 0) {
                                      const current = mobileDeptStack[mobileDeptStack.length - 1];
                                      onCategorySelect?.(String(current.id), current.name);
                                      setMobileDeptOpen(false);
                                    }
                                  }}
                                  className="mt-4 text-primary font-bold text-[14px]"
                                >
                                  Ver produtos desta categoria
                                </button>
                              </div>
                            );
                          }

                          return (
                            <div className="divide-y divide-black/[0.04]">
                              {/* "Ver tudo" contextual option when inside a stack */}
                              {mobileDeptStack.length > 0 && (
                                <button
                                  onClick={() => {
                                    const current = mobileDeptStack[mobileDeptStack.length - 1];
                                    onCategorySelect?.(String(current.id), current.name);
                                    // onCategorySelect already navigates with params via RootLayout
                                    setMobileDeptOpen(false);
                                  }}
                                  className="w-full flex items-center justify-between px-5 py-[18px] active:bg-primary/[0.05] transition-colors text-left group"
                                >
                                  <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                                      <Grid3X3 className="w-5 h-5" />
                                    </div>
                                    <div>
                                      <p className="text-[17px] font-bold text-primary">Ver todos os produtos</p>
                                      <p className="text-[12px] text-primary/60">Explore a linha completa</p>
                                    </div>
                                  </div>
                                  <ArrowRight className="w-5 h-5 text-primary active:translate-x-1 transition-transform" />
                                </button>
                              )}

                              {nodes.map((cat) => {
                                const hasChildren = (cat.children_data || cat.children || []).filter(c => c.is_active).length > 0;
                                const parentName = mobileDeptStack.length > 0 ? mobileDeptStack[mobileDeptStack.length - 1].name : undefined;
                                const imgUrl = getCategoryImage(cat.name, parentName);
                                return (
                                  <button
                                    key={cat.id}
                                    onClick={() => {
                                      if (hasChildren) {
                                        setMobileDeptAnimDir('forward');
                                        setMobileDeptStack(prev => [...prev, cat]);
                                      } else {
                                        onCategorySelect?.(String(cat.id), cat.name);
                                        // onCategorySelect already navigates with params via RootLayout
                                        setMobileDeptOpen(false);
                                      }
                                    }}
                                    className="w-full flex items-center justify-between px-5 py-[18px] active:bg-black/[0.04] transition-colors text-left"
                                  >
                                    <div className="flex items-center gap-3 flex-1 min-w-0">
                                      {imgUrl && (
                                        <div className="w-10 h-10 rounded-lg overflow-hidden bg-[#f5f5f7] flex-shrink-0 border border-black/[0.04] flex items-center justify-center">
                                          <img src={imgUrl} alt="" className="w-full h-full object-cover" />
                                        </div>
                                      )}
                                      <span className="text-[17px] text-[#1d1d1f] font-medium truncate pr-2">{cat.name}</span>
                                    </div>
                                    <div className="flex items-center gap-2 flex-shrink-0">
                                      {cat.product_count > 0 && (
                                        <span className="text-[12px] text-[#86868b] font-medium bg-[#f5f5f7] px-2 py-0.5 rounded-full">
                                          {cat.product_count}
                                        </span>
                                      )}
                                      {hasChildren ? (
                                        <ChevronRight className="w-5 h-5 text-[#c7c7cc]" strokeWidth={2.5} />
                                      ) : (
                                        <ArrowRight className="w-4 h-4 text-primary/40" />
                                      )}
                                    </div>
                                  </button>
                                );
                              })}
                            </div>
                          );
                        })()}
                      </div>
                      
                      {/* Promotional / Support section in root (removed) */}
                    </div>
                  </motion.div>
                </AnimatePresence>
              </div>

              {/* Bottom Safety Area */}
              <div className="h-[max(20px,env(safe-area-inset-bottom))] bg-[#fbfbfd]" />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══ MOBILE ACCOUNT PANEL ═══ */}
      {mobileAccountOpen && (
        <div className="fixed inset-0 z-[60] lg:hidden">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/20 animate-in fade-in duration-200"
            onClick={() => setMobileAccountOpen(false)}
          />

          {/* Panel */}
          <div className="absolute inset-y-0 right-0 w-full max-w-[300px] bg-[#fbfbfd] flex flex-col animate-in slide-in-from-right duration-300 ease-out">
            {/* Header */}
            <div className="h-[52px] flex items-center justify-between px-5 border-b border-black/[0.06] flex-shrink-0">
              <span className="text-[15px] font-semibold text-[#1d1d1f]">Minha Conta</span>
              <button
                onClick={() => setMobileAccountOpen(false)}
                className="w-[30px] h-[30px] flex items-center justify-center text-[#1d1d1f]/60 hover:text-[#1d1d1f] rounded-full hover:bg-black/[0.04] transition-colors"
              >
                <X className="w-[16px] h-[16px]" strokeWidth={2} />
              </button>
            </div>

            {/* Account Content */}
            <div className="flex-1 overflow-y-auto px-5 py-6">
              {/* Login CTA */}
              <div className="text-center mb-6">
                <div className="w-16 h-16 rounded-full bg-[#f5f5f7] flex items-center justify-center mx-auto mb-3">
                  <User className="w-7 h-7 text-[#86868b]" strokeWidth={1.5} />
                </div>
                <p className="text-[15px] font-semibold text-[#1d1d1f]">Bem-vindo!</p>
                <p className="text-[13px] text-[#86868b] mt-1">
                  Fa&ccedil;a login para acessar seus pedidos e dados
                </p>
              </div>

              {/* Login Button */}
              <button className="w-full h-11 bg-[#1d1d1f] hover:bg-[#333] text-white text-[14px] font-semibold rounded-xl flex items-center justify-center gap-2 transition-colors mb-3">
                <LogIn className="w-4 h-4" strokeWidth={2} />
                Fazer Login
              </button>

              {/* Register */}
              <button className="w-full h-11 bg-transparent hover:bg-black/[0.03] text-[#1d1d1f] text-[14px] font-medium rounded-xl flex items-center justify-center gap-2 border border-black/[0.1] transition-colors">
                Criar Conta
              </button>

              {/* Divider */}
              <div className="my-6 border-t border-black/[0.06]" />

              {/* Quick Links */}
              <div className="space-y-1">
                <button className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-left hover:bg-black/[0.03] transition-colors">
                  <ShoppingCart className="w-[18px] h-[18px] text-[#86868b]" strokeWidth={1.5} />
                  <span className="text-[14px] text-[#1d1d1f]">Meus Pedidos</span>
                </button>
                <button
                  onClick={() => { onNavigate('search'); setMobileAccountOpen(false); }}
                  className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-left hover:bg-black/[0.03] transition-colors"
                >
                  <TrendingUp className="w-[18px] h-[18px] text-[#86868b]" strokeWidth={1.5} />
                  <span className="text-[14px] text-[#1d1d1f]">Ofertas</span>
                </button>
                <a
                  href="https://api.whatsapp.com/send?phone=554332941144&text=Ol%C3%A1!%20Toyoparts!"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-left hover:bg-[#25D366]/[0.06] active:bg-[#25D366]/[0.1] transition-colors"
                >
                  <MessageCircle className="w-[18px] h-[18px] text-[#25D366]" strokeWidth={1.5} />
                  <div className="flex-1 min-w-0">
                    <span className="text-[14px] text-[#1d1d1f] block">(43) 3294-1144</span>
                    <span className="text-[11px] text-[#25D366] font-medium">Fale por WhatsApp</span>
                  </div>
                </a>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
