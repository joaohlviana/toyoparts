import { Hono } from 'npm:hono';
import * as kv from './kv_store.tsx';

export const freeShippingAdmin = new Hono();

const RULES_KEY = 'meta:free_shipping_rules';
const SETTINGS_KEY = 'meta:free_shipping_settings';
const FRENET_CONFIG_KEY = 'meta:frenet_config';
const WHATSAPP_PHONE = '554332941144';
const PRODUCT_PREFIX = 'product:';

export type PaymentMethodIntent = 'pix' | 'credit_card' | 'boleto';
export type FreeShippingConditionType =
  | 'subtotal_gte'
  | 'subtotal_gt'
  | 'sku_in'
  | 'product_flag'
  | 'region_uf_in'
  | 'region_group_in'
  | 'payment_method_in';

export interface FreeShippingConditionNode {
  kind: 'condition';
  id: string;
  type: FreeShippingConditionType;
  value?: number | string;
  values?: string[];
}

export interface FreeShippingGroupNode {
  kind: 'group';
  id: string;
  operator: 'and' | 'or';
  children: FreeShippingNode[];
}

export type FreeShippingNode = FreeShippingConditionNode | FreeShippingGroupNode;

export interface FreeShippingServiceMatcher {
  id: string;
  field: 'carrier' | 'serviceDescription' | 'serviceCode';
  operator: 'contains' | 'equals';
  value: string;
}

export interface FreeShippingRuleAction {
  type: 'site_free_shipping' | 'whatsapp_only';
  eligibleServices: 'selected';
  serviceMatchers: FreeShippingServiceMatcher[];
  whatsappMessageTemplate?: string;
}

export interface FreeShippingRule {
  id: string;
  name: string;
  enabled: boolean;
  priority: number;
  conditionTree: FreeShippingNode;
  action: FreeShippingRuleAction;
  createdAt: string;
  updatedAt: string;
}

export interface FreeShippingSettings {
  legacyFallbackEnabled: boolean;
}

export interface FreeShippingEvaluationRuleSummary {
  ruleId: string;
  ruleName: string;
  actionType: 'site_free_shipping' | 'whatsapp_only';
  priority: number;
  specificity: number;
  message: string;
  paymentMethods?: PaymentMethodIntent[];
}

export interface FreeShippingEvaluation {
  evaluationMode: 'potential' | 'final';
  appliedRule?: FreeShippingEvaluationRuleSummary | null;
  potentialRules: FreeShippingEvaluationRuleSummary[];
  whatsappOffer?: {
    ruleId: string;
    ruleName: string;
    potential: boolean;
    url: string;
    text: string;
    message: string;
  } | null;
  eligibleFreeShippingServiceIds: string[];
  legacyApplied?: boolean;
}

export interface EvaluatedShippingService {
  serviceCode: string;
  serviceDescription: string;
  carrier: string;
  carrierCode?: string;
  price: number;
  originalPrice: number;
  deliveryDays: number;
  error?: boolean;
  message?: string | null;
}

interface ProductFact {
  sku: string;
  flags: Record<string, boolean>;
}

export interface FreeShippingEvaluationInput {
  subtotal: number;
  recipientCep?: string;
  recipientUf?: string | null;
  paymentMethodIntent?: PaymentMethodIntent | null;
  items: Array<{
    sku: string;
    quantity?: number;
    qty?: number;
    price?: number;
    name?: string;
  }>;
  services: EvaluatedShippingService[];
  evaluationMode: 'potential' | 'final';
}

const DEFAULT_SETTINGS: FreeShippingSettings = {
  legacyFallbackEnabled: false,
};

const REGION_GROUPS: Record<string, string[]> = {
  norte: ['AC', 'AP', 'AM', 'PA', 'RO', 'RR', 'TO'],
  nordeste: ['AL', 'BA', 'CE', 'MA', 'PB', 'PE', 'PI', 'RN', 'SE'],
  'centro-oeste': ['DF', 'GO', 'MT', 'MS'],
  sudeste: ['ES', 'MG', 'RJ', 'SP'],
  sul: ['PR', 'RS', 'SC'],
};

