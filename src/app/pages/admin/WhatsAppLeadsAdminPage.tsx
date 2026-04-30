import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ClipboardCheck,
  Link2,
  Loader2,
  MessageCircle,
  RefreshCw,
  Search,
  ShoppingBag,
  Sparkles,
} from 'lucide-react';
import { toast } from 'sonner';
import { projectId } from '../../../../utils/supabase/info';
import { adminFetch } from '../../lib/admin-auth';
import { Card } from '../../components/base/card';
import { Button } from '../../components/base/button';

const API = `https://${projectId}.supabase.co/functions/v1/make-server-1d6e33e0`;

function toLocalDateTimeValue(date = new Date()) {
  const offsetMs = date.getTimezoneOffset() * 60 * 1000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

interface LeadRecord {
  lead_id: string;
  clicked_at: string;
  last_clicked_at: string;
  sku: string | null;
  message_text: string | null;
  source_surface: string | null;
  resolved_value: number | null;
  status: string;
  matched_order_id: string | null;
  click_count: number;
  score_band: string;
  product_price: number | null;
  cart_total: number | null;
  checkout_total: number | null;
}

interface PendingOrder {
  orderId: string;
  customer: { name?: string; email?: string };
  totals?: { total?: number };
  whatsapp_sale_context?: { message_text?: string | null; source_surface?: string | null };
  items?: Array<{ sku?: string; id?: string; name?: string; description?: string }>;
  paid_at?: string;
}

interface CandidateMatch {
  lead_id: string;
  score: number;
  confidence: string;
  reasons: string[];
  lead: LeadRecord;
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
}: {
  label: string;
  value: string | number;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <label className="space-y-2">
      <span className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none transition focus:border-primary/40 focus:ring-4 focus:ring-primary/10"
      />
    </label>
  );
}

