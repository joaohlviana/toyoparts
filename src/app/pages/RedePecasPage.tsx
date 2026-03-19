// Rede de Pecas Toyota — busca SKU + compatibilidades
import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  Search, Package, Car, AlertTriangle, CheckCircle2, XCircle,
  Copy, Check, RefreshCw, Info, ChevronDown, ChevronRight, Wrench, Activity,
} from 'lucide-react';
import { toast } from 'sonner';
import { projectId } from '../../../utils/supabase/info';
import { adminFetch } from '../lib/admin-auth';
import { Button } from '../components/base/button';
import { Input } from '../components/base/input';
import { Badge } from '../components/base/badge';
import { Card } from '../components/base/card';
import { Table } from '../components/base/table';
import { copyToClipboard } from '../utils/clipboard';

const API = `https://${projectId}.supabase.co/functions/v1/make-server-1d6e33e0/admin/catalogo`;

// ── Helpers ──────────────────────────────────────────────────────────────────

const LABELS: Record<string, string> = {
  partno: 'Part Number', description: 'Descricao', name: 'Nome',
  category: 'Categoria', subCategory: 'Subcategoria', cat: 'Cod. Categoria',
  price_price: 'Preco', price_stock: 'Estoque', price_currency: 'Moeda',
  brand: 'Marca', sku: 'SKU', weight: 'Peso', status: 'Status',
};

const PRIORITY = ['partno', 'description', 'name', 'category', 'subCategory', 'cat',
  'price_price', 'price_stock', 'price_currency', 'brand', 'sku', 'weight', 'status'];

const HIDDEN = new Set(['COMPATIBILIDADE', 'compatibilidade', 'id', 'created_at', 'updated_at']);

function sortFields(product: Record<string, any>): [string, any][] {
  const entries = Object.entries(product).filter(([k]) => !HIDDEN.has(k));
  const pri: [string, any][] = [];
  const rest: [string, any][] = [];
  for (const e of entries) (PRIORITY.includes(e[0]) ? pri : rest).push(e);
  pri.sort((a, b) => PRIORITY.indexOf(a[0]) - PRIORITY.indexOf(b[0]));
  return [...pri, ...rest];
}

function fmt(key: string, val: any): string {
  if (val == null) return '—';
  if (key.includes('price') && typeof val === 'number') return `R$ ${val.toFixed(2)}`;
  const s = String(val);
  return s.length > 300 ? s.slice(0, 300) + '...' : s;
}

// ── Component ────────────────────────────────────────────────────────────────

