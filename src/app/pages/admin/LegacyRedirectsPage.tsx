import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  Download,
  ExternalLink,
  FileCode2,
  Loader2,
  RefreshCw,
  Route,
} from 'lucide-react';
import { toast } from 'sonner';
import { projectId } from '../../../../utils/supabase/info';
import { adminFetch } from '../../lib/admin-auth';
import {
  buildPendingRedirect,
  buildResolvedRedirect,
  formatPendingRedirectsCsv,
  formatVercelRedirectsSection,
  loadLegacyRedirectSeeds,
  type LegacyProductLookup,
  type LegacyRedirectPending,
  type LegacyRedirectResolved,
} from '../../lib/legacy-redirects';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Card } from '../../components/ui/card';

const API = `https://${projectId}.supabase.co/functions/v1/make-server-1d6e33e0`;
const CONCURRENCY = 8;

async function copyText(value: string, label: string) {
  await navigator.clipboard.writeText(value);
  toast.success(`${label} copiado`);
}

function downloadFile(filename: string, contents: string, type: string) {
  const blob = new Blob([contents], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

async function fetchProductBySku(sku: string): Promise<LegacyProductLookup | null> {
  const res = await adminFetch(`${API}/seo/product/${encodeURIComponent(sku)}`);
  if (!res.ok) return null;

  const data = await res.json().catch(() => null);
  if (!data || data.error || !data.sku || !data.name) return null;

  return {
    sku: String(data.sku).toUpperCase(),
    name: data.name,
    url_key: data.url_key,
  };
}

async function runWithConcurrency<T, R>(
  items: T[],
  worker: (item: T) => Promise<R>,
  concurrency: number
) {
  const results: R[] = new Array(items.length);
  let cursor = 0;

  async function consume() {
    while (cursor < items.length) {
      const current = cursor++;
      results[current] = await worker(items[current]);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => consume()));
  return results;
}

export function LegacyRedirectsPage() {
  const seeds = useMemo(() => loadLegacyRedirectSeeds(), []);
  const [loading, setLoading] = useState(false);
  const [resolved, setResolved] = useState<LegacyRedirectResolved[]>([]);
  const [pending, setPending] = useState<LegacyRedirectPending[]>([]);
  const [lastRunAt, setLastRunAt] = useState<string | null>(null);

  const automaticCandidates = useMemo(() => seeds.filter((seed) => seed.sku), [seeds]);
  const manualSeeds = useMemo(
    () => seeds.filter((seed) => !seed.sku).map((seed) => buildPendingRedirect(seed)),
    [seeds]
  );

  const redirectSnippet = useMemo(() => formatVercelRedirectsSection(resolved), [resolved]);

  useEffect(() => {
    void handleGenerate();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleGenerate = async () => {
    setLoading(true);
    try {
      const uniqueSkus = Array.from(
        new Set(
          automaticCandidates
            .map((seed) => seed.sku)
            .filter((sku): sku is string => Boolean(sku))
        )
      );

      const lookupRows = await runWithConcurrency(
        uniqueSkus,
        async (sku) => ({
          sku,
          product: await fetchProductBySku(sku),
        }),
        CONCURRENCY
      );

      const productMap = new Map<string, LegacyProductLookup>();
      lookupRows.forEach((row) => {
        if (row.product) productMap.set(row.sku, row.product);
      });

      const nextResolved: LegacyRedirectResolved[] = [];
      const nextPending: LegacyRedirectPending[] = [...manualSeeds];

      automaticCandidates.forEach((seed) => {
        const product = seed.sku ? productMap.get(seed.sku) : null;
        if (!seed.sku || !product) {
          nextPending.push(buildPendingRedirect(seed, seed.sku ? 'produto nao encontrado para o SKU' : undefined));
          return;
        }
        nextResolved.push(buildResolvedRedirect(seed, product));
      });

      setResolved(nextResolved.sort((a, b) => a.pathname.localeCompare(b.pathname)));
      setPending(nextPending.sort((a, b) => a.pathname.localeCompare(b.pathname)));
      setLastRunAt(new Date().toISOString());
      toast.success(`Redirects gerados: ${nextResolved.length} prontos, ${nextPending.length} pendentes`);
    } catch (error: any) {
      toast.error(`Erro ao gerar redirects: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-[1400px] mx-auto px-4 lg:px-6 pt-6 pb-12 space-y-6">
      <div className="flex flex-col xl:flex-row xl:items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-foreground flex items-center gap-2">
            <Route className="w-5 h-5 text-primary" />
            Redirects 301 Legados
          </h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-3xl">
            Esta tela usa a lista fixa de URLs antigas indexadas pelo Google, tenta resolver cada uma por SKU e gera um bloco de redirects 301 pronto para colar no Vercel.
          </p>
          {lastRunAt && (
            <p className="text-xs text-muted-foreground mt-2">
              Ultima geracao: {new Date(lastRunAt).toLocaleString('pt-BR')}
            </p>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={handleGenerate} disabled={loading} className="gap-1.5">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Gerar redirects
          </Button>
          <Button onClick={() => copyText(redirectSnippet, 'Bloco Vercel')} disabled={!resolved.length} className="gap-1.5">
            <Copy className="w-4 h-4" />
            Copiar bloco Vercel
          </Button>
          <Button
            variant="outline"
            onClick={() => downloadFile('redirects-pendentes.csv', formatPendingRedirectsCsv(pending), 'text/csv;charset=utf-8')}
            disabled={!pending.length}
            className="gap-1.5"
          >
            <Download className="w-4 h-4" />
            Exportar pendencias
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <SummaryCard label="URLs mapeadas" value={seeds.length} icon={Route} />
        <SummaryCard label="Com SKU extraido" value={automaticCandidates.length} icon={FileCode2} />
        <SummaryCard label="Redirects prontos" value={resolved.length} icon={CheckCircle2} tone="success" />
        <SummaryCard label="Pendentes manuais" value={pending.length} icon={AlertTriangle} tone="warning" />
      </div>

      <Card className="p-5 space-y-3">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Bloco gerado para o Vercel</h2>
            <p className="text-xs text-muted-foreground mt-1">
              Saida em formato `redirects`, pronta para responder 301 no deploy. Revise e cole no `vercel.json`.
            </p>
          </div>
          <Badge variant="outline" className="text-[10px]">{resolved.length} redirect(s)</Badge>
        </div>
        <pre className="rounded-xl border border-border bg-secondary/30 p-4 text-xs overflow-x-auto whitespace-pre-wrap break-all">
{redirectSnippet}
        </pre>
      </Card>

      <div className="grid grid-cols-1 2xl:grid-cols-[1.2fr_0.8fr] gap-6">
        <Card className="p-5">
          <div className="flex items-center justify-between gap-4 mb-4">
            <div>
              <h2 className="text-sm font-semibold text-foreground">Redirects prontos</h2>
              <p className="text-xs text-muted-foreground mt-1">Itens que bateram no catalogo atual por SKU.</p>
            </div>
            <Badge className="bg-green-600 hover:bg-green-600">{resolved.length}</Badge>
          </div>

          <div className="space-y-3 max-h-[900px] overflow-y-auto pr-1">
            {resolved.map((item) => (
              <div key={`${item.pathname}-${item.destination}`} className="rounded-xl border border-border p-4 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className="font-mono text-[10px]">{item.sku}</Badge>
                  <span className="text-sm font-medium text-foreground">{item.productName}</span>
                </div>
                <p className="text-xs text-muted-foreground break-all">{item.url}</p>
                <div className="text-xs">
                  <span className="text-muted-foreground">Destino:</span>{' '}
                  <span className="font-mono text-foreground break-all">{item.destination}</span>
                </div>
              </div>
            ))}

            {!resolved.length && (
              <EmptyState
                icon={CheckCircle2}
                title="Nenhum redirect pronto ainda"
                description="Rode a geracao para consultar o catalogo e montar os destinos canonicos."
              />
            )}
          </div>
        </Card>

        <Card className="p-5">
          <div className="flex items-center justify-between gap-4 mb-4">
            <div>
              <h2 className="text-sm font-semibold text-foreground">Pendencias manuais</h2>
              <p className="text-xs text-muted-foreground mt-1">URLs sem SKU confiavel ou sem produto encontrado.</p>
            </div>
            <Badge variant="outline" className="text-amber-700 border-amber-200 bg-amber-50">{pending.length}</Badge>
          </div>

          <div className="space-y-3 max-h-[900px] overflow-y-auto pr-1">
            {pending.map((item) => (
              <div key={`${item.pathname}-${item.url}`} className="rounded-xl border border-border p-4 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className="text-[10px] border-amber-200 text-amber-700 bg-amber-50">
                    {item.reason}
                  </Badge>
                  {item.sku && <Badge variant="outline" className="font-mono text-[10px]">{item.sku}</Badge>}
                </div>
                <p className="text-xs text-muted-foreground break-all">{item.url}</p>
                <a
                  href={item.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                >
                  Abrir URL antiga <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            ))}

            {!pending.length && (
              <EmptyState
                icon={AlertTriangle}
                title="Sem pendencias"
                description="Todos os itens desta lista foram resolvidos automaticamente."
              />
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  icon: Icon,
  tone = 'default',
}: {
  label: string;
  value: number;
  icon: React.ElementType;
  tone?: 'default' | 'success' | 'warning';
}) {
  const toneClass =
    tone === 'success'
      ? 'text-green-600'
      : tone === 'warning'
        ? 'text-amber-600'
        : 'text-primary';

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">{label}</p>
          <p className="text-3xl font-bold text-foreground mt-2">{value}</p>
        </div>
        <div className={`rounded-xl bg-secondary/60 p-2.5 ${toneClass}`}>
          <Icon className="w-5 h-5" />
        </div>
      </div>
    </Card>
  );
}

function EmptyState({
  icon: Icon,
  title,
  description,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-xl border border-dashed border-border p-8 text-center">
      <Icon className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="text-xs text-muted-foreground mt-1">{description}</p>
    </div>
  );
}
