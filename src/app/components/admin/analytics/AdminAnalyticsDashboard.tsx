import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertCircle,
  ArrowUpRight,
  BarChart3,
  CheckCircle2,
  ExternalLink,
  Funnel,
  Globe,
  Loader2,
  RefreshCw,
  Search,
  Target,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { projectId } from '../../../../../utils/supabase/info';
import { adminFetch } from '../../../lib/admin-auth';
import { Card } from '../../base/card';
import { Button } from '../../base/button';
import { Input } from '../../base/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../ui/tabs';

const API = `https://${projectId}.supabase.co/functions/v1/make-server-1d6e33e0`;
const PERIODS: Array<7 | 30 | 90> = [7, 30, 90];

function fmtInt(value: number) {
  return Number(value || 0).toLocaleString('pt-BR');
}

function fmtPct(value: number) {
  return `${Number(value || 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`;
}

function fmtMoney(value: number) {
  return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function fmtDuration(seconds: number) {
  const safe = Math.max(0, Math.round(Number(seconds || 0)));
  const minutes = Math.floor(safe / 60);
  const remaining = safe % 60;
  if (minutes <= 0) return `${remaining}s`;
  return `${minutes}m ${remaining}s`;
}

function deltaTone(value: number) {
  if (value > 0) return 'text-emerald-600';
  if (value < 0) return 'text-rose-600';
  return 'text-muted-foreground';
}

function MetricCard({
  title,
  value,
  delta,
  subtitle,
}: {
  title: string;
  value: string;
  delta?: number;
  subtitle?: string;
}) {
  return (
    <Card.Root>
      <Card.Content className="space-y-2 p-5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{title}</p>
        <p className="text-2xl font-bold tracking-tight text-foreground">{value}</p>
        <div className="flex items-center justify-between gap-3">
          <p className={`text-xs font-semibold ${deltaTone(Number(delta || 0))}`}>
            {delta != null ? `${delta > 0 ? '+' : ''}${delta}% vs janela anterior` : 'Sem comparativo'}
          </p>
          {subtitle ? <p className="text-xs text-muted-foreground">{subtitle}</p> : null}
        </div>
      </Card.Content>
    </Card.Root>
  );
}

function StatList({
  title,
  items,
  valueFormatter,
}: {
  title: string;
  items: any[];
  valueFormatter?: (value: number) => string;
}) {
  return (
    <Card.Root>
      <Card.Header>
        <Card.Title className="text-sm">{title}</Card.Title>
      </Card.Header>
      <Card.Content className="space-y-3">
        {items?.length ? items.map((item) => (
          <div key={item.key || item.label || item.term || item.campaign || item.surface || item.banner} className="flex items-center justify-between gap-3 border-b border-border/60 pb-3 last:border-b-0 last:pb-0">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-foreground">{item.label || item.term || item.campaign || item.surface || item.banner || item.key}</p>
              {item.pct != null ? <p className="text-xs text-muted-foreground">{fmtPct(item.pct)}</p> : null}
            </div>
            <p className="shrink-0 text-sm font-semibold text-foreground">{valueFormatter ? valueFormatter(item.value ?? item.searches ?? item.views ?? item.revenue ?? item.leads ?? item.purchases ?? 0) : fmtInt(item.value ?? item.searches ?? item.views ?? item.revenue ?? item.leads ?? item.purchases ?? 0)}</p>
          </div>
        )) : (
          <p className="text-sm text-muted-foreground">Sem dados suficientes nesta janela.</p>
        )}
      </Card.Content>
    </Card.Root>
  );
}

export function AdminAnalyticsDashboard() {
  const [days, setDays] = useState<7 | 30 | 90>(30);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dashboard, setDashboard] = useState<any>(null);
  const [campaigns, setCampaigns] = useState<any>(null);
  const [replays, setReplays] = useState<any>(null);
  const [health, setHealth] = useState<any>(null);
  const [config, setConfig] = useState<any>(null);

  const loadAll = useCallback(async (force = false) => {
    setLoading(true);
    setError(null);
    try {
      const suffix = force ? '&force=1' : '';
      const [dashboardRes, campaignsRes, replaysRes, configRes, healthRes] = await Promise.all([
        adminFetch(`${API}/admin/analytics/dashboard?days=${days}${suffix}`),
        adminFetch(`${API}/admin/analytics/campaigns?days=${days}${suffix}`),
        adminFetch(`${API}/admin/analytics/replays?days=${days}&limit=12${suffix}`),
        adminFetch(`${API}/admin/campaign-goals/config`),
        adminFetch(`${API}/admin/campaign-goals/health`),
      ]);

      if (!dashboardRes.ok) throw new Error(`Analytics dashboard falhou (${dashboardRes.status}).`);
      if (!campaignsRes.ok) throw new Error(`Analytics campaigns falhou (${campaignsRes.status}).`);
      if (!replaysRes.ok) throw new Error(`Analytics replays falhou (${replaysRes.status}).`);

      const [dashboardJson, campaignsJson, replaysJson, configJson, healthJson] = await Promise.all([
        dashboardRes.json(),
        campaignsRes.json(),
        replaysRes.json(),
        configRes.ok ? configRes.json() : Promise.resolve(null),
        healthRes.ok ? healthRes.json() : Promise.resolve(null),
      ]);

      setDashboard(dashboardJson);
      setCampaigns(campaignsJson);
      setReplays(replaysJson);
      setConfig(configJson);
      setHealth(healthJson);
    } catch (nextError: any) {
      setError(nextError?.message || 'Nao foi possivel carregar analytics.');
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    void loadAll(false);
  }, [loadAll]);

  const handleSaveConfig = useCallback(async () => {
    setSaving(true);
    try {
      const response = await adminFetch(`${API}/admin/campaign-goals/config`, {
        method: 'PUT',
        body: JSON.stringify(config || {}),
      });
      if (!response.ok) throw new Error(`Falha ao salvar configuracao (${response.status}).`);
      setConfig(await response.json());
      await loadAll(true);
    } catch (nextError: any) {
      setError(nextError?.message || 'Falha ao salvar configuracao.');
    } finally {
      setSaving(false);
    }
  }, [config, loadAll]);

  const timeSeries = useMemo(() => dashboard?.timeseries || [], [dashboard]);
  const kpis = dashboard?.kpis || {};

  return (
    <div className="space-y-6 max-w-[1440px] mx-auto px-4 lg:px-6 pt-6 pb-12">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="flex items-center gap-3 text-2xl font-bold tracking-tight text-foreground">
            <div className="rounded-2xl bg-primary/10 p-2.5">
              <BarChart3 className="h-5 w-5 text-primary" />
            </div>
            Analytics
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Acessos, funil, campanhas, metas Google/Meta e leads WhatsApp com valor inteligente.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="rounded-xl bg-muted p-1">
            {PERIODS.map((period) => (
              <button
                key={period}
                onClick={() => setDays(period)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${days === period ? 'bg-card text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground'}`}
              >
                {period}d
              </button>
            ))}
          </div>
          <Button color="secondary" size="sm" iconLeading={<RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />} onClick={() => loadAll(true)}>
            Atualizar
          </Button>
        </div>
      </div>

      {error ? (
        <div className="rounded-2xl border border-destructive/20 bg-destructive/10 p-4 text-sm text-destructive">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>{error}</p>
          </div>
        </div>
      ) : null}

      {loading && !dashboard ? (
        <div className="flex h-72 items-center justify-center">
          <div className="flex flex-col items-center gap-3 text-muted-foreground">
            <Loader2 className="h-8 w-8 animate-spin" />
            <span className="text-sm font-medium">Carregando analytics...</span>
          </div>
        </div>
      ) : null}

      {dashboard ? (
        <>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <MetricCard title="Visitantes" value={fmtInt(kpis.visitors?.current)} delta={kpis.visitors?.delta_pct} />
            <MetricCard title="Sessoes" value={fmtInt(kpis.sessions?.current)} delta={kpis.sessions?.delta_pct} />
            <MetricCard title="Pageviews" value={fmtInt(kpis.pageviews?.current)} delta={kpis.pageviews?.delta_pct} />
            <MetricCard title="Receita" value={fmtMoney(kpis.revenue?.current)} delta={kpis.revenue?.delta_pct} />
            <MetricCard title="Paginas / sessao" value={String(kpis.pages_per_session?.current || 0)} delta={kpis.pages_per_session?.delta_pct} />
            <MetricCard title="Tempo ativo medio" value={fmtDuration(kpis.avg_active_time_seconds?.current)} delta={kpis.avg_active_time_seconds?.delta_pct} />
            <MetricCard title="Bounce rate" value={fmtPct(kpis.bounce_rate?.current)} delta={kpis.bounce_rate?.delta_pct} />
            <MetricCard title="Pedidos pagos" value={fmtInt(kpis.paid_orders?.current)} delta={kpis.paid_orders?.delta_pct} />
          </div>

          <Tabs defaultValue="resumo" className="space-y-4">
            <TabsList className="w-full flex-wrap md:w-auto">
              <TabsTrigger value="resumo" className="gap-2"><Activity className="h-4 w-4" /> Resumo</TabsTrigger>
              <TabsTrigger value="aquisicao" className="gap-2"><Globe className="h-4 w-4" /> Aquisicao</TabsTrigger>
              <TabsTrigger value="conteudo" className="gap-2"><Search className="h-4 w-4" /> Conteudo</TabsTrigger>
              <TabsTrigger value="funil" className="gap-2"><Funnel className="h-4 w-4" /> Funil</TabsTrigger>
              <TabsTrigger value="campanhas" className="gap-2"><Target className="h-4 w-4" /> Campanhas</TabsTrigger>
            </TabsList>

            <TabsContent value="resumo" className="space-y-6">
              <Card.Root>
                <Card.Header>
                  <Card.Title className="text-sm">Sessoes e pageviews por dia</Card.Title>
                </Card.Header>
                <Card.Content className="h-[320px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={timeSeries}>
                      <defs>
                        <linearGradient id="analyticsSessions" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#2563eb" stopOpacity={0.22} />
                          <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,0,0,0.06)" />
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Area type="monotone" dataKey="sessions" stroke="#2563eb" fill="url(#analyticsSessions)" strokeWidth={2} />
                      <Area type="monotone" dataKey="pageviews" stroke="#16a34a" fillOpacity={0} strokeWidth={2} />
                    </AreaChart>
                  </ResponsiveContainer>
                </Card.Content>
              </Card.Root>

              <div className="grid gap-6 xl:grid-cols-2">
                <Card.Root>
                  <Card.Header>
                    <Card.Title className="text-sm">Insights automaticos</Card.Title>
                  </Card.Header>
                  <Card.Content className="space-y-3">
                    {dashboard.insights?.length ? dashboard.insights.map((item: any) => (
                      <div key={item.id} className="rounded-2xl border border-border p-4">
                        <p className="text-sm font-semibold text-foreground">{item.title}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{item.body}</p>
                      </div>
                    )) : (
                      <p className="text-sm text-muted-foreground">Sem insights para exibir.</p>
                    )}
                  </Card.Content>
                </Card.Root>
                <StatList title="Top landing pages" items={dashboard.acquisition?.landing_pages || []} />
              </div>
            </TabsContent>

            <TabsContent value="aquisicao" className="space-y-6">
              <div className="grid gap-6 xl:grid-cols-3">
                <StatList title="Canais" items={dashboard.acquisition?.channels || []} />
                <StatList title="UTM source" items={dashboard.acquisition?.sources || []} />
                <StatList title="UTM campaign" items={dashboard.acquisition?.campaigns || []} />
                <StatList title="Referrers" items={dashboard.acquisition?.referrers || []} />
                <StatList title="Dispositivos" items={dashboard.acquisition?.devices || []} />
                <StatList title="Browsers" items={dashboard.acquisition?.browsers || []} />
              </div>
            </TabsContent>

            <TabsContent value="conteudo" className="space-y-6">
              <div className="grid gap-6 xl:grid-cols-3">
                <StatList title="Paginas mais vistas" items={dashboard.content?.top_pages || []} />
                <StatList title="Produtos mais vistos" items={dashboard.content?.top_products || []} />
                <StatList title="Superficies de WhatsApp" items={dashboard.content?.whatsapp_surfaces || []} valueFormatter={fmtMoney} />
              </div>
              <div className="grid gap-6 xl:grid-cols-2">
                <StatList title="Top buscas ativas" items={dashboard.search?.top_terms || []} valueFormatter={fmtInt} />
                <Card.Root>
                  <Card.Header>
                    <Card.Title className="text-sm">Saude da busca</Card.Title>
                  </Card.Header>
                  <Card.Content className="grid gap-4 md:grid-cols-3">
                    <MetricCard title="Buscas" value={fmtInt(dashboard.search?.total_searches)} />
                    <MetricCard title="Zero result rate" value={fmtPct(dashboard.search?.zero_result_rate)} />
                    <MetricCard title="CTR busca" value={fmtPct(dashboard.search?.ctr)} />
                  </Card.Content>
                </Card.Root>
              </div>
            </TabsContent>

            <TabsContent value="funil" className="space-y-6">
              <Card.Root>
                <Card.Header>
                  <Card.Title className="text-sm">Funil principal</Card.Title>
                </Card.Header>
                <Card.Content className="h-[320px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={dashboard.funnel?.steps || []}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,0,0,0.06)" />
                      <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Bar dataKey="value" fill="#111827" radius={[10, 10, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </Card.Content>
              </Card.Root>
              <div className="grid gap-6 xl:grid-cols-2">
                <StatList title="Funil por canal" items={dashboard.funnel?.by_channel || []} valueFormatter={fmtMoney} />
                <StatList title="Funil por campanha" items={dashboard.funnel?.by_campaign || []} valueFormatter={fmtMoney} />
              </div>
            </TabsContent>

            <TabsContent value="campanhas" className="space-y-6">
              <div className="grid gap-6 xl:grid-cols-2">
                <Card.Root>
                  <Card.Header>
                    <Card.Title className="text-sm">Metas ativas</Card.Title>
                  </Card.Header>
                  <Card.Content className="grid gap-4">
                    {campaigns?.goals?.map((goal: any) => (
                      <div key={goal.goal} className="rounded-2xl border border-border p-4">
                        <div className="flex items-center justify-between gap-4">
                          <div>
                            <p className="text-sm font-semibold text-foreground">{goal.goal}</p>
                            <p className="text-xs text-muted-foreground">{fmtInt(goal.conversions)} conversoes</p>
                          </div>
                          <div className="text-right">
                            <p className="text-base font-bold text-foreground">{fmtMoney(goal.total_value)}</p>
                            <p className="text-xs text-muted-foreground">ticket medio {fmtMoney(goal.avg_value)}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </Card.Content>
                </Card.Root>

                <Card.Root>
                  <Card.Header>
                    <Card.Title className="text-sm">Saude das integracoes</Card.Title>
                  </Card.Header>
                  <Card.Content className="space-y-3">
                    {health?.checks?.length ? health.checks.map((check: any) => (
                      <div key={check.key} className="rounded-2xl border border-border p-4">
                        <div className="flex items-start gap-3">
                          {check.status === 'ok' ? <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-600" /> : <AlertCircle className="mt-0.5 h-4 w-4 text-amber-600" />}
                          <div>
                            <p className="text-sm font-semibold text-foreground">{check.label}</p>
                            <p className="mt-1 text-xs text-muted-foreground">{check.detail}</p>
                          </div>
                        </div>
                      </div>
                    )) : (
                      <p className="text-sm text-muted-foreground">Sem diagnostico disponivel.</p>
                    )}
                  </Card.Content>
                </Card.Root>
              </div>

              <div className="grid gap-6 xl:grid-cols-3">
                <StatList title="Top campanhas (valor)" items={campaigns?.utm_campaigns || []} valueFormatter={fmtMoney} />
                <StatList title="Top fontes (valor)" items={campaigns?.utm_sources || []} valueFormatter={fmtMoney} />
                <StatList title="Top banners WhatsApp" items={campaigns?.top_banners || []} valueFormatter={fmtMoney} />
              </div>

              <Card.Root>
                <Card.Header>
                  <Card.Title className="text-sm">Configuracao das metas</Card.Title>
                </Card.Header>
                <Card.Content className="grid gap-4 lg:grid-cols-[220px_1fr_auto] lg:items-end">
                  <div className="space-y-2">
                    <label className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Fallback lead WhatsApp</label>
                    <Input value={config?.fallbackWhatsappLeadValue ?? ''} onChange={(event) => setConfig((current: any) => ({ ...(current || {}), fallbackWhatsappLeadValue: event.target.value }))} />
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <label className="flex items-center gap-3 rounded-2xl border border-border p-4 text-sm">
                      <input type="checkbox" checked={config?.enableWhatsappLeadGoal !== false} onChange={(event) => setConfig((current: any) => ({ ...(current || {}), enableWhatsappLeadGoal: event.target.checked }))} />
                      Habilitar meta de lead WhatsApp
                    </label>
                    <label className="flex items-center gap-3 rounded-2xl border border-border p-4 text-sm">
                      <input type="checkbox" checked={config?.enablePurchaseGoal !== false} onChange={(event) => setConfig((current: any) => ({ ...(current || {}), enablePurchaseGoal: event.target.checked }))} />
                      Habilitar meta de compra paga
                    </label>
                  </div>
                  <Button size="sm" iconLeading={saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUpRight className="h-4 w-4" />} onClick={handleSaveConfig}>
                    Salvar
                  </Button>
                </Card.Content>
              </Card.Root>

              <Card.Root>
                <Card.Header>
                  <Card.Title className="text-sm">Sessions relevantes / replay</Card.Title>
                </Card.Header>
                <Card.Content className="space-y-3">
                  {replays?.items?.length ? replays.items.map((item: any) => (
                    <div key={item.session_id} className="flex flex-col gap-3 rounded-2xl border border-border p-4 lg:flex-row lg:items-center lg:justify-between">
                      <div>
                        <p className="text-sm font-semibold text-foreground">{item.reason}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {item.entry_url || 'sem entrada'} · {item.device_type} · {fmtDuration(item.duration_seconds)}
                        </p>
                      </div>
                      {item.posthog_url ? (
                        <a href={item.posthog_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-sm font-semibold text-primary">
                          Abrir replay <ExternalLink className="h-4 w-4" />
                        </a>
                      ) : (
                        <span className="text-xs text-muted-foreground">Replay indisponivel</span>
                      )}
                    </div>
                  )) : (
                    <p className="text-sm text-muted-foreground">Nenhuma sessao relevante nesta janela.</p>
                  )}
                </Card.Content>
              </Card.Root>
            </TabsContent>
          </Tabs>
        </>
      ) : null}
    </div>
  );
}
