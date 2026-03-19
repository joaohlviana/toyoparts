import React, { useState, useEffect, useCallback } from 'react';
import {
  CreditCard, Loader2, Save, RefreshCw,
  CheckCircle2, XCircle, AlertTriangle, Wallet, Landmark,
  Info, ExternalLink, Key, ArrowLeftRight, Copy, Check,
  Globe, Activity, ChevronDown, ChevronUp, Shield, Zap,
} from 'lucide-react';
import { toast } from 'sonner';
import { Switch } from '../ui/switch';
import { Label } from '../ui/label';
import { Input } from '../ui/input';
import {
  fetchPaymentConfig,
  savePaymentConfig,
  activateProvider,
  testAsaasConnection,
  testVindiConnection,
  testStripeConnection,
  type PaymentConfig,
  type PaymentStatus,
} from '../../lib/payments/payment-api';

// ─── Brand definitions ────────────────────────────────────────────────────────

type ProviderId = 'asaas' | 'vindi' | 'stripe';

const BRAND: Record<ProviderId, {
  label:       string;
  tagline:     string;
  gradient:    string;
  ring:        string;
  badge:       string;
  badgeText:   string;
  iconBg:      string;
  methods:     string[];
  webhookPath: string;
  docsUrl:     string;
  keyLabel:    string;
}> = {
  asaas: {
    label:       'Asaas',
    tagline:     'Link de pagamento hospedado',
    gradient:    'from-blue-500 to-blue-700',
    ring:        'ring-blue-500',
    badge:       'bg-blue-100 text-blue-700',
    badgeText:   'bg-blue-50 border-blue-200 text-blue-800',
    iconBg:      'bg-blue-100',
    methods:     ['Pix', 'Boleto', 'Cartão'],
    webhookPath: '/asaas/webhook',
    docsUrl:     'https://docs.asaas.com',
    keyLabel:    'ASAAS_API_KEY',
  },
  vindi: {
    label:       'Vindi',
    tagline:     'Faturas avulsas e recorrentes',
    gradient:    'from-emerald-500 to-teal-700',
    ring:        'ring-emerald-500',
    badge:       'bg-emerald-100 text-emerald-700',
    badgeText:   'bg-emerald-50 border-emerald-200 text-emerald-800',
    iconBg:      'bg-emerald-100',
    methods:     ['Boleto', 'Cartão', 'Pix'],
    webhookPath: '/vindi/webhook',
    docsUrl:     'https://developers.vindi.com.br',
    keyLabel:    'VINDI_API_KEY',
  },
  stripe: {
    label:       'Stripe',
    tagline:     'Checkout Session hospedado',
    gradient:    'from-indigo-500 to-purple-700',
    ring:        'ring-indigo-500',
    badge:       'bg-indigo-100 text-indigo-700',
    badgeText:   'bg-indigo-50 border-indigo-200 text-indigo-800',
    iconBg:      'bg-indigo-100',
    methods:     ['Cartão', 'Pix'],
    webhookPath: '/stripe/webhook',
    docsUrl:     'https://stripe.com/docs',
    keyLabel:    'STRIPE_SECRET_KEY',
  },
};

// ─── Small helpers ────────────────────────────────────────────────────────────

