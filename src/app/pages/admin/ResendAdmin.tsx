// ─── Resend Admin Panel ────────────────────────────────────────────────────────
// Configuração do Resend, editor HTML de templates e envio de e-mail de teste

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Mail, Settings, Send, CheckCircle2, XCircle, Loader2, RefreshCw,
  ChevronRight, Code2, Eye, Copy, RotateCcw, Save, Zap,
  Shield, Sparkles, Package, Truck, Bell, Star, AlertTriangle,
  ExternalLink, Info, ToggleLeft, ToggleRight
} from 'lucide-react';
import { toast } from 'sonner';
import { projectId, publicAnonKey } from '../../../../utils/supabase/info';

const API = `https://${projectId}.supabase.co/functions/v1/make-server-1d6e33e0/resend`;
const H: HeadersInit = {
  Authorization: `Bearer ${publicAnonKey}`,
  'Content-Type': 'application/json',
};

// ─── Types ─────────────────────────────────────────────────────────────────────
interface ResendConfig {
  from_email: string;
  from_name: string;
  magic_link_enabled: boolean;
  api_key_configured: boolean;
}

interface TemplateMeta {
  id: string;
  name: string;
  description: string;
  category: string;
  subject: string;
  customized: boolean;
  updated_at: string | null;
  placeholders?: { key: string; desc: string }[];
}

interface TemplateDetail extends TemplateMeta {
  html: string;
}

// ─── Category colors ───────────────────────────────────────────────────────────
const CATEGORY_CONFIG: Record<string, { color: string; icon: React.FC<any> }> = {
  'Autenticação': { color: 'bg-purple-100 text-purple-700 border-purple-200', icon: Shield },
  'Pedidos': { color: 'bg-blue-100 text-blue-700 border-blue-200', icon: Package },
  'Marketing': { color: 'bg-orange-100 text-orange-700 border-orange-200', icon: Star },
};

// ─── Template Icons ────────────────────────────────────────────────────────────
const TEMPLATE_ICONS: Record<string, React.FC<any>> = {
  magic_link: Zap,
  order_confirmation: CheckCircle2,
  order_shipped: Truck,
  order_delivered: Bell,
  welcome_newsletter: Sparkles,
  password_recovery: Shield,
};

// ─── Main Component ────────────────────────────────────────────────────────────
export function ResendAdmin() {
  const [activeTab, setActiveTab] = useState<'config' | 'templates'>('config');

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-[1200px] mx-auto px-4 lg:px-8 pt-6 pb-16">
        {/* Header */}
        <div className="flex items-start gap-4 mb-8">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#EB0A1E] to-[#c00018] flex items-center justify-center shrink-0 shadow-md">
            <Mail className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground tracking-tight">E-mails Transacionais</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Configure o Resend, edite templates HTML e gerencie os e-mails enviados pela Toyoparts</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 p-1 bg-muted rounded-xl mb-8 w-fit">
          {[
            { id: 'config', label: 'Configurações', icon: Settings },
            { id: 'templates', label: 'Templates de E-mail', icon: Mail },
          ].map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id as any)}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                activeTab === id
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </div>

        {activeTab === 'config' && <ConfigTab />}
        {activeTab === 'templates' && <TemplatesTab />}
      </div>
    </div>
  );
}

