import React, { useState, useEffect, useCallback } from 'react';
import {
  AreaChart, Area, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import {
  ShoppingBag, TrendingUp, Clock, Truck, CreditCard,
  RefreshCw, ArrowUpRight, ArrowDownRight,
  Package, DollarSign, BarChart3, Search, Eye,
  AlertCircle, Flame,
} from 'lucide-react';
import { motion } from 'motion/react';
import { format, subDays, parseISO, isToday, isThisWeek } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';
import { projectId } from '../../../../utils/supabase/info';
import { adminFetch } from '../../lib/admin-auth';

const API = `https://${projectId}.supabase.co/functions/v1/make-server-1d6e33e0`;

// ─── Types ────────────────────────────────────────────────────────────────────

interface Order {
  orderId: string;
  createdAt: string;
  created_at: string;
  payment_status: string;
  fulfillment_status: string;
  payment_provider: string;
  totals?: { total: number };
  customer?: { name: string; email: string };
}

interface TopTerm {
  term: string;
  search_count: number;
  click_count: number;
  ctr: number;
  zero_rate: number;
  last_seen: string | null;
}

interface TopProduct {
  sku: string;
  views: number;
  top_source: string;
  sources: Record<string, number>;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtBRL(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
function fmtShort(v: number) {
  if (v >= 1_000_000) return `R$ ${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000)     return `R$ ${(v / 1_000).toFixed(1)}k`;
  return fmtBRL(v);
}
function getOrderDate(o: Order): Date {
  try { return parseISO(o.createdAt || o.created_at); } catch { return new Date(0); }
}

// ─── KPI Card ────────────────────────────────────────────────────────────────

function KPICard({
  icon: Icon, label, value, sub, trend, color = 'primary', loading,
}: {
  icon: React.ElementType; label: string; value: string; sub?: string;
  trend?: { value: number; label: string }; color?: string; loading?: boolean;
}) {
  const clr: Record<string, string> = {
    primary: 'bg-primary/10 text-primary',
    green:   'bg-green-100 text-green-600',
    amber:   'bg-amber-100 text-amber-600',
    blue:    'bg-blue-100 text-blue-600',
    red:     'bg-red-100 text-red-500',
    purple:  'bg-purple-100 text-purple-600',
  };
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-card border border-border rounded-2xl p-5 flex flex-col gap-3 shadow-xs"
    >
      <div className="flex items-center justify-between">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${clr[color] ?? clr.primary}`}>
          <Icon className="w-5 h-5" />
        </div>
        {trend && (
          <div className={`flex items-center gap-0.5 text-xs font-semibold ${trend.value >= 0 ? 'text-green-600' : 'text-red-500'}`}>
            {trend.value >= 0 ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
            {Math.abs(trend.value)}% {trend.label}
          </div>
        )}
      </div>
      {loading ? (
        <div className="space-y-2">
          <div className="h-7 w-24 bg-muted rounded animate-pulse" />
          <div className="h-4 w-16 bg-muted/60 rounded animate-pulse" />
        </div>
      ) : (
        <div>
          <p className="text-2xl font-bold text-foreground tracking-tight">{value}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
          {sub && <p className="text-xs text-muted-foreground/60 mt-0.5">{sub}</p>}
        </div>
      )}
    </motion.div>
  );
}

// ─── Custom Recharts Tooltip ──────────────────────────────────────────────────

const ChartTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-border rounded-xl shadow-lg px-4 py-3 text-sm">
      <p className="font-semibold text-foreground mb-1">{label}</p>
      {payload.map((p: any, i: number) => (
        <p key={i} style={{ color: p.color }} className="text-xs">
          {p.name}: <strong>{p.name === 'GMV' ? fmtShort(p.value) : p.value}</strong>
        </p>
      ))}
    </div>
  );
};

// ─── Constants ───────────────────────────────────────────────────────────────

