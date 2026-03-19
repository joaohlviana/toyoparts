// ─── Checkout + Increazy Bridge Types ────────────────────────────────────────

// ── Member (customer) — sent to Increazy via options.import.member ──
export interface IncreazyMember {
  name: string;
  email: string;
  document: string;
  document_type: 'cpf';
  company_payment: boolean;
  rg?: string | null;
  profission?: string | null;
  note?: string | null;
}

// ── Address — ALL fields required if ANY is provided ──
export interface IncreazyAddress {
  postcode: string;
  phone: string;
  street: string;
  number: string;
  state: string;        // UF (e.g. "PR", "SP")
  district: string;
  city: string;
  complement: string;
  receiver: string;
}

// ── Company — ALL required fields if ANY is provided ──
export interface IncreazyCompany {
  name: string;
  social_name: string;
  fantasy_name: string;
  document: string;     // CNPJ
  simple_opter?: boolean | null;
  municipal_registration?: string | null;
  state_registration?: string | null;
  retain_issqn?: boolean | null;
  issqn_aliquot?: number | null;
  accounting_code?: string | null;
}

// ── Options passed to $increazyCheckoutPay ──
export interface IncreazyCheckoutOptions {
  id_externo: string | number;
  import: {
    member: IncreazyMember;
    address?: IncreazyAddress;
    company?: IncreazyCompany;
  };
}

// ── Close messages from iframe ──
export type IncreazyCloseMessage =
  | 'back-to-site'
  | 'back-to-home'
  | 'payment-finished';

// ── Webhook payload (server-to-server) ──
export interface IncreazyWebhookPayload {
  order: string;
  method: 'pix' | 'billet' | 'creditcard' | string;
  gateway: string;
  status: 'waiting' | 'canceled' | 'success';
  conversion?: Record<string, unknown>;
}

// ── Local order model ──
export type OrderStatus =
  | 'pending'
  | 'checkout_opened'
  | 'waiting_payment'
  | 'paid'
  | 'canceled';

export interface LocalOrder {
  orderId: string;
  createdAt: string;
  status: OrderStatus;
  items: {
    sku: string;
    name: string;
    unitPrice: number;
    qty: number;
  }[];
  subtotal: number;
  shipping: number;
  total: number;
  customer: IncreazyMember;
  address?: IncreazyAddress;
}
