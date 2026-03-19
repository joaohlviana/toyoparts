// ─── Coupons Admin Page ───────────────────────────────────────────────────────
// CRUD completo de cupons: listagem, criação, edição, toggle ativo/inativo.

import React, { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import {
  Tag, Plus, Pencil, Trash2, ToggleLeft, ToggleRight,
  Loader2, Search, AlertCircle, CheckCircle2,
  Percent, DollarSign, Truck, Sparkles, ChevronDown,
  BarChart2, X, Calendar, RefreshCw,
} from 'lucide-react';
import { projectId, publicAnonKey } from '../../../../utils/supabase/info';

const API = `https://${projectId}.supabase.co/functions/v1/make-server-1d6e33e0/coupons`;
const H: HeadersInit = { 'Content-Type': 'application/json', Authorization: `Bearer ${publicAnonKey}` };

// ─── Types ────────────────────────────────────────────────────────────────────
interface Coupon {
  code:             string;
  type:             'percent' | 'fixed' | 'free_shipping' | 'combo';
  value:            number;
  freeShipping:     boolean;
  description:      string;
  active:           boolean;
  startsAt:         string | null;
  expiresAt:        string | null;
  usageLimit:       number | null;
  usageCount:       number;
  usageLimitPerUser: number | null;
  minOrderValue:    number | null;
  maxDiscount:      number | null;
  productSkus:      string[];
  categories:       string[];
  createdAt:        string;
}

const EMPTY_FORM: Omit<Coupon, 'usageCount' | 'createdAt'> = {
  code: '', type: 'percent', value: 0, freeShipping: false,
  description: '', active: true, startsAt: null, expiresAt: null,
  usageLimit: null, usageLimitPerUser: 1, minOrderValue: null, maxDiscount: null,
  productSkus: [], categories: [],
};

// ─── Helpers ─────────────────────────────────────────────────────────────────
function fmtBRL(v: number) { return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }
function fmtDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
}
function couponStatus(c: Coupon): 'active' | 'inactive' | 'expired' | 'exhausted' | 'scheduled' {
  if (!c.active) return 'inactive';
  const now = Date.now();
  if (c.expiresAt && new Date(c.expiresAt).getTime() < now) return 'expired';
  if (c.usageLimit !== null && c.usageCount >= c.usageLimit) return 'exhausted';
  if (c.startsAt && new Date(c.startsAt).getTime() > now) return 'scheduled';
  return 'active';
}

const STATUS_STYLES: Record<string, string> = {
  active:    'bg-green-100 text-green-700 border-green-200',
  inactive:  'bg-slate-100 text-slate-500 border-slate-200',
  expired:   'bg-red-100 text-red-600 border-red-200',
  exhausted: 'bg-orange-100 text-orange-600 border-orange-200',
  scheduled: 'bg-blue-100 text-blue-600 border-blue-200',
};
const STATUS_LABELS: Record<string, string> = {
  active: 'Ativo', inactive: 'Inativo', expired: 'Expirado',
  exhausted: 'Esgotado', scheduled: 'Agendado',
};

const TYPE_ICON: Record<string, React.ReactNode> = {
  percent:      <Percent className="w-3.5 h-3.5" />,
  fixed:        <DollarSign className="w-3.5 h-3.5" />,
  free_shipping: <Truck className="w-3.5 h-3.5" />,
  combo:        <Sparkles className="w-3.5 h-3.5" />,
};
const TYPE_LABELS: Record<string, string> = {
  percent: 'Percentual', fixed: 'Valor fixo',
  free_shipping: 'Frete grátis', combo: 'Combo (% + frete)',
};

