// ─── Audit Log Page ──────────────────────────────────────────────────────────
// Trilha completa de ações administrativas com filtros, paginação e detalhe.

import React, { useState, useEffect, useCallback } from 'react';
import {
  Shield, Search, RefreshCw, Loader2, ChevronDown, ChevronUp,
  Filter, Calendar, User, Tag, Activity, X, Trash2,
  AlertTriangle, CheckCircle2, Clock,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Badge } from '../../components/ui/badge';
import { projectId, publicAnonKey } from '../../../../utils/supabase/info';

const API = `https://${projectId}.supabase.co/functions/v1/make-server-1d6e33e0`;
const H = { Authorization: `Bearer ${publicAnonKey}`, 'Content-Type': 'application/json' };

// ─── Types ───────────────────────────────────────────────────────────────────

interface AuditEvent {
  id:             string;
  action:         string;
  entity_type:    string;
  entity_id:      string;
  admin_user_id?: string;
  admin_email?:   string;
  before?:        Record<string, unknown>;
  after?:         Record<string, unknown>;
  source:         string;
  created_at:     string;
  correlation_id?: string;
  meta?:          Record<string, unknown>;
}

// ─── Action Category Helpers ─────────────────────────────────────────────────

function actionColor(action: string): string {
  if (action.includes('switch') || action.includes('provider'))  return 'bg-purple-100 text-purple-700 border-purple-200';
  if (action.includes('tracking') || action.includes('email'))   return 'bg-blue-100 text-blue-700 border-blue-200';
  if (action.includes('fulfillment'))                            return 'bg-indigo-100 text-indigo-700 border-indigo-200';
  if (action.includes('carrier'))                                return 'bg-teal-100 text-teal-700 border-teal-200';
  if (action.includes('payment') || action.includes('config'))  return 'bg-amber-100 text-amber-700 border-amber-200';
  if (action.includes('integration') || action.includes('test')) return 'bg-slate-100 text-slate-600 border-slate-200';
  return 'bg-gray-100 text-gray-600 border-gray-200';
}

function sourceIcon(source: string) {
  switch (source) {
    case 'admin_ui': return <User className="w-3 h-3" />;
    case 'webhook':  return <Activity className="w-3 h-3" />;
    case 'system':   return <Shield className="w-3 h-3" />;
    default:         return <Tag className="w-3 h-3" />;
  }
}

const SOURCE_LABELS: Record<string, string> = {
  admin_ui: 'Admin',
  webhook:  'Webhook',
  system:   'Sistema',
  api:      'API',
};

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

function fmtRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1)    return 'agora';
  if (mins < 60)   return `${mins}min atrás`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)    return `${hrs}h atrás`;
  const days = Math.floor(hrs / 24);
  return `${days}d atrás`;
}

// ─── Expandable Event Row ─────────────────────────────────────────────────────

