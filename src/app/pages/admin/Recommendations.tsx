import React, { useState } from 'react';
import { 
  Sparkles, 
  Target, 
  History, 
  Settings, 
  Zap,
  ShoppingBag,
  CreditCard,
  User,
  ArrowRight,
  Package
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Card } from '../../components/base/card';
import { Button } from '../../components/base/button';
import { Badge } from '../../components/base/badge';
import { Switch } from '../../components/ui/switch';
import { Input } from '../../components/ui/input';
import { analyticsApi } from '../../lib/analytics-api';

export function Recommendations() {
  const [activeTab, setActiveTab] = useState<'strategies' | 'simulator'>('strategies');
  const [simulatorUser, setSimulatorUser] = useState('user_123');
  const [simulationResult, setSimulationResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const handleSimulate = async () => {
    setLoading(true);
    try {
      // Fetch session state + recommendations
      const session = await analyticsApi.getSession(simulatorUser);
      const continueWatching = await analyticsApi.getContinueWatching(simulatorUser);
      
      setSimulationResult({
        session,
        recommendations: {
           continue: continueWatching
        }
      });
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col gap-1">
        <h2 className="text-2xl font-bold tracking-tight text-[#1d1d1f] dark:text-white flex items-center gap-2">
          <Target className="w-6 h-6 text-purple-500" /> Personalização & Recomendações
        </h2>
        <p className="text-[#86868b] text-sm">Gerencie estratégias de cross-sell, bundles e personalização baseada em comportamento.</p>
      </div>

      <div className="flex items-center gap-1 p-1 bg-black/[0.03] dark:bg-white/[0.03] rounded-xl w-fit">
        <button 
          onClick={() => setActiveTab('strategies')}
          className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${activeTab === 'strategies' ? 'bg-white dark:bg-[#111] shadow-sm text-primary' : 'text-[#86868b]'}`}
        >
          Estratégias Ativas
        </button>
        <button 
          onClick={() => setActiveTab('simulator')}
          className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${activeTab === 'simulator' ? 'bg-white dark:bg-[#111] shadow-sm text-primary' : 'text-[#86868b]'}`}
        >
          Simulador de Sessão
        </button>
      </div>

      <AnimatePresence mode="wait">
        {activeTab === 'strategies' && (
          <motion.div 
            key="strategies"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="grid grid-cols-1 md:grid-cols-2 gap-6"
          >
            <StrategyCard 
              icon={History}
              title="Voltar onde parou"
              description="Mostra últimos produtos vistos e busca recente na Home e Sidebar."
              active={true}
              metrics={{ ctr: '4.2%', revenue: 'R$ 12.4k' }}
            />
            <StrategyCard 
              icon={Package}
              title="Smart Bundles (PDP)"
              description="Sugere kits complementares (ex: disco + pastilha) na página do produto."
              active={true}
              metrics={{ ctr: '1.8%', revenue: 'R$ 8.2k' }}
            />
            <StrategyCard 
              icon={ShoppingBag}
              title="Upsell no Carrinho"
              description="Sugere itens baratos para completar Frete Grátis ou itens esquecidos."
              active={false}
              metrics={{ ctr: '-', revenue: '-' }}
            />
            <StrategyCard 
              icon={Zap}
              title="Cupom Inteligente"
              description="Oferece desconto dinâmico para recuperar abandono de carrinho."
              active={false}
              metrics={{ ctr: '-', revenue: '-' }}
            />
          </motion.div>
        )}

        {activeTab === 'simulator' && (
          <motion.div 
            key="simulator"
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -10 }}
            className="grid grid-cols-1 xl:grid-cols-[300px_1fr] gap-8"
          >
            <div className="space-y-6">
              <Card.Root className="border-black/[0.05] bg-white dark:bg-[#111]">
                 <Card.Header>
                   <Card.Title className="text-sm font-bold">Configurar Simulação</Card.Title>
                 </Card.Header>
                 <Card.Content className="space-y-4">
                   <div className="space-y-2">
                     <label className="text-[10px] font-bold text-[#86868b] uppercase">User ID</label>
                     <Input value={simulatorUser} onChange={(e) => setSimulatorUser(e.target.value)} />
                   </div>
                   <Button onClick={handleSimulate} disabled={loading} className="w-full font-bold">
                     {loading ? 'Simulando...' : 'Rodar Simulação'}
                   </Button>
                 </Card.Content>
              </Card.Root>

              <div className="p-4 bg-purple-500/5 border border-purple-500/10 rounded-xl">
                <div className="flex items-center gap-2 mb-2">
                  <Sparkles className="w-4 h-4 text-purple-500" />
                  <span className="text-xs font-bold text-purple-700">Dica Pro</span>
                </div>
                <p className="text-[10px] text-purple-600/80 leading-relaxed">
                  Use o userId "user_123" para ver dados mockados ou navegue na loja e use seu próprio ID (se implementado auth).
                </p>
              </div>
            </div>

            <div className="space-y-6">
              {simulationResult ? (
                <>
                  <Card.Root className="border-black/[0.05] bg-white dark:bg-[#111]">
                    <Card.Header>
                      <Card.Title className="text-xs font-bold text-[#86868b] uppercase tracking-wider flex items-center gap-2">
                        <User className="w-3.5 h-3.5" /> Estado da Sessão (Supabase KV)
                      </Card.Title>
                    </Card.Header>
                    <Card.Content className="font-mono text-[11px] bg-[#f5f5f7] dark:bg-black/20 m-4 rounded-xl p-4 overflow-x-auto">
                      <pre>{JSON.stringify(simulationResult.session, null, 2)}</pre>
                    </Card.Content>
                  </Card.Root>

                  <Card.Root className="border-black/[0.05] bg-white dark:bg-[#111]">
                    <Card.Header>
                      <Card.Title className="text-xs font-bold text-[#86868b] uppercase tracking-wider flex items-center gap-2">
                        <Target className="w-3.5 h-3.5 text-purple-500" /> Resultado: "Continue Watching"
                      </Card.Title>
                    </Card.Header>
                    <Card.Content className="p-4">
                      {simulationResult.recommendations?.continue?.items?.length > 0 ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                          {simulationResult.recommendations.continue.items.map((item: any) => (
                            <div key={item.id} className="p-3 border border-black/[0.05] rounded-xl flex items-center gap-3">
                              <div className="w-10 h-10 bg-[#f5f5f7] rounded-lg flex items-center justify-center text-[9px] font-bold text-[#86868b]">IMG</div>
                              <div>
                                <div className="text-xs font-bold text-[#1d1d1f] dark:text-white line-clamp-1">{item.name}</div>
                                <div className="text-[10px] text-[#86868b]">{item.sku}</div>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-center py-8 text-xs text-[#86868b]">Nenhuma recomendação gerada (Cold Start).</div>
                      )}
                    </Card.Content>
                  </Card.Root>
                </>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-[#86868b] border-2 border-dashed border-black/[0.05] rounded-3xl min-h-[300px]">
                  <Target className="w-8 h-8 mb-3 opacity-20" />
                  <p className="text-xs">Execute uma simulação para ver os resultados.</p>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function StrategyCard({ icon: Icon, title, description, active, metrics }: any) {
  return (
    <Card.Root className="border-black/[0.05] bg-white dark:bg-[#111] overflow-hidden">
      <Card.Content className="p-6">
        <div className="flex justify-between items-start mb-4">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${active ? 'bg-purple-500/10 text-purple-500' : 'bg-black/[0.03] text-[#86868b]'}`}>
            <Icon className="w-5 h-5" />
          </div>
          <Switch checked={active} />
        </div>
        <h3 className="text-sm font-bold text-[#1d1d1f] dark:text-white mb-1">{title}</h3>
        <p className="text-xs text-[#86868b] leading-relaxed mb-4 h-10">{description}</p>
        
        <div className="flex items-center gap-4 pt-4 border-t border-black/[0.03]">
          <div>
            <span className="text-[9px] font-bold text-[#86868b] uppercase tracking-wider block">CTR</span>
            <span className="text-xs font-bold text-[#1d1d1f] dark:text-white">{metrics.ctr}</span>
          </div>
          <div>
            <span className="text-[9px] font-bold text-[#86868b] uppercase tracking-wider block">Receita (30d)</span>
            <span className="text-xs font-bold text-[#1d1d1f] dark:text-white">{metrics.revenue}</span>
          </div>
          <Button variant="ghost" size="sm" className="ml-auto h-7 text-[10px] font-bold">Configurar</Button>
        </div>
      </Card.Content>
    </Card.Root>
  );
}