const PAYMENT_LABELS: Record<PaymentMethodIntent, string> = {
  pix: 'PIX',
  credit_card: 'Cartao',
  boleto: 'Boleto',
};

const DEFAULT_SERVICE_MATCHER: FreeShippingServiceMatcher = {
  id: crypto.randomUUID(),
  field: 'serviceDescription',
  operator: 'contains',
  value: 'PAC',
};

function normalizeText(value: unknown): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function uniqueValues(values: string[] = []): string[] {
  return Array.from(new Set(values.map((value) => String(value).trim()).filter(Boolean)));
}

function formatBRL(value: number): string {
  return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function ensureMatcher(matcher?: Partial<FreeShippingServiceMatcher>): FreeShippingServiceMatcher {
  return {
    id: matcher?.id || crypto.randomUUID(),
    field: matcher?.field === 'carrier' || matcher?.field === 'serviceCode' ? matcher.field : 'serviceDescription',
    operator: matcher?.operator === 'equals' ? 'equals' : 'contains',
    value: String(matcher?.value || '').trim(),
  };
}

function createDefaultRule(): FreeShippingRule {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    name: 'Nova regra de frete gratis',
    enabled: true,
    priority: 100,
    createdAt: now,
    updatedAt: now,
    conditionTree: {
      kind: 'group',
      id: crypto.randomUUID(),
      operator: 'and',
      children: [
        {
          kind: 'condition',
          id: crypto.randomUUID(),
          type: 'subtotal_gte',
          value: 299,
        },
      ],
    },
    action: {
      type: 'site_free_shipping',
      eligibleServices: 'selected',
      serviceMatchers: [DEFAULT_SERVICE_MATCHER],
    },
  };
}

function sanitizeConditionNode(node: any): FreeShippingNode {
  if (node?.kind === 'group') {
    const children = Array.isArray(node.children) ? node.children.map(sanitizeConditionNode) : [];
    return {
      kind: 'group',
      id: node.id || crypto.randomUUID(),
      operator: node.operator === 'or' ? 'or' : 'and',
      children,
    };
  }

  const type: FreeShippingConditionType =
    node?.type === 'subtotal_gt' ||
    node?.type === 'sku_in' ||
    node?.type === 'product_flag' ||
    node?.type === 'region_uf_in' ||
    node?.type === 'region_group_in' ||
    node?.type === 'payment_method_in'
      ? node.type
      : 'subtotal_gte';

  return {
    kind: 'condition',
    id: node?.id || crypto.randomUUID(),
    type,
    value:
      type === 'subtotal_gte' || type === 'subtotal_gt'
        ? Number(node?.value || 0)
        : typeof node?.value === 'string'
          ? node.value
          : undefined,
    values: Array.isArray(node?.values) ? uniqueValues(node.values.map(String)) : undefined,
  };
}

function sanitizeRule(raw: any): FreeShippingRule {
  const fallback = createDefaultRule();
  return {
    id: raw?.id || fallback.id,
    name: String(raw?.name || fallback.name).trim() || fallback.name,
    enabled: raw?.enabled !== false,
    priority: Number.isFinite(Number(raw?.priority)) ? Number(raw.priority) : fallback.priority,
    createdAt: raw?.createdAt || fallback.createdAt,
    updatedAt: new Date().toISOString(),
    conditionTree: sanitizeConditionNode(raw?.conditionTree || fallback.conditionTree),
    action: {
      type: raw?.action?.type === 'whatsapp_only' ? 'whatsapp_only' : 'site_free_shipping',
      eligibleServices: 'selected',
      serviceMatchers: Array.isArray(raw?.action?.serviceMatchers)
        ? raw.action.serviceMatchers.map(ensureMatcher).filter((matcher: FreeShippingServiceMatcher) => !!matcher.value)
        : fallback.action.serviceMatchers,
      whatsappMessageTemplate: typeof raw?.action?.whatsappMessageTemplate === 'string'
        ? raw.action.whatsappMessageTemplate
        : undefined,
    },
  };
}

