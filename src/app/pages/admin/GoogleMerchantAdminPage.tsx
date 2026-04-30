import React, { useEffect, useMemo, useState } from 'react';
import {
  Download,
  FileSpreadsheet,
  Filter,
  History,
  ImageIcon,
  Loader2,
  Package,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { projectId } from '../../../../utils/supabase/info';
import { adminFetch } from '../../lib/admin-auth';
import { Card } from '../../components/base/card';
import { Button } from '../../components/base/button';
import { Input } from '../../components/base/input';
import { Badge } from '../../components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs';

const API = `https://${projectId}.supabase.co/functions/v1/make-server-1d6e33e0/admin/google-merchant`;

type MerchantGenerationMode = 'filters_only' | 'skus_only' | 'combined';

interface MerchantDefaults {
  brand: string;
  google_product_category: string;
  shipping_weight: string;
  sale_price_effective_date: string;
  shipping_label: string;
  condition: string;
  adult: string;
  only_in_stock: boolean;
}

interface SearchProduct {
  sku: string;
  name: string;
  price: number;
  special_price: number | null;
  in_stock: boolean;
  image_url: string | null;
}

interface FeedRow {
  id: string;
  title: string;
  description: string;
  link: string;
  image_link: string;
  availability: string;
  price: string;
  sale_price: string;
  condition: string;
  adult: string;
  brand: string;
  google_product_category: string;
  shipping_weight: string;
  sale_price_effective_date: string;
  shipping_label: string;
}

interface FeedSummary {
  total_rows: number;
  price_filtered: number;
  manual_selected: number;
  manual_missing: number;
  skipped: number;
}

interface HistoryRecordSummary {
  id: string;
  key: string;
  name: string;
  mode: MerchantGenerationMode;
  created_at: string;
  filters: {
    minPrice: number | null;
    maxPrice: number | null;
  };
  selected_skus_count: number;
  settings: MerchantDefaults;
  summary: FeedSummary;
  missing_manual_skus: string[];
  skipped: Array<{ sku: string; reason: string }>;
  rows_preview: FeedRow[];
}

interface HistoryRecordDetail extends Omit<HistoryRecordSummary, 'selected_skus_count'> {
  selected_skus: string[];
  csv: string;
}

interface FeedResponse {
  ok: boolean;
  mode: MerchantGenerationMode;
  settings: MerchantDefaults;
  summary: FeedSummary;
  missing_manual_skus: string[];
  skipped: Array<{ sku: string; reason: string }>;
  rows: FeedRow[];
  csv: string;
  history_record: HistoryRecordSummary | null;
}

interface GeneratedState extends FeedResponse {
  name: string;
}

function formatMoney(value: number | null | undefined) {
  return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return 'Agora';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('pt-BR');
}

function modeLabel(mode: MerchantGenerationMode) {
  if (mode === 'filters_only') return 'Somente filtros';
  if (mode === 'skus_only') return 'Somente SKUs';
  return 'Filtros + SKUs';
}

function slugifyFileName(value: string) {
  const base = String(value || 'merchant-feed')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

  return base || 'merchant-feed';
}

function csvDownload(csv: string, fileName: string) {
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${slugifyFileName(fileName)}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function parseBulkSkus(value: string) {
  return Array.from(
    new Set(
      String(value || '')
        .split(/[\r\n,;]+/g)
        .map((line) => line.trim().toUpperCase())
        .filter(Boolean),
    ),
  );
}

function buildPlaceholderProducts(skus: string[]): SearchProduct[] {
  return skus.map((sku) => ({
    sku,
    name: 'SKU adicionado manualmente',
    price: 0,
    special_price: null,
    in_stock: true,
    image_url: null,
  }));
}

function summarizeHistoryRecordClient(record: HistoryRecordDetail): HistoryRecordSummary {
  return {
    id: record.id,
    key: record.key,
    name: record.name,
    mode: record.mode,
    created_at: record.created_at,
    filters: record.filters,
    selected_skus_count: record.selected_skus.length,
    settings: record.settings,
    summary: record.summary,
    missing_manual_skus: record.missing_manual_skus,
    skipped: record.skipped,
    rows_preview: record.rows_preview,
  };
}

function StatCard({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: React.ReactNode;
  tone?: 'default' | 'amber' | 'emerald';
}) {
  const toneClass =
    tone === 'amber'
      ? 'border-amber-200 bg-amber-50'
      : tone === 'emerald'
        ? 'border-emerald-200 bg-emerald-50'
        : 'border-border bg-card';

  return (
    <div className={`rounded-xl border p-4 ${toneClass}`}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
      <p className="mt-2 text-2xl font-bold tracking-tight text-foreground">{value}</p>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-2">
      <label className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">{label}</label>
      <Input value={value} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}

function ModeBadge({ mode }: { mode: MerchantGenerationMode }) {
  const variant = mode === 'filters_only' ? 'outline' : mode === 'skus_only' ? 'secondary' : 'default';
  return <Badge variant={variant}>{modeLabel(mode)}</Badge>;
}

function FilterModeFields({
  minPrice,
  maxPrice,
  setMinPrice,
  setMaxPrice,
}: {
  minPrice: string;
  maxPrice: string;
  setMinPrice: (value: string) => void;
  setMaxPrice: (value: string) => void;
}) {
  return (
    <div className="rounded-2xl border border-border bg-muted/20 p-4">
      <div className="flex items-start gap-3">
        <Filter className="mt-0.5 h-4 w-4 text-muted-foreground" />
        <div>
          <h3 className="text-sm font-semibold text-foreground">Faixa de preco</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Use minimo e maximo para montar um lote por valor, sem depender de SKU manual.
          </p>
        </div>
      </div>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <label className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Preco minimo</label>
          <Input value={minPrice} onChange={(event) => setMinPrice(event.target.value)} placeholder="Ex.: 100" />
        </div>
        <div className="space-y-2">
          <label className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Preco maximo</label>
          <Input value={maxPrice} onChange={(event) => setMaxPrice(event.target.value)} placeholder="Ex.: 5000" />
        </div>
      </div>
    </div>
  );
}

function SkuModeFields({
  bulkSkuText,
  setBulkSkuText,
  addBulkSkus,
  searchQuery,
  setSearchQuery,
  searching,
  searchResults,
  addProduct,
  selectedProducts,
  removeProduct,
  clearSkuList,
}: {
  bulkSkuText: string;
  setBulkSkuText: (value: string) => void;
  addBulkSkus: () => void;
  searchQuery: string;
  setSearchQuery: (value: string) => void;
  searching: boolean;
  searchResults: SearchProduct[];
  addProduct: (product: SearchProduct) => void;
  selectedProducts: SearchProduct[];
  removeProduct: (sku: string) => void;
  clearSkuList: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="space-y-3 rounded-2xl border border-border bg-muted/20 p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Colar SKUs em massa</h3>
            <p className="text-xs text-muted-foreground">Cole 1 SKU por linha para adicionar varios produtos de uma vez.</p>
          </div>
          <Button color="secondary" size="sm" onClick={addBulkSkus} disabled={!bulkSkuText.trim()}>
            <Plus className="h-4 w-4" />
            Adicionar em massa
          </Button>
        </div>

        <textarea
          value={bulkSkuText}
          onChange={(event) => setBulkSkuText(event.target.value)}
          placeholder={`2367039475\n2368230020\n8987120080`}
          rows={7}
          className="w-full rounded-xl border border-border bg-background px-3 py-3 font-mono text-sm outline-none transition focus:border-primary/40 focus:ring-4 focus:ring-primary/10"
        />
      </div>

      <div className="space-y-3 rounded-2xl border border-border bg-muted/20 p-4">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Buscar e adicionar</h3>
          <p className="text-xs text-muted-foreground">Busque por SKU ou nome para completar a lista manual.</p>
        </div>

        <Input
          iconLeading={Search}
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder="Digite SKU ou nome do produto"
        />

        <div className="rounded-xl border border-border bg-background">
          {searching ? (
            <div className="flex items-center justify-center gap-2 px-4 py-6 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Buscando produtos...
            </div>
          ) : searchResults.length > 0 ? (
            <div className="max-h-80 divide-y divide-border overflow-y-auto">
              {searchResults.map((product) => (
                <div key={product.sku} className="flex items-center gap-3 px-4 py-3">
                  <div className="h-14 w-14 overflow-hidden rounded-lg border border-border bg-muted">
                    {product.image_url ? (
                      <img src={product.image_url} alt={product.name} className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                        <ImageIcon className="h-4 w-4" />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-foreground">{product.name}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span className="font-mono">{product.sku}</span>
                      <span>{formatMoney(product.special_price || product.price)}</span>
                      <Badge variant={product.in_stock ? 'secondary' : 'outline'}>
                        {product.in_stock ? 'Em estoque' : 'Sem estoque'}
                      </Badge>
                    </div>
                  </div>
                  <Button color="secondary" size="sm" onClick={() => addProduct(product)}>
                    <Plus className="h-4 w-4" />
                    Add
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <div className="px-4 py-6 text-sm text-muted-foreground">
              {searchQuery.trim().length < 2 ? 'Digite ao menos 2 caracteres para buscar.' : 'Nenhum produto encontrado.'}
            </div>
          )}
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-foreground">SKUs selecionados</h3>
          {selectedProducts.length > 0 ? (
            <button className="text-xs font-medium text-muted-foreground hover:text-foreground" onClick={clearSkuList}>
              Limpar lista
            </button>
          ) : null}
        </div>

        {selectedProducts.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {selectedProducts.map((product) => (
              <div key={product.sku} className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-3 py-1.5 text-xs">
                <span className="font-mono font-semibold text-foreground">{product.sku}</span>
                <span className="max-w-[200px] truncate text-muted-foreground">{product.name}</span>
                <button onClick={() => removeProduct(product.sku)} className="text-muted-foreground hover:text-foreground">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-border px-4 py-5 text-sm text-muted-foreground">
            Nenhum SKU adicionado manualmente ainda.
          </div>
        )}
      </div>
    </div>
  );
}

export function GoogleMerchantAdminPage() {
  const [defaults, setDefaults] = useState<MerchantDefaults | null>(null);
  const [settings, setSettings] = useState<MerchantDefaults | null>(null);
  const [loadingDefaults, setLoadingDefaults] = useState(true);
  const [loadingHistory, setLoadingHistory] = useState(true);

  const [mode, setMode] = useState<MerchantGenerationMode>('combined');
  const [feedName, setFeedName] = useState('');
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchProduct[]>([]);
  const [selectedProducts, setSelectedProducts] = useState<SearchProduct[]>([]);
  const [bulkSkuText, setBulkSkuText] = useState('');

  const [generating, setGenerating] = useState(false);
  const [generated, setGenerated] = useState<GeneratedState | null>(null);
  const [history, setHistory] = useState<HistoryRecordSummary[]>([]);
  const [historyBusyId, setHistoryBusyId] = useState<string | null>(null);
  const [openedHistoryId, setOpenedHistoryId] = useState<string | null>(null);

  const selectedSkus = useMemo(() => selectedProducts.map((product) => product.sku), [selectedProducts]);
  const previewRows = useMemo(() => generated?.rows?.slice(0, 20) || [], [generated]);
  const canUseSkus = mode === 'skus_only' || mode === 'combined';
  const lastHistory = history[0] || null;

  const loadDefaults = async () => {
    setLoadingDefaults(true);
    try {
      const response = await adminFetch(`${API}/defaults`);
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || 'Falha ao carregar padroes do Merchant.');
      setDefaults(payload.settings);
      setSettings(payload.settings);
    } catch (error: any) {
      toast.error(error?.message || 'Falha ao carregar padroes do Merchant.');
    } finally {
      setLoadingDefaults(false);
    }
  };

  const loadHistory = async () => {
    setLoadingHistory(true);
    try {
      const response = await adminFetch(`${API}/history`);
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || 'Falha ao carregar historico do Merchant.');
      setHistory(Array.isArray(payload?.history) ? payload.history : []);
    } catch (error: any) {
      toast.error(error?.message || 'Falha ao carregar historico do Merchant.');
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    void loadDefaults();
    void loadHistory();
  }, []);

  useEffect(() => {
    const query = searchQuery.trim();
    if (!canUseSkus || query.length < 2) {
      setSearchResults([]);
      setSearching(false);
      return;
    }

    let active = true;
    setSearching(true);
    const timer = window.setTimeout(async () => {
      try {
        const response = await adminFetch(`${API}/search-products?q=${encodeURIComponent(query)}`);
        const payload = await response.json().catch(() => null);
        if (!response.ok) throw new Error(payload?.error || 'Falha ao buscar produtos.');
        if (!active) return;
        setSearchResults(Array.isArray(payload?.products) ? payload.products : []);
      } catch (error: any) {
        if (!active) return;
        setSearchResults([]);
        toast.error(error?.message || 'Falha ao buscar produtos.');
      } finally {
        if (active) setSearching(false);
      }
    }, 280);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [canUseSkus, searchQuery]);

  const addProduct = (product: SearchProduct) => {
    setSelectedProducts((current) => {
      if (current.some((item) => item.sku === product.sku)) return current;
      return [...current, product];
    });
    setSearchQuery('');
    setSearchResults([]);
  };

  const removeProduct = (sku: string) => {
    setSelectedProducts((current) => current.filter((item) => item.sku !== sku));
  };

  const addBulkSkus = () => {
    const parsedSkus = parseBulkSkus(bulkSkuText);
    if (!parsedSkus.length) {
      toast.error('Cole pelo menos um SKU por linha.');
      return;
    }

    let addedCount = 0;
    setSelectedProducts((current) => {
      const existing = new Set(current.map((item) => item.sku));
      const additions = buildPlaceholderProducts(parsedSkus.filter((sku) => !existing.has(sku)));
      addedCount = additions.length;
      return [...current, ...additions];
    });

    setBulkSkuText('');
    toast.success(addedCount > 0 ? `${addedCount} SKU(s) adicionados em massa.` : 'Todos os SKUs colados ja estavam na lista.');
  };

  const resetDefaults = () => {
    if (!defaults) return;
    setSettings(defaults);
  };

  const clearSkuList = () => {
    setSelectedProducts([]);
    setBulkSkuText('');
    setSearchQuery('');
    setSearchResults([]);
  };

  const generateFeed = async (downloadAfter = false) => {
    if (!settings) return;
    setGenerating(true);
    try {
      const response = await adminFetch(`${API}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode,
          name: feedName.trim(),
          minPrice,
          maxPrice,
          selectedSkus,
          settings,
          saveToHistory: true,
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.ok) throw new Error(payload?.error || 'Falha ao gerar feed do Merchant.');

      const finalName = String(payload?.history_record?.name || feedName || modeLabel(mode)).trim();
      setGenerated({ ...payload, name: finalName });
      setOpenedHistoryId(payload?.history_record?.id || null);
      toast.success(`${payload.summary.total_rows} item(ns) preparados para o Merchant.`);
      await loadHistory();
      if (downloadAfter) csvDownload(payload.csv, finalName);
    } catch (error: any) {
      toast.error(error?.message || 'Falha ao gerar feed do Merchant.');
    } finally {
      setGenerating(false);
    }
  };

  const openHistoryItem = async (id: string) => {
    setHistoryBusyId(id);
    try {
      const response = await adminFetch(`${API}/history/${encodeURIComponent(id)}`);
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.record) throw new Error(payload?.error || 'Falha ao abrir arquivo do historico.');
      const record = payload.record as HistoryRecordDetail;
      setGenerated({
        ok: true,
        mode: record.mode,
        settings: record.settings,
        summary: record.summary,
        missing_manual_skus: record.missing_manual_skus,
        skipped: record.skipped,
        rows: record.rows_preview,
        csv: record.csv,
        history_record: summarizeHistoryRecordClient(record),
        name: record.name,
      });
      setOpenedHistoryId(record.id);
      toast.success('Arquivo carregado do historico.');
    } catch (error: any) {
      toast.error(error?.message || 'Falha ao abrir arquivo do historico.');
    } finally {
      setHistoryBusyId(null);
    }
  };

  const downloadHistoryItem = async (id: string) => {
    setHistoryBusyId(id);
    try {
      const response = await adminFetch(`${API}/history/${encodeURIComponent(id)}`);
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.record) throw new Error(payload?.error || 'Falha ao baixar arquivo do historico.');
      const record = payload.record as HistoryRecordDetail;
      csvDownload(record.csv, record.name);
    } catch (error: any) {
      toast.error(error?.message || 'Falha ao baixar arquivo do historico.');
    } finally {
      setHistoryBusyId(null);
    }
  };

  const deleteHistoryItem = async (id: string) => {
    setHistoryBusyId(id);
    try {
      const response = await adminFetch(`${API}/history/${encodeURIComponent(id)}`, { method: 'DELETE' });
      const payload = await response.json().catch(() => null);
      if (!response.ok || payload?.ok !== true) throw new Error(payload?.error || 'Falha ao remover arquivo do historico.');
      setHistory((current) => current.filter((item) => item.id !== id));
      if (openedHistoryId === id) setOpenedHistoryId(null);
      toast.success('Arquivo removido do historico.');
    } catch (error: any) {
      toast.error(error?.message || 'Falha ao remover arquivo do historico.');
    } finally {
      setHistoryBusyId(null);
    }
  };

  return (
    <div className="mx-auto max-w-[1360px] space-y-6 px-4 pb-12 pt-6 lg:px-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground">
            <FileSpreadsheet className="h-6 w-6" />
            Google Merchant
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Gere varios CSVs para o Google Sheets, usando somente filtros, somente SKUs em massa ou os dois juntos.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button color="secondary" size="sm" onClick={resetDefaults} disabled={!defaults || generating}>
            <RefreshCw className="h-4 w-4" />
            Restaurar padroes
          </Button>
          <Button color="secondary" size="sm" onClick={() => void loadHistory()} disabled={loadingHistory || generating}>
            {loadingHistory ? <Loader2 className="h-4 w-4 animate-spin" /> : <History className="h-4 w-4" />}
            Atualizar historico
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Modo atual" value={modeLabel(mode)} />
        <StatCard label="SKUs na lista" value={selectedProducts.length} />
        <StatCard label="CSVs salvos" value={history.length} tone="emerald" />
        <StatCard label="Ultimo arquivo" value={lastHistory?.summary.total_rows ?? '—'} tone="amber" />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <Card.Root>
          <Card.Header>
            <Card.Title className="text-base">Gerar novo arquivo</Card.Title>
            <Card.Description>
              Escolha um modo de geracao e monte o CSV do jeito que fizer mais sentido para essa rodada.
            </Card.Description>
          </Card.Header>
          <Card.Content className="space-y-6">
            <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Nome do arquivo</label>
                <Input
                  value={feedName}
                  onChange={(event) => setFeedName(event.target.value)}
                  placeholder="Ex.: Hilux premium abril / Ofertas acima de 500"
                />
              </div>
              <div className="rounded-xl border border-border bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
                <p className="font-semibold text-foreground">Como isso salva no historico</p>
                <p className="mt-1">
                  Cada geracao fica guardada com nome, filtros, SKUs usados e o CSV final para download posterior.
                </p>
              </div>
            </div>

            <Tabs value={mode} onValueChange={(value) => setMode(value as MerchantGenerationMode)}>
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="filters_only">Somente filtros</TabsTrigger>
                <TabsTrigger value="skus_only">Somente SKUs</TabsTrigger>
                <TabsTrigger value="combined">Filtros + SKUs</TabsTrigger>
              </TabsList>

              <TabsContent value="filters_only" className="space-y-6">
                <FilterModeFields minPrice={minPrice} maxPrice={maxPrice} setMinPrice={setMinPrice} setMaxPrice={setMaxPrice} />
              </TabsContent>

              <TabsContent value="skus_only" className="space-y-6">
                <SkuModeFields
                  bulkSkuText={bulkSkuText}
                  setBulkSkuText={setBulkSkuText}
                  addBulkSkus={addBulkSkus}
                  searchQuery={searchQuery}
                  setSearchQuery={setSearchQuery}
                  searching={searching}
                  searchResults={searchResults}
                  addProduct={addProduct}
                  selectedProducts={selectedProducts}
                  removeProduct={removeProduct}
                  clearSkuList={clearSkuList}
                />
              </TabsContent>

              <TabsContent value="combined" className="space-y-6">
                <FilterModeFields minPrice={minPrice} maxPrice={maxPrice} setMinPrice={setMinPrice} setMaxPrice={setMaxPrice} />
                <SkuModeFields
                  bulkSkuText={bulkSkuText}
                  setBulkSkuText={setBulkSkuText}
                  addBulkSkus={addBulkSkus}
                  searchQuery={searchQuery}
                  setSearchQuery={setSearchQuery}
                  searching={searching}
                  searchResults={searchResults}
                  addProduct={addProduct}
                  selectedProducts={selectedProducts}
                  removeProduct={removeProduct}
                  clearSkuList={clearSkuList}
                />
              </TabsContent>
            </Tabs>

            <div className="rounded-2xl border border-border bg-muted/20 p-4">
              <h3 className="text-sm font-semibold text-foreground">Configuracoes do feed</h3>
              <p className="mt-1 text-xs text-muted-foreground">Esses campos valem para qualquer modo de geracao.</p>

              <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                <Field label="Brand" value={settings?.brand || ''} onChange={(value) => setSettings((current) => current ? { ...current, brand: value } : current)} />
                <Field label="Google category" value={settings?.google_product_category || ''} onChange={(value) => setSettings((current) => current ? { ...current, google_product_category: value } : current)} />
                <Field label="Shipping weight" value={settings?.shipping_weight || ''} onChange={(value) => setSettings((current) => current ? { ...current, shipping_weight: value } : current)} />
                <Field label="Condition" value={settings?.condition || ''} onChange={(value) => setSettings((current) => current ? { ...current, condition: value } : current)} />
                <Field label="Adult" value={settings?.adult || ''} onChange={(value) => setSettings((current) => current ? { ...current, adult: value } : current)} />
                <Field label="Shipping label" value={settings?.shipping_label || ''} onChange={(value) => setSettings((current) => current ? { ...current, shipping_label: value } : current)} />
              </div>

              <div className="mt-4 space-y-2">
                <label className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Sale price effective date</label>
                <Input
                  value={settings?.sale_price_effective_date || ''}
                  onChange={(event) => setSettings((current) => current ? { ...current, sale_price_effective_date: event.target.value } : current)}
                  placeholder="2026-04-13T13:00-0300/2026-04-24T15:30-0300"
                />
              </div>

              <label className="mt-4 flex items-center gap-3 rounded-xl border border-border bg-background px-4 py-3 text-sm text-foreground">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-border"
                  checked={settings?.only_in_stock ?? true}
                  onChange={(event) => setSettings((current) => current ? { ...current, only_in_stock: event.target.checked } : current)}
                />
                Incluir apenas produtos com estoque disponivel
              </label>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button color="secondary" onClick={() => void generateFeed(false)} disabled={loadingDefaults || generating}>
                {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Filter className="h-4 w-4" />}
                Gerar e salvar
              </Button>
              <Button onClick={() => void generateFeed(true)} disabled={loadingDefaults || generating}>
                {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                Gerar, salvar e baixar
              </Button>
            </div>
          </Card.Content>
        </Card.Root>

        <Card.Root>
          <Card.Header>
            <Card.Title className="text-base">Resumo da montagem atual</Card.Title>
            <Card.Description>Uma leitura rapida do que vai entrar no arquivo antes de gerar.</Card.Description>
          </Card.Header>
          <Card.Content className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <ModeBadge mode={mode} />
              {(mode === 'filters_only' || mode === 'combined') ? <Badge variant="outline">Faixa: {minPrice || '0'} a {maxPrice || 'livre'}</Badge> : null}
              {(mode === 'skus_only' || mode === 'combined') ? <Badge variant="secondary">{selectedProducts.length} SKU(s) na lista</Badge> : null}
            </div>

            <div className="rounded-xl border border-border bg-muted/20 p-4 text-sm">
              <p className="font-semibold text-foreground">Como vamos gerar</p>
              <p className="mt-2 text-muted-foreground">
                {mode === 'filters_only'
                  ? 'Somente os produtos que baterem na faixa de preco entram no CSV.'
                  : mode === 'skus_only'
                    ? 'Somente os SKUs adicionados manualmente entram no CSV.'
                    : 'O CSV final usa a uniao dos produtos do filtro com os SKUs adicionados manualmente.'}
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <StatCard label="Linhas no ultimo CSV" value={generated?.summary.total_rows ?? '—'} tone="emerald" />
              <StatCard label="Itens pulados" value={generated?.summary.skipped ?? '—'} tone="amber" />
            </div>

            {generated ? (
              <div className="rounded-xl border border-border bg-card p-4">
                <p className="text-sm font-semibold text-foreground">Ultimo arquivo gerado</p>
                <p className="mt-1 text-sm text-muted-foreground">{generated.name}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <ModeBadge mode={generated.mode} />
                  <Badge variant="outline">{generated.summary.total_rows} linhas</Badge>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button color="secondary" size="sm" onClick={() => csvDownload(generated.csv, generated.name)}>
                    <Download className="h-4 w-4" />
                    Baixar atual
                  </Button>
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-border px-4 py-5 text-sm text-muted-foreground">
                Gere um arquivo para ver resumo, preview e disponibilizar download imediato.
              </div>
            )}
          </Card.Content>
        </Card.Root>
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <Card.Root>
          <Card.Header>
            <Card.Title className="text-base">Historico de CSVs</Card.Title>
            <Card.Description>
              Cada geracao fica salva com nome, modo, filtros, quantidade de linhas e download posterior.
            </Card.Description>
          </Card.Header>
          <Card.Content className="space-y-3">
            {loadingHistory ? (
              <div className="flex items-center gap-2 rounded-xl border border-dashed border-border px-4 py-5 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Carregando historico...
              </div>
            ) : history.length > 0 ? (
              history.map((item) => (
                <div
                  key={item.id}
                  className={`rounded-2xl border p-4 ${openedHistoryId === item.id ? 'border-primary/40 bg-primary/5' : 'border-border bg-card'}`}
                >
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-sm font-semibold text-foreground">{item.name}</p>
                        <ModeBadge mode={item.mode} />
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <span>{formatDateTime(item.created_at)}</span>
                        <span>•</span>
                        <span>{item.summary.total_rows} linhas</span>
                        <span>•</span>
                        <span>{item.selected_skus_count} SKU(s)</span>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2 text-xs">
                        {(item.mode === 'filters_only' || item.mode === 'combined') ? (
                          <Badge variant="outline">Faixa: {item.filters.minPrice ?? '0'} a {item.filters.maxPrice ?? 'livre'}</Badge>
                        ) : null}
                        <Badge variant="secondary">Pulados: {item.summary.skipped}</Badge>
                        <Badge variant="secondary">Nao encontrados: {item.summary.manual_missing}</Badge>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Button color="secondary" size="sm" onClick={() => void openHistoryItem(item.id)} disabled={historyBusyId === item.id}>
                        {historyBusyId === item.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Package className="h-4 w-4" />}
                        Abrir
                      </Button>
                      <Button color="secondary" size="sm" onClick={() => void downloadHistoryItem(item.id)} disabled={historyBusyId === item.id}>
                        <Download className="h-4 w-4" />
                        Baixar
                      </Button>
                      <Button color="secondary" size="sm" onClick={() => void deleteHistoryItem(item.id)} disabled={historyBusyId === item.id}>
                        <Trash2 className="h-4 w-4" />
                        Remover
                      </Button>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-xl border border-dashed border-border px-4 py-5 text-sm text-muted-foreground">
                Nenhum CSV salvo ainda. Gere o primeiro arquivo para iniciar o historico.
              </div>
            )}
          </Card.Content>
        </Card.Root>

        <Card.Root>
          <Card.Header>
            <Card.Title className="text-base">Preview do CSV</Card.Title>
            <Card.Description>
              Mostrando as primeiras 20 linhas do arquivo atual ou do item aberto no historico.
            </Card.Description>
          </Card.Header>
          <Card.Content className="space-y-4 p-0">
            {generated ? (
              <>
                <div className="px-6 pt-6">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <StatCard label="Linhas no CSV" value={generated.summary.total_rows} tone="emerald" />
                    <StatCard label="Entraram por filtro" value={generated.summary.price_filtered} />
                    <StatCard label="Entraram por SKU" value={generated.summary.manual_selected} />
                    <StatCard label="SKUs nao encontrados" value={generated.summary.manual_missing} tone="amber" />
                  </div>

                  {generated.missing_manual_skus.length > 0 ? (
                    <div className="mt-4 space-y-2">
                      <p className="text-sm font-semibold text-foreground">SKUs nao encontrados</p>
                      <div className="flex flex-wrap gap-2">
                        {generated.missing_manual_skus.map((sku) => (
                          <Badge key={sku} variant="outline">{sku}</Badge>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>

                {previewRows.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-left text-sm">
                      <thead className="bg-muted/50 text-xs uppercase tracking-[0.14em] text-muted-foreground">
                        <tr>
                          <th className="px-4 py-3">SKU</th>
                          <th className="px-4 py-3">Titulo</th>
                          <th className="px-4 py-3">Preco</th>
                          <th className="px-4 py-3">Oferta</th>
                          <th className="px-4 py-3">Disponibilidade</th>
                          <th className="px-4 py-3">Imagem</th>
                        </tr>
                      </thead>
                      <tbody>
                        {previewRows.map((row) => (
                          <tr key={row.id} className="border-t border-border align-top">
                            <td className="px-4 py-3 font-mono text-xs text-foreground">{row.id}</td>
                            <td className="px-4 py-3">
                              <p className="font-medium text-foreground">{row.title}</p>
                              <a href={row.link} target="_blank" rel="noreferrer" className="mt-1 inline-block text-xs text-primary hover:underline">
                                abrir produto
                              </a>
                            </td>
                            <td className="px-4 py-3 text-foreground">{row.price}</td>
                            <td className="px-4 py-3 text-foreground">{row.sale_price || '—'}</td>
                            <td className="px-4 py-3">
                              <Badge variant={row.availability === 'in_stock' ? 'secondary' : 'outline'}>
                                {row.availability}
                              </Badge>
                            </td>
                            <td className="px-4 py-3">
                              {row.image_link ? (
                                <a href={row.image_link} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline">
                                  ver imagem
                                </a>
                              ) : (
                                <span className="text-xs text-muted-foreground">sem imagem</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="flex min-h-72 items-center justify-center px-6 py-10 text-center text-sm text-muted-foreground">
                    O arquivo atual nao trouxe linhas renderizaveis para preview.
                  </div>
                )}
              </>
            ) : (
              <div className="flex min-h-72 items-center justify-center px-6 py-10 text-center text-sm text-muted-foreground">
                Gere um CSV ou abra um item do historico para ver o preview.
              </div>
            )}
          </Card.Content>
        </Card.Root>
      </div>
    </div>
  );
}
