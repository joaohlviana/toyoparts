import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Brain,
  CheckCircle2,
  Loader2,
  Pause,
  Play,
  RefreshCw,
  RotateCcw,
  Square,
  TimerReset,
} from 'lucide-react';
import { toast } from 'sonner';
import { projectId } from '../../../../utils/supabase/info';
import { adminFetch } from '../../lib/admin-auth';
import { Button } from '../base/button';
import { Badge } from '../base/badge';
import { Card } from '../base/card';
import { cn } from '../ui/utils';

const API = `https://${projectId}.supabase.co/functions/v1/make-server-1d6e33e0`;

type RunStatus = 'queued' | 'running' | 'paused' | 'completed' | 'completed_with_errors' | 'failed' | 'canceled';

interface CategoryEngineRun {
  run_id: string;
  status: RunStatus;
  started_at: string;
  last_heartbeat_at: string;
  completed_at?: string | null;
  discovered_count: number;
  processed_count: number;
  applied_count: number;
  retry_count: number;
  failed_count: number;
  skipped_count: number;
  low_confidence_auto_applied_count: number;
  current_sku?: string | null;
}

interface CategoryEngineItem {
  sku: string;
  status: string;
  attempt_count: number;
  suggested_category_path?: string | null;
  decision_source?: string | null;
  confidence?: number | null;
  review_flag?: boolean | null;
  last_error?: string | null;
  updated_at?: string;
}

interface CategoryEngineLog {
  id: number;
  sku?: string | null;
  level: 'info' | 'warning' | 'error' | 'success';
  stage: string;
  message: string;
  created_at: string;
}

interface CategoryEngineSettings {
  enabled: boolean;
  batch_size: number;
  max_concurrency: number;
  retry_limit: number;
  fallback_root_category_id: string;
  cron_enabled: boolean;
  watermark_low: number;
  watermark_target: number;
}

interface CategoryEngineStatusResponse {
  ok: boolean;
  settings: CategoryEngineSettings | null;
  activeRun: CategoryEngineRun | null;
  summary: {
    pending: number;
    analyzing: number;
    retry_wait: number;
    due_retries: number;
    applied: number;
    failed: number;
    skipped: number;
    review_flag_count: number;
    discovered: number;
    processed: number;
    remaining: number;
    throughput_per_hour: number;
  };
  currentItems: CategoryEngineItem[];
  recentLogs: CategoryEngineLog[];
  recentRuns: CategoryEngineRun[];
  eligibleTotal: number | null;
  health: {
    tablesReady: boolean;
    cronStrategy: string;
    message: string;
  };
  error?: string;
}

function formatDateTime(value?: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('pt-BR');
}

function statusColor(status?: string | null) {
  if (status === 'running') return 'success';
  if (status === 'completed') return 'brand';
  if (status === 'completed_with_errors' || status === 'paused') return 'warning';
  if (status === 'failed' || status === 'canceled') return 'error';
  return 'gray';
}

function logColor(level: string) {
  if (level === 'success') return 'success';
  if (level === 'warning') return 'warning';
  if (level === 'error') return 'error';
  return 'gray';
}

function buildStatusMessage(status: CategoryEngineStatusResponse | null) {
  if (!status) return 'Carregando motor...';
  if (status.error) return status.error;
  if (!status.health?.tablesReady) return status.health?.message || 'Motor ainda nao configurado.';
  if (!status.activeRun) return 'Motor pronto para iniciar.';
  if (status.activeRun.status === 'paused') return 'Motor pausado manualmente.';
  if (status.activeRun.status === 'running') return 'Motor rodando automaticamente.';
  if (status.activeRun.status === 'queued') return 'Fila criada. Aguardando processamento.';
  return 'Run anterior finalizado.';
}

