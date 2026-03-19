// ─── Order Detail Drawer — Detalhes + Timeline ───────────────────────────────

import React, { useState, useEffect, useCallback } from 'react';
import {
  X, User, Package, CreditCard, Truck, ExternalLink, Copy,
  Check, Loader2, AlertTriangle, CheckCircle2, Save, RefreshCw,
  MapPin, Mail, Phone, Hash, Info, Clock, Activity, Send,
  ChevronRight, XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { projectId, publicAnonKey } from '../../../../utils/supabase/info';

const API = `https://${projectId}.supabase.co/functions/v1/make-server-1d6e33e0`;
const H   = { Authorization: `Bearer ${publicAnonKey}`, 'Content-Type': 'application/json' };

// ─── Types ───────────────────────────────────────────────────────────────────

type PaymentStatus     = 'waiting_payment' | 'paid' | 'overdue' | 'canceled' | 'refunded';
type FulfillmentStatus = 'pending' | 'in_preparation' | 'shipped' | 'delivered' | 'canceled';

const FULFILLMENT_TRANSITIONS: Record<FulfillmentStatus, FulfillmentStatus[]> = {
  pending:        ['in_preparation', 'shipped', 'canceled'],
  in_preparation: ['shipped', 'canceled'],
  shipped:        ['delivered'],
  delivered:      [],
  canceled:       [],
};

const FULFILLMENT_LABELS: Record<FulfillmentStatus, string> = {
  pending:        'Pendente',
  in_preparation: 'Em Separação',
  shipped:        'Enviado',
  delivered:      'Entregue',
  canceled:       'Cancelado',
};

interface CarrierConfig {
  id: string; name: string; services: string;
  tracking_url: string; panel_url: string; hint: string; active: boolean;
}

interface Order {
  orderId: string;
  createdAt: string;
  payment_provider: string;
  payment_status: PaymentStatus;
  fulfillment_status: FulfillmentStatus;
  tracking_code?: string;
  tracking_url?: string;
  carrier_name?: string;
  carrier_id?: string;
  shipped_at?: string;
  delivered_at?: string;
  customer: { name: string; email: string; document?: string; phone?: string };
  address?: { street?: string; number?: string; complement?: string; district?: string; city?: string; state?: string; cep?: string };
  items?: Array<{ id?: string; description?: string; quantity?: number; price?: number; qty?: number; name?: string; unitPrice?: number }>;
  totals?: { total: number };
  shipping?: { carrier?: string; service?: string; estimatedDays?: number; price?: number };
  asaas_invoice_url?: string;
  vindi_url?: string;
  carrier_config?: CarrierConfig;
}

interface OrderEvent {
  id:          string;
  type:        string;
  occurred_at: string;
  source:      string;
  payload:     Record<string, unknown>;
}

interface Props {
  orderId: string | null;
  onClose: () => void;
  onUpdated?: () => void;
}

// ─── Status badges ────────────────────────────────────────────────────────────

function PaymentBadge({ status }: { status: PaymentStatus }) {
  const map: Record<PaymentStatus, { label: string; cls: string }> = {
    waiting_payment: { label: 'Aguardando',  cls: 'bg-amber-100 text-amber-700 border-amber-200' },
    paid:            { label: 'Pago',         cls: 'bg-green-100 text-green-700 border-green-200' },
    overdue:         { label: 'Vencido',      cls: 'bg-red-100 text-red-700 border-red-200' },
    canceled:        { label: 'Cancelado',    cls: 'bg-gray-100 text-gray-600 border-gray-200' },
    refunded:        { label: 'Reembolsado',  cls: 'bg-purple-100 text-purple-700 border-purple-200' },
  };
  const { label, cls } = map[status] ?? { label: status, cls: 'bg-gray-100 text-gray-600 border-gray-200' };
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${cls}`}>{label}</span>;
}

function FulfillmentBadge({ status }: { status: FulfillmentStatus }) {
  const map: Record<FulfillmentStatus, { label: string; cls: string }> = {
    pending:        { label: 'Pendente',     cls: 'bg-gray-100 text-gray-600 border-gray-200' },
    in_preparation: { label: 'Em Separação', cls: 'bg-blue-100 text-blue-700 border-blue-200' },
    shipped:        { label: 'Enviado',       cls: 'bg-indigo-100 text-indigo-700 border-indigo-200' },
    delivered:      { label: 'Entregue',      cls: 'bg-green-100 text-green-700 border-green-200' },
    canceled:       { label: 'Cancelado',     cls: 'bg-red-100 text-red-700 border-red-200' },
  };
  const { label, cls } = map[status] ?? { label: status, cls: 'bg-gray-100 text-gray-600 border-gray-200' };
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${cls}`}>{label}</span>;
}

