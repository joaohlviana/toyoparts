// ─── Rastreamento de Pedidos ──────────────────────────────────────────────────
// Busca status do pedido no backend + exibe timeline de rastreio.

import React, { useState, useEffect, useRef } from 'react';
import { Link, useSearchParams } from 'react-router';
import { motion, AnimatePresence } from 'motion/react';
import {
  Search, Package, Truck, CheckCircle2, Clock, AlertCircle,
  ChevronRight, ArrowRight, RefreshCw, Copy, Check,
  MapPin, Phone, ShoppingBag, XCircle,
} from 'lucide-react';
import { SEOHead } from '../components/seo/SEOHead';
import { projectId, publicAnonKey } from '../../../utils/supabase/info';

const API = `https://${projectId}.supabase.co/functions/v1/make-server-1d6e33e0`;
const H: HeadersInit = { Authorization: `Bearer ${publicAnonKey}`, 'Content-Type': 'application/json' };

// ─── Types ────────────────────────────────────────────────────────────────────
interface OrderEvent {
  eventType: string;
  description?: string;
  actor?: string;
  timestamp: string;
}

interface OrderData {
  orderId:             string;
  payment_status?:     string;
  fulfillment_status?: string;
  status?:             string;
  payment_provider?:   string;
  createdAt?:          string;
  created_at?:         string;
  customer?:           { name?: string; email?: string };
  items?:              Array<{ id?: string; name?: string; description?: string; quantity?: number; price?: number }>;
  totals?:             { subtotal?: number; shipping?: number; total?: number };
  shipping?:           { carrier?: string; name?: string; trackingCode?: string; price?: number };
  trackingCode?:       string;
  events?:             OrderEvent[];
}

// ─── Status config ────────────────────────────────────────────────────────────
const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ElementType; bg: string }> = {
  waiting_payment:  { label: 'Aguardando pagamento', color: 'text-amber-600',  icon: Clock,        bg: 'bg-amber-50 border-amber-200' },
  confirmed:        { label: 'Pagamento confirmado',  color: 'text-blue-600',   icon: CheckCircle2, bg: 'bg-blue-50 border-blue-200' },
  processing:       { label: 'Em processamento',      color: 'text-blue-600',   icon: RefreshCw,    bg: 'bg-blue-50 border-blue-200' },
  preparing:        { label: 'Separando pedido',      color: 'text-indigo-600', icon: Package,      bg: 'bg-indigo-50 border-indigo-200' },
  shipped:          { label: 'Enviado',               color: 'text-primary',    icon: Truck,        bg: 'bg-red-50 border-red-200' },
  in_transit:       { label: 'Em trânsito',           color: 'text-primary',    icon: Truck,        bg: 'bg-red-50 border-red-200' },
  delivered:        { label: 'Entregue',              color: 'text-green-600',  icon: CheckCircle2, bg: 'bg-green-50 border-green-200' },
  cancelled:        { label: 'Cancelado',             color: 'text-slate-500',  icon: XCircle,      bg: 'bg-slate-50 border-slate-200' },
  refunded:         { label: 'Estornado',             color: 'text-slate-500',  icon: RefreshCw,    bg: 'bg-slate-50 border-slate-200' },
};

const PAYMENT_STATUS_MAP: Record<string, string> = {
  CONFIRMED: 'confirmed', RECEIVED: 'confirmed', PAYMENT_APPROVED: 'confirmed',
  PENDING: 'waiting_payment', WAITING_PAYMENT: 'waiting_payment',
  CANCELLED: 'cancelled', REFUNDED: 'refunded', CHARGEBACK_REQUESTED: 'cancelled',
};

const FULFILLMENT_STATUS_MAP: Record<string, string> = {
  pending:   'confirmed',
  preparing: 'preparing',
  shipped:   'shipped',
  delivered: 'delivered',
  cancelled: 'cancelled',
};

// Derive a unified display status from order data
function resolveStatus(order: OrderData): string {
  const raw = order.status || order.fulfillment_status || order.payment_status || 'waiting_payment';
  return (
    PAYMENT_STATUS_MAP[raw]     ||
    FULFILLMENT_STATUS_MAP[raw] ||
    STATUS_CONFIG[raw]          ? raw : 'waiting_payment'
  );
}

