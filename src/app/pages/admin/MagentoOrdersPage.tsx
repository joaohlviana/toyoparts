import React, { useState, useEffect } from 'react';
import { 
  ShoppingBag, Search, RefreshCw, Loader2, Calendar, User, DollarSign, Package, FileJson 
} from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Badge } from '../../components/ui/badge';
import { fetchMagentoOrders } from '../../lib/magento/magento-api';
import type { MagentoOrder } from '../../lib/magento/magento-api';
import { toast } from 'sonner';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "../../components/ui/sheet";

export function MagentoOrdersPage() {
  const [orders, setOrders] = useState<MagentoOrder[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [selectedOrder, setSelectedOrder] = useState<MagentoOrder | null>(null);
  const limit = 20;

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await fetchMagentoOrders(page, limit, search);
      setOrders(data.items || []);
      setTotal(data.total_count || 0);
    } catch (e: any) {
      toast.error('Erro ao buscar pedidos: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [page]); 

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    loadData();
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'complete': return 'bg-green-100 text-green-700 border-green-200';
      case 'processing': return 'bg-blue-100 text-blue-700 border-blue-200';
      case 'pending': return 'bg-yellow-100 text-yellow-700 border-yellow-200';
      case 'canceled': return 'bg-red-100 text-red-700 border-red-200';
      default: return 'bg-gray-100 text-gray-700 border-gray-200';
    }
  };

  const formatCurrency = (val: number, currency = 'BRL') => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency }).format(val);
  };

  return (
    <div className="max-w-[1280px] mx-auto px-4 lg:px-6 pt-6 pb-12 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <ShoppingBag className="w-6 h-6" /> Pedidos Magento
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Histórico de pedidos importados ({total} registros)
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={loadData} disabled={loading}>
          {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
          Atualizar
        </Button>
      </div>

      <div className="flex gap-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input 
            value={search} 
            onChange={e => setSearch(e.target.value)} 
            placeholder="Buscar por ID ou email..." 
            className="pl-9 h-10"
          />
        </div>
        <Button onClick={handleSearch} disabled={loading}>Buscar</Button>
      </div>

      <div className="bg-card rounded-xl border border-border overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-muted/50 border-b border-border text-xs uppercase text-muted-foreground font-semibold">
              <tr>
                <th className="px-6 py-3 font-medium">Pedido #</th>
                <th className="px-6 py-3 font-medium">Data</th>
                <th className="px-6 py-3 font-medium">Cliente</th>
                <th className="px-6 py-3 font-medium">Total</th>
                <th className="px-6 py-3 font-medium">Status</th>
                <th className="px-6 py-3 font-medium text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-muted-foreground py-12">
                    <div className="flex flex-col items-center gap-2">
                        <Loader2 className="w-6 h-6 animate-spin text-primary" />
                        <span className="text-xs font-medium">Carregando pedidos...</span>
                    </div>
                  </td>
                </tr>
              ) : orders.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-muted-foreground py-12">
                    Nenhum pedido encontrado.
                  </td>
                </tr>
              ) : (
                orders.map((o) => (
                  <tr key={o.entity_id} className="hover:bg-muted/50 transition-colors">
                    <td className="px-6 py-4 font-mono text-xs font-bold text-foreground">
                      #{o.increment_id}
                    </td>
                    <td className="px-6 py-4 text-muted-foreground">
                      <div className="flex items-center gap-2">
                        <Calendar className="w-3.5 h-3.5 opacity-70" />
                        {new Date(o.created_at).toLocaleDateString('pt-BR')}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col">
                        <span className="font-medium text-foreground">{o.customer_firstname} {o.customer_lastname}</span>
                        <span className="text-xs text-muted-foreground">{o.customer_email}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 font-mono font-medium">
                      {formatCurrency(o.grand_total, o.base_currency_code)}
                    </td>
                    <td className="px-6 py-4">
                      <Badge variant="outline" className={`border ${getStatusColor(o.status)}`}>
                        {o.status}
                      </Badge>
                    </td>
                    <td className="px-6 py-4 text-right">
                       <Button 
                         variant="ghost" 
                         size="sm" 
                         className="h-8 w-8 p-0"
                         title="Ver JSON Raw"
                         onClick={() => setSelectedOrder(o)}
                       >
                         <span className="sr-only">Ver Raw</span>
                         <FileJson className="w-4 h-4" />
                       </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        
        <div className="px-6 py-4 border-t border-border flex items-center justify-between bg-muted/20">
          <span className="text-xs text-muted-foreground font-medium">
            Mostrando {(page - 1) * limit + 1} a {Math.min(page * limit, total)} de {total}
          </span>
          <div className="flex gap-2">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1 || loading}
            >
              Anterior
            </Button>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => setPage(p => p + 1)}
              disabled={page * limit >= total || loading}
            >
              Próxima
            </Button>
          </div>
        </div>
      </div>

      <Sheet open={!!selectedOrder} onOpenChange={(open) => !open && setSelectedOrder(null)}>
        <SheetContent className="w-[400px] sm:w-[540px] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Dados Brutos do Pedido</SheetTitle>
            <SheetDescription>
              Visualização completa do objeto JSON retornado pelo Magento.
            </SheetDescription>
          </SheetHeader>
          <div className="mt-6">
            {selectedOrder && (
              <div className="bg-muted p-4 rounded-lg overflow-x-auto">
                <pre className="text-xs font-mono whitespace-pre-wrap">
                  {JSON.stringify(selectedOrder, null, 2)}
                </pre>
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
