import React, { useState, useCallback, useRef } from 'react';
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

export function EnriquecimentoPage() {
  const [tab, setTab] = useState<'compare' | 'batch'>('compare');
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
        </div>
      </main>
    </div>
  );
}