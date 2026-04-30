import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Download,
  Filter,
  Loader2,
  Mail,
  MessageCircle,
  Phone,
  RefreshCw,
  Search,
  Send,
  UserRound,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { projectId } from '../../../../utils/supabase/info';
import { adminFetch } from '../../lib/admin-auth';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '../../components/ui/sheet';

const API = `https://${projectId}.supabase.co/functions/v1/make-server-1d6e33e0/admin/contact-leads`;

type ChannelFilter = 'all' | 'whatsapp' | 'email' | 'phone';
type SyonetFilter = 'all' | 'success' | 'error' | 'pending' | 'skipped';

interface IntegrationStatus {
  status: 'success' | 'error' | 'pending_config' | 'skipped';
  lastAttemptAt?: string;
  lastSuccessAt?: string | null;
  error?: string | null;
  leadId?: string | null;
}

interface ContactLeadRecord {
  id: string;
  name: string;
  email: string;
  phone: string;
  normalizedPhone: string;
  message: string;
  preferredChannel: 'whatsapp' | 'email' | 'phone';
  source: 'contact_page';
  pagePath: string;
  submittedAt: string;
  updatedAt?: string;
  integrations?: {
    syonet?: IntegrationStatus;
  };
}

interface ContactLeadStats {
  total: number;
  recent_7d: number;
  by_channel: {
    whatsapp: number;
    email: number;
    phone: number;
  };
  integrations: {
    syonet: {
      success: number;
      error: number;
      pending: number;
      skipped?: number;
    };
  };
}

function formatDateTime(value?: string | null) {
  if (!value) return 'nunca';
  return new Date(value).toLocaleString('pt-BR');
}

function integrationTone(status?: string | null) {
  if (status === 'success') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (status === 'error') return 'border-rose-200 bg-rose-50 text-rose-700';
  if (status === 'skipped') return 'border-slate-200 bg-slate-50 text-slate-600';
  return 'border-amber-200 bg-amber-50 text-amber-700';
}

function integrationLabel(status?: string | null) {
  if (status === 'success') return 'Syonet OK';
  if (status === 'error') return 'Syonet erro';
  if (status === 'skipped') return 'Syonet ignorado';
  return 'Syonet pendente';
}

function channelLabel(channel: ContactLeadRecord['preferredChannel']) {
  if (channel === 'whatsapp') return 'WhatsApp';
  if (channel === 'email') return 'E-mail';
  return 'Telefone';
}

function StatCard({
  label,
  value,
  detail,
  icon,
  loading,
}: {
  label: string;
  value: number | string;
  detail?: string;
  icon: React.ReactNode;
  loading?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{label}</p>
          <p className="mt-2 text-2xl font-black text-foreground">
            {loading ? '...' : value}
          </p>
        </div>
        <div className="rounded-2xl bg-secondary p-2 text-primary">{icon}</div>
      </div>
      {detail && <p className="mt-2 text-xs text-muted-foreground">{detail}</p>}
    </div>
  );
}

