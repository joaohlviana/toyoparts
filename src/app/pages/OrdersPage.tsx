import React, { useState, useEffect, useCallback } from 'react';
import {
  ShoppingBag, Search, Filter, Eye, RefreshCcw,
  ExternalLink, Truck, CreditCard,
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';
import { projectId, publicAnonKey } from '../../../utils/supabase/info';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import { OrderDetailDrawer } from '../components/admin/OrderDetailDrawer';

const API = `https://${projectId}.supabase.co/functions/v1/make-server-1d6e33e0`;
const H = { Authorization: `Bearer ${publicAnonKey}` };

type PaymentStatus     = 'waiting_payment' | 'paid' | 'overdue' | 'canceled' | 'refunded';
type FulfillmentStatus = 'pending' | 'in_preparation' | 'shipped' | 'delivered' | 'canceled';

interface Order {
  orderId: string;
  createdAt: string;
  payment_status: PaymentStatus;
  fulfillment_status: FulfillmentStatus;
  payment_provider: string;
  customer: { name: string; email: string; document?: string };
  totals: { total: number };
  shipping?: { carrier?: string; service?: string };
  asaas_invoice_url?: string;
  vindi_url?: string;
  stripe_checkout_url?: string;
  tracking_code?: string;
}

function PaymentBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    waiting_payment: { label: 'Aguardando',  cls: 'bg-amber-100 text-amber-700 border-amber-200' },
    paid:            { label: 'Pago',         cls: 'bg-green-100 text-green-700 border-green-200' },
    overdue:         { label: 'Vencido',      cls: 'bg-red-100 text-red-700 border-red-200' },
    canceled:        { label: 'Cancelado',    cls: 'bg-gray-100 text-gray-600 border-gray-200' },
    refunded:        { label: 'Reembolsado',  cls: 'bg-purple-100 text-purple-700 border-purple-200' },
  };
  const { label, cls } = map[status] ?? { label: status, cls: 'bg-gray-100 text-gray-600 border-gray-200' };
  return <Badge variant="outline" className={`border text-[11px] ${cls}`}>{label}</Badge>;
}

function FulfillmentBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    pending:        { label: 'Pendente',      cls: 'bg-gray-100 text-gray-500 border-gray-200' },
    in_preparation: { label: 'Em Separação',  cls: 'bg-blue-100 text-blue-700 border-blue-200' },
    shipped:        { label: 'Enviado',        cls: 'bg-indigo-100 text-indigo-700 border-indigo-200' },
    delivered:      { label: 'Entregue',       cls: 'bg-green-100 text-green-700 border-green-200' },
    canceled:       { label: 'Cancelado',      cls: 'bg-red-100 text-red-600 border-red-200' },
  };
  const { label, cls } = map[status] ?? { label: status, cls: 'bg-gray-100 text-gray-500 border-gray-200' };
  return <Badge variant="outline" className={`border text-[11px] ${cls}`}>{label}</Badge>;
}