function sanitizeRules(rules: any): FreeShippingRule[] {
  if (!Array.isArray(rules)) return [];
  return rules.map(sanitizeRule);
}

function sanitizeSettings(settings: any): FreeShippingSettings {
  return {
    legacyFallbackEnabled: settings?.legacyFallbackEnabled === true,
  };
}

async function getRules(): Promise<FreeShippingRule[]> {
  const raw = await kv.get(RULES_KEY);
  return sanitizeRules(raw);
}

async function saveRules(rules: FreeShippingRule[]): Promise<void> {
  await kv.set(RULES_KEY, rules.map(sanitizeRule));
}

async function getSettings(): Promise<FreeShippingSettings> {
  const raw = await kv.get(SETTINGS_KEY);
  return { ...DEFAULT_SETTINGS, ...sanitizeSettings(raw) };
}

async function saveSettings(settings: FreeShippingSettings): Promise<void> {
  await kv.set(SETTINGS_KEY, sanitizeSettings(settings));
}

async function getLegacyFrenetConfig(): Promise<any> {
  try {
    return await kv.get(FRENET_CONFIG_KEY);
  } catch {
    return null;
  }
}

function extractFlagValue(product: any, code: string): boolean {
  const customMap = product?.custom_attributes_map;
  const directValue = customMap?.[code];
  if (directValue !== undefined) {
    return directValue === true || directValue === 1 || directValue === '1';
  }

  const customAttributes = Array.isArray(product?.custom_attributes) ? product.custom_attributes : [];
  const attr = customAttributes.find((entry: any) => entry?.attribute_code === code)?.value;
  return attr === true || attr === 1 || attr === '1';
}

async function resolveProductFacts(items: FreeShippingEvaluationInput['items']): Promise<Map<string, ProductFact>> {
  const facts = new Map<string, ProductFact>();
  const skus = uniqueValues(items.map((item) => item.sku));

  await Promise.all(
    skus.map(async (sku) => {
      try {
        const product = await kv.get(`${PRODUCT_PREFIX}${sku}`);
        facts.set(sku, {
          sku,
          flags: {
            frete_gratis: extractFlagValue(product, 'frete_gratis'),
          },
        });
      } catch {
        facts.set(sku, { sku, flags: { frete_gratis: false } });
      }
    })
  );

  return facts;
}

function getRegionGroupsFromUf(uf?: string | null): string[] {
  const normalizedUf = String(uf || '').toUpperCase();
  if (!normalizedUf) return [];

  return Object.entries(REGION_GROUPS)
    .filter(([, ufs]) => ufs.includes(normalizedUf))
    .map(([group]) => group);
}

function matchServiceMatcher(service: EvaluatedShippingService, matcher: FreeShippingServiceMatcher): boolean {
  const left = normalizeText((service as any)?.[matcher.field]);
  const right = normalizeText(matcher.value);
  if (!left || !right) return false;
  if (matcher.operator === 'equals') return left === right;
  return left.includes(right);
}

function matchServiceIds(services: EvaluatedShippingService[], action: FreeShippingRuleAction): string[] {
  if (!Array.isArray(action.serviceMatchers) || action.serviceMatchers.length === 0) return [];

  return services
    .filter((service) => !service.error)
    .filter((service) => action.serviceMatchers.some((matcher) => matchServiceMatcher(service, matcher)))
    .map((service) => service.serviceCode || service.serviceDescription)
    .filter(Boolean);
}

interface EvaluationContext {
  subtotal: number;
  paymentMethodIntent?: PaymentMethodIntent | null;
  recipientUf?: string | null;
  regionGroups: string[];
  skus: string[];
  productFacts: Map<string, ProductFact>;
}

interface TreeEvaluationResult {
  final: boolean;
  potential: boolean;
  specificity: number;
}