function ProviderIcon({ id, size = 'md' }: { id: ProviderId; size?: 'sm' | 'md' | 'lg' }) {
  const sz = size === 'sm' ? 'w-4 h-4' : size === 'lg' ? 'w-8 h-8' : 'w-5 h-5';
  if (id === 'asaas')  return <Wallet   className={`${sz} text-blue-600`} />;
  if (id === 'vindi')  return <Landmark className={`${sz} text-emerald-600`} />;
  // Stripe wordmark (simplified)
  return (
    <svg viewBox="0 0 60 25" className={`${sz} text-indigo-600`} fill="currentColor">
      <path d="M59.64 14.28h-8.06c.19 1.93 1.6 2.55 3.2 2.55 1.64 0 2.96-.37 4.05-.95v3.32a12.26 12.26 0 0 1-4.69.93c-4.23 0-6.8-2.79-6.8-7.37 0-4.14 2.35-7.48 6.27-7.48 3.9 0 6.03 3.34 6.03 7.48v1.52zm-5.81-4.52c-1.04 0-1.79.73-1.98 2.06h3.94c-.2-1.32-.94-2.06-1.96-2.06zm-8.95 9.7h-4.45V5.07h4.45v14.39zm-.22-16.64a2.39 2.39 0 0 1 0-4.78 2.39 2.39 0 0 1 0 4.78zM29.36 19.46H25V5.07h4.37v1.77c.75-1.32 1.96-2.07 3.37-2.07.15 0 .29 0 .44.01v4.28c-.6-.18-1.23-.28-1.87-.28-1.24 0-2.13.67-2.13 2.11v8.57h.18zm-7.6-4.18h-4.44v-1.74c-.75 1.24-2.04 2.04-3.64 2.04-3.41 0-5.67-2.72-5.67-7.36 0-4.65 2.26-7.49 5.67-7.49 1.57 0 2.83.73 3.56 1.87V0h4.52v15.28zm-7.16-3.31c1.52 0 2.66-1.24 2.66-4.05 0-2.8-1.14-4.04-2.66-4.04-1.5 0-2.63 1.26-2.63 4.04 0 2.8 1.13 4.05 2.63 4.05zM0 18.48V14.8c.9.46 2.6.97 3.77.97.94 0 1.41-.35 1.41-.9 0-.57-.38-.88-1.78-1.35C1.05 12.72 0 11.44 0 9.65c0-2.64 2.16-4.82 5.7-4.82 1.28 0 2.57.3 3.47.63v3.67c-.87-.45-2.3-.82-3.37-.82-.9 0-1.32.35-1.32.86 0 .55.47.81 1.82 1.26C8.43 11.28 9.5 12.6 9.5 14.4c0 2.66-2.17 4.87-5.75 4.87-1.35 0-2.89-.37-3.75-.79z"/>
    </svg>
  );
}

function ConnectionDot({ result, testing }: {
  result: { ok: boolean } | null;
  testing: boolean;
}) {
  if (testing) return (
    <span className="flex items-center gap-1 text-xs text-amber-600 font-medium">
      <Loader2 className="w-3 h-3 animate-spin" /> Testando...
    </span>
  );
  if (!result) return <span className="w-2 h-2 rounded-full bg-muted-foreground/30 inline-block" title="Não testado" />;
  return result.ok
    ? <span className="flex items-center gap-1 text-xs text-emerald-600 font-semibold"><span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />Online</span>
    : <span className="flex items-center gap-1 text-xs text-red-500 font-semibold"><span className="w-2 h-2 rounded-full bg-red-500 inline-block" />Erro</span>;
}

