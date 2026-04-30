import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BadgePercent,
  Download,
  FileUp,
  Loader2,
  Percent,
  Play,
  RefreshCw,
  Save,
  Search,
  Terminal,
  Upload,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { Badge, type BadgeColor } from '../../components/base/badge';
import { Button } from '../../components/base/button';
import { Input } from '../../components/base/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs';
import { adminFetch } from '../../lib/admin-auth';
import {
  buildDiscountExportUrl,
  fetchDiscountResults,
  fetchDiscountImportStatus,
  fetchDiscountSnapshot,
  importAdditionalDiscounts,
  publishDiscounts,
  resetMagentoDiscountImport,
  startMagentoDiscountImport,
  stepMagentoDiscountImport,
  upsertAdditionalDiscount,
  type DiscountImportStatus,
  type DiscountResultRow,
  type DiscountSnapshotResponse,
  type DiscountStatus,
} from '../../lib/discounts-admin';

const PAGE_SIZE = 50;
const MAX_IMPORT_LOGS = 80;

type ImportLog = {
  id: number;
  level: 'info' | 'ok' | 'warn' | 'error';
  message: string;
  time: string;
};

function formatBRL(value?: number | null) {
  if (value == null) return '-';
  return Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatPercent(value?: number | null) {
  if (value == null) return '-';
  return `${Number(value).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}%`;
}

function formatDate(value?: string | null) {
  if (!value) return '-';
  try {
    return new Date(value).toLocaleString('pt-BR');
  } catch {
    return value;
  }
}

function timeNow() {
  return new Date().toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function parsePercentInput(value: string) {
  const normalized = String(value || '').trim().replace('%', '').replace(',', '.');
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) return null;
  return parsed;
}

function downloadBlob(filename: string, contents: string, contentType = 'text/csv;charset=utf-8;') {
  const blob = new Blob([contents], { type: contentType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function statusTone(status: DiscountStatus): BadgeColor {
  switch (status) {
    case 'desconto_publicado':
      return 'success';
    case 'pronto_para_publicar':
      return 'warning';
    case 'publicacao_pendente_reversao':
      return 'warning';
    case 'sem_special_price_valido':
      return 'error';
    default:
      return 'gray';
  }
}

function statusLabel(status: DiscountStatus) {
  switch (status) {
    case 'desconto_publicado':
      return 'Publicado';
    case 'pronto_para_publicar':
      return 'Pronto para publicar';
    case 'publicacao_pendente_reversao':
      return 'Reversao pendente';
    case 'sem_special_price_valido':
      return 'Sem special price valido';
    default:
      return 'Sem desconto adicional';
  }
}

function importStatusTone(status?: DiscountImportStatus['status'] | 'paused'): BadgeColor {
  switch (status) {
    case 'completed':
      return 'success';
    case 'error':
      return 'error';
    case 'running':
      return 'warning';
    case 'paused':
      return 'warning';
    default:
      return 'gray';
  }
}

function importStatusLabel(status?: DiscountImportStatus['status'] | 'paused') {
  switch (status) {
    case 'completed':
      return 'Concluido';
    case 'error':
      return 'Erro';
    case 'running':
      return 'Em andamento';
    case 'paused':
      return 'Pausado';
    default:
      return 'Aguardando';
  }
}

function SectionCard({
  title,
  subtitle,
  children,
  aside,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  aside?: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5 sm:p-6 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-base font-bold text-foreground">{title}</h2>
          {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
        </div>
        {aside}
      </div>
      <div className="mt-5 space-y-5">{children}</div>
    </div>
  );
}

function ResultRowCard({ row }: { row: DiscountResultRow }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-bold text-foreground">{row.sku}</p>
            <Badge variant="pill-color" color={statusTone(row.status)} size="sm">
              {statusLabel(row.status)}
            </Badge>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {row.isPublished ? `Publicado em ${formatDate(row.publishedAt)}` : 'Em rascunho'}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-3 xl:grid-cols-6">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Price</p>
            <p className="mt-1 font-semibold text-foreground">{formatBRL(row.price)}</p>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Special</p>
            <p className="mt-1 font-semibold text-foreground">{formatBRL(row.special_price)}</p>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Desc. atual</p>
            <p className="mt-1 font-semibold text-foreground">{formatPercent(row.currentDiscountPercent)}</p>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Desc. adicional</p>
            <p className="mt-1 font-semibold text-foreground">{formatPercent(row.additionalDiscountPercent)}</p>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Preco final</p>
            <p className="mt-1 font-semibold text-foreground">{formatBRL(row.finalPrice)}</p>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Desc. total</p>
            <p className="mt-1 font-semibold text-foreground">{formatPercent(row.totalDiscountPercent)}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export function DiscountsAdminPage() {
  const [snapshot, setSnapshot] = useState<DiscountSnapshotResponse | null>(null);
  const [results, setResults] = useState<Awaited<ReturnType<typeof fetchDiscountResults>> | null>(null);
  const [priceImportStatus, setPriceImportStatus] = useState<DiscountImportStatus | null>(null);
  const [priceImportLogs, setPriceImportLogs] = useState<ImportLog[]>([]);
  const [activeTab, setActiveTab] = useState('prices');

  const [loading, setLoading] = useState(true);
  const [resultsLoading, setResultsLoading] = useState(false);
  const [importingPrices, setImportingPrices] = useState(false);
  const [importingAdditional, setImportingAdditional] = useState(false);
  const [savingManual, setSavingManual] = useState(false);
  const [publishing, setPublishing] = useState(false);

  const [csvText, setCsvText] = useState('');
  const [csvFileName, setCsvFileName] = useState('');
  const [importErrors, setImportErrors] = useState<Array<{ line: number; reason: string; raw: string }>>([]);
  const [manualSku, setManualSku] = useState('');
  const [manualPercent, setManualPercent] = useState('');
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | DiscountStatus>('all');
  const [page, setPage] = useState(0);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const priceImportAbortRef = useRef(false);
  const priceImportLogIdRef = useRef(0);

  const addImportLog = useCallback((level: ImportLog['level'], message: string) => {
    setPriceImportLogs((current) => {
      const next = [
        ...current,
        {
          id: ++priceImportLogIdRef.current,
          level,
          message,
          time: timeNow(),
        },
      ];
      return next.length > MAX_IMPORT_LOGS ? next.slice(-MAX_IMPORT_LOGS) : next;
    });
  }, []);

  const loadSnapshot = useCallback(async () => {
    const data = await fetchDiscountSnapshot();
    setSnapshot(data);
  }, []);

  const loadImportStatus = useCallback(async () => {
    const data = await fetchDiscountImportStatus();
    setPriceImportStatus(data);
    return data;
  }, []);

  const loadResults = useCallback(async (nextPage = page, nextQuery = query, nextStatus = statusFilter) => {
    setResultsLoading(true);
    try {
      const data = await fetchDiscountResults({
        q: nextQuery,
        status: nextStatus,
        limit: PAGE_SIZE,
        offset: nextPage * PAGE_SIZE,
      });
      setResults(data);
    } finally {
      setResultsLoading(false);
    }
  }, [page, query, statusFilter]);

  const refreshAll = useCallback(async (nextPage = page, nextQuery = query, nextStatus = statusFilter) => {
    await Promise.all([
      loadSnapshot(),
      loadImportStatus(),
      loadResults(nextPage, nextQuery, nextStatus),
    ]);
  }, [loadImportStatus, loadResults, loadSnapshot, page, query, statusFilter]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await refreshAll(0, '', 'all');
      } catch (error: any) {
        if (!cancelled) toast.error(error.message || 'Falha ao carregar descontos');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshAll]);

  useEffect(() => {
    if (loading) return;
    loadResults(page, query, statusFilter).catch((error: any) => {
      toast.error(error.message || 'Falha ao carregar resultado');
    });
  }, [loadResults, loading, page, query, statusFilter]);

  useEffect(() => () => {
    priceImportAbortRef.current = true;
  }, []);

  const priceMeta = snapshot?.meta.prices;
  const additionalMeta = snapshot?.meta.additional;
  const publishedMeta = snapshot?.meta.published;

  const resultSummary = useMemo(() => results?.summary || {
    total: 0,
    eligible: 0,
    invalid: 0,
    changed: 0,
    published: 0,
  }, [results]);

  const priceImportProgress = useMemo(() => {
    if (!priceImportStatus) return 0;
    if (priceImportStatus.status === 'completed') return 100;
    if (!priceImportStatus.totalPages) return 0;
    return Math.min(
      99,
      Math.round(((priceImportStatus.processedPages || 0) / Math.max(1, priceImportStatus.totalPages)) * 100),
    );
  }, [priceImportStatus]);

  const priceImportVisualStatus = useMemo<'idle' | 'running' | 'completed' | 'error' | 'paused'>(() => {
    if (importingPrices) return 'running';
    if (priceImportStatus?.status === 'running') return 'paused';
    return (priceImportStatus?.status || 'idle') as 'idle' | 'running' | 'completed' | 'error';
  }, [importingPrices, priceImportStatus]);

  const handleImportPrices = async () => {
    if (importingPrices) {
      priceImportAbortRef.current = true;
      addImportLog('warn', 'Pausa solicitada. O import vai parar ao final da etapa atual.');
      toast.info('Importacao pausada');
      return;
    }

    priceImportAbortRef.current = false;
    setImportingPrices(true);

    try {
      let currentStatus = priceImportStatus;

      if (currentStatus?.status !== 'running') {
        addImportLog('info', 'Iniciando importacao inteligente do Magento...');
        const started = await startMagentoDiscountImport();
        currentStatus = started.status;
        setPriceImportStatus(started.status);

        if (started.message === 'completed' || started.status.status === 'completed') {
          addImportLog(
            started.status.source === 'catalog_cache_fallback' ? 'warn' : 'ok',
            started.status.source === 'catalog_cache_fallback'
              ? 'Magento indisponivel. Snapshot concluido pelo cache canonico do catalogo.'
              : `Importacao concluida com ${started.summary?.total || 0} SKUs.`,
          );
          toast.success(
            started.status.source === 'catalog_cache_fallback'
              ? 'Import concluido via cache do catalogo'
              : 'Importacao concluida',
          );
          await refreshAll(0, query, statusFilter);
          return;
        }

        addImportLog(
          'ok',
          `Execucao iniciada: ${started.status.totalMagentoProducts || 0} produtos Magento em ${started.status.totalPages || 0} paginas.`,
        );
      } else {
        addImportLog(
          'info',
          `Retomando importacao a partir da pagina ${currentStatus.currentPage || currentStatus.resumePage || 1}.`,
        );
      }

      let consecutiveErrors = 0;
      const maxConsecutiveErrors = 4;

      while (!priceImportAbortRef.current) {
        try {
          const stepped = await stepMagentoDiscountImport();
          consecutiveErrors = 0;
          setPriceImportStatus(stepped.status);

          if (stepped.message === 'step_done') {
            addImportLog(
              'info',
              `Paginas ${stepped.step?.pages?.join(', ') || '?'}: ${stepped.step?.matchedRows || 0} SKUs encontrados no site, ${stepped.step?.valid || 0} com special valido, ${stepped.step?.invalid || 0} sem special valido em ${stepped.step?.stepMs || 0}ms.`,
            );
            continue;
          }

          addImportLog(
            'ok',
            `Importacao concluida: ${stepped.summary?.total || stepped.status.matchedRows || 0} SKUs no snapshot.`,
          );
          toast.success('Importacao de precos concluida');
          await refreshAll(0, query, statusFilter);
          return;
        } catch (error: any) {
          consecutiveErrors += 1;
          addImportLog(
            'error',
            `Falha na etapa ${consecutiveErrors}/${maxConsecutiveErrors}: ${error.message || 'erro desconhecido'}`,
          );

          const latestStatus = await loadImportStatus().catch(() => null);
          if (latestStatus?.status === 'error' && (latestStatus.resumePage || latestStatus.currentPage)) {
            addImportLog(
              'warn',
              `Retomando importacao a partir da pagina ${latestStatus.resumePage || latestStatus.currentPage}.`,
            );
            const resumed = await startMagentoDiscountImport().catch(() => null);
            if (resumed?.status) {
              consecutiveErrors = 0;
              setPriceImportStatus(resumed.status);
              continue;
            }
          }

          if (consecutiveErrors >= maxConsecutiveErrors) {
            toast.error('Importacao interrompida por falhas consecutivas');
            break;
          }
          await new Promise((resolve) => setTimeout(resolve, 1000 * consecutiveErrors));
        }
      }

      if (priceImportAbortRef.current) {
        addImportLog('warn', 'Importacao pausada. Clique novamente para continuar.');
      }
    } catch (error: any) {
      addImportLog('error', error.message || 'Falha ao iniciar importacao');
      toast.error(error.message || 'Falha ao importar precos');
    } finally {
      priceImportAbortRef.current = false;
      setImportingPrices(false);
      await loadImportStatus().catch(() => {});
    }
  };

  const handleResetImport = async () => {
    try {
      priceImportAbortRef.current = true;
      const response = await resetMagentoDiscountImport();
      setPriceImportStatus(response.status);
      addImportLog('warn', 'Estado da importacao resetado.');
      toast.success('Estado resetado');
    } catch (error: any) {
      toast.error(error.message || 'Falha ao resetar importacao');
    } finally {
      setImportingPrices(false);
      priceImportAbortRef.current = false;
    }
  };

  const handleUploadFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setCsvFileName(file.name);
    setCsvText(await file.text());
  };

  const handleImportAdditional = async () => {
    setImportingAdditional(true);
    try {
      const response = await importAdditionalDiscounts(csvText);
      setImportErrors(response.invalidRows || []);
      toast.success(`${response.appliedCount} descontos adicionais processados`);
      await refreshAll(page, query, statusFilter);
    } catch (error: any) {
      toast.error(error.message || 'Falha ao importar descontos adicionais');
    } finally {
      setImportingAdditional(false);
    }
  };

  const handleSaveManual = async () => {
    const parsedPercent = parsePercentInput(manualPercent);
    if (!manualSku.trim()) {
      toast.error('Informe um SKU');
      return;
    }
    if (parsedPercent == null) {
      toast.error('Informe um desconto adicional valido');
      return;
    }

    setSavingManual(true);
    try {
      const response = await upsertAdditionalDiscount(manualSku, parsedPercent);
      toast.success(response.removed ? 'Desconto removido' : 'Desconto salvo');
      setManualSku('');
      setManualPercent('');
      await refreshAll(page, query, statusFilter);
    } catch (error: any) {
      toast.error(error.message || 'Falha ao salvar desconto manual');
    } finally {
      setSavingManual(false);
    }
  };

  const handlePublish = async () => {
    setPublishing(true);
    try {
      const response = await publishDiscounts();
      toast.success(`${response.publishedCount} SKUs publicados no site`);
      await refreshAll(page, query, statusFilter);
    } catch (error: any) {
      toast.error(error.message || 'Falha ao publicar descontos');
    } finally {
      setPublishing(false);
    }
  };

  const downloadAdminCsv = async (kind: 'prices' | 'results') => {
    try {
      const response = await adminFetch(buildDiscountExportUrl(kind));
      if (!response.ok) throw new Error('Falha ao exportar CSV');
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = kind === 'prices' ? 'descontos-importar-precos.csv' : 'descontos-resultado.csv';
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (error: any) {
      toast.error(error.message || 'Falha ao exportar CSV');
    }
  };

  const exportImportErrors = () => {
    const lines = [
      'line,reason,raw',
      ...importErrors.map((row) => `${row.line},"${row.reason.replace(/"/g, '""')}","${String(row.raw || '').replace(/"/g, '""')}"`),
    ];
    downloadBlob('descontos-importacao-rejeicoes.csv', lines.join('\n'));
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-[1400px] px-4 pb-12 pt-6 lg:px-6">
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Carregando descontos...
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1400px] px-4 pb-12 pt-6 lg:px-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/15 bg-primary/5 px-3 py-1 text-xs font-semibold text-primary">
            <BadgePercent className="h-3.5 w-3.5" />
            Descontos
          </div>
          <h1 className="mt-3 text-2xl font-bold tracking-tight text-foreground">Desconto adicional por SKU</h1>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            Importe o snapshot de price e special_price do Magento, aplique um percentual adicional sobre o special_price
            e publique o resultado no site so quando estiver pronto.
          </p>
        </div>

        <div className="grid min-w-[260px] grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-2xl border border-border bg-card px-4 py-3 shadow-sm">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Snapshot</p>
            <p className="mt-1 text-2xl font-bold text-foreground">{priceMeta?.total || 0}</p>
          </div>
          <div className="rounded-2xl border border-border bg-card px-4 py-3 shadow-sm">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Elegiveis</p>
            <p className="mt-1 text-2xl font-bold text-foreground">{resultSummary.eligible}</p>
          </div>
          <div className="rounded-2xl border border-border bg-card px-4 py-3 shadow-sm">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Alterados</p>
            <p className="mt-1 text-2xl font-bold text-foreground">{resultSummary.changed}</p>
          </div>
          <div className="rounded-2xl border border-border bg-card px-4 py-3 shadow-sm">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Publicados</p>
            <p className="mt-1 text-2xl font-bold text-foreground">{resultSummary.published}</p>
          </div>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-6 gap-6">
        <TabsList className="w-full justify-start overflow-x-auto sm:w-auto">
          <TabsTrigger value="prices">Importar precos</TabsTrigger>
          <TabsTrigger value="additional">Importar desconto por SKU</TabsTrigger>
          <TabsTrigger value="results">Resultado</TabsTrigger>
        </TabsList>

        <TabsContent value="prices" className="space-y-6">
          <SectionCard
            title="Importar precos do Magento"
            subtitle="Atualiza o snapshot de rascunho com price, special_price e o desconto atual por SKU."
            aside={
              <div className="flex flex-wrap gap-2">
                <Button color="secondary" size="sm" onClick={() => downloadAdminCsv('prices')} iconLeading={<Download className="h-4 w-4" />}>
                  Exportar CSV
                </Button>
                <Button
                  color="secondary"
                  size="sm"
                  onClick={() => loadImportStatus().catch((error: any) => toast.error(error.message || 'Falha ao atualizar status'))}
                  iconLeading={<RefreshCw className="h-4 w-4" />}
                >
                  Atualizar status
                </Button>
                <Button
                  color="primary"
                  size="sm"
                  onClick={handleImportPrices}
                  iconLeading={
                    importingPrices
                      ? undefined
                      : priceImportStatus?.status === 'running'
                        ? <Play className="h-4 w-4" />
                        : <RefreshCw className="h-4 w-4" />
                  }
                  isLoading={importingPrices}
                >
                  {importingPrices
                    ? 'Pausando...'
                    : priceImportStatus?.status === 'running'
                      ? 'Continuar importacao'
                      : 'Importar do Magento'}
                </Button>
                {priceImportStatus?.status !== 'idle' && (
                  <Button color="tertiary" size="sm" onClick={handleResetImport} iconLeading={<XCircle className="h-4 w-4" />}>
                    Resetar
                  </Button>
                )}
              </div>
            }
          >
            <div className="rounded-2xl border border-border bg-muted/20 p-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="pill-color" color={importStatusTone(priceImportVisualStatus)} size="sm">
                      {importStatusLabel(priceImportVisualStatus)}
                    </Badge>
                    {priceImportStatus?.source && (
                      <Badge variant="secondary" size="sm">
                        {priceImportStatus.source === 'magento' ? 'Magento' : 'Cache do catalogo'}
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm font-semibold text-foreground">
                    {priceImportVisualStatus === 'completed'
                      ? `Snapshot pronto com ${priceMeta?.total || priceImportStatus?.matchedRows || 0} SKUs.`
                      : priceImportVisualStatus === 'error'
                        ? 'A ultima execucao terminou com erro.'
                        : importingPrices
                          ? `Executando etapa a partir da pagina ${priceImportStatus?.currentPage || priceImportStatus?.resumePage || 1}.`
                          : priceImportStatus?.status === 'running'
                            ? `Importacao pausada na pagina ${priceImportStatus?.currentPage || priceImportStatus?.resumePage || 1}.`
                            : 'Pronto para iniciar uma importacao gerenciada do Magento.'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {priceImportVisualStatus === 'completed'
                      ? `Concluido em ${formatDate(priceImportStatus?.completedAt)}`
                      : priceImportStatus?.status === 'error'
                        ? (priceImportStatus?.lastError || 'Erro nao informado')
                        : `Ultimo step: ${priceImportStatus?.lastStepMs || 0}ms${priceImportStatus?.elapsedMinutes ? ` · ${priceImportStatus.elapsedMinutes} min decorridos` : ''}`}
                  </p>
                </div>

                <div className="min-w-[220px] space-y-2">
                  <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    <span>Progresso</span>
                    <span>{priceImportProgress}%</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-border/70">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        priceImportVisualStatus === 'completed'
                          ? 'bg-success'
                          : priceImportVisualStatus === 'error'
                            ? 'bg-destructive'
                            : 'bg-primary'
                      }`}
                      style={{ width: `${priceImportProgress}%` }}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {priceImportStatus?.processedPages || 0}/{priceImportStatus?.totalPages || 0} paginas processadas
                  </p>
                </div>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-4">
              <div className="rounded-2xl border border-border bg-muted/30 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Ultimo import</p>
                <p className="mt-2 text-sm font-semibold text-foreground">{formatDate(priceMeta?.importedAt)}</p>
              </div>
              <div className="rounded-2xl border border-border bg-muted/30 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Validos</p>
                <p className="mt-2 text-sm font-semibold text-foreground">{priceMeta?.valid || 0}</p>
              </div>
              <div className="rounded-2xl border border-border bg-muted/30 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Sem special valido</p>
                <p className="mt-2 text-sm font-semibold text-foreground">{priceMeta?.invalid || 0}</p>
              </div>
              <div className="rounded-2xl border border-border bg-muted/30 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Paginas Magento</p>
                <p className="mt-2 text-sm font-semibold text-foreground">
                  {priceImportStatus?.processedPages || 0}/{priceImportStatus?.totalPages || 0}
                </p>
              </div>
            </div>

            <div className="rounded-2xl border border-dashed border-border bg-muted/20 p-4 text-sm text-muted-foreground">
              <p className="font-semibold text-foreground">Fonte atual do snapshot</p>
              <p className="mt-1">
                {priceMeta?.source === 'magento'
                  ? 'Magento ao vivo'
                  : priceMeta?.source === 'catalog_cache_fallback'
                    ? 'Cache canonico do catalogo'
                    : 'Nenhum import executado ainda'}
              </p>
            </div>

            <div className="rounded-2xl border border-border bg-slate-950 overflow-hidden">
              <div className="flex items-center justify-between border-b border-slate-800 bg-slate-900/80 px-4 py-2">
                <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  <Terminal className="h-3.5 w-3.5" />
                  Log do import
                </div>
                <div className="text-[11px] text-slate-500">{priceImportLogs.length} entradas</div>
              </div>
              <div className="max-h-56 overflow-y-auto p-4 font-mono text-[11px] leading-6">
                {priceImportLogs.length === 0 ? (
                  <p className="text-slate-600">Sem logs ainda. Inicie o import para acompanhar as etapas.</p>
                ) : (
                  priceImportLogs.map((entry) => (
                    <div
                      key={entry.id}
                      className={
                        entry.level === 'error'
                          ? 'text-rose-400'
                          : entry.level === 'warn'
                            ? 'text-amber-300'
                            : entry.level === 'ok'
                              ? 'text-emerald-400'
                              : 'text-slate-300'
                      }
                    >
                      <span className="text-slate-600">{entry.time}</span>{' '}
                      <span className="uppercase">{entry.level}</span>{' '}
                      {entry.message}
                    </div>
                  ))
                )}
              </div>
            </div>
          </SectionCard>
        </TabsContent>

        <TabsContent value="additional" className="space-y-6">
          <SectionCard
            title="Importar desconto adicional por SKU"
            subtitle="Cole um CSV com SKU e desconto_adicional. O valor informado e um percentual humano, por exemplo 5 = 5%."
            aside={
              <div className="flex flex-wrap gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.txt"
                  className="hidden"
                  onChange={handleUploadFile}
                />
                <Button color="secondary" size="sm" onClick={() => fileInputRef.current?.click()} iconLeading={<FileUp className="h-4 w-4" />}>
                  Carregar CSV
                </Button>
                <Button color="primary" size="sm" onClick={handleImportAdditional} isLoading={importingAdditional} iconLeading={!importingAdditional ? <Upload className="h-4 w-4" /> : undefined}>
                  Importar CSV
                </Button>
              </div>
            }
          >
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">CSV ou colar texto</p>
              <textarea
                value={csvText}
                onChange={(event) => setCsvText(event.target.value)}
                rows={8}
                placeholder={'sku,desconto_adicional\n041110L243,5\n233900L050,12,5'}
                className="min-h-[180px] w-full rounded-2xl border border-input bg-input-background px-4 py-3 text-sm text-foreground outline-none focus:border-ring focus:ring-4 focus:ring-ring/10"
              />
              <p className="text-xs text-muted-foreground">
                {csvFileName ? `Arquivo carregado: ${csvFileName}` : 'Voce pode carregar um arquivo CSV ou colar as linhas aqui.'}
              </p>
            </div>

            {importErrors.length > 0 && (
              <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold">Linhas rejeitadas: {importErrors.length}</p>
                    <p className="mt-1 text-xs text-amber-800">Os registros invalidos nao foram salvos.</p>
                  </div>
                  <Button color="secondary" size="sm" onClick={exportImportErrors} iconLeading={<Download className="h-4 w-4" />}>
                    Exportar rejeicoes
                  </Button>
                </div>
              </div>
            )}
          </SectionCard>

          <SectionCard
            title="Cadastro manual por SKU"
            subtitle="Use 0 para remover um desconto adicional ja salvo."
            aside={
              <Button color="primary" size="sm" onClick={handleSaveManual} isLoading={savingManual} iconLeading={!savingManual ? <Save className="h-4 w-4" /> : undefined}>
                Salvar SKU
              </Button>
            }
          >
            <div className="grid gap-4 md:grid-cols-[1fr_220px]">
              <label className="space-y-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">SKU</span>
                <Input value={manualSku} onChange={(event) => setManualSku(event.target.value)} placeholder="Ex.: 041110L243" />
              </label>
              <label className="space-y-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Desconto adicional (%)</span>
                <Input value={manualPercent} onChange={(event) => setManualPercent(event.target.value)} placeholder="Ex.: 5" />
              </label>
            </div>

            <div className="rounded-2xl border border-border bg-muted/20 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-foreground">Ultimo import de desconto adicional</p>
                  <p className="mt-1 text-xs text-muted-foreground">{formatDate(additionalMeta?.importedAt)}</p>
                </div>
                <Badge variant="secondary">{additionalMeta?.total || 0} SKUs em rascunho</Badge>
              </div>

              <div className="mt-4 grid gap-2">
                {snapshot?.recentAdditional?.length ? (
                  snapshot.recentAdditional.map((row) => (
                    <div key={row.sku} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-card px-3 py-2 text-sm">
                      <div>
                        <p className="font-semibold text-foreground">{row.sku}</p>
                        <p className="text-xs text-muted-foreground">{formatDate(row.updatedAt)}</p>
                      </div>
                      <Badge variant="pill-color" color="primary" size="sm">
                        {formatPercent(row.additionalDiscountPercent)}
                      </Badge>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">Nenhum desconto adicional cadastrado ainda.</p>
                )}
              </div>
            </div>
          </SectionCard>
        </TabsContent>

        <TabsContent value="results" className="space-y-6">
          <SectionCard
            title="Resultado consolidado"
            subtitle="Preview final do que vai valer no site. O desconto adicional sempre incide sobre o special_price importado."
            aside={
              <div className="flex flex-wrap gap-2">
                <Button color="secondary" size="sm" onClick={() => downloadAdminCsv('results')} iconLeading={<Download className="h-4 w-4" />}>
                  Exportar CSV
                </Button>
                <Button color="primary" size="sm" onClick={handlePublish} isLoading={publishing} iconLeading={!publishing ? <Percent className="h-4 w-4" /> : undefined}>
                  Publicar descontos no site
                </Button>
              </div>
            }
          >
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              <div className="rounded-2xl border border-border bg-muted/20 px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Total</p>
                <p className="mt-1 text-2xl font-bold text-foreground">{resultSummary.total}</p>
              </div>
              <div className="rounded-2xl border border-border bg-muted/20 px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Elegiveis</p>
                <p className="mt-1 text-2xl font-bold text-foreground">{resultSummary.eligible}</p>
              </div>
              <div className="rounded-2xl border border-border bg-muted/20 px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Invalidos</p>
                <p className="mt-1 text-2xl font-bold text-foreground">{resultSummary.invalid}</p>
              </div>
              <div className="rounded-2xl border border-border bg-muted/20 px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Alterados</p>
                <p className="mt-1 text-2xl font-bold text-foreground">{resultSummary.changed}</p>
              </div>
              <div className="rounded-2xl border border-border bg-muted/20 px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Ultima publicacao</p>
                <p className="mt-1 text-sm font-semibold text-foreground">{formatDate(publishedMeta?.publishedAt)}</p>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-[1fr_240px]">
              <label className="space-y-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Buscar SKU</span>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={query}
                    onChange={(event) => {
                      setPage(0);
                      setQuery(event.target.value);
                    }}
                    className="pl-9"
                    placeholder="Filtrar por SKU"
                  />
                </div>
              </label>
              <label className="space-y-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Status</span>
                <select
                  value={statusFilter}
                  onChange={(event) => {
                    setPage(0);
                    setStatusFilter(event.target.value as 'all' | DiscountStatus);
                  }}
                  className="h-10 w-full rounded-lg border border-input bg-input-background px-3 text-sm text-foreground outline-none focus:border-ring focus:ring-4 focus:ring-ring/10"
                >
                  <option value="all">Todos</option>
                  <option value="pronto_para_publicar">Pronto para publicar</option>
                  <option value="publicacao_pendente_reversao">Reversao pendente</option>
                  <option value="desconto_publicado">Publicado</option>
                  <option value="sem_desconto_adicional">Sem desconto adicional</option>
                  <option value="sem_special_price_valido">Sem special price valido</option>
                </select>
              </label>
            </div>

            <div className="space-y-3">
              {resultsLoading ? (
                <div className="flex items-center gap-3 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Carregando resultado...
                </div>
              ) : results?.rows?.length ? (
                results.rows.map((row) => <ResultRowCard key={row.sku} row={row} />)
              ) : (
                <div className="rounded-2xl border border-border bg-muted/20 p-6 text-sm text-muted-foreground">
                  Nenhum SKU encontrado para os filtros atuais.
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
              <p className="text-xs text-muted-foreground">
                Mostrando {results?.rows?.length || 0} de {results?.total || 0} registros
              </p>
              <div className="flex gap-2">
                <Button
                  color="secondary"
                  size="sm"
                  disabled={page === 0 || resultsLoading}
                  onClick={() => setPage((current) => Math.max(0, current - 1))}
                >
                  Anterior
                </Button>
                <Button
                  color="secondary"
                  size="sm"
                  disabled={!results?.hasMore || resultsLoading}
                  onClick={() => setPage((current) => current + 1)}
                >
                  Proxima
                </Button>
              </div>
            </div>
          </SectionCard>
        </TabsContent>
      </Tabs>
    </div>
  );
}
