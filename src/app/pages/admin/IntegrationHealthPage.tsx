// ─── Integration Health Dashboard ─────────────────────────────────────────────

import React, { useState, useEffect, useCallback } from 'react';
import {
  Activity, RefreshCw, Loader2, CheckCircle2, AlertCircle,
  XCircle, HelpCircle, Zap, Clock, Globe, CreditCard, Truck, Mail,
  ExternalLink, Shield, Info,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../../components/ui/button';
import { projectId, publicAnonKey } from '../../../../utils/supabase/info';

const API = `https://${projectId}.supabase.co/functions/v1/make-server-1d6e33e0`;
const H   = { Authorization: `Bearer ${publicAnonKey}`, 'Content-Type': 'application/json' };

// ─── Types ───────────────────────────────────────────────────────────────────

type HealthStatus = 'healthy' | 'degraded' | 'error' | 'unknown' | 'not_configured';
type HealthEnv    = 'sandbox' | 'production' | 'not_configured';

interface ProviderHealth {
  status:       HealthStatus;
  environment:  HealthEnv;
  last_tested:  string | null;
  last_success: string | null;
  last_failure: string | null;
  message:      string;
  response_ms:  number | null;
}

// ─── Provider metadata ───────────────────────────────────────────────────────

interface ProviderMeta {
  id: string;
  label: string;
  description: string;
  icon: React.ElementType;
  docsUrl: string;
  category: string;
}

const PROVIDERS: ProviderMeta[] = [
  {
    id:          'asaas',
    label:       'Asaas',
    description: 'Gateway de pagamento principal. Processa cobranças, PIX, boleto e cartão.',
    icon:        CreditCard,
    docsUrl:     'https://docs.asaas.com',
    category:    'Pagamento',
  },
  {
    id:          'vindi',
    label:       'Vindi',
    description: 'Gateway de pagamento alternativo. Suporte a assinaturas e cobranças recorrentes.',
    icon:        CreditCard,
    docsUrl:     'https://developers.vindi.com.br',
    category:    'Pagamento',
  },
  {
    id:          'stripe',
    label:       'Stripe',
    description: 'Gateway internacional. Checkout Session hospedado com Cartão e Pix.',
    icon:        CreditCard,
    docsUrl:     'https://stripe.com/docs',
    category:    'Pagamento',
  },
  {
    id:          'frenet',
    label:       'Frenet',
    description: 'Plataforma de cotação de frete. Integra Correios, Jadlog, Total Express e outros.',
    icon:        Truck,
    docsUrl:     'https://docs.frenet.com.br',
    category:    'Logística',
  },
  {
    id:          'resend',
    label:       'Resend',
    description: 'Serviço de envio de e-mails transacionais. Magic links, rastreio, confirmações.',
    icon:        Mail,
    docsUrl:     'https://resend.com/docs',
    category:    'Comunicação',
  },
];

// ─── Status helpers ───────────────────────────────────────────────────────────

function StatusIcon({ status }: { status: HealthStatus }) {
  switch (status) {
    case 'healthy':        return <CheckCircle2 className="w-5 h-5 text-green-500" />;
    case 'degraded':       return <AlertCircle   className="w-5 h-5 text-amber-500" />;
    case 'error':          return <XCircle        className="w-5 h-5 text-red-500" />;
    case 'not_configured': return <Shield         className="w-5 h-5 text-gray-400" />;
    default:               return <HelpCircle     className="w-5 h-5 text-gray-400" />;
  }
}

function StatusBadge({ status }: { status: HealthStatus }) {
  const cfg: Record<HealthStatus, { label: string; cls: string }> = {
    healthy:        { label: 'Operacional',    cls: 'bg-green-100 text-green-700 border-green-200' },
    degraded:       { label: 'Degradado',      cls: 'bg-amber-100 text-amber-700 border-amber-200' },
    error:          { label: 'Erro',           cls: 'bg-red-100 text-red-700 border-red-200' },
    unknown:        { label: 'Desconhecido',   cls: 'bg-gray-100 text-gray-500 border-gray-200' },
    not_configured: { label: 'Não configurado', cls: 'bg-gray-100 text-gray-500 border-gray-200' },
  };
  const { label, cls } = cfg[status] ?? cfg.unknown;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${cls}`}>
      {label}
    </span>
  );
}

function EnvBadge({ env }: { env: HealthEnv }) {
  if (env === 'not_configured') return null;
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide ${
      env === 'sandbox' ? 'bg-amber-50 text-amber-600 border border-amber-200' : 'bg-green-50 text-green-700 border border-green-200'
    }`}>
      <Globe className="w-2.5 h-2.5" />
      {env === 'sandbox' ? 'Sandbox' : 'Produção'}
    </span>
  );
}