function evaluateCondition(condition: FreeShippingConditionNode, context: EvaluationContext): TreeEvaluationResult {
  switch (condition.type) {
    case 'subtotal_gte': {
      const target = Number(condition.value || 0);
      return { final: context.subtotal >= target, potential: false, specificity: 1 };
    }
    case 'subtotal_gt': {
      const target = Number(condition.value || 0);
      return { final: context.subtotal > target, potential: false, specificity: 1 };
    }
    case 'sku_in': {
      const targets = uniqueValues(condition.values || []);
      const matched = targets.some((sku) => context.skus.includes(sku));
      return { final: matched, potential: false, specificity: 1 };
    }
    case 'product_flag': {
      const flag = String(condition.value || 'frete_gratis');
      const matched = context.skus.some((sku) => context.productFacts.get(sku)?.flags?.[flag] === true);
      return { final: matched, potential: false, specificity: 1 };
    }
    case 'region_uf_in': {
      const targets = uniqueValues((condition.values || []).map((value) => value.toUpperCase()));
      const matched = !!context.recipientUf && targets.includes(String(context.recipientUf).toUpperCase());
      return { final: matched, potential: false, specificity: 1 };
    }
    case 'region_group_in': {
      const targets = uniqueValues((condition.values || []).map(normalizeText));
      const matched = context.regionGroups.some((group) => targets.includes(normalizeText(group)));
      return { final: matched, potential: false, specificity: 1 };
    }
    case 'payment_method_in': {
      const targets = uniqueValues(condition.values || []) as PaymentMethodIntent[];
      if (!context.paymentMethodIntent) {
        return { final: false, potential: targets.length > 0, specificity: 1 };
      }
      return { final: targets.includes(context.paymentMethodIntent), potential: false, specificity: 1 };
    }
    default:
      return { final: false, potential: false, specificity: 0 };
  }
}

function evaluateTree(node: FreeShippingNode, context: EvaluationContext): TreeEvaluationResult {
  if (node.kind === 'condition') return evaluateCondition(node, context);

  const children = Array.isArray(node.children) ? node.children.map((child) => evaluateTree(child, context)) : [];
  if (children.length === 0) return { final: false, potential: false, specificity: 0 };

  if (node.operator === 'and') {
    const hasFalse = children.some((child) => !child.final && !child.potential);
    if (!hasFalse && children.every((child) => child.final)) {
      return {
        final: true,
        potential: false,
        specificity: children.reduce((sum, child) => sum + child.specificity, 0),
      };
    }

    const potential = !hasFalse && children.some((child) => child.potential);
    if (potential) {
      return {
        final: false,
        potential: true,
        specificity: children.reduce((sum, child) => sum + child.specificity, 0),
      };
    }

    return { final: false, potential: false, specificity: 0 };
  }

  const finalChildren = children.filter((child) => child.final);
  if (finalChildren.length > 0) {
    const best = finalChildren.sort((a, b) => b.specificity - a.specificity)[0];
    return { final: true, potential: false, specificity: best.specificity };
  }

  const potentialChildren = children.filter((child) => child.potential);
  if (potentialChildren.length > 0) {
    const best = potentialChildren.sort((a, b) => b.specificity - a.specificity)[0];
    return { final: false, potential: true, specificity: best.specificity };
  }

  return { final: false, potential: false, specificity: 0 };
}

function extractPaymentHints(node: FreeShippingNode): PaymentMethodIntent[] {
  if (node.kind === 'condition') {
    return node.type === 'payment_method_in'
      ? uniqueValues(node.values || []) as PaymentMethodIntent[]
      : [];
  }

  return uniqueValues(node.children.flatMap(extractPaymentHints)) as PaymentMethodIntent[];
}

