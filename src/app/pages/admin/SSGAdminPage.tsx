// ─── SSG Admin — Static Site Generation for Product Pages ───────────────────
// Painel para gerenciar snapshots HTML estáticos de produtos.
// Features: gerar todos, status ao vivo, purge, preview, Service Worker info.

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  FileCode2, Play, Square, RefreshCw, Trash2, Eye, Loader2,
  CheckCircle2, XCircle, Clock, Zap, Globe, HardDrive, Wifi, WifiOff,
  ChevronRight, AlertTriangle, Info, ExternalLink, BarChart3,
} from 'lucide-react';
import { toast } from 'sonner';
import { adminFetch } from '../../lib/admin-auth';
import { projectId, publicAnonKey } from '../../../../utils/supabase/info';
import { getSWStatus, sendSWMessage } from '../../lib/sw-register';
import { prefetchSnapshots, getCacheStats, clearAllCaches } from '../../lib/product-cache';

const API = `https://${projectId}.supabase.co/functions/v1/make-server-1d6e33e0/snapshot`;
const H: HeadersInit = {
  Authorization: `Bearer ${publicAnonKey}`,
  'Content-Type': 'application/json',
};

// ─── Types ─────────────────────────────────────────────────────────────────────

interface Stats {
  total_snapshots: number;
  oldest_snapshot: string | null;
  newest_snapshot: string | null;
  cache_ttl_hours: number;
}

interface SSGJob {
  status: 'idle' | 'running' | 'completed' | 'error';
  started_at?: string;
  completed_at?: string;
  total_products?: number;
  processed?: number;
  generated?: number;
  skipped?: number;
  errors?: number;
  progress?: number;
  elapsed_seconds?: number;
  done?: boolean;
  force?: boolean;
  batch_size?: number;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

function fmtDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m < 60) return `${m}m${s > 0 ? `${s}s` : ''}`;
  return `${Math.floor(m / 60)}h${m % 60}m`;
}

