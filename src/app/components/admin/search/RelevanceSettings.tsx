import React, { useState, useEffect } from 'react';
import { 
  GripVertical, 
  Search, 
  Settings2, 
  Info, 
  Plus, 
  Trash2, 
  CheckCircle2,
  ChevronDown,
  Lock,
  Zap,
  Tag,
  Eye,
  SortAsc,
  SearchCode
} from 'lucide-react';
import { motion, Reorder } from 'motion/react';
import { Card } from '../../base/card';
import { Button } from '../../base/button';
import { Badge } from '../../base/badge';
import { toast } from 'sonner';
import { searchApi } from '../../../lib/search-api';

const RULE_DESCRIPTIONS: Record<string, string> = {
  words: 'Results are sorted by the number of query words matched.',
  typo: 'Results are sorted by the number of typos.',
  proximity: 'Results are sorted by the distance between matched words.',
  attribute: 'Results are sorted by the order of the searchable attributes.',
  sort: 'Results are sorted according to parameters at search time.',
  exactness: 'Results are sorted by the similarity of matched words.'
};

const DEFAULT_ATTR_WEIGHT = 1; // Meili doesn't expose weights in public API in the same way Algolia does, usually order matters.

export function RelevanceSettings() {
  const [rankingRules, setRankingRules] = useState<any[]>([]);
  const [searchableAttributes, setSearchableAttributes] = useState<any[]>([]);
  const [filterableAttributes, setFilterableAttributes] = useState<string[]>([]);
  const [sortableAttributes, setSortableAttributes] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    async function loadSettings() {
      try {
        const settings = await searchApi.getSettings();
        
        // Map Ranking Rules
        const rules = (settings.rankingRules || []).map((r: string) => {
           // Handle rules like "words", "typo", "asc(price)"
           const id = r.split(':')[0].split('(')[0]; 
           return {
             id: r, // Keep original string for API
             name: id.charAt(0).toUpperCase() + id.slice(1),
             description: RULE_DESCRIPTIONS[id] || 'Custom rule'
           };
        });
        setRankingRules(rules);

        // Map Searchable Attributes
        const searchAttrs = (settings.searchableAttributes || []).map((attr: string) => ({
          name: attr,
          weight: 'Order', // Meili uses order, not weight number
          description: 'Indexed field'
        }));
        setSearchableAttributes(searchAttrs);

        setFilterableAttributes(settings.filterableAttributes || []);
        setSortableAttributes(settings.sortableAttributes || []);

      } catch (err) {
        toast.error('Failed to load settings');
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    loadSettings();
  }, []);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const payload = {
        rankingRules: rankingRules.map(r => r.id),
        searchableAttributes: searchableAttributes.map(r => r.name),
        filterableAttributes,
        sortableAttributes
      };
      
      await searchApi.updateSettings(payload);
      toast.success('Configurações de relevância atualizadas!');
    } catch (err) {
      console.error(err);
      toast.error('Erro ao salvar configurações');
    } finally {
      setIsSaving(false);
    }
  };

  if (loading) return <div className="p-10 text-center">Carregando configurações...</div>;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-2xl font-bold tracking-tight text-[#1d1d1f] dark:text-white">Configurações de Relevância</h2>
          <p className="text-[#86868b] text-sm">Controle como o Meilisearch prioriza e ordena seus produtos.</p>
        </div>
        <Button onClick={handleSave} disabled={isSaving} className="h-9 font-bold px-6">
          {isSaving ? 'Salvando...' : 'Salvar Alterações'}
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Ranking Rules - Reorderable */}
        <section className="space-y-4">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-sm font-bold text-[#1d1d1f] dark:text-white uppercase tracking-wider flex items-center gap-2">
              <SortAsc className="w-4 h-4 text-blue-500" /> Ranking Rules
            </h3>
            <div className="group relative">
              <Info className="w-3.5 h-3.5 text-[#86868b] cursor-help" />
              <div className="absolute right-0 bottom-full mb-2 w-64 p-3 bg-white dark:bg-[#1d1d1f] border border-black/[0.05] rounded-xl shadow-xl text-[10px] text-[#86868b] opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                A ordem destas regras define como o Meilisearch decide qual produto vem primeiro. Arraste para mudar a prioridade.
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-[#111] border border-black/[0.05] rounded-2xl overflow-hidden">
            <Reorder.Group axis="y" values={rankingRules} onReorder={setRankingRules} className="divide-y divide-black/[0.03]">
              {rankingRules.map((rule) => (
                <Reorder.Item key={rule.id} value={rule} className="p-4 hover:bg-black/[0.01] transition-colors flex items-center gap-4 cursor-grab active:cursor-grabbing group">
                  <div className="text-[#d2d2d7] group-hover:text-[#86868b] transition-colors">
                    <GripVertical className="w-4 h-4" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-[#1d1d1f] dark:text-white">{rule.name}</span>
                      {rule.id === 'words' && <Badge variant="secondary" className="text-[9px] h-4 bg-blue-500/10 text-blue-600 border-none">Obrigatório</Badge>}
                    </div>
                    <p className="text-xs text-[#86868b] mt-0.5">{rule.description}</p>
                  </div>
                  <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                      <Settings2 className="w-3.5 h-3.5 text-[#86868b]" />
                    </Button>
                  </div>
                </Reorder.Item>
              ))}
            </Reorder.Group>
            <div className="p-3 bg-[#f5f5f7] dark:bg-black/20 border-t border-black/[0.03] flex justify-center">
              <Button variant="ghost" size="sm" className="text-[10px] font-bold text-primary gap-1.5 h-7">
                <Plus className="w-3 h-3" /> Adicionar Regra Customizada
              </Button>
            </div>
          </div>
        </section>

        {/* Searchable Attributes */}
        <section className="space-y-6">
          <div className="space-y-4">
            <div className="flex items-center justify-between px-1">
              <h3 className="text-sm font-bold text-[#1d1d1f] dark:text-white uppercase tracking-wider flex items-center gap-2">
                <SearchCode className="w-4 h-4 text-purple-500" /> Atributos Pesquisáveis (Ordered)
              </h3>
              <Button variant="ghost" size="sm" className="h-7 text-[10px] font-bold text-primary gap-1.5">
                <Plus className="w-3 h-3" /> Adicionar Atributo
              </Button>
            </div>

            <Card.Root className="border-black/[0.05] bg-white dark:bg-[#111] overflow-hidden">
              <Card.Content className="p-0">
                <div className="divide-y divide-black/[0.03]">
                  {searchableAttributes.map((attr, i) => (
                    <div key={i} className="p-4 flex items-center justify-between group hover:bg-black/[0.01] transition-colors">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-black/[0.03] dark:bg-white/[0.03] flex items-center justify-center">
                          <Tag className="w-3.5 h-3.5 text-[#86868b]" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold text-[#1d1d1f] dark:text-white">{attr.name}</span>
                            <Badge variant="pill-color" color="gray" className="text-[9px] h-4">Priority: {i + 1}</Badge>
                          </div>
                          <p className="text-xs text-[#86868b] mt-0.5">{attr.description}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0 hover:text-rose-500">
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </Card.Content>
            </Card.Root>
          </div>

          {/* Filterable & Sortable attributes */}
          <div className="grid grid-cols-2 gap-4">
            <Card.Root className="border-black/[0.05] bg-white dark:bg-[#111]">
              <Card.Header className="p-4">
                <Card.Title className="text-[10px] font-bold text-[#86868b] uppercase tracking-wider flex items-center gap-2">
                  <Eye className="w-3.5 h-3.5" /> Filtros (Facets)
                </Card.Title>
              </Card.Header>
              <Card.Content className="p-4 pt-0">
                <div className="flex flex-wrap gap-1.5">
                  {filterableAttributes.map(tag => (
                    <Badge key={tag} variant="secondary" className="text-[9px] h-5 bg-black/[0.03] border-none text-[#1d1d1f]">{tag}</Badge>
                  ))}
                  <button className="h-5 w-5 rounded-full border border-black/[0.1] flex items-center justify-center text-[#86868b] hover:bg-black/[0.05]">
                    <Plus className="w-3 h-3" />
                  </button>
                </div>
              </Card.Content>
            </Card.Root>

            <Card.Root className="border-black/[0.05] bg-white dark:bg-[#111]">
              <Card.Header className="p-4">
                <Card.Title className="text-[10px] font-bold text-[#86868b] uppercase tracking-wider flex items-center gap-2">
                  <SortAsc className="w-3.5 h-3.5" /> Ordenação
                </Card.Title>
              </Card.Header>
              <Card.Content className="p-4 pt-0">
                <div className="flex flex-wrap gap-1.5">
                  {sortableAttributes.map(tag => (
                    <Badge key={tag} variant="secondary" className="text-[9px] h-5 bg-black/[0.03] border-none text-[#1d1d1f]">{tag}</Badge>
                  ))}
                  <button className="h-5 w-5 rounded-full border border-black/[0.1] flex items-center justify-center text-[#86868b] hover:bg-black/[0.05]">
                    <Plus className="w-3 h-3" />
                  </button>
                </div>
              </Card.Content>
            </Card.Root>
          </div>
        </section>
      </div>
    </div>
  );
}
