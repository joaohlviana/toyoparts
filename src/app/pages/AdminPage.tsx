import React, { useState, useEffect, useCallback } from 'react';
import {
  Loader2,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  FolderTree,
  Package,
  AlertTriangle,
  Eye,
  EyeOff,
  Search,
  Copy,
  Check,
  ArrowUpDown,
} from 'lucide-react';
import { toast } from 'sonner';
import { projectId } from '../../../utils/supabase/info';
import { adminFetch } from '../lib/admin-auth';
import { Button } from '../components/base/button';
import { Input } from '../components/base/input';
import { Badge } from '../components/base/badge';
import { copyToClipboard } from '../utils/clipboard';

const API = `https://${projectId}.supabase.co/functions/v1/make-server-1d6e33e0`;


// ─── Types ──────────────────────────────────────────────────────────────────

interface CategoryNode {
  id: string;
  name: string;
  depth: number;
  path: string;
  productCount: number;
  isActive: boolean;
  childrenCount: number;
  position: number;
}

interface AdminData {
  _admin: string;
  summary: {
    totalCategories: number;
    totalProductsInIndex: number;
    categoriesWithProducts: number;
    categoriesWithoutProducts: number;
    inactiveCategories: number;
    maxDepth: number;
    orphanFacetIds: number;
    facetCategoryIdsCount: number;
    facetCategoryNamesCount: number;
  };
  textTree: string;
  allCategories: CategoryNode[];
  orphanFacetIds: { id: string; count: number }[];
  facetCounts: Record<string, number>;
  facetNameCounts: Record<string, number>;
}