function summarizeRule(rule: FreeShippingRule, specificity: number): FreeShippingEvaluationRuleSummary {
  const paymentHints = extractPaymentHints(rule.conditionTree);
  const paymentText = paymentHints.length > 0
    ? ` com ${paymentHints.map((value) => PAYMENT_LABELS[value]).join(' ou ')}`
    : '';

  return {
    ruleId: rule.id,
    ruleName: rule.name,
    actionType: rule.action.type,
    priority: rule.priority,
    specificity,
    paymentMethods: paymentHints,
    message:
      rule.action.type === 'whatsapp_only'
        ? `Condicao especial via WhatsApp${paymentText}.`
        : `Frete gratis disponivel${paymentText}.`,
  };
}

function buildItemSummary(items: FreeShippingEvaluationInput['items']): string {
  const topItems = items.slice(0, 4).map((item) => {
    const qty = Number(item.quantity || item.qty || 1);
    const label = item.name || item.sku;
    return `${qty}x ${label}`;
  });

  return topItems.join(', ');
}

function interpolateWhatsAppTemplate(template: string, input: FreeShippingEvaluationInput, rule: FreeShippingRule, uf: string | null): string {
  const replacements: Record<string, string> = {
    '{{rule_name}}': rule.name,
    '{{subtotal}}': formatBRL(input.subtotal),
    '{{cep}}': String(input.recipientCep || ''),
    '{{uf}}': String(uf || ''),
    '{{items}}': buildItemSummary(input.items),
    '{{payment_method}}': input.paymentMethodIntent ? PAYMENT_LABELS[input.paymentMethodIntent] : '',
  };

  let message = template;
  Object.entries(replacements).forEach(([token, value]) => {
    message = message.replaceAll(token, value);
  });
  return message.trim();
}

function buildWhatsAppMessage(rule: FreeShippingRule, input: FreeShippingEvaluationInput, uf: string | null, potential: boolean): string {
  const defaultMessage = [
    'Ola! Quero fechar meu pedido com a condicao de frete gratis.',
    `Regra: ${rule.name}`,
    `Subtotal: ${formatBRL(input.subtotal)}`,
    input.recipientCep ? `CEP: ${input.recipientCep}` : '',
    uf ? `UF: ${uf}` : '',
    input.paymentMethodIntent ? `Pagamento desejado: ${PAYMENT_LABELS[input.paymentMethodIntent]}` : '',
    buildItemSummary(input.items) ? `Itens: ${buildItemSummary(input.items)}` : '',
    potential ? 'Vi a condicao potencial no site e quero confirmar com o atendimento.' : 'Quero concluir meu pedido pelo WhatsApp.',
  ]
    .filter(Boolean)
    .join('\n');

  if (rule.action.whatsappMessageTemplate?.trim()) {
    return interpolateWhatsAppTemplate(rule.action.whatsappMessageTemplate, input, rule, uf);
  }

  return defaultMessage;
}

function buildWhatsAppOffer(rule: FreeShippingRule, input: FreeShippingEvaluationInput, uf: string | null, specificity: number, potential: boolean) {
  const text = buildWhatsAppMessage(rule, input, uf, potential);
  return {
    ...summarizeRule(rule, specificity),
    potential,
    text,
    url: `https://wa.me/${WHATSAPP_PHONE}?text=${encodeURIComponent(text)}`,
    message: potential
      ? 'Existe uma condicao especial de frete para este pedido. Fale com o atendimento para fechar via WhatsApp.'
      : 'Este pedido tem frete gratis exclusivo no fechamento via WhatsApp.',
  };
}

function applyLegacyFreeShipping(services: EvaluatedShippingService[], frenetConfig: any): string[] {
  if (!frenetConfig?.freeShippingEnabled) return [];
  return services
    .filter((service) => !service.error)
    .filter((service) => normalizeText(service.serviceDescription).includes('pac'))
    .map((service) => service.serviceCode || service.serviceDescription)
    .filter(Boolean);
}

