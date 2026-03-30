import { projectId } from '../../../../utils/supabase/info';
import { adminFetch } from '../admin-auth';
import type {
  FreeShippingRule,
  FreeShippingSettings,
  PaymentMethodIntent,
} from './shipping-types';

const API = `https://${projectId}.supabase.co/functions/v1/make-server-1d6e33e0/admin/free-shipping`;

export interface FreeShippingAdminSnapshot {
  rules: FreeShippingRule[];
  settings: FreeShippingSettings;
  legacy: {
    freeShippingEnabled?: boolean;
    freeShippingThreshold?: number;
  } | null;
}

export interface FreeShippingSimulationContext {
  subtotal: number;
  recipientCep?: string;
  recipientUf?: string;
  paymentMethodIntent?: PaymentMethodIntent | null;
  items: Array<{
    sku: string;
    qty?: number;
    quantity?: number;
    price?: number;
    name?: string;
  }>;
  services: Array<{
    serviceCode: string;
    serviceDescription: string;
    carrier: string;
    price: number;
    originalPrice: number;
    deliveryDays: number;
  }>;
}

export async function fetchFreeShippingAdmin(): Promise<FreeShippingAdminSnapshot> {
  const response = await adminFetch(`${API}/rules`);
  if (!response.ok) throw new Error('Falha ao carregar as regras de frete gratis');
  return response.json();
}

export async function saveFreeShippingBulk(payload: {
  rules: FreeShippingRule[];
  settings: FreeShippingSettings;
}): Promise<FreeShippingAdminSnapshot> {
  const response = await adminFetch(`${API}/rules/bulk`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error('Falha ao salvar as regras de frete gratis');
  const data = await response.json();
  return {
    rules: data.rules || [],
    settings: data.settings,
    legacy: null,
  };
}

export async function duplicateFreeShippingRule(ruleId: string): Promise<FreeShippingRule> {
  const response = await adminFetch(`${API}/rules/${encodeURIComponent(ruleId)}/duplicate`, {
    method: 'POST',
  });
  if (!response.ok) throw new Error('Falha ao duplicar a regra');
  const data = await response.json();
  return data.rule;
}

export async function deleteFreeShippingRule(ruleId: string): Promise<void> {
  const response = await adminFetch(`${API}/rules/${encodeURIComponent(ruleId)}`, {
    method: 'DELETE',
  });
  if (!response.ok) throw new Error('Falha ao remover a regra');
}

export async function simulateFreeShipping(payload: {
  context: FreeShippingSimulationContext;
  rules?: FreeShippingRule[];
  settings?: FreeShippingSettings;
  legacyConfig?: any;
}) {
  const response = await adminFetch(`${API}/simulate`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error('Falha ao simular a regra');
  return response.json();
}
