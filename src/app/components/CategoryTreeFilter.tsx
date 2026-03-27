import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { ChevronRight, ChevronDown, Loader2, RefreshCw } from 'lucide-react';
import { projectId, publicAnonKey } from '../../../utils/supabase/info';

const API = `https://${projectId}.supabase.co/functions/v1/make-server-1d6e33e0`;
const HEADERS: HeadersInit = {
  Authorization: `Bearer ${publicAnonKey}`,
  apikey: publicAnonKey,
};

// ─── Types ───────────────────────────────────────────────────────────────────

interface CategoryNode {
  id: number;
  parent_id: number;
  name: string;
  level: number;
  is_active: boolean | number;
  product_count: number;
  position?: number;
  children_data?: CategoryNode[];
  children?: CategoryNode[]; // fallback: endpoint pode retornar 'children' antes do cache migrar
}

function getNodeChildren(node: CategoryNode | null | undefined): CategoryNode[] {
  if (!node) return [];
  return node.children_data || node.children || [];
}

function isStructuralWrapper(node: CategoryNode | null | undefined): boolean {
  if (!node) return false;
  const name = String(node.name || '').trim().toLowerCase();
  return node.level <= 1
    || name === 'root'
    || name === 'root catalog'
    || name === 'default category'
    || name === 'toyoparts';
}

function normalizeTreePayload(payload: unknown): CategoryNode | null {
  const raw = Array.isArray(payload) ? payload[0] : payload;
  if (!raw || typeof raw !== 'object') return null;

  let node = raw as CategoryNode;
  let safety = 0;

  while (safety < 8 && isStructuralWrapper(node) && getNodeChildren(node).length === 1) {
    node = getNodeChildren(node)[0];
    safety += 1;
  }

  const children = getNodeChildren(node);
  const onlyPlaceholderRoot =
    String(node.name || '').trim().toLowerCase() === 'root' &&
    children.length === 0;

  if (onlyPlaceholderRoot) return null;
  return node;
}

interface CategoryTreeFilterProps {
  /** facetDistribution from MeiliSearch — e.g. { "Filtros": 12, "Motor": 38 } */
  facetCounts: Record<string, number>;
  /** Whether to match by name ('category_names') or by id ('category_ids') */
  facetKey: 'category_names' | 'category_ids';
  /** Currently selected category values */
  selectedValues: string[];
  /** Optional: Additional selected IDs (to handle cases where value is Name but we have ID) */
  selectedIds?: string[];
  /** Called when user clicks a category to toggle filter */
  onToggle: (value: string, id: string) => void;
  /** Whether search is still loading */
  isLoading?: boolean;
}

// ─── Singleton cache for tree ────────────────────────────────────────────────
let cachedTree: CategoryNode | null = null;
let treeFetchPromise: Promise<CategoryNode | null> | null = null;
let fetchAttempts = 0;
const MAX_RETRY = 3;

// Reseta cache (útil para HMR e retry manual)
export function resetTreeCache() {
  cachedTree = null;
  treeFetchPromise = null;
  fetchAttempts = 0;
}

export function preloadCategoryTree() {
  if (typeof window === 'undefined') return Promise.resolve(null);
  return fetchTree(false).catch(() => null);
}

async function fetchTree(forceRetry = false): Promise<CategoryNode | null> {
  if (cachedTree && !forceRetry) return cachedTree;
  if (forceRetry) {
    // Limpa cache para forçar nova tentativa
    cachedTree = null;
    treeFetchPromise = null;
    fetchAttempts = 0;
  }
  if (treeFetchPromise) return treeFetchPromise;

  treeFetchPromise = (async () => {
    for (let attempt = 1; attempt <= MAX_RETRY; attempt++) {
      fetchAttempts = attempt;
      try {
        // Pequeno delay apenas nas retentativas (backoff exponencial)
        if (attempt > 1) {
          await new Promise(r => setTimeout(r, 500 * Math.pow(2, attempt - 2)));
        }
        console.log(`[CategoryTreeFilter] Fetching tree (attempt ${attempt}/${MAX_RETRY})...`);
        const res = await fetch(`${API}/categories/tree`, {
          headers: HEADERS,
          signal: AbortSignal.timeout(12000),
        });
        if (res.ok) {
          cachedTree = await res.json();
          return cachedTree;
        }
        console.warn(`[CategoryTreeFilter] tree fetch returned HTTP ${res.status} (attempt ${attempt})`);
      } catch (e) {
        console.error(`[CategoryTreeFilter] failed to fetch tree (attempt ${attempt}):`, e);
      }
    }
    // Todas as tentativas falharam — reseta para permitir retry manual
    treeFetchPromise = null;
    return null;
  })();

  return treeFetchPromise;
}

