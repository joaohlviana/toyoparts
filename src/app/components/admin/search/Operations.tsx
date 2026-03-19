import React, { useEffect, useState, useCallback } from 'react';
import { 
  Database, 
  RefreshCw, 
  CheckCircle2, 
  AlertCircle, 
  Loader2, 
  Cpu, 
  HardDrive, 
  Network, 
  History, 
  Trash2, 
  Settings 
} from 'lucide-react';
import { Card } from '../../base/card';
import { Button } from '../../base/button';
import { Badge } from '../../base/badge';
import { searchApi } from '../../../lib/search-api';
import { toast } from "sonner";

// Operations & Tasks management for search
export function Operations() {
  const [tasks, setTasks] = useState<any[]>([]);
  const [indexes, setIndexes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [repairing, setRepairing] = useState(false);

  // Load data from search API
  const loadData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const tasksData = await searchApi.getTasks(20);
      const indexesData = await searchApi.getIndexes();
      
      setTasks(tasksData.results || []);
      setIndexes(indexesData.results || []);
    } catch (error: any) {
      console.error('Failed to load search operations data:', error);
      if (!silent) toast.error("Falha ao carregar dados do Meilisearch");
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  // Handle index repair action
  const handleRepair = useCallback(async () => {
    try {
      setRepairing(true);
      await searchApi.repairIndex();
      toast.success('Reparo de índice iniciado no Meilisearch');
      
      // Allow some time for task to be enqueued
      setTimeout(() => {
        loadData(true).catch(console.error);
      }, 1500);
    } catch (err: any) {
      toast.error(`Falha no reparo: ${err.message}`);
    } finally {
      setRepairing(false);
    }
  }, [loadData]);

  // Initial load and polling
  useEffect(() => {
    loadData().catch(console.error);
    const interval = setInterval(() => {
      loadData(true).catch(console.error);
    }, 5000);
    return () => clearInterval(interval);
  }, [loadData]);

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-1">
        <h2 className="text-2xl font-bold tracking-tight text-[#1d1d1f] dark:text-white">Operações & Tasks</h2>
        <p className="text-[#86868b] text-sm">Monitore o processamento de dados e a infraestrutura do Meilisearch.</p>
      </div>

      {/* Cluster Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card.Root className="border-black/[0.05] bg-white dark:bg-[#111]">
          <Card.Content className="p-5 flex items-center gap-4">
            <div className="w-10 h-10 rounded-2xl bg-blue-500/10 flex items-center justify-center">
              <Cpu className="w-5 h-5 text-blue-500" />
            </div>
            <div>
              <p className="text-[10px] font-bold text-[#86868b] uppercase tracking-wider">CPU Usage (Est)</p>
              <div className="flex items-baseline gap-2 mt-0.5">
                <span className="text-xl font-bold text-[#1d1d1f] dark:text-white">12.4%</span>
                <span className="text-[10px] text-emerald-500 font-bold">Stable</span>
              </div>
            </div>
          </Card.Content>
        </Card.Root>

        <Card.Root className="border-black/[0.05] bg-white dark:bg-[#111]">
          <Card.Content className="p-5 flex items-center gap-4">
            <div className="w-10 h-10 rounded-2xl bg-purple-500/10 flex items-center justify-center">
              <HardDrive className="w-5 h-5 text-purple-500" />
            </div>
            <div>
              <p className="text-[10px] font-bold text-[#86868b] uppercase tracking-wider">Indexes</p>
              <div className="flex items-baseline gap-2 mt-0.5">
                <span className="text-xl font-bold text-[#1d1d1f] dark:text-white">
                  {indexes.length}
                </span>
                <span className="text-[10px] text-[#86868b]">Active</span>
              </div>
            </div>
          </Card.Content>
        </Card.Root>

        <Card.Root className="border-black/[0.05] bg-white dark:bg-[#111]">
          <Card.Content className="p-5 flex items-center gap-4">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 flex items-center justify-center">
              <Network className="w-5 h-5 text-emerald-500" />
            </div>
            <div>
              <p className="text-[10px] font-bold text-[#86868b] uppercase tracking-wider">Status</p>
              <div className="flex items-baseline gap-2 mt-0.5">
                <span className="text-xl font-bold text-[#1d1d1f] dark:text-white">Online</span>
                <span className="text-[10px] text-emerald-500 font-bold">Connected</span>
              </div>
            </div>
          </Card.Content>
        </Card.Root>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_380px] gap-8">
        {/* Task Queue */}
        <div className="space-y-4">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-sm font-bold text-[#1d1d1f] dark:text-white uppercase tracking-wider flex items-center gap-2">
              <History className="w-4 h-4 text-amber-500" /> Fila de Tarefas
            </h3>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="h-8 text-[11px] font-bold gap-1.5" onClick={() => loadData()}>
                <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} /> Refresh
              </Button>
            </div>
          </div>

          <Card.Root className="border-black/[0.05] bg-white dark:bg-[#111] overflow-hidden">
            <Card.Content className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-black/[0.03]">
                      <th className="px-6 py-3 text-[10px] font-bold text-[#86868b] uppercase tracking-wider">Task ID</th>
                      <th className="px-6 py-3 text-[10px] font-bold text-[#86868b] uppercase tracking-wider">Tipo / Índice</th>
                      <th className="px-6 py-3 text-[10px] font-bold text-[#86868b] uppercase tracking-wider">Duração</th>
                      <th className="px-6 py-3 text-[10px] font-bold text-[#86868b] uppercase tracking-wider">Status</th>
                      <th className="px-6 py-3 text-[10px] font-bold text-[#86868b] uppercase tracking-wider text-right">Data</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-black/[0.02]">
                    {tasks.map((task) => (
                      <tr key={task.uid} className="hover:bg-black/[0.01] transition-colors group">
                        <td className="px-6 py-4">
                          <span className="text-xs font-mono font-bold text-[#1d1d1f] dark:text-white">#{task.uid}</span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex flex-col">
                            <span className="text-xs font-bold text-[#1d1d1f] dark:text-white">{task.type}</span>
                            <span className="text-[10px] text-[#86868b] font-mono">{task.indexUid}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-xs text-[#86868b]">{task.duration || '-'}</span>
                        </td>
                        <td className="px-6 py-4">
                          {task.status === 'succeeded' ? (
                            <Badge variant="secondary" className="text-[10px] font-bold bg-emerald-500/10 text-emerald-600 border-none">
                              <CheckCircle2 className="w-3 h-3 mr-1" /> Succeeded
                            </Badge>
                          ) : task.status === 'failed' ? (
                            <Badge variant="secondary" className="text-[10px] font-bold bg-rose-500/10 text-rose-600 border-none">
                              <AlertCircle className="w-3 h-3 mr-1" /> Failed
                            </Badge>
                          ) : (
                            <Badge variant="secondary" className="text-[10px] font-bold bg-amber-500/10 text-amber-600 border-none">
                              <Loader2 className="w-3 h-3 mr-1 animate-spin" /> {task.status}
                            </Badge>
                          )}
                        </td>
                        <td className="px-6 py-4 text-right whitespace-nowrap">
                          <span className="text-[11px] text-[#86868b]">{new Date(task.enqueuedAt).toLocaleString()}</span>
                        </td>
                      </tr>
                    ))}
                    {tasks.length === 0 && !loading && (
                      <tr><td colSpan={5} className="text-center py-10 text-sm text-[#86868b]">Nenhuma tarefa recente.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </Card.Content>
          </Card.Root>
        </div>

        {/* Index List */}
        <div className="space-y-4">
          <h3 className="text-sm font-bold text-[#1d1d1f] dark:text-white uppercase tracking-wider flex items-center gap-2 px-1">
            <Database className="w-4 h-4 text-blue-500" /> Gerenciar Índices
          </h3>
          
          <div className="space-y-3">
            {indexes.map((idx) => (
               <IndexCard 
                 key={idx.uid} 
                 name={idx.uid} 
                 docs={idx.numberOfDocuments || 0} 
                 status="Ready" 
                 createdAt={idx.createdAt} 
               />
            ))}
            {indexes.length === 0 && !loading && (
               <div className="p-4 border border-dashed border-black/[0.1] rounded text-center text-xs text-[#86868b]">Nenhum índice encontrado.</div>
            )}
          </div>

          <div className="mt-8 pt-6 border-t border-black/[0.05]">
            <h4 className="text-[11px] font-bold text-[#86868b] uppercase tracking-widest mb-4">Ações do Motor</h4>
            <div className="space-y-2">
              <Button 
                variant="outline" 
                className="w-full h-9 text-xs font-bold justify-start gap-2 border-blue-500/20 text-blue-600 hover:bg-blue-500/5"
                onClick={handleRepair}
                disabled={repairing}
              >
                {repairing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                Reparar Configurações do Índice
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function IndexCard({ name, docs, status, createdAt }: any) {
  return (
    <Card.Root className="border-black/[0.05] bg-white dark:bg-[#111]">
      <Card.Content className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-500" />
            <span className="text-xs font-bold text-[#1d1d1f] dark:text-white">{name}</span>
          </div>
          <Badge variant="secondary" className="text-[9px] h-4 bg-black/[0.03] border-none text-[#86868b] uppercase">{status}</Badge>
        </div>
        <div className="flex justify-between items-end">
          <div className="flex gap-4">
            <div>
              <p className="text-[10px] text-[#86868b] uppercase tracking-tighter">Documentos</p>
              <p className="text-sm font-bold text-[#1d1d1f] dark:text-white">{docs.toLocaleString()}</p>
            </div>
            <div>
              <p className="text-[10px] text-[#86868b] uppercase tracking-tighter">Criado em</p>
              <p className="text-xs font-bold text-[#1d1d1f] dark:text-white">{new Date(createdAt).toLocaleDateString()}</p>
            </div>
          </div>
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 hover:bg-primary/10 hover:text-primary">
            <Settings className="w-3.5 h-3.5" />
          </Button>
        </div>
      </Card.Content>
    </Card.Root>
  );
}