const PAY_COLORS: Record<string, string> = {
  waiting_payment: '#f59e0b',
  paid:            '#22c55e',
  overdue:         '#ef4444',
  canceled:        '#94a3b8',
  refunded:        '#a855f7',
};
const PAY_LABELS: Record<string, string> = {
  waiting_payment: 'Aguardando',
  paid:            'Pago',
  overdue:         'Vencido',
  canceled:        'Cancelado',
  refunded:        'Reembolsado',
};
const FULFL_ORDER   = ['pending', 'in_preparation', 'shipped', 'delivered'];
const FULFL_LABELS: Record<string, string> = {
  pending:        'Pendente',
  in_preparation: 'Em Separação',
  shipped:        'Enviado',
  delivered:      'Entregue',
};
const FULFL_COLORS: Record<string, string> = {
  pending:        '#94a3b8',
  in_preparation: '#3b82f6',
  shipped:        '#6366f1',
  delivered:      '#22c55e',
};
const SOURCE_LABELS: Record<string, string> = {
  search:      'Busca',
  direct:      'Direto',
  category:    'Categoria',
  related:     'Relacionados',
  recommend:   'Recomendação',
  unknown:     '—',
};

// ─── Main ─────────────────────────────────────────────────────────────────────

export function DashboardPage() {
  const [orders,      setOrders]      = useState<Order[]>([]);
  const [topTerms,    setTopTerms]    = useState<TopTerm[]>([]);
  const [topProducts, setTopProducts] = useState<TopProduct[]>([]);
  const [productNames, setProductNames] = useState<Record<string, string>>({});
  const [loading,     setLoading]     = useState(true);
  const [siLoading,   setSiLoading]   = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [period,      setPeriod]      = useState<7 | 30 | 90>(30);

  // ── Enrich SKUs with product names ────────────────────────────────────────
  useEffect(() => {
    if (!topProducts.length) return;
    const skus = topProducts.map(p => p.sku);
    Promise.allSettled(
      skus.map(sku =>
        adminFetch(`${API}/admin/products?sku=${encodeURIComponent(sku)}&limit=1`)
          .then(r => r.ok ? r.json() : null)
      )
    ).then(results => {
      const names: Record<string, string> = {};
      results.forEach((res, i) => {
        if (res.status === 'fulfilled' && res.value) {
          const product = res.value?.products?.[0] ?? res.value?.items?.[0] ?? null;
          if (product?.name) names[skus[i]] = product.name;
        }
      });
      setProductNames(names);
    });
  }, [topProducts]);

  // ── Fetch orders + SI data in parallel ────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    setSiLoading(true);
    try {
      const [ordersRes, termsRes, prodsRes] = await Promise.allSettled([
        adminFetch(`${API}/orders`),
        adminFetch(`${API}/si/intelligence/top-terms?limit=10`),
        adminFetch(`${API}/si/intelligence/top-products?limit=10&days=${period}`),
      ]);

      if (ordersRes.status === 'fulfilled' && ordersRes.value.ok) {
        const d = await ordersRes.value.json();
        setOrders(d.orders ?? []);
      }
      if (termsRes.status === 'fulfilled' && termsRes.value.ok) {
        const d = await termsRes.value.json();
        setTopTerms(d.terms ?? []);
      }
      if (prodsRes.status === 'fulfilled' && prodsRes.value.ok) {
        const d = await prodsRes.value.json();
        setTopProducts(d.products ?? []);
      }

      setLastUpdated(new Date());
    } catch (e: any) {
      toast.error('Erro ao carregar dashboard: ' + e.message);
    } finally {
      setLoading(false);
      setSiLoading(false);
    }
  }, [period]);

  useEffect(() => { load(); }, [load]);

  // ── Silent cleanup of expired admin tokens on mount ─────────────────────
  useEffect(() => {
    adminFetch(`${API}/admin/auth/cleanup`, { method: 'POST' }).catch(() => {});
  }, []);

  // ── Derived metrics ────────────────────────────────────────────────────────
  const cutoff      = subDays(new Date(), period);
  const filtered    = orders.filter(o => getOrderDate(o) >= cutoff);
  const gmv         = filtered.filter(o => o.payment_status === 'paid').reduce((s, o) => s + (o.totals?.total ?? 0), 0);
  const totalOrders = filtered.length;
  const todayOrders = orders.filter(o => isToday(getOrderDate(o))).length;
  const weekOrders  = orders.filter(o => isThisWeek(getOrderDate(o), { weekStartsOn: 1 })).length;
  const pendingPay  = filtered.filter(o => o.payment_status === 'waiting_payment').length;
  const toShip      = filtered.filter(o => o.payment_status === 'paid' && !['shipped', 'delivered'].includes(o.fulfillment_status)).length;
  const overdue     = filtered.filter(o => o.payment_status === 'overdue').length;

  // Area chart data
  const dayMap: Record<string, { orders: number; gmv: number }> = {};
  for (let i = period - 1; i >= 0; i--) {
    dayMap[format(subDays(new Date(), i), 'dd/MM')] = { orders: 0, gmv: 0 };
  }
  filtered.forEach(o => {
    const d = format(getOrderDate(o), 'dd/MM');
    if (dayMap[d]) {
      dayMap[d].orders++;
      if (o.payment_status === 'paid') dayMap[d].gmv += o.totals?.total ?? 0;
    }
  });
  const areaData = Object.entries(dayMap).map(([date, v]) => ({
    date, Pedidos: v.orders, GMV: Math.round(v.gmv),
  }));

  // Pie chart data
  const payMap: Record<string, number> = {};
  filtered.forEach(o => { const s = o.payment_status ?? o.status ?? 'unknown'; payMap[s] = (payMap[s] || 0) + 1; });
  const payPie = Object.entries(payMap)
    .filter(([key]) => key && key !== 'null' && key !== 'undefined' && key !== 'NaN')
    .map(([key, value], idx) => ({ key: key || `status-${idx}`, name: PAY_LABELS[key] ?? key, value }));

  // Fulfillment bars
  const fulfMap: Record<string, number> = {};
  filtered.forEach(o => { const s = o.fulfillment_status || 'pending'; fulfMap[s] = (fulfMap[s] || 0) + 1; });
  const fulfMax = Math.max(...FULFL_ORDER.map(s => fulfMap[s] ?? 0), 1);

  const tickInterval = period === 7 ? 0 : period === 30 ? 4 : 9;

  // Max values for bar-chart normalization
  const maxSearchCount  = Math.max(...topTerms.map(t => t.search_count), 1);
  const maxProductViews = Math.max(...topProducts.map(p => p.views), 1);

  return (
    <div className="p-6 lg:p-8 space-y-7 max-w-[1440px] mx-auto">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Visão geral do e-commerce Toyoparts
            {lastUpdated && (
              <span className="ml-2 text-xs text-muted-foreground/50">
                · Atualizado {format(lastUpdated, "HH:mm", { locale: ptBR })}
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-muted rounded-lg p-1 text-sm">
            {([7, 30, 90] as const).map(p => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-3 py-1.5 rounded-md font-medium transition-colors ${
                  period === p
                    ? 'bg-card text-foreground shadow-xs'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {p}d
              </button>
            ))}
          </div>
          <button
            onClick={load}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-2 text-sm font-medium border border-border rounded-lg hover:bg-muted transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Atualizar
          </button>
        </div>
      </div>

      {/* ── KPI Cards ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          icon={DollarSign}  color="green"  loading={loading}
          label={`GMV — últimos ${period} dias`}
          value={loading ? '—' : fmtShort(gmv)}
          sub={`${totalOrders} pedido${totalOrders !== 1 ? 's' : ''} no período`}
        />
        <KPICard
          icon={ShoppingBag} color="blue"   loading={loading}
          label="Hoje / Esta semana"
          value={loading ? '—' : `${todayOrders} / ${weekOrders}`}
          sub="pedidos novos"
        />
        <KPICard
          icon={Clock}       color={overdue > 0 ? 'red' : 'amber'} loading={loading}
          label="Aguardando pagamento"
          value={loading ? '—' : String(pendingPay)}
          sub={overdue > 0 ? `${overdue} vencido${overdue !== 1 ? 's' : ''}` : 'Nenhum vencido'}
        />
        <KPICard
          icon={Truck}       color={toShip > 0 ? 'purple' : 'green'} loading={loading}
          label="Para enviar"
          value={loading ? '—' : String(toShip)}
          sub="pagos aguardando despacho"
        />
      </div>

      {/* ── Area Chart + Pie Chart ─────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Area */}
        <div className="lg:col-span-2 bg-card border border-border rounded-2xl p-6 shadow-xs">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 className="text-base font-semibold text-foreground">Volume de Pedidos & GMV</h3>
              <p className="text-xs text-muted-foreground mt-0.5">Últimos {period} dias</p>
            </div>
            <BarChart3 className="w-5 h-5 text-muted-foreground" />
          </div>
          {loading ? (
            <div className="h-48 bg-muted/30 rounded-xl animate-pulse" />
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={areaData} margin={{ top: 4, right: 0, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="gOrders" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#3b82f6" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}    />
                  </linearGradient>
                  <linearGradient id="gGMV" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#22c55e" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#22c55e" stopOpacity={0}    />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} interval={tickInterval} />
                <YAxis yAxisId="o" tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} />
                <YAxis yAxisId="g" orientation="right" tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                <Tooltip content={<ChartTooltip />} />
                <Area yAxisId="o" type="monotone" dataKey="Pedidos" stroke="#3b82f6" strokeWidth={2} fill="url(#gOrders)" />
                <Area yAxisId="g" type="monotone" dataKey="GMV"     stroke="#22c55e" strokeWidth={2} fill="url(#gGMV)"    />
              </AreaChart>
            </ResponsiveContainer>
          )}
          <div className="flex items-center gap-5 mt-3">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="w-3 h-0.5 bg-blue-500 rounded-full inline-block" /> Pedidos
            </div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="w-3 h-0.5 bg-green-500 rounded-full inline-block" /> GMV (pago)
            </div>
          </div>
        </div>

        {/* Pie */}
        <div className="bg-card border border-border rounded-2xl p-6 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-base font-semibold text-foreground">Status de Pagamento</h3>
              <p className="text-xs text-muted-foreground mt-0.5">Distribuição no período</p>
            </div>
            <CreditCard className="w-5 h-5 text-muted-foreground" />
          </div>
          {loading ? (
            <div className="h-48 bg-muted/30 rounded-xl animate-pulse" />
          ) : payPie.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-sm text-muted-foreground">
              Nenhum pedido no período
            </div>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={160}>
                <PieChart>
                  <Pie data={payPie} cx="50%" cy="50%" innerRadius={45} outerRadius={68} dataKey="value" paddingAngle={2}>
                    {payPie.map(e => (
                      <Cell key={e.key} fill={PAY_COLORS[e.key] ?? '#94a3b8'} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: number) => [`${v} pedidos`, '']} />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-2 mt-3">
                {payPie.map(e => (
                  <div key={e.key} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: PAY_COLORS[e.key] ?? '#94a3b8' }} />
                      <span className="text-muted-foreground">{e.name}</span>
                    </div>
                    <span className="font-semibold text-foreground">{e.value}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Itens mais buscados + Produtos mais visitados ──────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Itens mais buscados */}
        <div className="bg-card border border-border rounded-2xl p-6 shadow-xs">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 className="text-base font-semibold text-foreground">Itens mais buscados</h3>
              <p className="text-xs text-muted-foreground mt-0.5">Top 10 termos por volume de busca</p>
            </div>
            <Search className="w-5 h-5 text-muted-foreground" />
          </div>

          {siLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-9 bg-muted/30 rounded-lg animate-pulse" />
              ))}
            </div>
          ) : topTerms.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
              <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
                <Search className="w-6 h-6 text-muted-foreground" />
              </div>
              <p className="text-sm text-muted-foreground">Nenhuma busca registrada ainda.</p>
              <p className="text-xs text-muted-foreground/60 max-w-[220px]">Os dados aparecem após os clientes realizarem pesquisas na loja.</p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {topTerms.slice(0, 10).map((t, idx) => {
                const barPct = Math.round((t.search_count / maxSearchCount) * 100);
                const isHot  = idx < 3;
                return (
                  <div key={t.term} className="group">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className={`text-[10px] font-bold w-5 text-center shrink-0 ${
                          idx === 0 ? 'text-amber-500' : idx === 1 ? 'text-gray-400' : idx === 2 ? 'text-amber-700' : 'text-muted-foreground/50'
                        }`}>
                          {idx + 1}
                        </span>
                        {isHot && <Flame className="w-3 h-3 text-orange-400 shrink-0" />}
                        <span className="text-sm font-medium text-foreground truncate capitalize">{t.term}</span>
                      </div>
                      <div className="flex items-center gap-3 shrink-0 ml-2">
                        <span className="text-xs text-muted-foreground tabular-nums">
                          {t.search_count.toLocaleString('pt-BR')} buscas
                        </span>
                        {t.ctr > 0 && (
                          <span className="text-[10px] font-semibold text-green-600 bg-green-50 px-1.5 py-0.5 rounded-md border border-green-100">
                            {t.ctr}% CTR
                          </span>
                        )}
                        {t.zero_rate > 50 && (
                          <span className="text-[10px] font-semibold text-red-500 bg-red-50 px-1.5 py-0.5 rounded-md border border-red-100 flex items-center gap-1">
                            <AlertCircle className="w-2.5 h-2.5" /> {t.zero_rate}% vazio
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="h-1.5 bg-muted rounded-full overflow-hidden ml-7">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${barPct}%` }}
                        transition={{ duration: 0.5, delay: idx * 0.04 }}
                        className={`h-full rounded-full ${
                          t.zero_rate > 50
                            ? 'bg-red-400'
                            : isHot
                            ? 'bg-gradient-to-r from-orange-400 to-amber-400'
                            : 'bg-primary/60'
                        }`}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Produtos mais visitados */}
        <div className="bg-card border border-border rounded-2xl p-6 shadow-xs">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 className="text-base font-semibold text-foreground">Produtos mais visitados</h3>
              <p className="text-xs text-muted-foreground mt-0.5">Top 10 SKUs por visualizações — últimos {period}d</p>
            </div>
            <Eye className="w-5 h-5 text-muted-foreground" />
          </div>

          {siLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-9 bg-muted/30 rounded-lg animate-pulse" />
              ))}
            </div>
          ) : topProducts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
              <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
                <Package className="w-6 h-6 text-muted-foreground" />
              </div>
              <p className="text-sm text-muted-foreground">Nenhuma visualização registrada ainda.</p>
              <p className="text-xs text-muted-foreground/60 max-w-[220px]">Os dados aparecem após os clientes visitarem páginas de produto.</p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {topProducts.slice(0, 10).map((p, idx) => {
                const barPct  = Math.round((p.views / maxProductViews) * 100);
                const isTop   = idx < 3;
                const srcLabel = SOURCE_LABELS[p.top_source] ?? p.top_source;
                const srcColor: Record<string, string> = {
                  Busca:       'bg-blue-50 text-blue-600 border-blue-100',
                  Direto:      'bg-gray-50 text-gray-600 border-gray-200',
                  Categoria:   'bg-purple-50 text-purple-600 border-purple-100',
                  Relacionados:'bg-teal-50 text-teal-600 border-teal-100',
                  Recomendação:'bg-amber-50 text-amber-600 border-amber-100',
                  '—':         'bg-muted text-muted-foreground border-border',
                };
                return (
                  <div key={p.sku} className="group">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className={`text-[10px] font-bold w-5 text-center shrink-0 ${
                          idx === 0 ? 'text-amber-500' : idx === 1 ? 'text-gray-400' : idx === 2 ? 'text-amber-700' : 'text-muted-foreground/50'
                        }`}>
                          {idx + 1}
                        </span>
                        <div className="w-6 h-6 rounded-md bg-muted flex items-center justify-center shrink-0">
                          <Package className="w-3.5 h-3.5 text-muted-foreground" />
                        </div>
                        <div className="min-w-0">
                          <span className="text-sm font-medium text-foreground truncate block">
                            {productNames[p.sku] ?? (
                              <span className="font-mono text-muted-foreground">{p.sku}</span>
                            )}
                          </span>
                          <span className="text-[10px] font-mono text-muted-foreground/60 truncate block">
                            {p.sku}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 ml-2">
                        <span className="text-xs text-muted-foreground tabular-nums">
                          {p.views.toLocaleString('pt-BR')} views
                        </span>
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md border ${srcColor[srcLabel] ?? srcColor['—']}`}>
                          {srcLabel}
                        </span>
                      </div>
                    </div>
                    <div className="h-1.5 bg-muted rounded-full overflow-hidden ml-13">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${barPct}%` }}
                        transition={{ duration: 0.5, delay: idx * 0.04 }}
                        className={`h-full rounded-full ${
                          isTop
                            ? 'bg-gradient-to-r from-primary to-primary/60'
                            : 'bg-primary/40'
                        }`}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Fulfillment Pipeline (full width) ──────────────────────────────── */}
      <div className="bg-card border border-border rounded-2xl p-6 shadow-xs">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-base font-semibold text-foreground">Pipeline de Fulfillment</h3>
            <p className="text-xs text-muted-foreground mt-0.5">Estado operacional dos pedidos no período selecionado</p>
          </div>
          <Package className="w-5 h-5 text-muted-foreground" />
        </div>

        {loading ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map(i => <div key={i} className="h-20 bg-muted/30 rounded-xl animate-pulse" />)}
          </div>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {FULFL_ORDER.map((status, idx) => {
              const count  = fulfMap[status] ?? 0;
              const pct    = Math.round((count / fulfMax) * 100);
              const isActive = count > 0;
              return (
                <motion.div
                  key={status}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.08 }}
                  className={`rounded-xl p-4 border transition-colors ${
                    isActive ? 'border-border bg-card' : 'border-border/50 bg-muted/20'
                  }`}
                >
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-medium text-muted-foreground">{FULFL_LABELS[status]}</span>
                    <span
                      className="w-2.5 h-2.5 rounded-full"
                      style={{ background: isActive ? FULFL_COLORS[status] : '#e2e8f0' }}
                    />
                  </div>
                  <p className="text-3xl font-bold text-foreground mb-3">{count}</p>
                  <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${pct}%` }}
                      transition={{ duration: 0.7, delay: 0.2 + idx * 0.08 }}
                      className="h-full rounded-full"
                      style={{ background: FULFL_COLORS[status] }}
                    />
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-1.5">{pct}% do máximo</p>
                </motion.div>
              );
            })}
          </div>
        )}

        {/* Canceled footnote */}
        {!loading && (fulfMap['canceled'] ?? 0) > 0 && (
          <p className="text-xs text-muted-foreground/60 mt-4">
            + {fulfMap['canceled']} pedido{fulfMap['canceled'] !== 1 ? 's' : ''} cancelado{fulfMap['canceled'] !== 1 ? 's' : ''} no período
          </p>
        )}
      </div>

    </div>
  );
}