export async function evaluateFreeShippingRules(
  input: FreeShippingEvaluationInput,
  overrides?: {
    rules?: FreeShippingRule[];
    settings?: FreeShippingSettings;
    legacyConfig?: any;
  }
): Promise<FreeShippingEvaluation> {
  const [rules, settings, legacyConfig, productFacts] = await Promise.all([
    overrides?.rules ? Promise.resolve(sanitizeRules(overrides.rules)) : getRules(),
    overrides?.settings ? Promise.resolve({ ...DEFAULT_SETTINGS, ...sanitizeSettings(overrides.settings) }) : getSettings(),
    overrides?.legacyConfig ? Promise.resolve(overrides.legacyConfig) : getLegacyFrenetConfig(),
    resolveProductFacts(input.items),
  ]);

  const recipientUf = String(input.recipientUf || '').toUpperCase() || null;
  const context: EvaluationContext = {
    subtotal: Number(input.subtotal || 0),
    paymentMethodIntent: input.paymentMethodIntent || null,
    recipientUf,
    regionGroups: getRegionGroupsFromUf(recipientUf),
    skus: uniqueValues(input.items.map((item) => item.sku)),
    productFacts,
  };

  const orderedRules = [...rules]
    .filter((rule) => rule.enabled)
    .sort((a, b) => b.priority - a.priority || a.name.localeCompare(b.name));

  const potentialRules: FreeShippingEvaluationRuleSummary[] = [];
  let winnerRule: FreeShippingRule | null = null;
  let winnerSpecificity = 0;
  let winnerServiceIds: string[] = [];
  let whatsappOffer: FreeShippingEvaluation['whatsappOffer'] | null = null;

  for (const rule of orderedRules) {
    const treeResult = evaluateTree(rule.conditionTree, context);
    if (!treeResult.final && !treeResult.potential) continue;

    if (treeResult.final) {
      if (!winnerRule) {
        if (rule.action.type === 'site_free_shipping') {
          winnerRule = rule;
          winnerSpecificity = treeResult.specificity;
          winnerServiceIds = matchServiceIds(input.services, rule.action);
        } else if (!whatsappOffer) {
          whatsappOffer = buildWhatsAppOffer(rule, input, recipientUf, treeResult.specificity, false);
        }
      }
      continue;
    }

    potentialRules.push(summarizeRule(rule, treeResult.specificity));
    if (rule.action.type === 'whatsapp_only' && !whatsappOffer) {
      whatsappOffer = buildWhatsAppOffer(rule, input, recipientUf, treeResult.specificity, true);
    }
  }

  if (!winnerRule && settings.legacyFallbackEnabled && legacyConfig?.freeShippingEnabled) {
    const threshold = Number(legacyConfig?.freeShippingThreshold || 0);
    if (Number(input.subtotal || 0) >= threshold) {
      winnerServiceIds = applyLegacyFreeShipping(input.services, legacyConfig);
      if (winnerServiceIds.length > 0) {
        return {
          evaluationMode: input.evaluationMode,
          appliedRule: {
            ruleId: 'legacy-frenet-threshold',
            ruleName: `Regra legada Frenet (${formatBRL(threshold)})`,
            actionType: 'site_free_shipping',
            priority: -1,
            specificity: 1,
            message: `Compatibilidade legada da Frenet ativa para pedidos acima de ${formatBRL(threshold)}.`,
          },
          potentialRules,
          whatsappOffer,
          eligibleFreeShippingServiceIds: winnerServiceIds,
          legacyApplied: true,
        };
      }
    }
  }

  return {
    evaluationMode: input.evaluationMode,
    appliedRule: winnerRule ? summarizeRule(winnerRule, winnerSpecificity) : null,
    potentialRules,
    whatsappOffer,
    eligibleFreeShippingServiceIds: winnerServiceIds,
    legacyApplied: false,
  };
}

freeShippingAdmin.get('/rules', async (c) => {
  const [rules, settings, legacyConfig] = await Promise.all([getRules(), getSettings(), getLegacyFrenetConfig()]);
  return c.json({
    rules,
    settings,
    legacy: legacyConfig || null,
  });
});