function fmtAgo(iso: string | null): string {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'agora';
  if (mins < 60) return `${mins}min atrás`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h atrás`;
  const days = Math.floor(hours / 24);
  return `${days}d atrás`;
}

// ─── Main Component ────────────────────────────────────────────────────────────

export function SSGAdminPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [job, setJob] = useState<SSGJob>({ status: 'idle' });
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [purging, setPurging] = useState(false);
  const [previewSku, setPreviewSku] = useState('');
  const [previewHtml, setPreviewHtml] = useState('');
  const [previewLoading, setPreviewLoading] = useState(false);
  const stepIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [forceRegenerate, setForceRegenerate] = useState(false);

  // ─── Load stats + job status ─────────────────────────────────────────────

  const loadData = useCallback(async () => {
    try {
      const [statsRes, jobRes] = await Promise.all([
        fetch(`${API}/stats`, { headers: H }),
        fetch(`${API}/generate-all/status`, { headers: H }),
      ]);
      const [statsData, jobData] = await Promise.all([
        statsRes.json(),
        jobRes.json(),
      ]);
      setStats(statsData);
      setJob(jobData || { status: 'idle' });

      // If job is running, auto-start step loop
      if (jobData?.status === 'running' && !stepIntervalRef.current) {
        startStepLoop();
      }
    } catch (e: any) {
      console.error('[SSG] Load error:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); return () => stopStepLoop(); }, [loadData]);

  // ─── Step Loop ───────────────────────────────────────────────────────────

  const runStep = useCallback(async () => {
    try {
      const res = await fetch(`${API}/generate-all/step`, {
        method: 'POST',
        headers: H,
      });
      const data = await res.json();
      setJob(data);

      if (data.done || data.status === 'completed' || data.status === 'error') {
        stopStepLoop();
        setGenerating(false);
        // Reload stats
        const sr = await fetch(`${API}/stats`, { headers: H });
        setStats(await sr.json());

        if (data.status === 'completed') {
          toast.success(`SSG concluído! ${data.generated} páginas geradas, ${data.skipped} skipped.`);
        }
      }
    } catch (e: any) {
      console.error('[SSG] Step error:', e);
    }
  }, []);

  const startStepLoop = () => {
    if (stepIntervalRef.current) return;
    // Run first step immediately, then every 2s
    runStep();
    stepIntervalRef.current = setInterval(runStep, 2000);
  };

  const stopStepLoop = () => {
    if (stepIntervalRef.current) {
      clearInterval(stepIntervalRef.current);
      stepIntervalRef.current = null;
    }
  };

  // ─── Actions ─────────────────────────────────────────────────────────────

  const startGeneration = async () => {
    setGenerating(true);
    try {
      const res = await fetch(`${API}/generate-all`, {
        method: 'POST',
        headers: H,
        body: JSON.stringify({ force: forceRegenerate, batch_size: 100 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao iniciar');
      setJob(data);
      toast.success('Job SSG iniciado!');
      startStepLoop();
    } catch (e: any) {
      console.error('[SSG] Start error:', e);
      toast.error('Erro: ' + e.message);
      setGenerating(false);
    }
  };

  const stopGeneration = async () => {
    stopStepLoop();
    setGenerating(false);
    // Mark job as completed (stopped manually)
    setJob(prev => ({ ...prev, status: 'completed', done: true }));
    toast.info('Geração pausada');
  };

  const purgeAll = async () => {
    if (!confirm('Tem certeza? Isso apagará TODOS os snapshots HTML gerados. Eles podem ser regenerados depois.')) return;
    setPurging(true);
    try {
      const res = await fetch(`${API}/purge`, {
        method: 'DELETE',
        headers: H,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro');
      toast.success(`${data.purged} snapshots removidos`);
      loadData();
    } catch (e: any) {
      toast.error('Erro ao purgar: ' + e.message);
    } finally {
      setPurging(false);
    }
  };

  const loadPreview = async () => {
    if (!previewSku.trim()) return toast.error('Digite um SKU');
    setPreviewLoading(true);
    setPreviewHtml('');
    try {
      const res = await fetch(`${API}/product/${previewSku.trim()}`, { headers: H });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(`HTTP ${res.status}: ${txt.slice(0, 200)}`);
      }
      const html = await res.text();
      setPreviewHtml(html);
    } catch (e: any) {
      toast.error('Erro: ' + e.message);
    } finally {
      setPreviewLoading(false);
    }
  };

  // ─── Render ──────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const isRunning = generating || job.status === 'running';

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-[1200px] mx-auto px-4 lg:px-8 pt-6 pb-16">
        {/* Header */}
        <div className="flex items-start gap-4 mb-8">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shrink-0 shadow-md">
            <FileCode2 className="w-6 h-6 text-white" />
          </div>
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-foreground tracking-tight">SSG — Gerador de HTML Estático</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Pré-renderiza páginas de produto como HTML completo para SEO (crawlers), performance e cache offline
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* ─── Left column ─────────────────────────────────────────────── */}
          <div className="lg:col-span-2 space-y-6">

            {/* Stats Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                {
                  label: 'Snapshots',
                  value: stats?.total_snapshots ?? 0,
                  icon: HardDrive,
                  color: 'text-indigo-600 bg-indigo-100',
                },
                {
                  label: 'Mais antigo',
                  value: fmtAgo(stats?.oldest_snapshot || null) || '—',
                  icon: Clock,
                  color: 'text-amber-600 bg-amber-100',
                },
                {
                  label: 'Mais recente',
                  value: fmtAgo(stats?.newest_snapshot || null) || '—',
                  icon: Zap,
                  color: 'text-green-600 bg-green-100',
                },
                {
                  label: 'TTL Cache',
                  value: `${stats?.cache_ttl_hours || 24}h`,
                  icon: RefreshCw,
                  color: 'text-blue-600 bg-blue-100',
                },
              ].map((card, i) => (
                <div key={i} className="bg-card rounded-xl border border-border p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${card.color}`}>
                      <card.icon className="w-3.5 h-3.5" />
                    </div>
                  </div>
                  <p className="text-lg font-bold text-foreground">{card.value}</p>
                  <p className="text-xs text-muted-foreground">{card.label}</p>
                </div>
              ))}
            </div>

            {/* Generation Panel */}
            <div className="bg-card rounded-2xl border border-border p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="font-bold text-foreground flex items-center gap-2">
                    <BarChart3 className="w-4 h-4 text-indigo-500" />
                    Geração em Lote
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Gera HTML estático para todos os produtos com paginação por cursor (sem estourar memória)
                  </p>
                </div>
              </div>

              {/* Progress bar (when running) */}
              {isRunning && job.total_products && job.total_products > 0 && (
                <div className="mb-5">
                  <div className="flex items-center justify-between text-xs text-muted-foreground mb-1.5">
                    <span className="font-semibold">
                      {job.processed || 0} / {job.total_products} processados
                    </span>
                    <span className="font-mono">{job.progress || 0}%</span>
                  </div>
                  <div className="w-full h-3 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full transition-all duration-500"
                      style={{ width: `${Math.min(job.progress || 0, 100)}%` }}
                    />
                  </div>
                  <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3 text-green-500" />
                      {job.generated || 0} gerados
                    </span>
                    <span className="flex items-center gap-1">
                      <ChevronRight className="w-3 h-3 text-amber-500" />
                      {job.skipped || 0} skipped
                    </span>
                    {(job.errors || 0) > 0 && (
                      <span className="flex items-center gap-1">
                        <XCircle className="w-3 h-3 text-red-500" />
                        {job.errors} erros
                      </span>
                    )}
                    {job.elapsed_seconds != null && (
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {fmtDuration(job.elapsed_seconds)}
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* Completed summary */}
              {job.status === 'completed' && !isRunning && (
                <div className="mb-5 bg-green-50 border border-green-200 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <CheckCircle2 className="w-4 h-4 text-green-600" />
                    <span className="text-sm font-bold text-green-800">Geração concluída</span>
                  </div>
                  <div className="flex gap-4 text-xs text-green-700">
                    <span>{job.generated || 0} gerados</span>
                    <span>{job.skipped || 0} skipped (já existiam)</span>
                    <span>{job.errors || 0} erros</span>
                    {job.elapsed_seconds != null && <span>{fmtDuration(job.elapsed_seconds)}</span>}
                  </div>
                </div>
              )}

              {/* Options */}
              <div className="flex items-center gap-4 mb-4">
                <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={forceRegenerate}
                    onChange={e => setForceRegenerate(e.target.checked)}
                    className="w-4 h-4 rounded border-border text-primary focus:ring-primary/20"
                    disabled={isRunning}
                  />
                  <span className="text-foreground font-medium">Forçar regeneração</span>
                  <span className="text-xs text-muted-foreground">(ignora cache de 24h)</span>
                </label>
              </div>

              {/* Action buttons */}
              <div className="flex gap-3">
                {!isRunning ? (
                  <button
                    onClick={startGeneration}
                    className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-xl font-semibold text-sm hover:bg-indigo-700 transition-colors"
                  >
                    <Play className="w-4 h-4" />
                    Gerar Todos
                  </button>
                ) : (
                  <button
                    onClick={stopGeneration}
                    className="flex items-center gap-2 px-5 py-2.5 bg-red-600 text-white rounded-xl font-semibold text-sm hover:bg-red-700 transition-colors"
                  >
                    <Square className="w-4 h-4" />
                    Pausar
                  </button>
                )}

                <button
                  onClick={loadData}
                  disabled={isRunning}
                  className="flex items-center gap-2 px-4 py-2.5 bg-muted text-foreground rounded-xl font-medium text-sm hover:bg-muted/80 disabled:opacity-40 transition-colors"
                >
                  <RefreshCw className="w-4 h-4" />
                  Atualizar
                </button>

                <button
                  onClick={purgeAll}
                  disabled={isRunning || purging}
                  className="flex items-center gap-2 px-4 py-2.5 bg-red-50 text-red-700 border border-red-200 rounded-xl font-medium text-sm hover:bg-red-100 disabled:opacity-40 transition-colors ml-auto"
                >
                  {purging ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                  Limpar Tudo
                </button>
              </div>
            </div>

            {/* Preview */}
            <div className="bg-card rounded-2xl border border-border p-6">
              <h3 className="font-bold text-foreground flex items-center gap-2 mb-1">
                <Eye className="w-4 h-4 text-purple-500" />
                Preview de Snapshot
              </h3>
              <p className="text-xs text-muted-foreground mb-4">
                Visualize o HTML estático de um produto específico (gera sob demanda se necessário)
              </p>

              <div className="flex gap-2 mb-4">
                <input
                  type="text"
                  value={previewSku}
                  onChange={e => setPreviewSku(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && loadPreview()}
                  placeholder="Ex: PZ49E-C2340-ZA"
                  className="flex-1 h-10 px-3 rounded-lg border border-border bg-background text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-colors"
                />
                <button
                  onClick={loadPreview}
                  disabled={previewLoading || !previewSku.trim()}
                  className="flex items-center gap-2 px-4 py-2 bg-foreground text-background rounded-lg text-sm font-semibold hover:bg-foreground/90 disabled:opacity-40 transition-colors"
                >
                  {previewLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}
                  Ver
                </button>
              </div>

              {previewHtml && (
                <div className="rounded-xl border border-border overflow-hidden bg-white">
                  {/* Browser chrome */}
                  <div className="flex items-center gap-3 px-4 py-2.5 bg-[#e8e8e8] border-b border-[#d0d0d0]">
                    <div className="flex gap-1.5">
                      <div className="w-3 h-3 rounded-full bg-[#ff5f57]" />
                      <div className="w-3 h-3 rounded-full bg-[#febc2e]" />
                      <div className="w-3 h-3 rounded-full bg-[#28c840]" />
                    </div>
                    <div className="flex-1 bg-white rounded-md px-3 py-1 text-xs text-[#888] font-mono text-center truncate">
                      snapshot/product/{previewSku}
                    </div>
                  </div>
                  <iframe
                    srcDoc={previewHtml}
                    sandbox="allow-same-origin"
                    className="w-full border-0"
                    style={{ height: '500px' }}
                    title="Snapshot Preview"
                  />
                </div>
              )}
            </div>
          </div>

          {/* ─── Right column ────────────────────────────────────────────── */}
          <div className="space-y-6">

            {/* How it works */}
            <div className="bg-indigo-50 border border-indigo-200 rounded-2xl p-5">
              <div className="flex items-center gap-2 mb-3">
                <Info className="w-4 h-4 text-indigo-600 shrink-0" />
                <span className="text-sm font-bold text-indigo-800">Como funciona</span>
              </div>
              <ul className="space-y-2.5 text-xs text-indigo-700 leading-relaxed">
                <li className="flex gap-2">
                  <span className="w-5 h-5 rounded-md bg-indigo-200 text-indigo-700 flex items-center justify-center font-bold shrink-0 text-[10px]">1</span>
                  <span>Para cada produto, gera HTML completo com meta tags SEO, JSON-LD, Open Graph e conteúdo above-the-fold</span>
                </li>
                <li className="flex gap-2">
                  <span className="w-5 h-5 rounded-md bg-indigo-200 text-indigo-700 flex items-center justify-center font-bold shrink-0 text-[10px]">2</span>
                  <span>Armazena no KV com cache de 24h. Crawlers (Google, Bing) recebem HTML instantâneo</span>
                </li>
                <li className="flex gap-2">
                  <span className="w-5 h-5 rounded-md bg-indigo-200 text-indigo-700 flex items-center justify-center font-bold shrink-0 text-[10px]">3</span>
                  <span>Paginação por cursor — nunca carrega tudo na memória, seguro para milhares de produtos</span>
                </li>
                <li className="flex gap-2">
                  <span className="w-5 h-5 rounded-md bg-indigo-200 text-indigo-700 flex items-center justify-center font-bold shrink-0 text-[10px]">4</span>
                  <span>Ao atualizar o site, clique <strong>"Gerar Todos"</strong> com <strong>"Forçar regeneração"</strong> para re-renderizar tudo</span>
                </li>
              </ul>
            </div>

            {/* SEO Benefits */}
            <div className="bg-green-50 border border-green-200 rounded-2xl p-5">
              <div className="flex items-center gap-2 mb-3">
                <Globe className="w-4 h-4 text-green-600 shrink-0" />
                <span className="text-sm font-bold text-green-800">Benefícios SEO</span>
              </div>
              <ul className="space-y-1.5 text-xs text-green-700">
                <li>&#10003; HTML crawlable — Google indexa sem JS</li>
                <li>&#10003; JSON-LD Product schema (preço, estoque, marca)</li>
                <li>&#10003; BreadcrumbList schema para navegação</li>
                <li>&#10003; Open Graph + Twitter Card completos</li>
                <li>&#10003; Canonical URLs para evitar duplicação</li>
                <li>&#10003; AutoPartsStore Organization schema</li>
                <li>&#10003; Vehicle compatibility (modelo Toyota)</li>
              </ul>
            </div>

            {/* Offline / Performance */}
            <div className="bg-purple-50 border border-purple-200 rounded-2xl p-5">
              <div className="flex items-center gap-2 mb-3">
                <Zap className="w-4 h-4 text-purple-600 shrink-0" />
                <span className="text-sm font-bold text-purple-800">Performance & Offline</span>
              </div>
              <ul className="space-y-1.5 text-xs text-purple-700">
                <li>&#9889; HTML servido em ~50ms (vs ~800ms SPA)</li>
                <li>&#9889; Cache-Control: s-maxage=86400 + stale-while-revalidate</li>
                <li>&#9889; Compatível com CDN/edge caching (Cloudflare)</li>
                <li>&#9889; Service Worker cacheia snapshots localmente</li>
                <li>&#9889; Produtos visitados ficam disponíveis offline</li>
                <li>&#9889; Ideal para previews em WhatsApp/redes sociais</li>
              </ul>
            </div>

            {/* Auto-Triggers */}
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5">
              <div className="flex items-center gap-2 mb-3">
                <RefreshCw className="w-4 h-4 text-amber-600 shrink-0" />
                <span className="text-sm font-bold text-amber-800">Auto-Regeneração</span>
              </div>
              <ul className="space-y-1.5 text-xs text-amber-700 leading-relaxed">
                <li>&#8226; Quando o <strong>sync Magento</strong> conclui, um job SSG é automaticamente iniciado</li>
                <li>&#8226; Quando a <strong>indexação Meili</strong> termina, idem — snapshots são atualizados</li>
                <li>&#8226; Jobs manuais via <strong>"Gerar Todos"</strong> sobrescrevem o auto-trigger</li>
                <li>&#8226; O frontend chama <code className="bg-amber-100 px-1 rounded font-mono text-[10px]">POST /step</code> em loop até <code className="bg-amber-100 px-1 rounded font-mono text-[10px]">done=true</code></li>
              </ul>
            </div>

            {/* Cloudflare Worker */}
            <div className="bg-orange-50 border border-orange-200 rounded-2xl p-5">
              <div className="flex items-center gap-2 mb-3">
                <Globe className="w-4 h-4 text-orange-600 shrink-0" />
                <span className="text-sm font-bold text-orange-800">Cloudflare Worker (Crawlers)</span>
              </div>
              <p className="text-xs text-orange-700 leading-relaxed mb-2">
                Template pronto em <code className="bg-orange-100 px-1 rounded font-mono text-[10px]">cloudflare-worker-template.tsx</code>.
                Detecta User-Agent de crawlers (Google, Bing, Facebook, WhatsApp, etc.) e serve HTML estático do SSG.
              </p>
              <ul className="space-y-1 text-xs text-orange-700">
                <li>&#8226; Usuários reais → SPA normal</li>
                <li>&#8226; Bots/Crawlers → HTML snapshot instantâneo</li>
                <li>&#8226; Edge cache: 24h (CDN)</li>
                <li>&#8226; Vary: User-Agent (cache split)</li>
              </ul>
            </div>

            {/* API Reference */}
            <div className="bg-card rounded-2xl border border-border p-5">
              <h4 className="text-sm font-bold text-foreground mb-3">Endpoints da API</h4>
              <div className="space-y-2 text-xs font-mono">
                {[
                  { method: 'GET', path: '/product/:sku', desc: 'HTML do produto' },
                  { method: 'POST', path: '/generate-all', desc: 'Inicia job SSG' },
                  { method: 'POST', path: '/generate-all/step', desc: 'Executa step' },
                  { method: 'GET', path: '/generate-all/status', desc: 'Status do job' },
                  { method: 'POST', path: '/generate-batch', desc: 'Batch com cursor' },
                  { method: 'POST', path: '/invalidate', desc: 'Invalida snapshots' },
                  { method: 'GET', path: '/stats', desc: 'Estatísticas' },
                  { method: 'GET', path: '/manifest', desc: 'Lista para SW' },
                  { method: 'DELETE', path: '/purge', desc: 'Limpa tudo' },
                ].map((ep, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                      ep.method === 'GET' ? 'bg-green-100 text-green-700' :
                      ep.method === 'POST' ? 'bg-blue-100 text-blue-700' :
                      'bg-red-100 text-red-700'
                    }`}>{ep.method}</span>
                    <span className="text-foreground truncate">{ep.path}</span>
                    <span className="text-muted-foreground ml-auto text-[10px] font-sans">{ep.desc}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}