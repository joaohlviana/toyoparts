import React, { useState, useEffect, useRef } from 'react';
import { 
  Play, RotateCw, FileText, CheckCircle2, AlertTriangle, 
  BarChart3, Hash, Search, ExternalLink, ShieldAlert, XCircle,
  Clock, Download, Trash2, RefreshCw
} from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { projectId, publicAnonKey } from '../../../../utils/supabase/info';
import { toast } from 'sonner';

const API = `https://${projectId}.supabase.co/functions/v1/make-server-1d6e33e0`;
const HEADERS: HeadersInit = {
  Authorization: `Bearer ${publicAnonKey}`,
  'Content-Type': 'application/json',
};

interface SitemapFileInfo {
  name: string;
  type: 'products' | 'categories' | 'filters' | 'static' | 'index';
  url_count: number;
  url: string;
}

interface SitemapStats {
  status: 'idle' | 'running' | 'success' | 'error';
  started_at?: string;
  completed_at?: string;
  failed_at?: string;
  urls_generated?: number;
  urls_by_type?: {
    static: number;
    products: number;
    categories: number;
    filters: number;
  };
  pages_skipped_stock?: number;
  pages_skipped_dominance?: number;
  pages_skipped_limit?: number;
  files_created?: string[];
  files_detail?: SitemapFileInfo[];
  logs?: string[];
  error?: string;
}

const TYPE_CONFIG: Record<string, { label: string; color: string; icon: string }> = {
  static: { label: 'Estaticas', color: 'bg-slate-100 text-slate-700 border-slate-200', icon: '🏠' },
  products: { label: 'Produtos', color: 'bg-green-100 text-green-700 border-green-200', icon: '📦' },
  categories: { label: 'Categorias', color: 'bg-blue-100 text-blue-700 border-blue-200', icon: '📂' },
  filters: { label: 'Filtros', color: 'bg-purple-100 text-purple-700 border-purple-200', icon: '🔍' },
  index: { label: 'Index', color: 'bg-amber-100 text-amber-700 border-amber-200', icon: '📋' },
};

