// ─── Newsletter Admin Page ──────────────────────────────────────────────────
// Lists, searches, filters and exports newsletter subscribers from KV.

import React, { useState, useEffect, useMemo } from 'react';
import {
  Mail, Search, RefreshCw, Loader2, Calendar, Download, Users,
  TrendingUp, Globe, Smartphone, FileJson, UserX, UserCheck, Filter, X
} from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Badge } from '../../components/ui/badge';
import { toast } from 'sonner';
import { projectId, publicAnonKey } from '../../../../utils/supabase/info';
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

interface Subscriber {
  email: string;
  name: string;
  whatsapp: string;
  source: string;
  subscribedAt: string;
  updatedAt?: string;
  unsubscribedAt?: string;
  active: boolean;
}

interface Stats {
  total: number;
  active: number;
  recent_7d: number;
  by_source: Record<string, number>;
}

const SOURCE_LABELS: Record<string, { label: string; color: string }> = {
  homepage: { label: 'Home', color: 'bg-blue-100 text-blue-700 border-blue-200' },
  pdp: { label: 'Produto', color: 'bg-purple-100 text-purple-700 border-purple-200' },
  magento: { label: 'Magento', color: 'bg-orange-100 text-orange-700 border-orange-200' },
  footer: { label: 'Footer', color: 'bg-gray-100 text-gray-700 border-gray-200' },
  unknown: { label: 'Outro', color: 'bg-amber-100 text-amber-700 border-amber-200' },
};

