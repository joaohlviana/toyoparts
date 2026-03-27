import React, { useState, useCallback, useEffect, useMemo } from 'react';
import {
  Search, Loader2, Save, Sparkles, BarChart3, CheckCircle2,
  XCircle, AlertTriangle, FileText, Globe, Eye, Copy, Check,
  ArrowUpDown, ChevronDown, RefreshCw, Zap, TrendingUp, Database,
  ShieldCheck, Gauge, Bot, Layers3
} from 'lucide-react';
import { toast } from 'sonner';
import { projectId } from '../../../utils/supabase/info';
import { adminFetch } from '../lib/admin-auth';
import { cn } from '../components/ui/utils';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Input } from '../components/base/input';
import { Card } from '../components/ui/card';
import { GooglePreview, CharCounter } from '../components/seo/GooglePreview';
import { calculateSEOScore, slugify, type SEOScoreResult, type SEOCheck } from '../seo-config';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';

const API = `https://${projectId}.supabase.co/functions/v1/make-server-1d6e33e0`;

// ─── Types ────────────────────────────────────────────────────────────────────

interface ProductSEO {
  sku: string;
  name: string;
  price: number;
  status: number;
  image_url?: string;
  description?: string;
  short_description?: string;
  modelo_label?: string | null;
  ano_labels?: string | null;
  seo_title?: string;
  meta_description?: string;
  url_key?: string;
  bullet_points?: string[];
  tags_seo?: string[];
}

interface SEOStats {
  total: number;
  with_seo_title: number;
  with_meta_desc: number;
  with_url_key: number;
  avg_score: number;
  distribution: { excellent: number; good: number; fair: number; poor: number };
}

interface SnapshotRouteRecord {
  path: string;
  url: string;
  route_type: 'home' | 'static' | 'vehicle' | 'vehicle-category' | 'department' | 'subcategory' | 'leaf';
  title: string;
  description: string;
  h1: string;
  category_id?: string;
  category_name?: string;
  model_name?: string;
  model_slug?: string;
  product_count: number;
  depth: number;
  breadcrumb: string[];
  requested?: boolean;
  has_snapshot?: boolean;
  snapshot_generated_at?: string | null;
  snapshot_age_hours?: number | null;
  snapshot_status?: 'fresh' | 'stale' | 'missing';
}

interface SnapshotDiscoveryResponse {
  ok?: boolean;
  routes: SnapshotRouteRecord[];
  summary: {
    total_routes: number;
    category_routes: number;
    vehicle_routes?: number;
    vehicle_category_routes?: number;
    static_routes: number;
    requested_urls: number;
    requested_matches: number;
    unmatched_requested: number;
    fresh_snapshots: number;
    stale_snapshots: number;
    missing_snapshots: number;
  };
  unmatched_requested_paths: string[];
}

function formatSnapshotRouteType(type: SnapshotRouteRecord['route_type'] | string) {
  switch (type) {
    case 'home': return 'home';
    case 'static': return 'estatica';
    case 'vehicle': return 'veiculo';
    case 'vehicle-category': return 'veiculo x categoria';
    case 'department': return 'departamento';
    case 'subcategory': return 'subcategoria';
    case 'leaf': return 'folha';
    default: return type;
  }
}

interface SEOHealthCheck {
  id: string;
  category: string;
  title: string;
  status: 'ok' | 'warning' | 'critical';
  score: number;
  maxScore: number;
  detail: string;
  recommendation?: string | null;
}

interface SEOHealthPillar {
  id: string;
  title: string;
  score: number;
  maxScore: number;
  percentage: number;
}

interface SEOHealthResponse {
  generated_at: string;
  overall: {
    score: number;
    grade: string;
    enterprise_ready: boolean;
  };
  coverage: {
    active_products: number;
    seo_title_pct: number;
    meta_description_pct: number;
    url_key_pct: number;
    avg_quality_score: number;
    product_snapshots: number;
    product_snapshot_pct: number;
    category_snapshots: number;
    category_snapshot_pct: number;
    eligible_category_routes: number;
    eligible_vehicle_routes?: number;
    eligible_vehicle_category_routes?: number;
    sitemap_files: number;
  };
  checks: SEOHealthCheck[];
  pillars: SEOHealthPillar[];
  gaps: Array<{
    id: string;
    severity: 'warning' | 'critical';
    title: string;
    detail: string;
    recommendation?: string | null;
  }>;
  raw: {
    meili_configured: boolean;
    sitemap_status: string;
    sitemap_last_completed_at?: string | null;
  };
}

// ─── Score Ring ───────────────────────────────────────────────────────────────

