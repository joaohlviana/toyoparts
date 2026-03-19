// ─── Stripe Test & Diagnostics Page ──────────────────────────────────────────
// Full end-to-end Stripe testing: API health, webhook simulation, live checkout
// test, order status verification, and webhook log.

import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  Activity, CheckCircle2, XCircle, AlertTriangle, Loader2,
  Play, RefreshCw, ExternalLink, Copy, Check, CreditCard,
  Zap, Shield, Eye, Trash2, ChevronDown, ChevronUp, Clock,
  ArrowRight, TerminalSquare, Radio, CircleDot,
} from 'lucide-react';
import { toast } from 'sonner';
import { adminFetch } from '../../lib/admin-auth';
import { projectId, publicAnonKey } from '../../../../utils/supabase/info';

const API = `https://${projectId}.supabase.co/functions/v1/make-server-1d6e33e0/admin/stripe-test`;

// ─── Clipboard fallback ──────────────────────────────────────────────────────

function fallbackCopy(text: string) {
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
  } catch { /* silently fail */ }
}

// ─── Types ───────────────────────────────────────────────────────────────────

interface DiagResult {
  timestamp: string;
  overall: string;
  checks: {
    secretKey:       { configured: boolean; environment: string; prefix: string | null };
    publishableKey:  { configured: boolean; environment: string; prefix: string | null };
    webhookSecret:   { configured: boolean; prefix: string | null };
    environmentConsistency: { consistent: boolean; warning: string | null };
    apiConnection:   { ok: boolean; response_ms?: number; error?: string; available?: any[]; pending?: any[] };
    webhookEndpoints?: { total: number; ours: number; expectedUrl: string; endpoints: any[]; error?: string };
    recentWebhooks?: { total_dedup_entries: number; recent: any[]; error?: string };
    paymentConfig?:  { activeProvider: string; stripeEnabled: boolean; stripeSandbox: boolean; error?: string };
  };
}

interface SimulateResult {
  success: boolean;
  message: string;
  error?: string;
  simulation?: { eventId: string; eventType: string; orderId: string; previousStatus: string; newStatus: string };
  verification?: { orderUpdated: boolean; orderStatus: string; dedupRecorded: boolean };
}

interface CheckoutResult {
  success: boolean;
  error?: string;
  orderId?: string;
  checkoutUrl?: string;
  sessionId?: string;
  expiresAt?: string;
  instructions?: string[];
}

interface OrderStatus {
  found: boolean;
  orderId?: string;
  kv?: { payment_status: string; status: string; last_payment_event: string; updatedAt: string; createdAt: string; _test: boolean };
  stripe?: { session_status: string; payment_status: string; payment_intent: string; amount_total: number | null } | null;
}

// ─── Status Badge ────────────────────────────────────────────────────────────

function StatusBadge({ ok, label, warning }: { ok: boolean | null; label: string; warning?: boolean }) {
  if (ok === null) return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground bg-muted px-2.5 py-1 rounded-full">
      <CircleDot className="w-3 h-3" /> {label}
    </span>
  );
  if (warning) return (
    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-full">
      <AlertTriangle className="w-3 h-3" /> {label}
    </span>
  );
  return ok ? (
    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full">
      <CheckCircle2 className="w-3 h-3" /> {label}
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-rose-700 bg-rose-50 border border-rose-200 px-2.5 py-1 rounded-full">
      <XCircle className="w-3 h-3" /> {label}
    </span>
  );
}

// ─── Copy Button ─────────────────────────────────────────────────────────────

function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).catch(() => fallbackCopy(text));
      } else {
        fallbackCopy(text);
      }
    } catch {
      fallbackCopy(text);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button onClick={copy} className="p-1 hover:bg-muted rounded transition-colors" title="Copiar">
      {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5 text-muted-foreground" />}
    </button>
  );
}

// ─── Section Card ────────────────────────────────────────────────────────────