// ─── Stat Card ──────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  sub,
  color = 'text-foreground',
}: {
  label: string;
  value: string | number;
  sub?: string;
  color?: string;
}) {
  return (
    <div className="bg-card border border-border rounded-lg px-4 py-3">
      <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider mb-1">{label}</p>
      <p className={`text-2xl font-bold tabular-nums ${color}`}>{typeof value === 'number' ? value.toLocaleString('pt-BR') : value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}

// ─── Tree Node Component (interactive) ──────────────────────────────────────

interface TreeNodeData {
  id: number;
  name: string;
  is_active?: boolean | number;
  position?: number;
  children_data?: TreeNodeData[];
  children?: TreeNodeData[]; // fallback for old cache format
}

function TreeNode({
  node,
  facetCounts,
  depth,
  searchTerm,
  showEmpty,
  showInactive,
  visibilityMap,
  onToggleVisibility,
}: {
  node: TreeNodeData;
  facetCounts: Record<string, number>;
  depth: number;
  searchTerm: string;
  showEmpty: boolean;
  showInactive: boolean;
  visibilityMap: Record<string, boolean>;
  onToggleVisibility: (id: string) => void;
}) {
  const [open, setOpen] = useState(depth < 2);
  const id = String(node.id);
  const name = node.name || '(sem nome)';
  const count = facetCounts[id] || 0;
  const isActive = node.is_active !== false && node.is_active !== 0;
  const isVisibleInNav = visibilityMap[id] !== false; // default true
  const children = node.children_data || node.children || [];
  const hasChildren = children.length > 0;

  // Compute descendant total
  const computeDescendantCount = useCallback((n: TreeNodeData): number => {
    let total = facetCounts[String(n.id)] || 0;
    for (const child of n.children_data || n.children || []) {
      total += computeDescendantCount(child);
    }
    return total;
  }, [facetCounts]);

  const descendantTotal = computeDescendantCount(node);

  // Filter logic
  if (!showInactive && !isActive) return null;
  if (!showEmpty && count === 0 && descendantTotal === 0 && depth > 1) return null;

  // Search match
  const matchesSearch = searchTerm
    ? name.toLowerCase().includes(searchTerm.toLowerCase()) || id.includes(searchTerm)
    : true;

  const childrenMatchSearch = searchTerm
    ? children.some(function checkMatch(c: TreeNodeData): boolean {
        const cName = c.name || '';
        if (cName.toLowerCase().includes(searchTerm.toLowerCase()) || String(c.id).includes(searchTerm)) return true;
        return (c.children_data || c.children || []).some(checkMatch);
      })
    : false;

  if (searchTerm && !matchesSearch && !childrenMatchSearch) return null;

  // Auto-expand when searching
  const effectiveOpen = searchTerm ? (matchesSearch || childrenMatchSearch) : open;

  // Color coding
  const countColor = count > 100 ? 'text-success' : count > 0 ? 'text-chart-2' : 'text-muted-foreground/40';
  const nameHighlight = searchTerm && matchesSearch ? 'bg-yellow-100 rounded px-0.5' : '';

  return (
    <div className={`${depth > 0 ? 'ml-4' : ''}`}>
      <div
        className={`flex items-center gap-1.5 py-1 px-2 rounded-md hover:bg-muted/60 transition-colors group cursor-pointer ${
          !isActive ? 'opacity-50' : ''
        }`}
        onClick={() => setOpen(!open)}
      >
        {/* Expand/Collapse */}
        <div className="w-4 h-4 flex items-center justify-center flex-shrink-0">
          {hasChildren ? (
            effectiveOpen ? (
              <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
            )
          ) : (
            <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground/20" />
          )}
        </div>

        {/* ID badge */}
        <span className="text-[10px] font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded flex-shrink-0">
          {id}
        </span>

        {/* Name */}
        <span className={`text-sm font-medium text-foreground truncate ${nameHighlight}`}>
          {name}
        </span>

        {/* Inactive badge */}
        {!isActive && (
          <Badge variant="pill-color" color="warning" size="xs" className="flex-shrink-0">
            Inativa
          </Badge>
        )}
        
        {/* Visibility Toggle */}
        <button 
          onClick={(e) => { e.stopPropagation(); onToggleVisibility(id); }}
          className={`p-1 rounded hover:bg-muted/80 transition-colors flex-shrink-0 ${
            isVisibleInNav ? 'text-primary/70 hover:text-primary' : 'text-muted-foreground/50 hover:text-muted-foreground'
          }`}
          title={isVisibleInNav ? 'Visível no menu' : 'Oculto no menu'}
        >
          {isVisibleInNav ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
        </button>

        {/* Product count */}
        <span className={`text-xs font-semibold tabular-nums ml-auto flex-shrink-0 ${countColor}`}>
          {count > 0 ? count.toLocaleString('pt-BR') : '0'}
        </span>

        {/* Descendants indicator */}
        {hasChildren && descendantTotal > count && (
          <span className="text-[10px] text-muted-foreground/60 tabular-nums flex-shrink-0" title="Total incluindo subcategorias">
            ({descendantTotal.toLocaleString('pt-BR')} total)
          </span>
        )}
      </div>

      {/* Children */}
      {effectiveOpen && hasChildren && (
        <div className="border-l border-border/40 ml-[7px]">
          {children.map((child: TreeNodeData) => (
            <TreeNode
              key={child.id}
              node={child}
              facetCounts={facetCounts}
              depth={depth + 1}
              searchTerm={searchTerm}
              showEmpty={showEmpty}
              showInactive={showInactive}
              visibilityMap={visibilityMap}
              onToggleVisibility={onToggleVisibility}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main Admin Page ──────────────────────────────────────────────────��─────

export function AdminPage() {
  const [data, setData] = useState<AdminData | null>(null);
  const [rawTree, setRawTree] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [showEmpty, setShowEmpty] = useState(true);
  const [showInactive, setShowInactive] = useState(true);
  const [viewMode, setViewMode] = useState<'interactive' | 'text' | 'table'>('interactive');
  const [tableSortBy, setTableSortBy] = useState<'depth' | 'count' | 'name'>('depth');
  const [tableSortDir, setTableSortDir] = useState<'asc' | 'desc'>('asc');
  const [copied, setCopied] = useState(false);
  
  // Visibility map: { "id": false } means hidden
  const [visibilityMap, setVisibilityMap] = useState<Record<string, boolean>>({});

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      // Fetch both in parallel
      const [treeRes, adminRes, visibilityRes] = await Promise.all([
        adminFetch(`${API}/categories/tree?all=true`),
        adminFetch(`${API}/admin/categories/full-tree`),
        adminFetch(`${API}/categories/visibility`),
      ]);

      if (!adminRes.ok) {
        const err = await adminRes.text();
        throw new Error(`Admin endpoint: HTTP ${adminRes.status} - ${err}`);
      }

      const adminData: AdminData = await adminRes.json();
      setData(adminData);

      if (treeRes.ok) {
        const tree = await treeRes.json();
        setRawTree(tree);
      }
      
      if (visibilityRes.ok) {
        setVisibilityMap(await visibilityRes.json());
      }

      console.log('[ADMIN] Data loaded:', adminData.summary);
    } catch (e: any) {
      console.error('[ADMIN] Error:', e);
      setError(e.message);
      toast.error('Erro ao carregar dados de categorias');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const toggleVisibility = useCallback(async (id: string) => {
    // Default is visible (true). If it's missing from map, it's visible.
    // If it's explicitly false, it's hidden.
    const currentlyHidden = visibilityMap[id] === false;
    const newMap = { ...visibilityMap, [id]: currentlyHidden }; // toggle: if hidden->true (remove false?), wait.
    // Logic: 
    // If hidden (false), set to true (or delete key).
    // If visible (true/undef), set to false.
    
    // Simpler:
    // If map[id] === false, then it is HIDDEN.
    // We want to TOGGLE.
    // New value should be !currentlyHidden.
    // But wait, if I set it to `true`, it means "visible".
    // My backend logic: `if (visibility[String(node.id)] === false) return null;`
    // So `true` or `undefined` means visible.
    
    const nextStateIsVisible = currentlyHidden; // If it was hidden, now we want it visible
    
    // Optimistic
    setVisibilityMap(prev => ({ ...prev, [id]: nextStateIsVisible }));

    try {
      // We must send the NEW full map or just the patch?
      // Backend: `await kv.set('meta:category_visibility', body);` -> Replaces everything!
      // So we must send the full map.
      // Ideally we should use a PATCH or merge, but KV set replaces.
      // So we must use the latest state.
      
      const payload = { ...visibilityMap, [id]: nextStateIsVisible };
      // Clean up: if true, maybe remove the key to save space?
      if (nextStateIsVisible) {
        delete payload[id];
      } else {
        payload[id] = false;
      }
      
      await adminFetch(`${API}/categories/visibility`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      toast.success(nextStateIsVisible ? 'Categoria visível' : 'Categoria oculta');
    } catch (e) {
      toast.error('Erro ao salvar visibilidade');
      setVisibilityMap(prev => ({ ...prev, [id]: !nextStateIsVisible }));
    }
  }, [visibilityMap]);

  const handleCopyTextTree = useCallback(() => {
    if (!data?.textTree) return;
    copyToClipboard(data.textTree).then(() => {
      setCopied(true);
      toast.success('Arvore copiada!');
      setTimeout(() => setCopied(false), 2000);
    });
  }, [data]);

  const toggleTableSort = (col: 'depth' | 'count' | 'name') => {
    if (tableSortBy === col) {
      setTableSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setTableSortBy(col);
      setTableSortDir(col === 'count' ? 'desc' : 'asc');
    }
  };

  // ── Filtered & Sorted table data ──
  const tableData = data?.allCategories
    ?.filter(c => {
      if (!showInactive && !c.isActive) return false;
      if (!showEmpty && c.productCount === 0 && c.depth > 1) return false;
      if (searchTerm) {
        return (
          c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          c.id.includes(searchTerm) ||
          c.path.toLowerCase().includes(searchTerm.toLowerCase())
        );
      }
      return true;
    })
    ?.sort((a, b) => {
      const dir = tableSortDir === 'asc' ? 1 : -1;
      if (tableSortBy === 'count') return (a.productCount - b.productCount) * dir;
      if (tableSortBy === 'name') return a.name.localeCompare(b.name) * dir;
      // depth (default) — use original order from tree
      return 0; // allCategories is already in tree order
    }) || [];

  // ─── Render ───

  return (
    <div className="max-w-[1280px] mx-auto px-4 lg:px-6 pt-6 pb-12">
      {/* ── Header ── */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <FolderTree className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">Admin - Arvore de Categorias</h1>
            <p className="text-sm text-muted-foreground">
              Todas as categorias do Magento com contagem de produtos do MeiliSearch
            </p>
          </div>
        </div>
        <Button
          color="primary"
          size="md"
          onClick={fetchData}
          disabled={loading}
          iconLeading={<RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />}
        >
          Recarregar
        </Button>
      </div>

      {/* ── Error ── */}
      {error && (
        <div className="mb-6 p-4 bg-destructive/10 border border-destructive/20 rounded-lg flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-destructive">Erro ao carregar</p>
            <p className="text-sm text-muted-foreground mt-0.5">{error}</p>
          </div>
        </div>
      )}

      {/* ── Loading ── */}
      {loading && !data && (
        <div className="flex flex-col items-center justify-center py-24 text-muted-foreground">
          <Loader2 className="w-8 h-8 animate-spin mb-3 text-primary" />
          <span className="text-sm font-medium">Carregando arvore de categorias...</span>
          <span className="text-xs text-muted-foreground mt-1">Buscando Magento + MeiliSearch</span>
        </div>
      )}

      {data && (
        <>
          {/* ── Summary Stats ── */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
            <StatCard
              label="Total Categorias"
              value={data.summary.totalCategories}
              sub={`Profundidade max: ${data.summary.maxDepth}`}
            />
            <StatCard
              label="Produtos no Index"
              value={data.summary.totalProductsInIndex}
              color="text-success"
            />
            <StatCard
              label="Com Produtos"
              value={data.summary.categoriesWithProducts}
              sub={`de ${data.summary.totalCategories} categorias`}
              color="text-chart-2"
            />
            <StatCard
              label="Sem Produtos"
              value={data.summary.categoriesWithoutProducts}
              sub="depth > 1"
              color="text-warning"
            />
            <StatCard
              label="Inativas"
              value={data.summary.inactiveCategories}
              sub={data.summary.orphanFacetIds > 0 ? `${data.summary.orphanFacetIds} orfas` : undefined}
              color="text-destructive"
            />
          </div>

          {/* ── Controls ── */}
          <div className="flex items-center gap-3 mb-4 flex-wrap bg-card border border-border rounded-lg px-4 py-3">
            {/* Search */}
            <div className="flex-1 min-w-[200px]">
              <Input
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                placeholder="Buscar por nome ou ID..."
                iconLeading={Search}
              />
            </div>

            {/* Toggles */}
            <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer select-none">
              <input
                type="checkbox"
                checked={showEmpty}
                onChange={e => setShowEmpty(e.target.checked)}
                className="accent-primary"
              />
              Vazias
            </label>
            <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer select-none">
              <input
                type="checkbox"
                checked={showInactive}
                onChange={e => setShowInactive(e.target.checked)}
                className="accent-primary"
              />
              Inativas
            </label>

            {/* Divider */}
            <div className="w-px h-6 bg-border" />

            {/* View mode buttons */}
            <div className="flex items-center gap-1 bg-muted rounded-lg p-0.5">
              {(['interactive', 'text', 'table'] as const).map(mode => (
                <button
                  key={mode}
                  onClick={() => setViewMode(mode)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                    viewMode === mode
                      ? 'bg-card text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {mode === 'interactive' ? 'Arvore' : mode === 'text' ? 'Texto' : 'Tabela'}
                </button>
              ))}
            </div>

            {/* Copy text tree */}
            {viewMode === 'text' && (
              <button
                onClick={handleCopyTextTree}
                className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-success" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? 'Copiado!' : 'Copiar'}
              </button>
            )}
          </div>

          {/* ── Interactive Tree View ── */}
          {viewMode === 'interactive' && rawTree && (
            <div className="bg-card border border-border rounded-lg overflow-hidden">
              <div className="px-4 py-2.5 bg-muted/50 border-b border-border flex items-center justify-between">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Arvore Hierarquica
                </span>
                <span className="text-xs text-muted-foreground">
                  {data.summary.totalCategories} categorias
                  {loading && <Loader2 className="w-3 h-3 inline ml-1 animate-spin" />}
                </span>
              </div>
              <div className="p-3 max-h-[70vh] overflow-y-auto font-mono text-[13px] leading-relaxed custom-scrollbar">
                <div className="mb-2 px-1 text-[11px] text-muted-foreground/60 border-b border-border/40 pb-2 flex gap-1.5 items-center">
                   ℹ️ <span>Exibindo estrutura do banco. No site, categorias com <strong>0 produtos</strong> são ocultas.</span>
                </div>
                <TreeNode
                  node={rawTree}
                  facetCounts={data.facetCounts}
                  depth={0}
                  searchTerm={searchTerm}
                  showEmpty={showEmpty}
                  showInactive={showInactive}
                  visibilityMap={visibilityMap}
                  onToggleVisibility={toggleVisibility}
                />
              </div>
            </div>
          )}

          {/* ── Text Tree View ── */}
          {viewMode === 'text' && (
            <div className="bg-card border border-border rounded-lg overflow-hidden">
              <div className="px-4 py-2.5 bg-muted/50 border-b border-border flex items-center justify-between">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Arvore em Texto
                </span>
              </div>
              <pre className="p-4 max-h-[70vh] overflow-auto text-xs font-mono text-foreground leading-relaxed whitespace-pre bg-slate-950 text-emerald-400 custom-scrollbar">
                {data.textTree}
              </pre>
            </div>
          )}

          {/* ── Table View ── */}
          {viewMode === 'table' && (
            <div className="bg-card border border-border rounded-lg overflow-hidden">
              <div className="px-4 py-2.5 bg-muted/50 border-b border-border flex items-center justify-between">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Tabela de Categorias
                </span>
                <span className="text-xs text-muted-foreground">
                  {tableData.length} de {data.summary.totalCategories}
                </span>
              </div>
              <div className="max-h-[70vh] overflow-auto custom-scrollbar">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-muted/80 backdrop-blur-sm z-10">
                    <tr className="border-b border-border">
                      <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider w-16">
                        ID
                      </th>
                      <th
                        className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider cursor-pointer hover:text-foreground select-none"
                        onClick={() => toggleTableSort('name')}
                      >
                        <span className="flex items-center gap-1">
                          Nome
                          <ArrowUpDown className="w-3 h-3" />
                        </span>
                      </th>
                      <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden lg:table-cell">
                        Caminho
                      </th>
                      <th className="text-center px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider w-16">
                        Depth
                      </th>
                      <th
                        className="text-right px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider cursor-pointer hover:text-foreground select-none w-28"
                        onClick={() => toggleTableSort('count')}
                      >
                        <span className="flex items-center justify-end gap-1">
                          Produtos
                          <ArrowUpDown className="w-3 h-3" />
                        </span>
                      </th>
                      <th className="text-center px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider w-20">
                        Status
                      </th>
                      <th className="text-center px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider w-20">
                        Menu
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {tableData.map((cat, idx) => {
                      const countColor = cat.productCount > 100
                        ? 'text-success font-bold'
                        : cat.productCount > 0
                        ? 'text-chart-2 font-semibold'
                        : 'text-muted-foreground/40';
                      const isVisible = visibilityMap[cat.id] !== false;

                      return (
                        <tr
                          key={`${cat.id}-${idx}`}
                          className={`border-b border-border/50 hover:bg-muted/30 transition-colors ${
                            !cat.isActive ? 'opacity-50' : ''
                          }`}
                        >
                          <td className="px-4 py-2 text-xs font-mono text-muted-foreground">{cat.id}</td>
                          <td className="px-4 py-2">
                            <span
                              className="font-medium text-foreground"
                              style={{ paddingLeft: `${Math.max(0, (cat.depth - 1) * 16)}px` }}
                            >
                              {cat.depth > 1 && (
                                <span className="text-muted-foreground/30 mr-1.5">
                                  {'─'.repeat(Math.min(cat.depth - 1, 4))}{' '}
                                </span>
                              )}
                              {cat.name}
                            </span>
                          </td>
                          <td className="px-4 py-2 text-xs text-muted-foreground truncate max-w-[300px] hidden lg:table-cell">
                            {cat.path}
                          </td>
                          <td className="px-4 py-2 text-center text-xs text-muted-foreground tabular-nums">
                            {cat.depth}
                          </td>
                          <td className={`px-4 py-2 text-right tabular-nums text-sm ${countColor}`}>
                            {cat.productCount.toLocaleString('pt-BR')}
                          </td>
                          <td className="px-4 py-2 text-center">
                            {cat.isActive ? (
                              <Badge variant="pill-color" color="success" size="xs">
                                Ativa
                              </Badge>
                            ) : (
                              <Badge variant="pill-color" color="warning" size="xs">
                                Inativa
                              </Badge>
                            )}
                          </td>
                          <td className="px-4 py-2 text-center">
                            <button
                              onClick={() => toggleVisibility(cat.id)}
                              className={`p-1.5 rounded hover:bg-muted transition-colors ${
                                isVisible ? 'text-primary' : 'text-muted-foreground opacity-50'
                              }`}
                              title={isVisible ? 'Ocultar do menu' : 'Mostrar no menu'}
                            >
                              {isVisible ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── Orphan Category IDs ── */}
          {data.orphanFacetIds.length > 0 && (
            <div className="mt-6 bg-card border border-warning/30 rounded-lg overflow-hidden">
              <div className="px-4 py-2.5 bg-warning/10 border-b border-warning/30 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-warning" />
                <span className="text-xs font-semibold text-warning uppercase tracking-wider">
                  IDs Orfaos no MeiliSearch ({data.orphanFacetIds.length})
                </span>
                <span className="text-xs text-warning/80 ml-auto">
                  IDs com produtos no index mas ausentes na arvore do Magento
                </span>
              </div>
              <div className="p-4 max-h-48 overflow-auto">
                <div className="flex flex-wrap gap-2">
                  {data.orphanFacetIds.map(o => (
                    <span
                      key={o.id}
                      className="inline-flex items-center gap-1.5 text-xs font-mono bg-warning/10 border border-warning/30 text-warning px-2.5 py-1 rounded-md"
                    >
                      <span className="font-semibold">{o.id}</span>
                      <span className="text-warning/70">({o.count})</span>
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── Category Names from MeiliSearch ── */}
          {data.facetNameCounts && Object.keys(data.facetNameCounts).length > 0 && (
            <div className="mt-6 bg-card border border-border rounded-lg overflow-hidden">
              <div className="px-4 py-2.5 bg-muted/50 border-b border-border flex items-center justify-between">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  category_names no MeiliSearch ({Object.keys(data.facetNameCounts).length})
                </span>
                <span className="text-xs text-muted-foreground">
                  Nomes resolvidos durante indexacao
                </span>
              </div>
              <div className="p-4 max-h-64 overflow-auto custom-scrollbar">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1">
                  {Object.entries(data.facetNameCounts).map(([name, count]) => (
                    <div
                      key={name}
                      className="flex items-center justify-between px-3 py-1.5 rounded-md hover:bg-muted/50 transition-colors"
                    >
                      <span className="text-sm text-foreground truncate">{name}</span>
                      <span className={`text-xs font-semibold tabular-nums ml-2 flex-shrink-0 ${
                        count > 100 ? 'text-success' : count > 0 ? 'text-chart-2' : 'text-muted-foreground/40'
                      }`}>
                        {count.toLocaleString('pt-BR')}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </>
      )}

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 6px; height: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #d1d5db; border-radius: 3px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #9ca3af; }
      `}</style>
    </div>
  );
}