function useCategoryEngineStatus(enabled = true) {
  const [status, setStatus] = useState<CategoryEngineStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const load = useCallback(async (showToast = false) => {
    if (!enabled) return;
    try {
      if (!status) setLoading(true);
      const res = await adminFetch(`${API}/admin/catalogo/category-engine/status`);
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `HTTP ${res.status}`);
      }
      const json = await res.json();
      setStatus(json);
      if (showToast) toast.success('Status do motor atualizado');
    } catch (error: any) {
      const message = String(error?.message || error || 'Falha ao carregar motor');
      setStatus((current) => current ? { ...current, error: message } : {
        ok: false,
        settings: null,
        activeRun: null,
        summary: {
          pending: 0,
          analyzing: 0,
          retry_wait: 0,
          due_retries: 0,
          applied: 0,
          failed: 0,
          skipped: 0,
          review_flag_count: 0,
          discovered: 0,
          processed: 0,
          remaining: 0,
          throughput_per_hour: 0,
        },
        currentItems: [],
        recentLogs: [],
        recentRuns: [],
        eligibleTotal: null,
        health: {
          tablesReady: false,
          cronStrategy: 'vercel_cron',
          message,
        },
        error: message,
      });
    } finally {
      setLoading(false);
    }
  }, [enabled, status]);

  useEffect(() => {
    if (!enabled) return;
    load();
  }, [enabled, load]);

  useEffect(() => {
    if (!enabled) return;
    const intervalMs = status?.activeRun?.status === 'running' ? 5_000 : 20_000;
    const timer = window.setInterval(() => {
      load();
    }, intervalMs);
    return () => window.clearInterval(timer);
  }, [enabled, load, status?.activeRun?.status]);

  const runAction = useCallback(async (action: 'start' | 'pause' | 'resume' | 'stop' | 'requeue-failures') => {
    try {
      setActionLoading(action);
      const res = await adminFetch(`${API}/admin/catalogo/category-engine/${action}`, {
        method: 'POST',
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `HTTP ${res.status}`);
      }
      await res.json();
      await load();
      toast.success('Motor atualizado com sucesso');
    } catch (error: any) {
      toast.error(error?.message || 'Falha ao executar acao do motor');
    } finally {
      setActionLoading(null);
    }
  }, [load]);

  return {
    status,
    loading,
    actionLoading,
    refresh: () => load(true),
    runAction,
  };
}

function EngineControls({
  status,
  actionLoading,
  onAction,
}: {
  status: CategoryEngineStatusResponse | null;
  actionLoading: string | null;
  onAction: (action: 'start' | 'pause' | 'resume' | 'stop' | 'requeue-failures') => void;
}) {
  const runStatus = status?.activeRun?.status;
  const hasActiveRun = !!status?.activeRun;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        color="primary"
        size="sm"
        onClick={() => onAction(runStatus === 'paused' ? 'resume' : 'start')}
        isLoading={actionLoading === 'start' || actionLoading === 'resume'}
        iconLeading={<Play className="w-4 h-4" />}
      >
        {runStatus === 'paused' ? 'Retomar' : 'Iniciar'}
      </Button>
      <Button
        color="secondary"
        size="sm"
        onClick={() => onAction('pause')}
        disabled={!hasActiveRun || runStatus !== 'running'}
        isLoading={actionLoading === 'pause'}
        iconLeading={<Pause className="w-4 h-4" />}
      >
        Pausar
      </Button>
      <Button
        color="secondary"
        size="sm"
        onClick={() => onAction('stop')}
        disabled={!hasActiveRun}
        isLoading={actionLoading === 'stop'}
        iconLeading={<Square className="w-4 h-4" />}
      >
        Parar
      </Button>
      <Button
        color="tertiary"
        size="sm"
        onClick={() => onAction('requeue-failures')}
        disabled={!status?.recentRuns?.length}
        isLoading={actionLoading === 'requeue-failures'}
        iconLeading={<RotateCcw className="w-4 h-4" />}
      >
        Reenfileirar falhas
      </Button>
    </div>
  );
}

function SummaryStats({ status }: { status: CategoryEngineStatusResponse | null }) {
  const cards = [
    ['Restantes', status?.summary.remaining ?? 0, 'text-primary'],
    ['Processados', status?.summary.processed ?? 0, 'text-foreground'],
    ['Aplicados', status?.summary.applied ?? 0, 'text-green-600'],
    ['Falhas', status?.summary.failed ?? 0, 'text-red-600'],
    ['Baixa confianca', status?.summary.review_flag_count ?? 0, 'text-yellow-600'],
    ['Sem categoria agora', status?.eligibleTotal ?? '—', 'text-foreground'],
  ] as const;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
      {cards.map(([label, value, color]) => (
        <Card.Root key={label}>
          <div className="p-4 text-center">
            <p className={cn('text-2xl font-bold', color)}>{value}</p>
            <p className="text-xs text-muted-foreground mt-1">{label}</p>
          </div>
        </Card.Root>
      ))}
    </div>
  );
}

