import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useNavigate } from 'react-router';
import { supabase, projectId } from '../../../lib/supabase';
import {
  Clock, Truck, LogOut, RefreshCw, History, Store,
  ShoppingBag, AlertCircle, Info, ExternalLink,
} from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Card } from '../../components/ui/card';
import { toast } from 'sonner';

// ─── Types ────────────────────────────────────────────────────────────────────

type OrderSource = 'loja' | 'magento';

interface NormalizedOrder {
  id: string;
  increment_id: string;
  created_at: string;
  status: string;
  grand_total: number;
  items_count?: number;
  customer_name?: string;
  source: OrderSource;
  payment_status?: string;
  fulfillment_status?: string;
  payment_provider?: string;
  tracking_url?: string;
}

interface OrdersResponse {
  orders: NormalizedOrder[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    total_pages: number;
    store_count: number;
    magento_count: number;
  };
  magento_unavailable?: boolean;
  magento_from_cache?: boolean;
}

// ─── Status helpers ───────────────────────────────────────────────────────────

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  // Nova loja — payment_status
  waiting_payment: { label: 'Aguardando Pagamento', color: 'bg-yellow-100 text-yellow-800 border-yellow-200' },
  paid:            { label: 'Pago',                 color: 'bg-blue-100 text-blue-800 border-blue-200' },
  overdue:         { label: 'Vencido',              color: 'bg-orange-100 text-orange-800 border-orange-200' },
  canceled:        { label: 'Cancelado',            color: 'bg-red-100 text-red-800 border-red-200' },
  refunded:        { label: 'Reembolsado',          color: 'bg-purple-100 text-purple-800 border-purple-200' },
  // Nova loja — fulfillment_status
  pending:         { label: 'Pendente',             color: 'bg-yellow-100 text-yellow-800 border-yellow-200' },
  in_preparation:  { label: 'Em Preparação',        color: 'bg-blue-100 text-blue-800 border-blue-200' },
  shipped:         { label: 'Enviado',              color: 'bg-indigo-100 text-indigo-800 border-indigo-200' },
  delivered:       { label: 'Entregue',             color: 'bg-green-100 text-green-800 border-green-200' },
  // Magento
  processing:      { label: 'Em Processamento',     color: 'bg-blue-100 text-blue-800 border-blue-200' },
  complete:        { label: 'Concluído',            color: 'bg-green-100 text-green-800 border-green-200' },
  closed:          { label: 'Fechado',              color: 'bg-gray-100 text-gray-700 border-gray-200' },
  holded:          { label: 'Em Espera',            color: 'bg-orange-100 text-orange-800 border-orange-200' },
};

function getStatusConfig(order: NormalizedOrder) {
  // Para nova loja, prioriza fulfillment_status se pago
  const key = order.source === 'loja'
    ? (order.payment_status === 'paid' ? (order.fulfillment_status || order.status) : order.payment_status || order.status)
    : order.status;
  return STATUS_MAP[key] || { label: key, color: 'bg-gray-100 text-gray-700 border-gray-200' };
}

// ─── Sub-componentes ──────────────────────────────────────────────────────────

function SourceBadge({ source }: { source: OrderSource }) {
  if (source === 'loja') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-50 text-blue-700 border border-blue-200 uppercase tracking-wide">
        <Store className="w-2.5 h-2.5" />
        Nova Loja
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-gray-100 text-gray-600 border border-gray-200 uppercase tracking-wide">
      <History className="w-2.5 h-2.5" />
      Histórico
    </span>
  );
}

