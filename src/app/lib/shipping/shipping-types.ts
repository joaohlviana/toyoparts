// ─── Shipping Domain Types ──────────────────────────────────────────────────

export interface ShippingInput {
  cep: string;
  items: {
    sku: string;
    qty: number;
    weight?: number | null;
    price: number;
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
  invoiceValue: number;
  items: {
    sku: string;
    quantity: number;
    weight: number;
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
