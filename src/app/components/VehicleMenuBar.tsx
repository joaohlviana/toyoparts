import React, { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { CAR_MODELS_SEO } from '../seo-config';
import { ChevronRight, ArrowRight, Menu, X, Loader2 } from 'lucide-react';
import { projectId, publicAnonKey } from '../../../utils/supabase/info';
import { AnimatePresence, motion } from 'motion/react';

// ─── API ─────────────────────────────────────────────────────────────────────
const API = `https://${projectId}.supabase.co/functions/v1/make-server-1d6e33e0`;
const HEADERS: HeadersInit = {
  Authorization: `Bearer ${publicAnonKey}`,
  apikey: publicAnonKey,
  'Content-Type': 'application/json',
};

// ─── S3 base for department images ───────────────────────────────────────────
const S3 = 'https://increazy-folder.s3.amazonaws.com/5ebed78a28503303b0530072';

// ─── Types ───────────────────────────────────────────────────────────────────
interface CategoryNode {
  id: number;
  parent_id: number;
  name: string;
  level: number;
  is_active: boolean;
  product_count: number;
  children_data?: CategoryNode[];
  children?: CategoryNode[]; // fallback for old cache format
}

// ─── Department definitions per model ────────────────────────────────────────
interface Department {
  name: string;
  description: string;
  imgKey: string;
  path: string;
}

const COMMON_DEPTS = (modelKey: string): Department[] => [
  {
    name: 'Acessorios Externos',
    description: 'Cromados, aerofolios, spoilers, antenas, frisos e mais',
    imgKey: `${modelKey}-menu-acessorios-externos.jpg`,
    path: 'acessorios-externos',
  },
  {
    name: 'Acessorios Internos',
    description: 'Cromados internos, porta-malas, tapetes, som e multimimidia',
    imgKey: `${modelKey}-menu-acessorios-internos.jpg`,
    path: 'acessorios-internos',
  },
  {
    name: 'Iluminacao',
    description: 'Farol de neblina, lanternas, lampadas LED e xenon',
    imgKey: `${modelKey}-menu-iluminacao.jpg`,
    path: 'iluminacao',
  },
  {
    name: 'Pecas',
    description: 'Amortecedor, cambio, filtros, freio e suspensao',
    imgKey: `${modelKey}-menu-pecas.jpg`,
    path: 'pecas',
  },
];

const MODEL_DEPARTMENTS: Record<string, Department[]> = {
  hilux: [
    ...COMMON_DEPTS('hilux'),
    {
      name: 'Santo Antonio',
      description: 'Santo Antonio, barras e protecao',
      imgKey: 'hilux-menu-santo-antonio.jpg',
      path: 'santo-antonio',
    },
  ],
  corolla: COMMON_DEPTS('corolla'),
  'corolla-cross': [
    {
      name: 'Acessorios Externos',
      description: 'Cromados, aerofolios, spoilers, antenas, frisos e mais',
      imgKey: 'banner-departamento-corolla-cross-acessorio-externo.jpg',
      path: 'acessorios-externos',
    },
    {
      name: 'Acessorios Internos',
      description: 'Cromados internos, porta-malas, tapetes, som e multimimidia',
      imgKey: 'banner-departamento-corolla-cross-acessorio-interno.jpg',
      path: 'acessorios-internos',
    },
    {
      name: 'Iluminacao',
      description: 'Farol de neblina, lanternas, lampadas LED e xenon',
      imgKey: 'banne-departamento-corolla-cross-iluminacao.jpg',
      path: 'iluminacao',
    },
    {
      name: 'Pecas',
      description: 'Amortecedor, cambio, filtros, freio e suspensao',
      imgKey: 'banne-departamento-corolla-cross-pecas.jpg',
      path: 'pecas',
    },
  ],
  yaris: COMMON_DEPTS('yaris'),
  sw4: [
    ...COMMON_DEPTS('sw4'),
    {
      name: 'Acessorios Pick Up e SUV',
      description: 'Capota maritima, overbumper, santo antonio',
      imgKey: 'sw4-menu-pickup-suv.jpg',
      path: 'pickup-suv',
    },
  ],
  etios: COMMON_DEPTS('etios'),
  rav4: COMMON_DEPTS('rav4'),
  prius: COMMON_DEPTS('prius'),
};

const MODEL_MENU_IMAGE_VERSION = '1770898453';
const MENU_IMAGE_WARMUP_DELAY_MS = 500;

// ─── Component ───────────────────────────────────────────────────────────────
export function VehicleMenuBar() {
  const location = useLocation();
  const navigate = useNavigate();
  const scrollRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const panelTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const warmedImageUrlsRef = useRef<Set<string>>(new Set());
  const warmedCategoriesRef = useRef(false);

  // Vehicle model hover state
  const [activeModel, setActiveModel] = useState<string | null>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  // Department hamburger state
  const [deptOpen, setDeptOpen] = useState(false);
  const [categoryTree, setCategoryTree] = useState<CategoryNode | null>(null);
  const [categoryImages, setCategoryImages] = useState<Record<string, string>>({});
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);
  const [isLoadingCats, setIsLoadingCats] = useState(false);
  const [hasFetchedCats, setHasFetchedCats] = useState(false);

  // Current model from URL
  const currentSlug = location.pathname.startsWith('/pecas/')
    ? location.pathname.split('/')[2]
    : null;

  // ─── Category Fetching ──────────────────────────────────────────────────
  const fetchCategories = useCallback(async () => {
    if (hasFetchedCats || isLoadingCats) return;
    setIsLoadingCats(true);
    try {
      const [treeRes, imgRes] = await Promise.all([
        fetch(`${API}/categories/tree`, { headers: HEADERS }),
        fetch(`${API}/categories/images`, { headers: HEADERS }),
      ]);
      if (treeRes.ok) {
        const data = await treeRes.json();
        setCategoryTree(data);
        const top = getTopCategories(data);
        if (top.length > 0) setActiveCategoryId(String(top[0].id));
      }
      if (imgRes.ok) {
        const data = await imgRes.json();
        if (data.images) setCategoryImages(data.images);
      }
      setHasFetchedCats(true);
    } catch (e) {
      console.error('VehicleMenuBar: failed to fetch categories:', e);
    } finally {
      setIsLoadingCats(false);
    }
  }, [hasFetchedCats, isLoadingCats]);

  // ─── Helpers ────────────────────────────────────────────────────────────
  const getTopCategories = (tree: CategoryNode | null): CategoryNode[] => {
    if (!tree) return [];
    const walk = (node: CategoryNode): CategoryNode[] => {
      const children = (node.children_data || node.children || []).filter(c => c.is_active);
      if (children.length === 0) return [];
      if (children.length === 1) return walk(children[0]);
      return children;
    };
    return walk(tree);
  };

  const getSubcategories = (node: CategoryNode): CategoryNode[] =>
    (node.children_data || node.children || []).filter(c => c.is_active);

  const slugify = (text: string): string =>
    text.toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');

  const getCategoryImage = (parentName: string, childName: string): string | null => {
    if (!categoryImages || Object.keys(categoryImages).length === 0) return null;
    const parentSlug = slugify(parentName);
    const childSlug = slugify(childName);
    
    // 1. Exact composite key (namespaced)
    const compositeKey = `${parentSlug}:${childSlug}`;
    if (categoryImages[compositeKey]) return categoryImages[compositeKey];
    
    // 2. Exact composite key (hyphenated - e.g. "acessorios-externos-cromados")
    const hyphenatedKey = `${parentSlug}-${childSlug}`;
    if (categoryImages[hyphenatedKey]) return categoryImages[hyphenatedKey];

    // 3. Child slug only
    if (categoryImages[childSlug]) return categoryImages[childSlug];

    // 4. Fuzzy search
    for (const key of Object.keys(categoryImages)) {
      if (key.includes(childSlug) || childSlug.includes(key)) return categoryImages[key];
    }
    return null;
  };

  const topCategories = getTopCategories(categoryTree);
  const activeCategory = useMemo(
    () => topCategories.find((cat) => String(cat.id) === activeCategoryId) ?? null,
    [activeCategoryId, topCategories]
  );

  const warmImage = useCallback((url: string | null | undefined) => {
    if (!url || typeof window === 'undefined') return;
    if (warmedImageUrlsRef.current.has(url)) return;
    warmedImageUrlsRef.current.add(url);
    const image = new window.Image();
    image.decoding = 'async';
    image.src = url;
  }, []);

  const warmImages = useCallback((urls: Array<string | null | undefined>) => {
    urls.forEach((url) => warmImage(url));
  }, [warmImage]);

  // ─── Scroll overflow detection ─────────────────────────────────────────
  const updateScrollState = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 2);
    setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 2);
  }, []);

  useEffect(() => {
    updateScrollState();
    const el = scrollRef.current;
    if (el) {
      el.addEventListener('scroll', updateScrollState, { passive: true });
      window.addEventListener('resize', updateScrollState);
    }
    return () => {
      el?.removeEventListener('scroll', updateScrollState);
      window.removeEventListener('resize', updateScrollState);
    };
  }, [updateScrollState]);

  const scroll = (direction: 'left' | 'right') => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollBy({ left: direction === 'left' ? -200 : 200, behavior: 'smooth' });
  };

  // Close on Escape
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setDeptOpen(false);
        setActiveModel(null);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  useEffect(() => {
    const modelMenuUrls = Object.values(MODEL_DEPARTMENTS)
      .flat()
      .map((dept) => `${S3}/${dept.imgKey}?v=${MODEL_MENU_IMAGE_VERSION}`);

    const warmMenuAssets = () => {
      warmImages(modelMenuUrls);

      if (!warmedCategoriesRef.current) {
        warmedCategoriesRef.current = true;
        void fetchCategories();
      }
    };

    if (typeof window === 'undefined') return;

    if ('requestIdleCallback' in window) {
      const idleId = window.requestIdleCallback(warmMenuAssets, {
        timeout: MENU_IMAGE_WARMUP_DELAY_MS,
      });
      return () => window.cancelIdleCallback(idleId);
    }

    const timeoutId = window.setTimeout(warmMenuAssets, MENU_IMAGE_WARMUP_DELAY_MS);
    return () => window.clearTimeout(timeoutId);
  }, [fetchCategories, warmImages]);

  useEffect(() => {
    if (!topCategories.length || !Object.keys(categoryImages).length) return;

    const categoryMenuUrls = topCategories.flatMap((category) =>
      getSubcategories(category)
        .map((sub) => getCategoryImage(category.name, sub.name))
        .filter(Boolean)
    );

    warmImages(categoryMenuUrls);
  }, [categoryImages, topCategories, warmImages]);

  // ─── Model Hover handlers ─────────────────────────────────────────────
  const handleModelEnter = (slug: string) => {
    if (deptOpen) return; // don't open model panel while dept panel is open
    if (panelTimeoutRef.current) clearTimeout(panelTimeoutRef.current);
    setActiveModel(slug);
  };

  const handleModelLeave = () => {
    panelTimeoutRef.current = setTimeout(() => {
      setActiveModel(null);
    }, 150);
  };

  const handlePanelEnter = () => {
    if (panelTimeoutRef.current) clearTimeout(panelTimeoutRef.current);
  };

  const handlePanelLeave = () => {
    panelTimeoutRef.current = setTimeout(() => {
      setActiveModel(null);
    }, 150);
  };

  const handleDeptClick = (modelSlug: string) => {
    setActiveModel(null);
    setDeptOpen(false);
    navigate(`/pecas/${modelSlug}`);
  };

  // ─── Hamburger handlers ───────────────────────────────────────────────
  const toggleDeptPanel = () => {
    const opening = !deptOpen;
    setDeptOpen(opening);
    setActiveModel(null);
    if (opening) fetchCategories();
  };

  const handleCategoryClick = (catId: string, catName: string) => {
    setDeptOpen(false);
    navigate(`/busca?category=${encodeURIComponent(catId)}&category_name=${encodeURIComponent(catName)}`);
  };

  const isPanelOpen = activeModel !== null;
  const activeModelData = activeModel ? CAR_MODELS_SEO.find(m => m.slug === activeModel) : null;
  const activeDepts = activeModel ? MODEL_DEPARTMENTS[activeModel] || COMMON_DEPTS(activeModel) : [];

  return (
    <div ref={barRef} className="relative z-30">
      {/* ─── Vehicle Strip ─── */}
      <div className="bg-[#1d1d1f] border-b border-white/[0.06]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative flex items-center">

          {/* ─── Departamentos Button (desktop only) ─── */}
          <button
            onClick={toggleDeptPanel}
            className={`hidden lg:flex items-center gap-1.5 flex-shrink-0 mr-2 lg:mr-3 px-3 py-1.5 rounded-lg transition-all duration-200 ${
              deptOpen
                ? 'bg-white/[0.12] text-white'
                : 'text-white/50 hover:text-white/80 hover:bg-white/[0.06]'
            }`}
            aria-label="Departamentos"
            aria-expanded={deptOpen}
          >
            <Menu className={`w-[14px] h-[14px] transition-transform duration-200 ${deptOpen ? 'rotate-90' : ''}`} strokeWidth={2} />
            <span className="text-[10px] font-medium tracking-[0.02em] whitespace-nowrap hidden xl:inline">
              Departamentos
            </span>
          </button>

          {/* Divider (desktop only) */}
          <div className="hidden lg:block w-px h-5 bg-white/[0.08] flex-shrink-0 mr-2 lg:mr-3" />

          {/* Scroll arrow — Left (desktop only) */}
          {canScrollLeft && (
            <div className="hidden lg:flex absolute left-0 top-0 bottom-0 z-10 items-center">
              <div className="w-12 h-full bg-gradient-to-r from-[#1d1d1f] via-[#1d1d1f]/80 to-transparent flex items-center pl-1.5">
                <button
                  onClick={() => scroll('left')}
                  className="w-6 h-6 rounded-full bg-white/10 border border-white/[0.1] flex items-center justify-center text-white/50 hover:text-white/80 hover:bg-white/15 transition-colors"
                  aria-label="Scroll left"
                >
                  <ChevronRight className="w-3 h-3 rotate-180" strokeWidth={2.5} />
                </button>
              </div>
            </div>
          )}

          {/* Scroll arrow — Right (desktop only) */}
          {canScrollRight && (
            <div className="hidden lg:flex absolute right-0 top-0 bottom-0 z-10 items-center">
              <div className="w-12 h-full bg-gradient-to-l from-[#1d1d1f] via-[#1d1d1f]/80 to-transparent flex items-center justify-end pr-1.5">
                <button
                  onClick={() => scroll('right')}
                  className="w-6 h-6 rounded-full bg-white/10 border border-white/[0.1] flex items-center justify-center text-white/50 hover:text-white/80 hover:bg-white/15 transition-colors"
                  aria-label="Scroll right"
                >
                  <ChevronRight className="w-3 h-3" strokeWidth={2.5} />
                </button>
              </div>
            </div>
          )}

          {/* Scrollable vehicle icons strip */}
          <div
            ref={scrollRef}
            className="flex-1 flex items-center justify-start lg:justify-center gap-1 sm:gap-1.5 lg:gap-2 overflow-x-auto no-scrollbar py-1"
            style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
          >
            {CAR_MODELS_SEO.map((model) => {
              const isActive = currentSlug === model.slug;
              const isHovered = activeModel === model.slug;

              return (
                <button
                  key={model.slug}
                  onMouseEnter={() => {
                    if (deptOpen) return;
                    if (panelTimeoutRef.current) clearTimeout(panelTimeoutRef.current);
                    panelTimeoutRef.current = setTimeout(() => {
                      setActiveModel(model.slug);
                    }, 250);
                  }}
                  onMouseLeave={() => {
                    if (panelTimeoutRef.current) clearTimeout(panelTimeoutRef.current);
                    panelTimeoutRef.current = setTimeout(() => {
                      setActiveModel(null);
                    }, 150);
                  }}
                  onClick={() => {
                    if (panelTimeoutRef.current) clearTimeout(panelTimeoutRef.current);
                    handleDeptClick(model.slug);
                  }}
                  className={`group flex flex-col items-center gap-1 flex-shrink-0 px-3 sm:px-4 lg:px-5 py-2 rounded-xl transition-all duration-200 cursor-pointer relative ${
                    isActive || isHovered
                      ? 'bg-white/[0.08]'
                      : 'hover:bg-white/[0.04]'
                  }`}
                >
                  {/* Car SVG silhouette (inverted to white) */}
                  <div className="h-[22px] sm:h-[26px] flex items-center justify-center">
                    <img
                      src={model.svgSrc}
                      alt={model.name}
                      className={`h-full w-auto object-contain transition-all duration-300 ${
                        isActive || isHovered
                          ? 'opacity-90 scale-105'
                          : 'opacity-30 group-hover:opacity-55 group-hover:scale-105'
                      }`}
                      loading="lazy"
                      draggable={false}
                      style={{ filter: 'brightness(0) invert(1)' }}
                    />
                  </div>

                  {/* Model name */}
                  <span
                    className={`text-[9px] sm:text-[10px] tracking-[0.02em] whitespace-nowrap transition-all duration-200 leading-none ${
                      isActive || isHovered
                        ? 'text-white font-semibold'
                        : 'text-white/50 font-medium group-hover:text-white/80'
                    }`}
                  >
                    {model.name}
                  </span>

                  {/* Active indicator dot */}
                  {isActive && (
                    <div className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-primary" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ─── Departments Panel (Hamburger dropdown) ─── */}
      <div
        className={`absolute left-0 right-0 top-full transition-all duration-300 ease-[cubic-bezier(0.25,0.1,0.25,1)] overflow-hidden z-20 ${
          deptOpen ? 'max-h-[520px] opacity-100' : 'max-h-0 opacity-0'
        }`}
      >
        <div className="bg-[rgba(251,251,253,0.97)] backdrop-blur-2xl backdrop-saturate-[180%] border-b border-black/[0.08] shadow-[0_8px_32px_rgba(0,0,0,0.08)]">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            {isLoadingCats ? (
              /* ─── Skeleton Loading ─── */
              <div className="flex min-h-[380px] animate-pulse">
                {/* Skeleton Sidebar */}
                <div className="w-48 flex-shrink-0 py-5 pr-6 border-r border-black/[0.04]">
                  <div className="h-3 w-24 bg-black/[0.06] rounded mb-4 mx-2" />
                  <div className="space-y-1.5 mt-3">
                    {[75, 88, 68, 92, 70, 85, 78, 65].map((w, i) => (
                      <div key={i} className="h-7 rounded-lg bg-black/[0.04] mx-1" style={{ width: `${w}%` }} />
                    ))}
                  </div>
                </div>
                {/* Skeleton Content Grid */}
                <div className="flex-1 py-5 pl-6">
                  <div className="flex items-baseline justify-between mb-4">
                    <div className="h-5 w-40 bg-black/[0.07] rounded" />
                    <div className="h-3 w-16 bg-black/[0.05] rounded" />
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                    {Array.from({ length: 10 }).map((_, i) => (
                      <div key={i} className="rounded-2xl overflow-hidden bg-[#f5f5f7]">
                        <div className="aspect-[16/10] bg-black/[0.05]" />
                        <div className="px-2.5 py-2.5">
                          <div className="h-3 w-3/4 bg-black/[0.06] rounded" />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : topCategories.length > 0 ? (
              <div className="flex min-h-[380px]">
                {/* Sidebar — category list */}
                <div className="w-48 flex-shrink-0 py-5 pr-6 border-r border-black/[0.04]">
                  <span className="text-[10px] font-semibold text-[#86868b] uppercase tracking-[0.08em] px-2 mb-2 block">
                    Departamentos
                  </span>
                  <div className="space-y-0 mt-1">
                    {topCategories.map(cat => (
                      <button
                        key={cat.id}
                        onMouseEnter={() => setActiveCategoryId(String(cat.id))}
                        onClick={() => handleCategoryClick(String(cat.id), cat.name)}
                        className={`w-full text-left px-2.5 py-[7px] text-[12px] tracking-[0.005em] rounded-lg transition-all duration-150 ${
                          activeCategoryId === String(cat.id)
                            ? 'text-[#1d1d1f] font-semibold bg-black/[0.05]'
                            : 'text-[#424245] font-normal hover:text-[#1d1d1f] hover:bg-black/[0.02]'
                        }`}
                      >
                        {cat.name}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Content — subcategory cards */}
                <div className="flex-1 py-5 pl-6 overflow-y-auto">
                  <AnimatePresence mode="wait" initial={false}>
                    {activeCategory && (
                      <motion.div
                        key={activeCategory.id}
                        initial={{ opacity: 0, y: 10, filter: 'blur(4px)' }}
                        animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                        exit={{ opacity: 0, y: -8, filter: 'blur(3px)' }}
                        transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                      >
                        <div className="flex items-baseline justify-between mb-4">
                          <h3 className="text-[18px] font-semibold text-[#1d1d1f] tracking-[-0.01em]">
                            {activeCategory.name}
                          </h3>
                          <button
                            onClick={() => handleCategoryClick(String(activeCategory.id), activeCategory.name)}
                            className="group/link flex items-center gap-1 text-[12px] font-normal text-[#2997ff] hover:underline"
                          >
                            Ver tudo
                            <ArrowRight className="w-3 h-3 transition-transform group-hover/link:translate-x-0.5" strokeWidth={2} />
                          </button>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                          {getSubcategories(activeCategory).map((sub) => {
                            const imgUrl = getCategoryImage(activeCategory.name, sub.name);
                            return (
                              <button
                                key={sub.id}
                                onClick={() => handleCategoryClick(String(sub.id), sub.name)}
                                className="text-left group/card rounded-2xl overflow-hidden bg-[#f5f5f7] hover:bg-[#ebebed] transition-colors"
                              >
                                {imgUrl ? (
                                  <div className="relative aspect-[16/10] overflow-hidden">
                                    <img
                                      src={imgUrl}
                                      alt={sub.name}
                                      className="w-full h-full object-cover transition-transform duration-500 group-hover/card:scale-[1.03]"
                                      loading="eager"
                                      decoding="async"
                                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                    />
                                  </div>
                                ) : (
                                  <div className="aspect-[16/10] flex items-center justify-center bg-[#e8e8ed]">
                                    <span className="text-[24px] font-bold text-[#d2d2d7]/80">{sub.name.charAt(0)}</span>
                                  </div>
                                )}
                                <div className="px-2.5 py-2">
                                  <span className="block text-[12px] font-medium text-[#1d1d1f] group-hover/card:text-primary transition-colors truncate">
                                    {sub.name}
                                  </span>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            ) : (
              <div className="py-12 text-center text-[13px] text-[#86868b]">
                Nenhum departamento encontrado
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ─── Model Department Dropdown Panel (Apple-style) ─── */}
      <div
        className={`absolute left-0 right-0 top-full transition-all duration-300 ease-[cubic-bezier(0.25,0.1,0.25,1)] overflow-hidden ${
          isPanelOpen && !deptOpen ? 'max-h-[500px] opacity-100' : 'max-h-0 opacity-0'
        }`}
        onMouseEnter={handlePanelEnter}
        onMouseLeave={handlePanelLeave}
      >
        <div className="bg-[rgba(251,251,253,0.97)] backdrop-blur-2xl backdrop-saturate-[180%] border-b border-black/[0.08] shadow-[0_8px_32px_rgba(0,0,0,0.08)]">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">

            <AnimatePresence mode="wait" initial={false}>
              {activeModelData && (
                <motion.div
                  key={activeModelData.slug}
                  initial={{ opacity: 0, y: 12, scale: 0.992, filter: 'blur(5px)' }}
                  animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
                  exit={{ opacity: 0, y: -10, scale: 0.996, filter: 'blur(4px)' }}
                  transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                >
                  {/* Header */}
                  <div className="flex items-center justify-between mb-5">
                    <h3 className="text-[18px] sm:text-[20px] font-semibold text-[#1d1d1f] tracking-[-0.01em]">
                      {activeModelData.name}
                    </h3>
                    <Link
                      to={`/pecas/${activeModelData.slug}`}
                      onClick={() => setActiveModel(null)}
                      className="group/link flex items-center gap-1 text-[12px] font-normal text-[#2997ff] hover:underline transition-colors"
                    >
                      Ver todos os produtos
                      <ArrowRight className="w-3 h-3 transition-transform group-hover/link:translate-x-0.5" strokeWidth={2} />
                    </Link>
                  </div>

                  {/* Department cards grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                    {activeDepts.map((dept, index) => (
                      <motion.div
                        key={`${activeModelData.slug}-${dept.path}`}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.18, delay: index * 0.018, ease: [0.22, 1, 0.36, 1] }}
                      >
                        <Link
                          to={`/pecas/${activeModelData.slug}/${dept.path}`}
                          onClick={() => setActiveModel(null)}
                          className="group/card block rounded-2xl overflow-hidden bg-[#f5f5f7] hover:bg-[#ebebed] transition-all duration-200"
                        >
                          <div className="relative aspect-[4/3] overflow-hidden bg-[#e8e8ed]">
                            <img
                              src={`${S3}/${dept.imgKey}?v=${MODEL_MENU_IMAGE_VERSION}`}
                              alt={dept.name}
                              className="w-full h-full object-cover transition-transform duration-500 group-hover/card:scale-[1.04]"
                              loading="eager"
                              decoding="async"
                              onError={(e) => {
                                const target = e.target as HTMLImageElement;
                                target.style.display = 'none';
                              }}
                            />
                            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                              <span className="text-[24px] font-bold text-[#d2d2d7]/60">
                                {dept.name.charAt(0)}
                              </span>
                            </div>
                          </div>

                          <div className="px-2.5 py-2">
                            <span className="block text-[11px] sm:text-[12px] font-medium text-[#1d1d1f] group-hover/card:text-primary transition-colors leading-tight">
                              {dept.name}
                            </span>
                            <span className="block text-[10px] text-[#86868b] mt-0.5 line-clamp-1 leading-tight">
                              {dept.description}
                            </span>
                          </div>
                        </Link>
                      </motion.div>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* ─── Scrim behind dropdown ─── */}
      {(isPanelOpen || deptOpen) && (
        <div
          className="fixed inset-0 top-0 bg-black/10 -z-10 animate-in fade-in duration-200"
          onClick={() => { setActiveModel(null); setDeptOpen(false); }}
        />
      )}
    </div>
  );
}