function fmtTime(d: string | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
}

// ─── Provider Card ────────────────────────────────────────────────────────────

function ProviderCard({
  meta,
  healthData,
  onTest,
  testing,
}: {
  meta: ProviderMeta;
  healthData: ProviderHealth | null;
  onTest: (id: string) => void;
  testing: boolean;
}) {
  const status = healthData?.status ?? 'unknown';
  const Icon   = meta.icon;

  const borderColor: Record<HealthStatus, string> = {
    healthy:        'border-green-200',
    degraded:       'border-amber-300',
    error:          'border-red-300',
    unknown:        'border-border',
    not_configured: 'border-border',
  };

  const bgPulse: Record<HealthStatus, string> = {
    healthy:        '',
    degraded:       'shadow-amber-100',
    error:          'shadow-red-100',
    unknown:        '',
    not_configured: '',
  };

  return (
    <div className={`bg-card rounded-xl border-2 ${borderColor[status]} ${bgPulse[status]} overflow-hidden transition-all`}>
      {/* Top bar */}
      <div className={`h-1 ${
        status === 'healthy' ? 'bg-green-400' :
        status === 'error'   ? 'bg-red-400' :
        status === 'degraded'? 'bg-amber-400' :
        'bg-gray-200'
      }`} />

      <div className="p-5">
        {/* Header row */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
              status === 'healthy' ? 'bg-green-50' :
              status === 'error'   ? 'bg-red-50' :
              status === 'degraded'? 'bg-amber-50' :
              'bg-muted'
            }`}>
              <Icon className={`w-5 h-5 ${
                status === 'healthy' ? 'text-green-600' :
                status === 'error'   ? 'text-red-500' :
                status === 'degraded'? 'text-amber-600' :
                'text-muted-foreground'
              }`} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-foreground">{meta.label}</h3>
                <EnvBadge env={healthData?.environment ?? 'not_configured'} />
              </div>
              <span className="text-xs text-muted-foreground">{meta.category}</span>
            </div>
          </div>
          <StatusIcon status={status} />
        </div>

        {/* Status badge */}
        <div className="flex items-center gap-2 mb-4">
          <StatusBadge status={status} />
          {healthData?.response_ms != null && (
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Zap className="w-3 h-3" /> {healthData.response_ms}ms
            </span>
          )}
        </div>

        {/* Message */}
        {healthData?.message && (
          <div className={`rounded-lg px-3 py-2 mb-4 text-xs ${
            status === 'healthy' ? 'bg-green-50 text-green-700 border border-green-100' :
            status === 'error'   ? 'bg-red-50 text-red-700 border border-red-100' :
            status === 'degraded'? 'bg-amber-50 text-amber-700 border border-amber-100' :
            'bg-muted text-muted-foreground'
          }`}>
            {healthData.message}
          </div>
        )}

        {/* Timestamps */}
        <div className="space-y-1.5 mb-4">
          <div className="flex items-center justify-between text-xs">
            <span className="flex items-center gap-1 text-muted-foreground">
              <Clock className="w-3 h-3" /> Último teste
            </span>
            <span className="font-medium text-foreground">{fmtTime(healthData?.last_tested ?? null)}</span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="flex items-center gap-1 text-green-600">
              <CheckCircle2 className="w-3 h-3" /> Último sucesso
            </span>
            <span className="font-medium text-foreground">{fmtTime(healthData?.last_success ?? null)}</span>
          </div>
          {healthData?.last_failure && (
            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-1 text-red-500">
                <XCircle className="w-3 h-3" /> Última falha
              </span>
              <span className="font-medium text-foreground">{fmtTime(healthData.last_failure)}</span>
            </div>
          )}
        </div>

        {/* Description */}
        <p className="text-xs text-muted-foreground mb-4 leading-relaxed">
          {meta.description}
        </p>

        {/* Actions */}
        <div className="flex gap-2">
          <Button
            size="sm"
            variant={status === 'healthy' ? 'outline' : 'default'}
            className="flex-1 gap-2 h-8 text-xs"
            onClick={() => onTest(meta.id)}
            disabled={testing}
          >
            {testing
              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
              : <Activity className="w-3.5 h-3.5" />
            }
            {testing ? 'Testando…' : 'Testar Conexão'}
          </Button>
          <a href={meta.docsUrl} target="_blank" rel="noopener noreferrer">
            <Button size="sm" variant="ghost" className="h-8 w-8 p-0">
              <ExternalLink className="w-3.5 h-3.5" />
            </Button>
          </a>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function IntegrationHealthPage() {
  const [healthData, setHealthData] = useState<Record<string, ProviderHealth>>({});
  const [loading, setLoading]       = useState(true);
  const [testing, setTesting]       = useState<Record<string, boolean>>({});

  const loadHealth = useCallback(async () => {
    setLoading(true);
    try {
      const res  = await fetch(`${API}/health/integrations`, { headers: H });
      const data = await res.json();
      if (data.integrations) setHealthData(data.integrations);
    } catch (e: any) {
      console.error('[IntegrationHealthPage] load error:', e);
      toast.error('Erro ao carregar status das integrações');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadHealth(); }, [loadHealth]);

  const handleTest = async (providerId: string) => {
    setTesting(t => ({ ...t, [providerId]: true }));
    try {
      const res  = await fetch(`${API}/health/integrations/test/${providerId}`, { method: 'POST', headers: H });
      const data = await res.json();
      setHealthData(h => ({ ...h, [providerId]: data }));
      if (data.status === 'healthy') {
        toast.success(`${providerId.charAt(0).toUpperCase() + providerId.slice(1)}: conexão OK`);
      } else {
        toast.error(`${providerId}: ${data.message}`);
      }
    } catch (e: any) {
      toast.error(`Erro ao testar ${providerId}: ${e.message}`);
    } finally {
      setTesting(t => ({ ...t, [providerId]: false }));
    }
  };

  const handleTestAll = async () => {
    toast.info('Testando todas as integrações…');
    await Promise.allSettled(PROVIDERS.map(p => handleTest(p.id)));
    toast.success('Testes concluídos.');
  };

  // Summary
  const counts = PROVIDERS.reduce((acc, p) => {
    const s = healthData[p.id]?.status ?? 'unknown';
    acc[s] = (acc[s] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const allHealthy = counts['healthy'] === PROVIDERS.length;

  return (
    <div className="max-w-[1080px] mx-auto px-4 lg:px-6 pt-6 pb-12 space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Activity className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">Saúde das Integrações</h1>
            <p className="text-sm text-muted-foreground">
              Status em tempo real de todos os gateways e serviços externos.
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button onClick={handleTestAll} variant="outline" size="sm" className="gap-2" disabled={loading}>
            <Zap className="w-4 h-4" /> Testar Todas
          </Button>
          <Button onClick={loadHealth} variant="outline" size="sm" className="gap-2" disabled={loading}>
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>
        </div>
      </div>

      {/* Summary banner */}
      {!loading && (
        <div className={`flex items-center gap-3 rounded-xl px-4 py-3 border ${
          allHealthy
            ? 'bg-green-50 border-green-200 text-green-800'
            : counts['error'] > 0
            ? 'bg-red-50 border-red-200 text-red-800'
            : 'bg-amber-50 border-amber-200 text-amber-800'
        }`}>
          {allHealthy
            ? <CheckCircle2 className="w-5 h-5 flex-shrink-0 text-green-500" />
            : counts['error'] > 0
            ? <XCircle className="w-5 h-5 flex-shrink-0 text-red-500" />
            : <AlertCircle className="w-5 h-5 flex-shrink-0 text-amber-500" />
          }
          <div>
            <p className="text-sm font-semibold">
              {allHealthy
                ? 'Todas as integrações estão operacionais.'
                : `${counts['error'] || 0} erro(s) · ${counts['degraded'] || 0} degradado(s) · ${counts['not_configured'] || 0} não configurado(s)`
              }
            </p>
            <p className="text-xs opacity-80">
              {counts['healthy'] || 0} de {PROVIDERS.length} integrações saudáveis.
            </p>
          </div>
        </div>
      )}

      {/* Cards grid */}
      {loading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {PROVIDERS.map(p => (
            <ProviderCard
              key={p.id}
              meta={p}
              healthData={healthData[p.id] ?? null}
              onTest={handleTest}
              testing={!!testing[p.id]}
            />
          ))}
        </div>
      )}

      {/* Info note */}
      <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3">
        <div className="flex items-start gap-2 text-xs text-blue-700">
          <Info className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
          <p className="leading-relaxed">
            Cada teste faz uma chamada real à API do provedor (GET de saúde) — nunca cria cobranças ou envia e-mails.
            O resultado é armazenado no KV e exibido na próxima visita sem precisar retestar.
            Logs de teste são registrados na trilha de auditoria.
          </p>
        </div>
      </div>
    </div>
  );
}