function Section({ title, icon: Icon, children, badge, collapsible, defaultOpen = true }: {
  title: string;
  icon: React.ElementType;
  children: React.ReactNode;
  badge?: React.ReactNode;
  collapsible?: boolean;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="bg-white border border-border rounded-xl overflow-hidden shadow-sm">
      <button
        onClick={() => collapsible && setOpen(!open)}
        className={`w-full flex items-center justify-between px-5 py-4 ${collapsible ? 'cursor-pointer hover:bg-muted/30' : 'cursor-default'} transition-colors`}
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-indigo-50 flex items-center justify-center shrink-0">
            <Icon className="w-5 h-5 text-indigo-600" />
          </div>
          <h3 className="text-sm font-bold text-foreground">{title}</h3>
          {badge}
        </div>
        {collapsible && (open ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />)}
      </button>
      {(!collapsible || open) && <div className="px-5 pb-5 border-t border-border/50 pt-4">{children}</div>}
    </div>
  );
}

// ─── Main Page Component ─────────────────────────────────────────────────────

export function StripeTestPage() {
  const [diag, setDiag] = useState<DiagResult | null>(null);
  const [diagLoading, setDiagLoading] = useState(false);

  const [simResult, setSimResult] = useState<SimulateResult | null>(null);
  const [simLoading, setSimLoading] = useState(false);
  const [simEventType, setSimEventType] = useState('checkout.session.completed');

  const [checkoutResult, setCheckoutResult] = useState<CheckoutResult | null>(null);
  const [checkoutLoading, setCheckoutLoading] = useState(false);

  const [orderQuery, setOrderQuery] = useState('');
  const [orderStatus, setOrderStatus] = useState<OrderStatus | null>(null);
  const [orderLoading, setOrderLoading] = useState(false);

  const [pollingOrderId, setPollingOrderId] = useState<string | null>(null);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [cleanupLoading, setCleanupLoading] = useState(false);

  // ─── Auto-run diagnostics on mount
  useEffect(() => { runDiagnostics(); }, []);

  // ─── Polling for order status after checkout
  useEffect(() => {
    if (!pollingOrderId) return;
    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    pollIntervalRef.current = setInterval(async () => {
      try {
        const res = await adminFetch(`${API}/order-status/${pollingOrderId}`);
        if (res.ok) {
          const data = await res.json();
          setOrderStatus(data);
          if (data.kv?.payment_status === 'paid') {
            toast.success('Webhook recebido! Status atualizado para PAID!');
            setPollingOrderId(null);
          }
        }
      } catch { /* ignore */ }
    }, 3000);
    return () => { if (pollIntervalRef.current) clearInterval(pollIntervalRef.current); };
  }, [pollingOrderId]);

  // ─── Diagnostics
  const runDiagnostics = useCallback(async () => {
    setDiagLoading(true);
    try {
      const res = await adminFetch(`${API}/diagnostics`);
      const data = await res.json();
      setDiag(data);
    } catch (err: any) {
      toast.error(`Erro no diagnostico: ${err.message}`);
    } finally {
      setDiagLoading(false);
    }
  }, []);

  // ─── Simulate webhook
  const runSimulation = useCallback(async () => {
    setSimLoading(true);
    setSimResult(null);
    try {
      const res = await adminFetch(`${API}/simulate-webhook`, {
        method: 'POST',
        body: JSON.stringify({ eventType: simEventType }),
      });
      const data = await res.json();
      setSimResult(data);
      if (data.success) {
        toast.success('Webhook simulado com sucesso!');
        if (data.simulation?.orderId) {
          setOrderQuery(data.simulation.orderId);
        }
      } else {
        toast.error(data.error || 'Erro na simulacao');
      }
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSimLoading(false);
    }
  }, [simEventType]);

  // ─── Create test checkout
  const createTestCheckout = useCallback(async () => {
    setCheckoutLoading(true);
    setCheckoutResult(null);
    try {
      const res = await adminFetch(`${API}/create-test-checkout`, { method: 'POST' });
      const data = await res.json();
      setCheckoutResult(data);
      if (data.success) {
        toast.success('Checkout de teste criado!');
        setOrderQuery(data.orderId || '');
        setPollingOrderId(data.orderId || null);
      } else {
        toast.error(data.error || 'Erro ao criar checkout');
      }
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setCheckoutLoading(false);
    }
  }, []);

  // ─── Check order status
  const checkOrder = useCallback(async (id?: string) => {
    const oid = id || orderQuery.trim();
    if (!oid) return;
    setOrderLoading(true);
    try {
      const res = await adminFetch(`${API}/order-status/${oid}`);
      const data = await res.json();
      setOrderStatus(data);
      if (!data.found) toast.error('Pedido nao encontrado');
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setOrderLoading(false);
    }
  }, [orderQuery]);

  // ─── Cleanup
  const cleanup = useCallback(async () => {
    setCleanupLoading(true);
    try {
      const res = await adminFetch(`${API}/cleanup-test-data`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        toast.success(`Limpeza concluida: ${data.cleaned.orders} pedidos removidos`);
        setSimResult(null);
        setCheckoutResult(null);
        setOrderStatus(null);
        setOrderQuery('');
        setPollingOrderId(null);
      }
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setCleanupLoading(false);
    }
  }, []);

  const paymentStatusColor = (s: string) => {
    if (s === 'paid') return 'text-emerald-700 bg-emerald-50 border-emerald-200';
    if (s === 'waiting_payment') return 'text-amber-700 bg-amber-50 border-amber-200';
    if (s === 'canceled' || s === 'overdue') return 'text-rose-700 bg-rose-50 border-rose-200';
    if (s === 'refunded') return 'text-blue-700 bg-blue-50 border-blue-200';
    return 'text-muted-foreground bg-muted border-border';
  };

  return (
    <div className="max-w-4xl mx-auto px-4 lg:px-6 py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-700 flex items-center justify-center shadow-lg shadow-indigo-500/30">
              <CreditCard className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground">Stripe — Diagnostico & Testes</h1>
              <p className="text-xs text-muted-foreground">Teste completo end-to-end: API, webhook, checkout e verificacao</p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={cleanup}
            disabled={cleanupLoading}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-muted-foreground hover:text-rose-600 bg-muted hover:bg-rose-50 border border-transparent hover:border-rose-200 rounded-lg transition-all"
          >
            {cleanupLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
            Limpar testes
          </button>
          <button
            onClick={runDiagnostics}
            disabled={diagLoading}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 rounded-lg transition-colors shadow-sm"
          >
            {diagLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            Atualizar
          </button>
        </div>
      </div>

      {/* ═══ 1. DIAGNOSTICS ═══ */}
      <Section
        title="1. Diagnostico de Configuracao"
        icon={Shield}
        badge={diag && (
          <StatusBadge
            ok={diag.overall === 'healthy'}
            label={diag.overall === 'healthy' ? 'Tudo OK' : 'Problemas encontrados'}
          />
        )}
      >
        {diagLoading && !diag && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
            <Loader2 className="w-4 h-4 animate-spin" /> Executando diagnostico...
          </div>
        )}
        {diag && (
          <div className="space-y-4">
            {/* Keys */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className={`rounded-xl border p-3 ${diag.checks.secretKey.configured ? 'bg-emerald-50/50 border-emerald-200' : 'bg-rose-50/50 border-rose-200'}`}>
                <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-1">Secret Key</div>
                <StatusBadge ok={diag.checks.secretKey.configured} label={diag.checks.secretKey.configured ? diag.checks.secretKey.environment : 'Ausente'} />
                {diag.checks.secretKey.prefix && <p className="text-[10px] text-muted-foreground mt-1 font-mono">{diag.checks.secretKey.prefix}</p>}
              </div>
              <div className={`rounded-xl border p-3 ${diag.checks.publishableKey.configured ? 'bg-emerald-50/50 border-emerald-200' : 'bg-rose-50/50 border-rose-200'}`}>
                <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-1">Publishable Key</div>
                <StatusBadge ok={diag.checks.publishableKey.configured} label={diag.checks.publishableKey.configured ? diag.checks.publishableKey.environment : 'Ausente'} />
                {diag.checks.publishableKey.prefix && <p className="text-[10px] text-muted-foreground mt-1 font-mono">{diag.checks.publishableKey.prefix}</p>}
              </div>
              <div className={`rounded-xl border p-3 ${diag.checks.webhookSecret.configured ? 'bg-emerald-50/50 border-emerald-200' : 'bg-rose-50/50 border-rose-200'}`}>
                <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-1">Webhook Secret</div>
                <StatusBadge ok={diag.checks.webhookSecret.configured} label={diag.checks.webhookSecret.configured ? 'Configurado' : 'Ausente'} />
                {diag.checks.webhookSecret.prefix && <p className="text-[10px] text-muted-foreground mt-1 font-mono">{diag.checks.webhookSecret.prefix}</p>}
              </div>
            </div>

            {/* Environment warning */}
            {diag.checks.environmentConsistency.warning && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
                <p className="text-xs text-amber-800">{diag.checks.environmentConsistency.warning}</p>
              </div>
            )}

            {/* API Connection */}
            <div className={`rounded-xl border p-4 ${diag.checks.apiConnection.ok ? 'bg-emerald-50/30 border-emerald-200' : 'bg-rose-50/30 border-rose-200'}`}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-foreground">Conexao API Stripe</span>
                <StatusBadge ok={diag.checks.apiConnection.ok} label={diag.checks.apiConnection.ok ? `OK (${diag.checks.apiConnection.response_ms}ms)` : 'Falhou'} />
              </div>
              {diag.checks.apiConnection.ok && diag.checks.apiConnection.available && (
                <div className="grid grid-cols-2 gap-2 mt-2">
                  {diag.checks.apiConnection.available.map((b: any, i: number) => (
                    <div key={i} className="text-xs bg-white rounded-lg border border-emerald-100 px-3 py-2">
                      <span className="text-muted-foreground">Disponivel: </span>
                      <span className="font-bold text-emerald-700">R$ {b.amount.toFixed(2)}</span>
                    </div>
                  ))}
                  {diag.checks.apiConnection.pending?.map((b: any, i: number) => (
                    <div key={i} className="text-xs bg-white rounded-lg border border-amber-100 px-3 py-2">
                      <span className="text-muted-foreground">Pendente: </span>
                      <span className="font-bold text-amber-700">R$ {b.amount.toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              )}
              {diag.checks.apiConnection.error && (
                <p className="text-xs text-rose-600 mt-1 font-mono">{diag.checks.apiConnection.error}</p>
              )}
            </div>

            {/* Webhook Endpoints from Stripe */}
            {diag.checks.webhookEndpoints && !diag.checks.webhookEndpoints.error && (
              <div className="rounded-xl border border-border p-4 bg-muted/20">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-bold text-foreground">Webhook Endpoints no Stripe</span>
                  <span className="text-[10px] text-muted-foreground">{diag.checks.webhookEndpoints.total} endpoint(s)</span>
                </div>
                {diag.checks.webhookEndpoints.endpoints.map((ep: any, i: number) => (
                  <div key={i} className={`text-xs rounded-lg border p-3 mb-2 last:mb-0 ${ep.isOurs ? 'bg-indigo-50/50 border-indigo-200' : 'bg-white border-border'}`}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        {ep.isOurs && <span className="text-[9px] font-black text-indigo-600 bg-indigo-100 px-1.5 py-0.5 rounded">NOSSO</span>}
                        <StatusBadge ok={ep.status === 'enabled'} label={ep.status} />
                      </div>
                      <CopyBtn text={ep.url} />
                    </div>
                    <p className="font-mono text-[10px] text-muted-foreground break-all mt-1">{ep.url}</p>
                    {ep.enabled_events && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {(ep.enabled_events.length > 6 ? ['*'] : ep.enabled_events).map((evt: string, j: number) => (
                          <span key={j} className="text-[9px] font-mono bg-muted px-1.5 py-0.5 rounded">{evt}</span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
                {diag.checks.webhookEndpoints.ours === 0 && (
                  <div className="bg-rose-50 border border-rose-200 rounded-lg px-3 py-2.5 flex items-start gap-2 mt-2">
                    <XCircle className="w-4 h-4 text-rose-500 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-xs font-semibold text-rose-700">Nenhum webhook apontando para este servidor!</p>
                      <p className="text-[10px] text-rose-600 mt-0.5">URL esperada:</p>
                      <div className="flex items-center gap-1 mt-1">
                        <code className="text-[9px] font-mono bg-rose-100 px-2 py-1 rounded break-all">{diag.checks.webhookEndpoints.expectedUrl}</code>
                        <CopyBtn text={diag.checks.webhookEndpoints.expectedUrl} />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Payment Config */}
            {diag.checks.paymentConfig && !diag.checks.paymentConfig.error && (
              <div className="flex items-center gap-3 text-xs">
                <span className="text-muted-foreground">Provider ativo:</span>
                <span className={`font-bold px-2 py-0.5 rounded-full border ${diag.checks.paymentConfig.activeProvider === 'stripe' ? 'text-indigo-700 bg-indigo-50 border-indigo-200' : 'text-muted-foreground bg-muted border-border'}`}>
                  {diag.checks.paymentConfig.activeProvider}
                </span>
                {diag.checks.paymentConfig.activeProvider !== 'stripe' && (
                  <span className="text-amber-600 font-medium">Stripe nao e o provider ativo</span>
                )}
              </div>
            )}
          </div>
        )}
      </Section>

      {/* ═══ 2. WEBHOOK SIMULATION ═══ */}
      <Section title="2. Simular Webhook (Pipeline Local)" icon={Zap}>
        <p className="text-xs text-muted-foreground mb-4">
          Simula um evento webhook <strong>internamente</strong> para testar se o pipeline de processamento funciona:
          parsing de evento {'->'} mapeamento de status {'->'} atualizacao KV {'->'} audit log.
          <span className="text-amber-600 font-medium ml-1">Nao passa pelo Stripe real.</span>
        </p>

        <div className="flex items-end gap-3 mb-4">
          <div className="flex-1">
            <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider block mb-1.5">Tipo de evento</label>
            <select
              value={simEventType}
              onChange={e => setSimEventType(e.target.value)}
              className="w-full h-9 px-3 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
            >
              <option value="checkout.session.completed">checkout.session.completed (paid)</option>
              <option value="checkout.session.expired">checkout.session.expired (canceled)</option>
              <option value="payment_intent.payment_failed">payment_intent.payment_failed (overdue)</option>
              <option value="charge.refunded">charge.refunded (refunded)</option>
            </select>
          </div>
          <button
            onClick={runSimulation}
            disabled={simLoading}
            className="inline-flex items-center gap-1.5 px-4 h-9 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 rounded-lg transition-colors shadow-sm"
          >
            {simLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
            Simular
          </button>
        </div>

        {simResult && (
          <div className={`rounded-xl border p-4 ${simResult.success ? 'bg-emerald-50/30 border-emerald-200' : 'bg-rose-50/30 border-rose-200'}`}>
            <div className="flex items-center gap-2 mb-3">
              {simResult.success ? <CheckCircle2 className="w-5 h-5 text-emerald-600" /> : <XCircle className="w-5 h-5 text-rose-600" />}
              <span className="text-sm font-bold text-foreground">{simResult.message}</span>
            </div>
            {simResult.simulation && (
              <div className="grid grid-cols-2 gap-2 text-xs mb-3">
                <div className="bg-white rounded-lg border border-border/50 px-3 py-2">
                  <span className="text-muted-foreground">Evento: </span>
                  <span className="font-mono font-medium">{simResult.simulation.eventType}</span>
                </div>
                <div className="bg-white rounded-lg border border-border/50 px-3 py-2">
                  <span className="text-muted-foreground">Pedido: </span>
                  <span className="font-mono font-medium">{simResult.simulation.orderId}</span>
                </div>
                <div className="bg-white rounded-lg border border-border/50 px-3 py-2 col-span-2">
                  <span className="text-muted-foreground">Status: </span>
                  <span className="font-medium">{simResult.simulation.previousStatus}</span>
                  <ArrowRight className="w-3 h-3 inline mx-1.5 text-muted-foreground" />
                  <span className={`font-bold px-2 py-0.5 rounded-full border text-[11px] ${paymentStatusColor(simResult.simulation.newStatus)}`}>
                    {simResult.simulation.newStatus}
                  </span>
                </div>
              </div>
            )}
            {simResult.verification && (
              <div className="flex items-center gap-3 text-xs border-t border-border/50 pt-3">
                <StatusBadge ok={simResult.verification.orderUpdated} label={`KV: ${simResult.verification.orderStatus}`} />
                <StatusBadge ok={simResult.verification.dedupRecorded} label="Dedup registrado" />
              </div>
            )}
            {simResult.error && <p className="text-xs text-rose-600 mt-2">{simResult.error}</p>}
          </div>
        )}
      </Section>

      {/* ═══ 3. REAL CHECKOUT TEST ═══ */}
      <Section title="3. Checkout Real de Teste (R$1,00)" icon={CreditCard}>
        <p className="text-xs text-muted-foreground mb-4">
          Cria uma <strong>Checkout Session real</strong> no Stripe por R$1,00.
          Voce pode pagar com cartao de teste para validar o fluxo completo incluindo webhook.
          <span className="text-rose-600 font-semibold ml-1">Somente com chaves de teste (sk_test_).</span>
        </p>

        <button
          onClick={createTestCheckout}
          disabled={checkoutLoading || (diag?.checks.secretKey.environment === 'production')}
          className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold text-white bg-gradient-to-r from-indigo-500 to-purple-700 hover:from-indigo-600 hover:to-purple-800 disabled:opacity-60 rounded-lg transition-all shadow-md shadow-indigo-500/25"
        >
          {checkoutLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CreditCard className="w-4 h-4" />}
          Criar Checkout de Teste
        </button>

        {diag?.checks.secretKey.environment === 'production' && (
          <p className="text-xs text-rose-600 mt-2 font-medium">
            Voce esta usando chave de producao. Troque para chave de teste para usar esta funcionalidade.
          </p>
        )}

        {checkoutResult && checkoutResult.success && (
          <div className="mt-4 space-y-3">
            <div className="bg-indigo-50/50 border border-indigo-200 rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-bold text-indigo-900">Checkout Session Criada</span>
                <StatusBadge ok={true} label="Pronto" />
              </div>

              <div className="space-y-2 text-xs mb-4">
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground w-20 shrink-0">Pedido:</span>
                  <code className="font-mono text-[10px] bg-white px-2 py-1 rounded border border-indigo-100">{checkoutResult.orderId}</code>
                  <CopyBtn text={checkoutResult.orderId!} />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground w-20 shrink-0">Session:</span>
                  <code className="font-mono text-[10px] bg-white px-2 py-1 rounded border border-indigo-100 truncate max-w-[300px]">{checkoutResult.sessionId}</code>
                  <CopyBtn text={checkoutResult.sessionId!} />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground w-20 shrink-0">Expira:</span>
                  <span className="font-medium">{new Date(checkoutResult.expiresAt!).toLocaleString('pt-BR')}</span>
                </div>
              </div>

              <a
                href={checkoutResult.checkoutUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors shadow-sm"
              >
                <ExternalLink className="w-4 h-4" />
                Abrir Pagina de Pagamento
              </a>
            </div>

            {/* Test card info */}
            <div className="bg-amber-50/50 border border-amber-200 rounded-xl p-4">
              <p className="text-xs font-bold text-amber-800 mb-2">Dados do Cartao de Teste:</p>
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div className="bg-white rounded-lg border border-amber-100 px-3 py-2 text-center">
                  <p className="text-[10px] text-muted-foreground mb-0.5">Numero</p>
                  <p className="font-mono font-bold text-amber-900">4242 4242 4242 4242</p>
                </div>
                <div className="bg-white rounded-lg border border-amber-100 px-3 py-2 text-center">
                  <p className="text-[10px] text-muted-foreground mb-0.5">Validade</p>
                  <p className="font-mono font-bold text-amber-900">12/30</p>
                </div>
                <div className="bg-white rounded-lg border border-amber-100 px-3 py-2 text-center">
                  <p className="text-[10px] text-muted-foreground mb-0.5">CVC</p>
                  <p className="font-mono font-bold text-amber-900">123</p>
                </div>
              </div>
            </div>

            {/* Polling indicator */}
            {pollingOrderId && (
              <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 flex items-center gap-3">
                <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
                <p className="text-xs text-blue-800 font-medium">
                  Aguardando webhook... Verificando status a cada 3s.
                  Pague no checkout e o status sera atualizado automaticamente aqui.
                </p>
                <button onClick={() => setPollingOrderId(null)} className="text-[10px] text-blue-600 hover:underline ml-auto shrink-0">Parar</button>
              </div>
            )}
          </div>
        )}
        {checkoutResult && !checkoutResult.success && (
          <div className="mt-4 bg-rose-50 border border-rose-200 rounded-xl px-4 py-3">
            <p className="text-xs text-rose-700 font-medium">{checkoutResult.error}</p>
          </div>
        )}
      </Section>

      {/* ═══ 4. ORDER STATUS CHECK ═══ */}
      <Section title="4. Verificar Status do Pedido" icon={Eye}>
        <p className="text-xs text-muted-foreground mb-3">
          Consulta o status de um pedido no KV e na API do Stripe simultaneamente.
          Util para verificar se o webhook atualizou o pedido corretamente.
        </p>

        <div className="flex items-end gap-2 mb-4">
          <div className="flex-1">
            <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider block mb-1.5">Order ID</label>
            <input
              value={orderQuery}
              onChange={e => setOrderQuery(e.target.value)}
              placeholder="test-checkout-1234567890..."
              className="w-full h-9 px-3 rounded-lg border border-border bg-background text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
              onKeyDown={e => e.key === 'Enter' && checkOrder()}
            />
          </div>
          <button
            onClick={() => checkOrder()}
            disabled={orderLoading || !orderQuery.trim()}
            className="inline-flex items-center gap-1.5 px-4 h-9 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 rounded-lg transition-colors"
          >
            {orderLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Eye className="w-3.5 h-3.5" />}
            Verificar
          </button>
        </div>

        {orderStatus && orderStatus.found && (
          <div className="rounded-xl border border-border bg-muted/20 p-4 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* KV Status */}
              <div className="rounded-lg border border-border bg-white p-3">
                <div className="flex items-center gap-2 mb-3">
                  <TerminalSquare className="w-4 h-4 text-muted-foreground" />
                  <span className="text-xs font-bold text-foreground">KV Store (Servidor)</span>
                </div>
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Payment Status:</span>
                    <span className={`font-bold px-2 py-0.5 rounded-full border text-[11px] ${paymentStatusColor(orderStatus.kv?.payment_status || '')}`}>
                      {orderStatus.kv?.payment_status || '-'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Ultimo evento:</span>
                    <span className="font-mono text-[10px]">{orderStatus.kv?.last_payment_event || '-'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Atualizado:</span>
                    <span className="text-[10px]">{orderStatus.kv?.updatedAt ? new Date(orderStatus.kv.updatedAt).toLocaleString('pt-BR') : '-'}</span>
                  </div>
                  {orderStatus.kv?._test && <StatusBadge ok={null} label="Pedido de teste" />}
                </div>
              </div>

              {/* Stripe Status */}
              <div className="rounded-lg border border-border bg-white p-3">
                <div className="flex items-center gap-2 mb-3">
                  <Radio className="w-4 h-4 text-indigo-600" />
                  <span className="text-xs font-bold text-foreground">Stripe API</span>
                </div>
                {orderStatus.stripe ? (
                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Session Status:</span>
                      <span className={`font-bold px-2 py-0.5 rounded-full border text-[11px] ${paymentStatusColor(orderStatus.stripe.session_status === 'complete' ? 'paid' : orderStatus.stripe.session_status || '')}`}>
                        {orderStatus.stripe.session_status || '-'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Payment Status:</span>
                      <span className="font-mono text-[10px]">{orderStatus.stripe.payment_status || '-'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Valor:</span>
                      <span className="font-medium">{orderStatus.stripe.amount_total != null ? `R$ ${orderStatus.stripe.amount_total.toFixed(2)}` : '-'}</span>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground italic">Session nao encontrada no Stripe (pedido simulado?)</p>
                )}
              </div>
            </div>

            {/* Consistency check */}
            {orderStatus.stripe && orderStatus.kv && (
              <div className="border-t border-border/50 pt-3">
                {(() => {
                  const kvPaid = orderStatus.kv.payment_status === 'paid';
                  const stripePaid = orderStatus.stripe.session_status === 'complete';
                  const consistent = kvPaid === stripePaid;
                  return consistent ? (
                    <StatusBadge ok={true} label="KV e Stripe consistentes" />
                  ) : (
                    <StatusBadge ok={false} label="INCONSISTENCIA: KV e Stripe com status diferentes!" warning />
                  );
                })()}
              </div>
            )}
          </div>
        )}
        {orderStatus && !orderStatus.found && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
            <p className="text-xs text-amber-700 font-medium">Pedido nao encontrado no KV Store.</p>
          </div>
        )}
      </Section>

      {/* ═══ 5. WEBHOOK LOG ═══ */}
      <Section
        title="5. Webhooks Recebidos (Dedup Log)"
        icon={Activity}
        collapsible
        defaultOpen={false}
        badge={diag?.checks.recentWebhooks && (
          <span className="text-[10px] font-bold text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
            {diag.checks.recentWebhooks.total_dedup_entries} registros
          </span>
        )}
      >
        {diag?.checks.recentWebhooks?.recent && diag.checks.recentWebhooks.recent.length > 0 ? (
          <div className="space-y-2">
            {diag.checks.recentWebhooks.recent.map((entry: any, i: number) => (
              <div key={i} className={`text-xs rounded-lg border p-3 ${entry._simulated ? 'bg-amber-50/30 border-amber-200' : 'bg-white border-border'}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Clock className="w-3 h-3 text-muted-foreground" />
                    <span className="text-[10px] text-muted-foreground">{entry.processed_at ? new Date(entry.processed_at).toLocaleString('pt-BR') : '-'}</span>
                    {entry._simulated && <span className="text-[9px] font-black text-amber-600 bg-amber-100 px-1.5 py-0.5 rounded">SIMULADO</span>}
                  </div>
                  {entry.event_type && <span className="font-mono text-[10px] text-muted-foreground">{entry.event_type}</span>}
                </div>
                {entry.order_id && (
                  <p className="text-[10px] text-muted-foreground mt-1">
                    Pedido: <span className="font-mono">{entry.order_id}</span>
                  </p>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground italic py-2">
            Nenhum webhook recebido ainda. Execute o teste de checkout ou simule um evento acima.
          </p>
        )}
      </Section>

      {/* ═══ WORKFLOW GUIDE ═══ */}
      <div className="bg-gradient-to-br from-indigo-50 to-purple-50 border border-indigo-200 rounded-xl p-5">
        <h4 className="text-sm font-bold text-indigo-900 mb-3">Roteiro de Teste Completo</h4>
        <ol className="space-y-2 text-xs text-indigo-800">
          <li className="flex items-start gap-2">
            <span className="w-5 h-5 rounded-full bg-indigo-200 text-indigo-800 font-bold flex items-center justify-center shrink-0 text-[10px]">1</span>
            <span><strong>Diagnostico:</strong> Verifique se todas as chaves estao configuradas e a API responde.</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="w-5 h-5 rounded-full bg-indigo-200 text-indigo-800 font-bold flex items-center justify-center shrink-0 text-[10px]">2</span>
            <span><strong>Simular Webhook:</strong> Teste o pipeline interno sem depender do Stripe. Se funcionar, o processamento esta OK.</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="w-5 h-5 rounded-full bg-indigo-200 text-indigo-800 font-bold flex items-center justify-center shrink-0 text-[10px]">3</span>
            <span><strong>Checkout Real:</strong> Crie um checkout R$1,00, pague com cartao de teste. O sistema monitora automaticamente o webhook.</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="w-5 h-5 rounded-full bg-indigo-200 text-indigo-800 font-bold flex items-center justify-center shrink-0 text-[10px]">4</span>
            <span><strong>Verificar:</strong> Confira se o status mudou para "paid" tanto no KV quanto no Stripe. Se nao mudou, o webhook nao esta chegando.</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="w-5 h-5 rounded-full bg-indigo-200 text-indigo-800 font-bold flex items-center justify-center shrink-0 text-[10px]">5</span>
            <span><strong>Limpar:</strong> Use "Limpar testes" para remover pedidos e dados de teste do KV.</span>
          </li>
        </ol>
      </div>
    </div>
  );
}