// ─── Modal ────────────────────────────────────────────────────────────────────
function CouponModal({
  coupon, onClose, onSaved,
}: { coupon: Coupon | null; onClose: () => void; onSaved: () => void }) {
  const isEdit = !!coupon;
  const [form, setForm] = useState<Omit<Coupon, 'usageCount' | 'createdAt'>>(
    coupon ? { ...coupon } : { ...EMPTY_FORM }
  );
  const [saving, setSaving] = useState(false);
  const [err,    setErr]    = useState('');

  const set = (k: string, v: any) => setForm(prev => ({ ...prev, [k]: v }));

  const handleSubmit = async () => {
    if (!form.code.trim()) { setErr('Código é obrigatório'); return; }
    if (form.type !== 'free_shipping' && form.value <= 0) { setErr('Valor deve ser maior que zero'); return; }
    if (form.startsAt && form.expiresAt && form.startsAt >= form.expiresAt) {
      setErr('Data de início deve ser anterior à expiração'); return;
    }
    setSaving(true); setErr('');
    try {
      const method = isEdit ? 'PUT' : 'POST';
      const url    = isEdit ? `${API}/admin/${form.code}` : `${API}/admin`;
      const res    = await fetch(url, { method, headers: H, body: JSON.stringify(form) });
      const data   = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao salvar');
      toast.success(isEdit ? `Cupom ${form.code} atualizado!` : `Cupom ${form.code} criado!`);
      onSaved();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  };

  const labelCls = 'text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1 block';
  const inputCls = 'w-full h-10 px-3 rounded-xl border border-slate-200 bg-slate-50 text-sm font-medium text-slate-900 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 transition-all';

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-slate-100">
          <h2 className="text-[16px] font-bold text-slate-900">
            {isEdit ? `Editar: ${coupon?.code}` : 'Novo cupom'}
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* Code */}
          {!isEdit && (
            <div>
              <label className={labelCls}>Código do cupom *</label>
              <input
                className={`${inputCls} font-mono font-bold tracking-widest uppercase`}
                value={form.code} placeholder="EX: TOYOTA15"
                onChange={e => set('code', e.target.value.toUpperCase())}
              />
            </div>
          )}

          {/* Description */}
          <div>
            <label className={labelCls}>Descrição</label>
            <input className={inputCls} value={form.description} placeholder="Ex: 15% de desconto em toda a loja"
              onChange={e => set('description', e.target.value)} />
          </div>

          {/* Type */}
          <div>
            <label className={labelCls}>Tipo *</label>
            <select className={inputCls} value={form.type} onChange={e => set('type', e.target.value)}>
              <option value="percent">Percentual (%)</option>
              <option value="fixed">Valor fixo (R$)</option>
              <option value="free_shipping">Frete grátis</option>
              <option value="combo">Combo (% + frete grátis)</option>
            </select>
          </div>

          {/* Value */}
          {form.type !== 'free_shipping' && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>{form.type === 'percent' || form.type === 'combo' ? 'Desconto (%)' : 'Desconto (R$)'} *</label>
                <input type="number" min={0} step={form.type === 'percent' || form.type === 'combo' ? 1 : 0.01}
                  className={inputCls} value={form.value || ''}
                  onChange={e => set('value', parseFloat(e.target.value) || 0)} />
              </div>
              {(form.type === 'percent' || form.type === 'combo') && (
                <div>
                  <label className={labelCls}>Teto de desconto (R$)</label>
                  <input type="number" min={0} step={0.01} placeholder="Sem limite"
                    className={inputCls} value={form.maxDiscount ?? ''}
                    onChange={e => set('maxDiscount', e.target.value ? parseFloat(e.target.value) : null)} />
                </div>
              )}
            </div>
          )}

          {/* Usage limits */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Usos totais</label>
              <input type="number" min={0} step={1} placeholder="Ilimitado"
                className={inputCls} value={form.usageLimit ?? ''}
                onChange={e => set('usageLimit', e.target.value ? parseInt(e.target.value) : null)} />
            </div>
            <div>
              <label className={labelCls}>Usos por usuário</label>
              <input type="number" min={1} step={1} placeholder="Ilimitado"
                className={inputCls} value={form.usageLimitPerUser ?? ''}
                onChange={e => set('usageLimitPerUser', e.target.value ? parseInt(e.target.value) : null)} />
            </div>
          </div>

          {/* Min order */}
          <div>
            <label className={labelCls}>Valor mínimo do pedido (R$)</label>
            <input type="number" min={0} step={0.01} placeholder="Sem mínimo"
              className={inputCls} value={form.minOrderValue ?? ''}
              onChange={e => set('minOrderValue', e.target.value ? parseFloat(e.target.value) : null)} />
          </div>

          {/* Date range */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Válido a partir de</label>
              <input type="datetime-local" className={inputCls}
                value={form.startsAt ? form.startsAt.slice(0, 16) : ''}
                onChange={e => set('startsAt', e.target.value ? new Date(e.target.value).toISOString() : null)} />
            </div>
            <div>
              <label className={labelCls}>Expira em</label>
              <input type="datetime-local" className={inputCls}
                value={form.expiresAt ? form.expiresAt.slice(0, 16) : ''}
                onChange={e => set('expiresAt', e.target.value ? new Date(e.target.value).toISOString() : null)} />
            </div>
          </div>

          {/* Active */}
          <div className="flex items-center justify-between py-2 px-3 bg-slate-50 rounded-xl border border-slate-100">
            <span className="text-sm font-medium text-slate-700">Cupom ativo</span>
            <button
              onClick={() => set('active', !form.active)}
              className={`relative w-11 h-6 rounded-full transition-colors ${form.active ? 'bg-primary' : 'bg-slate-300'}`}
            >
              <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${form.active ? 'translate-x-5' : ''}`} />
            </button>
          </div>

          {err && (
            <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 border border-red-200 rounded-xl px-3 py-2.5">
              <AlertCircle className="w-4 h-4 flex-shrink-0" /> {err}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 pb-5 pt-4 border-t border-slate-100">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-100 transition-colors">
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="px-5 py-2 rounded-xl bg-primary text-white text-sm font-bold hover:bg-primary/90 disabled:opacity-50 transition-colors flex items-center gap-2"
          >
            {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Salvando...</> : isEdit ? 'Salvar alterações' : 'Criar cupom'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export function CouponsAdminPage() {
  const [coupons,  setCoupons]  = useState<Coupon[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [search,   setSearch]   = useState('');
  const [filter,   setFilter]   = useState<string>('all');   // all | active | expired | exhausted | inactive
  const [modal,    setModal]    = useState<'new' | Coupon | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res  = await fetch(`${API}/admin`, { headers: H });
      const data = await res.json();
      setCoupons(data.coupons || []);
    } catch {
      toast.error('Erro ao carregar cupons');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggleActive = async (c: Coupon) => {
    try {
      await fetch(`${API}/admin/${c.code}`, {
        method: 'PUT', headers: H,
        body: JSON.stringify({ active: !c.active }),
      });
      setCoupons(prev => prev.map(x => x.code === c.code ? { ...x, active: !x.active } : x));
      toast.success(`${c.code} ${!c.active ? 'ativado' : 'desativado'}`);
    } catch { toast.error('Erro ao atualizar cupom'); }
  };

  const deleteCoupon = async (code: string) => {
    if (!confirm(`Excluir cupom ${code}? Esta ação não pode ser desfeita.`)) return;
    setDeleting(code);
    try {
      await fetch(`${API}/admin/${code}`, { method: 'DELETE', headers: H });
      setCoupons(prev => prev.filter(c => c.code !== code));
      toast.success(`Cupom ${code} excluído`);
    } catch { toast.error('Erro ao excluir cupom'); }
    finally { setDeleting(null); }
  };

  // ── Stats ────────────────────────────────────────────────────────────────
  const stats = {
    total:    coupons.length,
    active:   coupons.filter(c => couponStatus(c) === 'active').length,
    expired:  coupons.filter(c => couponStatus(c) === 'expired').length,
    exhausted: coupons.filter(c => couponStatus(c) === 'exhausted').length,
  };

  // ── Filtered list ────────────────────────────────────────────────────────
  const displayed = coupons.filter(c => {
    const matchSearch = !search || c.code.includes(search.toUpperCase()) || c.description.toLowerCase().includes(search.toLowerCase());
    const matchFilter = filter === 'all' || couponStatus(c) === filter;
    return matchSearch && matchFilter;
  });

  const formatDiscount = (c: Coupon) => {
    if (c.type === 'free_shipping') return 'Frete grátis';
    if (c.type === 'percent')       return `${c.value}% OFF`;
    if (c.type === 'fixed')         return `${fmtBRL(c.value)} OFF`;
    if (c.type === 'combo')         return `${c.value}% + Frete grátis`;
    return '—';
  };

  return (
    <div className="min-h-full bg-background">
      <div className="max-w-6xl mx-auto px-4 lg:px-8 pt-8 pb-16 space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/8 flex items-center justify-center">
              <Tag className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="text-[20px] font-bold text-foreground">Cupons de Desconto</h1>
              <p className="text-xs text-muted-foreground font-medium">Crie e gerencie códigos promocionais</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={load} className="p-2 rounded-xl hover:bg-secondary transition-colors text-muted-foreground">
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={() => setModal('new')}
              className="flex items-center gap-2 bg-primary text-white px-4 py-2.5 rounded-xl text-sm font-bold hover:bg-primary/90 transition-colors"
            >
              <Plus className="w-4 h-4" /> Novo cupom
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Total', value: stats.total, color: 'text-foreground' },
            { label: 'Ativos',   value: stats.active,    color: 'text-green-600' },
            { label: 'Expirados', value: stats.expired,   color: 'text-red-500' },
            { label: 'Esgotados', value: stats.exhausted, color: 'text-orange-500' },
          ].map(s => (
            <div key={s.label} className="bg-card border border-border rounded-xl px-4 py-3">
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">{s.label}</p>
              <p className={`text-2xl font-black tabular-nums ${s.color}`}>{s.value}</p>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Buscar código..."
              className="w-full h-9 pl-9 pr-3 rounded-xl border border-border bg-background text-sm focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
            />
          </div>
          <div className="flex items-center gap-2">
            {(['all', 'active', 'inactive', 'expired', 'exhausted', 'scheduled'] as const).map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-colors ${
                  filter === f ? 'bg-primary text-white' : 'bg-secondary text-muted-foreground hover:bg-secondary/80'
                }`}
              >
                {f === 'all' ? 'Todos' : STATUS_LABELS[f]}
              </button>
            ))}
          </div>
        </div>

        {/* Table */}
        <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
          {loading ? (
            <div className="flex items-center justify-center p-16 text-muted-foreground">
              <Loader2 className="w-6 h-6 animate-spin mr-3" /> Carregando...
            </div>
          ) : displayed.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-16 text-center">
              <Tag className="w-10 h-10 text-muted-foreground/30 mb-3" />
              <p className="font-semibold text-foreground mb-1">Nenhum cupom encontrado</p>
              <p className="text-sm text-muted-foreground">
                {search || filter !== 'all' ? 'Tente outro filtro' : 'Clique em "Novo cupom" para começar'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    {['Código', 'Tipo / Desconto', 'Uso', 'Validade', 'Valor mínimo', 'Status', ''].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-[10px] font-bold text-muted-foreground uppercase tracking-widest whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {displayed.map((c, i) => {
                    const status = couponStatus(c);
                    const pct    = c.usageLimit ? Math.round(c.usageCount / c.usageLimit * 100) : null;
                    return (
                      <tr key={c.code} className={`border-b border-border last:border-0 hover:bg-muted/20 transition-colors ${i % 2 === 0 ? '' : 'bg-muted/5'}`}>
                        {/* Code */}
                        <td className="px-4 py-3">
                          <span className="font-mono font-bold text-foreground text-[13px] tracking-wider">{c.code}</span>
                          {c.description && <p className="text-[11px] text-muted-foreground mt-0.5 max-w-[150px] truncate">{c.description}</p>}
                        </td>

                        {/* Type + discount */}
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            <span className="text-primary">{TYPE_ICON[c.type]}</span>
                            <span className="font-semibold text-foreground">{formatDiscount(c)}</span>
                          </div>
                          <p className="text-[10px] text-muted-foreground mt-0.5">{TYPE_LABELS[c.type]}</p>
                        </td>

                        {/* Usage */}
                        <td className="px-4 py-3 min-w-[100px]">
                          <div className="flex items-center gap-2 text-[12px] font-medium text-foreground mb-1">
                            <span>{c.usageCount}</span>
                            <span className="text-muted-foreground">/ {c.usageLimit ?? '∞'}</span>
                          </div>
                          {pct !== null && (
                            <div className="w-20 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all ${pct >= 100 ? 'bg-red-400' : pct >= 75 ? 'bg-orange-400' : 'bg-green-400'}`}
                                style={{ width: `${Math.min(pct, 100)}%` }}
                              />
                            </div>
                          )}
                        </td>

                        {/* Validity */}
                        <td className="px-4 py-3 text-[12px] text-muted-foreground whitespace-nowrap">
                          {c.expiresAt
                            ? <span className={new Date(c.expiresAt) < new Date() ? 'text-red-500 font-medium' : ''}>{fmtDate(c.expiresAt)}</span>
                            : <span className="text-slate-400">Sem expiração</span>
                          }
                        </td>

                        {/* Min order */}
                        <td className="px-4 py-3 text-[12px] text-muted-foreground">
                          {c.minOrderValue ? fmtBRL(c.minOrderValue) : '—'}
                        </td>

                        {/* Status */}
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center px-2.5 py-1 rounded-full border text-[10px] font-bold ${STATUS_STYLES[status]}`}>
                            {STATUS_LABELS[status]}
                          </span>
                        </td>

                        {/* Actions */}
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1 justify-end">
                            {/* Toggle active */}
                            <button
                              onClick={() => toggleActive(c)}
                              title={c.active ? 'Desativar' : 'Ativar'}
                              className={`p-1.5 rounded-lg transition-colors ${c.active ? 'text-green-600 hover:bg-green-50' : 'text-slate-400 hover:bg-slate-100'}`}
                            >
                              {c.active ? <ToggleRight className="w-4.5 h-4.5" /> : <ToggleLeft className="w-4.5 h-4.5" />}
                            </button>
                            {/* Edit */}
                            <button
                              onClick={() => setModal(c)}
                              title="Editar"
                              className="p-1.5 rounded-lg text-slate-400 hover:text-primary hover:bg-primary/5 transition-colors"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                            {/* Delete */}
                            <button
                              onClick={() => deleteCoupon(c.code)}
                              disabled={deleting === c.code}
                              title="Excluir"
                              className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-40"
                            >
                              {deleting === c.code
                                ? <Loader2 className="w-4 h-4 animate-spin" />
                                : <Trash2 className="w-4 h-4" />
                              }
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-4 text-[11px] text-muted-foreground">
          {Object.entries(TYPE_LABELS).map(([k, v]) => (
            <span key={k} className="flex items-center gap-1.5">
              <span className="text-primary">{TYPE_ICON[k]}</span> {v}
            </span>
          ))}
        </div>
      </div>

      {/* Modal */}
      {modal !== null && (
        <CouponModal
          coupon={modal === 'new' ? null : modal}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); load(); }}
        />
      )}
    </div>
  );
}