export function ContactLeadsAdminPage() {
  const [leads, setLeads] = useState<ContactLeadRecord[]>([]);
  const [stats, setStats] = useState<ContactLeadStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [statsLoading, setStatsLoading] = useState(false);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [channelFilter, setChannelFilter] = useState<ChannelFilter>('all');
  const [syonetFilter, setSyonetFilter] = useState<SyonetFilter>('all');
  const [selectedLead, setSelectedLead] = useState<ContactLeadRecord | null>(null);

  const loadLeads = async () => {
    setLoading(true);
    try {
      const response = await adminFetch(`${API}/leads`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      setLeads(data.leads || []);
    } catch (error: any) {
      console.error('[contact-leads-admin] load error:', error);
      toast.error(`Erro ao carregar leads: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const loadStats = async () => {
    setStatsLoading(true);
    try {
      const response = await adminFetch(`${API}/stats`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      setStats(data);
    } catch (error: any) {
      console.error('[contact-leads-admin] stats error:', error);
    } finally {
      setStatsLoading(false);
    }
  };

  useEffect(() => {
    void loadLeads();
    void loadStats();
  }, []);

  const filtered = useMemo(() => {
    let list = [...leads];

    if (channelFilter !== 'all') {
      list = list.filter((lead) => lead.preferredChannel === channelFilter);
    }

    if (syonetFilter !== 'all') {
      if (syonetFilter === 'pending') {
        list = list.filter((lead) =>
          ['pending_config', ''].includes(String(lead.integrations?.syonet?.status || '')),
        );
      } else {
        list = list.filter((lead) => lead.integrations?.syonet?.status === syonetFilter);
      }
    }

    if (search.trim()) {
      const query = search.toLowerCase();
      list = list.filter((lead) =>
        String(lead.name || '').toLowerCase().includes(query) ||
        String(lead.email || '').toLowerCase().includes(query) ||
        String(lead.phone || '').includes(query) ||
        String(lead.message || '').toLowerCase().includes(query)
      );
    }

    return list;
  }, [leads, search, channelFilter, syonetFilter]);

  const exportCSV = () => {
    if (filtered.length === 0) {
      toast.error('Nenhum lead para exportar');
      return;
    }

    const headers = ['Data', 'Nome', 'Email', 'Telefone', 'Canal', 'Mensagem', 'Syonet', 'Lead Syonet'];
    const rows = filtered.map((lead) => [
      formatDateTime(lead.submittedAt),
      lead.name || '',
      lead.email || '',
      lead.phone || '',
      channelLabel(lead.preferredChannel),
      String(lead.message || '').replace(/\r?\n/g, ' '),
      integrationLabel(lead.integrations?.syonet?.status),
      lead.integrations?.syonet?.leadId || '',
    ]);

    const csv = [headers, ...rows].map((row) => row.map((cell) => `"${cell}"`).join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `fale-conosco-toyoparts-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
    toast.success(`${filtered.length} leads exportados`);
  };

  const retryLead = async (lead: ContactLeadRecord) => {
    setRetryingId(lead.id);
    try {
      const response = await adminFetch(`${API}/${lead.id}/retry-syonet`, {
        method: 'POST',
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(String(data?.error || `HTTP ${response.status}`));
      }

      const updatedLead = data.lead as ContactLeadRecord;
      setLeads((current) => current.map((item) => (item.id === updatedLead.id ? updatedLead : item)));
      setSelectedLead((current) => (current?.id === updatedLead.id ? updatedLead : current));
      if (updatedLead.integrations?.syonet?.status === 'skipped') {
        toast.info('Lead sem e-mail ou telefone valido. Envio ao Syonet ignorado.');
      } else {
        toast.success('Lead reenviado ao Syonet');
      }
      await loadStats();
    } catch (error: any) {
      toast.error(`Erro ao reenviar lead: ${error.message}`);
    } finally {
      setRetryingId(null);
    }
  };

  return (
    <div className="mx-auto max-w-[1280px] space-y-6 px-4 pb-12 pt-6 lg:px-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground">
            <MessageCircle className="h-6 w-6" /> Fale Conosco
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Acompanhe todos os leads gerados pelo formulario do Fale Conosco e o status de envio ao Syonet.
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
              void loadLeads();
              void loadStats();
            }}
            disabled={loading}
          >
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            Atualizar
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-7">
        <StatCard
          icon={<UserRound className="h-5 w-5 text-primary" />}
          label="Total de leads"
          value={stats?.total ?? '-'}
          loading={statsLoading}
        />
        <StatCard
          icon={<Send className="h-5 w-5 text-blue-600" />}
          label="Ultimos 7 dias"
          value={stats?.recent_7d ?? '-'}
          loading={statsLoading}
          detail="Contatos recentes"
        />
        <StatCard
          icon={<MessageCircle className="h-5 w-5 text-emerald-600" />}
          label="WhatsApp"
          value={stats?.by_channel?.whatsapp ?? '-'}
          loading={statsLoading}
          detail="Canal preferido"
        />
        <StatCard
          icon={<Mail className="h-5 w-5 text-violet-600" />}
          label="E-mail"
          value={stats?.by_channel?.email ?? '-'}
          loading={statsLoading}
          detail="Canal preferido"
        />
        <StatCard
          icon={<Phone className="h-5 w-5 text-sky-600" />}
          label="Telefone"
          value={stats?.by_channel?.phone ?? '-'}
          loading={statsLoading}
          detail="Canal preferido"
        />
        <StatCard
          icon={<CheckCircle2 className="h-5 w-5 text-emerald-600" />}
          label="Syonet OK"
          value={stats?.integrations?.syonet?.success ?? '-'}
          loading={statsLoading}
          detail={stats ? `${stats.integrations.syonet.error} erro(s)` : undefined}
        />
        <StatCard
          icon={<AlertCircle className="h-5 w-5 text-amber-600" />}
          label="Syonet pendente"
          value={stats?.integrations?.syonet?.pending ?? '-'}
          loading={statsLoading}
          detail={stats ? `${stats.integrations.syonet.skipped ?? 0} ignorado(s)` : undefined}
        />
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <form className="relative max-w-sm flex-1" onSubmit={(event) => event.preventDefault()}>
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar por nome, email, telefone ou mensagem..."
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
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Canal:</span>
          </div>
          {(['all', 'whatsapp', 'email', 'phone'] as ChannelFilter[]).map((channel) => (
            <button
              key={channel}
              onClick={() => setChannelFilter(channel)}
              className={`rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition-all ${
                channelFilter === channel
                  ? 'border-foreground bg-foreground text-background'
                  : 'border-border bg-muted/50 text-muted-foreground hover:bg-muted'
              }`}
            >
              {channel === 'all' ? 'Todos' : channelLabel(channel as ContactLeadRecord['preferredChannel'])}
            </button>
          ))}

          <div className="ml-2 flex items-center gap-1.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Syonet:</span>
          </div>
          {(['all', 'success', 'error', 'pending', 'skipped'] as SyonetFilter[]).map((status) => (
            <button
              key={status}
              onClick={() => setSyonetFilter(status)}
              className={`rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition-all ${
                syonetFilter === status
                  ? 'border-foreground bg-foreground text-background'
                  : 'border-border bg-muted/50 text-muted-foreground hover:bg-muted'
              }`}
            >
              {status === 'all'
                ? 'Todos'
                : status === 'success'
                  ? 'OK'
                  : status === 'error'
                    ? 'Erro'
                    : status === 'skipped'
                      ? 'Ignorado'
                      : 'Pendente'}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[960px]">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Data</th>
                <th className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Lead</th>
                <th className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Canal</th>
                <th className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Mensagem</th>
                <th className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Syonet</th>
                <th className="px-4 py-3 text-right text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Acoes</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-sm text-muted-foreground">
                    <Loader2 className="mx-auto mb-3 h-5 w-5 animate-spin" />
                    Carregando leads do Fale Conosco...
                  </td>
                </tr>
              )}

              {!loading && filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-sm text-muted-foreground">
                    Nenhum lead encontrado com os filtros atuais.
                  </td>
                </tr>
              )}

              {!loading && filtered.map((lead) => (
                <tr key={lead.id} className="border-b border-border/70 align-top last:border-b-0">
                  <td className="px-4 py-4 text-sm text-foreground">{formatDateTime(lead.submittedAt)}</td>
                  <td className="px-4 py-4">
                    <div className="space-y-1">
                      <p className="text-sm font-semibold text-foreground">{lead.name || 'Sem nome'}</p>
                      {lead.email && <p className="text-xs text-muted-foreground">{lead.email}</p>}
                      {lead.phone && <p className="text-xs text-muted-foreground">{lead.phone}</p>}
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <span className="inline-flex rounded-md border border-border bg-muted px-2 py-1 text-[11px] font-bold uppercase tracking-wider text-foreground">
                      {channelLabel(lead.preferredChannel)}
                    </span>
                  </td>
                  <td className="px-4 py-4 text-sm text-muted-foreground">
                    <p className="line-clamp-3 max-w-[340px]">{lead.message || 'Sem mensagem'}</p>
                  </td>
                  <td className="px-4 py-4">
                    <div className="space-y-2">
                      <span className={`inline-flex rounded-md border px-2 py-1 text-[11px] font-bold uppercase tracking-wider ${integrationTone(lead.integrations?.syonet?.status)}`}>
                        {integrationLabel(lead.integrations?.syonet?.status)}
                      </span>
                      {lead.integrations?.syonet?.leadId && (
                        <p className="text-xs text-muted-foreground">Lead {lead.integrations.syonet.leadId}</p>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-4 text-right">
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" size="sm" onClick={() => setSelectedLead(lead)}>
                        Ver detalhes
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => void retryLead(lead)}
                        disabled={retryingId === lead.id}
                      >
                        {retryingId === lead.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          'Reenviar'
                        )}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Sheet open={!!selectedLead} onOpenChange={(open) => !open && setSelectedLead(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
          {selectedLead && (
            <>
              <SheetHeader>
                <SheetTitle>Lead do Fale Conosco</SheetTitle>
                <SheetDescription>
                  Detalhes do contato e status de criacao no Syonet.
                </SheetDescription>
              </SheetHeader>

              <div className="mt-6 space-y-6">
                <section className="space-y-3 rounded-2xl border border-border bg-card p-4">
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Nome</p>
                    <p className="mt-1 text-sm font-semibold text-foreground">{selectedLead.name || 'Sem nome'}</p>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Email</p>
                      <p className="mt-1 text-sm text-foreground">{selectedLead.email || 'Nao informado'}</p>
                    </div>
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Telefone</p>
                      <p className="mt-1 text-sm text-foreground">{selectedLead.phone || 'Nao informado'}</p>
                    </div>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Canal</p>
                      <p className="mt-1 text-sm text-foreground">{channelLabel(selectedLead.preferredChannel)}</p>
                    </div>
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Data</p>
                      <p className="mt-1 text-sm text-foreground">{formatDateTime(selectedLead.submittedAt)}</p>
                    </div>
                  </div>
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Mensagem</p>
                    <p className="mt-1 whitespace-pre-wrap rounded-xl bg-muted px-3 py-3 text-sm text-foreground">
                      {selectedLead.message || 'Sem mensagem'}
                    </p>
                  </div>
                </section>

                <section className="space-y-3 rounded-2xl border border-border bg-card p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Syonet</p>
                      <span className={`mt-2 inline-flex rounded-md border px-2 py-1 text-[11px] font-bold uppercase tracking-wider ${integrationTone(selectedLead.integrations?.syonet?.status)}`}>
                        {integrationLabel(selectedLead.integrations?.syonet?.status)}
                      </span>
                    </div>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void retryLead(selectedLead)}
                      disabled={retryingId === selectedLead.id}
                    >
                      {retryingId === selectedLead.id ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Reenviando
                        </>
                      ) : (
                        'Reenviar ao Syonet'
                      )}
                    </Button>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Lead no Syonet</p>
                      <p className="mt-1 text-sm text-foreground">{selectedLead.integrations?.syonet?.leadId || 'Nao retornado'}</p>
                    </div>
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Ultima tentativa</p>
                      <p className="mt-1 text-sm text-foreground">{formatDateTime(selectedLead.integrations?.syonet?.lastAttemptAt)}</p>
                    </div>
                  </div>

                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Ultimo sucesso</p>
                    <p className="mt-1 text-sm text-foreground">{formatDateTime(selectedLead.integrations?.syonet?.lastSuccessAt)}</p>
                  </div>

                  {selectedLead.integrations?.syonet?.error && (
                    <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-3 text-sm text-rose-700">
                      {selectedLead.integrations.syonet.error}
                    </div>
                  )}
                </section>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