export function RedePecasPage() {
  const [query, setQuery] = useState('533010K010');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [diagLoading, setDiagLoading] = useState(false);
  const [diag, setDiag] = useState<any>(null);
  const [showDiag, setShowDiag] = useState(false);
  const [showRaw, setShowRaw] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState<string | null>(null);
  const ran = useRef(false);

  const copy = (text: string, id: string) => {
    copyToClipboard(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  // Auto-test on mount
  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    (async () => {
      // diagnostico
      try {
        const r = await adminFetch(`${API}/diagnostico`);
        const d = await r.json();
        setDiag(d);
        setShowDiag(true);
      } catch (e: any) { console.error(e); }
      // busca teste
      setLoading(true);
      try {
        const r = await adminFetch(`${API}/buscar?partno=533010K010`);
        const d = await r.json();
        setResult(d);
      } catch (e: any) {
        setResult({ found: false, partno: '533010K010', error: e.message });
      } finally { setLoading(false); }
    })();
  }, []);

  const handleSearch = useCallback(async () => {
    const q = query.trim();
    if (!q) { toast.error('Digite um PartNo'); return; }
    setLoading(true); setResult(null); setAiResult(null);
    try {
      const r = await adminFetch(`${API}/buscar?partno=${encodeURIComponent(q)}`);
      const d = await r.json();
      setResult(d);
      if (d.found) toast.success(`Encontrado: ${d.partno}`);
      else toast.warning(d.message || 'Nao encontrado');
    } catch (e: any) {
      toast.error(e.message);
      setResult({ found: false, partno: q, error: e.message });
    } finally { setLoading(false); }
  }, [query]);

  const handleDiag = useCallback(async () => {
    setDiagLoading(true);
    try {
      const r = await adminFetch(`${API}/diagnostico`);
      setDiag(await r.json());
      setShowDiag(true);
    } catch (e: any) { toast.error(e.message); }
    finally { setDiagLoading(false); }
  }, []);

  const handleAI = useCallback(async () => {
    if (!result?.product) return;
    setAiLoading(true); setAiResult(null);
    try {
      const r = await adminFetch(`${API}/interpretar`, {
        method: 'POST',
        body: JSON.stringify({ descricao: JSON.stringify(result.product, null, 2) }),
      });
      const d = await r.json();
      if (d.error) {
        toast.error(`IA: ${d.error}`);
        setAiResult(`ERRO: ${d.error}`);
      } else {
        setAiResult(d.interpretacao || 'Sem resposta');
        toast.success('Conteudo gerado com sucesso');
      }
    } catch (e: any) {
      toast.error(`Erro IA: ${e.message}`);
      setAiResult(`ERRO: ${e.message}`);
    } finally { setAiLoading(false); }
  }, [result]);

  return (
    <div className="max-w-[1280px] mx-auto px-4 lg:px-6 pt-6 pb-12 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Car className="w-7 h-7 text-primary" />
            Rede de Pecas Toyota
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Busque por PartNo para ver informacoes do SKU e compatibilidades
          </p>
        </div>
        <Button color="secondary" size="sm" onClick={handleDiag} isLoading={diagLoading}
          iconLeading={<Activity className="w-4 h-4" />}>
          Diagnostico
        </Button>
      </div>

      {/* Search */}
      <Card.Root>
        <Card.Content className="p-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1">
              <Input placeholder="PartNo (ex: 533010K010)" value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                iconLeading={Search} className="h-12 text-base" />
            </div>
            <Button color="primary" size="lg" onClick={handleSearch} isLoading={loading}
              iconLeading={<Search className="w-5 h-5" />} className="min-w-[140px]">
              Buscar
            </Button>
          </div>
        </Card.Content>
      </Card.Root>

      {/* Diagnostico */}
      {showDiag && diag && (
        <Card.Root className={diag.ok ? 'border-success/30' : 'border-destructive/30'}>
          <Card.Header className="cursor-pointer" onClick={() => setShowDiag(false)}>
            <div className="flex items-center justify-between">
              <Card.Title className="flex items-center gap-2 text-base">
                {diag.ok
                  ? <CheckCircle2 className="w-5 h-5 text-success" />
                  : <AlertTriangle className="w-5 h-5 text-destructive" />}
                Diagnostico
                <Badge variant="pill-color" color={diag.ok ? 'success' : 'error'} size="xs">
                  {diag.ok ? 'OK' : 'ERRO'}
                </Badge>
              </Card.Title>
              <XCircle className="w-4 h-4 text-muted-foreground" />
            </div>
          </Card.Header>
          <Card.Content className="space-y-3">
            {diag.error && (
              <p className="text-sm text-destructive font-mono bg-destructive/5 p-3 rounded">
                {diag.error}
              </p>
            )}
            {diag.banco_toyoparts && (
              <div className="flex items-center gap-2">
                <Package className="w-4 h-4" />
                <span className="text-sm font-medium">banco_toyoparts</span>
                <Badge variant="pill-color" color={diag.banco_toyoparts.rows > 0 ? 'success' : 'error'} size="xs">
                  {diag.banco_toyoparts.rows} rows
                </Badge>
                {diag.banco_toyoparts.cols?.length > 0 && (
                  <span className="text-xs text-muted-foreground">
                    ({diag.banco_toyoparts.cols.length} cols)
                  </span>
                )}
              </div>
            )}
            {diag.banco_toyoparts_cods && (
              <div className="flex items-center gap-2">
                <Wrench className="w-4 h-4" />
                <span className="text-sm font-medium">banco_toyoparts_cods</span>
                <Badge variant="pill-color" color={diag.banco_toyoparts_cods.rows > 0 ? 'success' : 'error'} size="xs">
                  {diag.banco_toyoparts_cods.rows} rows
                </Badge>
              </div>
            )}
            <details className="text-xs">
              <summary className="cursor-pointer text-muted-foreground">JSON completo</summary>
              <pre className="mt-2 bg-foreground/5 rounded p-3 overflow-auto max-h-60 font-mono">
                {JSON.stringify(diag, null, 2)}
              </pre>
            </details>
          </Card.Content>
        </Card.Root>
      )}

      {/* Not found */}
      {result && !result.found && !loading && (
        <Card.Root className="border-warning/30">
          <Card.Content className="flex items-start gap-3 p-5">
            <AlertTriangle className="w-5 h-5 text-warning shrink-0 mt-0.5" />
            <div>
              <p className="font-medium">
                Nao encontrado: <code className="text-primary font-mono">{result.partno}</code>
              </p>
              {result.message && <p className="text-sm text-muted-foreground">{result.message}</p>}
              {result.error && (
                <p className="text-sm text-destructive font-mono bg-destructive/5 px-2 py-1 rounded mt-2">
                  {result.error}
                </p>
              )}
            </div>
          </Card.Content>
        </Card.Root>
      )}

      {/* Product found */}
      {result?.found && result.product && (
        <div className="space-y-6">
          {/* SKU info */}
          <Card.Root className="border-primary/20">
            <Card.Header>
              <div className="flex items-center justify-between flex-wrap gap-2">
                <Card.Title className="flex items-center gap-2">
                  <Package className="w-5 h-5 text-primary" />
                  {result.partno}
                </Card.Title>
                <div className="flex items-center gap-2">
                  <Badge variant="pill-color" color="success" size="sm" dot>Encontrado</Badge>
                  <Button color="secondary" size="xs" onClick={() => setShowRaw(!showRaw)}
                    iconLeading={showRaw ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}>
                    {showRaw ? 'Ocultar JSON' : 'Ver JSON'}
                  </Button>
                </div>
              </div>
              {result.product.description && (
                <Card.Description className="mt-1">{result.product.description}</Card.Description>
              )}
            </Card.Header>
            <Card.Content className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {sortFields(result.product).map(([key, value]) => (
                  <div key={key} className="group bg-secondary/30 rounded-lg px-4 py-3 hover:bg-secondary/60 transition-colors">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        {LABELS[key] || key}
                      </span>
                      <button className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-secondary"
                        onClick={() => copy(String(value ?? ''), key)}>
                        {copied === key
                          ? <Check className="w-3 h-3 text-success" />
                          : <Copy className="w-3 h-3 text-muted-foreground" />}
                      </button>
                    </div>
                    <p className="text-sm font-medium text-foreground break-words">{fmt(key, value)}</p>
                  </div>
                ))}
              </div>
              {showRaw && (
                <pre className="bg-foreground/5 border border-border rounded-lg p-4 text-xs font-mono overflow-auto max-h-[400px]">
                  {JSON.stringify(result.product, null, 2)}
                </pre>
              )}
            </Card.Content>
          </Card.Root>

          {/* Compatibilidades */}
          <Card.Root>
            <Card.Header>
              <Card.Title className="flex items-center gap-2">
                <Car className="w-5 h-5 text-primary" />
                Compatibilidades
                <Badge variant="pill-color" color="brand" size="sm">
                  {result.total_compatibilidades ?? 0} modelos
                </Badge>
              </Card.Title>
              {result.compatibilidade_codes?.length > 0 && (
                <Card.Description className="mt-1">
                  Codigos: {result.compatibilidade_codes.join(', ')}
                </Card.Description>
              )}
            </Card.Header>
            {result.compatibilidades?.length > 0 ? (
              <div className="p-0">
                <Table.Root className="border-0 shadow-none rounded-none">
                  <Table.Header>
                    <Table.Row>
                      <Table.HeaderCell className="w-12">#</Table.HeaderCell>
                      <Table.HeaderCell>Codigo</Table.HeaderCell>
                      <Table.HeaderCell>Modelo / Veiculo</Table.HeaderCell>
                    </Table.Row>
                  </Table.Header>
                  <Table.Body>
                    {result.compatibilidades.map((c: any, i: number) => (
                      <Table.Row key={`${c.codigo}-${i}`}>
                        <Table.Cell className="text-muted-foreground font-mono text-xs">{i + 1}</Table.Cell>
                        <Table.Cell>
                          <code className="text-xs font-mono bg-secondary/60 px-2 py-0.5 rounded">{c.codigo}</code>
                        </Table.Cell>
                        <Table.Cell className="font-medium whitespace-normal max-w-[400px]">{c.descricao}</Table.Cell>
                      </Table.Row>
                    ))}
                  </Table.Body>
                </Table.Root>
              </div>
            ) : (
              <Card.Content>
                <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
                  <Info className="w-4 h-4" />
                  {result.compatibilidade_raw
                    ? 'Codigos encontrados mas sem descricao na banco_toyoparts_cods.'
                    : 'Nenhuma compatibilidade registrada.'}
                </div>
                {result.compatibilidade_raw && (
                  <div className="bg-secondary/30 rounded-lg p-3 mt-2">
                    <p className="text-xs font-mono break-all">{result.compatibilidade_raw}</p>
                  </div>
                )}
              </Card.Content>
            )}
          </Card.Root>

          {/* AI */}
          <Card.Root>
            <Card.Header>
              <div className="flex items-center justify-between flex-wrap gap-2">
                <Card.Title className="flex items-center gap-2 text-base">
                  <Wrench className="w-5 h-5 text-primary" /> Interpretacao IA
                </Card.Title>
                <Button color="primary" size="sm" onClick={handleAI} isLoading={aiLoading}
                  iconLeading={<RefreshCw className="w-4 h-4" />}>
                  Gerar Conteudo
                </Button>
              </div>
            </Card.Header>
            {aiResult && (
              <Card.Content>
                <div className="bg-secondary/30 rounded-lg p-4 whitespace-pre-wrap text-sm leading-relaxed">
                  {aiResult}
                </div>
                <button className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => copy(aiResult, '__ai')}>
                  {copied === '__ai'
                    ? <><Check className="w-3.5 h-3.5 text-success" /> Copiado!</>
                    : <><Copy className="w-3.5 h-3.5" /> Copiar</>}
                </button>
              </Card.Content>
            )}
          </Card.Root>
        </div>
      )}

      {/* Empty */}
      {!result && !loading && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
            <Search className="w-8 h-8 text-primary" />
          </div>
          <h3 className="text-lg font-semibold text-foreground mb-1">Busque uma peca Toyota</h3>
          <p className="text-sm text-muted-foreground max-w-md">
            Digite o PartNo para consultar informacoes, precos, estoque e veiculos compativeis.
          </p>
        </div>
      )}
    </div>
  );
}