// Timeline steps (ordered)
const TIMELINE_STEPS = [
  { key: 'waiting_payment', label: 'Pedido criado',        icon: ShoppingBag },
  { key: 'confirmed',       label: 'Pagamento confirmado', icon: CheckCircle2 },
  { key: 'preparing',       label: 'Separando pedido',     icon: Package },
  { key: 'shipped',         label: 'Enviado',              icon: Truck },
  { key: 'delivered',       label: 'Entregue',             icon: CheckCircle2 },
];

function getStepIndex(status: string): number {
  const map: Record<string, number> = {
    waiting_payment: 0, confirmed: 1, processing: 1,
    preparing: 2, shipped: 3, in_transit: 3, delivered: 4,
  };
  return map[status] ?? 0;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function fmtBRL(v: number) { return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }
function fmtDate(iso?: string) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

// ─── Component ────────────────────────────────────────────────────────────────
export function OrderTrackingPage() {
  const [params] = useSearchParams();
  const [query,   setQuery]   = useState(params.get('pedido') || '');
  const [loading, setLoading] = useState(false);
  const [order,   setOrder]   = useState<OrderData | null>(null);
  const [error,   setError]   = useState<string | null>(null);
  const [copied,  setCopied]  = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-search if ?pedido= param is present
  useEffect(() => {
    const id = params.get('pedido');
    if (id) { setQuery(id); handleSearch(id); }
    // eslint-disable-next-line
  }, []);

  const handleSearch = async (id?: string) => {
    const q = (id ?? query).trim().toUpperCase();
    if (!q) { inputRef.current?.focus(); return; }
    setLoading(true); setError(null); setOrder(null);
    try {
      const res  = await fetch(`${API}/orders/${q}`, { headers: H });
      if (res.status === 404) throw new Error('Pedido não encontrado. Verifique o número e tente novamente.');
      if (!res.ok)            throw new Error(`Erro ao buscar pedido (${res.status}).`);
      const data = await res.json();
      if (!data || (!data.orderId && !data.order)) throw new Error('Pedido não encontrado.');
      setOrder(data.order ?? data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const copyTracking = async (code: string) => {
    await navigator.clipboard.writeText(code).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const status    = order ? resolveStatus(order) : null;
  const cfg       = status ? (STATUS_CONFIG[status] ?? STATUS_CONFIG.waiting_payment) : null;
  const stepIndex = status ? getStepIndex(status) : -1;
  const isCancelled = status === 'cancelled' || status === 'refunded';
  const trackingCode = order?.trackingCode || order?.shipping?.trackingCode;

  return (
    <>
      <SEOHead
        title="Rastrear Pedido — Toyoparts"
        description="Acompanhe o status do seu pedido Toyoparts em tempo real. Insira o número do pedido para ver onde está sua peça."
        canonical="https://www.toyoparts.com.br/rastreamento"
      />

      <div className="min-h-screen bg-background">

        {/* ── Hero ─────────────────────────────────────────────────────────── */}
        <div className="bg-slate-900 py-12 md:py-16 relative overflow-hidden">
          <div className="absolute -right-16 -top-16 w-72 h-72 rounded-full bg-white/4 pointer-events-none" />
          <div className="absolute -left-10 bottom-0 w-48 h-48 rounded-full bg-white/4 pointer-events-none" />

          <div className="relative max-w-3xl mx-auto px-6 lg:px-8 text-center">
            <nav className="flex items-center justify-center gap-1.5 text-[11px] font-semibold text-white/50 mb-6">
              <Link to="/" className="hover:text-white transition-colors">Início</Link>
              <ChevronRight className="w-3 h-3" />
              <span className="text-white">Rastreamento</span>
            </nav>

            <div className="w-14 h-14 rounded-2xl bg-white/10 flex items-center justify-center mx-auto mb-5">
              <Truck className="w-7 h-7 text-white" />
            </div>
            <h1 className="text-2xl md:text-3xl lg:text-4xl font-black text-white mb-3">
              Onde está meu pedido?
            </h1>
            <p className="text-white/65 text-[15px] mb-8">
              Digite o número do pedido para acompanhar o status da entrega em tempo real.
            </p>

            {/* Search bar */}
            <div className="flex gap-3 max-w-lg mx-auto">
              <div className="relative flex-1">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-slate-400 pointer-events-none" />
                <input
                  ref={inputRef}
                  value={query}
                  onChange={e => setQuery(e.target.value.toUpperCase())}
                  onKeyDown={e => e.key === 'Enter' && handleSearch()}
                  placeholder="Ex: TP-2025-001234"
                  className="w-full h-12 pl-11 pr-4 rounded-xl bg-white/10 border border-white/20 text-white placeholder-white/40 text-[14px] font-mono font-semibold tracking-wider focus:outline-none focus:border-white/50 focus:bg-white/15 transition-all"
                  autoComplete="off"
                  spellCheck={false}
                />
              </div>
              <button
                onClick={() => handleSearch()}
                disabled={loading}
                className="h-12 px-5 rounded-xl bg-primary hover:bg-primary/90 disabled:opacity-50 text-white font-bold text-[14px] transition-all flex items-center gap-2 flex-shrink-0"
              >
                {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                <span className="hidden sm:inline">Buscar</span>
              </button>
            </div>
          </div>
        </div>

        {/* ── Results area ─────────────────────────────────────────────────── */}
        <div className="max-w-3xl mx-auto px-6 lg:px-8 py-10 md:py-14">

          <AnimatePresence mode="wait">

            {/* Error */}
            {error && (
              <motion.div
                key="error"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="flex items-start gap-4 p-5 bg-red-50 border border-red-200 rounded-2xl"
              >
                <AlertCircle className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold text-red-700 mb-1">Pedido não encontrado</p>
                  <p className="text-[13px] text-red-600">{error}</p>
                  <p className="text-[12px] text-red-500 mt-2">
                    Dúvidas? Entre em contato pelo{' '}
                    <a href="https://api.whatsapp.com/send?phone=554332941144" className="underline font-medium">
                      WhatsApp (43) 3294-1144
                    </a>
                  </p>
                </div>
              </motion.div>
            )}

            {/* Order found */}
            {order && cfg && status && (
              <motion.div
                key="order"
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="space-y-6"
              >
                {/* Status card */}
                <div className={`rounded-2xl border p-5 flex items-start gap-4 ${cfg.bg}`}>
                  <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${isCancelled ? 'bg-slate-100' : 'bg-white shadow-sm'}`}>
                    <cfg.icon className={`w-5 h-5 ${cfg.color}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div>
                        <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest mb-0.5">Status do pedido</p>
                        <p className={`text-[18px] font-black ${cfg.color}`}>{cfg.label}</p>
                      </div>
                      <span className="font-mono text-[12px] font-bold text-muted-foreground bg-white/60 border border-white/80 px-3 py-1.5 rounded-lg">
                        #{order.orderId}
                      </span>
                    </div>
                    <p className="text-[12px] text-muted-foreground mt-1">
                      Pedido realizado em {fmtDate(order.createdAt || order.created_at)}
                    </p>
                  </div>
                </div>

                {/* Timeline */}
                {!isCancelled && (
                  <div className="bg-card border border-border rounded-2xl p-5">
                    <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest mb-5">
                      Acompanhamento
                    </p>
                    <div className="space-y-0">
                      {TIMELINE_STEPS.map((step, i) => {
                        const done    = i <= stepIndex;
                        const current = i === stepIndex;
                        const StepIcon = step.icon;
                        return (
                          <div key={step.key} className="flex gap-4 relative">
                            {/* Connector */}
                            {i < TIMELINE_STEPS.length - 1 && (
                              <div className={`absolute left-[19px] top-10 bottom-0 w-[2px] z-0 ${done && i < stepIndex ? 'bg-primary' : 'bg-border'}`} />
                            )}
                            {/* Dot */}
                            <div className={`relative z-10 w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 mb-4 transition-all ${
                              current ? 'bg-primary shadow-lg shadow-primary/30 scale-110'
                                : done ? 'bg-primary/15 border-2 border-primary'
                                : 'bg-secondary border border-border'
                            }`}>
                              <StepIcon className={`w-4.5 h-4.5 ${current || done ? 'text-primary' : 'text-muted-foreground'} ${current ? '!text-white' : ''}`} />
                            </div>
                            <div className="pt-2 pb-4 flex-1">
                              <p className={`font-semibold text-[13px] ${current ? 'text-foreground' : done ? 'text-foreground' : 'text-muted-foreground'}`}>
                                {step.label}
                                {current && (
                                  <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded-full bg-primary text-white text-[9px] font-black uppercase tracking-wider">
                                    Atual
                                  </span>
                                )}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Cancelled banner */}
                {isCancelled && (
                  <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 flex gap-4">
                    <XCircle className="w-5 h-5 text-slate-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="font-bold text-foreground mb-1">Pedido {status === 'refunded' ? 'estornado' : 'cancelado'}</p>
                      <p className="text-[13px] text-muted-foreground">
                        {status === 'refunded'
                          ? 'O valor foi estornado. O prazo de crédito depende da sua forma de pagamento.'
                          : 'Este pedido foi cancelado. Para reabrir ou tirar dúvidas, entre em contato com nosso SAC.'}
                      </p>
                    </div>
                  </div>
                )}

                {/* Tracking code */}
                {trackingCode && (
                  <div className="bg-card border border-border rounded-2xl p-5">
                    <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest mb-3">
                      Código de rastreio
                    </p>
                    <div className="flex items-center gap-3">
                      <div className="flex-1 bg-secondary rounded-xl px-4 py-2.5 font-mono font-bold text-[15px] text-foreground tracking-wider overflow-auto">
                        {trackingCode}
                      </div>
                      <button
                        onClick={() => copyTracking(trackingCode)}
                        className={`p-2.5 rounded-xl border transition-all ${copied ? 'bg-green-50 border-green-200 text-green-600' : 'border-border hover:bg-secondary text-muted-foreground'}`}
                        title="Copiar código"
                      >
                        {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                      </button>
                      <a
                        href={`https://rastreamento.correios.com.br/app/index.php/resultado?objetos=${trackingCode}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-primary text-white text-[13px] font-bold hover:bg-primary/90 transition-all flex-shrink-0"
                      >
                        Rastrear <ArrowRight className="w-3.5 h-3.5" />
                      </a>
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-2">
                      Transportadora: {order.shipping?.carrier || order.shipping?.name || order.payment_provider || '—'}
                    </p>
                  </div>
                )}

                {/* Order summary */}
                <div className="bg-card border border-border rounded-2xl p-5">
                  <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest mb-4">
                    Resumo do pedido
                  </p>

                  {/* Items */}
                  {order.items && order.items.length > 0 && (
                    <div className="space-y-3 mb-4 pb-4 border-b border-border">
                      {order.items.map((item, i) => (
                        <div key={i} className="flex items-center justify-between gap-3">
                          <div className="w-9 h-9 rounded-lg bg-secondary flex items-center justify-center flex-shrink-0">
                            <Package className="w-4 h-4 text-muted-foreground" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[13px] font-medium text-foreground line-clamp-1">
                              {item.name || item.description || item.id}
                            </p>
                            <p className="text-[11px] text-muted-foreground">Qtd: {item.quantity ?? 1}</p>
                          </div>
                          <span className="text-[13px] font-semibold text-foreground flex-shrink-0">
                            {item.price ? fmtBRL(item.price * (item.quantity ?? 1)) : '—'}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Totals */}
                  {order.totals && (
                    <div className="space-y-2 text-[13px]">
                      {order.totals.subtotal != null && (
                        <div className="flex justify-between text-muted-foreground">
                          <span>Subtotal</span>
                          <span>{fmtBRL(order.totals.subtotal)}</span>
                        </div>
                      )}
                      {order.totals.shipping != null && (
                        <div className="flex justify-between text-muted-foreground">
                          <span>Frete</span>
                          <span>{order.totals.shipping === 0 ? 'Grátis' : fmtBRL(order.totals.shipping)}</span>
                        </div>
                      )}
                      {order.totals.total != null && (
                        <div className="flex justify-between font-bold text-foreground text-[15px] pt-2 border-t border-border">
                          <span>Total</span>
                          <span>{fmtBRL(order.totals.total)}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Event log */}
                {order.events && order.events.length > 0 && (
                  <div className="bg-card border border-border rounded-2xl p-5">
                    <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest mb-4">
                      Histórico de eventos
                    </p>
                    <div className="space-y-3">
                      {[...order.events].reverse().map((ev, i) => (
                        <div key={i} className="flex gap-3 text-[12px]">
                          <div className="w-2 h-2 rounded-full bg-primary flex-shrink-0 mt-1.5" />
                          <div>
                            <p className="font-medium text-foreground">{ev.description || ev.eventType}</p>
                            <p className="text-muted-foreground">{fmtDate(ev.timestamp)}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Help */}
                <div className="flex flex-col sm:flex-row gap-3 p-4 bg-secondary rounded-2xl border border-border text-[13px]">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Phone className="w-4 h-4 text-primary" />
                    <span>Problema com seu pedido?</span>
                  </div>
                  <a
                    href={`https://api.whatsapp.com/send?phone=554332941144&text=Oi!%20Preciso%20de%20ajuda%20com%20o%20pedido%20${order.orderId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="sm:ml-auto flex items-center gap-1.5 font-bold text-primary hover:underline"
                  >
                    Falar com o SAC <ArrowRight className="w-3.5 h-3.5" />
                  </a>
                </div>
              </motion.div>
            )}

            {/* Empty state */}
            {!loading && !order && !error && (
              <motion.div
                key="empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="text-center py-10 space-y-6"
              >
                <div className="w-16 h-16 rounded-2xl bg-secondary flex items-center justify-center mx-auto">
                  <Package className="w-8 h-8 text-muted-foreground/50" />
                </div>
                <div>
                  <p className="font-bold text-foreground text-lg mb-2">Nenhum pedido buscado ainda</p>
                  <p className="text-muted-foreground text-[14px] max-w-sm mx-auto">
                    Digite o número do pedido no campo acima. Você encontra o número no e-mail de confirmação da compra.
                  </p>
                </div>

                {/* Divider */}
                <div className="max-w-xs mx-auto border-t border-border" />

                {/* Quick links */}
                <div>
                  <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest mb-4">
                    Informações úteis
                  </p>
                  <div className="grid sm:grid-cols-3 gap-3 max-w-lg mx-auto">
                    {[
                      { href: '/politica-de-entrega',  label: 'Política de Entrega',  icon: Truck },
                      { href: '/trocas-e-devolucoes',  label: 'Trocas e Devoluções',  icon: RefreshCw },
                      { href: '/minha-conta/pedidos',  label: 'Minha conta',           icon: ShoppingBag },
                    ].map(l => (
                      <Link
                        key={l.href}
                        to={l.href}
                        className="flex flex-col items-center gap-2 p-4 rounded-2xl border border-border hover:border-primary/30 hover:bg-primary/5 transition-all group"
                      >
                        <div className="w-9 h-9 rounded-xl bg-secondary flex items-center justify-center group-hover:bg-primary/10 transition-colors">
                          <l.icon className="w-4.5 h-4.5 text-muted-foreground group-hover:text-primary transition-colors" />
                        </div>
                        <span className="text-[12px] font-medium text-muted-foreground group-hover:text-foreground transition-colors text-center">
                          {l.label}
                        </span>
                      </Link>
                    ))}
                  </div>
                </div>
              </motion.div>
            )}

            {/* Loading */}
            {loading && (
              <motion.div
                key="loading"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex flex-col items-center py-16 gap-4"
              >
                <div className="w-12 h-12 border-3 border-primary/20 border-t-primary rounded-full animate-spin" />
                <p className="text-[14px] font-medium text-muted-foreground">Buscando pedido...</p>
              </motion.div>
            )}

          </AnimatePresence>
        </div>
      </div>
    </>
  );
}
