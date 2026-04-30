import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  Search, Sparkles, ArrowRight, Loader2, AlertCircle, CheckCircle2,
  Copy, Check, BarChart3, ArrowUpDown, Zap, FileText,
  Scale, Car, Tag, Package, TrendingUp, XCircle, RefreshCw, Brain
} from 'lucide-react';
import { toast } from 'sonner';
import { projectId } from '../../../utils/supabase/info';
import { adminFetch } from '../lib/admin-auth';
import { cn } from '../components/ui/utils';
import { Button } from '../components/base/button';
import { Badge } from '../components/base/badge';
import { Input } from '../components/base/input';
import { Card } from '../components/base/card';
import { copyToClipboard } from '../utils/clipboard';
import { CategoryEngineSummaryCard } from '../components/admin/CategoryEngineConsole';

const API = `https://${projectId}.supabase.co/functions/v1/make-server-1d6e33e0`;


// ─── Types ───────────────────────────────────────────────────────────────────

interface QualityBreakdown { score: number; max: number; issues: string[]; }
interface CompareResult {
  sku: string;
  magento: {
    sku: string; name: string; price: number; weight: number | null; status: number;
    description: string; short_description: string;
    modelo: string | null; modelo_label: string | null;
    ano: string | null; ano_labels: string | null;
    category_ids: string[];
    category_names: { id: string; name: string; path: string }[];
    image_count: number;
  };
  toyota: {
    found: boolean; cat?: string; categoria?: string; subcategoria?: string;
    seo_title?: string; compat_lines?: string[];
    compat_models?: { codigo: string; descricao: string; modelo: string; anos: string[]; trim: string; cambio: string; motor: string }[];
    weight?: number; publicPrice?: number; description?: string;
  };
  quality: { score: number; maxScore: number; breakdown: Record<string, QualityBreakdown>; };
  suggestions: { field: string; current: any; suggested: any; reason: string; priority: string; }[];
}

interface BatchProduct {
  sku: string; name: string; price: number; status: number;
  toyota_match: boolean; toyota_category: string | null;
  quality_score: number; quality_max: number; quality_pct: number;
  issues_count: number; top_issues: string[];
}

interface BatchResult {
  products: BatchProduct[];
  total_analyzed: number; total_products: number; offset: number; has_more: boolean;
  stats: { total_matched: number; total_unmatched: number; avg_quality_pct: number; distribution: { excellent: number; good: number; fair: number; poor: number; }; };
}

type CategoryEnrichmentField = 'category' | 'weight' | 'compatibility' | 'modelYear' | 'name';

interface CategoryEnrichmentCategory {
  id: string;
  name: string;
  path: string;
}

interface CategoryEnrichmentRow {
  sku: string;
  status: 'ready' | 'already_correct' | 'needs_review' | 'no_product' | 'no_toyota_match' | 'error';
  statusLabel: string;
  productFound: boolean;
  toyotaFound: boolean;
  product: null | {
    sku: string;
    name: string;
    weight: number | null;
    status: number;
    category_ids: string[];
    category_names: { id: string; name: string; path: string }[];
    modelo: string;
    ano: string;
    compatibilidade: string;
    image_count: number;
  };
  toyota: {
    found: boolean;
    matchedPartno?: string | null;
    cat?: string;
    categoria?: string;
    subcategoria?: string;
    name?: string;
    seo_title?: string;
    description?: string;
    weight?: number | null;
    compatibilityLines?: string[];
    compatibilityModels?: { codigo: string; descricao: string; modelo: string; anos: string[] }[];
  };
  suggestion: null | {
    categoryId: string | null;
    categoryName: string | null;
    categoryPath: string | null;
    confidence: number;
    method: string;
    reason: string;
    alternatives: { categoryId: string; categoryName: string; categoryPath: string; confidence: number; reason: string }[];
  };
  fieldSuggestions: Record<string, { label: string; canApply: boolean; applyDefault: boolean; current: any; suggested: any }>;
}

interface CategoryEnrichmentResult {
  rows: CategoryEnrichmentRow[];
  categories: CategoryEnrichmentCategory[];
  summary: {
    total: number;
    product_found: number;
    toyota_found: number;
    ready: number;
    needs_review: number;
    already_correct: number;
    no_product: number;
    no_toyota_match: number;
  };
  limits?: { max_skus: number; received: number; analyzed: number };
}

interface CategoryApplyResponse {
  success: boolean;
  applied_count: number;
  skipped_count: number;
  error_count: number;
  applied: Array<{ sku: string; success: boolean; appliedFields?: string[] }>;
  skipped: Array<{ sku: string; success?: boolean; error?: string }>;
  errors: Array<{ sku: string; error?: string }>;
}

interface CategoryApplyRowState {
  state: 'pending' | 'success' | 'error';
  message: string;
}

interface CategoryApplyProgress {
  key: string;
  total: number;
  completed: number;
  success: number;
  failed: number;
  currentSku: string | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

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
      <span className={cn("absolute text-xs font-bold", color)}>{pct}%</span>
    </div>
  );
}

function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button type="button" onClick={async () => { await copyToClipboard(text); setCopied(true); toast.success('Copiado'); setTimeout(() => setCopied(false), 1500); }}
      className="p-1 text-muted-foreground hover:text-foreground cursor-pointer transition-colors">
      {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
}

function PriorityBadge({ p }: { p: string }) {
  const c = p === 'high' ? 'error' : p === 'medium' ? 'warning' : 'gray';
  return <Badge variant="pill-color" color={c as any} size="xs">{p === 'high' ? 'Alta' : p === 'medium' ? 'Média' : 'Baixa'}</Badge>;
}

function FieldIcon({ field }: { field: string }) {
  const cls = "w-4 h-4";
  switch (field) {
    case 'name': return <FileText className={cls} />;
    case 'category': return <Tag className={cls} />;
    case 'weight': return <Scale className={cls} />;
    case 'compatibility': return <Car className={cls} />;
    default: return <Package className={cls} />;
  }
}

const FIELD_NAMES: Record<string, string> = { name: 'Nome / Título SEO', category: 'Categoria', weight: 'Peso', compatibility: 'Compatibilidade', description: 'Descrição' };

// ─── Compare Result Panel ────────────────────────────────────────────────────

const CATEGORY_FIELD_LABELS: Record<CategoryEnrichmentField, string> = {
  category: 'Categoria',
  weight: 'Peso',
  compatibility: 'Compatibilidade Toyota',
  modelYear: 'Modelo/Ano',
  name: 'Nome',
};

function parseSkuTextarea(value: string) {
  const raw = String(value || '').split(/[\r\n,;]+/g);
  const normalized = raw
    .map((sku) => sku.trim().toUpperCase().replace(/[\s-]/g, ''))
    .filter(Boolean);
  const unique = [...new Set(normalized)];
  return {
    rawCount: normalized.length,
    skus: unique,
    duplicateCount: Math.max(0, normalized.length - unique.length),
  };
}

function categoryStatusColor(status: CategoryEnrichmentRow['status']) {
  if (status === 'ready') return 'success';
  if (status === 'already_correct') return 'brand';
  if (status === 'needs_review') return 'warning';
  if (status === 'no_product' || status === 'no_toyota_match' || status === 'error') return 'error';
  return 'gray';
}