export function OrdersPage() {
  const [orders, setOrders]         = useState<Order[]>([]);
  const [loading, setLoading]       = useState(true);
  const [search, setSearch]         = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    try {
      const res  = await fetch(`${API}/orders`, { headers: H });
      const data = await res.json();
      if (data.success) {
        setOrders(data.orders || []);
      } else {
        throw new Error(data.error || 'Erro ao carregar pedidos');
      }
    } catch (err: any) {
      console.error('[OrdersPage] fetch error:', err);
      toast.error('Falha ao carregar pedidos: ' + err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  const filtered = orders.filter(o =>
    o.orderId.toLowerCase().includes(search.toLowerCase()) ||
    o.customer.name.toLowerCase().includes(search.toLowerCase()) ||
    o.customer.email.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <ShoppingBag className="w-6 h-6" /> Pedidos
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {orders.length} pedido{orders.length !== 1 ? 's' : ''} · PAL: Asaas · Vindi · Stripe
          </p>
        </div>
        <Button onClick={fetchOrders} variant="outline" size="sm" className="gap-2">
          <RefreshCcw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Atualizar
        </Button>
      </div>

      {/* Search */}
      <div className="flex items-center gap-4 bg-card p-3 rounded-xl border border-border">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por ID, nome ou e-mail..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-10 h-9"
          />
        </div>
        <Button variant="outline" size="sm" className="gap-2 h-9">
          <Filter className="w-4 h-4" /> Filtros
        </Button>
      </div>

      {/* Table */}
      <div className="bg-card rounded-xl border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/50 border-b border-border">
              <tr>
                <th className="p-4 font-semibold text-muted-foreground text-xs uppercase tracking-wider">Data</th>
                <th className="p-4 font-semibold text-muted-foreground text-xs uppercase tracking-wider">Pedido</th>
                <th className="p-4 font-semibold text-muted-foreground text-xs uppercase tracking-wider">Cliente</th>
                <th className="p-4 font-semibold text-muted-foreground text-xs uppercase tracking-wider hidden lg:table-cell">Frete</th>
                <th className="p-4 font-semibold text-muted-foreground text-xs uppercase tracking-wider">
                  <div className="flex items-center gap-1.5">
                    <CreditCard className="w-3.5 h-3.5" /> Pagamento
                  </div>
                </th>
                <th className="p-4 font-semibold text-muted-foreground text-xs uppercase tracking-wider">
                  <div className="flex items-center gap-1.5">
                    <Truck className="w-3.5 h-3.5" /> Expedição
                  </div>
                </th>
                <th className="p-4 font-semibold text-muted-foreground text-xs uppercase tracking-wider">Total</th>
                <th className="p-4 font-semibold text-muted-foreground text-xs uppercase tracking-wider text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td colSpan={8} className="p-4 text-center text-muted-foreground text-sm">
                      Carregando...
                    </td>
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-12 text-center text-muted-foreground">
                    {search ? 'Nenhum resultado para a busca.' : 'Nenhum pedido encontrado.'}
                  </td>
                </tr>
              ) : filtered.map(order => (
                <tr
                  key={order.orderId}
                  className="hover:bg-muted/30 transition-colors cursor-pointer"
                  onClick={() => setSelectedId(order.orderId)}
                >
                  <td className="p-4">
                    <div className="flex flex-col">
                      <span className="font-medium text-xs">
                        {format(new Date(order.createdAt), 'dd/MM/yy', { locale: ptBR })}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {format(new Date(order.createdAt), 'HH:mm')}
                      </span>
                    </div>
                  </td>
                  <td className="p-4">
                    <div className="flex flex-col gap-1">
                      <span className="font-mono font-bold text-xs uppercase">
                        {order.orderId.slice(0, 8)}
                      </span>
                      <span className="text-[10px] text-muted-foreground uppercase tracking-wide">
                        {order.payment_provider}
                      </span>
                    </div>
                  </td>
                  <td className="p-4">
                    <div className="flex flex-col">
                      <span className="font-semibold text-foreground text-xs">{order.customer.name}</span>
                      <span className="text-[11px] text-muted-foreground">{order.customer.email}</span>
                    </div>
                  </td>
                  <td className="p-4 hidden lg:table-cell">
                    {order.shipping?.carrier ? (
                      <div className="flex flex-col">
                        <span className="text-xs font-medium text-foreground">{order.shipping.carrier}</span>
                        {order.shipping.service && (
                          <span className="text-[10px] text-muted-foreground">{order.shipping.service}</span>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground/50">—</span>
                    )}
                  </td>
                  <td className="p-4">
                    <PaymentBadge status={order.payment_status} />
                  </td>
                  <td className="p-4">
                    <div className="flex flex-col gap-1">
                      <FulfillmentBadge status={order.fulfillment_status} />
                      {order.tracking_code && (
                        <span className="text-[10px] font-mono text-muted-foreground">{order.tracking_code}</span>
                      )}
                    </div>
                  </td>
                  <td className="p-4 font-bold text-foreground text-sm">
                    {order.totals?.total?.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) ?? '—'}
                  </td>
                  <td className="p-4 text-right" onClick={e => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-1">
                      {(order.asaas_invoice_url || order.vindi_url || order.stripe_checkout_url) && (
                        <a
                          href={order.asaas_invoice_url || order.vindi_url || order.stripe_checkout_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="Ver no gateway"
                        >
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <ExternalLink className="w-4 h-4" />
                          </Button>
                        </a>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        title="Detalhes do pedido"
                        onClick={() => setSelectedId(order.orderId)}
                      >
                        <Eye className="w-4 h-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Drawer */}
      {selectedId && (
        <OrderDetailDrawer
          orderId={selectedId}
          onClose={() => setSelectedId(null)}
          onUpdated={fetchOrders}
        />
      )}
    </div>
  );
}