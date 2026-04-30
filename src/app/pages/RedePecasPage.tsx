import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Car,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Copy,
  Info,
  Package,
  RefreshCw,
  Ruler,
  Scale,
  Search,
  ShieldCheck,
  Wrench,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { projectId } from '../../../utils/supabase/info';
import { adminFetch } from '../lib/admin-auth';
import { Badge } from '../components/base/badge';
import { Button } from '../components/base/button';
import { Card } from '../components/base/card';
import { Input } from '../components/base/input';
import { Table } from '../components/base/table';
import { copyToClipboard } from '../utils/clipboard';

const API = `https://${projectId}.supabase.co/functions/v1/make-server-1d6e33e0/admin/catalogo`;

type MeasureField = 'weight' | 'dimensionLength' | 'dimensionWidth' | 'dimensionHeight';
type PageTab = 'consulta' | 'medidas';
type MeasuresMode = 'manual' | 'massa';

const LABELS: Record<string, string> = {
  partno: 'Part Number',
  description: 'Descricao',
  name: 'Nome',
  category: 'Categoria',
  subCategory: 'Subcategoria',
  cat: 'Cod. Categoria',
  price_price: 'Preco',
  price_stock: 'Estoque',
  price_currency: 'Moeda',
  brand: 'Marca',
  sku: 'SKU',
  weight: 'Peso',
  status: 'Status',
  dimensionLength: 'Comprimento',
  dimensionWidth: 'Largura',
  dimensionHeight: 'Altura',
};

const PRIORITY = [
  'partno',
  'description',
  'name',
  'category',
  'subCategory',
  'cat',
  'price_price',
  'price_stock',
  'price_currency',
  'brand',
  'sku',
  'weight',
  'dimensionLength',
  'dimensionWidth',
  'dimensionHeight',
  'status',
];

const HIDDEN = new Set(['COMPATIBILIDADE', 'compatibilidade', 'id', 'created_at', 'updated_at']);
const MEASURE_FIELDS: MeasureField[] = ['weight', 'dimensionLength', 'dimensionWidth', 'dimensionHeight'];
const MEASURES_BACKEND_UNAVAILABLE_MESSAGE =
  'Os endpoints de Conferencia de Medidas ainda nao estao publicados no backend.';

type AdminJsonResult<T> = {
  ok: boolean;
  status: number;
  data: T | null;
  error: string | null;
  missingRoute: boolean;
};

async function readAdminJson<T>(response: Response, fallbackMessage: string): Promise<AdminJsonResult<T>> {
  const text = await response.text();
  let data: any = null;

  if (text.trim()) {
    try {
      data = JSON.parse(text);
    } catch {
      if (response.status === 404) {
        return {
          ok: false,
          status: response.status,
          data: null,
          error: MEASURES_BACKEND_UNAVAILABLE_MESSAGE,
          missingRoute: true,
        };
      }
      return {
        ok: false,
        status: response.status,
        data: null,
        error: fallbackMessage,
        missingRoute: false,
      };
    }
  }

  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      data,
      error:
        (data && typeof data === 'object' && 'error' in data && typeof data.error === 'string'
          ? data.error
          : null) || (response.status === 404 ? MEASURES_BACKEND_UNAVAILABLE_MESSAGE : fallbackMessage),
      missingRoute: response.status === 404,
    };
  }

  return {
    ok: true,
    status: response.status,
    data,
    error: null,
    missingRoute: false,
  };
}

function sortFields(product: Record<string, any>): [string, any][] {
  const entries = Object.entries(product).filter(([k]) => !HIDDEN.has(k));
  const pri: [string, any][] = [];
  const rest: [string, any][] = [];
  for (const entry of entries) (PRIORITY.includes(entry[0]) ? pri : rest).push(entry);
  pri.sort((a, b) => PRIORITY.indexOf(a[0]) - PRIORITY.indexOf(b[0]));
  return [...pri, ...rest];
}

function fmt(key: string, val: any): string {
  if (val == null) return '—';
  if (key.includes('price') && typeof val === 'number') return `R$ ${val.toFixed(2)}`;
  const text = String(val);
  return text.length > 300 ? `${text.slice(0, 300)}...` : text;
}

function formatMeasureValue(value: any, field: MeasureField, mode: 'toyotaRaw' | 'normalized' | 'toyoparts') {
  if (value == null || value === '') return '—';
  const num = Number(value);
  if (!Number.isFinite(num)) return String(value);
  if (mode === 'toyotaRaw') return field === 'weight' ? `${num} g` : `${num} mm`;
  return field === 'weight' ? `${num.toFixed(3)} kg` : `${num.toFixed(1)} cm`;
}

function statusBadgeColor(status: string): 'success' | 'warning' | 'error' | 'brand' {
  if (status === 'sincronizado') return 'success';
  if (status === 'faltando_no_toyoparts') return 'warning';
  if (status === 'divergente') return 'error';
  return 'brand';
}

function statusLabel(status: string) {
  if (status === 'sincronizado') return 'Sincronizado';
  if (status === 'faltando_no_toyoparts') return 'Faltando no site';
  if (status === 'divergente') return 'Divergente';
  return 'Sem dado Toyota';
}

function matchBadge(matchStatus: string) {
  if (matchStatus === 'elegivel') return { color: 'success' as const, label: 'Elegivel' };
  if (matchStatus === 'fuzzy') return { color: 'warning' as const, label: 'Fuzzy' };
  return { color: 'error' as const, label: 'Sem match' };
}

function rowStatusBadge(status: string) {
  if (status === 'synced') return { color: 'success' as const, label: 'Sincronizado' };
  if (status === 'pending') return { color: 'warning' as const, label: 'Pendente' };
  return { color: 'error' as const, label: 'Sem match' };
}

function measureCellTone(status: string, source: 'current' | 'toyota') {
  const base = 'min-w-[112px] rounded-lg border px-3 py-2';
  if (status === 'sincronizado') return `${base} border-emerald-200 bg-emerald-50`;
  if (status === 'sem_dado_toyota') return `${base} border-border bg-secondary/60`;
  if (source === 'toyota') return `${base} border-primary/25 bg-primary/5`;
  if (status === 'faltando_no_toyoparts') return `${base} border-amber-200 bg-amber-50`;
  return `${base} border-rose-200 bg-rose-50`;
}

function compactMeasureSummary(row: any) {
  const parts: string[] = [];
  if (row.divergentFields?.length) parts.push(`${row.divergentFields.length} divergente(s)`);
  if (row.missingFields?.length) parts.push(`${row.missingFields.length} faltando`);
  return parts.length ? parts.join(' • ') : 'Sem divergencias';
}

function defaultSelectedFields(comparison: any) {
  const selected: Record<string, boolean> = {};
  for (const field of MEASURE_FIELDS) selected[field] = !!comparison?.fields?.[field]?.applyEligible;
  return selected;
}