function CopyButton({ text, className = '' }: { text: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <button
      onClick={handleCopy}
      className={`p-1.5 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground ${className}`}
      title="Copiar"
    >
      {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
}

// ─── Stripe Webhook Checklist ─────────────────────────────────────────────────

function StripeWebhookGuide({ webhookSecret }: { webhookSecret: boolean }) {
  const [projectId] = useState(() => {
    try {
      const m = window.location.href.match(/([a-z]{20})/);
      return m?.[1] || '[project-id]';
    } catch { return '[project-id]'; }
  });

  const endpointUrl = `https://${projectId}.supabase.co/functions/v1/make-server-1d6e33e0/stripe/webhook`;
  const events = [
    'checkout.session.completed',
    'checkout.session.expired',
    'payment_intent.payment_failed',
    'charge.refunded',
  ];

  const steps = [
    {
      num: '1',
      title: 'Acesse o painel de webhooks do Stripe',
      done: false,
      action: (
        <a
          href="https://dashboard.stripe.com/webhooks/create"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-600 hover:underline mt-1"
        >
          Abrir Dashboard Stripe <ExternalLink className="w-3 h-3" />
        </a>
      ),
    },
    {
      num: '2',
      title: 'Registre este endpoint como destino',
      done: false,
      action: (
        <div className="flex items-center gap-1 mt-1 bg-muted rounded-lg px-3 py-1.5 border border-border">
          <code className="text-[11px] font-mono text-foreground flex-1 break-all">{endpointUrl}</code>
          <CopyButton text={endpointUrl} />
        </div>
      ),
    },
    {
      num: '3',
      title: 'Selecione estes 4 eventos',
      done: false,
      action: (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 mt-1">
          {events.map(e => (
            <div key={e} className="flex items-center gap-1.5 bg-muted/60 px-2.5 py-1 rounded border border-border/50">
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 flex-shrink-0" />
              <code className="text-[10px] font-mono text-foreground">{e}</code>
              <CopyButton text={e} className="ml-auto" />
            </div>
          ))}
        </div>
      ),
    },
    {
      num: '4',
      title: 'Copie o Signing Secret e salve como STRIPE_WEBHOOK_SECRET',
      done: webhookSecret,
      action: webhookSecret ? null : (
        <p className="text-[11px] text-amber-700 mt-1 leading-relaxed">
          Após criar o webhook, clique em <strong>"Reveal signing secret"</strong> (whsec_...) e salve nos segredos do projeto.
        </p>
      ),
    },
  ];

  return (
    <div className="space-y-3">
      {steps.map((step) => (
        <div key={step.num} className="flex gap-3">
          <div className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold mt-0.5 ${
            step.done
              ? 'bg-emerald-500 text-white'
              : 'bg-muted border-2 border-border text-muted-foreground'
          }`}>
            {step.done ? <Check className="w-3.5 h-3.5" /> : step.num}
          </div>
          <div className="flex-1 min-w-0">
            <p className={`text-sm font-medium ${step.done ? 'text-muted-foreground line-through' : 'text-foreground'}`}>
              {step.title}
            </p>
            {step.action}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Provider Detail Panel ────────────────────────────────────────────────────

function ProviderDetail({
  id,
  config,
  status,
  testResult,
  testing,
  onTest,
  onSandboxChange,
  onApiKeyChange,
  onSave,
  saving,
}: {
  id: ProviderId;
  config: PaymentConfig;
  status: PaymentStatus;
  testResult: { ok: boolean; error?: string; environment?: string } | null;
  testing: boolean;
  onTest: () => void;
  onSandboxChange: (v: boolean) => void;
  onApiKeyChange?: (v: string) => void;
  onSave: () => void;
  saving: boolean;
}) {
  const b = BRAND[id];
  const [tab, setTab] = useState<'config' | 'webhook'>('config');

  const keyConfigured = id === 'asaas'
    ? status.asaasKeyConfigured
    : id === 'vindi'
    ? status.vindiKeyConfigured
    : status.stripeKeyConfigured;

  const sandboxValue = id === 'stripe'
    ? config.stripe?.sandbox ?? true
    : config[id].sandbox;

  return (
    <div className="border border-border rounded-2xl overflow-hidden bg-card shadow-sm">
      {/* Panel header */}
      <div className="px-5 py-4 border-b border-border flex items-center justify-between bg-muted/30">
        <div className="flex items-center gap-3">
          <div className={`w-8 h-8 rounded-lg ${b.iconBg} flex items-center justify-center`}>
            <ProviderIcon id={id} size="sm" />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">{b.label}</p>
            <p className="text-xs text-muted-foreground">{b.tagline}</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
          <button
            onClick={() => setTab('config')}
            className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
              tab === 'config'
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Configuração
          </button>
          <button
            onClick={() => setTab('webhook')}
            className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
              tab === 'webhook'
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Webhook
          </button>
        </div>
      </div>

      {/* Config tab */}
      {tab === 'config' && (
        <div className="p-5 space-y-5">
          {/* Environment + Key status row */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-border bg-muted/30 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Ambiente</p>
              <div className="flex items-center justify-between">
                <span className={`text-sm font-semibold ${sandboxValue ? 'text-amber-600' : 'text-emerald-600'}`}>
                  {sandboxValue ? 'Sandbox' : 'Produção'}
                </span>
                <Switch
                  checked={sandboxValue}
                  onCheckedChange={onSandboxChange}
                />
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">
                {sandboxValue ? 'Modo de testes ativo' : 'Ambiente real ativo'}
              </p>
            </div>

            <div className="rounded-xl border border-border bg-muted/30 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Chave API</p>
              <div className="flex items-center gap-1.5">
                {keyConfigured ? (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                    <span className="text-sm font-semibold text-emerald-600">Configurada</span>
                  </>
                ) : (
                  <>
                    <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0" />
                    <span className="text-sm font-semibold text-amber-600">Faltando</span>
                  </>
                )}
              </div>
              <p className="text-[10px] text-muted-foreground mt-1 font-mono">{b.keyLabel}</p>
            </div>
          </div>

          {/* Stripe: publishable key */}
          {id === 'stripe' && (
            <div className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl border text-xs ${
              status.stripePublishableKeyConfigured
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : 'bg-amber-50 border-amber-200 text-amber-800'
            }`}>
              <Key className="w-3.5 h-3.5 flex-shrink-0" />
              <span>
                Chave pública <code className="font-mono font-semibold">STRIPE_PUBLISHABLE_KEY</code>:{' '}
                <strong>{status.stripePublishableKeyConfigured ? 'OK' : 'não configurada'}</strong>
              </span>
            </div>
          )}

          {/* Vindi: optional inline key */}
          {id === 'vindi' && onApiKeyChange && (
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold flex items-center gap-1.5">
                <Key className="w-3 h-3" /> API Key (opcional)
              </Label>
              <Input
                type="password"
                placeholder="Ou configure via VINDI_API_KEY nos segredos"
                value={config.vindi.apiKey || ''}
                onChange={(e) => onApiKeyChange(e.target.value)}
                className="h-8 text-xs font-mono"
              />
            </div>
          )}

          {/* Connection test */}
          <div className="rounded-xl border border-border p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-foreground">Teste de Conexão</span>
              <ConnectionDot result={testResult} testing={testing} />
            </div>

            {testResult?.error && (
              <div className="flex items-start gap-2 p-2.5 bg-red-50 rounded-lg border border-red-200">
                <XCircle className="w-3.5 h-3.5 text-red-500 flex-shrink-0 mt-0.5" />
                <p className="text-[11px] text-red-700 break-all leading-relaxed">{testResult.error}</p>
              </div>
            )}

            {testResult?.ok && testResult.environment && (
              <div className="flex items-center gap-2 text-xs text-emerald-700">
                <Globe className="w-3.5 h-3.5" />
                <span>Ambiente: <strong>{testResult.environment}</strong></span>
              </div>
            )}

            <button
              onClick={onTest}
              disabled={testing || !keyConfigured}
              className="w-full flex items-center justify-center gap-2 h-9 rounded-lg border border-border text-sm font-medium text-foreground bg-card hover:bg-muted transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {testing
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Testando...</>
                : <><Activity className="w-4 h-4" /> Testar agora</>
              }
            </button>

            {!keyConfigured && (
              <p className="text-[11px] text-muted-foreground text-center">
                Configure <code className="bg-muted px-1 rounded font-mono">{b.keyLabel}</code> primeiro.
              </p>
            )}
          </div>

          {/* Save row */}
          <div className="flex items-center justify-between pt-1">
            <p className="text-xs text-muted-foreground">Alterações no ambiente afetam apenas este provider.</p>
            <button
              onClick={onSave}
              disabled={saving}
              className="flex items-center gap-2 h-8 px-4 rounded-lg bg-foreground text-background text-xs font-semibold hover:bg-foreground/90 transition-colors disabled:opacity-60"
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              Salvar
            </button>
          </div>
        </div>
      )}

      {/* Webhook tab */}
      {tab === 'webhook' && (
        <div className="p-5 space-y-4">
          <div className="flex items-center gap-2">
            <ArrowLeftRight className="w-4 h-4 text-muted-foreground" />
            <p className="text-sm font-semibold text-foreground">Configuração de Webhook</p>
          </div>

          {id === 'stripe' ? (
            <StripeWebhookGuide webhookSecret={false} />
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Configure o webhook no painel {b.label} apontando para o endpoint abaixo. Os eventos de pagamento (pago, vencido, estornado) serão processados automaticamente.
              </p>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Endpoint</Label>
                <div className="flex items-center gap-1 bg-muted rounded-lg px-3 py-2 border border-border">
                  <code className="text-[11px] font-mono text-foreground flex-1 break-all">
                    https://[projeto].supabase.co/functions/v1/make-server-1d6e33e0{b.webhookPath}
                  </code>
                  <CopyButton text={`https://[project].supabase.co/functions/v1/make-server-1d6e33e0${b.webhookPath}`} />
                </div>
              </div>
              <a
                href={b.docsUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-foreground/60 hover:text-foreground transition-colors"
              >
                Documentação {b.label} <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Provider Selector Card ───────────────────────────────────────────────────

function ProviderCard({
  id,
  isActive,
  isSelected,
  keyConfigured,
  sandboxValue,
  testResult,
  testing,
  confirming,
  switching,
  onSelect,
  onConfirmSwitch,
  onCancelSwitch,
}: {
  id: ProviderId;
  isActive: boolean;
  isSelected: boolean;
  keyConfigured: boolean;
  sandboxValue: boolean;
  testResult: { ok: boolean } | null;
  testing: boolean;
  confirming: boolean;
  switching: boolean;
  onSelect: () => void;
  onConfirmSwitch: () => void;
  onCancelSwitch: () => void;
}) {
  const b = BRAND[id];

  return (
    <div
      className={`relative rounded-2xl overflow-hidden border-2 transition-all duration-200 cursor-pointer select-none ${
        isActive
          ? 'border-foreground shadow-lg'
          : isSelected
          ? 'border-muted-foreground/40 shadow-md'
          : 'border-border hover:border-muted-foreground/30 hover:shadow-sm'
      }`}
      onClick={!confirming ? onSelect : undefined}
    >
      {/* Color strip */}
      <div className={`h-1.5 bg-gradient-to-r ${b.gradient}`} />

      <div className="p-4 bg-card">
        {/* Top row */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2.5">
            <div className={`w-9 h-9 rounded-xl ${b.iconBg} flex items-center justify-center flex-shrink-0`}>
              <ProviderIcon id={id} size="sm" />
            </div>
            <div>
              <p className="text-sm font-bold text-foreground leading-tight">{b.label}</p>
              <p className="text-[10px] text-muted-foreground leading-tight">{b.tagline}</p>
            </div>
          </div>

          {isActive ? (
            <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Ativo
            </span>
          ) : (
            <span className="text-[10px] text-muted-foreground/60 bg-muted px-2 py-0.5 rounded-full">
              Inativo
            </span>
          )}
        </div>

        {/* Methods */}
        <div className="flex gap-1 flex-wrap mb-3">
          {b.methods.map(m => (
            <span key={m} className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${b.badge}`}>{m}</span>
          ))}
        </div>

        {/* Status row */}
        <div className="flex items-center justify-between text-[11px]">
          <div className="flex items-center gap-3">
            {keyConfigured ? (
              <span className="flex items-center gap-1 text-emerald-600">
                <CheckCircle2 className="w-3 h-3" /> Chave OK
              </span>
            ) : (
              <span className="flex items-center gap-1 text-amber-600">
                <AlertTriangle className="w-3 h-3" /> Sem chave
              </span>
            )}
            <span className={sandboxValue ? 'text-amber-600' : 'text-emerald-600'}>
              {sandboxValue ? '⚙ Sandbox' : '🌐 Produção'}
            </span>
          </div>
          <ConnectionDot result={testResult} testing={testing} />
        </div>

        {/* Confirm switch */}
        {confirming && !isActive && (
          <div className="mt-3 pt-3 border-t border-border space-y-2.5" onClick={e => e.stopPropagation()}>
            <p className="text-xs text-foreground leading-relaxed">
              <strong>Ativar {b.label}?</strong> Todos os novos checkouts serão roteados para este gateway.
            </p>
            <div className="flex gap-2">
              <button
                onClick={onConfirmSwitch}
                disabled={switching}
                className={`flex-1 flex items-center justify-center gap-1.5 h-8 rounded-lg text-xs font-semibold text-white bg-gradient-to-r ${b.gradient} hover:opacity-90 transition-opacity disabled:opacity-60`}
              >
                {switching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                Confirmar
              </button>
              <button
                onClick={onCancelSwitch}
                className="flex-1 h-8 rounded-lg text-xs font-medium text-muted-foreground bg-muted hover:bg-muted/80 transition-colors"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}

        {/* Expand indicator */}
        {!confirming && (
          <div className={`mt-3 pt-2.5 border-t border-border flex items-center justify-between ${
            isSelected ? 'text-foreground' : 'text-muted-foreground'
          }`}>
            <span className="text-[11px] font-medium">
              {isActive && !isSelected ? 'Ver configurações' : isSelected ? 'Configurações abertas' : 'Clique para configurar'}
            </span>
            {isSelected
              ? <ChevronUp className="w-3.5 h-3.5" />
              : <ChevronDown className="w-3.5 h-3.5" />
            }
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function PaymentAdmin() {
  const [config,   setConfig]   = useState<PaymentConfig | null>(null);
  const [status,   setStatus]   = useState<PaymentStatus | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState(false);
  const [switching, setSwitching] = useState(false);

  // Selected provider for detail panel (default to active)
  const [selected,   setSelected]   = useState<ProviderId | null>(null);
  const [confirming, setConfirming] = useState<ProviderId | null>(null);

  // Per-provider test state
  const [testingMap, setTestingMap] = useState<Record<ProviderId, boolean>>({ asaas: false, vindi: false, stripe: false });
  const [resultMap,  setResultMap]  = useState<Record<ProviderId, { ok: boolean; error?: string; environment?: string } | null>>({
    asaas: null, vindi: null, stripe: null,
  });

  const loadConfig = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchPaymentConfig();
      setConfig(data.config);
      setStatus(data.status);
      if (!selected) setSelected(data.config.activeProvider);
    } catch (e: any) {
      console.error('PaymentAdmin:', e);
      toast.error('Erro ao carregar configurações');
    } finally {
      setLoading(false);
    }
  }, [selected]);

  useEffect(() => { loadConfig(); }, []);

  const handleSave = async () => {
    if (!config) return;
    setSaving(true);
    try {
      await savePaymentConfig(config);
      toast.success('Configurações salvas!');
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmSwitch = async (provider: ProviderId) => {
    setSwitching(true);
    try {
      await activateProvider(provider);
      toast.success(`${BRAND[provider].label} ativado com sucesso!`);
      await loadConfig();
      setConfirming(null);
      setSelected(provider);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSwitching(false);
    }
  };

  const handleTest = async (id: ProviderId) => {
    setTestingMap(t => ({ ...t, [id]: true }));
    setResultMap(r => ({ ...r, [id]: null }));
    try {
      const fn = id === 'asaas' ? testAsaasConnection : id === 'vindi' ? testVindiConnection : testStripeConnection;
      const res = await fn();
      setResultMap(r => ({ ...r, [id]: res }));
      res.ok ? toast.success(`${BRAND[id].label}: conexão OK`) : toast.error(`${BRAND[id].label}: ${res.error}`);
    } catch (e: any) {
      setResultMap(r => ({ ...r, [id]: { ok: false, error: e.message } }));
    } finally {
      setTestingMap(t => ({ ...t, [id]: false }));
    }
  };

  const updateSub = (provider: ProviderId, patch: any) =>
    config && setConfig({ ...config, [provider]: { ...(config as any)[provider], ...patch } });

  // ─── Loading skeleton ──────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 lg:px-6 pt-8 pb-12">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-xl bg-muted animate-pulse" />
          <div className="space-y-2">
            <div className="w-32 h-5 bg-muted rounded animate-pulse" />
            <div className="w-64 h-3 bg-muted rounded animate-pulse" />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-4">
          {[0,1,2].map(i => (
            <div key={i} className="rounded-2xl border border-border overflow-hidden">
              <div className="h-1.5 bg-muted animate-pulse" />
              <div className="p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <div className="w-9 h-9 rounded-xl bg-muted animate-pulse" />
                  <div className="space-y-1.5 flex-1">
                    <div className="w-20 h-3.5 bg-muted rounded animate-pulse" />
                    <div className="w-32 h-2.5 bg-muted rounded animate-pulse" />
                  </div>
                </div>
                <div className="w-full h-24 bg-muted/60 rounded-xl animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!config || !status) return null;

  const PROVIDER_IDS: ProviderId[] = ['asaas', 'vindi', 'stripe'];

  return (
    <div className="max-w-4xl mx-auto px-4 lg:px-6 pt-8 pb-12 space-y-6">

      {/* ── Page Header ── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-foreground flex items-center justify-center">
              <CreditCard className="w-4 h-4 text-background" />
            </div>
            Pagamentos
          </h1>
          <p className="text-sm text-muted-foreground mt-1 ml-10.5">
            Payment Abstraction Layer — troca de gateway sem redeploy
          </p>
        </div>
        <button
          onClick={loadConfig}
          disabled={loading}
          className="flex items-center gap-1.5 h-8 px-3 rounded-lg border border-border text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Atualizar
        </button>
      </div>

      {/* ── Active Provider Hero ── */}
      <div className={`relative overflow-hidden rounded-2xl bg-gradient-to-r ${BRAND[config.activeProvider].gradient} p-5 text-white shadow-lg`}>
        <div className="relative z-10 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center">
              <ProviderIcon id={config.activeProvider} size="md" />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-[10px] font-bold uppercase tracking-widest text-white/70">Provedor Ativo</span>
                <span className="flex items-center gap-1 text-[10px] font-bold bg-white/20 px-2 py-0.5 rounded-full">
                  <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                  LIVE
                </span>
              </div>
              <p className="text-xl font-bold leading-tight">{BRAND[config.activeProvider].label}</p>
              <p className="text-sm text-white/80">{BRAND[config.activeProvider].tagline}</p>
            </div>
          </div>
          <div className="text-right space-y-1">
            <div className="flex items-center justify-end gap-2">
              <Globe className="w-3.5 h-3.5 text-white/70" />
              <span className="text-sm font-semibold">
                {(config as any)[config.activeProvider]?.sandbox ? 'Sandbox' : 'Produção'}
              </span>
            </div>
            <div className="flex items-center justify-end gap-2">
              <Zap className="w-3.5 h-3.5 text-white/70" />
              <span className="text-sm">
                {BRAND[config.activeProvider].methods.join(' · ')}
              </span>
            </div>
          </div>
        </div>
        {/* Decorative circle */}
        <div className="absolute -right-8 -top-8 w-40 h-40 rounded-full bg-white/5" />
        <div className="absolute -right-2 -bottom-12 w-32 h-32 rounded-full bg-white/5" />
      </div>

      {/* ── Provider Selector Grid ── */}
      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
          Gateways disponíveis
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {PROVIDER_IDS.map(id => {
            const keyConf = id === 'asaas'
              ? status.asaasKeyConfigured
              : id === 'vindi'
              ? status.vindiKeyConfigured
              : status.stripeKeyConfigured;
            const sandbox = id === 'stripe'
              ? (config.stripe?.sandbox ?? true)
              : (config as any)[id].sandbox;

            return (
              <ProviderCard
                key={id}
                id={id}
                isActive={config.activeProvider === id}
                isSelected={selected === id}
                keyConfigured={keyConf}
                sandboxValue={sandbox}
                testResult={resultMap[id]}
                testing={testingMap[id]}
                confirming={confirming === id}
                switching={switching}
                onSelect={() => {
                  if (config.activeProvider !== id && confirming !== id) {
                    setConfirming(id);
                    setSelected(id);
                  } else {
                    setConfirming(null);
                    setSelected(selected === id ? null : id);
                  }
                }}
                onConfirmSwitch={() => handleConfirmSwitch(id)}
                onCancelSwitch={() => { setConfirming(null); }}
              />
            );
          })}
        </div>
      </div>

      {/* ── Provider Detail Panel ── */}
      {selected && (
        <ProviderDetail
          id={selected}
          config={config}
          status={status}
          testResult={resultMap[selected]}
          testing={testingMap[selected]}
          onTest={() => handleTest(selected)}
          onSandboxChange={(v) => updateSub(selected, { sandbox: v })}
          onApiKeyChange={selected === 'vindi' ? (v) => updateSub('vindi', { apiKey: v }) : undefined}
          onSave={handleSave}
          saving={saving}
        />
      )}

      {/* ── PAL Routing Info ── */}
      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        <div className="px-5 py-3.5 border-b border-border bg-muted/30 flex items-center gap-2">
          <ArrowLeftRight className="w-4 h-4 text-muted-foreground" />
          <p className="text-sm font-semibold text-foreground">Roteamento PAL</p>
        </div>
        <div className="p-5">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
            {PROVIDER_IDS.map(id => (
              <div key={id} className={`rounded-xl p-3 border ${
                config.activeProvider === id
                  ? 'border-foreground/20 bg-foreground/5'
                  : 'border-border bg-muted/20'
              }`}>
                <div className="flex items-center gap-2 mb-1.5">
                  <ProviderIcon id={id} size="sm" />
                  <span className="text-xs font-semibold text-foreground">{BRAND[id].label}</span>
                  {config.activeProvider === id && (
                    <span className="ml-auto text-[9px] font-bold text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded-full uppercase tracking-wide">Live</span>
                  )}
                </div>
                <code className="text-[10px] text-muted-foreground font-mono">{BRAND[id].webhookPath}</code>
              </div>
            ))}
          </div>
          <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
            <Shield className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-amber-800 leading-relaxed">
              Pedidos já criados são sempre processados pelo gateway original (<code className="bg-amber-100 px-1 rounded font-mono">payment_provider</code> no KV). A troca de provedor afeta apenas novos pedidos e é auditada.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