function SourceBadge({ source }: { source: string }) {
  const config = SOURCE_LABELS[source] || SOURCE_LABELS.unknown;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider border ${config.color}`}>
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

  // ── Load subscribers ──────────────────────────────────────────────────
  const loadSubscribers = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/subscribers`, { headers: HEADERS });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setSubscribers(data.subscribers || []);
    } catch (e: any) {
      console.error('[newsletter-admin] load error:', e);
      toast.error('Erro ao carregar inscritos: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  // ── Load stats ────────────────────────────────────────────────────────
  const loadStats = async () => {
    setStatsLoading(true);
    try {
      const res = await fetch(`${API}/stats`, { headers: HEADERS });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setStats(data);
    } catch (e: any) {
      console.error('[newsletter-admin] stats error:', e);
    } finally {
      setStatsLoading(false);
    }
  };

  useEffect(() => {
    loadSubscribers();
    loadStats();
  }, []);

  // ── Filtered list ─────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let list = [...subscribers];

    // Status filter
    if (filterStatus === 'active') list = list.filter(s => s.active !== false);
    if (filterStatus === 'inactive') list = list.filter(s => s.active === false);

    // Source filter
    if (filterSource !== 'all') list = list.filter(s => s.source === filterSource);

    // Search
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(s =>
        s.email.toLowerCase().includes(q) ||
        (s.name || '').toLowerCase().includes(q) ||
        (s.whatsapp || '').includes(q)
      );
    }

    return list;
  }, [subscribers, search, filterSource, filterStatus]);

  // ── Export CSV ─────────────────────────────────────────────────────────
  const exportCSV = () => {
    if (filtered.length === 0) {
      toast.error('Nenhum inscrito para exportar');
      return;
    }

    const headers = ['Email', 'Nome', 'WhatsApp', 'Origem', 'Data Inscricao', 'Status'];
    const rows = filtered.map(s => [
      s.email,
      s.name || '',
      s.whatsapp || '',
      s.source || '',
      s.subscribedAt ? new Date(s.subscribedAt).toLocaleDateString('pt-BR') : '',
      s.active !== false ? 'Ativo' : 'Inativo',
    ]);

    const csv = [headers, ...rows].map(r => r.map(c => `"${c}"`).join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `newsletter-toyoparts-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`${filtered.length} registros exportados`);
  };

  // ── Unique sources for filter ─────────────────────────────────────────
  const sources = useMemo(() => {
    const set = new Set(subscribers.map(s => s.source || 'unknown'));
    return ['all', ...Array.from(set)];
  }, [subscribers]);

  const activeFilters = (filterSource !== 'all' ? 1 : 0) + (filterStatus !== 'all' ? 1 : 0);

  return (
    <div className="max-w-[1280px] mx-auto px-4 lg:px-6 pt-6 pb-12 space-y-6">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Mail className="w-6 h-6" /> Newsletter
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Gerencie inscritos da newsletter Toyoparts
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={exportCSV} disabled={filtered.length === 0}>
            <Download className="w-4 h-4 mr-2" />
            Exportar CSV
          </Button>
          <Button variant="outline" size="sm" onClick={() => { loadSubscribers(); loadStats(); }} disabled={loading}>
            {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
            Atualizar
          </Button>
        </div>
      </div>

      {/* ── Stats Cards ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={<Users className="w-5 h-5 text-primary" />}
          label="Total Inscritos"
          value={stats?.total ?? '—'}
          loading={statsLoading}
        />
        <StatCard
          icon={<UserCheck className="w-5 h-5 text-green-600" />}
          label="Ativos"
          value={stats?.active ?? '—'}
          loading={statsLoading}
          accent="green"
        />
        <StatCard
          icon={<TrendingUp className="w-5 h-5 text-blue-600" />}
          label="Últimos 7 dias"
          value={stats?.recent_7d ?? '—'}
          loading={statsLoading}
          accent="blue"
        />
        <StatCard
          icon={<Globe className="w-5 h-5 text-purple-600" />}
          label="Fontes"
          value={stats?.by_source ? Object.keys(stats.by_source).length : '—'}
          loading={statsLoading}
          accent="purple"
          detail={stats?.by_source ? Object.entries(stats.by_source).map(([k, v]) => `${(SOURCE_LABELS[k] || SOURCE_LABELS.unknown).label}: ${v}`).join(' · ') : undefined}
        />
      </div>

      {/* ── Search & Filters ────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row gap-3">
        <form className="relative flex-1 max-w-sm" onSubmit={e => e.preventDefault()}>
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por email, nome ou WhatsApp..."
            className="pl-9 h-10"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </form>

        <div className="flex gap-2 flex-wrap items-center">
          <div className="flex items-center gap-1.5">
            <Filter className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Origem:</span>
          </div>
          {sources.map(src => (
            <button
              key={src}
              onClick={() => setFilterSource(src)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-all ${
                filterSource === src
                  ? 'bg-foreground text-background border-foreground'
                  : 'bg-muted/50 text-muted-foreground border-border hover:bg-muted'
              }`}
            >
              {src === 'all' ? 'Todas' : (SOURCE_LABELS[src] || SOURCE_LABELS.unknown).label}
            </button>
          ))}

          <span className="text-border">|</span>

          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Status:</span>
          </div>
          {(['all', 'active', 'inactive'] as const).map(st => (
            <button
              key={st}
              onClick={() => setFilterStatus(st)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-all ${
                filterStatus === st
                  ? 'bg-foreground text-background border-foreground'
                  : 'bg-muted/50 text-muted-foreground border-border hover:bg-muted'
              }`}
            >
              {st === 'all' ? 'Todos' : st === 'active' ? 'Ativos' : 'Inativos'}
            </button>
          ))}

          {activeFilters > 0 && (
            <button
              onClick={() => { setFilterSource('all'); setFilterStatus('all'); }}
              className="text-[10px] text-primary font-bold hover:underline ml-1"
            >
              Limpar filtros
            </button>
          )}
        </div>
      </div>

      {/* ── Results count ────────────────────────────────────────────────── */}
      <div className="text-xs text-muted-foreground font-medium">
        {filtered.length} de {subscribers.length} inscritos
        {search && <span className="ml-1">para "{search}"</span>}
      </div>

      {/* ── Table ────────────────────────────────────────────────────────── */}
      <div className="bg-card rounded-xl border border-border overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-muted/50 border-b border-border text-xs uppercase text-muted-foreground font-semibold">
              <tr>
                <th className="px-6 py-3 font-medium">Email</th>
                <th className="px-6 py-3 font-medium">Nome</th>
                <th className="px-6 py-3 font-medium hidden md:table-cell">WhatsApp</th>
                <th className="px-6 py-3 font-medium hidden sm:table-cell">Origem</th>
                <th className="px-6 py-3 font-medium hidden lg:table-cell">Data</th>
                <th className="px-6 py-3 font-medium">Status</th>
                <th className="px-6 py-3 font-medium text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-muted-foreground py-12">
                    <div className="flex flex-col items-center gap-2">
                      <Loader2 className="w-6 h-6 animate-spin text-primary" />
                      <span className="text-xs font-medium">Carregando inscritos...</span>
                    </div>
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-muted-foreground py-16">
                    <div className="flex flex-col items-center gap-3">
                      <Mail className="w-10 h-10 text-muted-foreground/30" />
                      <span className="text-sm font-medium">Nenhum inscrito encontrado</span>
                      <span className="text-xs text-muted-foreground/70">
                        {search || activeFilters > 0 ? 'Tente ajustar os filtros' : 'Os formulários de newsletter da loja enviam dados para cá'}
                      </span>
                    </div>
                  </td>
                </tr>
              ) : (
                filtered.map((sub) => (
                  <tr key={sub.email} className="hover:bg-muted/50 transition-colors group">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <Mail className="w-3.5 h-3.5 text-muted-foreground/60 shrink-0" />
                        <span className="font-medium text-foreground truncate max-w-[200px]">{sub.email}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-muted-foreground">
                      {sub.name || <span className="text-muted-foreground/40 italic text-xs">—</span>}
                    </td>
                    <td className="px-6 py-4 text-muted-foreground hidden md:table-cell">
                      {sub.whatsapp ? (
                        <div className="flex items-center gap-1.5">
                          <Smartphone className="w-3.5 h-3.5 opacity-60" />
                          <span className="font-mono text-xs">{formatPhone(sub.whatsapp)}</span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground/40 italic text-xs">—</span>
                      )}
                    </td>
                    <td className="px-6 py-4 hidden sm:table-cell">
                      <SourceBadge source={sub.source} />
                    </td>
                    <td className="px-6 py-4 text-muted-foreground hidden lg:table-cell">
                      <div className="flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 opacity-60" />
                        <span className="text-xs">
                          {sub.subscribedAt ? new Date(sub.subscribedAt).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      {sub.active !== false ? (
                        <Badge className="bg-green-50 text-green-700 border-green-200 text-[10px] font-bold uppercase tracking-wider">Ativo</Badge>
                      ) : (
                        <Badge variant="outline" className="text-muted-foreground border-border text-[10px] font-bold uppercase tracking-wider">Inativo</Badge>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Ver dados completos"
                        onClick={() => setSelectedSub(sub)}
                      >
                        <FileJson className="w-4 h-4" />
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* ── Table footer ── */}
        {filtered.length > 0 && (
          <div className="px-6 py-3 border-t border-border flex items-center justify-between bg-muted/20">
            <span className="text-xs text-muted-foreground font-medium">
              {filtered.length} inscrito{filtered.length !== 1 ? 's' : ''}
            </span>
            <Button variant="outline" size="sm" onClick={exportCSV}>
              <Download className="w-3.5 h-3.5 mr-1.5" />
              CSV
            </Button>
          </div>
        )}
      </div>

      {/* ── Detail Sheet ─────────────────────────────────────────────────── */}
      <Sheet open={!!selectedSub} onOpenChange={(open) => !open && setSelectedSub(null)}>
        <SheetContent className="w-[400px] sm:w-[540px] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Detalhes do Inscrito</SheetTitle>
            <SheetDescription>
              Dados completos armazenados no banco
            </SheetDescription>
          </SheetHeader>
          {selectedSub && (
            <div className="mt-6 space-y-4">
              <DetailRow label="Email" value={selectedSub.email} />
              <DetailRow label="Nome" value={selectedSub.name || '(não informado)'} />
              <DetailRow label="WhatsApp" value={selectedSub.whatsapp ? formatPhone(selectedSub.whatsapp) : '(não informado)'} />
              <DetailRow label="Origem" value={<SourceBadge source={selectedSub.source} />} />
              <DetailRow label="Data de Inscrição" value={selectedSub.subscribedAt ? new Date(selectedSub.subscribedAt).toLocaleString('pt-BR') : '—'} />
              {selectedSub.updatedAt && <DetailRow label="Última Atualização" value={new Date(selectedSub.updatedAt).toLocaleString('pt-BR')} />}
              {selectedSub.unsubscribedAt && <DetailRow label="Data Cancelamento" value={new Date(selectedSub.unsubscribedAt).toLocaleString('pt-BR')} />}
              <DetailRow
                label="Status"
                value={
                  selectedSub.active !== false
                    ? <Badge className="bg-green-50 text-green-700 border-green-200">Ativo</Badge>
                    : <Badge variant="outline" className="text-red-600 border-red-200">Cancelado</Badge>
                }
              />

              <div className="pt-4 border-t border-border">
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2">JSON Raw</p>
                <div className="bg-muted p-4 rounded-lg overflow-x-auto">
                  <pre className="text-xs font-mono whitespace-pre-wrap text-muted-foreground">
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

// ── Helpers ──────────────────────────────────────────────────────────────────

function StatCard({
  icon, label, value, loading, accent, detail
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  loading?: boolean;
  accent?: 'green' | 'blue' | 'purple';
  detail?: string;
}) {
  const accentBg = accent === 'green' ? 'bg-green-50' : accent === 'blue' ? 'bg-blue-50' : accent === 'purple' ? 'bg-purple-50' : 'bg-primary/5';
  return (
    <div className="bg-card rounded-xl border border-border p-4 shadow-sm">
      <div className="flex items-center gap-3 mb-3">
        <div className={`w-10 h-10 rounded-xl ${accentBg} flex items-center justify-center`}>
          {icon}
        </div>
        <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider leading-tight">{label}</span>
      </div>
      {loading ? (
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      ) : (
        <>
          <p className="text-2xl font-bold text-foreground tracking-tight">{value}</p>
          {detail && <p className="text-[10px] text-muted-foreground mt-1 truncate">{detail}</p>}
        </>
      )}
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">{label}</span>
      <span className="text-sm text-foreground">{value}</span>
    </div>
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