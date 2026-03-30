// ─── Shipping Domain Types ──────────────────────────────────────────────────

export interface ShippingInput {
  cep: string;
  recipientUf?: string;
  paymentMethodIntent?: PaymentMethodIntent | null;
  items: {
    sku: string;
    qty: number;
    weight?: number | null;
    price: number;
    name?: string;
    height?: number;
    length?: number;
    width?: number;
  }[];
}

export interface ShippingQuote {
  id: string;
  carrier: string;
  name: string;
  price: number;
  originalPrice?: number;
  estimatedDays: number;
  freeShipping?: boolean;
  error?: boolean;
  message?: string | null;
}

export interface ShippingCalculator {
  calculate(input: ShippingInput): Promise<ShippingQuote[]>;
}

// ─── Frenet-specific Types ──────────────────────────────────────────────────

export interface FrenetCepResponse {
  cep: string;
  address: {
    street: string;
    number: string;
    complement: string;
    district: string;
    city: string;
    state: string;
  };
  raw?: any;
}

export interface FrenetQuoteRequest {
  sellerCep?: string;
  recipientCep: string;
  recipientUf?: string;
  invoiceValue: number;
  paymentMethodIntent?: PaymentMethodIntent | null;
  items: {
    sku: string;
    quantity: number;
    weight: number;
    name?: string;
    height?: number;
    length?: number;
    width?: number;
  }[];
}

export interface FrenetQuoteService {
  serviceCode: string;
  serviceDescription: string;
  carrier: string;
  carrierCode: string;
  price: number;
  originalPrice: number;
  deliveryDays: number;
  error: boolean;
  message: string | null;
  freeShipping?: boolean;
}

export interface FrenetQuoteResponse {
  quotes: FrenetQuoteService[];
  errors: FrenetQuoteService[];
  timeout: number;
  config: {
    freeShippingThreshold: number;
    freeShippingEnabled: boolean;
  };
  evaluationMode?: 'potential' | 'final';
  appliedRule?: FreeShippingEvaluationRuleSummary | null;
  potentialRules?: FreeShippingEvaluationRuleSummary[];
  whatsappOffer?: FreeShippingWhatsAppOffer | null;
  eligibleFreeShippingServiceIds?: string[];
  legacyApplied?: boolean;
}

export interface FrenetConfig {
  sellerCep: string;
  defaultWeight: number;
  defaultHeight: number;
  defaultLength: number;
  defaultWidth: number;
  freeShippingThreshold: number;
  freeShippingEnabled: boolean;
  additionalDays: number;
  enabled: boolean;
}

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

export interface FreeShippingWhatsAppOffer {
  ruleId: string;
  ruleName: string;
  potential: boolean;
  url: string;
  text: string;
  message: string;
}
