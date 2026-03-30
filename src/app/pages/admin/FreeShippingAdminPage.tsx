import React, { useEffect, useMemo, useState } from 'react';
import {
  Plus,
  Save,
  Copy,
  Trash2,
  Truck,
  MessageCircle,
  Loader2,
  ShieldAlert,
  TestTube2,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../../components/base/button';
import { Input } from '../../components/base/input';
import { Badge } from '../../components/base/badge';
import {
  deleteFreeShippingRule,
  duplicateFreeShippingRule,
  fetchFreeShippingAdmin,
  saveFreeShippingBulk,
  simulateFreeShipping,
  type FreeShippingAdminSnapshot,
  type FreeShippingSimulationContext,
} from '../../lib/shipping/free-shipping-admin';
import type {
  FreeShippingConditionNode,
  FreeShippingGroupNode,
  FreeShippingNode,
  FreeShippingRule,
  FreeShippingServiceMatcher,
  FreeShippingSettings,
  PaymentMethodIntent,
} from '../../lib/shipping/shipping-types';

const UF_OPTIONS = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG',
  'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
];

const REGION_GROUP_OPTIONS = [
  { value: 'norte', label: 'Norte' },
  { value: 'nordeste', label: 'Nordeste' },
  { value: 'centro-oeste', label: 'Centro-Oeste' },
  { value: 'sudeste', label: 'Sudeste' },
  { value: 'sul', label: 'Sul' },
];

const PAYMENT_OPTIONS: Array<{ value: PaymentMethodIntent; label: string }> = [
  { value: 'pix', label: 'PIX' },
  { value: 'credit_card', label: 'Cartao' },
  { value: 'boleto', label: 'Boleto' },
];

const SERVICE_FIELDS: Array<{ value: FreeShippingServiceMatcher['field']; label: string }> = [
  { value: 'serviceDescription', label: 'Nome do servico' },
  { value: 'carrier', label: 'Transportadora' },
  { value: 'serviceCode', label: 'Codigo do servico' },
];

function formatBRL(value: number) {
  return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function parseListValue(raw: string): string[] {
  return Array.from(
    new Set(
      raw
        .split(/[\n,;]/g)
        .map((value) => value.trim())
        .filter(Boolean)
    )
  );
}

function joinListValue(values?: string[]) {
  return (values || []).join(', ');
}

function createCondition(type: FreeShippingConditionNode['type'] = 'subtotal_gte'): FreeShippingConditionNode {
  if (type === 'subtotal_gte' || type === 'subtotal_gt') {
    return { kind: 'condition', id: crypto.randomUUID(), type, value: 299 };
  }

  if (type === 'product_flag') {
    return { kind: 'condition', id: crypto.randomUUID(), type, value: 'frete_gratis' };
  }

  return { kind: 'condition', id: crypto.randomUUID(), type, values: [] };
}

function createGroup(): FreeShippingGroupNode {
  return {
    kind: 'group',
    id: crypto.randomUUID(),
    operator: 'and',
    children: [createCondition()],
  };
}

function createServiceMatcher(): FreeShippingServiceMatcher {
  return {
    id: crypto.randomUUID(),
    field: 'serviceDescription',
    operator: 'contains',
    value: 'PAC',
  };
}

function createRule(): FreeShippingRule {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    name: 'Nova regra de frete gratis',
    enabled: true,
    priority: 100,
    conditionTree: createGroup(),
    action: {
      type: 'site_free_shipping',
      eligibleServices: 'selected',
      serviceMatchers: [createServiceMatcher()],
    },
    createdAt: now,
    updatedAt: now,
  };
}

function mapNode(node: FreeShippingNode, nodeId: string, updater: (current: FreeShippingNode) => FreeShippingNode): FreeShippingNode {
  if (node.id === nodeId) return updater(node);
  if (node.kind === 'group') {
    return {
      ...node,
      children: node.children.map((child) => mapNode(child, nodeId, updater)),
    };
  }
  return node;
}