export function SEOAdmin() {
  const [stats, setStats] = useState<SitemapStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [polling, setPolling] = useState(false);
  const logEndRef = useRef<HTMLDivElement>(null);

  // Fetch status
  const fetchStatus = async () => {
    try {
      const res = await fetch(`${API}/sitemap/status`, { headers: HEADERS });
      if (res.ok) {
        const data = await res.json();
        setStats(data);
        if (data.status === 'running') {
          if (!polling) setPolling(true);
        } else {
          setPolling(false);
        }
      } else {
        const errText = await res.text();
        console.error(`[SEOAdmin] Status fetch failed: ${res.status} ${errText}`);
      }
    } catch (e) {
      console.error('Failed to fetch sitemap status', e);
    }
  };

  // Polling effect
  useEffect(() => {
    fetchStatus();
  }, []);

  useEffect(() => {
    if (!polling) return;
    const interval = setInterval(fetchStatus, 2500);
    return () => clearInterval(interval);
  }, [polling]);

  // Auto-scroll logs
  useEffect(() => {
    if (stats?.status === 'running') {
      logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [stats?.logs?.length]);

  // Start generation
  const handleGenerate = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/sitemap/generate`, {
        method: 'POST',
        headers: HEADERS,
      });

      if (res.ok) {
        const data = await res.json();
        setStats(data);
        toast.success('Geracao de sitemap iniciada!');
        setPolling(true);
      } else {
        const errBody = await res.text();
        let errMsg = 'Erro desconhecido';
        try {
          const parsed = JSON.parse(errBody);
          errMsg = parsed.error || parsed.message || errBody;
          // Also update stats to show error
          setStats(parsed);
        } catch {
          errMsg = errBody;
        }
        toast.error(`Erro ao gerar sitemap: ${errMsg}`);
        console.error(`[SEOAdmin] Generate failed: ${res.status}`, errBody);
      }
    } catch (e: any) {
      toast.error(`Erro de conexao: ${e.message}`);
      console.error('[SEOAdmin] Generate error:', e);
    } finally {
      setLoading(false);
    }
  };

  const statusConfig: Record<string, { label: string; color: string; icon: React.ElementType }> = {
    idle: { label: 'Pronto', color: 'bg-slate-100 text-slate-600 border-slate-200', icon: Clock },
    running: { label: 'Processando...', color: 'bg-blue-100 text-blue-700 border-blue-200 animate-pulse', icon: RotateCw },
    success: { label: 'Concluido', color: 'bg-green-100 text-green-700 border-green-200', icon: CheckCircle2 },
    error: { label: 'Erro', color: 'bg-red-100 text-red-700 border-red-200', icon: XCircle },
  };

  const current = statusConfig[stats?.status || 'idle'];
  const StatusIcon = current.icon;

  const totalSkipped = (stats?.pages_skipped_stock || 0) + (stats?.pages_skipped_dominance || 0) + (stats?.pages_skipped_limit || 0);

  return (
    <div className="p-4 lg:p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-foreground">Gerador de Sitemaps SEO</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Gera sitemaps inteligentes com regras anti-canibalizacao, controle de estoque e limites de explosao.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button 
            variant="outline" 
            size="sm"
            onClick={fetchStatus} 
            disabled={loading}
          >
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${polling ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>
          <Button 
            size="sm"
            onClick={handleGenerate} 
            disabled={loading || stats?.status === 'running'}
          >
            {stats?.status === 'running' ? (
              <>
                <RotateCw className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                Processando...
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5 mr-1.5 fill-current" />
                Gerar Sitemap
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Error banner */}
      {stats?.status === 'error' && stats.error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
          <XCircle className="w-5 h-5 text-red-500 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-red-800">Erro na geracao do sitemap</p>
            <p className="text-xs text-red-600 mt-1 font-mono break-all">{stats.error}</p>
            {stats.failed_at && (
              <p className="text-xs text-red-500 mt-1">Falhou em: {new Date(stats.failed_at).toLocaleString('pt-BR')}</p>
            )}
          </div>
        </div>
      )}

      {/* Status Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="p-4">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Status</p>
          <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border mt-2 ${current.color}`}>
            <StatusIcon className={`w-3 h-3 ${stats?.status === 'running' ? 'animate-spin' : ''}`} />
            {current.label}
          </div>
          {stats?.started_at && (
            <p className="text-[10px] text-muted-foreground mt-2">
              Inicio: {new Date(stats.started_at).toLocaleString('pt-BR')}
            </p>
          )}
        </Card>

        <Card className="p-4">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">URLs Geradas</p>
          <p className="text-2xl font-bold text-foreground mt-2">{stats?.urls_generated || 0}</p>
          {stats?.urls_by_type ? (
            <div className="space-y-0.5 mt-1">
              {(['products', 'categories', 'filters', 'static'] as const).map(type => {
                const count = stats.urls_by_type![type] || 0;
                if (count === 0) return null;
                const tc = TYPE_CONFIG[type];
                return (
                  <div key={type} className="flex justify-between text-[10px]">
                    <span className="text-muted-foreground">{tc.label}</span>
                    <span className="font-mono font-medium">{count.toLocaleString('pt-BR')}</span>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-[10px] text-muted-foreground">paginas indexaveis</p>
          )}
        </Card>

        <Card className="p-4">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">URLs Ignoradas</p>
          <p className="text-2xl font-bold text-foreground mt-2">{totalSkipped}</p>
          <div className="space-y-0.5 mt-1">
            <div className="flex justify-between text-[10px]">
              <span className="text-amber-600">Estoque baixo</span>
              <span className="font-mono">{stats?.pages_skipped_stock || 0}</span>
            </div>
            <div className="flex justify-between text-[10px]">
              <span className="text-blue-600">Dominancia 80%</span>
              <span className="font-mono">{stats?.pages_skipped_dominance || 0}</span>
            </div>
            <div className="flex justify-between text-[10px]">
              <span className="text-slate-500">Fora do Top N</span>
              <span className="font-mono">{stats?.pages_skipped_limit || 0}</span>
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Arquivos XML</p>
          <p className="text-2xl font-bold text-foreground mt-2">{stats?.files_created?.length || 0}</p>
          <div className="space-y-1 mt-2 max-h-[120px] overflow-y-auto">
            {stats?.files_detail && stats.files_detail.length > 0 ? (
              stats.files_detail.map((f, i) => {
                const tc = TYPE_CONFIG[f.type] || TYPE_CONFIG.static;
                return (
                  <a
                    key={i}
                    href={f.url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1.5 text-[10px] hover:bg-muted/50 rounded px-1 py-0.5 transition-colors"
                  >
                    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[8px] font-semibold border ${tc.color}`}>
                      {tc.label}
                    </span>
                    <span className="text-primary truncate flex-1">{f.name}</span>
                    <span className="text-muted-foreground font-mono shrink-0">{f.url_count}</span>
                    <ExternalLink className="w-2 h-2 shrink-0 opacity-40" />
                  </a>
                );
              })
            ) : stats?.files_created?.length ? (
              stats.files_created.map((url, i) => (
                <a
                  key={i}
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1 text-[10px] text-primary hover:underline truncate"
                >
                  <FileText className="w-2.5 h-2.5 shrink-0" />
                  <span className="truncate">{url.split('/').pop()}</span>
                  <ExternalLink className="w-2 h-2 shrink-0 opacity-50" />
                </a>
              ))
            ) : (
              <span className="text-[10px] text-muted-foreground italic">Nenhum</span>
            )}
          </div>
        </Card>
      </div>

      {/* Logs + Rules */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Logs */}
        <div className="lg:col-span-2">
          <Card className="h-full flex flex-col">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Hash className="w-4 h-4" /> Logs de Execucao
                {stats?.logs && stats.logs.length > 0 && (
                  <Badge variant="outline" className="text-[9px] ml-auto">{stats.logs.length} entradas</Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="flex-1">
              <div className="bg-slate-950 text-slate-200 font-mono text-[10px] p-3 rounded-lg h-[350px] overflow-y-auto border border-slate-800">
                {stats?.logs && stats.logs.length > 0 ? (
                  // Logs come newest first, reverse for chronological display
                  [...stats.logs].reverse().map((log, i) => (
                    <div 
                      key={i} 
                      className={`py-1 border-b border-slate-800/30 last:border-0 ${
                        log.includes('ERRO') || log.includes('error') ? 'text-red-400' : 
                        log.includes('AVISO') ? 'text-yellow-400' :
                        log.includes('concluido') || log.includes('sucesso') || log.includes('Concluido') ? 'text-green-400 font-semibold' : ''
                      }`}
                    >
                      <span className="text-slate-600 select-none mr-2">{String(i + 1).padStart(2, '0')}.</span>
                      {log}
                    </div>
                  ))
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-slate-600">
                    <Search className="w-6 h-6 mb-2 opacity-20" />
                    <p>Clique "Gerar Sitemap" para iniciar.</p>
                  </div>
                )}
                <div ref={logEndRef} />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Rules */}
        <div className="space-y-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Regras de Filtragem</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="bg-amber-50 p-2.5 rounded-md border border-amber-100">
                <h4 className="font-semibold text-amber-800 text-xs flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" /> Estoque Minimo
                </h4>
                <p className="text-amber-700/80 text-[10px] mt-0.5 leading-relaxed">
                  Paginas com menos de <strong>3 produtos em estoque</strong> sao ignoradas (Thin Content).
                </p>
              </div>

              <div className="bg-blue-50 p-2.5 rounded-md border border-blue-100">
                <h4 className="font-semibold text-blue-800 text-xs flex items-center gap-1">
                  <ShieldAlert className="w-3 h-3" /> Anti-Canibalizacao (80%)
                </h4>
                <p className="text-blue-700/80 text-[10px] mt-0.5 leading-relaxed">
                  Se um filtro representa {'>'} 80% da categoria pai, a URL filtrada nao e gerada.
                </p>
              </div>

              <div className="bg-slate-50 p-2.5 rounded-md border border-slate-100">
                <h4 className="font-semibold text-slate-800 text-xs flex items-center gap-1">
                  <BarChart3 className="w-3 h-3" /> Limites
                </h4>
                <p className="text-slate-600/80 text-[10px] mt-0.5 leading-relaxed">
                  Top 50 marcas/categoria, Top 20 modelos/marca.
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Endpoints</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1.5">
              <div className="text-[10px] font-mono bg-muted p-2 rounded">
                <span className="text-green-600 font-semibold">POST</span> /sitemap/generate
              </div>
              <div className="text-[10px] font-mono bg-muted p-2 rounded">
                <span className="text-blue-600 font-semibold">GET</span> /sitemap/status
              </div>
              <div className="text-[10px] font-mono bg-muted p-2 rounded">
                <span className="text-blue-600 font-semibold">GET</span> /sitemap/files
              </div>
              <div className="text-[10px] font-mono bg-muted p-2 rounded">
                <span className="text-blue-600 font-semibold">GET</span> /seo/sitemap.xml
              </div>
              <div className="text-[10px] font-mono bg-muted p-2 rounded">
                <span className="text-blue-600 font-semibold">GET</span> /seo/robots.txt
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}