function ScoreRing({ pct, size = 56 }: { pct: number; size?: number }) {
  const r = (size - 6) / 2;
  const circ = 2 * Math.PI * r;
  const color = pct >= 80 ? 'text-green-500' : pct >= 60 ? 'text-yellow-500' : pct >= 40 ? 'text-orange-500' : 'text-red-500';
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={5} className="stroke-border" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={5} strokeDasharray={circ} strokeDashoffset={circ * (1 - pct / 100)} strokeLinecap="round" className={cn('transition-all duration-700', color.replace('text-', 'stroke-'))} />
      </svg>
      <span className={cn('absolute text-xs font-bold', color)}>{pct}%</span>
    </div>
  );
}

// ─── Check Item ──────────────────────────────────────────────────────────────

function CheckItem({ check }: { check: SEOCheck }) {
  const Icon = check.passed ? CheckCircle2 : check.score > 0 ? AlertTriangle : XCircle;
  const color = check.passed ? 'text-green-500' : check.score > 0 ? 'text-yellow-500' : 'text-red-400';
  return (
    <div className="flex items-start gap-2 py-1.5">
      <Icon className={cn('w-4 h-4 flex-shrink-0 mt-0.5', color)} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-foreground">{check.label}</span>
          <span className="text-[10px] text-muted-foreground">{check.score}/{check.maxScore}</span>
        </div>
        <p className="text-[10px] text-muted-foreground truncate">{check.detail}</p>
      </div>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function SEOAdminPage() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'editor' | 'batch' | 'stats' | 'snapshots'>('dashboard');
  
  return (
    <div className="max-w-[1280px] mx-auto px-4 lg:px-6 pt-6 pb-12">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-foreground flex items-center gap-2">
          <Globe className="w-5 h-5 text-primary" /> SEO & Metadados
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Gerencie titulos SEO, meta descriptions e URLs amigaveis dos produtos.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 mb-6 border-b border-border">
        {[
          { id: 'dashboard' as const, label: 'SEO Dashboard', icon: Gauge },
          { id: 'editor' as const, label: 'Editor de SEO', icon: FileText },
          { id: 'batch' as const, label: 'Geracao em Lote', icon: Sparkles },
          { id: 'snapshots' as const, label: 'Snapshots SEO', icon: Database },
          { id: 'stats' as const, label: 'Estatisticas', icon: BarChart3 },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              'flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px',
              activeTab === tab.id
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            <tab.icon className="w-4 h-4" /> {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'dashboard' && <SEODashboardTab />}
      {activeTab === 'editor' && <SEOEditorTab />}
      {activeTab === 'batch' && <SEOBatchTab />}
      {activeTab === 'snapshots' && <SEOSnapshotsTab />}
      {activeTab === 'stats' && <SEOStatsTab />}
    </div>
  );
}

// ─── Editor Tab ──────────────────────────────────────────────────────────────

function SEODashboardTab() {
  const [health, setHealth] = useState<SEOHealthResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadHealth = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true);
    else setLoading(true);

    try {
      const res = await adminFetch(`${API}/admin/seo/health`);
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || `HTTP ${res.status}`);
      setHealth(data);
    } catch (e: any) {
      toast.error(`Erro ao carregar dashboard SEO: ${e.message}`);
    } finally {
      if (silent) setRefreshing(false);
      else setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadHealth();
  }, [loadHealth]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!health) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <Gauge className="w-12 h-12 mx-auto mb-3 text-muted-foreground/30" />
        <p className="text-sm">Nao foi possivel carregar o dashboard de saude SEO.</p>
      </div>
    );
  }

  const criticalGaps = health.gaps.filter((gap) => gap.severity === 'critical');

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <Gauge className="w-5 h-5 text-primary" /> SEO Dashboard
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Saude de SEO para e-commerce com score, pilares enterprise, checklist tecnico e gaps reais.
          </p>
        </div>
        <Button variant="outline" onClick={() => loadHealth(true)} disabled={refreshing} className="gap-1.5">
          {refreshing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          Atualizar Analise
        </Button>
      </div>

      <div className="grid grid-cols-2 xl:grid-cols-5 gap-4">
        <Card className="p-5">
          <p className="text-xs text-muted-foreground mb-2">Score Geral</p>
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-3xl font-bold text-foreground">{health.overall.score}%</p>
              <p className="text-xs text-muted-foreground mt-1">Nota {health.overall.grade}</p>
            </div>
            <ScoreRing pct={health.overall.score} size={64} />
          </div>
        </Card>
        <StatCard
          label="Enterprise Ready"
          value={health.overall.enterprise_ready ? 'Sim' : 'Nao'}
          color={health.overall.enterprise_ready ? 'text-green-600' : 'text-orange-600'}
          sub={`${criticalGaps.length} gap(s) criticos`}
        />
        <StatCard label="Produtos Ativos" value={health.coverage.active_products} />
        <StatCard label="Snapshots Produto" value={`${health.coverage.product_snapshot_pct}%`} sub={`${health.coverage.product_snapshots} gerados`} />
        <StatCard
          label="Snapshots Landings"
          value={`${health.coverage.category_snapshot_pct}%`}
          sub={`${health.coverage.category_snapshots}/${health.coverage.eligible_category_routes}`}
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1.2fr_0.8fr] gap-6">
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <Layers3 className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-semibold text-foreground">Pilares Enterprise de SEO</h3>
          </div>
          <div className="space-y-4">
            {health.pillars.map((pillar) => (
              <div key={pillar.id} className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-foreground">{pillar.title}</span>
                  <span className="text-xs text-muted-foreground">{pillar.percentage}%</span>
                </div>
                <div className="w-full bg-muted rounded-full h-2.5">
                  <div
                    className={cn(
                      'h-2.5 rounded-full transition-all',
                      pillar.percentage >= 85 ? 'bg-green-500' : pillar.percentage >= 65 ? 'bg-yellow-500' : 'bg-red-500'
                    )}
                    style={{ width: `${pillar.percentage}%` }}
                  />
                </div>
                <p className="text-[11px] text-muted-foreground">{pillar.score}/{pillar.maxScore} pontos</p>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <ShieldCheck className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-semibold text-foreground">Resumo Operacional</h3>
          </div>
          <div className="space-y-3">
            <SummaryRow label="Titulos SEO" value={`${health.coverage.seo_title_pct}%`} />
            <SummaryRow label="Meta descriptions" value={`${health.coverage.meta_description_pct}%`} />
            <SummaryRow label="Slugs amigaveis" value={`${health.coverage.url_key_pct}%`} />
            <SummaryRow label="Qualidade media" value={`${health.coverage.avg_quality_score}%`} />
            <SummaryRow label="Sitemap status" value={health.raw.sitemap_status} />
            <SummaryRow label="Arquivos de sitemap" value={health.coverage.sitemap_files} />
            <SummaryRow label="MeiliSearch" value={health.raw.meili_configured ? 'Configurado' : 'Ausente'} />
            <SummaryRow label="Ultima leitura" value={new Date(health.generated_at).toLocaleString('pt-BR')} />
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1.1fr_0.9fr] gap-6">
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <Bot className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-semibold text-foreground">Checklist SEO Enterprise</h3>
          </div>
          <div className="space-y-3">
            {health.checks.map((check) => (
              <div key={check.id} className="flex items-start gap-3 p-3 rounded-xl border border-border bg-background">
                <Badge
                  variant="outline"
                  className={cn(
                    'mt-0.5 text-[10px] shrink-0',
                    check.status === 'ok' && 'border-green-200 text-green-700 bg-green-50',
                    check.status === 'warning' && 'border-yellow-200 text-yellow-700 bg-yellow-50',
                    check.status === 'critical' && 'border-red-200 text-red-700 bg-red-50'
                  )}
                >
                  {check.status === 'ok' ? 'OK' : check.status === 'warning' ? 'Atencao' : 'Critico'}
                </Badge>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium text-foreground">{check.title}</p>
                    <span className="text-[11px] text-muted-foreground">{check.score}/{check.maxScore}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{check.detail}</p>
                  {check.recommendation && check.status !== 'ok' && (
                    <p className="text-[11px] text-foreground/80 mt-2">Proximo passo: {check.recommendation}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-semibold text-foreground">Gaps Reais do Setup</h3>
          </div>
          <div className="space-y-3">
            {health.gaps.length === 0 ? (
              <div className="rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-800">
                Nenhum gap aberto. O setup atual atende o checklist enterprise sem ressalvas.
              </div>
            ) : (
              health.gaps.map((gap) => (
                <div key={gap.id} className="rounded-xl border border-border p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Badge
                      variant="outline"
                      className={cn(
                        'text-[10px]',
                        gap.severity === 'critical' ? 'border-red-200 text-red-700 bg-red-50' : 'border-yellow-200 text-yellow-700 bg-yellow-50'
                      )}
                    >
                      {gap.severity === 'critical' ? 'Critico' : 'Atencao'}
                    </Badge>
                    <p className="text-sm font-medium text-foreground">{gap.title}</p>
                  </div>
                  <p className="text-xs text-muted-foreground">{gap.detail}</p>
                  {gap.recommendation && (
                    <p className="text-[11px] text-foreground/80 mt-2">Acao recomendada: {gap.recommendation}</p>
                  )}
                </div>
              ))
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

function SEOEditorTab() {
  const [sku, setSku] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [product, setProduct] = useState<ProductSEO | null>(null);
  
  // SEO fields (editable)
  const [seoTitle, setSeoTitle] = useState('');
  const [metaDesc, setMetaDesc] = useState('');
  const [urlKey, setUrlKey] = useState('');

  const seoScore = useMemo<SEOScoreResult | null>(() => {
    if (!product) return null;
    return calculateSEOScore({
      seo_title: seoTitle,
      meta_description: metaDesc,
      url_key: urlKey,
      name: product.name,
      description: product.description,
      short_description: product.short_description,
      image_url: product.image_url,
      modelo_label: product.modelo_label || undefined,
      ano_labels: product.ano_labels || undefined,
    });
  }, [product, seoTitle, metaDesc, urlKey]);

  const loadProduct = useCallback(async () => {
    if (!sku.trim()) return;
    setLoading(true);
    try {
      const res = await adminFetch(`${API}/seo/product/${encodeURIComponent(sku.trim())}`);
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
      }
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setProduct(data);
      setSeoTitle(data.seo_title || '');
      setMetaDesc(data.meta_description || '');
      setUrlKey(data.url_key || slugify(data.name || ''));
    } catch (e: any) {
      toast.error(`Erro: ${e.message}`);
      setProduct(null);
    } finally {
      setLoading(false);
    }
  }, [sku]);

  const saveFields = useCallback(async () => {
    if (!product) return;
    setSaving(true);
    try {
      const res = await adminFetch(`${API}/admin/seo/update`, {
        method: 'POST',
        body: JSON.stringify({
          sku: product.sku,
          seo_title: seoTitle,
          meta_description: metaDesc,
          url_key: urlKey,
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      toast.success('Campos SEO salvos com sucesso!');
    } catch (e: any) {
      toast.error(`Erro ao salvar: ${e.message}`);
    } finally {
      setSaving(false);
    }
  }, [product, seoTitle, metaDesc, urlKey]);

  const generateAI = useCallback(async () => {
    if (!product) return;
    setGenerating(true);
    try {
      const res = await adminFetch(`${API}/admin/seo/generate`, {
        method: 'POST',
        body: JSON.stringify({ sku: product.sku }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      if (data.seo_title) setSeoTitle(data.seo_title);
      if (data.meta_description) setMetaDesc(data.meta_description);
      if (data.url_key) setUrlKey(data.url_key);
      toast.success('Campos SEO gerados pela IA!');
    } catch (e: any) {
      toast.error(`Erro IA: ${e.message}`);
    } finally {
      setGenerating(false);
    }
  }, [product]);

  return (
    <div className="space-y-6">
      {/* Search */}
      <div className="flex gap-2">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            value={sku}
            onChange={e => setSku(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && loadProduct()}
            placeholder="Digite o SKU do produto..."
            className="w-full pl-9 pr-3 py-2 rounded-md border border-input bg-input-background text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:border-ring transition-[color,box-shadow]"
          />
        </div>
        <Button onClick={loadProduct} disabled={loading || !sku.trim()}>
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Carregar'}
        </Button>
      </div>

      {product && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: Editor */}
          <div className="lg:col-span-2 space-y-5">
            {/* Product info header */}
            <Card className="p-4">
              <div className="flex items-start gap-4">
                {product.image_url ? (
                  <img src={product.image_url} alt="" className="w-16 h-16 rounded-lg border border-border object-cover flex-shrink-0" />
                ) : (
                  <div className="w-16 h-16 rounded-lg border border-border bg-muted flex items-center justify-center flex-shrink-0">
                    <FileText className="w-6 h-6 text-muted-foreground/40" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-mono text-muted-foreground">{product.sku}</p>
                  <p className="text-sm font-medium text-foreground truncate">{product.name}</p>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {product.modelo_label && <Badge variant="secondary" className="text-[10px]">{product.modelo_label}</Badge>}
                    {product.ano_labels && <Badge variant="outline" className="text-[10px]">{product.ano_labels}</Badge>}
                    <Badge variant={product.status === 1 ? 'default' : 'secondary'} className="text-[10px]">
                      {product.status === 1 ? 'Ativo' : 'Inativo'}
                    </Badge>
                  </div>
                </div>
              </div>
            </Card>

            {/* SEO Fields */}
            <Card className="p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-foreground">Campos SEO</h3>
                <Button variant="outline" size="sm" onClick={generateAI} disabled={generating} className="gap-1.5">
                  {generating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                  Gerar com IA
                </Button>
              </div>

              {/* SEO Title */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-foreground">Titulo SEO</label>
                  <CharCounter value={seoTitle} min={30} max={65} />
                </div>
                <input
                  value={seoTitle}
                  onChange={e => setSeoTitle(e.target.value)}
                  placeholder={product.name}
                  className="w-full px-3 py-2 rounded-lg border border-input bg-input-background text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:border-ring transition-[color,box-shadow]"
                />
              </div>

              {/* Meta Description */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-foreground">Meta Description</label>
                  <CharCounter value={metaDesc} min={120} max={160} />
                </div>
                <textarea
                  value={metaDesc}
                  onChange={e => setMetaDesc(e.target.value)}
                  placeholder="Descricao que aparece no Google..."
                  rows={3}
                  className="w-full px-3 py-2 rounded-lg border border-input bg-input-background text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:border-ring resize-none transition-[color,box-shadow]"
                />
              </div>

              {/* URL Key */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-foreground">URL Amigavel (slug)</label>
                  <button onClick={() => setUrlKey(slugify(product.name))} className="text-[10px] text-primary hover:underline">
                    Auto-gerar
                  </button>
                </div>
                <div className="flex items-center gap-0">
                  <span className="px-3 py-2 bg-muted border border-r-0 border-input rounded-l-lg text-xs text-muted-foreground whitespace-nowrap">/produto/{product.sku}/</span>
                  <input
                    value={urlKey}
                    onChange={e => setUrlKey(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                    className="flex-1 px-3 py-2 rounded-r-lg border border-input bg-input-background text-sm text-foreground font-mono focus:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:border-ring transition-[color,box-shadow]"
                  />
                </div>
              </div>

              {/* Save */}
              <div className="flex justify-end pt-2">
                <Button onClick={saveFields} disabled={saving} className="gap-1.5">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  Salvar Campos SEO
                </Button>
              </div>
            </Card>

            {/* Google Preview */}
            <GooglePreview
              title={seoTitle || product.name}
              url={`/produto/${product.sku}/${urlKey || slugify(product.name)}`}
              description={metaDesc || product.short_description || `${product.name} - Peca genuina Toyota. Compre na Toyoparts.`}
            />
          </div>

          {/* Right: Score */}
          <div className="space-y-4">
            <Card className="p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-foreground">SEO Score</h3>
                {seoScore && <ScoreRing pct={seoScore.percentage} size={52} />}
              </div>
              {seoScore && (
                <div className="space-y-1">
                  {seoScore.checks.map((c, i) => <CheckItem key={i} check={c} />)}
                </div>
              )}
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Batch Tab ───────────────────────────────────────────────────────────────

function SEOBatchTab() {
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState<{ sku: string; status: string; seo_title?: string }[]>([]);
  const [batchSize, setBatchSize] = useState(10);

  const runBatch = useCallback(async () => {
    setRunning(true);
    setResults([]);
    setProgress(0);
    try {
      const res = await adminFetch(`${API}/admin/seo/generate-batch`, {
        method: 'POST',
        body: JSON.stringify({ limit: batchSize }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setResults(data.results || []);
      setProgress(100);
      toast.success(`${data.processed || 0} produtos processados!`);
    } catch (e: any) {
      toast.error(`Erro: ${e.message}`);
    } finally {
      setRunning(false);
    }
  }, [batchSize]);

  return (
    <div className="space-y-6 max-w-3xl">
      <Card className="p-5 space-y-4">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-primary" /> Geracao em Lote
        </h3>
        <p className="text-xs text-muted-foreground">
          Gera automaticamente titulo SEO, meta description e URL key para produtos que ainda nao possuem esses campos. 
          Usa GPT-4o-mini para criar conteudo otimizado baseado nos dados do Magento e catalogo Toyota.
        </p>

        <div className="flex items-center gap-3">
          <div className="space-y-1">
            <label className="text-xs font-medium text-foreground">Quantidade</label>
            <Select
              value={String(batchSize)}
              onValueChange={v => setBatchSize(Number(v))}
            >
              <SelectTrigger size="sm" className="w-[140px]">
                <SelectValue placeholder="Selecione..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="5">5 produtos</SelectItem>
                <SelectItem value="10">10 produtos</SelectItem>
                <SelectItem value="25">25 produtos</SelectItem>
                <SelectItem value="50">50 produtos</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="pt-5">
            <Button onClick={runBatch} disabled={running} className="gap-1.5">
              {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
              {running ? 'Processando...' : 'Iniciar Geracao'}
            </Button>
          </div>
        </div>

        {running && (
          <div className="space-y-2">
            <div className="w-full bg-muted rounded-full h-2">
              <div className="bg-primary h-2 rounded-full transition-all duration-500" style={{ width: `${progress}%` }} />
            </div>
            <p className="text-xs text-muted-foreground">Processando...</p>
          </div>
        )}
      </Card>

      {results.length > 0 && (
        <Card className="p-5">
          <h3 className="text-sm font-semibold text-foreground mb-3">Resultados ({results.length})</h3>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {results.map((r, i) => (
              <div key={i} className="flex items-center gap-3 py-2 border-b border-border last:border-0">
                {r.status === 'ok' ? (
                  <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />
                ) : (
                  <XCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
                )}
                <span className="text-xs font-mono text-muted-foreground w-28 flex-shrink-0">{r.sku}</span>
                <span className="text-xs text-foreground truncate flex-1">{r.seo_title || r.status}</span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

// ─── Stats Tab ──────────────────────────────────────────────────────────────

function SEOSnapshotsTab() {
  const [discovering, setDiscovering] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [urlsText, setUrlsText] = useState('');
  const [minProducts, setMinProducts] = useState(1);
  const [maxDepth, setMaxDepth] = useState(3);
  const [onlyRequested, setOnlyRequested] = useState(true);
  const [force, setForce] = useState(false);
  const [discovery, setDiscovery] = useState<SnapshotDiscoveryResponse | null>(null);
  const [generationResults, setGenerationResults] = useState<Array<{ path: string; route_type: string; status: string; generated_at: string | null; product_count: number }>>([]);

  const discoverSnapshots = useCallback(async () => {
    setDiscovering(true);
    try {
      const res = await adminFetch(`${API}/snapshot/categories/discover`, {
        method: 'POST',
        body: JSON.stringify({
          urls: urlsText,
          minProducts,
          maxDepth,
          includeStatic: true,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || `HTTP ${res.status}`);
      setDiscovery(data);
      toast.success(`${data.summary.total_routes} rotas analisadas para snapshot.`);
    } catch (e: any) {
      toast.error(`Erro ao descobrir snapshots: ${e.message}`);
    } finally {
      setDiscovering(false);
    }
  }, [urlsText, minProducts, maxDepth]);

  const generateSnapshots = useCallback(async () => {
    setGenerating(true);
    try {
      const res = await adminFetch(`${API}/snapshot/categories/generate`, {
        method: 'POST',
        body: JSON.stringify({
          urls: urlsText,
          minProducts,
          maxDepth,
          includeStatic: true,
          onlyRequested,
          force,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || `HTTP ${res.status}`);
      setGenerationResults(data.results || []);
      toast.success(`${data.generated} snapshots gerados, ${data.skipped} reaproveitados.`);
      await discoverSnapshots();
    } catch (e: any) {
      toast.error(`Erro ao gerar snapshots: ${e.message}`);
    } finally {
      setGenerating(false);
    }
  }, [urlsText, minProducts, maxDepth, onlyRequested, force, discoverSnapshots]);

  return (
    <div className="space-y-6">
      <Card className="p-5 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Database className="w-4 h-4 text-primary" /> Snapshots de Landings SEO
            </h3>
            <p className="text-xs text-muted-foreground mt-1 max-w-3xl">
              Descobre automaticamente landings de departamentos, veiculos e cruzamentos veiculo x categoria com produto real,
              cruza uma lista de URLs do legado e gera snapshots HTML cacheados para rotas prioritarias de SEO.
            </p>
          </div>
          <Badge variant="outline" className="text-[10px]">Categorias + veiculos + rotas fixas</Badge>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_auto] gap-4">
          <div className="space-y-2">
            <label className="text-xs font-medium text-foreground">URLs para cruzar (opcional)</label>
            <textarea
              value={urlsText}
              onChange={(e) => setUrlsText(e.target.value)}
              rows={10}
              placeholder="Cole aqui as URLs do legado, uma por linha. Ex.: https://www.toyoparts.com.br/pecas/corolla/acessorios-internos"
              className="w-full rounded-xl border border-input bg-input-background px-3 py-3 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:border-ring resize-y transition-[color,box-shadow]"
            />
            <p className="text-[11px] text-muted-foreground">
              Se deixar vazio, o sistema lista automaticamente todas as categorias, modelos e combinacoes com produto encontradas no catalogo.
            </p>
          </div>

          <div className="space-y-3 min-w-[220px]">
            <div className="space-y-1">
              <label className="text-xs font-medium text-foreground">Minimo de produtos</label>
              <Select value={String(minProducts)} onValueChange={(value) => setMinProducts(Number(value))}>
                <SelectTrigger size="sm">
                  <SelectValue placeholder="Minimo..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1 produto</SelectItem>
                  <SelectItem value="2">2 produtos</SelectItem>
                  <SelectItem value="3">3 produtos</SelectItem>
                  <SelectItem value="5">5 produtos</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-foreground">Profundidade maxima</label>
              <Select value={String(maxDepth)} onValueChange={(value) => setMaxDepth(Number(value))}>
                <SelectTrigger size="sm">
                  <SelectValue placeholder="Profundidade..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1 nivel</SelectItem>
                  <SelectItem value="2">2 niveis</SelectItem>
                  <SelectItem value="3">3 niveis</SelectItem>
                  <SelectItem value="4">4 niveis</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <label className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs text-foreground">
              <input type="checkbox" checked={onlyRequested} onChange={(e) => setOnlyRequested(e.target.checked)} className="rounded border-border" />
              Gerar apenas as URLs coladas
            </label>

            <label className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs text-foreground">
              <input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} className="rounded border-border" />
              Regerar mesmo se o snapshot existir
            </label>

            <div className="space-y-2 pt-2">
              <Button onClick={discoverSnapshots} disabled={discovering} className="w-full gap-1.5">
                {discovering ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                Descobrir URLs
              </Button>
              <Button onClick={generateSnapshots} disabled={generating} variant="outline" className="w-full gap-1.5">
                {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                Gerar Snapshots
              </Button>
            </div>
          </div>
        </div>
      </Card>

      {discovery && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
            <StatCard label="Rotas Descobertas" value={discovery.summary.total_routes} />
            <StatCard label="Categorias" value={discovery.summary.category_routes} />
            <StatCard label="Veiculos" value={discovery.summary.vehicle_routes || 0} />
            <StatCard label="Combos V x C" value={discovery.summary.vehicle_category_routes || 0} />
            <StatCard label="Matches da Lista" value={`${discovery.summary.requested_matches}/${discovery.summary.requested_urls || 0}`} />
            <StatCard label="Fresh" value={discovery.summary.fresh_snapshots} color="text-green-600" />
            <StatCard label="Sem Snapshot" value={discovery.summary.missing_snapshots} color="text-orange-600" />
          </div>

          {discovery.unmatched_requested_paths.length > 0 && (
            <Card className="p-4 border-amber-200 bg-amber-50/50">
              <h4 className="text-sm font-semibold text-amber-900 mb-2">URLs coladas sem correspondencia</h4>
              <div className="flex flex-wrap gap-2">
                {discovery.unmatched_requested_paths.map((path) => (
                  <Badge key={path} variant="outline" className="text-[11px] border-amber-300 text-amber-900 bg-white">
                    {path}
                  </Badge>
                ))}
              </div>
            </Card>
          )}

          <Card className="p-5">
            <div className="flex items-center justify-between gap-3 mb-4">
              <h3 className="text-sm font-semibold text-foreground">Rotas elegiveis para snapshot</h3>
              <Badge variant="secondary" className="text-[10px]">{discovery.routes.length} linhas</Badge>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left">
                    <th className="py-2 pr-3 text-xs font-medium text-muted-foreground">URL</th>
                    <th className="py-2 pr-3 text-xs font-medium text-muted-foreground">Tipo</th>
                    <th className="py-2 pr-3 text-xs font-medium text-muted-foreground">Produtos</th>
                    <th className="py-2 pr-3 text-xs font-medium text-muted-foreground">Snapshot</th>
                    <th className="py-2 text-xs font-medium text-muted-foreground">Hierarquia</th>
                  </tr>
                </thead>
                <tbody>
                  {discovery.routes.slice(0, 120).map((route) => (
                    <tr key={route.path} className="border-b border-border/70 align-top">
                      <td className="py-3 pr-3">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <a href={route.url} target="_blank" rel="noreferrer" className="text-xs font-mono text-primary hover:underline break-all">
                              {route.path}
                            </a>
                          {route.requested && <Badge variant="outline" className="text-[10px]">colada</Badge>}
                          {route.model_name && <Badge variant="secondary" className="text-[10px]">{route.model_name}</Badge>}
                        </div>
                        <p className="text-[11px] text-muted-foreground line-clamp-2">{route.title}</p>
                      </div>
                    </td>
                    <td className="py-3 pr-3">
                        <Badge variant={route.category_id || route.model_name ? 'default' : 'secondary'} className="text-[10px] capitalize">
                          {formatSnapshotRouteType(route.route_type)}
                        </Badge>
                      </td>
                      <td className="py-3 pr-3 text-xs text-foreground">{route.product_count}</td>
                      <td className="py-3 pr-3">
                        <div className="space-y-1">
                          <Badge
                            variant="outline"
                            className={cn(
                              'text-[10px]',
                              route.snapshot_status === 'fresh' && 'border-green-200 text-green-700 bg-green-50',
                              route.snapshot_status === 'stale' && 'border-yellow-200 text-yellow-700 bg-yellow-50',
                              route.snapshot_status === 'missing' && 'border-muted text-muted-foreground bg-background'
                            )}
                          >
                            {route.snapshot_status === 'fresh' ? 'Atual' : route.snapshot_status === 'stale' ? 'Vencido' : 'Ausente'}
                          </Badge>
                          {route.snapshot_generated_at && (
                            <p className="text-[10px] text-muted-foreground">{route.snapshot_age_hours}h atras</p>
                          )}
                        </div>
                      </td>
                      <td className="py-3">
                        <p className="text-[11px] text-muted-foreground">{route.breadcrumb.join(' > ') || 'Home'}</p>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {discovery.routes.length > 120 && (
              <p className="text-[11px] text-muted-foreground mt-3">
                Mostrando as primeiras 120 rotas. A geracao continua usando toda a lista descoberta.
              </p>
            )}
          </Card>
        </>
      )}

      {generationResults.length > 0 && (
        <Card className="p-5">
          <h3 className="text-sm font-semibold text-foreground mb-4">Ultima geracao</h3>
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {generationResults.map((result) => (
              <div key={`${result.path}-${result.status}`} className="flex items-center gap-3 py-2 border-b border-border last:border-0">
                {result.status.startsWith('error')
                  ? <XCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                  : result.status === 'generated'
                    ? <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />
                    : <RefreshCw className="w-4 h-4 text-muted-foreground flex-shrink-0" />}
                <span className="text-xs font-mono text-muted-foreground w-52 shrink-0 truncate">{result.path}</span>
                <span className="text-xs text-foreground flex-1">{result.status}</span>
                <span className="text-[11px] text-muted-foreground shrink-0">{result.product_count} prod.</span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

function SEOStatsTab() {
  const [stats, setStats] = useState<SEOStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    adminFetch(`${API}/admin/seo/stats`)
      .then(r => r.json())
      .then(data => {
        if (!data.error) setStats(data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <BarChart3 className="w-12 h-12 mx-auto mb-3 text-muted-foreground/30" />
        <p className="text-sm">Nao foi possivel carregar estatisticas.</p>
      </div>
    );
  }

  const pctTitle = stats.total > 0 ? Math.round((stats.with_seo_title / stats.total) * 100) : 0;
  const pctDesc = stats.total > 0 ? Math.round((stats.with_meta_desc / stats.total) * 100) : 0;
  const pctUrl = stats.total > 0 ? Math.round((stats.with_url_key / stats.total) * 100) : 0;

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard label="Total Produtos" value={stats.total} />
        <StatCard label="Score Medio" value={`${stats.avg_score}%`} color={stats.avg_score >= 60 ? 'text-green-600' : 'text-yellow-600'} />
        <StatCard label="Com Titulo SEO" value={`${pctTitle}%`} sub={`${stats.with_seo_title}/${stats.total}`} />
        <StatCard label="Com Meta Desc" value={`${pctDesc}%`} sub={`${stats.with_meta_desc}/${stats.total}`} />
      </div>

      {/* Distribution */}
      <Card className="p-5">
        <h3 className="text-sm font-semibold text-foreground mb-4">Distribuicao de Qualidade SEO</h3>
        <div className="space-y-3">
          {[
            { label: 'Excelente (80-100%)', count: stats.distribution.excellent, color: 'bg-green-500' },
            { label: 'Bom (60-79%)', count: stats.distribution.good, color: 'bg-yellow-500' },
            { label: 'Regular (40-59%)', count: stats.distribution.fair, color: 'bg-orange-500' },
            { label: 'Ruim (0-39%)', count: stats.distribution.poor, color: 'bg-red-500' },
          ].map(item => {
            const pct = stats.total > 0 ? Math.round((item.count / stats.total) * 100) : 0;
            return (
              <div key={item.label} className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">{item.label}</span>
                  <span className="text-xs font-medium text-foreground">{item.count} ({pct}%)</span>
                </div>
                <div className="w-full bg-muted rounded-full h-2">
                  <div className={`${item.color} h-2 rounded-full transition-all`} style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Completion */}
      <Card className="p-5">
        <h3 className="text-sm font-semibold text-foreground mb-4">Completude dos Campos</h3>
        <div className="grid grid-cols-3 gap-4">
          <CompletionMeter label="Titulo SEO" pct={pctTitle} />
          <CompletionMeter label="Meta Description" pct={pctDesc} />
          <CompletionMeter label="URL Key" pct={pctUrl} />
        </div>
      </Card>
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <Card className="p-4">
      <p className="text-xs text-muted-foreground mb-1">{label}</p>
      <p className={cn('text-xl font-bold', color || 'text-foreground')}>{value}</p>
      {sub && <p className="text-[10px] text-muted-foreground mt-0.5">{sub}</p>}
    </Card>
  );
}

function SummaryRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border/70 pb-2 last:border-0 last:pb-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-foreground text-right">{value}</span>
    </div>
  );
}

function CompletionMeter({ label, pct }: { label: string; pct: number }) {
  const color = pct >= 80 ? 'text-green-500' : pct >= 50 ? 'text-yellow-500' : 'text-red-400';
  return (
    <div className="text-center space-y-2">
      <ScoreRing pct={pct} size={64} />
      <p className="text-xs font-medium text-foreground">{label}</p>
    </div>
  );
}