// ─── Section Card ─────────────────────────────────────────────────────────────

function Section({ icon: Icon, title, children }: { icon: React.ElementType; title: string; children: React.ReactNode }) {
  return (
    <div className="bg-muted/30 rounded-xl border border-border overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 bg-muted/50 border-b border-border">
        <Icon className="w-4 h-4 text-primary" />
        <span className="text-xs font-semibold text-foreground uppercase tracking-wider">{title}</span>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

// ─── Timeline ────────────────────────────────────────────────────────────────

function getEventStyle(type: string): { Icon: React.ElementType; color: string; label: string } {
  const map: Record<string, { Icon: React.ElementType; color: string; label: string }> = {
    'order.created':              { Icon: Package,      color: 'text-blue-500 bg-blue-50 border-blue-200',      label: 'Pedido criado' },
    'payment.checkout_created':   { Icon: CreditCard,   color: 'text-purple-500 bg-purple-50 border-purple-200', label: 'Checkout criado' },
    'payment.webhook_received':   { Icon: Activity,     color: 'text-gray-500 bg-gray-50 border-gray-200',      label: 'Webhook recebido' },
    'payment.status_changed':     { Icon: CreditCard,   color: 'text-green-500 bg-green-50 border-green-200',   label: 'Status de pagamento' },
    'fulfillment.status_changed': { Icon: Truck,        color: 'text-indigo-500 bg-indigo-50 border-indigo-200', label: 'Status expedição' },
    'tracking.code_saved':        { Icon: Hash,         color: 'text-indigo-600 bg-indigo-50 border-indigo-200', label: 'Rastreio salvo' },
    'tracking.email_sent':        { Icon: Send,         color: 'text-green-600 bg-green-50 border-green-200',   label: 'E-mail enviado' },
    'tracking.email_failed':      { Icon: XCircle,      color: 'text-red-500 bg-red-50 border-red-200',         label: 'Falha no e-mail' },
    'order.delivered':            { Icon: CheckCircle2, color: 'text-green-600 bg-green-50 border-green-200',   label: 'Entregue' },
  };
  return map[type] ?? { Icon: Info, color: 'text-gray-400 bg-gray-50 border-gray-200', label: type.replace(/\./g, ' › ') };
}

function TimelineEvent({ event, isLast }: { event: OrderEvent; isLast: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const { Icon, color, label }  = getEventStyle(event.type);
  const hasPayload = Object.keys(event.payload || {}).length > 0;

  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center flex-shrink-0">
        <div className={`w-7 h-7 rounded-full border flex items-center justify-center flex-shrink-0 ${color}`}>
          <Icon className="w-3.5 h-3.5" />
        </div>
        {!isLast && <div className="w-px flex-1 bg-border/60 mt-1 mb-0" style={{ minHeight: '16px' }} />}
      </div>
      <div className={`flex-1 ${isLast ? 'pb-0' : 'pb-4'}`}>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold text-foreground">{label}</span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
              event.source === 'webhook'  ? 'bg-purple-50 text-purple-600' :
              event.source === 'admin_ui' ? 'bg-blue-50 text-blue-600' :
              'bg-gray-50 text-gray-500'
            }`}>
              {event.source}
            </span>
          </div>
          <span className="text-[10px] text-muted-foreground flex-shrink-0">
            {new Date(event.occurred_at).toLocaleString('pt-BR', {
              day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
            })}
          </span>
        </div>
        {hasPayload && (
          <button
            onClick={() => setExpanded(e => !e)}
            className="text-[10px] text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1 mt-0.5"
          >
            {expanded ? 'Ocultar detalhes' : 'Ver detalhes'}
            <ChevronRight className={`w-2.5 h-2.5 transition-transform ${expanded ? 'rotate-90' : ''}`} />
          </button>
        )}
        {expanded && (
          <pre className="mt-1.5 text-[10px] font-mono bg-muted/50 border border-border rounded-lg p-2 overflow-x-auto whitespace-pre-wrap text-foreground/70">
            {JSON.stringify(event.payload, null, 2)}
          </pre>
        )}
      </div>
    </div>
  );
}

function EventTimelineItem({ event, isLast }: { event: OrderEvent; isLast: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const { Icon, color, label }  = getEventStyle(event.type);
  const hasPayload = Object.keys(event.payload || {}).length > 0;

  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center flex-shrink-0">
        <div className={`w-7 h-7 rounded-full border flex items-center justify-center flex-shrink-0 ${color}`}>
          <Icon className="w-3.5 h-3.5" />
        </div>
        {!isLast && <div className="w-px flex-1 bg-border/60 mt-1 mb-0" style={{ minHeight: '16px' }} />}
      </div>
      <div className={`flex-1 ${isLast ? 'pb-0' : 'pb-4'}`}>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold text-foreground">{label}</span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
              event.source === 'webhook'  ? 'bg-purple-50 text-purple-600' :
              event.source === 'admin_ui' ? 'bg-blue-50 text-blue-600' :
              'bg-gray-50 text-gray-500'
            }`}>
              {event.source}
            </span>
          </div>
          <span className="text-[10px] text-muted-foreground flex-shrink-0">
            {new Date(event.occurred_at).toLocaleString('pt-BR', {
              day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
            })}
          </span>
        </div>
        {hasPayload && (
          <button
            onClick={() => setExpanded(e => !e)}
            className="text-[10px] text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1 mt-0.5"
          >
            {expanded ? 'Ocultar detalhes' : 'Ver detalhes'}
            <ChevronRight className={`w-2.5 h-2.5 transition-transform ${expanded ? 'rotate-90' : ''}`} />
          </button>
        )}
        {expanded && (
          <pre className="mt-1.5 text-[10px] font-mono bg-muted/50 border border-border rounded-lg p-2 overflow-x-auto whitespace-pre-wrap text-foreground/70">
            {JSON.stringify(event.payload, null, 2)}
          </pre>
        )}
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function OrderDetailDrawer({ orderId, onClose, onUpdated }: Props) {
  const [order, setOrder]               = useState<Order | null>(null);
  const [loading, setLoading]           = useState(false);
  const [carriers, setCarriers]         = useState<CarrierConfig[]>([]);
  const [trackingCode, setTrackingCode] = useState('');
  const [selectedCarrier, setSelectedCarrier] = useState('');
  const [targetStatus, setTargetStatus] = useState<FulfillmentStatus>('shipped');
  const [saving, setSaving]             = useState(false);
  const [copied, setCopied]             = useState(false);
  const [orderEvents, setOrderEvents]   = useState<OrderEvent[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [resending, setResending]       = useState(false);

  // Load order + carriers + events in parallel
  const load = useCallback(async () => {
    if (!orderId) return;
    setLoading(true);
    setLoadingEvents(true);
    try {
      const [orderRes, carriersRes, eventsRes] = await Promise.all([
        fetch(`${API}/orders/${orderId}`, { headers: H }),
        fetch(`${API}/carriers`, { headers: H }),
        fetch(`${API}/audit/order/${orderId}`, { headers: H }),
      ]);
      if (!orderRes.ok) throw new Error(`Pedido não encontrado (${orderRes.status})`);
      const { order: o } = await orderRes.json();
      setOrder(o);
      setTrackingCode(o.tracking_code || '');
      setSelectedCarrier(o.carrier_id || o.carrier_config?.id || '');
      setTargetStatus(o.fulfillment_status === 'shipped' ? 'delivered' : 'shipped');

      if (carriersRes.ok) {
        const { carriers: list } = await carriersRes.json();
        setCarriers(list || []);
      }

      if (eventsRes.ok) {
        const { events } = await eventsRes.json();
        setOrderEvents(events || []);
      }
    } catch (e: any) {
      console.error('[OrderDetailDrawer] load error:', e);
      toast.error('Erro ao carregar pedido: ' + e.message);
    } finally {
      setLoading(false);
      setLoadingEvents(false);
    }
  }, [orderId]);

  useEffect(() => { if (orderId) { load(); } }, [orderId, load]);
  useEffect(() => { if (!orderId) { setOrder(null); setOrderEvents([]); setTrackingCode(''); setSelectedCarrier(''); } }, [orderId]);

  if (!orderId) return null;

  const currentFulfillment = (order?.fulfillment_status ?? 'pending') as FulfillmentStatus;
  const allowedTransitions = FULFILLMENT_TRANSITIONS[currentFulfillment] ?? [];
  const isTerminal         = allowedTransitions.length === 0;
  const gatewayUrl         = order?.asaas_invoice_url || order?.vindi_url;
  const resolvedCarrier    = carriers.find(c => c.id === selectedCarrier) || order?.carrier_config || null;

  const fmtBRL  = (v?: number) => v != null ? v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '—';
  const fmtDate = (d?: string) => d ? new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

  const handleSaveTracking = async () => {
    if (!trackingCode.trim()) { toast.error('Informe o código de rastreio'); return; }
    setSaving(true);
    try {
      const res  = await fetch(`${API}/orders/${orderId}/tracking`, {
        method: 'PATCH', headers: H,
        body: JSON.stringify({ tracking_code: trackingCode.trim(), carrier_id: selectedCarrier || null, fulfillment_status: targetStatus }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Erro ao salvar rastreio');
      toast.success(data.email_sent ? 'Rastreio salvo e e-mail enviado!' : `Rastreio salvo. E-mail: ${data.email_error || 'não enviado.'}`, { duration: 5000 });
      await load(); onUpdated?.();
    } catch (e: any) { toast.error('Erro: ' + e.message); } finally { setSaving(false); }
  };

  const handleStatusChange = async (s: FulfillmentStatus) => {
    setSaving(true);
    try {
      const res  = await fetch(`${API}/orders/${orderId}/fulfillment`, {
        method: 'PATCH', headers: H, body: JSON.stringify({ fulfillment_status: s }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Erro');
      toast.success(`Status: ${FULFILLMENT_LABELS[s]}`);
      await load(); onUpdated?.();
    } catch (e: any) { toast.error(e.message); } finally { setSaving(false); }
  };

  const copyId = () => { navigator.clipboard.writeText(orderId); setCopied(true); setTimeout(() => setCopied(false), 1500); };

  // ── Resend shipping email ────────────────────────────────────────────────
  const handleResendEmail = async () => {
    setResending(true);
    try {
      const res = await fetch(`${API}/orders/${orderId}/resend-email`, {
        method: 'POST',
        headers: H,
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (data.email_sent) {
        toast.success('E-mail de rastreio reenviado com sucesso!');
      } else {
        toast.error(`Falha no reenvio: ${data.email_error || 'Erro desconhecido'}`);
      }
      await load();
    } catch (e: any) {
      toast.error('Erro ao reenviar: ' + e.message);
    } finally {
      setResending(false);
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/30 z-40 backdrop-blur-sm" onClick={onClose} />

      {/* Drawer */}
      <div className="fixed right-0 top-0 h-full w-full max-w-[560px] bg-background z-50 shadow-2xl flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border bg-card flex-shrink-0">
          <div className="flex items-center gap-3">
            <Package className="w-5 h-5 text-primary" />
            <div>
              <h2 className="text-sm font-bold text-foreground">Detalhe do Pedido</h2>
              <button onClick={copyId} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors group">
                <span className="font-mono">{orderId.slice(0, 8).toUpperCase()}</span>
                {copied ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3 opacity-0 group-hover:opacity-100" />}
              </button>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={load} disabled={loading} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
              <RefreshCw className={`w-4 h-4 text-muted-foreground ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
              <X className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-24">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : !order ? (
            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
              <AlertTriangle className="w-10 h-10 mb-3 text-destructive/50" />
              <p className="text-sm font-medium">Pedido não encontrado</p>
            </div>
          ) : (
            /* ── DETAILS ── */
            <div className="p-5 space-y-4">
              {/* Status row */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-muted-foreground">Pagamento:</span>
                <PaymentBadge status={order.payment_status} />
                <span className="text-muted-foreground/30">·</span>
                <span className="text-xs text-muted-foreground">Expedição:</span>
                <FulfillmentBadge status={order.fulfillment_status} />
                <span className="text-muted-foreground/30">·</span>
                <span className="text-xs font-mono bg-muted px-2 py-0.5 rounded text-muted-foreground uppercase">{order.payment_provider}</span>
                <span className="text-xs text-muted-foreground ml-auto">{fmtDate(order.createdAt)}</span>
              </div>

              {/* 1. Customer */}
              <Section icon={User} title="Cliente">
                <div className="space-y-2 text-sm">
                  <div className="flex items-start gap-2">
                    <User className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                    <span className="font-semibold text-foreground">{order.customer.name}</span>
                  </div>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Mail className="w-4 h-4 flex-shrink-0" />
                    <a href={`mailto:${order.customer.email}`} className="hover:text-primary transition-colors">{order.customer.email}</a>
                  </div>
                  {order.customer.phone && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Phone className="w-4 h-4 flex-shrink-0" />
                      <span>{order.customer.phone}</span>
                    </div>
                  )}
                  {order.customer.document && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Hash className="w-4 h-4 flex-shrink-0" />
                      <span className="font-mono">{order.customer.document}</span>
                    </div>
                  )}
                  {order.address?.street && (
                    <div className="flex items-start gap-2 text-muted-foreground">
                      <MapPin className="w-4 h-4 flex-shrink-0 mt-0.5" />
                      <span>
                        {order.address.street}, {order.address.number}
                        {order.address.complement ? `, ${order.address.complement}` : ''}
                        {' — '}{order.address.district}, {order.address.city}/{order.address.state}
                        {order.address.cep ? ` · CEP ${order.address.cep}` : ''}
                      </span>
                    </div>
                  )}
                </div>
              </Section>

              {/* 2. Items */}
              <Section icon={Package} title={`Itens (${order.items?.length ?? 0})`}>
                <div className="space-y-2">
                  {(order.items ?? []).map((item, i) => {
                    const name  = item.description || item.name || item.id || `Item ${i + 1}`;
                    const qty   = item.quantity ?? item.qty ?? 1;
                    const price = item.price ?? item.unitPrice ?? 0;
                    return (
                      <div key={i} className="flex justify-between text-sm">
                        <span className="text-foreground truncate mr-2">{qty}× {name}</span>
                        <span className="font-semibold text-foreground flex-shrink-0">{fmtBRL(price * qty)}</span>
                      </div>
                    );
                  })}
                  {order.shipping?.price != null && order.shipping.price > 0 && (
                    <div className="flex justify-between text-sm text-muted-foreground border-t border-border pt-2 mt-2">
                      <span>Frete ({order.shipping.carrier})</span>
                      <span>{fmtBRL(order.shipping.price)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-sm font-bold text-foreground border-t border-border pt-2 mt-2">
                    <span>Total</span>
                    <span className="text-primary">{fmtBRL(order.totals?.total)}</span>
                  </div>
                </div>
              </Section>

              {/* 3. Payment */}
              <Section icon={CreditCard} title="Pagamento">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Status</p>
                      <PaymentBadge status={order.payment_status} />
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground mb-1">Gateway</p>
                      <span className="text-xs font-semibold bg-muted px-2 py-0.5 rounded uppercase tracking-wide">{order.payment_provider}</span>
                    </div>
                  </div>
                  {gatewayUrl && (
                    <a href={gatewayUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-xs text-primary hover:underline font-medium">
                      <ExternalLink className="w-3.5 h-3.5" />
                      Ver cobrança no {order.payment_provider === 'vindi' ? 'Vindi' : 'Asaas'}
                    </a>
                  )}
                </div>
              </Section>

              {/* 4. Fulfillment / Tracking */}
              <Section icon={Truck} title="Expedição & Rastreio">
                {isTerminal ? (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      {order.fulfillment_status === 'delivered' ? (
                        <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />
                      ) : (
                        <X className="w-4 h-4 text-muted-foreground/50 flex-shrink-0" />
                      )}
                      <span>
                        {order.fulfillment_status === 'delivered'
                          ? `Entregue em ${fmtDate(order.delivered_at)}`
                          : 'Pedido cancelado'}
                      </span>
                    </div>
                    {/* Allow resend even for delivered orders */}
                    {order.tracking_code && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleResendEmail}
                        disabled={resending}
                        className="gap-2 w-full"
                      >
                        {resending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                        Reenviar e-mail de rastreio
                      </Button>
                    )}
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* Carrier detection */}
                    {order.shipping?.carrier && (
                      <div className="bg-blue-50 border border-blue-100 rounded-lg p-3">
                        <p className="text-xs font-semibold text-blue-800 mb-1">Transportadora do pedido</p>
                        <p className="text-sm text-blue-900">
                          {order.shipping.carrier}
                          {order.shipping.service ? ` · ${order.shipping.service}` : ''}
                          {order.shipping.estimatedDays ? ` · ${order.shipping.estimatedDays} dias` : ''}
                        </p>
                        {resolvedCarrier && (
                          <p className="text-xs text-blue-600 mt-1">
                            Configuração encontrada: <strong>{resolvedCarrier.name}</strong>
                          </p>
                        )}
                      </div>
                    )}

                    {/* Carrier selector + panel link */}
                    <div>
                      <Label className="text-xs font-semibold text-muted-foreground mb-1.5 block">
                        Transportadora
                      </Label>
                      <div className="flex gap-2">
                        <select
                          value={selectedCarrier}
                          onChange={e => setSelectedCarrier(e.target.value)}
                          className="flex-1 h-9 rounded-lg border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                        >
                          <option value="">Detectar automaticamente</option>
                          {carriers.filter(c => c.active).map(c => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                          ))}
                        </select>
                        {resolvedCarrier?.panel_url && (
                          <a
                            href={resolvedCarrier.panel_url}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <Button variant="outline" size="sm" className="h-9 gap-1.5 whitespace-nowrap">
                              <ExternalLink className="w-3.5 h-3.5" />
                              Abrir painel
                            </Button>
                          </a>
                        )}
                      </div>
                      {resolvedCarrier?.hint && (
                        <div className="flex items-start gap-1.5 mt-2">
                          <Info className="w-3.5 h-3.5 text-muted-foreground/70 flex-shrink-0 mt-0.5" />
                          <p className="text-xs text-muted-foreground">{resolvedCarrier.hint}</p>
                        </div>
                      )}
                    </div>

                    {/* Tracking code */}
                    <div>
                      <Label className="text-xs font-semibold text-muted-foreground mb-1.5 block">
                        Código de Rastreio
                      </Label>
                      <Input
                        value={trackingCode}
                        onChange={e => setTrackingCode(e.target.value.toUpperCase())}
                        placeholder="Ex: AA123456789BR"
                        className="h-9 font-mono uppercase"
                      />
                      {order.tracking_code && (
                        <div className="flex items-center gap-2 mt-1.5">
                          <p className="text-xs text-muted-foreground">
                            Atual: <span className="font-mono text-foreground">{order.tracking_code}</span>
                          </p>
                          {order.tracking_url && (
                            <a
                              href={order.tracking_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-primary hover:underline flex items-center gap-1"
                            >
                              <ExternalLink className="w-3 h-3" />
                              Rastrear
                            </a>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Target fulfillment status */}
                    <div>
                      <Label className="text-xs font-semibold text-muted-foreground mb-1.5 block">
                        Novo status de expedição
                      </Label>
                      <select
                        value={targetStatus}
                        onChange={e => setTargetStatus(e.target.value as FulfillmentStatus)}
                        className="w-full h-9 rounded-lg border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                      >
                        {allowedTransitions.map(s => (
                          <option key={s} value={s}>{FULFILLMENT_LABELS[s]}</option>
                        ))}
                      </select>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2 pt-1">
                      <Button
                        onClick={handleSaveTracking}
                        disabled={saving || !trackingCode.trim()}
                        className="flex-1 gap-2"
                      >
                        {saving ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Save className="w-4 h-4" />
                        )}
                        Salvar e notificar cliente
                      </Button>

                      {allowedTransitions.length > 0 && !trackingCode.trim() && (
                        <Button
                          variant="outline"
                          onClick={() => handleStatusChange(allowedTransitions[0])}
                          disabled={saving}
                          className="gap-2"
                          title="Mudar status sem código de rastreio"
                        >
                          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                          Só status
                        </Button>
                      )}
                    </div>

                    {/* Resend email (if tracking already set) */}
                    {order.tracking_code && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleResendEmail}
                        disabled={resending}
                        className="gap-2 w-full text-muted-foreground hover:text-foreground"
                      >
                        {resending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                        Reenviar e-mail de rastreio
                      </Button>
                    )}

                    <p className="text-xs text-muted-foreground text-center">
                      O rastreio é salvo primeiro. O e-mail é enviado na sequência e não bloqueia a operação caso falhe.
                    </p>
                  </div>
                )}
              </Section>

              {/* 5. Histórico de Eventos */}
              <Section icon={Activity} title="Histórico do Pedido">
                {loadingEvents ? (
                  <div className="flex items-center justify-center py-6">
                    <Loader2 className="w-5 h-5 animate-spin text-primary" />
                  </div>
                ) : orderEvents.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-3 text-center">
                    Nenhum evento registrado para este pedido.
                  </p>
                ) : (
                  <div className="relative">
                    {/* Timeline line */}
                    <div className="absolute left-[7px] top-2 bottom-2 w-px bg-border" />
                    <div className="space-y-3 pl-6">
                      {orderEvents.map((evt, i) => (
                        <EventTimelineItem key={evt.id} event={evt} isLast={i === orderEvents.length - 1} />
                      ))}
                    </div>
                  </div>
                )}
              </Section>
            </div>
          )}
        </div>
      </div>
    </>
  );
}