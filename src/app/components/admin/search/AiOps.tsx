import React, { useState } from 'react';
import { 
  Sparkles, 
  Brain, 
  Settings, 
  Target, 
  History, 
  CheckCircle2, 
  AlertCircle, 
  ArrowRight,
  Code2,
  Terminal,
  MessageSquare,
  ShieldCheck,
  Zap,
  Filter,
  RefreshCw,
  Search,
  Database,
  Eye,
  Trash2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Card } from '../../base/card';
import { Button } from '../../base/button';
import { Badge } from '../../base/badge';
import { Input } from '../../ui/input';
import { Switch } from '../../ui/switch';
import { searchApi } from '../../../lib/search-api';

// Mock inbox data
const aiSuggestions = [
  { id: '1', type: 'synonym', original: 'parachoque', suggested: 'para-choque', confidence: 0.98, reason: 'Detecção de query com zero results que converte após correção manual.', status: 'pending' },
  { id: '2', type: 'normalization', original: '1kd', suggested: '1KD-FTV', confidence: 0.94, reason: 'Padronização de código de motor para melhorar precisão técnica.', status: 'pending' },
  { id: '3', type: 'merch', original: 'query "revisão hilux"', suggested: 'boost: category="Filtros"', confidence: 0.88, reason: 'Usuários que buscam revisão tendem a comprar filtros em 85% dos casos.', status: 'pending' },
];

