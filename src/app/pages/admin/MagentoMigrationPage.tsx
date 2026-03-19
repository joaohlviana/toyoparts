import React, { useState, useEffect } from 'react';
import { 
  Database, RefreshCw, Loader2, Play, CheckCircle2, AlertTriangle, Download, Server
} from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Progress } from '../../components/ui/progress';
import { Badge } from '../../components/ui/badge';
import { toast } from 'sonner';
import { projectId, publicAnonKey } from '../../../../utils/supabase/info';

const API_BASE = `https://${projectId}.supabase.co/functions/v1/make-server-1d6e33e0/magento-sync`;

interface SyncStatus {
  status: 'idle' | 'running' | 'completed' | 'error';
  processed: number;
  total: number;
  page?: number;
  started_at?: string;
  completed_at?: string;
  last_error?: string;
  errors?: number;
  updated_at?: string;
}

interface FullStatus {
  customers: SyncStatus;
  orders: SyncStatus;
}

function StatusCard({ 
  title, 
  icon: Icon, 
  status, 
  onStart,
  onResume,
  loading 
}: { 
  title: string, 
  icon: any, 
  status: SyncStatus, 
  onStart: () => void,
  onResume: () => void,
  loading: boolean
}) {
  const isRunning = status.status === 'running';
  const progress = status.total > 0 ? (status.processed / status.total) * 100 : 0;
  
  // Check if stuck (no update for > 15 seconds)
  const isStuck = isRunning && status.updated_at && (Date.now() - new Date(status.updated_at).getTime() > 15000);

  return (
    <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/10 rounded-lg">
            <Icon className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold text-foreground">{title}</h3>
            <p className="text-xs text-muted-foreground">
              {status.status === 'idle' && 'Aguardando início'}
              {status.status === 'running' && !isStuck && 'Em progresso...'}
              {isStuck && 'Pausado / Interrompido'}
              {status.status === 'completed' && 'Concluído'}
              {status.status === 'error' && 'Erro encontrado'}
            </p>
          </div>
        </div>
        <Badge variant={
          status.status === 'completed' ? 'success' : 
          status.status === 'error' ? 'destructive' : 
          isStuck ? 'warning' :
          status.status === 'running' ? 'secondary' : 'outline'
        }>
          {isStuck ? 'PAUSADO' : status.status.toUpperCase()}
        </Badge>
      </div>

      <div className="space-y-4">
        <div>
          <div className="flex justify-between text-xs text-muted-foreground mb-1.5">
            <span>Progresso</span>
            <span>{status.processed} de {status.total}</span>
          </div>
          <Progress value={progress} className="h-2" />
          {status.updated_at && isRunning && (
             <p className="text-[10px] text-muted-foreground mt-1 text-right">
               Última atualização: {new Date(status.updated_at).toLocaleTimeString()}
             </p>
          )}
        </div>

        {status.status === 'error' && (
           <div className="bg-destructive/10 text-destructive text-xs p-3 rounded-md flex items-start gap-2">
             <AlertTriangle className="w-4 h-4 shrink-0" />
             <p>{status.last_error || 'Erro desconhecido durante o processo'}</p>
           </div>
        )}

        <div className="pt-2">
          {!isRunning ? (
            <Button 
              className="w-full" 
              onClick={onStart} 
              disabled={loading || isRunning}
            >
              <Play className="w-4 h-4 mr-2" />
              {status.processed > 0 ? 'Reiniciar Backup' : 'Iniciar Backup'}
            </Button>
          ) : isStuck ? (
            <Button 
              className="w-full" 
              variant="outline"
              onClick={onResume} 
              disabled={loading}
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Retomar Backup
            </Button>
          ) : (
             <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground bg-muted/30 py-2 rounded-md animate-pulse">
               <Loader2 className="w-4 h-4 animate-spin" />
               Sincronizando...
             </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function MagentoMigrationPage() {
  const [status, setStatus] = useState<FullStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [polling, setPolling] = useState(false);

  const fetchStatus = async () => {
    try {
      const res = await fetch(`${API_BASE}/status`, {
        headers: { Authorization: `Bearer ${publicAnonKey}` }
      });
      const data = await res.json();
      setStatus(data);
      
      // Determine if we need to keep polling
      const isRunning = data.customers.status === 'running' || data.orders.status === 'running';
      if (isRunning && !polling) {
        setPolling(true);
      } else if (!isRunning && polling) {
        setPolling(false);
      }
    } catch (e) {
      console.error('Status fetch error:', e);
    }
  };

  // Initial load
  useEffect(() => {
    fetchStatus();
  }, []);

  // Polling effect
  useEffect(() => {
    let interval: any;
    if (polling) {
      interval = setInterval(fetchStatus, 3000); // Poll every 3s
    }
    return () => clearInterval(interval);
  }, [polling]);

  // Start Sync Logic
  const startSync = async (type: 'customers' | 'orders') => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/${type}/start`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${publicAnonKey}` }
      });
      if (!res.ok) throw new Error('Falha ao iniciar');
      
      toast.success(`Backup de ${type === 'customers' ? 'clientes' : 'pedidos'} iniciado`);
      await fetchStatus();
      setPolling(true);
      
      // Kick off the loop immediately
      processNextStep(type);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  // Step Loop
  const processNextStep = async (type: 'customers' | 'orders') => {
    try {
      const res = await fetch(`${API_BASE}/${type}/step`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${publicAnonKey}` }
      });
      
      const data = await res.json();
      
      if (data.message === 'step_done') {
        // Continue loop
        setTimeout(() => processNextStep(type), 500); // Small delay to be nice
      } else if (data.message === 'completed') {
        toast.success(`Backup de ${type === 'customers' ? 'clientes' : 'pedidos'} finalizado com sucesso!`);
        fetchStatus();
      } else {
        // Stop polling if error or unknown state
        fetchStatus();
      }
    } catch (e) {
      console.error(`Step error (${type}):`, e);
      // Wait and retry status to see if backend marked as error
      setTimeout(fetchStatus, 2000);
    }
  };

  // Resume Sync (Just restart the loop without resetting cursor)
  const resumeSync = (type: 'customers' | 'orders') => {
    toast.info(`Retomando backup de ${type === 'customers' ? 'clientes' : 'pedidos'}...`);
    setPolling(true);
    processNextStep(type);
  };

  if (!status) return (
    <div className="flex h-96 items-center justify-center">
      <Loader2 className="w-8 h-8 animate-spin text-primary" />
    </div>
  );

  return (
    <div className="max-w-[1000px] mx-auto px-4 lg:px-6 pt-6 pb-12 space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Database className="w-6 h-6" /> Migração de Dados (Backup)
        </h1>
        <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
          Ferramenta de backup completo do Magento para o Supabase Storage.
          Isso fará o download de todos os registros (RAW JSON) e salvará em nosso bucket seguro 
          para desativação do Magento legado.
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <StatusCard 
          title="Backup de Clientes" 
          icon={Server} 
          status={status.customers}
          onStart={() => startSync('customers')}
          onResume={() => resumeSync('customers')}
          loading={loading}
        />
        
        <StatusCard 
          title="Backup de Pedidos" 
          icon={Download} 
          status={status.orders}
          onStart={() => startSync('orders')}
          onResume={() => resumeSync('orders')}
          loading={loading}
        />
      </div>

      <div className="bg-muted/30 border border-border rounded-lg p-4">
        <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-green-500" />
            Detalhes do Armazenamento
        </h4>
        <ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside">
            <li>Os arquivos são salvos no bucket <code>make-1d6e33e0-magento-backup</code>.</li>
            <li>Formato: <code>customers/ID.json</code> e <code>orders/ID.json</code>.</li>
            <li>Backup incremental: Se o registro já existir, será atualizado.</li>
            <li>Metadados essenciais são indexados no KV Store para busca rápida.</li>
        </ul>
      </div>
    </div>
  );
}
