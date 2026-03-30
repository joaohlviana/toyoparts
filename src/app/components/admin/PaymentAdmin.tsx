import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  CreditCard,
  ExternalLink,
  Globe,
  Loader2,
  Lock,
  RefreshCw,
  Save,
  Shield,
  Wallet,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  fetchPaymentConfig,
  savePaymentConfig,
  testAsaasConnection,
  type PaymentConfig,
  type PaymentStatus,
} from '../../lib/payments/payment-api';

const LOCKED_CONFIG: PaymentConfig = {
  activeProvider: 'asaas',
  asaas: { enabled: true, sandbox: false },
  vindi: { enabled: false, sandbox: true },
  stripe: { enabled: false, sandbox: true },
};

function StatusPill({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
        ok
          ? 'bg-emerald-100 text-emerald-700'
          : 'bg-amber-100 text-amber-700'
      }`}
    >
      {ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
      {label}
    </span>
  );
}

function LegacyProviderCard({
  name,
  description,
}: {
  name: string;
  description: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-foreground">{name}</p>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        </div>
        <span className="rounded-full bg-muted px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Legado
        </span>
      </div>
    </div>
  );
}

export function PaymentAdmin() {
  const [config, setConfig] = useState<PaymentConfig | null>(null);
  const [status, setStatus] = useState<PaymentStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; error?: string; environment?: string } | null>(null);

  const loadConfig = useCallback(async () => {
    setLoading(true);
    try {
      const payload = await fetchPaymentConfig();
      setConfig(payload.config);
      setStatus(payload.status);
    } catch (error: any) {
      console.error('PaymentAdmin:', error);
      toast.error(error?.message || 'Erro ao carregar configuracao de pagamentos');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadConfig();
  }, [loadConfig]);

  const handleReinforceLock = useCallback(async () => {
    if (!config) return;
    setSaving(true);
    try {
      const response = await savePaymentConfig({
        ...config,
        ...LOCKED_CONFIG,
        version: config.version,
      });
      setConfig(response.config);
      toast.success('Asaas mantido como gateway unico em producao');
    } catch (error: any) {
      console.error('PaymentAdmin.save:', error);
      toast.error(error?.message || 'Nao foi possivel reforcar a configuracao');
    } finally {
      setSaving(false);
    }
  }, [config]);

  const handleTestAsaas = useCallback(async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await testAsaasConnection();
      setTestResult(result);
      if (result.ok) {
        toast.success('Conta Asaas validada com sucesso');
      } else {
        toast.error(result.error || 'Falha ao validar o Asaas');
      }
    } catch (error: any) {
      console.error('PaymentAdmin.testAsaas:', error);
      const message = error?.message || 'Erro ao testar o Asaas';
      setTestResult({ ok: false, error: message });
      toast.error(message);
    } finally {
      setTesting(false);
    }
  }, []);

  const liveLocked = status?.liveLocked !== false;
  const asaasLive = config?.activeProvider === 'asaas' && config?.asaas?.enabled && config?.asaas?.sandbox === false;

  const statusItems = useMemo(() => [
    {
      label: 'Gateway ativo',
      value: asaasLive ? 'Asaas em producao' : 'Configuracao divergente',
      ok: asaasLive,
    },
    {
      label: 'Trava operacional',
      value: liveLocked ? 'Somente Asaas para novos pedidos' : 'Destravado',
      ok: liveLocked,
    },
    {
      label: 'Chave do Asaas',
      value: status?.asaasKeyConfigured ? 'Configurada no servidor' : 'Pendente no servidor',
      ok: !!status?.asaasKeyConfigured,
    },
  ], [asaasLive, liveLocked, status?.asaasKeyConfigured]);

  if (loading || !config || !status) {
    return (
      <div className="mx-auto flex max-w-6xl items-center justify-center px-4 py-24">
        <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Carregando pagamentos...
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-6 lg:px-6">
      <section className="overflow-hidden rounded-3xl border border-blue-200 bg-gradient-to-br from-slate-900 via-blue-900 to-blue-700 text-white shadow-sm">
        <div className="flex flex-col gap-6 px-6 py-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-white/90">
              <Lock className="h-3.5 w-3.5" />
              Pagamentos live travados
            </div>
            <div className="mt-4 flex items-start gap-3">
              <div className="rounded-2xl bg-white/10 p-3">
                <Wallet className="h-6 w-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-semibold tracking-tight">Asaas como unico gateway ativo</h1>
                <p className="mt-2 max-w-xl text-sm leading-6 text-white/80">
                  Novos pedidos do site saem exclusivamente pelo Asaas em producao. Stripe e Vindi ficam visiveis apenas como legado para reconciliar pedidos antigos.
                </p>
              </div>
            </div>
          </div>

          <div className="grid gap-2 rounded-2xl border border-white/10 bg-white/10 p-4 text-sm lg:min-w-[320px]">
            {statusItems.map((item) => (
              <div key={item.label} className="flex items-center justify-between gap-3">
                <span className="text-white/75">{item.label}</span>
                <StatusPill ok={item.ok} label={item.value} />
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        <div className="rounded-3xl border border-border bg-card p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="inline-flex items-center gap-2 text-sm font-semibold text-foreground">
                <CreditCard className="h-4 w-4 text-blue-600" />
                Operacao principal
              </div>
              <h2 className="mt-1 text-xl font-semibold tracking-tight text-foreground">Asaas em producao</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Checkout hospedado no Asaas com Pix, boleto e cartao. O backend normaliza a configuracao e impede reativacao operacional de Stripe ou Vindi.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={loadConfig}
                className="inline-flex h-10 items-center gap-2 rounded-xl border border-border bg-background px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted"
              >
                <RefreshCw className="h-4 w-4" />
                Atualizar
              </button>
              <button
                onClick={handleReinforceLock}
                disabled={saving}
                className="inline-flex h-10 items-center gap-2 rounded-xl bg-foreground px-4 text-sm font-semibold text-background transition-colors hover:bg-foreground/90 disabled:opacity-60"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Reforcar trava
              </button>
            </div>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-3">
            <div className="rounded-2xl border border-border bg-muted/30 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Ambiente</p>
              <div className="mt-3 flex items-center gap-2">
                <Globe className="h-4 w-4 text-emerald-600" />
                <span className="text-sm font-semibold text-foreground">
                  {config.asaas.sandbox ? 'Sandbox' : 'Producao'}
                </span>
              </div>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">
                O lock operacional exige que o Asaas fique em producao para novos pedidos.
              </p>
            </div>

            <div className="rounded-2xl border border-border bg-muted/30 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Chave do servidor</p>
              <div className="mt-3 flex items-center gap-2">
                {status.asaasKeyConfigured ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                ) : (
                  <XCircle className="h-4 w-4 text-red-600" />
                )}
                <span className="text-sm font-semibold text-foreground">
                  {status.asaasKeyConfigured ? 'ASAAS_API_KEY configurada' : 'ASAAS_API_KEY pendente'}
                </span>
              </div>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">
                O token fica somente no servidor. Nenhum segredo e salvo no frontend, no KV ou em texto no painel.
              </p>
            </div>

            <div className="rounded-2xl border border-border bg-muted/30 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Pedidos legados</p>
              <div className="mt-3 flex items-center gap-2">
                <Shield className="h-4 w-4 text-blue-600" />
                <span className="text-sm font-semibold text-foreground">Mantidos por provider original</span>
              </div>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">
                Vindi e Stripe continuam apenas para leitura e webhooks de pedidos antigos, sem entrar no fluxo de novos checkouts.
              </p>
            </div>
          </div>

          <div className="mt-6 rounded-2xl border border-border p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-foreground">Teste operacional do Asaas</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Valida a conta live usando o endpoint de conta do Asaas. Isso confirma que o servidor esta pronto para gerar novos checkouts.
                </p>
              </div>
              <button
                onClick={handleTestAsaas}
                disabled={testing || !status.asaasKeyConfigured}
                className="inline-flex h-10 items-center gap-2 rounded-xl border border-border bg-background px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-60"
              >
                {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Activity className="h-4 w-4" />}
                Testar Asaas
              </button>
            </div>

            {testResult && (
              <div
                className={`mt-4 rounded-2xl border px-4 py-3 text-sm ${
                  testResult.ok
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                    : 'border-red-200 bg-red-50 text-red-800'
                }`}
              >
                <div className="flex items-start gap-2">
                  {testResult.ok ? (
                    <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0" />
                  ) : (
                    <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                  )}
                  <div>
                    <p className="font-semibold">
                      {testResult.ok ? 'Conexao confirmada' : 'Falha na validacao do Asaas'}
                    </p>
                    <p className="mt-1">
                      {testResult.ok
                        ? `Conta validada no ambiente ${testResult.environment || 'production'}.`
                        : (testResult.error || 'Nao foi possivel validar a conta neste momento.')}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-3xl border border-border bg-card p-6 shadow-sm">
            <p className="text-sm font-semibold text-foreground">Gateways fora do fluxo principal</p>
            <p className="mt-1 text-sm text-muted-foreground">
              A percepcao de troca livre de gateway foi removida desta tela. O site opera em Asaas-only para novos pedidos.
            </p>

            <div className="mt-4 space-y-3">
              <LegacyProviderCard
                name="Vindi"
                description="Mantido somente para reconciliar pedidos antigos e webhooks de cobrancas historicas."
              />
              <LegacyProviderCard
                name="Stripe"
                description="Mantido somente para leitura e tratamento de pedidos antigos. Nao participa dos novos checkouts live."
              />
            </div>
          </div>

          <div className="rounded-3xl border border-border bg-card p-6 shadow-sm">
            <p className="text-sm font-semibold text-foreground">Boas praticas operacionais</p>
            <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
              <li>Novos pedidos usam somente Asaas.</li>
              <li>Pedidos antigos continuam vinculados ao payment_provider original salvo no pedido.</li>
              <li>Depois do corte definitivo, rotacione a chave do Asaas porque ela foi exposta fora do ambiente seguro.</li>
            </ul>

            <a
              href="https://docs.asaas.com"
              target="_blank"
              rel="noreferrer"
              className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-blue-600 hover:text-blue-700"
            >
              Abrir documentacao do Asaas <ExternalLink className="h-4 w-4" />
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}
