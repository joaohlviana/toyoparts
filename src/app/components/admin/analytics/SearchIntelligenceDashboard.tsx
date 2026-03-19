// ═══════════════════════════════════════════════════════════════════════════════
// Search Intelligence Dashboard — Enterprise
// ═══════════════════════════════════════════════════════════════════════════════
// 3 pages: Search Intelligence | Navigation & Recommendations | Operations
// Real data from /si/intelligence/* endpoints — zero mock data.

import React, { useState, useEffect, useCallback } from 'react';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import {
  Search, TrendingUp, TrendingDown, AlertTriangle, MousePointer2,
  Users, BarChart3, Loader2, RefreshCw, ArrowUpRight, ArrowDownRight,
  Eye, ShoppingCart, Filter, Activity, Target, Crosshair,
  Lightbulb, AlertCircle, ChevronRight, ExternalLink, Zap,
} from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../../ui/tabs';
import { Card } from '../../base/card';
import { siAnalytics } from '../../../lib/search-intelligence-api';

// ─── Period Selector ────────────────────────────────────────────────────────

const PERIODS = [
  { label: '7d', value: 7 },
  { label: '14d', value: 14 },
  { label: '30d', value: 30 },
  { label: '90d', value: 90 },
];

const FUNNEL_COLORS = ['#3b82f6', '#6366f1', '#8b5cf6', '#a855f7'];
const POSITION_COLORS = ['#10b981', '#22c55e', '#84cc16', '#eab308', '#f97316', '#ef4444'];

// ─── Main Component ─────────────────────────────────────────────────────────