function removeNode(node: FreeShippingNode, nodeId: string): FreeShippingNode {
  if (node.kind !== 'group') return node;
  const children = node.children
    .filter((child) => child.id !== nodeId)
    .map((child) => removeNode(child, nodeId));
  return { ...node, children };
}

function addChildNode(node: FreeShippingNode, groupId: string, child: FreeShippingNode): FreeShippingNode {
  if (node.kind !== 'group') return node;
  if (node.id === groupId) {
    return { ...node, children: [...node.children, child] };
  }
  return {
    ...node,
    children: node.children.map((current) => addChildNode(current, groupId, child)),
  };
}

function updateRuleById(rules: FreeShippingRule[], ruleId: string, updater: (rule: FreeShippingRule) => FreeShippingRule): FreeShippingRule[] {
  return rules.map((rule) => (rule.id === ruleId ? updater({ ...rule, updatedAt: new Date().toISOString() }) : rule));
}

function MultiToggle({
  options,
  value,
  onChange,
}: {
  options: Array<{ value: string; label: string }>;
  value: string[];
  onChange: (next: string[]) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => {
        const active = value.includes(option.value);
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(active ? value.filter((item) => item !== option.value) : [...value, option.value])}
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
              active
                ? 'border-primary bg-primary text-white'
                : 'border-border bg-white text-muted-foreground hover:border-primary/30 hover:text-foreground'
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
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

function ConditionNodeEditor({
  node,
  onChange,
  onRemove,
  depth = 0,
}: {
  node: FreeShippingNode;
  onChange: (node: FreeShippingNode) => void;
  onRemove?: () => void;
  depth?: number;
}) {
  const [collapsed, setCollapsed] = useState(false);

  if (node.kind === 'group') {
    return (
      <div className="rounded-2xl border border-border/80 bg-muted/20 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setCollapsed((current) => !current)}
              className="rounded-lg border border-border bg-white p-1 text-muted-foreground hover:text-foreground"
            >
              {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
            <div>
              <p className="text-sm font-semibold text-foreground">Grupo {depth + 1}</p>
              <p className="text-xs text-muted-foreground">Combine condicoes com E ou OU.</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={node.operator}
              onChange={(event) => onChange({ ...node, operator: event.target.value === 'or' ? 'or' : 'and' })}
              className="h-9 rounded-lg border border-border bg-white px-3 text-sm font-semibold text-foreground outline-none"
            >
              <option value="and">E</option>
              <option value="or">OU</option>
            </select>
            <Button size="xs" color="secondary" onClick={() => onChange(addChildNode(node, node.id, createCondition()))}>
              <Plus className="h-3.5 w-3.5" />
              Condicao
            </Button>
            <Button size="xs" color="secondary" onClick={() => onChange(addChildNode(node, node.id, createGroup()))}>
              <Plus className="h-3.5 w-3.5" />
              Grupo
            </Button>
            {onRemove && (
              <Button size="xs" color="tertiary" onClick={onRemove}>
                <Trash2 className="h-3.5 w-3.5" />
                Remover
              </Button>
            )}
          </div>
        </div>

        {!collapsed && (
          <div className="mt-4 space-y-3 border-l border-dashed border-border pl-3 sm:pl-5">
            {node.children.map((child) => (
              <ConditionNodeEditor
                key={child.id}
                node={child}
                depth={depth + 1}
                onChange={(nextChild) => onChange(mapNode(node, child.id, () => nextChild))}
                onRemove={() => onChange(removeNode(node, child.id))}
              />
            ))}
            {node.children.length === 0 && (
              <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
                Este grupo ainda nao possui condicoes. Adicione uma condicao ou outro grupo.
              </p>
            )}
          </div>
        )}
      </div>
    );
  }

  const type = node.type;
  const listValue = joinListValue(node.values);

  return (
    <div className="rounded-2xl border border-border bg-white p-4">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <select
            value={type}
            onChange={(event) => onChange(createCondition(event.target.value as FreeShippingConditionNode['type']))}
            className="h-10 min-w-[220px] rounded-lg border border-border bg-white px-3 text-sm font-medium text-foreground outline-none"
          >
            <option value="subtotal_gte">Subtotal maior ou igual a</option>
            <option value="subtotal_gt">Subtotal maior que</option>
            <option value="sku_in">SKU esta na lista</option>
            <option value="product_flag">Produto com flag</option>
            <option value="region_uf_in">UF de destino</option>
            <option value="region_group_in">Grupo regional</option>
            <option value="payment_method_in">Forma de pagamento</option>
          </select>

          {onRemove && (
            <Button size="xs" color="tertiary" onClick={onRemove}>
              <Trash2 className="h-3.5 w-3.5" />
              Remover
            </Button>
          )}
        </div>

        {(type === 'subtotal_gte' || type === 'subtotal_gt') && (
          <div className="max-w-[220px]">
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Valor
            </label>
            <Input
              type="number"
              value={Number(node.value || 0)}
              onChange={(event) => onChange({ ...node, value: Number(event.target.value || 0) })}
              placeholder="299"
            />
          </div>
        )}

        {type === 'sku_in' && (
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Lista de SKUs
            </label>
            <textarea
              value={listValue}
              onChange={(event) => onChange({ ...node, values: parseListValue(event.target.value) })}
              placeholder="233900L050, 7689102070"
              className="min-h-[96px] w-full rounded-xl border border-border bg-white px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary"
            />
            <p className="mt-1 text-xs text-muted-foreground">Separe por virgula, ponto e virgula ou quebra de linha.</p>
          </div>
        )}

        {type === 'product_flag' && (
          <div className="max-w-[220px]">
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Flag do produto
            </label>
            <select
              value={String(node.value || 'frete_gratis')}
              onChange={(event) => onChange({ ...node, value: event.target.value })}
              className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm font-medium text-foreground outline-none"
            >
              <option value="frete_gratis">frete_gratis</option>
            </select>
          </div>
        )}

        {type === 'region_uf_in' && (
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Estados elegiveis
            </label>
            <MultiToggle
              options={UF_OPTIONS.map((value) => ({ value, label: value }))}
              value={node.values || []}
              onChange={(values) => onChange({ ...node, values })}
            />
          </div>
        )}

        {type === 'region_group_in' && (
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Grupos regionais
            </label>
            <MultiToggle
              options={REGION_GROUP_OPTIONS}
              value={node.values || []}
              onChange={(values) => onChange({ ...node, values })}
            />
          </div>
        )}

        {type === 'payment_method_in' && (
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Formas de pagamento
            </label>
            <MultiToggle
              options={PAYMENT_OPTIONS}
              value={node.values || []}
              onChange={(values) => onChange({ ...node, values })}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function RuleActionEditor({
  rule,
  onChange,
}: {
  rule: FreeShippingRule;
  onChange: (rule: FreeShippingRule) => void;
}) {
  const action = rule.action;

  const updateMatcher = (matcherId: string, updater: (matcher: FreeShippingServiceMatcher) => FreeShippingServiceMatcher) => {
    onChange({
      ...rule,
      action: {
        ...action,
        serviceMatchers: action.serviceMatchers.map((matcher) => (matcher.id === matcherId ? updater(matcher) : matcher)),
      },
    });
  };

  return (
    <SectionCard
      title="Acao da regra"
      subtitle="Defina se o frete gratis sera aplicado no site ou exibido como oferta exclusiva de WhatsApp."
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => onChange({ ...rule, action: { ...action, type: 'site_free_shipping' } })}
          className={`rounded-2xl border p-4 text-left transition-colors ${
            action.type === 'site_free_shipping'
              ? 'border-primary bg-primary/5'
              : 'border-border bg-white hover:border-primary/30'
          }`}
        >
          <div className="flex items-center gap-2 text-sm font-bold text-foreground">
            <Truck className="h-4 w-4 text-primary" />
            Frete gratis no site
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            Zera apenas os servicos elegiveis escolhidos na regra.
          </p>
        </button>

        <button
          type="button"
          onClick={() => onChange({ ...rule, action: { ...action, type: 'whatsapp_only' } })}
          className={`rounded-2xl border p-4 text-left transition-colors ${
            action.type === 'whatsapp_only'
              ? 'border-primary bg-primary/5'
              : 'border-border bg-white hover:border-primary/30'
          }`}
        >
          <div className="flex items-center gap-2 text-sm font-bold text-foreground">
            <MessageCircle className="h-4 w-4 text-primary" />
            Exclusivo no WhatsApp
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            Mantem o frete normal no site e mostra um CTA para fechar com o atendimento.
          </p>
        </button>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-foreground">Servicos elegiveis</p>
            <p className="text-xs text-muted-foreground">
              Escolha quais transportadoras/servicos podem virar gratis quando a regra bater.
            </p>
          </div>
          <Button
            size="xs"
            color="secondary"
            onClick={() =>
              onChange({
                ...rule,
                action: {
                  ...action,
                  serviceMatchers: [...action.serviceMatchers, createServiceMatcher()],
                },
              })
            }
          >
            <Plus className="h-3.5 w-3.5" />
            Matcher
          </Button>
        </div>

        <div className="space-y-3">
          {action.serviceMatchers.map((matcher) => (
            <div key={matcher.id} className="grid gap-3 rounded-2xl border border-border bg-white p-4 md:grid-cols-[1fr_1fr_1.4fr_auto]">
              <select
                value={matcher.field}
                onChange={(event) => updateMatcher(matcher.id, (current) => ({ ...current, field: event.target.value as FreeShippingServiceMatcher['field'] }))}
                className="h-10 rounded-lg border border-border bg-white px-3 text-sm font-medium text-foreground outline-none"
              >
                {SERVICE_FIELDS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
              <select
                value={matcher.operator}
                onChange={(event) => updateMatcher(matcher.id, (current) => ({ ...current, operator: event.target.value as FreeShippingServiceMatcher['operator'] }))}
                className="h-10 rounded-lg border border-border bg-white px-3 text-sm font-medium text-foreground outline-none"
              >
                <option value="contains">Contem</option>
                <option value="equals">Igual a</option>
              </select>
              <Input
                value={matcher.value}
                onChange={(event) => updateMatcher(matcher.id, (current) => ({ ...current, value: event.target.value }))}
                placeholder="Ex: PAC, Sedex, Correios"
              />
              <Button
                size="xs"
                color="tertiary"
                onClick={() =>
                  onChange({
                    ...rule,
                    action: {
                      ...action,
                      serviceMatchers: action.serviceMatchers.filter((current) => current.id !== matcher.id),
                    },
                  })
                }
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
          {action.serviceMatchers.length === 0 && (
            <p className="rounded-2xl border border-dashed border-border p-4 text-sm text-muted-foreground">
              Nenhum matcher configurado. Adicione pelo menos um servico elegivel para a regra agir no frete do site.
            </p>
          )}
        </div>
      </div>

      <div>
        <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Template opcional da mensagem de WhatsApp
        </label>
        <textarea
          value={action.whatsappMessageTemplate || ''}
          onChange={(event) =>
            onChange({
              ...rule,
              action: {
                ...action,
                whatsappMessageTemplate: event.target.value,
              },
            })
          }
          placeholder="Use {{rule_name}}, {{subtotal}}, {{cep}}, {{uf}}, {{items}} e {{payment_method}}"
          className="min-h-[96px] w-full rounded-xl border border-border bg-white px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary"
        />
      </div>
    </SectionCard>
  );
}

export function FreeShippingAdminPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [simulating, setSimulating] = useState(false);
  const [rules, setRules] = useState<FreeShippingRule[]>([]);
  const [settings, setSettings] = useState<FreeShippingSettings>({ legacyFallbackEnabled: false });
  const [legacy, setLegacy] = useState<FreeShippingAdminSnapshot['legacy']>(null);
  const [selectedRuleId, setSelectedRuleId] = useState<string | null>(null);
  const [simulationContext, setSimulationContext] = useState<FreeShippingSimulationContext>({
    subtotal: 350,
    recipientCep: '86026010',
    recipientUf: 'PR',
    paymentMethodIntent: null,
    items: [{ sku: '233900L050', qty: 1, price: 350, name: 'Filtro de combustivel' }],
    services: [
      {
        serviceCode: 'PAC',
        serviceDescription: 'PAC',
        carrier: 'Correios',
        price: 28.9,
        originalPrice: 28.9,
        deliveryDays: 5,
      },
      {
        serviceCode: 'SEDEX',
        serviceDescription: 'SEDEX',
        carrier: 'Correios',
        price: 49.9,
        originalPrice: 49.9,
        deliveryDays: 2,
      },
    ],
  });
  const [simulationResult, setSimulationResult] = useState<any>(null);

  const selectedRule = useMemo(
    () => rules.find((rule) => rule.id === selectedRuleId) || rules[0] || null,
    [rules, selectedRuleId]
  );

  const sortedRules = useMemo(
    () => [...rules].sort((a, b) => b.priority - a.priority || a.name.localeCompare(b.name)),
    [rules]
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const payload = await fetchFreeShippingAdmin();
        if (cancelled) return;
        setRules(payload.rules);
        setSettings(payload.settings);
        setLegacy(payload.legacy);
        setSelectedRuleId(payload.rules[0]?.id || null);
      } catch (error: any) {
        toast.error(error.message || 'Falha ao carregar regras de frete gratis');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, []);

  const updateSelectedRule = (updater: (rule: FreeShippingRule) => FreeShippingRule) => {
    if (!selectedRule) return;
    setRules((current) => updateRuleById(current, selectedRule.id, updater));
  };

  const handleCreateRule = () => {
    const rule = createRule();
    setRules((current) => [rule, ...current]);
    setSelectedRuleId(rule.id);
  };

  const handleDuplicateRule = async () => {
    if (!selectedRule) return;
    try {
      const duplicated = await duplicateFreeShippingRule(selectedRule.id);
      setRules((current) => [duplicated, ...current]);
      setSelectedRuleId(duplicated.id);
      toast.success('Regra duplicada com sucesso');
    } catch (error: any) {
      toast.error(error.message || 'Falha ao duplicar a regra');
    }
  };

  const handleDeleteRule = async () => {
    if (!selectedRule) return;
    try {
      await deleteFreeShippingRule(selectedRule.id);
      setRules((current) => current.filter((rule) => rule.id !== selectedRule.id));
      setSelectedRuleId((current) => (current === selectedRule.id ? null : current));
      toast.success('Regra removida');
    } catch (error: any) {
      toast.error(error.message || 'Falha ao remover a regra');
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const result = await saveFreeShippingBulk({ rules, settings });
      setRules(result.rules);
      setSettings(result.settings);
      toast.success('Regras de frete gratis salvas com sucesso');
    } catch (error: any) {
      toast.error(error.message || 'Falha ao salvar as regras');
    } finally {
      setSaving(false);
    }
  };

  const handleSimulate = async () => {
    setSimulating(true);
    try {
      const result = await simulateFreeShipping({
        context: simulationContext,
        rules,
        settings,
        legacyConfig: legacy,
      });
      setSimulationResult(result.evaluation);
      toast.success('Simulacao executada');
    } catch (error: any) {
      toast.error(error.message || 'Falha ao simular');
    } finally {
      setSimulating(false);
    }
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-[1400px] px-4 pb-12 pt-6 lg:px-6">
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Carregando regras de frete gratis...
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1400px] px-4 pb-12 pt-6 lg:px-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Badge>Frete Gratis</Badge>
            <Badge variant="secondary">{rules.length} regra{rules.length === 1 ? '' : 's'}</Badge>
          </div>
          <h1 className="mt-3 text-2xl font-bold tracking-tight text-foreground">Motor de frete gratis</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Controle regras com grupos aninhados de E/OU, condicoes por subtotal, SKU, flag de produto, regiao e forma de pagamento.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button color="secondary" size="sm" onClick={handleCreateRule}>
            <Plus className="h-4 w-4" />
            Nova regra
          </Button>
          <Button color="primary" size="sm" onClick={handleSave} isLoading={saving}>
            <Save className="h-4 w-4" />
            Salvar
          </Button>
        </div>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[340px_minmax(0,1fr)]">
        <SectionCard
          title="Regras"
          subtitle="Ative, priorize e selecione a regra para editar."
          aside={
            <Button color="secondary" size="xs" onClick={handleCreateRule}>
              <Plus className="h-3.5 w-3.5" />
              Criar
            </Button>
          }
        >
          <div className="space-y-3">
            {sortedRules.map((rule) => {
              const active = selectedRule?.id === rule.id;
              return (
                <button
                  key={rule.id}
                  type="button"
                  onClick={() => setSelectedRuleId(rule.id)}
                  className={`w-full rounded-2xl border p-4 text-left transition-colors ${
                    active
                      ? 'border-primary bg-primary/5'
                      : 'border-border bg-white hover:border-primary/30'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-foreground">{rule.name}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Prioridade {rule.priority} • {rule.action.type === 'site_free_shipping' ? 'No site' : 'WhatsApp'}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <Badge variant={rule.enabled ? 'secondary' : 'outline'}>
                        {rule.enabled ? 'Ativa' : 'Inativa'}
                      </Badge>
                    </div>
                  </div>
                </button>
              );
            })}

            {sortedRules.length === 0 && (
              <div className="rounded-2xl border border-dashed border-border p-5 text-sm text-muted-foreground">
                Nenhuma regra criada ainda. Comece com uma regra nova para frete gratis no site ou exclusivo no WhatsApp.
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            <div className="flex items-start gap-3">
              <ShieldAlert className="mt-0.5 h-4 w-4 flex-shrink-0" />
              <div>
                <p className="font-semibold">Compatibilidade legada Frenet</p>
                <p className="mt-1 text-amber-800">
                  Limite antigo: {legacy?.freeShippingEnabled ? `ativo em ${formatBRL(Number(legacy.freeShippingThreshold || 0))}` : 'desativado'}.
                  {' '}Fallback legado {settings.legacyFallbackEnabled ? 'ligado' : 'desligado'}.
                </p>
              </div>
            </div>
          </div>
        </SectionCard>

        <div className="space-y-6">
          {selectedRule ? (
            <>
              <SectionCard
                title="Configuracao geral"
                subtitle="Defina nome, prioridade e status da regra."
                aside={
                  <div className="flex flex-wrap gap-2">
                    <Button color="secondary" size="xs" onClick={handleDuplicateRule}>
                      <Copy className="h-3.5 w-3.5" />
                      Duplicar
                    </Button>
                    <Button color="tertiary" size="xs" onClick={handleDeleteRule}>
                      <Trash2 className="h-3.5 w-3.5" />
                      Remover
                    </Button>
                  </div>
                }
              >
                <div className="grid gap-4 lg:grid-cols-[1.2fr_140px_160px]">
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Nome da regra
                    </label>
                    <Input
                      value={selectedRule.name}
                      onChange={(event) => updateSelectedRule((rule) => ({ ...rule, name: event.target.value }))}
                      placeholder="Ex: Frete gratis PIX Sul"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Prioridade
                    </label>
                    <Input
                      type="number"
                      value={selectedRule.priority}
                      onChange={(event) => updateSelectedRule((rule) => ({ ...rule, priority: Number(event.target.value || 0) }))}
                    />
                  </div>
                  <div className="flex items-end">
                    <label className="flex h-11 w-full items-center justify-between rounded-xl border border-border bg-white px-4 text-sm font-semibold text-foreground">
                      Regra ativa
                      <input
                        type="checkbox"
                        checked={selectedRule.enabled}
                        onChange={(event) => updateSelectedRule((rule) => ({ ...rule, enabled: event.target.checked }))}
                        className="h-4 w-4 rounded border-border"
                      />
                    </label>
                  </div>
                </div>

                <label className="flex items-center justify-between rounded-2xl border border-border bg-white px-4 py-3 text-sm font-semibold text-foreground">
                  Usar fallback legado da Frenet quando nenhuma regra bater
                  <input
                    type="checkbox"
                    checked={settings.legacyFallbackEnabled}
                    onChange={(event) => setSettings((current) => ({ ...current, legacyFallbackEnabled: event.target.checked }))}
                    className="h-4 w-4 rounded border-border"
                  />
                </label>
              </SectionCard>

              <SectionCard
                title="Condicoes"
                subtitle="Monte grupos aninhados com E/OU para definir quando a regra deve agir."
              >
                <ConditionNodeEditor
                  node={selectedRule.conditionTree}
                  onChange={(nextTree) => updateSelectedRule((rule) => ({ ...rule, conditionTree: nextTree }))}
                />
              </SectionCard>

              <RuleActionEditor
                rule={selectedRule}
                onChange={(nextRule) => updateSelectedRule(() => nextRule)}
              />
            </>
          ) : (
            <SectionCard
              title="Nenhuma regra selecionada"
              subtitle="Crie ou selecione uma regra para editar."
            >
              <div className="flex flex-col items-start gap-3 text-sm text-muted-foreground">
                <p>O motor de frete gratis esta pronto para receber regras com subtotal, SKU, regiao, forma de pagamento e condicoes exclusivas de WhatsApp.</p>
                <Button color="primary" size="sm" onClick={handleCreateRule}>
                  <Plus className="h-4 w-4" />
                  Criar primeira regra
                </Button>
              </div>
            </SectionCard>
          )}

          <SectionCard
            title="Simulador"
            subtitle="Teste o comportamento do motor com um carrinho ficticio antes de salvar ou publicar."
            aside={
              <Button color="secondary" size="xs" onClick={handleSimulate} isLoading={simulating}>
                <TestTube2 className="h-3.5 w-3.5" />
                Simular
              </Button>
            }
          >
            <div className="grid gap-4 lg:grid-cols-4">
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Subtotal</label>
                <Input
                  type="number"
                  value={simulationContext.subtotal}
                  onChange={(event) => setSimulationContext((current) => ({ ...current, subtotal: Number(event.target.value || 0) }))}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">CEP</label>
                <Input
                  value={simulationContext.recipientCep || ''}
                  onChange={(event) => setSimulationContext((current) => ({ ...current, recipientCep: event.target.value }))}
                  placeholder="86026010"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">UF</label>
                <select
                  value={simulationContext.recipientUf || ''}
                  onChange={(event) => setSimulationContext((current) => ({ ...current, recipientUf: event.target.value }))}
                  className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm font-medium text-foreground outline-none"
                >
                  <option value="">Selecione</option>
                  {UF_OPTIONS.map((uf) => <option key={uf} value={uf}>{uf}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Pagamento</label>
                <select
                  value={simulationContext.paymentMethodIntent || ''}
                  onChange={(event) =>
                    setSimulationContext((current) => ({
                      ...current,
                      paymentMethodIntent: (event.target.value || null) as PaymentMethodIntent | null,
                    }))
                  }
                  className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm font-medium text-foreground outline-none"
                >
                  <option value="">Sem selecao</option>
                  {PAYMENT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Itens do carrinho
                </label>
                <textarea
                  value={simulationContext.items.map((item) => `${item.sku}|${item.name || ''}|${item.qty || item.quantity || 1}`).join('\n')}
                  onChange={(event) =>
                    setSimulationContext((current) => ({
                      ...current,
                      items: event.target.value
                        .split('\n')
                        .map((line) => line.trim())
                        .filter(Boolean)
                        .map((line) => {
                          const [sku, name, qty] = line.split('|');
                          return {
                            sku: sku?.trim() || '',
                            name: name?.trim() || undefined,
                            qty: Number(qty || 1),
                            price: current.subtotal,
                          };
                        }),
                    }))
                  }
                  placeholder="233900L050|Filtro de combustivel|1"
                  className="min-h-[120px] w-full rounded-xl border border-border bg-white px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary"
                />
                <p className="mt-1 text-xs text-muted-foreground">Formato: SKU|Nome opcional|Quantidade</p>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Servicos retornados
                </label>
                <textarea
                  value={simulationContext.services.map((service) => `${service.serviceCode}|${service.serviceDescription}|${service.carrier}|${service.price}`).join('\n')}
                  onChange={(event) =>
                    setSimulationContext((current) => ({
                      ...current,
                      services: event.target.value
                        .split('\n')
                        .map((line) => line.trim())
                        .filter(Boolean)
                        .map((line) => {
                          const [serviceCode, serviceDescription, carrier, price] = line.split('|');
                          const numericPrice = Number(price || 0);
                          return {
                            serviceCode: serviceCode?.trim() || '',
                            serviceDescription: serviceDescription?.trim() || '',
                            carrier: carrier?.trim() || '',
                            price: numericPrice,
                            originalPrice: numericPrice,
                            deliveryDays: 3,
                          };
                        }),
                    }))
                  }
                  placeholder="PAC|PAC|Correios|28.90"
                  className="min-h-[120px] w-full rounded-xl border border-border bg-white px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary"
                />
                <p className="mt-1 text-xs text-muted-foreground">Formato: codigo|nome do servico|transportadora|preco</p>
              </div>
            </div>

            {simulationResult && (
              <div className="grid gap-4 lg:grid-cols-3">
                <div className="rounded-2xl border border-border bg-white p-4">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Aplicada</p>
                  {simulationResult.appliedRule ? (
                    <div className="mt-2 space-y-1">
                      <p className="text-sm font-bold text-foreground">{simulationResult.appliedRule.ruleName}</p>
                      <p className="text-xs text-muted-foreground">{simulationResult.appliedRule.message}</p>
                      <p className="text-xs text-emerald-600">
                        Servicos gratis: {(simulationResult.eligibleFreeShippingServiceIds || []).join(', ') || 'nenhum'}
                      </p>
                    </div>
                  ) : (
                    <p className="mt-2 text-sm text-muted-foreground">Nenhuma regra aplicada diretamente no site.</p>
                  )}
                </div>

                <div className="rounded-2xl border border-border bg-white p-4">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Potenciais</p>
                  <div className="mt-2 space-y-2">
                    {(simulationResult.potentialRules || []).length > 0 ? (
                      simulationResult.potentialRules.map((rule: any) => (
                        <div key={rule.ruleId} className="rounded-xl border border-border/70 bg-muted/20 px-3 py-2">
                          <p className="text-sm font-semibold text-foreground">{rule.ruleName}</p>
                          <p className="text-xs text-muted-foreground">{rule.message}</p>
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-muted-foreground">Nenhuma regra potencial.</p>
                    )}
                  </div>
                </div>

                <div className="rounded-2xl border border-border bg-white p-4">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">WhatsApp</p>
                  {simulationResult.whatsappOffer ? (
                    <div className="mt-2 space-y-2">
                      <p className="text-sm font-bold text-foreground">{simulationResult.whatsappOffer.ruleName}</p>
                      <p className="text-xs text-muted-foreground">{simulationResult.whatsappOffer.message}</p>
                      <a
                        href={simulationResult.whatsappOffer.url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-2 rounded-full bg-[#25D366]/10 px-3 py-2 text-xs font-semibold text-[#128C7E]"
                      >
                        <MessageCircle className="h-3.5 w-3.5" />
                        Abrir WhatsApp
                      </a>
                    </div>
                  ) : (
                    <p className="mt-2 text-sm text-muted-foreground">Nenhuma oferta exclusiva de WhatsApp.</p>
                  )}
                </div>
              </div>
            )}
          </SectionCard>
        </div>
      </div>
    </div>
  );
}