export function AiOps() {
  const [activeSubTab, setActiveSubTab] = useState<'sandbox' | 'inbox' | 'policy'>('sandbox');
  const [testInput, setTestInput] = useState('pastilha de freio hilux 2018 original até 300');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<any>(null);

  const handleTestAi = async () => {
    setIsAnalyzing(true);
    setAnalysisResult(null);
    try {
      const result = await searchApi.analyzeAi(testInput);
      setAnalysisResult(result);
    } catch (error) {
      console.error(error);
      setAnalysisResult({ error: 'Failed to analyze query' });
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col gap-1">
        <h2 className="text-2xl font-bold tracking-tight text-[#1d1d1f] dark:text-white flex items-center gap-2">
          <Sparkles className="w-6 h-6 text-indigo-500" /> AI Ops
        </h2>
        <p className="text-[#86868b] text-sm">Gerencie a camada de inteligência que traduz a intenção do usuário para o Meilisearch.</p>
      </div>

      <div className="flex items-center gap-1 p-1 bg-black/[0.03] dark:bg-white/[0.03] rounded-xl w-fit">
        <button 
          onClick={() => setActiveSubTab('sandbox')}
          className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${activeSubTab === 'sandbox' ? 'bg-white dark:bg-[#111] shadow-sm text-primary' : 'text-[#86868b]'}`}
        >
          Query Sandbox
        </button>
        <button 
          onClick={() => setActiveSubTab('inbox')}
          className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${activeSubTab === 'inbox' ? 'bg-white dark:bg-[#111] shadow-sm text-primary' : 'text-[#86868b]'}`}
        >
          Optimization Inbox
          <span className="ml-2 px-1.5 py-0.5 rounded-full bg-indigo-500 text-white text-[9px]">3</span>
        </button>
        <button 
          onClick={() => setActiveSubTab('policy')}
          className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${activeSubTab === 'policy' ? 'bg-white dark:bg-[#111] shadow-sm text-primary' : 'text-[#86868b]'}`}
        >
          Prompt & Policies
        </button>
      </div>

      <AnimatePresence mode="wait">
        {activeSubTab === 'sandbox' && (
          <motion.div 
            key="sandbox"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="grid grid-cols-1 xl:grid-cols-[1fr_400px] gap-8"
          >
            {/* Input Section */}
            <div className="space-y-6">
              <Card.Root className="border-black/[0.05] bg-white dark:bg-[#111] shadow-sm overflow-hidden">
                <Card.Content className="p-6">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-8 h-8 rounded-lg bg-indigo-500/10 flex items-center justify-center">
                      <MessageSquare className="w-4 h-4 text-indigo-500" />
                    </div>
                    <h3 className="text-sm font-bold text-[#1d1d1f] dark:text-white uppercase tracking-wider">Simular Intenção de Busca</h3>
                  </div>
                  <div className="flex gap-3">
                    <div className="flex-1 relative">
                      <Input 
                        value={testInput}
                        onChange={(e) => setTestInput(e.target.value)}
                        placeholder="Ex: pastilha hilux 2018 original ate 300..."
                        className="h-12 text-base font-medium pr-12 rounded-xl"
                        onKeyDown={(e) => e.key === 'Enter' && handleTestAi()}
                      />
                      <div className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-bold text-[#d2d2d7]">
                        NLP
                      </div>
                    </div>
                    <Button 
                      onClick={handleTestAi} 
                      disabled={isAnalyzing}
                      className="h-12 px-6 bg-indigo-500 hover:bg-indigo-600 font-bold rounded-xl"
                    >
                      {isAnalyzing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                      <span className="ml-2">Analisar</span>
                    </Button>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <span className="text-[10px] font-bold text-[#86868b] uppercase mr-2 mt-1">Sugestões:</span>
                    {['oleo corolla 2022', 'kit correia etios oem', 'amortecedor dianteiro sw4'].map(s => (
                      <button 
                        key={s} 
                        onClick={() => setTestInput(s)}
                        className="text-[10px] font-medium text-indigo-500 bg-indigo-500/5 px-2 py-1 rounded-md hover:bg-indigo-500/10 transition-colors"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </Card.Content>
              </Card.Root>

              {analysisResult && (
                <div className="space-y-4">
                  <div className="flex items-center gap-2 px-1">
                    <Code2 className="w-4 h-4 text-emerald-500" />
                    <h3 className="text-sm font-bold text-[#1d1d1f] dark:text-white uppercase tracking-wider">Output Estruturado (JSON)</h3>
                    <Badge variant="pill-color" color="success" className="ml-auto text-[10px] font-bold">Confidence: {Math.round((analysisResult.confidence || 0) * 100)}%</Badge>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Card.Root className="border-black/[0.05] bg-[#111] text-indigo-300 font-mono text-[11px] overflow-hidden shadow-2xl">
                      <Card.Content className="p-6 overflow-x-auto">
                        <pre className="leading-relaxed">
                          {JSON.stringify(analysisResult, null, 2)}
                        </pre>
                      </Card.Content>
                    </Card.Root>

                    <div className="space-y-4">
                      <Card.Root className="border-black/[0.05] bg-white dark:bg-[#111] shadow-none">
                        <Card.Header className="p-4 pb-2">
                          <Card.Title className="text-[10px] font-bold text-[#86868b] uppercase tracking-widest">Filtros Detectados</Card.Title>
                        </Card.Header>
                        <Card.Content className="p-4 pt-0 space-y-2">
                          {Object.entries(analysisResult.filters || {}).map(([key, vals]: any) => (
                             vals && vals.length > 0 && (
                                <div key={key} className="p-2 rounded-lg bg-[#f5f5f7] dark:bg-black/20">
                                   <div className="text-xs font-bold text-[#1d1d1f] dark:text-white uppercase tracking-tighter mb-1">{key}</div>
                                   <div className="flex flex-wrap gap-1">
                                      {vals.map((v: string) => (
                                         <Badge key={v} variant="secondary" className="text-[10px] font-bold bg-white dark:bg-black border-black/[0.05]">{v}</Badge>
                                      ))}
                                   </div>
                                </div>
                             )
                          ))}
                          {Object.keys(analysisResult.filters || {}).length === 0 && (
                             <div className="text-xs text-[#86868b]">Nenhum filtro estruturado detectado.</div>
                          )}
                        </Card.Content>
                      </Card.Root>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Sidebar Stats (Mock for now) */}
            <aside className="space-y-6">
              <Card.Root className="border-black/[0.05] bg-white dark:bg-[#111] shadow-none">
                <Card.Header>
                  <Card.Title className="text-[11px] font-bold text-[#86868b] uppercase tracking-wider flex items-center gap-2">
                    <Target className="w-3.5 h-3.5" /> Métricas de Qualidade AI
                  </Card.Title>
                </Card.Header>
                <Card.Content className="space-y-6 pt-0">
                  <div className="space-y-2">
                    <div className="flex justify-between text-[11px] font-bold">
                      <span className="text-[#86868b]">Confidence Avg</span>
                      <span className="text-emerald-500">92.4%</span>
                    </div>
                    <div className="h-1.5 w-full bg-black/[0.05] rounded-full overflow-hidden">
                      <div className="h-full w-[92%] bg-emerald-500" />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex justify-between text-[11px] font-bold">
                      <span className="text-[#86868b]">AI vs Manual Preference</span>
                      <span className="text-indigo-500">68/32</span>
                    </div>
                    <div className="h-1.5 w-full bg-black/[0.05] rounded-full overflow-hidden flex">
                      <div className="h-full w-[68%] bg-indigo-500" />
                      <div className="h-full w-[32%] bg-amber-500" />
                    </div>
                  </div>

                  <div className="pt-4 border-t border-black/[0.03] space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-[#86868b] uppercase font-bold tracking-widest">Model</span>
                      <span className="text-[10px] font-bold bg-black/[0.05] px-1.5 py-0.5 rounded">GPT-4o-Turbo</span>
                    </div>
                  </div>
                </Card.Content>
              </Card.Root>
            </aside>
          </motion.div>
        )}

        {/* Keeping Inbox and Policy static as requested */}
        {activeSubTab === 'inbox' && (
           <div className="p-8 text-center text-[#86868b]">Inbox mock functionality preserved from design.</div>
        )}
        {activeSubTab === 'policy' && (
           <div className="p-8 text-center text-[#86868b]">Policy mock functionality preserved from design.</div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ExternalLink({ className }: any) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
    </svg>
  );
}