// ─── Public helper: resolve category ID → name from cached tree ──────────────
function findNameById(node: CategoryNode, id: string): string | null {
  if (String(node.id) === id) return node.name;
  for (const child of getNodeChildren(node)) {
    const found = findNameById(child, id);
    if (found) return found;
  }
  return null;
}

export function getCategoryNameById(id: string): string | null {
  if (!cachedTree) return null;
  return findNameById(cachedTree, id);
}

// ─── Recursive Node Component (same pattern as Admin TreeNode) ───────────────
// Renders EVERY node in the raw tree — zero filters, zero exclusions.
// System wrapper nodes (Root Catalog, Default Category / Toyoparts) are rendered
// with their children auto-expanded so the user sees real categories immediately.

// ─── Helper: sum facet counts for a node + all descendants recursively ───────
function sumDescendantCounts(
  node: CategoryNode,
  facetCounts: Record<string, number>,
  facetKey: 'category_names' | 'category_ids'
): number {
  const ownCount = facetKey === 'category_names'
    ? (facetCounts[node.name] || 0)
    : (facetCounts[String(node.id)] || 0);

  let total = ownCount;
  for (const child of getNodeChildren(node)) {
    total += sumDescendantCounts(child, facetCounts, facetKey);
  }
  return total;
}

function CategoryTreeNode({
  node,
  facetCounts,
  facetKey,
  selectedValues,
  selectedIds,
  onToggle,
  depth,
  toggleExpand,
  expandedIds,
}: {
  node: CategoryNode;
  facetCounts: Record<string, number>;
  facetKey: 'category_names' | 'category_ids';
  selectedValues: string[];
  selectedIds?: string[];
  onToggle: (value: string, id: string) => void;
  depth: number;
  toggleExpand: (id: number) => void;
  expandedIds: Set<number>;
}) {
  const children = getNodeChildren(node);
  const hasChildren = children.length > 0;
  const isActive = node.is_active !== false && node.is_active !== 0;
  const isInactive = !isActive;

  // ── Counts ──
  const ownCount = facetKey === 'category_names'
    ? (facetCounts[node.name] || 0)
    : (facetCounts[String(node.id)] || 0);

  // Sum own + all descendant counts to determine if this branch has products
  const descendantTotal = hasChildren
    ? sumDescendantCounts(node, facetCounts, facetKey)
    : ownCount;
  const hasResults = descendantTotal > 0;

  // ── Filter value & selection ──
  const filterVal = facetKey === 'category_names' ? node.name : String(node.id);
  const isSelected = selectedValues.includes(filterVal) || (selectedIds ? selectedIds.includes(String(node.id)) : false);

  // ── System/wrapper nodes: auto-expand, don't render as clickable row ──
  // Nodes at level 0 or 1 (Root Catalog / Default Category) are structural wrappers.
  // If there's only 1 child, skip rendering this node entirely and render the child.
  if (isStructuralWrapper(node) && hasChildren && children.length === 1) {
    return (
      <CategoryTreeNode
        node={children[0]}
        facetCounts={facetCounts}
        facetKey={facetKey}
        selectedValues={selectedValues}
        selectedIds={selectedIds}
        onToggle={onToggle}
        depth={depth}
        toggleExpand={toggleExpand}
        expandedIds={expandedIds}
      />
    );
  }

  // If this is a wrapper node (level 0 or 1) with multiple children,
  // don't render it as a row — just render its children directly.
  if (isStructuralWrapper(node) && hasChildren) {
    return (
      <div className="space-y-0.5">
        {children.map(child => (
          <CategoryTreeNode
            key={child.id}
            node={child}
            facetCounts={facetCounts}
            facetKey={facetKey}
            selectedValues={selectedValues}
            selectedIds={selectedIds}
            onToggle={onToggle}
            depth={0}
            toggleExpand={toggleExpand}
            expandedIds={expandedIds}
          />
        ))}
      </div>
    );
  }

  // ── Expand state ──
  const isExpanded = expandedIds.has(node.id);

  // ── Styling by depth ──
  const isTopLevel = depth === 0;
  const textSize = isTopLevel ? 'text-[13px]' : depth === 1 ? 'text-[13px]' : 'text-xs';
  const fontWeight = isTopLevel
    ? (isSelected ? 'font-semibold' : 'font-medium')
    : (isSelected ? 'font-medium' : 'font-normal');

  const textColor = isSelected
    ? 'text-primary'
    : isInactive
      ? 'text-muted-foreground/40'
      : hasResults
        ? (isTopLevel ? 'text-foreground/80 hover:text-foreground' : 'text-muted-foreground hover:text-foreground')
        : 'text-muted-foreground/50';

  const bgColor = isSelected
    ? 'bg-primary/10 shadow-[inset_0_0_0_1px_rgba(var(--primary),0.1)]'
    : hasResults && !isInactive
      ? 'active:bg-black/[0.04]'
      : '';

  const countColor = isSelected
    ? 'text-primary/60'
    : 'text-muted-foreground/50';

  return (
    <div>
      {/* ── Node row ── */}
      <div 
        data-cat-id={node.id}
        data-level={depth}
        className={`flex items-center rounded-md transition-colors ${bgColor} ${(!hasResults && !isSelected) || isInactive ? 'opacity-60' : ''}`}
      >
        {/* Expand/collapse toggle */}
        {hasChildren ? (
          <button
            onClick={(e) => { e.stopPropagation(); toggleExpand(node.id); }}
            className="w-7 h-8 flex items-center justify-center flex-shrink-0 text-muted-foreground hover:text-foreground transition-colors"
            aria-label={isExpanded ? 'Recolher' : 'Expandir'}
          >
            {isExpanded ? (
              <ChevronDown className="w-3.5 h-3.5" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5" />
            )}
          </button>
        ) : (
          <div className="w-7 h-8 flex items-center justify-center flex-shrink-0">
            <div className="w-1 h-1 rounded-full bg-muted-foreground/30" />
          </div>
        )}

        {/* Category name + count */}
        <button
          onClick={() => onToggle(filterVal, String(node.id))}
          className={`flex-1 flex items-center gap-1.5 py-1.5 pr-2 text-left min-w-0 transition-colors ${textColor} ${fontWeight}`}
        >
          <span className={`truncate ${textSize} leading-tight ${isInactive ? 'italic' : ''}`}>{node.name}</span>
          {isInactive && (
            <span className="text-[9px] font-medium text-amber-500/70 bg-amber-500/10 px-1 py-0.5 rounded flex-shrink-0 leading-none">
              Inativa
            </span>
          )}
        </button>
      </div>

      {/* ── Children ── */}
      {hasChildren && isExpanded && (
        <div className={`ml-3 ${depth === 0 ? 'pl-3.5' : 'pl-2.5'} border-l-[1.5px] border-border/60 space-y-0.5 pb-1 mb-0.5`}>
          {children.map(child => (
            <CategoryTreeNode
              key={child.id}
              node={child}
              facetCounts={facetCounts}
              facetKey={facetKey}
              selectedValues={selectedValues}
              selectedIds={selectedIds}
              onToggle={onToggle}
              depth={depth + 1}
              toggleExpand={toggleExpand}
              expandedIds={expandedIds}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function CategoryTreeFilter({
  facetCounts,
  facetKey,
  selectedValues,
  selectedIds,
  onToggle,
  isLoading: searchLoading,
}: CategoryTreeFilterProps) {
  const [tree, setTree] = useState<CategoryNode | null>(cachedTree);
  const [loading, setLoading] = useState(!cachedTree);
  const [fetchError, setFetchError] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());

  const doFetch = useCallback((forceRetry = false) => {
    setLoading(true);
    setFetchError(false);
    fetchTree(forceRetry).then(t => {
      if (t) {
        const normalized = normalizeTreePayload(t);
        if (!normalized) {
          console.warn('[CategoryTreeFilter] Tree payload came back as placeholder root only');
          setFetchError(true);
          setTree(null);
          setLoading(false);
          return;
        }
        console.log('[CategoryTreeFilter] Tree loaded:', {
          rootId: normalized.id,
          rootName: normalized.name,
          rootLevel: normalized.level,
          childrenCount: getNodeChildren(normalized).length,
          children: getNodeChildren(normalized).map((c: CategoryNode) => ({ id: c.id, name: c.name, childrenCount: getNodeChildren(c).length })),
        });
        setTree(normalized);
      } else {
        console.warn('[CategoryTreeFilter] Tree fetch returned null — will use flat list fallback');
        setFetchError(true);
        setTree(null);
      }
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    if (cachedTree) {
      setTree(cachedTree);
      setLoading(false);
      return;
    }
    doFetch(false);
  }, [doFetch]);

  // Log facetCounts para diagnóstico
  useEffect(() => {
    const facetCountSize = Object.keys(facetCounts).length;
    if (facetCountSize === 0) {
      // Não é erro — pode ser indexação em andamento ou produtos sem categorias
      console.log(`[CategoryTreeFilter] facetCounts vazio (facetKey=${facetKey}). Possíveis causas: indexação em andamento, ou produtos sem categorias no MeiliSearch.`);
    } else {
      console.log(`[CategoryTreeFilter] facetCounts: ${facetCountSize} entries (facetKey=${facetKey})`, Object.entries(facetCounts).slice(0, 10));
    }
  }, [facetCounts, facetKey]);

  // Auto-expand ancestors of selected categories
  useEffect(() => {
    if (!tree || selectedValues.length === 0) return;

    const newExpanded = new Set(expandedIds);

    // Walk entire tree to find ancestors of selected nodes
    const expandAncestors = (node: CategoryNode, ancestors: number[]): void => {
      const filterVal = facetKey === 'category_names' ? node.name : String(node.id);
      if (selectedValues.includes(filterVal)) {
        // Expand all ancestors
        for (const ancestorId of ancestors) {
          newExpanded.add(ancestorId);
        }
      }
      for (const child of getNodeChildren(node)) {
        expandAncestors(child, [...ancestors, node.id]);
      }
    };

    expandAncestors(tree, []);

    if (newExpanded.size !== expandedIds.size) {
      setExpandedIds(newExpanded);
    }
  }, [tree, selectedValues, facetKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleExpand = useCallback((id: number) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // ─── Loading state ─────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center gap-2 py-3 px-2">
        <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
        <span className="text-xs text-muted-foreground">Carregando departamentos...</span>
      </div>
    );
  }

  // ─── Fetch error: show retry button ────────────────────────────────────────
  if (fetchError && !tree) {
    const entries = Object.entries(facetCounts).sort((a, b) => b[1] - a[1]);
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2 py-2 px-2">
          <span className="text-xs text-amber-600">Não foi possível carregar a árvore de departamentos.</span>
          <button
            onClick={() => doFetch(true)}
            className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:text-primary/80 transition-colors"
          >
            <RefreshCw className="w-3 h-3" />
            Tentar novamente
          </button>
        </div>
        {/* Fallback: flat list from facet counts */}
        {entries.length > 0 && (
          <div className="space-y-0.5">
            {entries.map(([val, count]) => {
              const isSelected = selectedValues.includes(val);
              return (
                <button
                  key={val}
                  onClick={() => onToggle(val, val)}
                  className={`w-full flex items-center gap-2 py-2 px-3 rounded-lg text-sm transition-all text-left select-none ${
                    isSelected
                      ? 'bg-primary/10 text-primary font-bold'
                      : 'text-foreground/80 active:bg-black/[0.04]'
                  }`}
                >
                  <span className="flex-1 truncate">{val}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // ─── No tree: fallback flat list from facet counts ─────────────────────────
  if (!tree) {
    const entries = Object.entries(facetCounts)
      .sort((a, b) => b[1] - a[1]);

    if (entries.length === 0) {
      return (
        <div className="space-y-1.5 py-2 px-2">
          <p className="text-xs text-muted-foreground italic">Nenhum departamento disponível</p>
          <button
            onClick={() => doFetch(true)}
            className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:text-primary/80 transition-colors"
          >
            <RefreshCw className="w-3 h-3" />
            Tentar novamente
          </button>
        </div>
      );
    }

    return (
      <div className="space-y-0.5">
        {entries.map(([val, count]) => {
          const isSelected = selectedValues.includes(val);
          return (
            <button
              key={val}
              onClick={() => onToggle(val, val)}
              className={`w-full flex items-center gap-2 py-2.5 px-3 rounded-xl text-[15px] sm:text-sm transition-all text-left select-none ${
                isSelected
                  ? 'bg-primary/10 text-primary font-bold shadow-[inset_0_0_0_1px_rgba(var(--primary),0.1)]'
                  : 'text-[#1d1d1f] active:bg-black/[0.04]'
              }`}
            >
              <span className="flex-1 truncate">{val}</span>
            </button>
          );
        })}
      </div>
    );
  }

  // ─── Tree view: render raw tree recursively (same approach as admin TreeNode) ──
  return (
    <CategoryTreeNode
      node={tree}
      facetCounts={facetCounts}
      facetKey={facetKey}
      selectedValues={selectedValues}
      selectedIds={selectedIds}
      onToggle={onToggle}
      depth={0}
      toggleExpand={toggleExpand}
      expandedIds={expandedIds}
    />
  );
}
