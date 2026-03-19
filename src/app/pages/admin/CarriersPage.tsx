// ─── Carriers Settings Page ──────────────────────────────────────────────────
// CRUD for carrier tracking URLs + Frenet auto-discovery

import React, { useState, useEffect, useCallback } from 'react';
import {
  Truck, Plus, Save, RefreshCw, Loader2, X, Edit3,
  ExternalLink, AlertTriangle, CheckCircle2, Trash2,
  Info, ToggleLeft, ToggleRight, Zap,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { projectId, publicAnonKey } from '../../../../utils/supabase/info';

const API = `https://${projectId}.supabase.co/functions/v1/make-server-1d6e33e0`;
const H = { Authorization: `Bearer ${publicAnonKey}`, 'Content-Type': 'application/json' };

interface Carrier {
  id: string;
  name: string;
  services: string;
  tracking_url: string;
  panel_url: string;
  hint: string;
  keywords: string[];
  active: boolean;
}

const EMPTY_CARRIER: Carrier = {
  id: '', name: '', services: '', tracking_url: '', panel_url: '', hint: '',
  keywords: [], active: true,
};

function validateTrackingUrl(url: string, active: boolean): string | null {
  if (!url && !active) return null;
  if (active && url && !url.includes('{codigo}')) {
    return 'A URL de rastreio deve conter {codigo} (ex: https://tracking.example.com?code={codigo})';
  }
  return null;
}

// ─── Carrier Card ─────────────────────────────────────────────────────────────

function CarrierCard({
  carrier,
  onEdit,
  onToggle,
  onDelete,
}: {
  carrier: Carrier;
  onEdit: (c: Carrier) => void;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const hasTrackingUrl = carrier.tracking_url.includes('{codigo}');
  const isConfigured   = !carrier.active || hasTrackingUrl;

  return (
    <div className={`bg-card rounded-xl border transition-all ${
      carrier.active ? 'border-border' : 'border-border/50 opacity-60'
    }`}>
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
              carrier.active ? 'bg-primary/10' : 'bg-muted'
            }`}>
              <Truck className={`w-5 h-5 ${carrier.active ? 'text-primary' : 'text-muted-foreground'}`} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-foreground">{carrier.name}</h3>
                {carrier.active && !hasTrackingUrl && carrier.tracking_url !== '' && (
                  <span className="flex items-center gap-1 text-[10px] font-medium text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                    <AlertTriangle className="w-3 h-3" /> URL inválida
                  </span>
                )}
                {carrier.active && !carrier.tracking_url && (
                  <span className="flex items-center gap-1 text-[10px] font-medium text-orange-600 bg-orange-50 px-1.5 py-0.5 rounded border border-orange-200">
                    <AlertTriangle className="w-3 h-3" /> Sem URL
                  </span>
                )}
                {carrier.active && hasTrackingUrl && (
                  <span className="flex items-center gap-1 text-[10px] font-medium text-green-600 bg-green-50 px-1.5 py-0.5 rounded border border-green-200">
                    <CheckCircle2 className="w-3 h-3" /> Configurada
                  </span>
                )}
              </div>
              {carrier.services && (
                <p className="text-xs text-muted-foreground mt-0.5">{carrier.services}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              onClick={() => onToggle(carrier.id)}
              className={`p-1.5 rounded-lg transition-colors ${
                carrier.active
                  ? 'text-primary hover:bg-primary/10'
                  : 'text-muted-foreground/40 hover:bg-muted'
              }`}
              title={carrier.active ? 'Desativar' : 'Ativar'}
            >
              {carrier.active
                ? <ToggleRight className="w-5 h-5" />
                : <ToggleLeft className="w-5 h-5" />
              }
            </button>
            <button
              onClick={() => onEdit(carrier)}
              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              title="Editar"
            >
              <Edit3 className="w-4 h-4" />
            </button>
            <button
              onClick={() => onDelete(carrier.id)}
              className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
              title="Remover"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        {carrier.tracking_url && (
          <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
            <span className="font-mono bg-muted px-2 py-0.5 rounded truncate max-w-[240px]">
              {carrier.tracking_url}
            </span>
            {carrier.panel_url && (
              <a
                href={carrier.panel_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-primary hover:underline flex-shrink-0"
              >
                <ExternalLink className="w-3 h-3" /> Painel
              </a>
            )}
          </div>
        )}

        {carrier.keywords?.length > 0 && (
          <div className="flex items-center gap-1.5 mt-2 flex-wrap">
            {carrier.keywords.map(kw => (
              <span key={kw} className="text-[10px] bg-muted px-1.5 py-0.5 rounded font-mono text-muted-foreground">
                {kw}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Edit Modal ───────────────────────────────────────────────────────────────

function CarrierModal({
  carrier,
  onSave,
  onClose,
}: {
  carrier: Carrier;
  onSave: (c: Carrier) => void;
  onClose: () => void;
}) {
  const [form, setForm]       = useState<Carrier>({ ...carrier });
  const [kwInput, setKwInput] = useState(carrier.keywords?.join(', ') || '');
  const [urlError, setUrlError] = useState<string | null>(null);

  const set = (field: keyof Carrier, value: any) => {
    const updated = { ...form, [field]: value };
    setForm(updated);
    if (field === 'tracking_url' || field === 'active') {
      setUrlError(validateTrackingUrl(
        field === 'tracking_url' ? value : updated.tracking_url,
        field === 'active' ? value : updated.active,
      ));
    }
  };

  const handleSave = () => {
    const err = validateTrackingUrl(form.tracking_url, form.active);
    if (err) { setUrlError(err); return; }
    const id = form.id || form.name.toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_');
    onSave({
      ...form,
      id,
      keywords: kwInput.split(',').map(k => k.trim()).filter(Boolean),
    });
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-50 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-0 flex items-center justify-center z-50 p-4">
        <div className="bg-card rounded-2xl border border-border w-full max-w-lg shadow-xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-border">
            <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
              <Truck className="w-4 h-4 text-primary" />
              {carrier.id ? `Editar: ${carrier.name}` : 'Nova Transportadora'}
            </h3>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
              <X className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>

          <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-xs font-semibold text-muted-foreground mb-1 block">Nome *</Label>
                <Input value={form.name} onChange={e => set('name', e.target.value)} placeholder="Ex: Correios" className="h-9" />
              </div>
              <div>
                <Label className="text-xs font-semibold text-muted-foreground mb-1 block">Serviços cobertos</Label>
                <Input value={form.services} onChange={e => set('services', e.target.value)} placeholder="PAC, SEDEX, SEDEX 10" className="h-9" />
              </div>
            </div>

            <div>
              <Label className="text-xs font-semibold text-muted-foreground mb-1 block">
                URL de Rastreio *
                <span className="ml-2 font-normal text-muted-foreground/70">(deve conter {'{codigo}'})</span>
              </Label>
              <Input
                value={form.tracking_url}
                onChange={e => set('tracking_url', e.target.value)}
                placeholder="https://tracking.example.com?code={codigo}"
                className={`h-9 font-mono text-xs ${urlError ? 'border-destructive ring-1 ring-destructive' : ''}`}
              />
              {urlError && (
                <p className="text-xs text-destructive mt-1 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" /> {urlError}
                </p>
              )}
              {form.tracking_url && !urlError && form.tracking_url.includes('{codigo}') && (
                <p className="text-xs text-green-600 mt-1 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" />
                  Preview: {form.tracking_url.replace('{codigo}', 'AA123456789BR')}
                </p>
              )}
            </div>

            <div>
              <Label className="text-xs font-semibold text-muted-foreground mb-1 block">URL do Painel</Label>
              <Input
                value={form.panel_url}
                onChange={e => set('panel_url', e.target.value)}
                placeholder="https://cas.correios.com.br"
                className="h-9 font-mono text-xs"
              />
            </div>

            <div>
              <Label className="text-xs font-semibold text-muted-foreground mb-1 block">
                Dica para o admin
              </Label>
              <textarea
                value={form.hint}
                onChange={e => set('hint', e.target.value)}
                placeholder="Instruções para encontrar o código de rastreio no painel desta transportadora..."
                rows={2}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
              />
            </div>

            <div>
              <Label className="text-xs font-semibold text-muted-foreground mb-1 block">
                Palavras-chave para match
                <span className="ml-2 font-normal text-muted-foreground/70">(separadas por vírgula)</span>
              </Label>
              <Input
                value={kwInput}
                onChange={e => setKwInput(e.target.value)}
                placeholder="correios, pac, sedex"
                className="h-9 font-mono text-xs"
              />
              <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                <Info className="w-3 h-3" />
                Usadas para detectar automaticamente a transportadora pelo nome retornado pelo Frenet.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => set('active', !form.active)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium border transition-all ${
                  form.active
                    ? 'bg-primary/10 border-primary/30 text-primary'
                    : 'bg-muted border-border text-muted-foreground'
                }`}
              >
                {form.active
                  ? <><ToggleRight className="w-4 h-4" /> Ativa</>
                  : <><ToggleLeft className="w-4 h-4" /> Inativa</>
                }
              </button>
              <p className="text-xs text-muted-foreground">
                {form.active ? 'Visível e disponível para matching.' : 'Oculta do matching e do drawer.'}
              </p>
            </div>
          </div>

          <div className="flex gap-2 px-5 py-4 border-t border-border bg-muted/20">
            <Button onClick={handleSave} disabled={!!urlError} className="flex-1 gap-2">
              <Save className="w-4 h-4" /> Salvar
            </Button>
            <Button variant="outline" onClick={onClose}>Cancelar</Button>
          </div>
        </div>
      </div>
    </>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function CarriersPage() {
  const [carriers, setCarriers]   = useState<Carrier[]>([]);
  const [loading, setLoading]     = useState(true);
  const [saving, setSaving]       = useState(false);
  const [syncing, setSyncing]     = useState(false);
  const [editing, setEditing]     = useState<Carrier | null>(null);
  const [syncResult, setSyncResult] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res  = await fetch(`${API}/carriers`, { headers: H });
      const data = await res.json();
      setCarriers(data.carriers || []);
    } catch (e: any) {
      console.error('[CarriersPage] load error:', e);
      toast.error('Erro ao carregar transportadoras');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const save = async (list: Carrier[]) => {
    setSaving(true);
    try {
      const res  = await fetch(`${API}/carriers`, {
        method: 'POST',
        headers: H,
        body: JSON.stringify({ carriers: list }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao salvar');
      setCarriers(data.carriers);
      toast.success('Transportadoras salvas com sucesso!');
    } catch (e: any) {
      console.error('[CarriersPage] save error:', e);
      toast.error('Erro ao salvar: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveCarrier = (updated: Carrier) => {
    const idx = carriers.findIndex(c => c.id === updated.id);
    const newList = idx >= 0
      ? carriers.map(c => c.id === updated.id ? updated : c)
      : [...carriers, updated];
    setEditing(null);
    save(newList);
  };

  const handleToggle = (id: string) => {
    const newList = carriers.map(c => c.id === id ? { ...c, active: !c.active } : c);
    save(newList);
  };

  const handleDelete = (id: string) => {
    if (!confirm('Remover esta transportadora?')) return;
    save(carriers.filter(c => c.id !== id));
  };

  const handleFrenetSync = async () => {
    setSyncing(true);
    setSyncResult(null);
    try {
      const res  = await fetch(`${API}/carriers/frenet-sync`, { headers: H });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro na sincronização');
      const msg = data.added?.length > 0
        ? `${data.added.length} nova(s) transportadora(s) adicionada(s): ${data.added.join(', ')}`
        : `Nenhuma transportadora nova. ${data.frenet_services?.length ?? 0} serviço(s) encontrado(s) no Frenet.`;
      setSyncResult(msg);
      toast.success(msg);
      await load();
    } catch (e: any) {
      console.error('[CarriersPage] Frenet sync error:', e);
      toast.error('Erro na sincronização com Frenet: ' + e.message);
    } finally {
      setSyncing(false);
    }
  };

  const unconfigured = carriers.filter(c => c.active && (!c.tracking_url || !c.tracking_url.includes('{codigo}')));

  return (
    <div className="max-w-[1080px] mx-auto px-4 lg:px-6 pt-6 pb-12 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
            <Truck className="w-5 h-5 text-primary" />
            Transportadoras & Rastreio
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Configure URLs de rastreio e painéis para cada transportadora do Frenet.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleFrenetSync}
            disabled={syncing}
            className="gap-2"
          >
            {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
            Sincronizar do Frenet
          </Button>
          <Button
            size="sm"
            onClick={() => setEditing(EMPTY_CARRIER)}
            className="gap-2"
          >
            <Plus className="w-4 h-4" /> Nova Transportadora
          </Button>
        </div>
      </div>

      {/* Sync result */}
      {syncResult && (
        <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-sm text-green-800">
          <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
          <p>{syncResult}</p>
          <button onClick={() => setSyncResult(null)} className="ml-auto">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Warning: unconfigured active carriers */}
      {unconfigured.length > 0 && (
        <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800">
          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <div>
            <strong>{unconfigured.length} transportadora(s) ativa(s) sem URL de rastreio:</strong>
            {' '}{unconfigured.map(c => c.name).join(', ')}.
            O botão "Rastrear" do cliente não funcionará para esses pedidos.
          </div>
        </div>
      )}

      {/* How it works */}
      <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3">
        <h3 className="text-xs font-semibold text-blue-800 mb-1 flex items-center gap-1.5">
          <Info className="w-3.5 h-3.5" /> Como funciona
        </h3>
        <p className="text-xs text-blue-700 leading-relaxed">
          Quando o admin insere o código de rastreio no drawer de um pedido, o sistema detecta automaticamente
          a transportadora pelo nome retornado pelo Frenet (usando as palavras-chave). A URL de rastreio é
          montada substituindo <code className="bg-blue-100 px-1 rounded font-mono">{'{codigo}'}</code> pelo
          código inserido e enviada por e-mail ao cliente.
        </p>
      </div>

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3">
          {carriers.map(carrier => (
            <CarrierCard
              key={carrier.id}
              carrier={carrier}
              onEdit={setEditing}
              onToggle={handleToggle}
              onDelete={handleDelete}
            />
          ))}
          {carriers.length === 0 && (
            <div className="text-center py-16 text-muted-foreground">
              <Truck className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm font-medium">Nenhuma transportadora configurada.</p>
              <p className="text-xs mt-1">Clique em "Nova Transportadora" ou sincronize do Frenet.</p>
            </div>
          )}
        </div>
      )}

      {/* Edit modal */}
      {editing && (
        <CarrierModal
          carrier={editing}
          onSave={handleSaveCarrier}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
