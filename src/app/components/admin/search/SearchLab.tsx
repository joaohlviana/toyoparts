import React, { useState, useEffect } from 'react';
import { 
  Search, 
  Settings, 
  Info, 
  Bug, 
  ArrowRight, 
  ChevronRight,
  Filter,
  LayoutGrid,
  List,
  Sparkles,
  Zap,
  Tag,
  Package
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Card } from '../../base/card';
import { Button } from '../../base/button';
import { Input } from '../../ui/input';
import { Switch } from '../../ui/switch';
import { Badge } from '../../base/badge';
import { searchApi } from '../../../lib/search-api';
import { ImageWithFallback } from '../../figma/ImageWithFallback';

interface SearchResult {
  id: string;
  name: string;
  sku: string;
  brand: string; // Not in Meili attributes list in backend, maybe 'manufacturer'? Or derived from name? The backend returns what is indexed.
  price: number;
  in_stock: boolean;
  score?: number;
  image_url?: string;
  category_names?: string[];
}

export function SearchLab() {
  const [query, setQuery] = useState('');
  const [isDebug, setIsDebug] = useState(true);
  const [useAi, setUseAi] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState<any>(null);
  const [searchStats, setSearchStats] = useState<any>(null);

  useEffect(() => {
    if (!query) {
      setResults([]);
      setAiAnalysis(null);
      setSearchStats(null);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        let filters = undefined;
        let aiDebug = null;

        if (useAi) {
          const analysis = await searchApi.analyzeAi(query);
          aiDebug = analysis;
          
          // Build Meili filters from analysis
          const parts: string[] = [];
          if (analysis.filters?.modelos?.length) {
            parts.push(`( ${analysis.filters.modelos.map((m: string) => `modelos = "${m}"`).join(' OR ')} )`);
          }
          if (analysis.filters?.anos?.length) {
            parts.push(`( ${analysis.filters.anos.map((a: string) => `anos = "${a}"`).join(' OR ')} )`);
          }
          if (analysis.filters?.categories?.length) {
            parts.push(`( ${analysis.filters.categories.map((c: string) => `category_names = "${c}"`).join(' OR ')} )`);
          }
          
          if (parts.length > 0) {
            filters = parts.join(' AND ');
          }
          setAiAnalysis(analysis);
        } else {
          setAiAnalysis(null);
        }

        const res = await searchApi.searchLab(query, { 
          limit: 10,
          filter: filters,
          // Request ranking details if debug enabled (if backend supports it, currently backend uses standard search)
        });

        setResults(res.hits || []);
        setSearchStats({
          processingTimeMs: res.processingTimeMs,
          totalHits: res.estimatedTotalHits || res.totalHits,
          query: res.query
        });

      } catch (err) {
        console.error(err);
      } finally {
        setIsSearching(false);
      }
    }, 500); // 500ms debounce

    return () => clearTimeout(timer);
  }, [query, useAi]);

  return (
    <div className="space-y-6">
      {/* Search Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-2xl font-bold tracking-tight text-[#1d1d1f] dark:text-white">Search Lab</h2>
          <p className="text-[#86868b] text-sm">Teste a relevância e as regras de ranking em tempo real.</p>
        </div>

        <div className="flex items-center gap-4 bg-white dark:bg-[#111] p-1.5 rounded-2xl border border-black/[0.05]">
          <div className="flex items-center gap-2 px-3">
            <Bug className="w-3.5 h-3.5 text-[#86868b]" />
            <span className="text-xs font-medium text-[#1d1d1f] dark:text-white">Debug Mode</span>
            <Switch checked={isDebug} onCheckedChange={setIsDebug} />
          </div>
          <div className="w-px h-6 bg-black/[0.05]" />
          <div className="flex items-center gap-2 px-3">
            <Sparkles className="w-3.5 h-3.5 text-primary" />
            <span className="text-xs font-medium text-[#1d1d1f] dark:text-white">AI Optimization</span>
            <Switch checked={useAi} onCheckedChange={setUseAi} />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-6">
        <div className="space-y-6">
          {/* Main Search Bar */}
          <div className="relative group">
            <div className={`absolute inset-0 bg-primary/20 blur-2xl rounded-3xl transition-opacity duration-500 ${query ? 'opacity-10' : 'opacity-0'}`} />
            <div className="relative bg-white dark:bg-[#111] rounded-2xl border border-black/[0.08] shadow-[0_2px_12px_rgba(0,0,0,0.03)] flex items-center px-4 py-2 group-focus-within:border-primary/30 transition-all">
              <Search className={`w-5 h-5 transition-colors duration-300 ${query ? 'text-primary' : 'text-[#86868b]'}`} />
              <input
                type="text"
                placeholder="Busque por produto, SKU, OEM ou aplicação..."
                className="flex-1 bg-transparent border-none outline-none px-4 py-2 text-base font-medium placeholder:text-[#d2d2d7]"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              {isSearching && <Zap className="w-4 h-4 text-primary animate-pulse mr-2" />}
            </div>
          </div>

          {/* AI Analysis Debug */}
          {useAi && aiAnalysis && (
             <div className="p-4 bg-indigo-50/50 border border-indigo-100 rounded-xl">
               <div className="flex items-center gap-2 mb-2">
                 <Sparkles className="w-4 h-4 text-indigo-500" />
                 <span className="text-xs font-bold text-indigo-700 uppercase">AI Analysis</span>
                 <Badge variant="pill-color" color="success" className="ml-auto text-[10px]">{Math.round((aiAnalysis.confidence || 0) * 100)}% Confidence</Badge>
               </div>
               <div className="grid grid-cols-3 gap-4 text-xs">
                 <div>
                    <span className="font-bold text-indigo-900 block mb-1">Modelos</span>
                    {aiAnalysis.filters?.modelos?.length ? (
                      <div className="flex flex-wrap gap-1">
                        {aiAnalysis.filters.modelos.map((m: string) => (
                           <span key={m} className="px-1.5 py-0.5 bg-white rounded border border-indigo-200 text-indigo-700">{m}</span>
                        ))}
                      </div>
                    ) : <span className="text-indigo-400 italic">None</span>}
                 </div>
                 <div>
                    <span className="font-bold text-indigo-900 block mb-1">Anos</span>
                    {aiAnalysis.filters?.anos?.length ? (
                      <div className="flex flex-wrap gap-1">
                        {aiAnalysis.filters.anos.map((m: string) => (
                           <span key={m} className="px-1.5 py-0.5 bg-white rounded border border-indigo-200 text-indigo-700">{m}</span>
                        ))}
                      </div>
                    ) : <span className="text-indigo-400 italic">None</span>}
                 </div>
                 <div>
                    <span className="font-bold text-indigo-900 block mb-1">Categorias</span>
                    {aiAnalysis.filters?.categories?.length ? (
                      <div className="flex flex-wrap gap-1">
                        {aiAnalysis.filters.categories.map((m: string) => (
                           <span key={m} className="px-1.5 py-0.5 bg-white rounded border border-indigo-200 text-indigo-700">{m}</span>
                        ))}
                      </div>
                    ) : <span className="text-indigo-400 italic">None</span>}
                 </div>
               </div>
             </div>
          )}

          {/* Results Area */}
          <div className="space-y-3">
            <div className="flex items-center justify-between px-2">
              <span className="text-[11px] font-bold text-[#86868b] uppercase tracking-wider">
                {query ? `${searchStats?.totalHits || 0} resultados (${searchStats?.processingTimeMs || 0}ms)` : 'Digite algo para começar'}
              </span>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0 rounded-lg bg-white dark:bg-[#111] border border-black/[0.05]">
                  <LayoutGrid className="w-3.5 h-3.5" />
                </Button>
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0 rounded-lg bg-black/[0.05] text-primary">
                  <List className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>

            <div className="space-y-3">
              <AnimatePresence mode="popLayout">
                {results.map((item, i) => (
                  <motion.div
                    key={item.id}
                    layout
                    initial={{ opacity: 0, scale: 0.98 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.98 }}
                    transition={{ delay: i * 0.05 }}
                  >
                    <Card.Root className="overflow-hidden border-black/[0.05] bg-white dark:bg-[#111] hover:border-primary/20 transition-all duration-300 group shadow-none">
                      <Card.Content className="p-0 flex flex-col md:flex-row">
                        {/* Product Image */}
                        <div className="w-full md:w-32 aspect-square md:aspect-auto bg-[#f5f5f7] dark:bg-[#1d1d1f] flex items-center justify-center relative overflow-hidden">
                          {item.image_url ? (
                            <ImageWithFallback 
                              src={item.image_url} 
                              alt={item.name} 
                              className="w-full h-full object-cover" 
                            />
                          ) : (
                            <Package className="w-8 h-8 text-[#d2d2d7] group-hover:scale-110 transition-transform duration-500" />
                          )}
                          <div className="absolute top-2 left-2 px-1.5 py-0.5 rounded-md bg-white/80 backdrop-blur-sm text-[9px] font-bold text-black border border-black/[0.05]">
                            #{i + 1}
                          </div>
                        </div>

                        {/* Product Info */}
                        <div className="flex-1 p-4 flex flex-col justify-between">
                          <div className="flex justify-between items-start gap-4">
                            <div>
                              <div className="flex items-center gap-2 mb-1">
                                {item.category_names?.[0] && (
                                  <span className="text-[10px] font-bold text-primary uppercase tracking-tight">{item.category_names[0]}</span>
                                )}
                                <span className="text-[10px] font-medium text-[#86868b]">{item.sku}</span>
                              </div>
                              <h4 className="text-sm font-semibold text-[#1d1d1f] dark:text-white group-hover:text-primary transition-colors">{item.name}</h4>
                            </div>
                            <div className="text-right">
                              <p className="text-sm font-bold text-[#1d1d1f] dark:text-white">
                                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.price)}
                              </p>
                              <p className="text-[10px] text-[#86868b]">{item.in_stock ? 'Em estoque' : 'Sem estoque'}</p>
                            </div>
                          </div>

                          {isDebug && (
                            <div className="mt-4 pt-3 border-t border-black/[0.03] flex items-center gap-4">
                              <div className="flex items-center gap-1.5">
                                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                <span className="text-[10px] font-bold text-[#86868b]">ID: {item.id}</span>
                              </div>
                              {/* Debug Score not available in hits response by default without showRankingScore, checking if present */}
                              {item.score !== undefined && (
                                <div className="flex items-center gap-1.5">
                                  <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                                  <span className="text-[10px] font-bold text-[#86868b]">Score: {item.score}</span>
                                </div>
                              )}
                              <button className="ml-auto text-[10px] font-bold text-primary hover:underline flex items-center gap-1">
                                Inspect JSON <ChevronRight className="w-3 h-3" />
                              </button>
                            </div>
                          )}
                        </div>
                      </Card.Content>
                    </Card.Root>
                  </motion.div>
                ))}
              </AnimatePresence>

              {query && results.length === 0 && !isSearching && (
                <div className="py-20 flex flex-col items-center justify-center text-center">
                  <div className="w-16 h-16 rounded-full bg-[#f5f5f7] flex items-center justify-center mb-4">
                    <Search className="w-8 h-8 text-[#d2d2d7]" />
                  </div>
                  <h3 className="text-base font-bold text-[#1d1d1f] dark:text-white">Nenhum resultado direto</h3>
                  <p className="text-sm text-[#86868b] max-w-xs mt-1">
                    Não encontramos nada para "{query}". Tente ajustar os sinônimos ou as regras de relevância.
                  </p>
                  <Button variant="outline" size="sm" className="mt-6 h-8 text-[11px] font-bold gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-primary" /> Sugerir Sinônimo
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Sidebar Controls */}
        <aside className="space-y-6">
          <Card.Root className="border-black/[0.05] bg-white dark:bg-[#111] shadow-none">
            <Card.Header>
              <Card.Title className="text-[11px] font-bold text-[#86868b] uppercase tracking-wider flex items-center gap-2">
                <Filter className="w-3.5 h-3.5" /> Parâmetros de Query
              </Card.Title>
            </Card.Header>
            <Card.Content className="space-y-5 pt-0">
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-[#1d1d1f] dark:text-white uppercase">Meili Index</label>
                <div className="w-full h-9 rounded-xl border border-black/[0.08] bg-[#f5f5f7] dark:bg-black/20 flex items-center px-3 text-xs font-medium">
                  products_toyoparts
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-bold text-[#1d1d1f] dark:text-white uppercase">Status</label>
                 <div className="w-full h-9 rounded-xl border border-black/[0.08] bg-[#f5f5f7] dark:bg-black/20 flex items-center px-3 text-xs font-medium">
                  {isSearching ? 'Buscando...' : 'Idle'}
                </div>
              </div>
            </Card.Content>
          </Card.Root>
        </aside>
      </div>
    </div>
  );
}