function formatValue(value: any) {
  if (value == null || value === '') return 'Vazio';
  if (Array.isArray(value)) return value.length ? value.join(', ') : 'Vazio';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

async function readApiErrorMessage(res: Response) {
  const text = await res.text();
  let msg = `HTTP ${res.status}`;
  try {
    const j = JSON.parse(text);
    msg = j.error || msg;
  } catch {
    msg = text.slice(0, 200) || msg;
  }
  return msg;
}

function ComparePanel({ data, onEnrichAI }: { data: CompareResult; onEnrichAI: () => void }) {
  const pct = Math.round((data.quality.score / data.quality.maxScore) * 100);
  const breakdownEntries = Object.entries(data.quality.breakdown);

  return (
    <div className="space-y-5">
      {/* Header with score */}
      <Card.Root>
        <div className="p-5">
          <div className="flex items-start gap-5">
            <ScoreRing pct={pct} size={72} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 flex-wrap">
                <h3 className="text-base font-semibold text-foreground font-mono">{data.sku}</h3>
                {data.toyota.found
                  ? <Badge variant="pill-color" color="success" size="xs">Match Toyota</Badge>
                  : <Badge variant="pill-color" color="error" size="xs">Sem match Toyota</Badge>}
              </div>
              <p className="text-sm text-muted-foreground mt-1 truncate">{data.magento.name}</p>
              <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                <span>Score: <strong className="text-foreground">{data.quality.score}/{data.quality.maxScore}</strong></span>
                <span>Preço: <strong className="text-foreground">R$ {data.magento.price.toFixed(2)}</strong></span>
                <span>Imagens: <strong className="text-foreground">{data.magento.image_count}</strong></span>
                <span>Status: {data.magento.status === 1 ? <Badge variant="pill-color" color="success" size="xs">Ativo</Badge> : <Badge variant="pill-color" color="gray" size="xs">Inativo</Badge>}</span>
              </div>
            </div>
          </div>
        </div>
      </Card.Root>

      {/* Quality Breakdown */}
      <Card.Root>
        <div className="p-5">
          <h4 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-primary" /> Análise de Qualidade
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            {breakdownEntries.map(([key, b]) => {
              const bpct = Math.round((b.score / b.max) * 100);
              return (
                <div key={key} className="bg-secondary/40 rounded-lg border border-border p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium text-foreground capitalize">{key.replace('_', ' ')}</span>
                    <span className={cn("text-xs font-bold", bpct >= 70 ? 'text-green-600' : bpct >= 40 ? 'text-yellow-600' : 'text-red-600')}>
                      {b.score}/{b.max}
                    </span>
                  </div>
                  <div className="w-full bg-border rounded-full h-1.5 mb-2">
                    <div className={cn("h-1.5 rounded-full transition-all", bpct >= 70 ? 'bg-green-500' : bpct >= 40 ? 'bg-yellow-500' : 'bg-red-500')}
                      style={{ width: `${bpct}%` }} />
                  </div>
                  {b.issues.length > 0 && (
                    <ul className="space-y-0.5">
                      {b.issues.slice(0, 3).map((issue, i) => (
                        <li key={i} className="text-[10px] text-muted-foreground flex items-start gap-1">
                          <XCircle className="w-2.5 h-2.5 text-destructive shrink-0 mt-0.5" />
                          <span>{issue}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </Card.Root>

      {/* Side-by-side comparison */}
      <Card.Root>
        <div className="p-5">
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <ArrowUpDown className="w-4 h-4 text-primary" /> Comparação Lado a Lado
            </h4>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground uppercase w-32">Campo</th>
                  <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground uppercase">Magento (Atual)</th>
                  <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground uppercase">Toyota (Oficial)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                <tr>
                  <td className="py-2.5 px-3 text-xs font-medium text-muted-foreground">Nome</td>
                  <td className="py-2.5 px-3 text-xs text-foreground">{data.magento.name || <span className="text-muted-foreground italic">—</span>}</td>
                  <td className="py-2.5 px-3 text-xs text-foreground font-medium">
                    {data.toyota.seo_title ? <span className="flex items-center gap-1">{data.toyota.seo_title} <CopyBtn text={data.toyota.seo_title} /></span> : <span className="text-muted-foreground italic">N/A</span>}
                  </td>
                </tr>
                <tr>
                  <td className="py-2.5 px-3 text-xs font-medium text-muted-foreground">Categoria</td>
                  <td className="py-2.5 px-3 text-xs text-foreground">
                    {data.magento.category_names?.length > 0 ? (
                      <div className="space-y-1">
                        {data.magento.category_names.map(c => (
                          <div key={c.id} className="flex items-center gap-1.5 flex-wrap">
                            <Badge variant="pill-color" color="gray" size="xs">{c.id}</Badge>
                            <span className="font-medium">{c.name && c.name !== `Cat ${c.id}` ? c.name : c.path || c.id}</span>
                          </div>
                        ))}
                      </div>
                    ) : <span className="text-destructive">Sem categorias</span>}
                  </td>
                  <td className="py-2.5 px-3 text-xs text-foreground font-medium">{data.toyota.categoria ? `${data.toyota.categoria}${data.toyota.subcategoria ? ' > ' + data.toyota.subcategoria : ''}` : <span className="text-muted-foreground italic">N/A</span>}</td>
                </tr>
                <tr>
                  <td className="py-2.5 px-3 text-xs font-medium text-muted-foreground">Peso</td>
                  <td className="py-2.5 px-3 text-xs text-foreground">{data.magento.weight ? `${data.magento.weight} kg` : <span className="text-destructive">Sem peso</span>}</td>
                  <td className="py-2.5 px-3 text-xs text-foreground font-medium">{data.toyota.weight ?? <span className="text-muted-foreground italic">N/A</span>}</td>
                </tr>
                <tr>
                  <td className="py-2.5 px-3 text-xs font-medium text-muted-foreground">Preço</td>
                  <td className="py-2.5 px-3 text-xs text-foreground">R$ {data.magento.price.toFixed(2)}</td>
                  <td className="py-2.5 px-3 text-xs text-foreground">{data.toyota.publicPrice ? `R$ ${(data.toyota.publicPrice / 100).toFixed(2)}` : <span className="text-muted-foreground italic">N/A</span>}</td>
                </tr>
                <tr>
                  <td className="py-2.5 px-3 text-xs font-medium text-muted-foreground align-top">Modelo/Ano</td>
                  <td className="py-2.5 px-3 text-xs text-foreground align-top">
                    {data.magento.modelo ? (
                      <div className="space-y-1">
                        <div className="flex items-center gap-1.5">
                          <span className="text-muted-foreground">Modelo:</span>
                          <span className="font-medium">{data.magento.modelo_label || data.magento.modelo}</span>
                          {data.magento.modelo_label && data.magento.modelo_label !== data.magento.modelo && (
                            <Badge variant="pill-color" color="gray" size="xs">ID: {data.magento.modelo}</Badge>
                          )}
                        </div>
                        {data.magento.ano && (
                          <div className="flex items-start gap-1.5">
                            <span className="text-muted-foreground shrink-0">Anos:</span>
                            <span className="font-medium">{data.magento.ano_labels || data.magento.ano}</span>
                          </div>
                        )}
                      </div>
                    ) : <span className="text-destructive">Vazio</span>}
                  </td>
                  <td className="py-2.5 px-3 text-xs text-foreground align-top">
                    {data.toyota.compat_models && data.toyota.compat_models.length > 0 ? (
                      <div className="space-y-1.5">
                        {data.toyota.compat_models.map((cm, i) => (
                          <div key={i} className="bg-secondary/40 rounded px-2 py-1.5 border border-border">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-semibold text-foreground">{cm.modelo || '?'}</span>
                              {cm.motor && <Badge variant="pill-color" color="brand" size="xs">{cm.motor}</Badge>}
                              {cm.trim && <Badge variant="pill-outline" color="gray" size="xs">{cm.trim}</Badge>}
                              {cm.cambio && <Badge variant="pill-outline" color="gray" size="xs">{cm.cambio}</Badge>}
                            </div>
                            {cm.anos?.length > 0 && (
                              <p className="text-[10px] text-muted-foreground mt-1">
                                Anos: <span className="text-foreground font-medium">{cm.anos.join(', ')}</span>
                              </p>
                            )}
                          </div>
                        ))}
                        <p className="text-[10px] text-muted-foreground">
                          {data.toyota.compat_lines?.length || 0} linhas de compatibilidade total
                        </p>
                      </div>
                    ) : data.toyota.compat_lines?.length ? (
                      <span className="font-medium">{data.toyota.compat_lines.length} linhas</span>
                    ) : <span className="text-muted-foreground italic">N/A</span>}
                  </td>
                </tr>
                <tr>
                  <td className="py-2.5 px-3 text-xs font-medium text-muted-foreground">Descrição</td>
                  <td className="py-2.5 px-3 text-xs text-foreground max-w-xs truncate">{data.magento.description?.slice(0, 120) || <span className="text-destructive">Vazia</span>}</td>
                  <td className="py-2.5 px-3 text-xs text-foreground">{data.toyota.description || <span className="text-muted-foreground italic">N/A</span>}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </Card.Root>

      {/* Suggestions */}
      {data.suggestions.length > 0 && (
        <Card.Root>
          <div className="p-5">
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-primary" /> Sugestões de Melhoria
                <Badge variant="pill-color" color="brand" size="xs">{data.suggestions.length}</Badge>
              </h4>
              <Button color="primary" size="sm" onClick={onEnrichAI}
                iconLeading={<Brain className="w-4 h-4" />}>Enriquecer com IA</Button>
            </div>
            <div className="space-y-3">
              {data.suggestions.map((s, idx) => (
                <div key={idx} className="bg-secondary/30 rounded-lg border border-border p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <FieldIcon field={s.field} />
                    <span className="text-xs font-semibold text-foreground">{FIELD_NAMES[s.field] || s.field}</span>
                    <PriorityBadge p={s.priority} />
                  </div>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mt-2">
                    <div>
                      <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Atual</span>
                      <p className="text-xs text-foreground mt-0.5 bg-destructive/5 p-2 rounded border border-destructive/10 whitespace-pre-wrap">{String(s.current).slice(0, 200)}</p>
                    </div>
                    <div>
                      <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Sugerido</span>
                      <div className="text-xs text-foreground mt-0.5 bg-green-50 dark:bg-green-950/20 p-2 rounded border border-green-200 dark:border-green-800 whitespace-pre-wrap flex items-start gap-1">
                        <span className="flex-1">{String(s.suggested).slice(0, 300)}</span>
                        <CopyBtn text={String(s.suggested)} />
                      </div>
                    </div>
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-2 italic">{s.reason}</p>
                </div>
              ))}
            </div>
          </div>
        </Card.Root>
      )}

      {/* Compat lines if Toyota matched */}
      {data.toyota.found && data.toyota.compat_lines && data.toyota.compat_lines.length > 0 && (
        <Card.Root>
          <div className="p-5">
            <h4 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-3">
              <Car className="w-4 h-4 text-primary" /> Compatibilidade Toyota
              <Badge variant="pill-color" color="gray" size="xs">{data.toyota.compat_lines.length} linhas</Badge>
            </h4>
            <div className="bg-secondary/30 rounded-lg border border-border max-h-60 overflow-y-auto divide-y divide-border">
              {data.toyota.compat_lines.map((line, i) => (
                <div key={i} className="flex items-center gap-2 px-3 py-1.5 text-xs">
                  <span className="tabular-nums text-muted-foreground w-5 text-right shrink-0">{i + 1}</span>
                  <span className="text-foreground font-medium">{line}</span>
                </div>
              ))}
            </div>
          </div>
        </Card.Root>
      )}
    </div>
  );
}

// ─── AI Enrichment Modal ─────────────────────────────────────────────────────

function AIEnrichment({ sku, magento, toyota }: { sku: string; magento: any; toyota: any }) {
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const generate = async () => {
    setLoading(true); setError(''); setResult(null);
    try {
      const res = await adminFetch(`${API}/admin/catalogo/enriquecer-ia`, {
        method: 'POST',
        body: JSON.stringify({ sku, magento, toyota }),
      });
      if (!res.ok) {
        const text = await res.text();
        let msg = `HTTP ${res.status}`;
        try { const j = JSON.parse(text); msg = j.error || msg; } catch { msg = text.slice(0, 200) || msg; }
        throw new Error(msg);
      }
      const json = await res.json();
      setResult(json.enrichment);
      toast.success('Enriquecimento IA gerado!');
    } catch (err: any) {
      setError(err.message); toast.error('Falha na IA');
    } finally { setLoading(false); }
  };

  if (!result && !loading && !error) {
    return (
      <Card.Root>
        <div className="p-5 text-center">
          <Brain className="w-8 h-8 text-primary mx-auto mb-3" />
          <h4 className="text-sm font-semibold text-foreground mb-2">Enriquecimento via GPT-4o</h4>
          <p className="text-xs text-muted-foreground mb-4 max-w-md mx-auto">
            Gera título SEO otimizado, descrição completa em HTML, bullet points e tags — baseado nos dados <strong>determinísticos</strong> do catálogo Toyota. A IA não inventa dados.
          </p>
          <Button color="primary" size="md" onClick={generate} iconLeading={<Sparkles className="w-4 h-4" />}>Gerar com IA</Button>
        </div>
      </Card.Root>
    );
  }

  return (
    <Card.Root>
      <div className="p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" /> Resultado IA
          </h4>
          {result && <Button color="tertiary" size="xs" onClick={generate} isLoading={loading} iconLeading={<RefreshCw className="w-3.5 h-3.5" />}>Regenerar</Button>}
        </div>

        {loading && (
          <div className="py-8 text-center">
            <Loader2 className="w-6 h-6 animate-spin text-primary mx-auto mb-3" />
            <p className="text-xs text-muted-foreground">Gerando com GPT-4o...</p>
          </div>
        )}

        {error && (
          <div className="flex items-start gap-2 p-3 bg-destructive/5 border border-destructive/20 rounded-lg">
            <AlertCircle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
            <p className="text-xs text-destructive">{error}</p>
          </div>
        )}

        {result && (
          <div className="space-y-4">
            {/* SEO Title */}
            {result.titulo_seo && (
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Título SEO</span>
                  <CopyBtn text={result.titulo_seo} />
                </div>
                <p className="text-sm font-semibold text-foreground bg-primary/5 border border-primary/20 rounded-lg p-3">{result.titulo_seo}</p>
              </div>
            )}

            {/* Short desc */}
            {result.descricao_curta && (
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Meta Description</span>
                  <CopyBtn text={result.descricao_curta} />
                </div>
                <p className="text-xs text-foreground bg-secondary/50 rounded-lg p-3 border border-border">{result.descricao_curta}</p>
              </div>
            )}

            {/* Full desc */}
            {result.descricao_completa && (
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Descrição HTML</span>
                  <CopyBtn text={result.descricao_completa} />
                </div>
                <div className="text-xs text-foreground bg-secondary/30 rounded-lg p-4 border border-border prose prose-sm max-w-none max-h-48 overflow-y-auto"
                  dangerouslySetInnerHTML={{ __html: result.descricao_completa }} />
              </div>
            )}

            {/* Bullets */}
            {result.bullet_points?.length > 0 && (
              <div>
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Bullet Points</span>
                <ul className="mt-1 space-y-1">
                  {result.bullet_points.map((bp: string, i: number) => (
                    <li key={i} className="flex items-start gap-2 text-xs text-foreground">
                      <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0 mt-0.5" />
                      <span>{bp}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Tags */}
            {result.tags_seo?.length > 0 && (
              <div>
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Tags SEO</span>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {result.tags_seo.map((tag: string, i: number) => (
                    <Badge key={i} variant="pill-outline" color="gray" size="xs">{tag}</Badge>
                  ))}
                </div>
              </div>
            )}

            {result.confianca != null && (
              <div className="text-[10px] text-muted-foreground pt-2 border-t border-border">
                Confiança: <strong className="text-foreground">{Math.round(result.confianca * 100)}%</strong>
              </div>
            )}
          </div>
        )}
      </div>
    </Card.Root>
  );
}

// ─── Batch Analysis Panel ────────────────────────────────────────────────────

function BatchPanel({ onSelectSku }: { onSelectSku: (sku: string) => void }) {
  const [result, setResult] = useState<BatchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 30;

  const fetchBatch = async (offset: number) => {
    setLoading(true); setError('');
    try {
      const res = await adminFetch(`${API}/admin/catalogo/analise-lote`, {
        method: 'POST',
        body: JSON.stringify({ offset, limit: PAGE_SIZE }),
      });
      if (!res.ok) {
        const text = await res.text();
        let msg = `HTTP ${res.status}`;
        try { const j = JSON.parse(text); msg = j.error || msg; } catch { msg = text.slice(0, 200) || msg; }
        throw new Error(msg);
      }
      const json = await res.json();
      setResult(json);
      setPage(offset);
    } catch (err: any) {
      setError(err.message); toast.error('Falha na análise');
    } finally { setLoading(false); }
  };

  if (!result && !loading && !error) {
    return (
      <Card.Root>
        <div className="p-8 text-center">
          <BarChart3 className="w-10 h-10 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-base font-semibold text-foreground mb-2">Análise em Lote do Catálogo</h3>
          <p className="text-sm text-muted-foreground mb-5 max-w-lg mx-auto">
            Escaneia seus produtos Magento, cruza com o catálogo Toyota, e calcula um score de qualidade para cada SKU.
            Identifica automaticamente problemas de nome, categoria, compatibilidade e dados faltantes.
          </p>
          <Button color="primary" size="lg" onClick={() => fetchBatch(0)} iconLeading={<Zap className="w-5 h-5" />}>
            Iniciar Análise
          </Button>
        </div>
      </Card.Root>
    );
  }

  return (
    <div className="space-y-4">
      {/* Stats cards */}
      {result?.stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card.Root>
            <div className="p-4 text-center">
              <p className="text-2xl font-bold text-foreground">{result.stats.avg_quality_pct}%</p>
              <p className="text-xs text-muted-foreground mt-1">Score Médio</p>
            </div>
          </Card.Root>
          <Card.Root>
            <div className="p-4 text-center">
              <p className="text-2xl font-bold text-green-600">{result.stats.total_matched}</p>
              <p className="text-xs text-muted-foreground mt-1">Match Toyota</p>
            </div>
          </Card.Root>
          <Card.Root>
            <div className="p-4 text-center">
              <p className="text-2xl font-bold text-red-600">{result.stats.total_unmatched}</p>
              <p className="text-xs text-muted-foreground mt-1">Sem Match</p>
            </div>
          </Card.Root>
          <Card.Root>
            <div className="p-4 text-center">
              <p className="text-2xl font-bold text-foreground">{result.total_products.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground mt-1">Total Produtos</p>
            </div>
          </Card.Root>
        </div>
      )}

      {/* Distribution */}
      {result?.stats?.distribution && (
        <Card.Root>
          <div className="p-4">
            <h4 className="text-xs font-medium text-muted-foreground uppercase mb-3">Distribuição de Qualidade</h4>
            <div className="flex items-end gap-1 h-16">
              {[
                { label: 'Excelente', count: result.stats.distribution.excellent, color: 'bg-green-500' },
                { label: 'Bom', count: result.stats.distribution.good, color: 'bg-yellow-500' },
                { label: 'Regular', count: result.stats.distribution.fair, color: 'bg-orange-500' },
                { label: 'Fraco', count: result.stats.distribution.poor, color: 'bg-red-500' },
              ].map(d => {
                const total = result.total_analyzed;
                const pct = total > 0 ? (d.count / total) * 100 : 0;
                return (
                  <div key={d.label} className="flex-1 flex flex-col items-center gap-1">
                    <div className={cn("w-full rounded-t-sm transition-all", d.color)} style={{ height: `${Math.max(pct, 4)}%` }} />
                    <span className="text-[10px] text-muted-foreground">{d.label}</span>
                    <span className="text-[10px] font-bold text-foreground">{d.count}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </Card.Root>
      )}

      {/* Product list */}
      <Card.Root>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border bg-secondary/30">
                <th className="text-left py-2.5 px-3 font-medium text-muted-foreground">SKU</th>
                <th className="text-left py-2.5 px-3 font-medium text-muted-foreground">Nome</th>
                <th className="text-center py-2.5 px-3 font-medium text-muted-foreground">Score</th>
                <th className="text-center py-2.5 px-3 font-medium text-muted-foreground">Toyota</th>
                <th className="text-left py-2.5 px-3 font-medium text-muted-foreground">Problemas</th>
                <th className="text-center py-2.5 px-3 font-medium text-muted-foreground w-16">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {result?.products?.map(p => (
                <tr key={p.sku} className="hover:bg-secondary/20 transition-colors">
                  <td className="py-2 px-3 font-mono text-foreground whitespace-nowrap">{p.sku}</td>
                  <td className="py-2 px-3 text-foreground max-w-[200px] truncate">{p.name}</td>
                  <td className="py-2 px-3 text-center">
                    <span className={cn("font-bold", p.quality_pct >= 80 ? 'text-green-600' : p.quality_pct >= 60 ? 'text-yellow-600' : p.quality_pct >= 40 ? 'text-orange-600' : 'text-red-600')}>
                      {p.quality_pct}%
                    </span>
                  </td>
                  <td className="py-2 px-3 text-center">
                    {p.toyota_match ? <CheckCircle2 className="w-3.5 h-3.5 text-green-500 inline" /> : <XCircle className="w-3.5 h-3.5 text-muted-foreground inline" />}
                  </td>
                  <td className="py-2 px-3 max-w-[250px]">
                    <div className="flex flex-wrap gap-1">
                      {p.top_issues.slice(0, 3).map((issue, i) => (
                        <span key={i} className="text-[9px] bg-destructive/10 text-destructive px-1.5 py-0.5 rounded">{issue}</span>
                      ))}
                    </div>
                  </td>
                  <td className="py-2 px-3 text-center">
                    <button type="button" onClick={() => onSelectSku(p.sku)}
                      className="p-1.5 text-primary hover:bg-primary/10 rounded-md transition-colors cursor-pointer">
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {/* Pagination */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-border">
          <span className="text-xs text-muted-foreground">
            {page + 1}–{Math.min(page + PAGE_SIZE, result?.total_products || 0)} de {result?.total_products?.toLocaleString() || 0}
          </span>
          <div className="flex items-center gap-2">
            <Button color="tertiary" size="xs" onClick={() => fetchBatch(Math.max(0, page - PAGE_SIZE))}
              disabled={page === 0 || loading}>Anterior</Button>
            <Button color="tertiary" size="xs" onClick={() => fetchBatch(page + PAGE_SIZE)}
              disabled={!result?.has_more || loading} isLoading={loading}>Próximo</Button>
          </div>
        </div>
      </Card.Root>

      {error && (
        <div className="flex items-start gap-2 p-3 bg-destructive/5 border border-destructive/20 rounded-lg">
          <AlertCircle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
          <p className="text-xs text-destructive">{error}</p>
        </div>
      )}
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

function CategoryEnrichmentPanel({ onSelectSku }: { onSelectSku: (sku: string) => void }) {
  const [input, setInput] = useState('');
  const [result, setResult] = useState<CategoryEnrichmentResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingCandidates, setLoadingCandidates] = useState(false);
  const [applyingKey, setApplyingKey] = useState<string | null>(null);
  const [applyProgress, setApplyProgress] = useState<CategoryApplyProgress | null>(null);
  const [rowApplyState, setRowApplyState] = useState<Record<string, CategoryApplyRowState>>({});
  const [error, setError] = useState('');
  const [expandedSku, setExpandedSku] = useState<string | null>(null);
  const [selection, setSelection] = useState<Record<string, { fields: CategoryEnrichmentField[]; categoryId: string }>>({});
  const [history, setHistory] = useState<any[]>([]);
  const parsed = parseSkuTextarea(input);

  const loadHistory = useCallback(async () => {
    try {
      const res = await adminFetch(`${API}/admin/catalogo/category-enrichment/history?limit=12`);
      if (!res.ok) return;
      const json = await res.json();
      setHistory(Array.isArray(json.items) ? json.items : []);
    } catch {
      // Historico e auxiliar; nao deve quebrar a aba.
    }
  }, []);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const initializeSelection = (rows: CategoryEnrichmentRow[]) => {
    const next: Record<string, { fields: CategoryEnrichmentField[]; categoryId: string }> = {};
    rows.forEach((row) => {
      const fields = (Object.keys(CATEGORY_FIELD_LABELS) as CategoryEnrichmentField[])
        .filter((field) => row.fieldSuggestions?.[field]?.applyDefault);
      next[row.sku] = {
        fields,
        categoryId: row.suggestion?.categoryId || '',
      };
    });
    setSelection(next);
  };

  const analyze = async (showToast = true) => {
    const skus = parsed.skus;
    if (!skus.length) {
      toast.error('Cole ao menos um SKU');
      return;
    }
    if (skus.length > 200) {
      toast.error('Analise no maximo 200 SKUs por vez');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const res = await adminFetch(`${API}/admin/catalogo/category-enrichment/preview`, {
        method: 'POST',
        body: JSON.stringify({ skus }),
      });
      if (!res.ok) {
        throw new Error(await readApiErrorMessage(res));
      }
      const json = await res.json();
      setResult(json);
      initializeSelection(json.rows || []);
      if (showToast) toast.success(`${json.summary?.total || skus.length} SKUs analisados`);
    } catch (err: any) {
      setError(err.message || 'Falha ao analisar SKUs');
      toast.error('Falha na analise de categorias');
    } finally {
      setLoading(false);
    }
  };

  const toggleField = (sku: string, field: CategoryEnrichmentField) => {
    setSelection((current) => {
      const existing = current[sku] || { fields: [], categoryId: '' };
      const fields = existing.fields.includes(field)
        ? existing.fields.filter((item) => item !== field)
        : [...existing.fields, field];
      return { ...current, [sku]: { ...existing, fields } };
    });
  };

  const setCategory = (sku: string, categoryId: string) => {
    setSelection((current) => {
      const existing = current[sku] || { fields: [], categoryId: '' };
      const fields = existing.fields.includes('category') ? existing.fields : [...existing.fields, 'category' as CategoryEnrichmentField];
      return { ...current, [sku]: { ...existing, fields, categoryId } };
    });
  };

  const buildUpdate = (row: CategoryEnrichmentRow) => {
    const selected = selection[row.sku];
    if (!selected?.fields?.length) return null;
    const fields = selected.fields.filter((field) => row.fieldSuggestions?.[field]?.canApply);
    if (!fields.length) return null;
    return {
      sku: row.sku,
      fields,
      categoryId: selected.categoryId || row.suggestion?.categoryId || '',
    };
  };

  const applyRows = async (rows: CategoryEnrichmentRow[], key: string) => {
    const updates = rows.map(buildUpdate).filter(Boolean) as Array<{ sku: string; fields: CategoryEnrichmentField[]; categoryId: string }>;
    if (!updates.length) {
      toast.error('Selecione ao menos um campo aplicavel');
      return;
    }

    setApplyingKey(key);
    setApplyProgress({
      key,
      total: updates.length,
      completed: 0,
      success: 0,
      failed: 0,
      currentSku: updates[0]?.sku || null,
    });
    setRowApplyState((current) => {
      const next = { ...current };
      updates.forEach((update) => {
        next[update.sku] = { state: 'pending', message: 'Atualizando...' };
      });
      return next;
    });

    let successCount = 0;
    let failedCount = 0;
    try {
      for (const [index, update] of updates.entries()) {
        setApplyProgress((current) => current && current.key === key ? {
          ...current,
          currentSku: update.sku,
        } : current);

        try {
          const res = await adminFetch(`${API}/admin/catalogo/category-enrichment/apply`, {
            method: 'POST',
            body: JSON.stringify({ updates: [update] }),
          });
          if (!res.ok) {
            throw new Error(await readApiErrorMessage(res));
          }

          const json = await res.json() as CategoryApplyResponse;
          const appliedEntry = (json.applied || []).find((item) => item?.sku === update.sku && item?.success);
          const skippedEntry = (json.skipped || []).find((item) => item?.sku === update.sku);
          const errorEntry = (json.errors || []).find((item) => item?.sku === update.sku);

          if (appliedEntry) {
            successCount += 1;
            setRowApplyState((current) => ({
              ...current,
              [update.sku]: {
                state: 'success',
                message: 'Atualizado com sucesso',
              },
            }));
          } else {
            failedCount += 1;
            setRowApplyState((current) => ({
              ...current,
              [update.sku]: {
                state: 'error',
                message: skippedEntry?.error || errorEntry?.error || 'Nao foi possivel atualizar este SKU',
              },
            }));
          }
        } catch (err: any) {
          failedCount += 1;
          setRowApplyState((current) => ({
            ...current,
            [update.sku]: {
              state: 'error',
              message: err.message || 'Falha ao atualizar este SKU',
            },
          }));
        }

        setApplyProgress((current) => current && current.key === key ? {
          ...current,
          completed: index + 1,
          success: successCount,
          failed: failedCount,
          currentSku: index + 1 < updates.length ? updates[index + 1].sku : null,
        } : current);
      }

      if (successCount > 0) {
        await analyze(false);
      }
      await loadHistory();

      if (failedCount > 0) {
        toast.warning(`Atualizado ${successCount} de ${updates.length}. ${failedCount} SKU(s) exigem revisao.`);
      } else {
        toast.success(`Atualizado ${successCount} de ${updates.length} com sucesso.`);
      }
    } catch (err: any) {
      toast.error(err.message || 'Falha ao atualizar');
    } finally {
      setApplyingKey(null);
      setApplyProgress((current) => current && current.key === key ? {
        ...current,
        currentSku: null,
      } : current);
    }
  };

  const loadCandidates = async () => {
    setLoadingCandidates(true);
    try {
      const res = await adminFetch(`${API}/admin/catalogo/category-enrichment/candidates?limit=200`);
      if (!res.ok) {
        throw new Error(await readApiErrorMessage(res));
      }
      const json = await res.json() as {
        skus?: string[];
        total_candidates?: number;
        selected_count?: number;
      };
      const skus = Array.isArray(json.skus) ? json.skus.filter(Boolean) : [];
      if (!skus.length) {
        toast.warning('Nenhum produto ativo, em estoque e sem categoria foi encontrado.');
        return;
      }
      setInput(skus.join('\n'));
      setResult(null);
      setSelection({});
      setExpandedSku(null);
      setError('');
      setApplyProgress(null);
      setRowApplyState({});
      toast.success(`${json.selected_count || skus.length} SKU(s) colocados no textarea.`);
    } catch (err: any) {
      toast.error(err.message || 'Falha ao buscar produtos sem categoria');
    } finally {
      setLoadingCandidates(false);
    }
  };

  const readyRows = result?.rows?.filter((row) => row.status === 'ready') || [];
  const selectedRows = result?.rows?.filter((row) => !!buildUpdate(row)) || [];

  return (
    <div className="space-y-5">
      <Card.Root>
        <div className="p-5 space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
                <Tag className="w-5 h-5 text-primary" /> Categorias Toyota
              </h3>
              <p className="text-sm text-muted-foreground mt-1">
                Cole SKUs para comparar Toyoparts x Toyota e sugerir categorias existentes do site.
              </p>
            </div>
            <Badge variant="pill-color" color="brand" size="sm">Max. 200 SKUs</Badge>
          </div>

          <textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder={'2367039475\n2368230020\n8987120080'}
            className="w-full min-h-[150px] rounded-xl border border-border bg-input-background p-3 text-sm font-mono outline-none transition-colors focus:border-primary focus:ring-4 focus:ring-primary/10"
          />

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span><strong className="text-foreground">{parsed.skus.length}</strong> SKUs unicos</span>
              {parsed.duplicateCount > 0 && <span><strong className="text-foreground">{parsed.duplicateCount}</strong> duplicados removidos</span>}
              {result?.limits && <span><strong className="text-foreground">{result.limits.analyzed}</strong> analisados</span>}
            </div>
            <div className="flex items-center gap-2">
              <Button color="tertiary" size="sm" onClick={() => { setInput(''); setResult(null); setSelection({}); setExpandedSku(null); setError(''); setApplyProgress(null); setRowApplyState({}); }}>Limpar</Button>
              <Button color="secondary" size="sm" onClick={loadCandidates} isLoading={loadingCandidates} disabled={loading || loadingCandidates}>
                Pegar 200 produtos
              </Button>
              <Button color="primary" size="sm" onClick={() => analyze()} isLoading={loading} iconLeading={<Search className="w-4 h-4" />}>
                Analisar SKUs
              </Button>
            </div>
          </div>
        </div>
      </Card.Root>

      {error && (
        <Card.Root>
          <div className="p-4 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-destructive shrink-0" />
            <div>
              <p className="text-sm font-semibold text-foreground">Erro localizado</p>
              <p className="text-sm text-muted-foreground">{error}</p>
            </div>
          </div>
        </Card.Root>
      )}

      {result?.summary && (
        <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
          {[
            ['SKUs', result.summary.total, 'text-foreground'],
            ['Toyoparts OK', result.summary.product_found, 'text-green-600'],
            ['Toyota OK', result.summary.toyota_found, 'text-green-600'],
            ['Prontos', result.summary.ready, 'text-primary'],
            ['Revisar', result.summary.needs_review, 'text-yellow-600'],
            ['Corretos', result.summary.already_correct, 'text-blue-600'],
          ].map(([label, value, color]) => (
            <Card.Root key={String(label)}>
              <div className="p-4 text-center">
                <p className={cn("text-2xl font-bold", String(color))}>{String(value)}</p>
                <p className="text-xs text-muted-foreground mt-1">{String(label)}</p>
              </div>
            </Card.Root>
          ))}
        </div>
      )}

      {applyProgress && (
        <Card.Root>
          <div className="px-4 py-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-foreground">
                Atualizado {applyProgress.success} de {applyProgress.total}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {applyProgress.currentSku
                  ? `Processando SKU ${applyProgress.currentSku}`
                  : applyProgress.failed > 0
                    ? `${applyProgress.failed} SKU(s) com erro ou revisao necessaria`
                    : 'Lote concluido com sucesso'}
              </p>
            </div>
            <div className="sm:min-w-[240px]">
              <div className="h-2 rounded-full bg-border overflow-hidden">
                <div
                  className="h-full rounded-full bg-primary transition-all duration-300"
                  style={{ width: `${applyProgress.total > 0 ? (applyProgress.completed / applyProgress.total) * 100 : 0}%` }}
                />
              </div>
              <div className="mt-1 flex items-center justify-between text-[10px] text-muted-foreground">
                <span>{applyProgress.completed}/{applyProgress.total} processados</span>
                <span>{applyProgress.failed} erro(s)</span>
              </div>
            </div>
          </div>
        </Card.Root>
      )}

      {result?.rows?.length ? (
        <Card.Root>
          <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border bg-secondary/20">
            <div>
              <h4 className="text-sm font-semibold text-foreground">Comparacao em massa</h4>
              <p className="text-xs text-muted-foreground">Revise as sugestoes antes de aplicar. Nome e modelo/ano ficam desmarcados por padrao.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button color="secondary" size="sm" onClick={() => applyRows(selectedRows, 'selected')} isLoading={applyingKey === 'selected'} disabled={!selectedRows.length || (!!applyingKey && applyingKey !== 'selected')}>
                {applyingKey === 'selected' && applyProgress?.key === 'selected'
                  ? `Atualizado ${applyProgress.success} de ${applyProgress.total}`
                  : 'Atualizar selecionados'}
              </Button>
              <Button color="primary" size="sm" onClick={() => applyRows(readyRows, 'ready')} isLoading={applyingKey === 'ready'} disabled={!readyRows.length || (!!applyingKey && applyingKey !== 'ready')}>
                {applyingKey === 'ready' && applyProgress?.key === 'ready'
                  ? `Atualizado ${applyProgress.success} de ${applyProgress.total}`
                  : 'Atualizar tudo pronto'}
              </Button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border bg-secondary/30">
                  <th className="text-left py-2.5 px-3 font-medium text-muted-foreground">SKU</th>
                  <th className="text-left py-2.5 px-3 font-medium text-muted-foreground min-w-[220px]">Produto atual</th>
                  <th className="text-left py-2.5 px-3 font-medium text-muted-foreground min-w-[180px]">Categoria atual</th>
                  <th className="text-left py-2.5 px-3 font-medium text-muted-foreground min-w-[180px]">Toyota</th>
                  <th className="text-left py-2.5 px-3 font-medium text-muted-foreground min-w-[240px]">Categoria sugerida</th>
                  <th className="text-center py-2.5 px-3 font-medium text-muted-foreground">Conf.</th>
                  <th className="text-center py-2.5 px-3 font-medium text-muted-foreground">Status</th>
                  <th className="text-right py-2.5 px-3 font-medium text-muted-foreground">Acoes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {result.rows.map((row) => {
                  const selected = selection[row.sku] || { fields: [], categoryId: row.suggestion?.categoryId || '' };
                  const confidence = Math.round((row.suggestion?.confidence || 0) * 100);
                  const applyState = rowApplyState[row.sku];
                  const rowIsPending = applyState?.state === 'pending';
                  return (
                    <React.Fragment key={row.sku}>
                      <tr className="hover:bg-secondary/20 transition-colors align-top">
                        <td className="py-3 px-3 font-mono text-foreground whitespace-nowrap">
                          <button type="button" onClick={() => onSelectSku(row.sku)} className="text-primary hover:underline">
                            {row.sku}
                          </button>
                        </td>
                        <td className="py-3 px-3">
                          <p className="font-medium text-foreground line-clamp-2">{row.product?.name || 'Produto nao encontrado'}</p>
                          {row.product && (
                            <p className="text-[10px] text-muted-foreground mt-1">
                              Peso: {row.product.weight ?? 'vazio'} kg | Imagens: {row.product.image_count}
                            </p>
                          )}
                        </td>
                        <td className="py-3 px-3">
                          {row.product?.category_names?.length ? (
                            <div className="space-y-1">
                              {row.product.category_names.slice(0, 2).map((category) => (
                                <p key={category.id} className="text-muted-foreground line-clamp-1">{category.path}</p>
                              ))}
                            </div>
                          ) : <span className="text-destructive">Sem categoria</span>}
                        </td>
                        <td className="py-3 px-3">
                          {row.toyotaFound ? (
                            <div>
                              <p className="font-medium text-foreground line-clamp-2">{row.toyota.categoria || row.toyota.name || 'Toyota'}</p>
                              {row.toyota.subcategoria && <p className="text-muted-foreground line-clamp-1">{row.toyota.subcategoria}</p>}
                              <p className="text-[10px] text-muted-foreground mt-1">Match: {row.toyota.matchedPartno || row.sku}</p>
                            </div>
                          ) : <span className="text-muted-foreground">Sem match</span>}
                        </td>
                        <td className="py-3 px-3">
                          {row.suggestion?.categoryId ? (
                            <select
                              value={selected.categoryId || row.suggestion.categoryId || ''}
                              onChange={(event) => setCategory(row.sku, event.target.value)}
                              className="w-full rounded-lg border border-border bg-background px-2 py-1.5 text-xs outline-none focus:border-primary"
                            >
                              {row.suggestion.alternatives?.map((alt) => (
                                <option key={`alt-${alt.categoryId}`} value={alt.categoryId}>
                                  {alt.categoryPath} ({Math.round(alt.confidence * 100)}%)
                                </option>
                              ))}
                              <option disabled>--- todas as categorias ---</option>
                              {result.categories.map((category) => (
                                <option key={`cat-${category.id}`} value={category.id}>{category.path}</option>
                              ))}
                            </select>
                          ) : <span className="text-muted-foreground">Sem sugestao</span>}
                          {row.suggestion?.reason && <p className="text-[10px] text-muted-foreground mt-1 line-clamp-2">{row.suggestion.reason}</p>}
                        </td>
                        <td className="py-3 px-3 text-center">
                          <span className={cn("font-bold", confidence >= 70 ? 'text-green-600' : confidence >= 45 ? 'text-yellow-600' : 'text-red-600')}>
                            {confidence}%
                          </span>
                          {row.suggestion?.method && <p className="text-[10px] text-muted-foreground">{row.suggestion.method}</p>}
                        </td>
                        <td className="py-3 px-3 text-center">
                          <Badge variant="pill-color" color={categoryStatusColor(row.status) as any} size="xs">
                            {row.statusLabel}
                          </Badge>
                          {applyState?.state === 'success' && (
                            <p className="mt-1 flex items-center justify-center gap-1 text-[10px] font-medium text-green-600">
                              <CheckCircle2 className="w-3 h-3" />
                              Atualizado com sucesso
                            </p>
                          )}
                          {applyState?.state === 'pending' && (
                            <p className="mt-1 flex items-center justify-center gap-1 text-[10px] text-primary">
                              <Loader2 className="w-3 h-3 animate-spin" />
                              Atualizando...
                            </p>
                          )}
                          {applyState?.state === 'error' && (
                            <p className="mt-1 text-[10px] text-destructive leading-tight">
                              {applyState.message}
                            </p>
                          )}
                        </td>
                        <td className="py-3 px-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button color="tertiary" size="xs" onClick={() => setExpandedSku(expandedSku === row.sku ? null : row.sku)}>
                              Detalhes
                            </Button>
                            <Button color="primary" size="xs" onClick={() => applyRows([row], row.sku)} isLoading={applyingKey === row.sku || rowIsPending} disabled={!buildUpdate(row) || (!!applyingKey && applyingKey !== row.sku)}>
                              UPDATE
                            </Button>
                          </div>
                        </td>
                      </tr>
                      {expandedSku === row.sku && (
                        <tr className="bg-secondary/10">
                          <td colSpan={8} className="p-4">
                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                              <div className="space-y-2">
                                <h5 className="text-xs font-semibold text-foreground uppercase">Campos para update</h5>
                                {(Object.keys(CATEGORY_FIELD_LABELS) as CategoryEnrichmentField[]).map((field) => {
                                  const fieldSuggestion = row.fieldSuggestions?.[field];
                                  const disabled = !fieldSuggestion?.canApply;
                                  return (
                                    <label key={field} className={cn("flex items-start gap-2 rounded-lg border border-border bg-card p-2", disabled && "opacity-50")}>
                                      <input
                                        type="checkbox"
                                        checked={selected.fields.includes(field)}
                                        disabled={disabled}
                                        onChange={() => toggleField(row.sku, field)}
                                        className="mt-0.5"
                                      />
                                      <span className="min-w-0">
                                        <span className="block text-xs font-medium text-foreground">{CATEGORY_FIELD_LABELS[field]}</span>
                                        <span className="block text-[10px] text-muted-foreground truncate">
                                          {formatValue(fieldSuggestion?.current)} -&gt; {formatValue(fieldSuggestion?.suggested)}
                                        </span>
                                      </span>
                                    </label>
                                  );
                                })}
                              </div>
                              <div className="space-y-2">
                                <h5 className="text-xs font-semibold text-foreground uppercase">Toyota</h5>
                                <div className="rounded-lg border border-border bg-card p-3 text-xs space-y-1.5">
                                  <p><span className="text-muted-foreground">Nome:</span> {row.toyota.seo_title || row.toyota.name || 'N/A'}</p>
                                  <p><span className="text-muted-foreground">Categoria:</span> {row.toyota.categoria || 'N/A'} {row.toyota.subcategoria ? `> ${row.toyota.subcategoria}` : ''}</p>
                                  <p><span className="text-muted-foreground">Peso:</span> {row.toyota.weight ?? 'N/A'} kg</p>
                                  <p><span className="text-muted-foreground">Compatibilidade:</span> {row.toyota.compatibilityLines?.length || 0} linhas</p>
                                </div>
                              </div>
                              <div className="space-y-2">
                                <h5 className="text-xs font-semibold text-foreground uppercase">Alternativas</h5>
                                <div className="rounded-lg border border-border bg-card divide-y divide-border">
                                  {(row.suggestion?.alternatives || []).slice(0, 5).map((alt) => (
                                    <button
                                      key={alt.categoryId}
                                      type="button"
                                      onClick={() => setCategory(row.sku, alt.categoryId)}
                                      className={cn("w-full text-left px-3 py-2 text-xs hover:bg-secondary/40", selected.categoryId === alt.categoryId && "bg-primary/5 text-primary")}
                                    >
                                      <span className="block font-medium">{alt.categoryPath}</span>
                                      <span className="text-[10px] text-muted-foreground">{Math.round(alt.confidence * 100)}% | {alt.reason}</span>
                                    </button>
                                  ))}
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card.Root>
      ) : null}

      <Card.Root>
        <div className="p-4">
          <div className="flex items-center justify-between gap-3 mb-3">
            <h4 className="text-sm font-semibold text-foreground">Historico de updates</h4>
            <Button color="tertiary" size="xs" onClick={loadHistory} iconLeading={<RefreshCw className="w-3.5 h-3.5" />}>Atualizar</Button>
          </div>
          {history.length ? (
            <div className="divide-y divide-border rounded-lg border border-border overflow-hidden">
              {history.slice(0, 8).map((item) => (
                <div key={item.id || `${item.sku}-${item.applied_at}`} className="px-3 py-2 text-xs flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="font-mono font-semibold text-foreground">{item.sku}</span>
                    <span className="text-muted-foreground ml-2">{item.applied_fields?.join(', ') || 'update'}</span>
                  </div>
                  <span className="text-muted-foreground">{item.applied_at ? new Date(item.applied_at).toLocaleString('pt-BR') : ''}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">Nenhum update de categoria registrado ainda.</p>
          )}
        </div>
      </Card.Root>
    </div>
  );
}

export function EnriquecimentoPage({ onOpenCategoryEngine }: { onOpenCategoryEngine?: () => void } = {}) {
  const [tab, setTab] = useState<'compare' | 'batch' | 'category'>('compare');
  const [searchInput, setSearchInput] = useState('');
  const [compareLoading, setCompareLoading] = useState(false);
  const [compareResult, setCompareResult] = useState<CompareResult | null>(null);
  const [compareError, setCompareError] = useState('');
  const [showAI, setShowAI] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleCompare = useCallback(async (sku?: string) => {
    const q = (sku || searchInput).trim().toUpperCase();
    if (!q) { toast.error('Digite um SKU'); return; }
    setSearchInput(q); setCompareLoading(true); setCompareError(''); setCompareResult(null); setShowAI(false);
    try {
      const res = await adminFetch(`${API}/admin/catalogo/comparar`, {
        method: 'POST',
        body: JSON.stringify({ sku: q }),
      });
      if (!res.ok) {
        const text = await res.text();
        let msg = `HTTP ${res.status}`;
        try { const j = JSON.parse(text); msg = j.error || msg; } catch { msg = text.slice(0, 200) || msg; }
        throw new Error(msg);
      }
      const json = await res.json();
      console.log('[Comparar] Response _debug:', JSON.stringify(json._debug, null, 2));
      setCompareResult(json);
      toast.success(`SKU ${q} analisado`);
    } catch (err: any) {
      setCompareError(err.message); toast.error('Falha ao comparar');
    } finally { setCompareLoading(false); }
  }, [searchInput]);

  return (
    <div className="h-full bg-background text-foreground flex flex-col">
      {/* Header */}
      <div className="border-b border-border bg-card shrink-0">
        <div className="px-6 py-5">
          <h1 className="text-lg font-semibold text-foreground">Enriquecimento IA</h1>
          <p className="text-sm text-muted-foreground mt-1">Compare e melhore seus produtos: Magento × Catálogo Toyota</p>
        </div>

        {/* Tabs */}
        <div className="px-6 flex items-center gap-1 -mb-px">
          {[
            { id: 'compare' as const, label: 'Comparar SKU', icon: ArrowUpDown },
            { id: 'batch' as const, label: 'Análise em Lote', icon: BarChart3 },
            { id: 'category' as const, label: 'Categorias Toyota', icon: Tag },
          ].map(t => (
            <button key={t.id} type="button" onClick={() => setTab(t.id)}
              className={cn(
                "flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors cursor-pointer",
                tab === t.id ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
              )}>
              <t.icon className="w-4 h-4" />
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-[1200px] mx-auto px-6 py-6 space-y-5">

          {/* Tab: Compare */}
          {tab === 'compare' && (
            <>
              {/* Search */}
              <div className="flex items-center gap-3">
                <div className="flex-1 max-w-xl">
                  <Input ref={inputRef} value={searchInput}
                    onChange={e => setSearchInput(e.target.value.toUpperCase())}
                    onKeyDown={e => e.key === 'Enter' && handleCompare()}
                    placeholder="Digite o SKU do produto (ex: 2367039475)"
                    iconLeading={Search} className="font-mono" />
                </div>
                <Button color="primary" size="md" onClick={() => handleCompare()} isLoading={compareLoading}
                  iconLeading={<ArrowUpDown className="w-4 h-4" />}>Comparar</Button>
              </div>

              {compareLoading && (
                <div className="py-16 text-center">
                  <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto mb-4" />
                  <p className="text-sm text-muted-foreground">Buscando nos dois bancos e calculando score...</p>
                </div>
              )}

              {compareError && !compareLoading && (
                <Card.Root>
                  <div className="p-5 flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-destructive shrink-0" />
                    <div>
                      <p className="text-sm font-semibold text-foreground">Erro</p>
                      <p className="text-sm text-muted-foreground mt-1">{compareError}</p>
                    </div>
                  </div>
                </Card.Root>
              )}

              {compareResult && !compareLoading && (
                <>
                  <ComparePanel data={compareResult} onEnrichAI={() => setShowAI(true)} />
                  {showAI && (
                    <AIEnrichment sku={compareResult.sku} magento={compareResult.magento} toyota={compareResult.toyota} />
                  )}
                </>
              )}

              {!compareResult && !compareLoading && !compareError && (
                <Card.Root>
                  <div className="p-10 text-center">
                    <ArrowUpDown className="w-10 h-10 text-muted-foreground mx-auto mb-4" />
                    <h3 className="text-base font-semibold text-foreground mb-2">Compare lado a lado</h3>
                    <p className="text-sm text-muted-foreground max-w-md mx-auto">
                      Digite um SKU para comparar os dados do seu Magento com o catálogo oficial Toyota.
                      O sistema calcula um score de qualidade e sugere melhorias automaticamente.
                    </p>
                  </div>
                </Card.Root>
              )}
            </>
          )}

          {/* Tab: Batch */}
          {tab === 'batch' && (
            <BatchPanel onSelectSku={(sku) => { setTab('compare'); handleCompare(sku); }} />
          )}

          {tab === 'category' && (
            <div className="space-y-5">
              <CategoryEngineSummaryCard onOpenConsole={onOpenCategoryEngine} />
              <CategoryEnrichmentPanel onSelectSku={(sku) => { setTab('compare'); handleCompare(sku); }} />
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
