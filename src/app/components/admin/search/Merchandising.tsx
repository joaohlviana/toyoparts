import React, { useState, useEffect } from 'react';
import { 
  Target, 
  ArrowUpCircle, 
  ArrowDownCircle, 
  Pin, 
  Plus, 
  Search, 
  Trash2, 
  Calendar,
  Zap,
  Tag,
  Package,
  ArrowRight,
  ExternalLink,
  ChevronRight
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Card } from '../../base/card';
import { Button } from '../../base/button';
import { Badge } from '../../base/badge';
import { Input } from '../../ui/input';
import { searchApi } from '../../../lib/search-api';
import { toast } from 'sonner';

export function Merchandising() {
  const [activeTab, setActiveTab] = useState<'pins' | 'boosts'>('pins');
  const [pins, setPins] = useState<any[]>([]);
  const [boosts, setBoosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  async function loadRules() {
    try {
      const data = await searchApi.getMerchRules();
      setPins(data.pins || []);
      setBoosts(data.rules || []);
    } catch (error) {
      console.error(error);
      toast.error('Failed to load merchandising rules');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadRules();
  }, []);

  async function saveRules(newPins: any[], newBoosts: any[]) {
     try {
       await searchApi.saveMerchRules({ pins: newPins, rules: newBoosts });
       setPins(newPins);
       setBoosts(newBoosts);
       toast.success('Rules saved successfully');
     } catch (err) {
       console.error(err);
       toast.error('Failed to save rules');
     }
  }

  const handleAddBoost = () => {
    const newRule = { 
       id: Date.now().toString(), 
       name: 'Nova Regra', 
       type: 'boost', 
       weight: '+1.0', 
       attribute: 'attribute == "value"', 
       active: true 
    };
    saveRules(pins, [...boosts, newRule]);
  };

  const handleDeleteBoost = (id: string) => {
    saveRules(pins, boosts.filter(b => b.id !== id));
  };

  const handleAddPin = () => {
     // Mock adding a pin for demo purposes since we don't have a product picker modal yet
     const newPin = {
        id: Date.now().toString(),
        query: 'exemplo',
        products: [{ name: 'Produto Exemplo', sku: 'EXP-001' }]
     };
     saveRules([...pins, newPin], boosts);
  };
  
  const handleDeletePin = (id: string) => {
    saveRules(pins.filter(p => p.id !== id), boosts);
  };

  if (loading) return <div className="p-10 text-center">Carregando regras...</div>;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col gap-1">
        <h2 className="text-2xl font-bold tracking-tight text-[#1d1d1f] dark:text-white">Merchandising de Busca</h2>
        <p className="text-[#86868b] text-sm">Controle o que aparece no topo através de curadoria e regras de negócio.</p>
      </div>

      <div className="flex items-center gap-1 p-1 bg-black/[0.03] dark:bg-white/[0.03] rounded-xl w-fit">
        <button 
          onClick={() => setActiveTab('pins')}
          className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${activeTab === 'pins' ? 'bg-white dark:bg-[#111] shadow-sm text-primary' : 'text-[#86868b]'}`}
        >
          Pins (Fixados)
        </button>
        <button 
          onClick={() => setActiveTab('boosts')}
          className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${activeTab === 'boosts' ? 'bg-white dark:bg-[#111] shadow-sm text-primary' : 'text-[#86868b]'}`}
        >
          Boost & Bury
        </button>
      </div>

      <AnimatePresence mode="wait">
        {activeTab === 'pins' ? (
          <motion.div 
            key="pins"
            initial={{ opacity: 0, x: -10 }} 
            animate={{ opacity: 1, x: 0 }} 
            exit={{ opacity: 0, x: 10 }}
            className="space-y-6"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-[#1d1d1f] dark:text-white uppercase tracking-wider flex items-center gap-2">
                <Pin className="w-4 h-4 text-rose-500" /> Produtos Fixados por Query
              </h3>
              <Button onClick={handleAddPin} className="h-8 text-[11px] font-bold gap-1.5">
                <Plus className="w-3.5 h-3.5" /> Novo Pin (Demo)
              </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {pins.length === 0 && <div className="col-span-2 text-center py-10 text-gray-500">Nenhum pin cadastrado.</div>}
              {pins.map((pin) => (
                <Card.Root key={pin.id} className="border-black/[0.05] bg-white dark:bg-[#111]">
                  <Card.Header className="pb-3 border-b border-black/[0.03]">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Search className="w-3.5 h-3.5 text-[#86868b]" />
                        <span className="text-sm font-bold text-[#1d1d1f] dark:text-white italic">"{pin.query}"</span>
                      </div>
                      <Button variant="ghost" size="sm" onClick={() => handleDeletePin(pin.id)} className="h-7 w-7 p-0 hover:text-rose-500">
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </Card.Header>
                  <Card.Content className="p-4 space-y-3">
                    {pin.products.map((prod: any, idx: number) => (
                      <div key={idx} className="flex items-center justify-between group">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-[#f5f5f7] dark:bg-black/20 flex items-center justify-center text-[10px] font-bold text-[#86868b]">
                            {idx + 1}
                          </div>
                          <div>
                            <p className="text-xs font-semibold text-[#1d1d1f] dark:text-white">{prod.name}</p>
                            <p className="text-[10px] text-[#86868b] uppercase tracking-tighter">{prod.sku}</p>
                          </div>
                        </div>
                        <ChevronRight className="w-3 h-3 text-[#d2d2d7] group-hover:text-primary transition-colors" />
                      </div>
                    ))}
                    <button className="w-full h-8 mt-2 rounded-lg border border-dashed border-black/[0.1] hover:border-primary/40 hover:bg-primary/5 transition-all flex items-center justify-center gap-2 text-[10px] font-bold text-[#86868b] hover:text-primary">
                      <Plus className="w-3 h-3" /> Adicionar Produto
                    </button>
                  </Card.Content>
                </Card.Root>
              ))}
            </div>
          </motion.div>
        ) : (
          <motion.div 
            key="boosts"
            initial={{ opacity: 0, x: -10 }} 
            animate={{ opacity: 1, x: 0 }} 
            exit={{ opacity: 0, x: 10 }}
            className="space-y-6"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-[#1d1d1f] dark:text-white uppercase tracking-wider flex items-center gap-2">
                <ArrowUpCircle className="w-4 h-4 text-emerald-500" /> Regras de Impulsionamento (Global)
              </h3>
              <Button onClick={handleAddBoost} className="h-8 text-[11px] font-bold gap-1.5">
                <Plus className="w-3.5 h-3.5" /> Nova Regra
              </Button>
            </div>

            <Card.Root className="border-black/[0.05] bg-white dark:bg-[#111] overflow-hidden">
              <Card.Content className="p-0">
                <div className="divide-y divide-black/[0.03]">
                  {boosts.length === 0 && <div className="p-10 text-center text-gray-500">Nenhuma regra de boost cadastrada.</div>}
                  {boosts.map((rule) => (
                    <div key={rule.id} className={`p-5 flex items-center justify-between hover:bg-black/[0.01] transition-colors ${!rule.active ? 'opacity-50 grayscale' : ''}`}>
                      <div className="flex items-center gap-4">
                        <div className={`w-10 h-10 rounded-2xl flex items-center justify-center ${rule.type === 'boost' ? 'bg-emerald-500/10 text-emerald-600' : 'bg-rose-500/10 text-rose-600'}`}>
                          {rule.type === 'boost' ? <ArrowUpCircle className="w-5 h-5" /> : <ArrowDownCircle className="w-5 h-5" />}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold text-[#1d1d1f] dark:text-white">{rule.name}</span>
                            <Badge variant="pill-color" color={rule.type === 'boost' ? 'success' : 'error'} className="text-[10px] h-4 font-bold">{rule.weight}</Badge>
                          </div>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-[10px] font-medium text-[#86868b] font-mono bg-black/[0.03] px-1.5 py-0.5 rounded uppercase tracking-tighter italic">WHERE {rule.attribute}</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="flex flex-col items-end gap-1 mr-4">
                          <span className="text-[10px] font-bold text-[#86868b] uppercase tracking-widest">Status</span>
                          <span className={`text-[10px] font-bold ${rule.active ? 'text-emerald-500' : 'text-[#86868b]'}`}>{rule.active ? 'ATIVO' : 'PAUSADO'}</span>
                        </div>
                        <Button onClick={() => handleDeleteBoost(rule.id)} variant="outline" size="sm" className="h-8 w-8 p-0 rounded-lg">
                          <Trash2 className="w-3.5 h-3.5 text-[#86868b]" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </Card.Content>
            </Card.Root>

            <div className="p-6 bg-blue-500/5 rounded-3xl border border-blue-500/10 flex items-start gap-4">
              <div className="w-10 h-10 rounded-2xl bg-blue-500/10 flex items-center justify-center shrink-0">
                <Zap className="w-5 h-5 text-blue-500" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-blue-700">Como funciona o Boost?</h4>
                <p className="text-xs text-blue-600/80 mt-1 leading-relaxed max-w-2xl">
                  As regras de Boost aplicam um multiplicador no ranking score final. Regras com peso positivo (+X) sobem o produto, 
                  enquanto regras com peso negativo (-X ou "Bury") jogam o produto para o final da lista, independente da relevância do termo.
                </p>
                <button className="mt-3 text-[10px] font-bold text-blue-700 flex items-center gap-1 hover:underline">
                  Ver documentação completa <ExternalLink className="w-3 h-3" />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