function StatusPill({ status }: { status: string }) {
  const tone =
    status === 'won'
      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
      : status === 'sent'
      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
      : status === 'high_intent'
      ? 'bg-sky-50 text-sky-700 border-sky-200'
      : status === 'qualified'
      ? 'bg-amber-50 text-amber-700 border-amber-200'
      : status === 'pending'
      ? 'bg-amber-50 text-amber-700 border-amber-200'
      : status === 'linked'
      ? 'bg-violet-50 text-violet-700 border-violet-200'
      : status === 'failed' || status === 'dead_letter'
      ? 'bg-rose-50 text-rose-700 border-rose-200'
      : 'bg-slate-100 text-slate-700 border-slate-200';
  return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${tone}`}>{status}</span>;
}

function fmtMoney(value: number | null | undefined) {
  return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function WhatsAppLeadsAdminPage() {
  const manualSaleFormRef = useRef<HTMLDivElement | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [payload, setPayload] = useState<any>(null);
  const [candidates, setCandidates] = useState<CandidateMatch[]>([]);
  const [orderMatch, setOrderMatch] = useState<{ orderId: string; candidates: CandidateMatch[] } | null>(null);
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [saleDraft, setSaleDraft] = useState({
    order_id: '',
    sale_time: toLocalDateTimeValue(),
    paid_at: toLocalDateTimeValue(),
    sku: '',
    item_name: '',
    quantity: '1',
    unit_price: '',
    total: '',
    message_text: '',
    source_surface: 'checkout_shipping_offer',
    customer_name: '',
    customer_email: '',
    customer_phone: '',
    transaction_id: '',
  });

  const primeManualSaleFromLead = useCallback((lead: LeadRecord) => {
    const leadTime = lead.last_clicked_at || lead.clicked_at || new Date().toISOString();
    const leadDate = new Date(leadTime);
    const parsedLeadTime = Number.isNaN(leadDate.getTime()) ? new Date() : leadDate;
    const sku = String(lead.sku || '').trim();
    const fallbackItemName = sku ? `Venda WhatsApp ${sku}` : 'Venda WhatsApp';
    const sourceSurface = String(lead.source_surface || '').trim() || 'checkout_shipping_offer';
    const messageText = String(lead.message_text || '').trim();

    setSelectedLeadId(lead.lead_id);
    setCandidates([]);
    setSaleDraft((current) => ({
      ...current,
      order_id: '',
      sale_time: toLocalDateTimeValue(parsedLeadTime),
      paid_at: toLocalDateTimeValue(new Date()),
      sku,
      item_name: fallbackItemName,
      quantity: '1',
      unit_price: '',
      total: '',
      message_text: messageText,
      source_surface: sourceSurface,
      transaction_id: `WA-${lead.lead_id}`,
    }));

    manualSaleFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    toast.success(`Lead ${lead.lead_id} carregado no formulário. Preencha apenas o total e salve.`);
  }, []);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await adminFetch(`${API}/admin/whatsapp-leads?search=${encodeURIComponent(search)}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || 'Falha ao carregar WhatsApp Leads.');
      setPayload(data);
    } catch (nextError: any) {
      setError(nextError?.message || 'Falha ao carregar WhatsApp Leads.');
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const suggestCandidates = useCallback(async () => {
    setBusyAction('suggest');
    setError(null);
    try {
      const params = new URLSearchParams({
        sale_time: saleDraft.sale_time,
        paid_at: saleDraft.paid_at,
        sku: saleDraft.sku,
        item_name: saleDraft.item_name,
        quantity: saleDraft.quantity,
        total: saleDraft.total,
        message_text: saleDraft.message_text,
        source_surface: saleDraft.source_surface,
      });
      const response = await adminFetch(`${API}/admin/whatsapp-leads/match-candidates?${params.toString()}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || 'Falha ao sugerir leads.');
      setCandidates(data.candidates || []);
      setSelectedLeadId(data.candidates?.[0]?.lead_id || null);
      toast.success(`${data.candidates?.length || 0} candidato(s) encontrado(s).`);
    } catch (nextError: any) {
      setError(nextError?.message || 'Falha ao sugerir leads.');
    } finally {
      setBusyAction(null);
    }
  }, [saleDraft]);

  const handleCreateSale = useCallback(async () => {
    setBusyAction('create');
    setError(null);
    try {
      const response = await adminFetch(`${API}/admin/whatsapp-leads/manual-sale`, {
        method: 'POST',
        body: JSON.stringify({
          ...saleDraft,
          lead_id: selectedLeadId,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || 'Falha ao registrar venda manual.');
      toast.success(`Venda manual ${data.order?.orderId || ''} salva.`);
      setCandidates(data.candidates || []);
      await loadAll();
    } catch (nextError: any) {
      setError(nextError?.message || 'Falha ao registrar venda manual.');
    } finally {
      setBusyAction(null);
    }
  }, [loadAll, saleDraft, selectedLeadId]);

  const suggestForPendingOrder = useCallback(async (order: PendingOrder) => {
    setBusyAction(`pending:${order.orderId}`);
    setError(null);
    try {
      const firstItem = order.items?.[0] || {};
      const params = new URLSearchParams({
        sale_time: order.paid_at || new Date().toISOString(),
        paid_at: order.paid_at || new Date().toISOString(),
        sku: String(firstItem.sku || firstItem.id || ''),
        item_name: String(firstItem.name || firstItem.description || ''),
        total: String(order.totals?.total || 0),
        message_text: String(order.whatsapp_sale_context?.message_text || ''),
        source_surface: String(order.whatsapp_sale_context?.source_surface || ''),
      });
      const response = await adminFetch(`${API}/admin/whatsapp-leads/match-candidates?${params.toString()}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || 'Falha ao sugerir leads para o pedido.');
      setOrderMatch({
        orderId: order.orderId,
        candidates: data.candidates || [],
      });
      toast.success(`${data.candidates?.length || 0} candidato(s) sugerido(s) para ${order.orderId}.`);
    } catch (nextError: any) {
      setError(nextError?.message || 'Falha ao sugerir leads para o pedido.');
    } finally {
      setBusyAction(null);
    }
  }, []);

  const linkPendingOrder = useCallback(async (leadId: string, orderId: string) => {
    setBusyAction(`link:${orderId}:${leadId}`);
    setError(null);
    try {
      const response = await adminFetch(`${API}/admin/whatsapp-leads/${leadId}/link-order`, {
        method: 'POST',
        body: JSON.stringify({ order_id: orderId }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || 'Falha ao vincular lead ao pedido.');
      toast.success(`Lead ${leadId} vinculado ao pedido ${orderId}.`);
      setOrderMatch(null);
      await loadAll();
    } catch (nextError: any) {
      setError(nextError?.message || 'Falha ao vincular lead ao pedido.');
    } finally {
      setBusyAction(null);
    }
  }, [loadAll]);

  const stats = useMemo(() => payload?.stats || {}, [payload]);

  return (
    <div className="max-w-[1440px] mx-auto px-4 lg:px-6 pt-6 pb-12 space-y-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <h1 className="flex items-center gap-3 text-2xl font-bold tracking-tight text-foreground">
            <div className="rounded-2xl bg-primary/10 p-2.5">
              <MessageCircle className="h-5 w-5 text-primary" />
            </div>
            WhatsApp Leads
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Operacao manual assistida para ligar clique, lead, pedido e futura conversao offline.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative min-w-[260px]">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar por SKU, lead ou mensagem..."
              className="h-10 w-full rounded-xl border border-border bg-background pl-9 pr-3 text-sm outline-none transition focus:border-primary/40 focus:ring-4 focus:ring-primary/10"
            />
          </div>
          <Button color="secondary" size="sm" iconLeading={<RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />} onClick={() => loadAll()}>
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

      {loading && !payload ? (
        <div className="flex h-72 items-center justify-center">
          <div className="flex flex-col items-center gap-3 text-muted-foreground">
            <Loader2 className="h-8 w-8 animate-spin" />
            <span className="text-sm font-medium">Carregando WhatsApp Leads...</span>
          </div>
        </div>
      ) : null}

      {payload ? (
        <>
          <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
            {[
              ['Total', stats.total],
              ['Sem vinculo', stats.unlinked],
              ['Qualified', stats.qualified],
              ['High intent', stats.high_intent],
              ['Won', stats.won],
              ['Clicked', stats.clicked],
            ].map(([label, value]) => (
              <Card.Root key={String(label)}>
                <Card.Content className="space-y-2 p-5">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
                  <p className="text-2xl font-bold tracking-tight text-foreground">{Number(value || 0).toLocaleString('pt-BR')}</p>
                </Card.Content>
              </Card.Root>
            ))}
          </div>

          <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
            <Card.Root>
              <Card.Header>
                <Card.Title className="text-sm">Leads recentes</Card.Title>
              </Card.Header>
              <Card.Content className="space-y-3">
                {payload.leads?.length ? payload.leads.slice(0, 24).map((lead: LeadRecord) => (
                  <div key={lead.lead_id} className="rounded-2xl border border-border p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-foreground">{lead.sku || 'Sem SKU'} <span className="text-xs font-normal text-muted-foreground">#{lead.lead_id}</span></p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {lead.source_surface || 'surface n/a'} | {lead.click_count} clique(s) | {lead.last_clicked_at ? new Date(lead.last_clicked_at).toLocaleString('pt-BR') : 'sem horario'}
                        </p>
                        <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                          {lead.checkout_total ? <span className="rounded-full border border-border px-2 py-0.5">checkout {fmtMoney(lead.checkout_total)}</span> : null}
                          {lead.cart_total ? <span className="rounded-full border border-border px-2 py-0.5">carrinho {fmtMoney(lead.cart_total)}</span> : null}
                          {lead.product_price ? <span className="rounded-full border border-border px-2 py-0.5">produto {fmtMoney(lead.product_price)}</span> : null}
                        </div>
                        {lead.message_text ? <p className="mt-2 text-xs text-foreground/80">{lead.message_text}</p> : null}
                      </div>
                      <div className="space-y-2 text-right">
                        <StatusPill status={lead.status} />
                        <p className="text-xs text-muted-foreground">{fmtMoney(lead.resolved_value)}</p>
                        {lead.matched_order_id ? <p className="text-[11px] font-semibold text-emerald-700">Pedido {lead.matched_order_id}</p> : null}
                        <Button
                          size="xs"
                          color={selectedLeadId === lead.lead_id ? 'primary' : 'secondary'}
                          iconLeading={<ClipboardCheck className="h-3.5 w-3.5" />}
                          onClick={() => primeManualSaleFromLead(lead)}
                        >
                          {selectedLeadId === lead.lead_id ? 'Lead selecionado' : 'Usar no formulario'}
                        </Button>
                      </div>
                    </div>
                  </div>
                )) : (
                  <p className="text-sm text-muted-foreground">Nenhum lead encontrado.</p>
                )}
              </Card.Content>
            </Card.Root>

            <Card.Root ref={manualSaleFormRef}>
              <Card.Header>
                <Card.Title className="text-sm">Registrar venda manual</Card.Title>
              </Card.Header>
              <Card.Content className="space-y-4">
                {selectedLeadId ? (
                  <div className="rounded-xl border border-primary/20 bg-primary/5 px-3 py-2 text-xs text-primary">
                    Lead selecionado: <span className="font-semibold">{selectedLeadId}</span>. Revise os dados e preencha o <span className="font-semibold">Total</span>.
                  </div>
                ) : null}
                <div className="grid gap-4 md:grid-cols-2">
                  <Field label="Order ID (opcional)" value={saleDraft.order_id} onChange={(value) => setSaleDraft((current) => ({ ...current, order_id: value }))} />
                  <Field label="Transaction ID" value={saleDraft.transaction_id} onChange={(value) => setSaleDraft((current) => ({ ...current, transaction_id: value }))} />
                  <Field label="Horario da venda" type="datetime-local" value={saleDraft.sale_time} onChange={(value) => setSaleDraft((current) => ({ ...current, sale_time: value }))} />
                  <Field label="Pago em" type="datetime-local" value={saleDraft.paid_at} onChange={(value) => setSaleDraft((current) => ({ ...current, paid_at: value }))} />
                  <Field label="SKU" value={saleDraft.sku} onChange={(value) => setSaleDraft((current) => ({ ...current, sku: value }))} />
                  <Field label="Item" value={saleDraft.item_name} onChange={(value) => setSaleDraft((current) => ({ ...current, item_name: value }))} />
                  <Field label="Quantidade" type="number" value={saleDraft.quantity} onChange={(value) => setSaleDraft((current) => ({ ...current, quantity: value }))} />
                  <Field label="Total (preencher manualmente)" type="number" value={saleDraft.total} onChange={(value) => setSaleDraft((current) => ({ ...current, total: value }))} />
                  <Field label="Cliente" value={saleDraft.customer_name} onChange={(value) => setSaleDraft((current) => ({ ...current, customer_name: value }))} />
                  <Field label="Email" value={saleDraft.customer_email} onChange={(value) => setSaleDraft((current) => ({ ...current, customer_email: value }))} />
                  <Field label="Telefone" value={saleDraft.customer_phone} onChange={(value) => setSaleDraft((current) => ({ ...current, customer_phone: value }))} />
                  <Field label="Source Surface" value={saleDraft.source_surface} onChange={(value) => setSaleDraft((current) => ({ ...current, source_surface: value }))} />
                </div>

                <label className="space-y-2">
                  <span className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Mensagem</span>
                  <textarea
                    value={saleDraft.message_text}
                    onChange={(event) => setSaleDraft((current) => ({ ...current, message_text: event.target.value }))}
                    rows={4}
                    className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none transition focus:border-primary/40 focus:ring-4 focus:ring-primary/10"
                  />
                </label>

                <div className="flex flex-wrap gap-2">
                  <Button color="secondary" size="sm" iconLeading={busyAction === 'suggest' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} onClick={suggestCandidates}>
                    Sugerir leads
                  </Button>
                  <Button size="sm" iconLeading={busyAction === 'create' ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShoppingBag className="h-4 w-4" />} onClick={handleCreateSale}>
                    Salvar venda manual
                  </Button>
                </div>

                <div className="space-y-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Candidatos para a venda</p>
                  {candidates.length ? candidates.map((candidate) => (
                    <button
                      key={candidate.lead_id}
                      onClick={() => setSelectedLeadId(candidate.lead_id)}
                      className={`w-full rounded-2xl border p-4 text-left transition ${selectedLeadId === candidate.lead_id ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/30'}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-foreground">{candidate.lead.sku || 'Sem SKU'} <span className="text-xs font-normal text-muted-foreground">score {candidate.score}</span></p>
                          <p className="mt-1 text-xs text-muted-foreground">{candidate.reasons.join(' | ')}</p>
                          {candidate.lead.message_text ? <p className="mt-2 text-xs text-foreground/80">{candidate.lead.message_text}</p> : null}
                        </div>
                        <div className="space-y-2 text-right">
                          <StatusPill status={candidate.lead.status} />
                          {selectedLeadId === candidate.lead_id ? <CheckCircle2 className="ml-auto h-4 w-4 text-primary" /> : null}
                        </div>
                      </div>
                    </button>
                  )) : (
                    <p className="text-sm text-muted-foreground">Ainda sem sugestoes para esta venda.</p>
                  )}
                </div>
              </Card.Content>
            </Card.Root>
          </div>

          <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
            <Card.Root>
              <Card.Header>
                <Card.Title className="text-sm">Fechamentos pendentes</Card.Title>
              </Card.Header>
              <Card.Content className="space-y-3">
                {payload.pending_orders?.length ? payload.pending_orders.map((order: PendingOrder) => (
                  <div key={order.orderId} className="rounded-2xl border border-border p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-foreground">{order.orderId}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {order.customer?.name || 'Cliente WhatsApp'} | {fmtMoney(order.totals?.total)}
                        </p>
                        {order.whatsapp_sale_context?.message_text ? (
                          <p className="mt-2 text-xs text-foreground/80">{order.whatsapp_sale_context.message_text}</p>
                        ) : null}
                      </div>
                      <Button
                        color="secondary"
                        size="sm"
                        iconLeading={busyAction === `pending:${order.orderId}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                        onClick={() => suggestForPendingOrder(order)}
                      >
                        Buscar leads
                      </Button>
                    </div>
                  </div>
                )) : (
                  <p className="text-sm text-muted-foreground">Nenhum fechamento pendente de vinculo.</p>
                )}
              </Card.Content>
            </Card.Root>

            <Card.Root>
              <Card.Header>
                <Card.Title className="text-sm">Sugestoes para pedido pendente</Card.Title>
              </Card.Header>
              <Card.Content className="space-y-3">
                {orderMatch ? orderMatch.candidates.length ? orderMatch.candidates.map((candidate) => (
                  <div key={`${orderMatch.orderId}:${candidate.lead_id}`} className="rounded-2xl border border-border p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-foreground">{candidate.lead.sku || 'Sem SKU'} <span className="text-xs font-normal text-muted-foreground">score {candidate.score}</span></p>
                        <p className="mt-1 text-xs text-muted-foreground">{candidate.reasons.join(' | ')}</p>
                        {candidate.lead.message_text ? <p className="mt-2 text-xs text-foreground/80">{candidate.lead.message_text}</p> : null}
                      </div>
                      <Button
                        size="sm"
                        iconLeading={busyAction === `link:${orderMatch.orderId}:${candidate.lead_id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
                        onClick={() => linkPendingOrder(candidate.lead_id, orderMatch.orderId)}
                      >
                        Vincular
                      </Button>
                    </div>
                  </div>
                )) : (
                  <p className="text-sm text-muted-foreground">Nenhum candidato forte para o pedido {orderMatch.orderId}.</p>
                ) : (
                  <p className="text-sm text-muted-foreground">Escolha um fechamento pendente para ver os candidatos mais provaveis.</p>
                )}
              </Card.Content>
            </Card.Root>
          </div>

          <Card.Root>
            <Card.Header>
              <Card.Title className="text-sm">Conversoes prontas para upload</Card.Title>
            </Card.Header>
            <Card.Content className="space-y-3">
              {payload.offline_ready?.length ? payload.offline_ready.map((job: any) => (
                <div key={job.job_id} className="rounded-2xl border border-border p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-foreground">{job.order_id}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {job.click_id_type}: {job.click_id_value} | status {job.status}
                      </p>
                      {job.last_error ? <p className="mt-1 text-xs text-rose-600">{job.last_error}</p> : null}
                    </div>
                    <StatusPill status={job.status} />
                  </div>
                </div>
              )) : (
                <p className="text-sm text-muted-foreground">Nenhuma conversao offline pronta agora.</p>
              )}
            </Card.Content>
          </Card.Root>
        </>
      ) : null}
    </div>
  );
}
