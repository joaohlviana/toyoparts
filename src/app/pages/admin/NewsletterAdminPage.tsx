import React, { useEffect, useMemo, useState } from 'react';
import {
  Calendar,
  Download,
  FileJson,
  Filter,
  Globe,
  Loader2,
  Mail,
  RefreshCw,
  Search,
  Smartphone,
  TrendingUp,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { projectId, publicAnonKey } from '../../../../utils/supabase/info';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Badge } from '../../components/ui/badge';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '../../components/ui/sheet';

const API = `https://${projectId}.supabase.co/functions/v1/make-server-1d6e33e0/newsletter`;
const HEADERS: HeadersInit = {
  Authorization: `Bearer ${publicAnonKey}`,
  apikey: publicAnonKey,
  'Content-Type': 'application/json',
};

interface IntegrationStatus {
  status: 'success' | 'error' | 'pending_config' | 'skipped';
  lastAttemptAt?: string;
  lastSuccessAt?: string | null;
  error?: string | null;
  leadId?: string | null;
  contactId?: string | null;
}

interface Subscriber {
  email: string;
  name: string;
  whatsapp: string;
  source: string;
  subscribedAt: string;
  updatedAt?: string;
  unsubscribedAt?: string;
  active: boolean;
  integrations?: {
    syonet?: IntegrationStatus;
    hubspot?: IntegrationStatus;
  };
}

interface Stats {
  total: number;
  active: number;
  recent_7d: number;
  by_source: Record<string, number>;
  integrations?: {
    syonet?: {
      success: number;
      error: number;
      pending: number;
    };
    hubspot?: {
      success: number;
      error: number;
      pending: number;
    };
  };
}

const SOURCE_LABELS: Record<string, { label: string; color: string }> = {
  homepage: { label: 'Home', color: 'bg-blue-100 text-blue-700 border-blue-200' },
  pdp: { label: 'Produto', color: 'bg-purple-100 text-purple-700 border-purple-200' },
  magento: { label: 'Magento', color: 'bg-orange-100 text-orange-700 border-orange-200' },
  footer: { label: 'Footer', color: 'bg-gray-100 text-gray-700 border-gray-200' },
  site: { label: 'Site', color: 'bg-slate-100 text-slate-700 border-slate-200' },
  unknown: { label: 'Outro', color: 'bg-amber-100 text-amber-700 border-amber-200' },
};