function StatusBadge({ order }: { order: NormalizedOrder }) {
  const config = getStatusConfig(order);
  return (
    <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium border ${config.color}`}>
      {config.label}
    </span>
  );
}

function MagentoWarningBanner() {
  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800"
    >
      <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
      <div>
        <span className="font-medium">Histórico temporariamente indisponível.</span>
        {' '}Não foi possível consultar seus pedidos anteriores agora. Tente novamente em alguns instantes.
      </div>
    </motion.div>
  );
}

function CacheBanner() {
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 bg-muted/60 border border-border rounded-lg text-xs text-muted-foreground w-fit">
      <Info className="w-3 h-3" />
      Histórico Magento carregado do cache (atualiza a cada 5 min)
    </div>
  );
}

function OrderCard({ order, index }: { order: NormalizedOrder; index: number }) {
  const isLoja    = order.source === 'loja';
  const dotColor  = isLoja ? 'border-primary' : 'border-gray-400';
  const formattedDate = new Date(order.created_at).toLocaleDateString('pt-BR', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
  const formattedTime = new Date(order.created_at).toLocaleTimeString('pt-BR', {
    hour: '2-digit', minute: '2-digit',
  });
  const formattedTotal = new Intl.NumberFormat('pt-BR', {
    style: 'currency', currency: 'BRL',
  }).format(order.grand_total);

  return (
    <motion.div
      initial={{ opacity: 0, x: -16 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.04, duration: 0.3 }}
      className="relative"
    >
      {/* Dot na timeline */}
      <div className={`absolute -left-[33px] md:-left-[41px] top-5 w-4 h-4 rounded-full bg-background border-2 ${dotColor} ring-4 ring-background z-10`} />

      <Card className="overflow-hidden hover:shadow-md transition-all duration-200 hover:-translate-y-0.5">
        <div className="p-5 md:p-6">

          {/* Header do card */}
          <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
            <div className="space-y-1.5">
              <div className="flex items-center flex-wrap gap-2">
                <span className="font-bold text-base md:text-lg">
                  #{order.increment_id}
                </span>
                <SourceBadge source={order.source} />
                <StatusBadge order={order} />
              </div>

              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Clock className="w-3 h-3 shrink-0" />
                <span>{formattedDate} às {formattedTime}</span>
              </div>
            </div>

            <div className="text-right shrink-0">
              <div className="font-bold text-lg text-primary">{formattedTotal}</div>
              {order.items_count != null && (
                <div className="text-xs text-muted-foreground mt-0.5">
                  {order.items_count} {order.items_count === 1 ? 'item' : 'itens'}
                </div>
              )}
            </div>
          </div>

          {/* Footer do card */}
          <div className="pt-3.5 border-t border-border flex items-center justify-between gap-4">
            <div className="text-xs text-muted-foreground">
              {order.source === 'loja' && order.fulfillment_status === 'shipped' && order.tracking_url && (
                <a
                  href={order.tracking_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-primary hover:underline font-medium"
                >
                  <Truck className="w-3 h-3" />
                  Rastrear entrega
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
              {order.source === 'loja' && order.payment_provider && (
                <span className="text-[11px] text-muted-foreground/70 capitalize">
                  via {order.payment_provider}
                </span>
              )}
              {order.source === 'magento' && (
                <span className="text-[11px] text-muted-foreground/70">
                  Pedido da loja anterior
                </span>
              )}
            </div>

            {order.source === 'magento' && (
              <a
                href={`https://www.toyoparts.com.br/sales/order/view/order_id/${order.id.replace('magento_', '')}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Ver na loja antiga
                <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>
        </div>
      </Card>
    </motion.div>
  );
}

function EmptyState({ hasStoreOrders, hasMagentoError }: { hasStoreOrders: boolean; hasMagentoError: boolean }) {
  const navigate = useNavigate();
  return (
    <Card className="p-10 md:p-14 text-center flex flex-col items-center justify-center space-y-5">
      <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center">
        <ShoppingBag className="w-8 h-8 text-muted-foreground" />
      </div>
      <div className="space-y-2 max-w-sm">
        <h3 className="text-lg font-semibold">Nenhum pedido encontrado</h3>
        <p className="text-muted-foreground text-sm">
          {hasMagentoError
            ? 'Não encontramos pedidos na nova loja. O histórico anterior está temporariamente indisponível — tente novamente.'
            : 'Não há pedidos vinculados a este e-mail, nem na nova loja nem no histórico anterior.'}
        </p>
        {hasMagentoError && (
          <p className="text-xs text-muted-foreground">
            Se você comprou na loja anterior, seus pedidos aparecerão aqui quando a consulta for restaurada.
          </p>
        )}
      </div>
      <Button onClick={() => navigate('/')} className="mt-2">
        Ir para a Loja
      </Button>
    </Card>
  );
}

// ─── Skeleton de loading ──────────────────────────────────────────────────────

function OrderSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="relative border-l border-border/50 ml-4 md:ml-6 space-y-6 pl-6 md:pl-8">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="relative animate-pulse">
          <div className="absolute -left-[33px] md:-left-[41px] top-5 w-4 h-4 rounded-full bg-muted border-2 border-muted ring-4 ring-background" />
          <div className="bg-card border border-border rounded-xl p-6 space-y-4">
            <div className="flex justify-between">
              <div className="space-y-2">
                <div className="h-5 w-36 bg-muted rounded-md" />
                <div className="h-3 w-24 bg-muted rounded-md" />
              </div>
              <div className="h-6 w-20 bg-muted rounded-md" />
            </div>
            <div className="pt-3 border-t border-border">
              <div className="h-3 w-32 bg-muted rounded-md" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Página principal ─────────────────────────────────────────────────────────