function EventRow({ event }: { event: AuditEvent }) {
  const [expanded, setExpanded] = useState(false);

  const hasDiff = event.before || event.after;

  return (
    <div className={`border border-border rounded-xl overflow-hidden transition-all ${expanded ? 'bg-card' : 'bg-card/60 hover:bg-card'}`}>
      {/* Summary row */}
      <button
        type="button"
        className="w-full flex items-center gap-3 px-4 py-3 text-left"
        onClick={() => setExpanded(!expanded)}
      >
        {/* Action badge */}
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border tracking-wide flex-shrink-0 ${actionColor(event.action)}`}>
          {event.action}
        </span>

        {/* Entity */}
        <span className="text-xs text-muted-foreground flex-shrink-0 hidden md:inline">
          <span className="font-mono bg-muted px-1.5 py-0.5 rounded text-[10px]">
            {event.entity_type}:{event.entity_id.slice(0, 8)}
          </span>
        </span>

        {/* Source */}
        <span className="flex items-center gap-1 text-[11px] text-muted-foreground flex-shrink-0">
          {sourceIcon(event.source)}
          {SOURCE_LABELS[event.source] ?? event.source}
        </span>

        {/* Admin email */}
        {event.admin_email && (
          <span className="text-[11px] text-muted-foreground flex-shrink-0 hidden lg:inline truncate max-w-[160px]">
            {event.admin_email}
          </span>
        )}

        <span className="ml-auto flex items-center gap-2 flex-shrink-0">
          <span className="text-[11px] text-muted-foreground" title={fmtDate(event.created_at)}>
            {fmtRelative(event.created_at)}
          </span>
          {expanded
            ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" />
            : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
          }
        </span>
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-border px-4 pt-3 pb-4 space-y-3 bg-muted/20">
          {/* Timestamp */}
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Calendar className="w-3.5 h-3.5" />
            <span>{fmtDate(event.created_at)}</span>
            {event.correlation_id && (
              <span className="font-mono bg-muted px-1.5 py-0.5 rounded text-[10px] ml-2">
                corr:{event.correlation_id.slice(0, 12)}
              </span>
            )}
          </div>

          {/* Before / After diff */}
          {hasDiff && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {event.before && (
                <div>
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-red-400 inline-block" />
                    Antes
                  </p>
                  <pre className="text-[11px] font-mono bg-background border border-border rounded-lg p-2.5 overflow-x-auto text-foreground whitespace-pre-wrap">
                    {JSON.stringify(event.before, null, 2)}
                  </pre>
                </div>
              )}
              {event.after && (
                <div>
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-green-400 inline-block" />
                    Depois
                  </p>
                  <pre className="text-[11px] font-mono bg-background border border-border rounded-lg p-2.5 overflow-x-auto text-foreground whitespace-pre-wrap">
                    {JSON.stringify(event.after, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}

          {/* Meta */}
          {event.meta && Object.keys(event.meta).length > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Metadata</p>
              <pre className="text-[11px] font-mono bg-background border border-border rounded-lg p-2.5 overflow-x-auto text-muted-foreground whitespace-pre-wrap">
                {JSON.stringify(event.meta, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Stats Bar ────────────────────────────────────────────────────────────────

function StatsBar({ stats }: { stats: any }) {
  if (!stats) return null;
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {[
        { label: 'Total',       value: stats.total,       cls: '' },
        { label: 'Últimos 7d',  value: stats.last_7_days, cls: 'text-primary' },
        { label: 'Ações únicas',value: Object.keys(stats.by_action || {}).length, cls: '' },
        { label: 'Fontes',      value: Object.keys(stats.by_source || {}).length, cls: '' },
      ].map(s => (
        <div key={s.label} className="bg-card border border-border rounded-xl px-4 py-3">
          <p className="text-xs text-muted-foreground mb-1">{s.label}</p>
          <p className={`text-2xl font-bold tabular-nums ${s.cls}`}>{s.value ?? '—'}</p>
        </div>
      ))}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function AuditLogPage() {
  const [events, setEvents]         = useState<AuditEvent[]>([]);
  const [stats, setStats]           = useState<any>(null);
  const [loading, setLoading]       = useState(true);
  const [loadingStats, setLoadingStats] = useState(true);
  const [total, setTotal]           = useState(0);
  const [page, setPage]             = useState(1);
  const [pages, setPages]           = useState(1);

  // Filters
  const [search, setSearch]         = useState('');
  const [filterAction, setFilterAction] = useState('');
  const [filterEntity, setFilterEntity] = useState('');
  const [showFilters, setShowFilters]   = useState(false);

  const loadStats = useCallback(async () => {
    setLoadingStats(true);
    try {
      const res  = await fetch(`${API}/audit/stats`, { headers: H });
      const data = await res.json();
      setStats(data);
    } catch (e) {
      console.error('[AuditLog] stats error:', e);
    } finally {
      setLoadingStats(false);
    }
  }, []);

  const loadEvents = useCallback(async (pg = 1) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(pg) });
      if (search)       params.set('search', search);
      if (filterAction) params.set('action', filterAction);
      if (filterEntity) params.set('entity_type', filterEntity);

      const res  = await fetch(`${API}/audit?${params}`, { headers: H });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao carregar audit log');
      setEvents(data.events || []);
      setTotal(data.total || 0);
      setPage(data.page || 1);
      setPages(data.pages || 1);
    } catch (e: any) {
      console.error('[AuditLog] load error:', e);
      toast.error('Erro ao carregar: ' + e.message);
    } finally {
      setLoading(false);
    }
  }, [search, filterAction, filterEntity]);

  useEffect(() => {
    loadEvents(1);
    loadStats();
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    loadEvents(1);
  };

  const handleCleanup = async () => {
    const cutoff = new Date(Date.now() - 180 * 86400 * 1000).toISOString().slice(0, 10);
    if (!confirm(`Remover eventos anteriores a ${cutoff}? Esta ação é irreversível.`)) return;
    try {
      const res  = await fetch(`${API}/audit/cleanup?before=${cutoff}`, { method: 'DELETE', headers: H });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast.success(`${data.deleted} evento(s) removido(s)`);
      loadEvents(1);
      loadStats();
    } catch (e: any) {
      toast.error('Erro na limpeza: ' + e.message);
    }
  };

  // Unique action and entity values for filter dropdowns (from loaded events)
  const allActions = [...new Set(events.map(e => e.action))].sort();
  const allEntities = [...new Set(events.map(e => e.entity_type))].sort();

  return (
    <div className="max-w-[1200px] mx-auto px-4 lg:px-6 pt-6 pb-12 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
            <Shield className="w-5 h-5 text-primary" />
            Trilha de Auditoria
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Registro completo de ações administrativas e eventos críticos do sistema.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => { loadEvents(1); loadStats(); }}
            disabled={loading}
            className="gap-2"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleCleanup}
            className="gap-2 text-muted-foreground hover:text-destructive"
            title="Remover eventos com mais de 180 dias"
          >
            <Trash2 className="w-4 h-4" />
            Limpar antigos
          </Button>
        </div>
      </div>

      {/* Stats */}
      {loadingStats ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-card border border-border rounded-xl px-4 py-3 animate-pulse h-16" />
          ))}
        </div>
      ) : (
        <StatsBar stats={stats} />
      )}

      {/* Search + Filters */}
      <div className="bg-card border border-border rounded-xl p-4 space-y-3">
        <form onSubmit={handleSearch} className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar por ação, entidade, e-mail..."
              className="pl-10 h-9"
            />
          </div>
          <Button type="submit" size="sm" disabled={loading} className="h-9">
            Buscar
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={`h-9 gap-1.5 ${showFilters ? 'bg-muted' : ''}`}
            onClick={() => setShowFilters(!showFilters)}
          >
            <Filter className="w-3.5 h-3.5" />
            Filtros
          </Button>
        </form>

        {showFilters && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 border-t border-border">
            <div>
              <label className="text-xs font-semibold text-muted-foreground block mb-1">Ação</label>
              <select
                value={filterAction}
                onChange={e => setFilterAction(e.target.value)}
                className="w-full h-9 rounded-lg border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              >
                <option value="">Todas as ações</option>
                {Object.entries({
                  'order.tracking.update':       'Rastreio adicionado',
                  'order.tracking.email_resent': 'E-mail reenviado',
                  'order.fulfillment.update':    'Status de expedição alterado',
                  'payments.provider.switch':    'Gateway trocado',
                  'payments.config.update':      'Config de pagamento',
                  'carriers.config.updated':     'Config de transportadoras',
                  'integration.test':            'Teste de integração',
                }).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground block mb-1">Tipo de entidade</label>
              <select
                value={filterEntity}
                onChange={e => setFilterEntity(e.target.value)}
                className="w-full h-9 rounded-lg border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              >
                <option value="">Todas as entidades</option>
                <option value="order">Pedido</option>
                <option value="carrier_config">Transportadoras</option>
                <option value="payment_config">Pagamentos</option>
                <option value="integration">Integração</option>
              </select>
            </div>
            {(filterAction || filterEntity || search) && (
              <div className="sm:col-span-2 flex justify-end">
                <button
                  type="button"
                  onClick={() => { setFilterAction(''); setFilterEntity(''); setSearch(''); loadEvents(1); }}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  <X className="w-3.5 h-3.5" /> Limpar filtros
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Count */}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{total} evento{total !== 1 ? 's' : ''} encontrado{total !== 1 ? 's' : ''}</span>
        <span>Página {page} de {pages}</span>
      </div>

      {/* Events list */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : events.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
          <Shield className="w-12 h-12 mb-4 opacity-20" />
          <p className="text-sm font-medium">Nenhum evento de auditoria encontrado.</p>
          <p className="text-xs mt-1">
            {search || filterAction || filterEntity
              ? 'Tente ajustar os filtros.'
              : 'Os eventos aparecerão aqui conforme o sistema for utilizado.'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {events.map(event => (
            <EventRow key={event.id} event={event} />
          ))}
        </div>
      )}

      {/* Pagination */}
      {pages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => loadEvents(page - 1)}
            disabled={page <= 1 || loading}
          >
            Anterior
          </Button>
          <span className="text-xs text-muted-foreground px-2">
            {page} / {pages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => loadEvents(page + 1)}
            disabled={page >= pages || loading}
          >
            Próxima
          </Button>
        </div>
      )}

      {/* Retention note */}
      <p className="text-xs text-muted-foreground text-center pb-4">
        Recomendação: manter eventos por 365 dias em produção. Use "Limpar antigos" para remover registros com mais de 180 dias.
      </p>
    </div>
  );
}
