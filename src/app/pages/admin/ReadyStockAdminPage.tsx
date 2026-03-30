import React, { useEffect, useMemo, useState } from 'react';
import {
  Building2,
  CheckCircle2,
  ClipboardPaste,
  Loader2,
  Package,
  Plus,
  Save,
  Trash2,
  Upload,
  Warehouse,
} from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '../../components/base/badge';
import { Button } from '../../components/base/button';
import { Input } from '../../components/base/input';
import {
  applyReadyStockImport,
  fetchReadyStockSnapshot,
  previewReadyStockImport,
  saveReadyStockBranches,
  saveReadyStockConfig,
  type ReadyStockBranch,
  type ReadyStockConfig,
  type ReadyStockItem,
  type ReadyStockPreviewResponse,
  type ReadyStockSummary,
} from '../../lib/shipping/ready-stock-admin';

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

function createBranch(): ReadyStockBranch {
  return {
    id: crypto.randomUUID().slice(0, 8),
    name: 'Nova filial',
    active: true,
    additionalDays: 0,
  };
}

function formatDate(value?: string) {
  if (!value) return '-';
  try {
    return new Date(value).toLocaleString('pt-BR');
  } catch {
    return value;
  }
}

export function ReadyStockAdminPage() {
  const [loading, setLoading] = useState(true);
  const [savingConfig, setSavingConfig] = useState(false);
  const [savingBranches, setSavingBranches] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [applying, setApplying] = useState(false);

  const [config, setConfig] = useState<ReadyStockConfig>({
    enabled: true,
    crossdockAdditionalDays: 5,
    reservationTtlMinutes: 30,
  });
  const [branches, setBranches] = useState<ReadyStockBranch[]>([]);
  const [items, setItems] = useState<ReadyStockItem[]>([]);
  const [summary, setSummary] = useState<ReadyStockSummary | null>(null);

  const [importText, setImportText] = useState('');
  const [importMode, setImportMode] = useState<'replace' | 'merge'>('merge');
  const [defaultBranchId, setDefaultBranchId] = useState('');
  const [defaultQty, setDefaultQty] = useState(1);
  const [preview, setPreview] = useState<ReadyStockPreviewResponse['preview'] | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const payload = await fetchReadyStockSnapshot();
        if (cancelled) return;
        setConfig(payload.config);
        setBranches(payload.branches);
        setItems(payload.items);
        setSummary(payload.summary);
        setDefaultBranchId(payload.branches[0]?.id || '');
      } catch (error: any) {
        toast.error(error.message || 'Falha ao carregar pronta entrega');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const branchMap = useMemo(
    () => new Map(branches.map((branch) => [branch.id, branch])),
    [branches]
  );

  const handleSaveConfig = async () => {
    setSavingConfig(true);
    try {
      const saved = await saveReadyStockConfig(config);
      setConfig(saved);
      toast.success('Configuracao de pronta entrega salva');
    } catch (error: any) {
      toast.error(error.message || 'Falha ao salvar configuracao');
    } finally {
      setSavingConfig(false);
    }
  };

  const handleSaveBranches = async () => {
    setSavingBranches(true);
    try {
      const saved = await saveReadyStockBranches(branches);
      setBranches(saved);
      if (!saved.some((branch) => branch.id === defaultBranchId)) {
        setDefaultBranchId(saved[0]?.id || '');
      }
      toast.success('Filiais salvas');
    } catch (error: any) {
      toast.error(error.message || 'Falha ao salvar filiais');
    } finally {
      setSavingBranches(false);
    }
  };

  const handlePreview = async () => {
    setPreviewing(true);
    try {
      const data = await previewReadyStockImport({
        text: importText,
        defaultBranchId,
        defaultQty,
      });
      setPreview(data.preview);
      toast.success('Preview gerado');
    } catch (error: any) {
      toast.error(error.message || 'Falha ao gerar preview');
    } finally {
      setPreviewing(false);
    }
  };

  const handleApply = async () => {
    setApplying(true);
    try {
      const data = await applyReadyStockImport({
        text: importText,
        defaultBranchId,
        defaultQty,
        mode: importMode,
      });
      setItems(data.items || []);
      setSummary(data.summary || null);
      setPreview(null);
      toast.success(importMode === 'replace' ? 'Base substituida' : 'Importacao aplicada');
    } catch (error: any) {
      toast.error(error.message || 'Falha ao aplicar importacao');
    } finally {
      setApplying(false);
    }
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-[1400px] px-4 pb-12 pt-6 lg:px-6">
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Carregando pronta entrega...
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1400px] px-4 pb-12 pt-6 lg:px-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
            <Warehouse className="h-3.5 w-3.5" />
            Pronta Entrega
          </div>
          <h1 className="mt-3 text-2xl font-bold tracking-tight text-foreground">Estoque fisico e prazo rapido</h1>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            Cadastre os SKUs disponiveis na loja fisica por filial. O objetivo deste painel e separar o que pode
            sair com prazo real da transportadora do restante do catalogo em crossdocking.
          </p>
        </div>

        <div className="grid min-w-[260px] grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-2xl border border-border bg-card px-4 py-3 shadow-sm">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">SKUs</p>
            <p className="mt-1 text-2xl font-bold text-foreground">{summary?.skuCount ?? 0}</p>
          </div>
          <div className="rounded-2xl border border-border bg-card px-4 py-3 shadow-sm">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Saldo total</p>
            <p className="mt-1 text-2xl font-bold text-foreground">{summary?.totalQty ?? 0}</p>
          </div>
          <div className="rounded-2xl border border-border bg-card px-4 py-3 shadow-sm">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Filiais</p>
            <p className="mt-1 text-2xl font-bold text-foreground">{summary?.branchCount ?? branches.length}</p>
          </div>
          <div className="rounded-2xl border border-border bg-card px-4 py-3 shadow-sm">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Modo</p>
            <p className="mt-1 text-sm font-bold text-foreground">{config.enabled ? 'Ativo' : 'Desligado'}</p>
          </div>
        </div>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <SectionCard
          title="Configuracao operacional"
          subtitle="Defina o comportamento base do modulo de pronta entrega."
          aside={
            <Button color="primary" size="sm" onClick={handleSaveConfig} isLoading={savingConfig}>
              <Save className="h-4 w-4" />
              Salvar configuracao
            </Button>
          }
        >
          <div className="grid gap-4 md:grid-cols-3">
            <label className="space-y-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Modulo ativo</span>
              <select
                value={config.enabled ? 'on' : 'off'}
                onChange={(event) => setConfig((current) => ({ ...current, enabled: event.target.value === 'on' }))}
                className="h-10 w-full rounded-lg border border-input bg-input-background px-3 text-sm text-foreground outline-none focus:border-ring focus:ring-4 focus:ring-ring/10"
              >
                <option value="on">Ativo</option>
                <option value="off">Desligado</option>
              </select>
            </label>

            <label className="space-y-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Dias extras crossdock</span>
              <Input
                type="number"
                min={0}
                value={config.crossdockAdditionalDays}
                onChange={(event) =>
                  setConfig((current) => ({ ...current, crossdockAdditionalDays: Number(event.target.value || 0) }))
                }
              />
            </label>

            <label className="space-y-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Reserva temporaria (min)</span>
              <Input
                type="number"
                min={5}
                value={config.reservationTtlMinutes}
                onChange={(event) =>
                  setConfig((current) => ({ ...current, reservationTtlMinutes: Number(event.target.value || 30) }))
                }
              />
            </label>
          </div>
        </SectionCard>

        <SectionCard title="Resumo por filial" subtitle="Visao rapida do saldo atual por unidade fisica.">
          <div className="space-y-3">
            {summary?.byBranch?.length ? (
              summary.byBranch.map((branch) => (
                <div key={branch.branchId} className="rounded-2xl border border-border bg-muted/20 px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-foreground">{branch.name}</p>
                      <p className="text-xs text-muted-foreground">{branch.branchId}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-bold text-foreground">{branch.totalQty}</p>
                      <p className="text-xs text-muted-foreground">{branch.skuCount} SKUs</p>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-2xl border border-dashed border-border bg-muted/10 px-4 py-6 text-sm text-muted-foreground">
                Nenhuma filial cadastrada ainda.
              </div>
            )}
          </div>
        </SectionCard>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <SectionCard
          title="Filiais"
          subtitle="Cada filial pode ter um prazo operacional adicional diferente."
          aside={
            <div className="flex gap-2">
              <Button color="secondary" size="sm" onClick={() => setBranches((current) => [...current, createBranch()])}>
                <Plus className="h-4 w-4" />
                Nova filial
              </Button>
              <Button color="primary" size="sm" onClick={handleSaveBranches} isLoading={savingBranches}>
                <Save className="h-4 w-4" />
                Salvar filiais
              </Button>
            </div>
          }
        >
          <div className="space-y-4">
            {branches.length ? (
              branches.map((branch) => (
                <div key={branch.id} className="rounded-2xl border border-border bg-white p-4">
                  <div className="grid gap-3 md:grid-cols-[1fr_1fr_160px_120px_auto] md:items-end">
                    <label className="space-y-2">
                      <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Nome</span>
                      <Input
                        value={branch.name}
                        onChange={(event) =>
                          setBranches((current) =>
                            current.map((item) => (item.id === branch.id ? { ...item, name: event.target.value } : item))
                          )
                        }
                      />
                    </label>

                    <label className="space-y-2">
                      <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">ID da filial</span>
                      <Input
                        value={branch.id}
                        onChange={(event) =>
                          setBranches((current) =>
                            current.map((item) => (item.id === branch.id ? { ...item, id: event.target.value } : item))
                          )
                        }
                      />
                    </label>

                    <label className="space-y-2">
                      <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Dias extras</span>
                      <Input
                        type="number"
                        min={0}
                        value={branch.additionalDays}
                        onChange={(event) =>
                          setBranches((current) =>
                            current.map((item) =>
                              item.id === branch.id ? { ...item, additionalDays: Number(event.target.value || 0) } : item
                            )
                          )
                        }
                      />
                    </label>

                    <label className="space-y-2">
                      <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Status</span>
                      <select
                        value={branch.active ? 'on' : 'off'}
                        onChange={(event) =>
                          setBranches((current) =>
                            current.map((item) => (item.id === branch.id ? { ...item, active: event.target.value === 'on' } : item))
                          )
                        }
                        className="h-10 w-full rounded-lg border border-input bg-input-background px-3 text-sm text-foreground outline-none focus:border-ring focus:ring-4 focus:ring-ring/10"
                      >
                        <option value="on">Ativa</option>
                        <option value="off">Inativa</option>
                      </select>
                    </label>

                    <Button
                      color="tertiary"
                      size="sm"
                      onClick={() => setBranches((current) => current.filter((item) => item.id !== branch.id))}
                    >
                      <Trash2 className="h-4 w-4" />
                      Remover
                    </Button>
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-2xl border border-dashed border-border bg-muted/10 px-4 py-8 text-sm text-muted-foreground">
                Comece criando pelo menos uma filial para importar os SKUs de pronta entrega.
              </div>
            )}
          </div>
        </SectionCard>

        <SectionCard
          title="Importacao de SKUs"
          subtitle="Cole linhas do Excel ou envie um CSV no formato SKU, filial, quantidade."
          aside={
            <div className="flex gap-2">
              <Button color="secondary" size="sm" onClick={handlePreview} isLoading={previewing}>
                <ClipboardPaste className="h-4 w-4" />
                Gerar preview
              </Button>
              <Button color="primary" size="sm" onClick={handleApply} isLoading={applying}>
                <Upload className="h-4 w-4" />
                Aplicar importacao
              </Button>
            </div>
          }
        >
          <div className="grid gap-4 md:grid-cols-3">
            <label className="space-y-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Modo</span>
              <select
                value={importMode}
                onChange={(event) => setImportMode(event.target.value === 'replace' ? 'replace' : 'merge')}
                className="h-10 w-full rounded-lg border border-input bg-input-background px-3 text-sm text-foreground outline-none focus:border-ring focus:ring-4 focus:ring-ring/10"
              >
                <option value="merge">Mesclar / atualizar</option>
                <option value="replace">Substituir base</option>
              </select>
            </label>

            <label className="space-y-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Filial padrao</span>
              <select
                value={defaultBranchId}
                onChange={(event) => setDefaultBranchId(event.target.value)}
                className="h-10 w-full rounded-lg border border-input bg-input-background px-3 text-sm text-foreground outline-none focus:border-ring focus:ring-4 focus:ring-ring/10"
              >
                <option value="">Selecione</option>
                {branches.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Quantidade padrao</span>
              <Input
                type="number"
                min={1}
                value={defaultQty}
                onChange={(event) => setDefaultQty(Number(event.target.value || 1))}
              />
            </label>
          </div>

          <div className="space-y-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Colar dados</span>
            <textarea
              value={importText}
              onChange={(event) => setImportText(event.target.value)}
              placeholder={'sku,filial,quantidade\n233900L050,londrina,3\n7689102070,loja-centro,1'}
              className="min-h-[200px] w-full rounded-2xl border border-input bg-input-background px-4 py-3 text-sm text-foreground outline-none focus:border-ring focus:ring-4 focus:ring-ring/10"
            />
            <p className="text-xs text-muted-foreground">
              Aceita colar do Excel com tab, CSV com virgula ou ponto e virgula.
            </p>
          </div>

          {preview && (
            <div className="rounded-2xl border border-border bg-muted/20 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge color="brand" variant="pill-color">{preview.summary.skuCount} SKUs validos</Badge>
                <Badge color="success" variant="pill-color">{preview.summary.totalQty} unidades</Badge>
                <Badge color={preview.invalidRows.length ? 'warning' : 'gray'} variant="pill-outline">
                  {preview.invalidRows.length} pendencias
                </Badge>
              </div>

              {preview.invalidRows.length > 0 && (
                <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
                  <p className="text-sm font-semibold text-amber-800">Pendencias da importacao</p>
                  <div className="mt-2 max-h-48 space-y-2 overflow-y-auto text-xs text-amber-700">
                    {preview.invalidRows.map((row, index) => (
                      <div key={`${row.line}-${index}`} className="rounded-lg bg-white/70 px-3 py-2">
                        Linha {row.line || '-'}: {row.reason}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </SectionCard>
      </div>

      <div className="mt-6">
        <SectionCard
          title="Estoque atual"
          subtitle="Todos os produtos marcados como pronta entrega no estoque fisico."
          aside={
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              Ultima leitura em tempo real do modulo
            </div>
          }
        >
          {items.length ? (
            <div className="overflow-x-auto rounded-2xl border border-border">
              <table className="min-w-full divide-y divide-border text-sm">
                <thead className="bg-muted/30">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold text-foreground">SKU</th>
                    <th className="px-4 py-3 text-left font-semibold text-foreground">Saldo total</th>
                    <th className="px-4 py-3 text-left font-semibold text-foreground">Alocacoes</th>
                    <th className="px-4 py-3 text-left font-semibold text-foreground">Atualizado em</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border bg-white">
                  {items.map((item) => (
                    <tr key={item.sku}>
                      <td className="px-4 py-3 font-mono text-xs text-foreground">{item.sku}</td>
                      <td className="px-4 py-3">
                        <Badge color="brand" variant="pill-color">{item.totalQty} un.</Badge>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-2">
                          {item.allocations.map((allocation) => (
                            <Badge key={`${item.sku}-${allocation.branchId}`} color="gray" variant="pill-outline">
                              {(branchMap.get(allocation.branchId)?.name || allocation.branchId)}: {allocation.qty}
                            </Badge>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{formatDate(item.updatedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-border bg-muted/10 px-4 py-10 text-center">
              <Package className="mx-auto h-10 w-10 text-muted-foreground/60" />
              <p className="mt-3 text-sm font-semibold text-foreground">Nenhum SKU em pronta entrega ainda</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Cadastre as filiais e importe a primeira planilha para listar o estoque fisico da loja.
              </p>
            </div>
          )}
        </SectionCard>
      </div>
    </div>
  );
}
