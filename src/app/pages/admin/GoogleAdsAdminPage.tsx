import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertCircle,
  BarChart3,
  CheckCircle2,
  ExternalLink,
  Layers3,
  Loader2,
  MessagesSquare,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Target,
  TrendingDown,
  TrendingUp,
  UploadCloud,
  Wrench,
} from 'lucide-react';
import { toast } from 'sonner';
import { projectId } from '../../../../utils/supabase/info';
import { adminFetch } from '../../lib/admin-auth';
import { Card } from '../../components/base/card';
import { Button } from '../../components/base/button';
import { Input } from '../../components/base/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs';

const API = `https://${projectId}.supabase.co/functions/v1/make-server-1d6e33e0`;
const PERIODS = [
  { key: 'month', label: 'Mês atual x anterior' },
  { key: '7d', label: '7 dias' },
  { key: '30d', label: '30 dias' },
  { key: '90d', label: '90 dias' },
] as const;

type RangeKey = 'month' | '7d' | '30d' | '90d';

interface GoogleAdsConfig {
  auth_mode: 'oauth_refresh_token' | 'service_account';
  manager_customer_id: string | null;
  customer_id: string | null;
  conversion_customer_id: string | null;
  conversion_tracking_status: string | null;
  merchant_center_id: string | null;
  developer_token: string | null;
  oauth_client_id: string | null;
  oauth_client_secret: string | null;
  oauth_refresh_token: string | null;
  service_account_project_id: string | null;
  service_account_client_email: string | null;
  service_account_private_key_id: string | null;
  service_account_private_key: string | null;
  service_account_token_uri: string | null;
  conversion_action_purchase_id: string | null;
  conversion_action_whatsapp_lead_id: string | null;
  conversion_action_whatsapp_closed_id: string | null;
  website_url: string | null;
  pmax_feed_label: string | null;
  pmax_default_daily_budget_brl: number | null;
  pmax_default_target_roas: number | null;
  pmax_base_campaign_id: string | null;
  pmax_base_campaign_name: string | null;
  pmax_base_asset_group_id: string | null;
  pmax_last_provisioned_at: string | null;
  pmax_enabled: boolean;
  merchant_link_status: string | null;
  last_successful_api_check_at: string | null;
  updated_at: string | null;
  updated_by: string | null;
}

type AdminAction =
  | 'test'
  | 'sync'
  | 'ensure_conversions'
  | 'ensure_merchant'
  | 'provision_pmax'
  | 'provision_all'
  | 'reprocess'
  | 'reconcile';

type SectionErrorMap = Partial<Record<'config' | 'health' | 'dashboard' | 'campaigns' | 'merchant' | 'whatsapp' | 'queue' | 'reconcile' | 'recommendations', string>>;

