import React, { useState } from 'react';
import {
  Rocket, CheckCircle2, Circle, Clock, AlertTriangle, ArrowRight,
  Globe, BarChart3, Zap, Shield, Target, Search, FileText, Server,
  Code2, Database, Eye, Share2, CreditCard, Users, TrendingUp,
  ChevronDown, ChevronRight, ExternalLink, Copy, Check, Layers,
  Monitor, Smartphone, Bot, Lock, RefreshCw, Activity, Map
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { cn } from '../../components/ui/utils';

// ─── Types ──────────────────────────────────────────────────────────────────

type TaskStatus = 'done' | 'in_progress' | 'pending' | 'blocked';

interface Task {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  component?: string; // File path
  effort: 'low' | 'medium' | 'high';
  impact: 'low' | 'medium' | 'high' | 'critical';
  tags: string[];
}

interface Phase {
  id: string;
  number: number;
  title: string;
  subtitle: string;
  icon: React.ElementType;
  color: string;
  bgColor: string;
  borderColor: string;
  tasks: Task[];
  objective: string;
  dod: string[]; // Definition of Done
  risks: string[];
}

// ─── Data ───────────────────────────────────────────────────────────────────

const CURRENT_STATE: { label: string; status: 'ok' | 'partial' | 'missing'; detail: string }[] = [
  { label: 'React SPA + React Router', status: 'ok', detail: 'Rotas configuradas: produto, busca, categoria, checkout' },
  { label: 'Supabase Backend (Edge Functions)', status: 'ok', detail: 'Hono server com 20+ rotas (SEO, busca, pagamentos, admin, tracking, sitemap, snapshot)' },
  { label: 'Meilisearch (busca)', status: 'ok', detail: 'Indexado com facets, filtros, busca full-text' },
  { label: 'SEOHead (react-helmet-async)', status: 'ok', detail: 'title, description, canonical, OG, JSON-LD por rota' },
  { label: 'JSON-LD (Product, Breadcrumb, Org)', status: 'ok', detail: 'seo-config.ts com geradores completos' },
  { label: 'Sitemap.xml (basico)', status: 'ok', detail: '/seo/sitemap.xml via Edge Function' },
  { label: 'Sitemap Inteligente (facets)', status: 'ok', detail: 'sitemap-generator.tsx: produtos+categorias+filtros, regra 80%, Top N, estoque, upload Storage' },
  { label: 'Robots.txt', status: 'ok', detail: 'Disallow checkout/admin/utm/fbclid/gclid. Sitemap aponta para Storage.' },
  { label: 'Social Share (WhatsApp/FB)', status: 'ok', detail: '/seo/share/:sku serve HTML para bots' },
  { label: 'HTML Snapshots (Pre-render)', status: 'ok', detail: 'snapshot-generator.tsx: GET /snapshot/product/:sku, invalidacao, batch, cache 24h KV' },
  { label: 'Tracking Server (POST /track)', status: 'ok', detail: 'tracking.tsx: validacao schema, dedupe event_id, idempotencia transaction_id, log KV' },
  { label: 'Purchase Server-Side', status: 'partial', detail: 'POST /purchase-confirmed com idempotencia. Relay Meta CAPI / Google Ads ainda placeholder.' },
  { label: 'Refund Server-Side', status: 'partial', detail: 'POST /tracking/refund implementado. Relay para Meta/Google ainda placeholder.' },
  { label: 'Analytics (attribution ids)', status: 'partial', detail: 'Captura gclid/fbclid/fbp/utm. Falta: analytics.ts client-side com dedupe + session_id UUID.' },
  { label: 'Cloudflare Worker (proxy)', status: 'missing', detail: 'Necessario para servir snapshots no dominio principal. Requer deploy externo.' },
  { label: 'Meta CAPI + Google Enhanced', status: 'missing', detail: 'Relay real para Meta Conversions API e Google Ads API nao implementado' },
  { label: 'Reconciliacao (pedidos vs conversoes)', status: 'missing', detail: 'Sem comparacao automatica' },
];

const PHASES: Phase[] = [
  {
    id: 'phase0',
    number: 0,
    title: 'Diagnostico & Decisoes',
    subtitle: 'Fundacao arquitetural',
    icon: Search,
    color: 'text-slate-700',
    bgColor: 'bg-slate-50',
    borderColor: 'border-slate-200',
    objective: 'Mapear o estado atual, definir decisoes arquiteturais "nao negociaveis", e preparar a base de dados para as fases seguintes.',
    dod: [
      'Mapa completo: rotas SEO vs rotas APP definidas',
      'Contrato de eventos (schema) documentado',
      'Atributos filterableAttributes no Meilisearch validados',
      'Bucket sitemaps criado no Supabase Storage',
      'Decisao: template server-side (sem Playwright)',
    ],
    risks: [
      'Meilisearch pode nao ter brand_slug/model_slug/category_slug configurados',
      'Bucket sitemaps pode nao existir ainda',
    ],
    tasks: [
      {
        id: 't0-1', title: 'Definir rotas SEO vs APP',
        description: 'SEO: /, /produto/*, /pecas/*, /pecas/:modelo/:cat. APP: /checkout/*, /admin/*, /minha-conta/*, /acesso',
        status: 'done', component: '/src/app/routes.tsx',
        effort: 'low', impact: 'critical', tags: ['SEO', 'Arquitetura'],
      },
      {
        id: 't0-2', title: 'Validar filterableAttributes no Meilisearch',
        description: 'Confirmar que brand_slug, model_slug, category_slug, in_stock existem como filterableAttributes. Caso contrario, atualizar via search-ops.',
        status: 'in_progress', component: '/supabase/functions/server/meilisearch.tsx',
        effort: 'medium', impact: 'critical', tags: ['Meilisearch', 'SEO'],
      },
      {
        id: 't0-3', title: 'Criar bucket sitemaps no Storage',
        description: 'Bucket publico make-1d6e33e0-sitemaps criado. Upload com upsert, URL publica via SUPABASE_URL/storage/v1/object/public/...',
        status: 'done', component: '/supabase/functions/server/sitemap-generator.tsx',
        effort: 'low', impact: 'high', tags: ['Storage', 'SEO'],
      },
      {
        id: 't0-4', title: 'Definir contrato de eventos (schema)',
        description: 'Schema implementado no tracking.tsx: event_name, event_id, event_time, session_id, user_id, attribution_ids, consent_flags, ecommerce. Validacao + dedupe + idempotencia por transaction_id.',
        status: 'done', component: '/supabase/functions/server/tracking.tsx',
        effort: 'medium', impact: 'critical', tags: ['Tracking', 'Arquitetura'],
      },
      {
        id: 't0-5', title: 'Definir canonical strategy',
        description: 'Canonical unico por produto (SKU + slug). Categorias: canonical sem filtros. Paginacao: rel=next/prev.',
        status: 'done', component: '/src/app/seo-config.ts',
        effort: 'low', impact: 'high', tags: ['SEO'],
      },
    ],
  },
  {
    id: 'phase1',
    number: 1,
    title: 'Fundamento SEO + Tracking Base',
    subtitle: 'HTML Snapshots + Eventos Client-Side',
    icon: Globe,
    color: 'text-blue-700',
    bgColor: 'bg-blue-50',
    borderColor: 'border-blue-200',
    objective: 'Entregar HTML pronto nas rotas SEO criticas (produto, categoria) via snapshot por template, e implementar tracking client-side com dedupe.',
    dod: [
      'GET /seo/snapshot/:sku retorna HTML completo com title/desc/canonical/OG/JSON-LD',
      'Snapshot gravado no Storage e servido com cache',
      'robots.txt apontando para dominio correto',
      'Sitemap inteligente funcional com invalidacao',
      'Client-side: page_view, view_item, add_to_cart, begin_checkout com event_id unico',
      'Attribution ids persistidos (gclid, fbclid, fbp, fbc, utm)',
    ],
    risks: [
      'Snapshot HTML pode ficar desatualizado se nao invalidar ao mudar preco/estoque',
      'page_view pode duplicar se SPA re-renderizar',
    ],
    tasks: [
      {
        id: 't1-1', title: 'Snapshot Generator (template server-side)',
        description: 'GET /snapshot/product/:sku retorna HTML completo com title, meta, OG, JSON-LD, conteudo acima da dobra. Cache 24h no KV. Endpoints: /snapshot/product/:sku, /snapshot/invalidate, /snapshot/stats, /snapshot/generate-batch.',
        status: 'done', component: '/supabase/functions/server/snapshot-generator.tsx',
        effort: 'high', impact: 'critical', tags: ['SEO', 'Backend', 'Pre-render'],
      },
      {
        id: 't1-2', title: 'Corrigir robots.txt',
        description: 'robots.txt atualizado: Disallow utm/fbclid/gclid, Sitemap aponta para Storage. Regras para bloquear checkout, admin, minha-conta.',
        status: 'done', component: '/supabase/functions/server/seo.tsx',
        effort: 'low', impact: 'high', tags: ['SEO'],
      },
      {
        id: 't1-3', title: 'Tracking client-side com dedupe',
        description: 'Refatorar analytics.ts: gerar event_id unico (UUID) por evento, persistir session_id, implementar lock anti-duplicacao por rota.',
        status: 'pending', component: '/src/app/lib/analytics.ts',
        effort: 'medium', impact: 'high', tags: ['Tracking', 'Frontend'],
      },
      {
        id: 't1-4', title: 'Endpoint POST /track (server relay)',
        description: 'POST /tracking/track implementado: recebe eventos do client, valida schema, deduplicacao por event_id, bloqueia purchase do client (so via webhook), grava log no KV. Relay Meta CAPI / Google ainda placeholder.',
        status: 'done', component: '/supabase/functions/server/tracking.tsx',
        effort: 'high', impact: 'high', tags: ['Tracking', 'Backend'],
      },
      {
        id: 't1-5', title: 'WhatsApp click como micro conversao',
        description: 'Adicionar evento whatsapp_click com attribution ids. Nao otimizar campanha para isso.',
        status: 'pending', component: '/src/app/lib/analytics.ts',
        effort: 'low', impact: 'medium', tags: ['Tracking', 'Growth'],
      },
      {
        id: 't1-6', title: 'Melhorar sitemap com image tags',
        description: 'Adicionar <image:image> com image:loc e image:title para cada produto no sitemap.',
        status: 'done', component: '/supabase/functions/server/seo.tsx',
        effort: 'low', impact: 'medium', tags: ['SEO'],
      },
    ],
  },
  {
    id: 'phase2',
    number: 2,
    title: 'Conversoes Enterprise',
    subtitle: 'Purchase Server-Side + CAPI + Enhanced Conversions',
    icon: Target,
    color: 'text-green-700',
    bgColor: 'bg-green-50',
    borderColor: 'border-green-200',
    objective: 'Implementar Purchase confirmado server-side via webhook do gateway (Asaas), com dedupe perfeito, Meta CAPI e Google Enhanced Conversions.',
    dod: [
      'POST /purchase-confirmed recebe webhook Asaas (paid)',
      'Purchase disparado server-side com dedupe (transaction_id)',
      'Meta CAPI: Purchase enviado com fbp/fbc/event_id',
      'Google Enhanced Conversions: purchase com gclid + user data hash',
      'Idempotencia: mesmo transaction_id nunca gera 2 purchases',
      'Refund/cancel envia evento reverso',
    ],
    risks: [
      'Webhook Asaas pode ter delay ou falhar',
      'Sem retry/outbox, purchase pode ser perdido',
      'Hash de dados first-party exige consentimento',
    ],
    tasks: [
      {
        id: 't2-1', title: 'POST /purchase-confirmed (webhook)',
        description: 'Endpoint implementado: recebe transaction_id/value/items/attribution, idempotencia por transaction_id (KV purchase_sent:), gera purchase event, POST /tracking/refund tambem implementado. Falta: relay real para Meta CAPI e Google Ads.',
        status: 'in_progress', component: '/supabase/functions/server/tracking.tsx',
        effort: 'high', impact: 'critical', tags: ['Tracking', 'Pagamentos', 'Backend'],
      },
      {
        id: 't2-2', title: 'Meta CAPI Integration',
        description: 'Enviar Purchase para Meta Conversions API com event_id, fbp, fbc, user_data hash. Dedupe com pixel client-side.',
        status: 'pending',
        effort: 'high', impact: 'critical', tags: ['Meta', 'CAPI', 'Backend'],
      },
      {
        id: 't2-3', title: 'Google Enhanced Conversions',
        description: 'Enviar purchase para Google Ads com gclid, conversion_action, user data hash (email, phone SHA-256).',
        status: 'pending',
        effort: 'high', impact: 'critical', tags: ['Google', 'Ads', 'Backend'],
      },
      {
        id: 't2-4', title: 'Event Outbox + Retry',
        description: 'Tabela/KV de outbox para eventos pendentes. Reprocessar falhas automaticamente.',
        status: 'pending',
        effort: 'medium', impact: 'high', tags: ['Backend', 'Resiliencia'],
      },
      {
        id: 't2-5', title: 'Refund/Cancel handling',
        description: 'POST /tracking/refund implementado: recebe transaction_id/value/reason, gera evento refund, grava log. Falta relay para Meta/Google.',
        status: 'in_progress',
        effort: 'medium', impact: 'high', tags: ['Tracking', 'Pagamentos'],
      },
    ],
  },
  {
    id: 'phase3',
    number: 3,
    title: 'Invalidacao + Otimizacao',
    subtitle: 'Cache, Purge, Performance',
    icon: RefreshCw,
    color: 'text-amber-700',
    bgColor: 'bg-amber-50',
    borderColor: 'border-amber-200',
    objective: 'Implementar invalidacao automatica de snapshots quando dados mudam, cache agressivo, e Cloudflare Worker como proxy.',
    dod: [
      'Snapshot invalidado automaticamente ao mudar preco/estoque/titulo',
      'Cloudflare Worker roteando rotas SEO para snapshots',
      'Cache-Control configurado (s-maxage=86400, stale-while-revalidate)',
      'Header x-snapshot: HIT|MISS|BYPASS para debug',
      'Normalizar URLs (remover utm, fbclid, gclid) da chave de cache',
    ],
    risks: [
      'Cloudflare Worker e externo ao Figma Make (requer deploy separado)',
      'Invalidacao pode gerar muitos writes se produto muda frequentemente',
    ],
    tasks: [
      {
        id: 't3-1', title: 'POST /snapshot/invalidate',
        description: 'Endpoint implementado em snapshot-generator.tsx: recebe sku ou skus[], deleta cache do KV, opcionalmente regenera. Tambem tem /snapshot/generate-batch para gerar em lote.',
        status: 'done', component: '/supabase/functions/server/snapshot-generator.tsx',
        effort: 'medium', impact: 'high', tags: ['SEO', 'Cache', 'Backend'],
      },
      {
        id: 't3-2', title: 'Cloudflare Worker (reverse proxy)',
        description: 'Worker que detecta rota SEO, busca snapshot do Supabase Storage, serve HTML com cache headers. Fallback para SPA.',
        status: 'pending',
        effort: 'high', impact: 'critical', tags: ['Infra', 'SEO', 'Cloudflare'],
      },
      {
        id: 't3-3', title: 'Trigger de invalidacao ao salvar produto',
        description: 'Ao atualizar preco/estoque/titulo via admin, chamar POST /snapshot/invalidate automaticamente.',
        status: 'pending', component: '/supabase/functions/server/product-admin.tsx',
        effort: 'medium', impact: 'high', tags: ['Backend', 'Cache'],
      },
      {
        id: 't3-4', title: 'QA: View Source mostra conteudo real',
        description: 'Testar que /produto/SKU retorna HTML com title, description, preco, imagem visivel no View Source.',
        status: 'pending',
        effort: 'low', impact: 'critical', tags: ['QA', 'SEO'],
      },
    ],
  },
  {
    id: 'phase4',
    number: 4,
    title: 'Growth & Intelligence',
    subtitle: 'Qualified Leads, Offline Attribution, Dashboards',
    icon: TrendingUp,
    color: 'text-purple-700',
    bgColor: 'bg-purple-50',
    borderColor: 'border-purple-200',
    objective: 'Evoluir para qualified leads, atribuicao offline, reconciliacao automatica, A/B testing de landing pages, e dashboards de performance.',
    dod: [
      'Qualified Lead definido e rastreado (WhatsApp conversa iniciada + dados)',
      'Reconciliacao diaria: pedidos pagos vs conversoes enviadas',
      'Dashboard de funil (view -> cart -> checkout -> paid)',
      'Offline Conversions Upload para Meta/Google',
      'Search monetization: termos internos com alta intencao de compra',
    ],
    risks: [
      'Qualified Lead precisa de definicao objetiva do negocio',
      'Offline Conversions Upload requer acesso API do Meta/Google',
    ],
    tasks: [
      {
        id: 't4-1', title: 'Qualified Lead tracking',
        description: 'Definir criterio (ex: WhatsApp conversa + nome + email). Rastrear como macro lead.',
        status: 'pending',
        effort: 'medium', impact: 'high', tags: ['Growth', 'Tracking'],
      },
      {
        id: 't4-2', title: 'Reconciliacao automatica',
        description: 'Comparar pedidos paid no KV vs purchase events enviados. Alertar discrepancias.',
        status: 'pending',
        effort: 'high', impact: 'critical', tags: ['QA', 'Observabilidade'],
      },
      {
        id: 't4-3', title: 'Dashboard de funil',
        description: 'Visualizar: view_item -> add_to_cart -> begin_checkout -> purchase. Taxa de conversao por etapa.',
        status: 'pending',
        effort: 'high', impact: 'high', tags: ['Dashboard', 'Growth'],
      },
      {
        id: 't4-4', title: 'Search monetization',
        description: 'Identificar termos de busca internos com alta intencao de compra para criar campanhas e landing pages.',
        status: 'pending',
        effort: 'medium', impact: 'medium', tags: ['Growth', 'Meilisearch'],
      },
      {
        id: 't4-5', title: 'A/B Testing framework',
        description: 'Estrutura basica para testar variantes de landing pages e CTAs.',
        status: 'pending',
        effort: 'high', impact: 'medium', tags: ['Growth', 'Frontend'],
      },
    ],
  },
];

// ─── Status Helpers ─────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<TaskStatus, { label: string; icon: React.ElementType; color: string; bg: string }> = {
  done: { label: 'Concluido', icon: CheckCircle2, color: 'text-green-600', bg: 'bg-green-100' },
  in_progress: { label: 'Em andamento', icon: Clock, color: 'text-blue-600', bg: 'bg-blue-100' },
  pending: { label: 'Pendente', icon: Circle, color: 'text-slate-400', bg: 'bg-slate-100' },
  blocked: { label: 'Bloqueado', icon: AlertTriangle, color: 'text-red-500', bg: 'bg-red-100' },
};

