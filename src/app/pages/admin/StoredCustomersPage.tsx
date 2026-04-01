import React, { useState, useEffect } from 'react';
import { 
  Users, Search, RefreshCw, Loader2, Mail, Calendar, FileJson, Key, Copy, Check 
} from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { toast } from 'sonner';
import { projectId, publicAnonKey } from '../../../../utils/supabase/info';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "../../components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "../../components/ui/dialog";
import { Label } from "../../components/ui/label";

import { copyToClipboard as copyText } from '../../utils/clipboard';

interface MagentoCustomer {
  id: number;
  email: string;
  firstname: string;
  lastname: string;
  created_at: string;
  group_id: number;
}

export function StoredCustomersPage() {
  const [customers, setCustomers] = useState<MagentoCustomer[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [selectedCustomer, setSelectedCustomer] = useState<MagentoCustomer | null>(null);
  const [linkCustomer, setLinkCustomer] = useState<MagentoCustomer | null>(null);
  const [generatedLink, setGeneratedLink] = useState('');
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const limit = 20;

  const loadData = async () => {
    setLoading(true);
    try {
      // Use the new endpoint for stored data
      const url = new URL(`https://${projectId}.supabase.co/functions/v1/make-server-1d6e33e0/magento-sync/customers/stored`);
      url.searchParams.append('page', String(page));
      url.searchParams.append('limit', String(limit));
      if (search) url.searchParams.append('search', search);

      const res = await fetch(url.toString(), {
        headers: { 'Authorization': `Bearer ${publicAnonKey}` }
      });

      if (!res.ok) throw new Error('Falha ao buscar clientes armazenados');
      const data = await res.json();
      
      setCustomers(data.items || []);
      setTotal(data.total_count || 0);
    } catch (e: any) {
      toast.error('Erro ao buscar clientes: ' + e.message);
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

  const handleGenerateLink = async (customer?: MagentoCustomer) => {
    // Accept customer directly (for auto-generate) or fallback to state
    const target = customer || linkCustomer;
    if (!target) return;
    
    // Ensure state is set (for the dialog to display correctly)
    if (!linkCustomer || linkCustomer.id !== target.id) {
      setLinkCustomer(target);
    }
    
    setGenerating(true);
    setGeneratedLink('');
    try {
      console.log('[AccessLinks] Generating link for customer:', target.id, target.email);
      
      const res = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-1d6e33e0/access-links/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${publicAnonKey}`,
          'apikey': publicAnonKey
        },
        body: JSON.stringify({
          customer_id: target.id,
          email: target.email
        })
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        console.error('[AccessLinks] Server error:', res.status, err);
        throw new Error(err.error || `Erro ao gerar link (${res.status})`);
      }

      const data = await res.json();
      const fullLink = data.access_url || data.access_url_suffix || '';
      setGeneratedLink(fullLink);
      toast.success('Link de acesso gerado com sucesso!');
    } catch (e: any) {
      console.error('[AccessLinks] Generate error:', e);
      toast.error(e.message);
    } finally {
      setGenerating(false);
    }
  };

  const copyToClipboard = () => {
    copyText(generatedLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success('Link copiado!');
  };

  return (
    <div className="max-w-[1280px] mx-auto px-4 lg:px-6 pt-6 pb-12 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Users className="w-6 h-6" /> Clientes (Banco de Dados)
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Clientes importados e salvos no Supabase KV ({total} registros)
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
            onKeyDown={e => e.key === 'Enter' && handleSearch(e)}
            placeholder="Buscar..." 
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
                <th className="px-6 py-3 font-medium">ID</th>
                <th className="px-6 py-3 font-medium">Nome</th>
                <th className="px-6 py-3 font-medium">Email</th>
                <th className="px-6 py-3 font-medium">Data Cadastro</th>
                <th className="px-6 py-3 font-medium text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-muted-foreground py-12">
                    <div className="flex flex-col items-center gap-2">
                        <Loader2 className="w-6 h-6 animate-spin text-primary" />
                        <span className="text-xs font-medium">Carregando dados...</span>
                    </div>
                  </td>
                </tr>
              ) : customers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-muted-foreground py-12">
                    Nenhum cliente encontrado no banco de dados.
                  </td>
                </tr>
              ) : (
                customers.map((c) => (
                  <tr key={c.id} className="hover:bg-muted/50 transition-colors">
                    <td className="px-6 py-4 font-mono text-xs text-muted-foreground">#{c.id}</td>
                    <td className="px-6 py-4 font-medium text-foreground">
                      {c.firstname} {c.lastname}
                    </td>
                    <td className="px-6 py-4 text-muted-foreground">
                      <div className="flex items-center gap-2">
                        <Mail className="w-3.5 h-3.5 opacity-70" />
                        {c.email}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-muted-foreground">
                      <div className="flex items-center gap-2">
                        <Calendar className="w-3.5 h-3.5 opacity-70" />
                        {new Date(c.created_at).toLocaleDateString('pt-BR')}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                       <div className="flex justify-end gap-2">
                        <Button 
                           variant="ghost" 
                           size="sm" 
                           className="h-8 w-8 p-0"
                           title="Gerar Link de Acesso"
                           onClick={() => {
                             setGeneratedLink('');
                             handleGenerateLink(c);
                           }}
                         >
                           <span className="sr-only">Acesso</span>
                           <Key className="w-4 h-4 text-amber-500" />
                         </Button>
                         <Button 
                           variant="ghost" 
                           size="sm" 
                           className="h-8 w-8 p-0"
                           title="Ver JSON Raw"
                           onClick={() => setSelectedCustomer(c)}
                         >
                           <span className="sr-only">Ver Raw</span>
                           <FileJson className="w-4 h-4" />
                         </Button>
                       </div>
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

      {/* Raw Data Sheet */}
      <Sheet open={!!selectedCustomer} onOpenChange={(open) => !open && setSelectedCustomer(null)}>
        <SheetContent className="w-[400px] sm:w-[540px] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Dados Brutos do Cliente (KV)</SheetTitle>
            <SheetDescription>
              Visualização do objeto JSON armazenado no Supabase.
            </SheetDescription>
          </SheetHeader>
          <div className="mt-6">
            {selectedCustomer && (
              <div className="bg-muted p-4 rounded-lg overflow-x-auto">
                <pre className="text-xs font-mono whitespace-pre-wrap">
                  {JSON.stringify(selectedCustomer, null, 2)}
                </pre>
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* Access Link Dialog */}
      <Dialog open={!!linkCustomer} onOpenChange={(open) => !open && setLinkCustomer(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Gerar Link de Acesso</DialogTitle>
            <DialogDescription>
              Gere um link temporário para que o cliente acesse sua conta sem senha (Magic Link).
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="grid gap-2">
              <Label>Cliente</Label>
              <div className="text-sm font-medium bg-muted p-2 rounded border">
                {linkCustomer?.firstname} {linkCustomer?.lastname} <br/>
                <span className="text-muted-foreground font-normal">{linkCustomer?.email}</span>
              </div>
            </div>

            {generatedLink ? (
               <div className="grid gap-2 animate-in fade-in zoom-in-95 duration-200">
                 <Label>Link de Acesso (Expira em 7 dias)</Label>
                 <div className="flex items-center gap-2">
                   <Input value={generatedLink} readOnly className="font-mono text-xs" />
                   <Button size="icon" variant="outline" onClick={copyToClipboard}>
                     {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                   </Button>
                 </div>
                 <p className="text-xs text-muted-foreground">
                   Envie este link APENAS para o cliente. Ele permite login automático.
                 </p>
               </div>
            ) : (
              <div className="bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-200 p-3 rounded-md text-sm border border-amber-200 dark:border-amber-800">
                Atenção: Este link concede acesso total à conta do usuário.
              </div>
            )}
          </div>

          <DialogFooter className="sm:justify-end">
            {!generatedLink && (
              <Button type="button" onClick={() => handleGenerateLink()} disabled={generating}>
                {generating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Gerar Link Seguro
              </Button>
            )}
            <Button type="button" variant="secondary" onClick={() => setLinkCustomer(null)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