export function OrderHistoryPage() {
  const navigate = useNavigate();

  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [orders, setOrders]         = useState<NormalizedOrder[]>([]);
  const [userEmail, setUserEmail]   = useState('');
  const [pagination, setPagination] = useState<OrdersResponse['pagination'] | null>(null);
  const [magentoUnavailable, setMagentoUnavailable] = useState(false);
  const [magentoFromCache, setMagentoFromCache]     = useState(false);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      navigate('/acesso');
      return;
    }
    setUserEmail(session.user.email || '');
    await fetchOrders(session.access_token);
  };

  const fetchOrders = async (token: string, page = 1, showRefreshing = false) => {
    if (showRefreshing) setRefreshing(true);
    try {
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-1d6e33e0/customer/orders?page=${page}&limit=20`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Erro ${res.status}`);
      }

      const data: OrdersResponse = await res.json();
      setOrders(data.orders || []);
      setPagination(data.pagination || null);
      setMagentoUnavailable(!!data.magento_unavailable);
      setMagentoFromCache(!!data.magento_from_cache);

      if (showRefreshing) {
        toast.success('Pedidos atualizados!');
      }
    } catch (err: any) {
      console.error('[OrderHistoryPage] Erro ao buscar pedidos:', err);
      toast.error('Erro ao carregar histórico: ' + err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return navigate('/acesso');
    await fetchOrders(session.access_token, 1, true);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/acesso');
  };

  // ── Tela de carregamento inicial ────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-muted/5 pt-24 pb-12 px-4 lg:px-8">
        <div className="max-w-4xl mx-auto space-y-8">
          {/* Header skeleton */}
          <div className="flex justify-between items-start animate-pulse">
            <div className="space-y-2">
              <div className="h-7 w-40 bg-muted rounded-md" />
              <div className="h-4 w-56 bg-muted rounded-md" />
            </div>
            <div className="h-9 w-16 bg-muted rounded-md" />
          </div>
          <OrderSkeleton count={3} />
        </div>
      </div>
    );
  }

  const storeCount   = pagination?.store_count   ?? 0;
  const magentoCount = pagination?.magento_count  ?? 0;

  return (
    <div className="min-h-screen bg-muted/5 pt-24 pb-16 px-4 lg:px-8">
      <div className="max-w-4xl mx-auto space-y-7">

        {/* ── Header ────────────────────────────────────────────────────────── */}
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Meus Pedidos</h1>
            <p className="text-muted-foreground text-sm mt-1">
              Histórico vinculado a{' '}
              <span className="font-medium text-foreground">{userEmail}</span>
            </p>

            {/* Contadores por fonte */}
            {orders.length > 0 && (
              <div className="flex items-center gap-3 mt-3 flex-wrap">
                {storeCount > 0 && (
                  <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Store className="w-3 h-3 text-blue-500" />
                    {storeCount} {storeCount === 1 ? 'pedido' : 'pedidos'} na nova loja
                  </span>
                )}
                {magentoCount > 0 && (
                  <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                    <History className="w-3 h-3 text-gray-500" />
                    {magentoCount} do histórico anterior
                  </span>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={refreshing}
              className="gap-1.5"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
              {refreshing ? 'Atualizando...' : 'Atualizar'}
            </Button>
            <Button variant="outline" size="sm" onClick={handleLogout} className="gap-1.5">
              <LogOut className="w-4 h-4" />
              Sair
            </Button>
          </div>
        </div>

        {/* ── Avisos situacionais ────────────────────────────────────────────── */}
        <AnimatePresence>
          {magentoUnavailable && <MagentoWarningBanner key="magento-warning" />}
          {magentoFromCache && !magentoUnavailable && magentoCount > 0 && (
            <motion.div key="cache-banner" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <CacheBanner />
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Lista de pedidos ou estado vazio ──────────────────────────────── */}
        {orders.length === 0 ? (
          <EmptyState
            hasStoreOrders={false}
            hasMagentoError={magentoUnavailable}
          />
        ) : (
          <div className="relative border-l border-border/50 ml-4 md:ml-6 space-y-6 md:space-y-8 pl-6 md:pl-8">
            <AnimatePresence>
              {orders.map((order, index) => (
                <OrderCard key={order.id} order={order} index={index} />
              ))}
            </AnimatePresence>
          </div>
        )}

        {/* ── Legenda das fontes ─────────────────────────────────────────────── */}
        {orders.length > 0 && (
          <div className="flex items-center gap-4 flex-wrap pt-2 text-xs text-muted-foreground border-t border-border/50">
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full border-2 border-primary bg-background" />
              <span>Nova loja (toyoparts.com.br)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full border-2 border-gray-400 bg-background" />
              <span>Histórico anterior (toyoparts.com.br)</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}