const EFFORT_COLORS = { low: 'bg-green-100 text-green-700', medium: 'bg-yellow-100 text-yellow-700', high: 'bg-red-100 text-red-700' };
const IMPACT_COLORS = { low: 'bg-slate-100 text-slate-600', medium: 'bg-blue-100 text-blue-700', high: 'bg-purple-100 text-purple-700', critical: 'bg-red-100 text-red-700' };

// ─── Components ─────────────────────────────────────────────────────────────

function CurrentStateCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Layers className="w-5 h-5 text-primary" /> Estado Atual do Projeto
        </CardTitle>
        <CardDescription>Analise automatica dos componentes implementados</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {CURRENT_STATE.map((item, i) => (
            <div key={i} className="flex items-start gap-2.5 py-2 px-3 rounded-lg hover:bg-muted/50 transition-colors">
              {item.status === 'ok' && <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />}
              {item.status === 'partial' && <AlertTriangle className="w-4 h-4 text-yellow-500 mt-0.5 shrink-0" />}
              {item.status === 'missing' && <Circle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />}
              <div className="min-w-0">
                <p className="text-xs font-medium text-foreground">{item.label}</p>
                <p className="text-[10px] text-muted-foreground truncate">{item.detail}</p>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function ProgressSummary() {
  const allTasks = PHASES.flatMap(p => p.tasks);
  const done = allTasks.filter(t => t.status === 'done').length;
  const inProgress = allTasks.filter(t => t.status === 'in_progress').length;
  const pending = allTasks.filter(t => t.status === 'pending').length;
  const blocked = allTasks.filter(t => t.status === 'blocked').length;
  const total = allTasks.length;
  const pct = Math.round((done / total) * 100);

  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
      <Card className="p-4">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Progresso Total</p>
        <div className="flex items-baseline gap-2 mt-1">
          <span className="text-2xl font-bold text-foreground">{pct}%</span>
          <span className="text-xs text-muted-foreground">{done}/{total}</span>
        </div>
        <div className="w-full bg-muted rounded-full h-1.5 mt-2">
          <div className="bg-primary h-1.5 rounded-full transition-all" style={{ width: `${pct}%` }} />
        </div>
      </Card>
      {[
        { label: 'Concluidos', count: done, color: 'text-green-600' },
        { label: 'Em Andamento', count: inProgress, color: 'text-blue-600' },
        { label: 'Pendentes', count: pending, color: 'text-slate-500' },
        { label: 'Bloqueados', count: blocked, color: 'text-red-500' },
      ].map(s => (
        <Card key={s.label} className="p-4">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">{s.label}</p>
          <p className={cn('text-2xl font-bold mt-1', s.color)}>{s.count}</p>
        </Card>
      ))}
    </div>
  );
}

function PhaseCard({ phase, isExpanded, onToggle }: { phase: Phase; isExpanded: boolean; onToggle: () => void }) {
  const done = phase.tasks.filter(t => t.status === 'done').length;
  const total = phase.tasks.length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <Card className={cn('overflow-hidden border-l-4', phase.borderColor)}>
      <button
        onClick={onToggle}
        className="w-full text-left"
      >
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center', phase.bgColor)}>
                <phase.icon className={cn('w-5 h-5', phase.color)} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-[10px] font-mono">
                    FASE {phase.number}
                  </Badge>
                  <CardTitle className="text-sm">{phase.title}</CardTitle>
                </div>
                <CardDescription className="text-xs mt-0.5">{phase.subtitle}</CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-right">
                <p className="text-xs font-medium text-foreground">{done}/{total}</p>
                <div className="w-16 bg-muted rounded-full h-1.5 mt-1">
                  <div className={cn('h-1.5 rounded-full transition-all', pct === 100 ? 'bg-green-500' : 'bg-primary')} style={{ width: `${pct}%` }} />
                </div>
              </div>
              {isExpanded ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
            </div>
          </div>
        </CardHeader>
      </button>

      {isExpanded && (
        <CardContent className="pt-0 space-y-4">
          {/* Objective */}
          <div className={cn('p-3 rounded-lg text-xs', phase.bgColor)}>
            <p className={cn('font-semibold mb-1', phase.color)}>Objetivo</p>
            <p className="text-foreground/80">{phase.objective}</p>
          </div>

          {/* Tasks */}
          <div className="space-y-1.5">
            {phase.tasks.map(task => {
              const sc = STATUS_CONFIG[task.status];
              return (
                <div key={task.id} className="flex items-start gap-3 p-3 rounded-lg hover:bg-muted/50 transition-colors border border-transparent hover:border-border">
                  <sc.icon className={cn('w-4 h-4 mt-0.5 shrink-0', sc.color)} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-medium text-foreground">{task.title}</span>
                      <Badge className={cn('text-[9px] h-4', EFFORT_COLORS[task.effort])}>
                        {task.effort === 'low' ? 'Baixo' : task.effort === 'medium' ? 'Medio' : 'Alto'}
                      </Badge>
                      <Badge className={cn('text-[9px] h-4', IMPACT_COLORS[task.impact])}>
                        {task.impact === 'critical' ? 'Critico' : task.impact === 'high' ? 'Alto' : task.impact === 'medium' ? 'Medio' : 'Baixo'}
                      </Badge>
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-0.5 leading-relaxed">{task.description}</p>
                    {task.component && (
                      <code className="text-[9px] text-primary/70 font-mono mt-1 block">{task.component}</code>
                    )}
                    <div className="flex gap-1 mt-1.5">
                      {task.tags.map(tag => (
                        <span key={tag} className="text-[9px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{tag}</span>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Definition of Done */}
          <div className="border-t border-border pt-3">
            <p className="text-xs font-semibold text-foreground mb-2">Definition of Done</p>
            <div className="space-y-1">
              {phase.dod.map((item, i) => (
                <div key={i} className="flex items-start gap-2 text-[10px] text-muted-foreground">
                  <Check className="w-3 h-3 mt-0.5 shrink-0 text-green-400" />
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Risks */}
          {phase.risks.length > 0 && (
            <div className="border-t border-border pt-3">
              <p className="text-xs font-semibold text-foreground mb-2 flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-500" /> Riscos
              </p>
              <div className="space-y-1">
                {phase.risks.map((risk, i) => (
                  <p key={i} className="text-[10px] text-amber-700 bg-amber-50 px-2 py-1 rounded">{risk}</p>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}

function ArchitectureDiagram() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Server className="w-5 h-5 text-primary" /> Arquitetura Enterprise
        </CardTitle>
        <CardDescription>Visao geral do fluxo: Frontend &rarr; Worker &rarr; Supabase</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="bg-slate-950 text-slate-200 font-mono text-[10px] p-4 rounded-xl overflow-x-auto leading-relaxed">
          <pre>{`
  +─────────────────────────────────────────────────────────────────────────+
  |                        DOMINIO PRINCIPAL                               |
  |                    www.toyoparts.com.br                                |
  +────────────────────────────┬────────────────────────────────────────────+
                               |
                    +──────────▼──────────+
                    | CLOUDFLARE WORKER   |
                    |   (reverse proxy)   |
                    +──────────┬──────────+
                               |
              +────────────────┼────────────────+
              |                |                |
     +────────▼────────+  +───▼───────+  +─────▼──────+
     | ROTA SEO        |  | ROTA APP  |  | ROTA API   |
     | /produto/*      |  | /checkout |  | /functions |
     | /pecas/:m/:c    |  | /admin/*  |  | /v1/*      |
     +────────┬────────+  +───┬───────+  +─────┬──────+
              |               |                |
     +────────▼────────+  +───▼───────+  +─────▼──────────────────+
     | SNAPSHOT HTML   |  | SPA BUNDLE|  | SUPABASE EDGE FUNCTIONS|
     | (Storage/R2)    |  | (CDN)     |  |                        |
     | - title/desc    |  |           |  | /seo/* /search/*       |
     | - canonical     |  |           |  | /track  /sitemap/*     |
     | - OG tags       |  |           |  | /checkout/* /asaas/*   |
     | - JSON-LD       |  |           |  | /purchase-confirmed    |
     | - conteudo      |  |           |  +────────┬───────────────+
     | - <script> SPA  |  |           |           |
     +─────────────────+  +-----------+  +────────▼───────────+
                                         | SUPABASE           |
                                         | - Postgres (KV)    |
                                         | - Storage          |
                                         | - Auth             |
                                         +──────┬─────────────+
                                                |
                                         +──────▼─────────────+
                                         | MEILISEARCH        |
                                         | - Busca full-text  |
                                         | - Facets/filtros   |
                                         +────────────────────+

  ── FLUXO DE PURCHASE ──────────────────────────────────────

  [Usuario] -> begin_checkout (client, event_id=X)
     |
  [Asaas]  -> webhook /purchase-confirmed (server, paid=true)
     |
  [Server] -> valida assinatura + transaction_id
     |            |
     |    +───────▼────────+    +──────────────+
     |    | META CAPI      |    | GOOGLE ADS   |
     |    | Purchase       |    | Enhanced     |
     |    | event_id=X     |    | Conversions  |
     |    | fbp/fbc/hash   |    | gclid + hash |
     |    +────────────────+    +──────────────+
     |
  [KV] -> events_outbox (idempotencia por transaction_id)
          `}</pre>
        </div>
      </CardContent>
    </Card>
  );
}

function TechDecisions() {
  const decisions = [
    {
      title: 'Purchase = paid_confirmed (server-side)',
      description: 'O evento Purchase so e valido quando o pagamento esta confirmado via webhook do Asaas. Nunca medir Purchase apenas na pagina de obrigado.',
      icon: Lock,
      color: 'text-red-600',
    },
    {
      title: 'Deduplicacao obrigatoria (event_id + transaction_id)',
      description: 'Todo evento tem event_id unico (UUID). Purchase tem transaction_id. Mesmo evento nunca e enviado 2x.',
      icon: Shield,
      color: 'text-blue-600',
    },
    {
      title: 'Snapshots por Template (sem Playwright)',
      description: 'HTML gerado server-side via template com dados do Postgres/Meili. Mais estavel, barato e rapido que headless browser.',
      icon: Code2,
      color: 'text-green-600',
    },
    {
      title: 'Consent-aware tracking',
      description: 'Todo tracking respeita flags de consentimento (consent_ads, consent_analytics). Nao disparar pixels sem permissao.',
      icon: Eye,
      color: 'text-purple-600',
    },
    {
      title: 'First-party attribution persistence',
      description: 'gclid, fbclid, fbp, fbc, utm persistidos em localStorage/cookie first-party. Nunca depender apenas de parametros URL.',
      icon: Database,
      color: 'text-amber-600',
    },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Shield className="w-5 h-5 text-primary" /> Decisoes Nao Negociaveis
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {decisions.map((d, i) => (
          <div key={i} className="flex items-start gap-3 p-3 rounded-lg border border-border">
            <d.icon className={cn('w-5 h-5 mt-0.5 shrink-0', d.color)} />
            <div>
              <p className="text-xs font-semibold text-foreground">{d.title}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">{d.description}</p>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function EventSchema() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <FileText className="w-5 h-5 text-primary" /> Contrato de Eventos (Schema)
        </CardTitle>
        <CardDescription>Single source of truth para todos os eventos</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="bg-slate-950 text-slate-200 font-mono text-[10px] p-4 rounded-xl overflow-x-auto">
          <pre>{`{
  // ── Obrigatorios ───────────────────────
  "event_name":      "purchase",           // view_item | add_to_cart | begin_checkout | purchase | refund
  "event_id":        "uuid-v4",            // Unico por disparo (dedupe client+server)
  "event_time":      "2026-02-17T10:30:00Z",
  "schema_version":  "1.0",

  // ── Sessao / Usuario ───────────────────
  "session_id":      "uuid-v4",            // sessionStorage (por aba)
  "anonymous_id":    "uuid-v4",            // localStorage (por navegador)
  "user_id":         "canonical_cust_123", // Se logado (Customer ID Canonico)

  // ── Pagina ─────────────────────────────
  "page_url":        "/produto/SKU123/filtro-oleo",
  "page_path":       "/produto/SKU123/filtro-oleo",
  "referrer":        "https://google.com",

  // ── Attribution IDs ────────────────────
  "attribution": {
    "gclid":         "...",
    "gbraid":        "...",
    "wbraid":        "...",
    "fbclid":        "...",
    "fbp":           "fb.1.1234567890.9876543210",
    "fbc":           "fb.1.1234567890.AbCdEfGhIj",
    "utm_source":    "google",
    "utm_medium":    "cpc",
    "utm_campaign":  "pecas-corolla"
  },

  // ── Consent ────────────────────────────
  "consent": {
    "ads":           true,
    "analytics":     true,
    "timestamp":     "2026-02-17T10:00:00Z"
  },

  // ── Ecommerce (quando aplicavel) ───────
  "ecommerce": {
    "currency":      "BRL",
    "value":         299.90,
    "transaction_id":"ORD-2026-00123",     // Obrigatorio em purchase
    "items": [
      {
        "item_id":   "SKU123",
        "name":      "Filtro de Oleo Corolla",
        "price":     49.90,
        "quantity":  2,
        "category":  "Filtros",
        "brand":     "Toyota"
      }
    ]
  }
}`}</pre>
        </div>
      </CardContent>
    </Card>
  );
}

function EventMap() {
  const events = [
    { name: 'page_view', trigger: 'Mudanca de rota (React Router)', dest: 'Meta + Google', crit: 'micro', notes: 'So apos hidratacao, lock anti-duplicacao' },
    { name: 'view_item', trigger: 'Pagina de produto carregada', dest: 'Meta + Google', crit: 'micro', notes: 'SKU, preco, nome, categoria' },
    { name: 'add_to_cart', trigger: 'Click "Adicionar ao carrinho"', dest: 'Meta + Google', crit: 'macro', notes: 'SKU, qty, value' },
    { name: 'begin_checkout', trigger: 'Inicio do checkout', dest: 'Meta + Google', crit: 'macro', notes: 'Items, total, event_id compartilhado' },
    { name: 'purchase', trigger: 'Webhook Asaas (paid)', dest: 'Meta CAPI + Google', crit: 'CORE', notes: 'SERVER-SIDE. Dedupe por transaction_id. NUNCA client-only.' },
    { name: 'refund', trigger: 'Webhook Asaas (refunded)', dest: 'Meta CAPI + Google', crit: 'CORE', notes: 'Reverte purchase. Protege ROAS.' },
    { name: 'whatsapp_click', trigger: 'Click botao WhatsApp', dest: 'Meta + Google', crit: 'micro', notes: 'Micro conversao. NAO otimizar campanha para isso.' },
    { name: 'search_performed', trigger: 'Busca executada', dest: 'Internal + Meta', crit: 'micro', notes: 'Termo, resultados, zero_results flag' },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Activity className="w-5 h-5 text-primary" /> Mapa de Eventos
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-[10px]">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-2 px-2 font-medium text-muted-foreground">Evento</th>
                <th className="text-left py-2 px-2 font-medium text-muted-foreground">Trigger</th>
                <th className="text-left py-2 px-2 font-medium text-muted-foreground">Destino</th>
                <th className="text-left py-2 px-2 font-medium text-muted-foreground">Nivel</th>
                <th className="text-left py-2 px-2 font-medium text-muted-foreground">Notas</th>
              </tr>
            </thead>
            <tbody>
              {events.map(e => (
                <tr key={e.name} className="border-b border-border/50 hover:bg-muted/30">
                  <td className="py-2 px-2 font-mono font-bold text-foreground">{e.name}</td>
                  <td className="py-2 px-2 text-muted-foreground">{e.trigger}</td>
                  <td className="py-2 px-2 text-muted-foreground">{e.dest}</td>
                  <td className="py-2 px-2">
                    <Badge className={cn('text-[8px]',
                      e.crit === 'CORE' ? 'bg-red-100 text-red-700' :
                      e.crit === 'macro' ? 'bg-purple-100 text-purple-700' :
                      'bg-slate-100 text-slate-600'
                    )}>
                      {e.crit}
                    </Badge>
                  </td>
                  <td className="py-2 px-2 text-muted-foreground max-w-[200px]">{e.notes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────

export function GrowthPlan() {
  const [expandedPhases, setExpandedPhases] = useState<string[]>(['phase0', 'phase1']);
  const [activeTab, setActiveTab] = useState<'roadmap' | 'architecture' | 'events'>('roadmap');

  const togglePhase = (id: string) => {
    setExpandedPhases(prev =>
      prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]
    );
  };

  return (
    <div className="max-w-[1280px] mx-auto px-4 lg:px-6 pt-6 pb-12">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-foreground flex items-center gap-2">
          <Rocket className="w-5 h-5 text-primary" /> Plano Estrategico — SEO + Conversoes Enterprise
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Roadmap completo para atingir SEO nivel Next.js + Maquina de Conversoes (Google Ads + Meta) sem sair do React SPA + Supabase.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 mb-6 border-b border-border">
        {[
          { id: 'roadmap' as const, label: 'Roadmap por Fases', icon: Map },
          { id: 'architecture' as const, label: 'Arquitetura', icon: Server },
          { id: 'events' as const, label: 'Eventos & Schema', icon: Activity },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              'flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px',
              activeTab === tab.id
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            <tab.icon className="w-4 h-4" /> {tab.label}
          </button>
        ))}
      </div>

      {/* Roadmap Tab */}
      {activeTab === 'roadmap' && (
        <div className="space-y-6">
          <ProgressSummary />
          <CurrentStateCard />
          <TechDecisions />
          <div className="space-y-4">
            <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Layers className="w-4 h-4 text-primary" /> Fases de Implementacao
            </h2>
            {PHASES.map(phase => (
              <PhaseCard
                key={phase.id}
                phase={phase}
                isExpanded={expandedPhases.includes(phase.id)}
                onToggle={() => togglePhase(phase.id)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Architecture Tab */}
      {activeTab === 'architecture' && (
        <div className="space-y-6">
          <ArchitectureDiagram />
          <TechDecisions />
        </div>
      )}

      {/* Events Tab */}
      {activeTab === 'events' && (
        <div className="space-y-6">
          <EventSchema />
          <EventMap />
        </div>
      )}
    </div>
  );
}