// ─── Config Tab ────────────────────────────────────────────────────────────────
function ConfigTab() {
  const [config, setConfig] = useState<ResendConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ from_name: '', from_email: '', magic_link_enabled: false });
  const [testEmail, setTestEmail] = useState('');
  const [testLoading, setTestLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/config`, { headers: H });
      const data = await res.json();
      setConfig(data);
      setForm({
        from_name: data.from_name,
        from_email: data.from_email,
        magic_link_enabled: data.magic_link_enabled,
      });
    } catch (e: any) {
      console.error('[ResendAdmin] load config error:', e);
      toast.error('Erro ao carregar configurações');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch(`${API}/config`, {
        method: 'POST',
        headers: H,
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error(await res.text());
      toast.success('Configurações salvas com sucesso!');
      load();
    } catch (e: any) {
      console.error('[ResendAdmin] save config error:', e);
      toast.error('Erro ao salvar: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  const sendTest = async () => {
    if (!testEmail) return toast.error('Digite um e-mail para o teste');
    setTestLoading(true);
    try {
      const res = await fetch(`${API}/test`, {
        method: 'POST',
        headers: H,
        body: JSON.stringify({ to: testEmail }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro desconhecido');
      toast.success(`E-mail de teste enviado! ID: ${data.id}`);
    } catch (e: any) {
      console.error('[ResendAdmin] send test error:', e);
      const msg: string = e.message || '';
      if (msg.toLowerCase().includes('domain') && msg.toLowerCase().includes('not verified')) {
        toast.error(
          <span>
            Domínio não verificado no Resend.{' '}
            <a
              href="https://resend.com/domains"
              target="_blank"
              rel="noopener noreferrer"
              className="underline font-bold"
            >
              Verificar domínio →
            </a>
          </span>
        );
      } else {
        toast.error('Falha no envio: ' + msg);
      }
    } finally {
      setTestLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Left col */}
      <div className="lg:col-span-2 space-y-6">

        {/* API Status Card */}
        <div className={`rounded-2xl border p-6 flex items-start gap-4 ${
          config?.api_key_configured
            ? 'bg-green-50 border-green-200'
            : 'bg-amber-50 border-amber-200'
        }`}>
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
            config?.api_key_configured ? 'bg-green-500' : 'bg-amber-500'
          }`}>
            {config?.api_key_configured
              ? <CheckCircle2 className="w-5 h-5 text-white" />
              : <AlertTriangle className="w-5 h-5 text-white" />
            }
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h3 className={`font-bold ${config?.api_key_configured ? 'text-green-800' : 'text-amber-800'}`}>
                {config?.api_key_configured ? 'API Key Configurada' : 'API Key Não Encontrada'}
              </h3>
              <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                config?.api_key_configured ? 'bg-green-200 text-green-700' : 'bg-amber-200 text-amber-700'
              }`}>
                {config?.api_key_configured ? 'ATIVO' : 'INATIVO'}
              </span>
            </div>
            <p className={`text-sm ${config?.api_key_configured ? 'text-green-700' : 'text-amber-700'}`}>
              {config?.api_key_configured
                ? 'A variável RESEND_API está configurada no ambiente Supabase. O serviço está pronto para enviar e-mails.'
                : 'A variável RESEND_API não foi encontrada. Adicione sua API Key nas secrets do Supabase para habilitar o serviço.'
              }
            </p>
            {!config?.api_key_configured && (
              <a
                href="https://supabase.com/dashboard/project/hkxjnykrnhjtkkabgece/functions/secrets"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 mt-3 text-sm font-semibold text-amber-700 hover:text-amber-900 underline underline-offset-2"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                Abrir Secrets do Supabase
              </a>
            )}
          </div>
        </div>

        {/* Domain Verification Banner */}
        <div className="rounded-2xl border border-amber-300 bg-amber-50 p-5 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-amber-800 mb-1">Domínio remetente precisa estar verificado no Resend</p>
            <p className="text-xs text-amber-700 leading-relaxed">
              Para enviar e-mails com <code className="bg-amber-100 px-1 rounded font-mono">@toyoparts.com.br</code>, acesse o painel do Resend,
              adicione o domínio <strong>toyoparts.com.br</strong> e configure os registros DNS indicados (SPF, DKIM e DMARC).
              Enquanto o domínio não estiver verificado, o sistema usará automaticamente <code className="bg-amber-100 px-1 rounded font-mono">onboarding@resend.dev</code> como remetente de fallback.
            </p>
            <a
              href="https://resend.com/domains"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 mt-2.5 text-xs font-bold text-amber-800 hover:text-amber-950 underline underline-offset-2"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Abrir resend.com/domains para verificar
            </a>
          </div>
        </div>

        {/* Sender Settings */}
        <div className="bg-card rounded-2xl border border-border p-6">
          <h3 className="font-bold text-foreground mb-1">Configurações do Remetente</h3>
          <p className="text-sm text-muted-foreground mb-6">Define o nome e endereço que aparecerão como remetente em todos os e-mails</p>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-foreground mb-1.5">Nome do Remetente</label>
              <input
                type="text"
                value={form.from_name}
                onChange={e => setForm(f => ({ ...f, from_name: e.target.value }))}
                placeholder="Toyoparts"
                className="w-full h-10 px-3 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors"
              />
              <p className="text-xs text-muted-foreground mt-1">Ex: "Toyoparts" ou "Toyoparts - Peças Toyota"</p>
            </div>

            <div>
              <label className="block text-sm font-semibold text-foreground mb-1.5">E-mail do Remetente</label>
              <input
                type="email"
                value={form.from_email}
                onChange={e => setForm(f => ({ ...f, from_email: e.target.value }))}
                placeholder="noreply@toyoparts.com.br"
                className="w-full h-10 px-3 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors"
              />
              <p className="text-xs text-muted-foreground mt-1">Precisa ser um domínio verificado no Resend. Domínio atual: <strong>toyoparts.com.br</strong></p>
            </div>
          </div>
        </div>

        {/* Magic Link via Resend */}
        <div className="bg-card rounded-2xl border border-border p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <Zap className="w-4 h-4 text-purple-500" />
                <h3 className="font-bold text-foreground">Magic Link via Resend</h3>
              </div>
              <p className="text-sm text-muted-foreground">
                Quando ativado, o e-mail de login (magic link) será enviado pelo Resend usando o template customizado ao invés do e-mail padrão do Supabase. O link gerado ainda é válido para autenticação.
              </p>
              {form.magic_link_enabled && !config?.api_key_configured && (
                <div className="mt-3 flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  Ative depois de configurar a API Key do Resend
                </div>
              )}
            </div>
            <button
              onClick={() => setForm(f => ({ ...f, magic_link_enabled: !f.magic_link_enabled }))}
              className="shrink-0 mt-0.5"
            >
              {form.magic_link_enabled
                ? <ToggleRight className="w-10 h-10 text-primary" />
                : <ToggleLeft className="w-10 h-10 text-muted-foreground" />
              }
            </button>
          </div>
        </div>

        {/* Save Button */}
        <div className="flex justify-end">
          <button
            onClick={save}
            disabled={saving}
            className="flex items-center gap-2 px-6 py-2.5 bg-primary text-white rounded-xl font-semibold text-sm hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {saving ? 'Salvando...' : 'Salvar Configurações'}
          </button>
        </div>
      </div>

      {/* Right col */}
      <div className="space-y-6">
        {/* Test Email */}
        <div className="bg-card rounded-2xl border border-border p-6">
          <div className="flex items-center gap-2 mb-1">
            <Send className="w-4 h-4 text-primary" />
            <h3 className="font-bold text-foreground">Enviar E-mail de Teste</h3>
          </div>
          <p className="text-sm text-muted-foreground mb-5">Verifica se o Resend está funcionando corretamente enviando um e-mail de diagnóstico</p>

          <div className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Destinatário</label>
              <input
                type="email"
                value={testEmail}
                onChange={e => setTestEmail(e.target.value)}
                placeholder="seu@email.com"
                className="w-full h-10 px-3 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors"
              />
            </div>
            <button
              onClick={sendTest}
              disabled={testLoading || !config?.api_key_configured}
              className="w-full flex items-center justify-center gap-2 py-2.5 bg-foreground text-background rounded-xl font-semibold text-sm hover:bg-foreground/90 disabled:opacity-40 transition-colors"
            >
              {testLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              {testLoading ? 'Enviando...' : 'Enviar Teste'}
            </button>
            {!config?.api_key_configured && (
              <p className="text-xs text-muted-foreground text-center">Configure a API Key primeiro</p>
            )}
          </div>
        </div>

        {/* Info Card */}
        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <Info className="w-4 h-4 text-blue-600 shrink-0" />
            <span className="text-sm font-bold text-blue-800">Sobre o Resend</span>
          </div>
          <ul className="space-y-2 text-xs text-blue-700">
            <li>• Plataforma de e-mails transacionais com alta entregabilidade</li>
            <li>• Templates HTML personalizáveis por tipo de e-mail</li>
            <li>• A API Key está em: <code className="bg-blue-100 px-1 rounded font-mono">RESEND_API</code></li>
            <li>• O domínio remetente precisa ser verificado no Resend</li>
          </ul>
          <a
            href="https://resend.com/docs"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 mt-3 text-xs font-semibold text-blue-700 hover:text-blue-900 underline"
          >
            Documentação Resend <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </div>
    </div>
  );
}

// ─── Templates Tab ─────────────────────────────────────────────────────────────
function TemplatesTab() {
  const [templates, setTemplates] = useState<TemplateMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<TemplateDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [editorTab, setEditorTab] = useState<'html' | 'preview'>('html');
  const [editedHtml, setEditedHtml] = useState('');
  const [editedSubject, setEditedSubject] = useState('');
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const previewRef = useRef<HTMLIFrameElement>(null);

  const loadTemplates = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/templates`, { headers: H });
      const data = await res.json();
      setTemplates(data.templates || []);
      if (!selected && data.templates?.length) {
        setSelected(data.templates[0].id);
      }
    } catch (e: any) {
      console.error('[ResendAdmin] loadTemplates error:', e);
      toast.error('Erro ao carregar templates');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadTemplates(); }, [loadTemplates]);

  useEffect(() => {
    if (!selected) return;
    setLoadingDetail(true);
    setDetail(null);
    fetch(`${API}/templates/${selected}`, { headers: H })
      .then(r => r.json())
      .then(data => {
        setDetail(data);
        setEditedHtml(data.html || '');
        setEditedSubject(data.subject || '');
        setEditorTab('html');
      })
      .catch(e => {
        console.error('[ResendAdmin] loadDetail error:', e);
        toast.error('Erro ao carregar template');
      })
      .finally(() => setLoadingDetail(false));
  }, [selected]);

  // Update preview iframe when html changes or tab switches
  useEffect(() => {
    if (editorTab === 'preview' && previewRef.current) {
      const doc = previewRef.current.contentDocument;
      if (doc) {
        doc.open();
        doc.write(editedHtml);
        doc.close();
      }
    }
  }, [editorTab, editedHtml]);

  const save = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      const res = await fetch(`${API}/templates/${selected}`, {
        method: 'POST',
        headers: H,
        body: JSON.stringify({ html: editedHtml, subject: editedSubject }),
      });
      if (!res.ok) throw new Error(await res.text());
      toast.success('Template salvo com sucesso!');
      loadTemplates();
    } catch (e: any) {
      console.error('[ResendAdmin] save template error:', e);
      toast.error('Erro ao salvar: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  const reset = async () => {
    if (!selected) return;
    if (!confirm('Tem certeza? O template voltará ao HTML padrão da Toyoparts.')) return;
    setResetting(true);
    try {
      const res = await fetch(`${API}/templates/${selected}`, { method: 'DELETE', headers: H });
      if (!res.ok) throw new Error(await res.text());
      toast.success('Template resetado para o padrão');
      // Reload detail
      const res2 = await fetch(`${API}/templates/${selected}`, { headers: H });
      const data = await res2.json();
      setDetail(data);
      setEditedHtml(data.html || '');
      setEditedSubject(data.subject || '');
      loadTemplates();
    } catch (e: any) {
      console.error('[ResendAdmin] reset template error:', e);
      toast.error('Erro ao resetar: ' + e.message);
    } finally {
      setResetting(false);
    }
  };

  const copyPlaceholder = (key: string) => {
    navigator.clipboard.writeText(key).then(() => toast.success(`Copiado: ${key}`));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const selectedTemplate = templates.find(t => t.id === selected);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6 min-h-[70vh]">
      {/* Template List */}
      <div className="bg-card rounded-2xl border border-border overflow-hidden">
        <div className="p-4 border-b border-border">
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Templates ({templates.length})</p>
        </div>
        <div className="divide-y divide-border">
          {templates.map(template => {
            const Icon = TEMPLATE_ICONS[template.id] || Mail;
            const catCfg = CATEGORY_CONFIG[template.category] || { color: 'bg-gray-100 text-gray-700 border-gray-200', icon: Mail };

            return (
              <button
                key={template.id}
                onClick={() => setSelected(template.id)}
                className={`w-full flex items-start gap-3 p-4 text-left hover:bg-muted/40 transition-colors ${
                  selected === template.id ? 'bg-primary/5 border-r-2 border-r-primary' : ''
                }`}
              >
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
                  selected === template.id ? 'bg-primary/10' : 'bg-muted'
                }`}>
                  <Icon className={`w-4 h-4 ${selected === template.id ? 'text-primary' : 'text-muted-foreground'}`} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className={`text-sm font-semibold truncate ${selected === template.id ? 'text-primary' : 'text-foreground'}`}>
                    {template.name}
                  </p>
                  <div className="flex items-center gap-1.5 mt-1">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-bold uppercase tracking-wider border ${catCfg.color}`}>
                      {template.category}
                    </span>
                    {template.customized && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-md font-bold uppercase tracking-wider bg-amber-100 text-amber-700 border border-amber-200">
                        Custom
                      </span>
                    )}
                  </div>
                </div>
                <ChevronRight className={`w-4 h-4 shrink-0 mt-2 transition-transform ${selected === template.id ? 'text-primary rotate-0' : 'text-muted-foreground'}`} />
              </button>
            );
          })}
        </div>
      </div>

      {/* Editor */}
      <div className="bg-card rounded-2xl border border-border flex flex-col overflow-hidden min-h-[600px]">
        {!selected || !detail ? (
          <div className="flex-1 flex items-center justify-center">
            {loadingDetail ? (
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            ) : (
              <div className="text-center text-muted-foreground">
                <Mail className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p className="text-sm">Selecione um template para editar</p>
              </div>
            )}
          </div>
        ) : (
          <>
            {/* Editor Header */}
            <div className="flex items-center justify-between gap-4 p-5 border-b border-border shrink-0">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-foreground">{detail.name}</h3>
                  {selectedTemplate?.customized && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-semibold border border-amber-200">Customizado</span>
                  )}
                  {!selectedTemplate?.customized && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-semibold">Padrão</span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{detail.description}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={reset}
                  disabled={resetting || !selectedTemplate?.customized}
                  title="Resetar para o padrão"
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-40 transition-colors"
                >
                  {resetting ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
                  Resetar
                </button>
                <button
                  onClick={save}
                  disabled={saving}
                  className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 transition-colors"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  {saving ? 'Salvando...' : 'Salvar'}
                </button>
              </div>
            </div>

            {/* Subject */}
            <div className="px-5 py-4 border-b border-border bg-muted/30 shrink-0">
              <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Assunto do E-mail</label>
              <input
                type="text"
                value={editedSubject}
                onChange={e => setEditedSubject(e.target.value)}
                className="w-full h-9 px-3 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors font-mono"
              />
            </div>

            {/* Placeholders */}
            {detail.placeholders && detail.placeholders.length > 0 && (
              <div className="px-5 py-3 border-b border-border bg-muted/20 shrink-0">
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Variáveis disponíveis <span className="normal-case font-normal">(clique para copiar)</span></p>
                <div className="flex flex-wrap gap-2">
                  {detail.placeholders.map(ph => (
                    <button
                      key={ph.key}
                      onClick={() => copyPlaceholder(ph.key)}
                      title={ph.desc}
                      className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-background border border-border text-xs font-mono text-foreground hover:bg-primary/5 hover:border-primary/30 transition-colors group"
                    >
                      <Copy className="w-3 h-3 text-muted-foreground group-hover:text-primary" />
                      {ph.key}
                      <span className="text-muted-foreground font-sans">— {ph.desc}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Editor/Preview Tabs */}
            <div className="flex gap-1 px-5 pt-4 pb-0 shrink-0">
              {[
                { id: 'html', label: 'Código HTML', icon: Code2 },
                { id: 'preview', label: 'Pré-visualização', icon: Eye },
              ].map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => setEditorTab(id as any)}
                  className={`flex items-center gap-1.5 px-4 py-2 rounded-t-lg text-sm font-semibold border-b-2 transition-colors ${
                    editorTab === id
                      ? 'text-primary border-primary bg-primary/5'
                      : 'text-muted-foreground border-transparent hover:text-foreground'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {label}
                </button>
              ))}
            </div>

            {/* Editor Area */}
            <div className="flex-1 overflow-hidden px-5 pb-5 pt-0 min-h-0">
              {editorTab === 'html' ? (
                <div className="h-full min-h-[400px] rounded-b-xl rounded-tr-xl overflow-hidden border border-border bg-[#1e1e1e]">
                  <div className="flex items-center gap-2 px-4 py-2.5 bg-[#2d2d2d] border-b border-[#404040]">
                    <div className="flex gap-1.5">
                      <div className="w-3 h-3 rounded-full bg-[#ff5f57]" />
                      <div className="w-3 h-3 rounded-full bg-[#febc2e]" />
                      <div className="w-3 h-3 rounded-full bg-[#28c840]" />
                    </div>
                    <span className="text-xs text-[#888] font-mono ml-2">template.html</span>
                    <span className="ml-auto text-xs text-[#666]">{editedHtml.split('\n').length} linhas</span>
                  </div>
                  <textarea
                    value={editedHtml}
                    onChange={e => setEditedHtml(e.target.value)}
                    spellCheck={false}
                    className="w-full bg-transparent text-[#d4d4d4] font-mono text-xs leading-relaxed p-4 resize-none outline-none"
                    style={{
                      height: 'calc(100% - 40px)',
                      minHeight: '360px',
                      tabSize: 2,
                    }}
                    onKeyDown={e => {
                      if (e.key === 'Tab') {
                        e.preventDefault();
                        const start = e.currentTarget.selectionStart;
                        const end = e.currentTarget.selectionEnd;
                        const newVal = editedHtml.substring(0, start) + '  ' + editedHtml.substring(end);
                        setEditedHtml(newVal);
                        setTimeout(() => {
                          e.currentTarget.selectionStart = start + 2;
                          e.currentTarget.selectionEnd = start + 2;
                        }, 0);
                      }
                    }}
                  />
                </div>
              ) : (
                <div className="h-full min-h-[400px] rounded-b-xl rounded-tr-xl border border-border overflow-hidden bg-[#f5f5f7]">
                  <div className="flex items-center gap-3 px-4 py-2.5 bg-[#e8e8e8] border-b border-[#d0d0d0]">
                    <div className="flex gap-1.5">
                      <div className="w-3 h-3 rounded-full bg-[#d0d0d0]" />
                      <div className="w-3 h-3 rounded-full bg-[#d0d0d0]" />
                      <div className="w-3 h-3 rounded-full bg-[#d0d0d0]" />
                    </div>
                    <div className="flex-1 bg-white rounded-md px-3 py-1 text-xs text-[#888] font-mono text-center">
                      Pré-visualização do E-mail
                    </div>
                  </div>
                  <iframe
                    ref={previewRef}
                    sandbox="allow-same-origin"
                    className="w-full border-0"
                    style={{ height: 'calc(100% - 40px)', minHeight: '360px' }}
                    title="Email preview"
                  />
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}