function formatMoney(value: number | null | undefined) {
  return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatNumber(value: number | null | undefined, digits = 0) {
  return Number(value || 0).toLocaleString('pt-BR', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function formatPercent(value: number | null | undefined) {
  return `${formatNumber(value, 2)}%`;
}

function formatDelta(value: number | null | undefined, inverse = false) {
  if (value == null) return 'Sem comparativo';
  const positive = inverse ? value < 0 : value > 0;
  const prefix = value > 0 ? '+' : '';
  return `${prefix}${formatNumber(value, 2)}% ${positive ? 'melhor' : value === 0 ? 'estável' : 'pior'} que a janela anterior`;
}

function formatDateTime(value?: string | null) {
  if (!value) return 'nunca';
  return new Date(value).toLocaleString('pt-BR');
}

function formatDelay(minutes?: number | null) {
  const safe = Number(minutes || 0);
  if (!Number.isFinite(safe) || safe <= 0) return 'sem envios';
  if (safe < 60) return `${formatNumber(safe, 1)} min`;
  const hours = Math.floor(safe / 60);
  const remainder = safe % 60;
  return `${hours}h ${formatNumber(remainder, 0)}m`;
}

function formatInlineBreakdown(items: any[] | null | undefined, emptyLabel = 'Sem origem clara') {
  if (!items?.length) return emptyLabel;
  return items
    .slice(0, 3)
    .map((item) => `${item.label || item.key}: ${formatNumber(item.value, 0)}`)
    .join(' • ');
}

function deltaTone(value: number | null | undefined, inverse = false) {
  if (value == null) return 'text-muted-foreground';
  const positive = inverse ? value < 0 : value > 0;
  if (positive) return 'text-emerald-600';
  if (value === 0) return 'text-muted-foreground';
  return 'text-rose-600';
}

function healthTone(status: string | null | undefined) {
  if (status === 'ok') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (status === 'warning') return 'border-amber-200 bg-amber-50 text-amber-700';
  if (status === 'blocked') return 'border-slate-200 bg-slate-100 text-slate-700';
  return 'border-rose-200 bg-rose-50 text-rose-700';
}

function campaignTone(classification: string | null | undefined) {
  if (classification === 'improving') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (classification === 'paused') return 'border-slate-200 bg-slate-100 text-slate-700';
  if (classification === 'no_volume') return 'border-amber-200 bg-amber-50 text-amber-700';
  if (classification === 'stable') return 'border-sky-200 bg-sky-50 text-sky-700';
  return 'border-rose-200 bg-rose-50 text-rose-700';
}

function recommendationConfidenceTone(confidence: string | null | undefined) {
  if (confidence === 'high') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (confidence === 'medium') return 'border-amber-200 bg-amber-50 text-amber-700';
  return 'border-slate-200 bg-slate-100 text-slate-700';
}

function recommendationPriorityTone(priority: string | null | undefined) {
  if (priority === 'high') return 'border-rose-200 bg-rose-50 text-rose-700';
  if (priority === 'medium') return 'border-amber-200 bg-amber-50 text-amber-700';
  return 'border-slate-200 bg-slate-100 text-slate-700';
}

function recommendationUrgencyLabel(urgency: string | null | undefined) {
  if (urgency === 'now') return 'agora';
  if (urgency === 'this_week') return 'esta semana';
  return 'monitorar';
}

function recommendationActionLabel(action: string | null | undefined) {
  if (action === 'pause') return 'pausar';
  if (action === 'reduce_budget') return 'reduzir verba';
  if (action === 'fix_measurement') return 'corrigir tracking';
  if (action === 'keep') return 'manter';
  return 'observar';
}

function recommendationActionTone(action: string | null | undefined) {
  if (action === 'pause') return 'border-rose-200 bg-rose-50 text-rose-700';
  if (action === 'reduce_budget' || action === 'fix_measurement') return 'border-amber-200 bg-amber-50 text-amber-700';
  if (action === 'keep') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  return 'border-slate-200 bg-slate-100 text-slate-700';
}

function productStatusTone(status: string | null | undefined) {
  if (status === 'ELIGIBLE') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (status === 'ELIGIBLE_LIMITED') return 'border-amber-200 bg-amber-50 text-amber-700';
  if (status === 'NOT_ELIGIBLE') return 'border-rose-200 bg-rose-50 text-rose-700';
  return 'border-slate-200 bg-slate-100 text-slate-700';
}

function StatusPill({ label, tone }: { label: string; tone: string }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] ${tone}`}>
      {label}
    </span>
  );
}

function MetricCard({
  title,
  value,
  delta,
  inverseDelta = false,
  subtitle,
}: {
  title: string;
  value: string;
  delta?: number | null;
  inverseDelta?: boolean;
  subtitle?: string;
}) {
  return (
    <Card.Root>
      <Card.Content className="space-y-2 p-5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{title}</p>
        <p className="text-2xl font-bold tracking-tight text-foreground">{value}</p>
        <div className="flex items-center justify-between gap-3">
          <p className={`text-xs font-semibold ${deltaTone(delta, inverseDelta)}`}>{formatDelta(delta, inverseDelta)}</p>
          {subtitle ? <p className="text-xs text-muted-foreground">{subtitle}</p> : null}
        </div>
      </Card.Content>
    </Card.Root>
  );
}

function SectionError({ message }: { message: string }) {
  return (
    <div className="rounded-2xl border border-destructive/20 bg-destructive/10 p-4 text-sm text-destructive">
      <div className="flex items-start gap-3">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
        <p>{message}</p>
      </div>
    </div>
  );
}

function LoadingState({ label }: { label: string }) {
  return (
    <div className="flex h-56 items-center justify-center">
      <div className="flex flex-col items-center gap-3 text-muted-foreground">
        <Loader2 className="h-8 w-8 animate-spin" />
        <span className="text-sm font-medium">{label}</span>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
}: {
  label: string;
  value: string | number | null | undefined;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <label className="space-y-2">
      <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{label}</span>
      <input
        type={type}
        value={value ?? ''}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none transition focus:border-primary/40 focus:ring-4 focus:ring-primary/10"
      />
    </label>
  );
}

function TextAreaField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string | null | undefined;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="space-y-2">
      <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{label}</span>
      <textarea
        value={value ?? ''}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        rows={4}
        className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none transition focus:border-primary/40 focus:ring-4 focus:ring-primary/10"
      />
    </label>
  );
}

function KeyValueRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-border/60 py-3 last:border-b-0">
      <p className="text-sm text-muted-foreground">{label}</p>
      <div className="text-right text-sm font-medium text-foreground">{value}</div>
    </div>
  );
}

function SmallList({
  title,
  items,
  emptyLabel,
  formatter,
}: {
  title: string;
  items: any[];
  emptyLabel: string;
  formatter?: (item: any) => React.ReactNode;
}) {
  return (
    <Card.Root>
      <Card.Header>
        <Card.Title className="text-sm">{title}</Card.Title>
      </Card.Header>
      <Card.Content className="space-y-3">
        {items?.length ? items.map((item, index) => (
          <div key={`${title}-${index}`} className="rounded-2xl border border-border/60 bg-background p-3">
            {formatter ? formatter(item) : (
              <div className="space-y-1">
                <p className="text-sm font-semibold text-foreground">{item?.name || item?.label || item?.item_id || item?.order_id || 'Item'}</p>
                {item?.detail ? <p className="text-xs text-muted-foreground">{item.detail}</p> : null}
              </div>
            )}
          </div>
        )) : (
          <p className="text-sm text-muted-foreground">{emptyLabel}</p>
        )}
      </Card.Content>
    </Card.Root>
  );
}

export function GoogleAdsAdminPage() {
  const [period, setPeriod] = useState<RangeKey>('month');
  const [config, setConfig] = useState<GoogleAdsConfig | null>(null);
  const [redactedConfig, setRedactedConfig] = useState<any>(null);
  const [health, setHealth] = useState<any>(null);
  const [dashboard, setDashboard] = useState<any>(null);
  const [recommendations, setRecommendations] = useState<any>(null);
  const [campaigns, setCampaigns] = useState<any>(null);
  const [merchant, setMerchant] = useState<any>(null);
  const [whatsapp, setWhatsapp] = useState<any>(null);
  const [queue, setQueue] = useState<any>(null);
  const [reconcile, setReconcile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyAction, setBusyAction] = useState<AdminAction | null>(null);
  const [errors, setErrors] = useState<SectionErrorMap>({});
  const [merchantStatus, setMerchantStatus] = useState('');
  const [merchantSearch, setMerchantSearch] = useState('');

  const loadCore = useCallback(async (force = false) => {
    setLoading(true);
    const suffix = force ? '&force=1' : '';

    const [configResult, healthResult, dashboardResult, recommendationsResult, campaignsResult, whatsappResult, queueResult, reconcileResult] = await Promise.allSettled([
      adminFetch(`${API}/admin/google-ads/config`),
      adminFetch(`${API}/admin/google-ads/health${force ? '?force=1' : ''}`),
      adminFetch(`${API}/admin/google-ads/dashboard?range=${period}${suffix}`),
      adminFetch(`${API}/admin/google-ads/recommendations?range=${period}${suffix}`),
      adminFetch(`${API}/admin/google-ads/campaigns?range=${period}${suffix}`),
      adminFetch(`${API}/admin/google-ads/whatsapp-offline-summary?range=${period}${suffix}`),
      adminFetch(`${API}/admin/google-ads/offline-queue`),
      adminFetch(`${API}/admin/google-ads/reconcile`, { method: 'POST' }),
    ]);

    const nextErrors: SectionErrorMap = {};

    const handleJson = async (
      result: PromiseSettledResult<Response>,
      key: keyof SectionErrorMap,
      setter: (value: any) => void,
      transform?: (payload: any) => any,
    ) => {
      if (result.status !== 'fulfilled') {
        nextErrors[key] = result.reason?.message || 'Falha ao carregar este bloco.';
        return;
      }

      const payload = await result.value.json().catch(() => null);
      if (!result.value.ok) {
        nextErrors[key] = payload?.error || `Falha ao carregar ${key}.`;
        return;
      }

      nextErrors[key] = undefined;
      setter(transform ? transform(payload) : payload);
    };

    await Promise.all([
      handleJson(configResult, 'config', (payload) => {
        setConfig(payload?.config || null);
        setRedactedConfig(payload?.redacted || null);
      }),
      handleJson(healthResult, 'health', setHealth),
      handleJson(dashboardResult, 'dashboard', setDashboard),
      handleJson(recommendationsResult, 'recommendations', setRecommendations),
      handleJson(campaignsResult, 'campaigns', setCampaigns),
      handleJson(whatsappResult, 'whatsapp', setWhatsapp),
      handleJson(queueResult, 'queue', setQueue),
      handleJson(reconcileResult, 'reconcile', setReconcile),
    ]);

    setErrors((prev) => ({
      ...prev,
      config: undefined,
      health: undefined,
      dashboard: undefined,
      recommendations: undefined,
      campaigns: undefined,
      whatsapp: undefined,
      queue: undefined,
      reconcile: undefined,
      ...nextErrors,
    }));
    setLoading(false);
  }, [period]);

  const loadMerchant = useCallback(async () => {
    try {
      const query = new URLSearchParams({ range: period });
      if (merchantStatus) query.set('status', merchantStatus);
      if (merchantSearch.trim()) query.set('search', merchantSearch.trim());
      const response = await adminFetch(`${API}/admin/google-ads/merchant-products?${query.toString()}`);
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || 'Falha ao carregar produtos do Merchant.');
      setMerchant(payload);
      setErrors((prev) => ({ ...prev, merchant: undefined }));
    } catch (error: any) {
      setErrors((prev) => ({ ...prev, merchant: error?.message || 'Falha ao carregar produtos do Merchant.' }));
    }
  }, [merchantSearch, merchantStatus, period]);

  useEffect(() => {
    void loadCore(false);
  }, [loadCore]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void loadMerchant();
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [loadMerchant]);

  const handleSave = useCallback(async () => {
    if (!config) return;
    setSaving(true);
    try {
      const response = await adminFetch(`${API}/admin/google-ads/config`, {
        method: 'PUT',
        body: JSON.stringify(config),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || 'Falha ao salvar configurações.');
      setConfig(payload?.config || null);
      setRedactedConfig(payload?.redacted || null);
      toast.success('Configurações do Google Ads salvas.');
      await loadCore(true);
      await loadMerchant();
    } catch (error: any) {
      toast.error(error?.message || 'Falha ao salvar configurações.');
    } finally {
      setSaving(false);
    }
  }, [config, loadCore, loadMerchant]);

  const runAction = useCallback(async (action: AdminAction) => {
    setBusyAction(action);
    try {
      const endpoint =
        action === 'test'
          ? '/admin/google-ads/test-connection'
          : action === 'sync'
          ? '/admin/google-ads/sync-conversions'
          : action === 'ensure_conversions'
          ? '/admin/google-ads/ensure-conversions'
          : action === 'ensure_merchant'
          ? '/admin/google-ads/ensure-merchant-link'
          : action === 'provision_pmax'
          ? '/admin/google-ads/provision-pmax'
          : action === 'provision_all'
          ? '/admin/google-ads/provision-base'
          : action === 'reprocess'
          ? '/admin/google-ads/offline-queue/reprocess'
          : '/admin/google-ads/reconcile';

      const body =
        action === 'reprocess'
          ? { limit: 10 }
          : action === 'provision_pmax' || action === 'provision_all'
          ? {
              campaign_name: config?.pmax_base_campaign_name,
              feed_label: config?.pmax_feed_label,
              daily_budget_brl: config?.pmax_default_daily_budget_brl,
              target_roas: config?.pmax_default_target_roas,
              website_url: config?.website_url,
            }
          : {};

      const response = await adminFetch(`${API}${endpoint}`, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error || `Falha ao executar ${action}.`);

      toast.success(
        action === 'test'
          ? 'Credenciais validadas.'
          : action === 'sync'
          ? 'Health sincronizado.'
          : action === 'ensure_conversions'
          ? 'Conversion actions garantidas.'
          : action === 'ensure_merchant'
          ? 'Fluxo de Merchant executado.'
          : action === 'provision_pmax'
          ? 'PMax base provisionada.'
          : action === 'provision_all'
          ? 'Setup base automatizado.'
          : action === 'reprocess'
          ? 'Fila offline reprocessada.'
          : 'Reconciliação concluída.',
      );

      await loadCore(true);
      await loadMerchant();
    } catch (error: any) {
      toast.error(error?.message || `Falha ao executar ${action}.`);
    } finally {
      setBusyAction(null);
    }
  }, [config, loadCore, loadMerchant]);

  const healthSource = health || dashboard?.health || null;

  const readinessItems = useMemo(() => {
    const readiness = healthSource?.readiness || {};
    return [
      { label: 'Credenciais', value: readiness.credentials },
      { label: 'Conversões', value: readiness.conversions },
      { label: 'Merchant', value: readiness.merchant },
      { label: 'Tracking com valor', value: readiness.value_tracking },
      { label: 'Fila offline', value: readiness.offline_queue },
      { label: 'PMax', value: readiness.pmax_enabled },
    ];
  }, [healthSource]);

  const campaignRows = useMemo(() => campaigns?.campaigns || [], [campaigns]);
  const merchantRows = useMemo(() => merchant?.rows || [], [merchant]);
  const improvingCampaigns = useMemo(() => dashboard?.executive?.improving_campaigns || [], [dashboard]);
  const worseningCampaigns = useMemo(() => dashboard?.executive?.worsening_campaigns || [], [dashboard]);
  const healthAlerts = useMemo(() => dashboard?.executive?.alerts || [], [dashboard]);
  const tagActivity = useMemo(() => dashboard?.tag_activity || null, [dashboard]);
  const recommendationPriorities = useMemo(() => recommendations?.top_priorities || [], [recommendations]);
  const recommendationCampaignActions = useMemo(() => recommendations?.campaign_actions || [], [recommendations]);
  const recommendationWarnings = useMemo(() => recommendations?.warnings || [], [recommendations]);

  return (
    <div className="mx-auto max-w-[1480px] space-y-6 px-4 pb-12 pt-6 lg:px-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="flex items-center gap-3 text-2xl font-bold tracking-tight text-foreground">
            <div className="rounded-2xl bg-primary/10 p-2.5">
              <BarChart3 className="h-5 w-5 text-primary" />
            </div>
            Google Ads e Merchant
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Painel diário de decisão para mídia, Merchant, WhatsApp e offline conversions.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="rounded-xl bg-muted p-1">
            {PERIODS.map((periodOption) => (
              <button
                key={periodOption.key}
                onClick={() => setPeriod(periodOption.key)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${period === periodOption.key ? 'bg-card text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground'}`}
              >
                {periodOption.label}
              </button>
            ))}
          </div>
          <Button
            color="secondary"
            size="sm"
            iconLeading={<RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />}
            onClick={() => {
              void loadCore(true);
              void loadMerchant();
            }}
          >
            Atualizar
          </Button>
        </div>
      </div>

      {loading && !dashboard && !config ? <LoadingState label="Carregando painel estratégico do Google Ads..." /> : null}

      {!loading || dashboard || config ? (
        <Tabs defaultValue="overview" className="space-y-4">
          <TabsList className="w-full flex-wrap md:w-auto">
            <TabsTrigger value="overview" className="gap-2"><Activity className="h-4 w-4" /> Visão Geral</TabsTrigger>
            <TabsTrigger value="campaigns" className="gap-2"><Target className="h-4 w-4" /> Campanhas</TabsTrigger>
            <TabsTrigger value="merchant" className="gap-2"><ShoppingBag className="h-4 w-4" /> Merchant e Produtos</TabsTrigger>
            <TabsTrigger value="whatsapp" className="gap-2"><MessagesSquare className="h-4 w-4" /> WhatsApp e Offline</TabsTrigger>
            <TabsTrigger value="settings" className="gap-2"><Settings2 className="h-4 w-4" /> Configurações</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            {errors.dashboard ? <SectionError message={errors.dashboard} /> : null}
            {errors.health ? <SectionError message={errors.health} /> : null}
            {errors.recommendations ? <SectionError message={errors.recommendations} /> : null}

            {dashboard ? (
              <>
                {recommendations ? (
                  <Card.Root>
                    <Card.Header>
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div>
                          <Card.Title className="flex items-center gap-2 text-sm">
                            <Sparkles className="h-4 w-4 text-primary" />
                            O que fazer agora
                          </Card.Title>
                          <Card.Description>
                            Leitura assistida por IA com fallback por regras. Baseada na janela {dashboard.range?.label || 'atual'}.
                          </Card.Description>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <StatusPill
                            label={recommendations.source === 'openai' ? 'IA ativa' : 'regras'}
                            tone={recommendations.source === 'openai' ? 'border-primary/20 bg-primary/10 text-primary' : 'border-slate-200 bg-slate-100 text-slate-700'}
                          />
                          <StatusPill
                            label={`confianca ${recommendations.confidence || 'media'}`}
                            tone={recommendationConfidenceTone(recommendations.confidence)}
                          />
                          {recommendations.cache?.hit ? (
                            <StatusPill
                              label={`cache ${formatNumber(recommendations.cache?.age_minutes, 1)} min`}
                              tone="border-slate-200 bg-slate-100 text-slate-700"
                            />
                          ) : null}
                        </div>
                      </div>
                    </Card.Header>
                    <Card.Content className="space-y-5">
                      <div className="rounded-2xl border border-border/60 bg-secondary/30 p-4">
                        <p className="text-base font-semibold text-foreground">{recommendations.headline || 'Sem leitura automatizada no momento.'}</p>
                        <p className="mt-2 text-sm text-muted-foreground">{recommendations.summary}</p>
                        <p className="mt-3 text-xs text-muted-foreground">
                          <span className="font-semibold text-foreground">Raiz:</span> {recommendations.root_cause}
                        </p>
                      </div>

                      <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
                        <div className="space-y-3">
                          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Prioridades</p>
                          {recommendationPriorities.length ? recommendationPriorities.map((item: any, index: number) => (
                            <div key={`${item.title}-${index}`} className="rounded-2xl border border-border/60 bg-background p-4">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="text-sm font-semibold text-foreground">{item.title}</p>
                                <StatusPill label={item.priority || 'medium'} tone={recommendationPriorityTone(item.priority)} />
                                <StatusPill label={recommendationUrgencyLabel(item.urgency)} tone="border-slate-200 bg-slate-100 text-slate-700" />
                              </div>
                              <p className="mt-2 text-sm text-muted-foreground">{item.action}</p>
                              <p className="mt-2 text-xs text-muted-foreground">{item.why}</p>
                              <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Owner: {item.owner || 'midia paga'}</p>
                            </div>
                          )) : (
                            <p className="text-sm text-muted-foreground">Ainda nao ha prioridades sugeridas.</p>
                          )}
                        </div>

                        <div className="space-y-4">
                          <SmallList
                            title="Proximas checagens"
                            items={recommendations.next_checks || []}
                            emptyLabel="Nenhuma checagem adicional sugerida."
                            formatter={(item) => (
                              <div className="space-y-1">
                                <p className="text-sm text-foreground">{item}</p>
                              </div>
                            )}
                          />

                          <SmallList
                            title="Alertas de contexto"
                            items={recommendationWarnings}
                            emptyLabel="Nenhum alerta extra alem dos numeros da conta."
                            formatter={(item) => (
                              <div className="space-y-1">
                                <p className="text-sm text-foreground">{item}</p>
                              </div>
                            )}
                          />
                        </div>
                      </div>
                    </Card.Content>
                  </Card.Root>
                ) : null}

                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                  <MetricCard title="Investimento" value={formatMoney(dashboard.summary?.spend?.current)} delta={dashboard.summary?.spend?.delta_pct} />
                  <MetricCard title="Conversões" value={formatNumber(dashboard.summary?.conversions?.current, 0)} delta={dashboard.summary?.conversions?.delta_pct} />
                  <MetricCard title="Valor Gerado" value={formatMoney(dashboard.summary?.conversion_value?.current)} delta={dashboard.summary?.conversion_value?.delta_pct} />
                  <MetricCard title="ROAS" value={`${formatNumber(dashboard.summary?.roas?.current, 2)}x`} delta={dashboard.summary?.roas?.delta_pct} />
                  <MetricCard title="CPA" value={dashboard.summary?.cpa?.current != null ? formatMoney(dashboard.summary?.cpa?.current) : 'Sem CPA'} delta={dashboard.summary?.cpa?.delta_pct} inverseDelta />
                </div>

                <div className="grid gap-4 xl:grid-cols-[1.4fr_0.8fr]">
                  <Card.Root>
                    <Card.Header>
                      <Card.Title className="text-sm">Leitura executiva</Card.Title>
                      <Card.Description>
                        Janela atual: {dashboard.range?.label || '30 dias'} comparada com a janela anterior equivalente.
                      </Card.Description>
                    </Card.Header>
                    <Card.Content className="grid gap-4 lg:grid-cols-2">
                      <div className="space-y-3">
                        <div className="flex items-center gap-2 text-sm font-semibold text-emerald-700">
                          <TrendingUp className="h-4 w-4" />
                          Campanhas melhorando
                        </div>
                        {improvingCampaigns.length ? improvingCampaigns.map((campaign: any) => (
                          <div key={campaign.id || campaign.name} className="rounded-2xl border border-emerald-100 bg-emerald-50/60 p-3">
                            <p className="text-sm font-semibold text-foreground">{campaign.name}</p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              ROAS {formatNumber(campaign.roas, 2)}x · valor {formatDelta(campaign.value_delta_pct)} · ROAS {formatDelta(campaign.roas_delta_pct)}
                            </p>
                          </div>
                        )) : (
                          <p className="text-sm text-muted-foreground">Nenhuma campanha com tendência claramente positiva nesta janela.</p>
                        )}
                      </div>

                      <div className="space-y-3">
                        <div className="flex items-center gap-2 text-sm font-semibold text-rose-700">
                          <TrendingDown className="h-4 w-4" />
                          Campanhas desperdiçando verba
                        </div>
                        {worseningCampaigns.length ? worseningCampaigns.map((campaign: any) => (
                          <div key={campaign.id || campaign.name} className="rounded-2xl border border-rose-100 bg-rose-50/60 p-3">
                            <p className="text-sm font-semibold text-foreground">{campaign.name}</p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              Gasto {formatMoney(campaign.spend)} · ROAS {formatNumber(campaign.roas, 2)}x · delta {formatDelta(campaign.roas_delta_pct)}
                            </p>
                          </div>
                        )) : (
                          <p className="text-sm text-muted-foreground">Nenhuma campanha apareceu em alerta forte nesta janela.</p>
                        )}
                      </div>
                    </Card.Content>
                  </Card.Root>

                  <Card.Root>
                    <Card.Header>
                      <Card.Title className="text-sm">Saúde da integração</Card.Title>
                    </Card.Header>
                    <Card.Content className="space-y-3">
                      <div className="flex items-center justify-between gap-3 rounded-2xl border border-border/60 bg-secondary/30 p-3">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Estado geral</p>
                          <p className="mt-1 text-sm font-semibold text-foreground">{String(healthSource?.state || 'indefinido').toUpperCase()}</p>
                        </div>
                        <StatusPill label={healthSource?.state || 'unknown'} tone={healthTone(healthSource?.state)} />
                      </div>

                      {readinessItems.map((item) => (
                        <div key={item.label} className="flex items-center justify-between gap-3 rounded-xl border border-border/60 px-3 py-2">
                          <p className="text-sm text-foreground">{item.label}</p>
                          <div className={`inline-flex items-center gap-2 text-xs font-semibold ${item.value ? 'text-emerald-700' : 'text-rose-700'}`}>
                            {item.value ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
                            {item.value ? 'OK' : 'Atenção'}
                          </div>
                        </div>
                      ))}
                    </Card.Content>
                  </Card.Root>
                </div>

                <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
                  <Card.Root>
                    <Card.Header>
                      <Card.Title className="text-sm">Mix de conversão</Card.Title>
                      <Card.Description>Separa compra web, lead qualificado e venda fechada via WhatsApp.</Card.Description>
                    </Card.Header>
                    <Card.Content className="space-y-3">
                      {(dashboard.conversion_mix || []).map((item: any) => (
                        <div key={item.key} className="rounded-2xl border border-border/60 bg-background p-3">
                          <div className="flex items-center justify-between gap-3">
                            <p className="text-sm font-semibold text-foreground">{item.label}</p>
                            <p className="text-sm font-bold text-foreground">{formatNumber(item.conversions, 0)}</p>
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">Valor atribuído: {formatMoney(item.value)}</p>
                        </div>
                      ))}
                    </Card.Content>
                  </Card.Root>

                  <div className="grid gap-4 md:grid-cols-2">
                    <SmallList
                      title="Alertas de saúde"
                      items={healthAlerts}
                      emptyLabel="Nenhum alerta crítico encontrado."
                      formatter={(item) => (
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <StatusPill label={item.status} tone={healthTone(item.status)} />
                            <p className="text-sm font-semibold text-foreground">{item.label}</p>
                          </div>
                          <p className="text-xs text-muted-foreground">{item.detail}</p>
                        </div>
                      )}
                    />

                    <Card.Root>
                      <Card.Header>
                        <Card.Title className="text-sm">Resumo rápido</Card.Title>
                      </Card.Header>
                      <Card.Content className="space-y-2">
                        <KeyValueRow label="Produtos com issue" value={formatNumber(dashboard.merchant_overview?.with_issues, 0)} />
                        <KeyValueRow label="Produtos aparecendo" value={formatNumber(dashboard.merchant_overview?.with_impressions, 0)} />
                        <KeyValueRow label="Leads WhatsApp" value={formatNumber(dashboard.whatsapp_overview?.leads_generated, 0)} />
                        <KeyValueRow label="Vendas fechadas" value={formatNumber(dashboard.whatsapp_overview?.sales_closed, 0)} />
                        <KeyValueRow label="Taxa de fechamento" value={formatPercent(dashboard.whatsapp_overview?.closure_rate)} />
                      </Card.Content>
                    </Card.Root>
                  </div>
                </div>

                {tagActivity ? (
                  <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
                    <Card.Root>
                      <Card.Header>
                        <Card.Title className="text-sm">Ativação das tags Google</Card.Title>
                        <Card.Description>
                          Mostra quantas vezes os eventos que disparam tags do Google foram registrados no site e de onde vieram.
                        </Card.Description>
                      </Card.Header>
                      <Card.Content className="space-y-3">
                        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                          <MetricCard title="Ativações totais" value={formatNumber(tagActivity.total_activations, 0)} />
                          <MetricCard title="Ativações de conversão" value={formatNumber(tagActivity.conversion_activations, 0)} />
                          <MetricCard title="Origem líder" value={tagActivity.top_channels?.[0]?.label || 'Sem origem'} subtitle={tagActivity.top_channels?.[0] ? `${formatNumber(tagActivity.top_channels[0].value, 0)} ativações` : undefined} />
                          <MetricCard title="Campanha líder" value={tagActivity.top_campaigns?.[0]?.label || 'Sem campanha'} subtitle={tagActivity.top_campaigns?.[0] ? `${formatNumber(tagActivity.top_campaigns[0].value, 0)} ativações` : 'UTM indisponível'} />
                        </div>

                        <div className="space-y-3">
                          {(tagActivity.rows || []).map((item: any) => (
                            <div key={item.key} className="rounded-2xl border border-border/60 bg-background p-4">
                              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                                <div className="space-y-1">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <p className="text-sm font-semibold text-foreground">{item.label}</p>
                                    <StatusPill
                                      label={item.google_event_name === 'conversion' ? 'conversion' : item.google_event_name}
                                      tone={item.google_event_name === 'conversion' ? healthTone('ok') : 'border-slate-200 bg-slate-100 text-slate-700'}
                                    />
                                  </div>
                                  <p className="text-xs text-muted-foreground">
                                    {item.goal_label ? `Meta: ${item.goal_label}` : 'Evento de funil / apoio'}
                                    {item.send_to ? ` • send_to: ${item.send_to}` : ''}
                                  </p>
                                </div>
                                <div className="text-left lg:text-right">
                                  <p className="text-lg font-bold tracking-tight text-foreground">{formatNumber(item.activations, 0)}</p>
                                  <p className="text-xs text-muted-foreground">
                                    {formatNumber(item.sessions, 0)} sessões • {formatMoney(item.total_value)}
                                  </p>
                                </div>
                              </div>
                              <div className="mt-3 grid gap-2 text-xs text-muted-foreground md:grid-cols-3">
                                <p><span className="font-semibold text-foreground">Origem:</span> {formatInlineBreakdown(item.top_channels, 'Sem origem')}</p>
                                <p><span className="font-semibold text-foreground">Campanha:</span> {formatInlineBreakdown(item.top_campaigns, 'Sem campanha')}</p>
                                <p><span className="font-semibold text-foreground">Baseado em:</span> {formatInlineBreakdown(item.top_surfaces, 'Sem superfície')}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </Card.Content>
                    </Card.Root>

                    <div className="grid gap-4">
                      <SmallList
                        title="Origem das ativações"
                        items={tagActivity.top_channels || []}
                        emptyLabel="Nenhuma origem identificada nesta janela."
                        formatter={(item) => (
                          <div className="flex items-center justify-between gap-3">
                            <p className="text-sm font-semibold text-foreground">{item.label}</p>
                            <p className="text-xs text-muted-foreground">{formatNumber(item.value, 0)} ativações • {formatPercent(item.pct)}</p>
                          </div>
                        )}
                      />

                      <SmallList
                        title="Campanhas / UTM"
                        items={tagActivity.top_campaigns || []}
                        emptyLabel="Nenhuma campanha UTM acompanhou estas ativações."
                        formatter={(item) => (
                          <div className="flex items-center justify-between gap-3">
                            <p className="text-sm font-semibold text-foreground">{item.label}</p>
                            <p className="text-xs text-muted-foreground">{formatNumber(item.value, 0)} ativações</p>
                          </div>
                        )}
                      />

                      <SmallList
                        title="Superfícies que mais ativam"
                        items={tagActivity.top_surfaces || []}
                        emptyLabel="Nenhuma superfície identificada."
                        formatter={(item) => (
                          <div className="flex items-center justify-between gap-3">
                            <p className="text-sm font-semibold text-foreground">{item.label}</p>
                            <p className="text-xs text-muted-foreground">{formatNumber(item.value, 0)} ativações</p>
                          </div>
                        )}
                      />
                    </div>
                  </div>
                ) : null}
              </>
            ) : !errors.dashboard ? <LoadingState label="Montando visão geral estratégica..." /> : null}
          </TabsContent>

          <TabsContent value="campaigns" className="space-y-6">
            {errors.campaigns ? <SectionError message={errors.campaigns} /> : null}

            {campaigns ? (
              <>
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <MetricCard title="Campanhas ativas" value={formatNumber(campaignRows.filter((item: any) => item.classification !== 'paused').length, 0)} />
                  <MetricCard title="PMax legadas" value={formatNumber(campaignRows.filter((item: any) => item.bucket === 'pmax_legacy').length, 0)} />
                  <MetricCard title="PMax base controlada" value={formatNumber(campaignRows.filter((item: any) => item.bucket === 'pmax_base').length, 0)} />
                  <MetricCard title="Risco de canibalização" value={formatNumber(campaigns.cannibalization_risks?.length, 0)} />
                </div>

                <SmallList
                  title="Risco de canibalização"
                  items={campaigns.cannibalization_risks || []}
                  emptyLabel="Nenhum sinal forte de campanhas disputando o mesmo feed nesta leitura."
                  formatter={(item) => (
                    <div className="space-y-2">
                      <p className="text-sm font-semibold text-foreground">
                        Merchant {item.merchant_center_id || 'sem merchant'} · Feed {item.feed_label || 'default'}
                      </p>
                      <div className="space-y-1 text-xs text-muted-foreground">
                        {item.campaigns.map((campaign: any) => (
                          <p key={campaign.id || campaign.name}>
                            {campaign.name} · {campaign.bucket} · {formatMoney(campaign.cost)} · ROAS {formatNumber(campaign.roas, 2)}x
                          </p>
                        ))}
                      </div>
                    </div>
                  )}
                />

                {recommendations ? (
                  <SmallList
                    title="Acoes sugeridas por campanha"
                    items={recommendationCampaignActions}
                    emptyLabel="Nenhuma campanha recebeu acao sugerida."
                    formatter={(item) => (
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-semibold text-foreground">{item.campaign_name}</p>
                          <StatusPill label={recommendationActionLabel(item.recommendation)} tone={recommendationActionTone(item.recommendation)} />
                          <StatusPill label={item.priority || 'medium'} tone={recommendationPriorityTone(item.priority)} />
                        </div>
                        <p className="text-xs text-muted-foreground">{item.reason}</p>
                      </div>
                    )}
                  />
                ) : null}

                <Card.Root>
                  <Card.Header>
                    <Card.Title className="text-sm">Campanhas</Card.Title>
                    <Card.Description>
                      A campanha <strong>Toyoparts | PMax Retail Base</strong> aparece destacada como a PMax controlada pelo sistema.
                    </Card.Description>
                  </Card.Header>
                  <Card.Content className="overflow-x-auto p-0">
                    <table className="min-w-full text-sm">
                      <thead className="bg-secondary/40 text-left text-xs uppercase tracking-[0.16em] text-muted-foreground">
                        <tr>
                          <th className="px-4 py-3">Campanha</th>
                          <th className="px-4 py-3">Status</th>
                          <th className="px-4 py-3">Tipo</th>
                          <th className="px-4 py-3">Feed</th>
                          <th className="px-4 py-3">Custo</th>
                          <th className="px-4 py-3">Conv.</th>
                          <th className="px-4 py-3">Valor</th>
                          <th className="px-4 py-3">ROAS</th>
                          <th className="px-4 py-3">CPA</th>
                          <th className="px-4 py-3">Delta</th>
                        </tr>
                      </thead>
                      <tbody>
                        {campaignRows.map((campaign: any) => (
                          <tr key={campaign.id || campaign.name} className="border-t border-border/60">
                            <td className="px-4 py-3 align-top">
                              <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                  <p className="font-semibold text-foreground">{campaign.name || 'Campanha sem nome'}</p>
                                  {campaign.is_base ? <StatusPill label="base" tone="border-primary/20 bg-primary/10 text-primary" /> : null}
                                </div>
                                <p className="text-xs text-muted-foreground">
                                  {campaign.advertising_channel_type || 'sem tipo'} · {campaign.bidding_strategy_type || 'estratégia não resolvida'}
                                </p>
                              </div>
                            </td>
                            <td className="px-4 py-3 align-top">
                              <StatusPill
                                label={
                                  campaign.classification === 'improving'
                                    ? 'melhorando'
                                    : campaign.classification === 'paused'
                                    ? 'pausada'
                                    : campaign.classification === 'no_volume'
                                    ? 'sem volume'
                                    : campaign.classification === 'stable'
                                    ? 'estavel'
                                    : 'em alerta'
                                }
                                tone={campaignTone(campaign.classification)}
                              />
                            </td>
                            <td className="px-4 py-3 align-top text-muted-foreground">{campaign.bucket}</td>
                            <td className="px-4 py-3 align-top text-muted-foreground">
                              {campaign.merchant_center_id || 'sem merchant'}
                              <br />
                              <span className="text-xs">{campaign.feed_label || 'feed default'}</span>
                            </td>
                            <td className="px-4 py-3 align-top font-medium text-foreground">{formatMoney(campaign.current?.cost)}</td>
                            <td className="px-4 py-3 align-top text-muted-foreground">{formatNumber(campaign.current?.conversions, 0)}</td>
                            <td className="px-4 py-3 align-top text-muted-foreground">{formatMoney(campaign.current?.conversion_value)}</td>
                            <td className="px-4 py-3 align-top text-muted-foreground">{formatNumber(campaign.current?.roas, 2)}x</td>
                            <td className="px-4 py-3 align-top text-muted-foreground">
                              {campaign.current?.cpa != null ? formatMoney(campaign.current.cpa) : 'Sem CPA'}
                            </td>
                            <td className="px-4 py-3 align-top">
                              <div className="space-y-1 text-xs">
                                <p className={deltaTone(campaign.delta?.roas_pct)}>ROAS {formatDelta(campaign.delta?.roas_pct)}</p>
                                <p className={deltaTone(campaign.delta?.conversion_value_pct)}>Valor {formatDelta(campaign.delta?.conversion_value_pct)}</p>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </Card.Content>
                </Card.Root>
              </>
            ) : !errors.campaigns ? <LoadingState label="Carregando campanhas..." /> : null}
          </TabsContent>

          <TabsContent value="merchant" className="space-y-6">
            {errors.merchant ? <SectionError message={errors.merchant} /> : null}

            <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
              <div className="flex-1">
                <Input
                  value={merchantSearch}
                  onChange={(event) => setMerchantSearch(event.target.value)}
                  placeholder="Buscar por SKU, título, marca ou feed"
                  iconLeading={Search}
                />
              </div>
              <select
                value={merchantStatus}
                onChange={(event) => setMerchantStatus(event.target.value)}
                className="h-10 rounded-xl border border-border bg-background px-3 text-sm outline-none transition focus:border-primary/40 focus:ring-4 focus:ring-primary/10"
              >
                <option value="">Todos os status</option>
                <option value="eligible">Elegíveis</option>
                <option value="limited">Elegíveis com restrição</option>
                <option value="not_eligible">Não elegíveis</option>
                <option value="serving">Aparecendo em mídia</option>
              </select>
            </div>

            {merchant ? (
              <>
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                  <MetricCard title="Produtos no Merchant" value={formatNumber(merchant.summary?.total, 0)} />
                  <MetricCard title="Elegíveis" value={formatNumber(merchant.summary?.eligible, 0)} />
                  <MetricCard title="Com restrição" value={formatNumber(merchant.summary?.limited, 0)} />
                  <MetricCard title="Com issue" value={formatNumber(merchant.summary?.with_issues, 0)} />
                  <MetricCard title="Com impressão" value={formatNumber(merchant.summary?.with_impressions, 0)} />
                </div>

                <div className="grid gap-4 xl:grid-cols-2">
                  <SmallList
                    title="Top SKUs por receita"
                    items={merchant.top_revenue || []}
                    emptyLabel="Nenhum SKU com receita nesta janela."
                    formatter={(item) => (
                      <div className="flex items-start gap-3">
                        {item.image_url ? (
                          <img src={item.image_url} alt={item.title || item.item_id} className="h-16 w-16 rounded-xl border border-border object-cover" loading="lazy" />
                        ) : (
                          <div className="flex h-16 w-16 items-center justify-center rounded-xl border border-dashed border-border bg-secondary/40 text-xs text-muted-foreground">
                            sem imagem
                          </div>
                        )}
                        <div className="min-w-0 space-y-1">
                          <p className="truncate text-sm font-semibold text-foreground">{item.item_id || item.title}</p>
                          <p className="line-clamp-2 text-xs text-muted-foreground">{item.title || 'Sem título'}</p>
                          <p className="text-xs text-muted-foreground">
                            {formatMoney(item.performance?.conversion_value)} · {formatNumber(item.performance?.conversions, 0)} conv.
                          </p>
                        </div>
                      </div>
                    )}
                  />

                  <div className="grid gap-4 sm:grid-cols-2">
                    <SmallList
                      title="Aprovados sem impressão"
                      items={merchant.approved_without_impressions || []}
                      emptyLabel="Todos os produtos elegíveis tiveram alguma impressão."
                      formatter={(item) => (
                        <div className="space-y-1">
                          <p className="text-sm font-semibold text-foreground">{item.item_id}</p>
                          <p className="line-clamp-2 text-xs text-muted-foreground">{item.title || 'Sem título'}</p>
                        </div>
                      )}
                    />

                    <SmallList
                      title="Clique sem conversão"
                      items={merchant.click_no_conversion || []}
                      emptyLabel="Nenhum produto com cliques sem conversão apareceu no topo."
                      formatter={(item) => (
                        <div className="space-y-1">
                          <p className="text-sm font-semibold text-foreground">{item.item_id}</p>
                          <p className="text-xs text-muted-foreground">
                            {formatNumber(item.performance?.clicks, 0)} cliques · {formatMoney(item.performance?.cost)} investidos
                          </p>
                        </div>
                      )}
                    />
                  </div>
                </div>

                <Card.Root>
                  <Card.Header>
                    <Card.Title className="text-sm">Produtos do Merchant</Card.Title>
                    <Card.Description>
                      Mostrando {formatNumber(merchant.filtered_count, 0)} produto(s) nesta visão filtrada.
                    </Card.Description>
                  </Card.Header>
                  <Card.Content className="overflow-x-auto p-0">
                    <table className="min-w-full text-sm">
                      <thead className="bg-secondary/40 text-left text-xs uppercase tracking-[0.16em] text-muted-foreground">
                        <tr>
                          <th className="px-4 py-3">Produto</th>
                          <th className="px-4 py-3">Status</th>
                          <th className="px-4 py-3">Preço</th>
                          <th className="px-4 py-3">Exposição</th>
                          <th className="px-4 py-3">Conversões</th>
                          <th className="px-4 py-3">Valor</th>
                          <th className="px-4 py-3">Issues</th>
                        </tr>
                      </thead>
                      <tbody>
                        {merchantRows.map((product: any) => (
                          <tr key={`${product.merchant_center_id}-${product.feed_label}-${product.item_id}`} className="border-t border-border/60">
                            <td className="px-4 py-3 align-top">
                              <div className="flex items-start gap-3">
                                {product.image_url ? (
                                  <img src={product.image_url} alt={product.title || product.item_id} className="h-16 w-16 rounded-xl border border-border object-cover" loading="lazy" />
                                ) : (
                                  <div className="flex h-16 w-16 items-center justify-center rounded-xl border border-dashed border-border bg-secondary/40 text-xs text-muted-foreground">
                                    sem imagem
                                  </div>
                                )}
                                <div className="min-w-0">
                                  <p className="text-sm font-semibold text-foreground">{product.item_id || 'sem item id'}</p>
                                  <p className="line-clamp-2 text-xs text-muted-foreground">{product.title || 'Sem título'}</p>
                                  <p className="mt-1 text-[11px] text-muted-foreground">
                                    {product.merchant_center_id || 'sem merchant'} · {product.feed_label || 'default'} · {product.availability || 'sem disponibilidade'}
                                  </p>
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-3 align-top">
                              <StatusPill label={product.status || 'unknown'} tone={productStatusTone(product.status)} />
                            </td>
                            <td className="px-4 py-3 align-top text-muted-foreground">{product.price ? formatMoney(product.price) : 'Sem preço'}</td>
                            <td className="px-4 py-3 align-top text-muted-foreground">
                              {formatNumber(product.performance?.impressions, 0)} imp.
                              <br />
                              <span className="text-xs">{formatNumber(product.performance?.clicks, 0)} cliques</span>
                            </td>
                            <td className="px-4 py-3 align-top text-muted-foreground">
                              {formatNumber(product.performance?.conversions, 0)} conv.
                              <br />
                              <span className="text-xs">{product.performance?.cpa != null ? formatMoney(product.performance.cpa) : 'Sem CPA'}</span>
                            </td>
                            <td className="px-4 py-3 align-top text-muted-foreground">
                              {formatMoney(product.performance?.conversion_value)}
                              <br />
                              <span className="text-xs">ROAS {formatNumber(product.performance?.roas, 2)}x</span>
                            </td>
                            <td className="px-4 py-3 align-top">
                              {product.issues?.length ? (
                                <div className="space-y-2">
                                  {product.issues.slice(0, 2).map((issue: any, index: number) => (
                                    <div key={index} className="rounded-xl border border-amber-200 bg-amber-50 px-2.5 py-2 text-xs text-amber-800">
                                      <p className="font-semibold">{issue.detail || issue.code || 'Issue sem detalhe'}</p>
                                      {issue.documentation ? (
                                        <a
                                          href={issue.documentation}
                                          target="_blank"
                                          rel="noreferrer"
                                          className="mt-1 inline-flex items-center gap-1 font-medium text-amber-900 underline"
                                        >
                                          Ver documentação
                                          <ExternalLink className="h-3.5 w-3.5" />
                                        </a>
                                      ) : null}
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <span className="text-xs text-muted-foreground">Sem issues</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </Card.Content>
                </Card.Root>
              </>
            ) : !errors.merchant ? <LoadingState label="Carregando produtos do Merchant..." /> : null}
          </TabsContent>

          <TabsContent value="whatsapp" className="space-y-6">
            {errors.whatsapp ? <SectionError message={errors.whatsapp} /> : null}

            {whatsapp ? (
              <>
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                  <MetricCard title="Leads gerados" value={formatNumber(whatsapp.leads_generated, 0)} />
                  <MetricCard title="Leads qualificados" value={formatNumber(whatsapp.leads_qualified, 0)} />
                  <MetricCard title="High intent" value={formatNumber(whatsapp.leads_high_intent, 0)} />
                  <MetricCard title="Vendas fechadas" value={formatNumber(whatsapp.sales_closed, 0)} />
                  <MetricCard title="Taxa de fechamento" value={formatPercent(whatsapp.closure_rate)} />
                </div>

                <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
                  <Card.Root>
                    <Card.Header>
                      <Card.Title className="text-sm">Leitura operacional</Card.Title>
                    </Card.Header>
                    <Card.Content className="space-y-2">
                      <KeyValueRow label="Pedidos WhatsApp sem lead" value={formatNumber(whatsapp.whatsapp_orders_without_lead, 0)} />
                      <KeyValueRow label="Conversões offline pendentes" value={formatNumber(whatsapp.offline_pending, 0)} />
                      <KeyValueRow label="Conversões aceitas pelo Google" value={formatNumber(whatsapp.offline_accepted, 0)} />
                      <KeyValueRow label="Valor total enviado" value={formatMoney(whatsapp.offline_sent_value)} />
                      <KeyValueRow label="Delay médio de envio" value={formatDelay(whatsapp.average_send_delay_minutes)} />
                    </Card.Content>
                  </Card.Root>

                  <div className="grid gap-4 md:grid-cols-2">
                    <SmallList
                      title="Pedidos sem lead vinculado"
                      items={whatsapp.top_pending_orders || []}
                      emptyLabel="Nenhum pedido WhatsApp sem lead vinculado nesta janela."
                      formatter={(item) => (
                        <div className="space-y-1">
                          <p className="text-sm font-semibold text-foreground">{item.order_id}</p>
                          <p className="text-xs text-muted-foreground">{item.customer_name || 'Cliente não identificado'} · {formatMoney(item.total)}</p>
                        </div>
                      )}
                    />

                    <SmallList
                      title="Fila offline recente"
                      items={whatsapp.recent_offline_jobs || []}
                      emptyLabel="Nenhum job offline recente."
                      formatter={(item) => (
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <StatusPill label={item.status} tone={healthTone(item.status === 'sent' ? 'ok' : item.status === 'pending' ? 'warning' : 'error')} />
                            <p className="text-sm font-semibold text-foreground">{item.order_id}</p>
                          </div>
                          <p className="text-xs text-muted-foreground">{formatMoney(item.conversion_value)} · {formatDateTime(item.sent_at || item.updated_at)}</p>
                        </div>
                      )}
                    />
                  </div>
                </div>
              </>
            ) : !errors.whatsapp ? <LoadingState label="Carregando resumo de WhatsApp e offline..." /> : null}
          </TabsContent>

          <TabsContent value="settings" className="space-y-6">
            {errors.config ? <SectionError message={errors.config} /> : null}

            {config ? (
              <>
                <div className="grid gap-4 xl:grid-cols-[0.85fr_1.15fr]">
                  <Card.Root>
                    <Card.Header>
                      <Card.Title className="text-sm">Contexto atual</Card.Title>
                    </Card.Header>
                    <Card.Content className="space-y-2">
                      <KeyValueRow label="Manager Customer ID" value={config.manager_customer_id || 'não configurado'} />
                      <KeyValueRow label="Customer ID" value={config.customer_id || 'não configurado'} />
                      <KeyValueRow label="Merchant Center ID" value={config.merchant_center_id || 'não configurado'} />
                      <KeyValueRow label="Auth mode" value={config.auth_mode} />
                      <KeyValueRow label="Último check" value={formatDateTime(config.last_successful_api_check_at)} />
                      <KeyValueRow label="PMax base" value={config.pmax_base_campaign_name || 'não provisionada'} />
                    </Card.Content>
                  </Card.Root>

                  <Card.Root>
                    <Card.Header>
                      <Card.Title className="text-sm">Credenciais salvas</Card.Title>
                      <Card.Description>Os itens abaixo já chegam preenchidos. Eles ficam aqui só para manutenção.</Card.Description>
                    </Card.Header>
                    <Card.Content className="grid gap-3 md:grid-cols-2">
                      <KeyValueRow label="Developer token" value={redactedConfig?.developer_token || 'não configurado'} />
                      <KeyValueRow label="OAuth refresh token" value={redactedConfig?.oauth_refresh_token || 'não configurado'} />
                      <KeyValueRow label="OAuth client secret" value={redactedConfig?.oauth_client_secret || 'não configurado'} />
                      <KeyValueRow label="Service account key" value={redactedConfig?.service_account_private_key || 'não configurado'} />
                    </Card.Content>
                  </Card.Root>
                </div>

                <Card.Root>
                  <Card.Header>
                    <Card.Title className="text-sm">Configurações</Card.Title>
                  </Card.Header>
                  <Card.Content className="space-y-6">
                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                      <Field label="Manager customer id" value={config.manager_customer_id} onChange={(value) => setConfig((prev) => prev ? { ...prev, manager_customer_id: value } : prev)} />
                      <Field label="Customer id" value={config.customer_id} onChange={(value) => setConfig((prev) => prev ? { ...prev, customer_id: value } : prev)} />
                      <Field label="Merchant center id" value={config.merchant_center_id} onChange={(value) => setConfig((prev) => prev ? { ...prev, merchant_center_id: value } : prev)} />
                      <Field label="Developer token" value={config.developer_token} onChange={(value) => setConfig((prev) => prev ? { ...prev, developer_token: value } : prev)} />
                      <Field label="Website URL" value={config.website_url} onChange={(value) => setConfig((prev) => prev ? { ...prev, website_url: value } : prev)} />
                      <Field label="Feed label" value={config.pmax_feed_label} onChange={(value) => setConfig((prev) => prev ? { ...prev, pmax_feed_label: value } : prev)} />
                      <Field label="Orçamento diário (BRL)" type="number" value={config.pmax_default_daily_budget_brl} onChange={(value) => setConfig((prev) => prev ? { ...prev, pmax_default_daily_budget_brl: Number(value || 0) } : prev)} />
                      <Field label="Target ROAS" type="number" value={config.pmax_default_target_roas} onChange={(value) => setConfig((prev) => prev ? { ...prev, pmax_default_target_roas: value === '' ? null : Number(value) } : prev)} />
                      <Field label="PMax base name" value={config.pmax_base_campaign_name} onChange={(value) => setConfig((prev) => prev ? { ...prev, pmax_base_campaign_name: value } : prev)} />
                    </div>

                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                      <Field label="OAuth client id" value={config.oauth_client_id} onChange={(value) => setConfig((prev) => prev ? { ...prev, oauth_client_id: value } : prev)} />
                      <Field label="OAuth client secret" value={config.oauth_client_secret} onChange={(value) => setConfig((prev) => prev ? { ...prev, oauth_client_secret: value } : prev)} />
                      <Field label="OAuth refresh token" value={config.oauth_refresh_token} onChange={(value) => setConfig((prev) => prev ? { ...prev, oauth_refresh_token: value } : prev)} />
                      <Field label="Service account project id" value={config.service_account_project_id} onChange={(value) => setConfig((prev) => prev ? { ...prev, service_account_project_id: value } : prev)} />
                      <Field label="Service account email" value={config.service_account_client_email} onChange={(value) => setConfig((prev) => prev ? { ...prev, service_account_client_email: value } : prev)} />
                      <Field label="Service account key id" value={config.service_account_private_key_id} onChange={(value) => setConfig((prev) => prev ? { ...prev, service_account_private_key_id: value } : prev)} />
                    </div>

                    <TextAreaField
                      label="Service account private key"
                      value={config.service_account_private_key}
                      onChange={(value) => setConfig((prev) => prev ? { ...prev, service_account_private_key: value } : prev)}
                    />

                    <div className="flex flex-wrap gap-3">
                      <Button size="sm" isLoading={saving} onClick={handleSave}>
                        Salvar configurações
                      </Button>
                      <a
                        href="https://ads.google.com/aw/apicenter"
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-semibold text-foreground hover:bg-secondary"
                      >
                        Abrir API Center
                        <ExternalLink className="h-4 w-4" />
                      </a>
                      <a
                        href="https://merchants.google.com/"
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-semibold text-foreground hover:bg-secondary"
                      >
                        Abrir Merchant Center
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    </div>
                  </Card.Content>
                </Card.Root>

                <details className="rounded-2xl border border-border bg-card shadow-xs">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-6 py-4 text-sm font-semibold text-foreground">
                    <span className="flex items-center gap-2"><Wrench className="h-4 w-4" /> Ações avançadas</span>
                    <span className="text-xs text-muted-foreground">Testes, provisionamento e fila offline</span>
                  </summary>
                  <div className="space-y-6 border-t border-border px-6 py-5">
                    <div className="flex flex-wrap gap-2">
                      <Button color="secondary" size="sm" iconLeading={busyAction === 'test' ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />} onClick={() => runAction('test')}>Testar credenciais</Button>
                      <Button color="secondary" size="sm" iconLeading={busyAction === 'sync' ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} onClick={() => runAction('sync')}>Validar health</Button>
                      <Button color="secondary" size="sm" iconLeading={busyAction === 'ensure_conversions' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} onClick={() => runAction('ensure_conversions')}>Garantir conversions</Button>
                      <Button color="secondary" size="sm" iconLeading={busyAction === 'ensure_merchant' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Layers3 className="h-4 w-4" />} onClick={() => runAction('ensure_merchant')}>Garantir Merchant</Button>
                      <Button color="secondary" size="sm" iconLeading={busyAction === 'provision_pmax' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Target className="h-4 w-4" />} onClick={() => runAction('provision_pmax')}>Provisionar PMax</Button>
                      <Button size="sm" iconLeading={busyAction === 'provision_all' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} onClick={() => runAction('provision_all')}>Automatizar setup base</Button>
                      <Button color="secondary" size="sm" iconLeading={busyAction === 'reprocess' ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />} onClick={() => runAction('reprocess')}>Reprocessar fila</Button>
                      <Button color="secondary" size="sm" iconLeading={busyAction === 'reconcile' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Activity className="h-4 w-4" />} onClick={() => runAction('reconcile')}>Rodar reconciliação</Button>
                    </div>

                    <div className="grid gap-4 xl:grid-cols-2">
                      <Card.Root>
                        <Card.Header>
                          <Card.Title className="text-sm">Fila offline</Card.Title>
                        </Card.Header>
                        <Card.Content className="space-y-2">
                          <KeyValueRow label="Pendentes" value={formatNumber(queue?.summary?.pending, 0)} />
                          <KeyValueRow label="Falhos" value={formatNumber(queue?.summary?.failed, 0)} />
                          <KeyValueRow label="Enviados" value={formatNumber(queue?.summary?.sent, 0)} />
                          <KeyValueRow label="Dead letter" value={formatNumber(queue?.summary?.dead_letter, 0)} />
                        </Card.Content>
                      </Card.Root>

                      <Card.Root>
                        <Card.Header>
                          <Card.Title className="text-sm">Reconciliação</Card.Title>
                        </Card.Header>
                        <Card.Content className="space-y-2">
                          <KeyValueRow label="Pedidos pagos sem job" value={formatNumber(reconcile?.paid_without_job?.length, 0)} />
                          <KeyValueRow label="Conversões sem pedido" value={formatNumber(reconcile?.sent_without_order?.length, 0)} />
                          <KeyValueRow label="Falhas recorrentes" value={formatNumber(reconcile?.recurring_failures?.length, 0)} />
                        </Card.Content>
                      </Card.Root>
                    </div>
                  </div>
                </details>
              </>
            ) : !errors.config ? <LoadingState label="Carregando configurações do Google Ads..." /> : null}
          </TabsContent>
        </Tabs>
      ) : null}
    </div>
  );
}