function SourceBadge({ source }: { source: string }) {
  const config = SOURCE_LABELS[source] || SOURCE_LABELS.unknown;
  return (
    <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${config.color}`}>
      {config.label}
    </span>
  );
}

export function NewsletterAdminPage() {
  const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(false);
  const [statsLoading, setStatsLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [filterSource, setFilterSource] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'inactive'>('all');
  const [selectedSub, setSelectedSub] = useState<Subscriber | null>(null);

  const loadSubscribers = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API}/subscribers`, { headers: HEADERS });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      setSubscribers(data.subscribers || []);
    } catch (error: any) {
      console.error('[newsletter-admin] load error:', error);
      toast.error(`Erro ao carregar inscritos: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const loadStats = async () => {
    setStatsLoading(true);
    try {
      const response = await fetch(`${API}/stats`, { headers: HEADERS });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      setStats(data);
    } catch (error: any) {
      console.error('[newsletter-admin] stats error:', error);
    } finally {
      setStatsLoading(false);
    }
  };

  useEffect(() => {
    loadSubscribers();
    loadStats();
  }, []);

  const filtered = useMemo(() => {
    let list = [...subscribers];

    if (filterStatus === 'active') list = list.filter((subscriber) => subscriber.active !== false);
    if (filterStatus === 'inactive') list = list.filter((subscriber) => subscriber.active === false);
    if (filterSource !== 'all') list = list.filter((subscriber) => subscriber.source === filterSource);

    if (search.trim()) {
      const query = search.toLowerCase();
      list = list.filter((subscriber) =>
        subscriber.email.toLowerCase().includes(query) ||
        String(subscriber.name || '').toLowerCase().includes(query) ||
        String(subscriber.whatsapp || '').includes(query)
      );
    }

    return list;
  }, [subscribers, search, filterSource, filterStatus]);

  const sources = useMemo(() => {
    const set = new Set(subscribers.map((subscriber) => subscriber.source || 'unknown'));
    return ['all', ...Array.from(set)];
  }, [subscribers]);

  const activeFilters = (filterSource !== 'all' ? 1 : 0) + (filterStatus !== 'all' ? 1 : 0);

  const exportCSV = () => {
    if (filtered.length === 0) {
      toast.error('Nenhum inscrito para exportar');
      return;
    }

    const headers = [
      'Email',
      'Nome',
      'WhatsApp',
      'Origem',
      'Data Inscricao',
      'Status',
      'Syonet',
      'HubSpot',
    ];

    const rows = filtered.map((subscriber) => [
      subscriber.email,
      subscriber.name || '',
      subscriber.whatsapp || '',
      subscriber.source || '',
      subscriber.subscribedAt ? new Date(subscriber.subscribedAt).toLocaleDateString('pt-BR') : '',
      subscriber.active !== false ? 'Ativo' : 'Inativo',
      subscriber.integrations?.syonet?.status || 'pendente',
      subscriber.integrations?.hubspot?.status || 'pendente',
    ]);

    const csv = [headers, ...rows].map((row) => row.map((cell) => `"${cell}"`).join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `newsletter-toyoparts-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
    toast.success(`${filtered.length} registros exportados`);
  };

  return (
    <div className="mx-auto max-w-[1280px] space-y-6 px-4 pb-12 pt-6 lg:px-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground">
            <Mail className="h-6 w-6" /> Newsletter
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Gerencie inscritos e acompanhe se o lead foi criado no Syonet e no HubSpot.
          </p>
        </div>

        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={exportCSV} disabled={filtered.length === 0}>
            <Download className="mr-2 h-4 w-4" />
            Exportar CSV
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              void loadSubscribers();
              void loadStats();
            }}
            disabled={loading}
          >
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            Atualizar
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-6">
        <StatCard
          icon={<Users className="h-5 w-5 text-primary" />}
          label="Total Inscritos"
          value={stats?.total ?? '—'}
          loading={statsLoading}
        />
        <StatCard
          icon={<UserCheck className="h-5 w-5 text-green-600" />}
          label="Ativos"
          value={stats?.active ?? '—'}
          loading={statsLoading}
          accent="green"
        />
        <StatCard
          icon={<TrendingUp className="h-5 w-5 text-blue-600" />}
          label="Ultimos 7 dias"
          value={stats?.recent_7d ?? '—'}
          loading={statsLoading}
          accent="blue"
        />
        <StatCard
          icon={<Smartphone className="h-5 w-5 text-emerald-600" />}
          label="Syonet OK"
          value={stats?.integrations?.syonet?.success ?? '—'}
          loading={statsLoading}
          accent="green"
          detail={stats ? `${stats.integrations?.syonet?.error ?? 0} erro(s) · ${stats.integrations?.syonet?.pending ?? 0} pendente(s)` : undefined}
        />
        <StatCard
          icon={<Mail className="h-5 w-5 text-orange-600" />}
          label="HubSpot OK"
          value={stats?.integrations?.hubspot?.success ?? '—'}
          loading={statsLoading}
          accent="purple"
          detail={stats ? `${stats.integrations?.hubspot?.error ?? 0} erro(s) · ${stats.integrations?.hubspot?.pending ?? 0} pendente(s)` : undefined}
        />
        <StatCard
          icon={<Globe className="h-5 w-5 text-purple-600" />}
          label="Fontes"
          value={stats?.by_source ? Object.keys(stats.by_source).length : '—'}
          loading={statsLoading}
          accent="purple"
          detail={stats?.by_source ? Object.entries(stats.by_source).map(([key, value]) => `${(SOURCE_LABELS[key] || SOURCE_LABELS.unknown).label}: ${value}`).join(' · ') : undefined}
        />
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <form className="relative max-w-sm flex-1" onSubmit={(event) => event.preventDefault()}>
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar por email, nome ou WhatsApp..."
            className="h-10 pl-9"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </form>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5">
            <Filter className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Origem:</span>
          </div>
          {sources.map((source) => (
            <button
              key={source}
              onClick={() => setFilterSource(source)}
              className={`rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition-all ${
                filterSource === source
                  ? 'border-foreground bg-foreground text-background'
                  : 'border-border bg-muted/50 text-muted-foreground hover:bg-muted'
              }`}
            >
              {source === 'all' ? 'Todas' : (SOURCE_LABELS[source] || SOURCE_LABELS.unknown).label}
            </button>
          ))}

          <span className="text-border">|</span>

          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Status:</span>
          {(['all', 'active', 'inactive'] as const).map((status) => (
            <button
              key={status}
              onClick={() => setFilterStatus(status)}
              className={`rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition-all ${
                filterStatus === status
                  ? 'border-foreground bg-foreground text-background'
                  : 'border-border bg-muted/50 text-muted-foreground hover:bg-muted'
              }`}
            >
              {status === 'all' ? 'Todos' : status === 'active' ? 'Ativos' : 'Inativos'}
            </button>
          ))}

          {activeFilters > 0 && (
            <button
              onClick={() => {
                setFilterSource('all');
                setFilterStatus('all');
              }}
              className="ml-1 text-[10px] font-bold text-primary hover:underline"
            >
              Limpar filtros
            </button>
          )}
        </div>
      </div>

      <div className="text-xs font-medium text-muted-foreground">
        {filtered.length} de {subscribers.length} inscritos
        {search && <span className="ml-1">para "{search}"</span>}
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border bg-muted/50 text-xs font-semibold uppercase text-muted-foreground">
              <tr>
                <th className="px-6 py-3 font-medium">Email</th>
                <th className="px-6 py-3 font-medium">Nome</th>
                <th className="hidden px-6 py-3 font-medium md:table-cell">WhatsApp</th>
                <th className="hidden px-6 py-3 font-medium sm:table-cell">Origem</th>
                <th className="hidden px-6 py-3 font-medium lg:table-cell">Data</th>
                <th className="hidden px-6 py-3 font-medium xl:table-cell">Integracoes</th>
                <th className="px-6 py-3 font-medium">Status</th>
                <th className="px-6 py-3 text-right font-medium">Acoes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr>
                  <td colSpan={8} className="p-8 py-12 text-center text-muted-foreground">
                    <div className="flex flex-col items-center gap-2">
                      <Loader2 className="h-6 w-6 animate-spin text-primary" />
                      <span className="text-xs font-medium">Carregando inscritos...</span>
                    </div>
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-8 py-16 text-center text-muted-foreground">
                    <div className="flex flex-col items-center gap-3">
                      <Mail className="h-10 w-10 text-muted-foreground/30" />
                      <span className="text-sm font-medium">Nenhum inscrito encontrado</span>
                      <span className="text-xs text-muted-foreground/70">
                        {search || activeFilters > 0 ? 'Tente ajustar os filtros' : 'Os formularios de newsletter da loja enviam dados para ca'}
                      </span>
                    </div>
                  </td>
                </tr>
              ) : (
                filtered.map((subscriber) => (
                  <tr key={subscriber.email} className="group transition-colors hover:bg-muted/50">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <Mail className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
                        <span className="max-w-[220px] truncate font-medium text-foreground">{subscriber.email}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-muted-foreground">
                      {subscriber.name || <span className="text-xs italic text-muted-foreground/40">—</span>}
                    </td>
                    <td className="hidden px-6 py-4 text-muted-foreground md:table-cell">
                      {subscriber.whatsapp ? (
                        <div className="flex items-center gap-1.5">
                          <Smartphone className="h-3.5 w-3.5 opacity-60" />
                          <span className="font-mono text-xs">{formatPhone(subscriber.whatsapp)}</span>
                        </div>
                      ) : (
                        <span className="text-xs italic text-muted-foreground/40">—</span>
                      )}
                    </td>
                    <td className="hidden px-6 py-4 sm:table-cell">
                      <SourceBadge source={subscriber.source} />
                    </td>
                    <td className="hidden px-6 py-4 text-muted-foreground lg:table-cell">
                      <div className="flex items-center gap-1.5">
                        <Calendar className="h-3.5 w-3.5 opacity-60" />
                        <span className="text-xs">
                          {subscriber.subscribedAt
                            ? new Date(subscriber.subscribedAt).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })
                            : '—'}
                        </span>
                      </div>
                    </td>
                    <td className="hidden px-6 py-4 xl:table-cell">
                      <div className="flex flex-wrap gap-1.5">
                        <IntegrationBadge label="Syonet" integration={subscriber.integrations?.syonet} successKey="leadId" />
                        <IntegrationBadge label="HubSpot" integration={subscriber.integrations?.hubspot} successKey="contactId" />
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      {subscriber.active !== false ? (
                        <Badge className="border-green-200 bg-green-50 text-[10px] font-bold uppercase tracking-wider text-green-700">Ativo</Badge>
                      ) : (
                        <Badge variant="outline" className="border-border text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Inativo</Badge>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0 opacity-0 transition-opacity group-hover:opacity-100"
                        title="Ver dados completos"
                        onClick={() => setSelectedSub(subscriber)}
                      >
                        <FileJson className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {filtered.length > 0 && (
          <div className="flex items-center justify-between border-t border-border bg-muted/20 px-6 py-3">
            <span className="text-xs font-medium text-muted-foreground">
              {filtered.length} inscrito{filtered.length !== 1 ? 's' : ''}
            </span>
            <Button variant="outline" size="sm" onClick={exportCSV}>
              <Download className="mr-1.5 h-3.5 w-3.5" />
              CSV
            </Button>
          </div>
        )}
      </div>

      <Sheet open={!!selectedSub} onOpenChange={(open) => !open && setSelectedSub(null)}>
        <SheetContent className="w-[400px] overflow-y-auto sm:w-[540px]">
          <SheetHeader>
            <SheetTitle>Detalhes do inscrito</SheetTitle>
            <SheetDescription>
              Dados completos armazenados e status de criacao do lead externo.
            </SheetDescription>
          </SheetHeader>

          {selectedSub && (
            <div className="mt-6 space-y-4">
              <DetailRow label="Email" value={selectedSub.email} />
              <DetailRow label="Nome" value={selectedSub.name || '(nao informado)'} />
              <DetailRow label="WhatsApp" value={selectedSub.whatsapp ? formatPhone(selectedSub.whatsapp) : '(nao informado)'} />
              <DetailRow label="Origem" value={<SourceBadge source={selectedSub.source} />} />
              <DetailRow label="Data de inscricao" value={selectedSub.subscribedAt ? new Date(selectedSub.subscribedAt).toLocaleString('pt-BR') : '—'} />
              {selectedSub.updatedAt && <DetailRow label="Ultima atualizacao" value={new Date(selectedSub.updatedAt).toLocaleString('pt-BR')} />}
              {selectedSub.unsubscribedAt && <DetailRow label="Data cancelamento" value={new Date(selectedSub.unsubscribedAt).toLocaleString('pt-BR')} />}

              <DetailRow
                label="Lead no Syonet"
                value={<IntegrationBadge label="Syonet" integration={selectedSub.integrations?.syonet} successKey="leadId" />}
              />
              {selectedSub.integrations?.syonet?.leadId && (
                <DetailRow label="ID do lead Syonet" value={selectedSub.integrations.syonet.leadId} />
              )}
              {selectedSub.integrations?.syonet?.lastSuccessAt && (
                <DetailRow label="Syonet sincronizado em" value={new Date(selectedSub.integrations.syonet.lastSuccessAt).toLocaleString('pt-BR')} />
              )}
              {selectedSub.integrations?.syonet?.error && (
                <DetailRow label="Erro Syonet" value={selectedSub.integrations.syonet.error} />
              )}

              <DetailRow
                label="Lead no HubSpot"
                value={<IntegrationBadge label="HubSpot" integration={selectedSub.integrations?.hubspot} successKey="contactId" />}
              />
              {selectedSub.integrations?.hubspot?.contactId && (
                <DetailRow label="ID do contato HubSpot" value={selectedSub.integrations.hubspot.contactId} />
              )}
              {selectedSub.integrations?.hubspot?.lastSuccessAt && (
                <DetailRow label="HubSpot sincronizado em" value={new Date(selectedSub.integrations.hubspot.lastSuccessAt).toLocaleString('pt-BR')} />
              )}
              {selectedSub.integrations?.hubspot?.error && (
                <DetailRow label="Erro HubSpot" value={selectedSub.integrations.hubspot.error} />
              )}

              <DetailRow
                label="Status"
                value={
                  selectedSub.active !== false
                    ? <Badge className="border-green-200 bg-green-50 text-green-700">Ativo</Badge>
                    : <Badge variant="outline" className="border-red-200 text-red-600">Cancelado</Badge>
                }
              />

              <div className="border-t border-border pt-4">
                <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">JSON raw</p>
                <div className="overflow-x-auto rounded-lg bg-muted p-4">
                  <pre className="whitespace-pre-wrap text-xs text-muted-foreground">
                    {JSON.stringify(selectedSub, null, 2)}
                  </pre>
                </div>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  loading,
  accent,
  detail,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  loading?: boolean;
  accent?: 'green' | 'blue' | 'purple';
  detail?: string;
}) {
  const accentBg = accent === 'green'
    ? 'bg-green-50'
    : accent === 'blue'
    ? 'bg-blue-50'
    : accent === 'purple'
    ? 'bg-purple-50'
    : 'bg-primary/5';

  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-3">
        <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${accentBg}`}>
          {icon}
        </div>
        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</span>
      </div>

      {loading ? (
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      ) : (
        <>
          <p className="text-2xl font-bold tracking-tight text-foreground">{value}</p>
          {detail && <p className="mt-1 truncate text-[10px] text-muted-foreground">{detail}</p>}
        </>
      )}
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</span>
      <span className="text-sm text-foreground">{value}</span>
    </div>
  );
}

function IntegrationBadge({
  label,
  integration,
  successKey,
}: {
  label: string;
  integration?: IntegrationStatus;
  successKey: 'leadId' | 'contactId';
}) {
  const status = integration?.status || 'pending_config';
  const hasExternalId = Boolean(integration?.[successKey]);

  if (status === 'success') {
    return (
      <Badge className="border-emerald-200 bg-emerald-50 text-[10px] font-bold uppercase tracking-wider text-emerald-700">
        {label} OK{hasExternalId ? ' · Lead cadastrado' : ''}
      </Badge>
    );
  }

  if (status === 'error') {
    return (
      <Badge className="border-rose-200 bg-rose-50 text-[10px] font-bold uppercase tracking-wider text-rose-700">
        {label} erro
      </Badge>
    );
  }

  return (
    <Badge variant="outline" className="border-amber-200 bg-amber-50 text-[10px] font-bold uppercase tracking-wider text-amber-700">
      {label} pendente
    </Badge>
  );
}

function formatPhone(phone: string): string {
  if (!phone) return '';

  const digits = phone.replace(/\D/g, '');
  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  }

  if (digits.length === 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }

  return phone;
}