export function CategoryEngineSummaryCard({
  onOpenConsole,
}: {
  onOpenConsole?: () => void;
}) {
  const { status, loading, actionLoading, refresh, runAction } = useCategoryEngineStatus(true);
  const message = buildStatusMessage(status);
  const currentSku = status?.currentItems?.[0]?.sku || status?.activeRun?.current_sku || null;

  return (
    <Card.Root>
      <div className="p-5 space-y-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Brain className="w-5 h-5 text-primary" />
              <h3 className="text-base font-semibold text-foreground">Motor Contínuo</h3>
              <Badge variant="pill-color" color={statusColor(status?.activeRun?.status) as any} size="xs">
                {status?.activeRun?.status || 'idle'}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-1">{message}</p>
            <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-muted-foreground">
              <span>Ultimo heartbeat: <strong className="text-foreground">{formatDateTime(status?.activeRun?.last_heartbeat_at)}</strong></span>
              <span>Throughput: <strong className="text-foreground">{status?.summary.throughput_per_hour ?? 0}/h</strong></span>
              <span>Buffer: <strong className="text-foreground">{status?.summary.pending ?? 0} pendentes</strong></span>
            </div>
          </div>
          <div className="flex flex-col items-stretch gap-2">
            <div className="flex items-center justify-end gap-2">
              <Button color="tertiary" size="sm" onClick={refresh} isLoading={loading} iconLeading={<RefreshCw className="w-4 h-4" />}>
                Atualizar
              </Button>
              {onOpenConsole && (
                <Button color="secondary" size="sm" onClick={onOpenConsole}>
                  Abrir console completo
                </Button>
              )}
            </div>
            <EngineControls status={status} actionLoading={actionLoading} onAction={runAction} />
          </div>
        </div>

        <SummaryStats status={status} />

        <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_0.8fr] gap-4">
          <Card.Root className="border border-border">
            <div className="p-4">
              <div className="flex items-center justify-between gap-2">
                <h4 className="text-sm font-semibold text-foreground">Execucao atual</h4>
                {loading ? <Loader2 className="w-4 h-4 animate-spin text-primary" /> : null}
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3 text-xs text-muted-foreground">
                <div>
                  <p>SKU em processamento</p>
                  <p className="text-sm font-semibold text-foreground mt-1">{currentSku || '—'}</p>
                </div>
                <div>
                  <p>Run atual</p>
                  <p className="text-sm font-semibold text-foreground mt-1 font-mono">{status?.activeRun?.run_id?.slice(0, 8) || '—'}</p>
                </div>
                <div>
                  <p>Retries agendados</p>
                  <p className="text-sm font-semibold text-foreground mt-1">{status?.summary.retry_wait ?? 0}</p>
                </div>
                <div>
                  <p>Retries vencidos</p>
                  <p className="text-sm font-semibold text-foreground mt-1">{status?.summary.due_retries ?? 0}</p>
                </div>
              </div>
            </div>
          </Card.Root>

          <Card.Root className="border border-border">
            <div className="p-4">
              <div className="flex items-center justify-between gap-2">
                <h4 className="text-sm font-semibold text-foreground">Saude</h4>
                <Badge variant="pill-color" color={status?.health?.tablesReady ? 'success' as any : 'warning' as any} size="xs">
                  {status?.health?.cronStrategy || 'cron'}
                </Badge>
              </div>
              <div className="mt-3 flex items-start gap-2 text-xs text-muted-foreground">
                {status?.error ? <AlertCircle className="w-4 h-4 text-destructive shrink-0 mt-0.5" /> : <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0 mt-0.5" />}
                <p>{status?.health?.message || 'Motor operacional.'}</p>
              </div>
            </div>
          </Card.Root>
        </div>
      </div>
    </Card.Root>
  );
}