function SessionTabButton({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'rounded-lg border px-4 py-2.5 text-sm font-semibold transition-colors',
        active
          ? 'border-primary bg-primary text-primary-foreground shadow-xs'
          : 'border-border bg-white text-foreground hover:bg-secondary',
      ].join(' ')}
    >
      {label}
    </button>
  );
}

function ToyotaLookupPanel() {
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

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    (async () => {
      try {
        const response = await adminFetch(`${API}/diagnostico`);
        const data = await response.json();
        setDiag(data);
        setShowDiag(true);
      } catch (error) {
        console.error(error);
      }

      setLoading(true);
      try {
        const response = await adminFetch(`${API}/buscar?partno=533010K010`);
        const data = await response.json();
        setResult(data);
      } catch (error: any) {
        setResult({ found: false, partno: '533010K010', error: error.message });
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleSearch = useCallback(async () => {
    const value = query.trim();
    if (!value) {
      toast.error('Digite um PartNo');
      return;
    }
    setLoading(true);
    setResult(null);
    setAiResult(null);
    try {
      const response = await adminFetch(`${API}/buscar?partno=${encodeURIComponent(value)}`);
      const data = await response.json();
      setResult(data);
      if (data.found) toast.success(`Encontrado: ${data.partno}`);
      else toast.warning(data.message || 'Nao encontrado');
    } catch (error: any) {
      toast.error(error.message);
      setResult({ found: false, partno: value, error: error.message });
    } finally {
      setLoading(false);
    }
  }, [query]);

  const handleDiag = useCallback(async () => {
    setDiagLoading(true);
    try {
      const response = await adminFetch(`${API}/diagnostico`);
      setDiag(await response.json());
      setShowDiag(true);
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setDiagLoading(false);
    }
  }, []);

  const handleAI = useCallback(async () => {
    if (!result?.product) return;
    setAiLoading(true);
    setAiResult(null);
    try {
      const response = await adminFetch(`${API}/interpretar`, {
        method: 'POST',
        body: JSON.stringify({ descricao: JSON.stringify(result.product, null, 2) }),
      });
      const data = await response.json();
      if (data.error) {
        toast.error(`IA: ${data.error}`);
        setAiResult(`ERRO: ${data.error}`);
      } else {
        setAiResult(data.interpretacao || 'Sem resposta');
        toast.success('Conteudo gerado com sucesso');
      }
    } catch (error: any) {
      toast.error(`Erro IA: ${error.message}`);
      setAiResult(`ERRO: ${error.message}`);
    } finally {
      setAiLoading(false);
    }
  }, [result]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-foreground">Consulta Toyota</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Busque por PartNo para ver informacoes do SKU e compatibilidades.
          </p>
        </div>
        <Button
          color="secondary"
          size="sm"
          onClick={handleDiag}
          isLoading={diagLoading}
          iconLeading={<Activity className="w-4 h-4" />}
        >
          Diagnostico
        </Button>
      </div>

      <Card.Root>
        <Card.Content className="p-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1">
              <Input
                placeholder="PartNo (ex: 533010K010)"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                iconLeading={Search}
                className="h-12 text-base"
              />
            </div>
            <Button
              color="primary"
              size="lg"
              onClick={handleSearch}
              isLoading={loading}
              iconLeading={<Search className="w-5 h-5" />}
              className="min-w-[140px]"
            >
              Buscar
            </Button>
          </div>
        </Card.Content>
      </Card.Root>

      {showDiag && diag && (
        <Card.Root className={diag.ok ? 'border-success/30' : 'border-destructive/30'}>
          <Card.Header className="cursor-pointer" onClick={() => setShowDiag(false)}>
            <div className="flex items-center justify-between">
              <Card.Title className="flex items-center gap-2 text-base">
                {diag.ok ? (
                  <CheckCircle2 className="w-5 h-5 text-success" />
                ) : (
                  <AlertTriangle className="w-5 h-5 text-destructive" />
                )}
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
                <Badge
                  variant="pill-color"
                  color={diag.banco_toyoparts.rows > 0 ? 'success' : 'error'}
                  size="xs"
                >
                  {diag.banco_toyoparts.rows} rows
                </Badge>
              </div>
            )}
            {diag.banco_toyoparts_cods && (
              <div className="flex items-center gap-2">
                <Wrench className="w-4 h-4" />
                <span className="text-sm font-medium">banco_toyoparts_cods</span>
                <Badge
                  variant="pill-color"
                  color={diag.banco_toyoparts_cods.rows > 0 ? 'success' : 'error'}
                  size="xs"
                >
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

      {result?.found && result.product && (
        <div className="space-y-6">
          <Card.Root className="border-primary/20">
            <Card.Header>
              <div className="flex items-center justify-between flex-wrap gap-2">
                <Card.Title className="flex items-center gap-2">
                  <Package className="w-5 h-5 text-primary" />
                  {result.partno}
                </Card.Title>
                <div className="flex items-center gap-2">
                  <Badge variant="pill-color" color="success" size="sm" dot>
                    Encontrado
                  </Badge>
                  <Button
                    color="secondary"
                    size="xs"
                    onClick={() => setShowRaw(!showRaw)}
                    iconLeading={showRaw ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                  >
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
                      <button
                        className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-secondary"
                        onClick={() => copy(String(value ?? ''), key)}
                      >
                        {copied === key ? (
                          <Check className="w-3 h-3 text-success" />
                        ) : (
                          <Copy className="w-3 h-3 text-muted-foreground" />
                        )}
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
                    {result.compatibilidades.map((compat: any, index: number) => (
                      <Table.Row key={`${compat.codigo}-${index}`}>
                        <Table.Cell className="text-muted-foreground font-mono text-xs">{index + 1}</Table.Cell>
                        <Table.Cell>
                          <code className="text-xs font-mono bg-secondary/60 px-2 py-0.5 rounded">{compat.codigo}</code>
                        </Table.Cell>
                        <Table.Cell className="font-medium whitespace-normal max-w-[400px]">{compat.descricao}</Table.Cell>
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

          <Card.Root>
            <Card.Header>
              <div className="flex items-center justify-between flex-wrap gap-2">
                <Card.Title className="flex items-center gap-2 text-base">
                  <Wrench className="w-5 h-5 text-primary" />
                  Interpretacao IA
                </Card.Title>
                <Button
                  color="primary"
                  size="sm"
                  onClick={handleAI}
                  isLoading={aiLoading}
                  iconLeading={<RefreshCw className="w-4 h-4" />}
                >
                  Gerar Conteudo
                </Button>
              </div>
            </Card.Header>
            {aiResult && (
              <Card.Content>
                <div className="bg-secondary/30 rounded-lg p-4 whitespace-pre-wrap text-sm leading-relaxed">
                  {aiResult}
                </div>
                <button
                  className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => copy(aiResult, '__ai')}
                >
                  {copied === '__ai' ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-success" />
                      Copiado!
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      Copiar
                    </>
                  )}
                </button>
              </Card.Content>
            )}
          </Card.Root>
        </div>
      )}

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

function MeasureHistoryList({ history, loading }: { history: any[]; loading: boolean }) {
  return (
    <Card.Root>
      <Card.Header>
        <Card.Title className="flex items-center gap-2 text-base">
          <ShieldCheck className="w-5 h-5 text-primary" />
          Historico de aplicacoes
        </Card.Title>
        <Card.Description>Ultimas sincronizacoes de medidas aplicadas ao Toyoparts.</Card.Description>
      </Card.Header>
      <Card.Content className="space-y-3">
        {loading && <p className="text-sm text-muted-foreground">Carregando historico...</p>}
        {!loading && history.length === 0 && (
          <p className="text-sm text-muted-foreground">Nenhuma aplicacao registrada ainda.</p>
        )}
        {!loading && history.map((item) => (
          <div key={item.id} className="rounded-lg border border-border bg-secondary/20 p-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2 flex-wrap">
                <code className="rounded bg-secondary px-2 py-1 text-xs font-mono text-foreground">{item.sku}</code>
                <Badge variant="pill-color" color="brand" size="xs">
                  {item.applied_fields?.length || 0} campo(s)
                </Badge>
              </div>
              <span className="text-xs text-muted-foreground">
                {item.applied_at ? new Date(item.applied_at).toLocaleString('pt-BR') : '—'}
              </span>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              Aplicado: {(item.applied_fields || []).map((field: string) => LABELS[field] || field).join(', ')}
            </p>
          </div>
        ))}
      </Card.Content>
    </Card.Root>
  );
}

function MeasuresManualPanel({
  onApplied,
  backendUnavailable = false,
  backendMessage = MEASURES_BACKEND_UNAVAILABLE_MESSAGE,
}: {
  onApplied: () => Promise<void>;
  backendUnavailable?: boolean;
  backendMessage?: string;
}) {
  const [sku, setSku] = useState('533010K020');
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [comparison, setComparison] = useState<any>(null);
  const [review, setReview] = useState<any>(null);
  const [selectedFields, setSelectedFields] = useState<Record<string, boolean>>({});
  const autoLoaded = useRef(false);

  const handleCompare = useCallback(async () => {
    if (backendUnavailable) {
      toast.error(backendMessage);
      return;
    }
    const value = sku.trim();
    if (!value) {
      toast.error('Digite um SKU para comparar');
      return;
    }
    setLoading(true);
    try {
      const response = await adminFetch(`${API}/comparar-medidas`, {
        method: 'POST',
        body: JSON.stringify({ sku: value }),
      });
      const result = await readAdminJson<any>(response, 'Falha ao comparar medidas');
      if (!result.ok) throw new Error(result.error || 'Falha ao comparar medidas');
      setComparison(result.data?.comparison || null);
      setReview(result.data?.review || null);
      setSelectedFields(defaultSelectedFields(result.data?.comparison));
    } catch (error: any) {
      toast.error(error.message);
      setComparison(null);
      setReview(null);
      setSelectedFields({});
    } finally {
      setLoading(false);
    }
  }, [sku]);

  const handleApply = useCallback(async () => {
    if (backendUnavailable) {
      toast.error(backendMessage);
      return;
    }
    if (!comparison?.sku) return;
    const fields = MEASURE_FIELDS.filter((field) => selectedFields[field]);
    if (!fields.length) {
      toast.error('Selecione ao menos um campo elegivel');
      return;
    }
    setApplying(true);
    try {
      const response = await adminFetch(`${API}/aplicar-medidas`, {
        method: 'POST',
        body: JSON.stringify({ sku: comparison.sku, fields }),
      });
      const result = await readAdminJson<any>(response, 'Falha ao aplicar medidas');
      if (!result.ok) throw new Error(result.error || 'Falha ao aplicar medidas');
      setComparison(result.data?.comparison || null);
      setReview({ reviewed: false, reviewStillValid: false, reviewedAt: null, reviewedBy: null });
      setSelectedFields(defaultSelectedFields(result.data?.comparison));
      toast.success(`Medidas sincronizadas para ${comparison.sku}`);
      await onApplied();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setApplying(false);
    }
  }, [backendMessage, backendUnavailable, comparison, onApplied, selectedFields]);

  const handleToggleReviewed = useCallback(async () => {
    if (backendUnavailable) {
      toast.error(backendMessage);
      return;
    }
    if (!comparison?.sku) return;
    setReviewing(true);
    try {
      const reviewed = !!review?.reviewed && !!review?.reviewStillValid;
      const endpoint = reviewed ? 'desmarcar-medidas-conferidas' : 'marcar-medidas-conferidas';
      const response = await adminFetch(`${API}/${endpoint}`, {
        method: 'POST',
        body: JSON.stringify({ skus: [comparison.sku] }),
      });
      const result = await readAdminJson<any>(response, reviewed ? 'Falha ao desmarcar conferido' : 'Falha ao marcar conferido');
      if (!result.ok) throw new Error(result.error || (reviewed ? 'Falha ao desmarcar conferido' : 'Falha ao marcar conferido'));
      toast.success(reviewed ? `SKU ${comparison.sku} voltou para revisao` : `SKU ${comparison.sku} marcado como conferido`);
      await handleCompare();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setReviewing(false);
    }
  }, [backendMessage, backendUnavailable, comparison, handleCompare, review]);

  useEffect(() => {
    if (autoLoaded.current || backendUnavailable) return;
    autoLoaded.current = true;
    void handleCompare();
  }, [backendUnavailable, handleCompare]);

  return (
    <div className="space-y-4">
      <Card.Root>
        <Card.Content className="p-4">
          <div className="flex flex-col lg:flex-row gap-3">
            <div className="flex-1">
              <Input
                placeholder="SKU do Toyoparts"
                value={sku}
                onChange={(e) => setSku(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCompare()}
                iconLeading={Search}
                className="h-11"
              />
            </div>
            <Button
              color="primary"
              size="md"
              onClick={handleCompare}
              isLoading={loading}
              disabled={backendUnavailable}
              iconLeading={<RefreshCw className="w-4 h-4" />}
            >
              Comparar SKU
            </Button>
          </div>
        </Card.Content>
      </Card.Root>

      {comparison && (
        <>
          <Card.Root>
            <Card.Header>
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                <div>
                  <Card.Title className="flex items-center gap-2">
                    <Package className="w-5 h-5 text-primary" />
                    {comparison.sku}
                  </Card.Title>
                  <Card.Description className="mt-1">
                    {comparison.productName || 'Produto sem nome cadastrado'}
                  </Card.Description>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge
                    variant="pill-color"
                    color={comparison.match.eligible ? 'success' : comparison.match.found ? 'warning' : 'error'}
                    size="sm"
                  >
                    {comparison.match.eligible ? 'Toyota elegivel' : comparison.match.found ? 'Match fuzzy' : 'Sem match Toyota'}
                  </Badge>
                  <Badge variant="pill-color" color={comparison.summary.hasDifferences ? 'warning' : 'success'} size="sm">
                    {comparison.summary.hasDifferences ? 'Com divergencias' : 'Ja sincronizado'}
                  </Badge>
                  {!!review?.reviewed && !!review?.reviewStillValid && (
                    <Badge variant="pill-color" color="brand" size="sm">
                      Conferido sem aplicar
                    </Badge>
                  )}
                </div>
              </div>
            </Card.Header>
            <Card.Content className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="rounded-lg border border-border bg-secondary/20 p-4">
                <p className="text-xs uppercase tracking-wider text-muted-foreground">PartNo Toyota</p>
                <p className="mt-1 text-sm font-semibold text-foreground">{comparison.match.matchedPartno || '—'}</p>
              </div>
              <div className="rounded-lg border border-border bg-secondary/20 p-4">
                <p className="text-xs uppercase tracking-wider text-muted-foreground">Campos divergentes</p>
                <p className="mt-1 text-sm font-semibold text-foreground">{comparison.summary.divergentCount}</p>
              </div>
              <div className="rounded-lg border border-border bg-secondary/20 p-4">
                <p className="text-xs uppercase tracking-wider text-muted-foreground">Campos faltando</p>
                <p className="mt-1 text-sm font-semibold text-foreground">{comparison.summary.missingCount}</p>
              </div>
              <div className="rounded-lg border border-border bg-secondary/20 p-4">
                <p className="text-xs uppercase tracking-wider text-muted-foreground">Campos aplicaveis</p>
                <p className="mt-1 text-sm font-semibold text-foreground">{comparison.summary.applicableFieldCount}</p>
              </div>
            </Card.Content>
          </Card.Root>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {MEASURE_FIELDS.map((field) => {
              const row = comparison.fields[field];
              return (
                <Card.Root key={field} className={row.status === 'divergente' ? 'border-destructive/30' : row.status === 'faltando_no_toyoparts' ? 'border-warning/30' : 'border-border'}>
                  <Card.Header>
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <Card.Title className="flex items-center gap-2 text-base">
                          {field === 'weight' ? (
                            <Scale className="w-4 h-4 text-primary" />
                          ) : (
                            <Ruler className="w-4 h-4 text-primary" />
                          )}
                          {LABELS[field]}
                        </Card.Title>
                        <Badge variant="pill-color" color={statusBadgeColor(row.status)} size="xs">
                          {statusLabel(row.status)}
                        </Badge>
                      </div>
                      <label className="flex items-center gap-2 text-sm text-foreground">
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-border"
                          checked={!!selectedFields[field]}
                          disabled={!row.applyEligible || applying}
                          onChange={(e) => setSelectedFields((current) => ({ ...current, [field]: e.target.checked }))}
                        />
                        Aplicar
                      </label>
                    </div>
                  </Card.Header>
                  <Card.Content className="space-y-3">
                    <div className="rounded-lg bg-secondary/20 p-3">
                      <p className="text-xs uppercase tracking-wider text-muted-foreground">Toyota bruto</p>
                      <p className="mt-1 text-sm font-semibold text-foreground">{formatMeasureValue(row.toyotaRaw, field, 'toyotaRaw')}</p>
                    </div>
                    <div className="rounded-lg bg-secondary/20 p-3">
                      <p className="text-xs uppercase tracking-wider text-muted-foreground">Toyota normalizado</p>
                      <p className="mt-1 text-sm font-semibold text-foreground">{formatMeasureValue(row.toyotaNormalized, field, 'normalized')}</p>
                    </div>
                    <div className="rounded-lg bg-secondary/20 p-3">
                      <p className="text-xs uppercase tracking-wider text-muted-foreground">Toyoparts atual</p>
                      <p className="mt-1 text-sm font-semibold text-foreground">{formatMeasureValue(row.toyopartsValue, field, 'toyoparts')}</p>
                    </div>
                  </Card.Content>
                </Card.Root>
              );
            })}
          </div>

          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              A Toyota e soberana. A aplicacao usa os valores normalizados e atualiza o Toyoparts imediatamente.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                color="secondary"
                size="md"
                onClick={handleToggleReviewed}
                isLoading={reviewing}
                disabled={backendUnavailable || applying}
              >
                {!!review?.reviewed && !!review?.reviewStillValid ? 'Desmarcar conferido' : 'Conferido sem aplicar'}
              </Button>
              <Button
                color="primary"
                size="md"
                onClick={handleApply}
                isLoading={applying}
                iconLeading={<CheckCircle2 className="w-4 h-4" />}
                disabled={backendUnavailable || !comparison.summary.canApply || reviewing}
              >
                Aplicar selecionados
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function MeasuresBulkPanel({
  onApplied,
  backendUnavailable = false,
  backendMessage = MEASURES_BACKEND_UNAVAILABLE_MESSAGE,
}: {
  onApplied: () => Promise<void>;
  backendUnavailable?: boolean;
  backendMessage?: string;
}) {
  const [rows, setRows] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [fieldApplyingKey, setFieldApplyingKey] = useState<string | null>(null);
  const [rowApplyingSku, setRowApplyingSku] = useState<string | null>(null);
  const [reviewActionSku, setReviewActionSku] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [onlyDivergent, setOnlyDivergent] = useState(true);
  const [inStockOnly, setInStockOnly] = useState(false);
  const [showReviewed, setShowReviewed] = useState(false);
  const [field, setField] = useState<'all' | MeasureField>('all');
  const [matchStatus, setMatchStatus] = useState<'all' | 'elegivel' | 'sem_match' | 'fuzzy'>('all');
  const [rowStatus, setRowStatus] = useState<'all' | 'pending' | 'synced' | 'sem_match'>('all');
  const [offset, setOffset] = useState(0);
  const [limit] = useState(50);
  const [totalRows, setTotalRows] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [selectedSkus, setSelectedSkus] = useState<string[]>([]);
  const [recentlySyncedSkus, setRecentlySyncedSkus] = useState<string[]>([]);

  const allSelected = useMemo(
    () => rows.length > 0 && rows.every((row) => selectedSkus.includes(row.sku)),
    [rows, selectedSkus],
  );

  const rowMatchesCurrentFilters = useCallback((row: any) => {
    if (onlyDivergent && !row.hasDifferences) return false;
    if (inStockOnly && !row.inStock) return false;
    if (field !== 'all' && ![...row.divergentFields, ...row.missingFields].includes(field)) return false;
    if (matchStatus !== 'all' && row.matchStatus !== matchStatus) return false;
    if (rowStatus !== 'all' && row.rowStatus !== rowStatus) return false;
    if (!showReviewed && row.reviewed && row.reviewStillValid) return false;
    return true;
  }, [field, inStockOnly, matchStatus, onlyDivergent, rowStatus, showReviewed]);

  const mergeRows = useCallback((currentRows: any[], incomingRows: any[]) => {
    const bySku = new Map<string, any>();
    for (const row of currentRows) bySku.set(row.sku, row);
    for (const row of incomingRows) bySku.set(row.sku, row);
    return Array.from(bySku.values());
  }, []);

  const patchSingleRow = useCallback((nextRow: any) => {
    setRows((current) => current.flatMap((row) => (
      row.sku !== nextRow.sku ? [row] : (rowMatchesCurrentFilters(nextRow) ? [nextRow] : [])
    )));
    setSelectedSkus((current) => current.filter((sku) => sku !== nextRow.sku || rowMatchesCurrentFilters(nextRow)));
  }, [rowMatchesCurrentFilters]);

  const patchManyRows = useCallback((nextRows: any[]) => {
    const patchMap = new Map(nextRows.map((row) => [row.sku, row]));
    setRows((current) => current.flatMap((row) => {
      const nextRow = patchMap.get(row.sku);
      if (!nextRow) return [row];
      return rowMatchesCurrentFilters(nextRow) ? [nextRow] : [];
    }));
    setSelectedSkus((current) => current.filter((sku) => {
      const nextRow = patchMap.get(sku);
      return nextRow ? rowMatchesCurrentFilters(nextRow) : true;
    }));
  }, [rowMatchesCurrentFilters]);

  const loadRows = useCallback(async ({
    requestOffset = 0,
    append = false,
  }: {
    requestOffset?: number;
    append?: boolean;
  } = {}) => {
    if (backendUnavailable) {
      setRows([]);
      setStats(null);
      setTotalRows(0);
      setHasMore(false);
      setOffset(0);
      setSelectedSkus([]);
      return;
    }
    setLoading(true);
    try {
      const response = await adminFetch(`${API}/comparar-medidas-lote`, {
        method: 'POST',
        body: JSON.stringify({
          offset: requestOffset,
          limit,
          q,
          onlyDivergent,
          inStockOnly,
          field,
          matchStatus,
          rowStatus,
          showReviewed,
        }),
      });
      const result = await readAdminJson<any>(response, 'Falha ao carregar analise em massa');
      if (!result.ok) throw new Error(result.error || 'Falha ao carregar analise em massa');
      const incomingRows = result.data?.rows || [];
      setRows((current) => (append ? mergeRows(current, incomingRows) : incomingRows));
      setRecentlySyncedSkus((current) => current.filter((sku) => incomingRows.some((row: any) => row.sku === sku)));
      setStats(result.data?.stats || null);
      setTotalRows(result.data?.total_rows || 0);
      setHasMore(Boolean(result.data?.has_more));
      setOffset(result.data?.nextOffset || 0);
      if (!append) setSelectedSkus([]);
    } catch (error: any) {
      toast.error(error.message);
      setRows([]);
      setStats(null);
      setTotalRows(0);
      setHasMore(false);
    } finally {
      setLoading(false);
    }
  }, [backendUnavailable, field, inStockOnly, limit, matchStatus, mergeRows, onlyDivergent, q, rowStatus, showReviewed]);

  useEffect(() => {
    void loadRows({ requestOffset: 0, append: false });
    setOffset(0);
  }, [field, inStockOnly, loadRows, matchStatus, onlyDivergent, q, rowStatus, showReviewed]);

  const handleApplyField = useCallback(async (row: any, fieldKey: MeasureField) => {
    if (backendUnavailable) {
      toast.error(backendMessage);
      return;
    }
    const applyKey = `${row.sku}:${fieldKey}`;
    setFieldApplyingKey(applyKey);
    try {
      const response = await adminFetch(`${API}/aplicar-medidas`, {
        method: 'POST',
        body: JSON.stringify({ sku: row.sku, fields: [fieldKey] }),
      });
      const result = await readAdminJson<any>(response, 'Falha ao aplicar campo');
      if (!result.ok) throw new Error(result.error || 'Falha ao aplicar campo');
      if (result.data?.row) {
        patchSingleRow(result.data.row);
        if (!result.data.row.hasDifferences || result.data.row.rowStatus === 'synced') {
          setRecentlySyncedSkus((current) => [...new Set([...current, result.data.row.sku])]);
        }
      }
      toast.success(`${LABELS[fieldKey]} sincronizado em ${row.sku}`);
      await onApplied();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setFieldApplyingKey(null);
    }
  }, [backendMessage, backendUnavailable, onApplied, patchSingleRow]);

  const handleApplyRow = useCallback(async (row: any) => {
    if (backendUnavailable) {
      toast.error(backendMessage);
      return;
    }
    setRowApplyingSku(row.sku);
    try {
      const response = await adminFetch(`${API}/aplicar-medidas`, {
        method: 'POST',
        body: JSON.stringify({ sku: row.sku }),
      });
      const result = await readAdminJson<any>(response, 'Falha ao aplicar linha');
      if (!result.ok) throw new Error(result.error || 'Falha ao aplicar linha');
      if (result.data?.row) {
        patchSingleRow(result.data.row);
        if (!result.data.row.hasDifferences || result.data.row.rowStatus === 'synced') {
          setRecentlySyncedSkus((current) => [...new Set([...current, result.data.row.sku])]);
        }
      }
      toast.success(`SKU ${row.sku} sincronizado com Toyota`);
      await onApplied();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setRowApplyingSku(null);
    }
  }, [backendMessage, backendUnavailable, onApplied, patchSingleRow]);

  const handleApplySelected = useCallback(async () => {
    if (backendUnavailable) {
      toast.error(backendMessage);
      return;
    }
    if (!selectedSkus.length) {
      toast.error('Selecione ao menos um SKU');
      return;
    }
    setApplying(true);
    try {
      const response = await adminFetch(`${API}/aplicar-medidas-lote`, {
        method: 'POST',
        body: JSON.stringify({ skus: selectedSkus }),
      });
      const result = await readAdminJson<any>(response, 'Falha ao aplicar medidas em massa');
      if (!result.ok) throw new Error(result.error || 'Falha ao aplicar medidas em massa');
      const appliedRows = new Map<string, any>();
      for (const entry of result.data?.applied || []) {
        if (entry?.row?.sku) appliedRows.set(entry.row.sku, entry.row);
      }
      if (appliedRows.size) {
        const nextRows = Array.from(appliedRows.values());
        patchManyRows(nextRows);
        const syncedSkus = nextRows
          .filter((row) => !row.hasDifferences || row.rowStatus === 'synced')
          .map((row) => row.sku);
        if (syncedSkus.length) {
          setRecentlySyncedSkus((current) => [...new Set([...current, ...syncedSkus])]);
        }
      }
      const appliedCount = result.data?.applied_count || 0;
      const skippedCount = result.data?.skipped_count || 0;
      toast.success(
        skippedCount
          ? `${appliedCount} SKU(s) sincronizado(s) e ${skippedCount} ignorado(s)`
          : `${appliedCount} SKU(s) sincronizado(s)`,
      );
      setSelectedSkus((current) => current.filter((sku) => !appliedRows.has(sku)));
      await onApplied();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setApplying(false);
    }
  }, [backendMessage, backendUnavailable, onApplied, patchManyRows, selectedSkus]);

  const handleMarkReviewed = useCallback(async (skus: string[], markReviewed: boolean) => {
    if (backendUnavailable) {
      toast.error(backendMessage);
      return;
    }
    const uniqueSkus = [...new Set(skus.map((sku) => String(sku || '').trim()).filter(Boolean))];
    if (!uniqueSkus.length) {
      toast.error('Selecione ao menos um SKU');
      return;
    }
    const singleSku = uniqueSkus.length === 1 ? uniqueSkus[0] : null;
    if (singleSku) setReviewActionSku(singleSku);
    else setReviewing(true);
    try {
      const endpoint = markReviewed ? 'marcar-medidas-conferidas' : 'desmarcar-medidas-conferidas';
      const response = await adminFetch(`${API}/${endpoint}`, {
        method: 'POST',
        body: JSON.stringify({ skus: uniqueSkus }),
      });
      const result = await readAdminJson<any>(response, `Falha ao ${markReviewed ? 'marcar' : 'desmarcar'} conferido`);
      if (!result.ok) throw new Error(result.error || `Falha ao ${markReviewed ? 'marcar' : 'desmarcar'} conferido`);

      if (markReviewed) {
        const reviewedRows = (result.data?.reviewed || []).map((entry: any) => entry.row).filter(Boolean);
        if (reviewedRows.length) patchManyRows(reviewedRows);
        setSelectedSkus((current) => current.filter((sku) => !uniqueSkus.includes(sku)));
        toast.success(
          uniqueSkus.length === 1 ? `SKU ${uniqueSkus[0]} marcado como conferido` : `${uniqueSkus.length} SKU(s) marcados como conferidos`,
        );
      } else {
        await loadRows({ requestOffset: 0, append: false });
        toast.success(
          uniqueSkus.length === 1 ? `SKU ${uniqueSkus[0]} voltou para revisao` : `${uniqueSkus.length} SKU(s) voltaram para revisao`,
        );
      }
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setReviewActionSku(null);
      setReviewing(false);
    }
  }, [backendMessage, backendUnavailable, loadRows, patchManyRows]);

  const renderMeasureCell = useCallback((row: any, fieldKey: MeasureField, source: 'current' | 'toyota') => {
    const fieldState = row.fields?.[fieldKey];
    const isToyota = source === 'toyota';
    const applyKey = `${row.sku}:${fieldKey}`;
    return (
      <div className={measureCellTone(fieldState?.status || 'sem_dado_toyota', source)}>
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {isToyota ? 'Toyota' : 'Site'}
        </p>
        <p className="mt-1 text-sm font-semibold text-foreground">
          {formatMeasureValue(
            isToyota ? fieldState?.toyotaNormalized : fieldState?.toyopartsValue,
            fieldKey,
            isToyota ? 'normalized' : 'toyoparts',
          )}
        </p>
        {isToyota && fieldState?.applyEligible && fieldState?.status !== 'sincronizado' && (
          <Button
            type="button"
            color="secondary"
            size="xs"
            className="mt-2"
            isLoading={fieldApplyingKey === applyKey}
            disabled={backendUnavailable || rowApplyingSku === row.sku || applying || reviewing || !!reviewActionSku}
            onClick={() => {
              void handleApplyField(row, fieldKey);
            }}
          >
            Aprovar
          </Button>
        )}
      </div>
    );
  }, [applying, backendUnavailable, fieldApplyingKey, handleApplyField, reviewActionSku, reviewing, rowApplyingSku]);

  return (
    <div className="space-y-4">
      <Card.Root>
        <Card.Content className="p-4 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-[minmax(0,1.3fr)_180px_180px_180px] gap-3">
            <Input
              placeholder="Buscar SKU ou nome"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  void loadRows({ requestOffset: 0, append: false });
                }
              }}
              iconLeading={Search}
            />
            <select
              value={field}
              onChange={(e) => setField(e.target.value as 'all' | MeasureField)}
              className="h-11 rounded-lg border border-border bg-white px-3 text-sm text-foreground"
            >
              <option value="all">Todos os campos</option>
              <option value="weight">Peso</option>
              <option value="dimensionLength">Comprimento</option>
              <option value="dimensionWidth">Largura</option>
              <option value="dimensionHeight">Altura</option>
            </select>
            <select
              value={matchStatus}
              onChange={(e) => setMatchStatus(e.target.value as 'all' | 'elegivel' | 'sem_match' | 'fuzzy')}
              className="h-11 rounded-lg border border-border bg-white px-3 text-sm text-foreground"
            >
              <option value="all">Todos os matches</option>
              <option value="elegivel">Match elegivel</option>
              <option value="fuzzy">Match fuzzy</option>
              <option value="sem_match">Sem match</option>
            </select>
            <select
              value={rowStatus}
              onChange={(e) => setRowStatus(e.target.value as 'all' | 'pending' | 'synced' | 'sem_match')}
              className="h-11 rounded-lg border border-border bg-white px-3 text-sm text-foreground"
            >
              <option value="all">Todos os status</option>
              <option value="pending">Pendentes</option>
              <option value="synced">Sincronizados</option>
              <option value="sem_match">Sem match Toyota</option>
            </select>
          </div>

          <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3">
            <div className="flex flex-col sm:flex-row sm:flex-wrap gap-3 sm:gap-5">
              <label className="inline-flex items-center gap-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-border"
                  checked={onlyDivergent}
                  onChange={(e) => setOnlyDivergent(e.target.checked)}
                />
                Mostrar apenas divergencias
              </label>
              <label className="inline-flex items-center gap-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-border"
                  checked={inStockOnly}
                  onChange={(e) => setInStockOnly(e.target.checked)}
                />
                Somente em estoque
              </label>
              <label className="inline-flex items-center gap-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-border"
                  checked={showReviewed}
                  onChange={(e) => setShowReviewed(e.target.checked)}
                />
                Mostrar conferidos
              </label>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                color="secondary"
                size="sm"
                onClick={() => {
                  void loadRows({ requestOffset: 0, append: false });
                }}
                isLoading={loading}
              >
                Atualizar analise
              </Button>
              <Button
                color="primary"
                size="sm"
                onClick={handleApplySelected}
                isLoading={applying}
                disabled={backendUnavailable || !selectedSkus.length}
                iconLeading={<CheckCircle2 className="w-4 h-4" />}
              >
                Aplicar soberano Toyota
              </Button>
              <Button
                color="secondary"
                size="sm"
                onClick={() => {
                  void handleMarkReviewed(selectedSkus, true);
                }}
                isLoading={reviewing}
                disabled={backendUnavailable || !selectedSkus.length || applying}
                iconLeading={<Check className="w-4 h-4" />}
              >
                Marcar conferido
              </Button>
            </div>
          </div>
        </Card.Content>
      </Card.Root>

      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
          <Card.Root><Card.Content className="p-3 sm:p-4"><p className="text-[11px] uppercase tracking-wide text-muted-foreground">SKUs do site</p><p className="mt-1 text-base sm:text-lg font-semibold">{stats.total_catalog_rows ?? stats.total_analyzed}</p></Card.Content></Card.Root>
          <Card.Root><Card.Content className="p-3 sm:p-4"><p className="text-[11px] uppercase tracking-wide text-muted-foreground">Com match Toyota</p><p className="mt-1 text-base sm:text-lg font-semibold">{stats.total_eligible_matches}</p></Card.Content></Card.Root>
          <Card.Root><Card.Content className="p-3 sm:p-4"><p className="text-[11px] uppercase tracking-wide text-muted-foreground">Pendentes</p><p className="mt-1 text-base sm:text-lg font-semibold">{stats.total_pending ?? stats.total_with_differences}</p></Card.Content></Card.Root>
          <Card.Root><Card.Content className="p-3 sm:p-4"><p className="text-[11px] uppercase tracking-wide text-muted-foreground">Sincronizados</p><p className="mt-1 text-base sm:text-lg font-semibold">{stats.total_synced ?? 0}</p></Card.Content></Card.Root>
          <Card.Root><Card.Content className="p-3 sm:p-4"><p className="text-[11px] uppercase tracking-wide text-muted-foreground">Sem match Toyota</p><p className="mt-1 text-base sm:text-lg font-semibold">{stats.total_without_match}</p></Card.Content></Card.Root>
        </div>
      )}

      <Card.Root>
        <Card.Content className="p-4 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <label className="inline-flex items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-border"
                checked={allSelected}
                onChange={(e) => setSelectedSkus(e.target.checked ? rows.map((row) => row.sku) : [])}
              />
              Selecionar os {rows.length} itens visiveis
            </label>
            <p className="text-sm text-muted-foreground">
              Carregados {rows.length} de {totalRows} itens filtrados.
            </p>
          </div>

          {loading && rows.length === 0 && (
            <div className="rounded-xl border border-border bg-secondary/30 p-6 text-sm text-muted-foreground">
              Carregando auditoria de medidas...
            </div>
          )}

          {!loading && rows.length === 0 && (
            <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              Nenhum SKU pendente para os filtros atuais.
            </div>
          )}

          <div className="space-y-3">
            {rows.map((row) => {
              const badge = matchBadge(row.matchStatus);
              const statusBadge = rowStatusBadge(row.rowStatus);
              const isReviewed = !!row.reviewed && !!row.reviewStillValid;
              const justSynced = recentlySyncedSkus.includes(row.sku) || row.rowStatus === 'synced' || !row.hasDifferences;
              const rowCanApply = row.canApply && row.hasDifferences && row.rowStatus !== 'synced';
              return (
                <Card.Root
                  key={row.sku}
                  className={justSynced ? 'border-emerald-300 bg-emerald-50/40 shadow-none' : 'border-border shadow-none'}
                >
                  <Card.Content className="p-4 space-y-4">
                    <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                      <div className="flex items-start gap-3 min-w-0">
                        <input
                          type="checkbox"
                          className="mt-1 h-4 w-4 rounded border-border"
                          checked={selectedSkus.includes(row.sku)}
                          onChange={(e) => {
                            setSelectedSkus((current) => (
                              e.target.checked
                                ? [...current, row.sku]
                                : current.filter((sku) => sku !== row.sku)
                            ));
                          }}
                        />
                        <div className="min-w-0 space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <code className="rounded bg-secondary px-2 py-1 text-xs font-mono">{row.sku}</code>
                            {row.matchedPartno && (
                              <span className="text-xs text-muted-foreground">Toyota: {row.matchedPartno}</span>
                            )}
                          </div>
                          <p className="text-sm font-semibold text-foreground break-words">{row.name || 'Sem nome'}</p>
                          <p className="text-xs text-muted-foreground">
                            {compactMeasureSummary(row)}
                            {isReviewed && row.reviewedAt ? ` • Conferido em ${new Date(row.reviewedAt).toLocaleString('pt-BR')}` : ''}
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Badge variant="pill-color" color={row.inStock ? 'success' : 'error'} size="xs">
                          {row.inStock ? `Em estoque${row.qty != null ? ` • Qtd ${row.qty}` : ''}` : 'Sem estoque'}
                        </Badge>
                        <Badge variant="pill-color" color={badge.color} size="xs">
                          {badge.label}
                        </Badge>
                        <Badge variant="pill-color" color={statusBadge.color} size="xs">
                          {statusBadge.label}
                        </Badge>
                        {isReviewed && (
                          <Badge variant="pill-color" color="brand" size="xs">
                            Conferido
                          </Badge>
                        )}
                        {justSynced && (
                          <Badge variant="pill-color" color="success" size="xs">
                            Sincronizado agora
                          </Badge>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
                      {MEASURE_FIELDS.map((fieldKey) => (
                        <div key={fieldKey} className="rounded-xl border border-border bg-secondary/20 p-3 space-y-3">
                          <div className="flex items-center justify-between gap-3">
                            <p className="text-sm font-semibold text-foreground">{LABELS[fieldKey]}</p>
                            <Badge variant="pill-color" color={statusBadgeColor(row.fields[fieldKey].status)} size="xs">
                              {statusLabel(row.fields[fieldKey].status)}
                            </Badge>
                          </div>
                          <div className="grid grid-cols-1 min-[420px]:grid-cols-2 gap-2">
                            {renderMeasureCell(row, fieldKey, 'current')}
                            {renderMeasureCell(row, fieldKey, 'toyota')}
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                      <div className="flex flex-wrap gap-1.5">
                        {MEASURE_FIELDS.map((fieldKey) => (
                          <Badge
                            key={fieldKey}
                            variant="pill-color"
                            color={statusBadgeColor(row.fields[fieldKey].status)}
                            size="xs"
                          >
                            {LABELS[fieldKey]}
                          </Badge>
                        ))}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {rowCanApply ? (
                          <Button
                            type="button"
                            color="secondary"
                            size="xs"
                            isLoading={rowApplyingSku === row.sku}
                            disabled={
                              backendUnavailable ||
                              !rowCanApply ||
                              applying ||
                              reviewing ||
                              !!(fieldApplyingKey && fieldApplyingKey.startsWith(`${row.sku}:`))
                            }
                            onClick={() => {
                              void handleApplyRow(row);
                            }}
                          >
                            Aprovar linha
                          </Button>
                        ) : (
                          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700">
                            Linha sincronizada
                          </div>
                        )}
                        <Button
                          type="button"
                          color="secondary"
                          size="xs"
                          isLoading={reviewActionSku === row.sku}
                          disabled={backendUnavailable || applying || reviewing || rowApplyingSku === row.sku}
                          onClick={() => {
                            void handleMarkReviewed([row.sku], !isReviewed);
                          }}
                        >
                          {isReviewed ? 'Desmarcar conferido' : 'Conferido sem aplicar'}
                        </Button>
                      </div>
                    </div>
                  </Card.Content>
                </Card.Root>
              );
            })}
          </div>
        </Card.Content>
      </Card.Root>

      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Total filtrado: {totalRows}. A fila carrega 50 por vez e esconde por padrao os SKUs ja conferidos sem alteracao.
        </p>
        <div className="flex items-center gap-2">
          <Button
            color="secondary"
            size="sm"
            onClick={() => {
              void loadRows({ requestOffset: offset, append: true });
            }}
            isLoading={loading && rows.length > 0}
            disabled={backendUnavailable || loading || !hasMore}
          >
            {hasMore ? 'Carregar proximos 50' : 'Todos os itens carregados'}
          </Button>
        </div>
      </div>
    </div>
  );
}

function MeasuresPanel() {
  const [mode, setMode] = useState<MeasuresMode>('manual');
  const [history, setHistory] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [availability, setAvailability] = useState<'checking' | 'available' | 'missing'>('checking');
  const [backendMessage, setBackendMessage] = useState<string | null>(null);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const response = await adminFetch(`${API}/historico-medidas?limit=12`);
      const result = await readAdminJson<any>(response, 'Falha ao carregar historico');
      if (!result.ok) {
        if (result.missingRoute) {
          setAvailability('missing');
          setBackendMessage(result.error || MEASURES_BACKEND_UNAVAILABLE_MESSAGE);
          setHistory([]);
          return;
        }
        throw new Error(result.error || 'Falha ao carregar historico');
      }
      setAvailability('available');
      setBackendMessage(null);
      setHistory(result.data?.items || []);
    } catch (error: any) {
      setAvailability('available');
      toast.error(error.message);
      setHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-primary" />
            Conferencia de Medidas
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Toyota soberana, comparacao normalizada por unidade e aprovacao aplica imediatamente no Toyoparts.
          </p>
        </div>
        <div className="flex gap-2">
          <SessionTabButton active={mode === 'manual'} label="Manual" onClick={() => setMode('manual')} />
          <SessionTabButton active={mode === 'massa'} label="Em Massa" onClick={() => setMode('massa')} />
        </div>
      </div>

      {backendMessage && (
        <Card.Root className="border-warning/30 bg-warning/5">
          <Card.Content className="flex items-start gap-3 p-4">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
            <div className="space-y-1">
              <p className="text-sm font-semibold text-foreground">Backend de medidas ainda nao publicado</p>
              <p className="text-sm text-muted-foreground">
                {backendMessage} A interface esta online, mas a comparacao e a aplicacao em massa vao funcionar
                assim que a Edge Function for publicada.
              </p>
            </div>
          </Card.Content>
        </Card.Root>
      )}

      <Card.Root className="border-primary/20 bg-primary/[0.02]">
        <Card.Content className="p-5">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="rounded-lg border border-border bg-white p-4">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-primary" />
                <p className="text-sm font-semibold text-foreground">Toyota soberana</p>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                Peso e dimensoes da Rede Pecas Toyota tem prioridade para decisao e aplicacao.
              </p>
            </div>
            <div className="rounded-lg border border-border bg-white p-4">
              <div className="flex items-center gap-2">
                <Scale className="w-4 h-4 text-primary" />
                <p className="text-sm font-semibold text-foreground">Normalizacao automatica</p>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                Toyota usa g/mm e o site usa kg/cm. A comparacao converte antes de decidir divergencia.
              </p>
            </div>
            <div className="rounded-lg border border-border bg-white p-4">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-primary" />
                <p className="text-sm font-semibold text-foreground">Aplicacao auditada</p>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                Cada aprovacao salva historico do produto e um log proprio da sessao de medidas.
              </p>
            </div>
          </div>
        </Card.Content>
      </Card.Root>

      {availability === 'checking' ? (
        <Card.Root>
          <Card.Content className="p-6">
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <RefreshCw className="h-4 w-4 animate-spin" />
              Verificando disponibilidade da Conferencia de Medidas...
            </div>
          </Card.Content>
        </Card.Root>
      ) : mode === 'manual' ? (
        <MeasuresManualPanel
          onApplied={loadHistory}
          backendUnavailable={availability === 'missing'}
          backendMessage={backendMessage || MEASURES_BACKEND_UNAVAILABLE_MESSAGE}
        />
      ) : (
        <MeasuresBulkPanel
          onApplied={loadHistory}
          backendUnavailable={availability === 'missing'}
          backendMessage={backendMessage || MEASURES_BACKEND_UNAVAILABLE_MESSAGE}
        />
      )}

      <MeasureHistoryList history={history} loading={historyLoading} />
    </div>
  );
}

export function RedePecasPage() {
  const [tab, setTab] = useState<PageTab>('consulta');

  return (
    <div className="max-w-[1280px] mx-auto px-4 lg:px-6 pt-6 pb-12 space-y-6">
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Car className="w-7 h-7 text-primary" />
            Rede de Pecas Toyota
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Consulta tecnica Toyota e sincronizacao soberana de medidas entre Rede Pecas e Toyoparts.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <SessionTabButton active={tab === 'consulta'} label="Consulta Toyota" onClick={() => setTab('consulta')} />
          <SessionTabButton active={tab === 'medidas'} label="Conferencia de Medidas" onClick={() => setTab('medidas')} />
        </div>
      </div>

      {tab === 'consulta' ? <ToyotaLookupPanel /> : <MeasuresPanel />}
    </div>
  );
}
