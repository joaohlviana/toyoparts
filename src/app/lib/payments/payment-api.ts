import { projectId, publicAnonKey } from '../../../../utils/supabase/info';

const BASE_URL = `https://${projectId}.supabase.co/functions/v1/make-server-1d6e33e0/payments`;
const H = { 'Authorization': `Bearer ${publicAnonKey}` };

export interface PaymentConfig {
  activeProvider: 'asaas' | 'vindi' | 'stripe';
  asaas: {
    enabled: boolean;
    sandbox: boolean;
  };
  vindi: {
    enabled: boolean;
    sandbox: boolean;
    apiKey?: string;
  };
  stripe: {
    enabled: boolean;
    sandbox: boolean;
  };
  version?: number;
  updated_at?: string;
}

export async function fetchPaymentConfig(): Promise<{ config: PaymentConfig; status: PaymentStatus }> {
  const res = await fetch(`${BASE_URL}/config`, { headers: H });
  if (!res.ok) throw new Error('Erro ao buscar configuração de pagamentos');
  return res.json();
}

export interface PaymentStatus {
  asaasKeyConfigured:             boolean;
  vindiKeyConfigured:             boolean;
  stripeKeyConfigured:            boolean;
  stripePublishableKeyConfigured: boolean;
  lockedProvider?:                'asaas' | 'vindi' | 'stripe';
  liveLocked?:                    boolean;
}

export async function savePaymentConfig(config: PaymentConfig) {
  const res = await fetch(`${BASE_URL}/config`, {
    method: 'POST',
    headers: { ...H, 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  });
  if (!res.ok) throw new Error('Erro ao salvar configuração de pagamentos');
  return res.json();
}

export async function activateProvider(provider: 'asaas' | 'vindi' | 'stripe') {
  const res = await fetch(`${BASE_URL}/activate-provider`, {
    method: 'POST',
    headers: { ...H, 'Content-Type': 'application/json' },
    body: JSON.stringify({ provider, confirmed: true }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Erro ao ativar ${provider}`);
  }
  return res.json();
}

export async function testAsaasConnection() {
  const res = await fetch(`${BASE_URL}/test/asaas`, { headers: H });
  if (!res.ok) throw new Error('Erro ao testar conexão Asaas');
  return res.json();
}

export async function testVindiConnection() {
  const res = await fetch(`${BASE_URL}/test/vindi`, { headers: H });
  if (!res.ok) throw new Error('Erro ao testar conexão Vindi');
  return res.json();
}

export async function testStripeConnection() {
  const res = await fetch(`${BASE_URL}/test/stripe`, { headers: H });
  if (!res.ok) throw new Error('Erro ao testar conexão Stripe');
  return res.json();
}