export function CategoryEngineConsolePage() {
  const { status, loading, actionLoading, refresh, runAction } = useCategoryEngineStatus(true);
  const [items, setItems] = useState<CategoryEngineItem[]>([]);
  const [logs, setLogs] = useState<CategoryEngineLog[]>([]);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [logsLoading, setLogsLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState('pending,analyzing,retry_wait,failed,applied');
  const [reviewFilter, setReviewFilter] = useState<'all' | 'true' | 'false'>('all');

  const loadItems = useCallback(async () => {
    if (!status?.recentRuns?.length && !status?.activeRun) {
      setItems([]);
      return;
    }
    setItemsLoading(true);
    try {
      const params = new URLSearchParams({
        limit: '80',
      });
      if (statusFilter) params.set('status', statusFilter);
      if (reviewFilter !== 'all') params.set('review_flag', reviewFilter);
      if (status?.activeRun?.run_id) params.set('run_id', status.activeRun.run_id);
      const res = await adminFetch(`${API}/admin/catalogo/category-engine/items?${params.toString()}`);
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `HTTP ${res.status}`);
      }
      const json = await res.json();
      setItems(Array.isArray(json.items) ? json.items : []);
    } catch (error: any) {
      toast.error(error?.message || 'Falha ao carregar itens do motor');
    } finally {
      setItemsLoading(false);
    }
  }, [reviewFilter, status?.activeRun?.run_id, status?.recentRuns?.length, statusFilter]);

  const loadLogs = useCallback(async () => {
    if (!status?.recentRuns?.length && !status?.activeRun) {
      setLogs([]);
      return;
    }
    setLogsLoading(true);
    try {
      const params = new URLSearchParams({ limit: '80' });
      if (status?.activeRun?.run_id) params.set('run_id', status.activeRun.run_id);
      const res = await adminFetch(`${API}/admin/catalogo/category-engine/logs?${params.toString()}`);
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `HTTP ${res.status}`);
      }
      const json = await res.json();
      setLogs(Array.isArray(json.items) ? json.items : []);
    } catch (error: any) {
      toast.error(error?.message || 'Falha ao carregar logs do motor');
    } finally {
      setLogsLoading(false);
    }
  }, [status?.activeRun?.run_id, status?.recentRuns?.length]);

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  useEffect(() => {
    if (!status) return;
    const timer = window.setTimeout(() => {
      loadItems();
      loadLogs();
    }, status.activeRun?.status === 'running' ? 5_000 : 20_000);
    return () => window.clearTimeout(timer);
  }, [loadItems, loadLogs, status]);

  const runHistory = useMemo(() => status?.recentRuns || [], [status?.recentRuns]);

  return (
    <div className="max-w-[1400px] mx-auto px-6 py-6 space-y-5">
      <Card.Root>
        <div className="p-5 space-y-4">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <Brain className="w-5 h-5 text-primary" />
                <h1 className="text-lg font-semibold text-foreground">Motor de Categorias</h1>
                <Badge variant="pill-color" color={statusColor(status?.activeRun?.status) as any} size="xs">
                  {status?.activeRun?.status || 'idle'}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                Execucao duravel para zerar produtos ativos e em estoque sem categoria.
              </p>
              <div className="flex flex-wrap items-center gap-4 mt-3 text-xs text-muted-foreground">
                <span>Ultimo heartbeat: <strong className="text-foreground">{formatDateTime(status?.activeRun?.last_heartbeat_at)}</strong></span>
                <span>Ultima execucao: <strong className="text-foreground">{formatDateTime(status?.recentRuns?.[0]?.started_at)}</strong></span>
                <span>Fallback raiz: <strong className="text-foreground">{status?.settings?.fallback_root_category_id || '—'}</strong></span>
              </div>
            </div>
            <div className="flex flex-col items-stretch gap-2">
              <div className="flex items-center justify-end gap-2">
                <Button color="tertiary" size="sm" onClick={() => { refresh(); loadItems(); loadLogs(); }} isLoading={loading} iconLeading={<RefreshCw className="w-4 h-4" />}>
                  Atualizar
                </Button>
              </div>
              <EngineControls status={status} actionLoading={actionLoading} onAction={runAction} />
            </div>
          </div>

          <SummaryStats status={status} />
        </div>
      </Card.Root>

      <div className="grid grid-cols-1 xl:grid-cols-[1.5fr_0.9fr] gap-5">
        <Card.Root>
          <div className="p-5">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h3 className="text-sm font-semibold text-foreground">Fila do motor</h3>
                <p className="text-xs text-muted-foreground mt-1">Itens em processamento, aplicados, falhos e marcados para revisao.</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.target.value)}
                  className="rounded-lg border border-border bg-background px-3 py-2 text-xs outline-none focus:border-primary"
                >
                  <option value="pending,analyzing,retry_wait,failed,applied">Todos principais</option>
                  <option value="pending,analyzing,retry_wait">Fila ativa</option>
                  <option value="applied">Aplicados</option>
                  <option value="failed">Falhas</option>
                  <option value="skipped">Ignorados</option>
                </select>
                <select
                  value={reviewFilter}
                  onChange={(event) => setReviewFilter(event.target.value as 'all' | 'true' | 'false')}
                  className="rounded-lg border border-border bg-background px-3 py-2 text-xs outline-none focus:border-primary"
                >
                  <option value="all">Toda confianca</option>
                  <option value="true">Somente baixa confianca</option>
                  <option value="false">Sem baixa confianca</option>
                </select>
                <Button color="tertiary" size="sm" onClick={loadItems} isLoading={itemsLoading}>
                  Recarregar itens
                </Button>
              </div>
            </div>

            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border bg-secondary/30">
                    <th className="text-left py-2.5 px-3 font-medium text-muted-foreground">SKU</th>
                    <th className="text-left py-2.5 px-3 font-medium text-muted-foreground">Status</th>
                    <th className="text-left py-2.5 px-3 font-medium text-muted-foreground">Categoria sugerida</th>
                    <th className="text-left py-2.5 px-3 font-medium text-muted-foreground">Confianca</th>
                    <th className="text-left py-2.5 px-3 font-medium text-muted-foreground">Origem</th>
                    <th className="text-left py-2.5 px-3 font-medium text-muted-foreground">Tentativas</th>
                    <th className="text-left py-2.5 px-3 font-medium text-muted-foreground">Atualizado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {items.map((item) => (
                    <tr key={`${item.sku}-${item.updated_at || item.status}`} className="hover:bg-secondary/10">
                      <td className="py-2.5 px-3 font-mono text-foreground">{item.sku}</td>
                      <td className="py-2.5 px-3">
                        <div className="flex flex-col gap-1">
                          <Badge variant="pill-color" color={statusColor(item.status) as any} size="xs">
                            {item.status}
                          </Badge>
                          {item.last_error ? <span className="text-[10px] text-destructive line-clamp-2">{item.last_error}</span> : null}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-muted-foreground">{item.suggested_category_path || '—'}</td>
                      <td className="py-2.5 px-3">
                        <div className="flex items-center gap-2">
                          <span className={cn(
                            'font-semibold',
                            Number(item.confidence || 0) >= 0.7 ? 'text-green-600' : 'text-yellow-600',
                          )}>
                            {Math.round(Number(item.confidence || 0) * 100)}%
                          </span>
                          {item.review_flag ? <Badge variant="pill-color" color="warning" size="xs">revisar</Badge> : null}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-muted-foreground">{item.decision_source || '—'}</td>
                      <td className="py-2.5 px-3 text-foreground">{item.attempt_count}</td>
                      <td className="py-2.5 px-3 text-muted-foreground">{formatDateTime(item.updated_at)}</td>
                    </tr>
                  ))}
                  {!items.length && (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-muted-foreground">
                        Nenhum item encontrado para os filtros atuais.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </Card.Root>

        <div className="space-y-5">
          <Card.Root>
            <div className="p-5">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-foreground">Logs recentes</h3>
                <Button color="tertiary" size="sm" onClick={loadLogs} isLoading={logsLoading} iconLeading={<TimerReset className="w-4 h-4" />}>
                  Atualizar logs
                </Button>
              </div>
              <div className="mt-4 space-y-2 max-h-[420px] overflow-y-auto">
                {logs.map((log) => (
                  <div key={log.id} className="rounded-lg border border-border p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="pill-color" color={logColor(log.level) as any} size="xs">{log.level}</Badge>
                          <Badge variant="pill-outline" color="gray" size="xs">{log.stage}</Badge>
                          {log.sku ? <span className="font-mono text-[11px] text-foreground">{log.sku}</span> : null}
                        </div>
                        <p className="text-xs text-foreground mt-2">{log.message}</p>
                      </div>
                      <span className="text-[10px] text-muted-foreground shrink-0">{formatDateTime(log.created_at)}</span>
                    </div>
                  </div>
                ))}
                {!logs.length && (
                  <p className="text-xs text-muted-foreground">Ainda nao ha logs para mostrar.</p>
                )}
              </div>
            </div>
          </Card.Root>

          <Card.Root>
            <div className="p-5">
              <h3 className="text-sm font-semibold text-foreground">Historico de runs</h3>
              <div className="mt-4 space-y-2">
                {runHistory.map((run) => (
                  <div key={run.run_id} className="rounded-lg border border-border p-3 text-xs">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-foreground">{run.run_id.slice(0, 8)}</span>
                          <Badge variant="pill-color" color={statusColor(run.status) as any} size="xs">{run.status}</Badge>
                        </div>
                        <p className="text-muted-foreground mt-1">Inicio: {formatDateTime(run.started_at)}</p>
                      </div>
                      <div className="text-right text-muted-foreground">
                        <p>Aplicados: <span className="text-foreground font-semibold">{run.applied_count}</span></p>
                        <p>Falhas: <span className="text-foreground font-semibold">{run.failed_count}</span></p>
                      </div>
                    </div>
                  </div>
                ))}
                {!runHistory.length && (
                  <p className="text-xs text-muted-foreground">Nenhum run registrado ainda.</p>
                )}
              </div>
            </div>
          </Card.Root>
        </div>
      </div>
    </div>
  );
}