export function SearchIntelligenceDashboard() {
  const [period, setPeriod] = useState(7);
  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState<any>(null);
  const [topTerms, setTopTerms] = useState<any>(null);
  const [zeroResults, setZeroResults] = useState<any>(null);
  const [quality, setQuality] = useState<any>(null);
  const [funnel, setFunnel] = useState<any>(null);
  const [coViews, setCoViews] = useState<any>(null);
  const [posDist, setPosDist] = useState<any>(null);
  const [topProducts, setTopProducts] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const loadAll = useCallback(async (days: number) => {
    setLoading(true);
    setError(null);
    try {
      const results = await Promise.allSettled([
        siAnalytics.getOverview(days),
        siAnalytics.getTopTerms(50),
        siAnalytics.getZeroResults(30),
        siAnalytics.getQuality(30),
        siAnalytics.getFunnel(days),
        siAnalytics.getCoViews(days),
        siAnalytics.getPositionDistribution(),
        siAnalytics.getTopProducts(days),
      ]);

      const [ov, tt, zr, qa, fn, cv, pd, tp] = results.map(r =>
        r.status === 'fulfilled' ? r.value : null
      );

      setOverview(ov);
      setTopTerms(tt);
      setZeroResults(zr);
      setQuality(qa);
      setFunnel(fn);
      setCoViews(cv);
      setPosDist(pd);
      setTopProducts(tp);

      if (!ov && !tt) {
        setError('Nao foi possivel carregar dados. Verifique se a Edge Function esta rodando.');
      }
    } catch (err: any) {
      console.error('[SI Dashboard]', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll(period);
  }, [period, loadAll]);

  if (loading && !overview) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <Loader2 className="w-8 h-8 animate-spin" />
          <span className="text-sm font-medium">Carregando Search Intelligence...</span>
          <span className="text-xs text-muted-foreground/60">Agregando dados de busca e navegacao</span>
        </div>
      </div>
    );
  }

  const kpis = overview?.kpis || {};

  return (
    <div className="space-y-6 max-w-[1400px] mx-auto px-4 lg:px-6 pt-6 pb-12">
      {/* ─── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-blue-500/10">
              <BarChart3 className="w-5 h-5 text-blue-500" />
            </div>
            Search Intelligence
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Product Analytics: busca, navegacao, qualidade e conversao.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
            {PERIODS.map(p => (
              <button
                key={p.value}
                onClick={() => setPeriod(p.value)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                  period === p.value
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <button
            onClick={() => loadAll(period)}
            disabled={loading}
            className="p-2 rounded-lg border border-border hover:bg-muted transition-colors disabled:opacity-50"
            title="Recarregar dados"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-destructive/10 border border-destructive/20 rounded-xl p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-destructive">Erro ao carregar dados</p>
            <p className="text-xs text-destructive/80 mt-1">{error}</p>
          </div>
        </div>
      )}

      {/* ─── KPI Cards ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <KpiCard title="Buscas" value={kpis.total_searches || 0} icon={Search} color="blue" sub={`${period}d`} />
        <KpiCard
          title="Zero Result Rate"
          value={`${kpis.zero_rate || 0}%`}
          icon={AlertTriangle}
          color="amber"
          sub={`${kpis.zero_results || 0} sem resultado`}
          trend={kpis.zero_rate > 10 ? 'bad' : 'good'}
        />
        <KpiCard
          title="CTR Busca"
          value={`${kpis.ctr || 0}%`}
          icon={MousePointer2}
          color="emerald"
          sub={`${kpis.clicks || 0} cliques`}
          trend={kpis.ctr > 5 ? 'good' : kpis.ctr > 0 ? 'bad' : undefined}
        />
        <KpiCard title="PDP Views" value={kpis.views || 0} icon={Eye} color="purple" sub="visualizacoes" />
        <KpiCard title="Sessoes" value={kpis.unique_sessions || 0} icon={Users} color="indigo" sub="unicas" />
      </div>

      {/* ─── Main Tabs ──────────────────────────────────────────────────────── */}
      <Tabs defaultValue="search" className="space-y-4">
        <TabsList className="w-full sm:w-auto">
          <TabsTrigger value="search" className="gap-1.5">
            <Search className="w-3.5 h-3.5" /> Busca
          </TabsTrigger>
          <TabsTrigger value="navigation" className="gap-1.5">
            <Eye className="w-3.5 h-3.5" /> Navegacao
          </TabsTrigger>
          <TabsTrigger value="quality" className="gap-1.5">
            <Target className="w-3.5 h-3.5" /> Qualidade
          </TabsTrigger>
          <TabsTrigger value="actions" className="gap-1.5">
            <Lightbulb className="w-3.5 h-3.5" /> Acoes
          </TabsTrigger>
        </TabsList>

        {/* ════════════════════════════════════════════════════════════════════ */}
        {/* TAB 1: SEARCH INTELLIGENCE                                         */}
        {/* ════════════════════════════════════════════════════════════════════ */}
        <TabsContent value="search" className="space-y-6">
          {/* Volume chart */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card.Root>
              <Card.Header className="pb-2">
                <Card.Title className="text-sm font-semibold flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-blue-500" /> Volume de Busca por Dia
                </Card.Title>
              </Card.Header>
              <Card.Content className="h-[280px] w-full pt-2">
                {overview?.daily_volume?.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={overview.daily_volume}>
                      <defs>
                        <linearGradient id="siGradS" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.15} />
                          <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="siGradZ" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.15} />
                          <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,0,0,0.05)" />
                      <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#86868b' }} tickFormatter={fmtDate} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#86868b' }} />
                      <Tooltip contentStyle={tooltipStyle} labelFormatter={fmtDateFull} />
                      <Area type="monotone" dataKey="searches" name="Buscas" stroke="#3b82f6" strokeWidth={2} fillOpacity={1} fill="url(#siGradS)" />
                      <Area type="monotone" dataKey="zero" name="Zero Results" stroke="#f59e0b" strokeWidth={2} fillOpacity={1} fill="url(#siGradZ)" />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <EmptyState msg="Sem dados de busca no periodo" />
                )}
              </Card.Content>
            </Card.Root>

            <Card.Root>
              <Card.Header className="pb-2">
                <Card.Title className="text-sm font-semibold flex items-center gap-2">
                  <MousePointer2 className="w-4 h-4 text-emerald-500" /> Cliques & Views por Dia
                </Card.Title>
              </Card.Header>
              <Card.Content className="h-[280px] w-full pt-2">
                {overview?.daily_volume?.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={overview.daily_volume} barCategoryGap="20%">
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,0,0,0.05)" />
                      <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#86868b' }} tickFormatter={fmtDate} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#86868b' }} />
                      <Tooltip contentStyle={tooltipStyle} />
                      <Bar dataKey="clicks" name="Cliques" fill="#10b981" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="views" name="PDP Views" fill="#6366f1" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <EmptyState msg="Sem dados de interacao no periodo" />
                )}
              </Card.Content>
            </Card.Root>
          </div>

          {/* Top terms table */}
          <Card.Root>
            <Card.Header>
              <Card.Title className="text-sm font-semibold flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-primary" /> Top Termos Buscados
                <span className="text-xs font-normal text-muted-foreground ml-1">
                  ({topTerms?.total || 0} termos unicos)
                </span>
              </Card.Title>
            </Card.Header>
            <Card.Content className="p-0">
              {topTerms?.terms?.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="border-b border-border/50">
                        <th className="px-5 py-3 text-[10px] font-bold text-muted-foreground uppercase tracking-wider w-10">#</th>
                        <th className="px-5 py-3 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Termo</th>
                        <th className="px-5 py-3 text-[10px] font-bold text-muted-foreground uppercase tracking-wider text-right">Volume</th>
                        <th className="px-5 py-3 text-[10px] font-bold text-muted-foreground uppercase tracking-wider text-right">CTR</th>
                        <th className="px-5 py-3 text-[10px] font-bold text-muted-foreground uppercase tracking-wider text-right">Pos. Media</th>
                        <th className="px-5 py-3 text-[10px] font-bold text-muted-foreground uppercase tracking-wider text-center">Status</th>
                        <th className="px-5 py-3 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Share</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/30">
                      {topTerms.terms.slice(0, 20).map((t: any, i: number) => {
                        const maxC = topTerms.terms[0]?.search_count || 1;
                        const pct = Math.round((t.search_count / maxC) * 100);
                        return (
                          <tr key={t.term} className="hover:bg-muted/40 transition-colors">
                            <td className="px-5 py-3 text-xs text-muted-foreground font-mono">{i + 1}</td>
                            <td className="px-5 py-3">
                              <span className="text-sm font-medium text-foreground">{t.term}</span>
                            </td>
                            <td className="px-5 py-3 text-right">
                              <span className="text-sm font-semibold text-foreground">{t.search_count.toLocaleString()}</span>
                            </td>
                            <td className="px-5 py-3 text-right">
                              <span className={`text-xs font-semibold ${
                                t.ctr >= 10 ? 'text-emerald-600' : t.ctr >= 3 ? 'text-foreground' : 'text-amber-600'
                              }`}>{t.ctr}%</span>
                            </td>
                            <td className="px-5 py-3 text-right">
                              <span className="text-xs text-muted-foreground">
                                {t.avg_position != null ? t.avg_position : '—'}
                              </span>
                            </td>
                            <td className="px-5 py-3 text-center">
                              {t.zero_rate > 50 ? (
                                <StatusBadge label="Zero" color="amber" />
                              ) : t.ctr < 3 && t.search_count > 5 ? (
                                <StatusBadge label="Low CTR" color="orange" />
                              ) : (
                                <StatusBadge label="OK" color="emerald" />
                              )}
                            </td>
                            <td className="px-5 py-3 w-28">
                              <BarPct pct={pct} color={t.zero_rate > 50 ? 'amber' : 'blue'} />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="p-8"><EmptyState msg="Nenhum termo registrado ainda" /></div>
              )}
            </Card.Content>
          </Card.Root>
        </TabsContent>

        {/* ════════════════════════════════════════════════════════════════════ */}
        {/* TAB 2: NAVIGATION & RECOMMENDATIONS                                */}
        {/* ════════════════════════════════════════════════════════════════════ */}
        <TabsContent value="navigation" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Funnel */}
            <Card.Root>
              <Card.Header>
                <Card.Title className="text-sm font-semibold flex items-center gap-2">
                  <Filter className="w-4 h-4 text-purple-500" /> Funil de Conversao
                </Card.Title>
              </Card.Header>
              <Card.Content>
                {funnel?.funnel?.some((f: any) => f.value > 0) ? (
                  <div className="space-y-3">
                    {funnel.funnel.map((step: any, i: number) => {
                      const maxVal = funnel.funnel[0]?.value || 1;
                      const pct = Math.max(Math.round((step.value / maxVal) * 100), 2);
                      return (
                        <div key={step.stage} className="space-y-1.5">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: FUNNEL_COLORS[i] }} />
                              <span className="text-sm font-medium text-foreground">{step.stage}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-bold text-foreground">{step.value.toLocaleString()}</span>
                              <span className="text-[10px] text-muted-foreground">{step.pct}%</span>
                            </div>
                          </div>
                          <div className="h-3 bg-muted rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all duration-500"
                              style={{ width: `${pct}%`, backgroundColor: FUNNEL_COLORS[i], opacity: 0.8 }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <EmptyState msg="Sem dados de funil" />
                )}

                {/* Step rates */}
                {funnel?.step_rates?.length > 0 && (
                  <div className="mt-6 space-y-2">
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Taxas de conversao</p>
                    {funnel.step_rates.map((sr: any) => (
                      <div key={sr.from + sr.to} className="flex items-center justify-between px-3 py-2 rounded-lg bg-muted/40">
                        <span className="text-xs text-muted-foreground">{sr.from} → {sr.to}</span>
                        <span className={`text-xs font-bold ${sr.rate >= 30 ? 'text-emerald-600' : sr.rate >= 10 ? 'text-foreground' : 'text-amber-600'}`}>
                          {sr.rate}%
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </Card.Content>
            </Card.Root>

            {/* Top Products */}
            <Card.Root>
              <Card.Header>
                <Card.Title className="text-sm font-semibold flex items-center gap-2">
                  <Eye className="w-4 h-4 text-indigo-500" /> Produtos Mais Vistos
                </Card.Title>
              </Card.Header>
              <Card.Content className="p-0">
                {topProducts?.products?.length > 0 ? (
                  <div className="divide-y divide-border/30">
                    {topProducts.products.slice(0, 12).map((p: any, i: number) => (
                      <div key={p.sku} className="px-5 py-3 flex items-center justify-between hover:bg-muted/40 transition-colors">
                        <div className="flex items-center gap-3 min-w-0">
                          <span className="text-xs text-muted-foreground font-mono w-5 shrink-0">{i + 1}</span>
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-foreground truncate">{p.sku}</p>
                            <p className="text-[10px] text-muted-foreground">via {p.top_source}</p>
                          </div>
                        </div>
                        <span className="text-sm font-semibold text-foreground shrink-0 ml-3">{p.views}x</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-8"><EmptyState msg="Sem dados de visualizacao" /></div>
                )}
              </Card.Content>
            </Card.Root>
          </div>

          {/* Co-views */}
          <Card.Root>
            <Card.Header>
              <Card.Title className="text-sm font-semibold flex items-center gap-2">
                <Zap className="w-4 h-4 text-amber-500" /> Co-View Pairs — "Quem viu, viu tambem"
                {coViews?.sessions_analyzed > 0 && (
                  <span className="text-xs font-normal text-muted-foreground ml-1">
                    ({coViews.sessions_analyzed} sessoes analisadas)
                  </span>
                )}
              </Card.Title>
            </Card.Header>
            <Card.Content className="p-0">
              {coViews?.pairs?.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="border-b border-border/50">
                        <th className="px-5 py-3 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Produto A</th>
                        <th className="px-5 py-3 text-[10px] font-bold text-muted-foreground uppercase tracking-wider text-center">↔</th>
                        <th className="px-5 py-3 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Produto B</th>
                        <th className="px-5 py-3 text-[10px] font-bold text-muted-foreground uppercase tracking-wider text-right">Co-views</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/30">
                      {coViews.pairs.slice(0, 15).map((pair: any, i: number) => (
                        <tr key={`${pair.sku_a}-${pair.sku_b}`} className="hover:bg-muted/40 transition-colors">
                          <td className="px-5 py-3"><span className="text-sm font-mono text-foreground">{pair.sku_a}</span></td>
                          <td className="px-5 py-3 text-center"><ChevronRight className="w-3 h-3 text-muted-foreground inline" /></td>
                          <td className="px-5 py-3"><span className="text-sm font-mono text-foreground">{pair.sku_b}</span></td>
                          <td className="px-5 py-3 text-right"><span className="text-sm font-bold text-foreground">{pair.co_view_count}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="p-8"><EmptyState msg="Pares de co-view aparecerao com mais sessoes" /></div>
              )}
            </Card.Content>
          </Card.Root>
        </TabsContent>

        {/* ════════════════════════════════════════════════════════════════════ */}
        {/* TAB 3: SEARCH QUALITY                                              */}
        {/* ════════════════════════════════════════════════════════════════════ */}
        <TabsContent value="quality" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Zero Results */}
            <Card.Root>
              <Card.Header>
                <Card.Title className="text-sm font-semibold flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-500" /> Buscas Sem Resultado
                </Card.Title>
                <Card.Description>Oportunidades de catalogacao, sinonimos ou correcao de indexacao.</Card.Description>
              </Card.Header>
              <Card.Content className="p-0">
                {zeroResults?.terms?.length > 0 ? (
                  <div className="divide-y divide-border/30 max-h-[400px] overflow-y-auto">
                    {zeroResults.terms.map((t: any, i: number) => (
                      <div key={t.term} className="px-5 py-3 flex items-center justify-between hover:bg-muted/40 transition-colors">
                        <div className="flex items-center gap-3">
                          <span className="text-xs text-muted-foreground font-mono w-5">{i + 1}</span>
                          <div>
                            <p className="text-sm font-medium text-foreground">{t.term}</p>
                            <p className="text-[10px] text-muted-foreground">{t.total_searches} buscas | {t.zero_rate}% zero</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-sm font-bold text-amber-600">{t.zero_count}x</span>
                          <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-8"><EmptyState msg="Nenhuma busca sem resultado" /></div>
                )}
              </Card.Content>
            </Card.Root>

            {/* Low CTR Terms */}
            <Card.Root>
              <Card.Header>
                <Card.Title className="text-sm font-semibold flex items-center gap-2">
                  <Crosshair className="w-4 h-4 text-orange-500" /> Termos com CTR Baixo
                </Card.Title>
                <Card.Description>Tem resultado mas ninguem clica — ranking ou relevancia ruim.</Card.Description>
              </Card.Header>
              <Card.Content className="p-0">
                {quality?.terms?.length > 0 ? (
                  <div className="divide-y divide-border/30 max-h-[400px] overflow-y-auto">
                    {quality.terms.map((t: any, i: number) => (
                      <div key={t.term} className="px-5 py-3 flex items-center justify-between hover:bg-muted/40 transition-colors">
                        <div className="flex items-center gap-3">
                          <span className="text-xs text-muted-foreground font-mono w-5">{i + 1}</span>
                          <div>
                            <p className="text-sm font-medium text-foreground">{t.term}</p>
                            <p className="text-[10px] text-muted-foreground">
                              {t.search_count} buscas | CTR {t.ctr}%
                              {t.avg_position != null && ` | Pos. ${t.avg_position}`}
                            </p>
                          </div>
                        </div>
                        <StatusBadge label={t.priority} color={t.priority === 'high' ? 'red' : t.priority === 'medium' ? 'amber' : 'slate'} />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-8"><EmptyState msg="Sem termos com CTR baixo" /></div>
                )}
              </Card.Content>
            </Card.Root>
          </div>

          {/* Position Distribution */}
          <Card.Root>
            <Card.Header>
              <Card.Title className="text-sm font-semibold flex items-center gap-2">
                <Activity className="w-4 h-4 text-blue-500" /> Distribuicao de Posicao Clicada
                {posDist?.avg_position != null && (
                  <span className="text-xs font-normal text-muted-foreground ml-1">
                    (media: posicao {posDist.avg_position} | {posDist.total_clicks} cliques)
                  </span>
                )}
              </Card.Title>
              <Card.Description>
                Se cliques concentrados em pos. 7+, o ranking do Meili precisa ajuste.
              </Card.Description>
            </Card.Header>
            <Card.Content className="h-[200px] w-full">
              {posDist?.distribution?.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={posDist.distribution}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,0,0,0.05)" />
                    <XAxis dataKey="position" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#86868b' }} label={{ value: 'Posicao', position: 'insideBottom', offset: -2, fontSize: 10, fill: '#86868b' }} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#86868b' }} />
                    <Tooltip contentStyle={tooltipStyle} formatter={(v: any) => [v, 'Cliques']} />
                    <Bar dataKey="clicks" radius={[4, 4, 0, 0]}>
                      {posDist.distribution.map((entry: any, i: number) => (
                        <Cell key={entry.position} fill={entry.position <= 3 ? '#10b981' : entry.position <= 6 ? '#eab308' : '#ef4444'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <EmptyState msg="Sem dados de posicao clicada" />
              )}
            </Card.Content>
          </Card.Root>
        </TabsContent>

        {/* ════════════════════════════════════════════════════════════════════ */}
        {/* TAB 4: ACTIONS / INSIGHTS                                          */}
        {/* ════════════════════════════════════════════════════════════════════ */}
        <TabsContent value="actions" className="space-y-6">
          {/* Auto-generated insights */}
          <Card.Root>
            <Card.Header>
              <Card.Title className="text-sm font-semibold flex items-center gap-2">
                <Lightbulb className="w-4 h-4 text-amber-500" /> Insights Automaticos
              </Card.Title>
              <Card.Description>Sinais que viram acao no Meilisearch e no catalogo.</Card.Description>
            </Card.Header>
            <Card.Content>
              <InsightsPanel
                kpis={kpis}
                zeroResults={zeroResults}
                quality={quality}
                posDist={posDist}
              />
            </Card.Content>
          </Card.Root>

          {/* Meilisearch action queue */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card.Root>
              <Card.Header>
                <Card.Title className="text-sm font-semibold flex items-center gap-2">
                  <Search className="w-4 h-4 text-blue-500" /> Fila de Sinonimos Sugeridos
                </Card.Title>
                <Card.Description>Termos zero-result que podem ser resolvidos com sinonimos no Meili.</Card.Description>
              </Card.Header>
              <Card.Content>
                {zeroResults?.terms?.length > 0 ? (
                  <div className="space-y-2">
                    {zeroResults.terms.slice(0, 8).map((t: any) => (
                      <div key={t.term} className="flex items-center justify-between p-3 rounded-lg bg-muted/40 border border-border/50">
                        <div>
                          <p className="text-sm font-medium text-foreground">"{t.term}"</p>
                          <p className="text-[10px] text-muted-foreground">{t.zero_count} buscas sem resultado</p>
                        </div>
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
                          Criar sinonimo
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <EmptyState msg="Nenhum sinonimo sugerido" />
                )}
              </Card.Content>
            </Card.Root>

            <Card.Root>
              <Card.Header>
                <Card.Title className="text-sm font-semibold flex items-center gap-2">
                  <Target className="w-4 h-4 text-orange-500" /> Ranking Tuning Queue
                </Card.Title>
                <Card.Description>Termos com volume alto mas CTR baixo — revisar ranking no Meili.</Card.Description>
              </Card.Header>
              <Card.Content>
                {quality?.terms?.length > 0 ? (
                  <div className="space-y-2">
                    {quality.terms.filter((t: any) => t.priority === 'high' || t.priority === 'medium').slice(0, 8).map((t: any) => (
                      <div key={t.term} className="flex items-center justify-between p-3 rounded-lg bg-muted/40 border border-border/50">
                        <div>
                          <p className="text-sm font-medium text-foreground">"{t.term}"</p>
                          <p className="text-[10px] text-muted-foreground">
                            {t.search_count} buscas | CTR {t.ctr}%
                            {t.avg_position && ` | Pos. ${t.avg_position}`}
                          </p>
                        </div>
                        <StatusBadge
                          label={t.priority === 'high' ? 'Prioridade alta' : 'Media'}
                          color={t.priority === 'high' ? 'red' : 'amber'}
                        />
                      </div>
                    ))}
                    {quality.terms.filter((t: any) => t.priority === 'high' || t.priority === 'medium').length === 0 && (
                      <EmptyState msg="Nenhum termo com prioridade alta/media" />
                    )}
                  </div>
                ) : (
                  <EmptyState msg="Sem dados de qualidade" />
                )}
              </Card.Content>
            </Card.Root>
          </div>
        </TabsContent>
      </Tabs>

      {/* Footer */}
      {overview?.generated_at && (
        <p className="text-center text-[10px] text-muted-foreground pt-2">
          Dados gerados em {new Date(overview.generated_at).toLocaleString('pt-BR')} | Periodo: {period}d | Cache: 2min
        </p>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ─── Sub-components ─────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════

const tooltipStyle = {
  borderRadius: '12px',
  border: 'none',
  boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1)',
  fontSize: '12px',
};

function fmtDate(d: string) {
  const parts = d.split('-');
  return `${parts[2]}/${parts[1]}`;
}

function fmtDateFull(d: string) {
  const parts = String(d).split('-');
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

function KpiCard({ title, value, icon: Icon, color, sub, trend }: {
  title: string; value: number | string; icon: React.ElementType; color: string; sub?: string; trend?: 'good' | 'bad';
}) {
  const colors: Record<string, string> = {
    blue: 'text-blue-500 bg-blue-500/10',
    emerald: 'text-emerald-500 bg-emerald-500/10',
    amber: 'text-amber-500 bg-amber-500/10',
    purple: 'text-purple-500 bg-purple-500/10',
    indigo: 'text-indigo-500 bg-indigo-500/10',
  };
  return (
    <Card.Root>
      <Card.Content className="p-4">
        <div className="flex justify-between items-start">
          <div className={`p-2 rounded-xl ${colors[color] || colors.blue}`}><Icon className="w-4 h-4" /></div>
          {trend && (
            <div className={`flex items-center text-[10px] font-bold ${trend === 'good' ? 'text-emerald-500' : 'text-amber-500'}`}>
              {trend === 'good' ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
            </div>
          )}
        </div>
        <div className="mt-3">
          <h3 className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">{title}</h3>
          <p className="text-xl font-bold text-foreground mt-0.5">{typeof value === 'number' ? value.toLocaleString() : value}</p>
          {sub && <p className="text-[10px] text-muted-foreground mt-0.5">{sub}</p>}
        </div>
      </Card.Content>
    </Card.Root>
  );
}

function StatusBadge({ label, color }: { label: string; color: string }) {
  const map: Record<string, string> = {
    emerald: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
    amber: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
    orange: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
    red: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    slate: 'bg-slate-100 text-slate-600 dark:bg-slate-900/30 dark:text-slate-400',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${map[color] || map.slate}`}>
      {label}
    </span>
  );
}

function BarPct({ pct, color }: { pct: number; color: string }) {
  const colorMap: Record<string, string> = { blue: 'bg-blue-500', amber: 'bg-amber-500', emerald: 'bg-emerald-500' };
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${colorMap[color] || colorMap.blue}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[10px] text-muted-foreground w-8 text-right">{pct}%</span>
    </div>
  );
}

function EmptyState({ msg }: { msg: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-10 text-center">
      <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center mb-2.5 text-muted-foreground">
        <BarChart3 className="w-5 h-5" />
      </div>
      <p className="text-sm text-muted-foreground">{msg}</p>
      <p className="text-[10px] text-muted-foreground/60 mt-1">
        Dados aparecem conforme usuarios realizam buscas e navegam no site.
      </p>
    </div>
  );
}

function InsightsPanel({ kpis, zeroResults, quality, posDist }: any) {
  const insights: { icon: React.ReactNode; text: string; severity: 'info' | 'warning' | 'critical' }[] = [];

  // Generate insights from data
  if (kpis?.zero_rate > 15) {
    insights.push({
      icon: <AlertTriangle className="w-4 h-4 text-red-500" />,
      text: `Zero Result Rate esta em ${kpis.zero_rate}% — acima de 15% indica problemas graves de catalogo ou sinonimos.`,
      severity: 'critical',
    });
  } else if (kpis?.zero_rate > 8) {
    insights.push({
      icon: <AlertTriangle className="w-4 h-4 text-amber-500" />,
      text: `Zero Result Rate em ${kpis.zero_rate}% — ideal e abaixo de 5%. Revise sinonimos e cobertura do catalogo.`,
      severity: 'warning',
    });
  }

  if (kpis?.ctr < 5 && kpis?.total_searches > 20) {
    insights.push({
      icon: <MousePointer2 className="w-4 h-4 text-amber-500" />,
      text: `CTR de busca em ${kpis.ctr}% — abaixo de 5% sugere ranking ruim ou titulos pouco atrativos nos resultados.`,
      severity: 'warning',
    });
  }

  if (posDist?.avg_position > 5 && posDist?.total_clicks > 10) {
    insights.push({
      icon: <Crosshair className="w-4 h-4 text-orange-500" />,
      text: `Posicao media clicada e ${posDist.avg_position} — usuarios precisam scrollar muito. Revise rankingRules do Meili.`,
      severity: 'warning',
    });
  }

  if (zeroResults?.terms?.length > 0) {
    const top3 = zeroResults.terms.slice(0, 3).map((t: any) => `"${t.term}" (${t.zero_count}x)`).join(', ');
    insights.push({
      icon: <Search className="w-4 h-4 text-blue-500" />,
      text: `Top termos sem resultado: ${top3}. Considere criar sinonimos ou cadastrar esses produtos.`,
      severity: 'info',
    });
  }

  if (quality?.terms?.filter((t: any) => t.priority === 'high')?.length > 3) {
    insights.push({
      icon: <Target className="w-4 h-4 text-orange-500" />,
      text: `${quality.terms.filter((t: any) => t.priority === 'high').length} termos com prioridade alta para ranking tuning. CTR muito baixo apesar de ter resultados.`,
      severity: 'warning',
    });
  }

  if (kpis?.total_searches === 0) {
    insights.push({
      icon: <Activity className="w-4 h-4 text-muted-foreground" />,
      text: 'Nenhuma busca trackada no periodo. O tracking esta integrado no SearchPage e ProductDetailPage?',
      severity: 'info',
    });
  }

  if (insights.length === 0) {
    insights.push({
      icon: <Zap className="w-4 h-4 text-emerald-500" />,
      text: 'Todos os indicadores estao saudaveis. Continue monitorando.',
      severity: 'info',
    });
  }

  const severityColor = { critical: 'border-red-200 bg-red-50', warning: 'border-amber-200 bg-amber-50', info: 'border-blue-200 bg-blue-50' };

  return (
    <div className="space-y-2.5">
      {insights.map((insight, i) => (
        <div key={i} className={`flex items-start gap-3 p-3.5 rounded-xl border ${severityColor[insight.severity]} dark:bg-transparent dark:border-border`}>
          <div className="mt-0.5 shrink-0">{insight.icon}</div>
          <p className="text-sm text-foreground leading-relaxed">{insight.text}</p>
        </div>
      ))}
    </div>
  );
}