freeShippingAdmin.post('/rules', async (c) => {
  const body = await c.req.json();
  const rules = await getRules();
  const nextRule = sanitizeRule(body?.rule || createDefaultRule());
  nextRule.createdAt = nextRule.createdAt || new Date().toISOString();
  nextRule.updatedAt = new Date().toISOString();
  rules.push(nextRule);
  await saveRules(rules);
  return c.json({ success: true, rule: nextRule, rules });
});

freeShippingAdmin.put('/rules/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json();
  const rules = await getRules();
  const nextRule = sanitizeRule({ ...(body?.rule || {}), id });
  const updatedRules = rules.map((rule) => (rule.id === id ? { ...rule, ...nextRule, updatedAt: new Date().toISOString() } : rule));
  await saveRules(updatedRules);
  return c.json({ success: true, rule: updatedRules.find((rule) => rule.id === id), rules: updatedRules });
});

freeShippingAdmin.delete('/rules/:id', async (c) => {
  const id = c.req.param('id');
  const rules = await getRules();
  const filtered = rules.filter((rule) => rule.id !== id);
  await saveRules(filtered);
  return c.json({ success: true, rules: filtered });
});

freeShippingAdmin.post('/rules/:id/duplicate', async (c) => {
  const id = c.req.param('id');
  const rules = await getRules();
  const source = rules.find((rule) => rule.id === id);
  if (!source) return c.json({ error: 'Regra nao encontrada' }, 404);

  const now = new Date().toISOString();
  const clone = sanitizeRule({
    ...source,
    id: crypto.randomUUID(),
    name: `${source.name} (copia)`,
    createdAt: now,
    updatedAt: now,
  });
  const nextRules = [...rules, clone];
  await saveRules(nextRules);
  return c.json({ success: true, rule: clone, rules: nextRules });
});

freeShippingAdmin.post('/rules/bulk', async (c) => {
  const body = await c.req.json();
  const rules = sanitizeRules(body?.rules || []);
  const settings = { ...DEFAULT_SETTINGS, ...sanitizeSettings(body?.settings) };
  await Promise.all([saveRules(rules), saveSettings(settings)]);
  return c.json({ success: true, rules, settings });
});

freeShippingAdmin.post('/settings', async (c) => {
  const body = await c.req.json();
  const settings = { ...DEFAULT_SETTINGS, ...sanitizeSettings(body?.settings) };
  await saveSettings(settings);
  return c.json({ success: true, settings });
});

freeShippingAdmin.post('/simulate', async (c) => {
  const body = await c.req.json();
  const evaluation = await evaluateFreeShippingRules({
    subtotal: Number(body?.context?.subtotal || 0),
    recipientCep: body?.context?.recipientCep || '',
    recipientUf: body?.context?.recipientUf || '',
    paymentMethodIntent: body?.context?.paymentMethodIntent || null,
    evaluationMode: body?.context?.paymentMethodIntent ? 'final' : 'potential',
    items: Array.isArray(body?.context?.items) ? body.context.items : [],
    services: Array.isArray(body?.context?.services)
      ? body.context.services.map((service: any) => ({
          serviceCode: String(service?.serviceCode || ''),
          serviceDescription: String(service?.serviceDescription || ''),
          carrier: String(service?.carrier || ''),
          carrierCode: String(service?.carrierCode || ''),
          price: Number(service?.price || 0),
          originalPrice: Number(service?.originalPrice || service?.price || 0),
          deliveryDays: Number(service?.deliveryDays || 0),
          error: service?.error === true,
          message: service?.message || null,
        }))
      : [],
  }, {
    rules: Array.isArray(body?.rules) ? body.rules : undefined,
    settings: body?.settings,
    legacyConfig: body?.legacyConfig,
  });

  return c.json({ success: true, evaluation });
});

export const FREE_SHIPPING_REGION_GROUPS = REGION_GROUPS;
export const FREE_SHIPPING_PAYMENT_LABELS = PAYMENT_LABELS;
